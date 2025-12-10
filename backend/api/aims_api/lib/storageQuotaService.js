/**
 * storageQuotaService.js
 * 설계사별 디스크 할당량 관리 서비스
 * @since 1.0.0
 */

// 티어별 할당량 (bytes)
const TIER_QUOTAS = {
  free_trial: 5 * 1024 * 1024 * 1024,    // 5GB
  standard: 30 * 1024 * 1024 * 1024,     // 30GB
  premium: 50 * 1024 * 1024 * 1024,      // 50GB
  vip: 100 * 1024 * 1024 * 1024,         // 100GB
  admin: -1                               // 무제한
};

const DEFAULT_TIER = 'standard';

/**
 * 사용자의 파일 사용량 계산
 * @param {Db} db - MongoDB 인스턴스
 * @param {string} userId - 사용자 ID (ObjectId 문자열)
 * @returns {Promise<number>} 사용량 (bytes)
 */
async function calculateUserStorageUsage(db, userId) {
  const filesCollection = db.collection('files');

  const result = await filesCollection.aggregate([
    { $match: { ownerId: userId } },
    { $group: {
      _id: null,
      totalBytes: { $sum: { $toDouble: { $ifNull: ['$meta.size_bytes', '0'] } } }
    }}
  ]).toArray();

  return result.length > 0 ? result[0].totalBytes : 0;
}

/**
 * 사용자의 스토리지 정보 조회
 * @param {Db} db - MongoDB 인스턴스
 * @param {string} userId - 사용자 ID
 * @returns {Promise<Object>} 스토리지 정보
 */
async function getUserStorageInfo(db, userId) {
  const usersCollection = db.collection('users');
  const user = await usersCollection.findOne(
    { _id: userId },
    { projection: { storage: 1, role: 1 } }
  );

  // 관리자 체크
  const isAdmin = user?.role === 'admin';

  // 스토리지 정보 기본값
  const tier = isAdmin ? 'admin' : (user?.storage?.tier || DEFAULT_TIER);
  const quotaBytes = isAdmin ? -1 : (user?.storage?.quota_bytes || TIER_QUOTAS[tier]);

  // 실시간 사용량 계산
  const usedBytes = await calculateUserStorageUsage(db, userId);

  return {
    tier,
    tierName: getTierDisplayName(tier),
    quota_bytes: quotaBytes,
    used_bytes: usedBytes,
    remaining_bytes: quotaBytes === -1 ? -1 : Math.max(0, quotaBytes - usedBytes),
    usage_percent: quotaBytes === -1 ? 0 : Math.round((usedBytes / quotaBytes) * 100),
    is_unlimited: quotaBytes === -1
  };
}

/**
 * 업로드 가능 여부 체크
 * @param {Db} db - MongoDB 인스턴스
 * @param {string} userId - 사용자 ID
 * @param {number} uploadSize - 업로드할 파일 크기 (bytes)
 * @returns {Promise<{allowed: boolean, message?: string}>}
 */
async function checkUploadAllowed(db, userId, uploadSize) {
  const storageInfo = await getUserStorageInfo(db, userId);

  // 무제한 사용자 (admin)
  if (storageInfo.is_unlimited) {
    return { allowed: true };
  }

  const newTotal = storageInfo.used_bytes + uploadSize;

  if (newTotal > storageInfo.quota_bytes) {
    return {
      allowed: false,
      message: `저장 공간이 부족합니다. 현재 ${formatBytes(storageInfo.used_bytes)} / ${formatBytes(storageInfo.quota_bytes)} 사용 중. 파일을 삭제하거나 용량을 업그레이드하세요.`,
      current_usage: storageInfo.used_bytes,
      quota: storageInfo.quota_bytes,
      required: uploadSize
    };
  }

  return { allowed: true };
}

/**
 * 티어 표시명 반환
 */
function getTierDisplayName(tier) {
  const names = {
    free_trial: '무료체험',
    standard: '일반',
    premium: '프리미엄',
    vip: 'VIP',
    admin: '관리자'
  };
  return names[tier] || tier;
}

/**
 * 바이트를 읽기 쉬운 형식으로 변환
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  if (bytes === -1) return '무제한';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 사용자 스토리지 설정 업데이트 (관리자용)
 * @param {Db} db - MongoDB 인스턴스
 * @param {string} userId - 대상 사용자 ID
 * @param {string} tier - 새 티어
 * @returns {Promise<Object>} 업데이트 결과
 */
async function updateUserTier(db, userId, tier) {
  if (!TIER_QUOTAS.hasOwnProperty(tier)) {
    throw new Error(`유효하지 않은 티어: ${tier}`);
  }

  const usersCollection = db.collection('users');
  const quotaBytes = TIER_QUOTAS[tier];

  const result = await usersCollection.updateOne(
    { _id: userId },
    {
      $set: {
        'storage.tier': tier,
        'storage.quota_bytes': quotaBytes,
        'storage.updated_at': new Date()
      }
    }
  );

  return {
    success: result.modifiedCount > 0,
    tier,
    quota_bytes: quotaBytes
  };
}

/**
 * 전체 시스템 스토리지 통계 (관리자용)
 */
async function getSystemStorageOverview(db) {
  const filesCollection = db.collection('files');
  const usersCollection = db.collection('users');

  // 전체 파일 사용량
  const totalUsageResult = await filesCollection.aggregate([
    { $group: {
      _id: null,
      totalBytes: { $sum: { $toDouble: { $ifNull: ['$meta.size_bytes', '0'] } } },
      fileCount: { $sum: 1 }
    }}
  ]).toArray();

  // 전체 사용자 수
  const totalUsers = await usersCollection.countDocuments({});

  // 티어별 사용자 수
  const tierDistribution = await usersCollection.aggregate([
    { $group: { _id: '$storage.tier', count: { $sum: 1 } } }
  ]).toArray();

  // 사용량 80% 초과 사용자 수
  const usersOver80 = await usersCollection.countDocuments({
    'storage.tier': { $ne: 'admin' },
    'storage.quota_bytes': { $gt: 0 },
    $expr: {
      $gte: [
        { $divide: ['$storage.used_bytes', '$storage.quota_bytes'] },
        0.8
      ]
    }
  });

  // 사용량 95% 초과 사용자 수
  const usersOver95 = await usersCollection.countDocuments({
    'storage.tier': { $ne: 'admin' },
    'storage.quota_bytes': { $gt: 0 },
    $expr: {
      $gte: [
        { $divide: ['$storage.used_bytes', '$storage.quota_bytes'] },
        0.95
      ]
    }
  });

  return {
    total_users: totalUsers,
    total_used_bytes: totalUsageResult[0]?.totalBytes || 0,
    total_files: totalUsageResult[0]?.fileCount || 0,
    tier_distribution: tierDistribution.reduce((acc, item) => {
      acc[item._id || 'standard'] = item.count;
      return acc;
    }, {}),
    users_over_80_percent: usersOver80,
    users_over_95_percent: usersOver95
  };
}

module.exports = {
  TIER_QUOTAS,
  DEFAULT_TIER,
  calculateUserStorageUsage,
  getUserStorageInfo,
  checkUploadAllowed,
  getTierDisplayName,
  formatBytes,
  updateUserTier,
  getSystemStorageOverview
};
