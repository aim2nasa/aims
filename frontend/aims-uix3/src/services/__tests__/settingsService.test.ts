/**
 * Settings Service Unit Tests
 * @since 2026-02-05
 *
 * 테스트 범위:
 * 1. getFileValidationSettings - 파일 검증 설정 조회
 * 2. updateFileValidationSettings - 파일 검증 설정 수정
 * 3. resetFileValidationSettings - 파일 검증 설정 초기화
 * 4. getDefaultFileValidationSettings - 기본 설정 조회
 * 5. getCachedFileValidationSettings - 캐시된 설정 조회
 * 6. invalidateSettingsCache - 캐시 무효화
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getFileValidationSettings,
  updateFileValidationSettings,
  resetFileValidationSettings,
  getDefaultFileValidationSettings,
  getCachedFileValidationSettings,
  invalidateSettingsCache,
  type FileValidationSettings,
} from '../settingsService';

// Mock api
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
  },
}));

import { api } from '@/shared/lib/api';

const mockApi = api as {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

describe('settingsService', () => {
  // 테스트용 설정 데이터
  const mockSettings: FileValidationSettings = {
    extensionValidation: {
      enabled: true,
      blockedExtensions: ['.exe', '.bat', '.cmd'],
      description: '실행 파일 차단',
    },
    fileSizeValidation: {
      enabled: true,
      maxSizeBytes: 52428800, // 50MB
      maxSizeMB: 50,
      description: '최대 파일 크기 제한',
    },
    mimeTypeValidation: {
      enabled: true,
      description: 'MIME 타입 검사',
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
      enabled: false,
      timeoutMs: 30000,
      description: '바이러스 검사 (비활성화)',
    },
    updatedAt: '2026-02-05T10:00:00Z',
    updatedBy: 'admin',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    invalidateSettingsCache(); // 각 테스트 전 캐시 초기화
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =============================================================================
  // 1. getFileValidationSettings 테스트
  // =============================================================================

  describe('getFileValidationSettings', () => {
    it('파일 검증 설정을 조회해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: mockSettings,
      });

      const result = await getFileValidationSettings();

      expect(mockApi.get).toHaveBeenCalledWith('/api/settings/file-validation');
      expect(result).toEqual(mockSettings);
    });

    it('조회 실패 시 에러를 throw해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: false,
        error: '권한 없음',
      });

      await expect(getFileValidationSettings()).rejects.toThrow('권한 없음');
    });

    it('에러 메시지 없이 실패 시 기본 메시지 사용', async () => {
      mockApi.get.mockResolvedValue({
        success: false,
      });

      await expect(getFileValidationSettings()).rejects.toThrow('설정 조회 실패');
    });

    it('모든 검증 설정 필드를 반환해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: mockSettings,
      });

      const result = await getFileValidationSettings();

      expect(result.extensionValidation).toBeDefined();
      expect(result.fileSizeValidation).toBeDefined();
      expect(result.mimeTypeValidation).toBeDefined();
      expect(result.storageQuotaValidation).toBeDefined();
      expect(result.duplicateValidation).toBeDefined();
      expect(result.virusScanValidation).toBeDefined();
    });
  });

  // =============================================================================
  // 2. updateFileValidationSettings 테스트
  // =============================================================================

  describe('updateFileValidationSettings', () => {
    it('파일 검증 설정을 수정해야 함', async () => {
      const updates = {
        fileSizeValidation: {
          enabled: true,
          maxSizeBytes: 104857600, // 100MB
          maxSizeMB: 100,
          description: '최대 파일 크기 제한 (확장)',
        },
      };

      mockApi.put.mockResolvedValue({
        success: true,
        data: { ...mockSettings, ...updates },
      });

      const result = await updateFileValidationSettings(updates);

      expect(mockApi.put).toHaveBeenCalledWith('/api/settings/file-validation', updates);
      expect(result.fileSizeValidation.maxSizeMB).toBe(100);
    });

    it('확장자 차단 목록을 수정해야 함', async () => {
      const updates = {
        extensionValidation: {
          enabled: true,
          blockedExtensions: ['.exe', '.bat', '.cmd', '.scr'],
          description: '실행 파일 차단 (확장)',
        },
      };

      mockApi.put.mockResolvedValue({
        success: true,
        data: { ...mockSettings, ...updates },
      });

      const result = await updateFileValidationSettings(updates);

      expect(result.extensionValidation.blockedExtensions).toContain('.scr');
    });

    it('수정 실패 시 에러를 throw해야 함', async () => {
      mockApi.put.mockResolvedValue({
        success: false,
        error: '관리자 권한 필요',
      });

      await expect(updateFileValidationSettings({})).rejects.toThrow('관리자 권한 필요');
    });

    it('바이러스 검사 활성화를 수정할 수 있어야 함', async () => {
      const updates = {
        virusScanValidation: {
          enabled: true,
          timeoutMs: 60000,
          description: '바이러스 검사 (활성화)',
        },
      };

      mockApi.put.mockResolvedValue({
        success: true,
        data: { ...mockSettings, ...updates },
      });

      const result = await updateFileValidationSettings(updates);

      expect(result.virusScanValidation.enabled).toBe(true);
      expect(result.virusScanValidation.timeoutMs).toBe(60000);
    });
  });

  // =============================================================================
  // 3. resetFileValidationSettings 테스트
  // =============================================================================

  describe('resetFileValidationSettings', () => {
    it('설정을 기본값으로 초기화해야 함', async () => {
      mockApi.post.mockResolvedValue({
        success: true,
        data: mockSettings,
      });

      const result = await resetFileValidationSettings();

      expect(mockApi.post).toHaveBeenCalledWith('/api/settings/file-validation/reset');
      expect(result).toEqual(mockSettings);
    });

    it('초기화 실패 시 에러를 throw해야 함', async () => {
      mockApi.post.mockResolvedValue({
        success: false,
        error: '초기화 권한 없음',
      });

      await expect(resetFileValidationSettings()).rejects.toThrow('초기화 권한 없음');
    });
  });

  // =============================================================================
  // 4. getDefaultFileValidationSettings 테스트
  // =============================================================================

  describe('getDefaultFileValidationSettings', () => {
    it('기본 설정을 조회해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: mockSettings,
      });

      const result = await getDefaultFileValidationSettings();

      expect(mockApi.get).toHaveBeenCalledWith('/api/settings/file-validation/defaults');
      expect(result).toEqual(mockSettings);
    });

    it('조회 실패 시 에러를 throw해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: false,
      });

      await expect(getDefaultFileValidationSettings()).rejects.toThrow('기본 설정 조회 실패');
    });
  });

  // =============================================================================
  // 5. getCachedFileValidationSettings 테스트
  // =============================================================================

  describe('getCachedFileValidationSettings', () => {
    it('첫 호출 시 API를 호출해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: mockSettings,
      });

      const result = await getCachedFileValidationSettings();

      expect(mockApi.get).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockSettings);
    });

    it('캐시 TTL 내에서는 API를 다시 호출하지 않아야 함', async () => {
      vi.useFakeTimers();

      mockApi.get.mockResolvedValue({
        success: true,
        data: mockSettings,
      });

      // 첫 호출
      await getCachedFileValidationSettings();
      expect(mockApi.get).toHaveBeenCalledTimes(1);

      // 30초 후 두 번째 호출 (TTL 60초 이내)
      vi.advanceTimersByTime(30000);
      await getCachedFileValidationSettings();
      expect(mockApi.get).toHaveBeenCalledTimes(1); // 캐시 사용
    });

    it('캐시 TTL 초과 시 API를 다시 호출해야 함', async () => {
      vi.useFakeTimers();

      mockApi.get.mockResolvedValue({
        success: true,
        data: mockSettings,
      });

      // 첫 호출
      await getCachedFileValidationSettings();
      expect(mockApi.get).toHaveBeenCalledTimes(1);

      // 61초 후 두 번째 호출 (TTL 60초 초과)
      vi.advanceTimersByTime(61000);
      await getCachedFileValidationSettings();
      expect(mockApi.get).toHaveBeenCalledTimes(2); // 새로 조회
    });

    it('캐시된 설정을 반환해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: mockSettings,
      });

      const result1 = await getCachedFileValidationSettings();
      const result2 = await getCachedFileValidationSettings();

      expect(result1).toEqual(result2);
    });
  });

  // =============================================================================
  // 6. invalidateSettingsCache 테스트
  // =============================================================================

  describe('invalidateSettingsCache', () => {
    it('캐시를 무효화하면 다음 호출 시 API를 호출해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: mockSettings,
      });

      // 첫 호출
      await getCachedFileValidationSettings();
      expect(mockApi.get).toHaveBeenCalledTimes(1);

      // 캐시 무효화
      invalidateSettingsCache();

      // 두 번째 호출
      await getCachedFileValidationSettings();
      expect(mockApi.get).toHaveBeenCalledTimes(2);
    });

    it('여러 번 무효화해도 에러가 발생하지 않아야 함', () => {
      expect(() => {
        invalidateSettingsCache();
        invalidateSettingsCache();
        invalidateSettingsCache();
      }).not.toThrow();
    });
  });
});
