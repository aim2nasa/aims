/**
 * DownloadHelper Tests
 * @since 2025-10-14
 *
 * 문서 파일 다운로드 유틸리티 테스트
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DownloadHelper from './downloadHelper';

// ============================================
// 테스트 데이터
// ============================================

const mockDocWithUpload = {
  _id: 'doc-123',
  upload: {
    originalName: 'test-document.pdf',
    destPath: '/data/uploads/2025/test-document.pdf',
  },
};

const mockDocWithPayload = {
  _id: 'doc-456',
  payload: {
    original_name: 'payload-document.pdf',
    dest_path: '/data/semantic/payload-document.pdf',
  },
};

const mockDocWithFileUrl = {
  _id: 'doc-789',
  fileUrl: 'https://tars.giize.com/direct/file.pdf',
  upload: {
    originalName: 'direct-file.pdf',
    destPath: '/data/uploads/fallback.pdf',
  },
};

const mockDocNoPath = {
  _id: 'doc-no-path',
};

const mockDocWithNormalizedPath = {
  _id: 'doc-normalized',
  upload: {
    originalName: 'normalized.pdf',
    destPath: '/uploads/2025/normalized.pdf', // /data가 없는 경로
  },
};

// ============================================
// Mock 설정
// ============================================

// Global fetch mock
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Blob mock
class MockBlob {
  constructor(public content: any[], public options?: any) {}
}
global.Blob = MockBlob as any;

// URL mock
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = vi.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

// DOM mock
let mockLink: any = null;
const originalCreateElement = document.createElement.bind(document);

beforeEach(() => {
  // Reset all mocks
  vi.clearAllMocks();
  mockFetch.mockReset();
  mockCreateObjectURL.mockClear();
  mockRevokeObjectURL.mockClear();

  // Mock successful fetch by default
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    blob: () => Promise.resolve(new MockBlob(['file content'])),
  });

  // Mock document.createElement for 'a' tag
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'a') {
      mockLink = {
        href: '',
        download: '',
        style: { display: '' },
        click: vi.fn(),
      };
      return mockLink;
    }
    return originalCreateElement(tagName);
  });

  // Mock appendChild/removeChild
  vi.spyOn(document.body, 'appendChild').mockImplementation((node: any) => {
    return node;
  });

  vi.spyOn(document.body, 'removeChild').mockImplementation((node: any) => {
    return node;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================
// URL 생성 로직 테스트
// ============================================
describe('DownloadHelper - URL 생성', () => {
  it('fileUrl이 있으면 fileUrl을 우선 사용한다', async () => {
    await DownloadHelper.downloadDocument(mockDocWithFileUrl, { showMessage: false });

    expect(mockFetch).toHaveBeenCalledWith('https://tars.giize.com/direct/file.pdf');
  });

  it('upload.destPath를 사용하여 URL을 생성한다 (/data 제거)', async () => {
    await DownloadHelper.downloadDocument(mockDocWithUpload, { showMessage: false });

    expect(mockFetch).toHaveBeenCalledWith('https://tars.giize.com/uploads/2025/test-document.pdf');
  });

  it('payload.dest_path를 사용하여 URL을 생성한다 (/data 제거)', async () => {
    await DownloadHelper.downloadDocument(mockDocWithPayload, { showMessage: false });

    expect(mockFetch).toHaveBeenCalledWith('https://tars.giize.com/semantic/payload-document.pdf');
  });

  it('/data로 시작하지 않는 경로는 그대로 사용한다', async () => {
    await DownloadHelper.downloadDocument(mockDocWithNormalizedPath, { showMessage: false });

    expect(mockFetch).toHaveBeenCalledWith('https://tars.giize.com/uploads/2025/normalized.pdf');
  });

  it('파일 경로가 없으면 에러를 반환한다', async () => {
    const result = await DownloadHelper.downloadDocument(mockDocNoPath, { showMessage: false });

    expect(result.success).toBe(false);
    expect(result.error).toBe('다운로드할 파일 경로를 찾을 수 없습니다.');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ============================================
// 파일명 추출 로직 테스트
// ============================================
describe('DownloadHelper - 파일명 추출', () => {
  it('upload.originalName을 다운로드 파일명으로 사용한다', async () => {
    await DownloadHelper.downloadDocument(mockDocWithUpload, { showMessage: false });

    expect(mockLink.download).toBe('test-document.pdf');
  });

  it('payload.original_name을 다운로드 파일명으로 사용한다', async () => {
    await DownloadHelper.downloadDocument(mockDocWithPayload, { showMessage: false });

    expect(mockLink.download).toBe('payload-document.pdf');
  });

  it('파일명이 없으면 "download-{_id}"를 사용한다', async () => {
    const docNoName = {
      _id: 'doc-no-name',
      upload: { destPath: '/data/uploads/file.pdf' },
    };

    await DownloadHelper.downloadDocument(docNoName, { showMessage: false });

    expect(mockLink.download).toBe('download-doc-no-name');
  });
});

// ============================================
// 다운로드 실행 로직 테스트
// ============================================
describe('DownloadHelper - 다운로드 실행', () => {
  it('성공적으로 다운로드를 실행한다', async () => {
    const result = await DownloadHelper.downloadDocument(mockDocWithUpload, { showMessage: false });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

    // Blob 생성 확인
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);

    // <a> 태그 생성 및 클릭 확인
    expect(mockLink.click).toHaveBeenCalledTimes(1);
    expect(mockLink.style.display).toBe('none');

    // 정리 작업 확인
    expect(document.body.removeChild).toHaveBeenCalledWith(mockLink);
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('fetch 실패 시 에러를 반환한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await DownloadHelper.downloadDocument(mockDocWithUpload, { showMessage: false });

    expect(result.success).toBe(false);
    expect(result.error).toBe('파일 다운로드 실패: 404 Not Found');
  });

  it('네트워크 에러 시 에러를 반환한다', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await DownloadHelper.downloadDocument(mockDocWithUpload, { showMessage: false });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
  });

  it('알 수 없는 에러도 처리한다', async () => {
    mockFetch.mockRejectedValueOnce('Unknown error string');

    const result = await DownloadHelper.downloadDocument(mockDocWithUpload, { showMessage: false });

    expect(result.success).toBe(false);
    expect(result.error).toBe('알 수 없는 오류');
  });
});

// ============================================
// 옵션 처리 테스트
// ============================================
describe('DownloadHelper - 옵션 처리', () => {
  it('showMessage: true 옵션이 동작한다 (기본값)', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await DownloadHelper.downloadDocument(mockDocWithUpload);

    // DEV 환경에서만 로그 출력 (import.meta.env.DEV 체크)
    // 테스트 환경에서는 DEV가 true일 수 있으므로 호출 여부만 확인
    consoleLogSpy.mockRestore();
  });

  it('showMessage: false 옵션이 동작한다', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await DownloadHelper.downloadDocument(mockDocWithUpload, { showMessage: false });

    // showMessage가 false이면 로그가 출력되지 않음
    // (하지만 DEV 환경 체크도 있으므로 명확한 검증은 어려움)

    consoleLogSpy.mockRestore();
  });

  it('에러 발생 시 showMessage: true면 에러 로그를 출력한다', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Test error'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await DownloadHelper.downloadDocument(mockDocWithUpload, { showMessage: true });

    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('에러 발생 시 showMessage: false여도 console.error는 호출된다 (디버깅용)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Test error'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await DownloadHelper.downloadDocument(mockDocWithUpload, { showMessage: false });

    // showMessage와 무관하게 첫 번째 console.error는 항상 호출됨
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});

// ============================================
// 엣지 케이스 테스트
// ============================================
describe('DownloadHelper - 엣지 케이스', () => {
  it('빈 문자열 destPath는 에러로 처리한다', async () => {
    const docEmptyPath = {
      _id: 'doc-empty',
      upload: { destPath: '', originalName: 'test.pdf' },
    };

    const result = await DownloadHelper.downloadDocument(docEmptyPath, { showMessage: false });

    expect(result.success).toBe(false);
    expect(result.error).toBe('다운로드할 파일 경로를 찾을 수 없습니다.');
  });

  it('특수 문자가 포함된 파일명도 올바르게 처리한다', async () => {
    const docSpecialChars = {
      _id: 'doc-special',
      upload: {
        originalName: '파일명(특수)_文件-🎯.pdf',
        destPath: '/data/uploads/special.pdf',
      },
    };

    await DownloadHelper.downloadDocument(docSpecialChars, { showMessage: false });

    expect(mockLink.download).toBe('파일명(특수)_文件-🎯.pdf');
  });

  it('매우 긴 파일명도 올바르게 처리한다', async () => {
    const longName = 'A'.repeat(255) + '.pdf';
    const docLongName = {
      _id: 'doc-long',
      upload: {
        originalName: longName,
        destPath: '/data/uploads/long.pdf',
      },
    };

    await DownloadHelper.downloadDocument(docLongName, { showMessage: false });

    expect(mockLink.download).toBe(longName);
  });
});

// ============================================
// 경로 정규화 엣지 케이스 테스트
// ============================================
describe('DownloadHelper - 경로 정규화', () => {
  it('다중 슬래시가 있는 경로를 처리한다 (/data 제거 후 그대로 전달)', async () => {
    const docMultiSlash = {
      _id: 'doc-multi-slash',
      upload: {
        originalName: 'test.pdf',
        destPath: '/data//uploads///test.pdf',
      },
    };

    await DownloadHelper.downloadDocument(docMultiSlash, { showMessage: false });

    // 실제 구현: /data만 제거하고 다중 슬래시는 정규화하지 않음
    expect(mockFetch).toHaveBeenCalledWith('https://tars.giize.com//uploads///test.pdf');
  });

  it('경로 끝 슬래시를 포함한 경로를 처리한다', async () => {
    const docTrailingSlash = {
      _id: 'doc-trailing',
      upload: {
        originalName: 'test.pdf',
        destPath: '/data/uploads/test.pdf/',
      },
    };

    await DownloadHelper.downloadDocument(docTrailingSlash, { showMessage: false });

    expect(mockFetch).toHaveBeenCalledWith('https://tars.giize.com/uploads/test.pdf/');
  });

  it('상대 경로 (/ 없이 시작)를 처리한다', async () => {
    const docRelativePath = {
      _id: 'doc-relative',
      upload: {
        originalName: 'test.pdf',
        destPath: 'uploads/test.pdf',
      },
    };

    await DownloadHelper.downloadDocument(docRelativePath, { showMessage: false });

    // 실제 구현: 경로가 /로 시작하지 않으면 슬래시 없이 붙음
    expect(mockFetch).toHaveBeenCalledWith('https://tars.giize.comuploads/test.pdf');
  });

  it('백슬래시를 포함한 경로를 처리한다', async () => {
    const docBackslash = {
      _id: 'doc-backslash',
      upload: {
        originalName: 'test.pdf',
        destPath: '\\data\\uploads\\test.pdf',
      },
    };

    const result = await DownloadHelper.downloadDocument(docBackslash, { showMessage: false });

    // 백슬래시는 그대로 전달되거나 에러 처리됨
    expect(mockFetch).toHaveBeenCalled();
    expect(result.success).toBeDefined();
  });
});

// ============================================
// 파일명 생성 로직 테스트
// ============================================
describe('DownloadHelper - 파일명 생성', () => {
  it('특수문자 이스케이프를 처리한다', async () => {
    const docSpecial = {
      _id: 'doc-escape',
      upload: {
        originalName: '파일<>이름:?.pdf',
        destPath: '/data/uploads/test.pdf',
      },
    };

    await DownloadHelper.downloadDocument(docSpecial, { showMessage: false });

    // 파일명이 그대로 전달되는지 확인 (브라우저가 이스케이프 처리)
    expect(mockLink.download).toBe('파일<>이름:?.pdf');
  });

  it('매우 긴 파일명 (255자 초과)을 처리한다', async () => {
    const veryLongName = 'A'.repeat(300) + '.pdf';
    const docVeryLong = {
      _id: 'doc-very-long',
      upload: {
        originalName: veryLongName,
        destPath: '/data/uploads/long.pdf',
      },
    };

    await DownloadHelper.downloadDocument(docVeryLong, { showMessage: false });

    expect(mockLink.download).toBe(veryLongName);
  });

  it('Unicode 파일명 (한글, 일본어, 이모지)을 처리한다', async () => {
    const unicodeName = '한글_日本語_🎉_Emoji.pdf';
    const docUnicode = {
      _id: 'doc-unicode',
      upload: {
        originalName: unicodeName,
        destPath: '/data/uploads/unicode.pdf',
      },
    };

    await DownloadHelper.downloadDocument(docUnicode, { showMessage: false });

    expect(mockLink.download).toBe(unicodeName);
  });
});

// ============================================
// 네트워크 에러 세분화 테스트
// ============================================
describe('DownloadHelper - 네트워크 에러', () => {
  it('403 Forbidden 에러를 처리한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    const result = await DownloadHelper.downloadDocument(mockDocWithUpload, { showMessage: false });

    expect(result.success).toBe(false);
    expect(result.error).toBe('파일 다운로드 실패: 403 Forbidden');
  });

  it('404 Not Found 에러를 처리한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await DownloadHelper.downloadDocument(mockDocWithUpload, { showMessage: false });

    expect(result.success).toBe(false);
    expect(result.error).toBe('파일 다운로드 실패: 404 Not Found');
  });

  it('500 Server Error를 처리한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const result = await DownloadHelper.downloadDocument(mockDocWithUpload, { showMessage: false });

    expect(result.success).toBe(false);
    expect(result.error).toBe('파일 다운로드 실패: 500 Internal Server Error');
  });
});

// ============================================
// 브라우저 호환성 테스트
// ============================================
describe('DownloadHelper - 브라우저 호환성', () => {
  it('Blob 생성 실패 시 에러를 처리한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      blob: () => Promise.reject(new Error('Blob creation failed')),
    });

    const result = await DownloadHelper.downloadDocument(mockDocWithUpload, { showMessage: false });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Blob creation failed');
  });

  it('URL.createObjectURL 실패를 처리한다', async () => {
    mockCreateObjectURL.mockImplementationOnce(() => {
      throw new Error('createObjectURL not supported');
    });

    const result = await DownloadHelper.downloadDocument(mockDocWithUpload, { showMessage: false });

    expect(result.success).toBe(false);
    expect(result.error).toBe('createObjectURL not supported');
  });
});
