/* eslint-disable react-refresh/only-export-components -- 컴포넌트와 관련 유��을 함께 export */
/* eslint-disable @typescript-eslint/no-explicit-any -- Document 타입 호환성 캐스팅 */
/**
 * DocumentStatusList Component
 * @version 3.0.0 - 🍎 DocumentLibrary 리스트 구조 완벽 복제
 *
 * 공간 효율적인 리스트 레이아웃
 */

import React, { useState, useCallback, useRef } from 'react'
import { useAppleConfirm } from '@/contexts/AppleConfirmProvider'
import { useDevModeStore } from '@/shared/store/useDevModeStore'
import { Tooltip, DocumentTypeCell, DocumentTypeBadge } from '@/shared/ui'
import { FilenameModeToggle } from '@/shared/ui/FilenameModeToggle'
import { SortIndicator } from '@/shared/ui/SortIndicator'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../SFSymbol'
import { DocumentUtils } from '@/entities/document'
import { DocumentStatusService } from '../../../../services/DocumentStatusService'
import { DocumentService } from '../../../../services/DocumentService'
import { api } from '@/shared/lib/api'
import type { Document } from '../../../../types/documentStatus'
import {
  DocumentIcon,
  EyeIcon,
  LinkIcon,
  SummaryIcon
} from '../../components/DocumentActionIcons'
// InlineRenameInput 제거 — 부모 뷰에서 RenameModal로 대체
import { DocumentNotesModal } from './DocumentNotesModal'
import { useUserStore } from '../../../../stores/user'
import { errorReporter } from '@/shared/lib/errorReporter'
import { documentTypesService } from '../../../../services/documentTypesService'
import { highlightText } from '@/shared/lib/highlightText'
import { useColumnResize } from '@/shared/hooks'
import type { ColumnDef } from '@/shared/hooks'
import './DocumentStatusList.header.css';
import './DocumentStatusList.cells.css';
import './DocumentStatusList.responsive.css';
import './DocumentStatusList.badges.css';

// ─── 칼럼 리사이즈 정의 ───

/** 기본 칼럼 정의 (삭제 모드가 아닌 일반 상태) */
const COLUMN_DEFS: ColumnDef[] = [
  { defaultWidth: '45px',                defaultPx: 45,  minWidth: 30,  resizable: true  },  // 유형
  { defaultWidth: 'minmax(120px, 1fr)',   defaultPx: 300, minWidth: 120, resizable: true  },  // 파일명
  { defaultWidth: '90px',                defaultPx: 90,  minWidth: 60,  resizable: true  },  // 문서 유형
  { defaultWidth: '70px',                defaultPx: 70,  minWidth: 50,  resizable: true  },  // 크기
  { defaultWidth: '60px',                defaultPx: 60,  minWidth: 40,  resizable: true  },  // 타입
  { defaultWidth: '120px',               defaultPx: 120, minWidth: 80,  resizable: true  },  // 업로드 날짜
  { defaultWidth: '80px',                defaultPx: 80,  minWidth: 50,  resizable: true  },  // 상태
  { defaultWidth: 'minmax(130px, auto)',  defaultPx: 150, minWidth: 100, resizable: true  },  // 연결된 고객
  { defaultWidth: '52px',                defaultPx: 52,  minWidth: 40,  resizable: false },  // 액션 버튼
]

const COLUMN_RESIZE_STORAGE_KEY = 'aims-document-library-column-widths'

// ─── DocumentStatusRow: 개별 행 컴포넌트 (React.memo) ───

interface DocumentStatusRowProps {
  document: Document
  index: number
  // per-row boolean (부모에서 계산하여 전달 — memo 최적화)
  isSelected: boolean
  isPreview?: boolean
  isUpdating: boolean
  isRetryingPdf: boolean
  // 모드
  isDeleteMode: boolean
  isBulkLinkMode: boolean
  isAliasMode: boolean
  isDevMode: boolean
  // 사용자 ID (내 파일 판별)
  userId: string | null
  // 파일명 표시 모드
  filenameMode: 'display' | 'original'
  // 콜백
  onDocumentClick?: (documentId: string) => void
  onDocumentDoubleClick?: (document: Document) => void
  onSelectDocument?: (documentId: string, event: React.MouseEvent) => void
  onDetailClick?: (document: Document) => void
  onSummaryClick?: (document: Document) => void
  onFullTextClick?: (document: Document) => void
  onLinkClick?: (document: Document) => void
  onUnlinkedCustomerClick?: (documentId: string) => void
  onChangeCustomerClick?: (documentId: string, currentCustomerId: string) => void
  onCustomerClick?: (customerId: string) => void
  onCustomerDoubleClick?: (customerId: string) => void
  // 고객 필터 토글 (클릭 시 해당 고객 문서만 필터)
  onCustomerFilter?: (filter: { id: string; name: string }) => void
  onRowContextMenu?: (document: Document, event: React.MouseEvent) => void
  onRetryPdfConversion: (documentId: string, e: React.MouseEvent) => void
  onDocTypeChange: (documentId: string, newType: string) => void
  // 호버 액션: 이름변경/삭제
  onRenameClick?: (document: Document) => void
  onDeleteClick?: (document: Document) => void
  renamingDocumentId?: string | null
  onRenameConfirm?: (documentId: string, newName: string) => void
  onRenameCancel?: () => void
  // 검색어 하이라이트
  searchTerm?: string
  // 칼럼 리사이즈 gridTemplateColumns
  gridTemplateColumns?: string | null
}

