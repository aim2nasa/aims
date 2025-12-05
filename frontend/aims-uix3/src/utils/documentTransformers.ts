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

export interface SelectedDocument {
  _id: string
  fileUrl?: string
  upload: SelectedDocumentUpload
  payload?: SelectedDocumentPayload
  meta: SelectedDocumentMeta
  ocr?: unknown
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

/**
 * SmartSearch 응답을 SelectedDocument로 변환
 */
export const buildSelectedDocument = (documentId: string, raw: SmartSearchDocumentResponse): SelectedDocument => {
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

  return selected
}
