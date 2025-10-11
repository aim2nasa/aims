/**
 * Document Status Context
 * @description 문서 처리 현황 전역 상태 관리
 */

import { createContext, useContext } from 'react'
import type { Document, DocumentCustomerRelation } from '../types/documentStatus'

/**
 * 문서 처리 현황 상태
 */
export interface DocumentStatusState {
  documents: Document[]
  filteredDocuments: Document[]
  selectedDocument: Document | null
  isLoading: boolean
  error: string | null
  searchTerm: string
  statusFilter: 'all' | 'completed' | 'processing' | 'error' | 'pending'
  lastUpdated: Date | null
  isPollingEnabled: boolean
  apiHealth: boolean | null
  // 🍎 Pagination State
  currentPage: number
  itemsPerPage: number
  totalPages: number
  paginatedDocuments: Document[]
}

/**
 * 문서 처리 현황 액션
 */
export interface DocumentStatusActions {
  setDocuments: (documents: Document[]) => void
  setFilteredDocuments: (documents: Document[]) => void
  setSelectedDocument: (document: Document | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setSearchTerm: (term: string) => void
  setStatusFilter: (filter: 'all' | 'completed' | 'processing' | 'error' | 'pending') => void
  setLastUpdated: (date: Date) => void
  setPollingEnabled: (enabled: boolean) => void
  togglePolling: () => void
  setApiHealth: (health: boolean | null) => void
  fetchDocuments: (isInitialLoad?: boolean) => Promise<void>
  refreshDocuments: () => Promise<void>
  checkApiHealth: () => Promise<void>
  // 🍎 Pagination Actions
  setCurrentPage: (page: number) => void
  setItemsPerPage: (limit: number) => void
  handlePageChange: (page: number) => void
  handleLimitChange: (limit: number) => void
  updateDocumentCustomerRelation: (
    documentId: string,
    relation: DocumentCustomerRelation | undefined
  ) => void
}

/**
 * Context 값 타입
 */
export interface DocumentStatusContextValue {
  state: DocumentStatusState
  actions: DocumentStatusActions
}

/**
 * Document Status Context 생성
 */
export const DocumentStatusContext = createContext<DocumentStatusContextValue | undefined>(undefined)

/**
 * useDocumentStatusContext Hook
 */
export const useDocumentStatusContext = (): DocumentStatusContextValue => {
  const context = useContext(DocumentStatusContext)

  if (!context) {
    throw new Error('useDocumentStatusContext must be used within DocumentStatusProvider')
  }

  return context
}
