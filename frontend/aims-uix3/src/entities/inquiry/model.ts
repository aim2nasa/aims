/**
 * 1:1 문의 도메인 모델
 * @since 2025-12-18
 */

/** 문의 카테고리 */
export type InquiryCategory = 'bug' | 'feature' | 'question' | 'other';

/** 문의 상태 */
export type InquiryStatus = 'pending' | 'in_progress' | 'resolved' | 'closed';

/** 메시지 작성자 역할 */
export type MessageAuthorRole = 'user' | 'admin' | 'system';

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
  authorId?: string;      // system 메시지는 없음
  authorName?: string;    // system 메시지는 없음
  authorRole: MessageAuthorRole;
  content: string;
  attachments?: InquiryAttachment[];  // system 메시지는 없음
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
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

/** 문의 생성 데이터 */
export interface CreateInquiryData {
  category: InquiryCategory;
  title: string;
  content: string;
  files?: File[];
}

/** 메시지 추가 데이터 */
export interface AddMessageData {
  content: string;
  files?: File[];
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

/** 카테고리 색상 */
export const CATEGORY_COLORS: Record<InquiryCategory, string> = {
  bug: 'var(--color-error)',
  feature: 'var(--color-primary)',
  question: 'var(--color-success)',
  other: 'var(--color-text-tertiary)',
};

/** 상태 색상 */
export const STATUS_COLORS: Record<InquiryStatus, string> = {
  pending: 'var(--color-warning)',
  in_progress: 'var(--color-primary)',
  resolved: 'var(--color-success)',
  closed: 'var(--color-text-tertiary)',
};
