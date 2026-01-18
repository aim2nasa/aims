/**
 * AI Usage Admin API
 * @since 2025-12-13
 */

import { apiClient } from '@/shared/api/apiClient';

export interface AIUsageOverview {
  period_days: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost_usd: number;
  request_count: number;
  unique_users: number;
  total_users: number;  // 전체 등록 사용자 수
  by_source: {
    chat?: number;
    rag_api?: number;
    n8n_docsummary?: number;  // doc_summary (FastAPI)
    doc_embedding?: number;
  };
}

export interface DailyUsagePoint {
  date: string;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost_usd: number;
  request_count: number;
}

export interface DailyUsageBySourcePoint {
  date: string;
  chat: number;
  rag_api: number;
  n8n_docsummary: number;  // doc_summary (FastAPI)
  doc_embedding: number;
  total_tokens: number;
  estimated_cost_usd: number;
  request_count: number;
}

export interface HourlyUsagePoint {
  timestamp: string;
  chat: number;
  rag_api: number;
  n8n_docsummary: number;  // doc_summary (FastAPI)
  doc_embedding: number;
  total: number;
}

export interface TopUser {
  user_id: string;
  user_name: string;
  total_tokens: number;
  request_count: number;
  estimated_cost_usd: number;
}

export interface AIUsageOverviewResponse {
  success: boolean;
  data: AIUsageOverview;
}

export interface DailyUsageResponse {
  success: boolean;
  data: DailyUsagePoint[];
}

export interface DailyUsageBySourceResponse {
  success: boolean;
  data: DailyUsageBySourcePoint[];
}

export interface TopUsersResponse {
  success: boolean;
  data: TopUser[];
}

export interface UserAIUsageResponse {
  success: boolean;
  data: AIUsageOverview;
}

export interface HourlyUsageResponse {
  success: boolean;
  data: HourlyUsagePoint[];
}

// AI 모델 설정 타입
export interface AIModelServiceSettings {
  model: string;
  description: string;
  availableModels: string[];
}

export interface AnnualReportServiceSettings extends AIModelServiceSettings {
  parser: string;  // 'openai' | 'pdfplumber' | 'pdfplumber_table' | 'upstage'
  availableParsers: string[];
}

export interface CustomerReviewServiceSettings extends AIModelServiceSettings {
  parser: string;  // 'regex' | 'pdfplumber_table'
  availableParsers: string[];
}

export interface AIModelSettings {
  chat: AIModelServiceSettings;
  rag: AIModelServiceSettings;
  annualReport: AnnualReportServiceSettings;
  customerReview: CustomerReviewServiceSettings;
}

// 업데이트용 타입 (부분 업데이트 지원)
export interface AIModelSettingsUpdate {
  chat?: Partial<AIModelServiceSettings>;
  rag?: Partial<AIModelServiceSettings>;
  annualReport?: Partial<AnnualReportServiceSettings>;
  customerReview?: Partial<CustomerReviewServiceSettings>;
}

export interface AIModelSettingsResponse {
  success: boolean;
  data: AIModelSettings;
}

// OCR Usage Types
export interface OCRUsageOverview {
  start_date: string;
  end_date: string;
  ocr_count: number;
  ocr_total: number;
  active_users: number;
  ocr_pending: number;
  ocr_processing: number;
  ocr_failed: number;
  page_count: number;
  pages_total: number;
  estimated_cost_usd: number;
  estimated_cost_krw: number;
}

export interface OCRDailyUsagePoint {
  date: string;
  done: number;
  error: number;
  page_count: number;
}

export interface OCRHourlyUsagePoint {
  timestamp: string;
  done: number;
  error: number;
}

export interface OCRTopUser {
  rank: number;
  user_id: string;
  user_name: string;
  ocr_count: number;
  page_count: number;
  estimated_cost_usd: number;
  error_count: number;
  last_ocr_at: string;
}

export interface OCRUsageOverviewResponse {
  success: boolean;
  data: OCRUsageOverview;
}

export interface OCRDailyUsageResponse {
  success: boolean;
  data: OCRDailyUsagePoint[];
}

export interface OCRHourlyUsageResponse {
  success: boolean;
  data: OCRHourlyUsagePoint[];
}

export interface OCRTopUsersResponse {
  success: boolean;
  data: OCRTopUser[];
}

// 숫자 포맷팅 함수들
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M tk`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K tk`;
  }
  return `${tokens.toLocaleString()} tk`;
}

export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

// 크레딧 환산 상수 (TIER_PRICING_POLICY.md 기준)
export const CREDIT_RATES = {
  OCR_PER_PAGE: 2,        // OCR 1페이지 = 2 크레딧
  AI_PER_1K_TOKENS: 0.5   // AI 1K 토큰 = 0.5 크레딧
};

/**
 * AI 토큰을 크레딧으로 환산
 */
export function tokensToCredits(tokens: number): number {
  return (tokens / 1000) * CREDIT_RATES.AI_PER_1K_TOKENS;
}

/**
 * OCR 페이지를 크레딧으로 환산
 */
export function pagesToCredits(pages: number): number {
  return pages * CREDIT_RATES.OCR_PER_PAGE;
}

/**
 * 크레딧 포맷팅
 */
export function formatCredits(credits: number): string {
  if (credits >= 1000) {
    return `${(credits / 1000).toFixed(1)}K`;
  }
  return credits.toFixed(1);
}

