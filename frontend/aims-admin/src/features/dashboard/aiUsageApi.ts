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
  by_source: {
    rag_api?: number;
    n8n_docsummary?: number;
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
  rag_api: number;
  n8n_docsummary: number;
  doc_embedding: number;
  total_tokens: number;
  estimated_cost_usd: number;
  request_count: number;
}

export interface HourlyUsagePoint {
  timestamp: string;
  rag_api: number;
  n8n_docsummary: number;
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
  parser: string;  // 'openai' | 'pdfplumber' | 'upstage'
  availableParsers: string[];
}

export interface AIModelSettings {
  chat: AIModelServiceSettings;
  rag: AIModelServiceSettings;
  annualReport: AnnualReportServiceSettings;
}

// 업데이트용 타입 (부분 업데이트 지원)
export interface AIModelSettingsUpdate {
  chat?: Partial<AIModelServiceSettings>;
  rag?: Partial<AIModelServiceSettings>;
  annualReport?: Partial<AnnualReportServiceSettings>;
}

export interface AIModelSettingsResponse {
  success: boolean;
  data: AIModelSettings;
}

// 숫자 포맷팅 함수들
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toLocaleString();
}

export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
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
};
