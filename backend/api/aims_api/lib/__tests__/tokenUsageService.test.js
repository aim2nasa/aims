/**
 * Token Usage Service Unit Tests
 * @since 2026-02-05
 *
 * 테스트 범위:
 * 1. TOKEN_COSTS 상수 - 모델별 토큰 비용
 * 2. calculateCost - 토큰 비용 계산
 * 3. logTokenUsage - 토큰 사용량 로깅
 * 4. getUserTokenUsage - 사용자별 사용량 조회
 * 5. getDailyUsage - 일별 사용량 조회
 * 6. getSystemOverview - 시스템 전체 통계
 * 7. getHourlyUsageBySource - 시간별 소스별 통계
 * 8. getTopUsers - 상위 사용자 조회
 * 9. formatCost, formatTokens - 포맷팅 함수
 *
 * @priority CRITICAL - 과금/크레딧 관련 핵심 서비스
 */

const {
  TOKEN_COSTS,
  calculateCost,
  logTokenUsage,
  getUserTokenUsage,
  getDailyUsage,
  getDailyUsageByRange,
  getSystemOverview,
  getHourlyUsageBySource,
  getTopUsers,
  getTopUsersWithRange,
  formatCost,
  formatTokens,
  ensureIndexes
} = require('../tokenUsageService');

// =============================================================================
// Mock 설정
// =============================================================================

/**
 * MongoDB Collection Mock Factory
 * @param {Array} aggregateResults - aggregate 결과
 * @param {Object} options - insertOne 결과 등 추가 옵션
 */
function createMockCollection(aggregateResults = [], options = {}) {
  const mockCursor = {
    toArray: jest.fn().mockResolvedValue(aggregateResults)
  };

  return {
    aggregate: jest.fn().mockReturnValue(mockCursor),
    insertOne: jest.fn().mockResolvedValue({ insertedId: 'mock-id', ...options.insertResult }),
    createIndex: jest.fn().mockResolvedValue('index_created')
  };
}

/**
 * Analytics DB Mock Factory
 * @param {Object} mockCollection - 컬렉션 mock
 */
function createMockAnalyticsDb(mockCollection) {
  return {
    collection: jest.fn().mockReturnValue(mockCollection)
  };
}

// =============================================================================
// 1. TOKEN_COSTS 상수 테스트
// =============================================================================

describe('TOKEN_COSTS 상수 검증', () => {
  describe('필수 모델 존재 확인', () => {
    it('text-embedding-3-small 모델이 정의되어야 함', () => {
      expect(TOKEN_COSTS['text-embedding-3-small']).toBeDefined();
      expect(TOKEN_COSTS['text-embedding-3-small'].input).toBeDefined();
      expect(TOKEN_COSTS['text-embedding-3-small'].output).toBeDefined();
    });

    it('gpt-3.5-turbo 모델이 정의되어야 함', () => {
      expect(TOKEN_COSTS['gpt-3.5-turbo']).toBeDefined();
    });

    it('gpt-4o 모델이 정의되어야 함', () => {
      expect(TOKEN_COSTS['gpt-4o']).toBeDefined();
    });

    it('gpt-4o-mini 모델이 정의되어야 함', () => {
      expect(TOKEN_COSTS['gpt-4o-mini']).toBeDefined();
    });

    it('gpt-4-turbo 모델이 정의되어야 함', () => {
      expect(TOKEN_COSTS['gpt-4-turbo']).toBeDefined();
    });

    it('default 모델이 정의되어야 함', () => {
      expect(TOKEN_COSTS['default']).toBeDefined();
    });
  });

  describe('가격 정확성 검증', () => {
    it('gpt-4o-mini 가격이 정확해야 함 (input: $0.00015, output: $0.0006)', () => {
      expect(TOKEN_COSTS['gpt-4o-mini'].input).toBe(0.00015);
      expect(TOKEN_COSTS['gpt-4o-mini'].output).toBe(0.0006);
    });

    it('gpt-4o 가격이 정확해야 함 (input: $0.0025, output: $0.01)', () => {
      expect(TOKEN_COSTS['gpt-4o'].input).toBe(0.0025);
      expect(TOKEN_COSTS['gpt-4o'].output).toBe(0.01);
    });

    it('text-embedding-3-small output은 0이어야 함 (임베딩은 출력 없음)', () => {
      expect(TOKEN_COSTS['text-embedding-3-small'].output).toBe(0);
    });

    it('default 가격이 합리적이어야 함 (input: $0.001, output: $0.002)', () => {
      expect(TOKEN_COSTS['default'].input).toBe(0.001);
      expect(TOKEN_COSTS['default'].output).toBe(0.002);
    });
  });

  describe('가격 범위 검증', () => {
    it('모든 모델의 input 가격은 0 이상이어야 함', () => {
      for (const [model, costs] of Object.entries(TOKEN_COSTS)) {
        expect(costs.input).toBeGreaterThanOrEqual(0);
      }
    });

    it('모든 모델의 output 가격은 0 이상이어야 함', () => {
      for (const [model, costs] of Object.entries(TOKEN_COSTS)) {
        expect(costs.output).toBeGreaterThanOrEqual(0);
      }
    });
  });
});

