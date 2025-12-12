/**
 * 바이러스 스캔 유틸리티 함수
 * @since 2025-12-13
 *
 * API 호출이 필요 없는 순수 유틸리티 함수들
 */

import type { VirusScanResult } from './types'

/**
 * 감염된 파일 필터링
 * @param scanResults scanFiles 결과
 * @returns 감염된 파일 목록
 */
export function getInfectedFiles(scanResults: Map<File, VirusScanResult>): File[] {
  const infected: File[] = []

  for (const [file, result] of scanResults) {
    if (result.infected) {
      infected.push(file)
    }
  }

  return infected
}

/**
 * 스캔 결과 요약 생성
 * @param scanResults scanFiles 결과
 */
export function getScanSummary(scanResults: Map<File, VirusScanResult>): {
  total: number
  scanned: number
  infected: number
  skipped: number
  errors: number
} {
  let scanned = 0
  let infected = 0
  let skipped = 0
  let errors = 0

  for (const result of scanResults.values()) {
    if (result.skipped) {
      skipped++
    } else if (result.error) {
      errors++
    } else if (result.scanned) {
      scanned++
      if (result.infected) {
        infected++
      }
    }
  }

  return {
    total: scanResults.size,
    scanned,
    infected,
    skipped,
    errors,
  }
}
