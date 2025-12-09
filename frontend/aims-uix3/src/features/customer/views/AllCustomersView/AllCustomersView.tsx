/**
 * AIMS UIX-3 All Customers View
 * @since 2025-10-03
 * @version 2.0.0 - Apple Style (DocumentLibraryView 패턴)
 *
 * 전체 고객 목록 뷰
 * iOS/macOS native table view style
 */

import React, { forwardRef, useImperativeHandle, useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppleConfirm } from '@/contexts/AppleConfirmProvider';
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../../components/SFSymbol';
import { Dropdown, Tooltip, Modal } from '@/shared/ui';
import Button from '@/shared/ui/Button';
import { useCustomerDocument } from '@/hooks/useCustomerDocument';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useDevModeStore } from '@/shared/store/useDevModeStore';
import { CustomerService } from '@/services/customerService';
import type { Customer } from '@/entities/customer/model';
import { formatDate, formatDateTime } from '@/shared/lib/timeUtils';
import './AllCustomersView.css';

interface AllCustomersViewProps {
  /** 고객 클릭 핸들러 */
  onCustomerClick?: (customerId: string, customer: Customer) => void;
  /** 고객 더블클릭 핸들러 (전체 보기로 이동) */
  onCustomerDoubleClick?: (customerId: string, customer: Customer) => void;
}

export interface AllCustomersViewRef {
  refresh: () => void;
}

const ITEMS_PER_PAGE_OPTIONS = [
  { value: '10', label: '10개씩' },
  { value: '15', label: '15개씩' },
  { value: '20', label: '20개씩' },
  { value: '50', label: '50개씩' },
  { value: '100', label: '100개씩' },
];

type SortField = 'name' | 'birth' | 'gender' | 'phone' | 'email' | 'address' | 'type' | 'status' | 'created';
type SortDirection = 'asc' | 'desc';

