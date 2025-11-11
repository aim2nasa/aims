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
import { Dropdown, Tooltip, Button } from '@/shared/ui'
import { DocumentStatusProvider } from '../../../providers/DocumentStatusProvider'
import { useDocumentStatusController } from '../../../controllers/useDocumentStatusController'
import { useDocumentStatusContext } from '../../../contexts/DocumentStatusContext'
import DocumentStatusList from '../DocumentStatusView/components/DocumentStatusList'
import DocumentDetailModal from '../DocumentStatusView/components/DocumentDetailModal'
import DocumentSummaryModal from '../DocumentStatusView/components/DocumentSummaryModal'
import DocumentFullTextModal from '../DocumentStatusView/components/DocumentFullTextModal'
import DocumentLinkModal from '../DocumentStatusView/components/DocumentLinkModal'
import { AppleConfirmModal } from '../DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal'
import { useAppleConfirmController } from '@/controllers/useAppleConfirmController'
import RefreshButton from '../../RefreshButton/RefreshButton'
import { LinkIcon } from '../components/DocumentActionIcons'
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
  /** 고객 클릭 핸들러 */
  onCustomerClick?: (customerId: string) => void
  /** 새로고침 함수 expose */
  onRefreshExpose?: (refreshFn: () => Promise<void>) => void
}

// 🍎 페이지당 항목 수 옵션
const ITEMS_PER_PAGE_OPTIONS = [
  { value: '10', label: '10개씩' },
  { value: '15', label: '15개씩' },
  { value: '20', label: '20개씩' },
  { value: '50', label: '50개씩' },
  { value: '100', label: '100개씩' }
]

/**
 * DocumentLibraryContent 내부 컴포넌트 (Pure View)
 * 🍎 DocumentStatusView와 동일한 리스트 기반 레이아웃
 */
