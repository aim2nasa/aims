/**
 * Embedding Usage Admin API
 * @since 2025-12-29
 */

import { apiClient } from '@/shared/api/apiClient';

export interface FailedEmbedDocument {
  _id: string;
  originalName: string;
  ownerId: string;
  ownerName: string;
  customerId: string;
  customerName: string;
  status: string;
  errorMessage: string;
  failed_at: string;
}

export interface FailedEmbedDocumentsData {
  total_count: number;
  documents: FailedEmbedDocument[];
}

interface FailedEmbedDocumentsResponse {
  success: boolean;
  data: FailedEmbedDocumentsData;
}

export const embedUsageApi = {
  /**
   * 임베딩 실패 문서 목록
   */
  getFailedDocuments: async (userId?: string): Promise<FailedEmbedDocumentsData> => {
    const params = new URLSearchParams();
    if (userId) {
      params.append('userId', userId);
    }
    const query = params.toString();
    const res = await apiClient.get<FailedEmbedDocumentsResponse>(
      `/api/admin/embed/failed-documents${query ? `?${query}` : ''}`
    );
    return res.data;
  },
};
