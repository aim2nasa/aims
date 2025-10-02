/**
 * DocumentStatusView Component
 * @since 1.0.0
 *
 * 문서 처리 현황 View 컴포넌트
 * DocumentStatusProvider와 함께 사용하여 실시간 문서 처리 현황 표시
 */

import React, { useState } from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import { DocumentStatusProvider } from '../../../providers/DocumentStatusProvider'
import { useDocumentStatusContext } from '../../../contexts/DocumentStatusContext'
import { Document } from '../../../types/documentStatus'
import DocumentStatusStats from './components/DocumentStatusStats'
import DocumentStatusTable from './components/DocumentStatusTable'
import DocumentDetailModal from './components/DocumentDetailModal'
import DocumentSummaryModal from './components/DocumentSummaryModal'
import DocumentFullTextModal from './components/DocumentFullTextModal'
import './DocumentStatusView.css'

interface DocumentStatusViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
}

/**
 * DocumentStatusView 내부 컴포넌트
 * Context를 사용하여 상태 관리
 */
const DocumentStatusViewContent: React.FC = () => {
  const { state, actions } = useDocumentStatusContext()

  // Document Detail Modal 상태
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const [isDetailModalVisible, setDetailModalVisible] = useState(false)

  // Document Summary Modal 상태
  const [selectedDocumentForSummary, setSelectedDocumentForSummary] = useState<Document | null>(null)
  const [isSummaryModalVisible, setSummaryModalVisible] = useState(false)

  // Document Full Text Modal 상태
  const [selectedDocumentForFullText, setSelectedDocumentForFullText] = useState<Document | null>(null)
  const [isFullTextModalVisible, setFullTextModalVisible] = useState(false)

  /**
   * 문서 클릭 핸들러
   * Document Detail Modal 열기
   */
  const handleDocumentClick = (document: Document) => {
    setSelectedDocument(document)
    setDetailModalVisible(true)
  }

  /**
   * Document Detail Modal 닫기 핸들러
   */
  const handleDetailModalClose = () => {
    setDetailModalVisible(false)
    setTimeout(() => {
      setSelectedDocument(null)
    }, 300)
  }

  /**
   * Document Summary 핸들러
   * Document Summary Modal 열기
   */
  const handleDocumentSummary = (document: Document) => {
    setSelectedDocumentForSummary(document)
    setSummaryModalVisible(true)
  }

  /**
   * Document Summary Modal 닫기 핸들러
   */
  const handleSummaryModalClose = () => {
    setSummaryModalVisible(false)
    setTimeout(() => {
      setSelectedDocumentForSummary(null)
    }, 300)
  }

  /**
   * Document Full Text 핸들러
   * Document Full Text Modal 열기
   */
  const handleDocumentFullText = (document: Document) => {
    setSelectedDocumentForFullText(document)
    setFullTextModalVisible(true)
  }

  /**
   * Document Full Text Modal 닫기 핸들러
   */
  const handleFullTextModalClose = () => {
    setFullTextModalVisible(false)
    setTimeout(() => {
      setSelectedDocumentForFullText(null)
    }, 300)
  }

  return (
    <div className="document-status-view-content">
      {/* 상태 통계 카드 */}
      <DocumentStatusStats
        documents={state.documents}
        activeFilter={state.statusFilter}
        onFilterChange={actions.setStatusFilter}
      />

      {/* 로딩 상태 */}
      {state.isLoading && state.documents.length === 0 && (
        <div className="document-status-loading">
          <div className="loading-spinner" />
          <p>문서 목록을 불러오는 중...</p>
        </div>
      )}

      {/* 에러 상태 */}
      {state.error && (
        <div className="document-status-error">
          <p>{state.error}</p>
        </div>
      )}

      {/* 문서 테이블 */}
      {!state.error && state.filteredDocuments.length > 0 && (
        <DocumentStatusTable
          documents={state.filteredDocuments}
          isLoading={state.isLoading}
          onDocumentClick={handleDocumentClick}
          onSummaryClick={handleDocumentSummary}
          onFullTextClick={handleDocumentFullText}
        />
      )}

      {/* 빈 상태 */}
      {!state.isLoading && !state.error && state.filteredDocuments.length === 0 && (
        <div className="document-status-empty">
          <p>문서가 없습니다.</p>
        </div>
      )}

      {/* Document Detail Modal */}
      <DocumentDetailModal
        visible={isDetailModalVisible}
        onClose={handleDetailModalClose}
        document={selectedDocument}
      />

      {/* Document Summary Modal */}
      <DocumentSummaryModal
        visible={isSummaryModalVisible}
        onClose={handleSummaryModalClose}
        document={selectedDocumentForSummary}
      />

      {/* Document Full Text Modal */}
      <DocumentFullTextModal
        visible={isFullTextModalVisible}
        onClose={handleFullTextModalClose}
        document={selectedDocumentForFullText}
      />
    </div>
  )
}

/**
 * DocumentStatusView React 컴포넌트
 *
 * 문서 처리 현황 기능을 위한 View
 * Provider로 감싸서 전역 상태 관리
 *
 * @example
 * ```tsx
 * <DocumentStatusView
 *   visible={isVisible}
 *   onClose={handleClose}
 * />
 * ```
 */
export const DocumentStatusView: React.FC<DocumentStatusViewProps> = ({
  visible,
  onClose
}) => {
  return (
    <CenterPaneView
      visible={visible}
      title="문서 처리 현황"
      onClose={onClose}
      marginTop={8}
      marginBottom={8}
      marginLeft={8}
      marginRight={8}
      className="document-status-view"
    >
      <DocumentStatusProvider>
        <DocumentStatusViewContent />
      </DocumentStatusProvider>
    </CenterPaneView>
  )
}

export default DocumentStatusView