export const AllCustomersView = forwardRef<AllCustomersViewRef, AllCustomersViewProps>(
  function AllCustomersView({ onCustomerClick, onCustomerDoubleClick }, ref) {
    // 🍎 애플 스타일 알림 모달
    const { showAlert } = useAppleConfirm();

    // React Query 캐시 무효화를 위한 queryClient
    const queryClient = useQueryClient();

    // F5 이후에도 유지되는 상태들
    const [itemsPerPage, setItemsPerPage] = usePersistedState('customer-all-items-per-page', '15');
    const [searchValue, setSearchValue] = usePersistedState('customer-all-search', '');
    const [currentPage, setCurrentPage] = usePersistedState('customer-all-page', 1);
    // 고객 타입 필터는 항상 'all'로 고정 (개인/법인 모두 표시)
    const customerTypeFilter: 'all' | 'personal' | 'corporate' = 'all';
    const [statusFilter, setStatusFilter] = usePersistedState<'all' | 'active' | 'inactive'>('customer-all-status-filter', 'all');

    // 칼럼 정렬 상태
    const [sortField, setSortField] = usePersistedState<SortField | null>('customer-all-sort-field', null);
    const [sortDirection, setSortDirection] = usePersistedState<SortDirection>('customer-all-sort-direction', 'asc');

    // UI 상태 (새로고침 시 초기화되어도 됨)
    const [prevArrowClicked, setPrevArrowClicked] = useState(false);
    const [nextArrowClicked, setNextArrowClicked] = useState(false);

    // 개발자 모드 상태
    const { isDevMode } = useDevModeStore();

    // 🍎 클릭/더블클릭 구분을 위한 타이머 ref
    const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 싱글클릭 핸들러 (더블클릭과 구분하기 위해 딜레이)
    const handleRowClick = useCallback((customerId: string, customer: Customer) => {
      // 기존 타이머가 있으면 취소
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
      // 300ms 후에 싱글클릭 실행 (더블클릭이면 취소됨)
      clickTimerRef.current = setTimeout(() => {
        onCustomerClick?.(customerId, customer);
        clickTimerRef.current = null;
      }, 300);
    }, [onCustomerClick]);

    // 더블클릭 핸들러 (싱글클릭 타이머 취소)
    const handleRowDoubleClick = useCallback((customerId: string, customer: Customer) => {
      // 싱글클릭 타이머 취소
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      onCustomerDoubleClick?.(customerId, customer);
    }, [onCustomerDoubleClick]);

    // 삭제 모드 상태
    const [isDeleteMode, setIsDeleteMode] = useState(false);
    const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
      isOpen: boolean;
      count: number;
    }>({ isOpen: false, count: 0 });

    // 전체 삭제 확인 모달 상태 (개발 환경 전용)
    const [deleteAllConfirmModal, setDeleteAllConfirmModal] = useState<{
      isOpen: boolean;
      totalCount: number;
    }>({ isOpen: false, totalCount: 0 });

    // Document-View 패턴: CustomerDocument 구독
    const {
      customers: allCustomers,
      isLoading,
      error,
      loadCustomers,
      refresh,
      lastUpdated,
    } = useCustomerDocument();

    // 초기 데이터 로드 (모든 고객 불러오기: status=all)
    // dependency를 빈 배열로 설정하여 Strict Mode에서도 최종 마운트 시 한 번만 실행
    useEffect(() => {
      if (import.meta.env.DEV) {
        console.log('[AllCustomersView] Document 구독 및 초기 데이터 로드');
      }
      loadCustomers({ limit: 10000, page: 1, status: 'all' });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Note: customerChanged 이벤트 리스너는 불필요
    // AllCustomersView는 useCustomerDocument 훅을 통해 CustomerDocument를 구독하므로
    // Document가 변경되면 자동으로 업데이트됨 (Document-View 패턴)
    // 이벤트 리스너를 추가하면 중복 API 호출로 인한 경쟁 조건(race condition) 발생

    // 🍎 휴면 처리/복원 후 활성 필터로 자동 전환
    useEffect(() => {
      const handleStatusFilterChange = (event: Event) => {
        const customEvent = event as CustomEvent<{ filter: 'all' | 'active' | 'inactive' }>;
        if (customEvent.detail?.filter) {
          setStatusFilter(customEvent.detail.filter);
          setCurrentPage(1); // 첫 페이지로 이동
        }
      };

      window.addEventListener('customerStatusFilterChange', handleStatusFilterChange);
      return () => {
        window.removeEventListener('customerStatusFilterChange', handleStatusFilterChange);
      };
    }, [setStatusFilter, setCurrentPage]);

    // 검색 및 유형 필터링된 고객 목록
    const filteredCustomers = useMemo(() => {
      let customers = allCustomers;

      // 상태 필터링
      if (statusFilter === 'active') {
        customers = customers.filter(c => c.meta?.status === 'active');
      } else if (statusFilter === 'inactive') {
        customers = customers.filter(c => c.meta?.status === 'inactive');
      }
      // statusFilter === 'all'이면 필터링하지 않음

      // 유형 필터링 (현재 customerTypeFilter는 'all'로 고정됨)
      // if (customerTypeFilter === 'personal') {
      //   customers = customers.filter(c => c.insurance_info?.customer_type === '개인');
      // } else if (customerTypeFilter === 'corporate') {
      //   customers = customers.filter(c => c.insurance_info?.customer_type === '법인');
      // }

      // 검색 필터링
      if (searchValue.trim()) {
        const searchLower = searchValue.toLowerCase().trim();
        customers = customers.filter(customer => {
          const name = customer.personal_info?.name?.toLowerCase() || '';
          const phone = customer.personal_info?.mobile_phone?.replace(/-/g, '') || '';
          const email = customer.personal_info?.email?.toLowerCase() || '';

          return (
            name.includes(searchLower) ||
            phone.includes(searchLower) ||
            email.includes(searchLower)
          );
        });
      }

      return customers;
    }, [allCustomers, searchValue, customerTypeFilter, statusFilter]);

    // 정렬된 고객 목록 (페이지네이션 적용 전)
    const sortedCustomers = useMemo(() => {
      const sorted = [...filteredCustomers];

      // 칼럼 정렬이 활성화된 경우
      if (sortField) {
        sorted.sort((a, b) => {
          let compareResult = 0;

          switch (sortField) {
            case 'name': {
              const nameA = a.personal_info?.name || '';
              const nameB = b.personal_info?.name || '';
              compareResult = nameA.localeCompare(nameB, 'ko');
              break;
            }
            case 'birth': {
              const dateA = a.personal_info?.birth_date ? new Date(a.personal_info.birth_date).getTime() : 0;
              const dateB = b.personal_info?.birth_date ? new Date(b.personal_info.birth_date).getTime() : 0;
              compareResult = dateA - dateB;
              break;
            }
            case 'gender': {
              const genderA = a.personal_info?.gender || '';
              const genderB = b.personal_info?.gender || '';
              compareResult = genderA.localeCompare(genderB, 'ko');
              break;
            }
            case 'phone': {
              const phoneA = a.personal_info?.mobile_phone || '';
              const phoneB = b.personal_info?.mobile_phone || '';
              compareResult = phoneA.localeCompare(phoneB);
              break;
            }
            case 'email': {
              const emailA = a.personal_info?.email || '';
              const emailB = b.personal_info?.email || '';
              compareResult = emailA.localeCompare(emailB);
              break;
            }
            case 'address': {
              const addressA = a.personal_info?.address?.address1 || '';
              const addressB = b.personal_info?.address?.address1 || '';
              compareResult = addressA.localeCompare(addressB, 'ko');
              break;
            }
            case 'type': {
              const typeA = a.insurance_info?.customer_type || '';
              const typeB = b.insurance_info?.customer_type || '';
              compareResult = typeA.localeCompare(typeB, 'ko');
              break;
            }
            case 'status': {
              const statusA = a.meta?.status || '';
              const statusB = b.meta?.status || '';
              compareResult = statusA.localeCompare(statusB);
              break;
            }
            case 'created': {
              const dateA = a.meta?.created_at ? new Date(a.meta.created_at).getTime() : 0;
              const dateB = b.meta?.created_at ? new Date(b.meta.created_at).getTime() : 0;
              compareResult = dateA - dateB;
              break;
            }
          }

          return sortDirection === 'asc' ? compareResult : -compareResult;
        });
      } else {
        // 정렬 없을 때 기본값: 최신순 (등록일 내림차순)
        sorted.sort((a, b) => {
          const dateA = a.meta?.created_at ? new Date(a.meta.created_at).getTime() : 0;
          const dateB = b.meta?.created_at ? new Date(b.meta.created_at).getTime() : 0;
          return dateB - dateA;
        });
      }

      return sorted;
    }, [filteredCustomers, sortField, sortDirection]);

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

    // 개인/법인 고객 수 계산 (활성/휴면/전체 모두)
    // 초기 로드가 완료된 후에만 계산 (lastUpdated > 0)
    const typeCounts = useMemo(() => {
      if (import.meta.env.DEV) {
        console.log('[AllCustomersView] typeCounts 계산 시작, lastUpdated:', lastUpdated, 'allCustomers.length:', allCustomers.length);
        console.log('[AllCustomersView] allCustomers:', allCustomers.map(c => ({
          name: c.personal_info?.name,
          type: c.insurance_info?.customer_type,
          status: c.meta?.status
        })));
      }

      // 아직 초기 데이터 로드가 완료되지 않았으면 빈 카운트 반환
      // - lastUpdated === 0: 아직 한 번도 로드되지 않음
      // - isLoading === true: 로딩 중
      // 둘 중 하나라도 true면 데이터가 완전하지 않으므로 빈 카운트 반환
      if (lastUpdated === 0 || isLoading) {
        return {
          active: { personal: 0, corporate: 0 },
          inactive: { personal: 0, corporate: 0 },
          all: { personal: 0, corporate: 0 }
        };
      }

      const activeCustomers = allCustomers.filter(c => c.meta?.status === 'active');
      const inactiveCustomers = allCustomers.filter(c => c.meta?.status === 'inactive');

      const result = {
        active: {
          personal: activeCustomers.filter(c => c.insurance_info?.customer_type === '개인').length,
          corporate: activeCustomers.filter(c => c.insurance_info?.customer_type === '법인').length,
        },
        inactive: {
          personal: inactiveCustomers.filter(c => c.insurance_info?.customer_type === '개인').length,
          corporate: inactiveCustomers.filter(c => c.insurance_info?.customer_type === '법인').length,
        },
        all: {
          personal: allCustomers.filter(c => c.insurance_info?.customer_type === '개인').length,
          corporate: allCustomers.filter(c => c.insurance_info?.customer_type === '법인').length,
        }
      };

      if (import.meta.env.DEV) {
        console.log('[AllCustomersView] typeCounts 계산 완료:', result);
      }

      return result;
    }, [allCustomers, lastUpdated]);

    // 필터링된 고객 수 계산 (테이블에 보이는 고객)
    const filteredCount = useMemo(() => {
      return filteredCustomers.length;
    }, [filteredCustomers]);

    // 활성/휴면 고객 수 계산 (전체 기준)
    const statusCounts = useMemo(() => {
      const active = allCustomers.filter(c => c.meta?.status === 'active').length;
      const inactive = allCustomers.filter(c => c.meta?.status === 'inactive').length;
      return { active, inactive, total: allCustomers.length };
    }, [allCustomers]);

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

    const handleColumnSort = (field: SortField) => {
      if (sortField === field) {
        // 같은 칼럼을 클릭하면 방향 토글
        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
      } else {
        // 다른 칼럼을 클릭하면 해당 칼럼으로 오름차순 정렬
        setSortField(field);
        setSortDirection('asc');
      }
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

    // handleTypeFilterChange는 현재 사용되지 않음 (customerTypeFilter가 'all'로 고정)
    // const handleTypeFilterChange = (filter: 'all' | 'personal' | 'corporate') => {
    //   setCustomerTypeFilter(filter);
    //   setCurrentPage(1);
    // };

    const handleStatusFilterChange = (filter: 'all' | 'active' | 'inactive') => {
      setStatusFilter(filter);
      setCurrentPage(1); // 필터 변경 시 첫 페이지로 이동
    };

    // 삭제 모드 핸들러
    const handleToggleDeleteMode = () => {
      if (isDeleteMode) {
        // 삭제 모드 종료 시 선택 초기화
        setSelectedCustomerIds(new Set());
      }
      setIsDeleteMode(!isDeleteMode);
    };

    const handleSelectCustomer = (customerId: string, event: React.MouseEvent) => {
      event.stopPropagation();
      setSelectedCustomerIds(prev => {
        const next = new Set(prev);
        if (next.has(customerId)) {
          next.delete(customerId);
        } else {
          next.add(customerId);
        }
        return next;
      });
    };

    const handleSelectAll = (checked: boolean) => {
      if (checked) {
        const allIds = visibleCustomers.map(c => c._id).filter(Boolean);
        setSelectedCustomerIds(new Set(allIds));
      } else {
        setSelectedCustomerIds(new Set());
      }
    };

    const handleDeleteSelected = () => {
      if (selectedCustomerIds.size === 0) return;
      setDeleteConfirmModal({
        isOpen: true,
        count: selectedCustomerIds.size,
      });
    };

    const handleConfirmDelete = async () => {
      setDeleteConfirmModal({ isOpen: false, count: 0 });
      setIsDeleting(true);

      try {
        const ids = Array.from(selectedCustomerIds);
        await CustomerService.deleteCustomers(ids);

        // 삭제 완료 후 새로고침 및 상태 초기화
        await refresh({ limit: 10000, page: 1 });
        setSelectedCustomerIds(new Set());
        setIsDeleteMode(false);

        // 고객 관리 뷰 통계 즉시 반영을 위한 쿼리 캐시 무효화
        queryClient.invalidateQueries({ queryKey: ['allCustomers'] });
        queryClient.invalidateQueries({ queryKey: ['allRelationships'] });
      } catch (error) {
        console.error('[AllCustomersView] 고객 삭제 실패:', error);
        showAlert({
          title: '삭제 실패',
          message: '고객 삭제 중 오류가 발생했습니다.',
          iconType: 'error'
        });
      } finally {
        setIsDeleting(false);
      }
    };

    // 전체 삭제 핸들러 (개발 환경 전용)
    const handleDeleteAll = () => {
      setDeleteAllConfirmModal({
        isOpen: true,
        totalCount: allCustomers.length
      });
    };

    const handleConfirmDeleteAll = async () => {
      setDeleteAllConfirmModal({ isOpen: false, totalCount: 0 });
      setIsDeleting(true);

      try {
        const result = await CustomerService.deleteAllCustomers();
        showAlert({
          title: '삭제 완료',
          message: `${result.deletedCount}명의 고객이 삭제되었습니다.`,
          iconType: 'success'
        });

        // 삭제 완료 후 새로고침 및 상태 초기화
        await refresh({ limit: 10000, page: 1 });
        setSelectedCustomerIds(new Set());
        setIsDeleteMode(false);

        // 고객 관리 뷰 통계 즉시 반영을 위한 쿼리 캐시 무효화
        queryClient.invalidateQueries({ queryKey: ['allCustomers'] });
        queryClient.invalidateQueries({ queryKey: ['allRelationships'] });
      } catch (error) {
        console.error('[AllCustomersView] 고객 전체 삭제 실패:', error);
        showAlert({
          title: '삭제 실패',
          message: '고객 전체 삭제 중 오류가 발생했습니다.',
          iconType: 'error'
        });
      } finally {
        setIsDeleting(false);
      }
    };

    const getCustomerIcon = (customer: Customer) => {
      const customerType = customer.insurance_info?.customer_type;
      if (customerType === '법인') {
        // 법인: 건물 아이콘 (16px - CLAUDE.md 준수)
        return (
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--corporate">
            <circle cx="10" cy="10" r="10" opacity="0.2" />
            <path d="M6 5h2v2H6V5zm0 3h2v2H6V8zm0 3h2v2H6v-2zm3-6h2v2H9V5zm0 3h2v2H9V8zm0 3h2v2H9v-2zm3-6h2v2h-2V5zm0 3h2v2h-2V8zm0 3h2v2h-2v-2zM5 14h10v2H5v-2z" />
          </svg>
        );
      }
      // 개인: 사람 아이콘 (16px - CLAUDE.md 준수)
      return (
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--personal">
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

    const getCustomerInfo = (customer: Customer) => {
      const phoneNumber = customer.personal_info?.mobile_phone || '-';
      return `${phoneNumber}`;
    };

    const getCustomerBirthDate = (customer: Customer) => {
      const birthDate = customer.personal_info?.birth_date;
      if (!birthDate) return '-';
      return formatDate(birthDate);
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
      return formatDateTime(createdAt);
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
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearSearch}
                className="search-clear-button"
                aria-label="검색어 지우기"
              >
                <SFSymbol name="xmark.circle.fill" size={SFSymbolSize.CAPTION_1} />
              </Button>
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refresh({ limit: 10000, page: 1 })}
              className="error-dismiss-button"
              aria-label="에러 닫기"
            >
              <SFSymbol name="xmark" size={SFSymbolSize.CAPTION_1} />
            </Button>
          </div>
        )}

        {/* 결과 헤더 */}
        {!isLoading && (
          <div className="customer-library-result-header">
            <div className="result-count">
              {/* 개발자 모드일 때만 삭제 버튼 표시 */}
              {isDevMode && (
                <Tooltip content={isDeleteMode ? '삭제 완료' : '삭제'}>
                  <button
                    type="button"
                    className={`edit-mode-icon-button ${isDeleteMode ? 'edit-mode-icon-button--active' : ''}`}
                    onClick={handleToggleDeleteMode}
                    aria-label={isDeleteMode ? '삭제 완료' : '삭제'}
                  >
                    {isDeleteMode ? (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      <SFSymbol
                        name="trash"
                        size={SFSymbolSize.CAPTION_1}
                        weight={SFSymbolWeight.MEDIUM}
                        decorative={true}
                      />
                    )}
                  </button>
                </Tooltip>
              )}

              {/* 상태 필터 버튼 */}
              <button
                className={`type-filter-button ${statusFilter === 'active' ? 'active' : ''}`}
                onClick={() => handleStatusFilterChange('active')}
                title="활성 고객만 보기"
              >
                활성(개인 {typeCounts.active.personal}, 법인 {typeCounts.active.corporate})
              </button>
              <span className="type-filter-separator">/</span>
              <button
                className={`type-filter-button ${statusFilter === 'inactive' ? 'active' : ''}`}
                onClick={() => handleStatusFilterChange('inactive')}
                title="휴면 고객만 보기"
              >
                휴면(개인 {typeCounts.inactive.personal}, 법인 {typeCounts.inactive.corporate})
              </button>
              <span className="type-filter-separator">/</span>
              <button
                className={`type-filter-button ${statusFilter === 'all' ? 'active' : ''}`}
                onClick={() => handleStatusFilterChange('all')}
                title="모든 고객 보기"
              >
                전체({typeCounts.all.personal + typeCounts.all.corporate})
              </button>

              {/* 삭제 모드일 때 선택 수 및 삭제 버튼 */}
              {isDeleteMode && (
                <>
                  <span className="selected-count-inline">
                    {selectedCustomerIds.size}개 선택됨
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteSelected}
                    disabled={isDeleting || selectedCustomerIds.size === 0}
                  >
                    {isDeleting ? '삭제 중...' : '삭제'}
                  </Button>
                  {/* 전체 삭제 버튼 (개발 환경 전용) */}
                  {import.meta.env.DEV && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDeleteAll}
                      disabled={isDeleting || allCustomers.length === 0}
                    >
                      전체 삭제
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* 고객 목록 */}
        <div className="customer-list">
          {/* 컬럼 헤더 */}
          {!isEmpty && !isLoading && (
            <div className="customer-list-header">
              {/* 삭제 모드일 때 전체 선택 체크박스 */}
              {isDeleteMode && (
                <div className="header-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedCustomerIds.size === visibleCustomers.length && visibleCustomers.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    aria-label="전체 선택"
                  />
                </div>
              )}
              <div className="header-type header-sortable" onClick={() => handleColumnSort('type')}>
                <span>유형</span>
                {sortField === 'type' ? (
                  <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                ) : (
                  <span className="sort-indicator sort-indicator--both">
                    <span className="sort-arrow">▲</span>
                    <span className="sort-arrow">▼</span>
                  </span>
                )}
              </div>
              <div className="header-name header-sortable" onClick={() => handleColumnSort('name')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="8" cy="5" r="2.5" fill="currentColor"/>
                  <path d="M8 9c-2.5 0-4.5 1.5-4.5 3v1.5h9V12c0-1.5-2-3-4.5-3z" fill="currentColor"/>
                </svg>
                <span>이름</span>
                {sortField === 'name' ? (
                  <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                ) : (
                  <span className="sort-indicator sort-indicator--both">
                    <span className="sort-arrow">▲</span>
                    <span className="sort-arrow">▼</span>
                  </span>
                )}
              </div>
              <div className="header-birth header-sortable" onClick={() => handleColumnSort('birth')}>
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
                {sortField === 'birth' ? (
                  <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                ) : (
                  <span className="sort-indicator sort-indicator--both">
                    <span className="sort-arrow">▲</span>
                    <span className="sort-arrow">▼</span>
                  </span>
                )}
              </div>
              <div className="header-gender header-sortable" onClick={() => handleColumnSort('gender')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="5" cy="6" r="2" fill="currentColor"/>
                  <path d="M5 9c-1.5 0-3 1-3 2v1h6v-1c0-1-1.5-2-3-2z" fill="currentColor"/>
                  <circle cx="11" cy="6" r="2" fill="currentColor"/>
                  <path d="M11 9c-1.5 0-3 1-3 2v1h6v-1c0-1-1.5-2-3-2z" fill="currentColor"/>
                </svg>
                <span>성별</span>
                {sortField === 'gender' ? (
                  <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                ) : (
                  <span className="sort-indicator sort-indicator--both">
                    <span className="sort-arrow">▲</span>
                    <span className="sort-arrow">▼</span>
                  </span>
                )}
              </div>
              <div className="header-phone header-sortable" onClick={() => handleColumnSort('phone')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <path d="M3 1h3l1 3-2 2c1 2 3 4 5 5l2-2 3 1v3c0 1-1 2-2 2C6 15 1 10 1 3c0-1 1-2 2-2z" fill="currentColor"/>
                </svg>
                <span>전화</span>
                {sortField === 'phone' ? (
                  <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                ) : (
                  <span className="sort-indicator sort-indicator--both">
                    <span className="sort-arrow">▲</span>
                    <span className="sort-arrow">▼</span>
                  </span>
                )}
              </div>
              <div className="header-email header-sortable" onClick={() => handleColumnSort('email')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <rect x="1" y="4" width="14" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                  <path d="M1 5l7 5 7-5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                </svg>
                <span>이메일</span>
                {sortField === 'email' ? (
                  <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                ) : (
                  <span className="sort-indicator sort-indicator--both">
                    <span className="sort-arrow">▲</span>
                    <span className="sort-arrow">▼</span>
                  </span>
                )}
              </div>
              <div className="header-address header-sortable" onClick={() => handleColumnSort('address')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <path d="M8 1l-7 6h2v7h4V9h2v5h4V7h2L8 1z" fill="currentColor"/>
                </svg>
                <span>주소</span>
                {sortField === 'address' ? (
                  <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                ) : (
                  <span className="sort-indicator sort-indicator--both">
                    <span className="sort-arrow">▲</span>
                    <span className="sort-arrow">▼</span>
                  </span>
                )}
              </div>
              <div className="header-status header-sortable" onClick={() => handleColumnSort('status')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="7" fill="currentColor"/>
                  <path d="M6 8l2 2 4-4" stroke="white" strokeWidth="1.5" fill="none"/>
                </svg>
                <span>상태</span>
                {sortField === 'status' ? (
                  <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                ) : (
                  <span className="sort-indicator sort-indicator--both">
                    <span className="sort-arrow">▲</span>
                    <span className="sort-arrow">▼</span>
                  </span>
                )}
              </div>
              <div className="header-created header-sortable" onClick={() => handleColumnSort('created')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="7" fill="currentColor"/>
                  <path d="M8 4v4h3" stroke="white" strokeWidth="1" fill="none"/>
                </svg>
                <span>등록일</span>
                {sortField === 'created' ? (
                  <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                ) : (
                  <span className="sort-indicator sort-indicator--both">
                    <span className="sort-arrow">▲</span>
                    <span className="sort-arrow">▼</span>
                  </span>
                )}
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
                className={`customer-item ${isDeleteMode && selectedCustomerIds.has(customer._id) ? 'customer-item--selected' : ''}`}
                onClick={() => {
                  if (isDeleteMode) {
                    // 삭제 모드에서는 체크박스 토글
                    handleSelectCustomer(customer._id, { stopPropagation: () => {} } as React.MouseEvent);
                  } else {
                    // 🍎 싱글클릭/더블클릭 구분 (타이머 사용)
                    handleRowClick(customer._id, customer);
                  }
                }}
                onDoubleClick={() => {
                  if (!isDeleteMode) {
                    // 🍎 더블클릭 시 싱글클릭 타이머 취소
                    handleRowDoubleClick(customer._id, customer);
                  }
                }}
              >
                {/* 삭제 모드일 때 체크박스 */}
                {isDeleteMode && (
                  <div className="customer-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedCustomerIds.has(customer._id)}
                      onChange={() => {}}
                      onClick={(e) => handleSelectCustomer(customer._id, e)}
                      aria-label={`${customer.personal_info?.name || '고객'} 선택`}
                    />
                  </div>
                )}
                <span className="customer-type">{getCustomerIcon(customer)}</span>
                <span className="customer-name">{customer.personal_info?.name || '이름 없음'}</span>
                <span className="customer-birth">{getCustomerBirthDate(customer)}</span>
                <span className="customer-gender">{getCustomerGender(customer)}</span>
                <span className="customer-phone">{getCustomerInfo(customer)}</span>
                <span className="customer-email">{getCustomerEmail(customer)}</span>
                <span className="customer-address">{getCustomerAddress(customer)}</span>
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePrevPage}
                  disabled={pagination.currentPage === 1}
                  className="pagination-button pagination-button--prev"
                  aria-label="이전 페이지"
                >
                  <span className={`pagination-arrow ${prevArrowClicked ? 'pagination-arrow--clicked' : ''}`}>
                    ‹
                  </span>
                </Button>

                <div className="pagination-info">
                  <span className="pagination-current">{pagination.currentPage}</span>
                  <span className="pagination-separator">/</span>
                  <span className="pagination-total">{pagination.totalPages}</span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={pagination.currentPage === pagination.totalPages}
                  className="pagination-button pagination-button--next"
                  aria-label="다음 페이지"
                >
                  <span className={`pagination-arrow ${nextArrowClicked ? 'pagination-arrow--clicked' : ''}`}>
                    ›
                  </span>
                </Button>
              </div>
            )}

            {/* 🍎 페이지가 1개일 때 빈 공간 유지 */}
            {pagination.totalPages <= 1 && <div className="pagination-spacer"></div>}
          </div>
        )}

        {/* 삭제 확인 모달 */}
        <Modal
          visible={deleteConfirmModal.isOpen}
          onClose={() => setDeleteConfirmModal({ isOpen: false, count: 0 })}
          title="고객 삭제"
          size="sm"
        >
          <div className="delete-confirm-content">
            <p>선택한 <strong>{deleteConfirmModal.count}명</strong>의 고객을 삭제하시겠습니까?</p>
            <p className="delete-warning">이 작업은 되돌릴 수 없습니다.</p>
            <div className="delete-confirm-actions">
              <Button
                variant="ghost"
                onClick={() => setDeleteConfirmModal({ isOpen: false, count: 0 })}
              >
                취소
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDelete}
              >
                삭제
              </Button>
            </div>
          </div>
        </Modal>

        {/* 전체 삭제 확인 모달 (개발 환경 전용) */}
        <Modal
          visible={deleteAllConfirmModal.isOpen}
          onClose={() => setDeleteAllConfirmModal({ isOpen: false, totalCount: 0 })}
          title="⚠️ 전체 고객 삭제"
          size="sm"
        >
          <div className="delete-confirm-content">
            <p><strong>현재 등록된 모든 고객 ({deleteAllConfirmModal.totalCount}명)</strong>을 삭제하시겠습니까?</p>
            <p className="delete-warning">⚠️ 이 작업은 되돌릴 수 없습니다!</p>
            <p className="delete-warning">개발 환경 전용 기능입니다.</p>
            <div className="delete-confirm-actions">
              <Button
                variant="ghost"
                onClick={() => setDeleteAllConfirmModal({ isOpen: false, totalCount: 0 })}
              >
                취소
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDeleteAll}
              >
                전체 삭제
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }
);

export default AllCustomersView;
