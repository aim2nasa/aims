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
  deletedUser?: {
    _id: string;
    name: string;
    email: string;
  };
  stats?: DeleteUserStats;
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

  getDeletePreview: (userId: string): Promise<DeletePreviewResponse> => {
    return apiClient.get<DeletePreviewResponse>(`/api/admin/users/${userId}/delete-preview`);
  },
};
