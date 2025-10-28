/**
 * DocumentLibraryView Component
 * @since 1.0.0
 *
 * 문서 라이브러리 View 컴포넌트
 * BaseDocumentView를 확장하여 구현
 * /api/documents API를 사용하여 문서 리스트 표시
 */

import React from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import { useDocumentsController } from '@/controllers/useDocumentsController'
import { DocumentUtils } from '@/entities/document'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol'
import { Dropdown, type DropdownOption, Tooltip, Button } from '@/shared/ui'
import {
  DocumentIcon,
  EyeIcon,
  LinkIcon,
  SummaryIcon
} from '../components/DocumentActionIcons'
import RefreshButton from '../../RefreshButton/RefreshButton'
import { DocumentStatusService } from '../../../services/DocumentStatusService'
import { CustomerService } from '../../../services/customerService'
import { DocumentService } from '../../../services/DocumentService'
import type { CustomerSearchResponse } from '@/entities/customer'
import type { DocumentCustomerRelation } from '../../../types/documentStatus'
import DocumentDetailModal from '../DocumentStatusView/components/DocumentDetailModal'
import DocumentSummaryModal from '../DocumentStatusView/components/DocumentSummaryModal'
import DocumentFullTextModal from '../DocumentStatusView/components/DocumentFullTextModal'
import DocumentLinkModal from '../DocumentStatusView/components/DocumentLinkModal'
import { AppleConfirmModal } from '../DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal'
import { useAppleConfirmController } from '@/controllers/useAppleConfirmController'
import { usePersistedState } from '@/hooks/usePersistedState'
import './DocumentLibraryView.css'
import './DocumentLibraryView-delete.css'

// 정렬 필드 타입 정의
type SortField = 'filename' | 'size' | 'uploadDate' | 'type' | 'status';
type SortDirection = 'asc' | 'desc';

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

// 정렬 옵션 정의
const SORT_OPTIONS: DropdownOption[] = [
  { value: 'uploadDate_desc', label: '최신순' },
  { value: 'uploadDate_asc', label: '오래된순' },
  { value: 'filename_asc', label: '이름순 (가나다)' },
  { value: 'filename_desc', label: '이름순 (하파타)' },
  { value: 'size_asc', label: '크기순 (큰 것부터)' },
  { value: 'size_desc', label: '크기순 (작은 것부터)' },
  { value: 'fileType_asc', label: '파일 형식순' },
]

