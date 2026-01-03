/**
 * AIMS UIX-3 Customer Review Tab
 * @since 2026-01-02
 * @version 1.0.0
 *
 * Customer Review Service 탭 컴포넌트
 * - Customer Review 조회 및 표시
 * - AnnualReportTab과 동일한 Document-Controller-View 패턴 준수
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Button } from '@/shared/ui/Button';
import { Dropdown } from '@/shared/ui';
import { CustomerReviewModal } from '@/features/customer/components/CustomerReviewModal';
import { CustomerReviewApi, type CustomerReview } from '@/features/customer/api/customerReviewApi';
import { AppleConfirmModal } from '../../../../../components/DocumentViews/DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal';
import { useAppleConfirmController } from '../../../../../controllers/useAppleConfirmController';
import { useDevModeStore } from '@/shared/store/useDevModeStore';
import { useCustomerReviewSSE } from '@/shared/hooks/useCustomerReviewSSE';
import type { Customer } from '@/entities/customer/model';
import { errorReporter } from '@/shared/lib/errorReporter';
import './CustomerReviewTab.css';

// 정렬 필드 타입
type SortField = 'contractor_name' | 'policy_number' | 'product_name' | 'issue_date' | 'parsed_at' | 'status';
type SortDirection = 'asc' | 'desc';

interface CustomerReviewTabProps {
  customer: Customer;
  onCustomerReviewCountChange?: (count: number) => void;
  refreshTrigger?: number;
  /** 외부에서 제공하는 검색어 */
  searchTerm?: string;
  /** 외부 검색어 변경 핸들러 */
  onSearchChange?: (term: string) => void;
}

// 페이지당 항목 수 옵션
const ITEMS_PER_PAGE_OPTIONS_BASE = [
  { value: 'auto', label: '자동' },
  { value: '10', label: '10개씩' },
  { value: '25', label: '25개씩' },
  { value: '50', label: '50개씩' },
];

// 행 높이 상수 (CSS와 동일)
const ROW_HEIGHT = 32;
const ROW_GAP = 2;
const DEFAULT_TABLE_HEADER_HEIGHT = 32;
const DEFAULT_PAGINATION_HEIGHT = 26;

