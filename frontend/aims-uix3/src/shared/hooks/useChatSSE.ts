/**
 * useChatSSE.ts
 * AI 채팅 SSE 스트리밍 훅
 * @since 2025-12-20
 */

import { useState, useCallback, useRef } from 'react';
import { getAuthToken, API_CONFIG } from '@/shared/lib/api';

/**
 * 채팅 메시지 타입
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * SSE 이벤트 타입
 */
export interface ChatEvent {
  type: 'content' | 'tool_start' | 'tool_calling' | 'tool_result' | 'done' | 'error';
  content?: string;
  tools?: string[];
  name?: string;
  success?: boolean;
  error?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * useChatSSE 반환 타입
 */
export interface UseChatSSEReturn {
  /** 메시지 전송 */
  sendMessage: (messages: ChatMessage[], onChunk?: (event: ChatEvent) => void) => Promise<string>;
  /** 요청 중단 */
  abort: () => void;
  /** 로딩 상태 */
  isLoading: boolean;
  /** 현재 스트리밍 응답 */
  currentResponse: string;
  /** 현재 실행 중인 도구들 */
  activeTools: string[];
  /** 마지막 사용량 정보 */
  lastUsage: ChatEvent['usage'] | null;
}

/**
 * AI 채팅 SSE 스트리밍 훅
 *
 * @example
 * ```tsx
 * const { sendMessage, isLoading, currentResponse, activeTools } = useChatSSE();
 *
 * const handleSend = async () => {
 *   const response = await sendMessage([
 *     { role: 'user', content: '홍길동 고객 정보 알려줘' }
 *   ]);
 *   console.log('최종 응답:', response);
 * };
 * ```
 */
export function useChatSSE(): UseChatSSEReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [lastUsage, setLastUsage] = useState<ChatEvent['usage'] | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * SSE 데이터 파싱
   */
  const parseSSE = useCallback((text: string): ChatEvent[] => {
    const events: ChatEvent[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6).trim();
        if (jsonStr) {
          try {
            events.push(JSON.parse(jsonStr));
          } catch (e) {
            console.error('[useChatSSE] JSON 파싱 오류:', e);
          }
        }
      }
    }

    return events;
  }, []);

  /**
   * 메시지 전송
   */
  const sendMessage = useCallback(async (
    messages: ChatMessage[],
    onChunk?: (event: ChatEvent) => void
  ): Promise<string> => {
    const token = getAuthToken();
    if (!token) {
      throw new Error('인증이 필요합니다. 다시 로그인해주세요.');
    }

    // 상태 초기화
    setIsLoading(true);
    setCurrentResponse('');
    setActiveTools([]);
    setLastUsage(null);

    // AbortController 생성
    abortControllerRef.current = new AbortController();

    let fullResponse = '';

    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ messages }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('스트리밍을 지원하지 않습니다.');
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const events = parseSSE(text);

        for (const event of events) {
          // 콜백 호출
          onChunk?.(event);

          switch (event.type) {
            case 'content':
              if (event.content) {
                fullResponse += event.content;
                setCurrentResponse(fullResponse);
              }
              break;

            case 'tool_start':
              if (event.tools) {
                setActiveTools(event.tools);
              }
              break;

            case 'tool_calling':
              // 현재 호출 중인 도구 표시 (optional)
              break;

            case 'tool_result':
              // 도구 실행 결과 (optional)
              break;

            case 'done':
              setActiveTools([]);
              if (event.usage) {
                setLastUsage(event.usage);
              }
              break;

            case 'error':
              throw new Error(event.error || '알 수 없는 오류가 발생했습니다.');
          }
        }
      }

      return fullResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[useChatSSE] 요청이 중단되었습니다.');
        return fullResponse;
      }
      throw error;
    } finally {
      setIsLoading(false);
      setActiveTools([]);
      abortControllerRef.current = null;
    }
  }, [parseSSE]);

  /**
   * 요청 중단
   */
  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  return {
    sendMessage,
    abort,
    isLoading,
    currentResponse,
    activeTools,
    lastUsage
  };
}

export default useChatSSE;
