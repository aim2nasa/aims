/**
 * DocumentSummaryModal Component
 * @since 1.0.0
 * @version 3.0.0 - 🍎 공통 Modal 컴포넌트 적용
 * @updated 2025-11-04
 *
 * 문서 요약을 표시하는 모달 컴포넌트
 * - 공통 Modal 컴포넌트 사용 (Portal, ESC, body overflow 자동 처리)
 * - iOS 스타일 디자인
 */

import React, { useState, useEffect } from 'react'
import { Document } from '../../../../types/documentStatus'
import { DocumentStatusService } from '../../../../services/DocumentStatusService'
import { Button, Modal } from '@/shared/ui'
import { errorReporter } from '@/shared/lib/errorReporter'
import { getAuthToken } from '@/shared/lib/api'
import './DocumentSummaryModal.css'

interface DocumentSummaryModalProps {
  /** 모달 표시 여부 */
  visible: boolean
  /** 모달 닫기 핸들러 */
  onClose: () => void
  /** 선택된 문서 */
  document: Document | null
}

/**
 * DocumentSummaryModal React 컴포넌트
 *
 * 문서의 요약 정보를 표시하는 모달
 * - API를 통해 상세 문서 데이터 가져오기
 * - meta/ocr/payload에서 summary 추출
 * - summary가 없으면 full_text의 첫 200자 사용
 *
 * @example
 * ```tsx
 * <DocumentSummaryModal
 *   visible={isVisible}
 *   onClose={handleClose}
 *   document={selectedDocument}
 * />
 * ```
 */
