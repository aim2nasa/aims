/**
 * DocumentSummaryModal Component
 * @since 1.0.0
 * @version 2.0.0 - 🍎 문서검색 FullTextModal 스타일 적용
 *
 * 문서 요약을 표시하는 모달 컴포넌트
 * - React Portal 사용
 * - 드래그로 이동 가능
 * - ESC 키로 닫기
 * - iOS 스타일 디자인
 */

import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
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

  // 🍎 드래그 상태 관리
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!visible || !document) return

    const fetchSummary = async () => {
      setIsLoading(true)
      setSummaryContent('로딩 중...')

      try {
        const docId = document._id || document['id']
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
   * 드래그 중 핸들러
   */
  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return

    const newX = e.clientX - dragStart.x
    const newY = e.clientY - dragStart.y

    setPosition({ x: newX, y: newY })
  }

  /**
   * 드래그 종료 핸들러
   */
  const handleMouseUp = () => {
    setIsDragging(false)
  }

  /**
   * 드래그 이벤트 리스너 등록
   */
  React.useEffect(() => {
    if (isDragging) {
      window.document.addEventListener('mousemove', handleMouseMove)
      window.document.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.document.removeEventListener('mousemove', handleMouseMove)
        window.document.removeEventListener('mouseup', handleMouseUp)
      }
    }
    return undefined
  }, [isDragging, dragStart])

  /**
   * ESC 키 핸들러
   */
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && visible) {
        onClose()
      }
    }

    if (visible) {
      window.document.addEventListener('keydown', handleEscape)
      return () => {
        window.document.removeEventListener('keydown', handleEscape)
      }
    }
    return undefined
  }, [visible, onClose])

  /**
   * 모달이 열릴 때 위치 초기화
   */
  React.useEffect(() => {
    if (visible) {
      setPosition({ x: 0, y: 0 })
    }
  }, [visible])

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
    if (doc.payload?.summary) {
      return doc.payload.summary
    }

    return '문서 요약을 찾을 수 없습니다.'
  }

  if (!visible || !document) return null

  const filename = DocumentStatusService.extractFilename(document)

  /**
   * 배경 클릭 핸들러 (모달 닫기)
   */
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  /**
   * 드래그 시작 핸들러
   */
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true)
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    })
  }

  const modalContent = (
    <div
      className="fulltext-modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="summary-modal-title"
    >
      <div
        ref={modalRef}
        className="fulltext-modal-container"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          cursor: isDragging ? 'grabbing' : 'default'
        }}
      >
        {/* 모달 헤더 */}
        <div
          className="fulltext-modal-header"
          onMouseDown={handleMouseDown}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <h2 id="summary-modal-title" className="fulltext-modal-title">
            {filename}
          </h2>
          <button
            className="fulltext-modal-close"
            onClick={onClose}
            aria-label="모달 닫기"
            onMouseDown={(e) => e.stopPropagation()}
          >
            ✕
          </button>
        </div>

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

        {/* 모달 푸터 */}
        <div className="fulltext-modal-footer">
          <button
            className="fulltext-modal-button"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, window.document.body)
}

export default DocumentSummaryModal
