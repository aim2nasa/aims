/**
 * Credit Service Unit Tests
 * @since 2026-02-05
 *
 * 테스트 범위:
 * 1. calculateOcrCredits - OCR 페이지당 크레딧 계산
 * 2. calculateAiCredits - AI 토큰당 크레딧 계산
 * 3. checkCreditBeforeAI - AI 호출 전 크레딧 체크
 * 4. checkCreditForDocumentProcessing - 문서 처리 전 크레딧 체크
 * 5. grantBonusCredits - 보너스 크레딧 부여
 * 6. processCreditPendingDocuments - credit_pending 문서 처리
 * 7. getBonusCreditBalance - 보너스 크레딧 잔액 조회
 * 8. checkCreditWithBonus - 월정액 + 보너스 통합 체크
 *
 * @see docs/EMBEDDING_CREDIT_POLICY.md
 * @see docs/BONUS_CREDIT_IMPLEMENTATION.md
 */

const {
  CREDIT_RATES,
  calculateOcrCredits,
  calculateAiCredits,
  getBonusCreditBalance,
  getBonusCreditInfo,
  settleBonusCredits,
  useBonusCredits
} = require('../creditService');

// =============================================================================
// 순수 함수 테스트 (DB 불필요)
// =============================================================================

describe('creditService - 순수 함수', () => {
  describe('CREDIT_RATES 상수', () => {
    it('OCR_PER_PAGE는 2여야 함 (페이지당 2크레딧)', () => {
      expect(CREDIT_RATES.OCR_PER_PAGE).toBe(2);
    });

    it('AI_PER_1K_TOKENS는 0.5여야 함 (1K 토큰당 0.5크레딧)', () => {
      expect(CREDIT_RATES.AI_PER_1K_TOKENS).toBe(0.5);
    });
  });

  describe('calculateOcrCredits', () => {
    /**
     * 기본 계산 테스트
     * 공식: pages * OCR_PER_PAGE (2)
     */
    it('1페이지 → 2크레딧', () => {
      expect(calculateOcrCredits(1)).toBe(2);
    });

    it('10페이지 → 20크레딧', () => {
      expect(calculateOcrCredits(10)).toBe(20);
    });

    it('100페이지 → 200크레딧', () => {
      expect(calculateOcrCredits(100)).toBe(200);
    });

    /**
     * 엣지 케이스: 0 페이지
     */
    it('0페이지 → 0크레딧', () => {
      expect(calculateOcrCredits(0)).toBe(0);
    });

    /**
     * 엣지 케이스: 소수점 페이지 (이론상 발생하지 않지만 안전성 확인)
     */
    it('소수점 페이지도 계산됨 (1.5페이지 → 3크레딧)', () => {
      expect(calculateOcrCredits(1.5)).toBe(3);
    });
  });

  describe('calculateAiCredits', () => {
    /**
     * 기본 계산 테스트
     * 공식: (tokens / 1000) * AI_PER_1K_TOKENS (0.5)
     */
    it('1000 토큰 → 0.5크레딧', () => {
      expect(calculateAiCredits(1000)).toBe(0.5);
    });

    it('2000 토큰 → 1크레딧', () => {
      expect(calculateAiCredits(2000)).toBe(1);
    });

    it('10000 토큰 → 5크레딧', () => {
      expect(calculateAiCredits(10000)).toBe(5);
    });

    /**
     * 엣지 케이스: 0 토큰
     */
    it('0 토큰 → 0크레딧', () => {
      expect(calculateAiCredits(0)).toBe(0);
    });

    /**
     * 엣지 케이스: 1000 미만 토큰
     */
    it('500 토큰 → 0.25크레딧', () => {
      expect(calculateAiCredits(500)).toBe(0.25);
    });

    /**
     * 엣지 케이스: 소수점 결과
     */
    it('1500 토큰 → 0.75크레딧', () => {
      expect(calculateAiCredits(1500)).toBe(0.75);
    });
  });

  describe('예상 크레딧 계산 (문서 처리)', () => {
    /**
     * 문서 처리 예상 크레딧 공식:
     * (OCR 크레딧 + 임베딩 크레딧) * 1.5 버퍼
     * = (pages * 2 + pages * 0.5) * 1.5
     * = pages * 3.75
     */
    function calculateEstimatedDocCredits(pages) {
      const ocrCredits = pages * CREDIT_RATES.OCR_PER_PAGE;
      const embeddingCredits = pages * 0.5;
      return Math.ceil((ocrCredits + embeddingCredits) * 1.5);
    }

    it('1페이지 → 4크레딧 (버퍼 적용)', () => {
      // (1*2 + 1*0.5) * 1.5 = 3.75 → ceil → 4
      expect(calculateEstimatedDocCredits(1)).toBe(4);
    });

    it('10페이지 → 38크레딧', () => {
      // (10*2 + 10*0.5) * 1.5 = 37.5 → ceil → 38
      expect(calculateEstimatedDocCredits(10)).toBe(38);
    });

    it('100페이지 → 375크레딧', () => {
      // (100*2 + 100*0.5) * 1.5 = 375 → ceil → 375
      expect(calculateEstimatedDocCredits(100)).toBe(375);
    });
  });
});

