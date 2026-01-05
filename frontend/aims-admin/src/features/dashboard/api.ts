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
  pdfConverter?: ServiceHealth;
  aimsMcp: ServiceHealth;
  // Tier 3: Workflow
  n8n: ServiceHealth;
}

// 포트 현황 타입
export interface PortStatus {
  port: number;
  service: string;
  description: string;
  status: 'listening' | 'closed';
  checkedAt: string;
}

export interface PortsResponse {
  success: boolean;
  data: PortStatus[];
}

export interface OcrStats {
  usedThisMonth: number;
  totalProcessed: number;
}

// 문서 처리 현황 (상세)
export interface DocumentOcrStatus {
  target: number;       // OCR 대상 (ocr 서브도큐먼트 있음)
  nonTarget: number;    // OCR 비대상 (ocr 서브도큐먼트 없음)
  done: number;
  donePages: number;    // OCR 완료 페이지 수
  pending: number;
  processing: number;
  failed: number;
}

export interface DocumentEmbedStatus {
  done: number;
  pending: number;
  processing: number;
  failed: number;
}

export interface DocumentOverallStatus {
  completed: number;
  processing: number;
  error: number;
}

export interface DocumentsStatus {
  total: number;
  ocr: DocumentOcrStatus;
  embed: DocumentEmbedStatus;
  overall: DocumentOverallStatus;
}

export interface WorkflowStatus {
  id: string;
  name: string;
  active: boolean;
  updatedAt: string;
}

export interface DashboardData {
  stats: DashboardStats;
  documents?: DocumentsStatus;  // 문서 처리 현황 (상세)
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
  ocr_page_quota: number;
  description: string;
  formatted_quota: string;
  formatted_ocr_page_quota: string;
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

// 서비스 상태 이력 타입
export interface HealthHistoryLog {
  _id: string;
  service: string;
  port: number;
  description: string;
  eventType: 'down' | 'recovered';
  previousStatus: 'healthy' | 'unhealthy';
  currentStatus: 'healthy' | 'unhealthy';
  error: string | null;
  responseTime: number;
  timestamp: string;
  timestampISO: string;
}

export interface HealthHistoryResponse {
  success: boolean;
  data: HealthHistoryLog[];
  totalCount: number;
}

export interface HealthStatsItem {
  _id: string;
  downCount: number;
  recoveryCount: number;
  lastEvent: string;
}

export interface HealthStatsResponse {
  success: boolean;
  data: HealthStatsItem[];
  period: string;
}

// 실시간 메트릭 타입
export interface RealtimeConcurrency {
  activeRequests: number;
  activeUsers: number;
  peakRequests: number;
}

export interface RealtimeThroughput {
  requestsPerSecond: number;
  requestsLast60s: number;
  totalRequests: number;
  totalErrors: number;
  errorRate: number;
}

export interface RealtimeResponseTime {
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  sampleCount: number;
}

export interface RealtimeLoadIndex {
  value: number;
  status: 'normal' | 'warning' | 'critical';
  components: {
    cpu: number;
    memory: number;
    loadAvg: number;
    activeRequests: number;
  };
}

export interface RealtimeSystem {
  cpu: number;
  memory: number;
  loadAvg: number[];
}

export interface RealtimeMetrics {
  timestamp: string;
  concurrency: RealtimeConcurrency;
  throughput: RealtimeThroughput;
  responseTime: RealtimeResponseTime;
  loadIndex: RealtimeLoadIndex;
  system: RealtimeSystem;
}

export interface RealtimeMetricsResponse {
  success: boolean;
  data: RealtimeMetrics;
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

  updateTier: (tierId: string, updates: Partial<Pick<TierDefinition, 'name' | 'quota_bytes' | 'ocr_page_quota' | 'description'>>): Promise<TierDefinition> => {
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

  // 포트 현황 API
  getPorts: (): Promise<PortStatus[]> => {
    return apiClient.get<PortsResponse>('/api/admin/ports')
      .then((res) => res.data);
  },

  // 서비스 상태 이력 API
  getHealthHistory: (options?: {
    service?: string;
    eventType?: 'down' | 'recovered';
    limit?: number;
  }): Promise<{ logs: HealthHistoryLog[]; totalCount: number }> => {
    const params = new URLSearchParams();
    if (options?.service) params.append('service', options.service);
    if (options?.eventType) params.append('eventType', options.eventType);
    if (options?.limit) params.append('limit', String(options.limit));

    const query = params.toString();
    return apiClient.get<HealthHistoryResponse>(`/api/admin/health-history${query ? `?${query}` : ''}`)
      .then((res) => ({ logs: res.data, totalCount: res.totalCount }));
  },

  // 서비스 다운타임 통계 API
  getHealthStats: (days: number = 30): Promise<HealthStatsItem[]> => {
    return apiClient.get<HealthStatsResponse>(`/api/admin/health-stats?days=${days}`)
      .then((res) => res.data);
  },

  // 서비스 상태 이력 삭제 API
  clearHealthHistory: (): Promise<{ message: string; deletedCount: number }> => {
    return apiClient.delete<{ success: boolean; message: string; deletedCount: number }>('/api/admin/health-history')
      .then((res) => ({ message: res.message, deletedCount: res.deletedCount }));
  },

  // 실시간 메트릭 API (동시접속, 처리량, 부하지수)
  getMetricsRealtime: (): Promise<RealtimeMetrics> => {
    return apiClient.get<RealtimeMetricsResponse>('/api/admin/metrics/realtime')
      .then((res) => res.data);
  },
};
