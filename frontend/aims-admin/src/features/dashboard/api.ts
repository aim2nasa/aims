import { apiClient, healthMonitorClient } from '@/shared/api/apiClient';

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
  credit_quota: number;              // 크레딧/월 (신규)
  ocr_page_quota: number;            // deprecated, 하위호환
  description: string;
  formatted_quota: string;
  formatted_credit_quota: string;    // 크레딧 포맷 (신규)
  formatted_ocr_page_quota: string;  // deprecated
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

// 파이프라인 요약 타입
export interface PipelineQueueStatus {
  pending: number;
  processing: number;
  failed: number;
}

export interface PipelineParsingStatus {
  total: number;
  completed: number;
  pending: number;
  processing: number;
  failed: number;
}

export interface PipelineSummary {
  ocr: PipelineQueueStatus;
  embed: PipelineQueueStatus;
  ar: PipelineParsingStatus;
  crs: PipelineParsingStatus;
  creditPending: number;
  recentErrors: { today: number; yesterday: number };
  checkedAt: string;
}

export interface PipelineSummaryResponse {
  success: boolean;
  data: PipelineSummary;
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

  updateTier: (tierId: string, updates: Partial<Pick<TierDefinition, 'name' | 'quota_bytes' | 'credit_quota' | 'ocr_page_quota' | 'description'>>): Promise<TierDefinition> => {
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

  // 현재 서비스 상태 조회 (독립 헬스 모니터 서비스 - aims_api 우회)
  getHealthCurrent: (): Promise<{
    services: Array<{
      service: string;
      port: number;
      description: string;
      status: 'healthy' | 'unhealthy';
      responseTime: number;
      error: string | null;
      checkedAt: string;
    }>;
    summary: { healthy: number; unhealthy: number; total: number };
    monitorUptime: number | null;
    lastCheck: string | null;
  }> => {
    return healthMonitorClient.get<{
      success: boolean;
      data: {
        services: Array<{
          service: string;
          port: number;
          description: string;
          status: 'healthy' | 'unhealthy';
          responseTime: number;
          error: string | null;
          checkedAt: string;
        }>;
        summary: { healthy: number; unhealthy: number; total: number };
        monitorUptime: number | null;
        lastCheck: string | null;
      };
    }>('/api/health/current').then((res) => res.data);
  },

  // 강제 헬스체크 실행 (독립 헬스 모니터 서비스)
  forceHealthCheck: (): Promise<{
    services: Array<{
      service: string;
      port: number;
      description: string;
      status: 'healthy' | 'unhealthy';
      responseTime: number;
      error: string | null;
      checkedAt: string;
    }>;
    summary: { healthy: number; unhealthy: number; total: number };
    monitorUptime: number | null;
    lastCheck: string | null;
  }> => {
    return healthMonitorClient.get<{
      success: boolean;
      data: {
        services: Array<{
          service: string;
          port: number;
          description: string;
          status: 'healthy' | 'unhealthy';
          responseTime: number;
          error: string | null;
          checkedAt: string;
        }>;
        summary: { healthy: number; unhealthy: number; total: number };
        monitorUptime: number | null;
        lastCheck: string | null;
      };
      message: string;
    }>('/api/health/check').then((res) => res.data);
  },

  // 포트 현황 API (독립 헬스 모니터 서비스에서 조회)
  getPorts: (): Promise<PortStatus[]> => {
    return healthMonitorClient.get<PortsResponse>('/api/ports')
      .then((res) => res.data);
  },

  // 서비스 상태 이력 API (독립 헬스 모니터 서비스에서 조회)
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
    return healthMonitorClient.get<HealthHistoryResponse>(`/api/health/history${query ? `?${query}` : ''}`)
      .then((res) => ({ logs: res.data, totalCount: res.totalCount }));
  },

  // 서비스 다운타임 통계 API (독립 헬스 모니터 서비스에서 조회)
  getHealthStats: (days: number = 30): Promise<HealthStatsItem[]> => {
    return healthMonitorClient.get<HealthStatsResponse>(`/api/health/stats?days=${days}`)
      .then((res) => res.data);
  },

  // 서비스 상태 이력 삭제 API (독립 헬스 모니터 서비스에서 처리)
  clearHealthHistory: (): Promise<{ message: string; deletedCount: number }> => {
    return healthMonitorClient.delete<{ success: boolean; message: string; deletedCount: number }>('/api/health/history')
      .then((res) => ({ message: res.message, deletedCount: res.deletedCount }));
  },

  // 실시간 메트릭 API (동시접속, 처리량, 부하지수)
  getMetricsRealtime: (): Promise<RealtimeMetrics> => {
    return apiClient.get<RealtimeMetricsResponse>('/api/admin/metrics/realtime')
      .then((res) => res.data);
  },

  // 파이프라인 요약 API (OCR/임베딩/AR파싱 큐 상태)
  getPipelineSummary: (): Promise<PipelineSummary> => {
    return apiClient.get<PipelineSummaryResponse>('/api/admin/pipeline-summary')
      .then((res) => res.data);
  },
};
