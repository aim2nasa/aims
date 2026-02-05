/**
 * creditService.js
 * 크레딧 기반 사용량 관리 서비스
 * @since 2026-01-06
 *
 * 크레딧 환산 기준 (TIER_PRICING_POLICY.md):
 * - OCR 1페이지 = 2 크레딧
 * - AI 1K 토큰 = 0.5 크레딧
 * - 1 크레딧 ≈ 1원 (내부 원가 기준)
 */

// 크레딧 환산 상수
const CREDIT_RATES = {
  OCR_PER_PAGE: 2,        // OCR 1페이지 = 2 크레딧
  AI_PER_1K_TOKENS: 0.5   // AI 1K 토큰 = 0.5 크레딧
};

/**
 * OCR 페이지 수를 크레딧으로 환산
 * @param {number} pageCount - OCR 페이지 수
 * @returns {number} 크레딧
 */
function calculateOcrCredits(pageCount) {
  return pageCount * CREDIT_RATES.OCR_PER_PAGE;
}

/**
 * AI 토큰 수를 크레딧으로 환산
 * @param {number} tokens - AI 토큰 수
 * @returns {number} 크레딧
 */
function calculateAiCredits(tokens) {
  return (tokens / 1000) * CREDIT_RATES.AI_PER_1K_TOKENS;
}

/**
 * 현재 사이클의 OCR 크레딧 사용량 계산
 * @param {Db} db - MongoDB docupload DB 인스턴스
 * @param {string} userId - 사용자 ID
 * @param {Date} cycleStart - 사이클 시작일
 * @param {Date} cycleEnd - 사이클 종료일
 * @returns {Promise<{ pages: number, credits: number }>}
 */
async function getOcrCreditsInCycle(db, userId, cycleStart, cycleEnd) {
  const filesCollection = db.collection('files');
  const cycleStartISO = cycleStart.toISOString();
  const cycleEndISO = cycleEnd.toISOString();

  const result = await filesCollection.aggregate([
    {
      $match: {
        ownerId: userId,
        'ocr.status': 'done',
        $or: [
          // Date 타입
          { 'ocr.done_at': { $gte: cycleStart, $lte: cycleEnd } },
          // ISO string 타입
          { 'ocr.done_at': { $gte: cycleStartISO, $lte: cycleEndISO } }
        ]
      }
    },
    {
      $group: {
        _id: null,
        total_pages: { $sum: { $ifNull: ['$ocr.page_count', 1] } }
      }
    }
  ]).toArray();

  const pages = result.length > 0 ? result[0].total_pages : 0;
  return {
    pages,
    credits: calculateOcrCredits(pages)
  };
}

/**
 * 현재 사이클의 AI 크레딧 사용량 계산
 * @param {Db} analyticsDb - MongoDB aims_analytics DB 인스턴스
 * @param {string} userId - 사용자 ID
 * @param {Date} cycleStart - 사이클 시작일
 * @param {Date} cycleEnd - 사이클 종료일
 * @returns {Promise<{ tokens: number, credits: number }>}
 */
async function getAiCreditsInCycle(analyticsDb, userId, cycleStart, cycleEnd) {
  const tokenUsageCollection = analyticsDb.collection('ai_token_usage');

  const result = await tokenUsageCollection.aggregate([
    {
      $match: {
        user_id: userId,
        timestamp: { $gte: cycleStart, $lte: cycleEnd }
      }
    },
    {
      $group: {
        _id: null,
        total_tokens: { $sum: '$total_tokens' }
      }
    }
  ]).toArray();

  const tokens = result.length > 0 ? result[0].total_tokens : 0;
  return {
    tokens,
    credits: calculateAiCredits(tokens)
  };
}

/**
 * 현재 사이클의 총 크레딧 사용량 계산
 * @param {Db} db - MongoDB docupload DB 인스턴스
 * @param {Db} analyticsDb - MongoDB aims_analytics DB 인스턴스
 * @param {string} userId - 사용자 ID
 * @param {Date} cycleStart - 사이클 시작일
 * @param {Date} cycleEnd - 사이클 종료일
 * @returns {Promise<Object>} 크레딧 사용량 상세
 */
