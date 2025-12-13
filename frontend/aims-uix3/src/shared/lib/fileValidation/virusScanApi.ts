/**
 * ClamAV 바이러스 검사 API 클라이언트
 * @since 2025-12-13
 * @version 1.2.0
 *
 * ⚠️ ClamAV 서비스 불안정으로 완전 비활성화됨
 */

import type { VirusScanResult } from './types'

// Re-export utility functions
export { getInfectedFiles, getScanSummary } from './virusScanUtils'

/**
 * ClamAV 사용 가능 여부 - 항상 false
 */
export async function isScanAvailable(): Promise<boolean> {
  return false
}

/**
 * 단일 파일 바이러스 검사 - 항상 스킵
 */
export async function scanFile(_file: File): Promise<VirusScanResult> {
  return {
    scanned: false,
    infected: false,
    skipped: true,
    message: 'ClamAV 비활성화됨',
  }
}

/**
 * 여러 파일 바이러스 검사 - 항상 스킵
 */
export async function scanFiles(
  files: File[],
  _onProgress?: (scanned: number, total: number) => void
): Promise<Map<File, VirusScanResult>> {
  const results = new Map<File, VirusScanResult>()
  for (const file of files) {
    results.set(file, {
      scanned: false,
      infected: false,
      skipped: true,
      message: 'ClamAV 비활성화됨',
    })
  }
  return results
}

/**
 * ClamAV 상태 확인 - 항상 비활성화
 */
export async function getScanStatus(): Promise<{ enabled: false; available: false }> {
  return { enabled: false, available: false }
}