export const CustomerReviewTab: React.FC<CustomerReviewTabProps> = ({
  customer,
  onCustomerReviewCountChange,
  refreshTrigger,
  searchTerm: externalSearchTerm,
  onSearchChange
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [selectedReview, setSelectedReview] = useState<CustomerReview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 검색어 상태
  const [internalSearchTerm, setInternalSearchTerm] = useState('');
  const searchTerm = externalSearchTerm ?? internalSearchTerm;
  const _setSearchTerm = onSearchChange ?? setInternalSearchTerm;

  // 페이지네이션 상태
  const [itemsPerPageMode, setItemsPerPageMode] = useState<'auto' | number>('auto');
  const [currentPage, setCurrentPage] = useState(1);
  const [containerHeight, setContainerHeight] = useState(0);
  const sectionContainerRef = useRef<HTMLDivElement>(null);

  // 삭제 기능 상태
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // 정렬 상태
  const [sortField, setSortField] = useState<SortField>('issue_date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // 개발자 모드
  const { isDevMode } = useDevModeStore();

  // Apple Confirm Modal 컨트롤러
  const confirmModal = useAppleConfirmController();

  // SSE 새로고침 콜백
  const handleSSERefresh = useCallback(() => {
    loadCustomerReviews();
  }, []);

  // SSE 실시간 업데이트 (폴링 대체)
  useCustomerReviewSSE(customer._id, handleSSERefresh, {
    enabled: Boolean(customer._id),
  });

  // 개발자 모드 OFF시 선택 초기화
  useEffect(() => {
    if (!isDevMode) {
      setSelectedIndices(new Set());
    }
  }, [isDevMode]);

  // 검색어 변경 시 첫 페이지로 이동
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // 자동 모드일 때 컨테이너 높이 기반 항목 수 계산
  const autoCalculatedItems = useMemo(() => {
    if (containerHeight <= 0) return 10;

    const container = sectionContainerRef.current;
    if (!container) return 10;

    const tableHeader = container.querySelector('.customer-review-table-header') as HTMLElement | null;
    const measuredTableHeaderHeight = tableHeader ? tableHeader.getBoundingClientRect().height : 0;
    const tableHeaderHeight = measuredTableHeaderHeight > 0 ? measuredTableHeaderHeight : DEFAULT_TABLE_HEADER_HEIGHT;

    const pagination = container.querySelector('.customer-review-pagination') as HTMLElement | null;
    const measuredPaginationHeight = pagination ? pagination.getBoundingClientRect().height : 0;
    const paginationHeight = measuredPaginationHeight > 0 ? measuredPaginationHeight : DEFAULT_PAGINATION_HEIGHT;

    const fixedHeight = tableHeaderHeight + paginationHeight;
    const availableHeight = containerHeight - fixedHeight;

    const maxItems = Math.max(1, Math.floor((availableHeight + ROW_GAP) / (ROW_HEIGHT + ROW_GAP)));
    return maxItems;
  }, [containerHeight]);

  // 실제 적용되는 페이지당 항목 수
  const itemsPerPage = itemsPerPageMode === 'auto' ? autoCalculatedItems : itemsPerPageMode;

  // 섹션 컨테이너 높이 측정
  useEffect(() => {
    const container = sectionContainerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // 드롭다운 옵션
  const itemsPerPageOptions = useMemo(() => {
    return ITEMS_PER_PAGE_OPTIONS_BASE.map(opt => {
      if (opt.value === 'auto') {
        return {
          value: 'auto',
          label: itemsPerPageMode === 'auto' ? `자동(${autoCalculatedItems})` : '자동'
        };
      }
      return opt;
    });
  }, [itemsPerPageMode, autoCalculatedItems]);

  // Customer Review 목록 로드
  useEffect(() => {
    loadCustomerReviews();
  }, [customer._id, refreshTrigger]);

  // Customer Review 개수 변경 시 부모에게 알림
  useEffect(() => {
    onCustomerReviewCountChange?.(reviews.length);
  }, [reviews.length, onCustomerReviewCountChange]);

  const loadCustomerReviews = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await CustomerReviewApi.getCustomerReviews(customer._id, 50);

      if (response.success && response.data) {
        setReviews(response.data.reviews);
      } else {
        setError(response.error || 'Customer Review 조회에 실패했습니다.');
      }
    } catch (err) {
      console.error('[CustomerReviewTab] Customer Review 조회 오류:', err);
      errorReporter.reportApiError(err as Error, { component: 'CustomerReviewTab.loadCustomerReviews', payload: { customerId: customer._id } });
      setError(err instanceof Error ? err.message : 'Customer Review 조회 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewReview = (review: CustomerReview) => {
    // 실패/진행중 문서는 모달 열지 않음
    if (review.status === 'error' || review.status === 'processing') {
      return;
    }
    setSelectedReview(review);
    setIsModalOpen(true);
  };

  // 정렬 핸들러
  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }, [sortField]);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedReview(null);
  };

  // 체크박스 전체 선택/해제
  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const allIndices = new Set(visibleReviews.map((_, idx) => (currentPage - 1) * itemsPerPage + idx));
      setSelectedIndices(allIndices);
    } else {
      setSelectedIndices(new Set());
    }
  };

  // 개별 체크박스 선택/해제
  const handleSelectReview = (globalIndex: number, event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedIndices((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(globalIndex)) {
        newSet.delete(globalIndex);
      } else {
        newSet.add(globalIndex);
      }
      return newSet;
    });
  };

  // Customer Reviews 삭제
  const handleDeleteSelected = async () => {
    if (selectedIndices.size === 0) {
      await confirmModal.actions.openModal({
        title: '선택 항목 없음',
        message: '삭제할 항목을 선택해주세요.',
        confirmText: '확인',
        showCancel: false,
        iconType: 'warning'
      });
      return;
    }

    const confirmed = await confirmModal.actions.openModal({
      title: 'Customer Review 삭제',
      message: `${selectedIndices.size}개 항목을 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.`,
      confirmText: '삭제',
      cancelText: '취소',
      confirmStyle: 'destructive',
      showCancel: true,
      iconType: 'warning'
    });

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    try {
      const result = await CustomerReviewApi.deleteCustomerReviews(
        customer._id,
        Array.from(selectedIndices)
      );

      setIsDeleting(false);

      if (result.success) {
        setSelectedIndices(new Set());
        await loadCustomerReviews();

        await confirmModal.actions.openModal({
          title: '완료',
          message: `${result.deleted_count}건 삭제되었습니다.`,
          confirmText: '확인',
          showCancel: false,
          iconType: 'success'
        });
      } else {
        await confirmModal.actions.openModal({
          title: '실패',
          message: result.message,
          confirmText: '확인',
          showCancel: false,
          iconType: 'error'
        });
      }
    } catch (err) {
      setIsDeleting(false);
      console.error('[CustomerReviewTab] 삭제 오류:', err);
      errorReporter.reportApiError(err as Error, { component: 'CustomerReviewTab.handleDeleteSelected', payload: { customerId: customer._id, count: selectedIndices.size } });
      await confirmModal.actions.openModal({
        title: '오류',
        message: '삭제 중 오류가 발생했습니다.',
        confirmText: '확인',
        showCancel: false,
        iconType: 'error'
      });
    }
  };

  // 검색어로 필터링된 리뷰 목록
  const filteredReviews = useMemo(() => {
    if (!searchTerm.trim()) return reviews;

    const term = searchTerm.toLowerCase().trim();
    return reviews.filter(review => {
      const contractorName = (review.contractor_name || '').toLowerCase();
      const policyNumber = (review.contract_info?.policy_number || '').toLowerCase();
      const productName = (review.product_name || '').toLowerCase();
      const issueDate = CustomerReviewApi.formatDate(review.issue_date).toLowerCase();
      const parsedAt = CustomerReviewApi.formatDateTime(review.parsed_at).toLowerCase();

      return contractorName.includes(term) ||
             policyNumber.includes(term) ||
             productName.includes(term) ||
             issueDate.includes(term) ||
             parsedAt.includes(term);
    });
  }, [reviews, searchTerm]);

  // 정렬된 리뷰 목록
  const sortedReviews = useMemo(() => {
    return [...filteredReviews].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'contractor_name':
          comparison = (a.contractor_name || '').localeCompare(b.contractor_name || '', 'ko');
          break;
        case 'policy_number':
          comparison = (a.contract_info?.policy_number || '').localeCompare(b.contract_info?.policy_number || '', 'ko');
          break;
        case 'product_name':
          comparison = (a.product_name || '').localeCompare(b.product_name || '', 'ko');
          break;
        case 'issue_date':
          comparison = new Date(a.issue_date || 0).getTime() - new Date(b.issue_date || 0).getTime();
          break;
        case 'parsed_at':
          comparison = new Date(a.parsed_at || 0).getTime() - new Date(b.parsed_at || 0).getTime();
          break;
        case 'status':
          const statusOrder = { 'completed': 0, 'processing': 1, 'pending': 2, 'error': 3 };
          comparison = (statusOrder[a.status || 'completed'] || 0) - (statusOrder[b.status || 'completed'] || 0);
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredReviews, sortField, sortDirection]);

  // 페이지네이션 계산
  const itemsPerPageNumber = itemsPerPage;
  const totalPages = Math.max(1, Math.ceil(sortedReviews.length / itemsPerPageNumber));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  // 현재 페이지에 표시할 리뷰들
  const visibleReviews = sortedReviews.slice(
    (safeCurrentPage - 1) * itemsPerPageNumber,
    safeCurrentPage * itemsPerPageNumber
  );

  // 전체 선택 여부
  const isAllSelected = visibleReviews.length > 0 && visibleReviews.every((_, idx) => {
    const globalIndex = (safeCurrentPage - 1) * itemsPerPageNumber + idx;
    return selectedIndices.has(globalIndex);
  });

  // 로딩 상태
  if (isLoading) {
    return (
      <div ref={sectionContainerRef} className="customer-review-tab">
        <div className="customer-review-tab__loading">
          <div className="customer-review-tab__loading-spinner"></div>
          <p>Customer Review를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // 에러 상태
  if (error) {
    return (
      <div ref={sectionContainerRef} className="customer-review-tab">
        <div className="customer-review-tab__error">
          <div className="customer-review-tab__error-icon">!</div>
          <p>{error}</p>
          <Button variant="secondary" size="sm" onClick={loadCustomerReviews}>
            다시 시도
          </Button>
        </div>
      </div>
    );
  }

  // Customer Review 없음
  if (reviews.length === 0) {
    return (
      <div ref={sectionContainerRef} className="customer-review-tab">
        <div className="customer-review-tab__empty">
          <div className="customer-review-tab__empty-icon">+</div>
          <h3 className="customer-review-tab__empty-title">Customer Review가 없습니다</h3>
          <p className="customer-review-tab__empty-description">
            Customer Review Service 문서를 업로드하면 자동 분석하여 여기에 표시됩니다.
          </p>
        </div>
      </div>
    );
  }

  // 페이지 변경 핸들러
  const handlePrevPage = () => {
    if (safeCurrentPage > 1) {
      setCurrentPage(safeCurrentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (safeCurrentPage < totalPages) {
      setCurrentPage(safeCurrentPage + 1);
    }
  };

  const handleItemsPerPageChange = (value: string) => {
    if (value === 'auto') {
      setItemsPerPageMode('auto');
    } else {
      setItemsPerPageMode(Number(value));
    }
    setCurrentPage(1);
  };

  // Customer Review 목록 있음
  return (
    <div ref={sectionContainerRef} className="customer-review-tab">
      {/* 삭제 버튼 (개발자 모드 전용) */}
      {isDevMode && selectedIndices.size > 0 && (
        <div className="customer-review-actions">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteSelected}
            disabled={isDeleting}
            title="개발자 전용 기능"
          >
            {isDeleting ? '삭제 중...' : `선택 항목 삭제 (${selectedIndices.size})`}
          </Button>
        </div>
      )}

      {/* 테이블 컨테이너 */}
      <div className="customer-review-table-container">
        {/* 테이블 헤더 */}
        <div className={`customer-review-table-header ${isDevMode ? 'has-checkbox' : ''}`}>
          {isDevMode && (
            <div className="header-checkbox">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={handleSelectAll}
                aria-label="전체 선택"
              />
            </div>
          )}
          <div
            className="header-contractor customer-review-table__sortable"
            onClick={() => handleSort('contractor_name')}
          >
            <span className="customer-review-table__header-content">
              계약자
              <span className={`customer-review-table__sort-icon ${sortField === 'contractor_name' ? 'customer-review-table__sort-icon--active' : ''}`}>
                {sortField === 'contractor_name' ? (sortDirection === 'asc' ? '▲' : '▼') : '▼'}
              </span>
            </span>
          </div>
          <div
            className="header-policy-number customer-review-table__sortable"
            onClick={() => handleSort('policy_number')}
          >
            <span className="customer-review-table__header-content">
              증권번호
              <span className={`customer-review-table__sort-icon ${sortField === 'policy_number' ? 'customer-review-table__sort-icon--active' : ''}`}>
                {sortField === 'policy_number' ? (sortDirection === 'asc' ? '▲' : '▼') : '▼'}
              </span>
            </span>
          </div>
          <div
            className="header-product customer-review-table__sortable"
            onClick={() => handleSort('product_name')}
          >
            <span className="customer-review-table__header-content">
              상품명
              <span className={`customer-review-table__sort-icon ${sortField === 'product_name' ? 'customer-review-table__sort-icon--active' : ''}`}>
                {sortField === 'product_name' ? (sortDirection === 'asc' ? '▲' : '▼') : '▼'}
              </span>
            </span>
          </div>
          <div
            className="header-issue-date customer-review-table__sortable"
            onClick={() => handleSort('issue_date')}
          >
            <span className="customer-review-table__header-content">
              발행일
              <span className={`customer-review-table__sort-icon ${sortField === 'issue_date' ? 'customer-review-table__sort-icon--active' : ''}`}>
                {sortField === 'issue_date' ? (sortDirection === 'asc' ? '▲' : '▼') : '▼'}
              </span>
            </span>
          </div>
          <div
            className="header-parsed-at customer-review-table__sortable"
            onClick={() => handleSort('parsed_at')}
          >
            <span className="customer-review-table__header-content">
              파싱일시
              <span className={`customer-review-table__sort-icon ${sortField === 'parsed_at' ? 'customer-review-table__sort-icon--active' : ''}`}>
                {sortField === 'parsed_at' ? (sortDirection === 'asc' ? '▲' : '▼') : '▼'}
              </span>
            </span>
          </div>
        </div>

        {/* 테이블 바디 */}
        <div className="customer-review-table-body">
          {visibleReviews.map((review, idx) => {
            const globalIndex = reviews.indexOf(review);
            const isSelected = selectedIndices.has(globalIndex);
            const isError = review.status === 'error';
            const isProcessing = review.status === 'processing';
            const isPending = review.status === 'pending';
            const isNotCompleted = isError || isProcessing || isPending;

            return (
              <div
                key={review.source_file_id || `review_${idx}`}
                className={`customer-review-row ${isDevMode ? 'has-checkbox' : ''} ${isSelected ? 'customer-review-row--selected' : ''} ${isError ? 'customer-review-row--error' : ''} ${isProcessing ? 'customer-review-row--processing' : ''} ${isPending ? 'customer-review-row--pending' : ''}`}
                onClick={() => handleViewReview(review)}
              >
                {isDevMode && (
                  <div className="row-checkbox" onClick={(e) => handleSelectReview(globalIndex, e)}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      aria-label={`리뷰 선택`}
                    />
                  </div>
                )}
                <div className="row-contractor">{review.contractor_name || '-'}</div>
                <div className="row-policy-number" title={review.contract_info?.policy_number || ''}>
                  {review.contract_info?.policy_number || '-'}
                </div>
                <div className="row-product" title={review.product_name || ''}>
                  {review.product_name || '-'}
                </div>
                <div className="row-issue-date">
                  {CustomerReviewApi.formatDate(review.issue_date)}
                </div>
                <div className="row-parsed-at">
                  {review.parsed_at ? CustomerReviewApi.formatDateTime(review.parsed_at) : '-'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 페이지네이션 */}
      <div className="customer-review-pagination">
        <div className="pagination-limit">
          <Dropdown
            value={itemsPerPageMode === 'auto' ? 'auto' : String(itemsPerPageMode)}
            options={itemsPerPageOptions}
            onChange={handleItemsPerPageChange}
            aria-label="페이지당 항목 수"
            width={70}
          />
        </div>

        <div className="pagination-controls">
          <button
            className="pagination-button pagination-button--prev"
            onClick={handlePrevPage}
            disabled={safeCurrentPage === 1}
            aria-label="이전 페이지"
          >
            <span className="pagination-arrow">{"<"}</span>
          </button>

          <div className="pagination-info">
            <span className="pagination-current">{safeCurrentPage}</span>
            <span className="pagination-separator">/</span>
            <span className="pagination-total">{totalPages}</span>
          </div>

          <button
            className="pagination-button pagination-button--next"
            onClick={handleNextPage}
            disabled={safeCurrentPage === totalPages}
            aria-label="다음 페이지"
          >
            <span className="pagination-arrow">{">"}</span>
          </button>
        </div>
      </div>

      {/* Customer Review Modal */}
      <CustomerReviewModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        review={selectedReview}
      />

      {/* Apple Confirm Modal */}
      <AppleConfirmModal
        state={confirmModal.state}
        actions={confirmModal.actions}
      />
    </div>
  );
};

export default CustomerReviewTab;
