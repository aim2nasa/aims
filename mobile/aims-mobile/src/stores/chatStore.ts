import { create } from 'zustand';
import { ChatMessage, ChatEvent, ChatSession } from '../types';
import * as chatService from '../services/chatService';

interface ChatState {
  // 현재 대화 상태
  messages: ChatMessage[];
  sessionId: string | null;
  isStreaming: boolean;
  streamingContent: string;
  activeTools: string[];
  error: string | null;

  // 세션 목록
  sessions: ChatSession[];
  sessionsLoading: boolean;

  // 액션
  sendMessage: (content: string) => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  loadSessions: () => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  newChat: () => void;
  clearError: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  sessionId: null,
  isStreaming: false,
  streamingContent: '',
  activeTools: [],
  error: null,
  sessions: [],
  sessionsLoading: false,

  // 메시지 전송
  sendMessage: async (content: string) => {
    const { messages, sessionId } = get();

    // 사용자 메시지 추가
    const userMessage: ChatMessage = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    set({
      messages: [...messages, userMessage],
      isStreaming: true,
      streamingContent: '',
      activeTools: [],
      error: null,
    });

    try {
      let newSessionId = sessionId;
      let assistantContent = '';

      // SSE 스트리밍 처리
      for await (const event of chatService.sendMessage(
        [...messages, userMessage],
        sessionId || undefined
      )) {
        switch (event.type) {
          case 'session':
            newSessionId = event.session_id || null;
            set({ sessionId: newSessionId });
            break;

          case 'content':
            assistantContent += event.content || '';
            set({ streamingContent: assistantContent });
            break;

          case 'tool_start':
            set({ activeTools: event.tools || [] });
            break;

          case 'tool_calling':
            // 특정 도구 호출 중 표시
            break;

          case 'tool_result':
            // 도구 결과 처리
            break;

          case 'done':
            // 완료 - 어시스턴트 메시지 추가
            const assistantMessage: ChatMessage = {
              role: 'assistant',
              content: assistantContent,
              timestamp: new Date().toISOString(),
              metadata: {
                tokens: event.usage,
              },
            };

            set((state) => ({
              messages: [...state.messages, assistantMessage],
              isStreaming: false,
              streamingContent: '',
              activeTools: [],
            }));
            break;

          case 'error':
            set({
              error: event.error || '오류가 발생했습니다.',
              isStreaming: false,
              activeTools: [],
            });
            break;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '메시지 전송 중 오류가 발생했습니다.';
      set({
        error: message,
        isStreaming: false,
        activeTools: [],
      });
    }
  },

  // 세션 로드
  loadSession: async (sessionId: string) => {
    try {
      const response = await chatService.getSession(sessionId);
      if (response.success && response.session) {
        set({
          sessionId,
          messages: response.session.messages,
          error: null,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '세션을 불러오는 중 오류가 발생했습니다.';
      set({ error: message });
    }
  },

  // 세션 목록 로드
  loadSessions: async () => {
    set({ sessionsLoading: true });
    try {
      const response = await chatService.getSessions();
      if (response.success) {
        set({ sessions: response.sessions, sessionsLoading: false });
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
      set({ sessionsLoading: false });
    }
  },

  // 세션 삭제
  deleteSession: async (sessionId: string) => {
    try {
      await chatService.deleteSession(sessionId);
      set((state) => ({
        sessions: state.sessions.filter((s) => s.session_id !== sessionId),
        // 현재 세션이 삭제되면 초기화
        ...(state.sessionId === sessionId && {
          sessionId: null,
          messages: [],
        }),
      }));
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  },

  // 새 채팅 시작
  newChat: () => {
    set({
      sessionId: null,
      messages: [],
      streamingContent: '',
      activeTools: [],
      error: null,
    });
  },

  // 에러 클리어
  clearError: () => {
    set({ error: null });
  },
}));
