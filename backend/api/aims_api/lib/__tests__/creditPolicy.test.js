/**
 * creditPolicy.test.js - ICreditPolicy 인터페이스 regression 테스트
 */

// creditService mock
jest.mock('../creditService', () => ({
  checkCreditForDocumentProcessing: jest.fn().mockResolvedValue({ allowed: true, reason: 'within_quota' }),
  checkCreditBeforeAI: jest.fn().mockResolvedValue({ allowed: true, reason: 'within_quota' }),
  checkCreditWithBonus: jest.fn().mockResolvedValue({ allowed: true, source: 'monthly' }),
  getUserCreditInfo: jest.fn().mockResolvedValue({ credit_quota: 1000 }),
  getBonusCreditBalance: jest.fn().mockResolvedValue(500),
  getBonusCreditInfo: jest.fn().mockResolvedValue({ balance: 500 }),
  getCycleCreditsUsed: jest.fn().mockResolvedValue({ total_credits: 100 }),
  getCycleSettledAmount: jest.fn().mockResolvedValue(50),
  getCreditTransactions: jest.fn().mockResolvedValue([]),
  getCreditPackages: jest.fn().mockResolvedValue([]),
  getCreditOverview: jest.fn().mockResolvedValue({}),
  grantBonusCredits: jest.fn().mockResolvedValue({ success: true }),
  consumeCredits: jest.fn().mockResolvedValue({ success: true }),
  settleBonusCredits: jest.fn().mockResolvedValue({ settled: true }),
  processCreditPendingDocuments: jest.fn().mockResolvedValue({ processed: 0 }),
  CREDIT_RATES: { OCR_PER_PAGE: 2, AI_PER_1K_TOKENS: 0.5 },
}));

const { DefaultCreditPolicy, NoCreditPolicy, createCreditPolicy, CREDIT_RATES } = require('../creditPolicy');
const creditService = require('../creditService');

describe('createCreditPolicy 팩토리', () => {
  const originalEnv = process.env.CREDIT_POLICY;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.CREDIT_POLICY;
    else process.env.CREDIT_POLICY = originalEnv;
  });

  test('CREDIT_POLICY=default -> DefaultCreditPolicy 인스턴스', () => {
    process.env.CREDIT_POLICY = 'default';
    const policy = createCreditPolicy({}, {});
    expect(policy).toBeInstanceOf(DefaultCreditPolicy);
    expect(policy.policyName).toBe('default');
  });

  test('CREDIT_POLICY=free -> NoCreditPolicy 인스턴스', () => {
    process.env.CREDIT_POLICY = 'free';
    const policy = createCreditPolicy(null, null);
    expect(policy).toBeInstanceOf(NoCreditPolicy);
    expect(policy.policyName).toBe('free');
  });

  test('CREDIT_POLICY 미설정 -> DefaultCreditPolicy (기본값)', () => {
    delete process.env.CREDIT_POLICY;
    const policy = createCreditPolicy({}, {});
    expect(policy).toBeInstanceOf(DefaultCreditPolicy);
  });

  test('CREDIT_POLICY=unknown -> DefaultCreditPolicy + 경고 로그', () => {
    process.env.CREDIT_POLICY = 'freee';  // 오타
    const spy = jest.spyOn(console, 'warn').mockImplementation();
    const policy = createCreditPolicy({}, {});
    expect(policy).toBeInstanceOf(DefaultCreditPolicy);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('알 수 없는'));
    spy.mockRestore();
  });

  test('CREDIT_RATES re-export 확인', () => {
    expect(CREDIT_RATES.OCR_PER_PAGE).toBe(2);
    expect(CREDIT_RATES.AI_PER_1K_TOKENS).toBe(0.5);
  });
});

describe('NoCreditPolicy', () => {
  const policy = new NoCreditPolicy();

  test('checkForDocumentProcessing -> allowed: true, reason: free_policy', async () => {
    const result = await policy.checkForDocumentProcessing('user1', 100);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('free_policy');
  });

  test('checkBeforeAI -> allowed: true', async () => {
    const result = await policy.checkBeforeAI('user1', 999);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('free_policy');
  });

  test('checkWithBonus -> allowed: true', async () => {
    const result = await policy.checkWithBonus('user1', 999);
    expect(result.allowed).toBe(true);
    expect(result.source).toBe('free_policy');
  });

  test('getUserInfo -> unlimited 응답', async () => {
    const result = await policy.getUserInfo('user1');
    expect(result.credit_is_unlimited).toBe(true);
    expect(result.credit_quota).toBe(-1);
  });

  test('getBonusBalance -> 0', async () => {
    expect(await policy.getBonusBalance('user1')).toBe(0);
  });

  test('getTransactions -> 빈 배열', async () => {
    expect(await policy.getTransactions()).toEqual([]);
  });

  test('getPackages -> 빈 배열', async () => {
    expect(await policy.getPackages()).toEqual([]);
  });

  test('grantBonus -> success: true (no-op)', async () => {
    const result = await policy.grantBonus('user1', 100, 'admin1', 'test');
    expect(result.success).toBe(true);
    expect(result.amount_granted).toBe(0);
  });

  test('consume -> success: true (no-op)', async () => {
    const result = await policy.consume('user1', 50);
    expect(result.success).toBe(true);
  });

  test('settleBonus -> settled: false, free_policy', async () => {
    const result = await policy.settleBonus('user1');
    expect(result.settled).toBe(false);
    expect(result.reason).toBe('free_policy');
  });

  test('processPendingDocuments -> processed: 0', async () => {
    const result = await policy.processPendingDocuments('user1');
    expect(result.processed).toBe(0);
  });
});

describe('DefaultCreditPolicy 위임 검증', () => {
  const mockDb = {};
  const mockAnalyticsDb = {};
  const policy = new DefaultCreditPolicy(mockDb, mockAnalyticsDb);

  beforeEach(() => jest.clearAllMocks());

  test('checkForDocumentProcessing -> creditService에 db, analyticsDb, userId, pages 전달', async () => {
    await policy.checkForDocumentProcessing('user1', 5);
    expect(creditService.checkCreditForDocumentProcessing).toHaveBeenCalledWith(mockDb, mockAnalyticsDb, 'user1', 5);
  });

  test('checkBeforeAI -> creditService에 올바른 인자 전달', async () => {
    await policy.checkBeforeAI('user1', 10);
    expect(creditService.checkCreditBeforeAI).toHaveBeenCalledWith(mockDb, mockAnalyticsDb, 'user1', 10);
  });

  test('checkWithBonus -> creditService에 올바른 인자 전달', async () => {
    await policy.checkWithBonus('user1', 3);
    expect(creditService.checkCreditWithBonus).toHaveBeenCalledWith(mockDb, mockAnalyticsDb, 'user1', 3);
  });

  test('grantBonus -> creditService에 올바른 인자 전달', async () => {
    await policy.grantBonus('user1', 100, 'admin1', 'test', { code: 'pkg1' });
    expect(creditService.grantBonusCredits).toHaveBeenCalledWith(mockDb, 'user1', 100, 'admin1', 'test', { code: 'pkg1' });
  });

  test('settleBonus -> creditService에 올바른 인자 전달', async () => {
    await policy.settleBonus('user1');
    expect(creditService.settleBonusCredits).toHaveBeenCalledWith(mockDb, mockAnalyticsDb, 'user1');
  });

  test('processPendingDocuments -> creditService에 올바른 인자 전달', async () => {
    await policy.processPendingDocuments('user1');
    expect(creditService.processCreditPendingDocuments).toHaveBeenCalledWith(mockDb, 'user1');
  });
});
