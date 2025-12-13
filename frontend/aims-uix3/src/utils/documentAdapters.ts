/**
 * Document Adapter Utilities
 * SelectedDocument를 다른 컴포넌트에서 사용하는 형식으로 변환
 */

import type { SelectedDocument } from './documentTransformers'
import type { PreviewDocumentInfo } from '../features/customer/controllers/useCustomerDocumentsController'

/**
 * SelectedDocument를 DownloadHelper 형식으로 변환
 */
export const adaptToDownloadHelper = (doc: SelectedDocument) => {
  const payload: { original_name?: string; dest_path?: string } = {}
  if (doc.payload?.['originalName']) payload.original_name = doc.payload['originalName']
  if (doc.payload?.['destPath']) payload.dest_path = doc.payload['destPath']

  return {
    _id: doc._id,
    fileUrl: doc.fileUrl ?? '',
    upload: {
      originalName: doc.upload?.['originalName'] ?? '',
      destPath: doc.upload?.['destPath'] ?? ''
    },
    payload
  }
}

/**
 * SelectedDocument를 PreviewDocumentInfo 형식으로 변환
 */
export const convertToPreviewDocumentInfo = (doc: SelectedDocument): PreviewDocumentInfo => {
  const originalName = doc.upload?.originalName || doc.payload?.originalName || doc.meta?.originalName || '문서'
  const fileUrl = doc.fileUrl || null
  const mimeType = doc.meta?.mime || doc.payload?.mime
  const uploadedAt = doc.upload?.uploadedAt || doc.payload?.uploadedAt
  const sizeBytes = doc.meta?.sizeBytes ?? doc.payload?.sizeBytes ?? null

  // 프리뷰용 URL: 변환된 PDF가 있으면 사용, 없으면 원본 사용
  const previewFileUrl = doc.previewFileUrl || fileUrl

  // exactOptionalPropertyTypes 대응: undefined가 아닌 경우에만 프로퍼티 포함
  const result: PreviewDocumentInfo = {
    id: doc._id,
    originalName,
    fileUrl,
    previewFileUrl,
    document: doc as unknown as PreviewDocumentInfo['document'],
    rawDetail: doc as unknown as PreviewDocumentInfo['rawDetail']
  }

  if (mimeType !== undefined) {
    result.mimeType = mimeType
  }
  if (uploadedAt !== undefined) {
    result.uploadedAt = uploadedAt
  }
  if (sizeBytes !== null) {
    result.sizeBytes = sizeBytes
  }

  return result
}
