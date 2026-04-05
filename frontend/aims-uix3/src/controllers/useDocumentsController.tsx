/* eslint-disable @typescript-eslint/no-explicit-any -- API 응답 타입 캐스팅 */
/**
 * AIMS UIX-3 Documents Controller
 * @since 2025-09-30
 * @version 1.0.0
 *
 * 문서 관리 비즈니스 로직을 담당하는 Controller Hook
 * ARCHITECTURE.md의 Controller 레이어 패턴을 따름
 * Document-Controller-View 분리 구현
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { DocumentService } from '@/services/DocumentService';
import { handleApiError } from '@/shared/lib/api';
import { usePersistedState } from '@/hooks/usePersistedState';
import type { Document, DocumentSearchQuery } from '@/entities/document';

/**
 * 문서 관리 Controller Hook
 * 모든 비즈니스 로직과 이벤트 핸들링을 담당
 */
export const useDocumentsController = () => {
  // F5 이후에도 유지되는 상태들
  const [searchQuery, setSearchQuery] = usePersistedState('document-library-search', '');
  const [searchParams, setSearchParams] = usePersistedState<Partial<DocumentSearchQuery>>('document-library-params', {
    limit: 10,
    offset: 0,
    sortBy: 'uploadDate',
    sortOrder: 'desc',
  });
  const [currentPage, setCurrentPage] = usePersistedState('document-library-page', 1);

  // 임시 상태들 (새로고침 시 초기화되어도 됨)
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true); // 초기 로딩 상태
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  /**
   * 문서 목록 로드
   * @param params 검색 파라미터
   * @param silent true일 경우 로딩 상태를 변경하지 않음 (백그라운드 업데이트)
   */
  const loadDocuments = useCallback(async (params: Partial<DocumentSearchQuery>, silent = false) => {
    try {
      if (!silent) {
        setIsLoading(true);
      }
      setError(null);

      // DocumentService를 사용하여 문서 가져오기 (문서 라이브러리용)
      // 사용자가 선택한 limit 값을 백엔드에 전달
      const queryParams = { ...params };

      // 검색어를 params에 추가 (백엔드가 처리)
      if (searchQuery.trim()) {
        queryParams.q = searchQuery.trim();
      }

      const data = await DocumentService.getDocuments(queryParams);
      const realDocuments = data.documents || [];

      // ⚡ 성능 최적화: N+1 쿼리 제거
      // 백엔드 /api/documents 응답에 이미 필요한 정보 포함
      // (customer_relation, ownerId, customerId, status, progress)
      // 개별 문서 상태 조회 제거 → API 호출 N+1 → 1로 감소
      const documentsWithStatus = realDocuments.map((doc: any) => {
        // 백엔드 응답의 status/progress로 overallStatus 계산
        const backendStatus = doc.status; // 'completed' | 'processing'
        const progress = doc.progress || 0;
        const overallStatus = backendStatus === 'completed' || progress >= 100
          ? 'completed'
          : 'processing';

        return {
          ...doc,
          overallStatus,
        };
      });

      // 백엔드에서 이미 검색/정렬/페이지네이션 처리된 데이터 사용
      setDocuments(documentsWithStatus);
      setTotal(data.total || 0);
      setHasMore(data.hasMore || false);
      setIsInitialLoad(false); // 초기 로딩 완료
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [searchQuery]);

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
  }, [isLoading, hasMore, searchQuery, searchParams, setSearchParams]);

  /**
   * 검색어 변경 핸들러
   */
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setSearchParams(prev => ({ ...prev, offset: 0 }));
    setCurrentPage(1);
  }, [setSearchQuery, setSearchParams, setCurrentPage]);

  /**
   * 페이지 변경 핸들러
   */
  const handlePageChange = useCallback((page: number) => {
    const limit = searchParams.limit || 10;
    const newOffset = (page - 1) * limit;
    const newParams = { ...searchParams, offset: newOffset };
    setCurrentPage(page);
    setSearchParams(newParams);
    loadDocuments(newParams);
  }, [searchParams, loadDocuments, setCurrentPage, setSearchParams]);

  /**
   * 페이지당 항목 수 변경 핸들러
   * @param newLimit 새 페이지당 항목 수
   * @param resetPage true(기본값)이면 1페이지로 이동, false이면 현재 페이지 유지 (초과 시 마지막 페이지로 보정)
   */
  const handleLimitChange = useCallback((newLimit: number, resetPage = true) => {
    if (resetPage) {
      const newParams = { ...searchParams, limit: newLimit, offset: 0 };
      setSearchParams(newParams);
      setCurrentPage(1);
      loadDocuments(newParams);
    } else {
      // 자동 계산에 의한 변경: 현재 페이지 유지, 초과 시 마지막 페이지로 보정
      const newMaxPage = Math.max(1, Math.ceil(total / newLimit));
      const safePage = currentPage > newMaxPage ? newMaxPage : currentPage;
      const newOffset = (safePage - 1) * newLimit;
      const newParams = { ...searchParams, limit: newLimit, offset: newOffset };
      setSearchParams(newParams);
      if (safePage !== currentPage) {
        setCurrentPage(safePage);
      }
      loadDocuments(newParams);
    }
  }, [searchParams, loadDocuments, total, currentPage, setSearchParams, setCurrentPage]);

  /**
   * 검색 실행
   */
  const handleSearch = useCallback(() => {
    const newParams = { ...searchParams, offset: 0 };
    loadDocuments(newParams);
  }, [searchParams, loadDocuments]);

  /**
   * 정렬 기준 변경 핸들러
   */
  const handleSortChange = useCallback((newSortBy: string, newSortOrder: 'asc' | 'desc') => {
    const validSortBy =
      newSortBy as 'filename' | 'uploadDate' | 'size' | 'createdAt' | 'updatedAt' | 'fileType';
    const newParams = {
      ...searchParams,
      sortBy: validSortBy,
      sortOrder: newSortOrder,
      offset: 0
    };
    setSearchParams(newParams);
    setCurrentPage(1);
    loadDocuments(newParams);
  }, [searchParams, loadDocuments, setSearchParams, setCurrentPage]);

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
  const initialLoadRef = useRef(false);

  useEffect(() => {
    if (initialLoadRef.current) {
      return;
    }
    initialLoadRef.current = true;
    loadDocuments(searchParams);
  }, [loadDocuments, searchParams]);

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
    isInitialLoad,
    error,
    total,
    hasMore,
    searchQuery,
    searchParams,
    currentPage,
    totalPages,
    itemsPerPage,

    // 액션
    loadDocuments,
    loadMoreDocuments,
    deleteDocument,
    handleSearchChange,
    handleSearch,
    handleSortChange,
    handlePageChange,
    handleLimitChange,
    clearError,

    // 계산된 값
    isEmpty: !isLoading && documents.length === 0,
    searchResultMessage: searchQuery.trim()
      ? `"${searchQuery}" 검색 결과: ${total.toLocaleString()}개`
      : `총 ${total.toLocaleString()}개의 문서`,
  };
};

