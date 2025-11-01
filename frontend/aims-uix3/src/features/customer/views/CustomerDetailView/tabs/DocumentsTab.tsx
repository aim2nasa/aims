/**
 * AIMS UIX-3 Customer Detail - Documents Tab
 * @since 2025-10-25
 *
 * 고객과 연결된 문서를 aims-uix2 동작과 동일하게 표시
 * - 문서 목록 테이블
 * - 문서 프리뷰 및 다운로드
 * - 문서 연결 해제
 */

import React, { useCallback } from 'react'
import type { Customer } from '@/entities/customer/model'
import RefreshButton from '../../../../../components/RefreshButton/RefreshButton'
import { Tooltip } from '@/shared/ui'
import { Button } from '@/shared/ui/Button'
import SFSymbol, {
  SFSymbolAnimation,
  SFSymbolSize,
  SFSymbolWeight
} from '../../../../../components/SFSymbol'
import { formatDateTime } from '@/shared/lib/timeUtils'
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

const RELATIONSHIP_LABELS: Record<string, string> = {
  contract: '계약서',
  claim: '청구서',
  proposal: '제안서',
  id_verification: '신분증',
  medical: '의료서류',
  general: '일반',
  policy: '증권',
  annual_report: 'Annual Report',
  others: '기타'
}

const STATUS_LABELS: Record<string, string> = {
  completed: '완료',
  processing: '처리중',
  pending: '대기',
  error: '오류',
  linked: '연결됨'
}

const getRelationshipLabel = (value?: string | null) => {
  if (!value) return '일반'
  return RELATIONSHIP_LABELS[value] ?? value
}

const getStatusLabel = (value?: string | null) => {
  if (!value) return STATUS_LABELS['linked']
  return STATUS_LABELS[value] ?? value
}

const getStatusClass = (value?: string | null) => {
  if (!value) return 'status-pill--linked'
  switch (value) {
    case 'completed':
      return 'status-pill--completed'
    case 'processing':
      return 'status-pill--processing'
    case 'pending':
      return 'status-pill--pending'
    case 'error':
      return 'status-pill--error'
    default:
      return 'status-pill--linked'
  }
}

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
        <div className="customer-documents__table-wrapper">
          <table className="customer-documents__table">
            <thead>
              <tr>
                <th scope="col">문서명</th>
                <th scope="col">연결 유형</th>
                <th scope="col">상태</th>
                <th scope="col">연결일</th>
                <th scope="col" className="customer-documents__actions-header">작업</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => {
                const status = (document.status ?? (document as { overallStatus?: string }).overallStatus ?? 'linked') as string
                const linkedAt = document.linkedAt ?? document.uploadedAt ?? null
                const formattedDate = formatDateTime(linkedAt)
                const sizeLabel = document.fileSize ? DocumentUtils.formatFileSize(document.fileSize) : undefined

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
                        {sizeLabel && (
                          <span className="customer-documents__meta">
                            {sizeLabel}
                          </span>
                        )}
                      </button>
                    </td>
                    <td>
                      <span className="customer-documents__tag">
                        {getRelationshipLabel(document.relationship)}
                      </span>
                    </td>
                    <td>
                      <span className={`status-pill ${getStatusClass(status)}`}>
                        {getStatusLabel(status)}
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
