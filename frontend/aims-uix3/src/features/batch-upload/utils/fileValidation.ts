/**
 * 파일 검증 유틸리티
 * @since 2025-12-05
 * @version 1.0.0
 */

import { FILE_SIZE_LIMITS, type FileValidationResult } from '../types'

/**
 * 차단 확장자 목록
 * 보안 위험이 있는 실행 파일, 스크립트, 라이브러리 등
 */
export const BLOCKED_EXTENSIONS = [
  // 실행 파일
  'exe', 'com', 'bat', 'cmd', 'msi', 'scr',
  // 스크립트
  'vbs', 'vbe', 'js', 'jse', 'ws', 'wsf', 'wsc', 'wsh',
  'ps1', 'ps1xml', 'ps2', 'ps2xml', 'psc1', 'psc2',
  // 라이브러리
  'dll', 'sys', 'drv',
  // 기타 위험 파일
  'lnk', 'pif', 'application', 'gadget', 'hta', 'cpl',
  'msc', 'jar', 'reg',
] as const

/**
 * 허용되는 일반 문서 확장자 (참고용)
 */
export const ALLOWED_DOCUMENT_EXTENSIONS = [
  // 문서
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'hwp', 'hwpx', 'txt', 'rtf', 'odt', 'ods', 'odp',
  // 이미지
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'tif', 'webp', 'svg',
  // 압축 파일
  'zip', 'rar', '7z', 'tar', 'gz',
] as const

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
 * 파일 크기가 유효한지 확인 (50MB 제한)
 * @param sizeInBytes 파일 크기 (바이트)
 * @returns 유효하면 true
 */
export function isFileSizeValid(sizeInBytes: number): boolean {
  return sizeInBytes > 0 && sizeInBytes <= FILE_SIZE_LIMITS.MAX_SINGLE_FILE
}

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
 * 단일 파일 검증
 * @param file File 객체
 * @returns FileValidationResult
 */
export function validateFile(file: File): FileValidationResult {
  // 1. 차단 확장자 검사
  if (isBlockedExtension(file.name)) {
    const ext = getFileExtension(file.name)
    return {
      valid: false,
      file,
      reason: 'blocked_extension',
      message: `차단된 확장자입니다: .${ext}`,
    }
  }

  // 2. 파일 크기 검사 (50MB)
  if (!isFileSizeValid(file.size)) {
    const maxSizeMB = FILE_SIZE_LIMITS.MAX_SINGLE_FILE / (1024 * 1024)
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1)
    return {
      valid: false,
      file,
      reason: 'size_exceeded',
      message: `파일 크기(${fileSizeMB}MB)가 제한(${maxSizeMB}MB)을 초과합니다`,
    }
  }

  return { valid: true, file }
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
