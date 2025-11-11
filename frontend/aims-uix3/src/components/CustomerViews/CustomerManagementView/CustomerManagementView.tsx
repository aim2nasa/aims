/**
 * CustomerManagementView Component
 * @since 1.0.0
 *
 * 고객 관리 대시보드
 * 통계, 빠른 액션, 최근 활동을 포함
 */

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import CenterPaneView from '../../CenterPaneView/CenterPaneView';
import SFSymbol, { SFSymbolSize, SFSymbolWeight } from '../../SFSymbol';
import { StatCard } from '@/shared/ui/StatCard';
import { QuickActionButton } from '@/shared/ui/QuickActionButton';
import { RecentActivityList } from '@/shared/ui/RecentActivityList';
import type { RecentActivityItem } from '@/shared/ui/RecentActivityList';
import { RefreshButton } from '../../RefreshButton/RefreshButton';
import { getCustomers } from '@/services/customerService';
import './CustomerManagementView.css';

interface CustomerManagementViewProps {
  /** View 표시 여부 */
  visible: boolean;
  /** View 닫기 핸들러 */
  onClose: () => void;
  /** View 변경 핸들러 */
  onNavigate: (view: string) => void;
}

/**
 * CustomerManagementView React 컴포넌트
 *
 * 고객 관리 대시보드 - Mock 데이터 사용 (Phase 1)
 * Phase 2에서 실제 API 연동 예정
 *
 * @example
 * ```tsx
 * <CustomerManagementView
 *   visible={isVisible}
 *   onClose={handleClose}
 * />
 * ```
 */
