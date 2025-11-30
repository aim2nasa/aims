/**
 * ContractManagementView Component
 * @since 1.0.0
 *
 * 계약 관리 대시보드
 * 통계, 빠른 액션, 최근 활동을 포함
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import CenterPaneView from '../CenterPaneView/CenterPaneView';
import SFSymbol, { SFSymbolSize, SFSymbolWeight } from '../SFSymbol';
import { StatCard } from '@/shared/ui/StatCard';
import { UsageGuide } from '@/shared/ui/UsageGuide';
import type { GuideSection } from '@/shared/ui/UsageGuide';
import { ContractService } from '@/services/contractService';
import { FileTypePieChart } from '@/shared/ui/FileTypePieChart';
import type { FileTypeData } from '@/shared/ui/FileTypePieChart';
import { Dropdown } from '@/shared/ui/Dropdown';
import type { Contract } from '@/entities/contract';
import { formatDate } from '@/shared/lib/timeUtils';
import './ContractManagementView.css';

type ActivityPeriod = '1week' | '1month' | '2months' | '3months';

interface ContractManagementViewProps {
  /** View 표시 여부 */
  visible: boolean;
  /** View 닫기 핸들러 */
  onClose: () => void;
  /** 메뉴 네비게이션 핸들러 */
  onNavigate?: (menuKey: string) => void;
}

/**
 * ContractManagementView React 컴포넌트
 *
 * 계약 관리 대시보드 - 통계, 사용 가이드, 최근 활동
 */
