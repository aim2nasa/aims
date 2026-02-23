/**
 * 티어 권한 철칙 검증 테스트 (Frontend)
 * @since 2025-12-24
 *
 * 철칙 검증:
 * 1. aims-uix3는 tier 정보를 API에서 읽기만 가능
 * 2. tier 변경 기능 없음 (admin에서만 가능)
 * 3. 하드코딩된 tier 값 사용 금지
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// Mock api module
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn()
  }
}))

import { getMyStorageInfo, type StorageInfo } from '../userService'
import { api } from '@/shared/lib/api'

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>
  put: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

describe('티어 권한 철칙 검증 (Frontend)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('1. 티어 정보 API 조회', () => {
    it('getMyStorageInfo가 tier 정보를 반환해야 함', async () => {
      const mockStorageInfo: StorageInfo = {
        tier: 'standard',
        tierName: '일반',
        quota_bytes: 32212254720,
        used_bytes: 1000000,
        remaining_bytes: 32211254720,
        usage_percent: 0,
        is_unlimited: false,
        has_ocr_permission: true,
        ocr_quota: 1000,
        ocr_used_this_month: 5,
        ocr_remaining: 995,
        ocr_is_unlimited: false,
        // max_batch_upload_bytes 제거됨 (Phase 1)
      }

      mockApi.get.mockResolvedValueOnce({
        success: true,
        data: mockStorageInfo
      })

      const result = await getMyStorageInfo()

      expect(mockApi.get).toHaveBeenCalledWith('/api/users/me/storage')
      expect(result.tier).toBe('standard')
      expect(result.tierName).toBe('일반')
      expect(result.remaining_bytes).toBeDefined()
    })

    it('무료체험 tier 정보가 올바르게 반환되어야 함', async () => {
      const mockStorageInfo: StorageInfo = {
        tier: 'free_trial',
        tierName: '무료체험',
        quota_bytes: 536870912,  // 512MB
        used_bytes: 0,
        remaining_bytes: 536870912,
        usage_percent: 0,
        is_unlimited: false,
        has_ocr_permission: true,
        ocr_quota: 100,
        ocr_used_this_month: 0,
        ocr_remaining: 100,
        ocr_is_unlimited: false,
        // max_batch_upload_bytes 제거됨 (Phase 1)
      }

      mockApi.get.mockResolvedValueOnce({
        success: true,
        data: mockStorageInfo
      })

      const result = await getMyStorageInfo()

      expect(result.tier).toBe('free_trial')
      expect(result.remaining_bytes).toBeDefined()
    })

    it('admin tier는 무제한(-1)이어야 함', async () => {
      const mockStorageInfo: StorageInfo = {
        tier: 'admin',
        tierName: '관리자',
        quota_bytes: -1,
        used_bytes: 5000000,
        remaining_bytes: -1,
        usage_percent: 0,
        is_unlimited: true,
        has_ocr_permission: true,
        ocr_quota: -1,
        ocr_used_this_month: 10,
        ocr_remaining: -1,
        ocr_is_unlimited: true,
        // max_batch_upload_bytes 제거됨 (Phase 1)
      }

      mockApi.get.mockResolvedValueOnce({
        success: true,
        data: mockStorageInfo
      })

      const result = await getMyStorageInfo()

      expect(result.tier).toBe('admin')
      expect(result.is_unlimited).toBe(true)
      expect(result.is_unlimited).toBe(true)
    })
  })

  describe('2. StorageInfo 인터페이스 검증', () => {
    it('StorageInfo에 remaining_bytes 필드가 있어야 함', () => {
      const storageInfo: StorageInfo = {
        tier: 'standard',
        tierName: '일반',
        quota_bytes: 1000,
        used_bytes: 0,
        remaining_bytes: 1000,
        usage_percent: 0,
        is_unlimited: false,
        has_ocr_permission: true,
        ocr_quota: 100,
        ocr_used_this_month: 0,
        ocr_remaining: 100,
        ocr_is_unlimited: false,
      }

      expect(storageInfo.remaining_bytes).toBeDefined()
      expect(typeof storageInfo.remaining_bytes).toBe('number')
    })
  })

  describe('3. 티어 수정 API 없음 검증', () => {
    it('userService에 tier 수정 함수가 없어야 함', async () => {
      // userService 모듈의 exported 함수들 확인
      const userServiceExports = await import('../userService')

      // tier 수정 관련 함수가 없어야 함
      expect(userServiceExports).not.toHaveProperty('updateTier')
      expect(userServiceExports).not.toHaveProperty('changeTier')
      expect(userServiceExports).not.toHaveProperty('setUserTier')
      expect(userServiceExports).not.toHaveProperty('updateUserQuota')
    })
  })
})

describe('BatchDocumentUploadView 티어 제한 검증', () => {
  // 소스 코드 분석 테스트
  it('TIER_LIMITS import가 제거되어야 함', async () => {
    const batchUploadPath = path.resolve(
      __dirname,
      '../../features/batch-upload/BatchDocumentUploadView.tsx'
    )

    // 파일이 존재하는 경우에만 테스트
    if (fs.existsSync(batchUploadPath)) {
      const content = fs.readFileSync(batchUploadPath, 'utf-8')

      // TIER_LIMITS import가 없어야 함
      expect(content).not.toMatch(/import\s*{\s*[^}]*TIER_LIMITS[^}]*}\s*from/)

      // tierLimit이 storageInfo에서 가져와야 함 (remaining_bytes 기반)
      expect(content).toContain('storageInfo?.remaining_bytes')
    }
  })

  it('tierLimit이 API 응답에서 가져와야 함', async () => {
    const batchUploadPath = path.resolve(
      __dirname,
      '../../features/batch-upload/BatchDocumentUploadView.tsx'
    )

    if (fs.existsSync(batchUploadPath)) {
      const content = fs.readFileSync(batchUploadPath, 'utf-8')

      // 하드코딩된 tierLimit 값이 없어야 함
      expect(content).not.toMatch(/tierLimit\s*=\s*\d+/)
      expect(content).not.toMatch(/tierLimit\s*=\s*TIER_LIMITS/)

      // getMyStorageInfo 호출이 있어야 함
      expect(content).toContain('getMyStorageInfo')
    }
  })
})

describe('UsageQuotaWidget 티어 정보 표시', () => {
  it('storageInfo에서 tier 정보를 읽어야 함', async () => {
    const widgetPath = path.resolve(
      __dirname,
      '../../shared/ui/UsageQuotaWidget/UsageQuotaWidget.tsx'
    )

    if (fs.existsSync(widgetPath)) {
      const content = fs.readFileSync(widgetPath, 'utf-8')

      // storageInfo를 props로 받아야 함
      expect(content).toContain('storageInfo')

      // 하드코딩된 tier 값이 없어야 함
      expect(content).not.toMatch(/tier\s*=\s*['"]/)
      expect(content).not.toMatch(/tierName\s*=\s*['"]/)
    }
  })
})

describe('티어별 제한값 사용 패턴', () => {
  it('프로덕션 코드에서 TIER_LIMITS를 import하지 않아야 함', async () => {
    const batchUploadPath = path.resolve(
      __dirname,
      '../../features/batch-upload/BatchDocumentUploadView.tsx'
    )

    if (fs.existsSync(batchUploadPath)) {
      const content = fs.readFileSync(batchUploadPath, 'utf-8')

      // TIER_LIMITS를 import하지 않아야 함
      expect(content).not.toContain('TIER_LIMITS')

      // 타입만 import하는 것은 허용 (FolderMapping, DuplicateAction 등)
      // 하지만 TIER_LIMITS 상수는 import하면 안 됨
      const tierLimitsImportMatch = content.match(/import\s*{[^}]*TIER_LIMITS[^}]*}\s*from/)
      expect(tierLimitsImportMatch).toBeNull()
    }
  })
})
