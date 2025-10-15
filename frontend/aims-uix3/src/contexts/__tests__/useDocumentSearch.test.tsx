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
import type { SearchResultItem } from '@/entities/search'

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
  })

  afterEach(() => {
    vi.restoreAllMocks()
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
          id: '1',
          file_path: '/path/to/file.pdf',
          original_name: 'test.pdf',
          metadata: {},
          matched_content: '테스트 내용',
          score: 0.95
        }
      ]

      const mockResponse = {
        search_results: mockResults,
        answer: '검색 결과 답변'
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
          file_path: '/path/to/doc.pdf',
          original_name: 'doc.pdf',
          metadata: {},
          matched_content: '시맨틱 내용',
          score: 0.88
        }
      ]

      const mockResponse = {
        search_results: mockResults,
        answer: null
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

      // semantic 모드에서는 mode 파라미터가 포함되지 않아야 함
      expect(SearchService.searchDocuments).toHaveBeenCalledWith({
        query: '시맨틱 검색',
        search_mode: 'semantic'
      })
      expect(result.current.results).toEqual(mockResults)
      expect(result.current.answer).toBeNull()
      expect(result.current.lastSearchMode).toBe('semantic')
    })

    it('검색어를 trim 처리해야 함', async () => {
      const mockResponse = {
        search_results: [],
        answer: null
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
            file_path: '/path1.pdf',
            original_name: 'doc1.pdf',
            metadata: {},
            matched_content: '내용1',
            score: 0.9
          }
        ],
        answer: '답변1'
      }

      const mockResponse2 = {
        search_results: [
          {
            id: '2',
            file_path: '/path2.pdf',
            original_name: 'doc2.pdf',
            metadata: {},
            matched_content: '내용2',
            score: 0.8
          }
        ],
        answer: '답변2'
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
        expect(result.current.results[0].id).toBe('2')
        expect(result.current.answer).toBe('답변2')
      })
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
            file_path: '/test.pdf',
            original_name: 'test.pdf',
            metadata: {},
            matched_content: '통합 테스트',
            score: 0.9
          }
        ],
        answer: '통합 테스트 답변'
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
            id: 'k1',
            file_path: '/keyword.pdf',
            original_name: 'keyword.pdf',
            metadata: {},
            matched_content: '키워드',
            score: 0.9
          }
        ],
        answer: '키워드 답변'
      }

      const mockSemanticResponse = {
        search_results: [
          {
            id: 's1',
            file_path: '/semantic.pdf',
            original_name: 'semantic.pdf',
            metadata: {},
            matched_content: '시맨틱',
            score: 0.85
          }
        ],
        answer: '시맨틱 답변'
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
        expect(result.current.results[0].id).toBe('k1')
        expect(result.current.lastSearchMode).toBe('keyword')
      })

      // 시맨틱 모드로 변경 후 재검색
      act(() => {
        result.current.handleSearchModeChange('semantic')
      })

      await act(async () => {
        await result.current.handleSearch()
      })

      await waitFor(() => {
        expect(result.current.results[0].id).toBe('s1')
        expect(result.current.lastSearchMode).toBe('semantic')
      })

      // 두 번의 API 호출 확인
      expect(SearchService.searchDocuments).toHaveBeenCalledTimes(2)
      expect(SearchService.searchDocuments).toHaveBeenNthCalledWith(1, {
        query: '테스트',
        search_mode: 'keyword',
        mode: 'AND'
      })
      expect(SearchService.searchDocuments).toHaveBeenNthCalledWith(2, {
        query: '테스트',
        search_mode: 'semantic'
      })
    })
  })
})
