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

const isPdfFile = (mime?: string, url?: string | null) => {
  if (mime && mime.toLowerCase().includes('pdf')) return true
  if (!url) return false
  return /\.pdf($|\?)/i.test(url)
}

const isImageFile = (mime?: string, url?: string | null) => {
  if (mime && mime.toLowerCase().startsWith('image/')) return true
  if (!url) return false
  return /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(url)
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
  const mimeType = previewDocument?.mimeType
  const isPdf = previewDocument && isPdfFile(mimeType, fileUrl)
  const isImage = previewDocument && !isPdf && isImageFile(mimeType, fileUrl)
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
          onDownload={onDownload}
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
                {previewDocument?.uploadedAt
                  ? new Date(previewDocument.uploadedAt).toLocaleString('ko-KR')
                  : '업로드 정보 없음'}
                {sizeLabel && ` · ${sizeLabel}`}
              </p>
            </div>
          </div>
          <div className="customer-document-preview__header-actions">
            {onDownload && (
              <Button variant="secondary" size="sm" onClick={onDownload}>
                다운로드
              </Button>
            )}
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
