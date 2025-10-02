/**
 * DocumentStatusView Component
 * @since 1.0.0
 *
 * 문서 처리 현황 Pure View 컴포넌트
 * ARCHITECTURE.md Layer 5: View Layer 구현
 *
 * 역할:
 * - 순수 렌더링만 담당
 * - Controller Hook에서 모든 상태와 액션 수신
 * - 사용자 인터랙션을 Controller에 위임
 */

import React from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import { DocumentStatusProvider } from '../../../providers/DocumentStatusProvider'
import { useDocumentStatusController } from '../../../controllers/useDocumentStatusController'
import DocumentStatusControls from './components/DocumentStatusControls'
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
 * DocumentStatusView 내부 컴포넌트 (Pure View)
 * Controller Hook을 사용하여 모든 상태와 액션 수신
 * 순수 렌더링만 담당
 */
const DocumentStatusViewContent: React.FC = () => {
  // ✅ Controller Hook - 모든 비즈니스 로직을 여기서 가져옴
  const controller = useDocumentStatusController()

  return (
    <div className="document-status-view-content">
      {/* 컨트롤 UI */}
      <DocumentStatusControls
        isPollingEnabled={controller.isPollingEnabled}
        onTogglePolling={controller.togglePolling}
        onRefresh={controller.refreshDocuments}
        isLoading={controller.isLoading}
        apiHealth={controller.apiHealth}
        lastUpdated={controller.lastUpdated}
      />

      {/* 상태 통계 카드 */}
      <DocumentStatusStats
        documents={controller.documents}
        activeFilter={controller.statusFilter}
        onFilterChange={controller.setStatusFilter}
      />

      {/* 로딩 상태 */}
      {controller.isLoading && controller.documents.length === 0 && (
        <div className="document-status-loading">
          <div className="loading-spinner" />
          <p>문서 목록을 불러오는 중...</p>
        </div>
      )}

      {/* 에러 상태 */}
      {controller.error && (
        <div className="document-status-error">
          <p>{controller.error}</p>
        </div>
      )}

      {/* 문서 테이블 */}
      {!controller.error && controller.filteredDocuments.length > 0 && (
        <DocumentStatusTable
          documents={controller.filteredDocuments}
          isLoading={controller.isLoading}
          onDocumentClick={controller.handleDocumentClick}
          onSummaryClick={controller.handleDocumentSummary}
          onFullTextClick={controller.handleDocumentFullText}
        />
      )}

      {/* 빈 상태 */}
      {!controller.isLoading && !controller.error && controller.filteredDocuments.length === 0 && (
        <div className="document-status-empty">
          <p>문서가 없습니다.</p>
        </div>
      )}

      {/* Document Detail Modal */}
      <DocumentDetailModal
        visible={controller.isDetailModalVisible}
        onClose={controller.handleDetailModalClose}
        document={controller.selectedDocument}
      />

      {/* Document Summary Modal */}
      <DocumentSummaryModal
        visible={controller.isSummaryModalVisible}
        onClose={controller.handleSummaryModalClose}
        document={controller.selectedDocumentForSummary}
      />

      {/* Document Full Text Modal */}
      <DocumentFullTextModal
        visible={controller.isFullTextModalVisible}
        onClose={controller.handleFullTextModalClose}
        document={controller.selectedDocumentForFullText}
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