async function getCycleCreditsUsed(db, analyticsDb, userId, cycleStart, cycleEnd) {
  // 병렬로 OCR과 AI 사용량 조회
  const [ocrUsage, aiUsage] = await Promise.all([
    getOcrCreditsInCycle(db, userId, cycleStart, cycleEnd),
    getAiCreditsInCycle(analyticsDb, userId, cycleStart, cycleEnd)
  ]);

  const totalCredits = ocrUsage.credits + aiUsage.credits;

  return {
    ocr: ocrUsage,
    ai: aiUsage,
    total_credits: Math.round(totalCredits * 100) / 100  // 소수점 2자리
  };
}

/**
 * 사용자의 크레딧 정보 조회 (일할 계산 적용)
 * @param {Db} db - MongoDB docupload DB 인스턴스
 * @param {Db} analyticsDb - MongoDB aims_analytics DB 인스턴스
 * @param {string} userId - 사용자 ID
 * @param {string} tier - 사용자 티어
 * @param {number} creditQuota - 티어 크레딧 한도 (-1이면 무제한)
 * @param {Date} cycleStart - 사이클 시작일
 * @param {Date} cycleEnd - 사이클 종료일
 * @param {number} daysUntilReset - 리셋까지 남은 일수
 * @param {Object} proRataInfo - 일할 계산 정보 (optional)
 * @param {boolean} proRataInfo.isFirstMonth - 첫 달 여부
 * @param {number} proRataInfo.proRataRatio - 일할 계산 비율
 * @returns {Promise<Object>} 크레딧 정보
 */
async function getUserCreditInfo(db, analyticsDb, userId, tier, creditQuota, cycleStart, cycleEnd, daysUntilReset, proRataInfo = {}) {
  const isUnlimited = creditQuota === -1;
  const { isFirstMonth = false, proRataRatio = 1.0 } = proRataInfo;

  // 일할 계산 적용된 크레딧 한도
  const effectiveCreditQuota = isUnlimited ? -1 : Math.round(creditQuota * proRataRatio);

  // 크레딧 사용량 계산
  const usage = await getCycleCreditsUsed(db, analyticsDb, userId, cycleStart, cycleEnd);

  // 사이클 날짜를 YYYY-MM-DD 형식으로 변환 (KST 기준)
  const formatDateKST = (date) => {
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().split('T')[0];
  };

  return {
    credit_quota: effectiveCreditQuota,              // 일할 계산 적용된 한도
    credit_quota_full: creditQuota,                  // 원래 월간 한도 (참고용)
    credits_used: usage.total_credits,
    credits_remaining: isUnlimited ? -1 : Math.max(0, effectiveCreditQuota - usage.total_credits),
    credit_usage_percent: isUnlimited ? 0 : Math.round((usage.total_credits / effectiveCreditQuota) * 100 * 100) / 100,
    credit_is_unlimited: isUnlimited,
    credit_breakdown: {
      ocr: usage.ocr,
      ai: usage.ai
    },
    credit_cycle_start: formatDateKST(cycleStart),
    credit_cycle_end: formatDateKST(cycleEnd),
    credit_days_until_reset: daysUntilReset,
    // 일할 계산 정보
    is_first_month: isFirstMonth,
    pro_rata_ratio: proRataRatio
  };
}

/**
 * 크레딧 충분 여부 체크
 * @param {Db} db - MongoDB docupload DB 인스턴스
 * @param {Db} analyticsDb - MongoDB aims_analytics DB 인스턴스
 * @param {string} userId - 사용자 ID
 * @param {number} creditQuota - 티어 크레딧 한도
 * @param {Date} cycleStart - 사이클 시작일
 * @param {Date} cycleEnd - 사이클 종료일
 * @param {number} requiredCredits - 필요한 크레딧
 * @returns {Promise<{ allowed: boolean, message?: string, remaining?: number }>}
 */
