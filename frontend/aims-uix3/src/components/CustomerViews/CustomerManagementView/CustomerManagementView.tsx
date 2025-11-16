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
import { RecentActivityList } from '@/shared/ui/RecentActivityList';
import type { RecentActivityItem } from '@/shared/ui/RecentActivityList';
import { UsageGuide } from '@/shared/ui/UsageGuide';
import type { GuideSection } from '@/shared/ui/UsageGuide';
import { RefreshButton } from '../../RefreshButton/RefreshButton';
import { getCustomers } from '@/services/customerService';
import { FileTypePieChart } from '@/shared/ui/FileTypePieChart';
import type { FileTypeData } from '@/shared/ui/FileTypePieChart';
import './CustomerManagementView.css';

interface CustomerManagementViewProps {
  /** View 표시 여부 */
  visible: boolean;
  /** View 닫기 핸들러 */
  onClose: () => void;
  /** 메뉴 네비게이션 핸들러 */
  onNavigate?: (menuKey: string) => void;
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
        personalCustomers: 0,
        corporateCustomers: 0,
        maleCustomers: 0,
        femaleCustomers: 0,
        unknownGenderCustomers: 0,
        under30: 0,
        thirties: 0,
        forties: 0,
        fifties: 0,
        over60: 0,
        unknownAge: 0,
      };
    }

    const customers = customersData.customers;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 연령 계산 헬퍼
    const getAge = (birthDate: string | undefined) => {
      if (!birthDate) return null;
      const birth = new Date(birthDate);
      const age = now.getFullYear() - birth.getFullYear();
      const monthDiff = now.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
        return age - 1;
      }
      return age;
    };

    let maleCount = 0;
    let femaleCount = 0;
    let unknownGenderCount = 0;
    let under30Count = 0;
    let thirtiesCount = 0;
    let fortiesCount = 0;
    let fiftiesCount = 0;
    let over60Count = 0;
    let unknownAgeCount = 0;

    customers.forEach(customer => {
      // 성별 통계
      const gender = customer.personal_info?.gender;
      if (gender === 'M') {
        maleCount++;
      } else if (gender === 'F') {
        femaleCount++;
      } else {
        unknownGenderCount++;
      }

      // 연령대 통계
      const birthDate = customer.personal_info?.birth_date;
      const age = birthDate ? getAge(birthDate) : null;
      if (age === null) {
        unknownAgeCount++;
      } else if (age < 30) {
        under30Count++;
      } else if (age >= 30 && age < 40) {
        thirtiesCount++;
      } else if (age >= 40 && age < 50) {
        fortiesCount++;
      } else if (age >= 50 && age < 60) {
        fiftiesCount++;
      } else {
        over60Count++;
      }
    });

    return {
      totalCustomers: customers.length,
      activeCustomers: customers.filter(c => c.meta?.status === 'active').length,
      recentRegistrations: customers.filter(c => {
        const createdAt = c.meta?.created_at ? new Date(c.meta.created_at) : null;
        return createdAt && createdAt >= thirtyDaysAgo;
      }).length,
      relationshipsMapped: 0, // TODO: 관계 API 연동 후 계산
      personalCustomers: customers.filter(c => c.insurance_info?.customer_type !== '법인').length,
      corporateCustomers: customers.filter(c => c.insurance_info?.customer_type === '법인').length,
      maleCustomers: maleCount,
      femaleCustomers: femaleCount,
      unknownGenderCustomers: unknownGenderCount,
      under30: under30Count,
      thirties: thirtiesCount,
      forties: fortiesCount,
      fifties: fiftiesCount,
      over60: over60Count,
      unknownAge: unknownAgeCount,
    };
  }, [customersData]);

  // 파이 차트 데이터 준비
  const customerTypePieData: FileTypeData[] = useMemo(() => {
    return [
      {
        label: '개인',
        count: stats.personalCustomers,
        color: 'var(--color-primary-500)'
      },
      {
        label: '법인',
        count: stats.corporateCustomers,
        color: 'var(--color-warning)'
      }
    ];
  }, [stats]);

  // 성별 파이 차트
  const genderPieData: FileTypeData[] = useMemo(() => {
    const data: FileTypeData[] = [
      {
        label: '남성',
        count: stats.maleCustomers,
        color: 'var(--color-primary-500)'
      },
      {
        label: '여성',
        count: stats.femaleCustomers,
        color: 'var(--color-ios-purple)'
      }
    ];
    // 미상이 있을 경우에만 추가
    if (stats.unknownGenderCustomers > 0) {
      data.push({
        label: '미상',
        count: stats.unknownGenderCustomers,
        color: 'var(--color-text-tertiary)'
      });
    }
    return data;
  }, [stats]);

  // 연령대 파이 차트
  const agePieData: FileTypeData[] = useMemo(() => {
    const data: FileTypeData[] = [];
    if (stats.under30 > 0) {
      data.push({
        label: '20대 이하',
        count: stats.under30,
        color: 'var(--color-ios-blue)'
      });
    }
    if (stats.thirties > 0) {
      data.push({
        label: '30대',
        count: stats.thirties,
        color: 'var(--color-success)'
      });
    }
    if (stats.forties > 0) {
      data.push({
        label: '40대',
        count: stats.forties,
        color: 'var(--color-warning)'
      });
    }
    if (stats.fifties > 0) {
      data.push({
        label: '50대',
        count: stats.fifties,
        color: 'var(--color-ios-orange)'
      });
    }
    if (stats.over60 > 0) {
      data.push({
        label: '60대 이상',
        count: stats.over60,
        color: 'var(--color-ios-purple)'
      });
    }
    if (stats.unknownAge > 0) {
      data.push({
        label: '미상',
        count: stats.unknownAge,
        color: 'var(--color-text-tertiary)'
      });
    }
    return data;
  }, [stats]);

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
                <path d="M15 13v4M13 15h4" stroke="var(--color-text-inverse)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
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

  // 사용 가이드 섹션
  const guideSections: GuideSection[] = [
    {
      icon: (
        <SFSymbol
          name="person-fill-badge-plus"
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.MEDIUM}
          style={{ color: 'var(--color-success)' }}
        />
      ),
      title: '고객 등록',
      description: '새로운 고객 정보를 시스템에 등록하고 관리합니다. 개인 정보, 연락처, 보험 정보 등을 체계적으로 기록할 수 있습니다.',
      ...(onNavigate && { onClick: () => onNavigate('customers-register') }),
    },
    {
      icon: (
        <SFSymbol
          name="list-bullet"
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.MEDIUM}
          style={{ color: 'var(--color-success)' }}
        />
      ),
      title: '전체보기',
      description: '등록된 모든 고객을 검색하고 조회합니다. 이름, 전화번호, 이메일로 빠르게 검색하고 정렬할 수 있습니다.',
      ...(onNavigate && { onClick: () => onNavigate('customers-all') }),
    },
    {
      icon: (
        <SFSymbol
          name="location"
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.MEDIUM}
          style={{ color: 'var(--color-warning)' }}
        />
      ),
      title: '지역별 보기',
      description: '고객을 지역별로 분류하여 확인합니다. 시/도, 시/군/구 단위로 고객 분포를 파악하고 지역별 관리가 가능합니다.',
      ...(onNavigate && { onClick: () => onNavigate('customers-regional') }),
    },
    {
      icon: (
        <SFSymbol
          name="person-2"
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.MEDIUM}
          style={{ color: 'var(--color-ios-purple)' }}
        />
      ),
      title: '관계별 보기',
      description: '고객 간의 관계를 시각화하여 관리합니다. 가족 관계, 지인 관계 등을 연결하여 효율적인 고객 관리가 가능합니다.',
      ...(onNavigate && { onClick: () => onNavigate('customers-relationship') }),
    },
  ];

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
              <rect x="2" y="12" width="4" height="6" rx="1" fill="var(--color-primary-500)"/>
              <rect x="8" y="7" width="4" height="11" rx="1" fill="var(--color-primary-500)"/>
              <rect x="14" y="3" width="4" height="15" rx="1" fill="var(--color-primary-500)"/>
            </svg>
            고객 통계
          </h2>
          <div className="customer-management-view__stats-grid">
            <StatCard
              title="전체 고객"
              value={stats.totalCustomers}
              icon={<SFSymbol name="person.3.fill" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />}
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
                  <path d="M14.5 16l1 1 2.5-2.5" stroke="var(--color-text-inverse)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
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
                  <path d="M15 13v4M13 15h4" stroke="var(--color-text-inverse)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              }
              color="warning"
              isLoading={isCustomersLoading}
              {...(isCustomersError && { error: '통계 조회 실패' })}
            />
            <StatCard
              title="관계 매핑"
              value={stats.relationshipsMapped}
              icon={<SFSymbol name="person.2.fill" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />}
              color="success"
              isLoading={isCustomersLoading}
              {...(isCustomersError && { error: '통계 조회 실패' })}
            />
          </div>

          {/* 파이 차트 그리드 */}
          {stats.totalCustomers > 0 && (
            <div className="customer-management-view__pie-charts-grid">
              <div className="pie-chart-item">
                <h3 className="pie-chart-title">고객 유형</h3>
                <FileTypePieChart
                  data={customerTypePieData}
                  size={180}
                  innerRadius={45}
                />
              </div>
              <div className="pie-chart-item">
                <h3 className="pie-chart-title">성별 분포</h3>
                <FileTypePieChart
                  data={genderPieData}
                  size={180}
                  innerRadius={45}
                />
              </div>
              <div className="pie-chart-item">
                <h3 className="pie-chart-title">연령대 분포</h3>
                <FileTypePieChart
                  data={agePieData}
                  size={180}
                  innerRadius={45}
                />
              </div>
            </div>
          )}
        </section>

        {/* 사용 가이드 */}
        <UsageGuide
          title="고객관리 사용 가이드"
          sections={guideSections}
          defaultExpanded={true}
        />

        {/* 최근 활동 섹션 */}
        <section className="customer-management-view__section">
          <h2 className="customer-management-view__section-title">
            <svg width="14" height="14" viewBox="0 0 20 20">
              <circle cx="10" cy="10" r="9" fill="var(--color-success)"/>
              <path d="M10 5v5l3.5 3.5" stroke="var(--color-text-inverse)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
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