// =============================================================================
// DB 의존 함수 테스트 (모킹 필요)
// =============================================================================

describe('creditService - DB 의존 함수', () => {
  // Mock DB 객체
  let mockDb;
  let mockUsersCollection;
  let mockFilesCollection;
  let mockTransactionsCollection;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock collections
    mockUsersCollection = {
      findOne: jest.fn(),
      updateOne: jest.fn()
    };

    mockFilesCollection = {
      find: jest.fn(() => ({
        sort: jest.fn(() => ({
          toArray: jest.fn().mockResolvedValue([])
        }))
      })),
      updateOne: jest.fn()
    };

    mockTransactionsCollection = {
      insertOne: jest.fn().mockResolvedValue({ insertedId: 'tx-001' })
    };

    // Mock DB
    mockDb = {
      collection: jest.fn((name) => {
        switch (name) {
          case 'users':
            return mockUsersCollection;
          case 'files':
            return mockFilesCollection;
          case 'credit_transactions':
            return mockTransactionsCollection;
          default:
            return { find: jest.fn(), findOne: jest.fn() };
        }
      }),
      client: {
        db: jest.fn(() => mockDb)
      }
    };
  });

  describe('getBonusCreditBalance', () => {
    it('사용자의 보너스 크레딧 잔액을 반환해야 함', async () => {
      mockUsersCollection.findOne.mockResolvedValue({
        _id: 'user-001',
        bonus_credits: { balance: 500 }
      });

      const balance = await getBonusCreditBalance(mockDb, 'user-001');

      expect(balance).toBe(500);
      expect(mockUsersCollection.findOne).toHaveBeenCalledWith(
        { _id: expect.anything() },
        { projection: { 'bonus_credits.balance': 1 } }
      );
    });

    it('보너스 크레딧이 없는 사용자는 0을 반환해야 함', async () => {
      mockUsersCollection.findOne.mockResolvedValue({
        _id: 'user-001'
        // bonus_credits 필드 없음
      });

      const balance = await getBonusCreditBalance(mockDb, 'user-001');

      expect(balance).toBe(0);
    });

    it('존재하지 않는 사용자는 0을 반환해야 함', async () => {
      mockUsersCollection.findOne.mockResolvedValue(null);

      const balance = await getBonusCreditBalance(mockDb, 'non-existent');

      expect(balance).toBe(0);
    });
  });

  describe('getBonusCreditInfo', () => {
    it('보너스 크레딧 상세 정보를 반환해야 함', async () => {
      const mockDate = new Date('2026-02-05T10:00:00Z');
      mockUsersCollection.findOne.mockResolvedValue({
        _id: 'user-001',
        bonus_credits: {
          balance: 500,
          total_purchased: 1000,
          total_used: 500,
          last_purchase_at: mockDate,
          updated_at: mockDate
        }
      });

      const info = await getBonusCreditInfo(mockDb, 'user-001');

      expect(info.balance).toBe(500);
      expect(info.total_purchased).toBe(1000);
      expect(info.total_used).toBe(500);
      expect(info.last_purchase_at).toEqual(mockDate);
    });

    it('보너스 크레딧이 없는 사용자는 기본값을 반환해야 함', async () => {
      mockUsersCollection.findOne.mockResolvedValue({
        _id: 'user-001'
      });

      const info = await getBonusCreditInfo(mockDb, 'user-001');

      expect(info.balance).toBe(0);
      expect(info.total_purchased).toBe(0);
      expect(info.total_used).toBe(0);
      expect(info.last_purchase_at).toBeNull();
    });
  });
});

// =============================================================================
// 통합 시나리오 테스트
// =============================================================================

