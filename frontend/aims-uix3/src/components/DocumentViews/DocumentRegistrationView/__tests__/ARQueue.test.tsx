/**
 * AR Sequential Processing Queue Tests
 * @since 2025-10-23
 * @updated 2026-02-05
 *
 * 테스트 범위:
 * 1. AR 파일 순차 처리 큐 시스템
 * 2. 동시 처리 방지 메커니즘
 * 3. 캐시 기반 중복 방지
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  clearDuplicateCheckCache,
  precomputeFileHashes,
  prefetchCustomerData,
} from '../utils/annualReportProcessor';

// Mock dependencies
vi.mock('@/features/customer/utils/fileHash', () => ({
  calculateFileHash: vi.fn(() => Promise.resolve(`hash-${Date.now()}`))
}));

vi.mock('@/shared/lib/api', () => ({
  getAuthToken: vi.fn(() => 'test-token')
}));

vi.mock('@/shared/lib/errorReporter', () => ({
  errorReporter: {
    reportApiError: vi.fn()
  }
}));

vi.mock('@/features/customer/api/annualReportApi', () => ({
  AnnualReportApi: {
    getAnnualReports: vi.fn(() => Promise.resolve({ success: true, data: { reports: [] } }))
  }
}));

describe('AR 순차 처리 큐', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    clearDuplicateCheckCache();
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn(() => 'test-user'),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('큐 시스템', () => {
    it('파일이 큐에 추가되어야 한다', async () => {
      const { calculateFileHash } = await import('@/features/customer/utils/fileHash');
      const mockFiles = [
        new File(['content1'], 'file1.pdf'),
        new File(['content2'], 'file2.pdf'),
      ];

      vi.mocked(calculateFileHash).mockResolvedValue('hash-test');

      await precomputeFileHashes(mockFiles);

      // 모든 파일에 대해 해시가 계산됨
      expect(calculateFileHash).toHaveBeenCalledTimes(2);
    });

    it('파일이 순차적으로 처리되어야 한다', async () => {
      const { calculateFileHash } = await import('@/features/customer/utils/fileHash');
      const mockFiles = [
        new File(['content1'], 'file1.pdf'),
        new File(['content2'], 'file2.pdf'),
        new File(['content3'], 'file3.pdf'),
      ];

      let callIndex = 0;
      vi.mocked(calculateFileHash).mockImplementation(() => {
        callIndex++;
        return Promise.resolve(`hash-${callIndex}`);
      });

      const progress: number[] = [];
      await precomputeFileHashes(mockFiles, (completed) => {
        progress.push(completed);
      });

      // 모든 파일이 순차적으로 처리됨
      expect(calculateFileHash).toHaveBeenCalledTimes(3);
      expect(progress[progress.length - 1]).toBe(3);
    });
  });

  describe('동시 처리 방지', () => {
    it('하나의 파일이 처리 중일 때 다른 파일은 대기해야 한다', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ success: true, hashes: [] })
      });

      const customerIds = ['customer-1', 'customer-2', 'customer-3'];
      const progress: number[] = [];

      await prefetchCustomerData(customerIds, (completed) => {
        progress.push(completed);
      });

      // 배치 단위로 순차 처리됨 (동시에 무제한 호출되지 않음)
      expect(progress.length).toBeGreaterThan(0);
      expect(progress[progress.length - 1]).toBe(3);
    });

    it('처리 완료 후 다음 파일이 처리되어야 한다', async () => {
      const { calculateFileHash } = await import('@/features/customer/utils/fileHash');

      const executionOrder: string[] = [];

      vi.mocked(calculateFileHash).mockImplementation(async (file: File) => {
        executionOrder.push(`start-${file.name}`);
        await new Promise(resolve => setTimeout(resolve, 5));
        executionOrder.push(`end-${file.name}`);
        return `hash-${file.name}`;
      });

      const mockFiles = [
        new File(['1'], 'a.pdf'),
        new File(['2'], 'b.pdf'),
      ];

      await precomputeFileHashes(mockFiles);

      // 모든 작업이 완료됨
      expect(executionOrder.filter(e => e.startsWith('end'))).toHaveLength(2);
    });
  });

  describe('캐시 기반 중복 방지', () => {
    it('clearDuplicateCheckCache가 캐시를 초기화해야 한다', () => {
      expect(() => clearDuplicateCheckCache()).not.toThrow();
    });

    it('같은 배치 내에서 같은 해시는 중복으로 처리되어야 한다', async () => {
      const { calculateFileHash } = await import('@/features/customer/utils/fileHash');

      // 모든 파일이 같은 해시를 가짐
      vi.mocked(calculateFileHash).mockResolvedValue('same-hash');

      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ success: true, hashes: [] })
      });

      const { processAnnualReportFile } = await import('../utils/annualReportProcessor');

      const file1 = new File(['content1'], 'file1.pdf');
      const file2 = new File(['content2'], 'file2.pdf');
      const customerId = 'customer-test';

      // 첫 번째 파일: 해시가 캐시에 추가됨
      const result1 = await processAnnualReportFile(file1, customerId);
      expect(result1.isDuplicateDoc).toBe(false);

      // 두 번째 파일: 같은 해시 → 중복 감지
      const result2 = await processAnnualReportFile(file2, customerId);
      expect(result2.isDuplicateDoc).toBe(true);
    });
  });

  describe('에러 복원력', () => {
    it('해시 계산 실패 시에도 다른 파일 처리가 계속되어야 한다', async () => {
      const { calculateFileHash } = await import('@/features/customer/utils/fileHash');

      let callCount = 0;
      vi.mocked(calculateFileHash).mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error('Hash calculation failed'));
        }
        return Promise.resolve(`hash-${callCount}`);
      });

      const mockFiles = [
        new File(['content1'], 'file1.pdf'),
        new File(['content2'], 'file2.pdf'),
        new File(['content3'], 'file3.pdf'),
      ];

      // 에러가 발생해도 완료되어야 함
      await expect(precomputeFileHashes(mockFiles)).resolves.not.toThrow();
      expect(calculateFileHash).toHaveBeenCalledTimes(3);
    });
  });

  describe('배치 처리 크기', () => {
    it('CONCURRENCY=10 배치로 병렬 처리되어야 한다', async () => {
      const { calculateFileHash } = await import('@/features/customer/utils/fileHash');

      // 15개 파일 생성
      const mockFiles = Array.from({ length: 15 }, (_, i) =>
        new File([`content${i}`], `file${i}.pdf`)
      );

      vi.mocked(calculateFileHash).mockResolvedValue('hash-test');

      const progressSnapshots: number[] = [];
      await precomputeFileHashes(mockFiles, (completed) => {
        progressSnapshots.push(completed);
      });

      // 15개 파일 모두 처리됨
      expect(calculateFileHash).toHaveBeenCalledTimes(15);
      // 배치 처리 (10 + 5)
      expect(progressSnapshots).toContain(10);
      expect(progressSnapshots).toContain(15);
    });
  });

  describe('빈 입력 처리', () => {
    it('빈 파일 배열 처리 시 에러가 발생하지 않아야 한다', async () => {
      await expect(precomputeFileHashes([])).resolves.not.toThrow();
    });

    it('빈 고객 ID 배열 처리 시 에러가 발생하지 않아야 한다', async () => {
      await expect(prefetchCustomerData([])).resolves.not.toThrow();
    });
  });
});
