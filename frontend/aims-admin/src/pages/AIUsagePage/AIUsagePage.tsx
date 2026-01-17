/**
 * AI Usage Admin Page
 * @since 2025-12-13
 * @updated 2025-12-17 - 주간/월간 기간 선택 UI 재설계
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  aiUsageApi,
  formatTokens,
  formatCost,
  formatCredits,
  tokensToCredits,
  pagesToCredits,
  CREDIT_RATES,
} from '@/features/dashboard/aiUsageApi';
import type {
  DailyUsageBySourcePoint,
  HourlyUsagePoint,
  AIModelSettingsUpdate,
  OCRDailyUsagePoint,
} from '@/features/dashboard/aiUsageApi';
import { StatCard } from '@/shared/ui/StatCard/StatCard';
import { Button } from '@/shared/ui/Button/Button';
import './AIUsagePage.css';

type PeriodType = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';

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

// 월 범위 계산
function getMonthRange(year: number, month: number): { start: string; end: string } {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0); // 다음 달의 0일 = 이번 달의 마지막 날
  return {
    start: startDate.toISOString().split('T')[0],
    end: endDate.toISOString().split('T')[0],
  };
}

// 최근 N년 범위 계산
function getMultiYearRange(currentYear: number, yearsBack: number = 3): { start: string; end: string } {
  return {
    start: `${currentYear - yearsBack + 1}-01-01`,
    end: `${currentYear}-12-31`,
  };
}

// 요일 라벨
const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

// 월 라벨
const MONTH_LABELS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

// 일별 데이터를 월별로 집계
function aggregateToMonthly(dailyData: DailyUsageBySourcePoint[]): Array<{
  month: string;
  chat: number;
  rag_api: number;
  n8n_docsummary: number;
  doc_embedding: number;
  total_tokens: number;
}> {
  const monthlyMap = new Map<string, {
    chat: number;
    rag_api: number;
    n8n_docsummary: number;
    doc_embedding: number;
    total_tokens: number;
  }>();

  // 12개월 초기화
  for (let m = 1; m <= 12; m++) {
    const monthKey = String(m).padStart(2, '0');
    monthlyMap.set(monthKey, { chat: 0, rag_api: 0, n8n_docsummary: 0, doc_embedding: 0, total_tokens: 0 });
  }

  for (const day of dailyData) {
    const month = day.date.split('-')[1]; // YYYY-MM-DD에서 MM 추출
    const entry = monthlyMap.get(month);
    if (entry) {
      entry.chat += day.chat || 0;
      entry.rag_api += day.rag_api;
      entry.n8n_docsummary += day.n8n_docsummary;
      entry.doc_embedding += day.doc_embedding;
      entry.total_tokens += day.total_tokens;
    }
  }

  return Array.from(monthlyMap.entries()).map(([month, data]) => ({
    month: MONTH_LABELS[parseInt(month) - 1],
    ...data,
  }));
}

// 일별 데이터를 년도별로 집계
function aggregateToYearly(dailyData: DailyUsageBySourcePoint[], currentYear: number, yearsBack: number = 3): Array<{
  year: string;
  chat: number;
  rag_api: number;
  n8n_docsummary: number;
  doc_embedding: number;
  total_tokens: number;
}> {
  const yearlyMap = new Map<string, {
    chat: number;
    rag_api: number;
    n8n_docsummary: number;
    doc_embedding: number;
    total_tokens: number;
  }>();

  // N년 초기화
  for (let y = currentYear - yearsBack + 1; y <= currentYear; y++) {
    yearlyMap.set(String(y), { chat: 0, rag_api: 0, n8n_docsummary: 0, doc_embedding: 0, total_tokens: 0 });
  }

  for (const day of dailyData) {
    const year = day.date.split('-')[0]; // YYYY-MM-DD에서 YYYY 추출
    const entry = yearlyMap.get(year);
    if (entry) {
      entry.chat += day.chat || 0;
      entry.rag_api += day.rag_api;
      entry.n8n_docsummary += day.n8n_docsummary;
      entry.doc_embedding += day.doc_embedding;
      entry.total_tokens += day.total_tokens;
    }
  }

  return Array.from(yearlyMap.entries()).map(([year, data]) => ({
    year: `${year}년`,
    ...data,
  }));
}

// 일별 데이터를 일자별로 매핑 (1~31일)
function mapToDays(dailyData: DailyUsageBySourcePoint[], year: number, month: number): Array<{
  day: string;
  chat: number;
  rag_api: number;
  n8n_docsummary: number;
  doc_embedding: number;
  total_tokens: number;
}> {
  const daysInMonth = new Date(year, month, 0).getDate();
  const result: Array<{
    day: string;
    chat: number;
    rag_api: number;
    n8n_docsummary: number;
    doc_embedding: number;
    total_tokens: number;
  }> = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayData = dailyData.find(item => item.date === dateStr);
    result.push({
      day: `${d}`,
      chat: dayData?.chat || 0,
      rag_api: dayData?.rag_api || 0,
      n8n_docsummary: dayData?.n8n_docsummary || 0,
      doc_embedding: dayData?.doc_embedding || 0,
      total_tokens: dayData?.total_tokens || 0,
    });
  }

  return result;
}

// 일별 데이터를 요일별로 매핑 (날짜 포함)
function mapToWeekdays(dailyData: DailyUsageBySourcePoint[], weekStart: string): Array<{
  day: string;
  chat: number;
  rag_api: number;
  n8n_docsummary: number;
  doc_embedding: number;
  total_tokens: number;
}> {
  const startDate = new Date(weekStart);
  const result: Array<{
    day: string;
    chat: number;
    rag_api: number;
    n8n_docsummary: number;
    doc_embedding: number;
    total_tokens: number;
  }> = [];

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
      chat: dayData?.chat || 0,
      rag_api: dayData?.rag_api || 0,
      n8n_docsummary: dayData?.n8n_docsummary || 0,
      doc_embedding: dayData?.doc_embedding || 0,
      total_tokens: dayData?.total_tokens || 0,
    });
  }

  return result;
}

// 시간별 데이터를 차트용으로 매핑 (24시간)
function mapToHours(hourlyData: HourlyUsagePoint[]): Array<{
  hour: string;
  chat: number;
  rag_api: number;
  n8n_docsummary: number;
  doc_embedding: number;
  total: number;
}> {
  // 24시간 초기화
  const hourlyMap = new Map<number, { chat: number; rag_api: number; n8n_docsummary: number; doc_embedding: number; total: number }>();
  for (let h = 0; h < 24; h++) {
    hourlyMap.set(h, { chat: 0, rag_api: 0, n8n_docsummary: 0, doc_embedding: 0, total: 0 });
  }

  // 데이터 매핑
  for (const point of hourlyData) {
    const hour = new Date(point.timestamp).getHours();
    const entry = hourlyMap.get(hour);
    if (entry) {
      entry.chat += point.chat || 0;
      entry.rag_api += point.rag_api;
      entry.n8n_docsummary += point.n8n_docsummary;
      entry.doc_embedding += point.doc_embedding;
      entry.total += point.total;
    }
  }

  // 결과 배열 생성
  return Array.from(hourlyMap.entries()).map(([hour, data]) => ({
    hour: `${hour}시`,
    ...data,
  }));
}

// OCR 일별 데이터를 차트용으로 매핑
function mapOcrToDays(ocrData: OCRDailyUsagePoint[], year: number, month: number): Array<{
  day: string;
  done: number;
  error: number;
}> {
  const daysInMonth = new Date(year, month, 0).getDate();
  const result: Array<{
    day: string;
    done: number;
    error: number;
  }> = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayData = ocrData.find(item => item.date === dateStr);
    result.push({
      day: `${d}`,
      done: dayData?.done || 0,
      error: dayData?.error || 0,
    });
  }

  return result;
}

// OCR 일별 데이터를 요일별로 매핑
function mapOcrToWeekdays(ocrData: OCRDailyUsagePoint[], weekStart: string): Array<{
  day: string;
  done: number;
  error: number;
}> {
  const startDate = new Date(weekStart);
  const result: Array<{
    day: string;
    done: number;
    error: number;
  }> = [];

  for (let i = 0; i < 7; i++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + i);
    const dateStr = currentDate.toISOString().split('T')[0];

    const month = currentDate.getMonth() + 1;
    const day = currentDate.getDate();
    const dayLabel = `${WEEKDAY_LABELS[i]} ${month}/${day}`;

    const dayData = ocrData.find(d => d.date === dateStr);
    result.push({
      day: dayLabel,
      done: dayData?.done || 0,
      error: dayData?.error || 0,
    });
  }

  return result;
}

// OCR 일별 데이터를 월별로 집계
function aggregateOcrToMonthly(ocrData: OCRDailyUsagePoint[]): Array<{
  month: string;
  done: number;
  error: number;
}> {
  const monthlyMap = new Map<string, { done: number; error: number }>();

  for (let m = 1; m <= 12; m++) {
    const monthKey = String(m).padStart(2, '0');
    monthlyMap.set(monthKey, { done: 0, error: 0 });
  }

  for (const day of ocrData) {
    const month = day.date.split('-')[1];
    const entry = monthlyMap.get(month);
    if (entry) {
      entry.done += day.done;
      entry.error += day.error;
    }
  }

  return Array.from(monthlyMap.entries()).map(([month, data]) => ({
    month: MONTH_LABELS[parseInt(month) - 1],
    ...data,
  }));
}

// OCR 일별 데이터를 년도별로 집계
function aggregateOcrToYearly(ocrData: OCRDailyUsagePoint[], currentYear: number, yearsBack: number = 3): Array<{
  year: string;
  done: number;
  error: number;
}> {
  const yearlyMap = new Map<string, { done: number; error: number }>();

  for (let y = currentYear - yearsBack + 1; y <= currentYear; y++) {
    yearlyMap.set(String(y), { done: 0, error: 0 });
  }

  for (const day of ocrData) {
    const year = day.date.split('-')[0];
    const entry = yearlyMap.get(year);
    if (entry) {
      entry.done += day.done;
      entry.error += day.error;
    }
  }

  return Array.from(yearlyMap.entries()).map(([year, data]) => ({
    year: `${year}년`,
    ...data,
  }));
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; dataKey: string }>;
  label?: string;
}

// dataKey to CSS class mapping
const getTooltipColorClass = (dataKey: string): string => {
  switch (dataKey) {
    case 'chat':
      return 'ai-usage-page__tooltip-item--chat';
    case 'rag_api':
      return 'ai-usage-page__tooltip-item--rag';
    case 'n8n_docsummary':
      return 'ai-usage-page__tooltip-item--summary';
    case 'doc_embedding':
      return 'ai-usage-page__tooltip-item--embed';
    default:
      return '';
  }
};

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload || !label) return null;

  return (
    <div className="ai-usage-page__tooltip">
      <p className="ai-usage-page__tooltip-time">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className={`ai-usage-page__tooltip-item ${getTooltipColorClass(entry.dataKey)}`}>
          {entry.name}: {formatTokens(entry.value)}
        </p>
      ))}
    </div>
  );
};

// localStorage 키
const STORAGE_KEY_PERIOD = 'aims-admin:ai-usage:periodType';
const STORAGE_KEY_YEAR = 'aims-admin:ai-usage:selectedYear';
const STORAGE_KEY_MONTH = 'aims-admin:ai-usage:selectedMonth';

export const AIUsagePage = () => {
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // localStorage에서 초기값 로드
  const [periodType, setPeriodTypeState] = useState<PeriodType>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PERIOD);
    if (saved && ['hourly', 'daily', 'weekly', 'monthly', 'yearly'].includes(saved)) {
      return saved as PeriodType;
    }
    return 'monthly';
  });
  const [selectedYear, setSelectedYearState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_YEAR);
    return saved ? parseInt(saved) : currentYear;
  });
  const [selectedMonth, setSelectedMonthState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_MONTH);
    return saved ? parseInt(saved) : currentMonth;
  });

  // localStorage에 저장하는 래퍼 함수
  const setPeriodType = (value: PeriodType) => {
    localStorage.setItem(STORAGE_KEY_PERIOD, value);
    setPeriodTypeState(value);

    // 일별 모드로 전환 시 현재 년월로 초기화
    if (value === 'daily') {
      setSelectedYearState(currentYear);
      setSelectedMonthState(currentMonth);
      localStorage.setItem(STORAGE_KEY_YEAR, String(currentYear));
      localStorage.setItem(STORAGE_KEY_MONTH, String(currentMonth));
    }
  };
  const setSelectedYear = (value: number) => {
    localStorage.setItem(STORAGE_KEY_YEAR, String(value));
    setSelectedYearState(value);
  };
  const setSelectedMonth = (value: number) => {
    localStorage.setItem(STORAGE_KEY_MONTH, String(value));
    setSelectedMonthState(value);
  };

  // 기간 범위 계산
  const dateRange = useMemo(() => {
    if (periodType === 'hourly') {
      return getLast24HoursRange();
    }
    if (periodType === 'daily') {
      return getMonthRange(selectedYear, selectedMonth);
    }
    if (periodType === 'weekly') {
      return getCurrentWeekRange();
    }
    if (periodType === 'yearly') {
      return getMultiYearRange(currentYear, 3);
    }
    return getYearRange(selectedYear);
  }, [periodType, selectedYear, selectedMonth, currentYear]);

  // 년도 옵션 (최근 3년)
  const yearOptions = useMemo(() => {
    return [currentYear, currentYear - 1, currentYear - 2];
  }, [currentYear]);

  // 월 옵션 (1~12월)
  const monthOptions = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }, []);

  // API 쿼리 - 24시간 모드는 days=1 사용, 그 외는 start/end 사용
  const { data: overview, isLoading: overviewLoading, isError: overviewError, refetch: refetchOverview } = useQuery({
    queryKey: ['admin', 'ai-usage', 'overview', periodType, dateRange.start, dateRange.end],
    queryFn: () => periodType === 'hourly'
      ? aiUsageApi.getOverview(1)
      : aiUsageApi.getOverviewByRange(dateRange.start, dateRange.end),
    refetchInterval: 60000,
  });

  const { data: dailyUsageRaw, refetch: refetchDaily } = useQuery({
    queryKey: ['admin', 'ai-usage', 'daily', dateRange.start, dateRange.end],
    queryFn: () => aiUsageApi.getDailyUsageByRange(dateRange.start, dateRange.end),
    refetchInterval: 60000,
    gcTime: 5 * 60 * 1000,
    staleTime: 30000,
    enabled: periodType !== 'hourly', // 24시간 모드에서는 hourly 사용
  });

  const { data: topUsers, refetch: refetchTopUsers } = useQuery({
    queryKey: ['admin', 'ai-usage', 'top-users', periodType, dateRange.start, dateRange.end],
    queryFn: () => periodType === 'hourly'
      ? aiUsageApi.getTopUsers(1)
      : aiUsageApi.getTopUsersByRange(dateRange.start, dateRange.end),
    refetchInterval: 300000,
  });

  // OCR Top Users Query
  const { data: ocrTopUsers, refetch: refetchOcrTopUsers } = useQuery({
    queryKey: ['admin', 'ocr-usage', 'top-users', periodType, dateRange.start, dateRange.end],
    queryFn: () => periodType === 'hourly'
      ? aiUsageApi.getOCRTopUsers(1)
      : aiUsageApi.getOCRTopUsersByRange(dateRange.start, dateRange.end),
    refetchInterval: 300000,
  });

  const { data: hourlyUsageRaw, refetch: refetchHourly } = useQuery({
    queryKey: ['admin', 'ai-usage', 'hourly'],
    queryFn: () => aiUsageApi.getHourlyUsage(24),
    refetchInterval: 60000,
    enabled: periodType === 'hourly',
  });

  // OCR Usage Queries
  const { data: ocrOverview, refetch: refetchOcrOverview } = useQuery({
    queryKey: ['admin', 'ocr-usage', 'overview', periodType, dateRange.start, dateRange.end],
    queryFn: () => periodType === 'hourly'
      ? aiUsageApi.getOCROverview(1)
      : aiUsageApi.getOCROverviewByRange(dateRange.start, dateRange.end),
    refetchInterval: 60000,
  });

  const { data: ocrDailyUsage, refetch: refetchOcrDaily } = useQuery({
    queryKey: ['admin', 'ocr-usage', 'daily', dateRange.start, dateRange.end],
    queryFn: () => aiUsageApi.getOCRDailyUsageByRange(dateRange.start, dateRange.end),
    refetchInterval: 60000,
    enabled: periodType !== 'hourly',
  });

  // AI 모델 설정 조회
  const { data: modelSettings, isLoading: modelSettingsLoading } = useQuery({
    queryKey: ['admin', 'ai-model-settings'],
    queryFn: () => aiUsageApi.getAIModelSettings(),
  });

  // AI 모델 설정 변경 뮤테이션
  const updateModelMutation = useMutation({
    mutationFn: (updates: AIModelSettingsUpdate) => aiUsageApi.updateAIModelSettings(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'ai-model-settings'] });
    },
  });

  // AI 모델 설정 초기화 뮤테이션
  const resetModelMutation = useMutation({
    mutationFn: () => aiUsageApi.resetAIModelSettings(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'ai-model-settings'] });
    },
  });

  // 모델 변경 핸들러
  const handleModelChange = (service: 'chat' | 'rag', model: string) => {
    updateModelMutation.mutate({
      [service]: { model }
    });
  };

  // 차트 데이터 준비
  const chartData = useMemo(() => {
    if (periodType === 'hourly') {
      return hourlyUsageRaw ? mapToHours(hourlyUsageRaw) : [];
    }
    if (!dailyUsageRaw) return [];
    if (periodType === 'daily') {
      return mapToDays(dailyUsageRaw, selectedYear, selectedMonth);
    }
    if (periodType === 'weekly') {
      return mapToWeekdays(dailyUsageRaw, dateRange.start);
    }
    if (periodType === 'yearly') {
      return aggregateToYearly(dailyUsageRaw, currentYear, 3);
    }
    return aggregateToMonthly(dailyUsageRaw);
  }, [dailyUsageRaw, hourlyUsageRaw, periodType, dateRange.start, selectedYear, selectedMonth, currentYear]);

  // OCR 차트 데이터 준비
  const ocrChartData = useMemo(() => {
    if (periodType === 'hourly' || !ocrDailyUsage) return [];
    if (periodType === 'daily') {
      return mapOcrToDays(ocrDailyUsage, selectedYear, selectedMonth);
    }
    if (periodType === 'weekly') {
      return mapOcrToWeekdays(ocrDailyUsage, dateRange.start);
    }
    if (periodType === 'yearly') {
      return aggregateOcrToYearly(ocrDailyUsage, currentYear, 3);
    }
    return aggregateOcrToMonthly(ocrDailyUsage);
  }, [ocrDailyUsage, periodType, dateRange.start, selectedYear, selectedMonth, currentYear]);

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
  const totalBySource = (overview?.by_source?.chat || 0) + (overview?.by_source?.rag_api || 0) + (overview?.by_source?.n8n_docsummary || 0) + (overview?.by_source?.doc_embedding || 0);
  const chatPercent = totalBySource > 0 ? ((overview?.by_source?.chat || 0) / totalBySource * 100).toFixed(1) : '0';
  const ragPercent = totalBySource > 0 ? ((overview?.by_source?.rag_api || 0) / totalBySource * 100).toFixed(1) : '0';
  const n8nPercent = totalBySource > 0 ? ((overview?.by_source?.n8n_docsummary || 0) / totalBySource * 100).toFixed(1) : '0';
  const embeddingPercent = totalBySource > 0 ? ((overview?.by_source?.doc_embedding || 0) / totalBySource * 100).toFixed(1) : '0';

  // 모든 데이터 새로고침
  const handleRefreshAll = () => {
    refetchOverview();
    refetchDaily();
    refetchTopUsers();
    refetchOcrOverview();
    refetchOcrDaily();
    refetchOcrTopUsers();
    if (periodType === 'hourly') {
      refetchHourly();
    }
  };

  // 크레딧 계산
  const aiCredits = tokensToCredits(overview?.total_tokens || 0);
  const ocrCredits = pagesToCredits(ocrOverview?.page_count || 0);
  const totalCredits = aiCredits + ocrCredits;

  // 기간 표시 텍스트
  const periodLabel = periodType === 'hourly'
    ? '최근 24시간'
    : periodType === 'daily'
      ? `${selectedYear}년 ${selectedMonth}월`
      : periodType === 'weekly'
        ? `${dateRange.start} ~ ${dateRange.end}`
        : periodType === 'yearly'
          ? `${currentYear - 2}~${currentYear}년`
          : `${selectedYear}년`;

  return (
    <div className="ai-usage-page">
      <div className="ai-usage-page__header">
        <h1 className="ai-usage-page__title">AI/OCR 사용량 현황</h1>
        <div className="ai-usage-page__header-right">
          <div className="ai-usage-page__period-selector">
            <button
              type="button"
              className={`ai-usage-page__period-btn ${periodType === 'hourly' ? 'ai-usage-page__period-btn--active' : ''}`}
              onClick={() => setPeriodType('hourly')}
            >
              24시간
            </button>
            <button
              type="button"
              className={`ai-usage-page__period-btn ${periodType === 'weekly' ? 'ai-usage-page__period-btn--active' : ''}`}
              onClick={() => setPeriodType('weekly')}
            >
              주간
            </button>
            <button
              type="button"
              className={`ai-usage-page__period-btn ${periodType === 'daily' ? 'ai-usage-page__period-btn--active' : ''}`}
              onClick={() => setPeriodType('daily')}
            >
              일별
            </button>
            <button
              type="button"
              className={`ai-usage-page__period-btn ${periodType === 'monthly' ? 'ai-usage-page__period-btn--active' : ''}`}
              onClick={() => setPeriodType('monthly')}
            >
              월간
            </button>
            <button
              type="button"
              className={`ai-usage-page__period-btn ${periodType === 'yearly' ? 'ai-usage-page__period-btn--active' : ''}`}
              onClick={() => setPeriodType('yearly')}
            >
              년도
            </button>
          </div>
          {(periodType === 'daily' || periodType === 'monthly') && (
            <select
              className="ai-usage-page__year-selector"
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
          {periodType === 'daily' && (
            <select
              className="ai-usage-page__month-selector"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              aria-label="월 선택"
            >
              {monthOptions.map((month) => (
                <option key={month} value={month}>
                  {month}월
                </option>
              ))}
            </select>
          )}
          <div className="ai-usage-page__actions">
            <span className="ai-usage-page__refresh-info">
              1분마다 자동 갱신
            </span>
            <Button variant="secondary" size="sm" onClick={handleRefreshAll}>
              새로고침
            </Button>
          </div>
        </div>
      </div>

      {/* 전체 통계 (AI + OCR 통합) */}
      <section className="ai-usage-page__section">
        <h2 className="ai-usage-page__section-title">
          전체 통계 <span className="ai-usage-page__period-label">({periodLabel})</span>
        </h2>
        <div className="ai-usage-page__stats-grid ai-usage-page__stats-grid--4col">
          <StatCard
            title="총 크레딧"
            value={formatCredits(totalCredits)}
            subtitle={`AI: ${formatCredits(aiCredits)} / OCR: ${formatCredits(ocrCredits)}`}
          />
          <StatCard
            title="AI 토큰"
            value={formatTokens(overview?.total_tokens || 0)}
            subtitle={`≈ ${formatCredits(aiCredits)} 크레딧 (${CREDIT_RATES.AI_PER_1K_TOKENS}/1K)`}
          />
          <StatCard
            title="OCR 페이지"
            value={(ocrOverview?.page_count || 0).toLocaleString()}
            subtitle={`≈ ${formatCredits(ocrCredits)} 크레딧 (${CREDIT_RATES.OCR_PER_PAGE}/page)`}
          />
          <StatCard
            title="활성 사용자"
            value={overview?.unique_users || 0}
            subtitle={`AI: ${overview?.request_count || 0}건 / OCR: ${ocrOverview?.ocr_count || 0}건`}
          />
        </div>
      </section>

      {/* AI 소스별 분포 */}
      <section className="ai-usage-page__section">
        <h2 className="ai-usage-page__section-title">
          AI 소스별 사용량 <span className="ai-usage-page__period-label">({periodLabel})</span>
        </h2>
        <div className="ai-usage-page__source-grid ai-usage-page__source-grid--4col">
          <div className="source-card source-card--chat">
            <span className="source-card__label">AI 채팅</span>
            <span className="source-card__value">{formatTokens(overview?.by_source?.chat || 0)}</span>
            <span className="source-card__credits">≈ {formatCredits(tokensToCredits(overview?.by_source?.chat || 0))} cr</span>
            <span className="source-card__percent">{chatPercent}%</span>
          </div>
          <div className="source-card source-card--rag">
            <span className="source-card__label">RAG API</span>
            <span className="source-card__value">{formatTokens(overview?.by_source?.rag_api || 0)}</span>
            <span className="source-card__credits">≈ {formatCredits(tokensToCredits(overview?.by_source?.rag_api || 0))} cr</span>
            <span className="source-card__percent">{ragPercent}%</span>
          </div>
          <div className="source-card source-card--n8n">
            <span className="source-card__label">DocSummary</span>
            <span className="source-card__value">{formatTokens(overview?.by_source?.n8n_docsummary || 0)}</span>
            <span className="source-card__credits">≈ {formatCredits(tokensToCredits(overview?.by_source?.n8n_docsummary || 0))} cr</span>
            <span className="source-card__percent">{n8nPercent}%</span>
          </div>
          <div className="source-card source-card--embedding">
            <span className="source-card__label">임베딩</span>
            <span className="source-card__value">{formatTokens(overview?.by_source?.doc_embedding || 0)}</span>
            <span className="source-card__credits">≈ {formatCredits(tokensToCredits(overview?.by_source?.doc_embedding || 0))} cr</span>
            <span className="source-card__percent">{embeddingPercent}%</span>
          </div>
        </div>
      </section>

      {/* OCR 사용량 섹션 */}
      <section className="ai-usage-page__section">
        <h2 className="ai-usage-page__section-title">
          OCR 사용량 <span className="ai-usage-page__period-label">({periodLabel})</span>
        </h2>
        <div className="ai-usage-page__ocr-grid">
          <div className="ocr-stat-card">
            <span className="ocr-stat-card__label">처리 건수</span>
            <span className="ocr-stat-card__value">{(ocrOverview?.ocr_count || 0).toLocaleString()}</span>
            <span className="ocr-stat-card__sub">
              대기: {ocrOverview?.ocr_pending || 0} / 처리중: {ocrOverview?.ocr_processing || 0} / 실패: {ocrOverview?.ocr_failed || 0}
            </span>
          </div>
          <div className="ocr-stat-card ocr-stat-card--pages">
            <span className="ocr-stat-card__label">페이지 수</span>
            <span className="ocr-stat-card__value">{(ocrOverview?.page_count || 0).toLocaleString()}</span>
            <span className="ocr-stat-card__sub">누적: {(ocrOverview?.pages_total || 0).toLocaleString()} 페이지</span>
          </div>
          <div className="ocr-stat-card ocr-stat-card--credits">
            <span className="ocr-stat-card__label">크레딧</span>
            <span className="ocr-stat-card__value">{formatCredits(ocrCredits)}</span>
            <span className="ocr-stat-card__sub">{CREDIT_RATES.OCR_PER_PAGE} 크레딧/페이지</span>
          </div>
          <div className="ocr-stat-card ocr-stat-card--cost">
            <span className="ocr-stat-card__label">예상 비용</span>
            <span className="ocr-stat-card__value">{formatCost(ocrOverview?.estimated_cost_usd || 0)}</span>
            <span className="ocr-stat-card__sub">≈ ₩{(ocrOverview?.estimated_cost_krw || 0).toLocaleString()}</span>
          </div>
        </div>
      </section>

      {/* 차트 - AI 사용량 추이 */}
      <section className="ai-usage-page__section">
        <h2 className="ai-usage-page__section-title">
          AI 토큰 사용량 추이 <span className="ai-usage-page__period-label">({periodLabel})</span>
        </h2>
        <div className="ai-usage-page__line-chart-container">
          {chartData.length === 0 ? (
            <div className="ai-usage-page__chart-empty">사용 데이터가 없습니다</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey={periodType === 'hourly' ? 'hour' : periodType === 'monthly' ? 'month' : periodType === 'yearly' ? 'year' : 'day'}
                  tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                  stroke="var(--color-border)"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }}
                  stroke="var(--color-border)"
                  tickFormatter={(value) => formatTokens(value)}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="top"
                  height={24}
                  wrapperStyle={{ fontSize: '11px' }}
                />
                <Bar dataKey="doc_embedding" name="Embed" fill="#FF9500" stackId="stack" />
                <Bar dataKey="n8n_docsummary" name="Summary" fill="#34C759" stackId="stack" />
                <Bar dataKey="rag_api" name="RAG" fill="#007AFF" stackId="stack" />
                <Bar dataKey="chat" name="Chat" fill="#AF52DE" stackId="stack" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* OCR 처리 추이 차트 */}
      {periodType !== 'hourly' && (
        <section className="ai-usage-page__section">
          <h2 className="ai-usage-page__section-title">
            OCR 처리 추이 <span className="ai-usage-page__period-label">({periodLabel})</span>
          </h2>
          <div className="ai-usage-page__line-chart-container">
            {ocrChartData.length === 0 ? (
              <div className="ai-usage-page__chart-empty">OCR 데이터가 없습니다</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={ocrChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis
                    dataKey={periodType === 'monthly' ? 'month' : periodType === 'yearly' ? 'year' : 'day'}
                    tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                    stroke="var(--color-border)"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }}
                    stroke="var(--color-border)"
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !label) return null;
                      return (
                        <div className="ai-usage-page__tooltip">
                          <p className="ai-usage-page__tooltip-time">{label}</p>
                          {payload.map((entry, index) => (
                            <p
                              key={index}
                              className={`ai-usage-page__tooltip-item ${entry.dataKey === 'done' ? 'ai-usage-page__tooltip-item--ocr-done' : 'ai-usage-page__tooltip-item--ocr-error'}`}
                            >
                              {entry.name}: {(entry.value as number).toLocaleString()}건
                            </p>
                          ))}
                        </div>
                      );
                    }}
                  />
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
      )}

      {/* Top 사용자 - AI/OCR 병렬 표시 */}
      <section className="ai-usage-page__section">
        <h2 className="ai-usage-page__section-title">
          Top 10 사용자 <span className="ai-usage-page__period-label">({periodLabel})</span>
        </h2>
        <div className="ai-usage-page__tables-row">
          {/* AI Top 사용자 */}
          <div className="ai-usage-page__table-wrapper">
            <h3 className="ai-usage-page__table-subtitle">AI 사용량</h3>
            <div className="ai-usage-page__table-container">
              <table className="ai-usage-page__table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>사용자</th>
                    <th>토큰</th>
                    <th>요청</th>
                    <th>비용</th>
                  </tr>
                </thead>
                <tbody>
                  {!topUsers || topUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="ai-usage-page__table-empty">
                        데이터 없음
                      </td>
                    </tr>
                  ) : (
                    topUsers.map((user, index) => (
                      <tr key={user.user_id}>
                        <td className="ai-usage-page__table-rank">{index + 1}</td>
                        <td className="ai-usage-page__table-user">
                          <span className="ai-usage-page__user-name">{user.user_name}</span>
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
          </div>

          {/* OCR Top 사용자 */}
          <div className="ai-usage-page__table-wrapper">
            <h3 className="ai-usage-page__table-subtitle">OCR 사용량</h3>
            <div className="ai-usage-page__table-container">
              <table className="ai-usage-page__table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>사용자</th>
                    <th>OCR</th>
                    <th>페이지</th>
                    <th>비용</th>
                  </tr>
                </thead>
                <tbody>
                  {!ocrTopUsers || ocrTopUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="ai-usage-page__table-empty">
                        데이터 없음
                      </td>
                    </tr>
                  ) : (
                    ocrTopUsers.map((user, index) => (
                      <tr key={user.user_id}>
                        <td className="ai-usage-page__table-rank">{index + 1}</td>
                        <td className="ai-usage-page__table-user">
                          <span className="ai-usage-page__user-name">{user.user_name}</span>
                        </td>
                        <td>{user.ocr_count.toLocaleString()}</td>
                        <td>{user.page_count.toLocaleString()}</td>
                        <td className="ai-usage-page__table-cost">
                          {formatCost(user.estimated_cost_usd)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* AI 모델 설정 */}
      <section className="ai-usage-page__section">
        <h2 className="ai-usage-page__section-title">AI 모델 설정</h2>
        {modelSettingsLoading ? (
          <div className="ai-usage-page__loading">설정을 불러오는 중...</div>
        ) : (
          <div className="ai-usage-page__model-settings">
            <div className="ai-usage-page__model-row">
              <div className="ai-usage-page__model-info">
                <span className="ai-usage-page__model-label">AI 채팅</span>
                <span className="ai-usage-page__model-desc">{modelSettings?.chat?.description}</span>
              </div>
              <select
                className="ai-usage-page__model-select"
                value={modelSettings?.chat?.model || ''}
                onChange={(e) => handleModelChange('chat', e.target.value)}
                disabled={updateModelMutation.isPending}
                aria-label="AI 채팅 모델 선택"
              >
                {modelSettings?.chat?.availableModels?.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </div>

            <div className="ai-usage-page__model-row">
              <div className="ai-usage-page__model-info">
                <span className="ai-usage-page__model-label">RAG 답변</span>
                <span className="ai-usage-page__model-desc">{modelSettings?.rag?.description}</span>
              </div>
              <select
                className="ai-usage-page__model-select"
                value={modelSettings?.rag?.model || ''}
                onChange={(e) => handleModelChange('rag', e.target.value)}
                disabled={updateModelMutation.isPending}
                aria-label="RAG 답변 모델 선택"
              >
                {modelSettings?.rag?.availableModels?.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </div>

            <div className="ai-usage-page__model-actions">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => resetModelMutation.mutate()}
                disabled={resetModelMutation.isPending}
              >
                {resetModelMutation.isPending ? '초기화 중...' : '기본값으로 초기화'}
              </Button>
              {updateModelMutation.isPending && (
                <span className="ai-usage-page__model-saving">저장 중...</span>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
