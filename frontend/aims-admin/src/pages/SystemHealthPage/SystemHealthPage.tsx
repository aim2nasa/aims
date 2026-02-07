import { useState, useCallback, useEffect, useRef, useMemo, memo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardApi, type ServiceHealth, type HealthHistoryLog } from '@/features/dashboard/api';
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

// localStorage 키
const TIME_RANGE_STORAGE_KEY = 'aims-admin-metrics-time-range';

// 서버 리소스 섹션 컴포넌트 (memo: 부모 리렌더 차단)
const ServerResourcesSection = memo(function ServerResourcesSection({ isAimsApiHealthy }: { isAimsApiHealthy: boolean }) {
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
  const { data: currentMetrics, isLoading: isCurrentLoading, isError: isCurrentError } = useQuery({
    queryKey: ['admin', 'metrics', 'current'],
    queryFn: dashboardApi.getMetricsCurrent,
    refetchInterval: 10000,
    refetchIntervalInBackground: false, // 백그라운드 탭에서 refetch 중지 (메모리 절약)
    retry: 0, // 즉시 실패 감지 (딜레이 최소화)
  });

  // 히스토리 메트릭
  const { data: historyData, isLoading: isHistoryLoading, isError: isHistoryError } = useQuery({
    queryKey: ['admin', 'metrics', 'history', timeRange],
    queryFn: () => dashboardApi.getMetricsHistory(timeRange),
    refetchInterval: 60000, // 1분마다 갱신
    refetchIntervalInBackground: false, // 백그라운드 탭에서 refetch 중지 (메모리 절약)
    gcTime: 5 * 60 * 1000, // 5분 후 캐시 정리 (메모리 절약)
    staleTime: 30000, // 30초간 fresh 상태 유지
    retry: 0, // 즉시 실패 감지 (딜레이 최소화)
  });

  // aims_api 연결 실패 여부 (헬스 모니터 기준 또는 API 에러)
  const apiUnavailable = !isAimsApiHealthy || (isCurrentError && isHistoryError);

  // 라인 차트용 데이터 변환 (useMemo: historyData 변경 시에만 재계산)
  // 백엔드에서 이미 샘플링된 데이터가 반환됨 (시간 범위에 따라 자동 샘플링)
  // - 1~6시간: 전체 데이터, 24시간: 5분 간격, 72시간: 15분 간격, 168시간: 30분 간격
  const rawMetrics = historyData?.metrics || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartData = useMemo(() => rawMetrics.map((m: any) => ({
    timestamp: m.timestamp,
    // 새 형식 (aggregation): 플랫 값 / 구 형식: 중첩 객체
    cpu: typeof m.cpu === 'number' ? m.cpu : m.cpu?.usage ?? 0,
    memory: typeof m.memory === 'number' ? m.memory : m.memory?.usagePercent ?? 0,
    disk: m.diskRoot ?? (typeof m.disk === 'number' ? m.disk : m.disk?.usagePercent ?? 0),
    diskRoot: m.diskRoot ?? m.disks?.root?.usagePercent ?? (typeof m.disk === 'number' ? m.disk : m.disk?.usagePercent ?? 0),
    diskData: m.diskData ?? m.disks?.data?.usagePercent ?? null,
  })), [rawMetrics]);

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
        {apiUnavailable ? (
          <div className="server-resources__unavailable">
            ⚠️ aims_api(3010) 연결 필요 - 복구 후 자동 갱신
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
    </section>
  );
});

// 실시간 메트릭 섹션 컴포넌트 (memo: 부모 리렌더 차단)
const RealtimeMetricsSection = memo(function RealtimeMetricsSection({ isAimsApiHealthy }: { isAimsApiHealthy: boolean }) {
  const { data: metrics, isLoading, isError } = useQuery({
    queryKey: ['admin', 'metrics', 'realtime'],
    queryFn: dashboardApi.getMetricsRealtime,
    refetchInterval: 10000, // 10초마다 갱신 (3초 → 10초: OOM 방지)
    refetchIntervalInBackground: false, // 백그라운드 탭에서 refetch 중지 (메모리 절약)
    staleTime: 8000, // 8초간 fresh 유지 (중간 리렌더 시 불필요한 refetch 방지)
    retry: 0, // 즉시 실패 감지 (딜레이 최소화)
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

  // 에러 또는 데이터 없음 또는 헬스 모니터 기준 aims_api 다운: 같은 레이아웃 유지하면서 placeholder 표시
  const showUnavailable = !isAimsApiHealthy || isError || !metrics;

  return (
    <section className="realtime-metrics-section">
      <div className="realtime-metrics-section__header">
        <h2 className="realtime-metrics-section__title">실시간 모니터링</h2>
        <span className="realtime-metrics-section__subtitle">
          {showUnavailable ? 'aims_api 연결 필요' : '3초마다 자동 갱신'}
        </span>
      </div>

      <div className="realtime-metrics-section__grid">
        {/* 동시접속 */}
        <div className="realtime-metrics-section__card">
          <div className="realtime-metrics-section__card-header">
            <span className="realtime-metrics-section__card-icon">👥</span>
            <span className="realtime-metrics-section__card-title">동시접속</span>
          </div>
          <div className="realtime-metrics-section__card-content">
            {showUnavailable ? (
              <div className="realtime-metrics-section__card-unavailable">-</div>
            ) : (
            <>
            <div className="realtime-metrics-section__stat-row">
              <span className="realtime-metrics-section__stat-label">활성 요청</span>
              <span className="realtime-metrics-section__stat-value">
                {metrics!.concurrency.activeRequests}
              </span>
            </div>
            <div className="realtime-metrics-section__stat-row">
              <span className="realtime-metrics-section__stat-label">활성 사용자</span>
              <span className="realtime-metrics-section__stat-value">
                {metrics!.concurrency.activeUsers}명
              </span>
            </div>
            <div className="realtime-metrics-section__stat-row realtime-metrics-section__stat-row--muted">
              <span className="realtime-metrics-section__stat-label">피크 요청</span>
              <span className="realtime-metrics-section__stat-value">
                {metrics!.concurrency.peakRequests}/s
              </span>
            </div>
            </>
            )}
          </div>
        </div>

        {/* 처리량 */}
        <div className="realtime-metrics-section__card">
          <div className="realtime-metrics-section__card-header">
            <span className="realtime-metrics-section__card-icon">⚡</span>
            <span className="realtime-metrics-section__card-title">처리량</span>
          </div>
          <div className="realtime-metrics-section__card-content">
            {showUnavailable ? (
              <div className="realtime-metrics-section__card-unavailable">-</div>
            ) : (
            <>
            <div className="realtime-metrics-section__stat-row">
              <span className="realtime-metrics-section__stat-label">요청/초</span>
              <span className="realtime-metrics-section__stat-value realtime-metrics-section__stat-value--highlight">
                {metrics!.throughput.requestsPerSecond}
              </span>
            </div>
            <div className="realtime-metrics-section__stat-row">
              <span className="realtime-metrics-section__stat-label">최근 60초</span>
              <span className="realtime-metrics-section__stat-value">
                {metrics!.throughput.requestsLast60s}건
              </span>
            </div>
            <div className="realtime-metrics-section__stat-row realtime-metrics-section__stat-row--muted">
              <span className="realtime-metrics-section__stat-label">에러율</span>
              <span className={`realtime-metrics-section__stat-value ${metrics!.throughput.errorRate > 0 ? 'realtime-metrics-section__stat-value--error' : ''}`}>
                {metrics!.throughput.errorRate}%
              </span>
            </div>
            </>
            )}
          </div>
        </div>

        {/* 응답시간 */}
        <div className="realtime-metrics-section__card">
          <div className="realtime-metrics-section__card-header">
            <span className="realtime-metrics-section__card-icon">⏱️</span>
            <span className="realtime-metrics-section__card-title">응답시간</span>
          </div>
          <div className="realtime-metrics-section__card-content">
            {showUnavailable ? (
              <div className="realtime-metrics-section__card-unavailable">-</div>
            ) : (
            <>
            <div className="realtime-metrics-section__stat-row">
              <span className="realtime-metrics-section__stat-label">평균</span>
              <span className="realtime-metrics-section__stat-value">
                {metrics!.responseTime.avg}ms
              </span>
            </div>
            <div className="realtime-metrics-section__stat-row">
              <span className="realtime-metrics-section__stat-label">P95</span>
              <span className={`realtime-metrics-section__stat-value ${metrics!.responseTime.p95 > 1000 ? 'realtime-metrics-section__stat-value--warning' : ''}`}>
                {metrics!.responseTime.p95}ms
              </span>
            </div>
            <div className="realtime-metrics-section__stat-row realtime-metrics-section__stat-row--muted">
              <span className="realtime-metrics-section__stat-label">P99</span>
              <span className="realtime-metrics-section__stat-value">
                {metrics!.responseTime.p99}ms
              </span>
            </div>
            </>
            )}
          </div>
        </div>

        {/* 부하 지수 */}
        <div className="realtime-metrics-section__card realtime-metrics-section__card--load-index">
          <div className="realtime-metrics-section__card-header">
            <span className="realtime-metrics-section__card-icon">📊</span>
            <span className="realtime-metrics-section__card-title">부하 지수</span>
          </div>
          <div className="realtime-metrics-section__card-content">
            {showUnavailable ? (
              <div className="realtime-metrics-section__card-unavailable">-</div>
            ) : (
            <>
            <div className="realtime-metrics-section__load-gauge">
              <div
                className="realtime-metrics-section__load-value"
                style={{ color: getLoadStatusColor(metrics!.loadIndex.status) }}
              >
                {metrics!.loadIndex.value}
              </div>
              <div
                className="realtime-metrics-section__load-status"
                style={{ color: getLoadStatusColor(metrics!.loadIndex.status) }}
              >
                {getLoadStatusText(metrics!.loadIndex.status)}
              </div>
            </div>
            <div className="realtime-metrics-section__load-bar">
              <div
                className="realtime-metrics-section__load-bar-fill"
                style={{
                  width: `${Math.min(100, metrics!.loadIndex.value)}%`,
                  backgroundColor: getLoadStatusColor(metrics!.loadIndex.status)
                }}
              />
            </div>
            <div className="realtime-metrics-section__load-components">
              <span>CPU: {metrics!.loadIndex.components.cpu.toFixed(1)}%</span>
              <span>MEM: {metrics!.loadIndex.components.memory.toFixed(1)}%</span>
            </div>
            </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
});

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

// 서비스 상태 이력 섹션 (memo: props 없으므로 부모 리렌더 완전 차단)
const HealthHistorySection = memo(function HealthHistorySection() {
  const [filter, setFilter] = useState<'all' | 'down' | 'recovered'>('all');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'health-history', filter],
    queryFn: () => dashboardApi.getHealthHistory({
      eventType: filter === 'all' ? undefined : filter,
      limit: 50,
    }),
    refetchInterval: 60000,
    refetchIntervalInBackground: false, // 백그라운드 탭에서 refetch 중지 (메모리 절약)
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
});

// 포트 현황 섹션 컴포넌트 (memo: props 없으므로 부모 리렌더 완전 차단)
const PortsSection = memo(function PortsSection() {
  const { data: ports, isLoading } = useQuery({
    queryKey: ['admin', 'ports'],
    queryFn: dashboardApi.getPorts,
    refetchInterval: 30000, // 30초마다 갱신 (포트 상태는 자주 변하지 않음)
    refetchIntervalInBackground: false, // 백그라운드 탭에서 refetch 중지 (메모리 절약)
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
});

// 독립 헬스 모니터 응답을 기존 HealthStatus 형식으로 변환
type HealthMonitorResponse = Awaited<ReturnType<typeof dashboardApi.getHealthCurrent>>;
type HealthStatus = NonNullable<Awaited<ReturnType<typeof dashboardApi.getDashboard>>['health']>;

const convertHealthData = (data: HealthMonitorResponse): HealthStatus => {
  const findService = (name: string) => {
    const svc = data.services.find(s => s.service === name);
    if (!svc) return { status: 'unhealthy' as const, latency: null, checkedAt: new Date().toISOString() };
    return {
      status: svc.status,
      latency: svc.responseTime,
      checkedAt: svc.checkedAt,
      error: svc.error,
    };
  };

  return {
    mongodb: findService('mongodb'),
    qdrant: findService('qdrant'),
    nodeApi: findService('aims_api'),
    aimsRagApi: findService('aims_rag_api'),
    annualReportApi: findService('annual_report_api'),
    pdfProxy: findService('pdf_proxy'),
    pdfConverter: findService('pdf_converter'),
    aimsMcp: findService('aims_mcp'),
    n8n: findService('n8n'),
  };
};

export const SystemHealthPage = () => {
  const queryClient = useQueryClient();

  // 독립 헬스 모니터에서 서비스 상태 조회 (aims_api와 무관하게 항상 동작)
  const {
    data: healthData,
    isLoading: isHealthLoading,
  } = useQuery({
    queryKey: ['health-monitor', 'current'],
    queryFn: dashboardApi.getHealthCurrent,
    refetchInterval: 10000,
    refetchIntervalInBackground: false, // 백그라운드 탭에서 refetch 중지 (메모리 절약)
    retry: 3,
    retryDelay: 1000,
  });

  // 대시보드 데이터 (aims_api) - 실패해도 서비스 상태는 표시됨
  const { data } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: dashboardApi.getDashboard,
    refetchInterval: 30000, // 30초마다 갱신 (보조 데이터, 주 상태는 health-monitor에서)
    refetchIntervalInBackground: false, // 백그라운드 탭에서 refetch 중지 (메모리 절약)
    retry: 0, // 즉시 실패 감지
  });

  // 독립 헬스 모니터의 서비스 상태를 기존 형식으로 변환
  // 모든 훅보다 먼저 계산하여 useEffect에서 사용
  const health = healthData ? convertHealthData(healthData) : data?.health;

  // 독립 헬스 모니터 기준: aims_api(3010) 상태 확인
  // 이 값이 unhealthy면 aims_api에서 데이터를 가져오는 모든 섹션을 unavailable로 표시
  const isAimsApiHealthy = health?.nodeApi?.status === 'healthy';

  // aims_api 상태 변경 감지용 ref (모든 훅은 조기 리턴 전에 선언해야 함)
  const prevAimsApiStatus = useRef<boolean | null>(null);

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

  // Tier별 서비스 구성 (useMemo: health 변경 시에만 재생성)
  // ⚠️ 반드시 조기 리턴 전에 선언 (React Hooks 규칙: 모든 렌더에서 동일 순서)
  const serviceTiers = useMemo(() => [
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
  ], [health]);

  // 모든 서비스 평탄화 (전체 상태 계산용)
  const services = useMemo(() => serviceTiers.flatMap((tier) => tier.services), [serviceTiers]);

  // aims_api 상태 변경 감지 → 활성 쿼리만 동기화 (OOM 방지: 비활성 캐시 refetch 금지)
  const statusChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // 최초 로드 시에는 무시
    if (prevAimsApiStatus.current === null) {
      prevAimsApiStatus.current = isAimsApiHealthy;
      return;
    }
    // 상태가 변경되었을 때만 활성 쿼리 갱신 (debounce: 2초)
    if (prevAimsApiStatus.current !== isAimsApiHealthy) {
      prevAimsApiStatus.current = isAimsApiHealthy;

      // 이전 타이머 취소 (급격한 상태 변화 시 중복 invalidation 방지)
      if (statusChangeTimerRef.current) {
        clearTimeout(statusChangeTimerRef.current);
      }
      statusChangeTimerRef.current = setTimeout(() => {
        // refetchType 기본값 'active': 현재 관찰 중인 쿼리만 refetch
        queryClient.invalidateQueries({ queryKey: ['admin'] });
        queryClient.invalidateQueries({ queryKey: ['health-monitor'] });
      }, 2000);
    }
  }, [isAimsApiHealthy, queryClient]);

  // cleanup: 컴포넌트 언마운트 시 타이머 정리 + 대용량 캐시 즉시 해제 (OOM 방지)
  useEffect(() => {
    return () => {
      if (statusChangeTimerRef.current) {
        clearTimeout(statusChangeTimerRef.current);
      }
      // 메트릭 히스토리/실시간 데이터: 페이지 이탈 시 즉시 GC 대상으로 전환
      queryClient.removeQueries({ queryKey: ['admin', 'metrics', 'history'] });
      queryClient.removeQueries({ queryKey: ['admin', 'metrics', 'realtime'] });
    };
  }, [queryClient]);

  // 모든 관련 쿼리를 동시에 갱신 (동기화)
  const refetchAll = useCallback(async () => {
    // 1. 독립 헬스 모니터에 강제 체크 요청 (최신 상태 수집)
    try {
      await dashboardApi.forceHealthCheck();
    } catch {
      // 헬스 모니터 자체가 다운된 경우 무시
    }

    // 2. 활성 쿼리만 invalidate (OOM 방지: 비활성 캐시 refetch 금지)
    // refetchType 기본값 'active': 현재 관찰 중인 쿼리만 refetch
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['health-monitor'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'metrics'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'ports'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'health-history'] }),
    ]);
  }, [queryClient]);

  // 헬스 모니터 로딩 중 (모든 훅 선언 후에 조기 리턴)
  if (isHealthLoading) {
    return <div className="system-health-page__loading">데이터를 불러오는 중...</div>;
  }

  // 헬스 모니터도 실패한 경우 (심각한 문제)
  if (!healthData) {
    return (
      <div className="system-health-page__error">
        <p>헬스 모니터 서비스에 연결할 수 없습니다.</p>
        <p>독립 모니터링 서비스(3012)를 확인하세요.</p>
        <Button onClick={() => refetchAll()}>다시 시도</Button>
      </div>
    );
  }

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
          <Button variant="secondary" size="sm" onClick={() => refetchAll()}>
            지금 새로고침
          </Button>
        </div>
      </div>

      {/* 전체 2열 레이아웃 */}
      <div className="system-health-page__main-layout">
        {/* 좌측: 메인 콘텐츠 */}
        <div className="system-health-page__main-column">
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
          <ServerResourcesSection isAimsApiHealthy={isAimsApiHealthy} />

          {/* 실시간 메트릭 섹션 */}
          <RealtimeMetricsSection isAimsApiHealthy={isAimsApiHealthy} />

          {/* Tier 서비스 상태 */}
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

        </div>

        {/* 우측: 포트 현황 + 상태 이력 */}
        <div className="system-health-page__side-column">
          <PortsSection />
          <HealthHistorySection />
        </div>
      </div>
    </div>
  );
};
