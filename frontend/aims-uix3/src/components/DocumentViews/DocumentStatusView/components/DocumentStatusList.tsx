/**
 * DocumentStatusList Component
 * @version 3.0.0 - 🍎 DocumentLibrary 리스트 구조 완벽 복제
 *
 * 공간 효율적인 리스트 레이아웃
 */

import React, { useState, useCallback } from 'react'
import { useAppleConfirm } from '@/contexts/AppleConfirmProvider'
import { Tooltip } from '@/shared/ui'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../SFSymbol'
import { DocumentUtils } from '@/entities/document'
import { DocumentStatusService } from '../../../../services/DocumentStatusService'
import { DocumentService } from '../../../../services/DocumentService'
import type { Document } from '../../../../types/documentStatus'
import {
  DocumentIcon,
  EyeIcon,
  LinkIcon,
  SummaryIcon
} from '../../components/DocumentActionIcons'
import { DocumentNotesModal } from './DocumentNotesModal'
import { useUserStore } from '../../../../stores/user'
import './DocumentStatusList.css'

export interface DocumentStatusListProps {
  documents: Document[]
  isLoading: boolean
  isEmpty: boolean
  error: string | null
  onDocumentClick?: (documentId: string) => void
  onDetailClick?: (document: Document) => void
  onSummaryClick?: (document: Document) => void
  onFullTextClick?: (document: Document) => void
  onLinkClick?: (document: Document) => void
  // 🍎 Sort props
  sortField?: 'filename' | 'status' | 'uploadDate' | 'fileSize' | 'mimeType' | 'customer' | 'badgeType' | null
  sortDirection?: 'asc' | 'desc'
  onColumnSort?: (field: 'filename' | 'status' | 'uploadDate' | 'fileSize' | 'mimeType' | 'customer' | 'badgeType') => void
  // 🍎 Delete mode props
  isDeleteMode?: boolean
  selectedDocumentIds?: Set<string>
  onSelectAll?: (checked: boolean) => void
  onSelectDocument?: (documentId: string, event: React.MouseEvent) => void
  // 🍎 Bulk link mode props
  isBulkLinkMode?: boolean
  // 🍎 Customer click handler
  onCustomerClick?: (customerId: string) => void
  // 🍎 Refresh handler
  onRefresh?: () => Promise<void>
}

/**
 * OCR 신뢰도를 5단계로 분류
 * 0.0 ~ 1.0 범위의 신뢰도를 색상 레벨로 변환
 */
const getOcrConfidenceLevel = (confidence: number): {
  color: string
  label: string
} => {
  if (confidence >= 0.95) {
    return { color: 'excellent', label: '매우 높음' }
  } else if (confidence >= 0.85) {
    return { color: 'high', label: '높음' }
  } else if (confidence >= 0.70) {
    return { color: 'medium', label: '보통' }
  } else if (confidence >= 0.50) {
    return { color: 'low', label: '낮음' }
  } else {
    return { color: 'very-low', label: '매우 낮음' }
  }
}

/**
 * Document에서 OCR confidence 추출
 *
 * 두 가지 소스에서 시도:
 * 1. document.ocr?.confidence (검색 API에서 사용)
 * 2. document.stages?.ocr?.message에서 파싱 (리스트 API에서 사용)
 */
const getOcrConfidence = (document: Document): number | null => {
  // 1. document.ocr?.confidence 먼저 시도 (검색 API)
  if (document.ocr && typeof document.ocr !== 'string') {
    const directConfidence = document.ocr.confidence
    if (directConfidence) {
      const parsed = parseFloat(directConfidence)
      if (!isNaN(parsed)) return parsed
    }
  }

  // 2. stages.ocr.message에서 파싱 시도 (리스트 API)
  // 예: "OCR 완료 (신뢰도: 0.9817)"
  const stageOcr = document.stages?.ocr
  if (stageOcr && typeof stageOcr !== 'string') {
    const ocrMessage = stageOcr.message
    if (ocrMessage && typeof ocrMessage === 'string') {
      const match = ocrMessage.match(/신뢰도:\s*([\d.]+)/)
      if (match && match[1]) {
        const parsed = parseFloat(match[1])
        if (!isNaN(parsed)) return parsed
      }
    }
  }

  return null
}