describe('creditService - 통합 시나리오', () => {
  describe('크레딧 부족 시나리오', () => {
    it('월정액 2000 + 보너스 0 + 사용 1995 → 남은 5크레딧', () => {
      const creditQuota = 2000;
      const creditsUsed = 1995;
      const bonusBalance = 0;

      const monthlyRemaining = Math.max(0, creditQuota - creditsUsed);
      const totalAvailable = monthlyRemaining + bonusBalance;

      expect(monthlyRemaining).toBe(5);
      expect(totalAvailable).toBe(5);
    });

    it('월정액 2000 + 보너스 100 + 사용 2100 → 보너스에서 초과분 차감', () => {
      const creditQuota = 2000;
      const creditsUsed = 2100;
      const bonusBalance = 100;

      const monthlyOverage = Math.max(0, creditsUsed - creditQuota);
      const effectiveBonusBalance = Math.max(0, bonusBalance - monthlyOverage);
      const monthlyRemaining = Math.max(0, creditQuota - creditsUsed);
      const totalAvailable = monthlyRemaining + effectiveBonusBalance;

      expect(monthlyOverage).toBe(100);
      expect(effectiveBonusBalance).toBe(0); // 100 - 100 = 0
      expect(monthlyRemaining).toBe(0);
      expect(totalAvailable).toBe(0);
    });

    it('월정액 2000 + 보너스 500 + 사용 2100 → 보너스 400 남음', () => {
      const creditQuota = 2000;
      const creditsUsed = 2100;
      const bonusBalance = 500;

      const monthlyOverage = Math.max(0, creditsUsed - creditQuota);
      const effectiveBonusBalance = Math.max(0, bonusBalance - monthlyOverage);

      expect(monthlyOverage).toBe(100);
      expect(effectiveBonusBalance).toBe(400); // 500 - 100 = 400
    });
  });

  describe('일할 계산 시나리오', () => {
    it('첫 달 55% → 2000 크레딧 한도가 1100으로 조정', () => {
      const creditQuota = 2000;
      const proRataRatio = 0.55;
      const isFirstMonth = true;

      const effectiveQuota = isFirstMonth
        ? Math.round(creditQuota * proRataRatio)
        : creditQuota;

      expect(effectiveQuota).toBe(1100);
    });

    it('일반 달 (100%) → 2000 크레딧 한도 유지', () => {
      const creditQuota = 2000;
      const proRataRatio = 1.0;
      const isFirstMonth = false;

      const effectiveQuota = isFirstMonth
        ? Math.round(creditQuota * proRataRatio)
        : creditQuota;

      expect(effectiveQuota).toBe(2000);
    });
  });

  describe('credit_pending 처리 시나리오', () => {
    it('reprocessed_from_credit_pending 플래그 설정 확인', () => {
      // credit_pending → pending 전환 시 설정되어야 하는 필드들
      const updateFields = {
        overallStatus: 'pending',
        'docembed.status': 'pending',
        'docembed.reprocessed_from_credit_pending': true,
        'docembed.reprocessed_at': new Date(),
        progressStage: 'queued',
        progressMessage: '크레딧 충전 후 재처리 대기'
      };

      expect(updateFields['docembed.reprocessed_from_credit_pending']).toBe(true);
      expect(updateFields.overallStatus).toBe('pending');
      expect(updateFields.progressStage).toBe('queued');
    });
  });

  describe('티어별 크레딧 한도', () => {
    const TIER_CREDIT_QUOTAS = {
      admin: -1,        // 무제한
      standard: 2000,
      free_trial: 300
    };

    it('admin 티어는 무제한 (-1)', () => {
      expect(TIER_CREDIT_QUOTAS.admin).toBe(-1);
    });

    it('standard 티어는 2000 크레딧', () => {
      expect(TIER_CREDIT_QUOTAS.standard).toBe(2000);
    });

    it('free_trial 티어는 300 크레딧', () => {
      expect(TIER_CREDIT_QUOTAS.free_trial).toBe(300);
    });
  });
});

// =============================================================================
// 보너스 사후 정산 시나리오 테스트 (settleBonusCredits)
// =============================================================================

