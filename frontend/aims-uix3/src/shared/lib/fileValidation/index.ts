/**
 * 파일 검증 모듈 - 메인 진입점
 * @since 2025-12-13
 * @version 2.0.0 - 플러그인 아키텍처 전환
 *
 * 이 모듈은 파일 업로드 전 검증 기능을 제공합니다:
 * - 확장자 검증 (위험 확장자 차단)
 * - 파일 크기 검증 (50MB 제한)
 * - MIME 타입 검증 (확장자 위조 탐지)
 * - 스토리지 용량 검사
 * - 플러그인 아키텍처 (검증기 동적 추가/제거)
 *
 * @example
 * ```typescript
 * import { validateFiles, checkStorageQuota } from '@/shared/lib/fileValidation'
 *
 * // 기본 파일 검증
 * const { validFiles, invalidFiles } = validateFiles(files)
 *
 * // 스토리지 포함 전체 검증
 * const result = await validateFilesWithStorage(files)
 * if (!result.storageCheck?.canUpload) {
 *   // 용량 초과 처리
 * }
 *
 * // 플러그인 아키텍처 사용
 * import { defaultPipeline, ValidationPipeline } from '@/shared/lib/fileValidation'
 *
 * // 검증기 비활성화
 * defaultPipeline.setEnabled('mime', false)
 *
 * // 커스텀 검증기 추가
 * defaultPipeline.register({
 *   name: 'myValidator',
 *   priority: 50,
 *   enabled: true,
 *   validate: (file) => ({ valid: true, file })
 * })
 * ```
 */

// Types
export type {
  ValidationFailReason,
  FileValidationResult,
  StorageCheckResult,
  MimeValidationResult,
  VirusScanResult,
  ValidationPipelineResult,
  ValidationPipelineOptions,
  // Plugin architecture types
  FileValidator,
  ValidatorRegistrationOptions,
  PipelineExecutionOptions,
} from './types'

// Constants
export {
  BLOCKED_EXTENSIONS,
  ALLOWED_DOCUMENT_EXTENSIONS,
  FILE_SIZE_LIMITS,
  EXTENSION_MIME_MAP,
  DANGEROUS_MIME_TYPES,
  formatFileSize,
} from './constants'

// Validators
export {
  getFileExtension,
  isBlockedExtension,
  validateExtension,
  isFileSizeValid,
  validateFileSize,
  isDangerousMimeType,
  isExtensionMimeMatch,
  validateMimeType,
  validateFile,
  validateFiles,
  type ValidateFileOptions,
  // Pipeline exports
  ValidationPipeline,
  defaultPipeline,
  defaultPlugins,
  PLUGIN_NAMES,
} from './validators'

// Storage Checker
export {
  calculatePartialUpload,
  checkStorageWithInfo,
  checkStorageQuota,
  formatStorageCheckMessage,
} from './storageChecker'

// Virus Scan Utilities (API-independent functions only)
// For full virus scan API (getScanStatus, isScanAvailable, scanFile, scanFiles),
// import directly from '@/shared/lib/fileValidation/virusScanApi'
export {
  getInfectedFiles,
  getScanSummary,
} from './virusScanUtils'

// Duplicate Checker
export {
  getCustomerFileHashes,
  checkDuplicateFile,
  checkDuplicateFiles,
  getUniqueFileName,
  checkSystemDuplicate,
  type ExistingFileHash,
  type DuplicateCheckResult,
  type SystemDuplicateResult,
} from './duplicateChecker'

// Types from userService for convenience
export type { StorageInfo } from '@/services/userService'

import { validateFiles, type ValidateFileOptions } from './validators'
import { checkStorageWithInfo, checkStorageQuota } from './storageChecker'
import { getMyStorageInfo, type StorageInfo } from '@/services/userService'
import { errorReporter } from '@/shared/lib/errorReporter'
import type {
  ValidationPipelineResult,
  ValidationPipelineOptions,
} from './types'

/**
 * 스토리지 검사 포함 파일 검증 파이프라인
 * @param files 검증할 파일 배열
 * @param options 검증 옵션
 * @returns Promise<ValidationPipelineResult>
 */
export async function validateFilesWithStorage(
  files: File[],
  options: ValidationPipelineOptions & ValidateFileOptions = {}
): Promise<ValidationPipelineResult> {
  const { checkStorage = true, checkMimeType = true, onProgress } = options

  // 1. 기본 검증 (확장자, 크기, MIME)
  onProgress?.('파일 검증', 0, files.length)
  const { validFiles, invalidFiles } = validateFiles(files, { checkMimeType })
  onProgress?.('파일 검증', files.length, files.length)

  // 2. 스토리지 검사 (옵션)
  let storageCheck = null
  if (checkStorage && validFiles.length > 0) {
    onProgress?.('스토리지 검사', 0, 1)
    try {
      storageCheck = await checkStorageQuota(validFiles)
    } catch (error) {
      console.error('스토리지 검사 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'fileValidation.validateFilesWithStorage' })
      // 스토리지 검사 실패 시에도 계속 진행
      // (서버에서 최종 검증)
    }
    onProgress?.('스토리지 검사', 1, 1)
  }

  return {
    validFiles,
    invalidFiles,
    storageCheck,
  }
}

/**
 * 이미 가져온 스토리지 정보로 파일 검증 파이프라인 실행
 * (API 호출 없이 검증)
 * @param files 검증할 파일 배열
 * @param storageInfo 스토리지 정보
 * @param options 검증 옵션
 * @returns ValidationPipelineResult
 */
export function validateFilesSync(
  files: File[],
  storageInfo: StorageInfo | null,
  options: ValidateFileOptions = {}
): ValidationPipelineResult {
  const { checkMimeType = true } = options

  // 1. 기본 검증
  const { validFiles, invalidFiles } = validateFiles(files, { checkMimeType })

  // 2. 스토리지 검사
  let storageCheck = null
  if (storageInfo && validFiles.length > 0) {
    storageCheck = checkStorageWithInfo(validFiles, storageInfo)
  }

  return {
    validFiles,
    invalidFiles,
    storageCheck,
  }
}
