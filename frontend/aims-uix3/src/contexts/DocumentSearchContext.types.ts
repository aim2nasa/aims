/**
 * DocumentSearchContext shared definitions
 * @since 1.0.0
 *
 * Context 타입과 인스턴스를 분리하여 React Fast Refresh 규칙 준수
 */

import { createContext } from 'react'
import type { SearchMode, KeywordMode, SearchResultItem } from '@/entities/search'

export interface DocumentSearchContextValue {
  // State
  query: string
  searchMode: SearchMode
  keywordMode: KeywordMode
  customerId: string | null
  results: SearchResultItem[]
  answer: string | null
  isLoading: boolean
  error: string | null
  lastSearchMode: SearchMode | null

  // Actions
  handleSearch: () => Promise<void>
  handleQueryChange: (value: string) => void
  handleSearchModeChange: (mode: SearchMode) => void
  handleKeywordModeChange: (mode: KeywordMode) => void
  handleCustomerIdChange: (customerId: string | null) => void
  handleReset: () => void
  handleCancel: () => void
}

export const DocumentSearchContext = createContext<DocumentSearchContextValue | undefined>(undefined)
