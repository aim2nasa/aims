/**
 * Document Transformer Utilities
 * SmartSearch API 응답을 내부 형식으로 변환
 */

import {
  isPlainObject,
  toOptionalString,
  toTrimmedString,
  toFiniteNumber,
  firstNonEmptyString
} from './typeConverters'

// SmartSearch API Raw Types
export interface SmartSearchUploadRaw {
  originalName?: unknown
  destPath?: unknown
  uploaded_at?: unknown
  [key: string]: unknown
}

export interface SmartSearchPayloadRaw {
  original_name?: unknown
  dest_path?: unknown
  mime?: unknown
  size_bytes?: unknown
  uploaded_at?: unknown
  [key: string]: unknown
}

export interface SmartSearchMetaRaw {
  mime?: unknown
  size_bytes?: unknown
  [key: string]: unknown
}

export interface SmartSearchDocumentResponse {
  upload?: SmartSearchUploadRaw
  payload?: SmartSearchPayloadRaw
  meta?: SmartSearchMetaRaw
  ocr?: unknown
}

// Internal Document Types
export interface SelectedDocumentUpload {
  originalName: string
  destPath?: string
  uploadedAt?: string
}

export interface SelectedDocumentPayload {
  originalName?: string
  destPath?: string
  uploadedAt?: string
  mime?: string
  sizeBytes?: number
}

export interface SelectedDocumentMeta {
  mime?: string
  sizeBytes?: number
  originalName?: string
}

/** PDF 변환 상태 타입 */
export type ConversionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'not_required' | null

export interface SelectedDocument {
  _id: string
  fileUrl?: string
  /** 프리뷰용 URL (변환된 PDF가 있으면 해당 URL, 없으면 원본) */
  previewFileUrl?: string
  upload: SelectedDocumentUpload
  payload?: SelectedDocumentPayload
  meta: SelectedDocumentMeta
  ocr?: unknown
  /** PDF 변환 상태 */
  conversionStatus?: ConversionStatus
  /** 변환된 PDF로 프리뷰하는지 여부 (previewFileUrl ≠ fileUrl) */
  isConverted?: boolean
  /** 원본 파일 확장자 (예: 'xlsx', 'pptx') */
  originalExtension?: string
}

/**
 * destPath 정규화 (trim + empty check)
 */
