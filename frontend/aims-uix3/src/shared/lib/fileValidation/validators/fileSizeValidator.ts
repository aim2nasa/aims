/**
 * 파일 크기 검증
 * @since 2025-12-13
 * @version 2.0.0 - Phase 1: 개별 파일 크기 제한 제거, 0바이트만 검증
 */

import type { FileValidationResult } from '../types'

/**
 * 파일 크기가 유효한지 확인
 * Phase 1: 개별 파일 크기 제한 없음 — 0바이트(빈 파일)만 거부
 * @param sizeInBytes 파일 크기 (바이트)
 * @returns 유효하면 true
 */
export function isFileSizeValid(sizeInBytes: number): boolean {
  return sizeInBytes > 0
}

/**
 * 파일 크기 검증
 * Phase 1: 0바이트(빈 파일)만 거부. 크기 상한은 저장 용량 쿼터로 관리.
 * @param file File 객체
 * @returns FileValidationResult
 */
export function validateFileSize(file: File): FileValidationResult {
  if (file.size === 0) {
    return {
      valid: false,
      file,
      reason: 'size_exceeded',
      message: '빈 파일은 업로드할 수 없습니다',
    }
  }

  return { valid: true, file }
}
