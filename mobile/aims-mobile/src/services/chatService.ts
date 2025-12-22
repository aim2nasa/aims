import { api } from './api';
import { ChatMessage, ChatEvent, ChatSession, ChatSessionDetail } from '../types';

/**
 * 채팅 메시지 전송 (SSE 스트리밍)
 */
export async function* sendMessage(
  messages: ChatMessage[],
  sessionId?: string
): AsyncGenerator<ChatEvent> {
  for await (const event of api.streamSSE('/api/chat', {
    messages,
    session_id: sessionId,
  })) {
    yield event;
  }
}

/**
 * 채팅 세션 목록 조회
 */
export async function getSessions(
  page = 1,
  limit = 20
): Promise<{
  success: boolean;
  sessions: ChatSession[];
  pagination: { page: number; limit: number; total: number };
}> {
  return api.get(`/api/chat/sessions?page=${page}&limit=${limit}`);
}

/**
 * 채팅 세션 상세 조회
 */
export async function getSession(sessionId: string): Promise<{
  success: boolean;
  session: ChatSessionDetail;
}> {
  return api.get(`/api/chat/sessions/${sessionId}`);
}

/**
 * 채팅 세션 삭제
 */
export async function deleteSession(sessionId: string): Promise<{
  success: boolean;
  message: string;
}> {
  return api.delete(`/api/chat/sessions/${sessionId}`);
}

/**
 * 채팅 세션 제목 수정
 */
export async function updateSessionTitle(
  sessionId: string,
  title: string
): Promise<{
  success: boolean;
  message: string;
}> {
  return api.patch(`/api/chat/sessions/${sessionId}`, { title });
}

/**
 * MCP 도구 목록 조회
 */
export async function getTools(): Promise<{
  success: boolean;
  tools: Array<{
    type: string;
    function: {
      name: string;
      description: string;
      parameters: object;
    };
  }>;
  count: number;
}> {
  return api.get('/api/chat/tools');
}

/**
 * 채팅 사용 통계 조회
 */
export async function getStats(): Promise<{
  success: boolean;
  stats: {
    total_sessions: number;
    total_messages: number;
    total_tokens_used: number;
    estimated_cost_usd: number;
    tools_used: Record<string, number>;
  };
}> {
  return api.get('/api/chat/stats');
}
