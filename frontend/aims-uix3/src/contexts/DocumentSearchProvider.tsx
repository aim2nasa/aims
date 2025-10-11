import React, { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import type { KeywordMode, SearchMode } from '@/entities/search'
import { SearchService } from '@/services/searchService'
import {
  DocumentSearchContext,
  type DocumentSearchContextValue
} from './DocumentSearchContext.types'

interface DocumentSearchProviderProps {
  children: ReactNode
}

export const DocumentSearchProvider: React.FC<DocumentSearchProviderProps> = ({ children }) => {
  const [query, setQuery] = useState<string>('')
  const [searchMode, setSearchMode] = useState<SearchMode>('keyword')
  const [keywordMode, setKeywordMode] = useState<KeywordMode>('AND')
  const [results, setResults] = useState<DocumentSearchContextValue['results']>([])
  const [answer, setAnswer] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSearchMode, setLastSearchMode] = useState<SearchMode | null>(null)

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
        ...(searchMode === 'keyword' && { mode: keywordMode })
      }

      const response = await SearchService.searchDocuments(searchQuery)

      setResults(response.search_results)
      setAnswer(response.answer || null)
      setLastSearchMode(searchMode)
    } catch (err) {
      console.error('[DocumentSearchContext] 검색 오류:', err)
      setError('검색 중 오류가 발생했습니다. 다시 시도해 주세요.')
    } finally {
      setIsLoading(false)
    }
  }, [keywordMode, query, searchMode])

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

  const handleReset = useCallback(() => {
    setQuery('')
    setResults([])
    setAnswer(null)
    setError(null)
    setLastSearchMode(null)
  }, [])

  const value: DocumentSearchContextValue = {
    query,
    searchMode,
    keywordMode,
    results,
    answer,
    isLoading,
    error,
    lastSearchMode,
    handleSearch,
    handleQueryChange,
    handleSearchModeChange,
    handleKeywordModeChange,
    handleReset
  }

  return (
    <DocumentSearchContext.Provider value={value}>
      {children}
    </DocumentSearchContext.Provider>
  )
}

export default DocumentSearchProvider
