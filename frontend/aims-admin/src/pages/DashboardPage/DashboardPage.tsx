import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/features/dashboard/api';
import { StatCard } from '@/shared/ui/StatCard/StatCard';
import { Button } from '@/shared/ui/Button/Button';
import './DashboardPage.css';

const TIER_LABELS: Record<string, string> = {
  free_trial: '무료체험',
  standard: '일반',
  premium: '프리미엄',
  vip: 'VIP',
  admin: '관리자',
};

interface HealthCardProps {
  service: string;
  status: 'healthy' | 'unhealthy';
}

const HealthCard = ({ service, status }: HealthCardProps) => {
  const isHealthy = status === 'healthy';

  return (
    <div className="health-card">
      <div className="health-card__header">
        <span className="health-card__service">{service}</span>
        <span
          className={`health-card__status ${
            isHealthy ? 'health-card__status--healthy' : 'health-card__status--unhealthy'
          }`}
        >
          <span
            className={`health-card__indicator ${
              isHealthy ? 'health-card__indicator--healthy' : 'health-card__indicator--unhealthy'
            }`}
          />
          {isHealthy ? 'Healthy' : 'Unhealthy'}
        </span>
      </div>
    </div>
  );
};

export const DashboardPage = () => {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: dashboardApi.getDashboard,
    refetchInterval: 10000, // 10초마다 갱신
  });

  const { data: storageData, isLoading: storageLoading } = useQuery({
    queryKey: ['admin', 'storage', 'overview'],
    queryFn: dashboardApi.getStorageOverview,
    refetchInterval: 30000, // 30초마다 갱신
  });

  if (isLoading) {
    return <div className="dashboard-page__loading">데이터를 불러오는 중...</div>;
  }

  if (isError) {
    return (
      <div className="dashboard-page__error">
        <p>데이터를 불러오는데 실패했습니다.</p>
        <p>{error instanceof Error ? error.message : '알 수 없는 오류'}</p>
        <Button onClick={() => refetch()}>다시 시도</Button>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <h1 className="dashboard-page__title">대시보드</h1>

      {/* 통계 섹션 */}
      <section className="dashboard-page__section">
        <h2 className="dashboard-page__section-title">시스템 통계</h2>
        <div className="dashboard-page__stats-grid">
          <StatCard title="전체 사용자" value={data?.stats.totalUsers || 0} />
          <StatCard title="활성 사용자" value={data?.stats.activeUsers || 0} subtitle="최근 30일 내 로그인" />
          <StatCard title="고객 수" value={data?.stats.totalCustomers || 0} />
          <StatCard title="문서 수" value={data?.stats.totalDocuments || 0} />
          <StatCard title="계약 수" value={data?.stats.totalContracts || 0} />
        </div>
      </section>

      {/* 문서 처리 현황 */}
      <section className="dashboard-page__section">
        <h2 className="dashboard-page__section-title">문서 처리 현황</h2>
        <div className="dashboard-page__stats-grid">
          <StatCard
            title="OCR 대기"
            value={data?.processing.ocrQueue || 0}
            subtitle="처리 대기중인 문서"
          />
          <StatCard
            title="임베딩 대기"
            value={data?.processing.embedQueue || 0}
            subtitle="벡터화 대기중인 문서"
          />
          <StatCard
            title="처리 실패"
            value={data?.processing.failedDocuments || 0}
            subtitle="재처리 필요"
          />
        </div>
      </section>

      {/* 스토리지 현황 */}
      <section className="dashboard-page__section">
        <h2 className="dashboard-page__section-title">스토리지 현황</h2>
        {storageLoading ? (
          <div className="dashboard-page__loading-inline">스토리지 정보를 불러오는 중...</div>
        ) : storageData ? (
          <div className="dashboard-page__stats-grid">
            <StatCard
              title="전체 사용량"
              value={storageData.formatted.total_used}
              subtitle={`${storageData.total_users}명 사용자`}
            />
            <StatCard
              title="용량 경고"
              value={storageData.users_over_80_percent}
              subtitle="80% 이상 사용"
            />
            <StatCard
              title="용량 위험"
              value={storageData.users_over_95_percent}
              subtitle="95% 이상 사용"
            />
          </div>
        ) : (
          <div className="dashboard-page__error-inline">스토리지 정보를 불러올 수 없습니다</div>
        )}
        {storageData?.tier_distribution && Object.keys(storageData.tier_distribution).length > 0 && (
          <div className="dashboard-page__tier-distribution">
            <h3 className="dashboard-page__subsection-title">티어별 사용자</h3>
            <div className="dashboard-page__tier-badges">
              {Object.entries(storageData.tier_distribution).map(([tier, count]) => (
                <span key={tier} className={`tier-badge tier-badge--${tier}`}>
                  {TIER_LABELS[tier] || tier}: {count}명
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 시스템 상태 */}
      <section className="dashboard-page__section">
        <h2 className="dashboard-page__section-title">시스템 상태</h2>
        <div className="dashboard-page__health-grid">
          <HealthCard service="Node.js API" status={data?.health.nodeApi || 'unhealthy'} />
          <HealthCard service="Python API" status={data?.health.pythonApi || 'unhealthy'} />
          <HealthCard service="MongoDB" status={data?.health.mongodb || 'unhealthy'} />
          <HealthCard service="Qdrant" status={data?.health.qdrant || 'unhealthy'} />
        </div>
      </section>
    </div>
  );
};