export const aiUsageApi = {
  /**
   * 시스템 전체 AI 사용량 통계
   */
  getOverview: async (days: number = 30): Promise<AIUsageOverview> => {
    const res = await apiClient.get<AIUsageOverviewResponse>(
      `/api/admin/ai-usage/overview?days=${days}`
    );
    return res.data;
  },

  /**
   * 시스템 전체 AI 사용량 통계 (날짜 범위)
   */
  getOverviewByRange: async (start: string, end: string): Promise<AIUsageOverview> => {
    const res = await apiClient.get<AIUsageOverviewResponse>(
      `/api/admin/ai-usage/overview?start=${start}&end=${end}`
    );
    return res.data;
  },

  /**
   * 시스템 일별 사용량
   */
  getDailyUsage: async (days: number = 30): Promise<DailyUsagePoint[]> => {
    const res = await apiClient.get<DailyUsageResponse>(
      `/api/admin/ai-usage/daily?days=${days}`
    );
    return res.data;
  },

  /**
   * 시스템 일별 사용량 (날짜 범위, 소스별 분리)
   */
  getDailyUsageByRange: async (start: string, end: string): Promise<DailyUsageBySourcePoint[]> => {
    const res = await apiClient.get<DailyUsageBySourceResponse>(
      `/api/admin/ai-usage/daily?start=${start}&end=${end}`
    );
    return res.data;
  },

  /**
   * Top 10 사용자 목록
   */
  getTopUsers: async (days: number = 30): Promise<TopUser[]> => {
    const res = await apiClient.get<TopUsersResponse>(
      `/api/admin/ai-usage/top-users?days=${days}`
    );
    return res.data;
  },

  /**
   * Top 10 사용자 목록 (날짜 범위)
   */
  getTopUsersByRange: async (start: string, end: string): Promise<TopUser[]> => {
    const res = await apiClient.get<TopUsersResponse>(
      `/api/admin/ai-usage/top-users?start=${start}&end=${end}`
    );
    return res.data;
  },

  /**
   * 특정 사용자 AI 사용량
   */
  getUserUsage: async (userId: string, days: number = 30): Promise<AIUsageOverview> => {
    const res = await apiClient.get<UserAIUsageResponse>(
      `/api/admin/users/${userId}/ai-usage?days=${days}`
    );
    return res.data;
  },

  /**
   * 시간별 사용량 (소스별 분리, 라인 차트용)
   */
  getHourlyUsage: async (hours: number = 24): Promise<HourlyUsagePoint[]> => {
    const res = await apiClient.get<HourlyUsageResponse>(
      `/api/admin/ai-usage/hourly?hours=${hours}`
    );
    return res.data;
  },

  /**
   * AI 모델 설정 조회
   */
  getAIModelSettings: async (): Promise<AIModelSettings> => {
    const res = await apiClient.get<AIModelSettingsResponse>(
      `/api/settings/ai-models`
    );
    return res.data;
  },

  /**
   * AI 모델 설정 수정
   */
  updateAIModelSettings: async (updates: AIModelSettingsUpdate): Promise<AIModelSettings> => {
    const res = await apiClient.put<AIModelSettingsResponse>(
      `/api/settings/ai-models`,
      updates
    );
    return res.data;
  },

  /**
   * AI 모델 설정 초기화
   */
  resetAIModelSettings: async (): Promise<AIModelSettings> => {
    const res = await apiClient.post<AIModelSettingsResponse>(
      `/api/settings/ai-models/reset`
    );
    return res.data;
  },

  // =====================
  // OCR Usage API
  // =====================

  /**
   * OCR 전체 통계
   */
  getOCROverview: async (days: number = 30): Promise<OCRUsageOverview> => {
    const res = await apiClient.get<OCRUsageOverviewResponse>(
      `/api/admin/ocr-usage/overview?days=${days}`
    );
    return res.data;
  },

  /**
   * OCR 전체 통계 (날짜 범위)
   */
  getOCROverviewByRange: async (start: string, end: string): Promise<OCRUsageOverview> => {
    const res = await apiClient.get<OCRUsageOverviewResponse>(
      `/api/admin/ocr-usage/overview?start=${start}&end=${end}`
    );
    return res.data;
  },

  /**
   * OCR 시간별 사용량
   */
  getOCRHourlyUsage: async (hours: number = 24): Promise<OCRHourlyUsagePoint[]> => {
    const res = await apiClient.get<OCRHourlyUsageResponse>(
      `/api/admin/ocr-usage/hourly?hours=${hours}`
    );
    return res.data;
  },

  /**
   * OCR 일별 사용량 (날짜 범위)
   */
  getOCRDailyUsageByRange: async (start: string, end: string): Promise<OCRDailyUsagePoint[]> => {
    const res = await apiClient.get<OCRDailyUsageResponse>(
      `/api/admin/ocr-usage/daily?start=${start}&end=${end}`
    );
    return res.data;
  },

  /**
   * OCR Top 사용자
   */
  getOCRTopUsers: async (days: number = 30): Promise<OCRTopUser[]> => {
    const res = await apiClient.get<OCRTopUsersResponse>(
      `/api/admin/ocr-usage/top-users?days=${days}`
    );
    return res.data;
  },

  /**
   * OCR Top 사용자 (날짜 범위)
   */
  getOCRTopUsersByRange: async (start: string, end: string): Promise<OCRTopUser[]> => {
    const res = await apiClient.get<OCRTopUsersResponse>(
      `/api/admin/ocr-usage/top-users?start=${start}&end=${end}`
    );
    return res.data;
  },
};
