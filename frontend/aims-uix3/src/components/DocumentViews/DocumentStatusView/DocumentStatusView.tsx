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
import DocumentLinkModal from './components/DocumentLinkModal'
import { Dropdown } from '../../../shared/ui'
import './DocumentStatusView.css'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol'

interface DocumentStatusViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
  /** 문서 클릭 핸들러 */
  onDocumentClick?: (documentId: string) => void
}

// 🍎 페이지당 항목 수 옵션
const ITEMS_PER_PAGE_OPTIONS = [
  { value: '10', label: '10개씩' },
  { value: '20', label: '20개씩' },
  { value: '50', label: '50개씩' },
  { value: '100', label: '100개씩' }
]

/**
 * DocumentStatusView 내부 컴포넌트 (Pure View)
 * 🍎 리스트 기반 레이아웃 - 공간 효율성 극대화
 */
const DocumentStatusViewContent: React.FC<{ onDocumentClick?: (documentId: string) => void }> = ({ onDocumentClick }) => {
  const controller = useDocumentStatusController()

  // 🍎 Progressive Disclosure: 페이지네이션 버튼 클릭 피드백 상태
  const [clickedButton, setClickedButton] = React.useState<'prev' | 'next' | null>(null)

  /**
   * 페이지 변경 핸들러 (클릭 피드백 포함)
   */
  const handlePageChangeWithFeedback = (page: number, direction: 'prev' | 'next') => {
    setClickedButton(direction)
    controller.handlePageChange(page)

    // 600ms 후 클릭 상태 복원
    setTimeout(() => {
      setClickedButton(null)
    }, 600)
  }

  return (
    <div className="document-status-view-content">
      {/* 🍎 헤더: 컨트롤 + 필터 (한 줄) */}
      <DocumentStatusHeader
        isPollingEnabled={controller.isPollingEnabled}
        onTogglePolling={controller.togglePolling}
        onRefresh={controller.refreshDocuments}
        isLoading={controller.isLoading}
        documentsCount={controller.totalCount}
        lastUpdated={controller.lastUpdated}
      />

      {/* 🍎 리스트: DocumentLibrary와 동일한 구조 */}
      <DocumentStatusList
        documents={controller.paginatedDocuments}
        isLoading={controller.isLoading}
        isEmpty={controller.filteredDocuments.length === 0}
        error={controller.error}
        {...(onDocumentClick ? { onDocumentClick } : {})}
        onDetailClick={controller.handleDocumentClick}
        onSummaryClick={controller.handleDocumentSummary}
        onFullTextClick={controller.handleDocumentFullText}
        onLinkClick={controller.handleDocumentLink}
        sortField={controller.sortField}
        sortDirection={controller.sortDirection}
        onColumnSort={controller.handleColumnSort}
      />

      {/* 🍎 페이지네이션: DocumentLibrary와 동일한 구조 */}
      {!controller.isLoading && controller.filteredDocuments.length > 0 && (
        <div className="document-pagination">
          {/* 🍎 페이지당 항목 수 선택 */}
          <div className="pagination-limit">
            <Dropdown
              value={String(controller.itemsPerPage)}
              options={ITEMS_PER_PAGE_OPTIONS}
              onChange={(value) => controller.handleLimitChange(Number(value))}
              aria-label="페이지당 항목 수"
              width={100}
            />
          </div>

          {/* 🍎 페이지 네비게이션 - 페이지가 2개 이상일 때만 표시 */}
          {controller.totalPages > 1 && (
            <div className="pagination-controls">
              <button
                className="pagination-button pagination-button--prev"
                onClick={() => handlePageChangeWithFeedback(controller.currentPage - 1, 'prev')}
                disabled={controller.currentPage === 1}
                aria-label="이전 페이지"
              >
                <span className={`pagination-arrow ${clickedButton === 'prev' ? 'pagination-arrow--clicked' : ''}`}>
                  ‹
                </span>
              </button>

              <div className="pagination-info">
                <span className="pagination-current">{controller.currentPage}</span>
                <span className="pagination-separator">/</span>
                <span className="pagination-total">{controller.totalPages}</span>
              </div>

              <button
                className="pagination-button pagination-button--next"
                onClick={() => handlePageChangeWithFeedback(controller.currentPage + 1, 'next')}
                disabled={controller.currentPage === controller.totalPages}
                aria-label="다음 페이지"
              >
                <span className={`pagination-arrow ${clickedButton === 'next' ? 'pagination-arrow--clicked' : ''}`}>
                  ›
                </span>
              </button>
            </div>
          )}

          {/* 🍎 페이지가 1개일 때 빈 공간 유지 */}
          {controller.totalPages <= 1 && <div className="pagination-spacer"></div>}
        </div>
      )}

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
      <DocumentLinkModal
        visible={controller.isLinkModalVisible}
        onClose={controller.handleLinkModalClose}
        document={controller.selectedDocumentForLink}
        onSearchCustomers={controller.searchCustomers}
        onFetchCustomerDocuments={controller.fetchCustomerDocuments}
        onLink={controller.linkDocumentToCustomer}
      />
    </div>
  )
}

export const DocumentStatusView: React.FC<DocumentStatusViewProps> = ({
  visible,
  onClose,
  onDocumentClick
}) => {
  return (
    <CenterPaneView
      visible={visible}
      title="문서 처리 현황"
      titleIcon={<SFSymbol name="chart-bar" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} style={{ color: 'var(--color-icon-doc-status)' }} />}
      onClose={onClose}
      marginTop={6}
      marginBottom={6}
      marginLeft={6}
      marginRight={6}
      className="document-status-view"
    >
      <DocumentStatusProvider>
        <DocumentStatusViewContent {...(onDocumentClick ? { onDocumentClick } : {})} />
      </DocumentStatusProvider>
    </CenterPaneView>
  )
}

export default DocumentStatusView
