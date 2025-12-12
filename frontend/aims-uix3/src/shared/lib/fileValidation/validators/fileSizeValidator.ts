/**
 * 파일 크기 검증
 * @since 2025-12-13
 * @version 1.0.0
 */

import { FILE_SIZE_LIMITS, formatFileSize } from '../constants'
import type { FileValidationResult } from '../types'

/**
 * 파일 크기가 유효한지 확인 (50MB 제한)
 * @param sizeInBytes 파일 크기 (바이트)
 * @returns 유효하면 true
 */
export function isFileSizeValid(sizeInBytes: number): boolean {
  return sizeInBytes > 0 && sizeInBytes <= FILE_SIZE_LIMITS.MAX_SINGLE_FILE
}

/**
 * 파일 크기 검증
 * @param file File 객체
 * @returns FileValidationResult
 */
export function validateFileSize(file: File): FileValidationResult {
  // 0바이트 파일 체크
  if (file.size === 0) {
    return {
      valid: false,
      file,
      reason: 'size_exceeded',
      message: '빈 파일은 업로드할 수 없습니다',
    }
  }

  // 최대 크기 체크
  if (!isFileSizeValid(file.size)) {
    const maxSizeMB = FILE_SIZE_LIMITS.MAX_SINGLE_FILE / (1024 * 1024)
    const fileSizeFormatted = formatFileSize(file.size)
    return {
      valid: false,
      file,
      reason: 'size_exceeded',
      message: `파일 크기(${fileSizeFormatted})가 제한(${maxSizeMB}MB)을 초과합니다`,
    }
  }

  return { valid: true, file }
}