const DocumentStatusRow = React.memo<DocumentStatusRowProps>(({
  document,
  index,
  isSelected,
  isPreview,
  isUpdating,
  isRetryingPdf,
  isDeleteMode,
  isBulkLinkMode,
  isAliasMode,
  isDevMode,
  userId,
  filenameMode,
  onDocumentClick,
  onDocumentDoubleClick,
  onSelectDocument,
  onDetailClick,
  onSummaryClick,
  onFullTextClick,
  onLinkClick,
  onUnlinkedCustomerClick,
  onChangeCustomerClick,
  onCustomerClick,
  onCustomerDoubleClick,
  onCustomerFilter,
  onRowContextMenu,
  onRetryPdfConversion,
  onDocTypeChange,
  onRenameClick,
  onDeleteClick,
  renamingDocumentId: _renamingDocumentId,
  onRenameConfirm: _onRenameConfirm,
  onRenameCancel: _onRenameCancel,
  searchTerm,
  gridTemplateColumns,
}) => {
  // 에러 메시지 복사 상태
  const [copiedErrorDocId, setCopiedErrorDocId] = useState<string | null>(null)

  // 각 Row 내부에서 싱글/더블클릭 타이머를 자체 관리
  const documentClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const customerClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const status = DocumentStatusService.extractStatus(document)
  const progress = DocumentStatusService.extractProgress(document)
  const statusLabel = DocumentStatusService.getStatusLabel(status)
  const statusIcon = DocumentStatusService.getStatusIcon(status)
  const isLinked = Boolean(document.customer_relation)
  const isAnnualReport = document.is_annual_report === true
  // 크레딧 부족 상태 확인
  const isCreditPending = status === 'credit_pending'
  // 내 파일 여부 확인 (ownerId === customerId)
  const isMyFile = document.ownerId && document.customerId && document.ownerId === document.customerId
  // AR 문서는 자동 연결되므로 처리 완료되어도 버튼 비활성화 유지
  const canLink = status === 'completed' && !isLinked && !isAnnualReport
  const linkTooltip = isLinked ? '이미 고객과 연결됨' : '고객에게 연결'

  const documentId = document._id ?? document.id ?? null
  const key = documentId ?? `${DocumentStatusService.extractFilename(document)}-${index}`

  return (
    <div
      key={key}
      className={`status-item ${isSelected ? 'status-item--selected' : ''} ${isPreview ? 'status-item--preview' : ''}`}
      data-context-menu="document"
      style={gridTemplateColumns ? {
        gridTemplateColumns: (isDeleteMode || isBulkLinkMode || isAliasMode)
          ? `24px ${gridTemplateColumns}`
          : gridTemplateColumns
      } : undefined}
      onClick={() => {
        if (isDeleteMode || isBulkLinkMode || isAliasMode) return
        if (!documentId) return
        if (documentClickTimer.current) {
          clearTimeout(documentClickTimer.current)
        }
        documentClickTimer.current = setTimeout(() => {
          if (onDocumentClick) {
            onDocumentClick(documentId)
          }
          documentClickTimer.current = null
        }, 250)
      }}
      onDoubleClick={() => {
        if (isDeleteMode || isBulkLinkMode || isAliasMode) return
        if (documentClickTimer.current) {
          clearTimeout(documentClickTimer.current)
          documentClickTimer.current = null
        }
        if (onDocumentDoubleClick) {
          onDocumentDoubleClick(document)
        }
      }}
      onContextMenu={(e) => {
        if (onRowContextMenu) {
          e.preventDefault()
          e.stopPropagation()
          onRowContextMenu(document, e)
        }
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (documentId && onDocumentClick && !isDeleteMode && !isBulkLinkMode && !isAliasMode) {
            onDocumentClick(documentId)
          }
        }
      }}
    >
      {/* 삭제 모드 또는 일괄 연결 모드: 개별 선택 체크박스 */}
      {(() => {
        // 일괄 연결 모드: 미연결 + 완료된 문서만 체크박스 표시
        if (isBulkLinkMode) {
          const hasCustomer = document.customer_relation?.customer_name
          if (hasCustomer || !canLink) {
            // 고객 연결됨 또는 처리 미완료 문서는 체크박스 없음 (공백으로 레이아웃 유지)
            return <div className="document-checkbox-wrapper"></div>
          }
        }

        // 별칭 모드: 이미 별칭이 있는 문서(displayName 존재 + failed 아닌)는 체크박스 대신 완료 표시
        if (isAliasMode) {
          const hasAlias = Boolean(document.displayName) && document.displayNameStatus !== 'failed'
          if (hasAlias) {
            return (
              <div className="document-checkbox-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'var(--color-text-tertiary)', fontSize: '12px' }}>✓</span>
              </div>
            )
          }
        }

        // 삭제 모드, 일괄 연결 모드, 또는 별칭 모드 (별칭 없는 문서)
        if (isDeleteMode || isBulkLinkMode || isAliasMode) {
          return (
            <div
              className="document-checkbox-wrapper"
              onClick={(e) => {
                if (documentId) {
                  onSelectDocument?.(documentId, e)
                }
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => {}}
                aria-label={`${DocumentStatusService.extractFilename(document)} 선택`}
                className="document-checkbox"
              />
            </div>
          )
        }

        return null
      })()}

      {/* 유형 칼럼: 아이콘 + 모든 뱃지 (AR, TXT, OCR, BIN) */}
      <div className="document-icon-wrapper">
        <div className={`document-icon ${DocumentUtils.getFileTypeClass(document.mimeType, DocumentStatusService.extractFilename(document))}`}>
          <SFSymbol
            name={DocumentUtils.getFileIcon(document.mimeType, DocumentStatusService.extractFilename(document))}
            size={SFSymbolSize.CAPTION_1}
            weight={SFSymbolWeight.REGULAR}
            decorative={true}
          />
        </div>
        {/* AR BADGE: Annual Report 표시 (크레딧 부족 시 회색) */}
        {document.is_annual_report && (
          <Tooltip content={isCreditPending ? "연간보고서 (크레딧 부족)" : "연간보고서"}>
            <div className={`document-ar-badge ${isCreditPending ? 'badge--disabled' : ''}`}>
              AR
            </div>
          </Tooltip>
        )}
        {/* CR BADGE: Customer Review (변액 리포트) 표시 (크레딧 부족 시 회색) */}
        {document.is_customer_review && !document.is_annual_report && (
          <Tooltip content={isCreditPending ? "변액 리포트 (크레딧 부족)" : "변액 리포트"}>
            <div className={`document-cr-badge ${isCreditPending ? 'badge--disabled' : ''}`}>
              CR
            </div>
          </Tooltip>
        )}
        {/* TXT/OCR/BIN BADGE: 공유 컴포넌트 */}
        <DocumentTypeBadge document={document as any} isCreditPending={isCreditPending} />
      </div>

      {/* 파일명 + PDF 변환 상태 아이콘 + 호버 액션 */}
      <div className="status-filename" onDoubleClick={(e) => { e.stopPropagation(); onRenameClick?.(document) }}>
        {/* filenameMode에 따라 별칭/원본 전환 표시 */}
        {(() => {
          const hasDisplay = Boolean(document.displayName)
          const originalName = DocumentStatusService.extractOriginalFilename(document)
          const showName = filenameMode === 'display' && hasDisplay
            ? document.displayName!
            : originalName
          const altName = filenameMode === 'display' && hasDisplay
            ? `원본: ${originalName}`
            : (hasDisplay ? `별칭: ${document.displayName}` : '')

          return (
            <>
              {altName ? (
                <Tooltip content={altName}>
                  <span className={`status-filename-text${filenameMode === 'display' && hasDisplay ? ' document-name--alias' : ''}`}>{searchTerm ? highlightText(showName, searchTerm) : showName}</span>
                </Tooltip>
              ) : (
                <span className={`status-filename-text${filenameMode === 'display' && hasDisplay ? ' document-name--alias' : ''}`}>{searchTerm ? highlightText(showName, searchTerm) : showName}</span>
              )}
              {/* 별칭 생성 실패 표시 */}
              {filenameMode === 'display' && !hasDisplay && document.displayNameStatus === 'failed' && (
                <Tooltip content="별칭 자동 생성에 실패했습니다. 별칭AI 버튼으로 재생성할 수 있습니다.">
                  <span className="document-name__alias-failed">⚠</span>
                </Tooltip>
              )}
              {/* 호버 시 이름변경/삭제 아이콘 */}
              {onRenameClick && onDeleteClick && (
                <span className="status-filename-hover-actions" onClick={(e) => e.stopPropagation()}>
                  <Tooltip content="이름 변경">
                    <button
                      type="button"
                      className="hover-action-btn hover-action-btn--rename"
                      onClick={(e) => { e.stopPropagation(); onRenameClick(document) }}
                      aria-label="이름 변경"
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </Tooltip>
                  <Tooltip content="삭제">
                    <button
                      type="button"
                      className="hover-action-btn hover-action-btn--delete"
                      onClick={(e) => { e.stopPropagation(); onDeleteClick(document) }}
                      aria-label="삭제"
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4m2 0v9.33a1.33 1.33 0 01-1.34 1.34H4.67a1.33 1.33 0 01-1.34-1.34V4h9.34z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </Tooltip>
                </span>
              )}
            </>
          )
        })()}
        {/* PDF 변환 상태 배지 (변환 대상 파일에만 표시) */}
        {(() => {
          const uploadData = typeof document.upload === 'object' ? document.upload : null

          // 파일명에서 확장자 추출하여 변환 대상 여부 판단
          const filename = DocumentStatusService.extractFilename(document) || ''
          const extMatch = filename.match(/\.([^.]+)$/i)
          const ext = extMatch ? extMatch[1].toLowerCase() : ''
          const convertibleExts = ['pptx', 'ppt', 'xlsx', 'xls', 'docx', 'doc', 'hwp', 'txt']
          const isConvertible = document.isConvertible ?? convertibleExts.includes(ext)

          // 변환 대상이 아니면 배지 안 보임
          if (!isConvertible) return null

          // 변환 상태: API 값 우선, 없으면 변환 대상 파일은 "pending" 기본값
          const rawStatus = document.conversionStatus || uploadData?.conversion_status
          if (rawStatus === 'not_required') return null
          const conversionStatus = rawStatus || 'pending'

          const docId = document._id || document.id

          // 상태별 툴팁
          const tooltips: Record<string, string> = {
            completed: 'PDF 변환 완료',
            processing: 'PDF 변환 중...',
            pending: 'PDF 변환 대기 중 - 오래 걸리면 클릭하여 재시도',
            failed: 'PDF 변환 실패 - 클릭하여 재시도'
          }

          const tooltip = isRetryingPdf ? 'PDF 재변환 중...' : tooltips[conversionStatus] || ''

          // 상태별 아이콘 (굵고 선명한 SVG)
          const statusIcons: Record<string, React.ReactNode> = {
            completed: (
              <svg className="pdf-badge-icon" viewBox="0 0 12 12">
                <circle cx="6" cy="6" r="5.5" fill="#34c759"/>
                <path d="M3.5 6l2 2 3-4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ),
            processing: (
              <svg className="pdf-badge-icon pdf-badge-icon--spin" viewBox="0 0 12 12">
                <circle cx="6" cy="6" r="5" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="16 8" opacity="0.9"/>
              </svg>
            ),
            pending: (
              <svg className="pdf-badge-icon" viewBox="0 0 12 12">
                <circle cx="3" cy="6" r="1.5" fill="#fff"/>
                <circle cx="6" cy="6" r="1.5" fill="#fff"/>
                <circle cx="9" cy="6" r="1.5" fill="#fff"/>
              </svg>
            ),
            failed: (
              <svg className="pdf-badge-icon" viewBox="0 0 12 12">
                <circle cx="6" cy="6" r="5.5" fill="#fff"/>
                <path d="M4 4l4 4M8 4l-4 4" stroke="#ff3b30" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            )
          }

          const icon = statusIcons[conversionStatus] || statusIcons['pending']

          // failed/pending 상태: 클릭 가능한 버튼 (재시도)
          if (conversionStatus === 'failed' || conversionStatus === 'pending') {
            return (
              <Tooltip content={tooltip}>
                <button
                  type="button"
                  className={`pdf-conversion-badge pdf-conversion-badge--${conversionStatus} ${isRetryingPdf ? 'pdf-conversion-badge--retrying' : ''}`}
                  onClick={(e) => docId && onRetryPdfConversion(docId, e)}
                  disabled={isRetryingPdf || !docId}
                  aria-label="PDF 변환 재시도"
                >
                  {isRetryingPdf ? statusIcons['processing'] : icon}
                  <span className="pdf-badge-text">pdf</span>
                </button>
              </Tooltip>
            )
          }

          // 그 외 상태 (completed, processing): 일반 span
          return (
            <Tooltip content={tooltip}>
              <span className={`pdf-conversion-badge pdf-conversion-badge--${conversionStatus}`}>
                {icon}
                <span className="pdf-badge-text">pdf</span>
              </span>
            </Tooltip>
          )
        })()}
        {/* 바이러스 감염 배지 */}
        {(() => {
          const virusScan = (document as any).virusScan
          if (!virusScan) return null

          // 감염 또는 삭제된 파일만 배지 표시
          if (virusScan.status === 'infected' || virusScan.status === 'deleted') {
            const tooltipMsg = virusScan.status === 'deleted'
              ? `바이러스 감염으로 삭제됨: ${virusScan.threatName || '알 수 없는 위협'}`
              : `바이러스 감염: ${virusScan.threatName || '알 수 없는 위협'}`

            return (
              <Tooltip content={tooltipMsg}>
                <span className="virus-badge">
                  <svg className="virus-badge-icon" viewBox="0 0 12 12" width="8" height="8">
                    {/* Virus icon - center circle with spikes */}
                    <circle cx="6" cy="6" r="2.5" fill="#fff"/>
                    <circle cx="6" cy="1.2" r="1" fill="#fff"/>
                    <circle cx="6" cy="10.8" r="1" fill="#fff"/>
                    <circle cx="1.2" cy="6" r="1" fill="#fff"/>
                    <circle cx="10.8" cy="6" r="1" fill="#fff"/>
                    <circle cx="2.6" cy="2.6" r="0.8" fill="#fff"/>
                    <circle cx="9.4" cy="2.6" r="0.8" fill="#fff"/>
                    <circle cx="2.6" cy="9.4" r="0.8" fill="#fff"/>
                    <circle cx="9.4" cy="9.4" r="0.8" fill="#fff"/>
                  </svg>
                  <span className="virus-badge-text">virus</span>
                </span>
              </Tooltip>
            )
          }
          return null
        })()}
      </div>

      {/* 문서 유형 - 공통 컴포넌트 사용 (Single Source of Truth) */}
      <div className="document-doctype" onClick={(e) => e.stopPropagation()}>
        <DocumentTypeCell
          documentType={document.docType || document.document_type}
          isAnnualReport={document.is_annual_report}
          isCustomerReview={document.is_customer_review}
          onChange={(newType) => {
            const docId = document._id || document.id
            if (docId) {
              onDocTypeChange(docId, newType)
            }
          }}
          isUpdating={isUpdating}
        />
      </div>

      {/* 크기 */}
      <span className="document-size">
        {DocumentUtils.formatFileSize(DocumentStatusService.extractFileSize(document))}
      </span>

      {/* 타입 */}
      <span className="document-type">
        {document.mimeType ? DocumentUtils.getFileExtension(document.mimeType) : '-'}
      </span>

      {/* 업로드 날짜 */}
      <div className="status-date">
        {DocumentStatusService.formatUploadDate(
          DocumentStatusService.extractUploadedDate(document)
        )}
      </div>

      {/* 상태 (아이콘 + 텍스트) */}
      <div className="status-cell">
        {status === 'error' ? (
          // 에러 상태: 클릭 시 에러 메시지 클립보드 복사
          (() => {
            const errorMsg = getErrorMessage(document) || statusLabel
            const docId = document._id || document.id
            const isCopied = copiedErrorDocId === (docId ?? null)
            const tooltipContent = isCopied ? '복사됨 ✓' : errorMsg

            const handleCopyError = (e: React.MouseEvent) => {
              e.stopPropagation()
              // 클립보드에는 기술 상세 정보를 포함하여 복사 (디버깅용)
              const errorObj = (document as Record<string, unknown>)['error']
              let copyText = errorMsg
              if (errorObj && typeof errorObj === 'object' && errorObj !== null) {
                const detail = (errorObj as Record<string, unknown>)['detail']
                const statusCode = (errorObj as Record<string, unknown>)['statusCode']
                if (detail && typeof detail === 'string') {
                  copyText = `${errorMsg}\n\n[기술 정보]\nstatusCode: ${statusCode}\ndetail: ${detail}`
                }
              }
              navigator.clipboard.writeText(copyText).then(() => {
                setCopiedErrorDocId(docId ?? null)
                setTimeout(() => setCopiedErrorDocId(null), 1500)
              }).catch(() => {
                // 클립보드 API 사용 불가 시 무시
              })
            }

            return (
              <Tooltip content={tooltipContent}>
                <div
                  className="status-cell-inner status-cell-inner--clickable"
                  onClick={handleCopyError}
                  role="button"
                  aria-label="에러 메시지 복사"
                >
                  <div className={"status-icon status-" + status}>
                    {statusIcon}
                  </div>
                  <div className="status-text">
                    <span className="status-label">{statusLabel}</span>
                  </div>
                </div>
              </Tooltip>
            )
          })()
        ) : (
          // 일반 상태: 아이콘만 툴팁
          <>
            <Tooltip content={statusLabel}>
              <div className={"status-icon status-" + status}>
                {statusIcon}
              </div>
            </Tooltip>
            <div className="status-text">
              {(['processing', 'uploading', 'converting', 'extracting', 'ocr_processing', 'classifying', 'embedding'].includes(status)) && progress > 0 ? (
                <span className="progress-text">{progress}%</span>
              ) : (
                <span className="status-label">{statusLabel}</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* 연결된 고객 */}
      <div className="status-customer">
        {document.customer_relation?.customer_name ? (
          <>
            <button
              className="customer-name customer-name-button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                const customerId = document.customer_relation?.customer_id
                const customerName = document.customer_relation?.customer_name
                if (!customerId) return

                // onCustomerFilter가 있으면 즉시 필터 토글
                if (onCustomerFilter && customerName) {
                  onCustomerFilter({ id: customerId, name: customerName })
                  return
                }

                // 더블클릭 대기 (250ms)
                if (customerClickTimer.current) {
                  clearTimeout(customerClickTimer.current)
                }
                customerClickTimer.current = setTimeout(() => {
                  // 싱글클릭: RightPane에 고객 정보 표시
                  if (onCustomerClick) {
                    onCustomerClick(customerId)
                  }
                  customerClickTimer.current = null
                }, 250)
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                const customerId = document.customer_relation?.customer_id
                if (!customerId) return

                // 싱글클릭 타이머 취소
                if (customerClickTimer.current) {
                  clearTimeout(customerClickTimer.current)
                  customerClickTimer.current = null
                }
                // 더블클릭: 고객 전체보기 페이지로 이동
                if (onCustomerDoubleClick) {
                  onCustomerDoubleClick(customerId)
                }
              }}
              aria-label={`${document.customer_relation.customer_name} 상세 보기`}
            >
              <div className="customer-icon-wrapper">
                {document.customer_relation.customer_type === '법인' ? (
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--corporate">
                    <circle cx="10" cy="10" r="10" opacity="0.2" />
                    <path d="M6 5h2v2H6V5zm0 3h2v2H6V8zm0 3h2v2H6v-2zm3-6h2v2H9V5zm0 3h2v2H9V8zm0 3h2v2H9v-2zm3-6h2v2h-2V5zm0 3h2v2h-2V8zm0 3h2v2h-2v-2zM5 14h10v2H5v-2z" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--personal">
                    <circle cx="10" cy="10" r="10" opacity="0.2" />
                    <circle cx="10" cy="7" r="3" />
                    <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
                  </svg>
                )}
              </div>
              <span className="customer-name-text">{document.customer_relation.customer_name}</span>
            </button>
            {/* 고객 변경 아이콘 — 행 호버 시에만 표시 */}
            {onChangeCustomerClick && status === 'completed' && (
              <button
                className="customer-change-icon"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  const docId = document._id ?? document.id
                  const customerId = document.customer_relation?.customer_id
                  if (docId && customerId) {
                    onChangeCustomerClick(docId, customerId)
                  }
                }}
                aria-label="연결 고객 변경"
                title="다른 고객으로 변경"
              >
                <SFSymbol name="link" size={SFSymbolSize.CAPTION_2} />
              </button>
            )}
          </>
        ) : (userId && document.customerId && userId === document.customerId) ? (
          <span className="customer-id-text">{userId}</span>
        ) : (onUnlinkedCustomerClick && canLink) ? (
          <button
            className="customer-none customer-none--linkable"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              const docId = document._id ?? document.id
              if (docId) onUnlinkedCustomerClick(docId)
            }}
            aria-label="고객 연결"
          >
            <div className="customer-icon-wrapper">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--unlinked">
                <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 2" />
                <circle cx="10" cy="7.5" r="2.5" opacity="0.5" />
                <path d="M10 11c-2.5 0-4.5 1.5-4.5 3.5v1h9v-1c0-2-2-3.5-4.5-3.5z" opacity="0.5" />
              </svg>
            </div>
            <span className="customer-none-text">미연결</span>
          </button>
        ) : (
          <span className="customer-none">-</span>
        )}
      </div>

      {/* 액션 버튼 */}
      <div className="status-actions">
        {/* 상세 보기는 DEV 모드에서만 표시 */}
        {isDevMode && (
          <Tooltip content="상세 보기">
            <button
              className="action-btn action-btn--detail"
              onClick={(e) => {
                e.stopPropagation()
                onDetailClick?.(document)
              }}
              aria-label="상세 보기"
            >
              <EyeIcon />
            </button>
          </Tooltip>
        )}
        <Tooltip content={isCreditPending ? "크레딧 부족 - 요약 없음" : (!(typeof document.meta === 'object' && document.meta?.summary) && !(typeof document.ocr === 'object' && (document.ocr as any)?.summary)) ? '요약 없음' : "요약 보기"}>
          <button
            className={`action-btn action-btn--summary ${isCreditPending || (!(typeof document.meta === 'object' && document.meta?.summary) && !(typeof document.ocr === 'object' && (document.ocr as any)?.summary)) ? 'action-btn--disabled' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              if (!isCreditPending) {
                onSummaryClick?.(document)
              }
            }}
            aria-label="요약 보기"
            disabled={isCreditPending || (!(typeof document.meta === 'object' && document.meta?.summary) && !(typeof document.ocr === 'object' && (document.ocr as any)?.summary))}
          >
            <SummaryIcon />
          </button>
        </Tooltip>
        <Tooltip content={isCreditPending ? "크레딧 부족 - 텍스트 없음" : (!document._hasMetaText && !document._hasOcrText) ? '전체 텍스트 없음' : "전체 텍스트 보기"}>
          <button
            className={`action-btn action-btn--full ${isCreditPending || (!document._hasMetaText && !document._hasOcrText) ? 'action-btn--disabled' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              if (!isCreditPending) {
                onFullTextClick?.(document)
              }
            }}
            aria-label="전체 텍스트 보기"
            disabled={isCreditPending || (!document._hasMetaText && !document._hasOcrText)}
          >
            <DocumentIcon />
          </button>
        </Tooltip>
        {/* 내 파일(ownerId === customerId)이 아니고, DEV 모드일 때만 "고객에게 연결" 버튼 표시 */}
        {isDevMode && !isMyFile && (
          <Tooltip content={linkTooltip}>
            <button
              type="button"
              className="action-btn action-btn--link"
              onClick={(e) => {
                e.stopPropagation()
                if (canLink) {
                  onLinkClick?.(document)
                }
              }}
              aria-label={linkTooltip}
              aria-disabled={!canLink ? 'true' : 'false'}
              data-disabled={!canLink}
              tabIndex={canLink ? 0 : -1}
            >
              <LinkIcon />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  )
})

