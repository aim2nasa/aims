/**
 * DocumentLibraryView Component
 * @since 1.0.0
 *
 * 문서 라이브러리 View 컴포넌트
 * BaseDocumentView를 확장하여 구현
 * /api/documents/status API를 사용하여 문서 리스트 표시 (DocumentStatusView와 동일)
 */

import React from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import { useDocumentsController } from '@/controllers/useDocumentsController'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol'
import { Button, Dropdown } from '@/shared/ui'
import { DocumentStatusProvider } from '../../../providers/DocumentStatusProvider'
import { useDocumentStatusController } from '../../../controllers/useDocumentStatusController'
import { useDocumentStatusContext } from '../../../contexts/DocumentStatusContext'
import DocumentStatusHeader from '../DocumentStatusView/components/DocumentStatusHeader'
import DocumentStatusList from '../DocumentStatusView/components/DocumentStatusList'
import DocumentDetailModal from '../DocumentStatusView/components/DocumentDetailModal'
import DocumentSummaryModal from '../DocumentStatusView/components/DocumentSummaryModal'
import DocumentFullTextModal from '../DocumentStatusView/components/DocumentFullTextModal'
import DocumentLinkModal from '../DocumentStatusView/components/DocumentLinkModal'
import { AppleConfirmModal } from '../DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal'
import { useAppleConfirmController } from '@/controllers/useAppleConfirmController'
import './DocumentLibraryView.css'
import './DocumentLibraryView-delete.css'

interface DocumentLibraryViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
  /** 문서 클릭 핸들러 */
  onDocumentClick?: (documentId: string) => void
  /** 문서 삭제 완료 핸들러 */
  onDocumentDeleted?: () => void
}

// 🍎 페이지당 항목 수 옵션
const ITEMS_PER_PAGE_OPTIONS = [
  { value: '10', label: '10개씩' },
  { value: '20', label: '20개씩' },
  { value: '50', label: '50개씩' },
  { value: '100', label: '100개씩' }
]

/**
 * DocumentLibraryContent 내부 컴포넌트 (Pure View)
 * 🍎 DocumentStatusView와 동일한 리스트 기반 레이아웃
 */
const DocumentLibraryContent: React.FC<{
  searchQuery: string
  isDeleteMode: boolean
  selectedDocumentIds: Set<string>
  onSelectAllIds: (ids: string[]) => void
  onSelectDocument: (documentId: string, event: React.MouseEvent) => void
  onToggleDeleteMode: () => void
  onDocumentClick?: (documentId: string) => void
}> = ({ searchQuery, isDeleteMode, selectedDocumentIds, onSelectAllIds, onSelectDocument, onToggleDeleteMode, onDocumentClick }) => {
  const controller = useDocumentStatusController()
  const { actions } = useDocumentStatusContext()

  // 🍎 외부 검색어를 Context에 동기화
  React.useEffect(() => {
    actions.setSearchTerm(searchQuery)
  }, [searchQuery, actions])

  // 🍎 전체 선택 핸들러 (Context의 documents 사용)
  const handleSelectAll = React.useCallback((checked: boolean) => {
    if (checked) {
      const allIds = controller.paginatedDocuments
        .map(doc => doc._id ?? doc.id ?? '')
        .filter(id => id !== '')
      onSelectAllIds(allIds)
    } else {
      onSelectAllIds([])
    }
  }, [controller.paginatedDocuments, onSelectAllIds])

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
    <>
      {/* 🍎 헤더: 컨트롤 + 필터 (한 줄) */}
      <DocumentStatusHeader
        isPollingEnabled={controller.isPollingEnabled}
        onTogglePolling={controller.togglePolling}
        onRefresh={controller.refreshDocuments}
        isLoading={controller.isLoading}
        documentsCount={controller.totalCount}
        lastUpdated={controller.lastUpdated}
        showEditButton={true}
        isEditMode={isDeleteMode}
        onToggleEditMode={onToggleDeleteMode}
      />

      {/* 🍎 리스트: DocumentStatusView와 동일한 구조 */}
      <DocumentStatusList
        documents={controller.paginatedDocuments}
        isLoading={controller.isLoading}
        isEmpty={controller.filteredDocuments.length === 0}
        error={controller.error}
        {...(onDocumentClick && { onDocumentClick })}
        onDetailClick={controller.handleDocumentClick}
        onSummaryClick={controller.handleDocumentSummary}
        onFullTextClick={controller.handleDocumentFullText}
        onLinkClick={controller.handleDocumentLink}
        sortField={controller.sortField}
        sortDirection={controller.sortDirection}
        onColumnSort={controller.handleColumnSort}
        isDeleteMode={isDeleteMode}
        selectedDocumentIds={selectedDocumentIds}
        onSelectAll={handleSelectAll}
        onSelectDocument={onSelectDocument}
      />

      {/* 🍎 페이지네이션: DocumentStatusView와 동일한 구조 */}
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
    </>
  )
}

