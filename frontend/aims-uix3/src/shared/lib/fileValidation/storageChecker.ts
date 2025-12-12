/**
 * 스토리지 용량 검사 모듈
 * @since 2025-12-13
 * @version 1.0.0
 */

import { getMyStorageInfo, type StorageInfo } from '@/services/userService'
import type { StorageCheckResult } from './types'

/**
 * 일부 업로드 가능한 파일 계산 (크기 작은 순)
 * @param files 파일 배열
 * @param remainingBytes 남은 용량 (바이트)
 * @returns 일부 업로드 가능 정보 또는 null
 */
export function calculatePartialUpload(
  files: File[],
  remainingBytes: number
): { fileCount: number; totalSize: number; files: File[] } | null {
  if (remainingBytes <= 0) {
    return null
  }

  // 크기 작은 순으로 정렬
  const sorted = [...files].sort((a, b) => a.size - b.size)
  const fittingFiles: File[] = []
  let totalSize = 0

  for (const file of sorted) {
    if (totalSize + file.size <= remainingBytes) {
      fittingFiles.push(file)
      totalSize += file.size
    }
  }

  return fittingFiles.length > 0
    ? { fileCount: fittingFiles.length, totalSize, files: fittingFiles }
    : null
}

/**
 * 스토리지 정보와 파일 목록으로 용량 검사
 * (이미 스토리지 정보를 가져온 경우 사용)
 * @param files 업로드할 파일 배열
 * @param storageInfo 스토리지 정보
 * @returns StorageCheckResult
 */
export function checkStorageWithInfo(
  files: File[],
  storageInfo: StorageInfo
): StorageCheckResult {
  const requestedBytes = files.reduce((sum, f) => sum + f.size, 0)
  const remainingBytes = storageInfo.remaining_bytes

  // 무제한 사용자는 항상 통과
  if (storageInfo.is_unlimited) {
    return {
      canUpload: true,
      isUnlimited: true,
      usedBytes: storageInfo.used_bytes,
      maxBytes: storageInfo.quota_bytes,
      remainingBytes,
      requestedBytes,
      partialUploadInfo: null,
    }
  }

  // 용량 내 업로드 가능
  if (requestedBytes <= remainingBytes) {
    return {
      canUpload: true,
      isUnlimited: false,
      usedBytes: storageInfo.used_bytes,
      maxBytes: storageInfo.quota_bytes,
      remainingBytes,
      requestedBytes,
      partialUploadInfo: null,
    }
  }

  // 용량 초과 - 일부 업로드 계산
  const partialInfo = calculatePartialUpload(files, remainingBytes)

  return {
    canUpload: false,
    isUnlimited: false,
    usedBytes: storageInfo.used_bytes,
    maxBytes: storageInfo.quota_bytes,
    remainingBytes,
    requestedBytes,
    partialUploadInfo: partialInfo,
  }
}

/**
 * 스토리지 용량 검사 (API 호출 포함)
 * @param files 업로드할 파일 배열
 * @returns Promise<StorageCheckResult>
 * @throws API 호출 실패 시 에러
 */
export async function checkStorageQuota(files: File[]): Promise<StorageCheckResult> {
  const storageInfo = await getMyStorageInfo()
  return checkStorageWithInfo(files, storageInfo)
}

/**
 * 스토리지 용량 검사 결과를 사용자 친화적 메시지로 변환
 * @param result StorageCheckResult
 * @returns 메시지 문자열
 */
export function formatStorageCheckMessage(result: StorageCheckResult): string {
  if (result.canUpload) {
    return '업로드 가능합니다.'
  }

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)}KB`
    }
    return `${bytes}B`
  }

  const requested = formatSize(result.requestedBytes)
  const remaining = formatSize(result.remainingBytes)
  const over = formatSize(result.requestedBytes - result.remainingBytes)

  if (result.partialUploadInfo) {
    const partialSize = formatSize(result.partialUploadInfo.totalSize)
    return `스토리지 용량 초과: ${requested} 요청, ${remaining} 남음 (${over} 초과). ` +
      `${result.partialUploadInfo.fileCount}개 파일(${partialSize})만 업로드 가능합니다.`
  }

  return `스토리지 용량 초과: ${requested} 요청, ${remaining} 남음 (${over} 초과). 업로드할 수 없습니다.`
}