// 페이지당 항목 수 옵션 정의
const ITEMS_PER_PAGE_OPTIONS: DropdownOption[] = [
  { value: '10', label: '10개씩' },
  { value: '20', label: '20개씩' },
  { value: '50', label: '50개씩' },
  { value: '100', label: '100개씩' },
]

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
    documents,
    isLoading,
    isInitialLoad,
    error,
    searchQuery,
    searchParams,
    searchResultMessage,
    isEmpty,
    currentPage,
    totalPages,
    itemsPerPage,
    loadDocuments,
    handleSearchChange,
    handleSortChange,
    handlePageChange,
    handleLimitChange,
    clearError,
  } = useDocumentsController()

  // 🍎 Progressive Disclosure: 페이지네이션 버튼 클릭 피드백 상태
  const [clickedButton, setClickedButton] = React.useState<'prev' | 'next' | null>(null)

  // 🍎 칼럼 헤더 정렬 상태
  const [sortField, setSortField] = usePersistedState<SortField | null>('document-library-sort-field', null);
  const [sortDirection, setSortDirection] = usePersistedState<SortDirection>('document-library-sort-direction', 'asc');

  // 🍎 모달 상태 관리
  // NOTE: 모달에 전달하는 document는 API 응답 타입(types/documentStatus)
  // DocumentStatusService에서 반환되는 구조를 그대로 모달에 전달
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedDocument, setSelectedDocument] = React.useState<any | null>(null)
  const [isDetailModalVisible, setDetailModalVisible] = React.useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedDocumentForSummary, setSelectedDocumentForSummary] = React.useState<any | null>(null)
  const [isSummaryModalVisible, setSummaryModalVisible] = React.useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedDocumentForFullText, setSelectedDocumentForFullText] = React.useState<any | null>(null)
  const [isFullTextModalVisible, setFullTextModalVisible] = React.useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedDocumentForLink, setSelectedDocumentForLink] = React.useState<any | null>(null)
  const [isLinkModalVisible, setLinkModalVisible] = React.useState(false)

  // 🍎 삭제 기능 상태
  const [isDeleteMode, setIsDeleteMode] = React.useState(false) // 삭제 모드 토글
  const [selectedDocumentIds, setSelectedDocumentIds] = React.useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = React.useState(false)

  // 🍎 Apple Confirm Modal 컨트롤러
  const confirmModal = useAppleConfirmController()

  // 🍎 모달 핸들러
  // NOTE: API 응답 타입 사용 (상단 모달 상태와 동일한 이유)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDetailClick = React.useCallback((document: any) => {
    setSelectedDocument(document)
    setDetailModalVisible(true)
  }, [])

  const handleDetailModalClose = React.useCallback(() => {
    setDetailModalVisible(false)
    setTimeout(() => {
      setSelectedDocument(null)
    }, 300)
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSummaryClickInternal = React.useCallback((document: any) => {
    setSelectedDocumentForSummary(document)
    setSummaryModalVisible(true)
  }, [])

  const handleSummaryModalClose = React.useCallback(() => {
    setSummaryModalVisible(false)
    setTimeout(() => {
      setSelectedDocumentForSummary(null)
    }, 300)
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleFullTextClickInternal = React.useCallback((document: any) => {
    setSelectedDocumentForFullText(document)
    setFullTextModalVisible(true)
  }, [])

  const handleFullTextModalClose = React.useCallback(() => {
    setFullTextModalVisible(false)
    setTimeout(() => {
      setSelectedDocumentForFullText(null)
    }, 300)
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleLinkClickInternal = React.useCallback((document: any) => {
    setSelectedDocumentForLink(document)
    setLinkModalVisible(true)
  }, [])

  const handleLinkModalClose = React.useCallback(() => {
    setLinkModalVisible(false)
    setTimeout(() => {
      setSelectedDocumentForLink(null)
    }, 300)
  }, [])

  // 🍎 고객 검색 핸들러
  const searchCustomers = React.useCallback(
    async (searchTerm: string, page: number = 1, limit: number = 20): Promise<CustomerSearchResponse> => {
      return CustomerService.searchCustomers(searchTerm, { page, limit })
    },
    []
  )

  // 🍎 고객별 문서 조회 핸들러
  const fetchCustomerDocuments = React.useCallback(async (customerId: string) => {
    return DocumentService.getCustomerDocuments(customerId)
  }, [])

  // 🍎 문서-고객 연결 핸들러
  const linkDocumentToCustomer = React.useCallback(
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

      // 문서 목록 새로고침
      await loadDocuments(searchParams, true)

      // 페이지 새로고침으로 모든 View 업데이트
      window.location.reload();

      return undefined
    },
    [loadDocuments, searchParams]
  )

  // 🍎 체크박스 전체 선택/해제
  const handleSelectAll = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const allIds = new Set(documents.map(doc => doc._id))
      setSelectedDocumentIds(allIds)
    } else {
      setSelectedDocumentIds(new Set())
    }
  }, [documents])

  // 🍎 개별 체크박스 선택/해제
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

  // 🍎 삭제 모드 토글 핸들러
  const handleToggleDeleteMode = React.useCallback(() => {
    if (isDeleteMode) {
      // 삭제 모드 종료 시 선택 초기화
      setSelectedDocumentIds(new Set())
    }
    setIsDeleteMode(!isDeleteMode)
  }, [isDeleteMode])

  // 🍎 문서 삭제 핸들러
  const handleDeleteSelected = React.useCallback(async () => {
    if (selectedDocumentIds.size === 0) {
      await confirmModal.actions.openModal({
        title: '선택 항목 없음',
        message: '삭제할 문서를 선택해주세요.',
        confirmText: '확인',
        showCancel: false,
        iconType: 'warning'
      })
      return
    }

    const confirmed = await confirmModal.actions.openModal({
      title: '문서 삭제',
      message: `${selectedDocumentIds.size}개 문서를 삭제하시겠습니까?\n\nDB와 서버의 물리적 파일이 모두 삭제됩니다.\n삭제된 데이터는 복구할 수 없습니다.`,
      confirmText: '삭제',
      cancelText: '취소',
      confirmStyle: 'destructive',
      showCancel: true,
      iconType: 'warning'
    })

    if (!confirmed) {
      return
    }

    setIsDeleting(true)
    try {
      const result = await DocumentService.deleteDocuments(Array.from(selectedDocumentIds))

      setIsDeleting(false)

      if (result.success) {
        setSelectedDocumentIds(new Set())
        setIsDeleteMode(false) // 삭제 완료 후 삭제 모드 종료

        // 🍎 프리뷰 창 닫기: 삭제된 문서가 프리뷰 중이면 닫기
        setDetailModalVisible(false)
        setSummaryModalVisible(false)
        setFullTextModalVisible(false)
        setLinkModalVisible(false)
        setSelectedDocument(null)
        setSelectedDocumentForSummary(null)
        setSelectedDocumentForFullText(null)
        setSelectedDocumentForLink(null)

        // 🍎 RightPane 프리뷰도 닫기
        onDocumentDeleted?.()

        await loadDocuments(searchParams, true) // 목록 새로고침

        // 페이지 새로고침으로 모든 View 업데이트
        window.location.reload();

        // 🍎 삭제 완료 모달 제거: 조용히 삭제 처리
        // await confirmModal.actions.openModal({
        //   title: '완료',
        //   message: `${result.deletedCount}건 삭제되었습니다.${result.failedCount > 0 ? `\n(${result.failedCount}건 실패)` : ''}`,
        //   confirmText: '확인',
        //   showCancel: false,
        //   iconType: 'success'
        // })
      } else {
        await confirmModal.actions.openModal({
          title: '실패',
          message: result.message,
          confirmText: '확인',
          showCancel: false,
          iconType: 'error'
        })
      }
    } catch (err) {
      setIsDeleting(false)
      await confirmModal.actions.openModal({
        title: '오류',
        message: '삭제 중 오류가 발생했습니다.',
        confirmText: '확인',
        showCancel: false,
        iconType: 'error'
      })
      console.error('Delete error:', err)
    }
  }, [selectedDocumentIds, confirmModal.actions, loadDocuments, searchParams])

  /**
   * 페이지 변경 핸들러 (클릭 피드백 포함)
   */
  const handlePageChangeWithFeedback = (page: number, direction: 'prev' | 'next') => {
    setClickedButton(direction)
    handlePageChange(page)

    // 600ms 후 클릭 상태 복원
    setTimeout(() => {
      setClickedButton(null)
    }, 600)
  }

  // 현재 정렬 상태
  const currentSortBy = searchParams.sortBy || 'uploadDate'
  const currentSortOrder = searchParams.sortOrder || 'desc'

  // 정렬 옵션을 결합한 값
  const sortValue = `${currentSortBy}_${currentSortOrder}`

  // 정렬 변경 핸들러
  const handleSortSelectChange = (value: string) => {
    const [sortBy, sortOrder] = value.split('_')
    if (sortBy && sortOrder) {
      handleSortChange(sortBy, sortOrder as 'asc' | 'desc')
    }
  }

  // 🍎 칼럼 헤더 클릭 정렬 핸들러
  const handleColumnSort = React.useCallback((field: SortField) => {
    if (sortField === field) {
      // 같은 필드 클릭 시 방향 토글
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // 다른 필드 클릭 시 새 필드로 설정하고 오름차순으로 시작
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField, sortDirection, setSortField, setSortDirection]);

  // 🍎 칼럼 정렬 적용된 문서 리스트
  const sortedDocuments = React.useMemo(() => {
    if (!sortField) return documents;

    const sorted = [...documents].sort((a, b) => {
      let aValue: string | number | Date;
      let bValue: string | number | Date;

      switch (sortField) {
        case 'filename':
          aValue = DocumentUtils.getDisplayName(a).toLowerCase();
          bValue = DocumentUtils.getDisplayName(b).toLowerCase();
          return sortDirection === 'asc'
            ? aValue.localeCompare(bValue, 'ko')
            : bValue.localeCompare(aValue, 'ko');

        case 'size':
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          aValue = DocumentStatusService.extractFileSize(a as any) || 0;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          bValue = DocumentStatusService.extractFileSize(b as any) || 0;
          return sortDirection === 'asc' ? Number(aValue) - Number(bValue) : Number(bValue) - Number(aValue);

        case 'uploadDate':
          aValue = new Date(a.uploadDate || 0);
          bValue = new Date(b.uploadDate || 0);
          return sortDirection === 'asc'
            ? aValue.getTime() - bValue.getTime()
            : bValue.getTime() - aValue.getTime();

        case 'type':
          aValue = (a.mimeType ? DocumentUtils.getFileExtension(a.mimeType) : '-').toLowerCase();
          bValue = (b.mimeType ? DocumentUtils.getFileExtension(b.mimeType) : '-').toLowerCase();
          return sortDirection === 'asc'
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);

        case 'status':
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          aValue = DocumentStatusService.extractStatus(a as any);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          bValue = DocumentStatusService.extractStatus(b as any);
          return sortDirection === 'asc'
            ? String(aValue).localeCompare(String(bValue))
            : String(bValue).localeCompare(String(aValue));

        default:
          return 0;
      }
    });

    return sorted;
  }, [documents, sortField, sortDirection]);

  // 🍎 View가 표시될 때마다 문서 목록 새로고침
  React.useEffect(() => {
    if (visible) {
      // offset을 0으로 초기화하여 첫 페이지부터 시작
      loadDocuments({ ...searchParams, offset: 0 }, false);
    }
  }, [visible]);

  return (
    <CenterPaneView
      visible={visible}
      title="문서 라이브러리"
      titleIcon={<SFSymbol name="books-vertical" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} style={{ color: 'var(--color-icon-doc-library)' }} />}
      onClose={onClose}
      marginTop={6}
      marginBottom={6}
      marginLeft={6}
      marginRight={6}
      className={`document-library-view ${isDeleteMode ? 'document-library-view--delete-mode' : ''}`}
    >
      <div className="document-library-container">
        {/* 검색 바 */}
        <div className="document-library-bar">
          <div className="search-input-wrapper">
            <SFSymbol
              name="magnifyingglass"
              size={SFSymbolSize.BODY}
              weight={SFSymbolWeight.REGULAR}
              className="search-icon"
              decorative={true}
            />
            <input
              type="text"
              className="search-input"
              placeholder="파일명 또는 파일 형식 검색..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              aria-label="문서 검색"
            />
            {searchQuery && (
              <button
                className="search-clear-button"
                onClick={() => handleSearchChange('')}
                aria-label="검색어 지우기"
              >
                <SFSymbol
                  name="xmark.circle.fill"
                  size={SFSymbolSize.BODY}
                  weight={SFSymbolWeight.REGULAR}
                  decorative={true}
                />
              </button>
            )}
          </div>

          {/* 🍎 편집 버튼 - 아이콘 버튼 */}
          <button
            className={`edit-mode-button ${isDeleteMode ? 'edit-mode-button--active' : ''}`}
            onClick={handleToggleDeleteMode}
            aria-label={isDeleteMode ? "편집 완료" : "편집"}
            title={isDeleteMode ? "편집 완료" : "편집"}
          >
            {isDeleteMode ? "✓" : "✏️"}
          </button>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="document-library-error" role="alert">
            <SFSymbol
              name="exclamationmark.triangle.fill"
              size={SFSymbolSize.BODY}
              weight={SFSymbolWeight.REGULAR}
              className="error-icon"
              decorative={true}
            />
            <span>{error}</span>
            <button
              className="error-dismiss-button"
              onClick={clearError}
              aria-label="에러 메시지 닫기"
            >
              <SFSymbol
                name="xmark"
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.REGULAR}
                decorative={true}
              />
            </button>
          </div>
        )}

        {/* 삭제 모드 액션 바 */}
        {isDeleteMode && (
          <div className="document-library-actions">
            <div className="actions-left">
              {selectedDocumentIds.size > 0 && (
                <span className="selected-count">{selectedDocumentIds.size}개 선택됨</span>
              )}
            </div>
            <div className="actions-right">
              {selectedDocumentIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteSelected}
                  disabled={isDeleting}
                >
                  {isDeleting ? '삭제 중...' : '삭제'}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* 검색 결과 헤더 */}
        {!isLoading && !isEmpty && (
          <div className="document-library-result-header">
            <div className="result-header-left">
              {isDeleteMode && (
                <input
                  type="checkbox"
                  checked={documents.length > 0 && documents.every(doc => selectedDocumentIds.has(doc._id))}
                  onChange={handleSelectAll}
                  aria-label="전체 선택"
                  className="document-select-all-checkbox"
                />
              )}
              <span className="result-count">{searchResultMessage}</span>
            </div>

            <div className="result-controls">
              {/* 🍎 새로고침 버튼 */}
              <RefreshButton
                onClick={async () => {
                  await loadDocuments(searchParams, false);
                }}
                loading={isLoading}
                tooltip="문서 목록 새로고침"
                size="small"
              />

              {/* 🍎 정렬 드롭다운 */}
              <div className="sort-selector">
                <Dropdown
                  value={sortValue}
                  options={SORT_OPTIONS}
                  onChange={handleSortSelectChange}
                  aria-label="정렬 기준 선택"
                  minWidth={160}
                />
              </div>
            </div>
          </div>
        )}

        {/* 문서 리스트 */}
        <div className="document-list">
          {isLoading && isInitialLoad ? (
            <div className="document-list-loading">
              <div className="loading-spinner" aria-label="로딩 중" />
              <span>문서를 불러오는 중...</span>
            </div>
          ) : isEmpty ? (
            <div className="document-list-empty">
              <SFSymbol
                name="doc.text"
                size={SFSymbolSize.TITLE_1}
                weight={SFSymbolWeight.ULTRALIGHT}
                className="empty-icon"
                decorative={true}
              />
              <p className="empty-message">
                {searchQuery ? '검색 결과가 없습니다' : '등록된 문서가 없습니다'}
              </p>
            </div>
          ) : (
            <>
              {/* 🍎 칼럼 헤더 - 스티키 포지셔닝으로 항상 보임 */}
              <div className="document-list-header">
                {isDeleteMode && <div className="header-checkbox"></div>}
                <div className="header-icon"></div>
                <div className="header-filename header-sortable" onClick={() => handleColumnSort('filename')}>
                  <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                    <path d="M4 1h5l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" fill="currentColor"/>
                    <path d="M9 1v3h3" stroke="var(--color-ios-bg-primary-light)" strokeWidth="0.8" fill="none"/>
                  </svg>
                  <span>파일명</span>
                  {sortField === 'filename' && (
                    <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                  )}
                </div>
                <div className="header-size header-sortable" onClick={() => handleColumnSort('size')}>
                  <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                    <path d="M8 2v6l4 2" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                  </svg>
                  <span>크기</span>
                  {sortField === 'size' && (
                    <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                  )}
                </div>
                <div className="header-date header-sortable" onClick={() => handleColumnSort('uploadDate')}>
                  <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                    <rect x="2" y="3" width="12" height="11" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                    <line x1="2" y1="6" x2="14" y2="6" stroke="currentColor" strokeWidth="1.2"/>
                    <line x1="5" y1="1" x2="5" y2="4" stroke="currentColor" strokeWidth="1.2"/>
                    <line x1="11" y1="1" x2="11" y2="4" stroke="currentColor" strokeWidth="1.2"/>
                  </svg>
                  <span>날짜</span>
                  {sortField === 'uploadDate' && (
                    <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                  )}
                </div>
                <div className="header-type header-sortable" onClick={() => handleColumnSort('type')}>
                  <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                    <path d="M3 14h10V4H3v10zm2-8h1v1H5V6zm3 0h1v1H8V6zm3 0h1v1h-1V6z" fill="currentColor"/>
                  </svg>
                  <span>타입</span>
                  {sortField === 'type' && (
                    <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                  )}
                </div>
                <div className="header-status header-sortable" onClick={() => handleColumnSort('status')}>
                  <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                    <path d="M3 3h10v2H3V3zm0 4h10v2H3V7zm0 4h7v2H3v-2z" fill="currentColor"/>
                    <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                  </svg>
                  <span>상태</span>
                  {sortField === 'status' && (
                    <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                  )}
                </div>
                <div className="header-actions">
                  <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                    <circle cx="5" cy="8" r="1.5" fill="currentColor"/>
                    <circle cx="11" cy="8" r="1.5" fill="currentColor"/>
                  </svg>
                  <span>액션</span>
                </div>
              </div>

              {sortedDocuments.map((document) => {
                // NOTE: DocumentStatusService는 API 응답 타입을 기대하므로 as any 사용
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const status = DocumentStatusService.extractStatus(document as any)
                const statusLabel = DocumentStatusService.getStatusLabel(status)
                const statusIcon = DocumentStatusService.getStatusIcon(status)
                const isLinked = Boolean(document.customer_relation)
                const isAnnualReport = document.is_annual_report === true
                // AR 문서는 자동 연결되므로 처리 완료되어도 버튼 비활성화 유지
                const canLink = status === 'completed' && !isLinked && !isAnnualReport
                const linkTooltip = isLinked ? '이미 고객과 연결됨' : '고객에게 연결'
                const isSelected = selectedDocumentIds.has(document._id)

                return (
                <div
                  key={document._id}
                  className={`document-item ${isSelected ? 'document-item--selected' : ''}`}
                  onClick={() => onDocumentClick?.(document._id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onDocumentClick?.(document._id);
                    }
                  }}
                >
                  {/* 🍎 CHECKBOX: Document selection - 삭제 모드일 때만 표시 */}
                  {isDeleteMode && (
                    <div className="document-checkbox-wrapper" onClick={(e) => handleSelectDocument(document._id, e)}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        aria-label={`${document.filename} 선택`}
                        className="document-checkbox"
                      />
                    </div>
                  )}

                  {/* 🍎 ICON: File type indicator with color class */}
                  <div className="document-icon-wrapper">
                    <div className={`document-icon ${DocumentUtils.getFileTypeClass(document.mimeType, document.filename)}`}>
                      <SFSymbol
                        name={DocumentUtils.getFileIcon(document.mimeType, document.filename)}
                        size={SFSymbolSize.CAPTION_1}
                        weight={SFSymbolWeight.REGULAR}
                        decorative={true}
                      />
                    </div>
                    {/* 🍎 AR BADGE: Annual Report 표시 */}
                    {document.is_annual_report && (
                      <Tooltip content="Annual Report">
                        <div className="document-ar-badge">
                          AR
                        </div>
                      </Tooltip>
                    )}
                  </div>

                  {/* 🍎 NAME: Primary information (flexible width) */}
                  <div className="document-info">
                    <div className="document-name" title={DocumentUtils.getDisplayName(document)}>
                      {DocumentUtils.getDisplayName(document)}
                    </div>
                  </div>

                  {/* 🍎 SIZE: Fixed width column */}
                  <span className="document-size">
                    {/* NOTE: API 응답 타입 사용 (상단 extractStatus와 동일한 이유) */}
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {DocumentUtils.formatFileSize(DocumentStatusService.extractFileSize(document as any))}
                  </span>

                  {/* 🍎 DATE: Fixed width column */}
                  <span className="document-date">
                    {DocumentUtils.formatUploadDate(document.uploadDate)}
                  </span>

                  {/* 🍎 TYPE: Fixed width column */}
                  <span className="document-type">
                    {document.mimeType ? DocumentUtils.getFileExtension(document.mimeType) : '-'}
                  </span>

                  {/* 🍎 STATUS: 문서 처리 상태 아이콘 */}
                  <Tooltip content={statusLabel}>
                    <div className={`status-icon status-${status}`}>
                      {statusIcon}
                    </div>
                  </Tooltip>

                  {/* 액션 버튼 */}
                  <div className="document-actions">
                    <Tooltip content="상세 보기">
                      <button
                        className="action-btn action-btn--detail"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDetailClick(document)
                        }}
                        aria-label="상세 보기"
                      >
                        <EyeIcon />
                      </button>
                    </Tooltip>
                    <Tooltip content="요약 보기">
                      <button
                        className="action-btn action-btn--summary"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSummaryClickInternal(document)
                        }}
                        aria-label="요약 보기"
                      >
                        <SummaryIcon />
                      </button>
                    </Tooltip>
                    <Tooltip content="전체 텍스트 보기">
                      <button
                        className="action-btn action-btn--full"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleFullTextClickInternal(document)
                        }}
                        aria-label="전체 텍스트 보기"
                      >
                        <DocumentIcon />
                      </button>
                    </Tooltip>
                    <Tooltip content={linkTooltip}>
                      <button
                        className="action-btn action-btn--link"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (canLink) {
                            handleLinkClickInternal(document)
                          }
                        }}
                        aria-label={linkTooltip}
                        aria-disabled={!canLink}
                        data-disabled={!canLink}
                        tabIndex={canLink ? 0 : -1}
                      >
                        <LinkIcon />
                      </button>
                    </Tooltip>
                  </div>
                </div>
                )
              })}
            </>
          )}
        </div>

        {/* 페이지네이션 */}
        {!isLoading && !isEmpty && (
          <div className="document-pagination">
            {/* 🍎 페이지당 항목 수 선택 */}
            <div className="pagination-limit">
              <Dropdown
                value={String(itemsPerPage)}
                options={ITEMS_PER_PAGE_OPTIONS}
                onChange={(value) => handleLimitChange(Number(value))}
                aria-label="페이지당 항목 수"
                width={100}
              />
            </div>

            {/* 🍎 페이지 네비게이션 - 페이지가 2개 이상일 때만 표시 */}
            {totalPages > 1 && (
              <div className="pagination-controls">
                <button
                  className="pagination-button pagination-button--prev"
                  onClick={() => handlePageChangeWithFeedback(currentPage - 1, 'prev')}
                  disabled={currentPage === 1}
                  aria-label="이전 페이지"
                >
                  <span className={`pagination-arrow ${clickedButton === 'prev' ? 'pagination-arrow--clicked' : ''}`}>
                    ‹
                  </span>
                </button>

                <div className="pagination-info">
                  <span className="pagination-current">{currentPage}</span>
                  <span className="pagination-separator">/</span>
                  <span className="pagination-total">{totalPages}</span>
                </div>

                <button
                  className="pagination-button pagination-button--next"
                  onClick={() => handlePageChangeWithFeedback(currentPage + 1, 'next')}
                  disabled={currentPage === totalPages}
                  aria-label="다음 페이지"
                >
                  <span className={`pagination-arrow ${clickedButton === 'next' ? 'pagination-arrow--clicked' : ''}`}>
                    ›
                  </span>
                </button>
              </div>
            )}

            {/* 🍎 페이지가 1개일 때 빈 공간 유지 */}
            {totalPages <= 1 && <div className="pagination-spacer"></div>}
          </div>
        )}
      </div>

      {/* 모달들 */}
      <DocumentDetailModal
        visible={isDetailModalVisible}
        onClose={handleDetailModalClose}
        document={selectedDocument}
      />
      <DocumentSummaryModal
        visible={isSummaryModalVisible}
        onClose={handleSummaryModalClose}
        document={selectedDocumentForSummary}
      />
      <DocumentFullTextModal
        visible={isFullTextModalVisible}
        onClose={handleFullTextModalClose}
        document={selectedDocumentForFullText}
      />
      <DocumentLinkModal
        visible={isLinkModalVisible}
        onClose={handleLinkModalClose}
        document={selectedDocumentForLink}
        onSearchCustomers={searchCustomers}
        onFetchCustomerDocuments={fetchCustomerDocuments}
        onLink={linkDocumentToCustomer}
      />

      {/* Apple Confirm Modal */}
      <AppleConfirmModal
        state={confirmModal.state}
        actions={confirmModal.actions}
      />
    </CenterPaneView>
  )
}

export default DocumentLibraryView
