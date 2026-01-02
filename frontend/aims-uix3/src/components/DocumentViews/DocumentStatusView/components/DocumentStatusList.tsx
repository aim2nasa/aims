/**
 * DocumentStatusList Component
 * @version 3.0.0 - 🍎 DocumentLibrary 리스트 구조 완벽 복제
 *
 * 공간 효율적인 리스트 레이아웃
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useAppleConfirm } from '@/contexts/AppleConfirmProvider'
import { useDevModeStore } from '@/shared/store/useDevModeStore'
import { Tooltip, DocumentTypeCell } from '@/shared/ui'
import Button from '@/shared/ui/Button'
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
import { DocumentNotesModal } from './DocumentNotesModal'
import { useUserStore } from '../../../../stores/user'
import { errorReporter } from '@/shared/lib/errorReporter'
import { documentTypesService, type DocumentType } from '../../../../services/documentTypesService'
import './DocumentStatusList.css'

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
  // 🍎 Sort props
  sortField?: 'filename' | 'status' | 'uploadDate' | 'fileSize' | 'mimeType' | 'customer' | 'badgeType' | 'docType' | null
  sortDirection?: 'asc' | 'desc'
  onColumnSort?: (field: 'filename' | 'status' | 'uploadDate' | 'fileSize' | 'mimeType' | 'customer' | 'badgeType' | 'docType') => void
  // 🍎 Delete mode props
  isDeleteMode?: boolean
  selectedDocumentIds?: Set<string>
  onSelectAll?: (checked: boolean) => void
  onSelectDocument?: (documentId: string, event: React.MouseEvent) => void
  // 🍎 Bulk link mode props
  isBulkLinkMode?: boolean
  // 🍎 Customer click handler
  onCustomerClick?: (customerId: string) => void
  // 🍎 Customer double click handler (전체보기 페이지로 이동)
  onCustomerDoubleClick?: (customerId: string) => void
  // 🍎 Refresh handler
  onRefresh?: () => Promise<void>
  // 🍎 Navigation handler
  onNavigate?: (viewKey: string) => void
  // 🍎 Context menu handler
  onRowContextMenu?: (document: Document, event: React.MouseEvent) => void
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
 * quota_exceeded 에러인지 확인
 * OCR 한도 초과 에러는 수동 재시도 불가
 */
