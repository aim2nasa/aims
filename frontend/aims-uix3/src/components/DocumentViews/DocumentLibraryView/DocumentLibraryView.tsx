/**
 * DocumentLibraryView Component
 * @since 1.0.0
 *
 * 문서 라이브러리 View 컴포넌트
 * BaseDocumentView를 확장하여 구현
 * /api/documents/status API를 사용하여 문서 리스트 표시 (DocumentStatusView와 동일)
 */

import React, { useMemo } from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import { getBreadcrumbItems } from '@/shared/lib/breadcrumbUtils'
import { useDocumentsController } from '@/controllers/useDocumentsController'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol'
import { Dropdown, Tooltip, Button, ContextMenu, useContextMenu, type ContextMenuSection, Modal } from '@/shared/ui'
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
import { formatDateTime } from '@/shared/lib/timeUtils'
import { api, ApiError } from '@/shared/lib/api'
import { errorReporter } from '@/shared/lib/errorReporter'
import { LinkIcon } from '../components/DocumentActionIcons'
import { DocumentStatusService } from '../../../services/DocumentStatusService'
import type { Document } from '@/types/documentStatus'
import { useDevModeStore } from '@/shared/store/useDevModeStore'
import { DocumentService } from '@/services/DocumentService'
import DownloadHelper from '../../../utils/downloadHelper'
import { DocumentProcessingStatusBar } from './DocumentProcessingStatusBar'
import { useDocumentStatistics } from '@/hooks/useDocumentStatistics'
import { useBatchId } from '@/hooks/useBatchId'
import './DocumentLibraryView.css'
import './DocumentLibraryView-delete.css'
import { InitialFilterBar, calculateInitialCounts, filterByInitial, type InitialType } from '@/shared/ui/InitialFilterBar'
import { usePersistedState } from '@/hooks/usePersistedState'

