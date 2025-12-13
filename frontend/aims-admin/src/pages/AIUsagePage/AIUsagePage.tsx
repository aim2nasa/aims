/**
 * AI Usage Admin Page
 * @since 2025-12-13
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { aiUsageApi, formatTokens, formatCost } from '@/features/dashboard/aiUsageApi';
import type { HourlyUsagePoint } from '@/features/dashboard/aiUsageApi';
import { StatCard } from '@/shared/ui/StatCard/StatCard';
import { Button } from '@/shared/ui/Button/Button';
import './AIUsagePage.css';

const PERIOD_OPTIONS = [
  { value: 7, label: '7일' },
  { value: 14, label: '14일' },
  { value: 30, label: '30일' },
];

const CHART_PERIOD_OPTIONS = [
  { value: 1, label: '1h', hours: 1 },
  { value: 6, label: '6h', hours: 6 },
  { value: 24, label: '1d', hours: 24 },
  { value: 72, label: '3d', hours: 72 },
  { value: 168, label: '7d', hours: 168 },
];

// 시간 포맷팅
const formatTime = (timestamp: string) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const formatTooltipTime = (timestamp: string) => {
  const date = new Date(timestamp);
  return date.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload || !label) return null;

  return (
    <div className="ai-usage-page__tooltip">
      <p className="ai-usage-page__tooltip-time">{formatTooltipTime(label)}</p>
      {payload.map((entry, index) => (
        <p key={index} className="ai-usage-page__tooltip-item" style={{ color: entry.color }}>
          {entry.name}: {formatTokens(entry.value)}
        </p>
      ))}
    </div>
  );
};

export const AIUsagePage = () => {
  const [days, setDays] = useState(30);
  const [chartHours, setChartHours] = useState(24);

  const { data: overview, isLoading: overviewLoading, isError: overviewError, refetch: refetchOverview } = useQuery({
    queryKey: ['admin', 'ai-usage', 'overview', days],
    queryFn: () => aiUsageApi.getOverview(days),
    refetchInterval: 120000, // 2분
  });

  const { data: hourlyUsage } = useQuery({
    queryKey: ['admin', 'ai-usage', 'hourly', chartHours],
    queryFn: () => aiUsageApi.getHourlyUsage(chartHours),
    refetchInterval: 120000, // 2분
  });

  const { data: topUsers } = useQuery({
    queryKey: ['admin', 'ai-usage', 'top-users', days],
    queryFn: () => aiUsageApi.getTopUsers(days),
    refetchInterval: 300000, // 5분 (변화가 느린 데이터)
  });

  if (overviewLoading) {
    return <div className="ai-usage-page__loading">데이터를 불러오는 중...</div>;
  }

  if (overviewError) {
    return (
      <div className="ai-usage-page__error">
        <p>데이터를 불러오는데 실패했습니다.</p>
        <Button onClick={() => refetchOverview()}>다시 시도</Button>
      </div>
    );
  }

  // 소스별 퍼센트 계산
  const totalBySource = (overview?.by_source?.rag_api || 0) + (overview?.by_source?.n8n_docsummary || 0);
  const ragPercent = totalBySource > 0 ? ((overview?.by_source?.rag_api || 0) / totalBySource * 100).toFixed(1) : '0';
  const n8nPercent = totalBySource > 0 ? ((overview?.by_source?.n8n_docsummary || 0) / totalBySource * 100).toFixed(1) : '0';

  return (
    <div className="ai-usage-page">
      <div className="ai-usage-page__header">
        <h1 className="ai-usage-page__title">AI 사용량 현황</h1>
        <div className="ai-usage-page__period-selector">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`ai-usage-page__period-btn ${days === opt.value ? 'ai-usage-page__period-btn--active' : ''}`}
              onClick={() => setDays(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 전체 통계 */}
      <section className="ai-usage-page__section">
        <h2 className="ai-usage-page__section-title">전체 통계</h2>
        <div className="ai-usage-page__stats-grid">
          <StatCard
            title="총 토큰"
            value={formatTokens(overview?.total_tokens || 0)}
            subtitle={`프롬프트: ${formatTokens(overview?.prompt_tokens || 0)} / 완성: ${formatTokens(overview?.completion_tokens || 0)}`}
          />
          <StatCard
            title="예상 비용"
            value={formatCost(overview?.estimated_cost_usd || 0)}
            subtitle={`최근 ${days}일`}
          />
          <StatCard
            title="요청 수"
            value={(overview?.request_count || 0).toLocaleString()}
            subtitle="API 호출"
          />
          <StatCard
            title="활성 사용자"
            value={overview?.unique_users || 0}
            subtitle="AI 사용"
          />
        </div>
      </section>

      {/* 소스별 분포 */}
      <section className="ai-usage-page__section">
        <h2 className="ai-usage-page__section-title">소스별 사용량</h2>
        <div className="ai-usage-page__source-grid">
          <div className="source-card source-card--rag">
            <span className="source-card__label">RAG API</span>
            <span className="source-card__value">
              {formatTokens(overview?.by_source?.rag_api || 0)}
            </span>
            <span className="source-card__percent">{ragPercent}%</span>
          </div>
          <div className="source-card source-card--n8n">
            <span className="source-card__label">n8n DocSummary</span>
            <span className="source-card__value">
              {formatTokens(overview?.by_source?.n8n_docsummary || 0)}
            </span>
            <span className="source-card__percent">{n8nPercent}%</span>
          </div>
        </div>
      </section>

      {/* 시간별 라인 차트 */}
      <section className="ai-usage-page__section">
        <div className="ai-usage-page__chart-header">
          <h2 className="ai-usage-page__section-title">사용량 추이</h2>
          <div className="ai-usage-page__chart-period">
            {CHART_PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`ai-usage-page__chart-period-btn ${chartHours === opt.hours ? 'ai-usage-page__chart-period-btn--active' : ''}`}
                onClick={() => setChartHours(opt.hours)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="ai-usage-page__line-chart-container">
          {!hourlyUsage || hourlyUsage.length === 0 ? (
            <div className="ai-usage-page__chart-empty">사용 데이터가 없습니다</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={hourlyUsage} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatTime}
                  tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }}
                  stroke="var(--color-border)"
                  interval="preserveStartEnd"
                  minTickGap={50}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }}
                  stroke="var(--color-border)"
                  tickFormatter={(value) => formatTokens(value)}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '11px' }}
                  iconType="plainline"
                />
                <Line
                  type="monotone"
                  dataKey="rag_api"
                  name="RAG API"
                  stroke="#007AFF"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="n8n_docsummary"
                  name="DocSummary"
                  stroke="#34C759"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Top 사용자 */}
      <section className="ai-usage-page__section">
        <h2 className="ai-usage-page__section-title">Top 10 사용자</h2>
        <div className="ai-usage-page__table-container">
          <table className="ai-usage-page__table">
            <thead>
              <tr>
                <th>#</th>
                <th>사용자</th>
                <th>토큰</th>
                <th>요청 수</th>
                <th>예상 비용</th>
              </tr>
            </thead>
            <tbody>
              {!topUsers || topUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="ai-usage-page__table-empty">
                    사용자 데이터가 없습니다
                  </td>
                </tr>
              ) : (
                topUsers.map((user, index) => (
                  <tr key={user.user_id}>
                    <td className="ai-usage-page__table-rank">{index + 1}</td>
                    <td className="ai-usage-page__table-user">
                      <span className="ai-usage-page__user-name">{user.user_name}</span>
                      <span className="ai-usage-page__user-id">({user.user_id})</span>
                    </td>
                    <td className="ai-usage-page__table-tokens">
                      {formatTokens(user.total_tokens)}
                    </td>
                    <td>{user.request_count.toLocaleString()}</td>
                    <td className="ai-usage-page__table-cost">
                      {formatCost(user.estimated_cost_usd)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
