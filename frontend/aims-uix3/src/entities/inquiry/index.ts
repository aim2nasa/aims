/**
 * 1:1 문의 엔티티 공개 API
 * @since 2025-12-18
 *
 * 타입과 상수만 export합니다.
 * API 함수는 @/services/inquiryService에서 직접 import하세요.
 */

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