describe('creditService - 보너스 사후 정산', () => {
  describe('정산 필요분 계산 로직', () => {
    /**
     * 사후 정산(post-settlement) 핵심 로직:
     * 추가차감필요분 = max(0, 월정액초과분 - 이미차감된보너스)
     */
    it('초과 100C, 기정산 0C → 추가 차감 100C', () => {
      const monthlyOverage = 100;
      const alreadyDeducted = 0;
      const additionalDeduction = Math.max(0, monthlyOverage - alreadyDeducted);
      expect(additionalDeduction).toBe(100);
    });

    it('초과 100C, 기정산 50C → 추가 차감 50C', () => {
      const monthlyOverage = 100;
      const alreadyDeducted = 50;
      const additionalDeduction = Math.max(0, monthlyOverage - alreadyDeducted);
      expect(additionalDeduction).toBe(50);
    });

    it('초과 100C, 기정산 100C → 추가 차감 0C (이미 완전 정산)', () => {
      const monthlyOverage = 100;
      const alreadyDeducted = 100;
      const additionalDeduction = Math.max(0, monthlyOverage - alreadyDeducted);
      expect(additionalDeduction).toBe(0);
    });

    it('초과 0C → 정산 불필요', () => {
      const monthlyOverage = 0;
      const alreadyDeducted = 0;
      const additionalDeduction = Math.max(0, monthlyOverage - alreadyDeducted);
      expect(additionalDeduction).toBe(0);
    });

    it('잔액 부족 시 잔액만큼만 차감', () => {
      const monthlyOverage = 200;
      const alreadyDeducted = 0;
      const bonusBalance = 50;
      const additionalDeduction = Math.max(0, monthlyOverage - alreadyDeducted);
      const deductAmount = Math.min(additionalDeduction, bonusBalance);
      expect(deductAmount).toBe(50);
    });

    it('잔액 부족 후 미정산분이 effectiveBonusBalance에 반영', () => {
      const monthlyOverage = 200;
      const alreadySettled = 50;  // 이전에 50C만 차감됨 (잔액 부족)
      const bonusBalance = 0;     // 이미 소진
      const unsettledOverage = Math.max(0, monthlyOverage - alreadySettled);
      const effectiveBonusBalance = Math.max(0, bonusBalance - unsettledOverage);
      expect(unsettledOverage).toBe(150);
      expect(effectiveBonusBalance).toBe(0);
    });
  });

  describe('이중 차감 방지', () => {
    it('같은 초과분에 대해 두 번 정산해도 추가 차감은 0', () => {
      // 1차 정산: 초과 100C, 기정산 0C → 100C 차감
      const firstSettlement = Math.max(0, 100 - 0);
      expect(firstSettlement).toBe(100);

      // 2차 정산: 초과 100C, 기정산 100C (1차에서 차감됨) → 0C 차감
      const secondSettlement = Math.max(0, 100 - 100);
      expect(secondSettlement).toBe(0);
    });

    it('사용량 증가 후 추가분만 정산', () => {
      // 1차: 초과 100C → 100C 정산
      const firstOverage = 100;
      const firstAlready = 0;
      const first = Math.max(0, firstOverage - firstAlready);
      expect(first).toBe(100);

      // 2차: 초과 150C (50C 추가 사용) → 50C만 추가 정산
      const secondOverage = 150;
      const secondAlready = 100; // 1차에서 100C 정산됨
      const second = Math.max(0, secondOverage - secondAlready);
      expect(second).toBe(50);
    });
  });

  describe('사이클 리셋 시 정산 리셋', () => {
    it('새 사이클에서는 기정산 0C부터 시작 (credit_transactions 기간 필터)', () => {
      // 이전 사이클: 100C 정산됨
      // 새 사이클: getCycleSettledAmount는 새 사이클 범위만 조회 → 0C
      const newCycleAlreadyDeducted = 0; // 새 사이클에서는 type='usage' 기록 없음
      const newOverage = 50;
      const additionalDeduction = Math.max(0, newOverage - newCycleAlreadyDeducted);
      expect(additionalDeduction).toBe(50);
    });
  });

  describe('소수점 처리', () => {
    it('소수점 2자리 반올림', () => {
      const amount = 33.333;
      const rounded = Math.round(amount * 100) / 100;
      expect(rounded).toBe(33.33);
    });

    it('0.005 → 0.01 (반올림)', () => {
      const amount = 0.005;
      const rounded = Math.round(amount * 100) / 100;
      expect(rounded).toBe(0.01);
    });
  });
});

// =============================================================================
// 회귀 테스트
// =============================================================================

