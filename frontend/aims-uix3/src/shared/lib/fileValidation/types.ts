/**
 * 파일 검증 공통 타입 정의
 * @since 2025-12-13
 * @version 2.0.0 - 플러그인 아키텍처 전환
 */

/**
 * 검증 실패 사유
 */
export type ValidationFailReason =
  | 'blocked_extension'
  | 'system_file'
  | 'size_exceeded'
  | 'mime_mismatch'
  | 'virus_detected'
  | 'storage_exceeded'
  | 'unknown'

/**
 * 단일 파일 검증 결과
 */
export interface FileValidationResult {
  /** 검증 통과 여부 */
  valid: boolean
  /** 검증 대상 파일 */
  file: File
  /** 실패 사유 (valid가 false일 때) */
  reason?: ValidationFailReason
  /** 사용자에게 표시할 메시지 */
  message?: string
}

/**
 * 스토리지 검사 결과
 */
export interface StorageCheckResult {
  /** 업로드 가능 여부 */
  canUpload: boolean
  /** 무제한 사용자 여부 */
  isUnlimited: boolean
  /** 현재 사용량 (바이트) */
  usedBytes: number
  /** 최대 용량 (바이트) */
  maxBytes: number
  /** 남은 용량 (바이트) */
  remainingBytes: number
  /** 요청된 업로드 크기 (바이트) */
  requestedBytes: number
  /** 일부 업로드 가능 정보 (용량 초과 시) */
  partialUploadInfo: {
    fileCount: number
    totalSize: number
    files: File[]
  } | null
}

/**
 * MIME 타입 검증 결과
 */
export interface MimeValidationResult {
  /** 검증 통과 여부 */
  valid: boolean
  /** 예상 MIME 타입 */
  expectedMime: string | null
  /** 실제 MIME 타입 */
  actualMime: string
  /** 위조 의심 여부 */
  isSuspicious: boolean
  /** 메시지 */
  message?: string
}

/**
 * 바이러스 검사 결과
 */
export interface VirusScanResult {
  /** 검사 완료 여부 */
  scanned: boolean
  /** 바이러스 감염 여부 */
  infected: boolean
  /** 감지된 바이러스명 */
  virusName?: string
  /** 검사 건너뜀 여부 (ClamAV 비활성화 등) */
  skipped?: boolean
  /** 메시지 */
  message?: string
  /** 에러 메시지 */
  error?: string
}

/**
 * 전체 검증 파이프라인 결과
 */
export interface ValidationPipelineResult {
  /** 검증 통과한 파일들 */
  validFiles: File[]
  /** 검증 실패한 파일들 */
  invalidFiles: FileValidationResult[]
  /** 스토리지 검사 결과 */
  storageCheck: StorageCheckResult | null
  /** 바이러스 검사 결과 (옵션) */
  virusScanResults?: Map<string, VirusScanResult>
}

/**
 * 검증 파이프라인 옵션
 */
export interface ValidationPipelineOptions {
  /** 스토리지 검사 수행 여부 (기본값: true) */
  checkStorage?: boolean
  /** 바이러스 검사 수행 여부 (기본값: false) */
  scanVirus?: boolean
  /** 진행률 콜백 */
  onProgress?: (stage: string, current: number, total: number) => void
}

// ============================================
// 플러그인 아키텍처 타입 (v2.0.0)
// ============================================

/**
 * 파일 검증기 플러그인 인터페이스
 *
 * 새로운 검증 기능을 추가하려면 이 인터페이스를 구현하세요.
 *
 * @example
 * ```typescript
 * const myValidator: FileValidator = {
 *   name: 'myCustomValidator',
 *   priority: 50,
 *   enabled: true,
 *   validate: (file) => {
 *     if (someCondition) {
 *       return { valid: false, file, reason: 'unknown', message: '검증 실패' }
 *     }
 *     return { valid: true, file }
 *   }
 * }
 *
 * pipeline.register(myValidator)
 * ```
 */
export interface FileValidator {
  /** 검증기 고유 이름 */
  name: string
  /** 실행 우선순위 (낮을수록 먼저 실행, 기본값: 100) */
  priority: number
  /** 활성화 여부 */
  enabled: boolean
  /** 검증 함수 */
  validate: (file: File) => FileValidationResult
  /** 검증기 설명 (선택) */
  description?: string
}

/**
 * 검증기 등록 옵션
 */
export interface ValidatorRegistrationOptions {
  /** 동일 이름의 검증기가 있으면 덮어쓸지 여부 (기본값: false) */
  overwrite?: boolean
}

/**
 * 파이프라인 실행 옵션
 */
export interface PipelineExecutionOptions {
  /** 특정 검증기만 실행 (이름 목록) */
  only?: string[]
  /** 특정 검증기 제외 (이름 목록) */
  exclude?: string[]
  /** 첫 번째 실패 시 중단 여부 (기본값: true) */
  stopOnFirstFailure?: boolean
}
