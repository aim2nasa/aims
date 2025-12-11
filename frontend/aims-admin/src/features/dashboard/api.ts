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

export interface ServiceHealth {
  status: 'healthy' | 'unhealthy';
  latency: number | null;
  version?: string | null;
  uptime?: number | null;
  collections?: number | null;
  error?: string | null;
  checkedAt: string;
}

export interface HealthStatus {
  nodeApi: ServiceHealth;
  pythonApi: ServiceHealth;
  mongodb: ServiceHealth;
  qdrant: ServiceHealth;
}

export interface OcrStats {
  usedThisMonth: number;
  totalProcessed: number;
}

export interface DashboardData {
  stats: DashboardStats;
  processing: ProcessingStatus;
  health: HealthStatus;
  ocr?: OcrStats;
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

export interface TierDefinition {
  id: string;
  name: string;
  quota_bytes: number;
  ocr_quota: number;
  description: string;
  formatted_quota: string;
  formatted_ocr_quota: string;
  updatedAt?: string;
}

export interface TiersResponse {
  success: boolean;
  data: TierDefinition[];
}

export interface UpdateTierResponse {
  success: boolean;
  message: string;
  data: TierDefinition;
}

export const dashboardApi = {
  getDashboard: (): Promise<DashboardData> => {
    return apiClient.get<DashboardData>('/api/admin/dashboard');
  },

  getStorageOverview: (): Promise<StorageOverview> => {
    return apiClient.get<StorageOverviewResponse>('/api/admin/storage/overview')
      .then((res) => res.data);
  },

  getTiers: (): Promise<TierDefinition[]> => {
    return apiClient.get<TiersResponse>('/api/admin/tiers')
      .then((res) => res.data);
  },

  updateTier: (tierId: string, updates: Partial<Pick<TierDefinition, 'name' | 'quota_bytes' | 'ocr_quota' | 'description'>>): Promise<TierDefinition> => {
    return apiClient.put<UpdateTierResponse>(`/api/admin/tiers/${tierId}`, updates)
      .then((res) => res.data);
  },
};
