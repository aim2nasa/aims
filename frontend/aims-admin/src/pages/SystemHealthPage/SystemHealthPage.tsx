import { useQuery } from '@tanstack/react-query';
import { dashboardApi, type ServiceHealth } from '@/features/dashboard/api';
import { Button } from '@/shared/ui/Button/Button';
import './SystemHealthPage.css';

interface HealthCardProps {
  service: string;
  health: ServiceHealth;
  description?: string;
}

const formatLatency = (latency: number | null): string => {
  if (latency === null) return '-';
  if (latency < 1) return '<1ms';
  return `${latency}ms`;
};

const formatUptime = (seconds: number | null | undefined): string => {
  if (!seconds) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간 ${mins}분`;
  return `${mins}분`;
};

const formatCheckedAt = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

const getLatencyClass = (latency: number | null): string => {
  if (latency === null) return '';
  if (latency < 50) return 'health-card__latency--fast';
  if (latency < 200) return 'health-card__latency--normal';
  return 'health-card__latency--slow';
};

const HealthCard = ({ service, health, description }: HealthCardProps) => {
  const isHealthy = health.status === 'healthy';

  return (
    <div className={`health-card ${isHealthy ? '' : 'health-card--unhealthy'}`}>
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

      {description && <p className="health-card__description">{description}</p>}

      <div className="health-card__details">
        <div className="health-card__detail-row">
          <span className="health-card__detail-label">응답 시간</span>
          <span className={`health-card__latency ${getLatencyClass(health.latency)}`}>
            {formatLatency(health.latency)}
          </span>
        </div>

        {health.version && (
          <div className="health-card__detail-row">
            <span className="health-card__detail-label">버전</span>
            <span className="health-card__detail-value">{health.version}</span>
          </div>
        )}

        {health.uptime !== undefined && health.uptime !== null && (
          <div className="health-card__detail-row">
            <span className="health-card__detail-label">업타임</span>
            <span className="health-card__detail-value">{formatUptime(health.uptime)}</span>
          </div>
        )}

        {health.collections !== undefined && health.collections !== null && (
          <div className="health-card__detail-row">
            <span className="health-card__detail-label">컬렉션</span>
            <span className="health-card__detail-value">{health.collections}개</span>
          </div>
        )}

        <div className="health-card__detail-row health-card__detail-row--muted">
          <span className="health-card__detail-label">마지막 체크</span>
          <span className="health-card__detail-value">{formatCheckedAt(health.checkedAt)}</span>
        </div>
      </div>

      {health.error && (
        <div className="health-card__error">
          <span className="health-card__error-icon">!</span>
          <span className="health-card__error-text">{health.error}</span>
        </div>
      )}
    </div>
  );
};

export const SystemHealthPage = () => {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: dashboardApi.getDashboard,
    refetchInterval: 10000,
  });

  if (isLoading) {
    return <div className="system-health-page__loading">데이터를 불러오는 중...</div>;
  }

  if (isError) {
    return (
      <div className="system-health-page__error">
        <p>데이터를 불러오는데 실패했습니다.</p>
        <p>{error instanceof Error ? error.message : '알 수 없는 오류'}</p>
        <Button onClick={() => refetch()}>다시 시도</Button>
      </div>
    );
  }

  const health = data?.health;

  // 하위 호환성: 이전 API 형식 지원 (string → object)
  const normalizeHealth = (h: ServiceHealth | string | undefined): ServiceHealth => {
    if (!h) {
      return { status: 'unhealthy', latency: null, checkedAt: new Date().toISOString() };
    }
    if (typeof h === 'string') {
      return { status: h as 'healthy' | 'unhealthy', latency: null, checkedAt: new Date().toISOString() };
    }
    return h;
  };

  const services = [
    {
      service: 'Node.js API',
      health: normalizeHealth(health?.nodeApi),
      description: 'AIMS 메인 백엔드 API 서버',
    },
    {
      service: 'Python API',
      health: normalizeHealth(health?.pythonApi),
      description: 'RAG 검색 및 문서 처리 API 서버',
    },
    {
      service: 'MongoDB',
      health: normalizeHealth(health?.mongodb),
      description: '데이터베이스 서버',
    },
    {
      service: 'Qdrant',
      health: normalizeHealth(health?.qdrant),
      description: '벡터 데이터베이스 (AI 검색용)',
    },
  ];

  const healthyCount = services.filter((s) => s.health.status === 'healthy').length;
  const allHealthy = healthyCount === services.length;

  return (
    <div className="system-health-page">
      <div className="system-health-page__header">
        <h1 className="system-health-page__title">시스템 상태</h1>
        <div className="system-health-page__actions">
          <span className="system-health-page__refresh-info">
            10초마다 자동 갱신
          </span>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            지금 새로고침
          </Button>
        </div>
      </div>

      <section className="system-health-page__section">
        <div className={`system-health-page__summary ${allHealthy ? 'system-health-page__summary--healthy' : 'system-health-page__summary--warning'}`}>
          <span className="system-health-page__summary-icon">
            {allHealthy ? '✓' : '!'}
          </span>
          <div className="system-health-page__summary-text">
            <span className="system-health-page__summary-title">
              {allHealthy ? '모든 시스템 정상' : '일부 서비스 이상'}
            </span>
            <span className="system-health-page__summary-subtitle">
              {healthyCount}/{services.length} 서비스 정상 작동 중
            </span>
          </div>
        </div>
      </section>

      <section className="system-health-page__section">
        <h2 className="system-health-page__section-title">서비스 상태</h2>
        <div className="system-health-page__health-grid">
          {services.map((service) => (
            <HealthCard
              key={service.service}
              service={service.service}
              health={service.health}
              description={service.description}
            />
          ))}
        </div>
      </section>

      <section className="system-health-page__section">
        <h2 className="system-health-page__section-title">서비스 설명</h2>
        <div className="system-health-page__info-cards">
          <div className="info-card">
            <h3 className="info-card__title">Node.js API</h3>
            <p className="info-card__description">
              사용자 인증, 고객 관리, 문서 메타데이터 등 핵심 비즈니스 로직을 처리합니다.
            </p>
          </div>
          <div className="info-card">
            <h3 className="info-card__title">Python API</h3>
            <p className="info-card__description">
              OCR, 텍스트 추출, AI 기반 검색 등 문서 처리 기능을 담당합니다.
            </p>
          </div>
          <div className="info-card">
            <h3 className="info-card__title">MongoDB</h3>
            <p className="info-card__description">
              모든 데이터(사용자, 고객, 문서, 계약 등)를 저장하는 데이터베이스입니다.
            </p>
          </div>
          <div className="info-card">
            <h3 className="info-card__title">Qdrant</h3>
            <p className="info-card__description">
              문서 벡터를 저장하여 의미 기반 검색을 가능하게 하는 벡터 DB입니다.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
