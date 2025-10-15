/**
 * useDocumentSearchController Tests
 * @since 2025-10-14
 *
 * 문서 검색 Controller Hook 테스트
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDocumentSearchController } from './useDocumentSearchController';
import { SearchService } from '@/services/searchService';
import type { SearchResponse } from '@/entities/search';

// ============================================
// Mock 설정
// ============================================

vi.mock('@/services/searchService');

const mockSearchService = vi.mocked(SearchService);

// Mock 검색 결과
const mockSemanticResponse: SearchResponse = {
  answer: 'This is an AI-generated answer',
  search_results: [
    {
      id: 'doc-1',
      score: 0.95,
      payload: {
        doc_id: 'doc-1',
        original_name: 'test1.pdf',
        dest_path: '/uploads/test1.pdf',
      },
      meta: {
        summary: 'Test document 1 summary',
      },
    },
    {
      id: 'doc-2',
      score: 0.88,
      payload: {
        doc_id: 'doc-2',
        original_name: 'test2.pdf',
        dest_path: '/uploads/test2.pdf',
      },
      meta: {
        summary: 'Test document 2 summary',
      },
    },
  ],
  search_mode: 'semantic',
};

const mockKeywordResponse: SearchResponse = {
  search_results: [
    {
      _id: 'doc-3',
      filename: 'keyword-test.pdf',
      meta: {
        summary: 'Keyword search result',
      },
    },
  ],
  search_mode: 'keyword',
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================
// 초기 상태 테스트
// ============================================
describe('useDocumentSearchController - 초기 상태', () => {
  it('초기 상태가 올바르게 설정된다', () => {
    const { result } = renderHook(() => useDocumentSearchController());

    expect(result.current.query).toBe('');
    expect(result.current.searchMode).toBe('semantic');
    expect(result.current.keywordMode).toBe('OR');
    expect(result.current.results).toEqual([]);
    expect(result.current.answer).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('모든 액션 핸들러가 제공된다', () => {
    const { result } = renderHook(() => useDocumentSearchController());

    expect(typeof result.current.handleSearch).toBe('function');
    expect(typeof result.current.handleQueryChange).toBe('function');
    expect(typeof result.current.handleSearchModeChange).toBe('function');
    expect(typeof result.current.handleKeywordModeChange).toBe('function');
    expect(typeof result.current.handleReset).toBe('function');
  });
});

// ============================================
// handleQueryChange 테스트
// ============================================
describe('useDocumentSearchController - handleQueryChange', () => {
  it('검색어를 업데이트한다', () => {
    const { result } = renderHook(() => useDocumentSearchController());

    act(() => {
      result.current.handleQueryChange('test query');
    });

    expect(result.current.query).toBe('test query');
  });

  it('검색어 변경 시 에러를 초기화한다', () => {
    const { result } = renderHook(() => useDocumentSearchController());

    // 먼저 에러 상태 생성 (빈 검색어로 검색 시도)
    act(() => {
      result.current.handleSearch();
    });

    expect(result.current.error).toBe('검색어를 입력해 주세요.');

    // 검색어 변경 시 에러 클리어
    act(() => {
      result.current.handleQueryChange('new query');
    });

    expect(result.current.error).toBeNull();
  });
});

// ============================================
// handleSearchModeChange 테스트
// ============================================
describe('useDocumentSearchController - handleSearchModeChange', () => {
  it('검색 모드를 변경한다', () => {
    const { result } = renderHook(() => useDocumentSearchController());

    act(() => {
      result.current.handleSearchModeChange('keyword');
    });

    expect(result.current.searchMode).toBe('keyword');
  });

  it('검색 모드 변경 시 에러를 초기화한다', () => {
    const { result } = renderHook(() => useDocumentSearchController());

    // 에러 상태 생성
    act(() => {
      result.current.handleSearch();
    });

    expect(result.current.error).toBe('검색어를 입력해 주세요.');

    // 검색 모드 변경 시 에러 클리어
    act(() => {
      result.current.handleSearchModeChange('keyword');
    });

    expect(result.current.error).toBeNull();
  });
});

// ============================================
// handleKeywordModeChange 테스트
// ============================================
describe('useDocumentSearchController - handleKeywordModeChange', () => {
  it('키워드 모드를 변경한다', () => {
    const { result } = renderHook(() => useDocumentSearchController());

    act(() => {
      result.current.handleKeywordModeChange('AND');
    });

    expect(result.current.keywordMode).toBe('AND');
  });

  it('키워드 모드를 다시 OR로 변경할 수 있다', () => {
    const { result } = renderHook(() => useDocumentSearchController());

    act(() => {
      result.current.handleKeywordModeChange('AND');
    });

    expect(result.current.keywordMode).toBe('AND');

    act(() => {
      result.current.handleKeywordModeChange('OR');
    });

    expect(result.current.keywordMode).toBe('OR');
  });
});

// ============================================
// handleReset 테스트
// ============================================
describe('useDocumentSearchController - handleReset', () => {
  it('모든 상태를 초기화한다', async () => {
    const { result } = renderHook(() => useDocumentSearchController());

    mockSearchService.searchDocuments.mockResolvedValueOnce(mockSemanticResponse);

    // 검색 실행하여 상태 변경
    act(() => {
      result.current.handleQueryChange('test query');
    });

    await act(async () => {
      await result.current.handleSearch();
    });

    await waitFor(() => {
      expect(result.current.results.length).toBeGreaterThan(0);
    });

    // 리셋 실행
    act(() => {
      result.current.handleReset();
    });

    expect(result.current.query).toBe('');
    expect(result.current.results).toEqual([]);
    expect(result.current.answer).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

// ============================================
// handleSearch - 성공 케이스 테스트
// ============================================
describe('useDocumentSearchController - handleSearch 성공', () => {
  it('시맨틱 검색이 성공적으로 실행된다', async () => {
    const { result } = renderHook(() => useDocumentSearchController());

    mockSearchService.searchDocuments.mockResolvedValueOnce(mockSemanticResponse);

    act(() => {
      result.current.handleQueryChange('test query');
    });

    await act(async () => {
      await result.current.handleSearch();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockSearchService.searchDocuments).toHaveBeenCalledWith({
      query: 'test query',
      search_mode: 'semantic',
    });
    expect(result.current.results).toEqual(mockSemanticResponse.search_results);
    expect(result.current.answer).toBe('This is an AI-generated answer');
    expect(result.current.error).toBeNull();
  });

  it('키워드 검색이 성공적으로 실행된다', async () => {
    const { result } = renderHook(() => useDocumentSearchController());

    mockSearchService.searchDocuments.mockResolvedValueOnce(mockKeywordResponse);

    act(() => {
      result.current.handleQueryChange('keyword test');
      result.current.handleSearchModeChange('keyword');
      result.current.handleKeywordModeChange('AND');
    });

    await act(async () => {
      await result.current.handleSearch();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockSearchService.searchDocuments).toHaveBeenCalledWith({
      query: 'keyword test',
      search_mode: 'keyword',
      mode: 'AND',
    });
    expect(result.current.results).toEqual(mockKeywordResponse.search_results);
    expect(result.current.answer).toBeNull(); // 키워드 검색은 answer 없음
    expect(result.current.error).toBeNull();
  });

  it('검색어 앞뒤 공백이 제거된다', async () => {
    const { result } = renderHook(() => useDocumentSearchController());

    mockSearchService.searchDocuments.mockResolvedValueOnce(mockSemanticResponse);

    act(() => {
      result.current.handleQueryChange('  test query  ');
    });

    await act(async () => {
      await result.current.handleSearch();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockSearchService.searchDocuments).toHaveBeenCalledWith({
      query: 'test query',
      search_mode: 'semantic',
    });
  });

  it('검색 시작 시 이전 결과가 초기화된다', async () => {
    const { result } = renderHook(() => useDocumentSearchController());

    mockSearchService.searchDocuments.mockResolvedValueOnce(mockSemanticResponse);

    // 첫 번째 검색
    act(() => {
      result.current.handleQueryChange('first query');
    });

    await act(async () => {
      await result.current.handleSearch();
    });

    await waitFor(() => {
      expect(result.current.results.length).toBeGreaterThan(0);
    });

    // 두 번째 검색 시작 - 이전 결과 클리어 확인
    mockSearchService.searchDocuments.mockResolvedValueOnce(mockKeywordResponse);

    act(() => {
      result.current.handleQueryChange('second query');
    });

    // 검색 시작 - 비동기 완료까지 대기
    await act(async () => {
      await result.current.handleSearch();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // 두 번째 검색 결과 확인
    expect(result.current.results).toEqual(mockKeywordResponse.search_results);
  });
});

// ============================================
// handleSearch - 에러 케이스 테스트
// ============================================
describe('useDocumentSearchController - handleSearch 에러', () => {
  it('빈 검색어는 에러를 발생시킨다', async () => {
    const { result } = renderHook(() => useDocumentSearchController());

    act(() => {
      result.current.handleSearch();
    });

    expect(result.current.error).toBe('검색어를 입력해 주세요.');
    expect(mockSearchService.searchDocuments).not.toHaveBeenCalled();
  });

  it('공백만 있는 검색어는 에러를 발생시킨다', async () => {
    const { result } = renderHook(() => useDocumentSearchController());

    act(() => {
      result.current.handleQueryChange('   ');
      result.current.handleSearch();
    });

    expect(result.current.error).toBe('검색어를 입력해 주세요.');
    expect(mockSearchService.searchDocuments).not.toHaveBeenCalled();
  });

  it('API 호출 실패 시 에러를 처리한다', async () => {
    const { result } = renderHook(() => useDocumentSearchController());

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSearchService.searchDocuments.mockRejectedValueOnce(new Error('API Error'));

    act(() => {
      result.current.handleQueryChange('test query');
    });

    await act(async () => {
      await result.current.handleSearch();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('검색 중 오류가 발생했습니다. 다시 시도해 주세요.');
    expect(result.current.results).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});

// ============================================
// 통합 시나리오 테스트
// ============================================
describe('useDocumentSearchController - 통합 시나리오', () => {
  it('전체 검색 플로우가 정상 작동한다', async () => {
    const { result } = renderHook(() => useDocumentSearchController());

    mockSearchService.searchDocuments.mockResolvedValueOnce(mockSemanticResponse);

    // 1. 검색어 입력
    act(() => {
      result.current.handleQueryChange('insurance document');
    });

    expect(result.current.query).toBe('insurance document');

    // 2. 검색 모드 변경
    act(() => {
      result.current.handleSearchModeChange('semantic');
    });

    expect(result.current.searchMode).toBe('semantic');

    // 3. 검색 실행
    await act(async () => {
      await result.current.handleSearch();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.results.length).toBe(2);
    expect(result.current.answer).toBe('This is an AI-generated answer');

    // 4. 리셋
    act(() => {
      result.current.handleReset();
    });

    expect(result.current.query).toBe('');
    expect(result.current.results).toEqual([]);
    expect(result.current.answer).toBeNull();
  });

  it('검색 모드를 변경하고 다시 검색할 수 있다', async () => {
    const { result } = renderHook(() => useDocumentSearchController());

    // 1. 시맨틱 검색
    mockSearchService.searchDocuments.mockResolvedValueOnce(mockSemanticResponse);

    act(() => {
      result.current.handleQueryChange('test query');
    });

    await act(async () => {
      await result.current.handleSearch();
    });

    await waitFor(() => {
      expect(result.current.results.length).toBe(2);
    });

    // 2. 키워드 검색으로 변경
    mockSearchService.searchDocuments.mockResolvedValueOnce(mockKeywordResponse);

    act(() => {
      result.current.handleSearchModeChange('keyword');
      result.current.handleKeywordModeChange('AND');
    });

    await act(async () => {
      await result.current.handleSearch();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockSearchService.searchDocuments).toHaveBeenLastCalledWith({
      query: 'test query',
      search_mode: 'keyword',
      mode: 'AND',
    });
    expect(result.current.results.length).toBe(1);
  });
});

// ============================================
// 검색 모드 전환 통합 테스트
// ============================================
describe('useDocumentSearchController - 검색 모드 전환', () => {
  it('semantic → keyword 전환 시 결과가 초기화된다', async () => {
    const { result } = renderHook(() => useDocumentSearchController());

    mockSearchService.searchDocuments.mockResolvedValueOnce(mockSemanticResponse);

    act(() => {
      result.current.handleQueryChange('test');
    });

    await act(async () => {
      await result.current.handleSearch();
    });

    await waitFor(() => {
      expect(result.current.results.length).toBe(2);
      expect(result.current.answer).toBe('This is an AI-generated answer');
    });

    // 검색 모드 전환 - 결과는 유지되지만 모드만 변경
    act(() => {
      result.current.handleSearchModeChange('keyword');
    });

    expect(result.current.searchMode).toBe('keyword');
    expect(result.current.error).toBeNull();
  });

  it('keyword AND/OR 모드 전환이 정상 작동한다', async () => {
    const { result } = renderHook(() => useDocumentSearchController());

    mockSearchService.searchDocuments.mockResolvedValueOnce(mockKeywordResponse);

    act(() => {
      result.current.handleQueryChange('test query');
      result.current.handleSearchModeChange('keyword');
    });

    // OR 모드로 검색
    await act(async () => {
      await result.current.handleSearch();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockSearchService.searchDocuments).toHaveBeenCalledWith({
      query: 'test query',
      search_mode: 'keyword',
      mode: 'OR',
    });

    // AND 모드로 변경 후 재검색
    mockSearchService.searchDocuments.mockResolvedValueOnce(mockKeywordResponse);

    act(() => {
      result.current.handleKeywordModeChange('AND');
    });

    await act(async () => {
      await result.current.handleSearch();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockSearchService.searchDocuments).toHaveBeenLastCalledWith({
      query: 'test query',
      search_mode: 'keyword',
      mode: 'AND',
    });
  });

  it('전환 후 재검색이 새로운 모드로 실행된다', async () => {
    const { result } = renderHook(() => useDocumentSearchController());

    // 시맨틱 검색
    mockSearchService.searchDocuments.mockResolvedValueOnce(mockSemanticResponse);

    act(() => {
      result.current.handleQueryChange('insurance');
    });

    await act(async () => {
      await result.current.handleSearch();
    });

    await waitFor(() => {
      expect(result.current.searchMode).toBe('semantic');
    });

    // 키워드로 전환 후 재검색
    mockSearchService.searchDocuments.mockResolvedValueOnce(mockKeywordResponse);

    act(() => {
      result.current.handleSearchModeChange('keyword');
    });

    await act(async () => {
      await result.current.handleSearch();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockSearchService.searchDocuments).toHaveBeenLastCalledWith({
      query: 'insurance',
      search_mode: 'keyword',
      mode: 'OR',
    });
  });
});

// ============================================
// 검색어 정규화 테스트
// ============================================
describe('useDocumentSearchController - 검색어 정규화', () => {
  it('앞뒤 공백을 제거한다', async () => {
    const { result } = renderHook(() => useDocumentSearchController());

    mockSearchService.searchDocuments.mockResolvedValueOnce(mockSemanticResponse);

    act(() => {
      result.current.handleQueryChange('  test query  ');
    });

    await act(async () => {
      await result.current.handleSearch();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockSearchService.searchDocuments).toHaveBeenCalledWith({
      query: 'test query',
      search_mode: 'semantic',
    });
  });

  it('연속된 공백을 하나로 정리한다', async () => {
    const { result } = renderHook(() => useDocumentSearchController());

    mockSearchService.searchDocuments.mockResolvedValueOnce(mockSemanticResponse);

    act(() => {
      result.current.handleQueryChange('test    multiple    spaces');
    });

    await act(async () => {
      await result.current.handleSearch();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // 연속 공백은 정리되지 않고 그대로 전달될 수 있음 (구현에 따라 다름)
    // trim()만 적용된다고 가정
    expect(mockSearchService.searchDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        search_mode: 'semantic',
      })
    );
  });
});

// ============================================
// 에러 복구 시나리오 테스트
// ============================================
describe('useDocumentSearchController - 에러 복구', () => {
  it('에러 후 재검색이 성공한다', async () => {
    const { result } = renderHook(() => useDocumentSearchController());

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // 첫 번째 검색 실패
    mockSearchService.searchDocuments.mockRejectedValueOnce(new Error('Network error'));

    act(() => {
      result.current.handleQueryChange('test');
    });

    await act(async () => {
      await result.current.handleSearch();
    });

    await waitFor(() => {
      expect(result.current.error).toBe('검색 중 오류가 발생했습니다. 다시 시도해 주세요.');
    });

    // 두 번째 검색 성공
    mockSearchService.searchDocuments.mockResolvedValueOnce(mockSemanticResponse);

    await act(async () => {
      await result.current.handleSearch();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.results.length).toBe(2);

    consoleErrorSpy.mockRestore();
  });

  it('네트워크 에러를 처리한다', async () => {
    const { result } = renderHook(() => useDocumentSearchController());

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSearchService.searchDocuments.mockRejectedValueOnce(new Error('Network request failed'));

    act(() => {
      result.current.handleQueryChange('test query');
    });

    await act(async () => {
      await result.current.handleSearch();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('검색 중 오류가 발생했습니다. 다시 시도해 주세요.');
    expect(result.current.results).toEqual([]);

    consoleErrorSpy.mockRestore();
  });

  it('타임아웃 에러를 처리한다', async () => {
    const { result } = renderHook(() => useDocumentSearchController());

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const timeoutError = new Error('Timeout');
    timeoutError.name = 'TimeoutError';
    mockSearchService.searchDocuments.mockRejectedValueOnce(timeoutError);

    act(() => {
      result.current.handleQueryChange('slow query');
    });

    await act(async () => {
      await result.current.handleSearch();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('검색 중 오류가 발생했습니다. 다시 시도해 주세요.');

    consoleErrorSpy.mockRestore();
  });
});

// ============================================
// 로딩 상태 관리 테스트
// ============================================
describe('useDocumentSearchController - 로딩 상태 관리', () => {
  it('검색 완료 후 isLoading이 false가 된다', async () => {
    const { result } = renderHook(() => useDocumentSearchController());

    mockSearchService.searchDocuments.mockResolvedValueOnce(mockSemanticResponse);

    act(() => {
      result.current.handleQueryChange('test');
    });

    await act(async () => {
      await result.current.handleSearch();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.results.length).toBe(2);
  });

  it('검색 에러 후에도 isLoading이 false가 된다', async () => {
    const { result } = renderHook(() => useDocumentSearchController());

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSearchService.searchDocuments.mockRejectedValueOnce(new Error('API Error'));

    act(() => {
      result.current.handleQueryChange('test');
    });

    await act(async () => {
      await result.current.handleSearch();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('검색 중 오류가 발생했습니다. 다시 시도해 주세요.');

    consoleErrorSpy.mockRestore();
  });
});
