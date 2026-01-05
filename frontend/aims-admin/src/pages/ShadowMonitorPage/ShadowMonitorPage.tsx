/**
 * Shadow Monitor Page - n8n/FastAPI 마이그레이션 모니터링
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/shared/ui/Button/Button';
import './ShadowMonitorPage.css';

// 개발환경: Vite 프록시 → Tailscale VPN (100.110.215.65:8100)
// 프로덕션: nginx /shadow/ → localhost:8100 프록시
const PIPELINE_API_URL = '';

interface ShadowStats {
  shadow_mode: {
    enabled: boolean;
    first_call_time: string | null;
    last_call_time: string | null;
    total_calls_all_time: number;
    status_interpretation: string;
  };
  period: {
    days: number;
    since: string;
    until: string;
  };
  summary: {
    total_calls: number;
    match: number;
    mismatch: number;
    error: number;
    match_rate: number;
    mismatch_rate: number;
    error_rate: number;
  };
  by_workflow: Record<string, {
    match: number;
    mismatch: number;
    error: number;
    total: number;
    match_rate: number;
  }>;
  recent_mismatches: Array<{
    id: string;
    workflow: string;
    timestamp: string;
    diff_count: number;
    status: string;
    has_analysis: boolean;
  }>;
  switch_readiness: {
    ready: boolean;
    criteria: Record<string, number>;
    checks: Record<string, { required: string | number; actual: string | number; passed: boolean }>;
    recommendation: string;
  };
}

interface Mismatch {
  id: string;
  workflow: string;
  timestamp: string;
  diffs: Array<{
    path: string;
    n8n_value: string | null;
    fastapi_value: string | null;
    diff_type: string;
  }>;
  status: string;
  analysis: unknown;
  resolution: string | null;
  _index?: number;  // UI에서 사용하는 번호
}

const fetchStats = async (days: number): Promise<ShadowStats> => {
  const response = await fetch(`${PIPELINE_API_URL}/shadow/stats?days=${days}`);
  if (!response.ok) throw new Error('Failed to fetch stats');
  return response.json();
};

const fetchMismatches = async (): Promise<{ count: number; mismatches: Mismatch[] }> => {
  const response = await fetch(`${PIPELINE_API_URL}/shadow/mismatches?limit=50`);
  if (!response.ok) throw new Error('Failed to fetch mismatches');
  return response.json();
};

const deleteResolvedMismatches = async (): Promise<{ deleted_count: number; message: string }> => {
  const response = await fetch(`${PIPELINE_API_URL}/shadow/mismatches/resolved`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete resolved mismatches');
  return response.json();
};

const resetShadowStats = async (): Promise<{ message: string }> => {
  const response = await fetch(`${PIPELINE_API_URL}/shadow/stats/reset`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to reset stats');
  return response.json();
};

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'unhealthy' | 'timeout' | 'error';
  latency_ms?: number;
  error?: string;
  details?: Record<string, unknown>;
}

interface ServicesStatusResponse {
  timestamp: string;
  services: ServiceStatus[];
}

const fetchServicesStatus = async (): Promise<ServicesStatusResponse> => {
  const response = await fetch(`${PIPELINE_API_URL}/shadow/services-status`);
  if (!response.ok) throw new Error('Failed to fetch services status');
  return response.json();
};

/**
 * KST 시간 포맷: YYYY.MM.DD HH:mm:ss (24시간제)
 * 서버 timestamp가 UTC인 경우 KST(+9시간)로 변환하여 표시
 */
