/**
 * OCR Usage Admin Page
 * @since 2025-12-14
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { ocrUsageApi, formatOCRCount } from '@/features/dashboard/ocrUsageApi';
import type { HourlyOCRPoint } from '@/features/dashboard/ocrUsageApi';
import { StatCard } from '@/shared/ui/StatCard/StatCard';
import { Button } from '@/shared/ui/Button/Button';
import { OCRFailedModal } from './OCRFailedModal';
import './OCRUsagePage.css';

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
  payload?: Array<{ value: number; dataKey: string; color: string }>;
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload || !label) return null;

  const doneValue = payload.find(p => p.dataKey === 'done')?.value || 0;
  const errorValue = payload.find(p => p.dataKey === 'error')?.value || 0;

  return (
    <div className="ocr-usage-page__tooltip">
      <p className="ocr-usage-page__tooltip-time">{formatTooltipTime(label)}</p>
      <p className="ocr-usage-page__tooltip-item ocr-usage-page__tooltip-item--done">
        성공: {doneValue.toLocaleString()}건
      </p>
      <p className="ocr-usage-page__tooltip-item ocr-usage-page__tooltip-item--error">
        실패: {errorValue.toLocaleString()}건
      </p>
    </div>
  );
};

export const OCRUsagePage = () => {
  const [days, setDays] = useState(30);
  const [chartHours, setChartHours] = useState(24);
  const [isFailedModalOpen, setIsFailedModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState<string | null>(null);

  const { data: overview, isLoading, isError, refetch: refetchOverview } = useQuery({
    queryKey: ['admin', 'ocr-usage', 'overview', days],
    queryFn: () => ocrUsageApi.getOverview(days),
    refetchInterval: 60000,
  });

  const { data: hourlyUsageRaw, refetch: refetchHourly } = useQuery({
    queryKey: ['admin', 'ocr-usage', 'hourly', chartHours],
    queryFn: () => ocrUsageApi.getHourlyUsage(chartHours),
    refetchInterval: 60000,
  });

  // 다운샘플링
  const maxPoints = 300;
  const hourlyUsage: HourlyOCRPoint[] | undefined = hourlyUsageRaw && hourlyUsageRaw.length > maxPoints
    ? hourlyUsageRaw.filter((_, i) => i % Math.ceil(hourlyUsageRaw.length / maxPoints) === 0)
    : hourlyUsageRaw;

  const { data: topUsers } = useQuery({
    queryKey: ['admin', 'ocr-usage', 'top-users', days],
    queryFn: () => ocrUsageApi.getTopUsers(days),
    refetchInterval: 300000,
  });

  if (isLoading) {
    return <div className="ocr-usage-page__loading">데이터를 불러오는 중...</div>;
  }

  if (isError) {
    return (
      <div className="ocr-usage-page__error">
        <p>데이터를 불러오는데 실패했습니다.</p>
        <Button onClick={() => refetchOverview()}>다시 시도</Button>
      </div>
    );
  }

  const handleRefreshAll = () => {
    refetchOverview();
    refetchHourly();
  };

  const handleOpenFailedModal = (userId?: string, userName?: string) => {
    setSelectedUserId(userId || null);
    setSelectedUserName(userName || null);
    setIsFailedModalOpen(true);
  };

  const handleCloseFailedModal = () => {
    setIsFailedModalOpen(false);
    setSelectedUserId(null);
    setSelectedUserName(null);
  };

  return (
    <div className="ocr-usage-page">
      <div className="ocr-usage-page__header">
        <h1 className="ocr-usage-page__title">OCR 사용량 현황</h1>
        <div className="ocr-usage-page__header-right">
          <div className="ocr-usage-page__period-selector">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`ocr-usage-page__period-btn ${days === opt.value ? 'ocr-usage-page__period-btn--active' : ''}`}
                onClick={() => setDays(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="ocr-usage-page__actions">
            <span className="ocr-usage-page__refresh-info">1분마다 자동 갱신</span>
            <Button variant="secondary" size="sm" onClick={handleRefreshAll}>
              지금 새로고침
            </Button>
          </div>
        </div>
      </div>

      {/* 전체 통계 */}
      <section className="ocr-usage-page__section">
        <h2 className="ocr-usage-page__section-title">전체 통계</h2>
        <div className="ocr-usage-page__stats-grid">
          <StatCard
            title="이번 달 OCR"
            value={formatOCRCount(overview?.ocr_this_month || 0)}
            subtitle="처리 완료"
          />
          <StatCard
            title="전체 OCR"
            value={formatOCRCount(overview?.ocr_total || 0)}
            subtitle="누적 처리"
          />
          <StatCard
            title="활성 사용자"
            value={overview?.active_users || 0}
            subtitle={`최근 ${days}일`}
          />
        </div>
      </section>

      {/* 처리 상태 */}
      <section className="ocr-usage-page__section">
        <h2 className="ocr-usage-page__section-title">처리 상태</h2>
        <div className="ocr-usage-page__status-grid">
          <div className="status-card status-card--pending">
            <span className="status-card__label">대기 중</span>
            <span className="status-card__value">{overview?.ocr_pending || 0}</span>
          </div>
          <div className="status-card status-card--processing">
            <span className="status-card__label">처리 중</span>
            <span className="status-card__value">{overview?.ocr_processing || 0}</span>
          </div>
          <div
            className="status-card status-card--failed status-card--clickable"
            onClick={() => handleOpenFailedModal()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleOpenFailedModal()}
          >
            <span className="status-card__label">실패</span>
            <span className="status-card__value">{overview?.ocr_failed || 0}</span>
          </div>
        </div>
      </section>

      {/* 시간별 차트 */}
      <section className="ocr-usage-page__section">
        <div className="ocr-usage-page__chart-header">
          <h2 className="ocr-usage-page__section-title">처리 추이</h2>
          <div className="ocr-usage-page__chart-period">
            {CHART_PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`ocr-usage-page__chart-period-btn ${chartHours === opt.hours ? 'ocr-usage-page__chart-period-btn--active' : ''}`}
                onClick={() => setChartHours(opt.hours)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="ocr-usage-page__chart-container">
          {!hourlyUsage || hourlyUsage.length === 0 ? (
            <div className="ocr-usage-page__chart-empty">사용 데이터가 없습니다</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={hourlyUsage} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
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
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="top"
                  height={24}
                  wrapperStyle={{ fontSize: '11px' }}
                />
                <Bar dataKey="done" name="성공" fill="#34C759" stackId="stack" />
                <Bar dataKey="error" name="실패" fill="#FF3B30" stackId="stack" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Top 사용자 */}
      <section className="ocr-usage-page__section">
        <h2 className="ocr-usage-page__section-title">Top 10 사용자</h2>
        <div className="ocr-usage-page__table-container">
          <table className="ocr-usage-page__table">
            <thead>
              <tr>
                <th>#</th>
                <th>사용자</th>
                <th>OCR 처리</th>
                <th>실패</th>
                <th>마지막 처리</th>
              </tr>
            </thead>
            <tbody>
              {!topUsers || topUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="ocr-usage-page__table-empty">
                    사용자 데이터가 없습니다
                  </td>
                </tr>
              ) : (
                topUsers.map((user) => (
                  <tr key={user.user_id}>
                    <td className="ocr-usage-page__table-rank">{user.rank}</td>
                    <td className="ocr-usage-page__table-user">
                      <span className="ocr-usage-page__user-name">{user.user_name}</span>
                    </td>
                    <td className="ocr-usage-page__table-count">
                      {user.ocr_count.toLocaleString()}건
                    </td>
                    <td className="ocr-usage-page__table-error">
                      {user.error_count > 0 ? (
                        <span
                          className="ocr-usage-page__table-error-count"
                          onClick={() => handleOpenFailedModal(user.user_id, user.user_name)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && handleOpenFailedModal(user.user_id, user.user_name)}
                        >
                          {user.error_count}건
                        </span>
                      ) : (
                        <span className="ocr-usage-page__table-no-error">-</span>
                      )}
                    </td>
                    <td className="ocr-usage-page__table-time">
                      {new Date(user.last_ocr_at).toLocaleString('ko-KR')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* OCR 실패 문서 모달 */}
      <OCRFailedModal
        isOpen={isFailedModalOpen}
        onClose={handleCloseFailedModal}
        userId={selectedUserId}
        userName={selectedUserName}
      />
    </div>
  );
};
