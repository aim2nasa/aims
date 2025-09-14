/**
 * AIMS UIX-3 Home Page
 * @since 2025-09-15
 * @version 1.0.0
 *
 * AIMS 시스템의 메인 대시보드 페이지
 * 시스템 개요와 주요 기능 접근점 제공
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/shared/ui/Button';
import { LoadingSkeleton, CardSkeleton } from '@/shared/ui/LoadingSkeleton';
import { queryKeys } from '@/app/queryClient';
import { getCustomerStats, type CustomerStats } from '@/entities/customer';
import { checkApiHealth } from '@/shared/lib/api';
import './HomePage.css';

/**
 * 통계 카드 컴포넌트
 */
interface StatCardProps {
  title: string;
  value: number | string;
  description?: string;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'primary' | 'success' | 'warning' | 'error';
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  description,
  trend = 'neutral',
  color = 'primary',
}) => (
  <div className={`stat-card stat-card--${color}`}>
    <div className="stat-card__header">
      <h3 className="stat-card__title">{title}</h3>
      {trend !== 'neutral' && (
        <span className={`stat-card__trend stat-card__trend--${trend}`} aria-label={`${trend === 'up' ? '증가' : '감소'} 추세`}>
          {trend === 'up' ? '↑' : '↓'}
        </span>
      )}
    </div>
    <div className="stat-card__value">{value}</div>
    {description && <div className="stat-card__description">{description}</div>}
  </div>
);

/**
 * 퀵 액션 카드 컴포넌트
 */
interface QuickActionProps {
  title: string;
  description: string;
  href: string;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary';
}

const QuickActionCard: React.FC<QuickActionProps> = ({
  title,
  description,
  href,
  icon,
  variant = 'primary',
}) => (
  <div className="quick-action-card">
    {icon && (
      <div className="quick-action-card__icon" aria-hidden="true">
        {icon}
      </div>
    )}
    <div className="quick-action-card__content">
      <h3 className="quick-action-card__title">{title}</h3>
      <p className="quick-action-card__description">{description}</p>
      <Button
        variant={variant}
        onClick={() => window.location.href = href}
        className="quick-action-card__button"
      >
        바로가기
      </Button>
    </div>
  </div>
);

/**
 * 시스템 상태 표시 컴포넌트
 */
const SystemStatus: React.FC = () => {
  const { data: healthStatus, isLoading } = useQuery({
    queryKey: ['system-health'],
    queryFn: checkApiHealth,
    refetchInterval: 30000, // 30초마다 체크
  });

  if (isLoading) {
    return (
      <div className="system-status">
        <LoadingSkeleton variant="text" width="120px" />
      </div>
    );
  }

  const isHealthy = healthStatus?.status === 'ok';

  return (
    <div className={`system-status system-status--${isHealthy ? 'healthy' : 'unhealthy'}`}>
      <div className="system-status__indicator" aria-hidden="true">
        <div className="system-status__dot" />
      </div>
      <span className="system-status__text">
        시스템 {isHealthy ? '정상' : '장애'}
      </span>
    </div>
  );
};

/**
 * 홈페이지 메인 컴포넌트
 */
const HomePage: React.FC = () => {
  // 고객 통계 데이터 조회
  const {
    data: customerStats,
    isLoading: isStatsLoading,
    error: statsError,
  } = useQuery({
    queryKey: queryKeys.customers(),
    queryFn: getCustomerStats,
    staleTime: 1000 * 60 * 5, // 5분
  });

  // 아이콘 컴포넌트들 (간단한 SVG)
  const UsersIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const DocumentIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="10,9 9,9 8,9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const ChartIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <div className="home-page">
      {/* 헤더 섹션 */}
      <section className="home-header">
        <div className="home-header__content">
          <h1 className="home-header__title">AIMS 관리 시스템</h1>
          <p className="home-header__subtitle">
            Agent Intelligent Management System - 보험 영업 업무를 위한 통합 관리 플랫폼
          </p>
          <SystemStatus />
        </div>
      </section>

      {/* 통계 대시보드 섹션 */}
      <section className="home-stats">
        <h2 className="home-stats__title">시스템 현황</h2>
        <div className="home-stats__grid">
          {isStatsLoading ? (
            // 로딩 상태
            <>
              <CardSkeleton showAvatar={false} titleLines={1} contentLines={1} />
              <CardSkeleton showAvatar={false} titleLines={1} contentLines={1} />
              <CardSkeleton showAvatar={false} titleLines={1} contentLines={1} />
              <CardSkeleton showAvatar={false} titleLines={1} contentLines={1} />
            </>
          ) : statsError ? (
            // 에러 상태
            <div className="home-stats__error">
              <p>통계를 불러올 수 없습니다.</p>
              <Button variant="ghost" onClick={() => window.location.reload()}>
                다시 시도
              </Button>
            </div>
          ) : customerStats ? (
            // 정상 상태
            <>
              <StatCard
                title="전체 고객"
                value={customerStats.total.toLocaleString()}
                description="등록된 총 고객 수"
                color="primary"
              />
              <StatCard
                title="활성 고객"
                value={customerStats.active.toLocaleString()}
                description="현재 활성화된 고객"
                color="success"
              />
              <StatCard
                title="이번 달 신규"
                value={customerStats.newThisMonth.toLocaleString()}
                description="새로 등록된 고객"
                trend="up"
                color="primary"
              />
              <StatCard
                title="사용 중인 태그"
                value={customerStats.totalTags.toLocaleString()}
                description="고객 분류 태그 수"
                color="warning"
              />
            </>
          ) : null}
        </div>
      </section>

      {/* 퀵 액션 섹션 */}
      <section className="home-actions">
        <h2 className="home-actions__title">주요 기능</h2>
        <div className="home-actions__grid">
          <QuickActionCard
            title="고객 관리"
            description="고객 정보 등록, 수정, 조회 및 관계 관리"
            href="/customers"
            icon={<UsersIcon />}
            variant="primary"
          />
          <QuickActionCard
            title="문서 관리"
            description="보험 관련 문서 업로드 및 자동 분류"
            href="/documents"
            icon={<DocumentIcon />}
            variant="secondary"
          />
          <QuickActionCard
            title="데이터 분석"
            description="고객 데이터 분석 및 인사이트 대시보드"
            href="/analytics"
            icon={<ChartIcon />}
            variant="secondary"
          />
        </div>
      </section>

      {/* 최근 활동 섹션 */}
      <section className="home-recent">
        <h2 className="home-recent__title">최근 활동</h2>
        <div className="home-recent__content">
          <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: 'var(--spacing-8)' }}>
            최근 활동 내역이 여기에 표시됩니다. (개발 예정)
          </p>
        </div>
      </section>
    </div>
  );
};

export default HomePage;