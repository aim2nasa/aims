/**
 * Document Status Types
 * @description 문서 처리 현황 관련 타입 정의
 */

/**
 * 문서 처리 상태
 */
export type DocumentStatus = 'completed' | 'processing' | 'error' | 'pending'

/**
 * 처리 단계 상태
 */
export type StageStatus = 'completed' | 'processing' | 'error' | 'pending' | 'skipped' | 'done' | 'failed' | 'running'

/**
 * 문서 처리 경로 타입
 */
export type ProcessingPathType =
  | 'unsupported'
  | 'page_limit_exceeded'
  | 'ocr_skipped'
  | 'meta_fulltext'
  | 'text_plain'
  | 'ocr_normal'
  | 'processing'
  | 'unknown'

/**
 * 처리 단계 정보
 */
export interface ProcessingStage {
  type: string
  name: string
  status: StageStatus
  icon?: string
}

/**
 * 처리 경로 분석 결과
 */
export interface ProcessingPathAnalysis {
  badges: ProcessingStage[]
  pathType: ProcessingPathType
  expectedStages: string[]
}

/**
 * Upload 데이터 구조
 */
export interface UploadData {
  originalName?: string
  saveName?: string
  destPath?: string
  timestamp?: string
  uploaded_at?: string
  status?: StageStatus | string
}

/**
 * Meta 데이터 구조
 */
export interface MetaData {
  mime?: string
  pdf_pages?: number | string
  full_text?: string
  summary?: string
  meta_status?: string
  created_at?: string
  filename?: string
  size_bytes?: number
  status?: StageStatus
}

/**
 * OCR 데이터 구조
 */
export interface OcrData {
  full_text?: string
  summary?: string
  status?: StageStatus
  warn?: boolean
  queue?: boolean
}

/**
 * Text 데이터 구조 (text/plain 파일용)
 */
export interface TextData {
  full_text?: string
}

/**
 * DocEmbed 데이터 구조
 */
export interface DocEmbedData {
  status?: StageStatus
}

/**
 * Embed 데이터 구조
 */
export interface EmbedData {
  status?: StageStatus
}

/**
 * Stages 구조 (stages 기반 문서)
 */
export interface StagesData {
  upload?: UploadData | string
  meta?: MetaData | string
  ocr?: OcrData | string
  text?: TextData | string
  embed?: EmbedData | string
  docembed?: DocEmbedData | string
}

/**
 * 문서 객체 인터페이스
 */
export interface Document {
  // ID 필드들
  _id?: string
  id?: string

  // 기본 필드들
  originalName?: string
  filename?: string
  file_name?: string
  name?: string
  title?: string
  mimeType?: string

  // 상태 필드들
  status?: DocumentStatus
  overallStatus?: DocumentStatus
  progress?: number

  // 타임스탬프
  uploaded_at?: string
  created_at?: string
  timestamp?: string

  // 데이터 구조들
  upload?: UploadData | string
  meta?: MetaData | string
  ocr?: OcrData | string
  text?: TextData | string
  docembed?: DocEmbedData | string
  embed?: EmbedData | string
  stages?: StagesData
  payload?: Record<string, unknown>

  // 고객 연결 정보
  customer_relation?: DocumentCustomerRelation
}

/**
 * 문서-고객 연결 정보
 */
export interface DocumentCustomerRelation {
  customer_id: string
  customer_name?: string
  relationship_type?: string
  assigned_by?: string | null
  assigned_at?: string
  notes?: string
  linked_at?: string
}

/**
 * API 응답 인터페이스
 */
export interface DocumentStatusResponse {
  success?: boolean
  files?: Document[]
  data?: {
    documents: Document[]
    total: number
  }
  documents?: Document[]
  total?: number
}

/**
 * 문서 상세 조회 응답
 */
export interface DocumentDetailResponse {
  success: boolean
  data: {
    rawDocument: Document
  }
  stages?: StagesData
}

/**
 * API Health Check 응답
 */
export interface HealthCheckResponse {
  status: string
  timestamp: string
}
