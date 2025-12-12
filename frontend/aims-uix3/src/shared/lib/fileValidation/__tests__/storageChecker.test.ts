/**
 * 스토리지 검사 테스트
 * @since 2025-12-13
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  calculatePartialUpload,
  checkStorageWithInfo,
  formatStorageCheckMessage,
} from '../storageChecker'
import type { StorageInfo } from '@/services/userService'

// 테스트용 StorageInfo 생성 헬퍼
const createStorageInfo = (
  usedBytes: number,
  quotaBytes: number,
  isUnlimited: boolean = false
): StorageInfo => ({
  tierName: 'test',
  quota_bytes: quotaBytes,
  used_bytes: usedBytes,
  remaining_bytes: quotaBytes - usedBytes,
  usage_percent: (usedBytes / quotaBytes) * 100,
  is_unlimited: isUnlimited,
  has_ocr_permission: false,
  ocr_quota: 0,
  ocr_used_this_month: 0,
  ocr_remaining: 0,
  ocr_is_unlimited: false,
})

// 테스트용 File 객체 생성 헬퍼
const createMockFile = (name: string, size: number): File => {
  const file = new File([''], name, { type: 'application/octet-stream' })
  Object.defineProperty(file, 'size', { value: size, writable: false })
  return file
}

describe('calculatePartialUpload', () => {
  it('모든 파일 업로드 가능', () => {
    const files = [
      createMockFile('a.pdf', 100),
      createMockFile('b.pdf', 200),
      createMockFile('c.pdf', 300),
    ]
    const result = calculatePartialUpload(files, 1000)

    expect(result).not.toBeNull()
    expect(result!.fileCount).toBe(3)
    expect(result!.totalSize).toBe(600)
    expect(result!.files).toHaveLength(3)
  })

  it('일부 파일만 업로드 가능 (크기 작은 순)', () => {
    const files = [
      createMockFile('large.pdf', 500),
      createMockFile('small.pdf', 100),
      createMockFile('medium.pdf', 300),
    ]
    const result = calculatePartialUpload(files, 400)

    expect(result).not.toBeNull()
    expect(result!.fileCount).toBe(2) // small(100) + medium(300) = 400
    expect(result!.totalSize).toBe(400)
    expect(result!.files.map(f => f.name)).toContain('small.pdf')
    expect(result!.files.map(f => f.name)).toContain('medium.pdf')
  })

  it('가장 작은 파일도 업로드 불가', () => {
    const files = [
      createMockFile('large.pdf', 500),
      createMockFile('small.pdf', 200),
    ]
    const result = calculatePartialUpload(files, 100)

    expect(result).toBeNull()
  })

  it('남은 용량 0', () => {
    const files = [createMockFile('test.pdf', 100)]
    const result = calculatePartialUpload(files, 0)

    expect(result).toBeNull()
  })

  it('빈 파일 배열', () => {
    const result = calculatePartialUpload([], 1000)

    expect(result).toBeNull()
  })

  it('정확히 남은 용량만큼 업로드', () => {
    const files = [
      createMockFile('a.pdf', 500),
      createMockFile('b.pdf', 500),
    ]
    const result = calculatePartialUpload(files, 1000)

    expect(result).not.toBeNull()
    expect(result!.fileCount).toBe(2)
    expect(result!.totalSize).toBe(1000)
  })
})

describe('checkStorageWithInfo', () => {
  it('용량 내 업로드 - 성공', () => {
    const files = [
      createMockFile('a.pdf', 100 * 1024 * 1024), // 100MB
    ]
    const storage = createStorageInfo(
      100 * 1024 * 1024,   // used: 100MB
      500 * 1024 * 1024    // quota: 500MB (remaining: 400MB)
    )

    const result = checkStorageWithInfo(files, storage)

    expect(result.canUpload).toBe(true)
    expect(result.isUnlimited).toBe(false)
    expect(result.partialUploadInfo).toBeNull()
    expect(result.requestedBytes).toBe(100 * 1024 * 1024)
  })

  it('무제한 사용자 - 항상 성공', () => {
    const files = [
      createMockFile('huge.pdf', 10 * 1024 * 1024 * 1024), // 10GB
    ]
    const storage = createStorageInfo(0, 100 * 1024 * 1024, true) // unlimited

    const result = checkStorageWithInfo(files, storage)

    expect(result.canUpload).toBe(true)
    expect(result.isUnlimited).toBe(true)
    expect(result.partialUploadInfo).toBeNull()
  })

  it('용량 초과 - 일부 업로드 가능', () => {
    const files = [
      createMockFile('small.pdf', 100),
      createMockFile('large.pdf', 500),
    ]
    const storage = createStorageInfo(900, 1000) // remaining: 100

    const result = checkStorageWithInfo(files, storage)

    expect(result.canUpload).toBe(false)
    expect(result.isUnlimited).toBe(false)
    expect(result.partialUploadInfo).not.toBeNull()
    expect(result.partialUploadInfo!.fileCount).toBe(1)
    expect(result.partialUploadInfo!.files[0].name).toBe('small.pdf')
  })

  it('용량 초과 - 업로드 불가', () => {
    const files = [
      createMockFile('large.pdf', 500),
    ]
    const storage = createStorageInfo(900, 1000) // remaining: 100

    const result = checkStorageWithInfo(files, storage)

    expect(result.canUpload).toBe(false)
    expect(result.partialUploadInfo).toBeNull()
  })

  it('빈 파일 배열', () => {
    const storage = createStorageInfo(500, 1000)

    const result = checkStorageWithInfo([], storage)

    expect(result.canUpload).toBe(true)
    expect(result.requestedBytes).toBe(0)
  })
})

describe('formatStorageCheckMessage', () => {
  it('업로드 가능 메시지', () => {
    const result = {
      canUpload: true,
      isUnlimited: false,
      usedBytes: 100,
      maxBytes: 1000,
      remainingBytes: 900,
      requestedBytes: 100,
      partialUploadInfo: null,
    }

    expect(formatStorageCheckMessage(result)).toBe('업로드 가능합니다.')
  })

  it('용량 초과 - 일부 업로드 가능', () => {
    const result = {
      canUpload: false,
      isUnlimited: false,
      usedBytes: 900 * 1024 * 1024,
      maxBytes: 1000 * 1024 * 1024,
      remainingBytes: 100 * 1024 * 1024,
      requestedBytes: 200 * 1024 * 1024,
      partialUploadInfo: {
        fileCount: 2,
        totalSize: 80 * 1024 * 1024,
        files: [],
      },
    }

    const message = formatStorageCheckMessage(result)
    expect(message).toContain('용량 초과')
    expect(message).toContain('2개 파일')
  })

  it('용량 초과 - 업로드 불가', () => {
    const result = {
      canUpload: false,
      isUnlimited: false,
      usedBytes: 900,
      maxBytes: 1000,
      remainingBytes: 100,
      requestedBytes: 500,
      partialUploadInfo: null,
    }

    const message = formatStorageCheckMessage(result)
    expect(message).toContain('용량 초과')
    expect(message).toContain('업로드할 수 없습니다')
  })
})
