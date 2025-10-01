/**
 * Document Search Controller Hook
 * @since 1.0.0
 *
 * 문서 검색 비즈니스 로직 Controller
 */

import { useState, useCallback } from 'react'
import type { SearchMode, KeywordMode, SearchResultItem } from '@/entities/search'
import { SearchService } from '@/services/searchService'

/**
 * Document Search Controller Hook
 *
 * 문서 검색의 모든 비즈니스 로직을 관리합니다.
 * View는 이 Hook을 통해서만 상태와 액션에 접근합니다.
 *
 * @returns 검색 상태와 액션들
 */
export const useDocumentSearchController = () => {
  // 검색 입력 상태
  const [query, setQuery] = useState<string>('')
  const [searchMode, setSearchMode] = useState<SearchMode>('semantic')
  const [keywordMode, setKeywordMode] = useState<KeywordMode>('OR')

  // 검색 결과 상태
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [answer, setAnswer] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * 검색 실행
   */
  const handleSearch = useCallback(async () => {
    if (!query.trim()) {
      setError('검색어를 입력해 주세요.')
      return
    }

    setIsLoading(true)
    setError(null)
    setResults([])
    setAnswer(null)

    try {
      const searchQuery = {
        query: query.trim(),
        search_mode: searchMode,
        ...(searchMode === 'keyword' && { mode: keywordMode }),
      }

      const response = await SearchService.searchDocuments(searchQuery)

      setResults(response.search_results)
      setAnswer(response.answer || null)
    } catch (err) {
      console.error('[useDocumentSearchController] 검색 오류:', err)
      setError('검색 중 오류가 발생했습니다. 다시 시도해 주세요.')
    } finally {
      setIsLoading(false)
    }
  }, [query, searchMode, keywordMode])

  /**
   * 검색어 변경
   */
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value)
    setError(null)
  }, [])

  /**
   * 검색 모드 변경
   */
  const handleSearchModeChange = useCallback((mode: SearchMode) => {
    setSearchMode(mode)
    setError(null)
  }, [])

  /**
   * 키워드 모드 변경
   */
  const handleKeywordModeChange = useCallback((mode: KeywordMode) => {
    setKeywordMode(mode)
  }, [])

  /**
   * 검색 초기화
   */
  const handleReset = useCallback(() => {
    setQuery('')
    setResults([])
    setAnswer(null)
    setError(null)
  }, [])

  return {
    // State
    query,
    searchMode,
    keywordMode,
    results,
    answer,
    isLoading,
    error,

    // Actions
    handleSearch,
    handleQueryChange,
    handleSearchModeChange,
    handleKeywordModeChange,
    handleReset,
  }
}