DocumentStatusRow.displayName = 'DocumentStatusRow'

// ─── DocumentStatusList: 메인 리스트 컴포넌트 ───

export interface DocumentStatusListProps {
  documents: Document[]
  isLoading: boolean
  isEmpty: boolean
  error: string | null
  onDocumentClick?: (documentId: string) => void
  onDocumentDoubleClick?: (document: Document) => void
  onDetailClick?: (document: Document) => void
  onSummaryClick?: (document: Document) => void
  onFullTextClick?: (document: Document) => void
  onLinkClick?: (document: Document) => void
  // 🍎 미연결 고객 클릭 (단건 고객 연결)
  onUnlinkedCustomerClick?: (documentId: string) => void
  // 🍎 연결된 고객 변경 클릭
  onChangeCustomerClick?: (documentId: string, currentCustomerId: string) => void
  // 🍎 Sort props
  sortField?: 'filename' | 'status' | 'uploadDate' | 'fileSize' | 'mimeType' | 'customer' | 'badgeType' | 'docType' | null
  sortDirection?: 'asc' | 'desc'
  onColumnSort?: (field: 'filename' | 'status' | 'uploadDate' | 'fileSize' | 'mimeType' | 'customer' | 'badgeType' | 'docType') => void
  // 🍎 Delete mode props
  isDeleteMode?: boolean
  selectedDocumentIds?: Set<string>
  onSelectAll?: (checked: boolean) => void | Promise<void>
  onSelectDocument?: (documentId: string, event: React.MouseEvent) => void
  // 🍎 Bulk link mode props
  isBulkLinkMode?: boolean
  // 🍎 Alias mode props
  isAliasMode?: boolean
  // 🍎 Customer click handler
  onCustomerClick?: (customerId: string) => void
  // 🍎 Customer double click handler (전체보기 페이지로 이동)
  onCustomerDoubleClick?: (customerId: string) => void
  // 🍎 고객 필터 토글 (클릭 시 해당 고객 문서만 필터)
  onCustomerFilter?: (filter: { id: string; name: string }) => void
  // 🍎 Refresh handler
  onRefresh?: () => Promise<void>
  // 🍎 Navigation handler
  onNavigate?: (viewKey: string) => void
  // 🍎 Context menu handler
  onRowContextMenu?: (document: Document, event: React.MouseEvent) => void
  // 🍎 파일명 표시 모드
  filenameMode?: 'display' | 'original'
  onFilenameModeChange?: (mode: 'display' | 'original') => void
  // 호버 액션: 이름변경/삭제
  onRenameClick?: (document: Document) => void
  onDeleteClick?: (document: Document) => void
  renamingDocumentId?: string | null
  onRenameConfirm?: (documentId: string, newName: string) => void
  onRenameCancel?: () => void
  // 검색어 하이라이트
  searchTerm?: string
  // RP에서 보고 있는 문서 ID (프리뷰 하이라이트용)
  previewDocumentId?: string | null
}

