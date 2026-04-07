/**
 * AIMS UIX-3 All Customers View
 * @since 2025-10-03
 * @version 2.0.0 - Apple Style (DocumentLibraryView 패턴)
 *
 * 전체 고객 목록 뷰
 * iOS/macOS native table view style
 */

import React, { forwardRef, useImperativeHandle, useState, useMemo, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppleConfirm } from '@/contexts/AppleConfirmProvider';
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../../components/SFSymbol';
import { Dropdown, Tooltip, Modal, ContextMenu, useContextMenu, type ContextMenuSection, InitialFilterBar, type InitialType, KOREAN_INITIALS, ALPHABET_INITIALS, NUMBER_INITIALS } from '@/shared/ui';
import Button from '@/shared/ui/Button';
import { Pagination } from '@/shared/ui/Pagination';
import { SortIndicator } from '@/shared/ui/SortIndicator';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useDevModeStore } from '@/shared/store/useDevModeStore';
import { useCustomerStatusFilterStore } from '@/shared/store/useCustomerStatusFilterStore';
import { useRecentCustomersStore } from '@/shared/store/useRecentCustomersStore';
import { CustomerService } from '@/services/customerService';
import type { Customer } from '@/entities/customer/model';
import { formatDate, formatDateTime } from '@/shared/lib/timeUtils';
import { errorReporter } from '@/shared/lib/errorReporter';
import { highlightText } from '@/shared/lib/highlightText';
import './AllCustomersView.header.css';
import './AllCustomersView.items.css';
import './AllCustomersView.delete.css';
import './AllCustomersView.mobile.css';

