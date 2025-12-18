/**
 * 도움말 콘텐츠 관리 API
 * 공지사항, 사용 가이드, FAQ 관리
 * @since 2025-12-18
 */

import { apiClient } from '@/shared/api/apiClient';

// ========================================
// 공지사항 타입
// ========================================

export type NoticeCategory = 'system' | 'product' | 'policy' | 'event';

export interface Notice {
  _id: string;
  title: string;
  content: string;
  category: NoticeCategory;
  isNew: boolean;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface NoticesResponse {
  notices: Notice[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const NOTICE_CATEGORY_LABELS: Record<NoticeCategory, string> = {
  system: '시스템',
  product: '상품',
  policy: '정책',
  event: '이벤트',
};

// ========================================
// 사용 가이드 타입
// ========================================

export interface GuideItem {
  id: string;
  title: string;
  description: string;
  steps: string[];
  order: number;
}

export interface UsageGuide {
  _id: string;
  categoryId: string;
  categoryTitle: string;
  categoryIcon: string;
  colorClass: string;
  order: number;
  items: GuideItem[];
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export const GUIDE_CATEGORY_LABELS: Record<string, string> = {
  customer: '고객 관리',
  document: '문서 관리',
  contract: '계약 관리',
};

// ========================================
// FAQ 타입
// ========================================

export interface FAQ {
  _id: string;
  question: string;
  answer: string;
  category: string; // DB에서 동적으로 가져오므로 string 타입
  order: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// FAQ 카테고리 타입 (DB에서 동적으로)
export interface FAQCategoryInfo {
  key: string;
  label: string;
  count: number;
}

// ========================================
// 공지사항 API
// ========================================

export async function getNotices(params?: {
  category?: NoticeCategory;
  isPublished?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<NoticesResponse> {
  const searchParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        searchParams.append(key, String(value));
      }
    });
  }

  const response = await apiClient.get<{ success: boolean; data: NoticesResponse }>(
    `/api/admin/notices?${searchParams.toString()}`
  );
  return response.data;
}

export async function createNotice(data: {
  title: string;
  content: string;
  category: NoticeCategory;
  isNew?: boolean;
  isPublished?: boolean;
}): Promise<Notice> {
  const response = await apiClient.post<{ success: boolean; data: Notice }>(
    '/api/admin/notices',
    data
  );
  return response.data;
}

export async function updateNotice(id: string, data: {
  title?: string;
  content?: string;
  category?: NoticeCategory;
  isNew?: boolean;
  isPublished?: boolean;
}): Promise<Notice> {
  const response = await apiClient.put<{ success: boolean; data: Notice }>(
    `/api/admin/notices/${id}`,
    data
  );
  return response.data;
}

export async function deleteNotice(id: string): Promise<void> {
  await apiClient.delete(`/api/admin/notices/${id}`);
}

// ========================================
// 사용 가이드 API
// ========================================

export async function getUsageGuides(): Promise<UsageGuide[]> {
  const response = await apiClient.get<{ success: boolean; data: UsageGuide[] }>(
    '/api/admin/usage-guides'
  );
  return response.data;
}

export async function createUsageGuide(data: {
  categoryId: string;
  categoryTitle: string;
  categoryIcon?: string;
  colorClass?: string;
  order?: number;
  isPublished?: boolean;
}): Promise<UsageGuide> {
  const response = await apiClient.post<{ success: boolean; data: UsageGuide }>(
    '/api/admin/usage-guides',
    data
  );
  return response.data;
}

export async function updateUsageGuide(id: string, data: {
  categoryTitle?: string;
  categoryIcon?: string;
  colorClass?: string;
  order?: number;
  items?: GuideItem[];
  isPublished?: boolean;
}): Promise<UsageGuide> {
  const response = await apiClient.put<{ success: boolean; data: UsageGuide }>(
    `/api/admin/usage-guides/${id}`,
    data
  );
  return response.data;
}

export async function deleteUsageGuide(id: string): Promise<void> {
  await apiClient.delete(`/api/admin/usage-guides/${id}`);
}

export async function addGuideItem(guideId: string, data: {
  itemId: string;
  title: string;
  description?: string;
  steps?: string[];
  order?: number;
}): Promise<UsageGuide> {
  const response = await apiClient.post<{ success: boolean; data: UsageGuide }>(
    `/api/admin/usage-guides/${guideId}/items`,
    data
  );
  return response.data;
}

export async function updateGuideItem(guideId: string, itemId: string, data: {
  title?: string;
  description?: string;
  steps?: string[];
  order?: number;
}): Promise<UsageGuide> {
  const response = await apiClient.put<{ success: boolean; data: UsageGuide }>(
    `/api/admin/usage-guides/${guideId}/items/${itemId}`,
    data
  );
  return response.data;
}

export async function deleteGuideItem(guideId: string, itemId: string): Promise<void> {
  await apiClient.delete(`/api/admin/usage-guides/${guideId}/items/${itemId}`);
}

// ========================================
// FAQ API
// ========================================

/**
 * FAQ 카테고리 목록 조회 (DB에서 동적으로)
 */
export async function getFAQCategories(): Promise<FAQCategoryInfo[]> {
  const response = await apiClient.get<{ success: boolean; data: FAQCategoryInfo[] }>(
    '/api/admin/faq-categories'
  );
  return response.data;
}

export async function getFAQs(params?: {
  category?: string;
  isPublished?: boolean;
  search?: string;
}): Promise<FAQ[]> {
  const searchParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        searchParams.append(key, String(value));
      }
    });
  }

  const response = await apiClient.get<{ success: boolean; data: FAQ[] }>(
    `/api/admin/faqs?${searchParams.toString()}`
  );
  return response.data;
}

export async function createFAQ(data: {
  question: string;
  answer: string;
  category: string;
  order?: number;
  isPublished?: boolean;
}): Promise<FAQ> {
  const response = await apiClient.post<{ success: boolean; data: FAQ }>(
    '/api/admin/faqs',
    data
  );
  return response.data;
}

export async function updateFAQ(id: string, data: {
  question?: string;
  answer?: string;
  category?: string;
  order?: number;
  isPublished?: boolean;
}): Promise<FAQ> {
  const response = await apiClient.put<{ success: boolean; data: FAQ }>(
    `/api/admin/faqs/${id}`,
    data
  );
  return response.data;
}

export async function deleteFAQ(id: string): Promise<void> {
  await apiClient.delete(`/api/admin/faqs/${id}`);
}

export async function reorderFAQs(orders: { id: string; order: number }[]): Promise<void> {
  await apiClient.put('/api/admin/faqs/reorder', { orders });
}

// ========================================
// Export
// ========================================

export const helpContentApi = {
  // Notices
  getNotices,
  createNotice,
  updateNotice,
  deleteNotice,
  // Usage Guides
  getUsageGuides,
  createUsageGuide,
  updateUsageGuide,
  deleteUsageGuide,
  addGuideItem,
  updateGuideItem,
  deleteGuideItem,
  // FAQs
  getFAQCategories,
  getFAQs,
  createFAQ,
  updateFAQ,
  deleteFAQ,
  reorderFAQs,
};