async function checkCreditAllowed(db, analyticsDb, userId, creditQuota, cycleStart, cycleEnd, requiredCredits) {
  // 무제한 사용자
  if (creditQuota === -1) {
    return { allowed: true };
  }

  const usage = await getCycleCreditsUsed(db, analyticsDb, userId, cycleStart, cycleEnd);
  const remaining = creditQuota - usage.total_credits;

  if (remaining < requiredCredits) {
    return {
      allowed: false,
      message: `크레딧이 부족합니다. 남은 크레딧: ${remaining.toFixed(1)}, 필요: ${requiredCredits}`,
      remaining,
      required: requiredCredits
    };
  }

  return {
    allowed: true,
    remaining
  };
}

/**
 * AI 호출 전 크레딧 한도 체크 (통합 함수)
 * 사용자의 티어 정보를 조회하고 크레딧 사용량을 확인하여 AI 사용 가능 여부 판단
 *
 * @param {Db} db - MongoDB docupload DB 인스턴스
 * @param {Db} analyticsDb - MongoDB aims_analytics DB 인스턴스
 * @param {string} userId - 사용자 ID
 * @param {number} estimatedCredits - 예상 크레딧 소모량 (기본값: 5 - 평균 AI 요청)
 * @returns {Promise<{
 *   allowed: boolean,
 *   reason?: string,
 *   credits_used: number,
 *   credits_remaining: number,
 *   credit_quota: number,
 *   credit_usage_percent: number,
 *   days_until_reset: number
 * }>}
 */
async function checkCreditBeforeAI(db, analyticsDb, userId, estimatedCredits = 5) {
  try {
    const { getUserStorageInfo, getTierDefinitions, calculateOcrCycle } = require('./storageQuotaService');

    // 1. 사용자 스토리지/티어 정보 조회
    const storageInfo = await getUserStorageInfo(db, userId);

    // 2. 무제한 사용자 (admin) 체크
    if (storageInfo.is_unlimited) {
      return {
        allowed: true,
        reason: 'unlimited',
        credits_used: 0,
        credits_remaining: -1,
        credit_quota: -1,
        credit_usage_percent: 0,
        days_until_reset: 0
      };
    }

    // 3. 티어 정의에서 credit_quota 조회
    const tierDefinitions = await getTierDefinitions(db);
    const tierDef = tierDefinitions[storageInfo.tier] || tierDefinitions['free_trial'];
    const creditQuotaFull = tierDef.credit_quota ?? 2000;

    // 4. 일할 계산 적용 (첫 달인 경우)
    const proRataRatio = storageInfo.pro_rata_ratio ?? 1.0;
    const isFirstMonth = storageInfo.is_first_month ?? false;
    const effectiveCreditQuota = Math.round(creditQuotaFull * proRataRatio);

    // 5. 사이클 정보 (storageInfo에서 이미 계산된 값 사용)
    const cycleStart = new Date(storageInfo.ocr_cycle_start + 'T00:00:00+09:00');
    const cycleEnd = new Date(storageInfo.ocr_cycle_end + 'T23:59:59.999+09:00');
    const daysUntilReset = storageInfo.ocr_days_until_reset;

    // 6. 현재 크레딧 사용량 계산
    const usage = await getCycleCreditsUsed(db, analyticsDb, userId, cycleStart, cycleEnd);
    const remaining = effectiveCreditQuota - usage.total_credits;
    const usagePercent = Math.round((usage.total_credits / effectiveCreditQuota) * 100 * 100) / 100;

    // 7. 한도 체크
    if (remaining < estimatedCredits) {
      return {
        allowed: false,
        reason: 'credit_exceeded',
        credits_used: usage.total_credits,
        credits_remaining: Math.max(0, remaining),
        credit_quota: effectiveCreditQuota,
        credit_quota_full: creditQuotaFull,
        credit_usage_percent: usagePercent,
        days_until_reset: daysUntilReset,
        tier: storageInfo.tier,
        tier_name: storageInfo.tierName,
        is_first_month: isFirstMonth,
        pro_rata_ratio: proRataRatio
      };
    }

    return {
      allowed: true,
      reason: 'within_quota',
      credits_used: usage.total_credits,
      credits_remaining: remaining,
      credit_quota: effectiveCreditQuota,
      credit_quota_full: creditQuotaFull,
      credit_usage_percent: usagePercent,
      days_until_reset: daysUntilReset,
      is_first_month: isFirstMonth,
      pro_rata_ratio: proRataRatio
    };

  } catch (error) {
    // 오류 발생 시 fail-open (사용 허용) - 크레딧 체크 실패로 사용자 차단하지 않음
    console.error('[CreditService] checkCreditBeforeAI 오류 (fail-open):', error.message);
    return {
      allowed: true,
      reason: 'error_fallback',
      error: error.message
    };
  }
}

