/**
 * 파일 검증 유틸리티
 * @since 2025-12-05
 * @version 2.0.0 - 공통 모듈 사용으로 전환 (2025-12-14)
 *
 * 🔴 버그 수정: MIME 타입 검증 누락
 * - 기존: 확장자 + 크기만 검증 (MIME 검증 없음)
 * - 수정: 공통 모듈 사용으로 확장자 + 크기 + MIME 검증 포함
 */

import { FILE_SIZE_LIMITS, type FileValidationResult } from '../types'
import {
  validateFile as validateFileCommon,
  BLOCKED_EXTENSIONS as BLOCKED_EXTENSIONS_COMMON,
  ALLOWED_DOCUMENT_EXTENSIONS as ALLOWED_DOCUMENT_EXTENSIONS_COMMON,
  getFileExtension as getFileExtensionCommon,
  isBlockedExtension as isBlockedExtensionCommon,
  isFileSizeValid as isFileSizeValidCommon,
} from '@/shared/lib/fileValidation'

// 공통 모듈에서 re-export (하위 호환성 유지)
export const BLOCKED_EXTENSIONS = BLOCKED_EXTENSIONS_COMMON
export const ALLOWED_DOCUMENT_EXTENSIONS = ALLOWED_DOCUMENT_EXTENSIONS_COMMON
export const getFileExtension = getFileExtensionCommon
export const isBlockedExtension = isBlockedExtensionCommon
export const isFileSizeValid = isFileSizeValidCommon

/**
 * 배치 총 크기가 등급별 한도 내인지 확인
 * @param totalBytes 배치 총 크기 (바이트)
 * @param tierLimit 등급별 배치 업로드 한도 (바이트)
 * @returns 유효하면 true
 */
export function isBatchSizeValid(totalBytes: number, tierLimit: number): boolean {
  return totalBytes > 0 && totalBytes <= tierLimit
}

/**
 * 단일 파일 검증 (공통 모듈 사용)
 * - 확장자 검증 (위험 확장자 차단)
 * - 파일 크기 검증 (50MB)
 * - MIME 타입 검증 (확장자 위조 탐지) ← 추가됨!
 *
 * @param file File 객체
 * @returns FileValidationResult
 */
export function validateFile(file: File): FileValidationResult {
  // 공통 모듈 사용 (확장자 + 크기 + MIME 검증 포함)
  const result = validateFileCommon(file)

  // 타입 변환 (공통 모듈의 reason 타입이 더 넓음)
  if (!result.valid) {
    return {
      valid: false,
      file: result.file,
      reason: result.reason as FileValidationResult['reason'],
      message: result.message,
    }
  }

  return { valid: true, file: result.file }
}

/**
 * 배치 파일 목록 검증
 * @param files File 배열
 * @param tierLimit 등급별 배치 업로드 한도 (바이트)
 * @returns 유효한 파일과 무효한 파일을 분리한 결과
 */
export function validateBatch(
  files: File[],
  tierLimit: number
): {
  validFiles: File[]
  invalidFiles: FileValidationResult[]
  totalValidSize: number
  isBatchSizeExceeded: boolean
} {
  const validFiles: File[] = []
  const invalidFiles: FileValidationResult[] = []
  let totalValidSize = 0

  for (const file of files) {
    const result = validateFile(file)
    if (result.valid) {
      validFiles.push(file)
      totalValidSize += file.size
    } else {
      invalidFiles.push(result)
    }
  }

  const isBatchSizeExceeded = !isBatchSizeValid(totalValidSize, tierLimit)

  return {
    validFiles,
    invalidFiles,
    totalValidSize,
    isBatchSizeExceeded,
  }
}

/**
 * 파일 크기를 사람이 읽기 좋은 형식으로 변환
 * @param bytes 바이트 크기
 * @returns 포맷된 문자열 (예: "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}
