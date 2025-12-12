/**
 * storageQuotaService.js
 * 설계사별 디스크 할당량 관리 서비스
 * @since 1.0.0
 */

const { ObjectId } = require('mongodb');

const GB = 1024 * 1024 * 1024;

/**
 * 사용자 ID를 쿼리용 형식으로 변환
 * ObjectId 형식(24자리 hex)이면 ObjectId로, 아니면 문자열 그대로
 */
function toUserIdQuery(userId) {
  if (!userId) return null;
  const idStr = typeof userId === 'object' ? userId.toString() : userId;
  const isObjectId = /^[a-fA-F0-9]{24}$/.test(idStr);
  return isObjectId ? new ObjectId(idStr) : idStr;
}

// 기본 티어 정의 (DB에 없을 때 사용)
const DEFAULT_TIER_DEFINITIONS = {
  free_trial: { name: '무료체험', quota_bytes: 5 * GB, ocr_quota: 10, description: '체험 사용자' },
  standard: { name: '일반', quota_bytes: 30 * GB, ocr_quota: 100, description: '기본 등급' },
  premium: { name: '프리미엄', quota_bytes: 50 * GB, ocr_quota: 500, description: '프리미엄 구독자' },
  vip: { name: 'VIP', quota_bytes: 100 * GB, ocr_quota: 1000, description: 'VIP 고객' },
  admin: { name: '관리자', quota_bytes: -1, ocr_quota: -1, description: '무제한' }
};

// 캐싱된 티어 정의 (성능 최적화)
let cachedTierDefinitions = null;
let cacheExpiry = 0;
const CACHE_TTL = 60000; // 1분 캐시

const DEFAULT_TIER = 'standard';

/**
 * DB에서 티어 정의 로드 (캐싱 적용)
 */
async function loadTierDefinitions(db) {
  const now = Date.now();
  if (cachedTierDefinitions && cacheExpiry > now) {
    return cachedTierDefinitions;
  }

  const settingsCollection = db.collection('settings');
  const tierSettings = await settingsCollection.findOne({ key: 'tier_definitions' });

  if (tierSettings && tierSettings.tiers) {
    cachedTierDefinitions = tierSettings.tiers;
  } else {
    // DB에 없으면 기본값 저장
    cachedTierDefinitions = DEFAULT_TIER_DEFINITIONS;
    await settingsCollection.updateOne(
      { key: 'tier_definitions' },
      {
        $set: {
          key: 'tier_definitions',
          tiers: DEFAULT_TIER_DEFINITIONS,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
  }

  cacheExpiry = now + CACHE_TTL;
  return cachedTierDefinitions;
}

/**
 * 티어별 할당량 조회 (하위 호환성)
 */
async function getTierQuota(db, tier) {
  const tiers = await loadTierDefinitions(db);
  return tiers[tier]?.quota_bytes ?? DEFAULT_TIER_DEFINITIONS.standard.quota_bytes;
}

/**
 * 티어 정의 전체 조회 (관리자용)
 */
async function getTierDefinitions(db) {
  return loadTierDefinitions(db);
}

/**
 * 티어 정의 수정 (관리자용)
 */
async function updateTierDefinition(db, tierId, updates) {
  const settingsCollection = db.collection('settings');
  const tiers = await loadTierDefinitions(db);

  if (!tiers[tierId]) {
    throw new Error(`존재하지 않는 티어: ${tierId}`);
  }

  // admin 티어는 무제한 유지
  if (tierId === 'admin') {
    updates.quota_bytes = -1;
    updates.ocr_quota = -1;
  }

  const updatedTiers = {
    ...tiers,
    [tierId]: {
      ...tiers[tierId],
      ...updates,
      updatedAt: new Date()
    }
  };

  await settingsCollection.updateOne(
    { key: 'tier_definitions' },
    {
      $set: {
        tiers: updatedTiers,
        updatedAt: new Date()
      }
    }
  );

  // 캐시 무효화
  cachedTierDefinitions = null;
  cacheExpiry = 0;

  return updatedTiers[tierId];
}

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
  const userIdQuery = toUserIdQuery(userId);
  const user = await usersCollection.findOne(
    { _id: userIdQuery },
    { projection: { storage: 1, role: 1, hasOcrPermission: 1, ocr_used_this_month: 1 } }
  );

  // 관리자 체크
  const isAdmin = user?.role === 'admin';

  // 티어 정의 로드
  const tierDefinitions = await loadTierDefinitions(db);

  // 스토리지 정보 기본값
  const tier = isAdmin ? 'admin' : (user?.storage?.tier || DEFAULT_TIER);
  const tierDef = tierDefinitions[tier] || tierDefinitions[DEFAULT_TIER];
  const quotaBytes = isAdmin ? -1 : (user?.storage?.quota_bytes || tierDef.quota_bytes);

  // 실시간 사용량 계산
  const usedBytes = await calculateUserStorageUsage(db, userId);

  // OCR 정보 (관리자가 수동 제어, 티어에서 할당량만 상속)
  const ocrQuota = isAdmin ? -1 : (tierDef.ocr_quota ?? 100);
  const hasOcrPermission = isAdmin ? true : (user?.hasOcrPermission ?? false);
  const ocrUsedThisMonth = user?.ocr_used_this_month ?? 0;

  return {
    tier,
    tierName: tierDef.name,
    quota_bytes: quotaBytes,
    used_bytes: usedBytes,
    remaining_bytes: quotaBytes === -1 ? -1 : Math.max(0, quotaBytes - usedBytes),
    usage_percent: quotaBytes === -1 ? 0 : Math.round((usedBytes / quotaBytes) * 100),
    is_unlimited: quotaBytes === -1,
    // OCR 정보
    has_ocr_permission: hasOcrPermission,
    ocr_quota: ocrQuota,
    ocr_used_this_month: ocrUsedThisMonth,
    ocr_remaining: ocrQuota === -1 ? -1 : Math.max(0, ocrQuota - ocrUsedThisMonth),
    ocr_is_unlimited: ocrQuota === -1
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
  // 티어 정의 로드
  const tierDefinitions = await loadTierDefinitions(db);

  if (!tierDefinitions[tier]) {
    throw new Error(`유효하지 않은 티어: ${tier}`);
  }

  const usersCollection = db.collection('users');
  const quotaBytes = tierDefinitions[tier].quota_bytes;
  const userIdQuery = toUserIdQuery(userId);

  const result = await usersCollection.updateOne(
    { _id: userIdQuery },
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
  DEFAULT_TIER,
  calculateUserStorageUsage,
  getUserStorageInfo,
  checkUploadAllowed,
  getTierDisplayName,
  formatBytes,
  updateUserTier,
  getSystemStorageOverview,
  getTierDefinitions,
  updateTierDefinition,
  getTierQuota
};
