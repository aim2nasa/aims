/**
 * Saved Questions Service
 * 나만의 질문 저장소 + 자주 쓰는 질문 API 서비스
 * @since 2025-12-27
 */

import { api } from '@/shared/lib/api';

/**
 * 저장된 질문 인터페이스
 */
export interface SavedQuestion {
  _id: string;
  text: string;
  createdAt: string;
}

/**
 * 자주 쓰는 질문 인터페이스
 */
export interface FrequentQuestion {
  _id: string;
  text: string;
  count: number;
  lastUsedAt: string;
}

/**
 * API 엔드포인트
 */
const ENDPOINTS = {
  SAVED_QUESTIONS: '/api/saved-questions',
  SAVED_QUESTION: (id: string) => `/api/saved-questions/${id}`,
  FREQUENT_QUESTIONS: '/api/frequent-questions',
  FREQUENT_TRACK: '/api/frequent-questions/track',
} as const;

/**
 * 저장된 질문 서비스
 */
export const SavedQuestionsService = {
  /**
   * 저장된 질문 목록 조회
   */
  async list(): Promise<SavedQuestion[]> {
    const response = await api.get<{ success: boolean; data: SavedQuestion[] }>(
      ENDPOINTS.SAVED_QUESTIONS
    );

    if (!response.success) {
      throw new Error('저장된 질문을 불러올 수 없습니다');
    }

    return response.data;
  },

  /**
   * 새 질문 저장
   */
  async create(text: string): Promise<SavedQuestion> {
    const response = await api.post<{ success: boolean; data: SavedQuestion; message?: string }>(
      ENDPOINTS.SAVED_QUESTIONS,
      { text }
    );

    if (!response.success) {
      throw new Error(response.message || '질문 저장에 실패했습니다');
    }

    return response.data;
  },

  /**
   * 질문 삭제
   */
  async delete(id: string): Promise<void> {
    const response = await api.delete<{ success: boolean; message?: string }>(
      ENDPOINTS.SAVED_QUESTION(id)
    );

    if (!response.success) {
      throw new Error(response.message || '질문 삭제에 실패했습니다');
    }
  },
};

/**
 * 자주 쓰는 질문 서비스
 */
export const FrequentQuestionsService = {
  /**
   * 자주 쓰는 질문 목록 조회
   */
  async list(): Promise<FrequentQuestion[]> {
    const response = await api.get<{ success: boolean; data: FrequentQuestion[] }>(
      ENDPOINTS.FREQUENT_QUESTIONS
    );

    if (!response.success) {
      throw new Error('자주 쓰는 질문을 불러올 수 없습니다');
    }

    return response.data;
  },

  /**
   * 질문 사용 추적 (메시지 전송 시 호출)
   */
  async track(text: string): Promise<void> {
    try {
      await api.post<{ success: boolean }>(
        ENDPOINTS.FREQUENT_TRACK,
        { text }
      );
    } catch {
      // 추적 실패는 무시 (사용자 경험에 영향 없음)
    }
  },
};
