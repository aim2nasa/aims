/**
 * AI Usage Admin Page
 * @since 2025-12-13
 * @updated 2025-12-17 - 주간/월간 기간 선택 UI 재설계
 */

import { useState, useMemo, useRef, useEffect } from 'react';
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
} from '@/features/dashboard/aiUsageApi';
import type {
  DailyUsageBySourcePoint,
  HourlyUsagePoint,
  AIModelSettingsUpdate,
  OCRDailyUsagePoint,
  FailedEmbeddingDocument,
  EmbedSummary,
  UsageResetHistoryItem,
  UsageResetDetail,
} from '@/features/dashboard/aiUsageApi';
import { Button } from '@/shared/ui/Button/Button';
import './AIUsagePage.css';

type PeriodType = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';

// 최근 24시간 범위 계산 (타임존 문제 방지)
function getLast24HoursRange(): { start: string; end: string } {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  // formatLocalDate 함수 사용 (아래 정의됨)
  const formatDate = (d: Date) => {
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  return {
    start: formatDate(yesterday),
    end: formatDate(now),
  };
}

// 로컬 Date를 YYYY-MM-DD 문자열로 변환 (타임존 문제 방지)
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 현재 주간 범위 계산 (월~일)
function getCurrentWeekRange(): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=일, 1=월, ...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    start: formatLocalDate(monday),
    end: formatLocalDate(sunday),
  };
}

