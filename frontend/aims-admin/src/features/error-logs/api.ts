/**
 * Error Logs API
 * 시스템 에러 로그 API 모듈
 * @since 2025-12-22
 */

import { apiClient } from '@/shared/api/apiClient';

// ============================================================
// Types
// ============================================================

export interface ErrorLogActor {
  user_id: string | null;
  name: string | null;
  role: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

export interface ErrorLogSource {
  type: 'frontend' | 'backend';
  endpoint?: string;
  method?: string;
  component?: string;
  url?: string;
  file?: string;
  line?: number;
  column?: number;
}

export interface ErrorLogError {
  type: string;
  code?: string;
  message: string;
  stack?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'api' | 'network' | 'timeout' | 'validation' | 'runtime' | 'unhandled';
}

export interface ErrorLogMeta {
  resolved: boolean;
  resolved_by?: string;
  resolved_at?: string;
  notes?: string;
}

export interface ErrorLog {
  _id: string;
  actor: ErrorLogActor;
  timestamp: string;
  source: ErrorLogSource;
  error: ErrorLogError;
  context: {
    request_id?: string;
    browser?: string;
    os?: string;
    version?: string;
    payload?: Record<string, unknown>;
    response_status?: number;
    componentStack?: string;
  };
  meta: ErrorLogMeta;
}

export interface ErrorLogStats {
  total: number;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
  period: string;
}

export interface ErrorLogListResponse {
  success: boolean;
  logs: ErrorLog[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ErrorLogStatsResponse {
  success: boolean;
  stats: ErrorLogStats;
}

export interface GetErrorLogsParams {
  page?: number;
  limit?: number;
  source?: 'frontend' | 'backend';
  severity?: string;
  category?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  resolved?: boolean;
}

// ============================================================
// API Functions
// ============================================================

export const errorLogsApi = {
  /**
   * 에러 로그 목록 조회
   */
  getList: async (params: GetErrorLogsParams = {}): Promise<{ logs: ErrorLog[]; pagination: ErrorLogListResponse['pagination'] }> => {
    const queryParams = new URLSearchParams();

    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.source) queryParams.append('type', params.source); // 백엔드는 'type' 파라미터 사용
    if (params.severity) queryParams.append('severity', params.severity);
    if (params.category) queryParams.append('category', params.category);
    if (params.userId) queryParams.append('userId', params.userId);
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.search) queryParams.append('search', params.search);
    if (params.resolved !== undefined) queryParams.append('resolved', params.resolved.toString());

    const queryString = queryParams.toString();
    const endpoint = queryString
      ? `/api/admin/error-logs?${queryString}`
      : '/api/admin/error-logs';

    const response = await apiClient.get<ErrorLogListResponse>(endpoint);
    return { logs: response.logs || [], pagination: response.pagination };
  },

  /**
   * 에러 로그 통계 조회
   */
  getStats: async (days: number = 7): Promise<ErrorLogStats> => {
    const response = await apiClient.get<ErrorLogStatsResponse>(
      `/api/admin/error-logs/stats?days=${days}`
    );
    return response.stats;
  },

  /**
   * 단일 에러 로그 삭제
   */
  deleteOne: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/admin/error-logs/${id}`);
  },

  /**
   * 여러 에러 로그 일괄 삭제
   */
  deleteMany: async (ids: string[]): Promise<void> => {
    // apiClient.delete가 body를 지원하지 않으므로 직접 fetch 사용
    const token = localStorage.getItem('aims-admin-token');
    const baseURL = import.meta.env.VITE_API_BASE_URL || '';

    const response = await fetch(`${baseURL}/api/admin/error-logs`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ ids }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Delete failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }
  },

  /**
   * 에러 해결됨으로 표시
   */
  markResolved: async (id: string, notes?: string): Promise<void> => {
    await apiClient.put(`/api/admin/error-logs/${id}/resolve`, { notes });
  },
};

// ============================================================
// Utility Functions
// ============================================================

/**
 * 날짜를 읽기 쉬운 형식으로 변환
 */
export const formatDateTime = (dateString?: string | null): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`;
};

/**
 * 상대 시간 표시
 */
export const formatRelativeTime = (dateString?: string | null): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return '방금 전';
  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;
  return formatDateTime(dateString);
};

/**
 * 심각도 레이블
 */
export const SEVERITY_LABELS: Record<string, string> = {
  low: '낮음',
  medium: '보통',
  high: '높음',
  critical: '치명적',
};

/**
 * 카테고리 레이블
 */
export const CATEGORY_LABELS: Record<string, string> = {
  api: 'API',
  network: '네트워크',
  timeout: '타임아웃',
  validation: '유효성검사',
  runtime: '런타임',
  unhandled: '처리안됨',
};

/**
 * 소스 레이블
 */
export const SOURCE_LABELS: Record<string, string> = {
  frontend: '프론트엔드',
  backend: '백엔드',
};