/**
 * 문서 처리 전 크레딧 한도 체크
 * OCR + 임베딩에 필요한 크레딧이 충분한지 확인
 *
 * @param {Db} db - MongoDB docupload DB 인스턴스
 * @param {Db} analyticsDb - MongoDB aims_analytics DB 인스턴스
 * @param {string} userId - 사용자 ID
 * @param {number} estimatedPages - 예상 페이지 수 (기본값: 1)
 * @returns {Promise<{
 *   allowed: boolean,
 *   reason: string,
 *   credits_used: number,
 *   credits_remaining: number,
 *   credit_quota: number,
 *   estimated_credits: number,
 *   days_until_reset: number
 * }>}
 *
 * @see docs/EMBEDDING_CREDIT_POLICY.md
 */
async function checkCreditForDocumentProcessing(db, analyticsDb, userId, estimatedPages = 1) {
  try {
    const { getUserStorageInfo, getTierDefinitions } = require('./storageQuotaService');

    // 1. 사용자 스토리지/티어 정보 조회
    const storageInfo = await getUserStorageInfo(db, userId);

    // 2. 무제한 사용자 (admin) 체크
    if (storageInfo.is_unlimited) {
      return {
        allowed: true,
        reason: 'unlimited',
        credits_used: 0,
        credits_remaining: -1,
        credit_quota: -1,
        estimated_credits: 0,
        days_until_reset: 0
      };
    }

    // 3. 티어 정의에서 credit_quota 조회
    const tierDefinitions = await getTierDefinitions(db);
    const tierDef = tierDefinitions[storageInfo.tier] || tierDefinitions['free_trial'];
    const creditQuotaFull = tierDef.credit_quota ?? 2000;

    // 4. 일할 계산 적용 (첫 달인 경우)
    const proRataRatio = storageInfo.pro_rata_ratio ?? 1.0;
    const isFirstMonth = storageInfo.is_first_month ?? false;
    const effectiveCreditQuota = Math.round(creditQuotaFull * proRataRatio);

    // 5. 사이클 정보
    const cycleStart = new Date(storageInfo.ocr_cycle_start + 'T00:00:00+09:00');
    const cycleEnd = new Date(storageInfo.ocr_cycle_end + 'T23:59:59.999+09:00');
    const daysUntilReset = storageInfo.ocr_days_until_reset;

    // 6. 현재 크레딧 사용량 계산
    const usage = await getCycleCreditsUsed(db, analyticsDb, userId, cycleStart, cycleEnd);
    const monthlyRemaining = Math.max(0, effectiveCreditQuota - usage.total_credits);
    const usagePercent = Math.round((usage.total_credits / effectiveCreditQuota) * 100 * 100) / 100;

    // 7. 추가 크레딧 잔액 조회
    const bonusBalance = await getBonusCreditBalance(db, userId);
    const totalAvailable = monthlyRemaining + bonusBalance;

    // 8. 예상 크레딧 계산
    // OCR: 페이지당 2 크레딧
    // 임베딩: 페이지당 약 500자 기준, 1K 토큰 = 0.5 크레딧 → 페이지당 약 0.5 크레딧
    // 버퍼 1.5배 적용
    const estimatedOcrCredits = estimatedPages * CREDIT_RATES.OCR_PER_PAGE;
    const estimatedEmbeddingCredits = estimatedPages * 0.5;  // 페이지당 평균 500자 ≈ 0.125K 토큰
    const estimatedCredits = Math.ceil((estimatedOcrCredits + estimatedEmbeddingCredits) * 1.5);

    // 9. 한도 체크 (월정액 + 추가 크레딧 합산)
    if (totalAvailable < estimatedCredits) {
      return {
        allowed: false,
        reason: 'credit_exceeded',
        credits_used: usage.total_credits,
        credits_remaining: monthlyRemaining,
        bonus_balance: bonusBalance,
        total_available: totalAvailable,
        credit_quota: effectiveCreditQuota,
        credit_quota_full: creditQuotaFull,
        credit_usage_percent: usagePercent,
        estimated_credits: estimatedCredits,
        days_until_reset: daysUntilReset,
        tier: storageInfo.tier,
        tier_name: storageInfo.tierName,
        is_first_month: isFirstMonth,
        pro_rata_ratio: proRataRatio
      };
    }

    return {
      allowed: true,
      reason: monthlyRemaining >= estimatedCredits ? 'within_quota' : 'bonus_available',
      credits_used: usage.total_credits,
      credits_remaining: monthlyRemaining,
      bonus_balance: bonusBalance,
      total_available: totalAvailable,
      credit_quota: effectiveCreditQuota,
      credit_quota_full: creditQuotaFull,
      credit_usage_percent: usagePercent,
      estimated_credits: estimatedCredits,
      days_until_reset: daysUntilReset,
      is_first_month: isFirstMonth,
      pro_rata_ratio: proRataRatio
    };

  } catch (error) {
    // 오류 발생 시 fail-open (사용 허용) - 크레딧 체크 실패로 사용자 차단하지 않음
    console.error('[CreditService] checkCreditForDocumentProcessing 오류 (fail-open):', error.message);
    return {
      allowed: true,
      reason: 'error_fallback',
      error: error.message
    };
  }
}

