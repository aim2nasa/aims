/**
 * CustomerDocumentPreviewModal
 * @since 2025-10-25
 *
 * 고객 문서 프리뷰 모달 (PDF / 이미지 / 기타)
 * react-pdf 기반 PDF 뷰어 + 이미지 프리뷰 제공
 */

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/shared/ui/Button'
import SFSymbol, {
  SFSymbolAnimation,
  SFSymbolSize,
  SFSymbolWeight
} from '../../../../../components/SFSymbol'
import { PDFViewer } from '../../../../../components/PDFViewer/PDFViewer'
import { ImageViewer } from '../../../../../components/ImageViewer/ImageViewer'
import { DocumentUtils } from '@/entities/document'
import type { PreviewDocumentInfo } from '@/features/customer/controllers/useCustomerDocumentsController'
import { formatDateTime } from '@/shared/lib/timeUtils'
import { useModalDragResize } from '../../../../../hooks/useModalDragResize'
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
  // 드래그 & 리사이즈 Hook
  // 화면 크기의 90%를 초기 크기로 설정
  const modal = useModalDragResize({
    initialWidth: Math.min(1200, window.innerWidth * 0.9),
    initialHeight: Math.min(800, window.innerHeight * 0.9),
    minWidth: 600,
    minHeight: 400
  })

  // Fit to page를 위한 scale 계산
  const [fitScale, setFitScale] = useState<number>(1.0)

  // 모달 크기 변경 시 fit scale 재계산
  useEffect(() => {
    // 모달 content 영역 크기 (헤더 60px, 컨트롤 50px, 패딩 제외)
    const contentWidth = modal.size.width - 32 // 좌우 패딩
    const contentHeight = modal.size.height - 60 - 50 - 32 // 헤더, 컨트롤, 상하 패딩

    // 대략적인 표준 문서 크기 (A4: 595×842)
    // 실제로는 문서마다 다르지만 일반적인 비율로 계산
    const avgDocWidth = 595
    const avgDocHeight = 842

    const scaleX = contentWidth / avgDocWidth
    const scaleY = contentHeight / avgDocHeight
    const calculatedScale = Math.min(scaleX, scaleY, 1.0) // 최대 1.0

    setFitScale(calculatedScale)
  }, [modal.size.width, modal.size.height])

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
          initialScale={fitScale}
          {...(onDownload ? { onDownload } : {})}
        />
      )
    }

    if (isImage && fileUrl) {
      return (
        <ImageViewer
          file={fileUrl}
          alt={previewDocument.originalName}
          initialScale={fitScale}
          {...(onDownload ? { onDownload } : {})}
        />
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
        className="customer-document-preview customer-document-preview--draggable"
        style={modal.modalStyle}
        onClick={(event) => event.stopPropagation()}
      >
        {/* 리사이즈 핸들 */}
        {modal.resizeHandles.map(handle => (
          <div
            key={handle.position}
            className={`resize-handle resize-handle--${handle.position}`}
            onMouseDown={handle.onMouseDown}
            style={handle.style}
          />
        ))}

        <header
          className="customer-document-preview__header"
          {...modal.headerProps}
        >
          <div className="customer-document-preview__title">
            <SFSymbol
              name="doc.text"
              size={SFSymbolSize.BODY}
              weight={SFSymbolWeight.REGULAR}
            />
            <div>
              <h2>{previewDocument?.originalName ?? '문서 미리보기'}</h2>
              <p>
                {formatDateTime(previewDocument?.uploadedAt)}
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
