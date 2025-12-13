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

export interface TopUser {
  user_id: string;
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

export interface TopUsersResponse {
  success: boolean;
  data: TopUser[];
}

export interface UserAIUsageResponse {
  success: boolean;
  data: AIUsageOverview;
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
   * 시스템 일별 사용량
   */
  getDailyUsage: async (days: number = 30): Promise<DailyUsagePoint[]> => {
    const res = await apiClient.get<DailyUsageResponse>(
      `/api/admin/ai-usage/daily?days=${days}`
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
   * 특정 사용자 AI 사용량
   */
  getUserUsage: async (userId: string, days: number = 30): Promise<AIUsageOverview> => {
    const res = await apiClient.get<UserAIUsageResponse>(
      `/api/admin/users/${userId}/ai-usage?days=${days}`
    );
    return res.data;
  },
};
