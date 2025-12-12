/**
 * 파일 검증 상수 정의
 * @since 2025-12-13
 * @version 1.0.0
 */

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
 * 파일 크기 제한
 */
export const FILE_SIZE_LIMITS = {
  /** 단일 파일 최대 크기: 50MB */
  MAX_SINGLE_FILE: 50 * 1024 * 1024,
} as const

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
 */
export const DANGEROUS_MIME_TYPES = [
  // 실행 파일
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-dosexec',
  'application/x-ms-dos-executable',
  'application/vnd.microsoft.portable-executable',
  // 스크립트
  'application/x-msi',
  'application/x-bat',
  'application/x-sh',
  'application/x-csh',
  // Java
  'application/java-archive',
  'application/x-java-archive',
  // DLL/라이브러리
  'application/x-sharedlib',
] as const
