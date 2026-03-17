/**
 * 파일 확장자 검증
 * @since 2025-12-13
 * @version 1.0.0
 */

import { BLOCKED_EXTENSIONS, SYSTEM_FILE_NAMES } from '../constants'
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
 * 시스템 파일명인지 확인
 * OS가 자동 생성하는 파일 (Thumbs.db, .DS_Store 등)
 * @param filename 파일명
 * @returns 시스템 파일이면 true
 */
export function isSystemFileName(filename: string): boolean {
  const trimmed = filename.trim()
  // 경로 구분자가 포함된 경우 파일명만 추출
  const basename = trimmed.split(/[/\\]/).pop() || trimmed
  // Office 임시 잠금 파일 (~$*.xlsx, ~$*.docx 등)
  if (basename.startsWith('~$')) return true
  return (SYSTEM_FILE_NAMES as readonly string[]).includes(basename)
}

/**
 * 파일 확장자 검증
 * @param file File 객체
 * @returns FileValidationResult
 */
export function validateExtension(file: File): FileValidationResult {
  // 시스템 파일 체크 (Thumbs.db, .DS_Store 등)
  if (isSystemFileName(file.name)) {
    const basename = file.name.split(/[/\\]/).pop() || file.name
    return {
      valid: false,
      file,
      reason: 'system_file',
      message: basename.startsWith('~$')
        ? `편집 중 자동 생성된 파일입니다: ${file.name}`
        : `시스템 파일입니다: ${file.name}`,
    }
  }

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