/**
 * DocumentLibraryView React 컴포넌트
 *
 * 문서 라이브러리 및 리스트 표시 기능을 위한 View
 * 6px 마진으로 설정된 약간 넓은 간격 사용
 * 애플 디자인 철학 준수 - 서브틀하고 깔끔한 인터페이스
 *
 * @example
 * ```tsx
 * <DocumentLibraryView
 *   visible={isVisible}
 *   onClose={handleClose}
 * />
 * ```
 */
export const DocumentLibraryView: React.FC<DocumentLibraryViewProps> = ({
  visible,
  onClose,
  onDocumentClick,
  onDocumentDeleted,
}) => {
  const {
    error,
    searchQuery,
    searchParams,
    loadDocuments,
    handleSearchChange,
    clearError,
  } = useDocumentsController()

  // 🍎 삭제 기능 상태
  const [isDeleteMode, setIsDeleteMode] = React.useState(false)
  const [selectedDocumentIds, setSelectedDocumentIds] = React.useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = React.useState(false)

  // 🍎 Apple Confirm Modal 컨트롤러
  const confirmModal = useAppleConfirmController()

  // 🍎 삭제 모드 토글 핸들러
  const handleToggleDeleteMode = React.useCallback(() => {
    if (isDeleteMode) {
      setSelectedDocumentIds(new Set())
    }
    setIsDeleteMode(!isDeleteMode)
  }, [isDeleteMode])

  // 🍎 전체 선택/해제 핸들러 (DocumentLibraryContent에서 ID 배열 전달받음)
  const handleSelectAllIds = React.useCallback((ids: string[]) => {
    setSelectedDocumentIds(new Set(ids))
  }, [])

  // 🍎 개별 선택/해제 핸들러
  const handleSelectDocument = React.useCallback((documentId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    setSelectedDocumentIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(documentId)) {
        newSet.delete(documentId)
      } else {
        newSet.add(documentId)
      }
      return newSet
    })
  }, [])

  // 🍎 문서 삭제 핸들러
  const handleDeleteSelected = React.useCallback(async () => {
    if (selectedDocumentIds.size === 0) {
      await confirmModal.actions.openModal({
        title: '선택 항목 없음',
        message: '삭제할 문서를 선택해주세요.',
        confirmText: '확인',
        showCancel: false,
      })
      return
    }

    // 확인 모달 표시
    const confirmed = await confirmModal.actions.openModal({
      title: '문서 삭제',
      message: `선택한 ${selectedDocumentIds.size}개의 문서를 삭제하시겠습니까?`,
      confirmText: '삭제',
      cancelText: '취소',
      showCancel: true,
    })

    if (!confirmed) return

    try {
      setIsDeleting(true)

      // 선택된 모든 문서 삭제
      const deletePromises = Array.from(selectedDocumentIds).map(async (docId) => {
        try {
          const response = await fetch(`/api/documents/${docId}`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
          })

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.message || `Failed to delete document ${docId}`)
          }

          return { success: true, docId }
        } catch (error) {
          console.error(`Error deleting document ${docId}:`, error)
          return { success: false, docId, error }
        }
      })

      const results = await Promise.all(deletePromises)
      const failedDeletes = results.filter((r) => !r.success)

      // 선택 초기화 및 삭제 모드 종료
      setSelectedDocumentIds(new Set())
      setIsDeleteMode(false)
      setIsDeleting(false) // 모달 표시 전에 상태 복원

      // 부모 컴포넌트에 삭제 완료 알림
      if (onDocumentDeleted) {
        onDocumentDeleted()
      }

      // 문서 목록 새로고침
      await loadDocuments(searchParams, true)

      // 결과 모달 표시 (비동기, 상태 복원 후)
      if (failedDeletes.length > 0) {
        // 일부 삭제 실패
        await confirmModal.actions.openModal({
          title: '삭제 실패',
          message: `${failedDeletes.length}개의 문서 삭제에 실패했습니다.`,
          confirmText: '확인',
          showCancel: false,
        })
      } else {
        // 모두 성공
        await confirmModal.actions.openModal({
          title: '삭제 완료',
          message: `${selectedDocumentIds.size}개의 문서가 삭제되었습니다.`,
          confirmText: '확인',
          showCancel: false,
        })
      }
    } catch (error) {
      console.error('Error in handleDeleteSelected:', error)
      setIsDeleting(false) // 에러 발생 시에도 상태 복원
      await confirmModal.actions.openModal({
        title: '삭제 실패',
        message: '문서 삭제 중 오류가 발생했습니다.',
        confirmText: '확인',
        showCancel: false,
      })
    }
  }, [selectedDocumentIds, confirmModal, onDocumentDeleted, loadDocuments, searchParams])

  return (
    <CenterPaneView visible={visible} onClose={onClose} title="문서 라이브러리">
      <div className="document-library-view">
        {/* 🍎 상단 검색 영역 */}
        <div className="library-search-bar">
          {/* 검색 바 */}
          <div className="search-input-wrapper">
            <SFSymbol
              name="magnifyingglass"
              size={SFSymbolSize.CAPTION_1}
              weight={SFSymbolWeight.MEDIUM}
              className="search-icon"
              decorative={true}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="파일명으로 검색..."
              className="search-input"
            />
            {searchQuery && (
              <button
                className="search-clear-button"
                onClick={() => handleSearchChange('')}
                aria-label="검색어 지우기"
              >
                <SFSymbol
                  name="xmark.circle.fill"
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.REGULAR}
                  decorative={true}
                />
              </button>
            )}
          </div>
        </div>

        {/* Error 표시 */}
        {error && (
          <div className="error-message">
            {error}
            <button onClick={clearError}>닫기</button>
          </div>
        )}

        {/* 삭제 모드 액션 바 - 선택된 항목이 있을 때만 표시 */}
        {isDeleteMode && selectedDocumentIds.size > 0 && (
          <div className="document-library-actions">
            <div className="actions-left">
              <span className="selected-count">{selectedDocumentIds.size}개 선택됨</span>
            </div>
            <div className="actions-right">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteSelected}
                disabled={isDeleting}
              >
                {isDeleting ? '삭제 중...' : '삭제'}
              </Button>
            </div>
          </div>
        )}

        {/* 🍎 타겟 영역: 헤더 + 문서 리스트 + 페이지네이션 */}
        <DocumentStatusProvider>
          <DocumentLibraryContent
            searchQuery={searchQuery}
            isDeleteMode={isDeleteMode}
            selectedDocumentIds={selectedDocumentIds}
            onSelectAllIds={handleSelectAllIds}
            onSelectDocument={handleSelectDocument}
            onToggleDeleteMode={handleToggleDeleteMode}
            {...(onDocumentClick && { onDocumentClick })}
          />
        </DocumentStatusProvider>
      </div>

      {/* Apple Confirm Modal */}
      <AppleConfirmModal
        state={confirmModal.state}
        actions={confirmModal.actions}
      />
    </CenterPaneView>
  )
}

export default DocumentLibraryView
