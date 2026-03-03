import React, { useCallback, useState } from 'react'
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
  const [topK, setTopK] = usePersistedState<number>('document-search-top-k', 10)
  const [results, setResults] = usePersistedState<DocumentSearchContextValue['results']>('document-search-results', [])
  const [answer, setAnswer] = usePersistedState<string | null>('document-search-answer', null)
  const [lastSearchMode, setLastSearchMode] = usePersistedState<SearchMode | null>('document-search-last-mode', null)

  // 임시 상태들 (새로고침 시 초기화되어도 됨)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

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
        ...(customerId && { customer_id: customerId })
      }

      const response = await SearchService.searchDocuments(searchQuery)

      setResults(response.search_results)
      setAnswer(response.answer || null)
      setLastSearchMode(searchMode)
    } catch (err) {
      console.error('[DocumentSearchContext] 검색 오류:', err)
      errorReporter.reportApiError(err as Error, { component: 'DocumentSearchProvider.handleSearch' })
      setError('검색 중 오류가 발생했습니다. 다시 시도해 주세요.')
    } finally {
      setIsLoading(false)
    }
  }, [keywordMode, query, searchMode, customerId])

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

  const handleTopKChange = useCallback((value: number) => {
    setTopK(value)
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
    topK,
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
    handleTopKChange,
    handleReset
  }

  return (
    <DocumentSearchContext.Provider value={value}>
      {children}
    </DocumentSearchContext.Provider>
  )
}

export default DocumentSearchProvider
