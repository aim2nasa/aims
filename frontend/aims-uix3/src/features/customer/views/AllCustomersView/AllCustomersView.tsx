/**
 * AIMS UIX-3 All Customers View
 * @since 2025-10-03
 * @version 2.0.0 - Apple Style (DocumentLibraryView 패턴)
 *
 * 전체 고객 목록 뷰
 * iOS/macOS native table view style
 */

import React, { forwardRef, useImperativeHandle, useState, useMemo, useEffect } from 'react';
import { SFSymbol, SFSymbolSize } from '../../../../components/SFSymbol';
import { Dropdown } from '@/shared/ui';
import { useCustomerDocument } from '@/hooks/useCustomerDocument';
import RefreshButton from '../../../../components/RefreshButton/RefreshButton';
import type { Customer } from '@/entities/customer/model';
import './AllCustomersView.css';

interface AllCustomersViewProps {
  /** 고객 클릭 핸들러 */
  onCustomerClick?: (customerId: string, customer: Customer) => void;
}

export interface AllCustomersViewRef {
  refresh: () => void;
}

const ITEMS_PER_PAGE_OPTIONS = [
  { value: '10', label: '10개씩' },
  { value: '20', label: '20개씩' },
  { value: '50', label: '50개씩' },
  { value: '100', label: '100개씩' },
];

const SORT_OPTIONS = [
  { value: 'latest', label: '최신순' },
  { value: 'name', label: '이름순' },
  { value: 'oldest', label: '오래된순' },
];

