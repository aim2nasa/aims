/**
 * CustomerDocumentPreviewModal
 * @since 2025-10-25
 *
 * 고객 문서 프리뷰 모달 (PDF / 이미지 / 기타)
 * react-pdf 기반 PDF 뷰어 + 이미지 프리뷰 제공
 */

import React, { useState } from 'react'
import { Button } from '@/shared/ui/Button'
import DraggableModal from '@/shared/ui/DraggableModal'
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
  // Fit to page를 위한 scale 계산 (DraggableModal에서 크기 변경 이벤트 받지 않으므로 고정값 사용)
  const [fitScale] = useState<number>(0.9)

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

  return (
    <DraggableModal
      visible={visible}
      onClose={onClose}
      title={
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
      }
      initialWidth={Math.min(1200, typeof window !== 'undefined' ? window.innerWidth * 0.9 : 1200)}
      initialHeight={Math.min(800, typeof window !== 'undefined' ? window.innerHeight * 0.9 : 800)}
      minWidth={600}
      minHeight={400}
      className="customer-document-preview"
    >
      <main className="customer-document-preview__content">
        {renderContent()}
      </main>
    </DraggableModal>
  )
}

export default CustomerDocumentPreviewModal