interface DocumentLibraryViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
  /** 문서 클릭 핸들러 */
  onDocumentClick?: (documentId: string) => void
  /** 문서 더블클릭 핸들러 (모달 프리뷰) */
  onDocumentDoubleClick?: (document: Document) => void
  /** 문서 삭제 완료 핸들러 */
  onDocumentDeleted?: () => void
  /** 고객 클릭 핸들러 */
  onCustomerClick?: (customerId: string) => void
  /** 고객 더블클릭 핸들러 (전체보기 페이지로 이동) */
  onCustomerDoubleClick?: (customerId: string) => void
  /** 새로고침 함수 expose */
  onRefreshExpose?: (refreshFn: () => Promise<void>) => void
  /** 뷰 이동 핸들러 */
  onNavigate?: (viewKey: string) => void
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
  initialType: InitialType
  onInitialTypeChange: (type: InitialType) => void
  selectedInitial: string | null
  onSelectedInitialChange: (initial: string | null) => void
  isDeleteMode: boolean
  isBulkLinkMode: boolean
  selectedDocumentIds: Set<string>
  onSelectAllIds: (ids: string[]) => void
  onSelectDocument: (documentId: string, event: React.MouseEvent) => void
  onToggleDeleteMode: () => void
  onToggleBulkLinkMode: () => void
  onDocumentClick?: (documentId: string) => void
  onDocumentDoubleClick?: (document: Document) => void
  onDeleteSelected: () => void
  onDeleteSingleDocument: (documentId: string, documentName: string) => Promise<void>
  onDeleteAll?: () => void
  isDeleting: boolean
  onCustomerClick?: (customerId: string) => void
  onCustomerDoubleClick?: (customerId: string) => void
  onBulkLinkClick: (documents: Document[]) => void
  onRemoveDocumentsExpose?: (fn: (docIds: Set<string>) => void) => void
  onNavigate?: (viewKey: string) => void
}> = ({ initialType, onInitialTypeChange, selectedInitial, onSelectedInitialChange, isDeleteMode, isBulkLinkMode, selectedDocumentIds, onSelectAllIds, onSelectDocument, onToggleDeleteMode, onToggleBulkLinkMode, onDocumentClick, onDocumentDoubleClick, onDeleteSelected, onDeleteSingleDocument, onDeleteAll, isDeleting, onCustomerClick, onCustomerDoubleClick, onBulkLinkClick, onRemoveDocumentsExpose, onNavigate }) => {
  // 개발자 모드 상태
  const { isDevMode } = useDevModeStore()

  const controller = useDocumentStatusController()
  const { state, actions } = useDocumentStatusContext()

  // 🔴 현재 업로드 배치 ID (실시간 추적 - sessionStorage 변경 시 즉시 반영)
  const currentBatchId = useBatchId()

  // 문서 처리 현황 통계 (Status Bar용)
  // 1. 전체 라이브러리 통계
  const { statistics: docStats, isLoading: statsLoading } = useDocumentStatistics()
  // 2. 현재 배치 통계 (batchId가 있을 때만)
  const { statistics: batchStats, isLoading: batchLoading } = useDocumentStatistics({
    enabled: !!currentBatchId,
    batchId: currentBatchId
  })

  // 초성 필터가 적용된 문서 목록 (연결된 고객명 기준)
  const initialFilteredDocuments = React.useMemo(() => {
    const getCustomerName = (doc: Document) => {
      // 연결된 고객명으로 필터 (초성 필터는 고객명에만 적용)
      return doc.customer_relation?.customer_name || ''
    }
    return filterByInitial(controller.filteredDocuments, selectedInitial, getCustomerName)
  }, [controller.filteredDocuments, selectedInitial])

  // 페이지네이션이 적용된 초성 필터 결과
  // 초성 필터가 없으면 API에서 이미 페이지네이션된 데이터 사용
  // 초성 필터가 있으면 클라이언트에서 페이지네이션 적용
  const paginatedFilteredDocuments = React.useMemo(() => {
    if (!selectedInitial) {
      // 초성 필터 없음: API가 이미 페이지네이션한 결과 사용
      return controller.filteredDocuments
    }
    // 초성 필터 있음: 클라이언트에서 페이지네이션
    const startIndex = (controller.currentPage - 1) * controller.itemsPerPage
    const endIndex = startIndex + controller.itemsPerPage
    return initialFilteredDocuments.slice(startIndex, endIndex)
  }, [selectedInitial, controller.filteredDocuments, initialFilteredDocuments, controller.currentPage, controller.itemsPerPage])

  // 초성 필터 적용 후 총 페이지 수
  // 초성 필터가 없으면 API의 totalPages 사용, 있으면 로컬 계산
  const filteredTotalPages = React.useMemo(() => {
    if (!selectedInitial) {
      // 초성 필터 없음: API의 totalPages 사용
      return state.totalPages
    }
    // 초성 필터 있음: 로컬에서 계산 (클라이언트 필터링)
    return Math.max(1, Math.ceil(initialFilteredDocuments.length / controller.itemsPerPage))
  }, [selectedInitial, state.totalPages, initialFilteredDocuments.length, controller.itemsPerPage])

  // 초성 카운트 계산 (연결된 고객명 기준)
  const initialCounts = React.useMemo(() => {
    const getCustomerName = (doc: Document) => {
      // 연결된 고객명으로 카운트 (초성 필터는 고객명에만 적용)
      return doc.customer_relation?.customer_name || ''
    }
    return calculateInitialCounts(controller.filteredDocuments, getCustomerName)
  }, [controller.filteredDocuments])

  // 🍎 Optimistic Update 함수를 외부로 노출
  React.useEffect(() => {
    if (onRemoveDocumentsExpose) {
      onRemoveDocumentsExpose(actions.removeDocuments)
    }
  }, [onRemoveDocumentsExpose, actions.removeDocuments])

  // 🍎 고객 일괄 연결 모드 진입 시 정렬 자동 적용
  const prevBulkLinkModeRef = React.useRef(isBulkLinkMode)
  React.useEffect(() => {
    // 모드가 false에서 true로 변경될 때만 실행
    if (isBulkLinkMode && !prevBulkLinkModeRef.current) {
      // 날짜 오름차순 정렬 (가장 오래된 것이 위로)
      controller.handleColumnSort('uploadDate')
      if (controller.sortDirection === 'desc') {
        controller.handleColumnSort('uploadDate') // 한 번 더 클릭하여 asc로 변경
      }
    }
    prevBulkLinkModeRef.current = isBulkLinkMode
  }, [isBulkLinkMode])

  // 마지막 업데이트 시간 포맷팅
  const formatLastUpdated = React.useCallback((date: Date | null): string => {
    if (!date) return ''
    return formatDateTime(date)
  }, [])

  // 🍎 문서 컨텍스트 메뉴
  const documentContextMenu = useContextMenu()
  const [contextMenuDocument, setContextMenuDocument] = React.useState<Document | null>(null)

  // 🍎 도움말 모달
  const [helpModalVisible, setHelpModalVisible] = React.useState(false)

  // 🍎 문서 컨텍스트 메뉴 핸들러
  const handleDocumentContextMenu = React.useCallback((document: Document, event: React.MouseEvent) => {
    setContextMenuDocument(document)
    documentContextMenu.open(event)
  }, [documentContextMenu])

  // 🍎 문서 컨텍스트 메뉴 섹션
  const documentContextMenuSections: ContextMenuSection[] = React.useMemo(() => {
    if (!contextMenuDocument) return []

    const documentId = contextMenuDocument._id || contextMenuDocument.id || ''

    return [
      {
        id: 'view',
        items: [
          {
            id: 'preview',
            label: '미리보기',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ),
            onClick: () => {
              // onDocumentClick이 있으면 Right Pane 프리뷰, 없으면 상세 모달
              if (onDocumentClick && documentId) {
                onDocumentClick(documentId)
              } else {
                controller.handleDocumentClick(contextMenuDocument)
              }
            }
          },
          {
            id: 'summary',
            label: 'AI 요약',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M16 13H8" />
                <path d="M16 17H8" />
                <path d="M10 9H8" />
              </svg>
            ),
            onClick: () => controller.handleDocumentSummary(contextMenuDocument)
          }
        ]
      },
      {
        id: 'actions',
        items: [
          {
            id: 'download',
            label: '다운로드',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            ),
            onClick: async () => {
              try {
                // 문서 상세 조회하여 다운로드 경로 획득
                const response = await DocumentStatusService.getDocumentDetailViaWebhook(documentId)
                if (response) {
                  // API 응답 구조: { data: { raw: { upload: { destPath } } } }
                  const apiResponse = response as Record<string, unknown>
                  const data = apiResponse['data'] as Record<string, unknown> | undefined
                  const raw = (data?.['raw'] || apiResponse['raw'] || response) as Record<string, unknown>

                  await DownloadHelper.downloadDocument({
                    _id: documentId,
                    ...raw
                  })
                }
              } catch (error) {
                console.error('다운로드 실패:', error)
                errorReporter.reportApiError(error as Error, { component: 'DocumentLibraryView.handleDownload' })
              }
            }
          }
        ]
      },
      {
        id: 'danger',
        items: [
          {
            id: 'delete',
            label: '삭제',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            ),
            danger: true,
            onClick: async () => {
              if (documentId) {
                const documentName = DocumentStatusService.extractFilename(contextMenuDocument) || '이 문서'
                await onDeleteSingleDocument(documentId, documentName)
              }
            }
          }
        ]
      }
    ]
  }, [contextMenuDocument, controller, onDocumentClick, onDeleteSingleDocument])

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
      const allIds = paginatedFilteredDocuments
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
          {/* 고객 일괄 연결 버튼 (개발자 모드에서만 표시) */}
          {isDevMode && (
            <Tooltip content={isBulkLinkMode ? '연결 완료' : '고객 일괄 연결'}>
              <button
                type="button"
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
          )}

          {/* 삭제 버튼 */}
          <Tooltip content={isDeleteMode ? '삭제 완료' : '삭제'}>
            <button
              type="button"
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

          {/* 총 문서 개수 및 현재 표시 범위 */}
          <span className="result-count">
            {state.totalCount > 0 ? (
              <>
                {((state.currentPage - 1) * state.itemsPerPage) + 1}-
                {Math.min(state.currentPage * state.itemsPerPage, state.totalCount)}
                {' / '}총 {state.totalCount}개
              </>
            ) : (
              '문서 없음'
            )}
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
              {import.meta.env.DEV && onDeleteAll && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onDeleteAll}
                  disabled={isDeleting || state.totalCount === 0}
                >
                  전체 삭제 ({state.totalCount})
                </Button>
              )}
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

      {/* 문서 처리 현황 Status Bar (2분할: 현재 업로드 + 전체 라이브러리) */}
      <DocumentProcessingStatusBar
        statistics={docStats}
        batchStatistics={batchStats}
        isLoading={statsLoading || batchLoading}
      />

      {/* 초성 필터 바 */}
      <InitialFilterBar
        initialType={initialType}
        onInitialTypeChange={onInitialTypeChange}
        selectedInitial={selectedInitial}
        onSelectedInitialChange={onSelectedInitialChange}
        initialCounts={initialCounts}
        countLabel="개"
        targetLabel="문서"
        className="library-initial-filter"
      />

      {/* 🍎 리스트: DocumentStatusView와 동일한 구조 */}
      <DocumentStatusList
        documents={paginatedFilteredDocuments}
        isLoading={controller.isLoading}
        isEmpty={initialFilteredDocuments.length === 0}
        error={controller.error}
        {...(onDocumentClick ? { onDocumentClick } : {})}
        {...(onDocumentDoubleClick ? { onDocumentDoubleClick } : {})}
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
        onRowContextMenu={handleDocumentContextMenu}
        {...(onCustomerClick ? { onCustomerClick } : {})}
        {...(onCustomerDoubleClick ? { onCustomerDoubleClick } : {})}
        {...(onNavigate ? { onNavigate } : {})}
        onRefresh={controller.refreshDocuments}
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
          {filteredTotalPages > 1 && (
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
                <span className="pagination-total">{filteredTotalPages}</span>
              </div>

              <button
                className="pagination-button pagination-button--next"
                onClick={() => handlePageChangeWithFeedback(controller.currentPage + 1, 'next')}
                disabled={controller.currentPage === filteredTotalPages}
                aria-label="다음 페이지"
              >
                <span className={`pagination-arrow ${clickedButton === 'next' ? 'pagination-arrow--clicked' : ''}`}>
                  ›
                </span>
              </button>
            </div>
          )}

          {/* 🍎 페이지가 1개일 때 빈 공간 유지 */}
          {filteredTotalPages <= 1 && <div className="pagination-spacer"></div>}
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

      {/* 🍎 문서 컨텍스트 메뉴 */}
      <ContextMenu
        visible={documentContextMenu.isOpen}
        position={documentContextMenu.position}
        sections={documentContextMenuSections}
        onClose={documentContextMenu.close}
        showHelp
        helpContext="documents"
        onHelpClick={() => setHelpModalVisible(true)}
      />

      {/* 🍎 문서 보관함 도움말 모달 */}
      <Modal
        visible={helpModalVisible}
        onClose={() => setHelpModalVisible(false)}
        title="📄 문서 보관함 사용법"
        size="md"
      >
        <div className="help-modal-content">
          <div className="help-modal-section">
            <p><strong>🔍 문서 찾기</strong></p>
            <ul>
              <li><strong>"홍길동"</strong> 검색 → 해당 고객의 문서만 표시</li>
              <li><strong>"계약서"</strong> 검색 → 파일명에 포함된 문서</li>
              <li>필터로 <strong>처리 상태별</strong> 분류 가능</li>
            </ul>
          </div>
          <div className="help-modal-section">
            <p><strong>👁️ 문서 미리보기</strong></p>
            <ul>
              <li>문서 <strong>클릭</strong> → 오른쪽에 미리보기</li>
              <li>문서 <strong>우클릭</strong> → AI 요약, 다운로드 메뉴</li>
            </ul>
          </div>
          <div className="help-modal-section">
            <p><strong>🗑️ 문서 삭제</strong></p>
            <ul>
              <li>상단의 <strong>삭제 버튼</strong> 클릭 → 삭제 모드 활성화</li>
              <li>삭제할 문서 선택 후 <strong>삭제 버튼</strong> 클릭</li>
            </ul>
          </div>
        </div>
      </Modal>
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
  onDocumentDoubleClick,
  onDocumentDeleted,
  onCustomerClick,
  onCustomerDoubleClick,
  onRefreshExpose,
  onNavigate,
}) => {
  const {
    error,
    searchQuery,
    searchParams,
    loadDocuments,
    clearError,
  } = useDocumentsController()

  // Breadcrumb 항목 생성
  const breadcrumbItems = useMemo(() => getBreadcrumbItems('documents-library'), [])

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

  // 초성 필터 상태 (F5 이후에도 유지)
  const [initialType, setInitialType] = usePersistedState<InitialType>('document-library-initial-type', 'korean')
  const [selectedInitial, setSelectedInitial] = usePersistedState<string | null>('document-library-selected-initial', null)
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

      // 선택된 모든 문서 삭제 (api 모듈 사용 - 토큰/헤더 자동 처리)
      const deletePromises = Array.from(selectedDocumentIds).map(async (docId) => {
        try {
          await api.delete(`/api/documents/${docId}`)
          return { success: true, docId }
        } catch (error) {
          const message = error instanceof ApiError ? error.message : `Failed to delete document ${docId}`
          console.error(`Error deleting document ${docId}:`, message)
          errorReporter.reportApiError(error as Error, { component: 'DocumentLibraryView.handleDeleteSelected.item', payload: { docId } })
          return { success: false, docId, error }
        }
      })

      const results = await Promise.all(deletePromises)
      const failedDeletes = results.filter((r) => !r.success)

      // 실패한 경우 오류 모달 표시
      if (failedDeletes.length > 0) {
        setIsDeleting(false)
        await confirmModal.actions.openModal({
          title: '삭제 실패',
          message: `${failedDeletes.length}개의 문서 삭제에 실패했습니다.`,
          confirmText: '확인',
          showCancel: false,
        })
      }

      // 🔄 삭제 완료 후 페이지 새로고침 (CLAUDE.md 규칙 12-1)
      window.location.reload()
    } catch (error) {
      console.error('Error in handleDeleteSelected:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentLibraryView.handleDeleteSelected' })
      setIsDeleting(false) // 에러 발생 시에도 상태 복원
      await confirmModal.actions.openModal({
        title: '삭제 실패',
        message: '문서 삭제 중 오류가 발생했습니다.',
        confirmText: '확인',
        showCancel: false,
      })
    }
  }, [selectedDocumentIds, confirmModal])

  // 🍎 단일 문서 삭제 핸들러 (컨텍스트 메뉴용)
  const handleDeleteSingleDocument = React.useCallback(async (documentId: string, documentName: string) => {
    // 확인 모달 표시
    const confirmed = await confirmModal.actions.openModal({
      title: '문서 삭제',
      message: `"${documentName}"을(를) 삭제하시겠습니까?\n\n삭제된 문서는 복구할 수 없습니다.`,
      confirmText: '삭제',
      cancelText: '취소',
      showCancel: true,
      confirmStyle: 'destructive',
      iconType: 'warning',
    })

    if (!confirmed) return

    try {
      setIsDeleting(true)

      // API 호출하여 삭제
      await api.delete(`/api/documents/${documentId}`)

      // 🔄 삭제 완료 후 페이지 새로고침 (CLAUDE.md 규칙 12-1)
      window.location.reload()

    } catch (error) {
      console.error('Error in handleDeleteSingleDocument:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentLibraryView.handleDeleteSingleDocument' })
      setIsDeleting(false)

      await confirmModal.actions.openModal({
        title: '삭제 실패',
        message: '문서 삭제 중 오류가 발생했습니다.',
        confirmText: '확인',
        showCancel: false,
      })
    }
  }, [confirmModal])

  // 🍎 전체 문서 삭제 핸들러 (개발자 모드 전용)
  const handleDeleteAllDocuments = React.useCallback(async () => {
    const confirmed = await confirmModal.actions.openModal({
      title: '전체 문서 삭제',
      message: '모든 문서를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.',
      confirmText: '전체 삭제',
      cancelText: '취소',
      showCancel: true,
      confirmStyle: 'destructive',
      iconType: 'warning',
    })

    if (!confirmed) return

    try {
      setIsDeleting(true)
      const result = await DocumentService.deleteAllDocuments()
      console.log(`🗑️ [DEV] 문서 전체 삭제 완료: ${result.deletedCount}건`)
      window.location.reload()
    } catch (error) {
      console.error('Error in handleDeleteAllDocuments:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentLibraryView.handleDeleteAllDocuments' })
      setIsDeleting(false)
      await confirmModal.actions.openModal({
        title: '삭제 실패',
        message: '전체 문서 삭제 중 오류가 발생했습니다.',
        confirmText: '확인',
        showCancel: false,
      })
    }
  }, [confirmModal])

  return (
    <CenterPaneView visible={visible} onClose={onClose} title="전체 문서 보기" titleIcon={<span className="menu-icon-purple"><SFSymbol name="books-vertical" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} /></span>} breadcrumbItems={breadcrumbItems} onBreadcrumbClick={onNavigate}>
      <div className="document-library-view">
        {/* Error 표시 */}
        {error && (
          <div className="error-message">
            {error}
            <button onClick={clearError}>닫기</button>
          </div>
        )}

        {/* 🍎 타겟 영역: 상단 바 + 헤더 + 문서 리스트 + 페이지네이션 */}
        <DocumentStatusProvider searchQuery={searchQuery} fileScope="excludeMyFiles">
          <DocumentLibraryContent
            initialType={initialType}
            onInitialTypeChange={setInitialType}
            selectedInitial={selectedInitial}
            onSelectedInitialChange={setSelectedInitial}
            isDeleteMode={isDeleteMode}
            isBulkLinkMode={isBulkLinkMode}
            selectedDocumentIds={selectedDocumentIds}
            onSelectAllIds={handleSelectAllIds}
            onSelectDocument={handleSelectDocument}
            onToggleDeleteMode={handleToggleDeleteMode}
            onToggleBulkLinkMode={handleToggleBulkLinkMode}
            onDeleteSelected={handleDeleteSelected}
            onDeleteSingleDocument={handleDeleteSingleDocument}
            onDeleteAll={handleDeleteAllDocuments}
            isDeleting={isDeleting}
            onBulkLinkClick={(documents) => {
              setSelectedDocumentsForLink(documents)
              setIsDocumentLinkModalVisible(true)
            }}
            onRemoveDocumentsExpose={(fn) => {
              removeDocumentsFnRef.current = fn
            }}
            {...(onDocumentClick && { onDocumentClick })}
            {...(onDocumentDoubleClick && { onDocumentDoubleClick })}
            {...(onCustomerClick && { onCustomerClick })}
            {...(onCustomerDoubleClick && { onCustomerDoubleClick })}
            {...(onNavigate && { onNavigate })}
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
        <DocumentStatusProvider searchQuery={searchQuery} fileScope="excludeMyFiles">
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
  documents: Document[]
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
