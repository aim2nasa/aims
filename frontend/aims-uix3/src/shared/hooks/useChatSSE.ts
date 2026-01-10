/**
 * useChatSSE.ts
 * AI 채팅 SSE 스트리밍 훅
 * @since 2025-12-20
 */

import { useState, useCallback, useRef } from 'react';
import { getAuthToken, API_CONFIG } from '@/shared/lib/api';
import { errorReporter } from '@/shared/lib/errorReporter';

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
  type: 'content' | 'tool_start' | 'tool_calling' | 'tool_result' | 'done' | 'error' | 'session' | 'rate_limit_retry' | 'credit_exceeded';
  content?: string;
  tools?: string[];
  name?: string;
  success?: boolean;
  error?: string;
  session_id?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  // Rate limit retry 정보
  attempt?: number;
  maxAttempts?: number;
  delayMs?: number;
  // Credit exceeded 정보
  credits_used?: number;
  credits_remaining?: number;
  credit_quota?: number;
  credit_usage_percent?: number;
  days_until_reset?: number;
  tier?: string;
  tier_name?: string;
}

/**
 * 크레딧 초과 정보
 */
export interface CreditExceededInfo {
  credits_used: number;
  credits_remaining: number;
  credit_quota: number;
  credit_usage_percent: number;
  days_until_reset: number;
  tier?: string;
  tier_name?: string;
}

/**
 * 메시지 전송 옵션
 */
export interface SendMessageOptions {
  /** 기존 세션 ID (없으면 새 세션 생성) */
  sessionId?: string;
  /** 청크 콜백 */
  onChunk?: (event: ChatEvent) => void;
}

/**
 * 메시지 전송 결과
 */
export interface SendMessageResult {
  /** 응답 텍스트 */
  response: string;
  /** 세션 ID */
  sessionId: string | null;
}

/**
 * Rate limit 재시도 상태
 */
export interface RateLimitRetryStatus {
  isRetrying: boolean;
  attempt: number;
  maxAttempts: number;
  delayMs: number;
}

/**
 * useChatSSE 반환 타입
 */
export interface UseChatSSEReturn {
  /** 메시지 전송 (세션 ID 지원) */
  sendMessage: (messages: ChatMessage[], options?: SendMessageOptions) => Promise<SendMessageResult>;
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
  /** 현재 세션 ID */
  currentSessionId: string | null;
  /** Rate limit 재시도 상태 */
  retryStatus: RateLimitRetryStatus | null;
  /** 크레딧 초과 정보 */
  creditExceededInfo: CreditExceededInfo | null;
  /** 크레딧 초과 상태 초기화 */
  clearCreditExceeded: () => void;
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
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [retryStatus, setRetryStatus] = useState<RateLimitRetryStatus | null>(null);
  const [creditExceededInfo, setCreditExceededInfo] = useState<CreditExceededInfo | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * 크레딧 초과 상태 초기화
   */
  const clearCreditExceeded = useCallback(() => {
    setCreditExceededInfo(null);
  }, []);

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
            errorReporter.reportApiError(e as Error, { component: 'useChatSSE.parseSSE' });
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
    options?: SendMessageOptions
  ): Promise<SendMessageResult> => {
    const token = getAuthToken();
    if (!token) {
      throw new Error('인증이 필요합니다. 다시 로그인해주세요.');
    }

    const { sessionId, onChunk } = options || {};

    // 상태 초기화
    setIsLoading(true);
    setCurrentResponse('');
    setActiveTools([]);
    setLastUsage(null);
    setRetryStatus(null);

    // AbortController 생성
    abortControllerRef.current = new AbortController();

    let fullResponse = '';
    let resultSessionId: string | null = sessionId || null;

    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          messages,
          session_id: sessionId
        }),
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
            case 'session':
              // 새 세션 ID 수신
              if (event.session_id) {
                resultSessionId = event.session_id;
                setCurrentSessionId(event.session_id);
              }
              break;

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

            case 'rate_limit_retry':
              // Rate limit 재시도 상태 업데이트
              setRetryStatus({
                isRetrying: true,
                attempt: event.attempt || 1,
                maxAttempts: event.maxAttempts || 3,
                delayMs: event.delayMs || 1000
              });
              break;

            case 'done':
              setActiveTools([]);
              setRetryStatus(null);  // 완료 시 재시도 상태 초기화
              if (event.usage) {
                setLastUsage(event.usage);
              }
              break;

            case 'credit_exceeded':
              // 크레딧 초과 이벤트 처리
              setCreditExceededInfo({
                credits_used: event.credits_used ?? 0,
                credits_remaining: event.credits_remaining ?? 0,
                credit_quota: event.credit_quota ?? 0,
                credit_usage_percent: event.credit_usage_percent ?? 100,
                days_until_reset: event.days_until_reset ?? 0,
                tier: event.tier,
                tier_name: event.tier_name
              });
              break;

            case 'error':
              throw new Error(event.error || '알 수 없는 오류가 발생했습니다.');
          }
        }
      }

      return { response: fullResponse, sessionId: resultSessionId };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[useChatSSE] 요청이 중단되었습니다.');
        return { response: fullResponse, sessionId: resultSessionId };
      }
      throw error;
    } finally {
      setIsLoading(false);
      setActiveTools([]);
      setRetryStatus(null);
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
    lastUsage,
    currentSessionId,
    retryStatus,
    creditExceededInfo,
    clearCreditExceeded
  };
}

export default useChatSSE;
