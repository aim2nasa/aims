/**
 * DocumentSummaryModal Component
 * @since 1.0.0
 *
 * 문서 요약을 표시하는 모달 컴포넌트
 * 🍎 Apple/iOS 디자인 시스템 적용
 */

import React, { useState, useEffect } from 'react'
import { Document } from '../../../../types/documentStatus'
import { DocumentStatusService } from '../../../../services/documentStatusService'
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
        const docId = document._id || document.id
        if (!docId) {
          setSummaryContent('문서 ID를 찾을 수 없습니다.')
          setIsLoading(false)
          return
        }

        // API를 통해 상세 문서 데이터 가져오기
        const response = await fetch('https://n8nd.giize.com/webhook/smartsearch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id: docId })
        })

        const responseData = await response.json()
        const fileData = responseData[0]

        const summary = fileData ? getSummaryFromDocument(fileData) : getSummaryFromDocument(document)
        setSummaryContent(summary)
      } catch (error) {
        console.error('Summary fetch error:', error)
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
    const metaFullText = doc.meta?.full_text ||
      (typeof doc.meta === 'string' ? (() => {
        try {
          const parsed = JSON.parse(doc.meta as string)
          return parsed.full_text
        } catch {
          return null
        }
      })() : null)

    // meta에 full_text가 있는 경우 - meta summary 사용
    if (metaFullText && metaFullText.trim()) {
      const metaSummary = doc.meta?.summary ||
        (typeof doc.meta === 'string' ? (() => {
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
    const ocrSummary = doc.ocr?.summary ||
      (typeof doc.ocr === 'string' ? (() => {
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
    const ocrFullText = doc.ocr?.full_text ||
      (typeof doc.ocr === 'string' ? (() => {
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
    if (doc.payload?.summary) {
      return doc.payload.summary
    }

    return '문서 요약을 찾을 수 없습니다.'
  }

  /**
   * 모달 외부 클릭 핸들러
   */
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  if (!visible || !document) return null

  const filename = DocumentStatusService.extractFilename(document)

  return (
    <div className="document-summary-modal-overlay" onClick={handleBackdropClick}>
      <div className="document-summary-modal" role="dialog" aria-modal="true">
        {/* 모달 헤더 */}
        <div className="modal-header">
          <div className="header-content">
            <div className="file-icon">📄</div>
            <h2 className="modal-title">문서 요약</h2>
            <button
              className="close-button"
              onClick={onClose}
              aria-label="모달 닫기"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 문서 제목 */}
        <div className="document-title">
          <h3 className="filename">{filename}</h3>
        </div>

        {/* 모달 컨텐츠 */}
        <div className="modal-content">
          <div className="summary-container">
            {isLoading ? (
              <div className="loading-state">
                <div className="loading-spinner" />
                <p>요약을 불러오는 중...</p>
              </div>
            ) : (
              <div className="summary-text">{summaryContent}</div>
            )}
          </div>
        </div>

        {/* 모달 푸터 */}
        <div className="modal-footer">
          <button className="footer-button" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

export default DocumentSummaryModal
