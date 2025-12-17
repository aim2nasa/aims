/**
 * OCR Usage Admin Page
 * @since 2025-12-14
 * @updated 2025-12-17 - 주간/월간 기간 선택 UI 재설계
 */

import { useState, useMemo } from 'react';
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
import type { DailyOCRPoint, HourlyOCRPoint } from '@/features/dashboard/ocrUsageApi';
import { StatCard } from '@/shared/ui/StatCard/StatCard';
import { Button } from '@/shared/ui/Button/Button';
import { OCRFailedModal } from './OCRFailedModal';
import './OCRUsagePage.css';

type PeriodType = 'daily' | 'weekly' | 'monthly';

// 최근 24시간 범위 계산
function getLast24HoursRange(): { start: string; end: string } {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return {
    start: yesterday.toISOString().split('T')[0],
    end: now.toISOString().split('T')[0],
  };
}

// 현재 주간 범위 계산 (월~일)
function getCurrentWeekRange(): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=일, 1=월, ...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
  };
}

// 년도 범위 계산
function getYearRange(year: number): { start: string; end: string } {
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

// 요일 라벨
const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

// 월 라벨
const MONTH_LABELS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

// 일별 데이터를 월별로 집계
function aggregateToMonthly(dailyData: DailyOCRPoint[]): Array<{ month: string; done: number; error: number; page_count: number }> {
  const monthlyMap = new Map<string, { done: number; error: number; page_count: number }>();

  // 12개월 초기화
  for (let m = 1; m <= 12; m++) {
    const monthKey = String(m).padStart(2, '0');
    monthlyMap.set(monthKey, { done: 0, error: 0, page_count: 0 });
  }

  for (const day of dailyData) {
    const month = day.date.split('-')[1]; // YYYY-MM-DD에서 MM 추출
    const entry = monthlyMap.get(month);
    if (entry) {
      entry.done += day.done;
      entry.error += day.error;
      entry.page_count += day.page_count;
    }
  }

  return Array.from(monthlyMap.entries()).map(([month, data]) => ({
    month: MONTH_LABELS[parseInt(month) - 1],
    ...data,
  }));
}

// 일별 데이터를 요일별로 매핑 (날짜 포함)
function mapToWeekdays(dailyData: DailyOCRPoint[], weekStart: string): Array<{ day: string; done: number; error: number; page_count: number }> {
  const startDate = new Date(weekStart);
  const result: Array<{ day: string; done: number; error: number; page_count: number }> = [];

  for (let i = 0; i < 7; i++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + i);
    const dateStr = currentDate.toISOString().split('T')[0];

    // 날짜 포맷: "월 12/16"
    const month = currentDate.getMonth() + 1;
    const day = currentDate.getDate();
    const dayLabel = `${WEEKDAY_LABELS[i]} ${month}/${day}`;

    const dayData = dailyData.find(d => d.date === dateStr);
    result.push({
      day: dayLabel,
      done: dayData?.done || 0,
      error: dayData?.error || 0,
      page_count: dayData?.page_count || 0,
    });
  }

  return result;
}