export const CustomerManagementView: React.FC<CustomerManagementViewProps> = ({
  visible,
  onClose,
  onNavigate,
}) => {
  // 고객 목록 조회 (통계 계산용)
  const {
    data: customersData,
    isLoading: isCustomersLoading,
    isError: isCustomersError,
    refetch: refetchCustomers
  } = useQuery({
    queryKey: ['allCustomers'],
    queryFn: () =>
      getCustomers({
        limit: 1000, // 통계 계산을 위해 많은 수 가져오기
      }),
  });

  // 고객 통계 계산
  const stats = useMemo(() => {
    if (!customersData?.customers) {
      return {
        totalCustomers: 0,
        activeCustomers: 0,
        recentRegistrations: 0,
        relationshipsMapped: 0,
      };
    }

    const customers = customersData.customers;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return {
      totalCustomers: customers.length,
      activeCustomers: customers.filter(c => c.meta?.status === 'active').length,
      recentRegistrations: customers.filter(c => {
        const createdAt = c.meta?.created_at ? new Date(c.meta.created_at) : null;
        return createdAt && createdAt >= thirtyDaysAgo;
      }).length,
      relationshipsMapped: 0, // TODO: 관계 API 연동 후 계산
    };
  }, [customersData]);

  // 최근 활동 데이터 변환
  const recentActivities: RecentActivityItem[] = useMemo(() => {
    if (!customersData?.customers) return [];

    // 최근 생성/수정된 고객 5명 선택
    return customersData.customers.slice(0, 5).map((customer) => {
      // 고객 타입 결정
      const customerType = customer.insurance_info?.customer_type || '개인';
      const customerTypeIcon = customerType === '법인' ? (
        <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" className="customer-type-icon" style={{ color: 'var(--color-icon-orange)' }}>
          <circle cx="10" cy="10" r="10" opacity="0.2" />
          <path d="M6 5h2v2H6V5zm0 3h2v2H6V8zm0 3h2v2H6v-2zm3-6h2v2H9V5zm0 3h2v2H9V8zm0 3h2v2H9v-2zm3-6h2v2h-2V5zm0 3h2v2h-2V8zm0 3h2v2h-2v-2zM5 14h10v2H5v-2z" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" className="customer-type-icon" style={{ color: 'var(--color-icon-blue)' }}>
          <circle cx="10" cy="10" r="10" opacity="0.2" />
          <circle cx="10" cy="7" r="3" />
          <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
        </svg>
      );

      // 고객 활동 종류 결정 (생성 vs 수정)
      const getActivityInfo = () => {
        const createdAt = customer.meta?.created_at ? new Date(customer.meta.created_at) : null;
        const updatedAt = customer.meta?.updated_at ? new Date(customer.meta.updated_at) : null;

        // 수정 시간이 생성 시간보다 최소 1분 이상 차이나면 "수정"으로 간주
        if (createdAt && updatedAt && updatedAt.getTime() - createdAt.getTime() > 60000) {
          return {
            subtitle: '고객 정보 수정',
            icon: (
              <svg width="16" height="16" viewBox="0 0 20 20" style={{ color: 'var(--color-text-secondary)' }}>
                <path d="M16.5 2.5l1 1-11 11-2.5.5.5-2.5 11-11zm-1-1l1-1 2 2-1 1-2-2z" fill="currentColor"/>
              </svg>
            ),
            timestamp: updatedAt,
          };
        } else {
          return {
            subtitle: '고객 등록',
            icon: (
              <svg width="16" height="16" viewBox="0 0 20 20" style={{ color: 'var(--color-text-secondary)' }}>
                <circle cx="8" cy="6" r="3" fill="currentColor"/>
                <path d="M8 10c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" fill="currentColor"/>
                <circle cx="15" cy="15" r="4" fill="var(--color-success)"/>
                <path d="M15 13v4M13 15h4" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              </svg>
            ),
            timestamp: createdAt || new Date(),
          };
        }
      };

      const activityInfo = getActivityInfo();

      return {
        id: customer._id || String(Math.random()),
        title: (
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            {customerTypeIcon}
            {customer.personal_info?.name || '이름 없음'}
          </span>
        ),
        subtitle: activityInfo.subtitle,
        timestamp: activityInfo.timestamp,
        icon: activityInfo.icon,
      };
    });
  }, [customersData]);

  // 새로고침 핸들러
  const handleRefresh = async () => {
    await refetchCustomers();
  };

  // 빠른 액션 핸들러 - LeftPane 메뉴 클릭과 동일하게 onNavigate만 호출
  const handleCustomerRegister = () => {
    onNavigate('customers-register');
  };

  const handleCustomerSearch = () => {
    onNavigate('customers-all');
  };

  const handleRelationshipMap = () => {
    onNavigate('customers-relationship');
  };

  const handleRegionalView = () => {
    onNavigate('customers-regional');
  };

  return (
    <CenterPaneView
      visible={visible}
      title="고객 관리"
      titleIcon={<SFSymbol name="person" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />}
      titleAccessory={
        <RefreshButton
          onClick={handleRefresh}
          size="small"
          tooltip="고객 통계 새로고침"
        />
      }
      onClose={onClose}
      marginTop={5}
      marginBottom={5}
      marginLeft={5}
      marginRight={5}
      className="customer-management-view"
    >
      <div className="customer-management-view__content">
        {/* 통계 섹션 */}
        <section className="customer-management-view__section">
          <h2 className="customer-management-view__section-title">
            <svg width="14" height="14" viewBox="0 0 20 20">
              <rect x="2" y="12" width="4" height="6" rx="1" fill="#3b82f6"/>
              <rect x="8" y="7" width="4" height="11" rx="1" fill="#3b82f6"/>
              <rect x="14" y="3" width="4" height="15" rx="1" fill="#3b82f6"/>
            </svg>
            고객 통계
          </h2>
          <div className="customer-management-view__stats-grid">
            <StatCard
              title="전체 고객"
              value={stats.totalCustomers}
              icon={<SFSymbol name="person.3.fill" size={SFSymbolSize.TITLE_2} weight={SFSymbolWeight.MEDIUM} />}
              color="primary"
              isLoading={isCustomersLoading}
              {...(isCustomersError && { error: '통계 조회 실패' })}
            />
            <StatCard
              title="활성 고객"
              value={stats.activeCustomers}
              icon={
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <circle cx="8" cy="6" r="3"/>
                  <path d="M8 10c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z"/>
                  <circle cx="16" cy="16" r="3.5" fill="var(--color-success)"/>
                  <path d="M14.5 16l1 1 2.5-2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              }
              color="success"
              isLoading={isCustomersLoading}
              {...(isCustomersError && { error: '통계 조회 실패' })}
            />
            <StatCard
              title="최근 등록"
              value={stats.recentRegistrations}
              icon={
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <circle cx="8" cy="6" r="3"/>
                  <path d="M8 10c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z"/>
                  <circle cx="15" cy="15" r="4" fill="var(--color-warning)"/>
                  <path d="M15 13v4M13 15h4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              }
              color="warning"
              isLoading={isCustomersLoading}
              {...(isCustomersError && { error: '통계 조회 실패' })}
            />
            <StatCard
              title="관계 매핑"
              value={stats.relationshipsMapped}
              icon={<SFSymbol name="person.2.fill" size={SFSymbolSize.TITLE_2} weight={SFSymbolWeight.MEDIUM} />}
              color="success"
              isLoading={isCustomersLoading}
              {...(isCustomersError && { error: '통계 조회 실패' })}
            />
          </div>
        </section>

        {/* 빠른 액션 섹션 */}
        <section className="customer-management-view__section">
          <h2 className="customer-management-view__section-title">
            <svg width="14" height="14" viewBox="0 0 20 20">
              <path d="M10 2l2 5h5l-4 3.5 1.5 5.5L10 13l-4.5 3 1.5-5.5L3 7h5l2-5z" fill="var(--color-warning)"/>
            </svg>
            빠른 액션
          </h2>
          <div className="customer-management-view__actions-grid">
            <QuickActionButton
              icon={
                <span className="quick-action-icon-green">
                  <SFSymbol
                    name="person-fill-badge-plus"
                    size={SFSymbolSize.CALLOUT}
                    weight={SFSymbolWeight.MEDIUM}
                  />
                </span>
              }
              label="고객 등록"
              onClick={handleCustomerRegister}
            />
            <QuickActionButton
              icon={
                <span className="quick-action-icon-green">
                  <SFSymbol
                    name="list-bullet"
                    size={SFSymbolSize.CALLOUT}
                    weight={SFSymbolWeight.MEDIUM}
                  />
                </span>
              }
              label="전체보기"
              onClick={handleCustomerSearch}
            />
            <QuickActionButton
              icon={
                <span className="quick-action-icon-orange">
                  <SFSymbol
                    name="location"
                    size={SFSymbolSize.CALLOUT}
                    weight={SFSymbolWeight.MEDIUM}
                  />
                </span>
              }
              label="지역별 보기"
              onClick={handleRegionalView}
            />
            <QuickActionButton
              icon={
                <span className="quick-action-icon-purple">
                  <SFSymbol
                    name="person-2"
                    size={SFSymbolSize.CALLOUT}
                    weight={SFSymbolWeight.MEDIUM}
                  />
                </span>
              }
              label="관계별 보기"
              onClick={handleRelationshipMap}
            />
          </div>
        </section>

        {/* 최근 활동 섹션 */}
        <section className="customer-management-view__section">
          <h2 className="customer-management-view__section-title">
            <svg width="14" height="14" viewBox="0 0 20 20">
              <circle cx="10" cy="10" r="9" fill="var(--color-success)"/>
              <path d="M10 5v5l3.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            </svg>
            최근 활동
          </h2>
          <div className="customer-management-view__recent-activity">
            <RecentActivityList
              items={recentActivities}
              maxItems={5}
              isLoading={isCustomersLoading}
              {...(isCustomersError && { error: '최근 활동 조회 실패' })}
            />
          </div>
        </section>
      </div>
    </CenterPaneView>
  );
};

export default CustomerManagementView
