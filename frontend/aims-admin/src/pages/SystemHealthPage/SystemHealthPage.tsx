import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardApi, type ServiceHealth, type WorkflowStatus, type HealthHistoryLog } from '@/features/dashboard/api';
import { Button } from '@/shared/ui/Button/Button';
import { ResourceGauge, MetricsLineChart } from '@/shared/ui/Charts';
import './SystemHealthPage.css';

interface HealthCardProps {
  service: string;
  health: ServiceHealth;
  description?: string;
  port?: number;
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

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const HealthCard = ({ service, health, description, port }: HealthCardProps) => {
  const isHealthy = health.status === 'healthy';

  return (
    <div className={`health-card ${isHealthy ? '' : 'health-card--unhealthy'}`}>
      <div className="health-card__header">
        <span className="health-card__service">
          {service}
          {port && <span className="health-card__port">:{port}</span>}
        </span>
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

interface WorkflowCardProps {
  workflow: WorkflowStatus;
}

const formatWorkflowDate = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const WorkflowCard = ({ workflow }: WorkflowCardProps) => {
  return (
    <div className={`workflow-card ${workflow.active ? '' : 'workflow-card--inactive'}`}>
      <div className="workflow-card__header">
        <span className="workflow-card__name">{workflow.name}</span>
        <span className={`workflow-card__status ${workflow.active ? 'workflow-card__status--active' : 'workflow-card__status--inactive'}`}>
          <span className={`workflow-card__indicator ${workflow.active ? 'workflow-card__indicator--active' : 'workflow-card__indicator--inactive'}`} />
          {workflow.active ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div className="workflow-card__footer">
        <span className="workflow-card__updated">
          수정: {formatWorkflowDate(workflow.updatedAt)}
        </span>
      </div>
    </div>
  );
};

// localStorage 키
const TIME_RANGE_STORAGE_KEY = 'aims-admin-metrics-time-range';

// 서버 리소스 섹션 컴포넌트
const ServerResourcesSection = () => {
  const [timeRange, setTimeRange] = useState<number>(() => {
    const stored = localStorage.getItem(TIME_RANGE_STORAGE_KEY);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if ([1, 6, 24, 72, 168].includes(parsed)) {
        return parsed;
      }
    }
    return 24; // 기본값: 1d
  });

  // timeRange 변경 시 localStorage에 저장
  const handleTimeRangeChange = (hours: number) => {
    setTimeRange(hours);
    localStorage.setItem(TIME_RANGE_STORAGE_KEY, String(hours));
  };

  // 현재 메트릭
  const { data: currentMetrics, isLoading: isCurrentLoading } = useQuery({
    queryKey: ['admin', 'metrics', 'current'],
    queryFn: dashboardApi.getMetricsCurrent,
    refetchInterval: 10000,
  });

  // 히스토리 메트릭
  const { data: historyData, isLoading: isHistoryLoading } = useQuery({
    queryKey: ['admin', 'metrics', 'history', timeRange],
    queryFn: () => dashboardApi.getMetricsHistory(timeRange),
    refetchInterval: 60000, // 1분마다 갱신
    gcTime: 5 * 60 * 1000, // 5분 후 캐시 정리 (메모리 절약)
    staleTime: 30000, // 30초간 fresh 상태 유지
  });

  // 라인 차트용 데이터 변환
  // 백엔드에서 이미 샘플링된 데이터가 반환됨 (시간 범위에 따라 자동 샘플링)
  // - 1~6시간: 전체 데이터, 24시간: 5분 간격, 72시간: 15분 간격, 168시간: 30분 간격
  const rawMetrics = historyData?.metrics || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartData = rawMetrics.map((m: any) => ({
    timestamp: m.timestamp,
    // 새 형식 (aggregation): 플랫 값 / 구 형식: 중첩 객체
    cpu: typeof m.cpu === 'number' ? m.cpu : m.cpu?.usage ?? 0,
    memory: typeof m.memory === 'number' ? m.memory : m.memory?.usagePercent ?? 0,
    disk: m.diskRoot ?? (typeof m.disk === 'number' ? m.disk : m.disk?.usagePercent ?? 0),
    diskRoot: m.diskRoot ?? m.disks?.root?.usagePercent ?? (typeof m.disk === 'number' ? m.disk : m.disk?.usagePercent ?? 0),
    diskData: m.diskData ?? m.disks?.data?.usagePercent ?? null,
  }));

  return (
    <section className="server-resources">
      <div className="server-resources__header">
        <h2 className="server-resources__title">서버 리소스</h2>
        <span className="server-resources__subtitle">
          {currentMetrics?.hostname || 'tars.giize.com'}
        </span>
        <div className="server-resources__time-range">
          {[1, 6, 24, 72, 168].map((hours) => (
            <button
              key={hours}
              type="button"
              className={`server-resources__time-btn ${timeRange === hours ? 'server-resources__time-btn--active' : ''}`}
              onClick={() => handleTimeRangeChange(hours)}
            >
              {hours < 24 ? `${hours}h` : `${hours / 24}d`}
            </button>
          ))}
        </div>
      </div>

      <div className="server-resources__content">
        {/* 게이지 차트 (현재 상태) */}
        <div className="server-resources__gauges">
          {isCurrentLoading ? (
            <div className="server-resources__loading">로딩 중...</div>
          ) : currentMetrics ? (
            <>
              <ResourceGauge
                label="CPU"
                value={currentMetrics.cpu.usage}
                total={`${currentMetrics.cpu.cores} cores`}
                color="cpu"
              />
              <ResourceGauge
                label="Memory"
                value={currentMetrics.memory.usagePercent}
                used={formatBytes(currentMetrics.memory.used)}
                total={formatBytes(currentMetrics.memory.total)}
                color="memory"
              />
              {/* 파티션별 디스크 표시 */}
              {currentMetrics.disks ? (
                <>
                  <ResourceGauge
                    label="Disk (/)"
                    value={currentMetrics.disks.root.usagePercent}
                    used={formatBytes(currentMetrics.disks.root.used)}
                    total={formatBytes(currentMetrics.disks.root.total)}
                    color="disk"
                  />
                  <ResourceGauge
                    label="Disk (/data)"
                    value={currentMetrics.disks.data.usagePercent}
                    used={formatBytes(currentMetrics.disks.data.used)}
                    total={formatBytes(currentMetrics.disks.data.total)}
                    color="disk-data"
                  />
                </>
              ) : (
                <ResourceGauge
                  label="Disk"
                  value={currentMetrics.disk.usagePercent}
                  used={formatBytes(currentMetrics.disk.used)}
                  total={formatBytes(currentMetrics.disk.total)}
                  color="disk"
                />
              )}
            </>
          ) : (
            <div className="server-resources__loading">메트릭 데이터 없음</div>
          )}
        </div>

        {/* 시계열 차트 */}
        <div className="server-resources__chart">
          {isHistoryLoading ? (
            <div className="server-resources__loading">차트 로딩 중...</div>
          ) : (
            <MetricsLineChart data={chartData} showDisk={true} height="100%" timeRangeHours={timeRange} />
          )}
        </div>
      </div>
    </section>
  );
};

// 실시간 메트릭 섹션 컴포넌트
const RealtimeMetricsSection = () => {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['admin', 'metrics', 'realtime'],
    queryFn: dashboardApi.getMetricsRealtime,
    refetchInterval: 3000, // 3초마다 갱신
  });

  // 부하 지수 상태별 색상
  const getLoadStatusColor = (status: string): string => {
    switch (status) {
      case 'normal': return 'var(--color-success)';
      case 'warning': return 'var(--color-warning)';
      case 'critical': return 'var(--color-danger)';
      default: return 'var(--color-text-secondary)';
    }
  };

  // 부하 지수 상태별 텍스트
  const getLoadStatusText = (status: string): string => {
    switch (status) {
      case 'normal': return '정상';
      case 'warning': return '주의';
      case 'critical': return '위험';
      default: return '-';
    }
  };

  if (isLoading) {
    return (
      <section className="realtime-metrics-section">
        <div className="realtime-metrics-section__header">
          <h2 className="realtime-metrics-section__title">실시간 모니터링</h2>
        </div>
        <div className="realtime-metrics-section__loading">로딩 중...</div>
      </section>
    );
  }

  if (!metrics) {
    return null;
  }

  return (
    <section className="realtime-metrics-section">
      <div className="realtime-metrics-section__header">
        <h2 className="realtime-metrics-section__title">실시간 모니터링</h2>
        <span className="realtime-metrics-section__subtitle">3초마다 자동 갱신</span>
      </div>

      <div className="realtime-metrics-section__grid">
        {/* 동시접속 */}
        <div className="realtime-metrics-section__card">
          <div className="realtime-metrics-section__card-header">
            <span className="realtime-metrics-section__card-icon">👥</span>
            <span className="realtime-metrics-section__card-title">동시접속</span>
          </div>
          <div className="realtime-metrics-section__card-content">
            <div className="realtime-metrics-section__stat-row">
              <span className="realtime-metrics-section__stat-label">활성 요청</span>
              <span className="realtime-metrics-section__stat-value">
                {metrics.concurrency.activeRequests}
              </span>
            </div>
            <div className="realtime-metrics-section__stat-row">
              <span className="realtime-metrics-section__stat-label">활성 사용자</span>
              <span className="realtime-metrics-section__stat-value">
                {metrics.concurrency.activeUsers}명
              </span>
            </div>
            <div className="realtime-metrics-section__stat-row realtime-metrics-section__stat-row--muted">
              <span className="realtime-metrics-section__stat-label">피크 요청</span>
              <span className="realtime-metrics-section__stat-value">
                {metrics.concurrency.peakRequests}/s
              </span>
            </div>
          </div>
        </div>

        {/* 처리량 */}
        <div className="realtime-metrics-section__card">
          <div className="realtime-metrics-section__card-header">
            <span className="realtime-metrics-section__card-icon">⚡</span>
            <span className="realtime-metrics-section__card-title">처리량</span>
          </div>
          <div className="realtime-metrics-section__card-content">
            <div className="realtime-metrics-section__stat-row">
              <span className="realtime-metrics-section__stat-label">요청/초</span>
              <span className="realtime-metrics-section__stat-value realtime-metrics-section__stat-value--highlight">
                {metrics.throughput.requestsPerSecond}
              </span>
            </div>
            <div className="realtime-metrics-section__stat-row">
              <span className="realtime-metrics-section__stat-label">최근 60초</span>
              <span className="realtime-metrics-section__stat-value">
                {metrics.throughput.requestsLast60s}건
              </span>
            </div>
            <div className="realtime-metrics-section__stat-row realtime-metrics-section__stat-row--muted">
              <span className="realtime-metrics-section__stat-label">에러율</span>
              <span className={`realtime-metrics-section__stat-value ${metrics.throughput.errorRate > 0 ? 'realtime-metrics-section__stat-value--error' : ''}`}>
                {metrics.throughput.errorRate}%
              </span>
            </div>
          </div>
        </div>

        {/* 응답시간 */}
        <div className="realtime-metrics-section__card">
          <div className="realtime-metrics-section__card-header">
            <span className="realtime-metrics-section__card-icon">⏱️</span>
            <span className="realtime-metrics-section__card-title">응답시간</span>
          </div>
          <div className="realtime-metrics-section__card-content">
            <div className="realtime-metrics-section__stat-row">
              <span className="realtime-metrics-section__stat-label">평균</span>
              <span className="realtime-metrics-section__stat-value">
                {metrics.responseTime.avg}ms
              </span>
            </div>
            <div className="realtime-metrics-section__stat-row">
              <span className="realtime-metrics-section__stat-label">P95</span>
              <span className={`realtime-metrics-section__stat-value ${metrics.responseTime.p95 > 1000 ? 'realtime-metrics-section__stat-value--warning' : ''}`}>
                {metrics.responseTime.p95}ms
              </span>
            </div>
            <div className="realtime-metrics-section__stat-row realtime-metrics-section__stat-row--muted">
              <span className="realtime-metrics-section__stat-label">P99</span>
              <span className="realtime-metrics-section__stat-value">
                {metrics.responseTime.p99}ms
              </span>
            </div>
          </div>
        </div>

        {/* 부하 지수 */}
        <div className="realtime-metrics-section__card realtime-metrics-section__card--load-index">
          <div className="realtime-metrics-section__card-header">
            <span className="realtime-metrics-section__card-icon">📊</span>
            <span className="realtime-metrics-section__card-title">부하 지수</span>
          </div>
          <div className="realtime-metrics-section__card-content">
            <div className="realtime-metrics-section__load-gauge">
              <div
                className="realtime-metrics-section__load-value"
                style={{ color: getLoadStatusColor(metrics.loadIndex.status) }}
              >
                {metrics.loadIndex.value}
              </div>
              <div
                className="realtime-metrics-section__load-status"
                style={{ color: getLoadStatusColor(metrics.loadIndex.status) }}
              >
                {getLoadStatusText(metrics.loadIndex.status)}
              </div>
            </div>
            <div className="realtime-metrics-section__load-bar">
              <div
                className="realtime-metrics-section__load-bar-fill"
                style={{
                  width: `${Math.min(100, metrics.loadIndex.value)}%`,
                  backgroundColor: getLoadStatusColor(metrics.loadIndex.status)
                }}
              />
            </div>
            <div className="realtime-metrics-section__load-components">
              <span>CPU: {metrics.loadIndex.components.cpu.toFixed(1)}%</span>
              <span>MEM: {metrics.loadIndex.components.memory.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

// 상태 이력 날짜 포맷
const formatHistoryDate = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

// 서비스 상태 이력 섹션
const HealthHistorySection = () => {
  const [filter, setFilter] = useState<'all' | 'down' | 'recovered'>('all');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'health-history', filter],
    queryFn: () => dashboardApi.getHealthHistory({
      eventType: filter === 'all' ? undefined : filter,
      limit: 50,
    }),
    refetchInterval: 60000,
  });

  const clearMutation = useMutation({
    mutationFn: dashboardApi.clearHealthHistory,
    onSuccess: (result) => {
      // 모든 필터의 캐시 무효화
      queryClient.invalidateQueries({ queryKey: ['admin', 'health-history'] });
      alert(`${result.deletedCount}건의 이력이 삭제되었습니다`);
    },
    onError: (error) => {
      alert(`삭제 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    },
  });

  const handleClear = () => {
    if (window.confirm('모든 서비스 상태 이력을 삭제하시겠습니까?')) {
      clearMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <section className="health-history-section">
        <div className="health-history-section__header">
          <h2 className="health-history-section__title">서비스 상태 이력</h2>
        </div>
        <div className="health-history-section__loading">로딩 중...</div>
      </section>
    );
  }

  const logs = data?.logs || [];

  return (
    <section className="health-history-section">
      <div className="health-history-section__header">
        <h2 className="health-history-section__title">서비스 상태 이력</h2>
        <div className="health-history-section__filters">
          <button
            type="button"
            className={`health-history-section__filter-btn ${filter === 'all' ? 'health-history-section__filter-btn--active' : ''}`}
            onClick={() => setFilter('all')}
          >
            전체
          </button>
          <button
            type="button"
            className={`health-history-section__filter-btn ${filter === 'down' ? 'health-history-section__filter-btn--active' : ''}`}
            onClick={() => setFilter('down')}
          >
            장애
          </button>
          <button
            type="button"
            className={`health-history-section__filter-btn ${filter === 'recovered' ? 'health-history-section__filter-btn--active' : ''}`}
            onClick={() => setFilter('recovered')}
          >
            복구
          </button>
          <button
            type="button"
            className="health-history-section__clear-btn"
            onClick={handleClear}
            disabled={clearMutation.isPending || logs.length === 0}
            title="모든 이력 삭제"
          >
            {clearMutation.isPending ? '삭제 중...' : '지우기'}
          </button>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="health-history-section__empty">
          <span className="health-history-section__empty-icon">✓</span>
          <span className="health-history-section__empty-text">
            기록된 상태 변경 이력이 없습니다
          </span>
        </div>
      ) : (
        <div className="health-history-section__list">
          {logs.map((log: HealthHistoryLog) => (
            <div
              key={log._id}
              className={`health-history-section__item health-history-section__item--${log.eventType}`}
            >
              <span className={`health-history-section__event-icon health-history-section__event-icon--${log.eventType}`}>
                {log.eventType === 'down' ? '✕' : '✓'}
              </span>
              <div className="health-history-section__item-content">
                <div className="health-history-section__item-header">
                  <span className="health-history-section__item-service">
                    {log.service}
                    <span className="health-history-section__item-port">:{log.port}</span>
                  </span>
                  <span className={`health-history-section__item-event health-history-section__item-event--${log.eventType}`}>
                    {log.eventType === 'down' ? '장애 발생' : '복구됨'}
                  </span>
                </div>
                <div className="health-history-section__item-details">
                  <span className="health-history-section__item-time">
                    {formatHistoryDate(log.timestamp)}
                  </span>
                  {log.error && (
                    <span className="health-history-section__item-error">
                      {log.error}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

// 포트 현황 섹션 컴포넌트 (컴팩트 칩 형태)
const PortsSection = () => {
  const { data: ports, isLoading } = useQuery({
    queryKey: ['admin', 'ports'],
    queryFn: dashboardApi.getPorts,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <section className="ports-section">
        <div className="ports-section__header">
          <h2 className="ports-section__title">포트 현황</h2>
        </div>
        <div className="ports-section__loading">로딩 중...</div>
      </section>
    );
  }

  const listeningCount = ports?.filter(p => p.status === 'listening').length || 0;
  const totalCount = ports?.length || 0;

  return (
    <section className="ports-section">
      <div className="ports-section__header">
        <h2 className="ports-section__title">포트 현황</h2>
        <span className="ports-section__subtitle">
          {listeningCount}/{totalCount} listening
        </span>
      </div>
      <div className="ports-section__grid">
        {ports?.map((port) => (
          <div
            key={port.port}
            className={`ports-section__item ports-section__item--${port.status}`}
          >
            <span className={`ports-section__indicator ports-section__indicator--${port.status}`} />
            <span className="ports-section__item-port">{port.port}</span>
            <span className="ports-section__item-service">{port.service}</span>
            <span className="ports-section__item-desc">{port.description}</span>
          </div>
        ))}
      </div>
    </section>
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

  // Tier별 서비스 구성
  const serviceTiers = [
    {
      tier: 'Tier 1: Infrastructure',
      description: '핵심 인프라 - 장애 시 전체 서비스 중단',
      services: [
        {
          service: 'MongoDB',
          health: normalizeHealth(health?.mongodb),
          description: '데이터베이스 서버',
          port: 27017,
        },
        {
          service: 'Qdrant',
          health: normalizeHealth(health?.qdrant),
          description: '벡터 데이터베이스 (AI 검색용)',
          port: 6333,
        },
      ],
    },
    {
      tier: 'Tier 2: Backend APIs',
      description: '백엔드 API - 장애 시 주요 기능 제한',
      services: [
        {
          service: 'aims_api',
          health: normalizeHealth(health?.nodeApi),
          description: 'AIMS 메인 백엔드 API 서버',
          port: 3010,
        },
        {
          service: 'aims_rag_api',
          health: normalizeHealth(health?.aimsRagApi),
          description: 'RAG 검색 및 문서 처리 API 서버',
          port: 8000,
        },
        {
          service: 'annual_report_api',
          health: normalizeHealth(health?.annualReportApi),
          description: '연간보고서 분석 API',
          port: 8004,
        },
        {
          service: 'pdf_proxy',
          health: normalizeHealth(health?.pdfProxy),
          description: 'PDF 프록시 서버',
          port: 8002,
        },
        {
          service: 'pdf_converter',
          health: normalizeHealth(health?.pdfConverter),
          description: 'PDF 변환 서버 (HWP→PDF 등)',
          port: 8005,
        },
        {
          service: 'aims_mcp',
          health: normalizeHealth(health?.aimsMcp),
          description: 'MCP 서버 (AI 도구)',
          port: 3011,
        },
      ],
    },
    {
      tier: 'Tier 3: Workflow',
      description: '워크플로우 - 장애 시 자동화 기능 제한',
      services: [
        {
          service: 'n8n',
          health: normalizeHealth(health?.n8n),
          description: '워크플로우 자동화 엔진',
          port: 5678,
        },
      ],
    },
  ];

  // 모든 서비스 평탄화 (전체 상태 계산용)
  const services = serviceTiers.flatMap((tier) => tier.services);

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

      {/* 서버 리소스 섹션 */}
      <ServerResourcesSection />

      {/* 실시간 메트릭 섹션 */}
      <RealtimeMetricsSection />

      {/* 서비스 상태 + 포트 현황 2열 레이아웃 */}
      <div className="system-health-page__two-column">
        {/* 좌측: Tier 서비스 상태 + n8n 워크플로우 */}
        <div className="system-health-page__services-column">
          {serviceTiers.map((tierGroup) => (
            <section key={tierGroup.tier} className="system-health-page__section">
              <div className="system-health-page__tier-header">
                <h2 className="system-health-page__section-title">{tierGroup.tier}</h2>
                <span className="system-health-page__tier-description">{tierGroup.description}</span>
              </div>
              <div className="system-health-page__health-grid">
                {tierGroup.services.map((service) => (
                  <HealthCard
                    key={service.service}
                    service={service.service}
                    health={service.health}
                    description={service.description}
                    port={service.port}
                  />
                ))}
              </div>
            </section>
          ))}

          {/* n8n 워크플로우 상태 - Tier3 바로 아래 */}
          {data?.workflows && data.workflows.length > 0 && (
            <section className="system-health-page__section">
              <div className="system-health-page__tier-header">
                <h2 className="system-health-page__section-title">n8n 워크플로우</h2>
                <span className="system-health-page__tier-description">
                  {data.workflows.filter(w => w.active).length}/{data.workflows.length} 활성화
                </span>
              </div>
              <div className="system-health-page__workflow-grid">
                {data.workflows.map((workflow) => (
                  <WorkflowCard key={workflow.id} workflow={workflow} />
                ))}
              </div>
            </section>
          )}
        </div>

        {/* 우측: 포트 현황 + 상태 이력 */}
        <div className="system-health-page__ports-column">
          <PortsSection />
          <HealthHistorySection />
        </div>
      </div>
    </div>
  );
};
