/**
 * SearchService Tests
 * @since 2025-10-14
 *
 * SearchService 유틸리티 메서드 테스트
 * 다양한 스키마 지원 및 fallback 로직 검증
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchService } from './searchService';
import type { SearchResultItem, SemanticSearchResultItem, KeywordSearchResultItem } from '@/entities/search';

// ============================================
// 테스트 데이터
// ============================================

const mockSemanticItem: SemanticSearchResultItem = {
  id: 'semantic-doc-1',
  score: 0.95,
  payload: {
    doc_id: 'doc-123',
    original_name: 'test-semantic.pdf',
    dest_path: '/uploads/semantic/test.pdf',
    mime_type: 'application/pdf',
    uploaded_at: '2025-01-01T00:00:00Z',
  },
  meta: {
    summary: 'This is a meta summary',
    full_text: 'Full text content',
    destPath: '/uploads/meta/test.pdf',
    originalName: 'test-meta.pdf',
    mimeType: 'application/pdf',
  },
  ocr: {
    summary: 'This is an OCR summary',
    confidence: '0.955',
  },
};

const mockKeywordItem: KeywordSearchResultItem = {
  _id: 'keyword-doc-1',
  filename: 'test-keyword.pdf',
  upload: {
    originalName: 'test-upload.pdf',
    destPath: '/uploads/upload/test.pdf',
    mimeType: 'application/pdf',
  },
  meta: {
    summary: 'This is a keyword meta summary',
    originalName: 'test-keyword-meta.pdf',
    destPath: '/uploads/keyword-meta/test.pdf',
    mimeType: 'application/pdf',
  },
  ocr: {
    summary: 'This is a keyword OCR summary',
    confidence: '0.923',
  },
};

const mockItemWithDocsum: SemanticSearchResultItem = {
  score: 0.88,
  docsum: {
    summary: 'This is a docsum summary',
  },
  meta: {},
};

const mockMinimalItem: SemanticSearchResultItem = {
  score: 0.5,
  meta: {},
};

// ============================================
// getFilePath 테스트
// ============================================
describe('SearchService.getFilePath', () => {
  it('upload.destPath를 최우선으로 반환한다', () => {
    const item: SearchResultItem = {
      _id: 'test',
      upload: { destPath: '/uploads/upload/test.pdf' },
      meta: { destPath: '/uploads/meta/test.pdf' },
    } as KeywordSearchResultItem;

    expect(SearchService.getFilePath(item)).toBe('/uploads/upload/test.pdf');
  });

  it('upload.destPath가 없으면 meta.destPath를 반환한다', () => {
    const item: SearchResultItem = {
      _id: 'test',
      meta: { destPath: '/uploads/meta/test.pdf' },
    } as KeywordSearchResultItem;

    expect(SearchService.getFilePath(item)).toBe('/uploads/meta/test.pdf');
  });

  it('payload.dest_path를 반환한다 (시맨틱 검색)', () => {
    const item: SearchResultItem = {
      score: 0.9,
      payload: { dest_path: '/uploads/semantic/test.pdf' },
      meta: {},
    } as SemanticSearchResultItem;

    expect(SearchService.getFilePath(item)).toBe('/uploads/semantic/test.pdf');
  });

  it('모든 경로가 없으면 빈 문자열을 반환한다', () => {
    const item: SearchResultItem = {
      score: 0.5,
      meta: {},
    } as SemanticSearchResultItem;

    expect(SearchService.getFilePath(item)).toBe('');
  });

  it('upload 객체는 있지만 destPath가 없으면 다음 fallback을 사용한다', () => {
    const item: SearchResultItem = {
      _id: 'test',
      upload: {},
      meta: { destPath: '/uploads/meta/fallback.pdf' },
    } as KeywordSearchResultItem;

    expect(SearchService.getFilePath(item)).toBe('/uploads/meta/fallback.pdf');
  });
});

// ============================================
// getOriginalName 테스트
// ============================================
describe('SearchService.getOriginalName', () => {
  it('upload.originalName을 최우선으로 반환한다', () => {
    const item: SearchResultItem = {
      _id: 'test',
      upload: { originalName: 'upload-file.pdf' },
      meta: { originalName: 'meta-file.pdf' },
      filename: 'filename.pdf',
    } as KeywordSearchResultItem;

    expect(SearchService.getOriginalName(item)).toBe('upload-file.pdf');
  });

  it('upload.originalName이 없으면 meta.originalName을 반환한다', () => {
    const item: SearchResultItem = {
      _id: 'test',
      meta: { originalName: 'meta-file.pdf' },
      filename: 'filename.pdf',
    } as KeywordSearchResultItem;

    expect(SearchService.getOriginalName(item)).toBe('meta-file.pdf');
  });

  it('payload.original_name을 반환한다 (시맨틱 검색)', () => {
    const item: SearchResultItem = {
      score: 0.9,
      payload: { original_name: 'semantic-file.pdf' },
      meta: {},
    } as SemanticSearchResultItem;

    expect(SearchService.getOriginalName(item)).toBe('semantic-file.pdf');
  });

  it('filename을 반환한다 (fallback)', () => {
    const item: SearchResultItem = {
      _id: 'test',
      filename: 'fallback-filename.pdf',
      meta: {},
    } as KeywordSearchResultItem;

    expect(SearchService.getOriginalName(item)).toBe('fallback-filename.pdf');
  });

  it('모든 필드가 없으면 "알 수 없는 파일"을 반환한다', () => {
    const item: SearchResultItem = {
      score: 0.5,
      meta: {},
    } as SemanticSearchResultItem;

    expect(SearchService.getOriginalName(item)).toBe('알 수 없는 파일');
  });

  it('upload 객체는 있지만 originalName이 없으면 다음 fallback을 사용한다', () => {
    const item: SearchResultItem = {
      _id: 'test',
      upload: {},
      meta: { originalName: 'meta-fallback.pdf' },
    } as KeywordSearchResultItem;

    expect(SearchService.getOriginalName(item)).toBe('meta-fallback.pdf');
  });
});

// ============================================
// getSummary 테스트
// ============================================
describe('SearchService.getSummary', () => {
  it('meta.summary를 최우선으로 반환한다', () => {
    const item: SearchResultItem = {
      score: 0.9,
      meta: { summary: 'Meta summary text' },
      ocr: { summary: 'OCR summary text' },
      docsum: { summary: 'Docsum summary text' },
    } as SemanticSearchResultItem;

    expect(SearchService.getSummary(item)).toBe('Meta summary text');
  });

  it('meta.summary가 없으면 ocr.summary를 반환한다', () => {
    const item: SearchResultItem = {
      score: 0.9,
      meta: {},
      ocr: { summary: 'OCR summary text' },
      docsum: { summary: 'Docsum summary text' },
    } as SemanticSearchResultItem;

    expect(SearchService.getSummary(item)).toBe('OCR summary text');
  });

  it('docsum.summary를 반환한다 (fallback)', () => {
    const item: SearchResultItem = {
      score: 0.9,
      meta: {},
      docsum: { summary: 'Docsum summary text' },
    } as SemanticSearchResultItem;

    expect(SearchService.getSummary(item)).toBe('Docsum summary text');
  });

  it('모든 summary가 없으면 "요약 없음"을 반환한다', () => {
    const item: SearchResultItem = {
      score: 0.5,
      meta: {},
    } as SemanticSearchResultItem;

    expect(SearchService.getSummary(item)).toBe('요약 없음');
  });

  it('meta 객체는 있지만 summary가 없으면 다음 fallback을 사용한다', () => {
    const item: SearchResultItem = {
      score: 0.9,
      meta: { full_text: 'Some text' },
      ocr: { summary: 'OCR fallback summary' },
    } as SemanticSearchResultItem;

    expect(SearchService.getSummary(item)).toBe('OCR fallback summary');
  });
});

// ============================================
// getOCRConfidence 테스트
// ============================================
describe('SearchService.getOCRConfidence', () => {
  it('ocr.confidence를 반환한다', () => {
    const item: SearchResultItem = {
      score: 0.9,
      meta: {},
      ocr: { confidence: '0.955' },
    } as SemanticSearchResultItem;

    expect(SearchService.getOCRConfidence(item)).toBe(0.955);
  });

  it('ocr.confidence가 없으면 null을 반환한다', () => {
    const item: SearchResultItem = {
      score: 0.9,
      meta: {},
      ocr: {},
    } as SemanticSearchResultItem;

    expect(SearchService.getOCRConfidence(item)).toBeNull();
  });

  it('ocr 객체가 없으면 null을 반환한다', () => {
    const item: SearchResultItem = {
      score: 0.9,
      meta: {},
    } as SemanticSearchResultItem;

    expect(SearchService.getOCRConfidence(item)).toBeNull();
  });
});

// ============================================
// getDocumentId 테스트
// ============================================
describe('SearchService.getDocumentId', () => {
  it('_id를 최우선으로 반환한다 (키워드 검색)', () => {
    const item: SearchResultItem = {
      _id: 'keyword-doc-id',
      meta: {},
    } as KeywordSearchResultItem;

    expect(SearchService.getDocumentId(item)).toBe('keyword-doc-id');
  });

  it('payload.doc_id를 반환한다 (시맨틱 검색)', () => {
    const item: SearchResultItem = {
      score: 0.9,
      payload: { doc_id: 'semantic-doc-id' },
      id: 'fallback-id',
      meta: {},
    } as SemanticSearchResultItem;

    expect(SearchService.getDocumentId(item)).toBe('semantic-doc-id');
  });

  it('id를 반환한다 (fallback)', () => {
    const item: SearchResultItem = {
      score: 0.9,
      id: 'fallback-id',
      meta: {},
    } as SemanticSearchResultItem;

    expect(SearchService.getDocumentId(item)).toBe('fallback-id');
  });

  it('모든 ID가 없으면 빈 문자열을 반환한다', () => {
    const item: SearchResultItem = {
      score: 0.5,
      meta: {},
    } as SemanticSearchResultItem;

    expect(SearchService.getDocumentId(item)).toBe('');
  });

  it('payload 객체는 있지만 doc_id가 없으면 다음 fallback을 사용한다', () => {
    const item: SearchResultItem = {
      score: 0.9,
      payload: {},
      id: 'fallback-id',
      meta: {},
    } as SemanticSearchResultItem;

    expect(SearchService.getDocumentId(item)).toBe('fallback-id');
  });
});

// ============================================
// getMimeType 테스트
// ============================================
describe('SearchService.getMimeType', () => {
  it('최상위 mimeType 필드를 최우선으로 반환한다', () => {
    const item: SearchResultItem = {
      score: 0.9,
      mimeType: 'application/pdf',
      upload: { mimeType: 'image/png' },
      meta: { mimeType: 'text/plain' },
      payload: { mime_type: 'application/json' },
    } as SemanticSearchResultItem;

    expect(SearchService.getMimeType(item)).toBe('application/pdf');
  });

  it('upload.mimeType를 반환한다', () => {
    const item: SearchResultItem = {
      _id: 'test',
      upload: { mimeType: 'image/png' },
      meta: { mimeType: 'text/plain' },
    } as KeywordSearchResultItem;

    expect(SearchService.getMimeType(item)).toBe('image/png');
  });

  it('meta.mimeType를 반환한다', () => {
    const item: SearchResultItem = {
      score: 0.9,
      meta: { mimeType: 'text/plain' },
      payload: { mime_type: 'application/json' },
    } as SemanticSearchResultItem;

    expect(SearchService.getMimeType(item)).toBe('text/plain');
  });

  it('payload.mime_type을 반환한다 (시맨틱 검색)', () => {
    const item: SearchResultItem = {
      score: 0.9,
      payload: { mime_type: 'application/json' },
      meta: {},
    } as SemanticSearchResultItem;

    expect(SearchService.getMimeType(item)).toBe('application/json');
  });

  it('모든 MIME 타입이 없으면 undefined를 반환한다', () => {
    const item: SearchResultItem = {
      score: 0.5,
      meta: {},
    } as SemanticSearchResultItem;

    expect(SearchService.getMimeType(item)).toBeUndefined();
  });

  it('upload 객체는 있지만 mimeType이 없으면 다음 fallback을 사용한다', () => {
    const item: SearchResultItem = {
      _id: 'test',
      upload: {},
      meta: { mimeType: 'text/plain' },
    } as KeywordSearchResultItem;

    expect(SearchService.getMimeType(item)).toBe('text/plain');
  });
});

// ============================================
// 실제 데이터 통합 테스트
// ============================================
describe('SearchService - 실제 데이터 통합 테스트', () => {
  it('시맨틱 검색 아이템의 모든 메서드가 올바르게 작동한다', () => {
    expect(SearchService.getFilePath(mockSemanticItem)).toBe('/uploads/meta/test.pdf');
    expect(SearchService.getOriginalName(mockSemanticItem)).toBe('test-meta.pdf');
    expect(SearchService.getSummary(mockSemanticItem)).toBe('This is a meta summary');
    expect(SearchService.getOCRConfidence(mockSemanticItem)).toBe(0.955);
    expect(SearchService.getDocumentId(mockSemanticItem)).toBe('doc-123');
    expect(SearchService.getMimeType(mockSemanticItem)).toBe('application/pdf');
  });

  it('키워드 검색 아이템의 모든 메서드가 올바르게 작동한다', () => {
    expect(SearchService.getFilePath(mockKeywordItem)).toBe('/uploads/upload/test.pdf');
    expect(SearchService.getOriginalName(mockKeywordItem)).toBe('test-upload.pdf');
    expect(SearchService.getSummary(mockKeywordItem)).toBe('This is a keyword meta summary');
    expect(SearchService.getOCRConfidence(mockKeywordItem)).toBe(0.923);
    expect(SearchService.getDocumentId(mockKeywordItem)).toBe('keyword-doc-1');
    expect(SearchService.getMimeType(mockKeywordItem)).toBe('application/pdf');
  });

  it('최소한의 정보만 있는 아이템도 올바르게 처리한다', () => {
    expect(SearchService.getFilePath(mockMinimalItem)).toBe('');
    expect(SearchService.getOriginalName(mockMinimalItem)).toBe('알 수 없는 파일');
    expect(SearchService.getSummary(mockMinimalItem)).toBe('요약 없음');
    expect(SearchService.getOCRConfidence(mockMinimalItem)).toBeNull();
    expect(SearchService.getDocumentId(mockMinimalItem)).toBe('');
    expect(SearchService.getMimeType(mockMinimalItem)).toBeUndefined();
  });

  it('docsum이 있는 아이템의 summary를 올바르게 추출한다', () => {
    expect(SearchService.getSummary(mockItemWithDocsum)).toBe('This is a docsum summary');
  });
});

// ============================================
// 엣지 케이스 테스트
// ============================================
describe('SearchService - 엣지 케이스', () => {
  it('빈 문자열 값들도 올바르게 처리한다', () => {
    const item: SearchResultItem = {
      _id: '',
      filename: '',
      upload: { originalName: '', destPath: '' },
      meta: { summary: '', mimeType: '' },
      ocr: { confidence: '' },
    } as KeywordSearchResultItem;

    // 빈 문자열은 falsy이므로 fallback으로 이동
    expect(SearchService.getDocumentId(item)).toBe('');
    expect(SearchService.getOriginalName(item)).toBe('알 수 없는 파일');
    expect(SearchService.getFilePath(item)).toBe('');
    expect(SearchService.getSummary(item)).toBe('요약 없음');
    // 빈 문자열 confidence는 falsy이므로 || null이 null을 반환
    expect(SearchService.getOCRConfidence(item)).toBeNull();
    // 빈 문자열 mimeType은 falsy이므로 다음 fallback으로 이동하고 최종적으로 undefined
    expect(SearchService.getMimeType(item)).toBeUndefined();
  });

  it('null 값들도 올바르게 처리한다', () => {
    const item = {
      score: 0.5,
      meta: null,
      ocr: null,
      payload: null,
    } as unknown as SearchResultItem;

    expect(SearchService.getDocumentId(item)).toBe('');
    expect(SearchService.getOriginalName(item)).toBe('알 수 없는 파일');
    expect(SearchService.getFilePath(item)).toBe('');
    expect(SearchService.getSummary(item)).toBe('요약 없음');
    expect(SearchService.getOCRConfidence(item)).toBeNull();
    expect(SearchService.getMimeType(item)).toBeUndefined();
  });

  it('특수 문자가 포함된 값들도 올바르게 처리한다', () => {
    const item: SearchResultItem = {
      _id: 'doc-with-特殊字符-🎯',
      filename: '파일명(특수).pdf',
      meta: { summary: '요약 <태그> & "인용"', originalName: '파일명(특수).pdf' },
    } as KeywordSearchResultItem;

    expect(SearchService.getDocumentId(item)).toBe('doc-with-特殊字符-🎯');
    expect(SearchService.getOriginalName(item)).toBe('파일명(특수).pdf');
    expect(SearchService.getSummary(item)).toBe('요약 <태그> & "인용"');
  });

  it('매우 긴 문자열도 올바르게 처리한다', () => {
    const longText = 'A'.repeat(10000);
    const item: SearchResultItem = {
      _id: longText,
      meta: { summary: longText },
    } as KeywordSearchResultItem;

    expect(SearchService.getDocumentId(item)).toBe(longText);
    expect(SearchService.getSummary(item)).toBe(longText);
  });
});

// ============================================
// searchDocuments API 테스트
// ============================================
describe('SearchService.searchDocuments', () => {
  // Mock localStorage
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      clear: () => {
        store = {};
      },
    };
  })();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    localStorageMock.clear();
    global.localStorage = localStorageMock as Storage;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('키워드 검색을 성공적으로 수행한다', async () => {
    const mockResponse = {
      search_results: [
        { _id: 'doc1', filename: 'test.pdf' },
        { _id: 'doc2', filename: 'test2.pdf' }
      ],
      answer: '검색 결과'
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    } as Response);

    const result = await SearchService.searchDocuments({
      query: '테스트',
      search_mode: 'keyword',
      mode: 'AND'
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://tars.giize.com/search_api',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: '테스트',
          search_mode: 'keyword',
          mode: 'AND',
          user_id: 'tester'
        })
      }
    );

    expect(result.search_results).toHaveLength(2);
    expect(result.answer).toBe('검색 결과');
    expect(result.search_mode).toBe('keyword');
  });

  it('시맨틱 검색은 raw 결과만 반환한다 (enrichment 없음)', async () => {
    const mockSearchResponse = {
      search_results: [
        {
          id: 'semantic1',
          score: 0.95,
          payload: {
            doc_id: 'doc123',
            original_name: 'test.pdf',
            owner_id: 'tester'
          }
        }
      ],
      answer: 'AI 답변'
    };

    // 시맨틱 검색 API 호출 1회만
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSearchResponse
    } as Response);

    const result = await SearchService.searchDocuments({
      query: '시맨틱 테스트',
      search_mode: 'semantic'
    });

    // enrichment 없이 fetch 1회만 호출
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.search_results).toHaveLength(1);
    // raw payload가 그대로 반환됨
    expect((result.search_results[0] as any).payload).toHaveProperty('owner_id', 'tester');
    expect((result.search_results[0] as any).payload).toHaveProperty('doc_id', 'doc123');
    expect(result.search_mode).toBe('semantic');
  });

  it('API 호출 실패 시 에러를 던진다', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500
    } as Response);

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      SearchService.searchDocuments({
        query: '테스트',
        search_mode: 'keyword'
      })
    ).rejects.toThrow('검색 API 호출 실패: 500');

    consoleError.mockRestore();
  });

  it('네트워크 오류 시 에러를 던진다', async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'));

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      SearchService.searchDocuments({
        query: '테스트',
        search_mode: 'keyword'
      })
    ).rejects.toThrow('Network error');

    consoleError.mockRestore();
  });

  it('answer가 없으면 null을 반환한다', async () => {
    const mockResponse = {
      search_results: [{ _id: 'doc1' }]
      // answer 필드 없음
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    } as Response);

    const result = await SearchService.searchDocuments({
      query: '테스트',
      search_mode: 'keyword'
    });

    expect(result.answer).toBeNull();
  });

  it('search_results가 없으면 빈 배열을 반환한다', async () => {
    const mockResponse = {
      answer: '답변만 있음'
      // search_results 필드 없음
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    } as Response);

    const result = await SearchService.searchDocuments({
      query: '테스트',
      search_mode: 'keyword'
    });

    expect(result.search_results).toEqual([]);
  });
});

// ============================================
// getDocumentDetails API 테스트
// ============================================
describe('SearchService.getDocumentDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('문서 상세 정보를 성공적으로 가져온다', async () => {
    const mockDetailResponse = [
      {
        _id: 'doc123',
        upload: { originalName: 'test.pdf' },
        meta: { summary: 'Test summary' }
      }
    ];

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockDetailResponse
    } as Response);

    const result = await SearchService.getDocumentDetails('doc123');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/n8n/smartsearch',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'doc123' })
      }
    );

    expect(result).toEqual(mockDetailResponse[0]);
  });

  it('API 호출 실패 시 null을 반환한다', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 404
    } as Response);

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await SearchService.getDocumentDetails('nonexistent');

    expect(result).toBeNull();
    consoleError.mockRestore();
  });

  it('네트워크 오류 시 null을 반환한다', async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'));

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await SearchService.getDocumentDetails('doc123');

    expect(result).toBeNull();
    consoleError.mockRestore();
  });

  it('빈 배열 응답 시 null을 반환한다', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => []
    } as Response);

    const result = await SearchService.getDocumentDetails('doc123');

    expect(result).toBeNull();
  });

  it('null 응답 시 null을 반환한다', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => null
    } as Response);

    const result = await SearchService.getDocumentDetails('doc123');

    expect(result).toBeNull();
  });
});

// ============================================
// 사용자 격리 (user_id 필터) 테스트
// ============================================
describe('SearchService - 사용자 격리', () => {
  // Mock localStorage
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      clear: () => {
        store = {};
      },
    };
  })();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    localStorageMock.clear();
    global.localStorage = localStorageMock as Storage;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('키워드 검색 시 localStorage에서 user_id를 읽어 쿼리에 포함해야 한다', async () => {
    localStorage.setItem('aims-current-user-id', 'agent123');

    const mockResponse = {
      search_results: [{ _id: 'doc1', filename: 'test.pdf' }],
      answer: '검색 결과'
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    } as Response);

    await SearchService.searchDocuments({
      query: '키워드 테스트',
      search_mode: 'keyword',
      mode: 'AND'
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://tars.giize.com/search_api',
      expect.objectContaining({
        body: JSON.stringify({
          query: '키워드 테스트',
          search_mode: 'keyword',
          mode: 'AND',
          user_id: 'agent123'
        })
      })
    );
  });

  it('시맨틱 검색 시 localStorage에서 user_id를 읽어 쿼리에 포함해야 한다', async () => {
    localStorage.setItem('aims-current-user-id', 'agent456');

    const mockSearchResponse = {
      search_results: [
        {
          id: 'semantic1',
          score: 0.95,
          payload: {
            doc_id: 'doc789',
            original_name: 'semantic.pdf',
            owner_id: 'agent456'
          }
        }
      ],
      answer: 'AI 답변'
    };

    const mockMongoDBResponse = {
      success: true,
      data: {
        raw: {
          meta: { summary: 'Summary text' },
          ocr: null,
          customer_relation: null
        },
        computed: {
          overallStatus: 'completed'
        }
      }
    };

    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResponse
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockMongoDBResponse
      } as Response);

    await SearchService.searchDocuments({
      query: '시맨틱 테스트',
      search_mode: 'semantic'
    });

    // 첫 번째 호출: 시맨틱 검색 API
    expect(vi.mocked(global.fetch).mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({
        query: '시맨틱 테스트',
        search_mode: 'semantic',
        user_id: 'agent456'
      })
    );
  });

  it('localStorage에 user_id가 없으면 "tester"를 기본값으로 사용해야 한다', async () => {
    // localStorage에 사용자 ID 없음

    const mockResponse = {
      search_results: [],
      answer: null
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    } as Response);

    await SearchService.searchDocuments({
      query: '기본 사용자 테스트',
      search_mode: 'keyword'
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://tars.giize.com/search_api',
      expect.objectContaining({
        body: JSON.stringify({
          query: '기본 사용자 테스트',
          search_mode: 'keyword',
          user_id: 'tester'
        })
      })
    );
  });

  it('사용자 ID가 변경되면 새로운 user_id로 검색해야 한다', async () => {
    const mockResponse = {
      search_results: [],
      answer: null
    };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    } as Response);

    // 첫 번째 사용자로 검색
    localStorage.setItem('aims-current-user-id', 'user1');
    await SearchService.searchDocuments({
      query: 'test1',
      search_mode: 'keyword'
    });

    expect(vi.mocked(global.fetch).mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({
        query: 'test1',
        search_mode: 'keyword',
        user_id: 'user1'
      })
    );

    // 사용자 전환 후 검색
    localStorage.setItem('aims-current-user-id', 'user2');
    await SearchService.searchDocuments({
      query: 'test2',
      search_mode: 'keyword'
    });

    expect(vi.mocked(global.fetch).mock.calls[1]?.[1]?.body).toBe(
      JSON.stringify({
        query: 'test2',
        search_mode: 'keyword',
        user_id: 'user2'
      })
    );
  });
});
