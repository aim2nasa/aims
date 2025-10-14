/**
 * CustomerDocumentPreviewModal
 * @since 2025-10-25
 *
 * 고객 문서 프리뷰 모달 (PDF / 이미지 / 기타)
 * react-pdf 기반 PDF 뷰어 + 이미지 프리뷰 제공
 */

import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/shared/ui/Button'
import SFSymbol, {
  SFSymbolAnimation,
  SFSymbolSize,
  SFSymbolWeight
} from '../../../../../components/SFSymbol'
import { PDFViewer } from '../../../../../components/PDFViewer/PDFViewer'
import { DocumentUtils } from '@/entities/document'
import type { PreviewDocumentInfo } from '@/features/customer/controllers/useCustomerDocumentsController'
import './CustomerDocumentPreviewModal.css'

interface CustomerDocumentPreviewModalProps {
  visible: boolean
  isLoading: boolean
  error: string | null
  document: PreviewDocumentInfo | null
  onClose: () => void
  onRetry?: () => void
  onDownload?: () => void
}

// App.tsx와 완전히 동일한 방식
const isPdfFile = (url: string) => {
  const normalizedUrl = url.toLowerCase()
  return normalizedUrl.endsWith('.pdf')
}

const isImageFile = (url: string) => {
  const normalizedUrl = url.toLowerCase()
  return /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(normalizedUrl)
}

export const CustomerDocumentPreviewModal: React.FC<CustomerDocumentPreviewModalProps> = ({
  visible,
  isLoading,
  error,
  document: previewDocument,
  onClose,
  onRetry,
  onDownload
}) => {
  useEffect(() => {
    if (!visible) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visible, onClose])

  if (!visible) return null

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.currentTarget === event.target) {
      onClose()
    }
  }

  const fileUrl = previewDocument?.fileUrl ?? null

  // App.tsx와 완전히 동일한 방식
  const isPdf = fileUrl ? isPdfFile(fileUrl) : false
  const isImage = fileUrl && !isPdf ? isImageFile(fileUrl) : false

  const sizeLabel = previewDocument?.sizeBytes ? DocumentUtils.formatFileSize(previewDocument.sizeBytes) : null

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="customer-document-preview__center">
          <SFSymbol
            name="arrow.triangle.2.circlepath"
            animation={SFSymbolAnimation.ROTATE}
            size={SFSymbolSize.LARGE_TITLE}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>문서를 불러오는 중입니다...</span>
        </div>
      )
    }

    if (error) {
      return (
        <div className="customer-document-preview__center customer-document-preview__center--error">
          <SFSymbol
            name="exclamationmark.triangle.fill"
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
          />
          <p>{error}</p>
          {onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              다시 시도
            </Button>
          )}
        </div>
      )
    }

    if (!previewDocument) {
      return (
        <div className="customer-document-preview__center">
          <SFSymbol
            name="doc.text.slash"
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>문서 정보를 찾을 수 없습니다.</span>
        </div>
      )
    }

    if (isPdf && fileUrl) {
      return (
        <PDFViewer
          file={fileUrl}
          {...(onDownload ? { onDownload } : {})}
        />
      )
    }

    if (isImage && fileUrl) {
      return (
        <div className="customer-document-preview__image-wrapper">
          <img src={fileUrl} alt={previewDocument.originalName} className="customer-document-preview__image" />
        </div>
      )
    }

    return (
      <div className="customer-document-preview__placeholder">
        <SFSymbol
          name="doc.richtext"
          size={SFSymbolSize.LARGE_TITLE}
          weight={SFSymbolWeight.MEDIUM}
        />
        <p>미리보기를 지원하지 않는 형식입니다.</p>
        {onDownload && (
          <Button variant="primary" size="sm" onClick={onDownload}>
            다운로드
          </Button>
        )}
      </div>
    )
  }

  const portalTarget =
    typeof window !== 'undefined' && window.document ? window.document.body : null

  if (!portalTarget) {
    return null
  }

  return createPortal(
    <div
      className="customer-document-preview__backdrop"
      role="dialog"
      aria-modal="true"
      onClick={handleBackdropClick}
    >
      <div
        className="customer-document-preview"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="customer-document-preview__header">
          <div className="customer-document-preview__title">
            <SFSymbol
              name="doc.text"
              size={SFSymbolSize.BODY}
              weight={SFSymbolWeight.REGULAR}
            />
            <div>
              <h2>{previewDocument?.originalName ?? '문서 미리보기'}</h2>
              <p>
                {(() => {
                  if (!previewDocument?.uploadedAt) return '업로드 정보 없음'
                  // 날짜 문자열 정리 (xxx 같은 잘못된 밀리초 제거)
                  const cleanDateStr = previewDocument.uploadedAt.replace(/(\.\d{3})[^\d+Z]*/, '$1')
                  const date = new Date(cleanDateStr)
                  return isNaN(date.getTime()) ? '업로드 정보 없음' : date.toLocaleString('ko-KR')
                })()}
                {sizeLabel && ` · ${sizeLabel}`}
              </p>
            </div>
          </div>
          <div className="customer-document-preview__header-actions">
            <Button variant="ghost" size="sm" onClick={onClose}>
              닫기
            </Button>
          </div>
        </header>

        <main className="customer-document-preview__content">
          {renderContent()}
        </main>
      </div>
    </div>,
    portalTarget
  )
}

export default CustomerDocumentPreviewModal
