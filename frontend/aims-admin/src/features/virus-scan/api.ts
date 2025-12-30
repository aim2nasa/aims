/**
 * Virus Scan API
 * 바이러스 스캔 관리 API 모듈
 * @since 2025-12-30
 */

import { apiClient } from '@/shared/api/apiClient';

// ============================================================
// Types
// ============================================================

export interface SystemInfo {
  hostname: string;
  platform: string;
  cpu: {
    load_1m: number;
    load_5m: number;
    load_15m: number;
    cores: number;
    temperature?: number;
  };
  memory: {
    total: number;
    used: number;
    available: number;
    percent: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    percent: number;
    mount_path: string;
  };
  uptime: number;
  error?: string;
}

export interface VirusScanStatus {
  serviceUrl: string;
  status: 'ok' | 'degraded' | 'offline';
  clamd_running: boolean;
  clam_version?: string;
  mount_available?: boolean;
  mount_path?: string;
  error?: string;
  system?: SystemInfo | null;
}

export interface VirusScanStats {
  statusCounts: {
    pending: number;
    scanning: number;
    clean: number;
    infected: number;
    deleted: number;
    error: number;
    notScanned: number;
  };
  todayScans: number;
  recentInfected: VirusScanLog[];
  totalFiles: number;
}

export interface VirusScanSettings {
  _id: string;
  enabled: boolean;
  realtimeScan: {
    enabled: boolean;
    collections: string[];
  };
  scheduledScan: {
    enabled: boolean;
    cronExpression: string;
    lastRunAt: string | null;
    nextRunAt: string | null;
    lastResult?: {
      totalFiles: number;
      scannedFiles: number;
      infectedFiles: number;
      startedAt: string;
      completedAt: string;
    };
  };
  freshclam: {
    autoUpdate: boolean;
    lastUpdateAt: string | null;
    updateSchedule: string;
  };
  onInfectedAction: 'delete' | 'quarantine' | 'notify_only';
  notifyAdmin: boolean;
  logRetentionDays: number;  // 스캔 로그 보관 기간 (일)
  updatedAt?: string;
  updatedBy?: string;
}

export interface VirusScanLog {
  _id: string;
  scanType: 'realtime' | 'scheduled' | 'manual' | 'manual_delete';
  collectionName: string;
  documentId: string;
  filePath: string;
  originalName?: string;  // 원본 파일명
  ownerId?: string;       // 소유자(설계사) ID
  ownerName?: string;     // 소유자(설계사) 이름
  customerId?: string;    // 고객 ID
  customerName?: string;  // 고객 이름
  userId: string;
  result: {
    status: 'clean' | 'infected' | 'error' | 'deleted';
    threatName?: string;
    clamVersion?: string;
    scanDurationMs?: number;
  };
  action: {
    type: 'none' | 'deleted' | 'quarantined';
    performedAt: string | null;
    performedBy: string | null;
  };
  createdAt: string;
}

export interface InfectedFile {
  _id: string;
  source: 'files' | 'personal_files';
  filename?: string;
  name?: string;
  ownerId?: string;
  userId?: string;
  virusScan: {
    status: 'infected' | 'deleted';
    scannedAt: string;
    threatName: string;
    clamVersion?: string;
    deletedAt?: string;
    deletedBy?: string;
    deletedReason?: string;
  };
  upload?: {
    destPath: string;
    originalName: string;
  };
  storagePath?: string;
}

export interface ScanProgress {
  is_running: boolean;
  total_files: number;
  scanned_files: number;
  infected_files: number;
  progress_percent: number;
  started_at: string | null;
  current_file: string | null;
  error?: string;
}

export interface FreshclamStatus {
  version: string;
  db_path: string;
  db_files: Array<{
    name: string;
    size: number;
    modified: string;
  }>;
  error?: string;
}

// ============================================================
// API Functions
// ============================================================

