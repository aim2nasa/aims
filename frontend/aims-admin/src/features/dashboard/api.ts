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
  // Tier 1: Infrastructure
  mongodb: ServiceHealth;
  qdrant: ServiceHealth;
  // Tier 2: Backend APIs
  nodeApi: ServiceHealth;
  aimsRagApi: ServiceHealth;
  annualReportApi: ServiceHealth;
  pdfProxy: ServiceHealth;
  // Tier 3: Workflow
  n8n: ServiceHealth;
}

export interface OcrStats {
  usedThisMonth: number;
  totalProcessed: number;
}

export interface WorkflowStatus {
  id: string;
  name: string;
  active: boolean;
  updatedAt: string;
}

export interface DashboardData {
  stats: DashboardStats;
  processing: ProcessingStatus;
  health: HealthStatus;
  ocr?: OcrStats;
  workflows?: WorkflowStatus[];
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

// 시스템 메트릭 타입
export interface CpuMetrics {
  usage: number;
  cores: number;
  model: string;
  loadAvg: number[];
}

export interface MemoryMetrics {
  total: number;
  free: number;
  used: number;
  usagePercent: number;
}

export interface DiskMetrics {
  total: number;
  used: number;
  available: number;
  usagePercent: number;
  mountPoint?: string;
}

export interface DisksMetrics {
  root: DiskMetrics;
  data: DiskMetrics;
}

export interface ProcessMetrics {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
}

export interface UptimeMetrics {
  system: number;
  process: number;
}

export interface SystemMetrics {
  _id?: string;
  timestamp: string;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics;           // 하위 호환성 (루트 파티션)
  disks?: DisksMetrics;        // 파티션별 디스크 정보
  process: ProcessMetrics;
  uptime: UptimeMetrics;
  hostname: string;
  platform: string;
  arch: string;
}

export interface MetricsCurrentResponse {
  success: boolean;
  data: SystemMetrics;
}

export interface MetricsHistoryResponse {
  success: boolean;
  data: {
    hours: number;
    count: number;
    metrics: SystemMetrics[];
  };
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

  // 시스템 메트릭 API
  getMetricsCurrent: (): Promise<SystemMetrics> => {
    return apiClient.get<MetricsCurrentResponse>('/api/admin/metrics/current')
      .then((res) => res.data);
  },

  getMetricsHistory: (hours: number = 24): Promise<{ hours: number; count: number; metrics: SystemMetrics[] }> => {
    return apiClient.get<MetricsHistoryResponse>(`/api/admin/metrics/history?hours=${hours}`)
      .then((res) => res.data);
  },
};
