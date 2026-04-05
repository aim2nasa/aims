/* eslint-disable @typescript-eslint/no-explicit-any -- 문서 타입 변환 시 동적 속성 접근 */
/**
 * Document Adapter Utilities
 * SelectedDocument를 다른 컴포넌트에서 사용하는 형식으로 변환
 */

import type { SelectedDocument } from './documentTransformers'
import type { PreviewDocumentInfo } from '@/shared/types/document'

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

  // PDF 변환 관련 필드
  if (doc.isConverted !== undefined) {
    result.isConverted = doc.isConverted
  }
  if (doc.originalExtension !== undefined) {
    result.originalExtension = doc.originalExtension
  }
  if (doc.conversionStatus !== undefined) {
    result.conversionStatus = doc.conversionStatus
  }

  // 바이러스 스캔 정보
  const virusScan = (doc as any).virusScan
  if (virusScan) {
    result.virusScan = {
      status: virusScan.status,
      threatName: virusScan.threatName
    }
  }

  return result
}
