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
 * 사용자의 크레딧 정보 조회
 * @param {Db} db - MongoDB docupload DB 인스턴스
 * @param {Db} analyticsDb - MongoDB aims_analytics DB 인스턴스
 * @param {string} userId - 사용자 ID
 * @param {string} tier - 사용자 티어
 * @param {number} creditQuota - 티어 크레딧 한도 (-1이면 무제한)
 * @param {Date} cycleStart - 사이클 시작일
 * @param {Date} cycleEnd - 사이클 종료일
 * @param {number} daysUntilReset - 리셋까지 남은 일수
 * @returns {Promise<Object>} 크레딧 정보
 */
async function getUserCreditInfo(db, analyticsDb, userId, tier, creditQuota, cycleStart, cycleEnd, daysUntilReset) {
  const isUnlimited = creditQuota === -1;

  // 크레딧 사용량 계산
  const usage = await getCycleCreditsUsed(db, analyticsDb, userId, cycleStart, cycleEnd);

  // 사이클 날짜를 YYYY-MM-DD 형식으로 변환 (KST 기준)
  const formatDateKST = (date) => {
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().split('T')[0];
  };

  return {
    credit_quota: creditQuota,
    credits_used: usage.total_credits,
    credits_remaining: isUnlimited ? -1 : Math.max(0, creditQuota - usage.total_credits),
    credit_usage_percent: isUnlimited ? 0 : Math.round((usage.total_credits / creditQuota) * 100 * 100) / 100,
    credit_is_unlimited: isUnlimited,
    credit_breakdown: {
      ocr: usage.ocr,
      ai: usage.ai
    },
    credit_cycle_start: formatDateKST(cycleStart),
    credit_cycle_end: formatDateKST(cycleEnd),
    credit_days_until_reset: daysUntilReset
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
    const creditQuota = tierDef.credit_quota ?? 2000;

    // 4. 사이클 정보 (storageInfo에서 이미 계산된 값 사용)
    const cycleStart = new Date(storageInfo.ocr_cycle_start + 'T00:00:00+09:00');
    const cycleEnd = new Date(storageInfo.ocr_cycle_end + 'T23:59:59.999+09:00');
    const daysUntilReset = storageInfo.ocr_days_until_reset;

    // 5. 현재 크레딧 사용량 계산
    const usage = await getCycleCreditsUsed(db, analyticsDb, userId, cycleStart, cycleEnd);
    const remaining = creditQuota - usage.total_credits;
    const usagePercent = Math.round((usage.total_credits / creditQuota) * 100 * 100) / 100;

    // 6. 한도 체크
    if (remaining < estimatedCredits) {
      return {
        allowed: false,
        reason: 'credit_exceeded',
        credits_used: usage.total_credits,
        credits_remaining: Math.max(0, remaining),
        credit_quota: creditQuota,
        credit_usage_percent: usagePercent,
        days_until_reset: daysUntilReset,
        tier: storageInfo.tier,
        tier_name: storageInfo.tierName
      };
    }

    return {
      allowed: true,
      reason: 'within_quota',
      credits_used: usage.total_credits,
      credits_remaining: remaining,
      credit_quota: creditQuota,
      credit_usage_percent: usagePercent,
      days_until_reset: daysUntilReset
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

module.exports = {
  CREDIT_RATES,
  calculateOcrCredits,
  calculateAiCredits,
  getOcrCreditsInCycle,
  getAiCreditsInCycle,
  getCycleCreditsUsed,
  getUserCreditInfo,
  checkCreditAllowed,
  checkCreditBeforeAI
};
