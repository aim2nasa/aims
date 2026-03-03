/**
 * useDocumentSearch 훅 테스트
 * @since 1.0.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import React from 'react'
import { DocumentSearchProvider } from '../DocumentSearchProvider'
import { useDocumentSearch } from '../useDocumentSearch'
import { SearchService } from '@/services/searchService'
import type { SearchResultItem, SemanticSearchResultItem } from '@/entities/search'

// Mock SearchService
vi.mock('@/services/searchService', () => ({
  SearchService: {
    searchDocuments: vi.fn()
  }
}))

describe('useDocumentSearch', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <DocumentSearchProvider>{children}</DocumentSearchProvider>
  )

  beforeEach(() => {
    vi.clearAllMocks()
    // persistent state 초기화 (usePersistedState는 sessionStorage 사용)
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // persistent state 정리
    sessionStorage.clear()
  })

  describe('초기 상태', () => {
    it('초기값이 올바르게 설정되어야 함', () => {
      const { result } = renderHook(() => useDocumentSearch(), { wrapper })

      expect(result.current.query).toBe('')
      expect(result.current.searchMode).toBe('keyword')
      expect(result.current.keywordMode).toBe('AND')
      expect(result.current.results).toEqual([])
      expect(result.current.answer).toBeNull()
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeNull()
      expect(result.current.lastSearchMode).toBeNull()
    })

    it('액션 핸들러가 제공되어야 함', () => {
      const { result } = renderHook(() => useDocumentSearch(), { wrapper })

      expect(typeof result.current.handleSearch).toBe('function')
      expect(typeof result.current.handleQueryChange).toBe('function')
      expect(typeof result.current.handleSearchModeChange).toBe('function')
      expect(typeof result.current.handleKeywordModeChange).toBe('function')
      expect(typeof result.current.handleReset).toBe('function')
    })
  })

  describe('Provider 없이 사용 시 에러', () => {
    it('Provider 없이 사용하면 에러를 던져야 함', () => {
      // Suppress console.error for this test
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        renderHook(() => useDocumentSearch())
      }).toThrow('useDocumentSearch must be used within DocumentSearchProvider')

      consoleError.mockRestore()
    })
  })

  describe('handleQueryChange', () => {
    it('검색어를 업데이트해야 함', () => {
      const { result } = renderHook(() => useDocumentSearch(), { wrapper })

      act(() => {
        result.current.handleQueryChange('테스트 검색어')
      })

      expect(result.current.query).toBe('테스트 검색어')
    })

    it('검색어 변경시 에러를 초기화해야 함', () => {
      const { result } = renderHook(() => useDocumentSearch(), { wrapper })

      // 먼저 에러 상태 만들기 (빈 검색어로 검색 시도)
      act(() => {
        result.current.handleSearch()
      })

      expect(result.current.error).not.toBeNull()

      // 검색어 변경
      act(() => {
        result.current.handleQueryChange('새 검색어')
      })

      expect(result.current.error).toBeNull()
    })
  })

  describe('handleSearchModeChange', () => {
    it('검색 모드를 변경해야 함', () => {
      const { result } = renderHook(() => useDocumentSearch(), { wrapper })

      act(() => {
        result.current.handleSearchModeChange('semantic')
      })

      expect(result.current.searchMode).toBe('semantic')
    })

    it('검색 모드 변경시 에러를 초기화해야 함', () => {
      const { result } = renderHook(() => useDocumentSearch(), { wrapper })

      // 에러 상태 만들기
      act(() => {
        result.current.handleSearch()
      })

      expect(result.current.error).not.toBeNull()

      // 검색 모드 변경
      act(() => {
        result.current.handleSearchModeChange('semantic')
      })

      expect(result.current.error).toBeNull()
    })
  })

  describe('handleKeywordModeChange', () => {
    it('키워드 모드를 변경해야 함', () => {
      const { result } = renderHook(() => useDocumentSearch(), { wrapper })

      act(() => {
        result.current.handleKeywordModeChange('OR')
      })

      expect(result.current.keywordMode).toBe('OR')
    })
  })

  describe('handleReset', () => {
    it('모든 상태를 초기화해야 함', () => {
      const { result } = renderHook(() => useDocumentSearch(), { wrapper })

      // 상태 설정
      act(() => {
        result.current.handleQueryChange('검색어')
        result.current.handleSearchModeChange('semantic')
        result.current.handleKeywordModeChange('OR')
      })

      // 리셋
      act(() => {
        result.current.handleReset()
      })

      expect(result.current.query).toBe('')
      expect(result.current.results).toEqual([])
      expect(result.current.answer).toBeNull()
      expect(result.current.error).toBeNull()
      expect(result.current.lastSearchMode).toBeNull()
      // searchMode와 keywordMode는 리셋되지 않음 (의도된 동작)
    })
  })

  describe('handleSearch - 성공 케이스', () => {
    it('키워드 검색을 성공적으로 수행해야 함', async () => {
      const mockResults: SearchResultItem[] = [
        {
          _id: '1',
          upload: {
            originalName: 'test.pdf',
            destPath: '/path/to/file.pdf'
          }
        }
      ]

      const mockResponse = {
        search_results: mockResults,
        answer: '검색 결과 답변',
        search_mode: 'keyword' as const
      }

      vi.mocked(SearchService.searchDocuments).mockResolvedValueOnce(mockResponse)

      const { result } = renderHook(() => useDocumentSearch(), { wrapper })

      act(() => {
        result.current.handleQueryChange('테스트')
      })

      await act(async () => {
        await result.current.handleSearch()
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(SearchService.searchDocuments).toHaveBeenCalledWith({
        query: '테스트',
        search_mode: 'keyword',
        mode: 'AND'
      })
      expect(result.current.results).toEqual(mockResults)
      expect(result.current.answer).toBe('검색 결과 답변')
      expect(result.current.lastSearchMode).toBe('keyword')
      expect(result.current.error).toBeNull()
    })

    it('시맨틱 검색을 성공적으로 수행해야 함 (mode 파라미터 제외)', async () => {
      const mockResults: SearchResultItem[] = [
        {
          id: '2',
          score: 0.88,
          payload: {
            original_name: 'doc.pdf',
            dest_path: '/path/to/doc.pdf'
          }
        }
      ]

      const mockResponse = {
        search_results: mockResults,
        search_mode: 'semantic' as const
      }

      vi.mocked(SearchService.searchDocuments).mockResolvedValueOnce(mockResponse)

      const { result } = renderHook(() => useDocumentSearch(), { wrapper })

      act(() => {
        result.current.handleQueryChange('시맨틱 검색')
        result.current.handleSearchModeChange('semantic')
      })

      await act(async () => {
        await result.current.handleSearch()
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // semantic 모드에서는 mode 파라미터가 포함되지 않고, top_k가 포함됨
      expect(SearchService.searchDocuments).toHaveBeenCalledWith({
        query: '시맨틱 검색',
        search_mode: 'semantic',
        top_k: 10
      })
      expect(result.current.results).toEqual(mockResults)
      expect(result.current.answer).toBeNull()
      expect(result.current.lastSearchMode).toBe('semantic')
    })

    it('검색어를 trim 처리해야 함', async () => {
      const mockResponse = {
        search_results: [],
        search_mode: 'keyword' as const
      }

      vi.mocked(SearchService.searchDocuments).mockResolvedValueOnce(mockResponse)

      const { result } = renderHook(() => useDocumentSearch(), { wrapper })

      act(() => {
        result.current.handleQueryChange('  공백 포함  ')
      })

      await act(async () => {
        await result.current.handleSearch()
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(SearchService.searchDocuments).toHaveBeenCalledWith({
        query: '공백 포함',
        search_mode: 'keyword',
        mode: 'AND'
      })
    })

    it('검색 전 이전 결과를 초기화해야 함', async () => {
      const mockResponse1 = {
        search_results: [
          {
            id: '1',
            score: 0.9,
            payload: {
              original_name: 'doc1.pdf',
              dest_path: '/path1.pdf'
            }
          }
        ],
        answer: '답변1',
        search_mode: 'semantic' as const
      }

      const mockResponse2 = {
        search_results: [
          {
            id: '2',
            score: 0.8,
            payload: {
              original_name: 'doc2.pdf',
              dest_path: '/path2.pdf'
            }
          }
        ],
        answer: '답변2',
        search_mode: 'semantic' as const
      }

      vi.mocked(SearchService.searchDocuments)
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2)

      const { result } = renderHook(() => useDocumentSearch(), { wrapper })

      // 첫 번째 검색
      act(() => {
        result.current.handleQueryChange('첫 검색')
      })

      await act(async () => {
        await result.current.handleSearch()
      })

      await waitFor(() => {
        expect(result.current.results).toHaveLength(1)
      })

      // 두 번째 검색 - 이전 결과가 초기화되어야 함
      act(() => {
        result.current.handleQueryChange('두 번째 검색')
      })

      await act(async () => {
        await result.current.handleSearch()
      })

      await waitFor(() => {
        expect(result.current.results).toHaveLength(1)
        expect(result.current.answer).toBe('답변2')
      })

      // 시맨틱 검색 결과이므로 id로 확인
      const secondResult = result.current.results[0] as SemanticSearchResultItem
      expect(secondResult.id).toBe('2')
    })
  })

  describe('handleSearch - 에러 케이스', () => {
    it('빈 검색어로 검색 시 에러를 설정해야 함', async () => {
      const { result } = renderHook(() => useDocumentSearch(), { wrapper })

      await act(async () => {
        await result.current.handleSearch()
      })

      expect(result.current.error).toBe('검색어를 입력해 주세요.')
      expect(SearchService.searchDocuments).not.toHaveBeenCalled()
    })

    it('공백만 있는 검색어로 검색 시 에러를 설정해야 함', async () => {
      const { result } = renderHook(() => useDocumentSearch(), { wrapper })

      act(() => {
        result.current.handleQueryChange('   ')
      })

      await act(async () => {
        await result.current.handleSearch()
      })

      expect(result.current.error).toBe('검색어를 입력해 주세요.')
      expect(SearchService.searchDocuments).not.toHaveBeenCalled()
    })

    it('API 호출 실패 시 에러를 처리해야 함', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      vi.mocked(SearchService.searchDocuments).mockRejectedValueOnce(
        new Error('Network error')
      )

      const { result } = renderHook(() => useDocumentSearch(), { wrapper })

      act(() => {
        result.current.handleQueryChange('테스트')
      })

      await act(async () => {
        await result.current.handleSearch()
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.error).toBe('검색 중 오류가 발생했습니다. 다시 시도해 주세요.')
      expect(result.current.results).toEqual([])
      expect(result.current.answer).toBeNull()
      expect(consoleError).toHaveBeenCalledWith(
        '[DocumentSearchContext] 검색 오류:',
        expect.any(Error)
      )

      consoleError.mockRestore()
    })
  })

  describe('로딩 상태', () => {
    it('검색 중 isLoading이 true여야 함', async () => {
      let resolveSearch: ((value: any) => void) | undefined

      const searchPromise = new Promise(resolve => {
        resolveSearch = resolve
      })

      vi.mocked(SearchService.searchDocuments).mockReturnValueOnce(searchPromise as any)

      const { result } = renderHook(() => useDocumentSearch(), { wrapper })

      act(() => {
        result.current.handleQueryChange('테스트')
      })

      act(() => {
        result.current.handleSearch()
      })

      // 검색 중에는 isLoading이 true
      await waitFor(() => {
        expect(result.current.isLoading).toBe(true)
      })

      // 검색 완료
      act(() => {
        resolveSearch!({ search_results: [], answer: null })
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
    })
  })

  describe('통합 시나리오', () => {
    it('전체 검색 플로우가 올바르게 동작해야 함', async () => {
      const mockResponse = {
        search_results: [
          {
            id: '1',
            score: 0.9,
            payload: {
              original_name: 'test.pdf',
              dest_path: '/test.pdf'
            }
          }
        ],
        answer: '통합 테스트 답변',
        search_mode: 'semantic' as const
      }

      vi.mocked(SearchService.searchDocuments).mockResolvedValueOnce(mockResponse)

      const { result } = renderHook(() => useDocumentSearch(), { wrapper })

      // 초기 상태 확인
      expect(result.current.query).toBe('')
      expect(result.current.searchMode).toBe('keyword')
      expect(result.current.keywordMode).toBe('AND')

      // 검색어 입력
      act(() => {
        result.current.handleQueryChange('통합 테스트')
      })

      expect(result.current.query).toBe('통합 테스트')

      // 검색 모드 변경
      act(() => {
        result.current.handleSearchModeChange('semantic')
      })

      expect(result.current.searchMode).toBe('semantic')

      // 검색 실행
      await act(async () => {
        await result.current.handleSearch()
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // 결과 확인
      expect(result.current.results).toHaveLength(1)
      expect(result.current.answer).toBe('통합 테스트 답변')
      expect(result.current.error).toBeNull()
      expect(result.current.lastSearchMode).toBe('semantic')

      // 리셋
      act(() => {
        result.current.handleReset()
      })

      expect(result.current.query).toBe('')
      expect(result.current.results).toEqual([])
      expect(result.current.answer).toBeNull()
      expect(result.current.lastSearchMode).toBeNull()
    })

    it('검색 모드 변경 후 재검색이 올바르게 동작해야 함', async () => {
      const mockKeywordResponse = {
        search_results: [
          {
            _id: 'k1',
            upload: {
              originalName: 'keyword.pdf',
              destPath: '/keyword.pdf'
            }
          }
        ],
        answer: '키워드 답변',
        search_mode: 'keyword' as const
      }

      const mockSemanticResponse = {
        search_results: [
          {
            id: 's1',
            score: 0.85,
            payload: {
              original_name: 'semantic.pdf',
              dest_path: '/semantic.pdf'
            }
          }
        ],
        answer: '시맨틱 답변',
        search_mode: 'semantic' as const
      }

      vi.mocked(SearchService.searchDocuments)
        .mockResolvedValueOnce(mockKeywordResponse)
        .mockResolvedValueOnce(mockSemanticResponse)

      const { result } = renderHook(() => useDocumentSearch(), { wrapper })

      // 키워드 검색
      act(() => {
        result.current.handleQueryChange('테스트')
      })

      await act(async () => {
        await result.current.handleSearch()
      })

      await waitFor(() => {
        expect(result.current.lastSearchMode).toBe('keyword')
      })

      // 키워드 검색 결과 확인
      const keywordResult = result.current.results[0] as { _id: string }
      expect(keywordResult._id).toBe('k1')

      // 시맨틱 모드로 변경 후 재검색
      act(() => {
        result.current.handleSearchModeChange('semantic')
      })

      await act(async () => {
        await result.current.handleSearch()
      })

      await waitFor(() => {
        expect(result.current.lastSearchMode).toBe('semantic')
      })

      // 시맨틱 검색 결과 확인
      const semanticResult = result.current.results[0] as SemanticSearchResultItem
      expect(semanticResult.id).toBe('s1')

      // 두 번의 API 호출 확인
      expect(SearchService.searchDocuments).toHaveBeenCalledTimes(2)
      expect(SearchService.searchDocuments).toHaveBeenNthCalledWith(1, {
        query: '테스트',
        search_mode: 'keyword',
        mode: 'AND'
      })
      expect(SearchService.searchDocuments).toHaveBeenNthCalledWith(2, {
        query: '테스트',
        search_mode: 'semantic',
        top_k: 10
      })
    })
  })
})
