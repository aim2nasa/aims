/**
 * SearchService 고객 표시 기능 테스트
 *
 * e953cd4c 커밋 관련:
 * - 문서 검색 결과에서 연결된 고객이 표시되지 않는 버그 수정
 * - customer_relation 필드가 검색 결과에 포함되어야 함
 *
 * @since 2025-11-28
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SearchService } from '../searchService';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    clear: () => {
      store = {};
    },
  };
})();

describe('SearchService - 고객 표시 기능 (e953cd4c)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    localStorageMock.clear();
    Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('시맨틱 검색 결과에 customer_relation이 포함되어야 한다', async () => {
    // 유효한 MongoDB ObjectId 사용 (24자리 16진수)
    const validCustomerId = '507f1f77bcf86cd799439011';

    const mockSearchResponse = {
      search_results: [
        {
          id: 'semantic1',
          score: 0.95,
          payload: {
            doc_id: 'doc123',
            original_name: 'test.pdf',
            owner_id: 'tester'
          }
        }
      ],
      answer: 'AI 답변'
    };

    const mockMongoDBResponse = {
      success: true,
      data: {
        raw: {
          meta: { summary: 'Test summary' },
          ocr: null,
          customer_relation: {
            customer_id: validCustomerId,
            customer_name: '홍길동',  // customer_name 포함하여 추가 API 호출 방지
            linked_at: '2025-11-01T00:00:00Z'
          }
        },
        computed: {
          overallStatus: 'completed'
        }
      }
    };

    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResponse
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockMongoDBResponse
      } as Response);

    const result = await SearchService.searchDocuments({
      query: '테스트',
      search_mode: 'semantic'
    });

    // customer_relation이 결과에 포함되어야 함
    expect((result.search_results[0] as any).customer_relation).toEqual({
      customer_id: validCustomerId,
      customer_name: '홍길동',
      linked_at: '2025-11-01T00:00:00Z'
    });
  });

  it('customer_relation이 null인 문서도 정상 처리된다', async () => {
    const mockSearchResponse = {
      search_results: [
        {
          id: 'semantic1',
          score: 0.9,
          payload: { doc_id: 'doc123' }
        }
      ]
    };

    const mockMongoDBResponse = {
      success: true,
      data: {
        raw: {
          meta: {},
          ocr: null,
          customer_relation: null  // 고객 연결 없음
        },
        computed: { overallStatus: 'pending' }
      }
    };

    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResponse
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockMongoDBResponse
      } as Response);

    const result = await SearchService.searchDocuments({
      query: '테스트',
      search_mode: 'semantic'
    });

    // customer_relation이 null이어도 정상 처리
    expect((result.search_results[0] as any).customer_relation).toBeNull();
  });

  it('여러 문서의 customer_relation이 각각 올바르게 반환된다', async () => {
    const mockSearchResponse = {
      search_results: [
        { id: 's1', score: 0.95, payload: { doc_id: 'doc1' } },
        { id: 's2', score: 0.9, payload: { doc_id: 'doc2' } }
      ]
    };

    // 각 문서에 대한 MongoDB 응답
    const mockResponse1 = {
      success: true,
      data: {
        raw: {
          meta: {},
          customer_relation: { customer_id: 'customerA' }
        },
        computed: { overallStatus: 'completed' }
      }
    };

    const mockResponse2 = {
      success: true,
      data: {
        raw: {
          meta: {},
          customer_relation: { customer_id: 'customerB' }
        },
        computed: { overallStatus: 'completed' }
      }
    };

    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResponse
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse1
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse2
      } as Response);

    const result = await SearchService.searchDocuments({
      query: '테스트',
      search_mode: 'semantic'
    });

    // 각 문서의 customer_relation이 올바르게 매핑됨
    expect((result.search_results[0] as any).customer_relation.customer_id).toBe('customerA');
    expect((result.search_results[1] as any).customer_relation.customer_id).toBe('customerB');
  });

  it('고객이 연결된 문서와 미연결 문서가 섞여있어도 정상 처리된다', async () => {
    // 유효한 MongoDB ObjectId 사용 (24자리 16진수)
    const validCustomerId = '507f1f77bcf86cd799439022';

    const mockSearchResponse = {
      search_results: [
        { id: 's1', score: 0.95, payload: { doc_id: 'doc1' } },
        { id: 's2', score: 0.9, payload: { doc_id: 'doc2' } },
        { id: 's3', score: 0.85, payload: { doc_id: 'doc3' } }
      ]
    };

    const mockResponseWithCustomer = {
      success: true,
      data: {
        raw: {
          meta: {},
          customer_relation: {
            customer_id: validCustomerId,
            customer_name: '김영희',  // customer_name 포함하여 추가 API 호출 방지
            linked_at: '2025-01-01T00:00:00Z'
          }
        },
        computed: { overallStatus: 'completed' }
      }
    };

    const mockResponseWithoutCustomer = {
      success: true,
      data: {
        raw: {
          meta: {},
          customer_relation: null
        },
        computed: { overallStatus: 'pending' }
      }
    };

    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResponse
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponseWithCustomer
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponseWithoutCustomer
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponseWithCustomer
      } as Response);

    const result = await SearchService.searchDocuments({
      query: '테스트',
      search_mode: 'semantic'
    });

    // 첫 번째: 고객 연결됨
    expect((result.search_results[0] as any).customer_relation).toEqual({
      customer_id: validCustomerId,
      customer_name: '김영희',
      linked_at: '2025-01-01T00:00:00Z'
    });

    // 두 번째: 고객 미연결
    expect((result.search_results[1] as any).customer_relation).toBeNull();

    // 세 번째: 고객 연결됨
    expect((result.search_results[2] as any).customer_relation).toEqual({
      customer_id: validCustomerId,
      customer_name: '김영희',
      linked_at: '2025-01-01T00:00:00Z'
    });
  });
});


describe('SearchService - 키워드 검색 customer_relation (N+1 제거)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    localStorageMock.clear();
    Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('키워드 검색 결과에 백엔드가 반환한 customer_relation이 그대로 전달된다', async () => {
    const mockSearchResponse = {
      search_results: [
        {
          _id: 'doc1',
          upload: { originalName: 'test.pdf' },
          customer_relation: {
            customer_id: '507f1f77bcf86cd799439011',
            customer_name: '홍길동',
            customer_type: '개인'
          }
        },
        {
          _id: 'doc2',
          upload: { originalName: 'test2.pdf' },
          customer_relation: {
            customer_id: '507f1f77bcf86cd799439012',
            customer_name: '김영희',
            customer_type: '법인'
          }
        }
      ],
      search_mode: 'keyword'
    };

    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResponse
      } as Response);

    const result = await SearchService.searchDocuments({
      query: '테스트',
      search_mode: 'keyword',
      mode: 'AND'
    });

    // 백엔드에서 반환한 customer_relation이 그대로 전달됨
    expect((result.search_results[0] as any).customer_relation).toEqual({
      customer_id: '507f1f77bcf86cd799439011',
      customer_name: '홍길동',
      customer_type: '개인'
    });
    expect((result.search_results[1] as any).customer_relation).toEqual({
      customer_id: '507f1f77bcf86cd799439012',
      customer_name: '김영희',
      customer_type: '법인'
    });

    // N+1 개별 API 호출이 없어야 함 (RAG API 호출 1건만)
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('키워드 검색 결과에 customer_name이 null인 경우에도 정상 반환된다', async () => {
    const mockSearchResponse = {
      search_results: [
        {
          _id: 'doc1',
          upload: { originalName: 'test.pdf' },
          customer_relation: {
            customer_id: '507f1f77bcf86cd799439011',
            customer_name: null,
            customer_type: null
          }
        }
      ],
      search_mode: 'keyword'
    };

    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResponse
      } as Response);

    const result = await SearchService.searchDocuments({
      query: '테스트',
      search_mode: 'keyword'
    });

    // customer_name이 null이어도 customer_relation은 반환됨
    expect((result.search_results[0] as any).customer_relation.customer_id).toBe('507f1f77bcf86cd799439011');
    expect((result.search_results[0] as any).customer_relation.customer_name).toBeNull();

    // 추가 API 호출 없음
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('키워드 검색 결과에 "내 보관함" (플레이스홀더 ID)이 포함되면 정상 처리된다', async () => {
    const mockSearchResponse = {
      search_results: [
        {
          _id: 'doc1',
          upload: { originalName: 'my-file.pdf' },
          customer_relation: {
            customer_id: '000000000000000000000001',
            customer_name: '내 보관함',
            customer_type: '__MY_STORAGE__'
          }
        }
      ],
      search_mode: 'keyword'
    };

    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResponse
      } as Response);

    const result = await SearchService.searchDocuments({
      query: '테스트',
      search_mode: 'keyword'
    });

    // "내 보관함" 처리가 백엔드에서 완료됨
    expect((result.search_results[0] as any).customer_relation.customer_name).toBe('내 보관함');
    expect((result.search_results[0] as any).customer_relation.customer_type).toBe('__MY_STORAGE__');

    // 추가 API 호출 없음
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('키워드 검색 시 customer_relation 없는 결과도 정상 반환된다', async () => {
    const mockSearchResponse = {
      search_results: [
        {
          _id: 'doc1',
          upload: { originalName: 'orphan.pdf' }
          // customer_relation 없음 (customerId 없는 문서)
        }
      ],
      search_mode: 'keyword'
    };

    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResponse
      } as Response);

    const result = await SearchService.searchDocuments({
      query: '테스트',
      search_mode: 'keyword'
    });

    // customer_relation이 없어도 결과 반환
    expect(result.search_results).toHaveLength(1);
    expect((result.search_results[0] as any).customer_relation).toBeUndefined();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('키워드 검색 시 2000+ 결과에도 개별 API 호출이 발생하지 않는다', async () => {
    // 대량 결과 시뮬레이션
    const largeResults = Array.from({ length: 2000 }, (_, i) => ({
      _id: `doc${i}`,
      upload: { originalName: `file${i}.pdf` },
      customer_relation: {
        customer_id: `507f1f77bcf86cd79943${String(i % 100).padStart(4, '0')}`,
        customer_name: `고객${i % 100}`,
        customer_type: '개인'
      }
    }));

    const mockSearchResponse = {
      search_results: largeResults,
      search_mode: 'keyword'
    };

    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResponse
      } as Response);

    const result = await SearchService.searchDocuments({
      query: '테스트',
      search_mode: 'keyword'
    });

    // 2000개 결과 모두 반환
    expect(result.search_results).toHaveLength(2000);
    // RAG API 호출 1건만 (N+1 없음!)
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
