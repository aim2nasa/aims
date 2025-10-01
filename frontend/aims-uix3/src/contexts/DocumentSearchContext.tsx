/**
 * Document Search Context
 * @since 1.0.0
 *
 * 문서 검색 상태를 전역으로 관리하는 Context
 * 브라우저 리사이즈 등의 이벤트에서도 검색 결과를 유지합니다.
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import type { SearchMode, KeywordMode, SearchResultItem } from '@/entities/search'
import { SearchService } from '@/services/searchService'

/**
 * SearchContext 상태 인터페이스
 */
interface SearchContextState {
  // State
  query: string
  searchMode: SearchMode
  keywordMode: KeywordMode
  results: SearchResultItem[]
  answer: string | null
  isLoading: boolean
  error: string | null

  // Actions
  handleSearch: () => Promise<void>
  handleQueryChange: (value: string) => void
  handleSearchModeChange: (mode: SearchMode) => void
  handleKeywordModeChange: (mode: KeywordMode) => void
  handleReset: () => void
}

/**
 * SearchContext 생성
 */
const DocumentSearchContext = createContext<SearchContextState | undefined>(undefined)

/**
 * SearchProvider Props
 */
interface DocumentSearchProviderProps {
  children: ReactNode
}

/**
 * DocumentSearchProvider 컴포넌트
 *
 * 문서 검색 상태를 전역으로 관리합니다.
 */
export const DocumentSearchProvider: React.FC<DocumentSearchProviderProps> = ({ children }) => {
  // 검색 입력 상태
  const [query, setQuery] = useState<string>('')
  const [searchMode, setSearchMode] = useState<SearchMode>('keyword') // 기본값: 키워드 검색 (신뢰성 우선)
  const [keywordMode, setKeywordMode] = useState<KeywordMode>('AND') // 기본값: AND (정확도 우선)

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
      console.error('[DocumentSearchContext] 검색 오류:', err)
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

  const value: SearchContextState = {
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

  return (
    <DocumentSearchContext.Provider value={value}>
      {children}
    </DocumentSearchContext.Provider>
  )
}

/**
 * useDocumentSearch Hook
 *
 * DocumentSearchContext를 사용하기 위한 Hook
 */
export const useDocumentSearch = (): SearchContextState => {
  const context = useContext(DocumentSearchContext)
  if (!context) {
    throw new Error('useDocumentSearch must be used within DocumentSearchProvider')
  }
  return context
}