export const DocumentStatusList: React.FC<DocumentStatusListProps> = ({
  documents,
  isLoading,
  isEmpty,
  error,
  onDocumentClick,
  onDetailClick,
  onSummaryClick,
  onFullTextClick,
  onLinkClick,
  sortField,
  sortDirection,
  onColumnSort,
  isDeleteMode = false,
  isBulkLinkMode = false,
  selectedDocumentIds = new Set(),
  onSelectAll,
  onSelectDocument,
  onCustomerClick,
  onRefresh
}) => {
  // 🍎 애플 스타일 알림 모달
  const { showAlert } = useAppleConfirm()

  // 현재 로그인한 사용자 ID (내 파일 기능용)
  const { userId } = useUserStore()

  // 메모 모달 상태 관리
  const [notesModalVisible, setNotesModalVisible] = useState(false)
  const [selectedNotes, setSelectedNotes] = useState<{
    documentName: string
    customerName?: string | undefined
    customerId?: string | undefined
    documentId?: string | undefined
    notes: string
  } | null>(null)

  /**
   * 메모 저장 핸들러
   */
  const handleSaveNotes = useCallback(async (notes: string) => {
    if (!selectedNotes?.customerId || !selectedNotes?.documentId) {
      console.error('[DocumentStatusList] customerId 또는 documentId가 없습니다')
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
      showAlert({
        title: '삭제 실패',
        message: '메모 삭제에 실패했습니다.',
        iconType: 'error'
      })
      throw error
    }
  }, [selectedNotes, onRefresh, showAlert])

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
          <p className="empty-message">문서가 없습니다.</p>
        </div>
      </div>
    )
  }

  // 리스트 렌더링
  return (
    <div className={`document-status-list ${isDeleteMode || isBulkLinkMode ? 'document-status-list--delete-mode' : ''}`}>
      {/* 🍎 칼럼 헤더 - 스티키 포지셔닝으로 항상 보임 */}
      <div className="status-list-header">
        {/* 🍎 삭제 모드 또는 일괄 연결 모드: 전체 선택 체크박스 */}
        {(isDeleteMode || isBulkLinkMode) && (
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
                // 🍎 삭제 모드: 완료되지 않은 문서는 제외
                if (isDeleteMode) {
                  const status = DocumentStatusService.extractStatus(doc)
                  if (status !== 'completed') {
                    return true // 비활성화된 항목은 체크 상태 계산에서 제외 (항상 true로 처리)
                  }
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
          className={`header-badge-type ${onColumnSort ? 'header-sortable' : ''}`}
          onClick={() => onColumnSort?.('badgeType')}
          role={onColumnSort ? 'button' : undefined}
          tabIndex={onColumnSort ? 0 : undefined}
          aria-label={onColumnSort ? '유형으로 정렬' : undefined}
        >
          <span>유형</span>
          {onColumnSort && (
            sortField === 'badgeType' ? (
              <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
            ) : (
              <span className="sort-indicator sort-indicator--both">
                <span className="sort-arrow">▲</span>
                <span className="sort-arrow">▼</span>
              </span>
            )
          )}
        </div>
        <div
          className={`header-filename ${onColumnSort ? 'header-sortable' : ''}`}
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
          {onColumnSort && (
            sortField === 'filename' ? (
              <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
            ) : (
              <span className="sort-indicator sort-indicator--both">
                <span className="sort-arrow">▲</span>
                <span className="sort-arrow">▼</span>
              </span>
            )
          )}
        </div>
        <div
          className={`header-size ${onColumnSort ? 'header-sortable' : ''}`}
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
          {onColumnSort && (
            sortField === 'fileSize' ? (
              <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
            ) : (
              <span className="sort-indicator sort-indicator--both">
                <span className="sort-arrow">▲</span>
                <span className="sort-arrow">▼</span>
              </span>
            )
          )}
        </div>
        <div
          className={`header-type ${onColumnSort ? 'header-sortable' : ''}`}
          onClick={() => onColumnSort?.('mimeType')}
          role={onColumnSort ? 'button' : undefined}
          tabIndex={onColumnSort ? 0 : undefined}
          aria-label={onColumnSort ? '타입으로 정렬' : undefined}
        >
          <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
            <path d="M3 14h10V4H3v10zm2-8h1v1H5V6zm3 0h1v1H8V6zm3 0h1v1h-1V6z" fill="currentColor"/>
          </svg>
          <span>타입</span>
          {onColumnSort && (
            sortField === 'mimeType' ? (
              <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
            ) : (
              <span className="sort-indicator sort-indicator--both">
                <span className="sort-arrow">▲</span>
                <span className="sort-arrow">▼</span>
              </span>
            )
          )}
        </div>
        <div
          className={`header-date ${onColumnSort ? 'header-sortable' : ''}`}
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
          {onColumnSort && (
            sortField === 'uploadDate' ? (
              <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
            ) : (
              <span className="sort-indicator sort-indicator--both">
                <span className="sort-arrow">▲</span>
                <span className="sort-arrow">▼</span>
              </span>
            )
          )}
        </div>
        <div
          className={`header-status ${onColumnSort ? 'header-sortable' : ''}`}
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
          {onColumnSort && (
            sortField === 'status' ? (
              <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
            ) : (
              <span className="sort-indicator sort-indicator--both">
                <span className="sort-arrow">▲</span>
                <span className="sort-arrow">▼</span>
              </span>
            )
          )}
        </div>
        <div
          className={`header-customer ${onColumnSort ? 'header-sortable' : ''}`}
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
          {onColumnSort && (
            sortField === 'customer' ? (
              <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
            ) : (
              <span className="sort-indicator sort-indicator--both">
                <span className="sort-arrow">▲</span>
                <span className="sort-arrow">▼</span>
              </span>
            )
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

      {documents.map((document, index) => {
        const status = DocumentStatusService.extractStatus(document)
        const progress = DocumentStatusService.extractProgress(document)
        const statusLabel = DocumentStatusService.getStatusLabel(status)
        const statusIcon = DocumentStatusService.getStatusIcon(status)
        const isLinked = Boolean(document.customer_relation)
        const isAnnualReport = document.is_annual_report === true
        // 내 파일 여부 확인 (ownerId === customerId)
        const isMyFile = document.ownerId && document.customerId && document.ownerId === document.customerId
        // AR 문서는 자동 연결되므로 처리 완료되어도 버튼 비활성화 유지
        const canLink = status === 'completed' && !isLinked && !isAnnualReport
        const linkTooltip = isLinked ? '이미 고객과 연결됨' : '고객에게 연결'

        const documentId = document._id ?? document.id ?? null
        const key = documentId ?? `${DocumentStatusService.extractFilename(document)}-${index}`

        const isSelected = documentId ? selectedDocumentIds.has(documentId) : false

        return (
          <div
            key={key}
            className={`status-item ${isSelected ? 'status-item--selected' : ''}`}
            onClick={() => {
              if (documentId && onDocumentClick && !isDeleteMode) {
                onDocumentClick(documentId)
              }
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                if (documentId && onDocumentClick && !isDeleteMode) {
                  onDocumentClick(documentId)
                }
              }
            }}
          >
            {/* 🍎 삭제 모드 또는 일괄 연결 모드: 개별 선택 체크박스 */}
            {(() => {
              // 🍎 일괄 연결 모드: 고객 미연결 문서만 체크박스 표시
              if (isBulkLinkMode) {
                const hasCustomer = document.customer_relation?.customer_name
                if (hasCustomer) {
                  // 고객 연결된 문서는 체크박스 없음 (공백으로 레이아웃 유지)
                  return <div className="document-checkbox-wrapper"></div>
                }
              }

              // 삭제 모드 또는 일괄 연결 모드 (미연결 문서)
              if (isDeleteMode || isBulkLinkMode) {
                // 삭제 모드에서 완료되지 않은 문서는 비활성화
                const isDisabled = isDeleteMode && status !== 'completed'

                return (
                  <div
                    className={`document-checkbox-wrapper ${isDisabled ? 'document-checkbox-wrapper--disabled' : ''}`}
                    onClick={(e) => {
                      if (documentId && !isDisabled) {
                        onSelectDocument?.(documentId, e)
                      }
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      disabled={isDisabled}
                      aria-label={`${DocumentStatusService.extractFilename(document)} 선택`}
                      className="document-checkbox"
                    />
                  </div>
                )
              }

              return null
            })()}

            {/* 🍎 유형 칼럼: 아이콘 + 모든 뱃지 (AR, TXT, OCR, BIN) */}
            <div className="document-icon-wrapper">
              <div className={`document-icon ${DocumentUtils.getFileTypeClass(document.mimeType, DocumentStatusService.extractFilename(document))}`}>
                <SFSymbol
                  name={DocumentUtils.getFileIcon(document.mimeType, DocumentStatusService.extractFilename(document))}
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
              {/* 🍎 TXT/OCR/BIN BADGE: 처리 유형 표시 */}
              {(() => {
                // 🔥 백엔드 badgeType 필드 우선 사용 (정렬과 일관성 유지)
                const backendBadgeType = (document as any).badgeType
                if (backendBadgeType) {
                  if (backendBadgeType === 'OCR') {
                    const confidence = getOcrConfidence(document)
                    if (confidence !== null) {
                      const level = getOcrConfidenceLevel(confidence)
                      return (
                        <Tooltip content={`OCR 신뢰도: ${(confidence * 100).toFixed(1)}% (${level.label})`}>
                          <div className={`document-ocr-badge ocr-${level.color}`}>
                            OCR
                          </div>
                        </Tooltip>
                      )
                    }
                    // confidence 없으면 기본 OCR 뱃지
                    return (
                      <Tooltip content="OCR 처리 완료">
                        <div className="document-ocr-badge ocr-medium">
                          OCR
                        </div>
                      </Tooltip>
                    )
                  }
                  if (backendBadgeType === 'TXT') {
                    return (
                      <Tooltip content="TXT 기반 문서">
                        <div className="document-txt-badge">
                          TXT
                        </div>
                      </Tooltip>
                    )
                  }
                  if (backendBadgeType === 'BIN') {
                    return (
                      <Tooltip content="바이너리 파일 (텍스트 추출 불가)">
                        <div className="document-bin-badge">
                          BIN
                        </div>
                      </Tooltip>
                    )
                  }
                }

                // 🔄 하위 호환성: badgeType 없으면 기존 로직 사용
                const confidence = getOcrConfidence(document)
                if (confidence === null) {
                  // OCR 뱃지가 없는 경우, TXT 또는 BIN 타입 표시
                  const typeLabel = DocumentUtils.getDocumentTypeLabel(document);
                  if (typeLabel === 'TXT') {
                    return (
                      <Tooltip content="TXT 기반 문서">
                        <div className="document-txt-badge">
                          TXT
                        </div>
                      </Tooltip>
                    );
                  }
                  if (typeLabel === 'BIN') {
                    return (
                      <Tooltip content="바이너리 파일 (텍스트 추출 불가)">
                        <div className="document-bin-badge">
                          BIN
                        </div>
                      </Tooltip>
                    );
                  }
                  return null;
                }
                const level = getOcrConfidenceLevel(confidence)
                return (
                  <Tooltip content={`OCR 신뢰도: ${(confidence * 100).toFixed(1)}% (${level.label})`}>
                    <div className={`document-ocr-badge ocr-${level.color}`}>
                      OCR
                    </div>
                  </Tooltip>
                )
              })()}
            </div>

            {/* 파일명 */}
            <div className="status-filename">
              {DocumentStatusService.extractFilename(document)}
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
              <Tooltip content={statusLabel}>
                <div className={"status-icon status-" + status}>
                  {statusIcon}
                </div>
              </Tooltip>
              <div className="status-text">
                {status === 'processing' && progress ? (
                  <span className="progress-text">{progress}%</span>
                ) : (
                  <span className="status-label">{statusLabel}</span>
                )}
              </div>
            </div>

            {/* 연결된 고객 */}
            <div className="status-customer">
              {document.customer_relation?.customer_name ? (
                <button
                  className="customer-name customer-name-button"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (onCustomerClick && document.customer_relation?.customer_id) {
                      onCustomerClick(document.customer_relation.customer_id)
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
              ) : (userId && document.customerId && userId === document.customerId) ? (
                <span className="customer-id-text">{userId}</span>
              ) : (
                <span className="customer-none">-</span>
              )}
            </div>

            {/* 액션 버튼 */}
            <div className="status-actions">
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
              <Tooltip content="요약 보기">
                <button
                  className="action-btn action-btn--summary"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSummaryClick?.(document)
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
                    onFullTextClick?.(document)
                  }}
                  aria-label="전체 텍스트 보기"
                >
                  <DocumentIcon />
                </button>
              </Tooltip>
              {/* 내 파일(ownerId === customerId)이 아닐 때만 "고객에게 연결" 버튼 표시 */}
              {!isMyFile && (
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
