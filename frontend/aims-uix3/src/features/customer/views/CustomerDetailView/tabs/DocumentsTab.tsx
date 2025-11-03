/**
 * AIMS UIX-3 Customer Detail - Documents Tab
 * @since 2025-10-25
 *
 * 🍎 CenterPane DocumentLibraryView와 동일한 리스트 스타일
 * 칼럼: 파일명, 크기, 연결일, 작업 (문서보기, 연결해제)
 * - 페이지네이션 포함
 * - 정렬 기능 포함
 */

import React, { useCallback, useState, useMemo } from 'react'
import type { Customer } from '@/entities/customer/model'
import RefreshButton from '../../../../../components/RefreshButton/RefreshButton'
import { Tooltip } from '@/shared/ui'
import { Button } from '@/shared/ui/Button'
import { Dropdown } from '@/shared/ui'
import SFSymbol, {
  SFSymbolAnimation,
  SFSymbolSize,
  SFSymbolWeight
} from '../../../../../components/SFSymbol'
import { formatDateTime, formatDateTimeCompact } from '@/shared/lib/timeUtils'
import { DocumentUtils } from '@/entities/document'
import { useCustomerDocumentsController } from '@/features/customer/controllers/useCustomerDocumentsController'
import { useAppleConfirmController } from '@/controllers/useAppleConfirmController'
import { AppleConfirmModal } from '../../../../../components/DocumentViews/DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal'
import DownloadHelper from '../../../../../utils/downloadHelper'
import type { CustomerDocumentItem } from '@/services/DocumentService'
import { CustomerDocumentPreviewModal } from './CustomerDocumentPreviewModal'
import './DocumentsTab.css'

interface DocumentsTabProps {
  customer: Customer
  onRefresh?: () => void
  onDocumentCountChange?: (count: number) => void
}

// 🍎 페이지당 항목 수 옵션
const ITEMS_PER_PAGE_OPTIONS = [
  { value: '10', label: '10개씩' },
  { value: '20', label: '20개씩' },
  { value: '50', label: '50개씩' },
  { value: '100', label: '100개씩' }
]

// 🍎 정렬 필드 타입
type SortField = 'originalName' | 'fileSize' | 'linkedAt'
type SortDirection = 'asc' | 'desc'