// ============================================================
// 추가 크레딧 (Bonus Credits) 관련 함수
// @see docs/BONUS_CREDIT_IMPLEMENTATION.md
// ============================================================

/**
 * userId를 쿼리 형식으로 변환 (ObjectId 또는 string 처리)
 */
function toUserIdQuery(userId) {
  const { ObjectId } = require('mongodb');
  if (typeof userId === 'string' && ObjectId.isValid(userId)) {
    return new ObjectId(userId);
  }
  return userId;
}

/**
 * 사용자의 추가 크레딧 잔액 조회
 * @param {Db} db - MongoDB docupload DB
 * @param {string} userId - 사용자 ID
 * @returns {Promise<number>} 추가 크레딧 잔액
 */
async function getBonusCreditBalance(db, userId) {
  const user = await db.collection('users').findOne(
    { _id: toUserIdQuery(userId) },
    { projection: { 'bonus_credits.balance': 1 } }
  );
  return user?.bonus_credits?.balance ?? 0;
}

/**
 * 사용자의 추가 크레딧 상세 정보 조회
 * @param {Db} db - MongoDB docupload DB
 * @param {string} userId - 사용자 ID
 * @returns {Promise<Object>} 추가 크레딧 정보
 */
async function getBonusCreditInfo(db, userId) {
  const user = await db.collection('users').findOne(
    { _id: toUserIdQuery(userId) },
    { projection: { bonus_credits: 1 } }
  );

  return {
    balance: user?.bonus_credits?.balance ?? 0,
    total_purchased: user?.bonus_credits?.total_purchased ?? 0,
    total_used: user?.bonus_credits?.total_used ?? 0,
    last_purchase_at: user?.bonus_credits?.last_purchase_at ?? null,
    updated_at: user?.bonus_credits?.updated_at ?? null
  };
}

/**
 * 추가 크레딧 부여 (관리자용)
 * @param {Db} db - MongoDB docupload DB
 * @param {string} userId - 대상 사용자 ID
 * @param {number} amount - 부여할 크레딧 (양수)
 * @param {string} adminId - 부여하는 관리자 ID
 * @param {string} reason - 부여 사유
 * @param {Object} packageInfo - 패키지 정보 (선택)
 * @returns {Promise<Object>} 결과
 */