interface AllCustomersViewProps {
  /** 고객 클릭 핸들러 */
  onCustomerClick?: (customerId: string, customer: Customer) => void;
  /** 고객 더블클릭 핸들러 (전체 보기로 이동) */
  onCustomerDoubleClick?: (customerId: string, customer: Customer) => void;
  /** 뷰 이동 핸들러 */
  onNavigate?: (viewKey: string) => void;
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
  function AllCustomersView({ onCustomerClick, onCustomerDoubleClick, onNavigate }, ref) {
    // 🍎 애플 스타일 알림 모달
    const { showAlert } = useAppleConfirm();

    // React Query 캐시 무효화를 위한 queryClient
    const queryClient = useQueryClient();

    // F5 이후에도 유지되는 상태들
    const [itemsPerPage, setItemsPerPage] = useState<string>(() => {
      return localStorage.getItem('aims-customer-all-items-per-page') || '15'
    });

    // itemsPerPage 변경 시 localStorage에 자동 저장
    useEffect(() => {
      localStorage.setItem('aims-customer-all-items-per-page', itemsPerPage)
    }, [itemsPerPage]);

    const [searchValue, setSearchValue] = usePersistedState('customer-all-search', '');
    const [currentPage, setCurrentPage] = usePersistedState('customer-all-page', 1);
    // 상태+유형 통합 필터 (5가지 옵션)
    const [statusFilter, setStatusFilter] = usePersistedState<
      'all' | 'active' | 'inactive' | 'active-personal' | 'active-corporate' | 'inactive-personal' | 'inactive-corporate'
    >('customer-all-status-filter', 'all');

    // 초성 필터 상태
    const [initialType, setInitialType] = usePersistedState<InitialType>('customer-all-initial-type', 'korean');
    const [selectedInitial, setSelectedInitial] = usePersistedState<string | null>('customer-all-selected-initial', null);

    // 칼럼 정렬 상태
    const [sortField, setSortField] = usePersistedState<SortField | null>('customer-all-sort-field', null);
    const [sortDirection, setSortDirection] = usePersistedState<SortDirection>('customer-all-sort-direction', 'asc');

    // UI 상태 (새로고침 시 초기화되어도 됨)
    // 클릭 피드백은 Pagination 컴포넌트 내부에서 처리

    // 개발자 모드 상태
    const { isDevMode } = useDevModeStore();

    // 🍎 싱글클릭 = 즉시 전체보기 (중장년 사용자 UX 개선: 더블클릭 구분 제거)
    const handleRowClick = useCallback((customerId: string, customer: Customer) => {
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

    // 🍎 고객 컨텍스트 메뉴
    const customerContextMenu = useContextMenu();
    const [contextMenuCustomer, setContextMenuCustomer] = useState<Customer | null>(null);

    // 🍎 도움말 모달
    const [helpModalVisible, setHelpModalVisible] = useState(false);

    // 🍎 고객 컨텍스트 메뉴 핸들러
    const handleCustomerContextMenu = useCallback((customer: Customer, event: React.MouseEvent) => {
      setContextMenuCustomer(customer);
      customerContextMenu.open(event);
    }, [customerContextMenu]);

    // === Server-side paginated data ===
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [serverPagination, setServerPagination] = useState({
      currentPage: 1, totalPages: 1, totalCount: 0, limit: 15,
    });
    const [stats, setStats] = useState<{
      activePersonal: number; activeCorporate: number;
      inactivePersonal: number; inactiveCorporate: number;
    } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState(0);

    // Debounced search (300ms delay for server-side search)
    const [debouncedSearch, setDebouncedSearch] = useState(searchValue);
    useEffect(() => {
      const timer = setTimeout(() => {
        setDebouncedSearch(searchValue);
        // 검색어 변경 시 첫 페이지로 이동 (기존 값과 다를 때만)
        if (searchValue !== debouncedSearch) {
          setCurrentPage(1);
        }
      }, 300);
      return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchValue]);

    // Fetch counter for forced re-fetch after CRUD
    const [fetchKey, setFetchKey] = useState(0);

    // Build server-side query from current filter state
    const apiQuery = useMemo(() => {
      let apiStatus: string;
      let apiCustomerType: '개인' | '법인' | undefined;
      switch (statusFilter) {
        case 'active': apiStatus = 'active'; break;
        case 'inactive': apiStatus = 'inactive'; break;
        case 'active-personal': apiStatus = 'active'; apiCustomerType = '개인'; break;
        case 'active-corporate': apiStatus = 'active'; apiCustomerType = '법인'; break;
        case 'inactive-personal': apiStatus = 'inactive'; apiCustomerType = '개인'; break;
        case 'inactive-corporate': apiStatus = 'inactive'; apiCustomerType = '법인'; break;
        default: apiStatus = 'all';
      }
      return {
        page: currentPage,
        limit: parseInt(itemsPerPage),
        status: apiStatus,
        customerType: apiCustomerType,
        search: debouncedSearch.trim() || undefined,
        sort: sortField ? `${sortField}_${sortDirection}` : undefined,
        initial: selectedInitial || undefined,
      };
    }, [currentPage, itemsPerPage, statusFilter, debouncedSearch, sortField, sortDirection, selectedInitial]);

    // Fetch customers from server
    useEffect(() => {
      let cancelled = false;
      const fetchData = async () => {
        setIsLoading(true);
        setError(null);
        try {
          if (import.meta.env.DEV) {
            console.log('[AllCustomersView] 서버사이드 데이터 로드:', apiQuery);
          }
          const response = await CustomerService.getCustomers(apiQuery);
          if (cancelled) return;
          setCustomers(response.customers);
          if (response.pagination) {
            setServerPagination({
              currentPage: response.pagination.currentPage ?? 1,
              totalPages: response.pagination.totalPages ?? 1,
              totalCount: response.pagination.totalCount ?? response.customers.length,
              limit: response.pagination.limit ?? parseInt(itemsPerPage),
            });
          }
          if (response.stats) {
            setStats(response.stats);
          }
          setLastUpdated(Date.now());
        } catch (err) {
          if (cancelled) return;
          console.error('[AllCustomersView] 데이터 로드 실패:', err);
          errorReporter.reportApiError(err as Error, { component: 'AllCustomersView.fetchData' });
          setError(err instanceof Error ? err.message : '고객 목록 로드 실패');
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      };
      fetchData();
      return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiQuery, fetchKey]);

    // Refresh: re-fetch current page (after CRUD operations)
    const refresh = useCallback(() => {
      setFetchKey(k => k + 1);
    }, []);

    // 🍎 휴면 처리/복원 후 활성 필터로 자동 전환 (Zustand store 구독)
    const pendingFilter = useCustomerStatusFilterStore((s) => s.pendingFilter);
    useEffect(() => {
      if (pendingFilter) {
        setStatusFilter(pendingFilter);
        setCurrentPage(1); // 첫 페이지로 이동
        useCustomerStatusFilterStore.getState().consumeFilterChange();
      }
    }, [pendingFilter, setStatusFilter, setCurrentPage]);

    // === Server provides filtered/sorted/paginated data directly ===
    // No client-side filtering chain needed (filteredCustomers, sortedCustomers, visibleCustomers)

    // 서버사이드 초성 카운트 (DB 전체 고객 대상)
    const [initialCounts, setInitialCounts] = useState<Map<string, number>>(new Map());

    useEffect(() => {
      CustomerService.getCustomerInitials()
        .then(counts => {
          const map = new Map<string, number>();
          KOREAN_INITIALS.forEach(i => map.set(i, 0));
          ALPHABET_INITIALS.forEach(i => map.set(i, 0));
          NUMBER_INITIALS.forEach(i => map.set(i, 0));
          Object.entries(counts).forEach(([k, v]) => map.set(k, v));
          setInitialCounts(map);
        })
        .catch(() => {});
    }, [fetchKey]);

    // Server pagination is the source of truth
    const totalCustomers = serverPagination.totalCount;
    const isEmpty = totalCustomers === 0 && !isLoading;
    const pagination = serverPagination;

    // Visible customers = the page returned by server
    const visibleCustomers = customers;

    // 🍎 고객 컨텍스트 메뉴 섹션
    const customerContextMenuSections: ContextMenuSection[] = useMemo(() => {
      if (!contextMenuCustomer) return [];

      const customerId = contextMenuCustomer._id;
      const customerName = contextMenuCustomer.personal_info?.name || '고객';
      const isInactive = contextMenuCustomer.meta?.status === 'inactive';

      return [
        {
          id: 'view',
          items: [
            {
              id: 'detail',
              label: '고객요약보기',
              icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              ),
              shortcut: 'Enter',
              onClick: () => onCustomerClick?.(customerId, contextMenuCustomer)
            },
            {
              id: 'full-detail',
              label: '고객상세보기',
              icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                  <path d="M16 13H8" />
                  <path d="M16 17H8" />
                  <path d="M10 9H8" />
                </svg>
              ),
              shortcut: '⌘+Enter',
              onClick: () => onCustomerDoubleClick?.(customerId, contextMenuCustomer)
            }
          ]
        },
        ...(isDevMode ? [{
          id: 'danger',
          items: [
            {
              id: 'toggle-status',
              label: isInactive ? '활성화' : '휴면 처리',
              icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {isInactive ? (
                    <>
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </>
                  ) : (
                    <>
                      <circle cx="12" cy="12" r="10" />
                      <path d="M4.93 4.93l14.14 14.14" />
                    </>
                  )}
                </svg>
              ),
              onClick: async () => {
                try {
                  if (isInactive) {
                    await CustomerService.restoreCustomer(customerId);
                    useCustomerStatusFilterStore.getState().requestFilterChange('active');
                  } else {
                    await CustomerService.deleteCustomer(customerId);
                    useCustomerStatusFilterStore.getState().requestFilterChange('active');
                    useRecentCustomersStore.getState().removeRecentCustomer(customerId);
                  }
                  showAlert({ message: `${customerName} 고객이 ${isInactive ? '활성화' : '휴면 처리'}되었습니다.`, iconType: 'success' });
                  refresh();
                } catch (_err) {
                  showAlert({ message: '상태 변경에 실패했습니다.', iconType: 'error' });
                }
              }
            },
            {
              id: 'delete',
              label: '삭제',
              icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              ),
              danger: true,
              onClick: () => {
                // 삭제 모드 활성화 후 해당 고객 선택
                if (!isDeleteMode) {
                  setIsDeleteMode(true);
                }
                setSelectedCustomerIds(new Set([customerId]));
              }
            }
          ]
        }] : [])
      ];
    }, [contextMenuCustomer, onCustomerClick, onCustomerDoubleClick, isDevMode, isDeleteMode, showAlert, refresh]);

