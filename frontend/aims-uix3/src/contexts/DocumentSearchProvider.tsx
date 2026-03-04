import React, { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { KeywordMode, SearchMode } from '@/entities/search'
import { SearchService } from '@/services/searchService'
import { usePersistedState } from '@/hooks/usePersistedState'
import { errorReporter } from '@/shared/lib/errorReporter'
import {
  DocumentSearchContext,
  type DocumentSearchContextValue
} from './DocumentSearchContext.types'

interface DocumentSearchProviderProps {
  children: ReactNode
}

export const DocumentSearchProvider: React.FC<DocumentSearchProviderProps> = ({ children }) => {
  // F5 이후에도 유지되는 검색 상태들
  const [query, setQuery] = usePersistedState<string>('document-search-query', '')
  const [searchMode, setSearchMode] = usePersistedState<SearchMode>('document-search-mode', 'keyword')
  const [keywordMode, setKeywordMode] = usePersistedState<KeywordMode>('document-search-keyword-mode', 'AND')
  const [customerId, setCustomerId] = useState<string | null>(null)
  // 검색 결과는 대량 데이터(2000+건)이므로 sessionStorage 저장 불가 (5MB 한도 초과)
  const [results, setResults] = useState<DocumentSearchContextValue['results']>([])
  const [answer, setAnswer] = useState<string | null>(null)
  const [lastSearchMode, setLastSearchMode] = usePersistedState<SearchMode | null>('document-search-last-mode', null)

  // 임시 상태들 (새로고침 시 초기화되어도 됨)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // 검색 취소용 AbortController
  const abortControllerRef = useRef<AbortController | null>(null)

  const handleSearch = useCallback(async () => {
    if (!query.trim()) {
      setError('검색어를 입력해 주세요.')
      return
    }

    // 이전 진행 중인 요청 중단
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    setIsLoading(true)
    setError(null)
    setResults([])
    setAnswer(null)

    try {
      const searchQuery = {
        query: query.trim(),
        search_mode: searchMode,
        ...(searchMode === 'keyword' && { mode: keywordMode }),
        // semantic 모드: top_k 미전송 → 백엔드가 전체 결과 반환
        ...(customerId && { customer_id: customerId })
      }

      const response = await SearchService.searchDocuments(searchQuery, controller.signal)

      setResults(response.search_results)
      setAnswer(response.answer || null)
      setLastSearchMode(searchMode)
    } catch (err) {
      // 사용자 취소 시 에러 표시하지 않음
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }
      console.error('[DocumentSearchContext] 검색 오류:', err)
      errorReporter.reportApiError(err as Error, { component: 'DocumentSearchProvider.handleSearch' })
      setError('검색 중 오류가 발생했습니다. 다시 시도해 주세요.')
    } finally {
      // 취소된 요청이 아닌 경우에만 로딩 해제
      if (!controller.signal.aborted) {
        setIsLoading(false)
      }
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
    }
  }, [keywordMode, query, searchMode, customerId])

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsLoading(false)
    setError(null)
  }, [])

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value)
    setError(null)
  }, [])

  const handleSearchModeChange = useCallback((mode: SearchMode) => {
    setSearchMode(mode)
    setError(null)
  }, [])

  const handleKeywordModeChange = useCallback((mode: KeywordMode) => {
    setKeywordMode(mode)
  }, [])

  const handleCustomerIdChange = useCallback((id: string | null) => {
    setCustomerId(id)
  }, [])

  const handleReset = useCallback(() => {
    setQuery('')
    setResults([])
    setAnswer(null)
    setError(null)
    setLastSearchMode(null)
    setCustomerId(null)
  }, [])

  const value: DocumentSearchContextValue = {
    query,
    searchMode,
    keywordMode,
    customerId,
    results,
    answer,
    isLoading,
    error,
    lastSearchMode,
    handleSearch,
    handleQueryChange,
    handleSearchModeChange,
    handleKeywordModeChange,
    handleCustomerIdChange,
    handleReset,
    handleCancel
  }

  return (
    <DocumentSearchContext.Provider value={value}>
      {children}
    </DocumentSearchContext.Provider>
  )
}

export default DocumentSearchProvider
