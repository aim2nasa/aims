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
  trialDays: number | null     // 30 (무료체험) or null (유료)
  isDefault: boolean           // 신규 가입 시 기본 등급 여부
}

/**
 * 설계사 등급별 저장량 한도 (바이트 단위)
 * Phase 1: maxBatchUpload 제거 — API의 remaining_bytes가 유일한 제한
 */
export const TIER_LIMITS = {
  FREE_TRIAL: {
    maxStorage: 5 * 1024 * 1024 * 1024,       // 5GB
    trialDays: 30,
  },
  STANDARD: {
    maxStorage: 30 * 1024 * 1024 * 1024,      // 30GB
    trialDays: null,
  },
  PREMIUM: {
    maxStorage: 50 * 1024 * 1024 * 1024,      // 50GB
    trialDays: null,
  },
  VIP: {
    maxStorage: 100 * 1024 * 1024 * 1024,     // 100GB
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
  reason?: 'blocked_extension' | 'system_file' | 'size_exceeded' | 'batch_size_exceeded'
  message?: string
}

/**
 * 폴더 매핑 상태 (3상태 배타)
 * @since 2026-04-11
 *
 * - direct: 사용자가 명시적으로 고객 지정한 폴더 (업로드 단위)
 * - inherited: 조상 폴더 중 하나가 direct → 자동 상속 (업로드 단위 아님)
 * - unmapped: 자기도 조상도 매핑 없음 (업로드되지 않음)
 *
 * 불변식: 루트→리프 경로상 direct는 최대 1개 (부모·자식 direct 공존 금지)
 */
export type FolderMappingState = 'direct' | 'inherited' | 'unmapped'

/**
 * 폴더-고객 매핑 정보 (재설계 v4)
 * @since 2026-04-11
 *
 * - folderPath: 트리 내 unique key (e.g. "root/한울/하위A")
 * - direct 폴더는 업로드 단위 = subtreeFiles (자기 + 하위 전체)
 * - inherited 폴더는 조상의 업로드에 포함됨 (별도 단위 아님)
 * - unmapped 폴더는 업로드되지 않음
 */
export interface FolderMapping {
  /** 전체 경로 (트리 unique key) */
  folderPath: string
  /** 리프 폴더명 */
  folderName: string
  /** 부모 폴더 경로 (루트면 null) */
  parentFolderPath: string | null
  /** 매핑 상태 */
  state: FolderMappingState
  /** direct 또는 inherited 시 고객 ID */
  customerId: string | null
  /** direct 또는 inherited 시 고객명 */
  customerName: string | null
  /** state=inherited일 때 상속 받은 조상 폴더 경로 */
  inheritedFromPath: string | null
  /** 자기 직하 파일만 */
  directFiles: File[]
  directFileCount: number
  directTotalSize: number
  /** 자기 + 전체 하위 파일 (direct 폴더일 때 업로드 단위) */
  subtreeFiles: File[]
  subtreeFileCount: number
  subtreeTotalSize: number
  /** sessionStorage 복원 플래그 (실제 파일 내용 없음 → 업로드 불가) */
  isPlaceholder?: boolean
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
 * - skip: 이미 동일한 파일이 존재하므로 업로드 건너뛰기
 *
 * Note: hash 기반 중복 검사이므로 덮어쓰기/둘다유지는 무의미함
 */
export type DuplicateAction = 'skip'

/**
 * 중복 파일 정보 (배치 업로드용)
 */
export interface DuplicateFileInfo {
  file: File
  fileId: string
  folderName: string
  customerId: string
  customerName: string
  newFileHash: string
  newFileSize: number
  existingDocumentId: string
  existingFileName: string
  existingFileSize: number
  existingUploadedAt: string
}

/**
 * 중복 파일 정보 (Legacy - 하위 호환성)
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
 * Phase 1: 개별 파일 크기 제한 없음 — 저장 용량 쿼터로 관리
 */
export const FILE_SIZE_LIMITS = {} as const

/**
 * 폴더 분석 단계 (업로드 이전 단계)
 * @since 2026-04-11
 *
 * - reading: 파일 시스템에서 파일 목록 읽는 중 (총계 미지수)
 * - validating: 파일 검증 (확장자/MIME/크기)
 * - matching: 폴더-고객 매칭
 * - checking-storage: 스토리지 용량 체크
 */
export type BatchAnalyzeStage = 'reading' | 'validating' | 'matching' | 'checking-storage'

/**
 * 폴더 분석 진행률
 * total이 null이면 총계 미지수 (reading 단계 초기)
 */
export interface BatchAnalyzeProgress {
  stage: BatchAnalyzeStage
  current: number
  total: number | null
}
