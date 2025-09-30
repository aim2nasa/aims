/**
 * AIMS UIX-3 Documents Controller
 * @since 2025-09-30
 * @version 1.0.0
 *
 * 문서 관리 비즈니스 로직을 담당하는 Controller Hook
 * ARCHITECTURE.md의 Controller 레이어 패턴을 따름
 * Document-Controller-View 분리 구현
 */

import { useState, useCallback, useEffect } from 'react';
import { DocumentService } from '@/services/documentService';
import { handleApiError } from '@/shared/lib/api';
import type { Document, DocumentSearchQuery } from '@/entities/document';

/**
 * 문서 관리 Controller Hook
 * 모든 비즈니스 로직과 이벤트 핸들링을 담당
 */
export const useDocumentsController = () => {
  // 상태 관리
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchParams, setSearchParams] = useState<Partial<DocumentSearchQuery>>({
    limit: 10,
    offset: 0,
    sortBy: 'uploadDate',
    sortOrder: 'desc',
  });
  const [currentPage, setCurrentPage] = useState(1);

  /**
   * 문서 목록 로드
   */
  const loadDocuments = useCallback(async (params?: Partial<DocumentSearchQuery>) => {
    try {
      setIsLoading(true);
      setError(null);

      const finalParams = { ...searchParams, ...params };
      const result = searchQuery.trim()
        ? await DocumentService.searchDocuments(searchQuery, finalParams)
        : await DocumentService.getDocuments(finalParams);

      setDocuments(result.documents);
      setTotal(result.total);
      setHasMore(result.hasMore);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, searchParams]);

  /**
   * 더 많은 문서 로드 (페이지네이션)
   */
  const loadMoreDocuments = useCallback(async () => {
    if (isLoading || !hasMore) return;

    const newParams = {
      ...searchParams,
      offset: (searchParams.offset || 0) + (searchParams.limit || 10),
    };

    try {
      setIsLoading(true);
      const result = searchQuery.trim()
        ? await DocumentService.searchDocuments(searchQuery, newParams)
        : await DocumentService.getDocuments(newParams);

      setDocuments(prev => [...prev, ...result.documents]);
      setTotal(result.total);
      setHasMore(result.hasMore);
      setSearchParams(newParams);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, hasMore, documents, searchQuery, searchParams]);

  /**
   * 검색어 변경 핸들러
   */
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setSearchParams(prev => ({ ...prev, offset: 0 }));
    setCurrentPage(1);
  }, []);

  /**
   * 페이지 변경 핸들러
   */
  const handlePageChange = useCallback((page: number) => {
    const newOffset = (page - 1) * (searchParams.limit || 20);
    setCurrentPage(page);
    setSearchParams(prev => ({ ...prev, offset: newOffset }));
    loadDocuments({ offset: newOffset });
  }, [searchParams.limit, loadDocuments]);

  /**
   * 검색 실행
   */
  const handleSearch = useCallback(() => {
    loadDocuments({ offset: 0 });
  }, [loadDocuments]);

  /**
   * 문서 삭제
   */
  const deleteDocument = useCallback(async (id: string) => {
    try {
      setIsLoading(true);
      setError(null);

      await DocumentService.deleteDocument(id);
      setDocuments(prev => prev.filter(doc => doc._id !== id));
      setTotal(prev => prev - 1);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * 에러 해제
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * 초기 데이터 로딩
   */
  useEffect(() => {
    if (documents.length === 0) {
      loadDocuments();
    }
  }, [loadDocuments, documents.length]);

  /**
   * 검색어 변경 시 디바운스 적용하여 재로딩
   */
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery !== '') {
        handleSearch();
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, handleSearch]);

  // 페이지네이션 계산
  const itemsPerPage = searchParams.limit || 10;
  const totalPages = Math.ceil(total / itemsPerPage);

  return {
    // 상태
    documents,
    isLoading,
    error,
    total,
    hasMore,
    searchQuery,
    currentPage,
    totalPages,
    itemsPerPage,

    // 액션
    loadDocuments,
    loadMoreDocuments,
    deleteDocument,
    handleSearchChange,
    handleSearch,
    handlePageChange,
    clearError,

    // 계산된 값
    isEmpty: !isLoading && documents.length === 0,
    searchResultMessage: searchQuery.trim()
      ? `"${searchQuery}" 검색 결과: ${total.toLocaleString()}개`
      : `총 ${total.toLocaleString()}개의 문서`,
  };
};

export default useDocumentsController;