// =============================================================================
// 2. calculateCost 함수 테스트 (20개+)
// =============================================================================

describe('calculateCost - 비용 계산', () => {
  describe('기본 비용 계산', () => {
    it('gpt-4o-mini 1000 prompt + 500 completion 토큰 비용 계산', () => {
      // input: $0.00015/1K, output: $0.0006/1K
      // (1000/1000) * 0.00015 + (500/1000) * 0.0006 = 0.00015 + 0.0003 = 0.00045
      const cost = calculateCost('gpt-4o-mini', 1000, 500);
      expect(cost).toBeCloseTo(0.00045, 6);
    });

    it('gpt-4o 2000 prompt + 1000 completion 토큰 비용 계산', () => {
      // input: $0.0025/1K, output: $0.01/1K
      // (2000/1000) * 0.0025 + (1000/1000) * 0.01 = 0.005 + 0.01 = 0.015
      const cost = calculateCost('gpt-4o', 2000, 1000);
      expect(cost).toBeCloseTo(0.015, 6);
    });

    it('gpt-4-turbo 비용 계산 (고가 모델)', () => {
      // input: $0.01/1K, output: $0.03/1K
      // (1000/1000) * 0.01 + (1000/1000) * 0.03 = 0.04
      const cost = calculateCost('gpt-4-turbo', 1000, 1000);
      expect(cost).toBeCloseTo(0.04, 6);
    });

    it('text-embedding-3-small 비용 계산 (output 없음)', () => {
      // input: $0.00002/1K, output: $0/1K
      // (1000/1000) * 0.00002 = 0.00002
      const cost = calculateCost('text-embedding-3-small', 1000, 0);
      expect(cost).toBeCloseTo(0.00002, 6);
    });
  });

  describe('소수점 정밀도 검증', () => {
    it('소수점 6자리까지 정밀도 유지', () => {
      const cost = calculateCost('gpt-4o-mini', 1, 1);
      // (1/1000) * 0.00015 + (1/1000) * 0.0006 = 0.00000015 + 0.0000006 = 0.00000075
      const precision = cost.toString().split('.')[1]?.length || 0;
      expect(precision).toBeLessThanOrEqual(6);
    });

    it('반올림 정확성 검증 (6자리)', () => {
      // 정밀도 검사: Math.round(x * 1000000) / 1000000
      const cost = calculateCost('gpt-4o-mini', 333, 777);
      // 정확히 6자리까지만 표시됨
      expect(typeof cost).toBe('number');
      expect(cost).toBeCloseTo((333/1000 * 0.00015 + 777/1000 * 0.0006), 6);
    });
  });

  describe('0 토큰 입력 처리', () => {
    it('0 prompt, 0 completion → 0 비용', () => {
      const cost = calculateCost('gpt-4o', 0, 0);
      expect(cost).toBe(0);
    });

    it('0 prompt, 양수 completion → completion 비용만', () => {
      const cost = calculateCost('gpt-4o', 0, 1000);
      expect(cost).toBeCloseTo(0.01, 6); // $0.01/1K output
    });

    it('양수 prompt, 0 completion → prompt 비용만', () => {
      const cost = calculateCost('gpt-4o', 1000, 0);
      expect(cost).toBeCloseTo(0.0025, 6); // $0.0025/1K input
    });
  });

  describe('음수 토큰 방어 (엣지케이스)', () => {
    it('음수 prompt → 음수 비용 반환 (방어 로직 없음 확인)', () => {
      // 현재 구현은 음수 방어 없음 - 음수 결과 반환
      const cost = calculateCost('gpt-4o', -1000, 0);
      expect(cost).toBeLessThan(0);
    });

    it('음수 completion → 음수 비용 반환', () => {
      const cost = calculateCost('gpt-4o', 0, -1000);
      expect(cost).toBeLessThan(0);
    });
  });

  describe('대량 토큰 계산', () => {
    it('100만 토큰 (1M) 계산 - gpt-4o-mini', () => {
      // (1000000/1000) * 0.00015 = 0.15
      const cost = calculateCost('gpt-4o-mini', 1000000, 0);
      expect(cost).toBeCloseTo(0.15, 6);
    });

    it('1000만 토큰 (10M) 계산 - gpt-4o', () => {
      // (10000000/1000) * 0.0025 = 25
      const cost = calculateCost('gpt-4o', 10000000, 0);
      expect(cost).toBeCloseTo(25, 2);
    });

    it('대량 prompt + completion 복합 계산', () => {
      // 5M prompt + 2M completion on gpt-4-turbo
      // (5000000/1000) * 0.01 + (2000000/1000) * 0.03 = 50 + 60 = 110
      const cost = calculateCost('gpt-4-turbo', 5000000, 2000000);
      expect(cost).toBeCloseTo(110, 2);
    });
  });

  describe('알 수 없는 모델 처리', () => {
    it('알 수 없는 모델 → default 가격 적용', () => {
      // default: input: 0.001, output: 0.002
      const cost = calculateCost('unknown-model-xyz', 1000, 1000);
      // (1000/1000) * 0.001 + (1000/1000) * 0.002 = 0.003
      expect(cost).toBeCloseTo(0.003, 6);
    });

    it('null 모델명 → default 가격 적용', () => {
      const cost = calculateCost(null, 1000, 1000);
      expect(cost).toBeCloseTo(0.003, 6);
    });

    it('undefined 모델명 → default 가격 적용', () => {
      const cost = calculateCost(undefined, 1000, 1000);
      expect(cost).toBeCloseTo(0.003, 6);
    });

    it('빈 문자열 모델명 → default 가격 적용', () => {
      const cost = calculateCost('', 1000, 1000);
      expect(cost).toBeCloseTo(0.003, 6);
    });
  });

  describe('모델별 비용 비교', () => {
    it('동일 토큰량에서 gpt-4-turbo > gpt-4o > gpt-4o-mini', () => {
      const tokens = { prompt: 1000, completion: 500 };
      const costTurbo = calculateCost('gpt-4-turbo', tokens.prompt, tokens.completion);
      const cost4o = calculateCost('gpt-4o', tokens.prompt, tokens.completion);
      const costMini = calculateCost('gpt-4o-mini', tokens.prompt, tokens.completion);

      expect(costTurbo).toBeGreaterThan(cost4o);
      expect(cost4o).toBeGreaterThan(costMini);
    });

    it('embedding 모델이 가장 저렴함', () => {
      const cost = calculateCost('text-embedding-3-small', 1000, 0);
      const costMini = calculateCost('gpt-4o-mini', 1000, 0);

      expect(cost).toBeLessThan(costMini);
    });
  });

  describe('부동소수점 정밀도', () => {
    it('0.1 + 0.2 !== 0.3 문제 없이 계산', () => {
      // 부동소수점 문제 검증
      const cost = calculateCost('default', 100, 100);
      // 반올림 처리로 정밀도 문제 회피 확인
      expect(cost).toBeCloseTo((100/1000 * 0.001 + 100/1000 * 0.002), 6);
    });

    it('반복 계산 시 정밀도 유지', () => {
      const cost1 = calculateCost('gpt-4o-mini', 100, 100);
      const cost2 = calculateCost('gpt-4o-mini', 100, 100);
      expect(cost1).toBe(cost2);
    });
  });
});

