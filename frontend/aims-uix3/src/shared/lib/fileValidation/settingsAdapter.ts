/**
 * 파일 검증 설정 어댑터
 * @since 2025-12-13
 * @version 1.0.0
 *
 * 서버에서 가져온 설정을 파일 검증 모듈에 적용합니다.
 */

import {
  getCachedFileValidationSettings,
  invalidateSettingsCache,
  type FileValidationSettings,
} from '@/services/settingsService'
import { BLOCKED_EXTENSIONS, FILE_SIZE_LIMITS } from './constants'

// ============================================
// 로컬 설정 캐시
// ============================================

// 기본 설정 (서버 연결 실패 시 사용)
const DEFAULT_SETTINGS: FileValidationSettings = {
  extensionValidation: {
    enabled: true,
    blockedExtensions: [...BLOCKED_EXTENSIONS],
    description: '위험한 확장자 차단',
  },
  fileSizeValidation: {
    enabled: true,
    maxSizeBytes: FILE_SIZE_LIMITS.MAX_SINGLE_FILE,
    maxSizeMB: 50,
    description: '파일 크기 제한',
  },
  mimeTypeValidation: {
    enabled: true,
    description: 'MIME 타입 검증',
  },
  storageQuotaValidation: {
    enabled: true,
    description: '스토리지 용량 검사',
  },
  duplicateValidation: {
    enabled: true,
    description: '중복 파일 검사',
  },
  virusScanValidation: {
    enabled: true,
    timeoutMs: 10000,
    description: '바이러스 검사',
  },
}

// 로컬 캐시
let localSettings: FileValidationSettings = { ...DEFAULT_SETTINGS }
let settingsLoaded = false

// ============================================
// 설정 로드 함수
// ============================================

/**
 * 서버에서 설정 로드
 * 로그인 후 또는 앱 시작 시 호출
 */
export async function loadFileValidationSettings(): Promise<FileValidationSettings> {
  try {
    const settings = await getCachedFileValidationSettings()
    localSettings = settings
    settingsLoaded = true
    console.log('[FileValidation] 설정 로드 완료')
    return settings
  } catch (error) {
    console.warn('[FileValidation] 설정 로드 실패, 기본값 사용:', error)
    return localSettings
  }
}

/**
 * 설정 강제 새로고침
 */
export async function refreshFileValidationSettings(): Promise<FileValidationSettings> {
  invalidateSettingsCache()
  return loadFileValidationSettings()
}

// ============================================
// 설정 조회 함수 (동기)
// ============================================

/**
 * 현재 설정 조회 (캐시된 값)
 */
export function getSettings(): FileValidationSettings {
  return localSettings
}

/**
 * 확장자 검증 활성화 여부
 */
export function isExtensionValidationEnabled(): boolean {
  return localSettings.extensionValidation.enabled
}

/**
 * 차단된 확장자 목록
 */
export function getBlockedExtensions(): string[] {
  return localSettings.extensionValidation.blockedExtensions
}

/**
 * 파일 크기 검증 활성화 여부
 */
export function isFileSizeValidationEnabled(): boolean {
  return localSettings.fileSizeValidation.enabled
}

/**
 * 최대 파일 크기 (바이트)
 */
export function getMaxFileSize(): number {
  return localSettings.fileSizeValidation.maxSizeBytes
}

/**
 * MIME 타입 검증 활성화 여부
 */
export function isMimeTypeValidationEnabled(): boolean {
  return localSettings.mimeTypeValidation.enabled
}

/**
 * 스토리지 용량 검사 활성화 여부
 */
export function isStorageQuotaValidationEnabled(): boolean {
  return localSettings.storageQuotaValidation.enabled
}

/**
 * 중복 파일 검사 활성화 여부
 */
export function isDuplicateValidationEnabled(): boolean {
  return localSettings.duplicateValidation.enabled
}

/**
 * 바이러스 검사 활성화 여부
 */
export function isVirusScanEnabled(): boolean {
  return localSettings.virusScanValidation.enabled
}

/**
 * 바이러스 검사 타임아웃 (밀리초)
 */
export function getVirusScanTimeout(): number {
  return localSettings.virusScanValidation.timeoutMs
}

/**
 * 설정이 로드되었는지 여부
 */
export function isSettingsLoaded(): boolean {
  return settingsLoaded
}