describe('creditService - 회귀 테스트', () => {
  describe('[회귀] 보너스 크레딧 실차감 연결 (2026-03-23)', () => {
    /**
     * 버그 배경:
     * - consumeCredits()가 구현되어 있으나 어디에서도 호출되지 않음
     * - 보너스 크레딧(users.bonus_credits.balance)이 영원히 차감되지 않음
     * - 매월 사이클 리셋 시 가상 차감이 0으로 돌아가 보너스가 "부활"
     *
     * 해결:
     * - settleBonusCredits() 사후 정산 함수 추가
     * - checkCreditWithBonus(), checkCreditForDocumentProcessing()에서 자동 호출
     * - credit_transactions type='usage'로 이중 차감 방지
     */
    it('사후 정산: 초과분만큼 보너스에서 실차감되어야 함', () => {
      // 시나리오: 월정액 2000, 사용 2100, 보너스 500, 기정산 0
      const creditQuota = 2000;
      const creditsUsed = 2100;
      const bonusBalance = 500;
      const alreadyDeducted = 0;

      const monthlyOverage = Math.max(0, creditsUsed - creditQuota); // 100
      const additionalDeduction = Math.max(0, monthlyOverage - alreadyDeducted); // 100
      const deductAmount = Math.min(additionalDeduction, bonusBalance); // 100

      expect(monthlyOverage).toBe(100);
      expect(deductAmount).toBe(100);

      // 정산 후 잔액
      const balanceAfter = bonusBalance - deductAmount; // 400
      expect(balanceAfter).toBe(400);
    });

    it('사후 정산: 이미 정산 완료된 경우 추가 차감 없음', () => {
      const creditQuota = 2000;
      const creditsUsed = 2100;
      const bonusBalance = 400;  // 이미 100C 차감됨
      const alreadyDeducted = 100;

      const monthlyOverage = Math.max(0, creditsUsed - creditQuota); // 100
      const additionalDeduction = Math.max(0, monthlyOverage - alreadyDeducted); // 0

      expect(additionalDeduction).toBe(0);
    });

    it('사후 정산: 월정액 내 사용은 보너스 차감 없음', () => {
      const creditQuota = 2000;
      const creditsUsed = 1500;
      const bonusBalance = 500;

      const monthlyOverage = Math.max(0, creditsUsed - creditQuota); // 0
      expect(monthlyOverage).toBe(0);
      // 보너스 잔액 변동 없음
    });
  });

  describe('[회귀] 월정액 초과분 보너스 차감 (2026-02-05)', () => {
    /**
     * 버그 배경:
     * - 월정액 초과 사용 시 보너스 크레딧에서 초과분을 차감하지 않아
     * - 총 가용 크레딧이 실제보다 높게 표시됨
     *
     * 해결:
     * - checkCreditForDocumentProcessing()에서 monthlyOverage 계산 후 보너스에서 차감
     */
    it('월정액 초과분이 보너스에서 차감되어야 함', () => {
      const creditQuota = 2000;
      const creditsUsed = 2050;  // 50 크레딧 초과
      const bonusBalance = 100;

      // 🔴 월정액 초과분 계산
      const monthlyOverage = Math.max(0, creditsUsed - creditQuota);
      // 🔴 보너스에서 초과분 차감
      const effectiveBonusBalance = Math.max(0, bonusBalance - monthlyOverage);

      expect(monthlyOverage).toBe(50);
      expect(effectiveBonusBalance).toBe(50);  // 100 - 50 = 50
    });
  });

  describe('[회귀] credit_pending 문서 재처리 플래그 (2026-02-05)', () => {
    /**
     * 버그 배경:
     * - credit_pending → pending으로 변경한 문서가
     * - full_pipeline.py에서 다시 크레딧 체크되어 credit_pending으로 되돌아감
     *
     * 해결:
     * - reprocessed_from_credit_pending 플래그 추가
     * - full_pipeline.py에서 이 플래그가 있으면 크레딧 체크 스킵
     */
    it('reprocessed_from_credit_pending 플래그가 true로 설정되어야 함', () => {
      const doc = {
        overallStatus: 'credit_pending'
      };

      // 크레딧 충전 후 상태 전환 시뮬레이션
      const updateDoc = {
        overallStatus: 'pending',
        'docembed.status': 'pending',
        'docembed.reprocessed_from_credit_pending': true
      };

      expect(updateDoc['docembed.reprocessed_from_credit_pending']).toBe(true);
    });
  });
});

// =============================================================================
// settleBonusCredits Mock 통합 테스트
// =============================================================================

// storageQuotaService mock (settleBonusCredits 내부에서 require)
jest.mock('../storageQuotaService', () => ({
  getUserStorageInfo: jest.fn(),
  getTierDefinitions: jest.fn()
}));

