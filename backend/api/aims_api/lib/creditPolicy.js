/**
 * creditPolicy.js - 크레딧 정책 인터페이스 + 구현체
 *
 * 과금 정책을 인터페이스로 격리하여 구현체를 교체 가능하게 합니다.
 * - DefaultCreditPolicy: 현재 creditService.js 로직 (유료 모델)
 * - NoCreditPolicy: 크레딧 체크 없이 항상 허용 (무료 모델)
 *
 * 환경변수 CREDIT_POLICY로 구현체 선택:
 * - "default" (기본값) → DefaultCreditPolicy
 * - "free" → NoCreditPolicy
 *
 * @since 2026-04-04
 */

/**
 * @interface ICreditPolicy
 *
 * 모든 크레딧 정책 구현체가 따라야 하는 인터페이스.
 * aims_api 내부에서 creditService를 직접 사용하지 않고
 * 이 인터페이스 경유로 접근합니다.
 *
 * === Core (체크) ===
 * @method checkForDocumentProcessing(userId, estimatedPages) → CreditCheckResult
 * @method checkBeforeAI(userId, estimatedCredits) → CreditCheckResult
 * @method checkWithBonus(userId, requiredCredits) → CreditCheckResult
 *
 * === Query (조회) ===
 * @method getUserInfo(userId, tier, creditQuota, cycleStart, cycleEnd, daysUntilReset, proRataInfo) → CreditInfo
 * @method getBonusBalance(userId) → number
 * @method getBonusInfo(userId) → BonusInfo
 * @method getCycleUsed(userId, cycleStart, cycleEnd) → CycleUsage
 * @method getCycleSettled(userId, cycleStart, cycleEnd) → number
 * @method getTransactions(filter, options) → Transaction[]
 * @method getPackages(activeOnly) → Package[]
 * @method getOverview() → Overview
 *
 * === Admin (관리) ===
 * @method grantBonus(userId, amount, adminId, reason, packageInfo) → GrantResult
 * @method consume(userId, credits, usageInfo) → ConsumeResult
 * @method settleBonus(userId) → SettleResult
 * @method processPendingDocuments(userId) → ProcessResult
 */

// =========================================================================
// DefaultCreditPolicy
// =========================================================================

const creditService = require('./creditService');

class DefaultCreditPolicy {
  /**
   * @param {import('mongodb').Db} db - docupload DB
   * @param {import('mongodb').Db} analyticsDb - aims_analytics DB
   */
  constructor(db, analyticsDb) {
    this.db = db;
    this.analyticsDb = analyticsDb;
    this.policyName = 'default';
  }

  // === Core ===
  async checkForDocumentProcessing(userId, estimatedPages = 1) {
    return creditService.checkCreditForDocumentProcessing(this.db, this.analyticsDb, userId, estimatedPages);
  }

  async checkBeforeAI(userId, estimatedCredits = 5) {
    return creditService.checkCreditBeforeAI(this.db, this.analyticsDb, userId, estimatedCredits);
  }

  async checkWithBonus(userId, requiredCredits = 0) {
    return creditService.checkCreditWithBonus(this.db, this.analyticsDb, userId, requiredCredits);
  }

  // === Query ===
  async getUserInfo(userId, tier, creditQuota, cycleStart, cycleEnd, daysUntilReset, proRataInfo) {
    return creditService.getUserCreditInfo(this.db, this.analyticsDb, userId, tier, creditQuota, cycleStart, cycleEnd, daysUntilReset, proRataInfo);
  }

  async getBonusBalance(userId) {
    return creditService.getBonusCreditBalance(this.db, userId);
  }

  async getBonusInfo(userId) {
    return creditService.getBonusCreditInfo(this.db, userId);
  }

  async getCycleUsed(userId, cycleStart, cycleEnd) {
    return creditService.getCycleCreditsUsed(this.db, this.analyticsDb, userId, cycleStart, cycleEnd);
  }

  async getCycleSettled(userId, cycleStart, cycleEnd) {
    return creditService.getCycleSettledAmount(this.db, userId, cycleStart, cycleEnd);
  }

  async getTransactions(filter = {}, options = {}) {
    return creditService.getCreditTransactions(this.db, filter, options);
  }

  async getPackages(activeOnly = true) {
    return creditService.getCreditPackages(this.db, activeOnly);
  }

  async getOverview() {
    return creditService.getCreditOverview(this.db);
  }

