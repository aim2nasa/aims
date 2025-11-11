/**
 * CustomerManagementView Component
 * @since 1.0.0
 *
 * 고객 관리 대시보드
 * 통계, 빠른 액션, 최근 활동을 포함
 */

import React from 'react';
import CenterPaneView from '../../CenterPaneView/CenterPaneView';
import SFSymbol, { SFSymbolSize, SFSymbolWeight } from '../../SFSymbol';
import { StatCard } from '@/shared/ui/StatCard';
import { QuickActionButton } from '@/shared/ui/QuickActionButton';
import { RecentActivityList } from '@/shared/ui/RecentActivityList';
import type { RecentActivityItem } from '@/shared/ui/RecentActivityList';
import './CustomerManagementView.css';

interface CustomerManagementViewProps {
  /** View 표시 여부 */
  visible: boolean;
  /** View 닫기 핸들러 */
  onClose: () => void;
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
}) => {
  // Mock 데이터 (Phase 2에서 실제 API로 교체)
  const mockStats = {
    totalCustomers: 342,
    activeCustomers: 287,
    recentRegistrations: 15,
    relationshipsMapped: 156,
  };

  const mockRecentActivities: RecentActivityItem[] = [
    {
      id: '1',
      title: '김철수',
      subtitle: '고객 등록',
      timestamp: new Date(Date.now() - 1000 * 60 * 10), // 10분 전
      icon: <SFSymbol name="person.badge.plus" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />,
    },
    {
      id: '2',
      title: '이영희',
      subtitle: '관계 매핑',
      timestamp: new Date(Date.now() - 1000 * 60 * 45), // 45분 전
      icon: <SFSymbol name="person.2" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />,
    },
    {
      id: '3',
      title: '박민수',
      subtitle: '고객 정보 수정',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3), // 3시간 전
      icon: <SFSymbol name="pencil" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />,
    },
    {
      id: '4',
      title: '최지우',
      subtitle: '고객 등록',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6), // 6시간 전
      icon: <SFSymbol name="person.badge.plus" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />,
    },
    {
      id: '5',
      title: '정수진',
      subtitle: '관계 매핑',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2일 전
      icon: <SFSymbol name="person.2" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />,
    },
  ];

  // 빠른 액션 핸들러 (Phase 2에서 실제 네비게이션 추가)
  const handleCustomerRegister = () => {
    console.log('[CustomerManagementView] 고객 등록 클릭 (Phase 2에서 구현)');
  };

  const handleCustomerSearch = () => {
    console.log('[CustomerManagementView] 고객 검색 클릭 (Phase 2에서 구현)');
  };

  const handleRelationshipMap = () => {
    console.log('[CustomerManagementView] 관계도 클릭 (Phase 2에서 구현)');
  };

  return (
    <CenterPaneView
      visible={visible}
      title="고객 관리"
      titleIcon={<SFSymbol name="person" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />}
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
            <SFSymbol name="chart.bar" size={SFSymbolSize.BODY} weight={SFSymbolWeight.SEMIBOLD} />
            고객 통계
          </h2>
          <div className="customer-management-view__stats-grid">
            <StatCard
              title="전체 고객"
              value={mockStats.totalCustomers}
              icon={<SFSymbol name="person.3.fill" size={SFSymbolSize.TITLE_2} weight={SFSymbolWeight.MEDIUM} />}
              color="primary"
            />
            <StatCard
              title="활성 고객"
              value={mockStats.activeCustomers}
              icon={<SFSymbol name="person.fill.checkmark" size={SFSymbolSize.TITLE_2} weight={SFSymbolWeight.MEDIUM} />}
              color="success"
              trend={{ value: 5, isPositive: true }}
            />
            <StatCard
              title="최근 등록"
              value={mockStats.recentRegistrations}
              icon={<SFSymbol name="person.badge.plus" size={SFSymbolSize.TITLE_2} weight={SFSymbolWeight.MEDIUM} />}
              color="warning"
              trend={{ value: 3, isPositive: true }}
            />
            <StatCard
              title="관계 매핑"
              value={mockStats.relationshipsMapped}
              icon={<SFSymbol name="person.2.fill" size={SFSymbolSize.TITLE_2} weight={SFSymbolWeight.MEDIUM} />}
              color="success"
              trend={{ value: 8, isPositive: true }}
            />
          </div>
        </section>

        {/* 빠른 액션 섹션 */}
        <section className="customer-management-view__section">
          <h2 className="customer-management-view__section-title">
            <SFSymbol name="bolt.fill" size={SFSymbolSize.BODY} weight={SFSymbolWeight.SEMIBOLD} />
            빠른 액션
          </h2>
          <div className="customer-management-view__actions-grid">
            <QuickActionButton
              icon={<SFSymbol name="person.badge.plus" size={SFSymbolSize.TITLE_1} weight={SFSymbolWeight.MEDIUM} />}
              label="고객 등록"
              onClick={handleCustomerRegister}
              variant="primary"
            />
            <QuickActionButton
              icon={<SFSymbol name="magnifyingglass" size={SFSymbolSize.TITLE_1} weight={SFSymbolWeight.MEDIUM} />}
              label="고객 검색"
              onClick={handleCustomerSearch}
            />
            <QuickActionButton
              icon={<SFSymbol name="person.2" size={SFSymbolSize.TITLE_1} weight={SFSymbolWeight.MEDIUM} />}
              label="관계도"
              onClick={handleRelationshipMap}
            />
          </div>
        </section>

        {/* 최근 활동 섹션 */}
        <section className="customer-management-view__section">
          <h2 className="customer-management-view__section-title">
            <SFSymbol name="clock.fill" size={SFSymbolSize.BODY} weight={SFSymbolWeight.SEMIBOLD} />
            최근 활동
          </h2>
          <div className="customer-management-view__recent-activity">
            <RecentActivityList items={mockRecentActivities} maxItems={5} />
          </div>
        </section>
      </div>
    </CenterPaneView>
  );
};

export default CustomerManagementView
