/**
 * User Activity API
 * 사용자 활동 현황 API 모듈
 * @since 2025-12-14
 */

import { apiClient } from '@/shared/api/apiClient';

// ============================================================
// Types
// ============================================================

// AI 소스별 사용량
export interface AISourceUsage {
  tokens: number;
  cost: number;
}

export interface UserActivitySummary {
  user_id: string;
  name: string;
  email: string;
  role: string;
  tier: string;
  document_count: number;
  customer_count: number;
  // AI 사용량
  ai_tokens_30d: number;
  ai_cost_30d: number;
  ai_by_source: Record<string, AISourceUsage>; // chat, embed, rag, summary
  // OCR 사용량
  ocr_count_30d: number;
  ocr_pages_30d: number;
  ocr_cost_30d: number;
  // 크레딧
  credits_used: number;
  credits_ocr: number;
  credits_ai: number;
  // 티어 한도
  credit_quota: number;
  ocr_page_quota: number;
  // 한도 초과 여부
  credit_exceeded: boolean;
  ocr_exceeded: boolean;
  storage_exceeded: boolean;
  any_limit_exceeded: boolean;
  // 사용률 (%)
  credit_usage_percent: number;
  ocr_usage_percent: number;
  // 스토리지
  storage_used_bytes: number;
  storage_quota_bytes: number;
  error_count_7d: number;
  last_activity_at: string | null;
  created_at: string;
}

export interface UserActivityListResponse {
  success: boolean;
  data: {
    users: UserActivitySummary[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  };
}

export interface UserDetail {
  id: string;
  name: string;
  email: string;
  role: string;
  tier: string;
  storage: {
    used_bytes: number;
    quota_bytes: number;
    usage_percent: number;
  };
  created_at: string;
  last_login: string | null;
}

export interface ActivitySummary {
  documents: {
    total: number;
    this_month: number;
    by_status: Record<string, number>;
  };
  customers: {
    total: number;
    active: number;
    dormant: number;
  };
  ai_usage: {
    total_tokens: number;
    by_source: Record<string, number>;
  };
  ocr_usage: {
    total: number;
    this_month: number;
    total_pages: number;
    this_month_pages: number;
  };
}

export interface RecentActivity {
  document_id: string;
  document_name: string;
  status: string;
  ocr_status?: string;
  embed_status?: string;
  ocr_completed_at?: string;
  embed_completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface UserDetailResponse {
  success: boolean;
  data: {
    user: UserDetail;
    activity_summary: ActivitySummary;
    recent_activity: RecentActivity[];
  };
}

export interface UserError {
  type: 'ocr_failed' | 'embed_failed' | 'processing_failed' | 'unknown';
  document_id: string;
  document_name: string;
  error_message: string;
  occurred_at: string;
}

export interface UserErrorsResponse {
  success: boolean;
  data: {
    user_id: string;
    period_days: number;
    error_count: number;
    errors: UserError[];
  };
}

// ============================================================
// Activity Log Types
// ============================================================

export interface ActivityLogActor {
  user_id: string | null;
  name: string | null;
  email: string | null;
  role: string;
  ip_address: string | null;
  user_agent: string | null;
}

export interface ActivityLogLocation {
  endpoint: string | null;
  method: string | null;
  feature: string | null;
  menu_path: string | null;
}

export interface ActivityLogAction {
  type: string;
  category: string;
  description: string;
  target: {
    entity_type: string | null;
    entity_id: string | null;
    entity_name: string | null;
    parent_id: string | null;
    parent_name: string | null;
  } | null;
  changes: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    changed_fields?: string[];
  } | null;
  bulk_count: number | null;
}

export interface ActivityLogResult {
  success: boolean;
  status_code: number | null;
  error: {
    code: string | null;
    message: string | null;
  } | null;
  affected_count: number | null;
  duration_ms: number | null;
}

export interface ActivityLog {
  _id: string;
  actor: ActivityLogActor;
  timestamp: string;
  location: ActivityLogLocation;
  action: ActivityLogAction;
  result: ActivityLogResult;
  meta: {
    request_id: string;
    session_id: string | null;
    correlation_id: string | null;
  };
}

export interface ActivityLogListResponse {
  success: boolean;
  data: {
    logs: ActivityLog[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  };
}

export interface UserActivityLogsResponse {
  success: boolean;
  data: {
    user_id: string;
    logs: ActivityLog[];
    summary: {
      total: number;
      success: number;
      failure: number;
      byCategory: Record<string, { success: number; failure: number }>;
    };
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  };
}

export interface GetActivityLogsParams {
  page?: number;
  limit?: number;
  userId?: string;
  category?: string;
  success?: boolean;
  startDate?: string;
  endDate?: string;
}

export interface GetUserActivityListParams {
  page?: number;
  limit?: number;
  search?: string;
  tier?: string;
  role?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ============================================================
// API Functions
// ============================================================

export const userActivityApi = {
  /**
   * 전체 사용자 활동 요약 목록 조회
   */
  getList: async (params: GetUserActivityListParams = {}): Promise<UserActivityListResponse['data']> => {
    const queryParams = new URLSearchParams();

    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.tier) queryParams.append('tier', params.tier);
    if (params.role) queryParams.append('role', params.role);
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);

