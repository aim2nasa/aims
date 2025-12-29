/**
 * CustomerDocumentPreviewModal
 * @since 2025-10-25
 * @updated 2025-12-29 - 문서 유형 표시/변경 기능 추가
 *
 * 고객 문서 프리뷰 모달 (PDF / 이미지 / 기타)
 * react-pdf 기반 PDF 뷰어 + 이미지 프리뷰 제공
 */

import React, { useState, useEffect } from 'react'
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
import {
  getDocumentTypes,
  updateDocumentType,
  getTypeLabel,
  type DocumentType
} from '@/services/documentTypesService'
import './CustomerDocumentPreviewModal.css'

interface CustomerDocumentPreviewModalProps {
  visible: boolean
  isLoading: boolean
  error: string | null
  document: PreviewDocumentInfo | null
  onClose: () => void
  onRetry?: () => void
  onDownload?: () => void
  /** 문서 유형 변경 시 콜백 (목록 갱신용) */
  onDocumentTypeChange?: (documentId: string, newType: string) => void
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
  onDownload,
  onDocumentTypeChange
}) => {
  // Fit to page를 위한 scale 계산 (DraggableModal에서 크기 변경 이벤트 받지 않으므로 고정값 사용)
  const [fitScale] = useState<number>(0.9)

  // 문서 유형 관련 상태
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([])
  const [selectedType, setSelectedType] = useState<string>('unspecified')
  const [isTypeChanging, setIsTypeChanging] = useState(false)

  // 문서 유형 목록 로드
  useEffect(() => {
    getDocumentTypes(true)
      .then(types => setDocumentTypes(types))
      .catch(err => console.error('문서 유형 로드 실패:', err))
  }, [])

  // 문서 변경 시 유형 초기화
  useEffect(() => {
    if (previewDocument?.document?.document_type) {
      setSelectedType(previewDocument.document.document_type)
    } else {
      setSelectedType('unspecified')
    }
  }, [previewDocument])

  // 문서 유형 변경 핸들러
  const handleTypeChange = async (newType: string) => {
    if (!previewDocument?.id || newType === selectedType) return

    setIsTypeChanging(true)
    try {
      await updateDocumentType(previewDocument.id, newType)
      setSelectedType(newType)
      onDocumentTypeChange?.(previewDocument.id, newType)
    } catch (err) {
      console.error('문서 유형 변경 실패:', err)
    } finally {
      setIsTypeChanging(false)
    }
  }

  // 프리뷰용 URL: 변환된 PDF가 있으면 사용, 없으면 원본 사용
  const previewUrl = previewDocument?.previewFileUrl ?? previewDocument?.fileUrl ?? null
  // 다운로드용 URL: 항상 원본 파일
  const downloadUrl = previewDocument?.fileUrl ?? null

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

    if (isPdf && previewUrl) {
      return (
        <PDFViewer
          file={previewUrl}
          initialScale={fitScale}
          {...(onDownload ? { onDownload } : {})}
        />
      )
    }

    if (isImage && previewUrl) {
      return (
        <ImageViewer
          file={previewUrl}
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

  // 드롭다운 옵션 생성 (시스템 유형 제외, unspecified만 포함)
  const typeOptions = documentTypes
    .filter(dt => !dt.isSystem || dt.value === 'unspecified')
    .sort((a, b) => a.order - b.order)

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
            {/* 문서 유형 선택 드롭다운 */}
            <div className="customer-document-preview__type-selector">
              <label>문서 유형:</label>
              <select
                title="문서 유형 선택"
                value={selectedType}
                onChange={(e) => handleTypeChange(e.target.value)}
                disabled={isTypeChanging || !previewDocument}
                className="customer-document-preview__type-dropdown"
              >
                {typeOptions.map(dt => (
                  <option key={dt.value} value={dt.value}>
                    {dt.label}
                  </option>
                ))}
              </select>
              {isTypeChanging && (
                <SFSymbol
                  name="arrow.triangle.2.circlepath"
                  animation={SFSymbolAnimation.ROTATE}
                  size={SFSymbolSize.FOOTNOTE}
                />
              )}
              {previewDocument?.document?.document_type_auto && (
                <span className="customer-document-preview__auto-badge" title="AI 자동 분류">
                  자동
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
