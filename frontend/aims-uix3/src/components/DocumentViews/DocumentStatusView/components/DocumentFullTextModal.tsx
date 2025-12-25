/**
 * DocumentFullTextModal Component
 * @since 1.0.0
 * @version 3.0.0 - 🍎 공통 Modal 컴포넌트 적용
 * @updated 2025-11-04
 *
 * 문서 전체 텍스트를 표시하는 모달 컴포넌트
 * - 공통 Modal 컴포넌트 사용 (Portal, ESC, body overflow 자동 처리)
 * - iOS 스타일 디자인
 */

import React, { useState, useEffect } from 'react'
import { Document } from '../../../../types/documentStatus'
import { DocumentStatusService } from '../../../../services/DocumentStatusService'
import { Button, Modal } from '@/shared/ui'
import { errorReporter } from '@/shared/lib/errorReporter'
import { getAuthToken } from '@/shared/lib/api'
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
        // 🔥 AI 검색 결과의 경우 payload.doc_id에 ID가 있을 수 있음
        const docRecord = document as Record<string, unknown>
        const payloadData = docRecord['payload'] as Record<string, unknown> | undefined
        const docId = document._id || document['id'] || payloadData?.['doc_id']
        if (!docId) {
          setFullTextContent('문서 ID를 찾을 수 없습니다.')
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

        // API 응답에서 full_text 추출
        // 우선순위: meta.full_text > ocr.full_text > text.full_text
        const rawData = responseData.success ? responseData.data?.raw : null

        if (rawData) {
          // 1. meta.full_text 확인
          if (rawData.meta?.full_text && rawData.meta.full_text.trim()) {
            setFullTextContent(rawData.meta.full_text)
          }
          // 2. ocr.full_text 확인
          else if (rawData.ocr?.full_text && rawData.ocr.full_text.trim()) {
            setFullTextContent(rawData.ocr.full_text)
          }
          // 3. text.full_text 확인 (text/plain 파일용)
          else if (rawData.text?.full_text && rawData.text.full_text.trim()) {
            setFullTextContent(rawData.text.full_text)
          }
          else {
            // API에서 full_text를 못 찾으면 로컬 데이터로 폴백
            const fullText = getFullTextFromDocument(document)
            setFullTextContent(fullText)
          }
        } else {
          // API 응답이 없으면 로컬 데이터로 폴백
          const fullText = getFullTextFromDocument(document)
          setFullTextContent(fullText)
        }
      } catch (error) {
        console.error('Full text fetch error:', error)
        errorReporter.reportApiError(error as Error, { component: 'DocumentFullTextModal.fetchFullText' })
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
    const payloadFullText = doc.payload ? (doc.payload as Record<string, unknown>)['full_text'] : null
    if (typeof payloadFullText === 'string' && payloadFullText.trim()) {
      return payloadFullText
    }

    return '문서의 전체 텍스트를 찾을 수 없습니다.'
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
      size="lg"
      footer={footer}
      ariaLabel="문서 전체 텍스트"
      className="document-fulltext-modal"
    >
      {/* 모달 바디 */}
      <div className="fulltext-modal-body">
        {isLoading ? (
          <div className="fulltext-loading-state">
            <div className="fulltext-loading-spinner" />
            <p>전체 텍스트를 불러오는 중...</p>
          </div>
        ) : (
          <pre className="fulltext-content">{fullTextContent}</pre>
        )}
      </div>
    </Modal>
  )
}

export default DocumentFullTextModal