export const virusScanApi = {
  /**
   * 스캔 서비스 상태 조회
   */
  getStatus: async (): Promise<VirusScanStatus> => {
    const response = await apiClient.get<{ success: boolean; data: VirusScanStatus }>(
      '/api/admin/virus-scan/status'
    );
    return response.data;
  },

  /**
   * 스캔 통계 조회
   */
  getStats: async (): Promise<VirusScanStats> => {
    const response = await apiClient.get<{ success: boolean; data: VirusScanStats }>(
      '/api/admin/virus-scan/stats'
    );
    return response.data;
  },

  /**
   * 설정 조회
   */
  getSettings: async (): Promise<VirusScanSettings> => {
    const response = await apiClient.get<{ success: boolean; data: VirusScanSettings }>(
      '/api/admin/virus-scan/settings'
    );
    return response.data;
  },

  /**
   * 설정 수정
   */
  updateSettings: async (settings: Partial<VirusScanSettings>): Promise<VirusScanSettings> => {
    const response = await apiClient.put<{ success: boolean; data: VirusScanSettings }>(
      '/api/admin/virus-scan/settings',
      settings
    );
    return response.data;
  },

  /**
   * 스캔 로그 목록 조회
   */
  getLogs: async (params: {
    page?: number;
    limit?: number;
    status?: string;
    scanType?: string;
  } = {}): Promise<{ logs: VirusScanLog[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> => {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.status) queryParams.append('status', params.status);
    if (params.scanType) queryParams.append('scanType', params.scanType);

    const queryString = queryParams.toString();
    const endpoint = queryString
      ? `/api/admin/virus-scan/logs?${queryString}`
      : '/api/admin/virus-scan/logs';

    const response = await apiClient.get<{
      success: boolean;
      data: VirusScanLog[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(endpoint);

    return { logs: response.data, pagination: response.pagination };
  },

  /**
   * 감염 파일 목록 조회
   */
  getInfectedFiles: async (params: {
    page?: number;
    limit?: number;
    includeDeleted?: boolean;
  } = {}): Promise<{ files: InfectedFile[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> => {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.includeDeleted !== undefined) {
      queryParams.append('includeDeleted', params.includeDeleted.toString());
    }

    const queryString = queryParams.toString();
    const endpoint = queryString
      ? `/api/admin/virus-scan/infected?${queryString}`
      : '/api/admin/virus-scan/infected';

    const response = await apiClient.get<{
      success: boolean;
      data: InfectedFile[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(endpoint);

    return { files: response.data, pagination: response.pagination };
  },

  /**
   * 감염 파일 삭제
   */
  deleteInfectedFile: async (id: string, source: 'files' | 'personal_files' = 'files'): Promise<void> => {
    await apiClient.delete(`/api/admin/virus-scan/infected/${id}?source=${source}`);
  },

  /**
   * 단일 파일 스캔 요청
   */
  scanFile: async (id: string, source: 'files' | 'personal_files' = 'files'): Promise<{ message: string }> => {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `/api/admin/virus-scan/scan-file/${id}?source=${source}`
    );
    return { message: response.message };
  },

  /**
   * 전체 스캔 시작
   */
  startFullScan: async (): Promise<{ message: string; file_count: number }> => {
    const response = await apiClient.post<{ success: boolean; message: string; data: { file_count: number } }>(
      '/api/admin/virus-scan/scan-all'
    );
    return { message: response.message, file_count: response.data?.file_count || 0 };
  },

  /**
   * 미스캔 파일만 스캔 시작
   */
  scanUnscanned: async (): Promise<{ message: string; file_count: number }> => {
    const response = await apiClient.post<{ success: boolean; message: string; data: { file_count: number } }>(
      '/api/admin/virus-scan/scan-unscanned'
    );
    return { message: response.message, file_count: response.data?.file_count || 0 };
  },

  /**
   * 전체 스캔 진행률 조회
   */
  getScanProgress: async (): Promise<ScanProgress> => {
    const response = await apiClient.get<{ success: boolean; data: ScanProgress }>(
      '/api/admin/virus-scan/scan-progress'
    );
    return response.data;
  },

  /**
   * 전체 스캔 중지
   */
  stopFullScan: async (): Promise<{ message: string }> => {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      '/api/admin/virus-scan/scan-stop'
    );
    return { message: response.message };
  },

  /**
   * 바이러스 DB 업데이트
   */
  updateVirusDb: async (): Promise<{ success: boolean; message: string; output?: string }> => {
    const response = await apiClient.post<{ success: boolean; data: { success: boolean; message: string; output?: string } }>(
      '/api/admin/virus-scan/freshclam/update'
    );
    return response.data;
  },

  /**
   * 바이러스 DB 상태 조회
   */
  getFreshclamStatus: async (): Promise<FreshclamStatus> => {
    const response = await apiClient.get<{ success: boolean; data: FreshclamStatus }>(
      '/api/admin/virus-scan/freshclam/status'
    );
    return response.data;
  },

  /**
   * 스캔 로그 전체 삭제
   */
  clearLogs: async (): Promise<{ success: boolean; deletedCount: number; message: string }> => {
    const response = await apiClient.delete<{ success: boolean; deletedCount: number; message: string }>(
      '/api/admin/virus-scan/logs'
    );
    return response;
  },

  /**
   * 감염 파일 기록 초기화
   */
  clearInfectedRecords: async (): Promise<{ success: boolean; clearedCount: number; message: string }> => {
    const response = await apiClient.delete<{ success: boolean; clearedCount: number; message: string }>(
      '/api/admin/virus-scan/infected-files'
    );
    return response;
  },
};

// ============================================================
// Utility Functions
// ============================================================

/**
 * 날짜를 읽기 쉬운 형식으로 변환
 */
export const formatDateTime = (dateString?: string | null): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`;
};

/**
 * 상대 시간 표시
 */
export const formatRelativeTime = (dateString?: string | null): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return '방금 전';
  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;
  return formatDateTime(dateString);
};

/**
 * 스캔 상태 레이블
 */
export const SCAN_STATUS_LABELS: Record<string, string> = {
  pending: '대기 중',
  scanning: '스캔 중',
  clean: '정상',
  infected: '감염됨',
  deleted: '삭제됨',
  error: '오류',
  notScanned: '미스캔',
};

/**
 * 스캔 타입 레이블
 */
export const SCAN_TYPE_LABELS: Record<string, string> = {
  realtime: '실시간',
  scheduled: '정기',
  manual: '수동',
  manual_delete: '수동 삭제',
};

/**
 * 감염 처리 방식 레이블
 */
export const INFECTED_ACTION_LABELS: Record<string, string> = {
  delete: '즉시 삭제',
  quarantine: '격리',
  notify_only: '알림만',
};
