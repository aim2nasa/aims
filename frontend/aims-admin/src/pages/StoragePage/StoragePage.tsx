import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/features/dashboard/api';
import { StatCard } from '@/shared/ui/StatCard/StatCard';
import { Button } from '@/shared/ui/Button/Button';
import './StoragePage.css';

const TIER_LABELS: Record<string, string> = {
  free_trial: '무료체험',
  standard: '일반',
  premium: '프리미엄',
  vip: 'VIP',
  admin: '관리자',
};

export const StoragePage = () => {
  const { data: storageData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'storage', 'overview'],
    queryFn: dashboardApi.getStorageOverview,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return <div className="storage-page__loading">데이터를 불러오는 중...</div>;
  }

  if (isError) {
    return (
      <div className="storage-page__error">
        <p>데이터를 불러오는데 실패했습니다.</p>
        <p>{error instanceof Error ? error.message : '알 수 없는 오류'}</p>
        <Button onClick={() => refetch()}>다시 시도</Button>
      </div>
    );
  }

  return (
    <div className="storage-page">
      <h1 className="storage-page__title">스토리지 현황</h1>

      <section className="storage-page__section">
        <h2 className="storage-page__section-title">전체 현황</h2>
        <div className="storage-page__stats-grid">
          <StatCard
            title="전체 사용량"
            value={storageData?.formatted.total_used || '0 MB'}
            subtitle={`${storageData?.total_users || 0}명 사용자`}
          />
          <StatCard
            title="용량 경고"
            value={storageData?.users_over_80_percent || 0}
            subtitle="80% 이상 사용"
          />
          <StatCard
            title="용량 위험"
            value={storageData?.users_over_95_percent || 0}
            subtitle="95% 이상 사용"
          />
        </div>
      </section>

      {storageData?.tier_distribution && Object.keys(storageData.tier_distribution).length > 0 && (
        <section className="storage-page__section">
          <h2 className="storage-page__section-title">티어별 사용자 분포</h2>
          <div className="storage-page__tier-distribution">
            {Object.entries(storageData.tier_distribution).map(([tier, count]) => (
              <div key={tier} className={`tier-card tier-card--${tier}`}>
                <span className="tier-card__label">{TIER_LABELS[tier] || tier}</span>
                <span className="tier-card__count">{count}명</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="storage-page__section">
        <h2 className="storage-page__section-title">용량 관리 안내</h2>
        <div className="storage-page__info-cards">
          <div className="info-card info-card--warning">
            <h3 className="info-card__title">80% 이상 사용</h3>
            <p className="info-card__description">
              스토리지 용량의 80% 이상을 사용 중인 사용자입니다.
              티어 업그레이드를 권장합니다.
            </p>
          </div>
          <div className="info-card info-card--danger">
            <h3 className="info-card__title">95% 이상 사용</h3>
            <p className="info-card__description">
              스토리지 용량이 거의 가득 찬 사용자입니다.
              추가 파일 업로드가 제한될 수 있습니다.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