export const normalizeDestPath = (value?: string): string | undefined => {
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * destPath를 완전한 파일 URL로 변환
 */
export const resolveFileUrl = (destPath?: string): string | undefined => {
  const normalized = normalizeDestPath(destPath)
  if (!normalized) return undefined
  const adjustedPath = normalized.startsWith('/data')
    ? normalized.replace('/data', '')
    : normalized
  return `https://tars.giize.com${adjustedPath}`
}

/**
 * PDF 파일용 URL 생성 (메타데이터 수정 프록시 경유)
 * @param destPath 파일 저장 경로
 * @param originalName 원본 파일명 (PDF 제목으로 사용)
 */
export const resolvePdfUrl = (destPath?: string, originalName?: string): string | undefined => {
  const normalized = normalizeDestPath(destPath)
  if (!normalized) return undefined

  // /data/files/... -> users/... (PDF 프록시는 /data/files 기준 상대경로 사용)
  let pdfPath = normalized
  if (pdfPath.startsWith('/data/files/')) {
    pdfPath = pdfPath.replace('/data/files/', '')
  } else if (pdfPath.startsWith('/data/')) {
    pdfPath = pdfPath.replace('/data/', '')
  } else if (pdfPath.startsWith('/files/')) {
    pdfPath = pdfPath.replace('/files/', '')
  }
  if (pdfPath.startsWith('/')) {
    pdfPath = pdfPath.substring(1)
  }

  // PDF 프록시 URL 생성
  let url = `https://tars.giize.com/pdf/${pdfPath}`

  // 원본 파일명을 쿼리 파라미터로 추가 (PDF 제목으로 사용)
  if (originalName) {
    url += `?title=${encodeURIComponent(originalName)}`
  }

  return url
}

/**
 * unknown 값을 SmartSearchDocumentResponse로 변환
 */
export const toSmartSearchDocumentResponse = (value: unknown): SmartSearchDocumentResponse | null => {
  if (!isPlainObject(value)) {
    return null
  }

  const record = value as Record<string, unknown>

  const upload: SmartSearchUploadRaw = isPlainObject(record['upload'])
    ? (record['upload'] as SmartSearchUploadRaw)
    : ({} as SmartSearchUploadRaw)
  const payload: SmartSearchPayloadRaw = isPlainObject(record['payload'])
    ? (record['payload'] as SmartSearchPayloadRaw)
    : ({} as SmartSearchPayloadRaw)
  const meta: SmartSearchMetaRaw = isPlainObject(record['meta'])
    ? (record['meta'] as SmartSearchMetaRaw)
    : ({} as SmartSearchMetaRaw)
  const ocr = isPlainObject(record['ocr']) ? record['ocr'] : undefined

  return { upload, payload, meta, ocr }
}

/** API computed 응답 타입 */
export interface DocumentComputedData {
  previewFilePath?: string | null
  canPreview?: boolean
  conversionStatus?: string | null
}

/**
 * SmartSearch 응답을 SelectedDocument로 변환
 * @param documentId 문서 ID
 * @param raw API raw 응답
 * @param computed API computed 응답 (PDF 변환 정보 포함)
 */
export const buildSelectedDocument = (
  documentId: string,
  raw: SmartSearchDocumentResponse,
  computed?: DocumentComputedData | null
): SelectedDocument => {
  const originalName =
    firstNonEmptyString(raw.upload?.['originalName'], raw.payload?.['originalName']) ??
    '문서'

  const destPath = normalizeDestPath(
    firstNonEmptyString(raw.upload?.destPath, raw.payload?.dest_path)
  )

  const uploadedAt =
    toTrimmedString(raw.upload?.uploaded_at) ??
    toTrimmedString(raw.payload?.uploaded_at)

  const metaMime = firstNonEmptyString(raw.meta?.mime, raw.payload?.mime)
  const metaSize = toFiniteNumber(raw.meta?.size_bytes) ?? toFiniteNumber(raw.payload?.size_bytes)

  const payload: SelectedDocumentPayload = {}
  const payloadOriginalName = toTrimmedString(raw.payload?.['originalName'])
  if (payloadOriginalName) payload.originalName = payloadOriginalName

  const payloadDestPath = normalizeDestPath(toOptionalString(raw.payload?.dest_path))
  if (payloadDestPath) payload.destPath = payloadDestPath

  const payloadUploadedAt = toTrimmedString(raw.payload?.uploaded_at)
  if (payloadUploadedAt) payload.uploadedAt = payloadUploadedAt

  const payloadMime = toTrimmedString(raw.payload?.mime)
  if (payloadMime) payload.mime = payloadMime

  const payloadSize = toFiniteNumber(raw.payload?.size_bytes)
  if (payloadSize !== undefined) payload.sizeBytes = payloadSize

  const hasPayload = Object.keys(payload).length > 0

  const meta: SelectedDocumentMeta = {}
  if (metaMime) meta.mime = metaMime
  if (metaSize !== undefined) meta.sizeBytes = metaSize

  const upload: SelectedDocumentUpload = {
    originalName
  }

  if (destPath) {
    upload.destPath = destPath
  }

  if (uploadedAt) {
    upload.uploadedAt = uploadedAt
  }

  const fileUrl = resolveFileUrl(destPath)

  const selected: SelectedDocument = {
    _id: documentId,
    upload,
    meta
  }

  if (fileUrl) {
    selected.fileUrl = fileUrl
  }

  if (hasPayload) {
    selected.payload = payload
  }

  if (raw.ocr) {
    selected.ocr = raw.ocr
  }

  // 프리뷰용 URL 설정: 변환된 PDF가 있으면 해당 URL, 없으면 원본 fileUrl 사용
  if (computed?.previewFilePath) {
    selected.previewFileUrl = resolveFileUrl(computed.previewFilePath)
  } else if (fileUrl) {
    selected.previewFileUrl = fileUrl
  }

  // PDF 변환 상태 설정
  if (computed?.conversionStatus) {
    selected.conversionStatus = computed.conversionStatus as ConversionStatus
  }

  // 변환된 PDF로 프리뷰하는지 여부 (previewFileUrl이 fileUrl과 다르면 변환된 것)
  selected.isConverted = !!(
    selected.previewFileUrl &&
    selected.fileUrl &&
    selected.previewFileUrl !== selected.fileUrl &&
    selected.previewFileUrl.toLowerCase().endsWith('.pdf')
  )

  // 원본 파일 확장자 추출
  const extMatch = originalName.match(/\.([^.]+)$/)
  if (extMatch) {
    selected.originalExtension = extMatch[1].toLowerCase()
  }

  return selected
}