    // Stats from server (type/status breakdown)
    const typeCounts = useMemo(() => {
      if (!stats || lastUpdated === 0) {
        return {
          active: { personal: 0, corporate: 0 },
          inactive: { personal: 0, corporate: 0 },
          all: { personal: 0, corporate: 0 },
        };
      }
      return {
        active: { personal: stats.activePersonal, corporate: stats.activeCorporate },
        inactive: { personal: stats.inactivePersonal, corporate: stats.inactiveCorporate },
        all: {
          personal: stats.activePersonal + stats.inactivePersonal,
          corporate: stats.activeCorporate + stats.inactiveCorporate,
        },
      };
    }, [stats, lastUpdated]);

    // refresh 함수를 부모에게 노출
    useImperativeHandle(ref, () => ({
      refresh,
    }), [refresh]);

    const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchValue(e.target.value);
      // 페이지 리셋은 debounce effect에서 처리
    };

    const handleClearSearch = () => {
      setSearchValue('');
      // 페이지 리셋은 debounce effect에서 처리
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

    // 페이지 변경은 Pagination 컴포넌트에서 직접 호출
    const handlePageChange = (page: number) => {
      setCurrentPage(page);
    };

    // handleTypeFilterChange는 현재 사용되지 않음 (customerTypeFilter가 'all'로 고정)
    // const handleTypeFilterChange = (filter: 'all' | 'personal' | 'corporate') => {
    //   setCustomerTypeFilter(filter);
    //   setCurrentPage(1);
    // };

    const handleStatusFilterChange = (
      filter: 'all' | 'active' | 'inactive' | 'active-personal' | 'active-corporate' | 'inactive-personal' | 'inactive-corporate'
    ) => {
      setStatusFilter(filter);
      setCurrentPage(1); // 필터 변경 시 첫 페이지로 이동
    };

    // 탭 전환 시 선택된 초성 초기화
    const handleInitialTypeChange = useCallback((type: InitialType) => {
      setInitialType(type);
      setSelectedInitial(null);
      setCurrentPage(1);
    }, [setInitialType, setSelectedInitial, setCurrentPage]);

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

        if (isDevMode) {
          // 개발자 모드: Hard Delete (DB에서 완전 삭제)
          await Promise.all(ids.map(id => CustomerService.permanentDeleteCustomer(id)));
          // UI 부수효과: 최근 고객 제거
          ids.forEach(id => useRecentCustomersStore.getState().removeRecentCustomer(id));
          showAlert({
            title: '삭제 완료',
            message: `${ids.length}명의 고객이 영구 삭제되었습니다.`,
            iconType: 'success'
          });
        } else {
          // 일반 모드: Soft Delete (휴면 처리)
          await CustomerService.deleteCustomers(ids);
          // UI 부수효과: 활성 필터 전환 + 최근 고객 제거
          useCustomerStatusFilterStore.getState().requestFilterChange('active');
          ids.forEach(id => useRecentCustomersStore.getState().removeRecentCustomer(id));
        }

        // 삭제 완료 후 새로고침 및 상태 초기화
        refresh();
        setSelectedCustomerIds(new Set());
        setIsDeleteMode(false);

        // 고객 관리 뷰 통계 즉시 반영을 위한 쿼리 캐시 무효화
        queryClient.invalidateQueries({ queryKey: ['allCustomers'] });
        queryClient.invalidateQueries({ queryKey: ['allRelationships'] });
      } catch (error) {
        console.error('[AllCustomersView] 고객 삭제 실패:', error);
        errorReporter.reportApiError(error as Error, { component: 'AllCustomersView.handleConfirmDelete' });
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
        totalCount: serverPagination.totalCount
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
        refresh();
        setSelectedCustomerIds(new Set());
        setIsDeleteMode(false);

        // 고객 관리 뷰 통계 즉시 반영을 위한 쿼리 캐시 무효화
        queryClient.invalidateQueries({ queryKey: ['allCustomers'] });
        queryClient.invalidateQueries({ queryKey: ['allRelationships'] });
      } catch (error) {
        console.error('[AllCustomersView] 고객 전체 삭제 실패:', error);
        errorReporter.reportApiError(error as Error, { component: 'AllCustomersView.handleConfirmDeleteAll' });
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
              onClick={() => refresh()}
              className="error-dismiss-button"
              aria-label="에러 닫기"
            >
              <SFSymbol name="xmark" size={SFSymbolSize.CAPTION_1} />
            </Button>
          </div>
        )}

        {/* 결과 헤더: 검색 + 필터 */}
        {!isLoading && (
          <div className="customer-library-result-header">
            {/* 검색 인풋 (왼쪽) */}
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

            {/* 필터 버튼 (오른쪽) */}
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

              {/* 상태+유형 필터 버튼 */}
              <button
                className={`type-filter-button ${statusFilter === 'active-personal' ? 'active' : ''}`}
                onClick={() => handleStatusFilterChange('active-personal')}
                title="활성 개인 고객만 보기"
              >
                활성 개인({typeCounts.active.personal})
              </button>
              <span className="type-filter-separator">/</span>
              <button
                className={`type-filter-button ${statusFilter === 'active-corporate' ? 'active' : ''}`}
                onClick={() => handleStatusFilterChange('active-corporate')}
                title="활성 법인 고객만 보기"
              >
                활성 법인({typeCounts.active.corporate})
              </button>
              <span className="type-filter-separator">/</span>
              <button
                className={`type-filter-button ${statusFilter === 'inactive-personal' ? 'active' : ''}`}
                onClick={() => handleStatusFilterChange('inactive-personal')}
                title="휴면 개인 고객만 보기"
              >
                휴면 개인({typeCounts.inactive.personal})
              </button>
              <span className="type-filter-separator">/</span>
              <button
                className={`type-filter-button ${statusFilter === 'inactive-corporate' ? 'active' : ''}`}
                onClick={() => handleStatusFilterChange('inactive-corporate')}
                title="휴면 법인 고객만 보기"
              >
                휴면 법인({typeCounts.inactive.corporate})
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
                      disabled={isDeleting || serverPagination.totalCount === 0}
                    >
                      전체 삭제
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* 초성 필터 바 */}
        {!isLoading && (
          <InitialFilterBar
            initialType={initialType}
            onInitialTypeChange={handleInitialTypeChange}
            selectedInitial={selectedInitial}
            onSelectedInitialChange={(initial) => {
              setSelectedInitial(initial);
              setCurrentPage(1); // 초성 필터 변경 시 첫 페이지로 이동
            }}
            initialCounts={initialCounts}
            countLabel="명"
            targetLabel="고객"
            className="customer-all-initial-filter"
          />
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
                <SortIndicator field="type" currentSortField={sortField} sortDirection={sortDirection} />
              </div>
              <div className="header-name header-sortable" onClick={() => handleColumnSort('name')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="8" cy="5" r="2.5" fill="currentColor"/>
                  <path d="M8 9c-2.5 0-4.5 1.5-4.5 3v1.5h9V12c0-1.5-2-3-4.5-3z" fill="currentColor"/>
                </svg>
                <span>이름</span>
                <SortIndicator field="name" currentSortField={sortField} sortDirection={sortDirection} />
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
                <SortIndicator field="birth" currentSortField={sortField} sortDirection={sortDirection} />
              </div>
              <div className="header-gender header-sortable" onClick={() => handleColumnSort('gender')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="5" cy="6" r="2" fill="currentColor"/>
                  <path d="M5 9c-1.5 0-3 1-3 2v1h6v-1c0-1-1.5-2-3-2z" fill="currentColor"/>
                  <circle cx="11" cy="6" r="2" fill="currentColor"/>
                  <path d="M11 9c-1.5 0-3 1-3 2v1h6v-1c0-1-1.5-2-3-2z" fill="currentColor"/>
                </svg>
                <span>성별</span>
                <SortIndicator field="gender" currentSortField={sortField} sortDirection={sortDirection} />
              </div>
              <div className="header-phone header-sortable" onClick={() => handleColumnSort('phone')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <path d="M3 1h3l1 3-2 2c1 2 3 4 5 5l2-2 3 1v3c0 1-1 2-2 2C6 15 1 10 1 3c0-1 1-2 2-2z" fill="currentColor"/>
                </svg>
                <span>휴대폰</span>
                <SortIndicator field="phone" currentSortField={sortField} sortDirection={sortDirection} />
              </div>
              <div className="header-email header-sortable" onClick={() => handleColumnSort('email')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <rect x="1" y="4" width="14" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                  <path d="M1 5l7 5 7-5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                </svg>
                <span>이메일</span>
                <SortIndicator field="email" currentSortField={sortField} sortDirection={sortDirection} />
              </div>
              <div className="header-address header-sortable" onClick={() => handleColumnSort('address')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <path d="M8 1l-7 6h2v7h4V9h2v5h4V7h2L8 1z" fill="currentColor"/>
                </svg>
                <span>주소</span>
                <SortIndicator field="address" currentSortField={sortField} sortDirection={sortDirection} />
              </div>
              <div className="header-status header-sortable" onClick={() => handleColumnSort('status')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="7" fill="currentColor"/>
                  <path d="M6 8l2 2 4-4" stroke="white" strokeWidth="1.5" fill="none"/>
                </svg>
                <span>상태</span>
                <SortIndicator field="status" currentSortField={sortField} sortDirection={sortDirection} />
              </div>
              <div className="header-created header-sortable" onClick={() => handleColumnSort('created')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="7" fill="currentColor"/>
                  <path d="M8 4v4h3" stroke="white" strokeWidth="1" fill="none"/>
                </svg>
                <span>등록일</span>
                <SortIndicator field="created" currentSortField={sortField} sortDirection={sortDirection} />
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
              {!searchValue && onNavigate && (
                <Button
                  variant="primary"
                  onClick={() => onNavigate('customers-register')}
                  style={{ marginTop: '16px' }}
                >
                  새 고객 등록
                </Button>
              )}
            </div>
          )}

          {!isEmpty &&
            !isLoading &&
            visibleCustomers.map((customer) => (
              <div
                key={customer._id}
                className={`customer-item ${isDeleteMode && selectedCustomerIds.has(customer._id) ? 'customer-item--selected' : ''}`}
                data-context-menu="customer"
                onClick={() => {
                  if (isDeleteMode) {
                    // 삭제 모드에서는 체크박스 토글
                    handleSelectCustomer(customer._id, { stopPropagation: () => {} } as React.MouseEvent);
                  } else {
                    // 🍎 싱글클릭 = 즉시 전체보기
                    handleRowClick(customer._id, customer);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCustomerContextMenu(customer, e);
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
                <span className="customer-name">{debouncedSearch ? highlightText(customer.personal_info?.name || '이름 없음', debouncedSearch) : (customer.personal_info?.name || '이름 없음')}</span>
                <span className="customer-birth">{getCustomerBirthDate(customer)}</span>
                <span className="customer-gender">{getCustomerGender(customer)}</span>
                <span className="customer-phone">{debouncedSearch ? highlightText(getCustomerInfo(customer), debouncedSearch) : getCustomerInfo(customer)}</span>
                <span className="customer-email">{debouncedSearch ? highlightText(getCustomerEmail(customer), debouncedSearch) : getCustomerEmail(customer)}</span>
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

            {/* 🍎 페이지 네비게이션 */}
            {pagination.totalPages > 1 ? (
              <Pagination
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                onPageChange={handlePageChange}
              />
            ) : (
              <div className="pagination-spacer"></div>
            )}
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

        {/* 🍎 고객 컨텍스트 메뉴 */}
        <ContextMenu
          visible={customerContextMenu.isOpen}
          position={customerContextMenu.position}
          sections={customerContextMenuSections}
          onClose={customerContextMenu.close}
        />

        {/* 🍎 도움말 모달 */}
        <Modal
          visible={helpModalVisible}
          onClose={() => setHelpModalVisible(false)}
          title="👤 고객 전체보기 사용법"
          size="md"
        >
          <div className="help-modal-content">
            <div className="help-modal-section">
              <p><strong>🔍 고객 검색하기</strong></p>
              <ul>
                <li>검색창에 <strong>"홍길동"</strong> → 이름에 "홍길동" 포함된 고객</li>
                <li><strong>"010-1234"</strong> → 전화번호로 검색</li>
                <li><strong>"ㅎㄱㄷ"</strong> → 한글 초성으로도 검색 가능! (홍길동 찾기)</li>
              </ul>
            </div>
            <div className="help-modal-section">
              <p><strong>🏷️ 활성/휴면 고객 필터</strong></p>
              <ul>
                <li><strong>"활성"</strong> 필터: 현재 관리 중인 고객만 표시</li>
                <li><strong>"휴면"</strong> 필터: 휴면 처리된 고객만 표시</li>
                <li><strong>"전체"</strong>: 모든 고객 표시</li>
              </ul>
            </div>
            <div className="help-modal-section">
              <p><strong>📋 고객 정보 확인</strong></p>
              <ul>
                <li>고객 행 <strong>클릭</strong> → 오른쪽에 기본 정보, 연락처 표시</li>
                <li>고객 행 <strong>더블클릭</strong> → 전체 화면에서 문서, 계약, 가족관계 모두 확인</li>
              </ul>
            </div>
            <div className="help-modal-section">
              <p><strong>📞 고객에게 연락하기</strong></p>
              <ul>
                <li>고객 행에서 <strong>마우스 우클릭</strong></li>
                <li><strong>"전화하기"</strong> → 바로 전화 연결</li>
                <li><strong>"문자 보내기"</strong> → 문자 앱 열기</li>
              </ul>
            </div>
            <div className="help-modal-section">
              <p><strong>😴 휴면 처리하기</strong></p>
              <ul>
                <li>연락이 뜸한 고객 → 우클릭 → <strong>"휴면 처리"</strong></li>
                <li>목록에서 숨겨지고 "휴면" 필터에서만 표시</li>
                <li>나중에 다시 "휴면 해제"로 복원 가능</li>
              </ul>
            </div>
          </div>
        </Modal>
      </div>
    );
  }
);

