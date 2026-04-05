/**
 * CustomerDocumentPreviewModal
 * @since 2025-10-25
 *
 * 고객 문서 프리뷰 모달 (PDF / 이미지 / 기타)
 * react-pdf 기반 PDF 뷰어 + 이미지 프리뷰 제공
 */

import React, { useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { DraggableModal } from '@/shared/ui/DraggableModal'
import { SFSymbol,
  SFSymbolAnimation,
  SFSymbolSize,
  SFSymbolWeight
} from '../../../../../components/SFSymbol'
import { PDFViewer } from '../../../../../components/PDFViewer/PDFViewer'
import { ImageViewer } from '../../../../../components/ImageViewer/ImageViewer'
import { DocumentUtils } from '@/entities/document'
import type { PreviewDocumentInfo } from '@/shared/types/document'
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

  // 프리뷰용 URL: 변환된 PDF가 있으면 사용, 없으면 원본 사용
  const previewUrl = previewDocument?.previewFileUrl ?? previewDocument?.fileUrl ?? null
  // 다운로드용 URL: 항상 원본 파일

  // 프리뷰 URL 기준으로 뷰어 타입 결정
  const isPdf = previewUrl ? isPdfFile(previewUrl) : false
  const isImage = previewUrl && !isPdf ? isImageFile(previewUrl) : false

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

    // 🔴 바이러스 감염 여부 확인
    const virusScan = previewDocument.virusScan
    const isVirusInfected = virusScan?.status === 'infected' || virusScan?.status === 'deleted'

    // 🔴 바이러스 오버레이 컴포넌트
    const virusOverlay = isVirusInfected ? (
      <div className="viewer-virus-overlay">
        <div className="viewer-virus-overlay__icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="#ff3b30"/>
            <path d="M12 7v6M12 16v1" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="viewer-virus-overlay__title">바이러스 감염 파일</div>
        <div className="viewer-virus-overlay__description">
          <div>이 파일에서 바이러스가 감지되어</div>
          <div>다운로드할 수 없습니다.</div>
        </div>
        <div className="viewer-virus-overlay__threat">
          {virusScan?.threatName || '알 수 없는 위협'}
        </div>
        <div className="viewer-virus-overlay__filename">{previewDocument.originalName}</div>
      </div>
    ) : null

    // 다운로드 핸들러 (바이러스 감염 시 비활성화)
    const downloadHandler = isVirusInfected ? undefined : onDownload

    // 뷰어 렌더링
    const renderViewer = () => {
      if (isPdf && previewUrl) {
        return (
          <PDFViewer
            file={previewUrl}
            initialScale={fitScale}
            {...(downloadHandler ? { onDownload: downloadHandler } : {})}
            downloadDisabled={isVirusInfected}
            downloadDisabledReason={isVirusInfected ? "바이러스 감염 파일로 다운로드할 수 없습니다" : undefined}
          />
        )
      }

      if (isImage && previewUrl) {
        return (
          <ImageViewer
            file={previewUrl}
            alt={previewDocument.originalName}
            initialScale={fitScale}
            {...(downloadHandler ? { onDownload: downloadHandler } : {})}
            downloadDisabled={isVirusInfected}
            downloadDisabledReason={isVirusInfected ? "바이러스 감염 파일로 다운로드할 수 없습니다" : undefined}
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
          {downloadHandler && !isVirusInfected && (
            <Button variant="primary" size="sm" onClick={downloadHandler}>
              다운로드
            </Button>
          )}
        </div>
      )
    }

    // 바이러스 감염 시 오버레이와 함께 렌더링
    if (isVirusInfected) {
      return (
        <div className="viewer-virus-overlay-container">
          {renderViewer()}
          {virusOverlay}
        </div>
      )
    }

    return renderViewer()
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
          <div className="customer-document-preview__title-content">
            <h2>{previewDocument?.originalName ?? '문서 미리보기'}</h2>
            <div className="customer-document-preview__meta">
              <span>
                {formatDateTime(previewDocument?.uploadedAt)}
                {sizeLabel && ` · ${sizeLabel}`}
              </span>
              {previewDocument?.isConverted && (
                <span className="customer-document-preview__conversion-badge">
                  PDF 변환됨{previewDocument.originalExtension ? ` · 원본 ${previewDocument.originalExtension.toUpperCase()}` : ''}
                </span>
              )}
            </div>
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