export const ContractManagementView: React.FC<ContractManagementViewProps> = ({
  visible,
  onClose,
  onNavigate,
}) => {
  // 최근 활동 기간 선택 상태
  const [activityPeriod, setActivityPeriod] = useState<ActivityPeriod>('1week');

  const queryClient = useQueryClient();

  // contractChanged 이벤트 리스너 (계약 삭제/추가 시 자동 새로고침)
  useEffect(() => {
    const handleContractChange = () => {
      if (import.meta.env.DEV) {
        console.log('[ContractManagementView] contractChanged 이벤트 수신 - 계약 데이터 새로고침')
      }
      queryClient.invalidateQueries({ queryKey: ['contracts-list'] })
    }

    window.addEventListener('contractChanged', handleContractChange)
    return () => {
      window.removeEventListener('contractChanged', handleContractChange)
    }
  }, [queryClient])

  // 계약 목록 조회 (통계 계산용)
  const {
    data: contractsData,
    isLoading: isContractsLoading,
    isError: isContractsError,
  } = useQuery({
    queryKey: ['contracts-list', { limit: 1000 }],
    queryFn: () => ContractService.getContracts({ limit: 1000 }),
  });

  // 계약 통계 계산
  const stats = useMemo(() => {
    if (!contractsData?.data) {
      return {
        totalContracts: 0,
        normalPayments: 0,
        recentRegistrations: 0,
        overduePayments: 0,
        statusCounts: {} as Record<string, number>,
        paymentCycleCounts: {} as Record<string, number>,
      };
    }

    const contracts = contractsData.data;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 납입상태별 통계
    const statusCounts: Record<string, number> = {};
    // 납입주기별 통계
    const paymentCycleCounts: Record<string, number> = {};

    let normalCount = 0;
    let recentCount = 0;
    let overdueCount = 0;

    contracts.forEach((contract: Contract) => {
      // 납입상태별
      const status = contract.payment_status || '미정';
      statusCounts[status] = (statusCounts[status] || 0) + 1;

      // 납입주기별
      const cycle = contract.payment_cycle || '미정';
      paymentCycleCounts[cycle] = (paymentCycleCounts[cycle] || 0) + 1;

      // 정상 납입
      if (status === '정상' || status === '완납') {
        normalCount++;
      }

      // 연체
      if (status === '연체') {
        overdueCount++;
      }

      // 최근 등록
      const createdAt = contract.meta?.created_at ? new Date(contract.meta.created_at) : null;
      if (createdAt && createdAt >= thirtyDaysAgo) {
        recentCount++;
      }
    });

    return {
      totalContracts: contracts.length,
      normalPayments: normalCount,
      recentRegistrations: recentCount,
      overduePayments: overdueCount,
      statusCounts,
      paymentCycleCounts,
    };
  }, [contractsData]);

  // 납입상태별 파이 차트 데이터
  const statusPieData: FileTypeData[] = useMemo(() => {
    const statusColors: Record<string, string> = {
      '정상': 'var(--color-success)',
      '완납': 'var(--color-ios-blue)',
      '연체': 'var(--color-error)',
      '미정': 'var(--color-text-tertiary)',
    };

    return Object.entries(stats.statusCounts)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => ({
        label: status,
        count,
        color: statusColors[status] || 'var(--color-text-tertiary)',
      }));
  }, [stats.statusCounts]);

  // 납입주기별 파이 차트 데이터
  const cyclePieData: FileTypeData[] = useMemo(() => {
    const cycleColors: Record<string, string> = {
      '월납': 'var(--color-ios-blue)',
      '연납': 'var(--color-ios-purple)',
      '일시납': 'var(--color-ios-green)',
      '미정': 'var(--color-text-tertiary)',
    };

    return Object.entries(stats.paymentCycleCounts)
      .filter(([, count]) => count > 0)
      .map(([cycle, count]) => ({
        label: cycle,
        count,
        color: cycleColors[cycle] || 'var(--color-ios-cyan)',
      }));
  }, [stats.paymentCycleCounts]);

  // 최근 활동 데이터 - 기간별 필터링 및 정렬
  const recentContracts = useMemo(() => {
    if (!contractsData?.data) return [];

    const now = new Date();
    let cutoffDate: Date;

    switch (activityPeriod) {
      case '1week':
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '1month':
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '2months':
        cutoffDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        break;
      case '3months':
        cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
    }

    const sorted = [...contractsData.data]
      .map((contract: Contract) => {
        const created = contract.meta?.created_at ? new Date(contract.meta.created_at).getTime() : 0;
        const updated = contract.meta?.updated_at ? new Date(contract.meta.updated_at).getTime() : 0;
        const latest = Math.max(created, updated);
        return { contract, latest };
      })
      .filter(({ latest }) => latest >= cutoffDate.getTime())
      .sort((a, b) => b.latest - a.latest)
      .slice(0, 50) // 최대 50개
      .map(({ contract }) => contract);

    return sorted;
  }, [contractsData, activityPeriod]);

  // 사용 가이드 섹션
  const guideSections: GuideSection[] = [
    {
      icon: (
        <SFSymbol
          name="tablecells"
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.MEDIUM}
          style={{ color: 'var(--color-ios-purple)' }}
        />
      ),
      title: '전체 계약 보기',
      description: '등록된 모든 계약을 조회합니다. 고객명, 보험사, 상품명으로 검색하고 정렬할 수 있습니다.',
      ...(onNavigate && { onClick: () => onNavigate('contracts-all') }),
    },
    {
      icon: (
        <SFSymbol
          name="arrow-right-square"
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.MEDIUM}
          style={{ color: 'var(--color-ios-green)' }}
        />
      ),
      title: '계약 가져오기',
      description: '엑셀 파일에서 계약 데이터를 일괄 가져옵니다. 보험사 양식에 맞는 파일을 업로드하세요.',
      ...(onNavigate && { onClick: () => onNavigate('contracts-import') }),
    },
  ];

  return (
    <CenterPaneView
      visible={visible}
      title="계약 관리"
      titleIcon={
        <span className="menu-icon-blue">
          <SFSymbol
            name="briefcase-fill"
            size={SFSymbolSize.CALLOUT}
            weight={SFSymbolWeight.MEDIUM}
          />
        </span>
      }
      onClose={onClose}
      marginTop={5}
      marginBottom={5}
      marginLeft={5}
      marginRight={5}
      className="contract-management-view"
    >
      <div className="contract-management-view__content">
        {/* 통계 섹션 */}
        <section className="contract-management-view__section">
          <h2 className="contract-management-view__section-title">
            <svg width="14" height="14" viewBox="0 0 20 20">
              <rect x="2" y="12" width="4" height="6" rx="1" fill="var(--color-primary-500)"/>
              <rect x="8" y="7" width="4" height="11" rx="1" fill="var(--color-primary-500)"/>
              <rect x="14" y="3" width="4" height="15" rx="1" fill="var(--color-primary-500)"/>
            </svg>
            계약 통계
          </h2>
          <div className="contract-management-view__stats-grid">
            <StatCard
              title="전체 계약"
              value={stats.totalContracts}
              icon={<SFSymbol name="briefcase-fill" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />}
              color="primary"
              isLoading={isContractsLoading}
              {...(isContractsError && { error: '통계 조회 실패' })}
            />
            <StatCard
              title="정상 납입"
              value={stats.normalPayments}
              icon={
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M4 4h8l4 4v10H4V4z"/>
                  <circle cx="14" cy="14" r="5" fill="var(--color-success)"/>
                  <path d="M12 14l1.5 1.5 3-3" stroke="var(--color-text-inverse)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              }
              color="success"
              isLoading={isContractsLoading}
              {...(isContractsError && { error: '통계 조회 실패' })}
            />
            <StatCard
              title="최근 등록"
              value={stats.recentRegistrations}
              icon={
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M4 4h8l4 4v10H4V4z"/>
                  <circle cx="14" cy="14" r="5" fill="var(--color-warning)"/>
                  <path d="M14 12v4M12 14h4" stroke="var(--color-text-inverse)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              }
              color="warning"
              isLoading={isContractsLoading}
              {...(isContractsError && { error: '통계 조회 실패' })}
            />
            <StatCard
              title="연체"
              value={stats.overduePayments}
              icon={
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M4 4h8l4 4v10H4V4z"/>
                  <circle cx="14" cy="14" r="5" fill="var(--color-error)"/>
                  <path d="M14 11v3M14 16v.5" stroke="var(--color-text-inverse)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              }
              color="error"
              isLoading={isContractsLoading}
              {...(isContractsError && { error: '통계 조회 실패' })}
            />
          </div>

          {/* 파이 차트 그리드 */}
          {stats.totalContracts > 0 && (
            <div className="contract-management-view__pie-charts-grid">
              <div className="pie-chart-item">
                <h3 className="pie-chart-title">납입 상태</h3>
                <FileTypePieChart
                  data={statusPieData}
                  size={150}
                  innerRadius={38}
                />
              </div>
              {cyclePieData.length > 0 && (
                <div className="pie-chart-item">
                  <h3 className="pie-chart-title">납입 주기</h3>
                  <FileTypePieChart
                    data={cyclePieData}
                    size={150}
                    innerRadius={38}
                  />
                </div>
              )}
            </div>
          )}
        </section>

        {/* 사용 가이드 */}
        <UsageGuide
          title="계약관리 사용 가이드"
          sections={guideSections}
          defaultExpanded={true}
        />

        {/* 최근 활동 섹션 */}
        <section className="contract-management-view__section">
          <div className="contract-management-view__section-header">
            <h2 className="contract-management-view__section-title">
              <svg width="14" height="14" viewBox="0 0 20 20">
                <circle cx="10" cy="10" r="9" fill="var(--color-success)"/>
                <path d="M10 5v5l3.5 3.5" stroke="var(--color-text-inverse)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              </svg>
              최근 활동 ({recentContracts.length}건)
            </h2>
            <Dropdown
              value={activityPeriod}
              options={[
                { value: '1week', label: '최근 1주일' },
                { value: '1month', label: '최근 1개월' },
                { value: '2months', label: '최근 2개월' },
                { value: '3months', label: '최근 3개월' },
              ]}
              onChange={(value) => setActivityPeriod(value as ActivityPeriod)}
              aria-label="활동 기간 선택"
            />
          </div>
          <div className="contract-management-view__recent-activity">
            {isContractsLoading && (
              <div className="recent-activity-loading">
                <div className="loading-spinner" />
                <p>계약 목록을 불러오는 중...</p>
              </div>
            )}

            {isContractsError && (
              <div className="recent-activity-error">최근 활동 조회 실패</div>
            )}

            {!isContractsLoading && !isContractsError && recentContracts.length === 0 && (
              <div className="recent-activity-empty">최근 활동이 없습니다</div>
            )}

            {!isContractsLoading && !isContractsError && recentContracts.length > 0 && (
              <div className="recent-activity-table">
                {/* 헤더 */}
                <div className="contract-recent-activity-header">
                  <div className="recent-header-activity">활동</div>
                  <div className="recent-header-customer">고객명</div>
                  <div className="recent-header-product">상품명</div>
                  <div className="recent-header-premium">보험료</div>
                  <div className="recent-header-status">납입상태</div>
                  <div className="recent-header-time">시간</div>
                </div>

                {/* 데이터 행 */}
                {recentContracts.map((contract: Contract) => {
                  const createdAt = contract.meta?.created_at ? new Date(contract.meta.created_at) : null;
                  const updatedAt = contract.meta?.updated_at ? new Date(contract.meta.updated_at) : null;

                  const isModified = updatedAt && createdAt && updatedAt.getTime() - createdAt.getTime() > 60000;
                  const displayTime = isModified ? updatedAt : createdAt;

                  const activityIcon = isModified ? (
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" className="activity-icon-edit">
                      <path d="M16.5 2.5l1 1-11 11-2.5.5.5-2.5 11-11zm-1-1l1-1 2 2-1 1-2-2z" />
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" className="activity-icon-new">
                      <path d="M4 4h8l4 4v10H4V4z"/>
                      <circle cx="14" cy="14" r="4" fill="var(--color-success)"/>
                      <path d="M14 12v4M12 14h4" stroke="var(--color-text-inverse)" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  );

                  const activityText = isModified ? '정보 수정' : '계약 등록';

                  const formatRelativeTime = (date: Date | null) => {
                    if (!date) return '-';
                    const now = new Date();
                    const diff = now.getTime() - date.getTime();
                    const minutes = Math.floor(diff / 60000);
                    const hours = Math.floor(diff / 3600000);
                    const days = Math.floor(diff / 86400000);

                    if (minutes < 1) return '방금 전';
                    if (minutes < 60) return `${minutes}분 전`;
                    if (hours < 24) return `${hours}시간 전`;
                    if (days < 30) return `${days}일 전`;

                    return formatDate(date);
                  };

                  const statusClass = (() => {
                    const status = contract.payment_status;
                    if (status === '정상' || status === '완납') return 'status-active';
                    if (status === '연체') return 'status-overdue';
                    return 'status-unknown';
                  })();

                  return (
                    <div key={contract._id} className="contract-recent-activity-row">
                      <div className="recent-cell-activity">
                        {activityIcon}
                        <span className="activity-text">{activityText}</span>
                      </div>
                      <div className="recent-cell-customer">{contract.customer_name || '-'}</div>
                      <div className="recent-cell-product">{contract.product_name || '-'}</div>
                      <div className="recent-cell-premium">{contract.premium?.toLocaleString() || '0'}원</div>
                      <div className={`recent-cell-status ${statusClass}`}>
                        {contract.payment_status || '-'}
                      </div>
                      <div className="recent-cell-time">{formatRelativeTime(displayTime)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </CenterPaneView>
  );
};

export default ContractManagementView;