const DocumentLibraryContent: React.FC<{
  isDeleteMode: boolean
  isBulkLinkMode: boolean
  selectedDocumentIds: Set<string>
  onSelectAllIds: (ids: string[]) => void
  onSelectDocument: (documentId: string, event: React.MouseEvent) => void
  onToggleDeleteMode: () => void
  onToggleBulkLinkMode: () => void
  onDocumentClick?: (documentId: string) => void
  onDeleteSelected: () => void
  isDeleting: boolean
  onCustomerClick?: (customerId: string) => void
  onBulkLinkClick: (documents: any[]) => void
  onRemoveDocumentsExpose?: (fn: (docIds: Set<string>) => void) => void
}> = ({ isDeleteMode, isBulkLinkMode, selectedDocumentIds, onSelectAllIds, onSelectDocument, onToggleDeleteMode, onToggleBulkLinkMode, onDocumentClick, onDeleteSelected, isDeleting, onCustomerClick, onBulkLinkClick, onRemoveDocumentsExpose }) => {
  const controller = useDocumentStatusController()
  const { state, actions } = useDocumentStatusContext()

  // 🍎 Optimistic Update 함수를 외부로 노출
  React.useEffect(() => {
    if (onRemoveDocumentsExpose) {
      onRemoveDocumentsExpose(actions.removeDocuments)
    }
  }, [onRemoveDocumentsExpose, actions.removeDocuments])

  // 🍎 고객 일괄 연결 모드 진입 시 필터 및 정렬 자동 적용
  const prevBulkLinkModeRef = React.useRef(isBulkLinkMode)
  React.useEffect(() => {
    // 모드가 false에서 true로 변경될 때만 실행
    if (isBulkLinkMode && !prevBulkLinkModeRef.current) {
      // "고객 미연결" 필터 적용
      actions.setCustomerLinkFilter('unlinked')
      // 날짜 오름차순 정렬 (가장 오래된 것이 위로)
      controller.handleColumnSort('uploadDate')
      if (controller.sortDirection === 'desc') {
        controller.handleColumnSort('uploadDate') // 한 번 더 클릭하여 asc로 변경
      }
    }
    prevBulkLinkModeRef.current = isBulkLinkMode
  }, [isBulkLinkMode])

  // 🍎 드롭다운 상태 관리
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = React.useState(false)
  const filterDropdownRef = React.useRef<HTMLDivElement>(null)

  // 🍎 드롭다운 외부 클릭 시 닫기
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setIsFilterDropdownOpen(false)
      }
    }

    if (isFilterDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isFilterDropdownOpen])

  // 마지막 업데이트 시간 포맷팅
  const formatLastUpdated = React.useCallback((date: Date | null): string => {
    if (!date) return ''
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`
  }, [])

  // 🍎 외부에서 새로고침 이벤트 받기
  React.useEffect(() => {
    const handleRefresh = () => {
      void actions.refreshDocuments()
    }
    window.addEventListener('refresh-document-library', handleRefresh)
    return () => {
      window.removeEventListener('refresh-document-library', handleRefresh)
    }
  }, [actions])

  // 🍎 문서 연결 시 자동 새로고침
  React.useEffect(() => {
    const handleDocumentLinked = () => {
      void actions.refreshDocuments()
    }
    window.addEventListener('documentLinked', handleDocumentLinked)
    return () => {
      window.removeEventListener('documentLinked', handleDocumentLinked)
    }
  }, [actions])

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
      {/* 🍎 통합 헤더: 총 문서 개수 + 검색창 + 필터 버튼 + 편집 + 실시간 + 새로고침 (한 줄) */}
      <div className="library-unified-header">
        {/* 왼쪽: 고객 일괄 연결 버튼 + 삭제 버튼 + 총 문서 개수 */}
        <div className="header-left-section">
          {/* 고객 일괄 연결 버튼 */}
          <Tooltip content={isBulkLinkMode ? '연결 완료' : '고객 일괄 연결'}>
            <button
              className={`edit-mode-icon-button ${isBulkLinkMode ? 'edit-mode-icon-button--active' : ''}`}
              onClick={onToggleBulkLinkMode}
              disabled={isDeleteMode}
              aria-label={isBulkLinkMode ? '연결 완료' : '고객 일괄 연결'}
            >
              {isBulkLinkMode ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <LinkIcon width={13} height={13} />
              )}
            </button>
          </Tooltip>

          {/* 삭제 버튼 */}
          <Tooltip content={isDeleteMode ? '삭제 완료' : '삭제'}>
            <button
              className={`edit-mode-icon-button ${isDeleteMode ? 'edit-mode-icon-button--active' : ''}`}
              onClick={onToggleDeleteMode}
              disabled={isBulkLinkMode}
              aria-label={isDeleteMode ? '삭제 완료' : '삭제'}
            >
              {isDeleteMode ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <SFSymbol
                  name="trash"
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.MEDIUM}
                  decorative={true}
                />
              )}
            </button>
          </Tooltip>

          {/* 총 문서 개수 */}
          <span className="result-count">
            총 {controller.totalCount}개의 문서
          </span>

          {/* 삭제 모드일 때: 선택된 개수 + 삭제 버튼 */}
          {isDeleteMode && (
            <>
              <span className="selected-count-inline">
                {selectedDocumentIds.size}개 선택됨
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={onDeleteSelected}
                disabled={isDeleting || selectedDocumentIds.size === 0}
              >
                {isDeleting ? '삭제 중...' : '삭제'}
              </Button>
            </>
          )}

          {/* 일괄 연결 모드일 때: 선택된 개수 + 연결 버튼 */}
          {isBulkLinkMode && (
            <>
              <span className="selected-count-inline">
                {selectedDocumentIds.size}개 선택됨
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  // 선택된 문서 ID에 해당하는 Document 객체들을 가져오기
                  const selectedDocs = state.documents.filter(doc =>
                    selectedDocumentIds.has(doc._id || '')
                  )
                  onBulkLinkClick(selectedDocs)
                }}
                disabled={selectedDocumentIds.size === 0}
              >
                연결
              </Button>
            </>
          )}
        </div>

        {/* 중앙: 검색창 + 필터 버튼 */}
        <div className="header-center-section">
          {/* 검색창 */}
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
              value={state.searchTerm}
              onChange={(e) => actions.setSearchTerm(e.target.value)}
              placeholder="파일명 검색"
              className="search-input"
            />
            {state.searchTerm && (
              <button
                className="search-clear-button"
                onClick={() => actions.setSearchTerm('')}
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

          {/* 필터 버튼 그룹 - 드롭다운 방식 */}
          <div className="library-filters">
            {/* 필터 아이콘 + 레이블 */}
            <div className="library-filters__status">
              <SFSymbol
                name="line.horizontal.3"
                size={SFSymbolSize.FOOTNOTE}
                weight={SFSymbolWeight.MEDIUM}
                className="library-filters__icon"
                decorative={true}
              />
              <span className="library-filters__label">필터:</span>
            </div>

            {/* 드롭다운 wrapper */}
            <div className="library-filters__dropdown-wrapper" ref={filterDropdownRef}>
              {/* 드롭다운 버튼 */}
              <button
                className={`library-filters__dropdown-button ${state.customerLinkFilter !== 'all' ? 'library-filters__dropdown-button--active' : ''}`}
                onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                aria-label="고객 연결 필터 선택"
                aria-expanded={isFilterDropdownOpen}
              >
                <span>
                  {state.customerLinkFilter === 'all' && '필터없음'}
                  {state.customerLinkFilter === 'linked' && '고객 연결'}
                  {state.customerLinkFilter === 'unlinked' && '고객 미연결'}
                </span>
                <SFSymbol
                  name="chevron.down"
                  size={SFSymbolSize.CAPTION_2}
                  weight={SFSymbolWeight.SEMIBOLD}
                  className="library-filters__dropdown-icon"
                  decorative={true}
                />
              </button>

              {/* 드롭다운 메뉴 */}
              {isFilterDropdownOpen && (
                <div className="library-filters__dropdown-menu">
                  <button
                    className={`library-filters__dropdown-item ${state.customerLinkFilter === 'all' ? 'library-filters__dropdown-item--selected' : ''}`}
                    onClick={() => {
                      actions.setCustomerLinkFilter('all')
                      setIsFilterDropdownOpen(false)
                    }}
                  >
                    <span>필터없음</span>
                    {state.customerLinkFilter === 'all' && (
                      <SFSymbol
                        name="checkmark"
                        size={SFSymbolSize.CAPTION_1}
                        weight={SFSymbolWeight.SEMIBOLD}
                        className="library-filters__check-icon"
                        decorative={true}
                      />
                    )}
                  </button>
                  <button
                    className={`library-filters__dropdown-item ${state.customerLinkFilter === 'linked' ? 'library-filters__dropdown-item--selected' : ''}`}
                    onClick={() => {
                      actions.setCustomerLinkFilter('linked')
                      setIsFilterDropdownOpen(false)
                    }}
                  >
                    <span>고객 연결</span>
                    {state.customerLinkFilter === 'linked' && (
                      <SFSymbol
                        name="checkmark"
                        size={SFSymbolSize.CAPTION_1}
                        weight={SFSymbolWeight.SEMIBOLD}
                        className="library-filters__check-icon"
                        decorative={true}
                      />
                    )}
                  </button>
                  <button
                    className={`library-filters__dropdown-item ${state.customerLinkFilter === 'unlinked' ? 'library-filters__dropdown-item--selected' : ''}`}
                    onClick={() => {
                      actions.setCustomerLinkFilter('unlinked')
                      setIsFilterDropdownOpen(false)
                    }}
                  >
                    <span>고객 미연결</span>
                    {state.customerLinkFilter === 'unlinked' && (
                      <SFSymbol
                        name="checkmark"
                        size={SFSymbolSize.CAPTION_1}
                        weight={SFSymbolWeight.SEMIBOLD}
                        className="library-filters__check-icon"
                        decorative={true}
                      />
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* 초기화 버튼 (전체) - 필터 활성 시에만 표시 */}
            {state.customerLinkFilter !== 'all' && (
              <Tooltip content="필터 초기화">
                <button
                  className="library-filters__clear"
                  onClick={() => {
                    actions.setCustomerLinkFilter('all')
                    setIsFilterDropdownOpen(false)
                  }}
                  aria-label="필터 초기화"
                >
                  <SFSymbol
                    name="xmark.circle.fill"
                    size={SFSymbolSize.CAPTION_1}
                    weight={SFSymbolWeight.REGULAR}
                    decorative={true}
                  />
                </button>
              </Tooltip>
            )}
          </div>
        </div>

        {/* 오른쪽: 최근 업데이트 + 폴링 + 새로고침 */}
        <div className="header-right-section">
          {controller.lastUpdated && (
            <span className="last-updated">
              최근 업데이트: {formatLastUpdated(controller.lastUpdated)}
            </span>
          )}

          <Tooltip content={controller.isPollingEnabled ? '실시간 업데이트 끄기' : '실시간 업데이트 켜기'}>
            <button
              className={`polling-toggle ${controller.isPollingEnabled ? 'polling-active' : 'polling-inactive'}`}
              onClick={controller.togglePolling}
              aria-label={controller.isPollingEnabled ? '실시간 업데이트 끄기' : '실시간 업데이트 켜기'}
            >
              <span className={`polling-dot ${controller.isPollingEnabled ? 'dot-active' : 'dot-inactive'}`}>●</span>
            </button>
          </Tooltip>

          <RefreshButton
            onClick={async () => {
              await controller.refreshDocuments();
            }}
            loading={controller.isLoading}
            tooltip="문서 현황 새로고침"
            size="small"
          />
        </div>
      </div>

      {/* 🍎 리스트: DocumentStatusView와 동일한 구조 */}
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
        isDeleteMode={isDeleteMode}
        isBulkLinkMode={isBulkLinkMode}
        selectedDocumentIds={selectedDocumentIds}
        onSelectAll={handleSelectAll}
        onSelectDocument={onSelectDocument}
        {...(onCustomerClick ? { onCustomerClick } : {})}
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
  onCustomerClick,
  onRefreshExpose,
}) => {
  const {
    error,
    searchQuery,
    searchParams,
    loadDocuments,
    clearError,
  } = useDocumentsController()

  // 🍎 Optimistic Update 함수를 저장할 ref
  const removeDocumentsFnRef = React.useRef<((docIds: Set<string>) => void) | null>(null)

  // 🍎 새로고침 함수 expose
  React.useEffect(() => {
    if (onRefreshExpose) {
      onRefreshExpose(async () => {
        // DocumentLibraryView 내부의 refresh 이벤트 발생
        window.dispatchEvent(new CustomEvent('refresh-document-library'))
      })
    }
  }, [onRefreshExpose])

  // 🍎 삭제 기능 상태
  const [isDeleteMode, setIsDeleteMode] = React.useState(false)
  const [selectedDocumentIds, setSelectedDocumentIds] = React.useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = React.useState(false)

  // 🍎 고객 일괄 연결 기능 상태
  const [isBulkLinkMode, setIsBulkLinkMode] = React.useState(false)
  const [isDocumentLinkModalVisible, setIsDocumentLinkModalVisible] = React.useState(false)
  const [selectedDocumentsForLink, setSelectedDocumentsForLink] = React.useState<any[]>([])

  // 🍎 Apple Confirm Modal 컨트롤러
  const confirmModal = useAppleConfirmController()

  // 🍎 삭제 모드 토글 핸들러
  const handleToggleDeleteMode = React.useCallback(() => {
    if (isDeleteMode) {
      setSelectedDocumentIds(new Set())
    }
    setIsDeleteMode(!isDeleteMode)
    // 삭제 모드 켜면 일괄 연결 모드는 끄기
    if (!isDeleteMode && isBulkLinkMode) {
      setIsBulkLinkMode(false)
    }
  }, [isDeleteMode, isBulkLinkMode])

  // 🍎 고객 일괄 연결 모드 토글 핸들러
  const handleToggleBulkLinkMode = React.useCallback(() => {
    if (isBulkLinkMode) {
      setSelectedDocumentIds(new Set())
    }
    setIsBulkLinkMode(!isBulkLinkMode)
    // 일괄 연결 모드 켜면 삭제 모드는 끄기
    if (!isBulkLinkMode && isDeleteMode) {
      setIsDeleteMode(false)
    }
  }, [isBulkLinkMode, isDeleteMode])

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
      confirmStyle: 'destructive',
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
      const successfulIds = results
        .filter((r) => r.success)
        .map((r) => r.docId)

      // 🍎 Optimistic Update: 즉시 로컬 상태에서 제거
      if (successfulIds.length > 0 && removeDocumentsFnRef.current) {
        removeDocumentsFnRef.current(new Set(successfulIds))
      }

      // 선택 초기화 및 삭제 모드 종료
      setSelectedDocumentIds(new Set())
      setIsDeleteMode(false)
      setIsDeleting(false) // 모달 표시 전에 상태 복원

      // 부모 컴포넌트에 삭제 완료 알림
      if (onDocumentDeleted) {
        onDocumentDeleted()
      }

      // 🔄 백그라운드로 새로고침 (정확한 상태 동기화)
      void loadDocuments(searchParams, true)

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
        {/* Error 표시 */}
        {error && (
          <div className="error-message">
            {error}
            <button onClick={clearError}>닫기</button>
          </div>
        )}

        {/* 🍎 타겟 영역: 상단 바 + 헤더 + 문서 리스트 + 페이지네이션 */}
        <DocumentStatusProvider searchQuery={searchQuery}>
          <DocumentLibraryContent
            isDeleteMode={isDeleteMode}
            isBulkLinkMode={isBulkLinkMode}
            selectedDocumentIds={selectedDocumentIds}
            onSelectAllIds={handleSelectAllIds}
            onSelectDocument={handleSelectDocument}
            onToggleDeleteMode={handleToggleDeleteMode}
            onToggleBulkLinkMode={handleToggleBulkLinkMode}
            onDeleteSelected={handleDeleteSelected}
            isDeleting={isDeleting}
            onBulkLinkClick={(documents) => {
              setSelectedDocumentsForLink(documents)
              setIsDocumentLinkModalVisible(true)
            }}
            onRemoveDocumentsExpose={(fn) => {
              removeDocumentsFnRef.current = fn
            }}
            {...(onDocumentClick && { onDocumentClick })}
            {...(onCustomerClick && { onCustomerClick })}
          />
        </DocumentStatusProvider>
      </div>

      {/* Apple Confirm Modal */}
      <AppleConfirmModal
        state={confirmModal.state}
        actions={confirmModal.actions}
      />

      {/* 일괄 고객 연결 모달 */}
      {isDocumentLinkModalVisible && (
        <DocumentStatusProvider searchQuery={searchQuery}>
          <DocumentLinkModalWrapper
            visible={isDocumentLinkModalVisible}
            documents={selectedDocumentsForLink}
            onClose={() => {
              setIsDocumentLinkModalVisible(false)
              setSelectedDocumentsForLink([])
              setSelectedDocumentIds(new Set())
              setIsBulkLinkMode(false)
            }}
            onLinkSuccess={() => {
              // 문서 목록 새로고침
              loadDocuments(searchParams)
              // 선택 상태만 초기화 (bulk link 모드는 유지)
              setSelectedDocumentIds(new Set())
              setSelectedDocumentsForLink([])
            }}
          />
        </DocumentStatusProvider>
      )}
    </CenterPaneView>
  )
}

// 일괄 연결용 DocumentLinkModal 래퍼 (DocumentStatusProvider 내부에서 사용)
const DocumentLinkModalWrapper: React.FC<{
  visible: boolean
  documents: any[]
  onClose: () => void
  onLinkSuccess: () => void
}> = ({ visible, documents, onClose }) => {
  const controller = useDocumentStatusController()

  return (
    <DocumentLinkModal
      visible={visible}
      documents={documents}
      onClose={onClose}
      onFetchCustomerDocuments={controller.fetchCustomerDocuments}
      onLink={controller.linkDocumentToCustomer}
    />
  )
}

export default DocumentLibraryView