  // === Admin ===
  async grantBonus(userId, amount, adminId, reason, packageInfo = null) {
    return creditService.grantBonusCredits(this.db, userId, amount, adminId, reason, packageInfo);
  }

  async consume(userId, credits, usageInfo = {}) {
    return creditService.consumeCredits(this.db, this.analyticsDb, userId, credits, usageInfo);
  }

  async settleBonus(userId) {
    return creditService.settleBonusCredits(this.db, this.analyticsDb, userId);
  }

  async processPendingDocuments(userId) {
    return creditService.processCreditPendingDocuments(this.db, userId);
  }
}

// =========================================================================
// NoCreditPolicy
// =========================================================================

const FREE_CHECK_RESULT = {
  allowed: true,
  reason: 'free_policy',
  credits_used: 0,
  credits_remaining: -1,
  credit_quota: -1,
  credit_usage_percent: 0,
  estimated_credits: 0,
  days_until_reset: 0,
  bonus_balance: 0,
  total_available: -1,
};

class NoCreditPolicy {
  constructor() {
    this.policyName = 'free';
  }

  // === Core ===
  async checkForDocumentProcessing() { return { ...FREE_CHECK_RESULT }; }
  async checkBeforeAI() { return { ...FREE_CHECK_RESULT }; }
  async checkWithBonus() { return { allowed: true, source: 'free_policy', monthly_remaining: -1, bonus_balance: 0, total_available: -1 }; }

  // === Query ===
  async getUserInfo() {
    return {
      credit_quota: -1,
      credit_quota_full: -1,
      credits_used: 0,
      credits_remaining: -1,
      credit_usage_percent: 0,
      credit_is_unlimited: true,
      credit_breakdown: { ocr: { pages: 0, credits: 0 }, ai: { tokens: 0, credits: 0 } },
      credit_cycle_start: null,
      credit_cycle_end: null,
      credit_days_until_reset: 0,
      is_first_month: false,
      pro_rata_ratio: 1.0,
    };
  }

  async getBonusBalance() { return 0; }
  async getBonusInfo() { return { balance: 0, total_purchased: 0, total_used: 0, last_purchase_at: null, updated_at: null }; }
  async getCycleUsed() { return { ocr: { pages: 0, credits: 0 }, ai: { tokens: 0, credits: 0 }, total_credits: 0 }; }
  async getCycleSettled() { return 0; }
  async getTransactions() { return []; }
  async getPackages() { return []; }
  async getOverview() { return { total_balance: 0, users_with_balance: 0, month_granted: 0, month_grant_count: 0, month_used: 0, month_usage_count: 0 }; }

  // === Admin ===
  async grantBonus() { return { success: true, amount_granted: 0, balance_before: 0, balance_after: 0, credit_pending_processed: 0, credit_pending_remaining: 0, credit_pending_docs: [] }; }
  async consume() { return { success: true, source: 'free_policy', monthly_used: 0, bonus_used: 0, credits_used: 0 }; }
  async settleBonus() { return { settled: false, reason: 'free_policy' }; }
  async processPendingDocuments() { return { processed: 0, remaining: 0, docs: [] }; }
}

// =========================================================================
// Factory
// =========================================================================

/**
 * 크레딧 정책 인스턴스 생성
 * @param {import('mongodb').Db} db - docupload DB
 * @param {import('mongodb').Db} analyticsDb - aims_analytics DB
 * @returns {DefaultCreditPolicy|NoCreditPolicy}
 */
function createCreditPolicy(db, analyticsDb) {
  const policy = process.env.CREDIT_POLICY || 'default';
  switch (policy) {
    case 'free':
      console.log('[CreditPolicy] NoCreditPolicy 활성화 (무료 모델)');
      return new NoCreditPolicy();
    default:
      if (policy !== 'default') {
        console.warn(`[CreditPolicy] 알 수 없는 CREDIT_POLICY 값: '${policy}' → DefaultCreditPolicy 사용`);
      } else {
        console.log('[CreditPolicy] DefaultCreditPolicy 활성화');
      }
      return new DefaultCreditPolicy(db, analyticsDb);
  }
}

module.exports = {
  DefaultCreditPolicy,
  NoCreditPolicy,
  createCreditPolicy,
  // creditService의 순수 함수/상수는 직접 re-export (인터페이스 외부에서 사용)
  CREDIT_RATES: creditService.CREDIT_RATES,
};
