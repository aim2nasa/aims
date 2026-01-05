/**
 * Shadow Monitor Page - n8n/FastAPI 마이그레이션 모니터링
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/shared/ui/Button/Button';
import './ShadowMonitorPage.css';

const PIPELINE_API_URL = '';

type ServiceModeType = 'n8n' | 'fastapi' | 'shadow';

interface ServiceModeResponse {
  mode: ServiceModeType;
  shadow_enabled: boolean;
  description: string;
  available_modes: ServiceModeType[];
}

interface MetricsResponse {
  period: { days: number; since: string; until: string };
  current_mode: ServiceModeType;
  summary: {
    total_calls: number;
    n8n: { avg_response_time_ms: number; error_rate: number };
    fastapi: { avg_response_time_ms: number; error_rate: number };
  };
  by_workflow: Record<string, {
    call_count: number;
    n8n_avg_ms: number;
    fastapi_avg_ms: number;
    improvement_pct: number;
  }>;
  comparison: {
    faster_service: string;
    improvement_pct: number;
    n8n_avg_ms: number;
    fastapi_avg_ms: number;
  } | null;
}

interface ShadowStats {
  shadow_mode: {
    enabled: boolean;
    total_calls_all_time: number;
    last_call_time: string | null;
  };
  summary: {
    total_calls: number;
    match: number;
    mismatch: number;
    error: number;
    match_rate: number;
  };
  switch_readiness: {
    ready: boolean;
    recommendation: string;
    checks: Record<string, { passed: boolean; actual: string | number; required: string | number }>;
  };
}

interface Mismatch {
  id: string;
  workflow: string;
  timestamp: string;
  diffs: Array<{ path: string; n8n_value: string | null; fastapi_value: string | null; diff_type: string }>;
  status: string;
  _index?: number;
}

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'unhealthy' | 'timeout' | 'error';
  latency_ms?: number;
  error?: string;
}

const fetchStats = async (days: number): Promise<ShadowStats> => {
  const response = await fetch(`${PIPELINE_API_URL}/shadow/stats?days=${days}`);
  if (!response.ok) throw new Error('Failed to fetch stats');
  return response.json();
};

const fetchMismatches = async (): Promise<{ mismatches: Mismatch[] }> => {
  const response = await fetch(`${PIPELINE_API_URL}/shadow/mismatches?limit=20`);
  if (!response.ok) throw new Error('Failed to fetch mismatches');
  return response.json();
};

const fetchServicesStatus = async (): Promise<{ services: ServiceStatus[] }> => {
  const response = await fetch(`${PIPELINE_API_URL}/shadow/services-status`);
  if (!response.ok) throw new Error('Failed to fetch services status');
  return response.json();
};

const fetchServiceMode = async (): Promise<ServiceModeResponse> => {
  const response = await fetch(`${PIPELINE_API_URL}/shadow/service-mode`);
  if (!response.ok) throw new Error('Failed to fetch service mode');
  return response.json();
};

const setServiceMode = async (mode: ServiceModeType): Promise<{ current_mode: string }> => {
  const response = await fetch(`${PIPELINE_API_URL}/shadow/service-mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  if (!response.ok) throw new Error('Failed to set service mode');
  return response.json();
};

const fetchMetrics = async (days: number): Promise<MetricsResponse> => {
  const response = await fetch(`${PIPELINE_API_URL}/shadow/metrics?days=${days}`);
  if (!response.ok) throw new Error('Failed to fetch metrics');
  return response.json();
};

const formatRelativeTime = (isoString: string): string => {
  const utcString = isoString.endsWith('Z') ? isoString : isoString + 'Z';
  const diffMs = Date.now() - new Date(utcString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(diffMs / 3600000);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(diffMs / 86400000)}일 전`;
};

export const ShadowMonitorPage = () => {
  const [metricsDays, setMetricsDays] = useState(7);
  const [selectedMismatch, setSelectedMismatch] = useState<Mismatch | null>(null);
  const [isChangingMode, setIsChangingMode] = useState(false);
  const queryClient = useQueryClient();

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['shadow', 'stats', 7],
    queryFn: () => fetchStats(7),
    refetchInterval: 30000,
  });

  const { data: mismatchesData, refetch: refetchMismatches } = useQuery({
    queryKey: ['shadow', 'mismatches'],
    queryFn: fetchMismatches,
    refetchInterval: 30000,
  });

  const { data: servicesStatus, refetch: refetchServicesStatus } = useQuery({
    queryKey: ['shadow', 'services-status'],
    queryFn: fetchServicesStatus,
    refetchInterval: 10000,
  });

  const { data: serviceModeData, refetch: refetchServiceMode } = useQuery({
    queryKey: ['shadow', 'service-mode'],
    queryFn: fetchServiceMode,
    refetchInterval: 30000,
  });

  const { data: metricsData, refetch: refetchMetrics } = useQuery({
    queryKey: ['shadow', 'metrics', metricsDays],
    queryFn: () => fetchMetrics(metricsDays),
    refetchInterval: 30000,
  });

  const changeModeMutation = useMutation({
    mutationFn: setServiceMode,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shadow'] });
    },
  });

  const handleModeChange = async (newMode: ServiceModeType) => {
    if (isChangingMode || serviceModeData?.mode === newMode) return;
    const msg = newMode === 'fastapi'
      ? '⚠️ FastAPI 모드로 전환하시겠습니까?\nn8n을 거치지 않고 FastAPI로 직접 처리됩니다.'
      : `${newMode} 모드로 전환하시겠습니까?`;
    if (!confirm(msg)) return;
    setIsChangingMode(true);
    try {
      await changeModeMutation.mutateAsync(newMode);
      refetchServiceMode();
      refetchStats();
    } catch {
      alert('모드 변경 실패');
    } finally {
      setIsChangingMode(false);
    }
  };

  const handleRefresh = () => {
    refetchStats();
    refetchMismatches();
    refetchServicesStatus();
    refetchServiceMode();
    refetchMetrics();
  };

  const mismatches = mismatchesData?.mismatches || [];
  const openCount = mismatches.filter(m => m.status === 'open').length;

  return (
    <div className="shadow-page">
      {/* 헤더 */}
      <header className="shadow-page__header">
        <div className="shadow-page__header-left">
          <h1 className="shadow-page__title">Shadow Monitor</h1>
          <div className="shadow-page__services">
            {servicesStatus?.services.map(s => (
              <div key={s.name} className={`shadow-page__service shadow-page__service--${s.status}`}>
                <span className="shadow-page__service-dot" />
                <span className="shadow-page__service-name">{s.name}</span>
                {s.latency_ms && <span className="shadow-page__service-latency">{s.latency_ms}ms</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="shadow-page__header-right">
          <span className="shadow-page__refresh-text">자동 갱신 30초</span>
          <Button variant="secondary" size="sm" onClick={handleRefresh}>새로고침</Button>
        </div>
      </header>

      {/* 서비스 모드 컨트롤 */}
      <section className="shadow-page__mode-section">
        <div className="shadow-page__mode-control">
          <div className="shadow-page__mode-desc">
            n8n(기존)에서 FastAPI(신규)로 마이그레이션 진행중입니다. 병렬 비교 모드에서 두 시스템의 응답을 비교합니다.
          </div>
          <div className="shadow-page__mode-buttons">
            {(['n8n', 'fastapi', 'shadow'] as ServiceModeType[]).map(m => {
              const isActive = serviceModeData?.mode === m;
              const labels: Record<ServiceModeType, { name: string; desc: string }> = {
                n8n: { name: 'n8n', desc: '기존 시스템' },
                fastapi: { name: 'FastAPI', desc: '신규 시스템' },
                shadow: { name: '병렬 비교', desc: 'n8n + FastAPI' },
              };
              return (
                <button
                  type="button"
                  key={m}
                  className={`shadow-page__mode-btn shadow-page__mode-btn--${m} ${isActive ? 'shadow-page__mode-btn--active' : ''}`}
                  onClick={() => handleModeChange(m)}
                  disabled={isChangingMode}
                >
                  <div className="shadow-page__mode-btn-content">
                    <span className="shadow-page__mode-btn-label">{labels[m].name}</span>
                    <span className="shadow-page__mode-btn-sub">{labels[m].desc}</span>
                  </div>
                  {isActive && <span className="shadow-page__mode-btn-badge">운영중</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* 전환 준비 상태 */}
        {stats?.switch_readiness && (
          <div className={`shadow-page__readiness ${stats.switch_readiness.ready ? 'shadow-page__readiness--ready' : 'shadow-page__readiness--warn'}`}>
            <div className="shadow-page__readiness-header">
              <span className="shadow-page__readiness-icon">{stats.switch_readiness.ready ? '✓' : '!'}</span>
              <span className="shadow-page__readiness-title">{stats.switch_readiness.ready ? 'FastAPI 전환 가능' : '검증 필요'}</span>
            </div>
            <div className="shadow-page__readiness-checks">
              {Object.entries(stats.switch_readiness.checks).map(([key, check]) => (
                <div key={key} className={`shadow-page__check ${check.passed ? 'shadow-page__check--pass' : 'shadow-page__check--fail'}`}>
                  <span className="shadow-page__check-icon">{check.passed ? '✓' : '✗'}</span>
                  <span className="shadow-page__check-label">{key}</span>
                  <span className="shadow-page__check-value">{check.actual} / {check.required}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 메인 그리드 - 2열 */}
      <div className="shadow-page__grid">
        {/* 왼쪽: 통계 + 성능 */}
        <div className="shadow-page__col">
          {/* Shadow 통계 */}
          {stats?.summary && (
            <section className="shadow-page__card">
              <div className="shadow-page__card-header">
                <h3>Shadow 통계</h3>
                <span className="shadow-page__card-period">최근 7일</span>
              </div>
              <div className="shadow-page__stats">
                <div className="shadow-page__stat">
                  <span className="shadow-page__stat-value">{stats.summary.total_calls.toLocaleString()}</span>
                  <span className="shadow-page__stat-label">총 호출</span>
                </div>
                <div className="shadow-page__stat shadow-page__stat--success">
                  <span className="shadow-page__stat-value">{stats.summary.match_rate}%</span>
                  <span className="shadow-page__stat-label">Match Rate</span>
                </div>
                <div className="shadow-page__stat shadow-page__stat--warn">
                  <span className="shadow-page__stat-value">{stats.summary.mismatch}</span>
                  <span className="shadow-page__stat-label">Mismatch</span>
                </div>
                <div className="shadow-page__stat shadow-page__stat--error">
                  <span className="shadow-page__stat-value">{stats.summary.error}</span>
                  <span className="shadow-page__stat-label">Error</span>
                </div>
              </div>
              {stats.shadow_mode.last_call_time && (
                <div className="shadow-page__last-call">
                  마지막 호출: {formatRelativeTime(stats.shadow_mode.last_call_time)}
                </div>
              )}
            </section>
          )}

          {/* 성능 비교 */}
          <section className="shadow-page__card shadow-page__card--perf">
            <div className="shadow-page__card-header">
              <h3>성능 비교</h3>
              <select
                value={metricsDays}
                onChange={e => setMetricsDays(Number(e.target.value))}
                className="shadow-page__select"
                title="조회 기간 선택"
              >
                <option value={1}>1일</option>
                <option value={7}>7일</option>
                <option value={30}>30일</option>
              </select>
            </div>
            {metricsData?.comparison ? (
              <div className="shadow-page__perf">
                <div className="shadow-page__perf-summary">
                  <div className={`shadow-page__perf-winner ${metricsData.comparison.faster_service === 'fastapi' ? 'shadow-page__perf-winner--fastapi' : ''}`}>
                    {metricsData.comparison.faster_service === 'fastapi' ? '⚡ FastAPI' : '🔧 n8n'}
                    {metricsData.comparison.improvement_pct > 0 && (
                      <span className="shadow-page__perf-improvement">+{metricsData.comparison.improvement_pct}% 빠름</span>
                    )}
                  </div>
                  <div className="shadow-page__perf-total">{metricsData.summary.total_calls.toLocaleString()}건 분석</div>
                </div>

                <div className="shadow-page__perf-bars">
                  <div className="shadow-page__perf-bar">
                    <div className="shadow-page__perf-bar-header">
                      <span>n8n</span>
                      <span>{metricsData.comparison.n8n_avg_ms}ms</span>
                    </div>
                    <div className="shadow-page__perf-bar-track">
                      <div
                        className="shadow-page__perf-bar-fill shadow-page__perf-bar-fill--n8n"
                        style={{ width: `${Math.min(100, (metricsData.comparison.n8n_avg_ms / Math.max(metricsData.comparison.n8n_avg_ms, metricsData.comparison.fastapi_avg_ms)) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="shadow-page__perf-bar">
                    <div className="shadow-page__perf-bar-header">
                      <span>FastAPI</span>
                      <span>{metricsData.comparison.fastapi_avg_ms}ms</span>
                    </div>
                    <div className="shadow-page__perf-bar-track">
                      <div
                        className="shadow-page__perf-bar-fill shadow-page__perf-bar-fill--fastapi"
                        style={{ width: `${Math.min(100, (metricsData.comparison.fastapi_avg_ms / Math.max(metricsData.comparison.n8n_avg_ms, metricsData.comparison.fastapi_avg_ms)) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="shadow-page__perf-errors">
                  <span>n8n 에러율: {metricsData.summary.n8n.error_rate}%</span>
                  <span>FastAPI 에러율: {metricsData.summary.fastapi.error_rate}%</span>
                </div>
              </div>
            ) : (
              <div className="shadow-page__empty">성능 데이터가 없습니다</div>
            )}
          </section>
        </div>

        {/* 오른쪽: 워크플로우별 + 불일치 */}
        <div className="shadow-page__col">
          {/* 워크플로우별 성능 */}
          {metricsData?.by_workflow && Object.keys(metricsData.by_workflow).length > 0 && (
            <section className="shadow-page__card">
              <div className="shadow-page__card-header">
                <h3>워크플로우별 성능</h3>
              </div>
              <div className="shadow-page__table-wrap">
                <table className="shadow-page__table">
                  <thead>
                    <tr>
                      <th>Workflow</th>
                      <th>호출</th>
                      <th>n8n</th>
                      <th>FastAPI</th>
                      <th>개선율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(metricsData.by_workflow).map(([wf, data]) => (
                      <tr key={wf}>
                        <td><code>{wf}</code></td>
                        <td>{data.call_count}</td>
                        <td>{data.n8n_avg_ms}ms</td>
                        <td>{data.fastapi_avg_ms}ms</td>
                        <td className={data.improvement_pct > 0 ? 'shadow-page__cell--success' : data.improvement_pct < 0 ? 'shadow-page__cell--error' : ''}>
                          {data.improvement_pct > 0 ? '+' : ''}{data.improvement_pct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 불일치 목록 */}
          <section className="shadow-page__card shadow-page__card--mismatches">
            <div className="shadow-page__card-header">
              <h3>
                불일치 목록
                {openCount > 0 && <span className="shadow-page__badge">{openCount}</span>}
              </h3>
            </div>
            <div className="shadow-page__mismatch-list">
              {mismatches.length === 0 ? (
                <div className="shadow-page__empty shadow-page__empty--success">
                  <span>✓</span> 불일치가 없습니다
                </div>
              ) : (
                mismatches.map((m, i) => (
                  <div
                    key={m.id}
                    className={`shadow-page__mismatch ${m.status === 'resolved' ? 'shadow-page__mismatch--resolved' : ''}`}
                    onClick={() => setSelectedMismatch({ ...m, _index: i + 1 })}
                  >
                    <div className="shadow-page__mismatch-main">
                      <span className="shadow-page__mismatch-num">#{i + 1}</span>
                      <code className="shadow-page__mismatch-workflow">{m.workflow}</code>
                      <span className={`shadow-page__mismatch-status shadow-page__mismatch-status--${m.status}`}>
                        {m.status === 'open' ? 'Open' : 'Resolved'}
                      </span>
                    </div>
                    <div className="shadow-page__mismatch-meta">
                      <span>{m.diffs.length}개 차이</span>
                      <span>{formatRelativeTime(m.timestamp)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      {/* 불일치 상세 모달 */}
      {selectedMismatch && (
        <div className="shadow-page__overlay" onClick={() => setSelectedMismatch(null)}>
          <div className="shadow-page__modal" onClick={e => e.stopPropagation()}>
            <div className="shadow-page__modal-header">
              <h3>#{selectedMismatch._index} {selectedMismatch.workflow}</h3>
              <button type="button" className="shadow-page__modal-close" onClick={() => setSelectedMismatch(null)}>✕</button>
            </div>
            <div className="shadow-page__modal-body">
              <div className="shadow-page__modal-meta">
                <span>ID: {selectedMismatch.id}</span>
                <span>상태: {selectedMismatch.status}</span>
                <span>시간: {formatRelativeTime(selectedMismatch.timestamp)}</span>
              </div>
              <div className="shadow-page__diffs">
                {selectedMismatch.diffs.map((d, i) => (
                  <div key={i} className="shadow-page__diff">
                    <div className="shadow-page__diff-header">
                      <code>{d.path}</code>
                      <span className={`shadow-page__diff-type shadow-page__diff-type--${d.diff_type}`}>{d.diff_type}</span>
                    </div>
                    <div className="shadow-page__diff-values">
                      <div className="shadow-page__diff-col">
                        <span className="shadow-page__diff-label">n8n</span>
                        <code>{d.n8n_value ?? 'null'}</code>
                      </div>
                      <div className="shadow-page__diff-col">
                        <span className="shadow-page__diff-label">FastAPI</span>
                        <code>{d.fastapi_value ?? 'null'}</code>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
