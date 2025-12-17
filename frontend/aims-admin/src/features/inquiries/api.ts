/**
 * 관리자 문의 관리 API
 * @since 2025-12-18
 */

import { apiClient } from '@/shared/api/apiClient';

/** 문의 카테고리 */
export type InquiryCategory = 'bug' | 'feature' | 'question' | 'other';

/** 문의 상태 */
export type InquiryStatus = 'pending' | 'in_progress' | 'resolved' | 'closed';

/** 첨부파일 */
export interface InquiryAttachment {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
}

/** 문의 메시지 */
export interface InquiryMessage {
  _id: string;
  authorId: string;
  authorName: string;
  authorRole: 'user' | 'admin';
  content: string;
  attachments: InquiryAttachment[];
  createdAt: string;
}

/** 문의 */
export interface Inquiry {
  _id: string;
  userId: string;
  userName: string;
  userEmail: string;
  category: InquiryCategory;
  title: string;
  status: InquiryStatus;
  messages: InquiryMessage[];
  messageCount?: number;
  lastMessage?: InquiryMessage | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  user?: {
    _id: string;
    name: string;
    email: string;
    tier: string | { tier_id: string; started_at?: string; expires_at?: string; auto_renew?: boolean } | null;
    createdAt: string;
  };
}

/** 문의 목록 응답 */
export interface InquiriesResponse {
  inquiries: Inquiry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** 문의 통계 */
export interface InquiryStats {
  total: number;
  pending: number;
  inProgress: number;
  resolved: number;
  closed: number;
}

/** 카테고리 라벨 */
export const CATEGORY_LABELS: Record<InquiryCategory, string> = {
  bug: '버그 신고',
  feature: '기능 제안',
  question: '사용 문의',
  other: '기타',
};

/** 상태 라벨 */
export const STATUS_LABELS: Record<InquiryStatus, string> = {
  pending: '대기',
  in_progress: '처리중',
  resolved: '해결',
  closed: '해결',
};

/**
 * 문의 목록 조회
 */
export async function getInquiries(params: {
  status?: InquiryStatus;
  category?: InquiryCategory;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<InquiriesResponse> {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      searchParams.append(key, String(value));
    }
  });

  const response = await apiClient.get<{ success: boolean; data: InquiriesResponse }>(
    `/api/admin/inquiries?${searchParams.toString()}`
  );
  return response.data;
}

/**
 * 문의 상세 조회
 */
export async function getInquiry(id: string): Promise<Inquiry> {
  const response = await apiClient.get<{ success: boolean; data: Inquiry }>(
    `/api/admin/inquiries/${id}`
  );
  return response.data;
}

/**
 * 답변 추가 (첨부파일 지원)
 */
export async function addReply(inquiryId: string, content: string, files?: File[]): Promise<InquiryMessage> {
  const formData = new FormData();
  formData.append('content', content);

  if (files && files.length > 0) {
    files.forEach(file => formData.append('files', file));
  }

  // FormData 사용 시 Content-Type 헤더를 수동 설정하지 않음 (axios가 boundary 포함하여 자동 설정)
  const response = await apiClient.post<{ success: boolean; data: InquiryMessage }>(
    `/api/admin/inquiries/${inquiryId}/messages`,
    formData
  );
  return response.data;
}

/**
 * 상태 변경
 */
export async function updateStatus(
  inquiryId: string,
  status: InquiryStatus
): Promise<void> {
  await apiClient.put(`/api/admin/inquiries/${inquiryId}/status`, { status });
}

/**
 * 문의 통계 조회
 */
export async function getInquiryStats(): Promise<InquiryStats> {
  const response = await apiClient.get<{ success: boolean; data: InquiryStats }>(
    '/api/admin/inquiries/stats'
  );
  return response.data;
}

/**
 * 첨부파일 URL 생성
 * 이미지 태그 등에서 직접 접근할 수 있도록 토큰을 쿼리 파라미터로 포함
 */
export function getAttachmentUrl(inquiryId: string, filename: string): string {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
  const token = localStorage.getItem('aims-admin-token');
  const url = `${baseUrl}/api/inquiries/attachments/${inquiryId}/${filename}`;
  if (token) {
    return `${url}?token=${encodeURIComponent(token)}`;
  }
  return url;
}

export const inquiriesApi = {
  getInquiries,
  getInquiry,
  addReply,
  updateStatus,
  getInquiryStats,
  getAttachmentUrl,
};