async function grantBonusCredits(db, userId, amount, adminId, reason, packageInfo = null) {
  if (amount <= 0) {
    throw new Error('부여할 크레딧은 0보다 커야 합니다.');
  }

  const usersCollection = db.collection('users');
  const transactionsCollection = db.collection('credit_transactions');

  // 1. 현재 잔액 조회
  const user = await usersCollection.findOne(
    { _id: toUserIdQuery(userId) },
    { projection: { 'bonus_credits.balance': 1, name: 1, email: 1 } }
  );

  if (!user) {
    throw new Error('사용자를 찾을 수 없습니다.');
  }

  const balanceBefore = user?.bonus_credits?.balance ?? 0;
  const balanceAfter = balanceBefore + amount;

  // 2. 관리자 정보 조회
  let adminName = '시스템';
  if (adminId && adminId !== 'system') {
    const admin = await usersCollection.findOne(
      { _id: toUserIdQuery(adminId) },
      { projection: { name: 1, email: 1 } }
    );
    adminName = admin?.name || admin?.email || adminId;
  }

  // 3. 사용자 잔액 업데이트
  await usersCollection.updateOne(
    { _id: toUserIdQuery(userId) },
    {
      $inc: {
        'bonus_credits.balance': amount,
        'bonus_credits.total_purchased': amount
      },
      $set: {
        'bonus_credits.last_purchase_at': new Date(),
        'bonus_credits.updated_at': new Date()
      }
    }
  );

  // 4. 트랜잭션 기록
  const transaction = {
    user_id: toUserIdQuery(userId),
    type: packageInfo ? 'purchase' : 'admin_grant',
    amount: amount,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    description: reason || (packageInfo ? `${packageInfo.name} 패키지 구매` : '관리자 크레딧 부여'),
    created_at: new Date(),
    created_by: adminId ? toUserIdQuery(adminId) : 'system'
  };

  if (packageInfo) {
    transaction.package = {
      code: packageInfo.code,
      name: packageInfo.name,
      credits: packageInfo.credits,
      price_krw: packageInfo.price_krw
    };
  }

  if (!packageInfo && adminId) {
    transaction.admin = {
      granted_by: toUserIdQuery(adminId),
      granted_by_name: adminName,
      reason: reason || '관리자 크레딧 부여'
    };
  }

  await transactionsCollection.insertOne(transaction);

  return {
    success: true,
    user_id: userId,
    amount_granted: amount,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    transaction_id: transaction._id
  };
}

/**
 * 추가 크레딧 사용 (차감)
 * @param {Db} db - MongoDB docupload DB
 * @param {string} userId - 사용자 ID
 * @param {number} amount - 사용할 크레딧 (양수)
 * @param {Object} usageInfo - 사용 정보
 * @returns {Promise<Object>} 결과
 */
async function useBonusCredits(db, userId, amount, usageInfo = {}) {
  if (amount <= 0) {
    throw new Error('사용할 크레딧은 0보다 커야 합니다.');
  }

  const usersCollection = db.collection('users');
  const transactionsCollection = db.collection('credit_transactions');

  // 1. 현재 잔액 조회
  const user = await usersCollection.findOne(
    { _id: toUserIdQuery(userId) },
    { projection: { 'bonus_credits.balance': 1 } }
  );

  const balanceBefore = user?.bonus_credits?.balance ?? 0;

  if (balanceBefore < amount) {
    return {
      success: false,
      reason: 'insufficient_balance',
      balance: balanceBefore,
      required: amount
    };
  }

  const balanceAfter = balanceBefore - amount;

  // 2. 잔액 차감
  await usersCollection.updateOne(
    { _id: toUserIdQuery(userId) },
    {
      $inc: {
        'bonus_credits.balance': -amount,
        'bonus_credits.total_used': amount
      },
      $set: {
        'bonus_credits.updated_at': new Date()
      }
    }
  );

  // 3. 트랜잭션 기록
  const transaction = {
    user_id: toUserIdQuery(userId),
    type: 'usage',
    amount: -amount,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    usage: {
      resource_type: usageInfo.resource_type || 'unknown',
      resource_id: usageInfo.resource_id || null,
      credits_used: amount,
      description: usageInfo.description || '크레딧 사용'
    },
    description: usageInfo.description || '크레딧 사용',
    created_at: new Date(),
    created_by: 'system'
  };

  await transactionsCollection.insertOne(transaction);

  return {
    success: true,
    amount_used: amount,
    balance_before: balanceBefore,
    balance_after: balanceAfter
  };
}

