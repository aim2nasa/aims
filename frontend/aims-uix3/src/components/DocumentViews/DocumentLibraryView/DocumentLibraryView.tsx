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
import { Dropdown, type DropdownOption, Tooltip } from '@/shared/ui'
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
import './DocumentLibraryView.css'

interface DocumentLibraryViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
  /** 문서 클릭 핸들러 */
  onDocumentClick?: (documentId: string) => void
}

// 정렬 옵션 정의
const SORT_OPTIONS: DropdownOption[] = [
  { value: 'uploadDate_desc', label: '최신순' },
  { value: 'uploadDate_asc', label: '오래된순' },
  { value: 'filename_asc', label: '이름순 (가나다)' },
  { value: 'filename_desc', label: '이름순 (하파타)' },
  { value: 'size_desc', label: '크기순 (큰 것부터)' },
  { value: 'size_asc', label: '크기순 (작은 것부터)' },
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

      return undefined
    },
    [loadDocuments, searchParams]
  )

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

  // View가 열려있는 동안 주기적으로 데이터 새로고침 (3초마다)
  // Silent refresh: 초기 로딩 후에는 백그라운드에서 조용히 업데이트
  React.useEffect(() => {
    if (!visible) return

    // 즉시 로드 (초기 로딩)
    loadDocuments(searchParams, false)

    // 3초마다 자동 새로고침 (silent mode)
    const intervalId = setInterval(() => {
      loadDocuments(searchParams, true) // silent=true로 깜빡임 방지
    }, 3000)

    return () => clearInterval(intervalId)
  }, [visible, loadDocuments, searchParams])

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
      className="document-library-view"
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

        {/* 검색 결과 헤더 */}
        {!isLoading && !isEmpty && (
          <div className="document-library-result-header">
            <span className="result-count">{searchResultMessage}</span>

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
            documents.map((document) => {
              // NOTE: DocumentStatusService는 API 응답 타입을 기대하므로 as any 사용
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const status = DocumentStatusService.extractStatus(document as any)
              const statusLabel = DocumentStatusService.getStatusLabel(status)
              const statusIcon = DocumentStatusService.getStatusIcon(status)
              const isLinked = Boolean(document.customer_relation)
              const canLink = status === 'completed' && !isLinked
              const linkTooltip = isLinked ? '이미 고객과 연결됨' : '고객에게 연결'

              return (
                <div
                  key={document._id}
                  className="document-item"
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
                        className="action-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDetailClick(document)
                        }}
                        aria-label="상세 보기"
                      >
                        👁️
                      </button>
                    </Tooltip>
                    <Tooltip content="요약 보기">
                      <button
                        className="action-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSummaryClickInternal(document)
                        }}
                        aria-label="요약 보기"
                      >
                        📋
                      </button>
                    </Tooltip>
                    <Tooltip content="전체 텍스트 보기">
                      <button
                        className="action-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleFullTextClickInternal(document)
                        }}
                        aria-label="전체 텍스트 보기"
                      >
                        📄
                      </button>
                    </Tooltip>
                    <Tooltip content={linkTooltip}>
                      <button
                        className="action-btn"
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
                        🔗
                      </button>
                    </Tooltip>
                  </div>
                </div>
              )
            })
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
    </CenterPaneView>
  )
}

export default DocumentLibraryView