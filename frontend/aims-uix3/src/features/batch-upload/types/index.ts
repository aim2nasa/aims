/**
 * 고객 문서 일괄등록 기능 타입 정의
 * @since 2025-12-05
 * @version 1.0.0
 */

/**
 * 설계사 등급
 */
export interface AgentTier {
  _id: string
  name: '무료체험' | '일반' | '프리미엄' | 'VIP'
  maxStorageBytes: number      // 5GB, 30GB, 50GB, 100GB
  maxBatchUploadBytes: number  // 100MB, 500MB, 1GB, 2GB
  trialDays: number | null     // 30 (무료체험) or null (유료)
  isDefault: boolean           // 신규 가입 시 기본 등급 여부
}

/**
 * 설계사 등급별 저장량 한도 (바이트 단위)
 */
export const TIER_LIMITS = {
  FREE_TRIAL: {
    maxStorage: 5 * 1024 * 1024 * 1024,       // 5GB
    maxBatchUpload: 100 * 1024 * 1024,        // 100MB
    trialDays: 30,
  },
  STANDARD: {
    maxStorage: 30 * 1024 * 1024 * 1024,      // 30GB
    maxBatchUpload: 500 * 1024 * 1024,        // 500MB
    trialDays: null,
  },
  PREMIUM: {
    maxStorage: 50 * 1024 * 1024 * 1024,      // 50GB
    maxBatchUpload: 1024 * 1024 * 1024,       // 1GB
    trialDays: null,
  },
  VIP: {
    maxStorage: 100 * 1024 * 1024 * 1024,     // 100GB
    maxBatchUpload: 2 * 1024 * 1024 * 1024,   // 2GB
    trialDays: null,
  },
} as const

/**
 * 사용자 저장량 정보
 */
export interface UserStorageInfo {
  tier: AgentTier
  used: number              // 현재 사용량 (bytes)
  remaining: number         // 남은 용량 (bytes)
  tierStartedAt: Date       // 현재 등급 시작일
  trialExpiresAt: Date | null  // 무료체험 만료일 (해당 시)
  isTrialExpired: boolean   // 무료체험 만료 여부
}

/**
 * 파일 검증 결과
 */
export interface FileValidationResult {
  valid: boolean
  file: File
  reason?: 'blocked_extension' | 'size_exceeded' | 'batch_size_exceeded'
  message?: string
}

/**
 * 폴더-고객 매핑 정보
 */
export interface FolderMapping {
  folderName: string
  customerId: string | null
  customerName: string | null
  matched: boolean
  files: File[]
  fileCount: number
  totalSize: number
}

/**
 * 업로드 배치 상태
 */
export type UploadBatchStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

/**
 * 실패 사유
 */
export type FailureReason =
  | 'size_exceeded'
  | 'blocked_extension'
  | 'virus_detected'
  | 'network_error'
  | 'server_error'
  | 'quota_exceeded'
  | 'trial_expired'
  | 'unknown'

/**
 * 실패한 파일 정보
 */
export interface FailedFile {
  filename: string
  folderName: string
  reason: FailureReason
  message?: string
}

/**
 * 업로드 배치 이력
 */
export interface UploadBatch {
  _id: string
  userId: string
  status: UploadBatchStatus
  totalFiles: number
  successCount: number
  failedCount: number
  skippedCount: number
  totalBytes: number
  uploadedBytes: number
  folders: Array<{
    folderName: string
    customerId: string | null
    matched: boolean
    fileCount: number
  }>
  failedFiles: FailedFile[]
  createdAt: Date
  completedAt: Date | null
  expiresAt: Date  // TTL 인덱스용 (30일)
}

/**
 * 중복 파일 처리 옵션
 */
export type DuplicateAction = 'overwrite' | 'skip' | 'keep_both'

/**
 * 중복 파일 정보
 */
export interface DuplicateFile {
  newFile: File
  existingDocumentId: string
  existingFilename: string
  existingSize: number
  existingDate: Date
}

/**
 * 업로드 진행률 정보
 */
export interface UploadProgress {
  currentFile: string
  currentFileIndex: number
  totalFiles: number
  uploadedBytes: number
  totalBytes: number
  speed: number           // bytes per second
  estimatedTimeRemaining: number  // seconds
  percentage: number      // 0-100
}

/**
 * 파일 크기 제한 상수
 */
export const FILE_SIZE_LIMITS = {
  MAX_SINGLE_FILE: 50 * 1024 * 1024,  // 50MB
} as const
