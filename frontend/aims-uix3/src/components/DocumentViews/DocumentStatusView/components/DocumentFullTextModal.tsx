/**
 * DocumentFullTextModal Component
 * @since 1.0.0
 *
 * 문서 전체 텍스트를 표시하는 모달 컴포넌트
 * 🍎 Apple/iOS 디자인 시스템 적용
 */

import React, { useState, useEffect } from 'react'
import { Document } from '../../../../types/documentStatus'
import { DocumentStatusService } from '../../../../services/documentStatusService'
import './DocumentFullTextModal.css'

interface DocumentFullTextModalProps {
  /** 모달 표시 여부 */
  visible: boolean
  /** 모달 닫기 핸들러 */
  onClose: () => void
  /** 선택된 문서 */
  document: Document | null
}

/**
 * DocumentFullTextModal React 컴포넌트
 *
 * 문서의 전체 텍스트를 표시하는 모달
 * - API를 통해 상세 문서 데이터 가져오기
 * - meta/text/ocr/payload에서 full_text 추출
 * - 우선순위: meta.full_text > text.full_text > ocr.full_text > payload.full_text
 *
 * @example
 * ```tsx
 * <DocumentFullTextModal
 *   visible={isVisible}
 *   onClose={handleClose}
 *   document={selectedDocument}
 * />
 * ```
 */
export const DocumentFullTextModal: React.FC<DocumentFullTextModalProps> = ({
  visible,
  onClose,
  document
}) => {
  const [fullTextContent, setFullTextContent] = useState<string>('로딩 중...')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!visible || !document) return

    const fetchFullText = async () => {
      setIsLoading(true)
      setFullTextContent('로딩 중...')

      try {
        const docId = document._id || document['id']
        if (!docId) {
          setFullTextContent('문서 ID를 찾을 수 없습니다.')
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

        const fullText = fileData ? getFullTextFromDocument(fileData) : getFullTextFromDocument(document)
        setFullTextContent(fullText)
      } catch (error) {
        console.error('Full text fetch error:', error)
        // API 실패 시 로컬 데이터로 폴백
        const fullText = getFullTextFromDocument(document)
        setFullTextContent(fullText)
      } finally {
        setIsLoading(false)
      }
    }

    fetchFullText()
  }, [visible, document])

  /**
   * 문서에서 전체 텍스트 추출
   * 우선순위: meta.full_text > text.full_text > ocr.full_text > payload.full_text
   */
  const getFullTextFromDocument = (doc: Document): string => {
    // meta에서 full_text 확인 (최우선)
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

    if (metaFullText && metaFullText.trim()) {
      return metaFullText
    }

    // text에서 full_text 확인 (text/plain 파일용)
    const textFullText = (typeof doc.text === 'object' && doc.text !== null)
      ? doc.text.full_text
      : (typeof doc.text === 'string' ? (() => {
        try {
          const parsed = JSON.parse(doc.text as string)
          return parsed.full_text
        } catch {
          return null
        }
      })() : null)

    if (textFullText && textFullText.trim()) {
      return textFullText
    }

    // ocr에서 full_text 확인
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
      return ocrFullText
    }

    // 마지막으로 payload에서 확인
    if (doc.payload?.full_text) {
      return doc.payload.full_text
    }

    return '문서의 전체 텍스트를 찾을 수 없습니다.'
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
    <div className="document-fulltext-modal-overlay" onClick={handleBackdropClick}>
      <div className="document-fulltext-modal" role="dialog" aria-modal="true">
        {/* 모달 헤더 */}
        <div className="modal-header">
          <div className="header-content">
            <div className="file-icon">📄</div>
            <h2 className="modal-title">문서 전체 텍스트</h2>
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
          <div className="fulltext-container">
            {isLoading ? (
              <div className="loading-state">
                <div className="loading-spinner" />
                <p>전체 텍스트를 불러오는 중...</p>
              </div>
            ) : (
              <div className="fulltext-text">{fullTextContent}</div>
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

export default DocumentFullTextModal