const formatKSTDateTime = (isoString: string): string => {
  // 서버 timestamp를 UTC로 명시적 파싱 (timezone offset이 없으면 UTC로 간주)
  const utcString = isoString.endsWith('Z') || isoString.includes('+') || isoString.includes('-', 10)
    ? isoString
    : isoString + 'Z';
  const date = new Date(utcString);

  // KST (UTC+9) 포맷으로 변환
  const kstFormatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = kstFormatter.formatToParts(date);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';

  return `${getPart('year')}.${getPart('month')}.${getPart('day')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
};

/**
 * 상대 시간 표시 (KST 기준)
 * 서버 timestamp가 UTC인 경우 'Z' suffix가 없으면 추가하여 UTC로 파싱
 */
const formatRelativeTime = (isoString: string): string => {
  // 서버 timestamp를 UTC로 명시적 파싱 (timezone offset이 없으면 UTC로 간주)
  const utcString = isoString.endsWith('Z') || isoString.includes('+') || isoString.includes('-', 10)
    ? isoString
    : isoString + 'Z';
  const date = new Date(utcString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '방금 전';
  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  return `${diffDays}일 전`;
};

export const ShadowMonitorPage = () => {
  const [days, setDays] = useState(7);
  const [selectedMismatch, setSelectedMismatch] = useState<Mismatch | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Claude에게 보낼 프롬프트 생성
  const generateClaudePrompt = (mismatch: Mismatch): string => {
    const diffsText = mismatch.diffs.map(diff =>
      `- Path: ${diff.path}
  Type: ${diff.diff_type}
  n8n 값: ${JSON.stringify(diff.n8n_value, null, 2)}
  FastAPI 값: ${JSON.stringify(diff.fastapi_value, null, 2)}`
    ).join('\n\n');

    return `## Shadow Mode Mismatch 분석 요청

**Workflow**: ${mismatch.workflow}
**Timestamp**: ${mismatch.timestamp}
**Mismatch ID**: ${mismatch.id}

### 차이점 (${mismatch.diffs.length}개)

${diffsText}

---

위 n8n과 FastAPI 응답의 차이점을 분석해주세요.
1. 차이가 발생한 원인이 무엇인가요?
2. FastAPI 코드를 수정해서 n8n과 동일한 응답을 반환하도록 해주세요.
3. 해당 워크플로우의 FastAPI 라우터 파일을 확인하고 수정 코드를 제시해주세요.

관련 파일 경로: backend/api/document_pipeline/routers/`;
  };

  const copyToClipboard = async (mismatch: Mismatch) => {
    const prompt = generateClaudePrompt(mismatch);
    try {
      await navigator.clipboard.writeText(prompt);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useQuery({
    queryKey: ['shadow', 'stats', days],
    queryFn: () => fetchStats(days),
    refetchInterval: 30000,
  });

  const { data: mismatchesData, isLoading: mismatchesLoading, refetch: refetchMismatches } = useQuery({
    queryKey: ['shadow', 'mismatches'],
    queryFn: fetchMismatches,
    refetchInterval: 30000,
  });

  const { data: servicesStatus, refetch: refetchServicesStatus } = useQuery({
    queryKey: ['shadow', 'services-status'],
    queryFn: fetchServicesStatus,
    refetchInterval: 10000, // 10초마다 서비스 상태 확인
  });

  const handleRefresh = () => {
    refetchStats();
    refetchMismatches();
    refetchServicesStatus();
  };

  const handleDeleteResolved = async () => {
    const resolvedCount = mismatches.filter(m => m.status === 'resolved').length;
    if (resolvedCount === 0) {
      alert('삭제할 Resolved 항목이 없습니다.');
      return;
    }

    if (!confirm(`${resolvedCount}건의 Resolved 기록을 삭제하시겠습니까?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const result = await deleteResolvedMismatches();
      alert(result.message);
      refetchMismatches();
    } catch (err) {
      alert('삭제에 실패했습니다.');
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleResetStats = async () => {
    if (!confirm('모든 Shadow Mode 통계를 초기화하시겠습니까?\n(호출 기록, 불일치 기록, 오류 기록이 모두 삭제됩니다)')) {
      return;
    }

    setIsResetting(true);
    try {
      const result = await resetShadowStats();
      alert(result.message);
      refetchStats();
      refetchMismatches();
    } catch (err) {
      alert('초기화에 실패했습니다.');
      console.error(err);
    } finally {
      setIsResetting(false);
    }
  };

  if (statsLoading) {
    return <div className="shadow-monitor__loading">로딩 중...</div>;
  }

  if (statsError) {
    return (
      <div className="shadow-monitor__error">
        <p>데이터를 불러오는데 실패했습니다.</p>
        <Button onClick={handleRefresh}>다시 시도</Button>
      </div>
    );
  }

  const mismatches = mismatchesData?.mismatches || [];

  return (
    <div className="shadow-monitor">
      <div className="shadow-monitor__header">
        <h1 className="shadow-monitor__title">Shadow Mode 모니터</h1>
        <div className="shadow-monitor__actions">
          <span className="shadow-monitor__refresh-info">30초마다 자동 갱신</span>
          <Button variant="secondary" size="sm" onClick={handleRefresh}>
            새로고침
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetStats}
            disabled={isResetting}
          >
            {isResetting ? '초기화 중...' : '통계 초기화'}
          </Button>
        </div>
      </div>

      {/* 서비스 상태 */}
      {servicesStatus && (
        <section className="shadow-monitor__section">
          <h2 className="shadow-monitor__section-title">서비스 상태</h2>
          <div className="shadow-monitor__services">
            {servicesStatus.services.map((service) => (
              <div
                key={service.name}
                className={`shadow-monitor__service shadow-monitor__service--${service.status}`}
              >
                <div className="shadow-monitor__service-header">
                  <span className={`shadow-monitor__service-dot shadow-monitor__service-dot--${service.status}`}></span>
                  <span className="shadow-monitor__service-name">{service.name}</span>
                  <span className={`shadow-monitor__service-badge shadow-monitor__service-badge--${service.status}`}>
                    {service.status === 'healthy' ? '정상' :
                     service.status === 'unhealthy' ? '비정상' :
                     service.status === 'timeout' ? '타임아웃' : '오류'}
                  </span>
                </div>
                <div className="shadow-monitor__service-details">
                  {service.latency_ms !== undefined && (
                    <span className="shadow-monitor__service-latency">
                      응답시간: {service.latency_ms}ms
                    </span>
                  )}
                  {service.error && (
                    <span className="shadow-monitor__service-error">
                      {service.error}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Shadow Mode 상태 */}
      {stats?.shadow_mode && (
        <section className="shadow-monitor__section">
          <div className={`shadow-monitor__status ${stats.shadow_mode.enabled ? 'shadow-monitor__status--enabled' : 'shadow-monitor__status--disabled'}`}>
            <div className="shadow-monitor__status-indicator">
              <span className={`shadow-monitor__status-dot ${stats.shadow_mode.enabled ? 'shadow-monitor__status-dot--enabled' : 'shadow-monitor__status-dot--disabled'}`}></span>
              <span className="shadow-monitor__status-label">
                Shadow Mode: {stats.shadow_mode.enabled ? '활성화' : '비활성화'}
              </span>
            </div>
            <div className="shadow-monitor__status-interpretation">
              {stats.shadow_mode.status_interpretation}
            </div>
            <div className="shadow-monitor__status-times">
              <span>
                <strong>전체 호출:</strong> {stats.shadow_mode.total_calls_all_time.toLocaleString()}건
              </span>
              {stats.shadow_mode.first_call_time && (
                <span>
                  <strong>첫 호출:</strong> {formatKSTDateTime(stats.shadow_mode.first_call_time)}
                </span>
              )}
              {stats.shadow_mode.last_call_time && (
                <span>
                  <strong>마지막 호출:</strong> {formatRelativeTime(stats.shadow_mode.last_call_time)} ({formatKSTDateTime(stats.shadow_mode.last_call_time)})
                </span>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 전환 준비 상태 */}
      {stats?.switch_readiness && (
        <section className="shadow-monitor__section">
          <div className={`shadow-monitor__readiness ${stats.switch_readiness.ready ? 'shadow-monitor__readiness--ready' : 'shadow-monitor__readiness--not-ready'}`}>
            <div className="shadow-monitor__readiness-status">
              <span className="shadow-monitor__readiness-icon">
                {stats.switch_readiness.ready ? '✓' : '!'}
              </span>
              <div className="shadow-monitor__readiness-text">
                <span className="shadow-monitor__readiness-title">
                  {stats.switch_readiness.ready ? 'FastAPI 전환 가능' : '추가 검증 필요'}
                </span>
                <span className="shadow-monitor__readiness-subtitle">
                  {stats.switch_readiness.recommendation}
                </span>
              </div>
            </div>
            <div className="shadow-monitor__checks">
              {Object.entries(stats.switch_readiness.checks).map(([key, check]) => (
                <div key={key} className={`shadow-monitor__check ${check.passed ? 'shadow-monitor__check--passed' : 'shadow-monitor__check--failed'}`}>
                  <span className="shadow-monitor__check-icon">{check.passed ? '✓' : '✗'}</span>
                  <span className="shadow-monitor__check-label">{key}</span>
                  <span className="shadow-monitor__check-value">
                    {String(check.actual)} / {String(check.required)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 통계 요약 */}
      {stats?.summary && (
        <section className="shadow-monitor__section">
          <div className="shadow-monitor__section-header">
            <h2 className="shadow-monitor__section-title">통계 요약</h2>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="shadow-monitor__days-select"
            >
              <option value={7}>최근 7일</option>
              <option value={14}>최근 14일</option>
              <option value={30}>최근 30일</option>
            </select>
          </div>
          <div className="shadow-monitor__stats-grid">
            <div className="shadow-monitor__stat">
              <span className="shadow-monitor__stat-value">{stats.summary.total_calls}</span>
              <span className="shadow-monitor__stat-label">총 호출</span>
            </div>
            <div className="shadow-monitor__stat shadow-monitor__stat--success">
              <span className="shadow-monitor__stat-value">{stats.summary.match_rate}%</span>
              <span className="shadow-monitor__stat-label">Match Rate</span>
            </div>
            <div className="shadow-monitor__stat shadow-monitor__stat--warning">
              <span className="shadow-monitor__stat-value">{stats.summary.mismatch}</span>
              <span className="shadow-monitor__stat-label">Mismatch</span>
            </div>
            <div className="shadow-monitor__stat shadow-monitor__stat--error">
              <span className="shadow-monitor__stat-value">{stats.summary.error}</span>
              <span className="shadow-monitor__stat-label">Error</span>
            </div>
          </div>
        </section>
      )}

      {/* 워크플로우별 현황 */}
      {stats?.by_workflow && Object.keys(stats.by_workflow).length > 0 && (
        <section className="shadow-monitor__section">
          <h2 className="shadow-monitor__section-title">워크플로우별 현황</h2>
          <table className="shadow-monitor__table">
            <thead>
              <tr>
                <th>Workflow</th>
                <th>Total</th>
                <th>Match</th>
                <th>Mismatch</th>
                <th>Error</th>
                <th>Match Rate</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(stats.by_workflow).map(([workflow, data]) => (
                <tr key={workflow}>
                  <td><code>{workflow}</code></td>
                  <td>{data.total}</td>
                  <td className="shadow-monitor__cell--success">{data.match}</td>
                  <td className="shadow-monitor__cell--warning">{data.mismatch}</td>
                  <td className="shadow-monitor__cell--error">{data.error}</td>
                  <td className={data.match_rate >= 99 ? 'shadow-monitor__cell--success' : data.match_rate >= 95 ? 'shadow-monitor__cell--warning' : 'shadow-monitor__cell--error'}>
                    {data.match_rate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* 최근 불일치 */}
      <section className="shadow-monitor__section">
        <div className="shadow-monitor__section-header">
          <h2 className="shadow-monitor__section-title">
            최근 불일치 ({mismatches.filter(m => m.status === 'open').length}건 미해결)
          </h2>
          {mismatches.filter(m => m.status === 'resolved').length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeleteResolved}
              disabled={isDeleting}
            >
              {isDeleting ? '삭제 중...' : `Resolved 정리 (${mismatches.filter(m => m.status === 'resolved').length}건)`}
            </Button>
          )}
        </div>
        {mismatchesLoading ? (
          <div className="shadow-monitor__loading">로딩 중...</div>
        ) : mismatches.length === 0 ? (
          <div className="shadow-monitor__empty">
            <span className="shadow-monitor__empty-icon">✓</span>
            <span>불일치가 없습니다</span>
          </div>
        ) : (
          <div className="shadow-monitor__mismatches">
            {mismatches.map((mismatch, index) => (
              <div
                key={mismatch.id}
                className={`shadow-monitor__mismatch ${mismatch.status === 'resolved' ? 'shadow-monitor__mismatch--resolved' : ''}`}
                onClick={() => setSelectedMismatch({ ...mismatch, _index: index + 1 })}
              >
                <div className="shadow-monitor__mismatch-header">
                  <span className="shadow-monitor__mismatch-number">#{index + 1}</span>
                  <code className="shadow-monitor__mismatch-workflow">{mismatch.workflow}</code>
                  <span className={`shadow-monitor__mismatch-status shadow-monitor__mismatch-status--${mismatch.status}`}>
                    {mismatch.status === 'open' ? 'Open' : mismatch.status === 'resolved' ? 'Resolved' : 'Ignored'}
                  </span>
                </div>
                <div className="shadow-monitor__mismatch-meta">
                  <span>{formatRelativeTime(mismatch.timestamp)}</span>
                  <span>{mismatch.diffs.length}개 차이</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 불일치 상세 모달 */}
      {selectedMismatch && (
        <div className="shadow-monitor__modal-overlay" onClick={() => setSelectedMismatch(null)}>
          <div className="shadow-monitor__modal" onClick={e => e.stopPropagation()}>
            <div className="shadow-monitor__modal-header">
              <h3>#{selectedMismatch._index} {selectedMismatch.workflow}</h3>
              <button className="shadow-monitor__modal-close" onClick={() => setSelectedMismatch(null)}>
                ✕
              </button>
            </div>
            <div className="shadow-monitor__modal-content">
              <div className="shadow-monitor__modal-meta">
                <span>ID: {selectedMismatch.id}</span>
                <span>시간: {formatKSTDateTime(selectedMismatch.timestamp)}</span>
                <span>상태: {selectedMismatch.status}</span>
              </div>
              <h4>차이점 ({selectedMismatch.diffs.length}개)</h4>
              <div className="shadow-monitor__diffs">
                {selectedMismatch.diffs.map((diff, idx) => (
                  <div key={idx} className="shadow-monitor__diff">
                    <div className="shadow-monitor__diff-path">
                      <code>{diff.path}</code>
                      <span className={`shadow-monitor__diff-type shadow-monitor__diff-type--${diff.diff_type}`}>
                        {diff.diff_type}
                      </span>
                    </div>
                    <div className="shadow-monitor__diff-values">
                      <div className="shadow-monitor__diff-n8n">
                        <span className="shadow-monitor__diff-label">n8n:</span>
                        <code>{diff.n8n_value ?? 'null'}</code>
                      </div>
                      <div className="shadow-monitor__diff-fastapi">
                        <span className="shadow-monitor__diff-label">FastAPI:</span>
                        <code>{diff.fastapi_value ?? 'null'}</code>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="shadow-monitor__modal-actions">
                  <Button
                    variant="primary"
                    onClick={() => copyToClipboard(selectedMismatch)}
                  >
                    {copySuccess ? '복사됨!' : 'Claude에게 보내기'}
                  </Button>
                </div>
              {selectedMismatch.status === 'resolved' && (
                <div className="shadow-monitor__resolution">
                  <strong>상태:</strong> Claude가 코드 수정 후 Resolved 처리함
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