/**
 * 에러 코드를 한글 메시지로 변환
 */
export const ERROR_CODE_LABELS: Record<string, string> = {
  'OPENAI_QUOTA_EXCEEDED': 'OpenAI 크레딧 소진\n크레딧을 충전해주세요',
  'UNKNOWN': '알 수 없는 오류',
  'TIMEOUT': '처리 시간 초과',
  'CONNECTION_ERROR': '서버 연결 오류',
  'RATE_LIMIT': 'API 요청 한도 초과'
}

/**
 * 에러 메시지 정리 (URL 제거, 핵심만 추출)
 */
export const formatErrorMessage = (message: string): string => {
  // URL 제거
  let formatted = message.replace(/https?:\/\/[^\s]+/g, '').trim()

  // 특정 패턴 처리
  // "6 validation errors for..." → "Qdrant 저장 오류 (6개 필드)"
  const validationMatch = formatted.match(/(\d+)\s*validation\s*errors?\s*for/i)
  if (validationMatch) {
    return `Qdrant 저장 오류\n(${validationMatch[1]}개 유효성 검사 실패)`
  }

  // "insufficient_quota" 패턴
  if (formatted.includes('insufficient_quota') || formatted.includes('exceeded your current quota')) {
    return 'OpenAI 크레딧 소진\n크레딧을 충전해주세요'
  }

  // Upstage 415 미지원 포맷 패턴
  if (formatted.includes('not supported format') || formatted.includes('415')) {
    return '지원하지 않는 파일 형식'
  }

  // 너무 긴 경우 첫 문장만
  if (formatted.length > 60) {
    const firstSentence = formatted.match(/^[^.!]+[.!]?/)
    if (firstSentence) {
      formatted = firstSentence[0].trim()
    }
    if (formatted.length > 60) {
      formatted = formatted.slice(0, 57) + '...'
    }
  }

  return formatted || '처리 오류'
}