// 시간별 데이터를 차트용으로 매핑 (24시간)
function mapToHours(hourlyData: HourlyOCRPoint[]): Array<{ hour: string; done: number; error: number }> {
  // 24시간 초기화
  const hourlyMap = new Map<number, { done: number; error: number }>();
  for (let h = 0; h < 24; h++) {
    hourlyMap.set(h, { done: 0, error: 0 });
  }

  // 데이터 매핑
  for (const point of hourlyData) {
    const hour = new Date(point.timestamp).getHours();
    const entry = hourlyMap.get(hour);
    if (entry) {
      entry.done += point.done;
      entry.error += point.error;
    }
  }

  // 결과 배열 생성
  return Array.from(hourlyMap.entries()).map(([hour, data]) => ({
    hour: `${hour}시`,
    ...data,
  }));
}

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
      <p className="ocr-usage-page__tooltip-time">{label}</p>
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
  const currentYear = new Date().getFullYear();
  const [periodType, setPeriodType] = useState<PeriodType>('monthly');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [isFailedModalOpen, setIsFailedModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState<string | null>(null);

  // 기간 범위 계산
  const dateRange = useMemo(() => {
    if (periodType === 'daily') {
      return getLast24HoursRange();
    }
    if (periodType === 'weekly') {
      return getCurrentWeekRange();
    }
    return getYearRange(selectedYear);
  }, [periodType, selectedYear]);

  // 년도 옵션 (최근 3년)
  const yearOptions = useMemo(() => {
    return [currentYear, currentYear - 1, currentYear - 2];
  }, [currentYear]);

  // API 쿼리 - 24시간 모드는 days=1 사용, 그 외는 start/end 사용
  const { data: overview, isLoading, isError, refetch: refetchOverview } = useQuery({
    queryKey: ['admin', 'ocr-usage', 'overview', periodType, dateRange.start, dateRange.end],
    queryFn: () => periodType === 'daily'
      ? ocrUsageApi.getOverview(1)
      : ocrUsageApi.getOverviewByRange(dateRange.start, dateRange.end),
    refetchInterval: 60000,
  });

  const { data: dailyUsageRaw, refetch: refetchDaily } = useQuery({
    queryKey: ['admin', 'ocr-usage', 'daily', dateRange.start, dateRange.end],
    queryFn: () => ocrUsageApi.getDailyUsageByRange(dateRange.start, dateRange.end),
    refetchInterval: 60000,
    enabled: periodType !== 'daily', // 24시간 모드에서는 hourly 사용
  });

  const { data: topUsers, refetch: refetchTopUsers } = useQuery({
    queryKey: ['admin', 'ocr-usage', 'top-users', periodType, dateRange.start, dateRange.end],
    queryFn: () => periodType === 'daily'
      ? ocrUsageApi.getTopUsers(1)
      : ocrUsageApi.getTopUsersByRange(dateRange.start, dateRange.end),
    refetchInterval: 300000,
  });

  const { data: hourlyUsageRaw, refetch: refetchHourly } = useQuery({
    queryKey: ['admin', 'ocr-usage', 'hourly'],
    queryFn: () => ocrUsageApi.getHourlyUsage(24),
    refetchInterval: 60000,
    enabled: periodType === 'daily',
  });

  // 차트 데이터 준비
  const chartData = useMemo(() => {
    if (periodType === 'daily') {
      return hourlyUsageRaw ? mapToHours(hourlyUsageRaw) : [];
    }
    if (!dailyUsageRaw) return [];
    if (periodType === 'weekly') {
      return mapToWeekdays(dailyUsageRaw, dateRange.start);
    }
    return aggregateToMonthly(dailyUsageRaw);
  }, [dailyUsageRaw, hourlyUsageRaw, periodType, dateRange.start]);

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
    refetchDaily();
    refetchTopUsers();
    if (periodType === 'daily') {
      refetchHourly();
    }
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

  // 기간 표시 텍스트
  const periodLabel = periodType === 'daily'
    ? '최근 24시간'
    : periodType === 'weekly'
      ? `${dateRange.start} ~ ${dateRange.end}`
      : `${selectedYear}년`;

  return (
    <div className="ocr-usage-page">
      <div className="ocr-usage-page__header">
        <h1 className="ocr-usage-page__title">OCR 사용량 현황</h1>
        <div className="ocr-usage-page__header-right">
          <div className="ocr-usage-page__period-selector">
            <button
              type="button"
              className={`ocr-usage-page__period-btn ${periodType === 'daily' ? 'ocr-usage-page__period-btn--active' : ''}`}
              onClick={() => setPeriodType('daily')}
            >
              24시간
            </button>
            <button
              type="button"
              className={`ocr-usage-page__period-btn ${periodType === 'weekly' ? 'ocr-usage-page__period-btn--active' : ''}`}
              onClick={() => setPeriodType('weekly')}
            >
              주간
            </button>
            <button
              type="button"
              className={`ocr-usage-page__period-btn ${periodType === 'monthly' ? 'ocr-usage-page__period-btn--active' : ''}`}
              onClick={() => setPeriodType('monthly')}
            >
              월간
            </button>
          </div>
          {periodType === 'monthly' && (
            <select
              className="ocr-usage-page__year-selector"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              aria-label="년도 선택"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}년
                </option>
              ))}
            </select>
          )}
          <div className="ocr-usage-page__actions">
            <span className="ocr-usage-page__refresh-info">1분마다 자동 갱신</span>
            <Button variant="secondary" size="sm" onClick={handleRefreshAll}>
              새로고침
            </Button>
          </div>
        </div>
      </div>

      {/* 전체 통계 */}
      <section className="ocr-usage-page__section">
        <h2 className="ocr-usage-page__section-title">
          전체 통계 <span className="ocr-usage-page__period-label">({periodLabel})</span>
        </h2>
        <div className="ocr-usage-page__stats-grid">
          <StatCard
            title="OCR 처리"
            value={formatOCRCount(overview?.ocr_this_month || 0)}
            subtitle="처리 완료"
          />
          <StatCard
            title="페이지 수"
            value={formatOCRCount(overview?.pages_this_month || 0)}
            subtitle="페이지 처리"
          />
          <StatCard
            title="예상 비용"
            value={`$${(overview?.estimated_cost_usd || 0).toFixed(2)}`}
            subtitle={`₩${(overview?.estimated_cost_krw || 0).toLocaleString()}`}
          />
          <StatCard
            title="활성 사용자"
            value={overview?.active_users || 0}
            subtitle="기간 내 사용"
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

      {/* 차트 */}
      <section className="ocr-usage-page__section">
        <h2 className="ocr-usage-page__section-title">
          처리 추이 <span className="ocr-usage-page__period-label">({periodLabel})</span>
        </h2>
        <div className="ocr-usage-page__chart-container">
          {chartData.length === 0 ? (
            <div className="ocr-usage-page__chart-empty">사용 데이터가 없습니다</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey={periodType === 'daily' ? 'hour' : periodType === 'weekly' ? 'day' : 'month'}
                  tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                  stroke="var(--color-border)"
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
        <h2 className="ocr-usage-page__section-title">
          Top 10 사용자 <span className="ocr-usage-page__period-label">({periodLabel})</span>
        </h2>
        <div className="ocr-usage-page__table-container">
          <table className="ocr-usage-page__table">
            <thead>
              <tr>
                <th>#</th>
                <th>사용자</th>
                <th>OCR 성공</th>
                <th>페이지 수</th>
                <th>예상 비용</th>
                <th>OCR 실패</th>
                <th>마지막 처리</th>
              </tr>
            </thead>
            <tbody>
              {!topUsers || topUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="ocr-usage-page__table-empty">
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
                    <td className="ocr-usage-page__table-count">
                      {user.page_count.toLocaleString()}p
                    </td>
                    <td className="ocr-usage-page__table-cost">
                      ${user.estimated_cost_usd.toFixed(2)}
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
