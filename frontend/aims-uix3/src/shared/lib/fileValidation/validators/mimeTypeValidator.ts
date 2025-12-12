/**
 * MIME 타입 검증
 * 확장자 위조 탐지 및 위험 MIME 타입 차단
 * @since 2025-12-13
 * @version 1.0.0
 */

import { EXTENSION_MIME_MAP, DANGEROUS_MIME_TYPES } from '../constants'
import { getFileExtension } from './extensionValidator'
import type { FileValidationResult } from '../types'

/**
 * 위험한 MIME 타입인지 확인
 * @param mimeType MIME 타입 문자열
 * @returns 위험하면 true
 */
export function isDangerousMimeType(mimeType: string): boolean {
  const normalizedMime = mimeType.toLowerCase().trim()
  return DANGEROUS_MIME_TYPES.includes(normalizedMime as typeof DANGEROUS_MIME_TYPES[number])
}

/**
 * 확장자와 MIME 타입이 일치하는지 확인
 * @param extension 파일 확장자 (소문자, 점 제외)
 * @param mimeType MIME 타입 문자열
 * @returns 일치하면 true, 알 수 없는 확장자는 관대하게 true 반환
 */
export function isExtensionMimeMatch(extension: string, mimeType: string): boolean {
  const normalizedExt = extension.toLowerCase()
  const normalizedMime = mimeType.toLowerCase().trim()

  // 확장자가 없거나 매핑에 없으면 관대하게 통과
  if (!normalizedExt || !(normalizedExt in EXTENSION_MIME_MAP)) {
    return true
  }

  const allowedMimes = EXTENSION_MIME_MAP[normalizedExt as keyof typeof EXTENSION_MIME_MAP]

  // MIME 타입이 빈 문자열이거나 'application/octet-stream'이면 관대하게 통과
  // 브라우저가 MIME 타입을 알 수 없는 경우 이 값을 사용
  if (!normalizedMime || normalizedMime === 'application/octet-stream') {
    return true
  }

  return allowedMimes.includes(normalizedMime)
}

/**
 * MIME 타입 검증
 * @param file File 객체
 * @returns FileValidationResult
 */
export function validateMimeType(file: File): FileValidationResult {
  const mimeType = file.type
  const extension = getFileExtension(file.name)

  // 1. 위험한 MIME 타입 차단
  if (isDangerousMimeType(mimeType)) {
    return {
      valid: false,
      file,
      reason: 'mime_mismatch',
      message: `위험한 파일 형식입니다: ${mimeType}`,
    }
  }

  // 2. 확장자와 MIME 타입 불일치 확인 (위조 탐지)
  if (!isExtensionMimeMatch(extension, mimeType)) {
    const expectedMimes = EXTENSION_MIME_MAP[extension as keyof typeof EXTENSION_MIME_MAP]
    return {
      valid: false,
      file,
      reason: 'mime_mismatch',
      message: `파일 확장자(.${extension})와 실제 파일 형식(${mimeType})이 일치하지 않습니다. 예상: ${expectedMimes?.join(', ')}`,
    }
  }

  return { valid: true, file }
}
