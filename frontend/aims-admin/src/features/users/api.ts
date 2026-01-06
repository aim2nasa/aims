import { apiClient } from '@/shared/api/apiClient';
import type { User } from '@/features/auth/types';

export interface GetUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  hasOcrPermission?: boolean;
  sortBy?: 'name' | 'email' | 'tier' | 'createdAt' | 'lastLogin';
  sortOrder?: 'asc' | 'desc';
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

export interface DeleteUserStats {
  documents: {
    total: number;
    filesDeleted: number;
    qdrantDeleted: number;
    errors: { docId: string; type: string; error: string }[];
  };
  customers: number;
  contracts: number;
  relationships: number;
  tokenUsage: number;
}

export interface DeleteUserResponse {
  success: boolean;
  message: string;
  // 삭제 예약 응답 (24시간 후 삭제)
  scheduledUser?: {
    _id: string;
    name: string;
    email: string;
  };
  scheduledDeletionAt?: string;
  // deprecated (즉시 삭제는 더 이상 지원 안 함)
  deletedUser?: {
    _id: string;
    name: string;
    email: string;
  };
  stats?: DeleteUserStats;
}

export interface CancelDeletionResponse {
  success: boolean;
  message: string;
  user?: {
    _id: string;
    name: string;
    email: string;
  };
}

export interface DeletePreviewResponse {
  success: boolean;
  preview: {
    user: {
      _id: string;
      name: string;
      email: string;
    };
    documents: {
      count: number;
      files: string[];
      hasMore: boolean;
      totalFiles: number;
      folders: string[];
    };
    customers: number;
    contracts: number;
    relationships: number;
    embeddings: number;
    tokenUsage: number;
  };
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
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);

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

  deleteUser: (userId: string): Promise<DeleteUserResponse> => {
    return apiClient.delete<DeleteUserResponse>(`/api/admin/users/${userId}`);
  },

  cancelDeletion: (userId: string): Promise<CancelDeletionResponse> => {
    return apiClient.post<CancelDeletionResponse>(`/api/admin/users/${userId}/cancel-deletion`, {});
  },

  getDeletePreview: (userId: string): Promise<DeletePreviewResponse> => {
    return apiClient.get<DeletePreviewResponse>(`/api/admin/users/${userId}/delete-preview`);
  },
};
