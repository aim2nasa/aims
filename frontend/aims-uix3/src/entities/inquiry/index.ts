/**
 * 1:1 문의 엔티티 공개 API
 * @since 2025-12-18
 */

// 타입 및 상수
export type {
  Inquiry,
  InquiryCategory,
  InquiryStatus,
  InquiryMessage,
  InquiryAttachment,
  InquiriesResponse,
  CreateInquiryData,
  AddMessageData,
  MessageAuthorRole,
} from './model';

export {
  CATEGORY_LABELS,
  STATUS_LABELS,
  CATEGORY_COLORS,
  STATUS_COLORS,
} from './model';

// API
export {
  getInquiries,
  getInquiry,
  createInquiry,
  addMessage,
  getAttachmentUrl,
  formatFileSize,
} from './api';
