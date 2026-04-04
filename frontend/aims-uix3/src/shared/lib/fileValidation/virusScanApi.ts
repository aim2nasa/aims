/**
 * ClamAV 바이러스 검사 API 클라이언트
 * @since 2025-12-13
 * @version 1.2.0
 *
 * ⚠️ ClamAV 서비스 불안정으로 완전 비활성화됨
 */

import type { VirusScanResult } from './types'

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

