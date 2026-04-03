/**
 * 문서 프리뷰 공용 타입
 *
 * 여러 feature/component에서 공통으로 사용하는 문서 프리뷰 인터페이스.
 * ChatPanel, App.tsx, CustomerDocumentPreviewModal 등에서 사용.
 *
 * @since 2026-04-04
 * @moved features/customer/controllers/useCustomerDocumentsController → shared/types
 */

import type { CustomerDocumentItem } from '@/services/DocumentService';

export interface PreviewDocumentInfo {
  id: string
  originalName: string
  fileUrl: string | null
  /** 프리뷰용 URL (변환된 PDF 또는 원본) */
  previewFileUrl: string | null
  mimeType?: string
  uploadedAt?: string
  sizeBytes?: number | null
  /** PDF 변환 상태 */
  conversionStatus?: string | null
  /** 프리뷰 가능 여부 */
  canPreview?: boolean
  /** 변환된 PDF로 프리뷰하는지 여부 */
  isConverted?: boolean
  /** 원본 파일 확장자 (예: 'xlsx', 'pptx') */
  originalExtension?: string
  document: CustomerDocumentItem
  rawDetail: Record<string, unknown> | null
  /** 바이러스 스캔 정보 */
  virusScan?: {
    status?: 'pending' | 'clean' | 'infected' | 'deleted' | 'error'
    threatName?: string
  }
}