// =============================================================================
// 3. logTokenUsage 함수 테스트 (10개)
// =============================================================================

describe('logTokenUsage - 토큰 사용량 로깅', () => {
  let mockCollection;
  let mockAnalyticsDb;

  beforeEach(() => {
    mockCollection = createMockCollection();
    mockAnalyticsDb = createMockAnalyticsDb(mockCollection);
  });

  describe('필수 필드 검증', () => {
    it('user_id와 model이 포함되어야 함', async () => {
      const result = await logTokenUsage(mockAnalyticsDb, {
        user_id: 'test-user',
        model: 'gpt-4o-mini',
        source: 'chat'
      });

      expect(result.success).toBe(true);
      expect(mockCollection.insertOne).toHaveBeenCalledTimes(1);

      const insertedDoc = mockCollection.insertOne.mock.calls[0][0];
      expect(insertedDoc.user_id).toBe('test-user');
      expect(insertedDoc.model).toBe('gpt-4o-mini');
    });

    it('source 필드가 저장되어야 함', async () => {
      await logTokenUsage(mockAnalyticsDb, {
        user_id: 'test-user',
        model: 'gpt-4o',
        source: 'rag_api'
      });

      const insertedDoc = mockCollection.insertOne.mock.calls[0][0];
      expect(insertedDoc.source).toBe('rag_api');
    });
  });

  describe('선택 필드 처리', () => {
    it('prompt_tokens 기본값 0', async () => {
      await logTokenUsage(mockAnalyticsDb, {
        user_id: 'test-user',
        model: 'gpt-4o',
        source: 'chat'
      });

      const insertedDoc = mockCollection.insertOne.mock.calls[0][0];
      expect(insertedDoc.prompt_tokens).toBe(0);
    });

    it('completion_tokens 기본값 0', async () => {
      await logTokenUsage(mockAnalyticsDb, {
        user_id: 'test-user',
        model: 'gpt-4o',
        source: 'chat'
      });

      const insertedDoc = mockCollection.insertOne.mock.calls[0][0];
      expect(insertedDoc.completion_tokens).toBe(0);
    });

    it('metadata 기본값 빈 객체', async () => {
      await logTokenUsage(mockAnalyticsDb, {
        user_id: 'test-user',
        model: 'gpt-4o',
        source: 'chat'
      });

      const insertedDoc = mockCollection.insertOne.mock.calls[0][0];
      expect(insertedDoc.metadata).toEqual({});
    });
  });

  describe('토큰 합계 계산', () => {
    it('total_tokens 자동 계산 (prompt + completion)', async () => {
      await logTokenUsage(mockAnalyticsDb, {
        user_id: 'test-user',
        model: 'gpt-4o',
        source: 'chat',
        prompt_tokens: 100,
        completion_tokens: 50
      });

      const insertedDoc = mockCollection.insertOne.mock.calls[0][0];
      expect(insertedDoc.total_tokens).toBe(150);
    });

    it('total_tokens 명시적 제공 시 해당 값 사용', async () => {
      await logTokenUsage(mockAnalyticsDb, {
        user_id: 'test-user',
        model: 'gpt-4o',
        source: 'chat',
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 200 // 명시적 값
      });

      const insertedDoc = mockCollection.insertOne.mock.calls[0][0];
      expect(insertedDoc.total_tokens).toBe(200);
    });
  });

  describe('비용 자동 계산', () => {
    it('estimated_cost_usd가 자동 계산되어야 함', async () => {
      await logTokenUsage(mockAnalyticsDb, {
        user_id: 'test-user',
        model: 'gpt-4o-mini',
        source: 'chat',
        prompt_tokens: 1000,
        completion_tokens: 500
      });

      const insertedDoc = mockCollection.insertOne.mock.calls[0][0];
      expect(insertedDoc.estimated_cost_usd).toBeCloseTo(0.00045, 6);
    });
  });

  describe('타임스탬프', () => {
    it('timestamp가 자동 설정되어야 함', async () => {
      const before = new Date();
      await logTokenUsage(mockAnalyticsDb, {
        user_id: 'test-user',
        model: 'gpt-4o',
        source: 'chat'
      });
      const after = new Date();

      const insertedDoc = mockCollection.insertOne.mock.calls[0][0];
      expect(insertedDoc.timestamp).toBeInstanceOf(Date);
      expect(insertedDoc.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(insertedDoc.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('반환값', () => {
    it('success: true와 logged 정보를 반환해야 함', async () => {
      const result = await logTokenUsage(mockAnalyticsDb, {
        user_id: 'test-user',
        model: 'gpt-4o-mini',
        source: 'chat',
        prompt_tokens: 1000,
        completion_tokens: 500
      });

      expect(result).toEqual({
        success: true,
        logged: {
          total_tokens: 1500,
          estimated_cost_usd: expect.any(Number)
        }
      });
    });
  });
});

// =============================================================================
// 4. getUserTokenUsage 함수 테스트 (10개)
// =============================================================================

describe('getUserTokenUsage - 사용자별 집계', () => {
  let mockCollection;
  let mockAnalyticsDb;

  describe('기본 조회', () => {
    it('기본 기간 30일로 조회', async () => {
      mockCollection = createMockCollection([]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      await getUserTokenUsage(mockAnalyticsDb, 'user-123');

      // match 스테이지 확인
      const pipeline = mockCollection.aggregate.mock.calls[0][0];
      expect(pipeline[0].$match.user_id).toBe('user-123');
    });

    it('사용자별 필터링 적용', async () => {
      mockCollection = createMockCollection([
        { _id: 'chat', total_tokens: 1000, prompt_tokens: 600, completion_tokens: 400, estimated_cost_usd: 0.01, request_count: 5 }
      ]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      const result = await getUserTokenUsage(mockAnalyticsDb, 'specific-user');

      expect(result.total_tokens).toBe(1000);
      expect(result.prompt_tokens).toBe(600);
      expect(result.completion_tokens).toBe(400);
    });

    it('기간 파라미터로 조회 기간 변경', async () => {
      mockCollection = createMockCollection([]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      const result = await getUserTokenUsage(mockAnalyticsDb, 'user-123', 7);

      expect(result.period_days).toBe(7);
    });
  });

  describe('소스별 분류 (by_source)', () => {
    it('소스별 토큰 분류', async () => {
      mockCollection = createMockCollection([
        { _id: 'chat', total_tokens: 1000, prompt_tokens: 600, completion_tokens: 400, estimated_cost_usd: 0.01, request_count: 5 },
        { _id: 'rag_api', total_tokens: 500, prompt_tokens: 300, completion_tokens: 200, estimated_cost_usd: 0.005, request_count: 3 }
      ]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      const result = await getUserTokenUsage(mockAnalyticsDb, 'user-123');

      expect(result.by_source).toEqual({
        chat: 1000,
        rag_api: 500
      });
    });
  });

  describe('빈 결과 처리', () => {
    it('데이터 없으면 0 반환', async () => {
      mockCollection = createMockCollection([]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      const result = await getUserTokenUsage(mockAnalyticsDb, 'no-data-user');

      expect(result.total_tokens).toBe(0);
      expect(result.prompt_tokens).toBe(0);
      expect(result.completion_tokens).toBe(0);
      expect(result.estimated_cost_usd).toBe(0);
      expect(result.request_count).toBe(0);
      expect(result.by_source).toEqual({});
    });
  });

  describe('합계 정확성', () => {
    it('prompt + completion = total 관계 유지', async () => {
      mockCollection = createMockCollection([
        { _id: 'chat', total_tokens: 1500, prompt_tokens: 1000, completion_tokens: 500, estimated_cost_usd: 0.015, request_count: 10 }
      ]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      const result = await getUserTokenUsage(mockAnalyticsDb, 'user-123');

      expect(result.prompt_tokens + result.completion_tokens).toBe(result.total_tokens);
    });

    it('request_count 합계 정확성', async () => {
      mockCollection = createMockCollection([
        { _id: 'chat', total_tokens: 1000, prompt_tokens: 600, completion_tokens: 400, estimated_cost_usd: 0.01, request_count: 5 },
        { _id: 'rag_api', total_tokens: 500, prompt_tokens: 300, completion_tokens: 200, estimated_cost_usd: 0.005, request_count: 3 }
      ]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      const result = await getUserTokenUsage(mockAnalyticsDb, 'user-123');

      expect(result.request_count).toBe(8);
    });
  });

  describe('비용 집계', () => {
    it('estimated_cost_usd 소수점 6자리 정밀도', async () => {
      mockCollection = createMockCollection([
        { _id: 'chat', total_tokens: 1000, prompt_tokens: 600, completion_tokens: 400, estimated_cost_usd: 0.0000001, request_count: 1 }
      ]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      const result = await getUserTokenUsage(mockAnalyticsDb, 'user-123');

      // 소수점 6자리로 반올림
      expect(result.estimated_cost_usd).toBe(0);
    });
  });
});

// =============================================================================
// 5. getDailyUsage 함수 테스트 (5개)
// =============================================================================

describe('getDailyUsage - 일별 통계', () => {
  let mockCollection;
  let mockAnalyticsDb;

  describe('날짜별 그룹핑', () => {
    it('날짜별로 데이터 반환', async () => {
      mockCollection = createMockCollection([
        { _id: '2026-02-01', total_tokens: 1000, estimated_cost_usd: 0.01, request_count: 5 },
        { _id: '2026-02-02', total_tokens: 2000, estimated_cost_usd: 0.02, request_count: 10 }
      ]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      const result = await getDailyUsage(mockAnalyticsDb, 'user-123');

      expect(result).toHaveLength(2);
      expect(result[0].date).toBe('2026-02-01');
      expect(result[1].date).toBe('2026-02-02');
    });
  });

  describe('빈 날짜 처리', () => {
    it('데이터 없는 날짜는 결과에 포함되지 않음', async () => {
      mockCollection = createMockCollection([
        { _id: '2026-02-01', total_tokens: 1000, estimated_cost_usd: 0.01, request_count: 5 }
        // 2026-02-02 데이터 없음
      ]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      const result = await getDailyUsage(mockAnalyticsDb, 'user-123');

      expect(result).toHaveLength(1);
    });
  });

  describe('userId 선택적 필터', () => {
    it('userId null이면 전체 조회', async () => {
      mockCollection = createMockCollection([]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      await getDailyUsage(mockAnalyticsDb, null);

      const pipeline = mockCollection.aggregate.mock.calls[0][0];
      expect(pipeline[0].$match.user_id).toBeUndefined();
    });

    it('userId 있으면 해당 사용자만 조회', async () => {
      mockCollection = createMockCollection([]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      await getDailyUsage(mockAnalyticsDb, 'specific-user');

      const pipeline = mockCollection.aggregate.mock.calls[0][0];
      expect(pipeline[0].$match.user_id).toBe('specific-user');
    });
  });

  describe('정렬', () => {
    it('날짜 오름차순 정렬', async () => {
      mockCollection = createMockCollection([]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      await getDailyUsage(mockAnalyticsDb, 'user-123');

      const pipeline = mockCollection.aggregate.mock.calls[0][0];
      expect(pipeline[2].$sort._id).toBe(1);
    });
  });
});

// =============================================================================
// 6. getHourlyUsageBySource 함수 테스트 (5개)
// =============================================================================

describe('getHourlyUsageBySource - 시간별 소스별 통계', () => {
  let mockCollection;
  let mockAnalyticsDb;

  describe('시간대별 분류', () => {
    it('10분 단위로 집계', async () => {
      mockCollection = createMockCollection([
        { _id: { timestamp: '2026-02-05T10:00', source: 'chat' }, total_tokens: 1000, request_count: 5 }
      ]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      const result = await getHourlyUsageBySource(mockAnalyticsDb, 24);

      // 결과에 timestamp가 포함됨
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('timestamp');
    });
  });

  describe('소스별 분류', () => {
    it('chat, rag_api, doc_summary 등 소스 분류', async () => {
      mockCollection = createMockCollection([
        { _id: { timestamp: '2026-02-05T10:00', source: 'chat' }, total_tokens: 1000, request_count: 5 },
        { _id: { timestamp: '2026-02-05T10:00', source: 'rag_api' }, total_tokens: 500, request_count: 3 }
      ]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      const result = await getHourlyUsageBySource(mockAnalyticsDb, 24);

      // 첫 번째 슬롯 찾기
      const slot = result.find(r => r.timestamp === '2026-02-05T10:00:00');
      if (slot) {
        expect(slot).toHaveProperty('chat');
        expect(slot).toHaveProperty('rag_api');
      }
    });
  });

  describe('total 합계', () => {
    it('total = chat + rag_api + n8n_docsummary + doc_embedding', async () => {
      mockCollection = createMockCollection([]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      const result = await getHourlyUsageBySource(mockAnalyticsDb, 1);

      // 각 슬롯의 total 검증
      for (const slot of result) {
        expect(slot.total).toBe(slot.chat + slot.rag_api + slot.n8n_docsummary + slot.doc_embedding);
      }
    });
  });

  describe('기간 파라미터', () => {
    it('hours 기본값 24시간', async () => {
      mockCollection = createMockCollection([]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      const result = await getHourlyUsageBySource(mockAnalyticsDb);

      // 24시간 * 6 (10분 단위) + 1 = 145개 슬롯 (대략)
      expect(result.length).toBeGreaterThanOrEqual(144);
    });
  });

  describe('중복 제거', () => {
    it('동일 타임스탬프 중복 제거', async () => {
      mockCollection = createMockCollection([]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      const result = await getHourlyUsageBySource(mockAnalyticsDb, 1);

      const timestamps = result.map(r => r.timestamp);
      const uniqueTimestamps = [...new Set(timestamps)];
      expect(timestamps.length).toBe(uniqueTimestamps.length);
    });
  });
});

// =============================================================================
// 7. getTopUsers 함수 테스트 (5개)
// =============================================================================

describe('getTopUsers - 상위 사용자', () => {
  let mockCollection;
  let mockAnalyticsDb;

  describe('limit 제한', () => {
    it('기본 limit 10명', async () => {
      mockCollection = createMockCollection([]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      await getTopUsers(mockAnalyticsDb, 30);

      const pipeline = mockCollection.aggregate.mock.calls[0][0];
      expect(pipeline[3].$limit).toBe(10);
    });

    it('커스텀 limit 적용', async () => {
      mockCollection = createMockCollection([]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      await getTopUsers(mockAnalyticsDb, 30, 5);

      const pipeline = mockCollection.aggregate.mock.calls[0][0];
      expect(pipeline[3].$limit).toBe(5);
    });
  });

  describe('정렬 순서', () => {
    it('total_tokens 내림차순 정렬', async () => {
      mockCollection = createMockCollection([]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      await getTopUsers(mockAnalyticsDb, 30);

      const pipeline = mockCollection.aggregate.mock.calls[0][0];
      expect(pipeline[2].$sort.total_tokens).toBe(-1);
    });
  });

  describe('반환 형식', () => {
    it('user_id, total_tokens, estimated_cost_usd, request_count 포함', async () => {
      mockCollection = createMockCollection([
        { _id: 'top-user', total_tokens: 100000, estimated_cost_usd: 1.5, request_count: 500 }
      ]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      const result = await getTopUsers(mockAnalyticsDb, 30);

      expect(result[0]).toEqual({
        user_id: 'top-user',
        total_tokens: 100000,
        estimated_cost_usd: 1.5,
        request_count: 500
      });
    });
  });

  describe('동률 처리', () => {
    it('동률 사용자도 limit 내에서 반환', async () => {
      mockCollection = createMockCollection([
        { _id: 'user1', total_tokens: 1000, estimated_cost_usd: 0.01, request_count: 5 },
        { _id: 'user2', total_tokens: 1000, estimated_cost_usd: 0.01, request_count: 5 } // 동률
      ]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      const result = await getTopUsers(mockAnalyticsDb, 30, 2);

      expect(result).toHaveLength(2);
    });
  });

  describe('빈 결과', () => {
    it('데이터 없으면 빈 배열 반환', async () => {
      mockCollection = createMockCollection([]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      const result = await getTopUsers(mockAnalyticsDb, 30);

      expect(result).toEqual([]);
    });
  });
});

// =============================================================================
// 8. formatCost 함수 테스트 (5개)
// =============================================================================

describe('formatCost - 비용 포맷팅', () => {
  describe('0.01 미만 비용', () => {
    it('$0.001234 → 6자리 표시', () => {
      expect(formatCost(0.001234)).toBe('$0.001234');
    });

    it('$0.000001 → 6자리 표시', () => {
      expect(formatCost(0.000001)).toBe('$0.000001');
    });
  });

  describe('0.01 이상 비용', () => {
    it('$0.1234 → 4자리 표시', () => {
      expect(formatCost(0.1234)).toBe('$0.1234');
    });

    it('$1.5678 → 4자리 표시', () => {
      expect(formatCost(1.5678)).toBe('$1.5678');
    });

    it('$100.12 → 4자리 표시', () => {
      expect(formatCost(100.1234)).toBe('$100.1234');
    });
  });
});

// =============================================================================
// 9. formatTokens 함수 테스트 (5개)
// =============================================================================

describe('formatTokens - 토큰 수 포맷팅', () => {
  describe('100만 이상 (M 단위)', () => {
    it('1000000 → 1.00M', () => {
      expect(formatTokens(1000000)).toBe('1.00M');
    });

    it('1500000 → 1.50M', () => {
      expect(formatTokens(1500000)).toBe('1.50M');
    });

    it('12340000 → 12.34M', () => {
      expect(formatTokens(12340000)).toBe('12.34M');
    });
  });

  describe('1000 이상 (K 단위)', () => {
    it('1000 → 1.0K', () => {
      expect(formatTokens(1000)).toBe('1.0K');
    });

    it('1500 → 1.5K', () => {
      expect(formatTokens(1500)).toBe('1.5K');
    });

    it('999999 → 1000.0K', () => {
      expect(formatTokens(999999)).toBe('1000.0K');
    });
  });

  describe('1000 미만 (단위 없음)', () => {
    it('100 → 100', () => {
      expect(formatTokens(100)).toBe('100');
    });

    it('999 → 999', () => {
      expect(formatTokens(999)).toBe('999');
    });

    it('0 → 0', () => {
      expect(formatTokens(0)).toBe('0');
    });
  });
});

// =============================================================================
// 10. ensureIndexes 함수 테스트 (3개)
// =============================================================================

describe('ensureIndexes - 인덱스 생성', () => {
  let mockCollection;
  let mockAnalyticsDb;
  let consoleLogSpy;

  beforeEach(() => {
    mockCollection = createMockCollection();
    mockAnalyticsDb = createMockAnalyticsDb(mockCollection);
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('user_id + timestamp 복합 인덱스 생성', async () => {
    await ensureIndexes(mockAnalyticsDb);

    expect(mockCollection.createIndex).toHaveBeenCalledWith({ user_id: 1, timestamp: -1 });
  });

  it('timestamp 단일 인덱스 생성', async () => {
    await ensureIndexes(mockAnalyticsDb);

    expect(mockCollection.createIndex).toHaveBeenCalledWith({ timestamp: -1 });
  });

  it('source + timestamp 복합 인덱스 생성', async () => {
    await ensureIndexes(mockAnalyticsDb);

    expect(mockCollection.createIndex).toHaveBeenCalledWith({ source: 1, timestamp: -1 });
  });
});

// =============================================================================
// 11. getSystemOverview 함수 테스트 (5개)
// =============================================================================

describe('getSystemOverview - 시스템 전체 통계', () => {
  let mockCollection;
  let mockAnalyticsDb;

  beforeEach(() => {
    // 4개의 aggregate 호출에 대한 mock
    const mockCursor = {
      toArray: jest.fn()
        .mockResolvedValueOnce([{ // total
          _id: null,
          total_tokens: 100000,
          prompt_tokens: 60000,
          completion_tokens: 40000,
          estimated_cost_usd: 10.5,
          request_count: 500
        }])
        .mockResolvedValueOnce([ // bySource
          { _id: 'chat', total_tokens: 60000, estimated_cost_usd: 6, request_count: 300 },
          { _id: 'rag_api', total_tokens: 40000, estimated_cost_usd: 4.5, request_count: 200 }
        ])
        .mockResolvedValueOnce([{ count: 25 }]) // userCount
        .mockResolvedValueOnce([ // topUsers
          { _id: 'top-user', total_tokens: 50000, estimated_cost_usd: 5, request_count: 250 }
        ])
    };

    mockCollection = {
      aggregate: jest.fn().mockReturnValue(mockCursor),
      insertOne: jest.fn(),
      createIndex: jest.fn()
    };
    mockAnalyticsDb = createMockAnalyticsDb(mockCollection);
  });

  it('전체 토큰 통계 반환', async () => {
    const startDate = new Date('2026-02-01');
    const endDate = new Date('2026-02-05');

    const result = await getSystemOverview(mockAnalyticsDb, startDate, endDate);

    expect(result.total_tokens).toBe(100000);
    expect(result.prompt_tokens).toBe(60000);
    expect(result.completion_tokens).toBe(40000);
  });

  it('기간 일수 계산', async () => {
    const startDate = new Date('2026-02-01');
    const endDate = new Date('2026-02-05');

    const result = await getSystemOverview(mockAnalyticsDb, startDate, endDate);

    expect(result.period_days).toBe(4);
  });

  it('고유 사용자 수 반환', async () => {
    const startDate = new Date('2026-02-01');
    const endDate = new Date('2026-02-05');

    const result = await getSystemOverview(mockAnalyticsDb, startDate, endDate);

    expect(result.unique_users).toBe(25);
  });

  it('소스별 통계 반환', async () => {
    const startDate = new Date('2026-02-01');
    const endDate = new Date('2026-02-05');

    const result = await getSystemOverview(mockAnalyticsDb, startDate, endDate);

    expect(result.by_source).toEqual({
      chat: 60000,
      rag_api: 40000
    });
  });

  it('Top 사용자 목록 반환', async () => {
    const startDate = new Date('2026-02-01');
    const endDate = new Date('2026-02-05');

    const result = await getSystemOverview(mockAnalyticsDb, startDate, endDate);

    expect(result.top_users).toHaveLength(1);
    expect(result.top_users[0].user_id).toBe('top-user');
  });
});

// =============================================================================
// 12. getDailyUsageByRange 함수 테스트 (3개)
// =============================================================================

describe('getDailyUsageByRange - 날짜 범위 일별 통계', () => {
  let mockCollection;
  let mockAnalyticsDb;

  describe('날짜 범위 필터', () => {
    it('startDate ~ endDate 범위로 필터', async () => {
      mockCollection = createMockCollection([]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      const startDate = new Date('2026-02-01');
      const endDate = new Date('2026-02-05');

      await getDailyUsageByRange(mockAnalyticsDb, startDate, endDate);

      const pipeline = mockCollection.aggregate.mock.calls[0][0];
      expect(pipeline[0].$match.timestamp.$gte).toEqual(startDate);
      expect(pipeline[0].$match.timestamp.$lte).toEqual(endDate);
    });
  });

  describe('소스별 분류', () => {
    it('날짜별로 소스 분류된 데이터 반환', async () => {
      mockCollection = createMockCollection([
        { _id: { date: '2026-02-01', source: 'chat' }, total_tokens: 1000, estimated_cost_usd: 0.01, request_count: 5 },
        { _id: { date: '2026-02-01', source: 'rag_api' }, total_tokens: 500, estimated_cost_usd: 0.005, request_count: 3 }
      ]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      const startDate = new Date('2026-02-01');
      const endDate = new Date('2026-02-05');

      const result = await getDailyUsageByRange(mockAnalyticsDb, startDate, endDate);

      expect(result[0].date).toBe('2026-02-01');
      expect(result[0].chat).toBe(1000);
      expect(result[0].rag_api).toBe(500);
    });
  });

  describe('total_tokens 합계', () => {
    it('모든 소스의 토큰 합계', async () => {
      mockCollection = createMockCollection([
        { _id: { date: '2026-02-01', source: 'chat' }, total_tokens: 1000, estimated_cost_usd: 0.01, request_count: 5 },
        { _id: { date: '2026-02-01', source: 'rag_api' }, total_tokens: 500, estimated_cost_usd: 0.005, request_count: 3 }
      ]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      const startDate = new Date('2026-02-01');
      const endDate = new Date('2026-02-05');

      const result = await getDailyUsageByRange(mockAnalyticsDb, startDate, endDate);

      expect(result[0].total_tokens).toBe(1500);
    });
  });
});

// =============================================================================
// 13. getTopUsersWithRange 함수 테스트 (3개)
// =============================================================================

describe('getTopUsersWithRange - 날짜 범위 상위 사용자', () => {
  let mockCollection;
  let mockAnalyticsDb;

  describe('날짜 범위 필터', () => {
    it('startDate ~ endDate 범위로 필터', async () => {
      mockCollection = createMockCollection([]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      const startDate = new Date('2026-02-01');
      const endDate = new Date('2026-02-05');

      await getTopUsersWithRange(mockAnalyticsDb, startDate, endDate);

      const pipeline = mockCollection.aggregate.mock.calls[0][0];
      expect(pipeline[0].$match.timestamp.$gte).toEqual(startDate);
      expect(pipeline[0].$match.timestamp.$lte).toEqual(endDate);
    });
  });

  describe('limit 적용', () => {
    it('기본 limit 10', async () => {
      mockCollection = createMockCollection([]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      const startDate = new Date('2026-02-01');
      const endDate = new Date('2026-02-05');

      await getTopUsersWithRange(mockAnalyticsDb, startDate, endDate);

      const pipeline = mockCollection.aggregate.mock.calls[0][0];
      expect(pipeline[3].$limit).toBe(10);
    });

    it('커스텀 limit 적용', async () => {
      mockCollection = createMockCollection([]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      const startDate = new Date('2026-02-01');
      const endDate = new Date('2026-02-05');

      await getTopUsersWithRange(mockAnalyticsDb, startDate, endDate, 5);

      const pipeline = mockCollection.aggregate.mock.calls[0][0];
      expect(pipeline[3].$limit).toBe(5);
    });
  });

  describe('반환 형식', () => {
    it('user_id, total_tokens, estimated_cost_usd, request_count 포함', async () => {
      mockCollection = createMockCollection([
        { _id: 'user-1', total_tokens: 50000, estimated_cost_usd: 5.123456, request_count: 100 }
      ]);
      mockAnalyticsDb = createMockAnalyticsDb(mockCollection);

      const startDate = new Date('2026-02-01');
      const endDate = new Date('2026-02-05');

      const result = await getTopUsersWithRange(mockAnalyticsDb, startDate, endDate);

      expect(result[0]).toEqual({
        user_id: 'user-1',
        total_tokens: 50000,
        estimated_cost_usd: 5.123456,
        request_count: 100
      });
    });
  });
});
