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

export const dashboardApi = {
  getDashboard: (): Promise<DashboardData> => {
    return apiClient.get<DashboardData>('/api/admin/dashboard');
  },
};