/**
 * 크레딧 충분 여부 체크 (월정액 + 추가 크레딧 통합)
 * @param {Db} db - MongoDB docupload DB
 * @param {Db} analyticsDb - MongoDB aims_analytics DB
 * @param {string} userId - 사용자 ID
 * @param {number} requiredCredits - 필요한 크레딧
 * @returns {Promise<Object>} 체크 결과
 */
async function checkCreditWithBonus(db, analyticsDb, userId, requiredCredits = 0) {
  try {
    // 1. 월정액 크레딧 체크
    const monthlyCheck = await checkCreditBeforeAI(db, analyticsDb, userId, requiredCredits);

    // 무제한 사용자
    if (monthlyCheck.reason === 'unlimited') {
      return {
        allowed: true,
        source: 'unlimited',
        monthly_remaining: -1,
        bonus_balance: 0,
        total_available: -1
      };
    }

    const monthlyRemaining = monthlyCheck.credits_remaining ?? 0;
    const bonusBalance = await getBonusCreditBalance(db, userId);
    const totalAvailable = monthlyRemaining + bonusBalance;

    // 2. 월정액만으로 충분한 경우
    if (monthlyRemaining >= requiredCredits) {
      return {
        allowed: true,
        source: 'monthly',
        monthly_remaining: monthlyRemaining,
        bonus_balance: bonusBalance,
        total_available: totalAvailable,
        required: requiredCredits
      };
    }

    // 3. 월정액 + 추가 크레딧 합산으로 체크
    if (totalAvailable >= requiredCredits) {
      return {
        allowed: true,
        source: 'mixed',
        monthly_remaining: monthlyRemaining,
        bonus_balance: bonusBalance,
        total_available: totalAvailable,
        required: requiredCredits,
        bonus_needed: requiredCredits - monthlyRemaining
      };
    }

    // 4. 크레딧 부족
    return {
      allowed: false,
      reason: 'insufficient_credits',
      monthly_remaining: monthlyRemaining,
      bonus_balance: bonusBalance,
      total_available: totalAvailable,
      required: requiredCredits,
      shortage: requiredCredits - totalAvailable,
      days_until_reset: monthlyCheck.days_until_reset
    };

  } catch (error) {
    console.error('[CreditService] checkCreditWithBonus 오류 (fail-open):', error.message);
    return {
      allowed: true,
      source: 'error_fallback',
      error: error.message
    };
  }
}

/**
 * 통합 크레딧 사용 (월정액 먼저 → 추가 크레딧)
 * @param {Db} db - MongoDB docupload DB
 * @param {Db} analyticsDb - MongoDB aims_analytics DB
 * @param {string} userId - 사용자 ID
 * @param {number} creditsToUse - 사용할 크레딧
 * @param {Object} usageInfo - 사용 정보
 * @returns {Promise<Object>} 사용 결과
 */
async function consumeCredits(db, analyticsDb, userId, creditsToUse, usageInfo = {}) {
  try {
    // 1. 통합 크레딧 체크
    const check = await checkCreditWithBonus(db, analyticsDb, userId, creditsToUse);

    if (!check.allowed) {
      return {
        success: false,
        reason: check.reason,
        ...check
      };
    }

    // 2. 무제한 사용자는 차감 없음
    if (check.source === 'unlimited') {
      return {
        success: true,
        source: 'unlimited',
        monthly_used: 0,
        bonus_used: 0,
        credits_used: 0
      };
    }

    // 3. 월정액만으로 충분한 경우 (추가 크레딧 차감 없음)
    // 월정액은 집계 기반이므로 실제 차감 로직 없음
    if (check.source === 'monthly') {
      return {
        success: true,
        source: 'monthly',
        monthly_used: creditsToUse,
        bonus_used: 0,
        credits_used: creditsToUse
      };
    }

    // 4. 혼합 사용 (월정액 전부 + 추가 크레딧 일부)
    const bonusNeeded = check.bonus_needed || (creditsToUse - check.monthly_remaining);

    const usageResult = await useBonusCredits(db, userId, bonusNeeded, {
      ...usageInfo,
      description: usageInfo.description || `월정액 초과분 ${bonusNeeded}C 사용`
    });

    if (!usageResult.success) {
      return {
        success: false,
        reason: 'bonus_deduction_failed',
        error: usageResult.reason
      };
    }

    return {
      success: true,
      source: 'mixed',
      monthly_used: check.monthly_remaining,
      bonus_used: bonusNeeded,
      credits_used: creditsToUse,
      bonus_remaining: usageResult.balance_after
    };

  } catch (error) {
    console.error('[CreditService] consumeCredits 오류:', error.message);
    return {
      success: false,
      reason: 'error',
      error: error.message
    };
  }
}

