/**
 * 파일 검증 상수 정의
 * @since 2025-12-13
 * @version 1.1.0
 */

import sharedConstants from '../../../../../../shared/file-validation-constants.json'

/**
 * 차단 확장자 목록
 * 보안 위험이 있는 실행 파일, 스크립트, 라이브러리 등
 * @see shared/file-validation-constants.json
 */
export const BLOCKED_EXTENSIONS = sharedConstants.blockedExtensions as readonly string[]

/**
 * 시스템 파일명 목록
 * OS가 자동 생성하는 파일 (Thumbs.db, .DS_Store 등)
 * 폴더 드래그앤드롭 시 함께 업로드되는 것을 방지
 * @see shared/file-validation-constants.json
 */
export const SYSTEM_FILE_NAMES = sharedConstants.systemFileNames as readonly string[]

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
 * 파일 크기 제한
 * Phase 1: 개별 파일 크기 제한 없음 — 사용자별 저장 용량 쿼터로 관리
 */
export const FILE_SIZE_LIMITS = {} as const

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

/**
 * 확장자-MIME 타입 매핑
 * 확장자 위조 탐지에 사용
 */
export const EXTENSION_MIME_MAP: Record<string, string[]> = {
  // 문서
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ppt: ['application/vnd.ms-powerpoint'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  hwp: ['application/x-hwp', 'application/haansofthwp', 'application/vnd.hancom.hwp'],
  hwpx: ['application/hwp+zip', 'application/vnd.hancom.hwpx'],
  txt: ['text/plain'],
  rtf: ['application/rtf', 'text/rtf'],
  odt: ['application/vnd.oasis.opendocument.text'],
  ods: ['application/vnd.oasis.opendocument.spreadsheet'],
  odp: ['application/vnd.oasis.opendocument.presentation'],
  csv: ['text/csv', 'text/plain'],
  // 이미지
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  gif: ['image/gif'],
  bmp: ['image/bmp', 'image/x-ms-bmp'],
  tiff: ['image/tiff'],
  tif: ['image/tiff'],
  webp: ['image/webp'],
  svg: ['image/svg+xml'],
  // 압축 파일
  zip: ['application/zip', 'application/x-zip-compressed'],
  rar: ['application/vnd.rar', 'application/x-rar-compressed'],
  '7z': ['application/x-7z-compressed'],
  tar: ['application/x-tar'],
  gz: ['application/gzip', 'application/x-gzip'],
} as const

/**
 * 위험한 MIME 타입 목록
 * 이 MIME 타입의 파일은 확장자와 관계없이 차단
 * @see shared/file-validation-constants.json
 */
export const DANGEROUS_MIME_TYPES = sharedConstants.dangerousMimeTypes as readonly string[]