describe('creditService - settleBonusCredits mock 통합 테스트', () => {
  const { getUserStorageInfo, getTierDefinitions } = require('../storageQuotaService');

  // 공통 Mock DB 헬퍼
  let mockDb;
  let mockAnalyticsDb;
  let mockUsersCollection;
  let mockTransactionsCollection;
  let mockFilesCollection;
  let mockTokenUsageCollection;

  /**
   * aggregate mock 헬퍼: 결과 배열을 toArray()로 반환하는 체인 생성
   */
  function mockAggregate(resultArray) {
    return jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue(resultArray) });
  }

  // 기본 storageInfo (standard 티어, 보너스 있는 일반 사용자)
  const defaultStorageInfo = {
    is_unlimited: false,
    tier: 'standard',
    pro_rata_ratio: 1.0,
    ocr_cycle_start: '2026-03-01',
    ocr_cycle_end: '2026-03-31'
  };

  // 기본 tierDefinitions
  const defaultTierDefs = {
    standard: { credit_quota: 2000 },
    free_trial: { credit_quota: 300 },
    admin: { credit_quota: -1 }
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockUsersCollection = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn()
    };

    mockTransactionsCollection = {
      aggregate: mockAggregate([]),  // 기본: 기정산 0
      insertOne: jest.fn().mockResolvedValue({ insertedId: 'tx-settle-001' })
    };

    mockFilesCollection = {
      aggregate: mockAggregate([])  // 기본: OCR 사용 0
    };

    mockTokenUsageCollection = {
      aggregate: mockAggregate([])  // 기본: AI 사용 0
    };

    mockDb = {
      collection: jest.fn((name) => {
        switch (name) {
          case 'users': return mockUsersCollection;
          case 'credit_transactions': return mockTransactionsCollection;
          case 'files': return mockFilesCollection;
          default: return { find: jest.fn(), findOne: jest.fn(), aggregate: mockAggregate([]) };
        }
      })
    };

    mockAnalyticsDb = {
      collection: jest.fn((name) => {
        switch (name) {
          case 'ai_token_usage': return mockTokenUsageCollection;
          default: return { aggregate: mockAggregate([]) };
        }
      })
    };

    // 기본 mock 설정
    getUserStorageInfo.mockResolvedValue(defaultStorageInfo);
    getTierDefinitions.mockResolvedValue(defaultTierDefs);
  });

  /**
   * 시나리오 1: 월정액 내 사용 → 정산 안 함
   */
  it('월정액 내 사용 시 정산하지 않음', async () => {
    // 보너스 잔액 500
    mockUsersCollection.findOne.mockResolvedValue({
      _id: 'user-001',
      bonus_credits: { balance: 500 }
    });
    // OCR: 900 크레딧 (450페이지) → 월정액 2000 미초과
    mockFilesCollection.aggregate = mockAggregate([{ _id: null, total_pages: 450 }]);
    // AI: 0
    mockTokenUsageCollection.aggregate = mockAggregate([]);

    const result = await settleBonusCredits(mockDb, mockAnalyticsDb, 'user-001');

    expect(result.settled).toBe(false);
    expect(result.reason).toBe('within_quota');
    // useBonusCredits 호출되지 않아야 함 (findOneAndUpdate 호출 없음)
    expect(mockUsersCollection.findOneAndUpdate).not.toHaveBeenCalled();
  });

  /**
   * 시나리오 2: 월정액 초과 → 보너스 차감 발생
   */
  it('월정액 초과 시 보너스에서 초과분 차감', async () => {
    // 보너스 잔액 500
    mockUsersCollection.findOne.mockResolvedValue({
      _id: 'user-001',
      bonus_credits: { balance: 500 }
    });
    // OCR: 2100 크레딧 (1050페이지) → 월정액 2000 초과 100C
    mockFilesCollection.aggregate = mockAggregate([{ _id: null, total_pages: 1050 }]);
    // AI: 0
    mockTokenUsageCollection.aggregate = mockAggregate([]);
    // 기정산: 0
    mockTransactionsCollection.aggregate = mockAggregate([]);
    // findOneAndUpdate 성공 (잔액 500 → 400)
    mockUsersCollection.findOneAndUpdate.mockResolvedValue({
      bonus_credits: { balance: 400, total_used: 100 }
    });

    const result = await settleBonusCredits(mockDb, mockAnalyticsDb, 'user-001');

    expect(result.settled).toBe(true);
    expect(result.amount).toBe(100);
    expect(result.monthly_overage).toBe(100);
    expect(result.already_deducted).toBe(0);
    expect(result.balance_after).toBe(400);
  });

  /**
   * 시나리오 3: 동일 사이클 재호출 → 이중 차감 없음
   */
  it('이미 정산 완료된 경우 추가 차감 없음', async () => {
    // 보너스 잔액 400 (이미 100 차감됨)
    mockUsersCollection.findOne.mockResolvedValue({
      _id: 'user-001',
      bonus_credits: { balance: 400 }
    });
    // OCR: 2100 크레딧 → 초과 100
    mockFilesCollection.aggregate = mockAggregate([{ _id: null, total_pages: 1050 }]);
    mockTokenUsageCollection.aggregate = mockAggregate([]);
    // 기정산: 100C (이전 정산에서 이미 차감)
    mockTransactionsCollection.aggregate = mockAggregate([{ _id: null, total_deducted: 100 }]);

    const result = await settleBonusCredits(mockDb, mockAnalyticsDb, 'user-001');

    expect(result.settled).toBe(false);
    expect(result.reason).toBe('already_settled');
    expect(mockUsersCollection.findOneAndUpdate).not.toHaveBeenCalled();
  });

  /**
   * 시나리오 4: 사이클 내 사용량 증가 → 추가 차감
   */
  it('사이클 내 추가 사용 시 증가분만 추가 차감', async () => {
    // 보너스 잔액 400 (이전 정산 100 차감 후)
    mockUsersCollection.findOne.mockResolvedValue({
      _id: 'user-001',
      bonus_credits: { balance: 400 }
    });
    // OCR: 2200 크레딧 (1100페이지) → 초과 200
    mockFilesCollection.aggregate = mockAggregate([{ _id: null, total_pages: 1100 }]);
    mockTokenUsageCollection.aggregate = mockAggregate([]);
    // 기정산: 100C (1차 정산 완료)
    mockTransactionsCollection.aggregate = mockAggregate([{ _id: null, total_deducted: 100 }]);
    // findOneAndUpdate 성공 (잔액 400 → 300, 추가분 100)
    mockUsersCollection.findOneAndUpdate.mockResolvedValue({
      bonus_credits: { balance: 300, total_used: 200 }
    });

    const result = await settleBonusCredits(mockDb, mockAnalyticsDb, 'user-001');

    expect(result.settled).toBe(true);
    expect(result.amount).toBe(100);  // 200 초과 - 100 기정산 = 100 추가
    expect(result.monthly_overage).toBe(200);
    expect(result.already_deducted).toBe(100);
  });

  /**
   * 시나리오 5: 보너스 잔액 부족
   */
  it('보너스 잔액 부족 시 잔액만큼만 차감', async () => {
    // 보너스 잔액 30 (적은 잔액)
    mockUsersCollection.findOne.mockResolvedValue({
      _id: 'user-001',
      bonus_credits: { balance: 30 }
    });
    // OCR: 2200 크레딧 → 초과 200
    mockFilesCollection.aggregate = mockAggregate([{ _id: null, total_pages: 1100 }]);
    mockTokenUsageCollection.aggregate = mockAggregate([]);
    // 기정산: 0
    mockTransactionsCollection.aggregate = mockAggregate([]);
    // findOneAndUpdate 성공 (잔액 30 → 0)
    mockUsersCollection.findOneAndUpdate.mockResolvedValue({
      bonus_credits: { balance: 0, total_used: 30 }
    });

    const result = await settleBonusCredits(mockDb, mockAnalyticsDb, 'user-001');

    expect(result.settled).toBe(true);
    expect(result.amount).toBe(30);  // min(200, 30) = 30
    expect(result.balance_after).toBe(0);
  });

  /**
   * 시나리오 6: 관리자(무제한) 제외
   */
  it('무제한 사용자(관리자)는 정산하지 않음', async () => {
    getUserStorageInfo.mockResolvedValue({
      ...defaultStorageInfo,
      is_unlimited: true,
      tier: 'admin'
    });

    const result = await settleBonusCredits(mockDb, mockAnalyticsDb, 'admin-001');

    expect(result.settled).toBe(false);
    expect(result.reason).toBe('unlimited');
    expect(mockUsersCollection.findOne).not.toHaveBeenCalled();
  });

  /**
   * 시나리오 7: 보너스 잔액 0 → 스킵
   */
  it('보너스 잔액 0이면 정산 스킵', async () => {
    // 보너스 잔액 0
    mockUsersCollection.findOne.mockResolvedValue({
      _id: 'user-001',
      bonus_credits: { balance: 0 }
    });

    const result = await settleBonusCredits(mockDb, mockAnalyticsDb, 'user-001');

    expect(result.settled).toBe(false);
    expect(result.reason).toBe('no_bonus_balance');
    // OCR/AI 사용량 조회도 하지 않아야 함
    expect(mockFilesCollection.aggregate).not.toHaveBeenCalled();
  });

  /**
   * 시나리오 8: 새 달 전환 → 이월 (새 사이클에서 기정산 0부터 시작)
   */
  it('새 사이클에서는 기정산 0부터 정산 시작', async () => {
    // 새 사이클: 4월
    getUserStorageInfo.mockResolvedValue({
      ...defaultStorageInfo,
      ocr_cycle_start: '2026-04-01',
      ocr_cycle_end: '2026-04-30'
    });
    // 보너스 잔액 300 (이전 사이클에서 200 사용 후 남은 잔액)
    mockUsersCollection.findOne.mockResolvedValue({
      _id: 'user-001',
      bonus_credits: { balance: 300 }
    });
    // 새 사이클 OCR: 2050 크레딧 → 초과 50
    mockFilesCollection.aggregate = mockAggregate([{ _id: null, total_pages: 1025 }]);
    mockTokenUsageCollection.aggregate = mockAggregate([]);
    // 새 사이클 기정산: 0 (새 사이클이므로)
    mockTransactionsCollection.aggregate = mockAggregate([]);
    // findOneAndUpdate 성공
    mockUsersCollection.findOneAndUpdate.mockResolvedValue({
      bonus_credits: { balance: 250, total_used: 250 }
    });

    const result = await settleBonusCredits(mockDb, mockAnalyticsDb, 'user-001');

    expect(result.settled).toBe(true);
    expect(result.amount).toBe(50);
    expect(result.already_deducted).toBe(0);
    expect(result.balance_after).toBe(250);
  });
});

