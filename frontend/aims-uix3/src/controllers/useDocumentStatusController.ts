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
import type { Document } from '../types/documentStatus'

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

  // ===== Return Controller Interface =====
  return {
    // Context State
    documents: state.documents,
    filteredDocuments: state.filteredDocuments,
    isLoading: state.isLoading,
    error: state.error,
    statusFilter: state.statusFilter,
    isPollingEnabled: state.isPollingEnabled,
    apiHealth: state.apiHealth,
    lastUpdated: state.lastUpdated,

    // 🍎 Pagination State
    currentPage: state.currentPage,
    totalPages: state.totalPages,
    itemsPerPage: state.itemsPerPage,
    paginatedDocuments: state.paginatedDocuments,

    // Context Actions
    setStatusFilter: actions.setStatusFilter,
    togglePolling: actions.togglePolling,
    refreshDocuments: actions.refreshDocuments,

    // 🍎 Pagination Actions
    handlePageChange: actions.handlePageChange,
    handleLimitChange: actions.handleLimitChange,

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
  }
}

export default useDocumentStatusController