/**
 * 크레딧 트랜잭션 이력 조회
 * @param {Db} db - MongoDB docupload DB
 * @param {Object} filter - 필터 조건
 * @param {Object} options - 옵션 (limit, skip, sort)
 * @returns {Promise<Array>} 트랜잭션 목록
 */
async function getCreditTransactions(db, filter = {}, options = {}) {
  const { limit = 50, skip = 0, sort = { created_at: -1 } } = options;

  const transactions = await db.collection('credit_transactions')
    .find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .toArray();

  return transactions;
}

/**
 * 크레딧 패키지 목록 조회
 * @param {Db} db - MongoDB docupload DB
 * @param {boolean} activeOnly - 활성 패키지만 조회
 * @returns {Promise<Array>} 패키지 목록
 */
async function getCreditPackages(db, activeOnly = true) {
  const filter = activeOnly ? { is_active: true } : {};

  const packages = await db.collection('credit_packages')
    .find(filter)
    .sort({ sort_order: 1 })
    .toArray();

  return packages;
}

/**
 * 전체 크레딧 현황 요약 (관리자용)
 * @param {Db} db - MongoDB docupload DB
 * @returns {Promise<Object>} 현황 요약
 */
async function getCreditOverview(db) {
  const usersCollection = db.collection('users');
  const transactionsCollection = db.collection('credit_transactions');

  // 이번 달 시작일 (KST 기준)
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 0, 0, 0));

  // 1. 전체 추가 크레딧 잔액 합계
  const balanceAgg = await usersCollection.aggregate([
    { $match: { 'bonus_credits.balance': { $gt: 0 } } },
    { $group: {
      _id: null,
      total_balance: { $sum: '$bonus_credits.balance' },
      user_count: { $sum: 1 }
    }}
  ]).toArray();

  // 2. 이번 달 부여 합계
  const grantAgg = await transactionsCollection.aggregate([
    {
      $match: {
        type: { $in: ['purchase', 'admin_grant'] },
        created_at: { $gte: monthStart }
      }
    },
    { $group: {
      _id: null,
      total_granted: { $sum: '$amount' },
      grant_count: { $sum: 1 }
    }}
  ]).toArray();

  // 3. 이번 달 사용 합계
  const usageAgg = await transactionsCollection.aggregate([
    {
      $match: {
        type: 'usage',
        created_at: { $gte: monthStart }
      }
    },
    { $group: {
      _id: null,
      total_used: { $sum: { $abs: '$amount' } },
      usage_count: { $sum: 1 }
    }}
  ]).toArray();

  return {
    total_balance: balanceAgg[0]?.total_balance || 0,
    users_with_balance: balanceAgg[0]?.user_count || 0,
    month_granted: grantAgg[0]?.total_granted || 0,
    month_grant_count: grantAgg[0]?.grant_count || 0,
    month_used: usageAgg[0]?.total_used || 0,
    month_usage_count: usageAgg[0]?.usage_count || 0,
    month_start: monthStart.toISOString()
  };
}

module.exports = {
  CREDIT_RATES,
  calculateOcrCredits,
  calculateAiCredits,
  getOcrCreditsInCycle,
  getAiCreditsInCycle,
  getCycleCreditsUsed,
  getUserCreditInfo,
  checkCreditAllowed,
  checkCreditBeforeAI,
  checkCreditForDocumentProcessing,
  // 추가 크레딧 (Bonus Credits)
  getBonusCreditBalance,
  getBonusCreditInfo,
  grantBonusCredits,
  useBonusCredits,
  checkCreditWithBonus,
  consumeCredits,
  getCreditTransactions,
  getCreditPackages,
  getCreditOverview
};
