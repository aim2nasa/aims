/**
 * DocumentStatusView Component
 * @since 1.0.0
 * @version 3.0.0 - 🍎 완전한 재설계: DocumentLibrary 리스트 형태
 *
 * 🎯 Design Strategy:
 * - 통계 카드 제거 (공간 낭비)
 * - 리스트 기반 레이아웃 (DocumentLibrary와 동일)
 * - 필터 → 드롭다운으로 변경 (공간 효율)
 * - 극도의 미니멀리즘과 효율성
 */

import React from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import { DocumentStatusProvider } from '../../../providers/DocumentStatusProvider'
import { useDocumentStatusController } from '../../../controllers/useDocumentStatusController'
import DocumentStatusHeader from './components/DocumentStatusHeader'
import DocumentStatusList from './components/DocumentStatusList'
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
 * 🍎 리스트 기반 레이아웃 - 공간 효율성 극대화
 */
const DocumentStatusViewContent: React.FC = () => {
  const controller = useDocumentStatusController()

  return (
    <div className="document-status-view-content">
      {/* 🍎 헤더: 컨트롤 + 필터 (한 줄) */}
      <DocumentStatusHeader
        isPollingEnabled={controller.isPollingEnabled}
        onTogglePolling={controller.togglePolling}
        onRefresh={controller.refreshDocuments}
        isLoading={controller.isLoading}
        statusFilter={controller.statusFilter}
        onFilterChange={controller.setStatusFilter}
        documentsCount={controller.documents.length}
        filteredCount={controller.filteredDocuments.length}
      />

      {/* 🍎 리스트: DocumentLibrary와 동일한 구조 */}
      <DocumentStatusList
        documents={controller.filteredDocuments}
        isLoading={controller.isLoading}
        isEmpty={controller.filteredDocuments.length === 0}
        error={controller.error}
        onDocumentClick={controller.handleDocumentClick}
        onSummaryClick={controller.handleDocumentSummary}
        onFullTextClick={controller.handleDocumentFullText}
      />

      {/* 모달들 */}
      <DocumentDetailModal
        visible={controller.isDetailModalVisible}
        onClose={controller.handleDetailModalClose}
        document={controller.selectedDocument}
      />
      <DocumentSummaryModal
        visible={controller.isSummaryModalVisible}
        onClose={controller.handleSummaryModalClose}
        document={controller.selectedDocumentForSummary}
      />
      <DocumentFullTextModal
        visible={controller.isFullTextModalVisible}
        onClose={controller.handleFullTextModalClose}
        document={controller.selectedDocumentForFullText}
      />
    </div>
  )
}

export const DocumentStatusView: React.FC<DocumentStatusViewProps> = ({
  visible,
  onClose
}) => {
  return (
    <CenterPaneView
      visible={visible}
      title="문서 처리 현황"
      onClose={onClose}
      marginTop={6}
      marginBottom={6}
      marginLeft={6}
      marginRight={6}
      className="document-status-view"
    >
      <DocumentStatusProvider>
        <DocumentStatusViewContent />
      </DocumentStatusProvider>
    </CenterPaneView>
  )
}

export default DocumentStatusView
