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
  apiHealth: boolean | null
  // 🍎 Pagination State
  currentPage: number
  itemsPerPage: number
  totalPages: number
  totalCount: number
  paginatedDocuments: Document[]
  // 🍎 Sort State
  sortField: 'filename' | 'status' | 'uploadDate' | 'fileSize' | 'mimeType' | 'customer' | 'badgeType' | 'docType' | null
  sortDirection: 'asc' | 'desc'
  // 🍎 검색 대상 필드
  searchField: 'displayName' | 'originalName'
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
  setApiHealth: (health: boolean | null) => void
  fetchDocuments: (isInitialLoad?: boolean) => Promise<void>
  refreshDocuments: () => Promise<void>
  checkApiHealth: () => Promise<void>
  // 🍎 Pagination Actions
  setCurrentPage: (page: number) => void
  setItemsPerPage: (limit: number) => void
  handlePageChange: (page: number) => void
  handleLimitChange: (limit: number, resetPage?: boolean) => void
  updateDocumentCustomerRelation: (
    documentId: string,
    relation: DocumentCustomerRelation | undefined
  ) => void
  // 🍎 Sort Actions
  setSortField: (field: 'filename' | 'status' | 'uploadDate' | 'fileSize' | 'mimeType' | 'customer' | 'badgeType' | 'docType' | null) => void
  setSortDirection: (direction: 'asc' | 'desc') => void
  handleColumnSort: (field: 'filename' | 'status' | 'uploadDate' | 'fileSize' | 'mimeType' | 'customer' | 'badgeType' | 'docType') => void
  // 🍎 Optimistic Update Actions
  removeDocuments: (docIds: Set<string>) => void
  // 🍎 검색 대상 필드 설정
  setSearchField: (field: 'displayName' | 'originalName') => void
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
