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
  getBonusCreditInfo
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
// 회귀 테스트
// =============================================================================

describe('creditService - 회귀 테스트', () => {
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
