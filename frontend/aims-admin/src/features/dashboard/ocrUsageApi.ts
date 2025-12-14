/**
 * OCR Usage Admin API
 * @since 2025-12-14
 */

import { apiClient } from '@/shared/api/apiClient';

export interface OCRUsageOverview {
  period_days: number;
  ocr_this_month: number;
  ocr_total: number;
  active_users: number;
  ocr_pending: number;
  ocr_processing: number;
  ocr_failed: number;
}

export interface HourlyOCRPoint {
  timestamp: string;
  done: number;   // 성공 건수
  error: number;  // 실패 건수
}

export interface TopOCRUser {
  rank: number;
  user_id: string;
  user_name: string;
  ocr_count: number;
  error_count: number;
  last_ocr_at: string;
}

export interface FailedOCRDocument {
  _id: string;
  originalName: string;
  ownerId: string;
  ownerName: string;
  customerId: string;
  customerName: string;
  statusCode: string;
  statusMessage: string;
  errorBody: string;
  failed_at: string;
}

export interface FailedOCRDocumentsData {
  total_count: number;
  documents: FailedOCRDocument[];
}

interface OCRUsageOverviewResponse {
  success: boolean;
  data: OCRUsageOverview;
}

interface HourlyOCRResponse {
  success: boolean;
  data: HourlyOCRPoint[];
}

interface TopOCRUsersResponse {
  success: boolean;
  data: TopOCRUser[];
}

interface FailedOCRDocumentsResponse {
  success: boolean;
  data: FailedOCRDocumentsData;
}

export interface OCRReprocessResult {
  document_id: string;
  retry_count: number;
  queued_at: string;
}

interface OCRReprocessResponse {
  success: boolean;
  message: string;
  data: OCRReprocessResult;
}

// 숫자 포맷팅 함수
export function formatOCRCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toLocaleString();
}

export const ocrUsageApi = {
  /**
   * OCR 전체 통계
   */
  getOverview: async (days: number = 30): Promise<OCRUsageOverview> => {
    const res = await apiClient.get<OCRUsageOverviewResponse>(
      `/api/admin/ocr-usage/overview?days=${days}`
    );
    return res.data;
  },

  /**
   * 시간별 OCR 처리 추이
   */
  getHourlyUsage: async (hours: number = 24): Promise<HourlyOCRPoint[]> => {
    const res = await apiClient.get<HourlyOCRResponse>(
      `/api/admin/ocr-usage/hourly?hours=${hours}`
    );
    return res.data;
  },

  /**
   * Top OCR 사용자 목록
   */
  getTopUsers: async (days: number = 30): Promise<TopOCRUser[]> => {
    const res = await apiClient.get<TopOCRUsersResponse>(
      `/api/admin/ocr-usage/top-users?days=${days}`
    );
    return res.data;
  },

  /**
   * OCR 실패 문서 목록
   */
  getFailedDocuments: async (userId?: string): Promise<FailedOCRDocumentsData> => {
    const params = new URLSearchParams();
    if (userId) {
      params.append('userId', userId);
    }
    const query = params.toString();
    const res = await apiClient.get<FailedOCRDocumentsResponse>(
      `/api/admin/ocr-usage/failed-documents${query ? `?${query}` : ''}`
    );
    return res.data;
  },

  /**
   * OCR 실패 문서 재처리
   */
  reprocessDocument: async (documentId: string): Promise<OCRReprocessResult> => {
    const res = await apiClient.post<OCRReprocessResponse>(
      '/api/admin/ocr/reprocess',
      { document_id: documentId }
    );
    return res.data;
  },
};