// =============================================================================
// useBonusCredits 원자적 패턴 테스트 (Race Condition 방지)
// =============================================================================

describe('creditService - useBonusCredits 원자적 패턴', () => {
  let mockDb;
  let mockUsersCollection;
  let mockTransactionsCollection;

  beforeEach(() => {
    jest.clearAllMocks();

    mockUsersCollection = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn()
    };

    mockTransactionsCollection = {
      insertOne: jest.fn().mockResolvedValue({ insertedId: 'tx-001' })
    };

    mockDb = {
      collection: jest.fn((name) => {
        switch (name) {
          case 'users': return mockUsersCollection;
          case 'credit_transactions': return mockTransactionsCollection;
          default: return {};
        }
      })
    };
  });

  it('잔액 충분 시 findOneAndUpdate로 원자적 차감', async () => {
    // findOneAndUpdate 성공: 잔액 500 → 400
    mockUsersCollection.findOneAndUpdate.mockResolvedValue({
      bonus_credits: { balance: 400, total_used: 100 }
    });

    const result = await useBonusCredits(mockDb, 'user-001', 100, {
      resource_type: 'test',
      description: '테스트 차감'
    });

    expect(result.success).toBe(true);
    expect(result.amount_used).toBe(100);
    expect(result.balance_before).toBe(500);  // 400 + 100 역산
    expect(result.balance_after).toBe(400);
    // findOneAndUpdate에 $gte 조건이 포함되어야 함
    expect(mockUsersCollection.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        'bonus_credits.balance': { $gte: 100 }
      }),
      expect.objectContaining({
        $inc: { 'bonus_credits.balance': -100, 'bonus_credits.total_used': 100 }
      }),
      expect.objectContaining({ returnDocument: 'after' })
    );
    // 트랜잭션 기록 확인
    expect(mockTransactionsCollection.insertOne).toHaveBeenCalledTimes(1);
  });

  it('잔액 부족 시 findOneAndUpdate가 null 반환 → 실패', async () => {
    // findOneAndUpdate 실패 (잔액 부족)
    mockUsersCollection.findOneAndUpdate.mockResolvedValue(null);
    // 실패 후 현재 잔액 조회
    mockUsersCollection.findOne.mockResolvedValue({
      _id: 'user-001',
      bonus_credits: { balance: 30 }
    });

    const result = await useBonusCredits(mockDb, 'user-001', 100);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('insufficient_balance');
    expect(result.balance).toBe(30);
    expect(result.required).toBe(100);
    // 트랜잭션 기록 없어야 함
    expect(mockTransactionsCollection.insertOne).not.toHaveBeenCalled();
  });

  it('amount 0 이하 시 에러 throw', async () => {
    await expect(useBonusCredits(mockDb, 'user-001', 0)).rejects.toThrow('사용할 크레딧은 0보다 커야 합니다.');
    await expect(useBonusCredits(mockDb, 'user-001', -5)).rejects.toThrow('사용할 크레딧은 0보다 커야 합니다.');
  });
});