    const queryString = queryParams.toString();
    const endpoint = queryString
      ? `/api/admin/user-activity/list?${queryString}`
      : '/api/admin/user-activity/list';

    const response = await apiClient.get<UserActivityListResponse>(endpoint);
    return response.data;
  },

  /**
   * 특정 사용자 상세 활동 정보 조회
   */
  getDetail: async (userId: string): Promise<UserDetailResponse['data']> => {
    const response = await apiClient.get<UserDetailResponse>(
      `/api/admin/user-activity/${userId}/detail`
    );
    return response.data;
  },

  /**
   * 특정 사용자의 오류 목록 조회
   */
  getErrors: async (userId: string, days: number = 7): Promise<UserErrorsResponse['data']> => {
    const response = await apiClient.get<UserErrorsResponse>(
      `/api/admin/user-activity/${userId}/errors?days=${days}`
    );
    return response.data;
  },

  /**
   * 전체 활동 로그 조회 (관리자용)
   */
  getActivityLogs: async (params: GetActivityLogsParams = {}): Promise<ActivityLogListResponse['data']> => {
    const queryParams = new URLSearchParams();

    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.userId) queryParams.append('userId', params.userId);
    if (params.category) queryParams.append('category', params.category);
    if (params.success !== undefined) queryParams.append('success', params.success.toString());
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);

    const queryString = queryParams.toString();
    const endpoint = queryString
      ? `/api/admin/activity-logs?${queryString}`
      : '/api/admin/activity-logs';

    const response = await apiClient.get<ActivityLogListResponse>(endpoint);
    return response.data;
  },

  /**
   * 특정 사용자의 활동 로그 조회
   */
  getUserActivityLogs: async (
    userId: string,
    params: Omit<GetActivityLogsParams, 'userId'> = {}
  ): Promise<UserActivityLogsResponse['data']> => {
    const queryParams = new URLSearchParams();

    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.category) queryParams.append('category', params.category);
    if (params.success !== undefined) queryParams.append('success', params.success.toString());
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);

    const queryString = queryParams.toString();
    const endpoint = queryString
      ? `/api/admin/activity-logs/${userId}?${queryString}`
      : `/api/admin/activity-logs/${userId}`;

    const response = await apiClient.get<UserActivityLogsResponse>(endpoint);
    return response.data;
  },
};

// ============================================================
// Utility Functions
// ============================================================

/**
 * 바이트를 읽기 쉬운 형식으로 변환
 */
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  if (bytes < 0) return '무제한';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

/**
 * 토큰 수를 읽기 쉬운 형식으로 변환
 */
export const formatTokens = (tokens: number): string => {
  if (tokens >= 1000000) {
    return (tokens / 1000000).toFixed(1) + 'M';
  }
  if (tokens >= 1000) {
    return (tokens / 1000).toFixed(1) + 'K';
  }
  return tokens.toString();
};

/**
 * 비용을 USD 형식으로 변환
 */
export const formatCost = (cost: number): string => {
  if (cost === 0) return '-';
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
};

/**
 * 크레딧을 읽기 쉬운 형식으로 변환
 */
export const formatCredits = (credits: number): string => {
  if (credits === 0) return '0';
  if (credits < 0) return '무제한';
  if (credits >= 10000) {
    return (credits / 1000).toFixed(1) + 'K';
  }
  if (credits >= 100) {
    return Math.round(credits).toLocaleString();
  }
  return credits.toFixed(1);
};

/**
 * 사용률을 포맷팅 (%)
 */
export const formatUsagePercent = (percent: number, quota: number): string => {
  if (quota <= 0) return '∞';
  return `${percent}%`;
};

/**
 * 날짜를 읽기 쉬운 형식으로 변환
 */
export const formatDateTime = (dateString?: string | null): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace(/\. /g, '.').replace(/:/g, ':');
};

/**
 * 상대 시간 표시 (예: "3시간 전")
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
