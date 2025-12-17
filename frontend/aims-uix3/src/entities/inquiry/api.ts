/**
 * 1:1 문의 API 인터페이스
 * @since 2025-12-18
 *
 * 실제 구현은 services/inquiryService.ts에 위임
 */

export {
  getInquiries,
  getInquiry,
  createInquiry,
  addMessage,
  getAttachmentUrl,
  formatFileSize,
  // 알림 관련
  getUnreadCount,
  getUnreadIds,
  markAsRead,
  getNotificationStreamUrl,
} from '@/services/inquiryService';
