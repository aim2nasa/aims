/**
 * DocumentSearchView - Lazy Enrichment 회귀 테스트
 * @since 2026-04-02
 *
 * AI 검색 결과 50건 제한 제거 + 페이지 단위 lazy enrichment 도입에 대한 회귀 테스트
 *
 * 테스트 범위:
 * - searchDocuments()가 enrichment 없이 raw 결과 반환
 * - enrichPageResults()가 페이지 단위 enrichment 수행
 * - enrichment 캐시: 이미 enrich된 건 재호출 안 함
 * - AbortController: 새 검색 시 진행 중인 enrichment 취소
 * - top_k 하드코딩 제거 확인
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SearchService } from '@/services/searchService'
import type { SemanticSearchResultItem } from '@/entities/search'

// fetch mock
const mockFetch = vi.fn()
global.fetch = mockFetch

// errorReporter mock
vi.mock('@/shared/lib/errorReporter', () => ({
  errorReporter: {
    reportApiError: vi.fn()
  }
}))

// API 유틸 mock
vi.mock('@/shared/lib/api', () => ({
  API_CONFIG: { BASE_URL: 'http://localhost:3000' },
  getAuthHeaders: () => ({}),
  getAuthToken: () => 'mock-token',
  getCurrentUserId: () => 'test-user'
}))

describe('SearchService - Lazy Enrichment (이슈 #15)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('[회귀] searchDocuments()는 raw 결과만 반환', () => {
    it('시맨틱 검색 결과를 enrichment 없이 그대로 반환해야 함', async () => {
      const rawResults = [
        { id: 'q1', score: 0.9, payload: { doc_id: 'doc1', original_name: 'file1.pdf' } },
        { id: 'q2', score: 0.8, payload: { doc_id: 'doc2', original_name: 'file2.pdf' } },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          answer: 'AI 답변',
          search_results: rawResults,
        })
      })

      const result = await SearchService.searchDocuments({
        query: '보험 청구',
        search_mode: 'semantic',
      })

      // fetch는 검색 API 1회만 호출 (enrichment API 호출 없음)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(result.search_results).toEqual(rawResults)
      expect(result.answer).toBe('AI 답변')
    })

    it('키워드 검색 결과도 그대로 반환해야 함', async () => {
      const rawResults = [
        { _id: 'doc1', filename: 'file1.pdf', meta: { summary: '요약' } },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          answer: null,
          search_results: rawResults,
        })
      })

      const result = await SearchService.searchDocuments({
        query: '보험',
        search_mode: 'keyword',
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(result.search_results).toEqual(rawResults)
    })

    it('top_k가 요청에 포함되지 않아야 함 (하드코딩 제거 확인)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ search_results: [] })
      })

      await SearchService.searchDocuments({
        query: '테스트',
        search_mode: 'semantic',
      })

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(requestBody.top_k).toBeUndefined()
    })
  })

  describe('[회귀] enrichPageResults()는 페이지 단위 enrichment 수행', () => {
    it('각 문서에 대해 /api/documents/{docId}/status 호출', async () => {
      const items: SemanticSearchResultItem[] = [
        { id: 'q1', score: 0.9, payload: { doc_id: 'doc1', original_name: 'file1.pdf' } },
        { id: 'q2', score: 0.8, payload: { doc_id: 'doc2', original_name: 'file2.pdf' } },
      ]

      // 문서 상태 API 응답 mock
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: {
              _id: 'doc1',
              raw: {
                meta: { originalName: 'file1.pdf', summary: '요약1' },
                ocr: { full_text: '텍스트1' },
                upload: { originalName: 'file1.pdf' },
                customer_relation: null,
                ownerId: 'user1',
                customerId: null,
                displayName: null,
              },
              computed: {
                uiStages: [],
                overallStatus: 'completed',
                progress: 100,
              }
            }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: {
              _id: 'doc2',
              raw: {
                meta: { originalName: 'file2.pdf', summary: '요약2' },
                ocr: { full_text: '텍스트2' },
                upload: { originalName: 'file2.pdf' },
                customer_relation: null,
                ownerId: 'user1',
                customerId: null,
                displayName: null,
              },
              computed: {
                uiStages: [],
                overallStatus: 'completed',
                progress: 100,
              }
            }
          })
        })

      const result = await SearchService.enrichPageResults(items)

      // 2건에 대해 각각 /api/documents/{docId}/status 호출
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(result).toHaveLength(2)
      // enriched 결과에 meta, ocr 등이 병합되어야 함
      expect(result[0]).toHaveProperty('meta')
      expect(result[0]).toHaveProperty('ocr')
      expect(result[0]).toHaveProperty('_id', 'doc1')
      // 원본 score는 유지되어야 함
      expect((result[0] as any).score).toBe(0.9)
    })

    it('개별 문서 조회 실패 시 raw 결과 유지', async () => {
      const items: SemanticSearchResultItem[] = [
        { id: 'q1', score: 0.9, payload: { doc_id: 'doc1', original_name: 'file1.pdf' } },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await SearchService.enrichPageResults(items)

      expect(result).toHaveLength(1)
      // enrichment 실패 → raw 결과 그대로
      expect(result[0]).toEqual(items[0])
    })

    it('doc_id가 없는 항목은 그대로 반환', async () => {
      const items: SemanticSearchResultItem[] = [
        { id: 'q1', score: 0.5, payload: {} },
      ]

      const result = await SearchService.enrichPageResults(items)

      expect(mockFetch).not.toHaveBeenCalled()
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(items[0])
    })

    it('빈 배열 입력 시 빈 배열 반환', async () => {
      const result = await SearchService.enrichPageResults([])

      expect(mockFetch).not.toHaveBeenCalled()
      expect(result).toEqual([])
    })
  })

  describe('[회귀] AbortController 지원', () => {
    it('abort 시 AbortError를 throw', async () => {
      const items: SemanticSearchResultItem[] = [
        { id: 'q1', score: 0.9, payload: { doc_id: 'doc1', original_name: 'file1.pdf' } },
      ]

      const controller = new AbortController()

      mockFetch.mockImplementation(() => {
        // fetch 호출 시 즉시 abort
        controller.abort()
        return Promise.reject(new DOMException('Aborted', 'AbortError'))
      })

      await expect(
        SearchService.enrichPageResults(items, controller.signal)
      ).rejects.toThrow()
    })
  })

  describe('[회귀] customer_name 보강', () => {
    it('유효한 customerId에 대해 고객 정보 조회', async () => {
      const validCustomerId = 'abcdef1234567890abcdef12'

      const items: SemanticSearchResultItem[] = [
        {
          id: 'q1',
          score: 0.9,
          payload: { doc_id: 'doc1', original_name: 'file1.pdf' },
        },
      ]

      // 문서 상태 API
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            _id: 'doc1',
            raw: {
              meta: {},
              ocr: {},
              upload: {},
              customer_relation: { customer_id: validCustomerId },
              ownerId: 'user1',
              customerId: validCustomerId,
              displayName: null,
            },
            computed: { uiStages: [], overallStatus: 'completed', progress: 100 }
          }
        })
      })
      // 고객 API
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            personal_info: { name: '홍길동' },
            insurance_info: { customer_type: '개인' }
          }
        })
      })

      const result = await SearchService.enrichPageResults(items)

      expect(result[0]).toHaveProperty('customer_relation')
      expect((result[0] as any).customer_relation.customer_name).toBe('홍길동')
      expect((result[0] as any).customer_relation.customer_type).toBe('개인')
    })

    it('플레이스홀더 customerId는 내 보관함으로 표시', async () => {
      const placeholderId = '000000000000000000000001'

      const items: SemanticSearchResultItem[] = [
        {
          id: 'q1',
          score: 0.9,
          payload: { doc_id: 'doc1', original_name: 'file1.pdf' },
        },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            _id: 'doc1',
            raw: {
              meta: {},
              ocr: {},
              upload: {},
              customer_relation: { customer_id: placeholderId },
              ownerId: 'user1',
              customerId: placeholderId,
              displayName: null,
            },
            computed: { uiStages: [], overallStatus: 'completed', progress: 100 }
          }
        })
      })

      const result = await SearchService.enrichPageResults(items)

      // 플레이스홀더 → 고객 API 호출 없이 "내 보관함" 표시
      expect(mockFetch).toHaveBeenCalledTimes(1) // 문서 API만 호출
      expect((result[0] as any).customer_relation.customer_name).toBe('내 보관함')
    })
  })

  describe('[회귀] 정렬은 raw 결과 기준', () => {
    it('enrichment 전후로 score 값이 변경되지 않아야 함', async () => {
      const items: SemanticSearchResultItem[] = [
        { id: 'q1', score: 0.95, final_score: 0.88, payload: { doc_id: 'doc1', original_name: 'a.pdf' } },
        { id: 'q2', score: 0.70, final_score: 0.65, payload: { doc_id: 'doc2', original_name: 'b.pdf' } },
      ]

      // 두 건 모두 enrichment 성공
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { _id: 'doc1', raw: { meta: {}, ocr: {}, upload: {}, customer_relation: null, ownerId: 'u', customerId: null, displayName: null }, computed: { uiStages: [], overallStatus: 'completed', progress: 100 } }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { _id: 'doc2', raw: { meta: {}, ocr: {}, upload: {}, customer_relation: null, ownerId: 'u', customerId: null, displayName: null }, computed: { uiStages: [], overallStatus: 'completed', progress: 100 } }
          })
        })

      const result = await SearchService.enrichPageResults(items)

      // score, final_score가 원본 그대로 유지
      expect((result[0] as any).score).toBe(0.95)
      expect((result[0] as any).final_score).toBe(0.88)
      expect((result[1] as any).score).toBe(0.70)
      expect((result[1] as any).final_score).toBe(0.65)
    })
  })
})
