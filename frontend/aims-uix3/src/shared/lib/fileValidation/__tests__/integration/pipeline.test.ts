/**
 * 파이프라인 통합 테스트
 * validateFilesSync 전체 검증 테스트
 * @since 2025-12-13
 */

import { describe, it, expect } from 'vitest'
import { validateFilesSync } from '../../index'
import type { StorageInfo } from '@/services/userService'

// 테스트용 File 객체 생성 헬퍼
const createMockFile = (
  name: string,
  size: number,
  mimeType: string = 'application/octet-stream'
): File => {
  const file = new File([''], name, { type: mimeType })
  Object.defineProperty(file, 'size', { value: size, writable: false })
  return file
}

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

describe('validateFilesSync 통합 파이프라인', () => {
  describe('정상 시나리오', () => {
    it('모든 검증 통과', () => {
      const files = [
        createMockFile('doc1.pdf', 1024 * 1024, 'application/pdf'),
        createMockFile('image.jpg', 2 * 1024 * 1024, 'image/jpeg'),
      ]
      const storage = createStorageInfo(100 * 1024 * 1024, 1000 * 1024 * 1024)

      const result = validateFilesSync(files, storage)

      expect(result.validFiles).toHaveLength(2)
      expect(result.invalidFiles).toHaveLength(0)
      expect(result.storageCheck?.canUpload).toBe(true)
    })

    it('스토리지 정보 없이 검증', () => {
      const files = [
        createMockFile('doc.pdf', 1024 * 1024, 'application/pdf'),
      ]

      const result = validateFilesSync(files, null)

      expect(result.validFiles).toHaveLength(1)
      expect(result.storageCheck).toBeNull()
    })

    it('무제한 사용자', () => {
      // 50MB 제한 내의 파일로 테스트 (파일 크기 검증은 별도)
      const files = [
        createMockFile('large.pdf', 40 * 1024 * 1024, 'application/pdf'), // 40MB
      ]
      const storage = createStorageInfo(0, 10 * 1024 * 1024, true) // quota < file size but unlimited

      const result = validateFilesSync(files, storage)

      expect(result.validFiles).toHaveLength(1)
      expect(result.storageCheck?.canUpload).toBe(true)
      expect(result.storageCheck?.isUnlimited).toBe(true)
    })
  })

  describe('파일 검증 실패 시나리오', () => {
    it('차단 확장자 파일 제외', () => {
      const files = [
        createMockFile('doc.pdf', 1024, 'application/pdf'),
        createMockFile('virus.exe', 1024, 'application/x-msdownload'),
        createMockFile('script.bat', 1024, 'text/plain'),
      ]
      const storage = createStorageInfo(0, 1000 * 1024 * 1024)

      const result = validateFilesSync(files, storage)

      expect(result.validFiles).toHaveLength(1)
      expect(result.invalidFiles).toHaveLength(2)
      expect(result.invalidFiles.every(f => f.reason === 'blocked_extension')).toBe(true)
    })

    it('큰 파일도 통과 (Phase 1: 크기 제한 없음)', () => {
      const files = [
        createMockFile('small.pdf', 1024, 'application/pdf'),
        createMockFile('huge.pdf', 51 * 1024 * 1024, 'application/pdf'), // > 50MB
      ]
      const storage = createStorageInfo(0, 1000 * 1024 * 1024)

      const result = validateFilesSync(files, storage)

      expect(result.validFiles).toHaveLength(2)
      expect(result.invalidFiles).toHaveLength(0)
    })

    it('MIME 타입 불일치 제외', () => {
      const files = [
        createMockFile('real.pdf', 1024, 'application/pdf'),
        createMockFile('fake.jpg', 1024, 'application/pdf'), // 위조
      ]
      const storage = createStorageInfo(0, 1000 * 1024 * 1024)

      const result = validateFilesSync(files, storage)

      expect(result.validFiles).toHaveLength(1)
      expect(result.invalidFiles).toHaveLength(1)
      expect(result.invalidFiles[0].reason).toBe('mime_mismatch')
    })

    it('MIME 검증 비활성화', () => {
      const files = [
        createMockFile('fake.jpg', 1024, 'application/pdf'), // 위조
      ]
      const storage = createStorageInfo(0, 1000 * 1024 * 1024)

      const result = validateFilesSync(files, storage, { checkMimeType: false })

      expect(result.validFiles).toHaveLength(1)
      expect(result.invalidFiles).toHaveLength(0)
    })

    it('모든 유형 혼합', () => {
      const files = [
        createMockFile('good.pdf', 1024, 'application/pdf'),
        createMockFile('virus.exe', 1024, 'application/x-msdownload'),
        createMockFile('huge.pdf', 100 * 1024 * 1024, 'application/pdf'), // Phase 1: 크기 제한 없음 → 유효
        createMockFile('fake.jpg', 1024, 'application/pdf'),
      ]
      const storage = createStorageInfo(0, 1000 * 1024 * 1024)

      const result = validateFilesSync(files, storage)

      expect(result.validFiles).toHaveLength(2) // good.pdf + huge.pdf
      expect(result.invalidFiles).toHaveLength(2) // virus.exe + fake.jpg
    })
  })

  describe('스토리지 초과 시나리오', () => {
    it('스토리지 용량 초과', () => {
      // 50MB 제한 내의 파일로 테스트
      const files = [
        createMockFile('doc.pdf', 20 * 1024 * 1024, 'application/pdf'), // 20MB
      ]
      // remaining: 10MB < 20MB requested
      const storage = createStorageInfo(90 * 1024 * 1024, 100 * 1024 * 1024)

      const result = validateFilesSync(files, storage)

      expect(result.validFiles).toHaveLength(1) // 파일 자체는 유효
      expect(result.storageCheck?.canUpload).toBe(false)
    })

    it('일부 업로드 가능', () => {
      // 50MB 제한 내의 파일로 테스트
      const files = [
        createMockFile('small.pdf', 5 * 1024 * 1024, 'application/pdf'),  // 5MB
        createMockFile('large.pdf', 15 * 1024 * 1024, 'application/pdf'), // 15MB
      ]
      // remaining: 10MB, small(5MB)만 업로드 가능
      const storage = createStorageInfo(90 * 1024 * 1024, 100 * 1024 * 1024)

      const result = validateFilesSync(files, storage)

      expect(result.storageCheck?.canUpload).toBe(false)
      expect(result.storageCheck?.partialUploadInfo).not.toBeNull()
      expect(result.storageCheck?.partialUploadInfo?.fileCount).toBe(1)
      expect(result.storageCheck?.partialUploadInfo?.files[0].name).toBe('small.pdf')
    })

    it('유효한 파일만 스토리지 검사', () => {
      // invalid 파일은 스토리지 계산에서 제외되어야 함
      const files = [
        createMockFile('small.pdf', 50 * 1024 * 1024, 'application/pdf'),
        createMockFile('virus.exe', 200 * 1024 * 1024, 'application/x-msdownload'),
      ]
      const storage = createStorageInfo(900 * 1024 * 1024, 1000 * 1024 * 1024) // remaining: 100MB

      const result = validateFilesSync(files, storage)

      // small.pdf만 유효하고 100MB 이내이므로 업로드 가능
      expect(result.validFiles).toHaveLength(1)
      expect(result.storageCheck?.canUpload).toBe(true)
      expect(result.storageCheck?.requestedBytes).toBe(50 * 1024 * 1024)
    })
  })

  describe('빈 배열 처리', () => {
    it('빈 파일 배열', () => {
      const storage = createStorageInfo(0, 1000 * 1024 * 1024)

      const result = validateFilesSync([], storage)

      expect(result.validFiles).toHaveLength(0)
      expect(result.invalidFiles).toHaveLength(0)
      expect(result.storageCheck).toBeNull() // 유효 파일 0개이므로 스토리지 검사 안함
    })

    it('모든 파일 무효', () => {
      const files = [
        createMockFile('virus.exe', 1024, 'application/x-msdownload'),
      ]
      const storage = createStorageInfo(0, 1000 * 1024 * 1024)

      const result = validateFilesSync(files, storage)

      expect(result.validFiles).toHaveLength(0)
      expect(result.storageCheck).toBeNull()
    })
  })
})