export const isQuotaExceededError = (document: Document): boolean => {
  // 1. ocr.status 확인 (타입에 없는 값도 체크 가능하도록 as string 사용)
  if (document.ocr && typeof document.ocr !== 'string') {
    const ocrStatus = document.ocr.status as string | undefined
    if (ocrStatus === 'quota_exceeded') {
      return true
    }
  }

  // 2. stages.ocr.message 확인
  if (document.stages?.ocr && typeof document.stages.ocr !== 'string') {
    const message = document.stages.ocr.message
    if (message && typeof message === 'string' && message.includes('한도 초과')) {
      return true
    }
  }

  return false
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

  return null
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
  onDocumentDoubleClick,
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
  onCustomerDoubleClick,
  onRefresh,
  onNavigate,
  onRowContextMenu
}) => {
  // 🍎 애플 스타일 알림 모달
  const { showAlert } = useAppleConfirm()
  const { isDevMode } = useDevModeStore()

  // 현재 로그인한 사용자 ID (내 파일 기능용)
  const { userId } = useUserStore()

  // 🍎 문서 유형 목록 상태
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([])
  const [updatingDocTypeId, setUpdatingDocTypeId] = useState<string | null>(null)

  // 🍎 문서 유형 목록 로드
  useEffect(() => {
    const loadDocumentTypes = async () => {
      try {
        const types = await documentTypesService.getDocumentTypes(false) // 시스템 유형 제외
        setDocumentTypes(types)
      } catch (error) {
        console.error('[DocumentStatusList] 문서 유형 로드 실패:', error)
      }
    }
    loadDocumentTypes()
  }, [])

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

  // OCR 재시도 중인 문서 ID
  const [retryingOcrDocumentId, setRetryingOcrDocumentId] = useState<string | null>(null)

  // 🍎 고객명 싱글클릭/더블클릭 구분용 타이머
  const customerClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 🍎 문서 행 싱글클릭/더블클릭 구분용 타이머
  const documentClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
   * OCR 재시도 핸들러
   */
  const handleRetryOcr = useCallback(async (documentId: string, e: React.MouseEvent) => {
    e.stopPropagation() // 이벤트 버블링 방지

    if (retryingOcrDocumentId) return // 이미 재시도 중이면 무시

    setRetryingOcrDocumentId(documentId)
    try {
      const result = await api.post<{ success: boolean; message?: string; error?: string }>(
        `/api/admin/ocr/reprocess`,
        { document_id: documentId }
      )

      if (result.success) {
        await showAlert({
          title: 'OCR 재시도 시작',
          message: 'OCR 처리를 다시 시도하고 있습니다.',
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
      console.error('[DocumentStatusList] OCR 재시도 오류:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentStatusList.handleRetryOcr' })
      await showAlert({
        title: '오류',
        message: '재시도 중 오류가 발생했습니다.',
        confirmText: '확인'
      })
    } finally {
      setRetryingOcrDocumentId(null)
    }
  }, [retryingOcrDocumentId, onRefresh, showAlert])

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
          <p className="empty-message">문서가 없습니다.</p>
          {onNavigate && (
            <Button
              variant="primary"
              onClick={() => onNavigate('documents-register')}
              style={{ marginTop: '16px' }}
            >
              문서 등록하기
            </Button>
          )}
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
        {/* 🍎 문서 유형 칼럼 (새 칼럼) */}
        <div
          className={`header-doctype ${onColumnSort ? 'header-sortable' : ''}`}
          onClick={() => onColumnSort?.('docType')}
          role={onColumnSort ? 'button' : undefined}
          tabIndex={onColumnSort ? 0 : undefined}
          aria-label={onColumnSort ? '문서 유형으로 정렬' : undefined}
        >
          <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
            <path d="M2 3h12v2H2V3zm0 4h8v2H2V7zm0 4h10v2H2v-2z" fill="currentColor"/>
          </svg>
          <span>문서 유형</span>
          {onColumnSort && (
            sortField === 'docType' ? (
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
        // quota_exceeded 에러인 경우 "한도초과"로 표시
        const isQuotaExceeded = isQuotaExceededError(document)
        const statusLabel = isQuotaExceeded ? '한도초과' : DocumentStatusService.getStatusLabel(status)
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
            data-context-menu="document"
            onClick={() => {
              if (isDeleteMode || isBulkLinkMode) return
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
              if (isDeleteMode || isBulkLinkMode) return
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
                if (documentId && onDocumentClick && !isDeleteMode && !isBulkLinkMode) {
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
                  const typeLabel = DocumentUtils.getDocumentTypeLabel(document as any);
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

            {/* 파일명 + PDF 변환 상태 아이콘 */}
            <div className="status-filename">
              <span className="status-filename-text">
                {DocumentStatusService.extractFilename(document)}
              </span>
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
                const isRetrying = retryingDocumentId === docId

                // 상태별 툴팁
                const tooltips: Record<string, string> = {
                  completed: 'PDF 변환 완료',
                  processing: 'PDF 변환 중...',
                  pending: 'PDF 변환 대기 중',
                  failed: 'PDF 변환 실패 - 클릭하여 재시도'
                }

                const tooltip = isRetrying ? 'PDF 재변환 중...' : tooltips[conversionStatus] || ''

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

                // failed 상태: 클릭 가능한 버튼
                if (conversionStatus === 'failed') {
                  return (
                    <Tooltip content={tooltip}>
                      <button
                        type="button"
                        className={`pdf-conversion-badge pdf-conversion-badge--failed ${isRetrying ? 'pdf-conversion-badge--retrying' : ''}`}
                        onClick={(e) => docId && handleRetryPdfConversion(docId, e)}
                        disabled={isRetrying || !docId}
                        aria-label="PDF 변환 재시도"
                      >
                        {isRetrying ? statusIcons['processing'] : icon}
                        <span className="pdf-badge-text">pdf</span>
                      </button>
                    </Tooltip>
                  )
                }

                // 그 외 상태: 일반 span
                return (
                  <Tooltip content={tooltip}>
                    <span className={`pdf-conversion-badge pdf-conversion-badge--${conversionStatus}`}>
                      {icon}
                      <span className="pdf-badge-text">pdf</span>
                    </span>
                  </Tooltip>
                )
              })()}
              {/* 🔴 바이러스 감염 배지 */}
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

            {/* 🍎 문서 유형 - 공통 컴포넌트 사용 (Single Source of Truth) */}
            <div className="document-doctype" onClick={(e) => e.stopPropagation()}>
              <DocumentTypeCell
                documentType={document.docType || document.document_type}
                isAnnualReport={document.is_annual_report}
                isCustomerReview={document.is_customer_review}
                documentTypes={documentTypes}
                onChange={(newType) => {
                  const docId = document._id || document.id
                  if (docId) {
                    handleDocTypeChange(docId, newType)
                  }
                }}
                isUpdating={updatingDocTypeId === (document._id || document.id)}
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
                // 에러 상태: 클릭하여 재시도 (quota_exceeded는 재시도 불가)
                (() => {
                  const docId = document._id || document.id
                  const isRetryingOcr = retryingOcrDocumentId === docId
                  const isQuotaExceeded = isQuotaExceededError(document)
                  const errorMsg = getErrorMessage(document) || statusLabel
                  const tooltipContent = isRetryingOcr
                    ? 'OCR 재시도 중...'
                    : isQuotaExceeded
                      ? `${errorMsg}\n\nOCR 한도 해제 후 재시도 가능`
                      : `${errorMsg}\n\n클릭하여 재시도`

                  // quota_exceeded: 버튼 비활성화 (클릭 불가)
                  const isDisabled = isRetryingOcr || !docId || isQuotaExceeded

                  return (
                    <Tooltip content={tooltipContent}>
                      <button
                        type="button"
                        className={`status-cell-inner ${!isQuotaExceeded ? 'status-cell-inner--clickable' : 'status-cell-inner--disabled'} ${isRetryingOcr ? 'status-cell-inner--retrying' : ''}`}
                        onClick={(e) => !isQuotaExceeded && docId && handleRetryOcr(docId, e)}
                        disabled={isDisabled}
                        aria-label={isQuotaExceeded ? 'OCR 한도 초과' : 'OCR 재시도'}
                      >
                        <div className={"status-icon status-" + status}>
                          {isRetryingOcr ? (
                            <svg className="retry-spinner" viewBox="0 0 16 16" width="12" height="12">
                              <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="20 10" />
                            </svg>
                          ) : statusIcon}
                        </div>
                        <div className="status-text">
                          <span className="status-label">{isRetryingOcr ? '재시도 중' : statusLabel}</span>
                        </div>
                      </button>
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
                    {status === 'processing' && progress ? (
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
                <button
                  className="customer-name customer-name-button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    const customerId = document.customer_relation?.customer_id
                    if (!customerId) return

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
              ) : (userId && document.customerId && userId === document.customerId) ? (
                <span className="customer-id-text">{userId}</span>
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
