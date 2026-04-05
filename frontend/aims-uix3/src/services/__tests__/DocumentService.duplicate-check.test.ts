/**
 * DocumentService.uploadDocument() 중복 체크 테스트
 *
 * 수정 전 문제:
 * - ChatPanel을 통한 업로드 시 중복 체크 없음
 * - n8n Update Meta 단계에서 E11000 에러 발생
 *
 * 수정 후 동작:
 * - 업로드 전 checkSystemDuplicate() 호출
 * - 중복 파일 감지 시 즉시 에러 (업로드 차단)
 *
 * @since 2026-01-04
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocumentService } from '../DocumentService';

// Mock dependencies
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  getAuthToken: vi.fn().mockReturnValue('test-token'),
  getCurrentUserId: vi.fn().mockReturnValue('test-user-id'),
}));

vi.mock('@/shared/lib/fileValidation/virusScanApi', () => ({
  isScanAvailable: vi.fn().mockResolvedValue(false),
  scanFile: vi.fn(),
}));

vi.mock('@/shared/lib/fileValidation/duplicateChecker', () => ({
  checkSystemDuplicate: vi.fn(),
}));

import { checkSystemDuplicate } from '@/shared/lib/fileValidation/duplicateChecker';

describe('DocumentService.uploadDocument() 중복 체크', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // localStorage mock
    const localStorageMock = {
      getItem: vi.fn().mockImplementation((key: string) => {
        if (key === 'aims-current-user-id') return 'test-user-id';
        if (key === 'auth-storage') return JSON.stringify({ state: { token: 'test-token' } });
        return null;
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    Object.defineProperty(window, 'localStorage', { value: localStorageMock });
  });

  it('중복 파일 업로드 시 에러를 throw해야 함', async () => {
    // Given: 중복 파일 존재
    vi.mocked(checkSystemDuplicate).mockResolvedValue({
      isDuplicate: true,
      existingDocument: {
        documentId: 'existing-doc-id',
        fileName: '테스트파일.pdf',
        customerId: 'customer-id',
        customerName: '홍길동',
        uploadedAt: '2026-01-04T00:00:00.000Z',
      },
      fileHash: 'abc123',
    });

    const testFile = new File(['test content'], '테스트파일.pdf', { type: 'application/pdf' });

    // When & Then: 업로드 시 에러
    await expect(DocumentService.uploadDocument(testFile)).rejects.toThrow(
      '이미 등록된 파일입니다. (고객: 홍길동, 파일: 테스트파일.pdf)'
    );

    // checkSystemDuplicate가 호출되었는지 확인 (metadata 없으므로 customerId는 undefined)
    expect(checkSystemDuplicate).toHaveBeenCalledWith(testFile, undefined);
  });

  it('고객 없는 중복 파일 업로드 시 에러 메시지에 고객명 없음', async () => {
    // Given: 고객 없는 중복 파일
    vi.mocked(checkSystemDuplicate).mockResolvedValue({
      isDuplicate: true,
      existingDocument: {
        documentId: 'existing-doc-id',
        fileName: '미분류파일.pdf',
        customerId: null,
        customerName: null,
        uploadedAt: null,
      },
      fileHash: 'def456',
    });

    const testFile = new File(['test'], '미분류파일.pdf', { type: 'application/pdf' });

    // When & Then
    await expect(DocumentService.uploadDocument(testFile)).rejects.toThrow(
      '이미 등록된 파일입니다. (파일: 미분류파일.pdf)'
    );
  });

  it('중복 아닌 파일은 정상 업로드 진행', async () => {
    // Given: 중복 아님
    vi.mocked(checkSystemDuplicate).mockResolvedValue({
      isDuplicate: false,
      fileHash: 'unique-hash',
    });

    // XMLHttpRequest mock
    const mockXHR = {
      open: vi.fn(),
      send: vi.fn(),
      setRequestHeader: vi.fn(),
      addEventListener: vi.fn((event: string, handler: EventListener) => {
        if (event === 'load') {
          setTimeout(() => {
            (mockXHR as { status: number }).status = 200;
            (mockXHR as { responseText: string }).responseText = JSON.stringify({
              doc_id: 'new-doc-id',
            });
            handler(new Event('load'));
          }, 0);
        }
      }),
      status: 200,
      responseText: '',
      timeout: 0,
    };
    vi.spyOn(window, 'XMLHttpRequest').mockImplementation(() => mockXHR as unknown as XMLHttpRequest);

    const testFile = new File(['test'], 'new-file.pdf', { type: 'application/pdf' });

    // When
    const result = await DocumentService.uploadDocument(testFile);

    // Then: 업로드 성공
    expect(result.success).toBe(true);
    expect(checkSystemDuplicate).toHaveBeenCalledWith(testFile, undefined);
  });

  it('checkSystemDuplicate API 실패 시에도 업로드 진행 (fallback)', async () => {
    // Given: API 실패 → isDuplicate: false 반환
    vi.mocked(checkSystemDuplicate).mockResolvedValue({
      isDuplicate: false,
      fileHash: 'hash-after-api-failure',
    });

    // XMLHttpRequest mock
    const mockXHR = {
      open: vi.fn(),
      send: vi.fn(),
      setRequestHeader: vi.fn(),
      addEventListener: vi.fn((event: string, handler: EventListener) => {
        if (event === 'load') {
          setTimeout(() => {
            (mockXHR as { status: number }).status = 200;
            (mockXHR as { responseText: string }).responseText = JSON.stringify({
              doc_id: 'fallback-doc-id',
            });
            handler(new Event('load'));
          }, 0);
        }
      }),
      status: 200,
      responseText: '',
      timeout: 0,
    };
    vi.spyOn(window, 'XMLHttpRequest').mockImplementation(() => mockXHR as unknown as XMLHttpRequest);

    const testFile = new File(['test'], 'fallback-test.pdf', { type: 'application/pdf' });

    // When
    const result = await DocumentService.uploadDocument(testFile);

    // Then: 업로드 진행됨 (백엔드에서 최종 차단)
    expect(result.success).toBe(true);
  });
});
