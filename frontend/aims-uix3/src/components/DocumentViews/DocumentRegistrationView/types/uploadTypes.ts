/**
 * Upload Types
 * @since 1.0.0
 *
 * 파일 업로드 시스템을 위한 타입 정의
 * 미래 확장성을 고려한 사용자별 업로드 지원
 */

// 🔮 미래 확장성: 사용자 식별 방식
export type UserIdentifierType = 'userId' | 'phoneNumber' | 'customerNumber'

// 🔮 업로드 컨텍스트 (사용자별 업로드 지원)
export interface UploadContext {
  /** 사용자 식별 방식 */
  identifierType: UserIdentifierType
  /** 사용자 식별 값 */
  identifierValue: string
  /** 프로젝트 ID (선택적) */
  projectId?: string | undefined
  /** 부서 ID (선택적) */
  departmentId?: string | undefined
  /** 추가 메타데이터 (선택적) */
  metadata?: Record<string, unknown> | undefined
}

// 파일 업로드 상태
export type UploadStatus = 'analyzing' | 'pending' | 'uploading' | 'completed' | 'warning' | 'error' | 'cancelled' | 'skipped'

// 업로드할 파일 정보
export interface UploadFile {
  /** 고유 ID */
  id: string
  /** 원본 File 객체 */
  file: File
  /** 파일 크기 (bytes) - 브라우저 리사이징 시 보존용 */
  fileSize: number
  /** 업로드 상태 */
  status: UploadStatus
  /** 업로드 진행률 (0-100) */
  progress: number
  /** 에러 메시지 (있는 경우) */
  error?: string | undefined
  /** 업로드 완료 시간 */
  completedAt?: Date | undefined
  /** 파일이 폴더에서 온 경우의 상대 경로 */
  relativePath?: string | undefined
  /** 고객 ID - "내 파일"에서 업로드 시 userId와 동일 */
  customerId?: string | undefined
  /** 폴더 ID - "내 보관함"에서 업로드 시 현재 폴더 ID */
  folderId?: string | null | undefined
}

// 업로드 에러 정보
export interface UploadError {
  /** 파일 ID */
  fileId: string
  /** 파일명 */
  fileName: string
  /** 에러 메시지 */
  message: string
  /** 에러 코드 */
  code?: string | undefined
  /** 재시도 가능 여부 */
  retryable: boolean
}

// 업로드 결과
export interface UploadResult {
  /** 파일 ID */
  fileId: string
  /** 성공 여부 */
  success: boolean
  /** 서버 응답 데이터 */
  data?: unknown
  /** 에러 정보 (실패 시) */
  error?: UploadError | undefined
}

// 업로드 진행 이벤트
export interface UploadProgressEvent {
  /** 파일 ID */
  fileId: string
  /** 진행률 (0-100) */
  progress: number
  /** 업로드된 바이트 */
  loaded: number
  /** 전체 바이트 */
  total: number
}

// 전체 업로드 상태
export interface UploadState {
  /** 업로드할 파일들 */
  files: UploadFile[]
  /** 업로드 중 여부 */
  uploading: boolean
  /** 전체 진행률 */
  totalProgress: number
  /** 완료된 파일 수 */
  completedCount: number
  /** 에러 목록 */
  errors: UploadError[]
  /** 업로드 컨텍스트 */
  context: UploadContext
}

// 파일 선택 옵션
export interface FileSelectionOptions {
  /** 다중 파일 선택 허용 */
  multiple: boolean
  /** 폴더 선택 허용 */
  directory: boolean
  /** 허용할 파일 형식 (MIME type) */
  accept?: string | undefined
  /** 최대 파일 크기 (bytes) */
  maxFileSize?: number | undefined
  /** 최대 파일 개수 */
  maxFileCount?: number | undefined
}

// 드래그앤드롭 이벤트 타입
export interface DropEvent {
  /** 드롭된 파일들 */
  files: File[]
  /** 폴더 구조가 포함되어 있는지 여부 */
  hasDirectories: boolean
}

// DocPrepMain 엔드포인트 응답 타입
export interface DocPrepResponse {
  // 성공 케이스 - OCR 큐잉 성공
  ocr?: {
    status: 'queued'
    queued_at: string
  }

  // 성공 케이스 - 텍스트 파일 처리 완료
  exitCode?: number
  stderr?: string

  // 경고 케이스 - 지원하지 않는 파일 형식
  warn?: boolean
  status?: number
  userMessage?: string
  mime?: string
  filename?: string

  // 에러 케이스 - 업로드/처리 실패
  error?: {
    statusCode: string
    statusMessage: string
    body?: string
  }
}