/**
 * Document에서 에러 메시지 추출
 */
export const getErrorMessage = (document: Document): string | null => {
  // 1. docembed 에러
  if (document.docembed && typeof document.docembed !== 'string') {
    const docembed = document.docembed as Record<string, unknown>
    // error_code가 있으면 해당 라벨 사용
    if (docembed['error_code'] && typeof docembed['error_code'] === 'string') {
      const label = ERROR_CODE_LABELS[docembed['error_code']]
      if (label) return label
    }
    // error_message 사용
    if (docembed['error_message'] && typeof docembed['error_message'] === 'string') {
      return formatErrorMessage(docembed['error_message'])
    }
    // error_code만 있는 경우 (라벨 없음)
    if (docembed['error_code'] && typeof docembed['error_code'] === 'string') {
      return docembed['error_code']
    }
  }

  // 2. stages.docembed 에러
  if (document.stages?.docembed && typeof document.stages.docembed !== 'string') {
    const stageDocembed = document.stages.docembed as Record<string, unknown>
    if (stageDocembed['error_code'] && typeof stageDocembed['error_code'] === 'string') {
      const label = ERROR_CODE_LABELS[stageDocembed['error_code']]
      if (label) return label
    }
    if (stageDocembed['error_message'] && typeof stageDocembed['error_message'] === 'string') {
      return formatErrorMessage(stageDocembed['error_message'])
    }
    if (stageDocembed['error_code'] && typeof stageDocembed['error_code'] === 'string') {
      return stageDocembed['error_code']
    }
  }

  // 3. OCR 에러 (quota_exceeded 포함)
  if (document.ocr && typeof document.ocr !== 'string') {
    const ocr = document.ocr as Record<string, unknown>
    // quota_exceeded인 경우 quota_message 사용
    if (ocr['status'] === 'quota_exceeded') {
      if (ocr['quota_message'] && typeof ocr['quota_message'] === 'string') {
        return 'OCR 한도 초과'
      }
      return 'OCR 한도 초과'
    }
    if (ocr['status'] === 'error' && ocr['message'] && typeof ocr['message'] === 'string') {
      return formatErrorMessage(ocr['message'])
    }
  }

  // 4. stages.ocr 에러
  if (document.stages?.ocr && typeof document.stages.ocr !== 'string') {
    const stageOcr = document.stages.ocr as Record<string, unknown>
    if (stageOcr['status'] === 'error' && stageOcr['message'] && typeof stageOcr['message'] === 'string') {
      return formatErrorMessage(stageOcr['message'])
    }
  }

  // 5. meta 에러
  if (document.meta && typeof document.meta !== 'string') {
    const meta = document.meta as Record<string, unknown>
    if (meta['meta_status'] === 'error' && meta['message'] && typeof meta['message'] === 'string') {
      return formatErrorMessage(meta['message'])
    }
  }

  // 6. error.statusMessage (에러 객체)
  const errorObj = (document as Record<string, unknown>)['error']
  if (errorObj && typeof errorObj === 'object' && errorObj !== null) {
    const statusMsg = (errorObj as Record<string, unknown>)['statusMessage']
    if (statusMsg && typeof statusMsg === 'string') {
      return formatErrorMessage(statusMsg)
    }
  }

  // 7. progressMessage (파이프라인 에러 사유)
  const progressMsg = (document as Record<string, unknown>)['progressMessage']
  if (progressMsg && typeof progressMsg === 'string' && progressMsg !== '처리 중') {
    return formatErrorMessage(progressMsg)
  }

  return null
}

