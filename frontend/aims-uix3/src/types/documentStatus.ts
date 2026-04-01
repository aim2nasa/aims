/**
 * Document Status Types
 * @description 문서 처리 현황 관련 타입 정의
 *
 * NOTE: 이 파일의 Document 타입은 API 응답 타입입니다.
 * 애플리케이션 내부 도메인 모델은 @/entities/document를 사용하세요.
 */

/**
 * 문서 처리 상태
 */
export type DocumentStatus =
  | 'pending'           // 큐 대기 / 재처리 대기
  | 'uploading'         // 파일 저장 중
  | 'converting'        // PDF 변환 중 (HWP/PPTX 등)
  | 'extracting'        // 텍스트/메타 추출
  | 'ocr_queued'        // OCR 대기열 진입
  | 'ocr_processing'    // OCR 처리 중
  | 'classifying'       // AI 분류 + 특수문서 감지
  | 'embed_pending'     // dp/xp 완료, 임베딩 크론 대기
  | 'embedding'         // 임베딩 생성 중
  | 'completed'         // 전체 완료
  | 'credit_pending'    // 크레딧 부족
  | 'error'             // 실패
  | 'processing'        // 레거시 호환 (기존 DB 데이터)
  | 'timeout'           // 타임아웃

/**
 * 처리 단계 상태
 */
export type StageStatus = 'completed' | 'processing' | 'error' | 'pending' | 'skipped' | 'done' | 'failed' | 'running' | 'quota_exceeded'

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
  name?: string
  originalName?: string
  saveName?: string
  destPath?: string
  timestamp?: string
  uploaded_at?: string
  status?: StageStatus | string
  message?: string
  fileSize?: number
  size?: number
  file_size?: number
  mimeType?: string
  // PDF 변환 관련 필드
  convPdfPath?: string
  conversion_status?: 'pending' | 'processing' | 'completed' | 'failed' | null
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
  size?: number
  status?: StageStatus
  mimeType?: string
}

/**
 * OCR 데이터 구조
 */
export interface OcrData {
  name?: string
  full_text?: string
  summary?: string
  status?: StageStatus
  warn?: boolean
  queue?: boolean
  confidence?: string
  message?: string
  timestamp?: string
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
  text_source?: string
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
  displayName?: string  // 🍎 AI 생성 또는 AR/CRS 파싱 후 생성된 사용자 친화적 이름
  displayNameStatus?: string  // 별칭 생성 결과: "failed" = 자동 생성 실패
  filename?: string
  file_name?: string
  name?: string
  title?: string
  mimeType?: string

  // 상태 필드들
  status?: DocumentStatus
  overallStatus?: DocumentStatus
  progressStage?: string  // 🔴 credit_pending 등 처리 단계 상태
  progress?: number

  // 타임스탬프
  uploaded_at?: string
  created_at?: string
  timestamp?: string

  // 파일 크기 필드들 (다양한 소스에서 올 수 있음)
  size?: number
  fileSize?: number
  file_size?: number

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

  // 소유자 및 고객 ID (내 파일 기능용)
  ownerId?: string
  customerId?: string

  // Annual Report 여부
  is_annual_report?: boolean

  // Customer Review 여부
  is_customer_review?: boolean

  // Badge Type (TXT, OCR, BIN)
  badgeType?: 'TXT' | 'OCR' | 'BIN'

  // 요약 텍스트 (meta.summary)
  summary?: string | null

  // full_text 존재 플래그 (status API 경량화: full_text 제거 대신 boolean 전달)
  _hasMetaText?: boolean
  _hasOcrText?: boolean

  // 문서 유형 (docType / document_type)
  docType?: string | null
  docTypeLabel?: string | null
  document_type?: string | null  // 백엔드 API 응답 필드명
  document_type_auto?: boolean   // 자동 분류 여부

  // PDF 변환 상태 (computed에서 가져옴)
  conversionStatus?: 'pending' | 'processing' | 'completed' | 'failed' | 'not_required' | null
  isConvertible?: boolean
  canPreview?: boolean
  previewFilePath?: string

  // 바이러스 스캔 정보
  virusScan?: {
    status?: 'pending' | 'clean' | 'infected' | 'deleted' | 'error'
    threatName?: string
    scannedAt?: string
    deletedAt?: string
    deletedReason?: string
  }

  // 🔴 크레딧 부족으로 대기 중인 문서 정보
  credit_pending_info?: {
    credits_remaining?: number
    days_until_reset?: number
    estimated_credits?: number
    reason?: string
  }
}

/**
 * 문서-고객 연결 정보
 */
export interface DocumentCustomerRelation {
  customer_id: string
  customer_name?: string
  customer_type?: string | null
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
    pagination?: {
      page: number
      limit: number
      total: number
      totalPages: number
      totalCount: number
    }
  }
  documents?: Document[]
  total?: number
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
    totalCount: number
  }
}

/**
 * 바이러스 스캔 정보
 */
export interface VirusScanData {
  status: 'pending' | 'scanning' | 'clean' | 'infected' | 'deleted' | 'error'
  scannedAt?: string
  clamVersion?: string
  threatName?: string
  scanDurationMs?: number
  deletedAt?: string
  deletedBy?: string
  deletedReason?: string
}

/**
 * DB 원본 데이터 구조 (조작되지 않은 MongoDB 문서)
 */
export interface RawDocumentData {
  _id: string
  upload: UploadData | null
  meta: MetaData | null
  ocr: OcrData | null
  text: TextData | null
  docembed: DocEmbedData | null
  customer_relation?: DocumentCustomerRelation
  ownerId?: string  // 🆕 내 파일 기능
  customerId?: string  // 🆕 내 파일 기능
  virusScan?: VirusScanData  // 🔴 바이러스 스캔 정보
}

/**
 * UI용 계산된 데이터 구조
 */
export interface ComputedDocumentData {
  uiStages: StagesData
  currentStage: number
  overallStatus: DocumentStatus
  progress: number
  displayMessages: Record<string, string>
  processingPath: ProcessingPathType
}

/**
 * 문서 상세 조회 응답 (NEW: raw + computed 구조)
 */
export interface DocumentDetailResponse {
  success: boolean
  data: {
    // 📦 DB 원본 데이터 (투명하게 전달)
    raw: RawDocumentData

    // 🧮 UI용 계산값 (프론트엔드 편의)
    computed: ComputedDocumentData

    // 📋 기본 메타 정보 (하위 호환성)
    _id: string
    originalName: string
    uploadedAt?: string
    fileSize?: number
    mimeType?: string
    filePath?: string

    // ⚠️ DEPRECATED: 하위 호환성 유지용 (raw 또는 computed 사용 권장)
    rawDocument?: Document
    stages?: StagesData
  }
}

/**
 * API Health Check 응답
 */
export interface HealthCheckResponse {
  status: string
  timestamp: string
}

/**
 * 타입 별칭: API 응답의 Document 타입을 명시적으로 표현
 * 이 타입은 API에서 반환되는 문서 데이터 구조입니다.
 */
export type ApiDocument = Document