export const DocumentSummaryModal: React.FC<DocumentSummaryModalProps> = ({
  visible,
  onClose,
  document
}) => {
  const [summaryContent, setSummaryContent] = useState<string>('로딩 중...')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!visible || !document) return

    const fetchSummary = async () => {
      setIsLoading(true)
      setSummaryContent('로딩 중...')

      try {
        // 🔥 AI 검색 결과의 경우 payload.doc_id에 ID가 있을 수 있음
        const docRecord = document as Record<string, unknown>
        const payloadData = docRecord['payload'] as Record<string, unknown> | undefined
        const docId = document._id || document['id'] || payloadData?.['doc_id']
        if (!docId) {
          setSummaryContent('문서 ID를 찾을 수 없습니다.')
          setIsLoading(false)
          return
        }

        // 백엔드 API를 통해 문서 상세 정보 가져오기 (🔥 getAuthToken 사용으로 v1/v2 호환)
        const userId = typeof window !== 'undefined' ? localStorage.getItem('aims-current-user-id') || 'tester' : 'tester';
        const token = getAuthToken();
        const response = await fetch(`/api/documents/${docId}/status`, {
          headers: {
            'x-user-id': userId,
            ...(token && { Authorization: `Bearer ${token}` })
          }
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const responseData = await response.json()

        // API 응답에서 summary 추출
        // 우선순위: meta.summary > meta.full_text(앞 200자) > ocr.summary > ocr.full_text(앞 200자)
        const rawData = responseData.success ? responseData.data?.raw : null

        if (rawData) {
          // 1. meta.summary 확인
          if (rawData.meta?.summary && rawData.meta.summary !== 'null') {
            setSummaryContent(rawData.meta.summary)
          }
          // 2. meta.full_text가 있으면 앞 200자 사용
          else if (rawData.meta?.full_text && rawData.meta.full_text.trim()) {
            const cleanText = rawData.meta.full_text.trim()
            setSummaryContent(cleanText.length > 200 ? cleanText.substring(0, 200) + '...' : cleanText)
          }
          // 3. ocr.summary 확인
          else if (rawData.ocr?.summary && rawData.ocr.summary !== 'null') {
            setSummaryContent(rawData.ocr.summary)
          }
          // 4. ocr.full_text가 있으면 앞 200자 사용
          else if (rawData.ocr?.full_text && rawData.ocr.full_text.trim()) {
            const cleanText = rawData.ocr.full_text.trim()
            setSummaryContent(cleanText.length > 200 ? cleanText.substring(0, 200) + '...' : cleanText)
          }
          else {
            // API에서 summary를 못 찾으면 로컬 데이터로 폴백
            const summary = getSummaryFromDocument(document)
            setSummaryContent(summary)
          }
        } else {
          // API 응답이 없으면 로컬 데이터로 폴백
          const summary = getSummaryFromDocument(document)
          setSummaryContent(summary)
        }
      } catch (error) {
        console.error('Summary fetch error:', error)
        errorReporter.reportApiError(error as Error, { component: 'DocumentSummaryModal.fetchSummary' })
        // API 실패 시 로컬 데이터로 폴백
        const summary = getSummaryFromDocument(document)
        setSummaryContent(summary)
      } finally {
        setIsLoading(false)
      }
    }

    fetchSummary()
  }, [visible, document])

  /**
   * 문서에서 요약 추출
   * 우선순위: meta.summary > meta.full_text(앞 200자) > ocr.summary > ocr.full_text(앞 200자) > payload.summary
   */
  const getSummaryFromDocument = (doc: Document): string => {
    // meta에서 full_text 확인
    const metaFullText = (typeof doc.meta === 'object' && doc.meta !== null)
      ? doc.meta.full_text
      : (typeof doc.meta === 'string' ? (() => {
        try {
          const parsed = JSON.parse(doc.meta as string)
          return parsed.full_text
        } catch {
          return null
        }
      })() : null)

    // meta에 full_text가 있는 경우 - meta summary 사용
    if (metaFullText && metaFullText.trim()) {
      const metaSummary = (typeof doc.meta === 'object' && doc.meta !== null)
        ? doc.meta.summary
        : (typeof doc.meta === 'string' ? (() => {
          try {
            const parsed = JSON.parse(doc.meta as string)
            return parsed.summary
          } catch {
            return null
          }
        })() : null)

      if (metaSummary && metaSummary !== 'null') {
        return metaSummary
      }

      // meta summary가 없으면 meta full_text의 앞부분 사용
      const cleanText = metaFullText.trim()
      return cleanText.length > 200 ? cleanText.substring(0, 200) + '...' : cleanText
    }

    // meta에 full_text가 없는 경우 - ocr summary 사용
    const ocrSummary = (typeof doc.ocr === 'object' && doc.ocr !== null)
      ? doc.ocr.summary
      : (typeof doc.ocr === 'string' ? (() => {
        try {
          const parsed = JSON.parse(doc.ocr as string)
          return parsed.summary
        } catch {
          return null
        }
      })() : null)

    if (ocrSummary && ocrSummary !== 'null') {
      return ocrSummary
    }

    // ocr summary가 없으면 ocr full_text의 앞부분 사용
    const ocrFullText = (typeof doc.ocr === 'object' && doc.ocr !== null)
      ? doc.ocr.full_text
      : (typeof doc.ocr === 'string' ? (() => {
        try {
          const parsed = JSON.parse(doc.ocr as string)
          return parsed.full_text
        } catch {
          return null
        }
      })() : null)

    if (ocrFullText && ocrFullText.trim()) {
      const cleanText = ocrFullText.trim()
      return cleanText.length > 200 ? cleanText.substring(0, 200) + '...' : cleanText
    }

    // 마지막으로 payload.summary 시도
    const payloadSummary = doc.payload ? (doc.payload as Record<string, unknown>)['summary'] : null
    if (typeof payloadSummary === 'string' && payloadSummary.trim()) {
      return payloadSummary
    }

    return '문서 요약을 찾을 수 없습니다.'
  }

  if (!document) return null

  const filename = DocumentStatusService.extractFilename(document)

  const footer = (
    <Button
      variant="secondary"
      onClick={onClose}
    >
      닫기
    </Button>
  )

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={filename}
      size="md"
      footer={footer}
      ariaLabel="문서 요약"
      className="document-summary-modal"
    >
      {/* 모달 바디 */}
      <div className="fulltext-modal-body">
        {isLoading ? (
          <div className="summary-loading-state">
            <div className="summary-loading-spinner" />
            <p>요약을 불러오는 중...</p>
          </div>
        ) : (
          <pre className="fulltext-content">{summaryContent}</pre>
        )}
      </div>
    </Modal>
  )
}

export default DocumentSummaryModal