export const DocumentStatusList: React.FC<DocumentStatusListProps> = ({
  documents,
  isLoading,
  isEmpty,
  error,
  onDocumentClick,
  onDocumentDoubleClick,
  onDetailClick,
  onSummaryClick,
  onFullTextClick,
  onLinkClick,
  onUnlinkedCustomerClick,
  onChangeCustomerClick,
  sortField,
  sortDirection,
  onColumnSort,
  isDeleteMode = false,
  isBulkLinkMode = false,
  isAliasMode = false,
  selectedDocumentIds = new Set(),
  onSelectAll,
  onSelectDocument,
  onCustomerClick,
  onCustomerDoubleClick,
  onCustomerFilter,
  onRefresh,
  onNavigate: _onNavigate,
  onRowContextMenu,
  filenameMode = 'display',
  onFilenameModeChange,
  onRenameClick,
  onDeleteClick,
  renamingDocumentId,
  onRenameConfirm,
  onRenameCancel,
  searchTerm,
  previewDocumentId,
}) => {
  // 🍎 애플 스타일 알림 모달
  const { showAlert } = useAppleConfirm()
  const { isDevMode } = useDevModeStore()

  // 현재 로그인한 사용자 ID (내 파일 기능용)
  const { userId } = useUserStore()

  // 🍎 칼럼 리사이즈 훅
  const {
    gridTemplateColumns: resizedGridTemplate,
    handleResizeStart,
    handleResizeReset,
    isResizing,
  } = useColumnResize({
    storageKey: COLUMN_RESIZE_STORAGE_KEY,
    columns: COLUMN_DEFS,
    gap: 10,
  })

  // 헤더 ref (파일명 칼럼의 실제 폭을 측정하기 위해)
  const headerRef = useRef<HTMLDivElement>(null)

  const [updatingDocTypeId, setUpdatingDocTypeId] = useState<string | null>(null)

  // 메모 모달 상태 관리
  const [notesModalVisible, setNotesModalVisible] = useState(false)
  const [selectedNotes, setSelectedNotes] = useState<{
    documentName: string
    customerName?: string | undefined
    customerId?: string | undefined
    documentId?: string | undefined
    notes: string
  } | null>(null)

  // PDF 변환 재시도 중인 문서 ID
  const [retryingDocumentId, setRetryingDocumentId] = useState<string | null>(null)


  /**
   * PDF 변환 재시도 핸들러
   */
  const handleRetryPdfConversion = useCallback(async (documentId: string, e: React.MouseEvent) => {
    e.stopPropagation() // 이벤트 버블링 방지

    if (retryingDocumentId) return // 이미 재시도 중이면 무시

    setRetryingDocumentId(documentId)
    try {
      const result = await api.post<{ success: boolean; message?: string; error?: string }>(
        `/api/documents/${documentId}/retry`,
        { stage: 'pdf_conversion' }
      )

      if (result.success) {
        await showAlert({
          title: '재시도 시작',
          message: 'PDF 변환을 다시 시도하고 있습니다.',
          confirmText: '확인'
        })
        // 목록 새로고침
        if (onRefresh) {
          await onRefresh()
        }
      } else {
        await showAlert({
          title: '재시도 실패',
          message: result.error || '재시도에 실패했습니다.',
          confirmText: '확인'
        })
      }
    } catch (error) {
      console.error('[DocumentStatusList] PDF 변환 재시도 오류:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentStatusList.handleRetryPdfConversion' })
      await showAlert({
        title: '오류',
        message: '재시도 중 오류가 발생했습니다.',
        confirmText: '확인'
      })
    } finally {
      setRetryingDocumentId(null)
    }
  }, [retryingDocumentId, onRefresh, showAlert])


  /**
   * 메모 저장 핸들러
   */
  const handleSaveNotes = useCallback(async (notes: string) => {
    if (!selectedNotes?.customerId || !selectedNotes?.documentId) {
      console.error('[DocumentStatusList] customerId 또는 documentId가 없습니다')
      errorReporter.reportApiError(new Error('customerId 또는 documentId 누락'), { component: 'DocumentStatusList.handleSaveNotes.validation' })
      return
    }

    try {
      await DocumentService.updateDocumentNotes(
        selectedNotes.customerId,
        selectedNotes.documentId,
        notes
      )

      // 성공 후 상태 업데이트
      setSelectedNotes(prev => prev ? { ...prev, notes } : null)

      // 문서 목록 새로고침
      if (onRefresh) {
        await onRefresh()
      }
    } catch (error) {
      console.error('[DocumentStatusList] 메모 저장 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentStatusList.handleSaveNotes' })
      showAlert({
        title: '저장 실패',
        message: '메모 저장에 실패했습니다.',
        iconType: 'error'
      })
      throw error
    }
  }, [selectedNotes, onRefresh, showAlert])

  /**
   * 메모 삭제 핸들러 (빈 문자열로 저장)
   */
  const handleDeleteNotes = useCallback(async () => {
    if (!selectedNotes?.customerId || !selectedNotes?.documentId) {
      console.error('[DocumentStatusList] customerId 또는 documentId가 없습니다')
      errorReporter.reportApiError(new Error('customerId 또는 documentId 누락'), { component: 'DocumentStatusList.handleDeleteNotes.validation' })
      return
    }

    try {
      await DocumentService.updateDocumentNotes(
        selectedNotes.customerId,
        selectedNotes.documentId,
        ''
      )

      // 모달 닫기
      setNotesModalVisible(false)
      setSelectedNotes(null)

      // 문서 목록 새로고침
      if (onRefresh) {
        await onRefresh()
      }
    } catch (error) {
      console.error('[DocumentStatusList] 메모 삭제 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentStatusList.handleDeleteNotes' })
      showAlert({
        title: '삭제 실패',
        message: '메모 삭제에 실패했습니다.',
        iconType: 'error'
      })
      throw error
    }
  }, [selectedNotes, onRefresh, showAlert])

  /**
   * 🍎 문서 유형 변경 핸들러
   */
  const handleDocTypeChange = useCallback(async (documentId: string, newType: string) => {
    if (updatingDocTypeId) return // 이미 업데이트 중이면 무시

    setUpdatingDocTypeId(documentId)
    try {
      await documentTypesService.updateDocumentType(documentId, newType)
      // 목록 새로고침
      if (onRefresh) {
        await onRefresh()
      }
    } catch (error) {
      console.error('[DocumentStatusList] 문서 유형 변경 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentStatusList.handleDocTypeChange' })
      await showAlert({
        title: '변경 실패',
        message: '문서 유형 변경에 실패했습니다.',
        confirmText: '확인'
      })
    } finally {
      setUpdatingDocTypeId(null)
    }
  }, [updatingDocTypeId, onRefresh, showAlert])

  // 로딩 상태
  if (isLoading && isEmpty) {
    return (
      <div className="document-status-list">
        <div className="list-loading">
          <div className="loading-spinner" aria-label="로딩 중" />
          <span>문서를 불러오는 중...</span>
        </div>
      </div>
    )
  }

  // 에러 상태
  if (error) {
    return (
      <div className="document-status-list">
        <div className="list-error">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      </div>
    )
  }

  // 빈 상태
  if (isEmpty) {
    return (
      <div className="document-status-list">
        <div className="list-empty">
          <span className="empty-icon">📄</span>
          <p className="empty-message">
            {searchTerm ? `'${searchTerm}'에 대한 검색 결과가 없습니다.` : '문서가 없습니다.'}
          </p>
        </div>
      </div>
    )
  }

  // 리스트 렌더링
  return (
    <div className={`document-status-list ${isDeleteMode || isBulkLinkMode || isAliasMode ? 'document-status-list--delete-mode' : ''}`}>
      {/* 🍎 칼럼 헤더 - 스티키 포지셔닝으로 항상 보임 */}
      <div
        className={`status-list-header ${isResizing ? 'status-list-header--resizing' : ''}`}
        ref={headerRef}
        style={resizedGridTemplate ? {
          gridTemplateColumns: (isDeleteMode || isBulkLinkMode || isAliasMode)
            ? `24px ${resizedGridTemplate}`
            : resizedGridTemplate
        } : undefined}
      >
        {/* 🍎 삭제 모드, 일괄 연결 모드, 또는 별칭 모드: 전체 선택 체크박스 */}
        {(isDeleteMode || isBulkLinkMode || isAliasMode) && (
          <div className="header-checkbox">
            <input
              type="checkbox"
              checked={documents.length > 0 && documents.every(doc => {
                const docId = doc._id ?? doc.id ?? ''
                // 🍎 일괄 연결 모드: 고객 미연결 문서만 선택 가능
                if (isBulkLinkMode) {
                  const hasCustomer = doc.customer_relation?.customer_name
                  return hasCustomer || selectedDocumentIds.has(docId)
                }
                // 🍎 별칭 모드: 이미 별칭이 있는 문서는 선택 대상에서 제외
                if (isAliasMode) {
                  const hasAlias = Boolean(doc.displayName) && doc.displayNameStatus !== 'failed'
                  return hasAlias || selectedDocumentIds.has(docId)
                }
                return selectedDocumentIds.has(docId)
              })}
              onChange={(e) => onSelectAll?.(e.target.checked)}
              aria-label="전체 선택"
              className="document-select-all-checkbox"
            />
          </div>
        )}
        {/* 🍎 처리유형 칼럼 */}
        <div
          className={`header-badge-type header-cell--resizable ${onColumnSort ? 'header-sortable' : ''}`}
          onClick={() => onColumnSort?.('badgeType')}
          role={onColumnSort ? 'button' : undefined}
          tabIndex={onColumnSort ? 0 : undefined}
          aria-label={onColumnSort ? '유형으로 정렬' : undefined}
        >
          <span>유형</span>
          {onColumnSort && <SortIndicator field="badgeType" currentSortField={sortField} sortDirection={sortDirection} />}
          <div
            className="column-resize-handle"
            onMouseDown={(e) => handleResizeStart(0, e)}
            onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); handleResizeReset(0); }}
          />
        </div>
        <div className="header-filename">
          <div
            className={onColumnSort ? 'header-sortable header-filename__sort-area' : 'header-filename__sort-area'}
            onClick={() => onColumnSort?.('filename')}
            role={onColumnSort ? 'button' : undefined}
            tabIndex={onColumnSort ? 0 : undefined}
            aria-label={onColumnSort ? '파일명으로 정렬' : undefined}
          >
            <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
              <path d="M4 1h5l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" fill="currentColor"/>
              <path d="M9 1v3h3" stroke="#f5f6f7" strokeWidth="0.8" fill="none"/>
            </svg>
            <span>파일명</span>
            {onColumnSort && <SortIndicator field="filename" currentSortField={sortField} sortDirection={sortDirection} />}
          </div>
          {/* 🍎 파일명 표시 모드 토글: 원본 ↔ 별칭 */}
          {onFilenameModeChange && (
            <FilenameModeToggle filenameMode={filenameMode} onModeChange={onFilenameModeChange} />
          )}
          <div
            className="column-resize-handle"
            onMouseDown={(e) => handleResizeStart(1, e)}
            onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); handleResizeReset(1); }}
          />
        </div>
        {/* 🍎 문서 유형 칼럼 (새 칼럼) */}
        <div
          className={`header-doctype header-cell--resizable ${onColumnSort ? 'header-sortable' : ''}`}
          onClick={() => onColumnSort?.('docType')}
          role={onColumnSort ? 'button' : undefined}
          tabIndex={onColumnSort ? 0 : undefined}
          aria-label={onColumnSort ? '문서 유형으로 정렬' : undefined}
        >
          <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
            <path d="M2 3h12v2H2V3zm0 4h8v2H2V7zm0 4h10v2H2v-2z" fill="currentColor"/>
          </svg>
          <span>문서 유형</span>
          {onColumnSort && <SortIndicator field="docType" currentSortField={sortField} sortDirection={sortDirection} />}
          <div
            className="column-resize-handle"
            onMouseDown={(e) => handleResizeStart(2, e)}
            onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); handleResizeReset(2); }}
          />
        </div>
        <div
          className={`header-size header-cell--resizable ${onColumnSort ? 'header-sortable' : ''}`}
          onClick={() => onColumnSort?.('fileSize')}
          role={onColumnSort ? 'button' : undefined}
          tabIndex={onColumnSort ? 0 : undefined}
          aria-label={onColumnSort ? '크기로 정렬' : undefined}
        >
          <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            <path d="M8 2v6l4 2" stroke="currentColor" strokeWidth="1.2" fill="none"/>
          </svg>
          <span>크기</span>
          {onColumnSort && <SortIndicator field="fileSize" currentSortField={sortField} sortDirection={sortDirection} />}
          <div
            className="column-resize-handle"
            onMouseDown={(e) => handleResizeStart(3, e)}
            onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); handleResizeReset(3); }}
          />
        </div>
        <div
          className={`header-type header-cell--resizable ${onColumnSort ? 'header-sortable' : ''}`}
          onClick={() => onColumnSort?.('mimeType')}
          role={onColumnSort ? 'button' : undefined}
          tabIndex={onColumnSort ? 0 : undefined}
          aria-label={onColumnSort ? '타입으로 정렬' : undefined}
        >
          <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
            <path d="M3 14h10V4H3v10zm2-8h1v1H5V6zm3 0h1v1H8V6zm3 0h1v1h-1V6z" fill="currentColor"/>
          </svg>
          <span>타입</span>
          {onColumnSort && <SortIndicator field="mimeType" currentSortField={sortField} sortDirection={sortDirection} />}
          <div
            className="column-resize-handle"
            onMouseDown={(e) => handleResizeStart(4, e)}
            onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); handleResizeReset(4); }}
          />
        </div>
        <div
          className={`header-date header-cell--resizable ${onColumnSort ? 'header-sortable' : ''}`}
          onClick={() => onColumnSort?.('uploadDate')}
          role={onColumnSort ? 'button' : undefined}
          tabIndex={onColumnSort ? 0 : undefined}
          aria-label={onColumnSort ? '업로드 날짜로 정렬' : undefined}
        >
          <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
            <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            <path d="M2 6h12M5 1v3M11 1v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <span>업로드 날짜</span>
          {onColumnSort && <SortIndicator field="uploadDate" currentSortField={sortField} sortDirection={sortDirection} />}
          <div
            className="column-resize-handle"
            onMouseDown={(e) => handleResizeStart(5, e)}
            onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); handleResizeReset(5); }}
          />
        </div>
        <div
          className={`header-status header-cell--resizable ${onColumnSort ? 'header-sortable' : ''}`}
          onClick={() => onColumnSort?.('status')}
          role={onColumnSort ? 'button' : undefined}
          tabIndex={onColumnSort ? 0 : undefined}
          aria-label={onColumnSort ? '상태로 정렬' : undefined}
        >
          <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
            <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            <path d="M5 7l2 2 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>상태</span>
          {onColumnSort && <SortIndicator field="status" currentSortField={sortField} sortDirection={sortDirection} />}
          <div
            className="column-resize-handle"
            onMouseDown={(e) => handleResizeStart(6, e)}
            onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); handleResizeReset(6); }}
          />
        </div>
        <div
          className={`header-customer header-cell--resizable ${onColumnSort ? 'header-sortable' : ''}`}
          onClick={() => onColumnSort?.('customer')}
          role={onColumnSort ? 'button' : undefined}
          tabIndex={onColumnSort ? 0 : undefined}
          aria-label={onColumnSort ? '연결된 고객으로 정렬' : undefined}
        >
          <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
            <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.2" fill="none"/>
          </svg>
          <span>연결된 고객</span>
          {onColumnSort && <SortIndicator field="customer" currentSortField={sortField} sortDirection={sortDirection} />}
          <div
            className="column-resize-handle"
            onMouseDown={(e) => handleResizeStart(7, e)}
            onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); handleResizeReset(7); }}
          />
        </div>
        <div className="header-actions">
          <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
            <circle cx="5" cy="8" r="1.5" fill="currentColor"/>
            <circle cx="11" cy="8" r="1.5" fill="currentColor"/>
          </svg>
          <span>액션</span>
        </div>
      </div>

      {documents.map((document, index) => {
        const documentId = document._id ?? document.id ?? null
        const key = documentId ?? `${DocumentStatusService.extractFilename(document)}-${index}`

        return (
          <DocumentStatusRow
            key={key}
            document={document}
            index={index}
            isSelected={documentId ? selectedDocumentIds.has(documentId) : false}
            isPreview={Boolean(documentId) && documentId === previewDocumentId}
            isUpdating={updatingDocTypeId === documentId}
            isRetryingPdf={retryingDocumentId === documentId}
            isDeleteMode={isDeleteMode}
            isBulkLinkMode={isBulkLinkMode}
            isAliasMode={isAliasMode}
            isDevMode={isDevMode}
            userId={userId}
            filenameMode={filenameMode}
            onDocumentClick={onDocumentClick}
            onDocumentDoubleClick={onDocumentDoubleClick}
            onSelectDocument={onSelectDocument}
            onDetailClick={onDetailClick}
            onSummaryClick={onSummaryClick}
            onFullTextClick={onFullTextClick}
            onLinkClick={onLinkClick}
            onUnlinkedCustomerClick={onUnlinkedCustomerClick}
            onChangeCustomerClick={onChangeCustomerClick}
            onCustomerClick={onCustomerClick}
            onCustomerDoubleClick={onCustomerDoubleClick}
            onCustomerFilter={onCustomerFilter}
            onRowContextMenu={onRowContextMenu}
            onRetryPdfConversion={handleRetryPdfConversion}
            onDocTypeChange={handleDocTypeChange}
            onRenameClick={onRenameClick}
            onDeleteClick={onDeleteClick}
            renamingDocumentId={renamingDocumentId}
            onRenameConfirm={onRenameConfirm}
            onRenameCancel={onRenameCancel}
            searchTerm={searchTerm}
            gridTemplateColumns={resizedGridTemplate}
          />
        )
      })}

      {/* 메모 모달 */}
      {selectedNotes && (
        <DocumentNotesModal
          visible={notesModalVisible}
          documentName={selectedNotes.documentName}
          customerName={selectedNotes.customerName}
          customerId={selectedNotes.customerId}
          documentId={selectedNotes.documentId}
          notes={selectedNotes.notes}
          onClose={() => {
            setNotesModalVisible(false)
            setSelectedNotes(null)
          }}
          onSave={handleSaveNotes}
          onDelete={handleDeleteNotes}
        />
      )}
    </div>
  )
}

export default DocumentStatusList
