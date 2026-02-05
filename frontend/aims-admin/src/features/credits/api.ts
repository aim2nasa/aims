/**
 * 크레딧 관리 API
 * @see docs/BONUS_CREDIT_IMPLEMENTATION.md
 */

import { apiClient } from '@/shared/api/apiClient';

// ============================================================
// 타입 정의
// ============================================================

export interface CreditPackage {
  _id: string;
  code: string;
  name: string;
  credits: number;
  price_krw: number;
  price_per_credit: number;
  description?: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BonusCreditInfo {
  balance: number;
  total_purchased: number;
  total_used: number;
  last_purchase_at: string | null;
  updated_at: string | null;
}

export interface CreditTransaction {
  _id: string;
  user_id: string;
  type: 'purchase' | 'admin_grant' | 'usage' | 'refund' | 'expiry';
  amount: number;
  balance_before: number;
  balance_after: number;
  description?: string;
  package?: {
    code: string;
    name: string;
    credits: number;
    price_krw: number;
  };
  admin?: {
    granted_by: string;
    granted_by_name: string;
    reason: string;
  };
  usage?: {
    resource_type: string;
    resource_id: string;
    credits_used: number;
    description: string;
  };
  user?: {
    name: string;
    email: string;
  };
  created_at: string;
  created_by: string;
}

export interface CreditOverview {
  total_balance: number;
  users_with_balance: number;
  month_granted: number;
  month_grant_count: number;
  month_used: number;
  month_usage_count: number;
  month_start: string;
}

export interface UserWithCredits {
  id: string;
  name: string;
  email: string;
  tier: string;
  tier_name?: string;
  monthly_quota?: number;
  monthly_used?: number;
  monthly_remaining?: number;
  bonus_balance: number;
  total_available?: number;
  last_purchase_at?: string | null;
  error?: string;
}

export interface PaginationInfo {
  total: number;
  limit: number;
  skip: number;
}

// ============================================================
// API 응답 타입
// ============================================================

export interface GetCreditOverviewResponse {
  success: boolean;
  data: CreditOverview;
}

export interface GetUsersWithCreditsResponse {
  success: boolean;
  data: {
    users: UserWithCredits[];
    pagination: PaginationInfo;
  };
}

export interface GetCreditTransactionsResponse {
  success: boolean;
  data: {
    transactions: CreditTransaction[];
    pagination: PaginationInfo;
  };
}

export interface GetCreditPackagesResponse {
  success: boolean;
  data: CreditPackage[];
}

export interface GrantCreditsResponse {
  success: boolean;
  data: {
    success: boolean;
    user_id: string;
    amount_granted: number;
    balance_before: number;
    balance_after: number;
    transaction_id: string;
    user: {
      id: string;
      name: string;
      email: string;
    };
  };
}

export interface GetUserBonusCreditsResponse {
  success: boolean;
  data: {
    user: {
      id: string;
      name: string;
      email: string;
      tier: string;
    };
    bonus_credits: BonusCreditInfo;
    credit_summary: {
      monthly_remaining: number;
      bonus_balance: number;
      total_available: number;
    };
  };
}

// ============================================================
// API 함수
// ============================================================

export const creditsApi = {
  /**
   * 크레딧 현황 요약 조회
   */
  getOverview: async (): Promise<GetCreditOverviewResponse> => {
    return apiClient.get('/api/admin/credits/overview');
  },

  /**
   * 크레딧 보유 사용자 목록 조회
   */
  getUsersWithCredits: async (params: {
    limit?: number;
    skip?: number;
    tier?: string;
    has_bonus?: boolean;
    search?: string;
  } = {}): Promise<GetUsersWithCreditsResponse> => {
    const query = new URLSearchParams();
    if (params.limit) query.append('limit', String(params.limit));
    if (params.skip) query.append('skip', String(params.skip));
    if (params.tier) query.append('tier', params.tier);
    if (params.has_bonus !== undefined) query.append('has_bonus', String(params.has_bonus));
    if (params.search) query.append('search', params.search);

    return apiClient.get(`/api/admin/users-with-credits?${query.toString()}`);
  },

  /**
   * 특정 사용자의 추가 크레딧 조회
   */
  getUserBonusCredits: async (userId: string): Promise<GetUserBonusCreditsResponse> => {
    return apiClient.get(`/api/admin/users/${userId}/bonus-credits`);
  },

  /**
   * 추가 크레딧 부여
   */
  grantCredits: async (
    userId: string,
    amount: number,
    reason: string,
    packageCode?: string
  ): Promise<GrantCreditsResponse> => {
    return apiClient.post(`/api/admin/users/${userId}/bonus-credits/grant`, {
      amount,
      reason,
      package_code: packageCode,
    });
  },

  /**
   * 전체 크레딧 이력 조회
   */
  getTransactions: async (params: {
    limit?: number;
    skip?: number;
    type?: string;
    user_id?: string;
    from?: string;
    to?: string;
  } = {}): Promise<GetCreditTransactionsResponse> => {
    const query = new URLSearchParams();
    if (params.limit) query.append('limit', String(params.limit));
    if (params.skip) query.append('skip', String(params.skip));
    if (params.type) query.append('type', params.type);
    if (params.user_id) query.append('user_id', params.user_id);
    if (params.from) query.append('from', params.from);
    if (params.to) query.append('to', params.to);

    return apiClient.get(`/api/admin/credit-transactions?${query.toString()}`);
  },

  /**
   * 크레딧 패키지 목록 조회 (관리자용 - 비활성 포함)
   */
  getPackages: async (): Promise<GetCreditPackagesResponse> => {
    return apiClient.get('/api/admin/credit-packages');
  },

  /**
   * 크레딧 패키지 생성
   */
  createPackage: async (data: {
    code: string;
    name: string;
    credits: number;
    price_krw: number;
    description?: string;
    sort_order?: number;
  }): Promise<{ success: boolean; data: CreditPackage }> => {
    return apiClient.post('/api/admin/credit-packages', data);
  },

  /**
   * 크레딧 패키지 수정
   */
  updatePackage: async (
    code: string,
    data: Partial<{
      name: string;
      credits: number;
      price_krw: number;
      description: string;
      sort_order: number;
      is_active: boolean;
    }>
  ): Promise<{ success: boolean; data: CreditPackage }> => {
    return apiClient.put(`/api/admin/credit-packages/${code}`, data);
  },

  /**
   * 크레딧 패키지 비활성화
   */
  deletePackage: async (code: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/api/admin/credit-packages/${code}`);
  },
};
