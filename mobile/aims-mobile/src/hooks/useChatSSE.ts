import { useState, useRef, useCallback } from 'react';
import { ChatMessage, ChatEvent } from '../types';
import { api } from '../services/api';

interface UseChatSSEReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  activeTools: string[];
  currentTool: string | null;
  sessionId: string | null;
  error: string | null;
  lastUsage: ChatEvent['usage'] | null;

  sendMessage: (content: string) => Promise<void>;
  setMessages: (messages: ChatMessage[]) => void;
  setSessionId: (id: string | null) => void;
  abort: () => void;
  clearError: () => void;
}

export function useChatSSE(): UseChatSSEReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUsage, setLastUsage] = useState<ChatEvent['usage'] | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;

    // 이전 요청 취소
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // 사용자 메시지 추가
    const userMessage: ChatMessage = {
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setIsStreaming(true);
    setStreamingContent('');
    setActiveTools([]);
    setCurrentTool(null);
    setError(null);

    try {
      let assistantContent = '';
      let newSessionId = sessionId;

      // SSE 스트리밍
      for await (const event of api.streamSSE('/api/chat', {
        messages: updatedMessages,
        session_id: sessionId || undefined,
      })) {
        // 취소 확인
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }

        switch (event.type) {
          case 'session':
            newSessionId = event.session_id || null;
            setSessionId(newSessionId);
            break;

          case 'content':
            assistantContent += event.content || '';
            setStreamingContent(assistantContent);
            break;

          case 'tool_start':
            setActiveTools(event.tools || []);
            break;

          case 'tool_calling':
            setCurrentTool(event.name || null);
            break;

          case 'tool_result':
            setCurrentTool(null);
            break;

          case 'done':
            setLastUsage(event.usage || null);

            // 어시스턴트 메시지 추가
            const assistantMessage: ChatMessage = {
              role: 'assistant',
              content: assistantContent,
              timestamp: new Date().toISOString(),
              metadata: {
                tokens: event.usage,
              },
            };

            setMessages([...updatedMessages, assistantMessage]);
            setIsStreaming(false);
            setStreamingContent('');
            setActiveTools([]);
            break;

          case 'error':
            setError(event.error || '오류가 발생했습니다.');
            setIsStreaming(false);
            setActiveTools([]);
            break;
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // 사용자 취소
        return;
      }

      const message = err instanceof Error ? err.message : '메시지 전송 중 오류가 발생했습니다.';
      setError(message);
      setIsStreaming(false);
      setActiveTools([]);
    }
  }, [messages, sessionId]);

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
      setActiveTools([]);
      setCurrentTool(null);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    messages,
    isStreaming,
    streamingContent,
    activeTools,
    currentTool,
    sessionId,
    error,
    lastUsage,
    sendMessage,
    setMessages,
    setSessionId,
    abort,
    clearError,
  };
}