// 년도 범위 계산
function getYearRange(year: number): { start: string; end: string } {
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

// 월 범위 계산 (타임존 문제 방지 - 문자열 직접 생성)
function getMonthRange(year: number, month: number): { start: string; end: string } {
  const lastDay = new Date(year, month, 0).getDate(); // 해당 월의 마지막 날
  const monthStr = month.toString().padStart(2, '0');
  return {
    start: `${year}-${monthStr}-01`,
    end: `${year}-${monthStr}-${lastDay.toString().padStart(2, '0')}`,
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
    return 'daily';
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

  // 재시도 후 빠른 폴링 모드 (10초 간격, 2분간)
  const [embedFastPoll, setEmbedFastPoll] = useState(false);
  const fastPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startFastPoll = () => {
    setEmbedFastPoll(true);
    if (fastPollTimerRef.current) clearTimeout(fastPollTimerRef.current);
    fastPollTimerRef.current = setTimeout(() => setEmbedFastPoll(false), 120000);
  };

  useEffect(() => {
    return () => { if (fastPollTimerRef.current) clearTimeout(fastPollTimerRef.current); };
  }, []);

  // =====================
  // 사용량 리셋 관련 state
  // =====================
  const [showResetDropdown, setShowResetDropdown] = useState(false);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [showResetHistoryModal, setShowResetHistoryModal] = useState(false);
  const [showResetDetailModal, setShowResetDetailModal] = useState(false);
  const [resetType, setResetType] = useState<'all' | 'ai' | 'ocr'>('all');
  const [resetReason, setResetReason] = useState('');
  const [selectedResetDetail, setSelectedResetDetail] = useState<UsageResetDetail | null>(null);
  const resetDropdownRef = useRef<HTMLDivElement>(null);

  // 리셋 드롭다운 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (resetDropdownRef.current && !resetDropdownRef.current.contains(event.target as Node)) {
        setShowResetDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 리셋 이력 쿼리
  const { data: resetHistory } = useQuery({
    queryKey: ['admin', 'usage', 'reset-history'],
    queryFn: () => aiUsageApi.getResetHistory(20, 0),
    enabled: showResetHistoryModal,
  });

  // 리셋 실행 mutation
  const resetMutation = useMutation({
    mutationFn: (params: { reset_type: 'all' | 'ai' | 'ocr'; reason?: string }) =>
      aiUsageApi.resetUsage(params),
    onSuccess: () => {
      // 모든 데이터 새로고침
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      setShowResetConfirmModal(false);
      setResetReason('');
      alert('사용량이 리셋되었습니다.');
    },
    onError: (error) => {
      alert(`리셋 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    },
  });

  // 리셋 상세 조회
  const handleViewResetDetail = async (resetId: string) => {
    try {
      const detail = await aiUsageApi.getResetDetail(resetId);
      setSelectedResetDetail(detail);
      setShowResetDetailModal(true);
    } catch (error) {
      alert('상세 정보를 불러오는데 실패했습니다.');
    }
  };

  // 임베딩 실패 문서 조회 (재시도 후 10초 폴링, 평상시 60초)
  const { data: failedEmbeddings, isLoading: failedEmbeddingsLoading, refetch: refetchFailedEmbeddings } = useQuery({
    queryKey: ['admin', 'embed', 'failed'],
    queryFn: () => aiUsageApi.getFailedEmbeddings(),
    refetchInterval: embedFastPoll ? 10000 : 60000,
  });

  const embedSummary: EmbedSummary | undefined = failedEmbeddings?.summary;

  // 임베딩 단건 재처리 뮤테이션
  const reprocessMutation = useMutation({
    mutationFn: (docId: string) => aiUsageApi.reprocessEmbedding(docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'embed', 'failed'] });
      startFastPoll();
    },
  });

  // 임베딩 일괄 재처리 뮤테이션
  const reprocessAllMutation = useMutation({
    mutationFn: () => aiUsageApi.reprocessAllEmbeddings(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'embed', 'failed'] });
      startFastPoll();
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

  // 모든 데이터 새로고침
  const handleRefreshAll = () => {
    refetchOverview();
    refetchDaily();
    refetchTopUsers();
    refetchOcrOverview();
    refetchOcrDaily();
    refetchOcrTopUsers();
    refetchFailedEmbeddings();
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

            {/* 리셋 드롭다운 */}
            <div className="ai-usage-page__reset-dropdown" ref={resetDropdownRef}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowResetDropdown(!showResetDropdown)}
              >
                리셋 ▼
              </Button>
              {showResetDropdown && (
                <div className="ai-usage-page__reset-menu">
                  <button
                    type="button"
                    className="ai-usage-page__reset-menu-item"
                    onClick={() => {
                      setResetType('all');
                      setShowResetConfirmModal(true);
                      setShowResetDropdown(false);
                    }}
                  >
                    전체 리셋 (AI + OCR)
                  </button>
                  <button
                    type="button"
                    className="ai-usage-page__reset-menu-item"
                    onClick={() => {
                      setResetType('ai');
                      setShowResetConfirmModal(true);
                      setShowResetDropdown(false);
                    }}
                  >
                    AI 사용량만 리셋
                  </button>
                  <button
                    type="button"
                    className="ai-usage-page__reset-menu-item"
                    onClick={() => {
                      setResetType('ocr');
                      setShowResetConfirmModal(true);
                      setShowResetDropdown(false);
                    }}
                  >
                    OCR 사용량만 리셋
                  </button>
                  <div className="ai-usage-page__reset-menu-divider" />
                  <button
                    type="button"
                    className="ai-usage-page__reset-menu-item"
                    onClick={() => {
                      setShowResetHistoryModal(true);
                      setShowResetDropdown(false);
                    }}
                  >
                    리셋 이력 보기
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================
          💰 총 운영 비용 - 가장 중요한 정보를 최상단에
          ====================================================== */}
      <section className="ai-usage-page__section">
        <div className="cost-hero">
          <div className="cost-hero__header">
            <h2 className="cost-hero__title">💰 총 운영 비용</h2>
            <span className="cost-hero__period">{periodLabel}</span>
          </div>

          {/* 총 비용 - 가장 크게 */}
          <div className="cost-hero__total">
            <span className="cost-hero__amount">
              {formatCost((overview?.estimated_cost_usd || 0) + (ocrOverview?.estimated_cost_usd || 0))}
            </span>
            <span className="cost-hero__krw">
              ≈ ₩{Math.round(((overview?.estimated_cost_usd || 0) + (ocrOverview?.estimated_cost_usd || 0)) * 1450).toLocaleString()}
            </span>
          </div>

          {/* AI vs OCR 비용 비교 바 */}
          <div className="cost-hero__breakdown">
            {(() => {
              const aiCost = overview?.estimated_cost_usd || 0;
              const ocrCost = ocrOverview?.estimated_cost_usd || 0;
              const totalCostVal = aiCost + ocrCost;
              const aiPercent = totalCostVal > 0 ? (aiCost / totalCostVal * 100) : 0;
              const ocrPercent = totalCostVal > 0 ? (ocrCost / totalCostVal * 100) : 0;

              return (
                <>
                  <div className="cost-bar">
                    <div className="cost-bar__ai" ref={(el) => { if (el) el.style.width = `${aiPercent}%`; }} />
                    <div className="cost-bar__ocr" ref={(el) => { if (el) el.style.width = `${ocrPercent}%`; }} />
                  </div>
                  <div className="cost-legend">
                    <div className="cost-legend__item cost-legend__item--ai">
                      <span className="cost-legend__dot" />
                      <span className="cost-legend__label">AI</span>
                      <span className="cost-legend__value">{formatCost(aiCost)}</span>
                      <span className="cost-legend__percent">({aiPercent.toFixed(1)}%)</span>
                    </div>
                    <div className="cost-legend__item cost-legend__item--ocr">
                      <span className="cost-legend__dot" />
                      <span className="cost-legend__label">OCR</span>
                      <span className="cost-legend__value">{formatCost(ocrCost)}</span>
                      <span className="cost-legend__percent">({ocrPercent.toFixed(1)}%)</span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          {/* 부가 정보 */}
          <div className="cost-hero__meta">
            <span className="cost-hero__meta-item">
              <span className="cost-hero__meta-label">AI 토큰</span>
              <span className="cost-hero__meta-value">{formatTokens(overview?.total_tokens || 0)}</span>
            </span>
            <span className="cost-hero__meta-divider">|</span>
            <span className="cost-hero__meta-item">
              <span className="cost-hero__meta-label">OCR 페이지</span>
              <span className="cost-hero__meta-value">{(ocrOverview?.page_count || 0).toLocaleString()}p</span>
            </span>
            <span className="cost-hero__meta-divider">|</span>
            <span className="cost-hero__meta-item">
              <span className="cost-hero__meta-label">총 크레딧</span>
              <span className="cost-hero__meta-value">{formatCredits(totalCredits)} cr</span>
            </span>
            <span className="cost-hero__meta-divider">|</span>
            <span className="cost-hero__meta-item">
              <span className="cost-hero__meta-label">등록 사용자</span>
              <span className="cost-hero__meta-value">{overview?.total_users || 0}명</span>
            </span>
          </div>
        </div>
      </section>

      {/* ======================================================
          AI vs OCR 비용 상세 - 병렬 배치
          ====================================================== */}
      <section className="ai-usage-page__section">
        <div className="cost-details-row">
          {/* AI 비용 상세 */}
          <div className="cost-detail cost-detail--ai">
            <div className="cost-detail__header">
              <h3 className="cost-detail__title">
                <span className="cost-detail__icon cost-detail__icon--ai">AI</span>
                AI 비용 상세
              </h3>
              <span className="cost-detail__total">{formatCost(overview?.estimated_cost_usd || 0)}</span>
            </div>

            <div className="cost-detail__items">
              {(() => {
                const sources = [
                  { key: 'doc_embedding', label: '임베딩', color: '#FF9500', tokens: overview?.by_source?.doc_embedding || 0 },
                  { key: 'rag_api', label: 'RAG API', color: '#007AFF', tokens: overview?.by_source?.rag_api || 0 },
                  { key: 'n8n_docsummary', label: '문서요약', color: '#34C759', tokens: overview?.by_source?.n8n_docsummary || 0 },
                  { key: 'chat', label: 'AI 채팅', color: '#AF52DE', tokens: overview?.by_source?.chat || 0 },
                ];

                const totalTokensVal = sources.reduce((sum, s) => sum + s.tokens, 0);
                const totalAiCost = overview?.estimated_cost_usd || 0;

                const sourcesWithCost = sources.map(s => ({
                  ...s,
                  percent: totalTokensVal > 0 ? (s.tokens / totalTokensVal * 100) : 0,
                  cost: totalTokensVal > 0 ? (s.tokens / totalTokensVal * totalAiCost) : 0,
                  credits: tokensToCredits(s.tokens),
                })).sort((a, b) => b.cost - a.cost);

                return sourcesWithCost.map((source) => (
                  <div key={source.key} className="cost-item">
                    <div className="cost-item__row">
                      <span className="cost-item__dot" data-source={source.key} />
                      <span className="cost-item__label">{source.label}</span>
                      <span className="cost-item__cost">{formatCost(source.cost)}</span>
                    </div>
                    <div className="cost-item__bar">
                      <div
                        className="cost-item__bar-fill"
                        data-source={source.key}
                        ref={(el) => { if (el) el.style.width = `${source.percent}%`; }}
                      />
                    </div>
                    <div className="cost-item__meta">
                      <span>{source.percent.toFixed(1)}%</span>
                      <span>{formatTokens(source.tokens)} tokens</span>
                      <span>{formatCredits(source.credits)} cr</span>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* OCR 비용 상세 */}
          <div className="cost-detail cost-detail--ocr">
            <div className="cost-detail__header">
              <h3 className="cost-detail__title">
                <span className="cost-detail__icon cost-detail__icon--ocr">OCR</span>
                OCR 비용 상세
              </h3>
              <span className="cost-detail__total">{formatCost(ocrOverview?.estimated_cost_usd || 0)}</span>
            </div>

            <div className="cost-detail__ocr-content">
              <div className="ocr-formula">
                <span className="ocr-formula__pages">{(ocrOverview?.page_count || 0).toLocaleString()} 페이지</span>
                <span className="ocr-formula__x">×</span>
                <span className="ocr-formula__rate">$0.0015/page</span>
                <span className="ocr-formula__eq">=</span>
                <span className="ocr-formula__result">{formatCost(ocrOverview?.estimated_cost_usd || 0)}</span>
              </div>

              <div className="ocr-stats">
                <div className="ocr-stat">
                  <span className="ocr-stat__label">크레딧</span>
                  <span className="ocr-stat__value">{formatCredits(ocrCredits)} cr</span>
                </div>
                <div className="ocr-stat">
                  <span className="ocr-stat__label">처리 건수</span>
                  <span className="ocr-stat__value">{ocrOverview?.ocr_count || 0}건</span>
                </div>
                <div className="ocr-stat">
                  <span className="ocr-stat__label">누적 페이지</span>
                  <span className="ocr-stat__value">{(ocrOverview?.pages_total || 0).toLocaleString()}p</span>
                </div>
              </div>

              <div className="ocr-status">
                <span className="ocr-status__item">
                  <span className="ocr-status__dot ocr-status__dot--pending" />
                  대기 {ocrOverview?.ocr_pending || 0}
                </span>
                <span className="ocr-status__item">
                  <span className="ocr-status__dot ocr-status__dot--processing" />
                  처리중 {ocrOverview?.ocr_processing || 0}
                </span>
                <span className="ocr-status__item">
                  <span className="ocr-status__dot ocr-status__dot--failed" />
                  실패 {ocrOverview?.ocr_failed || 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 차트 - AI/OCR 사용량 추이 (병렬 배치) */}
      <section className="ai-usage-page__section">
        <div className="ai-usage-page__charts-row">
          {/* AI 토큰 사용량 추이 */}
          <div className="ai-usage-page__chart-wrapper">
            <h3 className="ai-usage-page__chart-title">
              AI 토큰 사용량 <span className="ai-usage-page__period-label">({periodLabel})</span>
            </h3>
            <div className="ai-usage-page__line-chart-container ai-usage-page__line-chart-container--compact">
              {chartData.length === 0 ? (
                <div className="ai-usage-page__chart-empty">사용 데이터가 없습니다</div>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis
                      dataKey={periodType === 'hourly' ? 'hour' : periodType === 'monthly' ? 'month' : periodType === 'yearly' ? 'year' : 'day'}
                      tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }}
                      stroke="var(--color-border)"
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: 'var(--color-text-tertiary)' }}
                      stroke="var(--color-border)"
                      tickFormatter={(value) => formatTokens(value)}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      verticalAlign="top"
                      height={20}
                      wrapperStyle={{ fontSize: '10px' }}
                    />
                    <Bar dataKey="doc_embedding" name="Embed" fill="#FF9500" stackId="stack" />
                    <Bar dataKey="n8n_docsummary" name="Summary" fill="#34C759" stackId="stack" />
                    <Bar dataKey="rag_api" name="RAG" fill="#007AFF" stackId="stack" />
                    <Bar dataKey="chat" name="Chat" fill="#AF52DE" stackId="stack" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* OCR 처리 추이 차트 */}
          {periodType !== 'hourly' && (
            <div className="ai-usage-page__chart-wrapper">
              <h3 className="ai-usage-page__chart-title">
                OCR 처리 추이 <span className="ai-usage-page__period-label">({periodLabel})</span>
              </h3>
              <div className="ai-usage-page__line-chart-container ai-usage-page__line-chart-container--compact">
                {ocrChartData.length === 0 ? (
                  <div className="ai-usage-page__chart-empty">OCR 데이터가 없습니다</div>
                ) : (
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={ocrChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis
                        dataKey={periodType === 'monthly' ? 'month' : periodType === 'yearly' ? 'year' : 'day'}
                        tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }}
                        stroke="var(--color-border)"
                      />
                      <YAxis
                        tick={{ fontSize: 9, fill: 'var(--color-text-tertiary)' }}
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
                        height={20}
                        wrapperStyle={{ fontSize: '10px' }}
                      />
                      <Bar dataKey="done" name="성공" fill="#34C759" stackId="stack" />
                      <Bar dataKey="error" name="실패" fill="#FF3B30" stackId="stack" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

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

      {/* ======================================================
          임베딩 처리 현황
          ====================================================== */}
      <section className="ai-usage-page__section">
        <div className="embed-section__header">
          <h2 className="ai-usage-page__section-title">임베딩 처리 현황</h2>
          <div className="embed-section__actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refetchFailedEmbeddings()}
            >
              새로고침
            </Button>
            {failedEmbeddings && failedEmbeddings.documents.length > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => reprocessAllMutation.mutate()}
                disabled={reprocessAllMutation.isPending}
              >
                {reprocessAllMutation.isPending ? '재시도 중...' : `전체 재시도 (${failedEmbeddings.documents.length}건)`}
              </Button>
            )}
          </div>
        </div>

        {/* 임베딩 상태 요약 카드 */}
        {embedSummary && (
          <div className="embed-summary">
            <div className="embed-summary__item">
              <span className="embed-summary__value">{embedSummary.total}</span>
              <span className="embed-summary__label">전체 문서</span>
            </div>
            <div className="embed-summary__item embed-summary__item--done">
              <span className="embed-summary__value">{embedSummary.done}</span>
              <span className="embed-summary__label">완료</span>
            </div>
            <div className="embed-summary__item embed-summary__item--pending">
              <span className="embed-summary__value">{embedSummary.pending}</span>
              <span className="embed-summary__label">처리중</span>
            </div>
            <div className="embed-summary__item embed-summary__item--failed">
              <span className="embed-summary__value">{embedSummary.failed}</span>
              <span className="embed-summary__label">실패</span>
            </div>
            {embedFastPoll && (
              <div className="embed-summary__poll-indicator">자동 갱신 중</div>
            )}
          </div>
        )}

        {/* QUOTA_EXCEEDED 경고 배너 */}
        {failedEmbeddings && failedEmbeddings.documents.some(
          (doc: FailedEmbeddingDocument) => doc.errorCode === 'OPENAI_QUOTA_EXCEEDED'
        ) && (
          <div className="embed-alert embed-alert--quota">
            <div className="embed-alert__icon">!</div>
            <div className="embed-alert__content">
              <strong className="embed-alert__title">OpenAI API 크레딧 소진</strong>
              <p className="embed-alert__desc">
                임베딩 생성에 필요한 OpenAI 크레딧이 부족합니다. 크레딧 충전 후 "전체 재시도" 버튼을 클릭하면 대기 중인 문서가 자동으로 처리됩니다.
              </p>
              <a
                href="https://platform.openai.com/account/billing"
                target="_blank"
                rel="noopener noreferrer"
                className="embed-alert__link"
              >
                OpenAI 크레딧 충전 페이지
              </a>
            </div>
          </div>
        )}

        {/* 성공 메시지 */}
        {reprocessAllMutation.isSuccess && (
          <div className="embed-alert embed-alert--success">
            <div className="embed-alert__content">
              <strong className="embed-alert__title">재처리 요청 완료</strong>
              <p className="embed-alert__desc">
                {reprocessAllMutation.data?.data?.reset_count || 0}건의 문서가 pending 상태로 전환되었습니다.
                1분 이내에 cron이 자동으로 처리합니다.
              </p>
            </div>
          </div>
        )}

        {/* 실패 문서 테이블 */}
        {failedEmbeddingsLoading ? (
          <div className="ai-usage-page__loading ai-usage-page__loading--compact">
            로딩 중...
          </div>
        ) : !failedEmbeddings || failedEmbeddings.documents.length === 0 ? (
          <div className="embed-empty">
            <span className="embed-empty__icon">&#10003;</span>
            <span className="embed-empty__text">임베딩 실패 문서가 없습니다</span>
          </div>
        ) : (
          <div className="ai-usage-page__table-container">
            <table className="ai-usage-page__table">
              <thead>
                <tr>
                  <th>파일명</th>
                  <th>소유자</th>
                  <th>에러</th>
                  <th>재시도</th>
                  <th>실패 시각</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {failedEmbeddings.documents.map((doc: FailedEmbeddingDocument) => (
                  <tr key={doc._id}>
                    <td className="embed-table__filename" title={doc.originalName}>
                      {doc.originalName}
                    </td>
                    <td>{doc.ownerName || doc.ownerId || '-'}</td>
                    <td>
                      <span className={`embed-error-badge ${doc.errorCode === 'OPENAI_QUOTA_EXCEEDED' ? 'embed-error-badge--quota' : ''}`}>
                        {doc.errorCode}
                      </span>
                    </td>
                    <td className="embed-table__retry-count">{doc.retryCount}/3</td>
                    <td className="embed-table__time">
                      {doc.failed_at ? new Date(doc.failed_at).toLocaleString('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      }) : '-'}
                    </td>
                    <td>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => reprocessMutation.mutate(doc._id)}
                        disabled={reprocessMutation.isPending}
                      >
                        재시도
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="embed-section__note">
          재시도 클릭 시 pending 상태로 전환되며, 매분 실행되는 cron이 자동으로 임베딩을 처리합니다. 자동 재시도는 최대 3회이며, Admin 수동 재시도 시 횟수가 초기화됩니다.
        </p>
      </section>

      {/* ======================================================
          사용량 리셋 확인 모달
          ====================================================== */}
      {showResetConfirmModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowResetConfirmModal(false)}
        >
          <div
            className="modal-content reset-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="reset-modal__title">
              사용량 리셋
            </h3>

            <div className="reset-modal__body">
              <p className="reset-modal__desc">
                {resetType === 'all' && '모든 AI + OCR 사용량을 0으로 초기화합니다.'}
                {resetType === 'ai' && 'AI 사용량만 0으로 초기화합니다.'}
                {resetType === 'ocr' && 'OCR 사용량만 0으로 초기화합니다.'}
              </p>

              <div className="reset-modal__current">
                <h4>리셋 전 현황</h4>
                {(resetType === 'all' || resetType === 'ai') && (
                  <div className="reset-modal__stat">
                    <span>AI 토큰:</span>
                    <span>{formatTokens(overview?.total_tokens || 0)}</span>
                  </div>
                )}
                {(resetType === 'all' || resetType === 'ai') && (
                  <div className="reset-modal__stat">
                    <span>AI 비용:</span>
                    <span>{formatCost(overview?.estimated_cost_usd || 0)}</span>
                  </div>
                )}
                {(resetType === 'all' || resetType === 'ocr') && (
                  <div className="reset-modal__stat">
                    <span>OCR 페이지:</span>
                    <span>{(ocrOverview?.pages_total || 0).toLocaleString()} pages</span>
                  </div>
                )}
                {(resetType === 'all' || resetType === 'ocr') && (
                  <div className="reset-modal__stat">
                    <span>OCR 비용:</span>
                    <span>{formatCost(ocrOverview?.estimated_cost_usd || 0)}</span>
                  </div>
                )}
              </div>

              <div className="reset-modal__reason">
                <label htmlFor="reset-reason">리셋 사유 (선택)</label>
                <input
                  type="text"
                  id="reset-reason"
                  value={resetReason}
                  onChange={(e) => setResetReason(e.target.value)}
                  placeholder="예: 월간 정산 완료"
                  maxLength={500}
                />
              </div>

              <p className="reset-modal__note">
                리셋 이전 데이터는 이력에서 확인할 수 있습니다.
              </p>
            </div>

            <div className="reset-modal__actions">
              <Button variant="secondary" onClick={() => setShowResetConfirmModal(false)}>
                취소
              </Button>
              <Button
                variant="destructive"
                onClick={() => resetMutation.mutate({ reset_type: resetType, reason: resetReason || undefined })}
                disabled={resetMutation.isPending}
              >
                {resetMutation.isPending ? '처리중...' : '리셋 실행'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================
          리셋 이력 모달
          ====================================================== */}
      {showResetHistoryModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowResetHistoryModal(false)}
        >
          <div
            className="modal-content reset-history-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="reset-history-modal__header">
              <h3 className="reset-history-modal__title">사용량 리셋 이력</h3>
              <button
                type="button"
                className="reset-history-modal__close"
                onClick={() => setShowResetHistoryModal(false)}
              >
                &times;
              </button>
            </div>

            <div className="reset-history-modal__body">
              {!resetHistory || resetHistory.items.length === 0 ? (
                <p className="reset-history-modal__empty">리셋 이력이 없습니다.</p>
              ) : (
                <table className="reset-history-table">
                  <thead>
                    <tr>
                      <th>리셋일</th>
                      <th>유형</th>
                      <th>AI 토큰</th>
                      <th>OCR 페이지</th>
                      <th>관리자</th>
                      <th>상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resetHistory.items.map((item: UsageResetHistoryItem) => (
                      <tr key={item.reset_id}>
                        <td>
                          {new Date(item.reset_at).toLocaleDateString('ko-KR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                          })}
                        </td>
                        <td>
                          {item.reset_type === 'all' && '전체'}
                          {item.reset_type === 'ai' && 'AI'}
                          {item.reset_type === 'ocr' && 'OCR'}
                        </td>
                        <td>{item.snapshot.ai ? formatTokens(item.snapshot.ai.total_tokens) : '-'}</td>
                        <td>{item.snapshot.ocr ? `${item.snapshot.ocr.page_count.toLocaleString()} p` : '-'}</td>
                        <td>{item.reset_by.user_name}</td>
                        <td>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewResetDetail(item.reset_id)}
                          >
                            보기
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================
          리셋 상세 모달
          ====================================================== */}
      {showResetDetailModal && selectedResetDetail && (
        <div
          className="modal-overlay"
          onClick={() => setShowResetDetailModal(false)}
        >
          <div
            className="modal-content reset-detail-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="reset-detail-modal__header">
              <h3 className="reset-detail-modal__title">
                리셋 상세 - {new Date(selectedResetDetail.reset_at).toLocaleString('ko-KR')}
              </h3>
              <button
                type="button"
                className="reset-detail-modal__close"
                onClick={() => setShowResetDetailModal(false)}
              >
                &times;
              </button>
            </div>

            <div className="reset-detail-modal__body">
              <div className="reset-detail-modal__info">
                <div><strong>리셋 유형:</strong> {
                  selectedResetDetail.reset_type === 'all' ? '전체 (AI + OCR)' :
                  selectedResetDetail.reset_type === 'ai' ? 'AI만' : 'OCR만'
                }</div>
                <div><strong>관리자:</strong> {selectedResetDetail.reset_by.user_name}</div>
                {selectedResetDetail.reason && (
                  <div><strong>사유:</strong> {selectedResetDetail.reason}</div>
                )}
              </div>

              {selectedResetDetail.snapshot.ai && (
                <div className="reset-detail-modal__section">
                  <h4>AI 사용량 스냅샷</h4>
                  <div className="reset-detail-modal__stats">
                    <div><span>총 토큰:</span> <span>{selectedResetDetail.snapshot.ai.total_tokens.toLocaleString()}</span></div>
                    <div><span>예상 비용:</span> <span>{formatCost(selectedResetDetail.snapshot.ai.estimated_cost_usd)}</span></div>
                  </div>
                </div>
              )}

              {selectedResetDetail.snapshot.ocr && (
                <div className="reset-detail-modal__section">
                  <h4>OCR 사용량 스냅샷</h4>
                  <div className="reset-detail-modal__stats">
                    <div><span>총 페이지:</span> <span>{selectedResetDetail.snapshot.ocr.page_count.toLocaleString()}</span></div>
                    <div><span>예상 비용:</span> <span>{formatCost(selectedResetDetail.snapshot.ocr.estimated_cost_usd)}</span></div>
                  </div>
                </div>
              )}

              {selectedResetDetail.user_snapshots && selectedResetDetail.user_snapshots.length > 0 && (
                <div className="reset-detail-modal__section">
                  <h4>Top 사용자 스냅샷</h4>
                  <table className="reset-detail-table">
                    <thead>
                      <tr>
                        <th>사용자</th>
                        <th>AI 토큰</th>
                        <th>OCR 페이지</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedResetDetail.user_snapshots.map((user, idx) => (
                        <tr key={idx}>
                          <td>{user.user_name}</td>
                          <td>{user.ai_tokens.toLocaleString()}</td>
                          <td>{user.ocr_pages.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
