/**
 * useChatHistory.ts
 * 채팅 세션 관리 훅
 * @since 2025-12-20
 */

import { useState, useCallback } from 'react';
import { getAuthToken, API_CONFIG } from '@/shared/lib/api';
import { errorReporter } from '@/shared/lib/errorReporter';

/**
 * 채팅 세션 타입
 */
export interface ChatSession {
  session_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  total_tokens: number;
  last_message_preview: string;
}

/**
 * 저장된 메시지 타입
 */
export interface SavedMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  } | null;
  tools_used?: string[] | null;
}

/**
 * 세션 상세 정보 타입
 */
export interface SessionDetail {
  session: {
    session_id: string;
    title: string;
    created_at: string;
    updated_at: string;
    message_count: number;
    total_tokens: number;
  };
  messages: SavedMessage[];
}

/**
 * 페이지네이션 정보 타입
 */
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * useChatHistory 반환 타입
 */
export interface UseChatHistoryReturn {
  /** 세션 목록 */
  sessions: ChatSession[];
  /** 페이지네이션 정보 */
  pagination: Pagination | null;
  /** 세션 목록 로딩 중 */
  isLoadingSessions: boolean;
  /** 세션 메시지 로딩 중 */
  isLoadingMessages: boolean;
  /** 세션 목록 조회 */
  fetchSessions: (page?: number, limit?: number) => Promise<void>;
  /** 세션 메시지 조회 */
  loadSession: (sessionId: string) => Promise<SessionDetail | null>;
  /** 세션 삭제 */
  deleteSession: (sessionId: string) => Promise<boolean>;
  /** 세션 제목 수정 */
  updateSessionTitle: (sessionId: string, title: string) => Promise<boolean>;
  /** 에러 메시지 */
  error: string | null;
}

/**
 * API 요청 함수
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  if (!token) {
    throw new Error('인증이 필요합니다.');
  }

  const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

/**
 * 채팅 세션 관리 훅
 *
 * @example
 * ```tsx
 * const {
 *   sessions,
 *   fetchSessions,
 *   loadSession,
 *   deleteSession
 * } = useChatHistory();
 *
 * // 세션 목록 불러오기
 * useEffect(() => {
 *   fetchSessions();
 * }, [fetchSessions]);
 *
 * // 세션 선택 시 메시지 불러오기
 * const handleSelectSession = async (sessionId: string) => {
 *   const detail = await loadSession(sessionId);
 *   if (detail) {
 *     setMessages(detail.messages);
 *   }
 * };
 * ```
 */
export function useChatHistory(): UseChatHistoryReturn {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 세션 목록 조회
   */
  const fetchSessions = useCallback(async (page = 1, limit = 20) => {
    setIsLoadingSessions(true);
    setError(null);

    try {
      const data = await apiRequest<{
        success: boolean;
        sessions: ChatSession[];
        pagination: Pagination;
      }>(`/api/chat/sessions?page=${page}&limit=${limit}`);

      setSessions(data.sessions);
      setPagination(data.pagination);
    } catch (err) {
      const message = err instanceof Error ? err.message : '세션 목록 조회 실패';
      setError(message);
      console.error('[useChatHistory] fetchSessions 오류:', message);
      errorReporter.reportApiError(err as Error, { component: 'useChatHistory.fetchSessions' });
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  /**
   * 세션 메시지 조회
   */
  const loadSession = useCallback(async (sessionId: string): Promise<SessionDetail | null> => {
    setIsLoadingMessages(true);
    setError(null);

    try {
      const data = await apiRequest<{
        success: boolean;
        session: SessionDetail['session'];
        messages: SavedMessage[];
      }>(`/api/chat/sessions/${sessionId}`);

      return {
        session: data.session,
        messages: data.messages
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : '세션 조회 실패';
      setError(message);
      console.error('[useChatHistory] loadSession 오류:', message);
      errorReporter.reportApiError(err as Error, { component: 'useChatHistory.loadSession' });
      return null;
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  /**
   * 세션 삭제
   */
  const deleteSession = useCallback(async (sessionId: string): Promise<boolean> => {
    setError(null);

    try {
      await apiRequest<{ success: boolean }>(`/api/chat/sessions/${sessionId}`, {
        method: 'DELETE'
      });

      // 로컬 상태에서 제거
      setSessions(prev => prev.filter(s => s.session_id !== sessionId));

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : '세션 삭제 실패';
      setError(message);
      console.error('[useChatHistory] deleteSession 오류:', message);
      errorReporter.reportApiError(err as Error, { component: 'useChatHistory.deleteSession' });
      return false;
    }
  }, []);

  /**
   * 세션 제목 수정
   */
  const updateSessionTitle = useCallback(async (
    sessionId: string,
    title: string
  ): Promise<boolean> => {
    setError(null);

    try {
      await apiRequest<{ success: boolean }>(`/api/chat/sessions/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title })
      });

      // 로컬 상태 업데이트
      setSessions(prev =>
        prev.map(s =>
          s.session_id === sessionId ? { ...s, title } : s
        )
      );

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : '제목 수정 실패';
      setError(message);
      console.error('[useChatHistory] updateSessionTitle 오류:', message);
      errorReporter.reportApiError(err as Error, { component: 'useChatHistory.updateSessionTitle' });
      return false;
    }
  }, []);

  return {
    sessions,
    pagination,
    isLoadingSessions,
    isLoadingMessages,
    fetchSessions,
    loadSession,
    deleteSession,
    updateSessionTitle,
    error
  };
}

