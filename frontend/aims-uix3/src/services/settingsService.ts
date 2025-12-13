/**
 * AIMS UIX-3 Settings Service
 * @since 2025-12-13
 * @version 1.0.0
 *
 * 시스템 설정 관리 서비스
 * - 파일 검증 설정 (확장자, 크기, MIME, 스토리지, 중복, 바이러스)
 */

import { api } from '@/shared/lib/api'

// ============================================
// 타입 정의
// ============================================

/**
 * 확장자 검증 설정
 */
export interface ExtensionValidationSettings {
  enabled: boolean
  blockedExtensions: string[]
  description: string
}

/**
 * 파일 크기 검증 설정
 */
export interface FileSizeValidationSettings {
  enabled: boolean
  maxSizeBytes: number
  maxSizeMB: number
  description: string
}

/**
 * MIME 타입 검증 설정
 */
export interface MimeTypeValidationSettings {
  enabled: boolean
  description: string
}

/**
 * 스토리지 용량 검사 설정
 */
export interface StorageQuotaValidationSettings {
  enabled: boolean
  description: string
}

/**
 * 중복 파일 검사 설정
 */
export interface DuplicateValidationSettings {
  enabled: boolean
  description: string
}

/**
 * 바이러스 검사 설정
 */
export interface VirusScanValidationSettings {
  enabled: boolean
  timeoutMs: number
  description: string
}

/**
 * 전체 파일 검증 설정
 */
export interface FileValidationSettings {
  extensionValidation: ExtensionValidationSettings
  fileSizeValidation: FileSizeValidationSettings
  mimeTypeValidation: MimeTypeValidationSettings
  storageQuotaValidation: StorageQuotaValidationSettings
  duplicateValidation: DuplicateValidationSettings
  virusScanValidation: VirusScanValidationSettings
  updatedAt?: string
  updatedBy?: string
}

/**
 * API 응답 타입
 */
interface SettingsApiResponse<T> {
  success: boolean
  data: T
  message?: string
  error?: string
}

// ============================================
// API 함수
// ============================================

/**
 * 파일 검증 설정 조회
 * @returns FileValidationSettings
 */
export async function getFileValidationSettings(): Promise<FileValidationSettings> {
  const response = await api.get<SettingsApiResponse<FileValidationSettings>>(
    '/api/settings/file-validation'
  )

  if (!response.success) {
    throw new Error(response.error || '설정 조회 실패')
  }

  return response.data
}

/**
 * 파일 검증 설정 수정 (Admin 전용)
 * @param updates 수정할 설정
 * @returns 업데이트된 설정
 */
export async function updateFileValidationSettings(
  updates: Partial<FileValidationSettings>
): Promise<FileValidationSettings> {
  const response = await api.put<SettingsApiResponse<FileValidationSettings>>(
    '/api/settings/file-validation',
    updates
  )

  if (!response.success) {
    throw new Error(response.error || '설정 저장 실패')
  }

  return response.data
}

/**
 * 파일 검증 설정 초기화 (Admin 전용)
 * @returns 기본 설정
 */
export async function resetFileValidationSettings(): Promise<FileValidationSettings> {
  const response = await api.post<SettingsApiResponse<FileValidationSettings>>(
    '/api/settings/file-validation/reset'
  )

  if (!response.success) {
    throw new Error(response.error || '설정 초기화 실패')
  }

  return response.data
}

/**
 * 기본 파일 검증 설정 조회
 * @returns 기본 설정
 */
export async function getDefaultFileValidationSettings(): Promise<FileValidationSettings> {
  const response = await api.get<SettingsApiResponse<FileValidationSettings>>(
    '/api/settings/file-validation/defaults'
  )

  if (!response.success) {
    throw new Error(response.error || '기본 설정 조회 실패')
  }

  return response.data
}

// ============================================
// 캐싱 (설정은 자주 변경되지 않으므로)
// ============================================

let cachedSettings: FileValidationSettings | null = null
let cacheTimestamp = 0
const CACHE_TTL = 60000 // 1분

/**
 * 캐시된 파일 검증 설정 조회
 * 1분 이내에 조회한 설정이 있으면 캐시 반환
 */
export async function getCachedFileValidationSettings(): Promise<FileValidationSettings> {
  const now = Date.now()

  if (cachedSettings && now - cacheTimestamp < CACHE_TTL) {
    return cachedSettings
  }

  cachedSettings = await getFileValidationSettings()
  cacheTimestamp = now

  return cachedSettings
}

/**
 * 설정 캐시 무효화
 */
export function invalidateSettingsCache(): void {
  cachedSettings = null
  cacheTimestamp = 0
}
