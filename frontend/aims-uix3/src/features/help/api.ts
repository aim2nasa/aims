/**
 * 도움말 콘텐츠 API
 * 공지사항, 사용 가이드, FAQ 조회
 * @since 2025-12-18
 */

import { api } from '@/shared/lib/api';

// 공지사항 타입
export interface Notice {
  _id: string;
  title: string;
  content: string;
  category: 'system' | 'product' | 'policy' | 'event';
  isNew: boolean;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

// 사용 가이드 항목 타입
export interface GuideItem {
  id: string;
  title: string;
  description: string;
  steps: string[];
  order: number;
}

// 사용 가이드 카테고리 타입
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
}

// FAQ 타입
export interface FAQ {
  _id: string;
  question: string;
  answer: string;
  category: 'general' | 'customer' | 'document' | 'contract' | 'account';
  order: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

// 카테고리 라벨
export const NOTICE_CATEGORY_LABELS: Record<Notice['category'], string> = {
  system: '시스템',
  product: '상품',
  policy: '정책',
  event: '이벤트',
};

export const FAQ_CATEGORY_LABELS: Record<FAQ['category'], string> = {
  general: '일반',
  customer: '고객',
  document: '문서',
  contract: '계약',
  account: '계정',
};

// API 응답 타입
interface NoticesResponse {
  success: boolean;
  data: {
    notices: Notice[];
  };
}

interface UsageGuidesResponse {
  success: boolean;
  data: UsageGuide[];
}

interface FAQsResponse {
  success: boolean;
  data: FAQ[];
}

// API 함수
export const helpApi = {
  // 공지사항 목록 조회
  getNotices: async (): Promise<Notice[]> => {
    const response = await api.get<NoticesResponse>('/api/notices');
    return response.data.notices;
  },

  // 사용 가이드 목록 조회
  getUsageGuides: async (): Promise<UsageGuide[]> => {
    const response = await api.get<UsageGuidesResponse>('/api/usage-guides');
    return response.data;
  },

  // FAQ 목록 조회
  getFAQs: async (): Promise<FAQ[]> => {
    const response = await api.get<FAQsResponse>('/api/faqs');
    return response.data;
  },
};

export default helpApi;