export const AllCustomersView = forwardRef<AllCustomersViewRef, AllCustomersViewProps>(
  function AllCustomersView({ onCustomerClick }, ref) {
    const [itemsPerPage, setItemsPerPage] = useState('10');
    const [sortBy, setSortBy] = useState('latest');
    const [searchValue, setSearchValue] = useState('');
    const [prevArrowClicked, setPrevArrowClicked] = useState(false);
    const [nextArrowClicked, setNextArrowClicked] = useState(false);

    // Document-View 패턴: CustomerDocument 구독
    const {
      customers: allCustomers,
      isLoading,
      error,
      loadCustomers,
      refresh,
    } = useCustomerDocument();

    const [currentPage, setCurrentPage] = useState(1);

    // 초기 데이터 로드
    useEffect(() => {
      console.log('[AllCustomersView] Document 구독 및 초기 데이터 로드');
      loadCustomers({ limit: 10000, offset: 0 });
    }, [loadCustomers]);

    // 검색 필터링된 고객 목록
    const filteredCustomers = useMemo(() => {
      if (!searchValue.trim()) {
        return allCustomers;
      }

      const searchLower = searchValue.toLowerCase().trim();
      return allCustomers.filter(customer => {
        const name = customer.personal_info?.name?.toLowerCase() || '';
        const phone = customer.personal_info?.mobile_phone?.replace(/-/g, '') || '';
        const email = customer.personal_info?.email?.toLowerCase() || '';

        return (
          name.includes(searchLower) ||
          phone.includes(searchLower) ||
          email.includes(searchLower)
        );
      });
    }, [allCustomers, searchValue]);

    // 정렬된 고객 목록 (페이지네이션 적용 전)
    const sortedCustomers = useMemo(() => {
      const sorted = [...filteredCustomers];

      switch (sortBy) {
        case 'latest':
          // 최신순 (등록일 내림차순)
          sorted.sort((a, b) => {
            const dateA = a.meta?.created_at ? new Date(a.meta.created_at).getTime() : 0;
            const dateB = b.meta?.created_at ? new Date(b.meta.created_at).getTime() : 0;
            return dateB - dateA;
          });
          break;
        case 'name':
          // 이름순 (가나다순)
          sorted.sort((a, b) => {
            const nameA = a.personal_info?.name || '';
            const nameB = b.personal_info?.name || '';
            return nameA.localeCompare(nameB, 'ko');
          });
          break;
        case 'oldest':
          // 오래된순 (등록일 오름차순)
          sorted.sort((a, b) => {
            const dateA = a.meta?.created_at ? new Date(a.meta.created_at).getTime() : 0;
            const dateB = b.meta?.created_at ? new Date(b.meta.created_at).getTime() : 0;
            return dateA - dateB;
          });
          break;
      }

      return sorted;
    }, [filteredCustomers, sortBy]);

    const itemsPerPageNumber = useMemo(() => {
      const parsed = parseInt(itemsPerPage, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
    }, [itemsPerPage]);

    const totalCustomers = sortedCustomers.length;
    const isEmpty = totalCustomers === 0 && !isLoading;

    // 로컬 pagination 계산
    const pagination = useMemo(() => {
      const totalPages = Math.max(1, Math.ceil(totalCustomers / itemsPerPageNumber));
      const safeCurrentPage = Math.min(currentPage, totalPages);

      return {
        currentPage: safeCurrentPage,
        totalPages,
        limit: itemsPerPageNumber,
        total: totalCustomers,
      };
    }, [currentPage, itemsPerPageNumber, totalCustomers]);

    useEffect(() => {
      const totalPages = Math.max(1, Math.ceil(totalCustomers / itemsPerPageNumber));

      if (currentPage > totalPages) {
        setCurrentPage(totalPages);
      }
    }, [currentPage, itemsPerPageNumber, totalCustomers]);

    const currentPageForView = pagination.currentPage;

    // 현재 페이지에 표시할 고객들
    const visibleCustomers = useMemo(() => {
      const offset = (currentPageForView - 1) * itemsPerPageNumber;
      return sortedCustomers.slice(offset, offset + itemsPerPageNumber);
    }, [sortedCustomers, currentPageForView, itemsPerPageNumber]);

    // 개인/법인 고객 수 계산 (검색 결과 기준)
    const customerTypeCounts = useMemo(() => {
      const personal = filteredCustomers.filter(c => c.insurance_info?.customer_type !== '법인').length;
      const corporate = filteredCustomers.filter(c => c.insurance_info?.customer_type === '법인').length;
      return { personal, corporate };
    }, [filteredCustomers]);

    // refresh 함수를 부모에게 노출
    useImperativeHandle(ref, () => ({
      refresh,
    }), [refresh]);

    const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchValue(value);
      setCurrentPage(1); // 검색 시 첫 페이지로 이동
    };

    const handleClearSearch = () => {
      setSearchValue('');
      setCurrentPage(1);
    };

    const handleItemsPerPageChange = (value: string) => {
      setItemsPerPage(value);
      setCurrentPage(1);
    };

    const handleSortChange = (value: string) => {
      setSortBy(value);
      setCurrentPage(1);
    };

    const handlePrevPage = () => {
      if (currentPageForView > 1) {
        setPrevArrowClicked(true);
        setTimeout(() => setPrevArrowClicked(false), 150);
        setCurrentPage(currentPageForView - 1);
      }
    };

    const handleNextPage = () => {
      if (currentPageForView < pagination.totalPages) {
        setNextArrowClicked(true);
        setTimeout(() => setNextArrowClicked(false), 150);
        setCurrentPage(currentPageForView + 1);
      }
    };

    const getCustomerIcon = (customer: Customer) => {
      const customerType = customer.insurance_info?.customer_type;
      if (customerType === '법인') {
        // 법인: 건물 아이콘
        return (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--corporate">
            <circle cx="10" cy="10" r="10" opacity="0.2" />
            <path d="M6 5h2v2H6V5zm0 3h2v2H6V8zm0 3h2v2H6v-2zm3-6h2v2H9V5zm0 3h2v2H9V8zm0 3h2v2H9v-2zm3-6h2v2h-2V5zm0 3h2v2h-2V8zm0 3h2v2h-2v-2zM5 14h10v2H5v-2z" />
          </svg>
        );
      }
      // 개인: 사람 아이콘
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--personal">
          <circle cx="10" cy="10" r="10" opacity="0.2" />
          <circle cx="10" cy="7" r="3" />
          <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
        </svg>
      );
    };

    const getCustomerEmail = (customer: Customer) => {
      const email = customer.personal_info?.email;
      if (!email) return '-';
      return email.length > 25 ? email.substring(0, 22) + '...' : email;
    };

    const getCustomerType = (customer: Customer) => {
      return customer.insurance_info?.customer_type || '-';
    };

    const getCustomerInfo = (customer: Customer) => {
      const phoneNumber = customer.personal_info?.mobile_phone || '-';
      return `${phoneNumber}`;
    };

    const getCustomerBirthDate = (customer: Customer) => {
      const birthDate = customer.personal_info?.birth_date;
      if (!birthDate) return '-';
      const date = new Date(birthDate);
      const year = date.getFullYear().toString().slice(2);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}.${month}.${day}`;
    };

    const getCustomerGender = (customer: Customer) => {
      const gender = customer.personal_info?.gender;
      if (!gender) return '-';
      return gender === 'M' ? '남' : '여';
    };

    const getCustomerAddress = (customer: Customer) => {
      const address = customer.personal_info?.address;
      if (!address || !address.address1) return '-';
      const fullAddress = `${address.address1} ${address.address2 || ''}`.trim();
      return fullAddress.length > 30 ? fullAddress.substring(0, 27) + '...' : fullAddress;
    };

    const getCustomerStatus = (customer: Customer) => {
      const status = customer.meta?.status;
      if (!status) return '-';
      return status === 'active' ? '활성' : '비활성';
    };

    const getCustomerCreatedDate = (customer: Customer) => {
      const createdAt = customer.meta?.created_at;
      if (!createdAt) return '-';
      const date = new Date(createdAt);
      const year = date.getFullYear().toString().slice(2);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}.${month}.${day}`;
    };

    return (
      <div className="customer-library-container">
        {/* 검색 바 */}
        <div className="customer-library-bar">
          <div className="search-input-wrapper">
            <div className="search-icon">
              <SFSymbol name="magnifyingglass" size={SFSymbolSize.BODY} />
            </div>
            <input
              type="text"
              className="search-input"
              placeholder="이름, 전화번호, 이메일로 검색..."
              value={searchValue}
              onChange={handleSearchInputChange}
            />
            {searchValue && (
              <button
                className="search-clear-button"
                onClick={handleClearSearch}
                aria-label="검색어 지우기"
              >
                <SFSymbol name="xmark.circle.fill" size={SFSymbolSize.CAPTION_1} />
              </button>
            )}
          </div>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="customer-library-error">
            <div className="error-icon">
              <SFSymbol name="exclamationmark.triangle.fill" size={SFSymbolSize.BODY} />
            </div>
            <span>{error}</span>
            <button
              className="error-dismiss-button"
              onClick={() => refresh()}
              aria-label="에러 닫기"
            >
              <SFSymbol name="xmark" size={SFSymbolSize.CAPTION_1} />
            </button>
          </div>
        )}

        {/* 결과 헤더 */}
        {!isLoading && (
          <div className="customer-library-result-header">
            <div className="result-count">총 {totalCustomers}명 (개인 {customerTypeCounts.personal}, 법인 {customerTypeCounts.corporate})</div>
            <div className="result-controls">
              <RefreshButton
                onClick={async () => {
                  await refresh();
                  await loadCustomers({ limit: 10000, offset: 0 });
                }}
                loading={isLoading}
                tooltip="고객 목록 새로고침"
                size="small"
              />
              <div className="sort-selector">
                <Dropdown
                  value={sortBy}
                  options={SORT_OPTIONS}
                  onChange={handleSortChange}
                />
              </div>
            </div>
          </div>
        )}

        {/* 고객 목록 */}
        <div className="customer-list">
          {/* 컬럼 헤더 */}
          {!isEmpty && !isLoading && (
            <div className="customer-list-header">
              <div className="header-icon"></div>
              <div className="header-name">
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="8" cy="5" r="2.5" fill="currentColor"/>
                  <path d="M8 9c-2.5 0-4.5 1.5-4.5 3v1.5h9V12c0-1.5-2-3-4.5-3z" fill="currentColor"/>
                </svg>
                <span>이름</span>
              </div>
              <div className="header-birth">
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <rect x="2" y="10" width="12" height="3" rx="0.5" fill="var(--cake-bottom)"/>
                  <rect x="3" y="7" width="10" height="3" rx="0.5" fill="var(--cake-top)"/>
                  <rect x="4" y="3.5" width="1.5" height="3.5" rx="0.3" fill="var(--candle)"/>
                  <rect x="7.25" y="3.5" width="1.5" height="3.5" rx="0.3" fill="var(--candle)"/>
                  <rect x="10.5" y="3.5" width="1.5" height="3.5" rx="0.3" fill="var(--candle)"/>
                  <ellipse cx="4.75" cy="3" rx="0.9" ry="1.2" fill="var(--flame)"/>
                  <ellipse cx="8" cy="3" rx="0.9" ry="1.2" fill="var(--flame)"/>
                  <ellipse cx="11.25" cy="3" rx="0.9" ry="1.2" fill="var(--flame)"/>
                </svg>
                <span>생년월일</span>
              </div>
              <div className="header-gender">
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="5" cy="6" r="2" fill="currentColor"/>
                  <path d="M5 9c-1.5 0-3 1-3 2v1h6v-1c0-1-1.5-2-3-2z" fill="currentColor"/>
                  <circle cx="11" cy="6" r="2" fill="currentColor"/>
                  <path d="M11 9c-1.5 0-3 1-3 2v1h6v-1c0-1-1.5-2-3-2z" fill="currentColor"/>
                </svg>
                <span>성별</span>
              </div>
              <div className="header-phone">
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <path d="M3 1h3l1 3-2 2c1 2 3 4 5 5l2-2 3 1v3c0 1-1 2-2 2C6 15 1 10 1 3c0-1 1-2 2-2z" fill="currentColor"/>
                </svg>
                <span>전화</span>
              </div>
              <div className="header-email">
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <rect x="1" y="4" width="14" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                  <path d="M1 5l7 5 7-5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                </svg>
                <span>이메일</span>
              </div>
              <div className="header-address">
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <path d="M8 1l-7 6h2v7h4V9h2v5h4V7h2L8 1z" fill="currentColor"/>
                </svg>
                <span>주소</span>
              </div>
              <div className="header-type">
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <path d="M3 14h10V4H3v10zm2-8h1v1H5V6zm3 0h1v1H8V6zm3 0h1v1h-1V6z" fill="currentColor"/>
                </svg>
                <span>유형</span>
              </div>
              <div className="header-status">
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="7" fill="currentColor"/>
                  <path d="M6 8l2 2 4-4" stroke="white" strokeWidth="1.5" fill="none"/>
                </svg>
                <span>상태</span>
              </div>
              <div className="header-created">
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="7" fill="currentColor"/>
                  <path d="M8 4v4h3" stroke="white" strokeWidth="1" fill="none"/>
                </svg>
                <span>등록일</span>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="customer-list-loading">
              <div className="loading-spinner" />
              <p>고객 목록을 불러오는 중...</p>
            </div>
          )}

          {isEmpty && !isLoading && (
            <div className="customer-list-empty">
              <div className="empty-icon">
                <SFSymbol name={searchValue ? "magnifyingglass" : "person.2.slash"} size={SFSymbolSize.LARGE_TITLE} />
              </div>
              <p className="empty-message">
                {searchValue ? `"${searchValue}"에 대한 검색 결과가 없습니다.` : '고객이 없습니다.'}
              </p>
            </div>
          )}

          {!isEmpty &&
            !isLoading &&
            visibleCustomers.map((customer) => (
              <div
                key={customer._id}
                className="customer-item"
                onClick={() => {
                  if (onCustomerClick) {
                    onCustomerClick(customer._id, customer);
                  }
                }}
              >
                <div className="customer-icon">{getCustomerIcon(customer)}</div>
                <div className="customer-info">
                  <span className="customer-name">{customer.personal_info?.name || '이름 없음'}</span>
                </div>
                <span className="customer-birth">{getCustomerBirthDate(customer)}</span>
                <span className="customer-gender">{getCustomerGender(customer)}</span>
                <span className="customer-phone">{getCustomerInfo(customer)}</span>
                <span className="customer-email">{getCustomerEmail(customer)}</span>
                <span className="customer-address">{getCustomerAddress(customer)}</span>
                <span className="customer-type">{getCustomerType(customer)}</span>
                <span className="customer-status">{getCustomerStatus(customer)}</span>
                <span className="customer-created">{getCustomerCreatedDate(customer)}</span>
              </div>
            ))}
        </div>

        {/* 페이지네이션 */}
        {!isLoading && !isEmpty && (
          <div className="customer-pagination">
            {/* 🍎 페이지당 항목 수 선택 */}
            <div className="pagination-limit">
              <Dropdown
                value={itemsPerPage}
                options={ITEMS_PER_PAGE_OPTIONS}
                onChange={handleItemsPerPageChange}
                aria-label="페이지당 항목 수"
              />
            </div>

            {/* 🍎 페이지 네비게이션 - 페이지가 2개 이상일 때만 표시 */}
            {pagination.totalPages > 1 && (
              <div className="pagination-controls">
                <button
                  className="pagination-button pagination-button--prev"
                  onClick={handlePrevPage}
                  disabled={pagination.currentPage === 1}
                  aria-label="이전 페이지"
                >
                  <span className={`pagination-arrow ${prevArrowClicked ? 'pagination-arrow--clicked' : ''}`}>
                    ‹
                  </span>
                </button>

                <div className="pagination-info">
                  <span className="pagination-current">{pagination.currentPage}</span>
                  <span className="pagination-separator">/</span>
                  <span className="pagination-total">{pagination.totalPages}</span>
                </div>

                <button
                  className="pagination-button pagination-button--next"
                  onClick={handleNextPage}
                  disabled={pagination.currentPage === pagination.totalPages}
                  aria-label="다음 페이지"
                >
                  <span className={`pagination-arrow ${nextArrowClicked ? 'pagination-arrow--clicked' : ''}`}>
                    ›
                  </span>
                </button>
              </div>
            )}

            {/* 🍎 페이지가 1개일 때 빈 공간 유지 */}
            {pagination.totalPages <= 1 && <div className="pagination-spacer"></div>}
          </div>
        )}
      </div>
    );
  }
);

export default AllCustomersView;
