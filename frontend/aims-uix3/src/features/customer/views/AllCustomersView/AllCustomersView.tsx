/**
 * AIMS UIX-3 All Customers View
 * @since 2025-10-03
 * @version 1.0.0
 *
 * 고객 전체보기 페이지
 * iOS 스타일의 그리드 레이아웃
 */

import React from 'react';
import { Button, Input } from '@/shared/ui';
import { useCustomersController } from '../../controllers/useCustomersController';
import { CustomerCard } from './components/CustomerCard';
import type { Customer } from '@/entities/customer/model';
import './AllCustomersView.css';

interface AllCustomersViewProps {
  /** 고객 클릭 핸들러 */
  onCustomerClick?: (customerId: string, customer: Customer) => void;
}

export const AllCustomersView: React.FC<AllCustomersViewProps> = ({ onCustomerClick }) => {
  const {
    customers,
    pagination,
    isLoading,
    error,
    isEmpty,
    hasMore,
    handleSearchChange,
    loadMore,
    refresh,
    setError,
  } = useCustomersController();

  return (
    <div className="all-customers">
      {/* Header */}
      <div className="all-customers__header">
        <div>
          <h1 className="all-customers__title">고객 전체보기</h1>
          <p className="all-customers__subtitle">
            전체 {pagination.totalCount}명의 고객
          </p>
        </div>
        <Button variant="ghost" onClick={refresh}>
          새로고침
        </Button>
      </div>

      {/* Search */}
      <div className="all-customers__search">
        <Input
          type="text"
          placeholder="고객 이름, 전화번호, 이메일로 검색..."
          onChange={(e) => handleSearchChange(e.target.value)}
          fullWidth
        />
      </div>

      {/* Error */}
      {error && (
        <div className="all-customers__error" role="alert">
          <p>{error}</p>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>
            닫기
          </Button>
        </div>
      )}

      {/* Content */}
      <div className="all-customers__content">
        {isLoading && customers.length === 0 ? (
          // 초기 로딩
          <div className="all-customers__loading">
            <p>고객 목록을 불러오는 중...</p>
          </div>
        ) : isEmpty ? (
          // 빈 상태
          <div className="all-customers__empty">
            <p>등록된 고객이 없습니다.</p>
          </div>
        ) : (
          <>
            {/* 고객 그리드 */}
            <div className="all-customers__grid">
              {customers.map((customer) => (
                <CustomerCard
                  key={customer._id}
                  customer={customer}
                  onClick={(customer) => {
                    if (onCustomerClick) {
                      onCustomerClick(customer._id, customer);
                    }
                  }}
                />
              ))}
            </div>

            {/* 더보기 버튼 */}
            {hasMore && (
              <div className="all-customers__load-more">
                <Button
                  variant="secondary"
                  onClick={loadMore}
                  loading={isLoading}
                  disabled={isLoading}
                  fullWidth
                >
                  더 보기 ({pagination.currentPage} / {pagination.totalPages})
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AllCustomersView;
