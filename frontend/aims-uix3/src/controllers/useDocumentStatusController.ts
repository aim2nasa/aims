/**
 * Document Status Controller Hook
 * @since 1.0.0
 *
 * 문서 처리 현황 비즈니스 로직 Controller
 * ARCHITECTURE.md Layer 4: Controller Layer 구현
 *
 * 역할:
 * - View와 비즈니스 로직 완전 분리
 * - Context와 Service Layer 연결
 * - 복잡한 상태 변경 로직 관리
 * - 사용자 액션에 대한 응답 처리
 */

import { useState, useCallback } from 'react'
import { useDocumentStatusContext } from '../contexts/DocumentStatusContext'
import type { Document, DocumentCustomerRelation } from '../types/documentStatus'
import { DocumentService } from '../services/DocumentService'
import { CustomerService } from '../services/customerService'
import { DocumentStatusService } from '../services/DocumentStatusService'
import type { CustomerSearchResponse } from '@/entities/customer'

/**
 * useDocumentStatusController
 *
 * 문서 처리 현황 페이지의 모든 비즈니스 로직을 관리하는 Controller Hook
 *
 * @returns {Object} Controller state and actions
 *
 * @example
 * ```tsx
 * const controller = useDocumentStatusController()
 *
 * return (
 *   <DocumentStatusViewContent
 *     {...controller}
 *   />
 * )
 * ```
 */
export const useDocumentStatusController = () => {
  const { state, actions } = useDocumentStatusContext()

  // ===== Modal States =====
  // Document Detail Modal
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const [isDetailModalVisible, setDetailModalVisible] = useState(false)

  // Document Summary Modal
  const [selectedDocumentForSummary, setSelectedDocumentForSummary] = useState<Document | null>(null)
  const [isSummaryModalVisible, setSummaryModalVisible] = useState(false)

  // Document Full Text Modal
  const [selectedDocumentForFullText, setSelectedDocumentForFullText] = useState<Document | null>(null)
  const [isFullTextModalVisible, setFullTextModalVisible] = useState(false)

  // Document Link Modal
  const [selectedDocumentForLink, setSelectedDocumentForLink] = useState<Document | null>(null)
  const [isLinkModalVisible, setLinkModalVisible] = useState(false)

  // ===== Document Detail Modal Handlers =====
  /**
   * 문서 클릭 핸들러
   * Document Detail Modal 열기
   */
  const handleDocumentClick = useCallback((document: Document) => {
    setSelectedDocument(document)
    setDetailModalVisible(true)
  }, [])

  /**
   * Document Detail Modal 닫기 핸들러
   */
  const handleDetailModalClose = useCallback(() => {
    setDetailModalVisible(false)
    setTimeout(() => {
      setSelectedDocument(null)
    }, 300) // 애니메이션 시간 고려
  }, [])

  // ===== Document Summary Modal Handlers =====
  /**
   * Document Summary 핸들러
   * Document Summary Modal 열기
   */
  const handleDocumentSummary = useCallback((document: Document) => {
    setSelectedDocumentForSummary(document)
    setSummaryModalVisible(true)
  }, [])

  /**
   * Document Summary Modal 닫기 핸들러
   */
  const handleSummaryModalClose = useCallback(() => {
    setSummaryModalVisible(false)
    setTimeout(() => {
      setSelectedDocumentForSummary(null)
    }, 300)
  }, [])

  // ===== Document Full Text Modal Handlers =====
  /**
   * Document Full Text 핸들러
   * Document Full Text Modal 열기
   */
  const handleDocumentFullText = useCallback((document: Document) => {
    setSelectedDocumentForFullText(document)
    setFullTextModalVisible(true)
  }, [])

  /**
   * Document Full Text Modal 닫기 핸들러
   */
  const handleFullTextModalClose = useCallback(() => {
    setFullTextModalVisible(false)
    setTimeout(() => {
      setSelectedDocumentForFullText(null)
    }, 300)
  }, [])

  // ===== Document Link Modal Handlers =====
  /**
   * 문서 고객 연결 모달 열기
   */
  const handleDocumentLink = useCallback((document: Document) => {
    setSelectedDocumentForLink(document)
    setLinkModalVisible(true)
  }, [])

  /**
   * 문서 고객 연결 모달 닫기
   */
  const handleLinkModalClose = useCallback(() => {
    setLinkModalVisible(false)
    setTimeout(() => {
      setSelectedDocumentForLink(null)
    }, 300)
  }, [])

  /**
   * 고객 검색
   */
  const searchCustomers = useCallback(
    async (searchTerm: string, page: number = 1, limit: number = 20): Promise<CustomerSearchResponse> => {
      return CustomerService.searchCustomers(searchTerm, { page, limit })
    },
    []
  )

  /**
   * 특정 고객과 연결된 문서 목록 조회
   */
  const fetchCustomerDocuments = useCallback(async (customerId: string) => {
    return DocumentService.getCustomerDocuments(customerId)
  }, [])

  /**
   * 문서를 고객에게 연결
   */
  const linkDocumentToCustomer = useCallback(
    async (params: {
      customerId: string
      documentId: string
      relationshipType: string
      notes?: string
    }): Promise<DocumentCustomerRelation | undefined> => {
      const { customerId, documentId, relationshipType, notes } = params

      await DocumentService.linkDocumentToCustomer(customerId, {
      document_id: documentId,
      relationship_type: relationshipType,
      ...(notes ? { notes } : {}),
    })

      // 최신 문서 정보 재조회하여 customer_relation 동기화
      const detailedDoc = await DocumentStatusService.getDocumentStatus(documentId)
      const relation = detailedDoc.data?.rawDocument?.customer_relation

      actions.updateDocumentCustomerRelation(documentId, relation)

      return relation
    },
    [actions]
  )

  // ===== Return Controller Interface =====
  return {
    // Context State
    documents: state.documents,
    filteredDocuments: state.filteredDocuments,
    isLoading: state.isLoading,
    error: state.error,
    isPollingEnabled: state.isPollingEnabled,
    apiHealth: state.apiHealth,
    lastUpdated: state.lastUpdated,

    // 🍎 Pagination State
    currentPage: state.currentPage,
    totalPages: state.totalPages,
    totalCount: state.totalCount,
    itemsPerPage: state.itemsPerPage,
    paginatedDocuments: state.paginatedDocuments,

    // 🍎 Sort State
    sortField: state.sortField,
    sortDirection: state.sortDirection,

    // Context Actions
    togglePolling: actions.togglePolling,
    refreshDocuments: actions.refreshDocuments,

    // 🍎 Pagination Actions
    handlePageChange: actions.handlePageChange,
    handleLimitChange: actions.handleLimitChange,

    // 🍎 Sort Actions
    handleColumnSort: actions.handleColumnSort,

    // Document Detail Modal State & Handlers
    selectedDocument,
    isDetailModalVisible,
    handleDocumentClick,
    handleDetailModalClose,

    // Document Summary Modal State & Handlers
    selectedDocumentForSummary,
    isSummaryModalVisible,
    handleDocumentSummary,
    handleSummaryModalClose,

    // Document Full Text Modal State & Handlers
    selectedDocumentForFullText,
    isFullTextModalVisible,
    handleDocumentFullText,
    handleFullTextModalClose,

    // Document Link Modal State & Handlers
    selectedDocumentForLink,
    isLinkModalVisible,
    handleDocumentLink,
    handleLinkModalClose,
    searchCustomers,
    fetchCustomerDocuments,
    linkDocumentToCustomer
  }
}

export default useDocumentStatusController
