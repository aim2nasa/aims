/**
 * 1:1 문의 서비스 레이어
 * @since 2025-12-18
 */

import { api, getAuthHeaders, getAuthToken, API_CONFIG } from '@/shared/lib/api';
import type {
  Inquiry,
  InquiriesResponse,
  CreateInquiryData,
  AddMessageData,
  InquiryMessage,
  InquiryStatus,
} from '@/entities/inquiry/model';

const ENDPOINTS = {
  INQUIRIES: '/api/inquiries',
  INQUIRY: (id: string) => `/api/inquiries/${id}`,
  INQUIRY_MESSAGES: (id: string) => `/api/inquiries/${id}/messages`,
  ATTACHMENT: (inquiryId: string, filename: string) =>
    `/api/inquiries/attachments/${inquiryId}/${filename}`,
} as const;

/**
 * 내 문의 목록 조회
 */
export async function getInquiries(params: {
  status?: InquiryStatus;
  page?: number;
  limit?: number;
}): Promise<InquiriesResponse> {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.append('status', params.status);
  if (params.page) searchParams.append('page', String(params.page));
  if (params.limit) searchParams.append('limit', String(params.limit));

  const response = await api.get<{ success: boolean; data: InquiriesResponse }>(
    `${ENDPOINTS.INQUIRIES}?${searchParams.toString()}`
  );

  return response.data;
}

/**
 * 문의 상세 조회
 */
export async function getInquiry(id: string): Promise<Inquiry> {
  const response = await api.get<{ success: boolean; data: Inquiry }>(
    ENDPOINTS.INQUIRY(id)
  );
  return response.data;
}

/**
 * 문의 등록
 */
export async function createInquiry(data: CreateInquiryData): Promise<Inquiry> {
  const formData = new FormData();
  formData.append('category', data.category);
  formData.append('title', data.title);
  formData.append('content', data.content);

  if (data.files) {
    data.files.forEach((file) => {
      formData.append('files', file);
    });
  }

  const response = await fetch(`${API_CONFIG.BASE_URL}${ENDPOINTS.INQUIRIES}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || '문의 등록에 실패했습니다');
  }

  const result = await response.json();
  return result.data;
}

/**
 * 문의에 메시지 추가
 */
export async function addMessage(
  inquiryId: string,
  data: AddMessageData
): Promise<InquiryMessage> {
  const formData = new FormData();
  formData.append('content', data.content);

  if (data.files) {
    data.files.forEach((file) => {
      formData.append('files', file);
    });
  }

  const response = await fetch(
    `${API_CONFIG.BASE_URL}${ENDPOINTS.INQUIRY_MESSAGES(inquiryId)}`,
    {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || '메시지 전송에 실패했습니다');
  }

  const result = await response.json();
  return result.data;
}

/**
 * 첨부파일 다운로드 URL 생성
 * 이미지 태그 등에서 직접 접근할 수 있도록 토큰을 쿼리 파라미터로 포함
 */
export function getAttachmentUrl(inquiryId: string, filename: string): string {
  const baseUrl = `${API_CONFIG.BASE_URL}${ENDPOINTS.ATTACHMENT(inquiryId, filename)}`;
  const token = getAuthToken();
  if (token) {
    return `${baseUrl}?token=${encodeURIComponent(token)}`;
  }
  return baseUrl;
}

/**
 * 파일 크기 포맷팅
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