export const DocumentsTab: React.FC<DocumentsTabProps> = ({
  customer,
  onRefresh,
  onDocumentCountChange
}) => {
  const confirmController = useAppleConfirmController()
  const {
    documents,
    documentCount,
    isLoading,
    isEmpty,
    error,
    unlinkingId,
    lastUpdated,
    refresh,
    unlinkDocument,
    previewState,
    previewTarget,
    retryPreview,
    openPreview,
    closePreview
  } = useCustomerDocumentsController(customer?._id, {
    autoLoad: true,
    enabled: Boolean(customer?._id),
    ...(onDocumentCountChange ? { onDocumentsChange: onDocumentCountChange } : {}),
  })

  // 🍎 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  // 🍎 정렬 상태
  const [sortField, setSortField] = useState<SortField>('linkedAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  // 🍎 정렬 핸들러
  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
    setCurrentPage(1) // 정렬 변경 시 첫 페이지로
  }, [sortField])

  // 🍎 정렬된 문서 목록
  const sortedDocuments = useMemo(() => {
    const sorted = [...documents].sort((a, b) => {
      let aValue: string | number | null
      let bValue: string | number | null

      switch (sortField) {
        case 'originalName':
          aValue = a.originalName ?? ''
          bValue = b.originalName ?? ''
          break
        case 'fileSize':
          aValue = a.fileSize ?? 0
          bValue = b.fileSize ?? 0
          break
        case 'linkedAt':
          aValue = a.linkedAt ?? a.uploadedAt ?? ''
          bValue = b.linkedAt ?? b.uploadedAt ?? ''
          break
        default:
          return 0
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [documents, sortField, sortDirection])

  // 🍎 페이지네이션 계산
  const totalPages = Math.ceil(sortedDocuments.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedDocuments = sortedDocuments.slice(startIndex, endIndex)

  // 🍎 페이지 변경
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page)
  }, [])

  // 🍎 페이지당 항목 수 변경
  const handleLimitChange = useCallback((limit: number) => {
    setItemsPerPage(limit)
    setCurrentPage(1) // 첫 페이지로 리셋
  }, [])

  const handleRefresh = useCallback(async () => {
    await refresh()
    onRefresh?.()
  }, [onRefresh, refresh])

  const handlePreview = useCallback(
    (document: CustomerDocumentItem) => {
      void openPreview(document)
    },
    [openPreview]
  )

  const handleUnlink = useCallback(
    async (document: CustomerDocumentItem) => {
      const confirmed = await confirmController.actions.openModal({
        title: '문서 연결 해제',
        message: `"${document.originalName ?? document._id}" 문서를 고객과의 연결에서 해제하시겠습니까?`,
        confirmText: '해제',
        cancelText: '취소',
        confirmStyle: 'destructive',
        showCancel: true,
        iconType: 'warning'
      })

      if (!confirmed) return

      await unlinkDocument(document._id)
      onRefresh?.()
    },
    [confirmController.actions, onRefresh, unlinkDocument]
  )

  const handleDownload = useCallback(async () => {
    const preview = previewState.data
    if (!preview?.rawDetail) return
    await DownloadHelper.downloadDocument({
      _id: preview.id,
      ...(preview.rawDetail as Record<string, unknown>)
    })
  }, [previewState.data])

  const renderState = () => {
    if (isLoading && documents.length === 0) {
      return (
        <div className="customer-documents__state customer-documents__state--loading">
          <SFSymbol
            name='arrow.clockwise'
            animation={SFSymbolAnimation.ROTATE}
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>문서 데이터를 불러오는 중입니다...</span>
        </div>
      )
    }

    if (error && documents.length === 0) {
      return (
        <div className="customer-documents__state customer-documents__state--error">
          <SFSymbol
            name='exclamationmark.triangle.fill'
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>{error}</span>
          <button
            type="button"
            className="customer-documents__retry"
            onClick={() => void refresh()}
          >
            다시 시도
          </button>
        </div>
      )
    }

    if (isEmpty) {
      return (
        <div className="customer-documents__state customer-documents__state--empty">
          <SFSymbol
            name='folder.badge.questionmark'
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>연결된 문서가 없습니다.</span>
        </div>
      )
    }

    return null
  }

  const lastUpdatedLabel = lastUpdated
    ? formatDateTime(new Date(lastUpdated).toISOString())
    : null

  // 🍎 정렬 아이콘 렌더링
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return (
        <SFSymbol
          name="chevron.up.chevron.down"
          size={SFSymbolSize.CAPTION_1}
          weight={SFSymbolWeight.MEDIUM}
          className="sort-icon sort-icon--inactive"
        />
      )
    }
    return (
      <SFSymbol
        name={sortDirection === 'asc' ? 'chevron.up' : 'chevron.down'}
        size={SFSymbolSize.CAPTION_1}
        weight={SFSymbolWeight.MEDIUM}
        className="sort-icon sort-icon--active"
      />
    )
  }

  return (
    <div className="customer-documents">
      <div className="customer-documents__header">
        <div className="customer-documents__summary">
          <span className="customer-documents__count">
            총 <strong>{documentCount}</strong>건 연결됨
          </span>
          {lastUpdatedLabel && (
            <span className="customer-documents__updated">
              마지막 동기화: {lastUpdatedLabel}
            </span>
          )}
        </div>
        <div className="customer-documents__actions">
          <RefreshButton
            onClick={handleRefresh}
            loading={isLoading}
            size="small"
            tooltip="문서 목록 새로고침"
          />
        </div>
      </div>

      {renderState()}

      {!isEmpty && documents.length > 0 && (
        <>
          <div className="customer-documents__table-wrapper">
            <table className="customer-documents__table customer-documents__table--list">
              <thead>
                <tr>
                  <th scope="col" className="sortable" onClick={() => handleSort('originalName')}>
                    <div className="th-content">
                      <span>파일명</span>
                      {renderSortIcon('originalName')}
                    </div>
                  </th>
                  <th scope="col" className="sortable" onClick={() => handleSort('fileSize')}>
                    <div className="th-content">
                      <span>크기</span>
                      {renderSortIcon('fileSize')}
                    </div>
                  </th>
                  <th scope="col" className="sortable" onClick={() => handleSort('linkedAt')}>
                    <div className="th-content">
                      <span>연결일</span>
                      {renderSortIcon('linkedAt')}
                    </div>
                  </th>
                  <th scope="col" className="customer-documents__actions-header">작업</th>
                </tr>
              </thead>
              <tbody>
                {paginatedDocuments.map((document) => {
                  const linkedAt = document.linkedAt ?? document.uploadedAt ?? null
                  const formattedDate = formatDateTimeCompact(linkedAt)
                  const sizeLabel = document.fileSize ? DocumentUtils.formatFileSize(document.fileSize) : '-'

                  return (
                    <tr key={document._id} className="customer-documents__row">
                      <td>
                        <button
                          type="button"
                          className="customer-documents__name"
                          onClick={() => handlePreview(document)}
                        >
                          <SFSymbol
                            name="doc.text"
                            size={SFSymbolSize.BODY}
                            weight={SFSymbolWeight.REGULAR}
                          />
                          <span className="customer-documents__name-text">
                            {document.originalName ?? '이름 없는 문서'}
                          </span>
                        </button>
                      </td>
                      <td>
                        <span className="customer-documents__size">
                          {sizeLabel}
                        </span>
                      </td>
                      <td>
                        <span className="customer-documents__date">
                          {formattedDate}
                        </span>
                      </td>
                      <td>
                        <div className="customer-documents__row-actions">
                          <Tooltip content="문서 보기">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="customer-documents__action-button"
                              onClick={() => handlePreview(document)}
                            >
                              <SFSymbol
                                name="eye"
                                size={SFSymbolSize.BODY}
                                weight={SFSymbolWeight.REGULAR}
                                className="customer-documents__action-icon customer-documents__action-icon--view"
                                decorative
                              />
                              <span className="sr-only">보기</span>
                            </Button>
                          </Tooltip>
                          <Tooltip content="연결 해제">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="customer-documents__action-button customer-documents__action-button--danger"
                              loading={unlinkingId === document._id}
                              onClick={() => void handleUnlink(document)}
                            >
                              {unlinkingId !== document._id && (
                                <SFSymbol
                                  name="trash"
                                  size={SFSymbolSize.BODY}
                                  weight={SFSymbolWeight.REGULAR}
                                  className="customer-documents__action-icon customer-documents__action-icon--danger"
                                  decorative
                                />
                              )}
                              <span className="sr-only">연결 해제</span>
                            </Button>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 🍎 페이지네이션 */}
          {totalPages > 0 && (
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
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    aria-label="이전 페이지"
                  >
                    <span className="pagination-arrow">‹</span>
                  </button>

                  <div className="pagination-info">
                    <span className="pagination-current">{currentPage}</span>
                    <span className="pagination-separator">/</span>
                    <span className="pagination-total">{totalPages}</span>
                  </div>

                  <button
                    className="pagination-button pagination-button--next"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    aria-label="다음 페이지"
                  >
                    <span className="pagination-arrow">›</span>
                  </button>
                </div>
              )}

              {/* 🍎 페이지가 1개일 때 빈 공간 유지 */}
              {totalPages <= 1 && <div className="pagination-spacer"></div>}
            </div>
          )}
        </>
      )}

      <CustomerDocumentPreviewModal
        visible={previewState.isOpen}
        isLoading={previewState.isLoading}
        error={previewState.error}
        document={previewState.data}
        onClose={closePreview}
        {...(previewTarget ? { onRetry: () => { void retryPreview() } } : {})}
        {...(previewState.data?.rawDetail ? { onDownload: handleDownload } : {})}
      />

      <AppleConfirmModal
        state={confirmController.state}
        actions={confirmController.actions}
      />
    </div>
  )
}

export default DocumentsTab
