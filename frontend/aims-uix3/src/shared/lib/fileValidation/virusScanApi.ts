/**
 * ClamAV 바이러스 검사 API 클라이언트
 * @since 2025-12-13
 * @version 1.1.0
 *
 * 서버에서 ClamAV를 사용한 바이러스 검사 수행
 * Admin 설정에서 바이러스 검사 비활성화 가능
 */

import { api } from '@/shared/lib/api'
import type { VirusScanResult } from './types'
import { isVirusScanEnabled, loadFileValidationSettings, isSettingsLoaded } from './settingsAdapter'

/**
 * 설정이 로드되었는지 확인하고, 안 되었으면 로드
 * @returns Promise<void>
 */
async function ensureSettingsLoaded(): Promise<void> {
  if (!isSettingsLoaded()) {
    await loadFileValidationSettings()
  }
}

// Re-export utility functions
export { getInfectedFiles, getScanSummary } from './virusScanUtils'

/**
 * ClamAV 스캔 상태 응답
 */
interface ScanStatusResponse {
  enabled: boolean
  available: boolean
  version?: string
  dbVersion?: number
  fullVersion?: string
  error?: string
  message?: string
}

/**
 * 파일 스캔 응답
 */
interface ScanFileResponse {
  infected: boolean
  virusName?: string
  fileName?: string
  fileSize?: number
  skipped?: boolean
  message?: string
  error?: string
}

// 캐시된 스캔 상태 (API 호출 최소화)
let cachedScanStatus: ScanStatusResponse | null = null
let lastStatusCheck = 0
const STATUS_CACHE_TTL = 60000 // 1분

/**
 * ClamAV 바이러스 검사 활성화 상태 확인
 * @returns Promise<ScanStatusResponse>
 */
export async function getScanStatus(): Promise<ScanStatusResponse> {
  const now = Date.now()

  // 캐시된 상태가 있고 유효하면 반환
  if (cachedScanStatus && now - lastStatusCheck < STATUS_CACHE_TTL) {
    return cachedScanStatus
  }

  try {
    const response = await api.get<{ success: boolean; data: ScanStatusResponse }>(
      '/api/security/scan-status',
      { timeout: 5000 } // 5초 타임아웃 - 서버 응답 없으면 검사 건너뛰기
    )

    if (response.success) {
      cachedScanStatus = response.data
      lastStatusCheck = now
      return response.data
    }

    return { enabled: false, available: false, error: 'API 응답 실패' }
  } catch (error) {
    // 서버 응답 없으면 검사 비활성화로 처리 (업로드 진행)
    console.warn('[VirusScan] 서버 응답 없음 - 검사 건너뛰기:', error)
    return { enabled: false, available: false, error: String(error) }
  }
}

/**
 * ClamAV 사용 가능 여부 확인
 * Admin 설정에서 비활성화된 경우 false 반환
 * @returns Promise<boolean>
 */
export async function isScanAvailable(): Promise<boolean> {
  // 0. 설정 로드 확인
  await ensureSettingsLoaded()

  // 1. Admin 설정에서 비활성화된 경우 바로 false 반환
  if (!isVirusScanEnabled()) {
    console.log('[VirusScan] Admin 설정에서 바이러스 검사 비활성화됨')
    return false
  }

  // 2. ClamAV 서버 상태 확인
  const status = await getScanStatus()
  return status.enabled && status.available
}

/**
 * 단일 파일 바이러스 검사
 * @param file File 객체
 * @returns Promise<VirusScanResult>
 */
export async function scanFile(file: File): Promise<VirusScanResult> {
  try {
    // 0. 설정 로드 확인
    await ensureSettingsLoaded()

    // 1. Admin 설정에서 비활성화된 경우 스킵
    if (!isVirusScanEnabled()) {
      return {
        scanned: false,
        infected: false,
        skipped: true,
        message: 'Admin 설정에서 바이러스 검사가 비활성화되어 있습니다.',
      }
    }

    // 2. ClamAV 서버 상태 확인
    const status = await getScanStatus()

    if (!status.enabled) {
      return {
        scanned: false,
        infected: false,
        skipped: true,
        message: 'ClamAV가 비활성화되어 있습니다.',
      }
    }

    if (!status.available) {
      return {
        scanned: false,
        infected: false,
        skipped: true,
        message: 'ClamAV 서비스를 사용할 수 없습니다.',
      }
    }

    // FormData로 파일 전송
    const formData = new FormData()
    formData.append('file', file)

    const response = await api.post<{ success: boolean; data: ScanFileResponse }>(
      '/api/security/scan-file',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 10000, // 10초 타임아웃 (응답 없으면 건너뛰기)
      }
    )

    if (response.success) {
      const { infected, virusName, skipped, message, error } = response.data

      if (skipped) {
        return {
          scanned: false,
          infected: false,
          skipped: true,
          message: message || '검사가 건너뛰어졌습니다.',
        }
      }

      return {
        scanned: true,
        infected,
        virusName,
        error,
      }
    }

    return {
      scanned: false,
      infected: false,
      error: 'API 응답 실패',
    }
  } catch (error) {
    console.error('바이러스 검사 실패:', error)
    return {
      scanned: false,
      infected: false,
      error: String(error),
    }
  }
}

/**
 * 여러 파일 바이러스 검사
 * @param files File 배열
 * @param onProgress 진행률 콜백 (선택)
 * @returns Promise<Map<File, VirusScanResult>>
 */
export async function scanFiles(
  files: File[],
  onProgress?: (scanned: number, total: number) => void
): Promise<Map<File, VirusScanResult>> {
  const results = new Map<File, VirusScanResult>()

  // 0. 설정 로드 확인
  await ensureSettingsLoaded()

  // 1. Admin 설정에서 비활성화된 경우 모든 파일 스킵
  if (!isVirusScanEnabled()) {
    for (const file of files) {
      results.set(file, {
        scanned: false,
        infected: false,
        skipped: true,
        message: 'Admin 설정에서 바이러스 검사가 비활성화되어 있습니다.',
      })
    }
    return results
  }

  // 2. ClamAV 서버 상태 확인
  const status = await getScanStatus()

  if (!status.enabled || !status.available) {
    // 모든 파일을 스킵 처리
    for (const file of files) {
      results.set(file, {
        scanned: false,
        infected: false,
        skipped: true,
        message: !status.enabled
          ? 'ClamAV가 비활성화되어 있습니다.'
          : 'ClamAV 서비스를 사용할 수 없습니다.',
      })
    }
    return results
  }

  // 파일별로 순차 검사 (서버 부하 방지)
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const result = await scanFile(file)
    results.set(file, result)

    onProgress?.(i + 1, files.length)

    // 감염된 파일 발견 시 로그
    if (result.infected) {
      console.warn(`⚠️ 바이러스 감지: ${file.name} - ${result.virusName}`)
    }
  }

  return results
}
