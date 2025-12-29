/**
 * 문서 유형 관리 API
 * @since 2025-12-29
 */

import { apiClient } from '@/shared/api/apiClient';

// ========================================
// 문서 유형 타입
// ========================================

export interface DocumentType {
  _id: string;
  value: string;        // 유형 코드 (영문 소문자, 예: 'general', 'contract')
  label: string;        // 유형 이름 (한글, 예: '일반 문서', '계약서')
  description: string;  // 설명
  isSystem: boolean;    // 시스템 기본 유형 여부 (true면 삭제 불가)
  order: number;        // 표시 순서
  documentCount?: number; // 해당 유형 사용 문서 수 (관리자 조회 시)
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface CreateDocumentTypeData {
  value: string;
  label: string;
  description?: string;
}

export interface UpdateDocumentTypeData {
  label?: string;
  description?: string;
  order?: number;
}

export interface DeleteDocumentTypeResponse {
  success: boolean;
  message: string;
  affectedDocuments: number;
}

// ========================================
// 문서 유형 API
// ========================================

/**
 * 문서 유형 목록 조회 (관리자용)
 */
export async function getDocumentTypes(params?: {
  search?: string;
}): Promise<DocumentType[]> {
  const searchParams = new URLSearchParams();
  if (params?.search) {
    searchParams.append('search', params.search);
  }

  const response = await apiClient.get<{ success: boolean; data: DocumentType[] }>(
    `/api/admin/document-types?${searchParams.toString()}`
  );
  return response.data;
}

/**
 * 문서 유형 생성
 */
export async function createDocumentType(data: CreateDocumentTypeData): Promise<DocumentType> {
  const response = await apiClient.post<{ success: boolean; data: DocumentType }>(
    '/api/admin/document-types',
    data
  );
  return response.data;
}

/**
 * 문서 유형 수정
 */
export async function updateDocumentType(id: string, data: UpdateDocumentTypeData): Promise<DocumentType> {
  const response = await apiClient.put<{ success: boolean; data: DocumentType }>(
    `/api/admin/document-types/${id}`,
    data
  );
  return response.data;
}

/**
 * 문서 유형 삭제
 * 시스템 유형은 삭제 불가
 * 삭제 시 해당 유형 사용 문서는 '미지정'으로 변경
 */
export async function deleteDocumentType(id: string): Promise<DeleteDocumentTypeResponse> {
  const response = await apiClient.delete<DeleteDocumentTypeResponse>(
    `/api/admin/document-types/${id}`
  );
  return response;
}

/**
 * 문서 유형 순서 변경
 */
export async function reorderDocumentTypes(orders: { id: string; order: number }[]): Promise<void> {
  await apiClient.put('/api/admin/document-types/reorder', { orders });
}

// ========================================
// Export
// ========================================

export const documentTypesApi = {
  getDocumentTypes,
  createDocumentType,
  updateDocumentType,
  deleteDocumentType,
  reorderDocumentTypes,
};
