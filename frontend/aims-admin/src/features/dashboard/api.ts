import { apiClient } from '@/shared/api/apiClient';

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalCustomers: number;
  totalDocuments: number;
  totalContracts: number;
}

export interface ProcessingStatus {
  ocrQueue: number;
  embedQueue: number;
  failedDocuments: number;
}

export interface HealthStatus {
  nodeApi: 'healthy' | 'unhealthy';
  pythonApi: 'healthy' | 'unhealthy';
  mongodb: 'healthy' | 'unhealthy';
  qdrant: 'healthy' | 'unhealthy';
}

export interface DashboardData {
  stats: DashboardStats;
  processing: ProcessingStatus;
  health: HealthStatus;
}

export interface StorageOverview {
  total_users: number;
  total_used_bytes: number;
  tier_distribution: Record<string, number>;
  users_over_80_percent: number;
  users_over_95_percent: number;
  formatted: {
    total_used: string;
  };
}

export interface StorageOverviewResponse {
  success: boolean;
  data: StorageOverview;
}

export const dashboardApi = {
  getDashboard: (): Promise<DashboardData> => {
    return apiClient.get<DashboardData>('/api/admin/dashboard');
  },

  getStorageOverview: (): Promise<StorageOverview> => {
    return apiClient.get<StorageOverviewResponse>('/api/admin/storage/overview')
      .then((res) => res.data);
  },
};
