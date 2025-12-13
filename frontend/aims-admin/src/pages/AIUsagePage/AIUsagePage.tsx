/**
 * AI Usage Admin Page
 * @since 2025-12-13
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { aiUsageApi, formatTokens, formatCost } from '@/features/dashboard/aiUsageApi';
import { StatCard } from '@/shared/ui/StatCard/StatCard';
import { Button } from '@/shared/ui/Button/Button';
import './AIUsagePage.css';

const PERIOD_OPTIONS = [
  { value: 7, label: '7일' },
  { value: 14, label: '14일' },
  { value: 30, label: '30일' },
];

export const AIUsagePage = () => {
  const [days, setDays] = useState(30);

  const { data: overview, isLoading: overviewLoading, isError: overviewError, refetch: refetchOverview } = useQuery({
    queryKey: ['admin', 'ai-usage', 'overview', days],
    queryFn: () => aiUsageApi.getOverview(days),
    refetchInterval: 60000,
  });

  const { data: dailyUsage, isLoading: dailyLoading } = useQuery({
    queryKey: ['admin', 'ai-usage', 'daily', days],
    queryFn: () => aiUsageApi.getDailyUsage(days),
    refetchInterval: 60000,
  });

  const { data: topUsers, isLoading: topUsersLoading } = useQuery({
    queryKey: ['admin', 'ai-usage', 'top-users', days],
    queryFn: () => aiUsageApi.getTopUsers(days),
    refetchInterval: 60000,
  });

  const isLoading = overviewLoading || dailyLoading || topUsersLoading;

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

  // 차트 최대값 계산
  const maxTokens = dailyUsage && dailyUsage.length > 0
    ? Math.max(...dailyUsage.map(d => d.total_tokens), 1)
    : 1;

  // 날짜 포맷팅 (MM.DD)
  const formatDate = (dateStr: string): string => {
    const parts = dateStr.split('-');
    if (parts.length >= 3) {
      return `${parts[1]}.${parts[2]}`;
    }
    return dateStr;
  };

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

      {/* 일별 차트 */}
      <section className="ai-usage-page__section">
        <h2 className="ai-usage-page__section-title">일별 사용량 추이</h2>
        <div className="ai-usage-page__chart-container">
          {!dailyUsage || dailyUsage.length === 0 ? (
            <div className="ai-usage-page__chart-empty">사용 데이터가 없습니다</div>
          ) : (
            <div className="ai-usage-page__chart">
              <div className="ai-usage-page__chart-bars">
                {dailyUsage.map((point, index) => {
                  const barHeight = (point.total_tokens / maxTokens) * 100;
                  return (
                    <div key={index} className="ai-usage-page__chart-bar-wrapper">
                      <div
                        className="ai-usage-page__chart-bar"
                        style={{ height: `${barHeight}%` }}
                        title={`${point.date}\n토큰: ${formatTokens(point.total_tokens)}\n비용: ${formatCost(point.estimated_cost_usd)}\n요청: ${point.request_count}회`}
                      />
                      <span className="ai-usage-page__chart-label">
                        {formatDate(point.date)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
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
                <th>사용자 ID</th>
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
                    <td>{user.user_id}</td>
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
