/**
 * 파일 확장자 검증
 * @since 2025-12-13
 * @version 1.0.0
 */

import { BLOCKED_EXTENSIONS } from '../constants'
import type { FileValidationResult } from '../types'

/**
 * 파일명에서 확장자 추출
 * @param filename 파일명
 * @returns 소문자 확장자 (확장자 없으면 빈 문자열)
 */
export function getFileExtension(filename: string): string {
  const trimmed = filename.trim()
  const lastDot = trimmed.lastIndexOf('.')
  if (lastDot === -1 || lastDot === trimmed.length - 1) {
    return ''
  }
  return trimmed.slice(lastDot + 1).toLowerCase()
}

/**
 * 차단된 확장자인지 확인
 * @param filename 파일명
 * @returns 차단된 확장자면 true
 */
export function isBlockedExtension(filename: string): boolean {
  const ext = getFileExtension(filename)
  if (!ext) return false
  return (BLOCKED_EXTENSIONS as readonly string[]).includes(ext)
}

/**
 * 파일 확장자 검증
 * @param file File 객체
 * @returns FileValidationResult
 */
export function validateExtension(file: File): FileValidationResult {
  if (isBlockedExtension(file.name)) {
    const ext = getFileExtension(file.name)
    return {
      valid: false,
      file,
      reason: 'blocked_extension',
      message: `차단된 확장자입니다: .${ext}`,
    }
  }

  return { valid: true, file }
}
