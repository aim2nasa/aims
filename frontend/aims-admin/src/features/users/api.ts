import { apiClient } from '@/shared/api/apiClient';
import type { User } from '@/features/auth/types';

export interface GetUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  hasOcrPermission?: boolean;
}

export interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface GetUsersResponse {
  success: boolean;
  users: User[];
  pagination: PaginationInfo;
}

export interface UpdateUserTierResponse {
  success: boolean;
  tier: string;
  quota_bytes: number;
}

export interface UpdateOcrPermissionResponse {
  success: boolean;
  userId: string;
  hasOcrPermission: boolean;
  message: string;
}

export const usersApi = {
  getUsers: (params: GetUsersParams = {}): Promise<GetUsersResponse> => {
    const queryParams = new URLSearchParams();

    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.role) queryParams.append('role', params.role);
    if (params.hasOcrPermission !== undefined) {
      queryParams.append('hasOcrPermission', params.hasOcrPermission.toString());
    }

    const queryString = queryParams.toString();
    const endpoint = queryString ? `/api/admin/users?${queryString}` : '/api/admin/users';

    return apiClient.get<GetUsersResponse>(endpoint);
  },

  updateUserTier: (userId: string, tier: string): Promise<UpdateUserTierResponse> => {
    return apiClient.put<UpdateUserTierResponse>(`/api/admin/users/${userId}/quota`, { tier });
  },

  updateOcrPermission: (userId: string, hasOcrPermission: boolean): Promise<UpdateOcrPermissionResponse> => {
    return apiClient.put<UpdateOcrPermissionResponse>(`/api/admin/users/${userId}/ocr-permission`, { hasOcrPermission });
  },
};
