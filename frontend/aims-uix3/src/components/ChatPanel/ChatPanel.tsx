/**
 * ChatPanel.tsx
 * AI 채팅 패널 컴포넌트
 * @since 2025-12-20
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChatSSE, ChatMessage } from '@/shared/hooks/useChatSSE';
import { useChatHistory, ChatSession } from '@/shared/hooks/useChatHistory';
import Button from '@/shared/ui/Button';
import Tooltip from '@/shared/ui/Tooltip';
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../SFSymbol';
import './ChatPanel.css';

interface ChatPanelProps {
  /** 패널 열림 상태 */
  isOpen: boolean;
  /** 패널 닫기 핸들러 */
  onClose: () => void;
}

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

/**
 * AI 채팅 패널 컴포넌트
 * RightPane 슬라이드 패널로 표시됨
 */
// 기본 너비 및 제한
const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 320;
const MAX_WIDTH = 600;

export const ChatPanel: React.FC<ChatPanelProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showSessionList, setShowSessionList] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const {
    sendMessage,
    abort,
    isLoading,
    currentResponse,
    activeTools
  } = useChatSSE();

  const {
    sessions,
    isLoadingSessions,
    isLoadingMessages,
    fetchSessions,
    loadSession,
    deleteSession
  } = useChatHistory();

  // 패널 열릴 때 세션 목록 로드
  useEffect(() => {
    if (isOpen) {
      fetchSessions(1, 10);
    }
  }, [isOpen, fetchSessions]);

  // 리사이즈 핸들러
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      setPanelWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // 자동 스크롤
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentResponse, scrollToBottom]);

  // 패널 열릴 때 입력창에 자동 포커스
  useEffect(() => {
    if (!isOpen) return;

    // 애니메이션 완료 후 포커스 (300ms transition)
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 320);

    return () => clearTimeout(timer);
  }, [isOpen]);

  // 입력창 자동 높이 조절
  const adjustTextareaHeight = useCallback(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, []);

  // 메시지 전송
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    // 사용자 메시지 추가
    const userMessage: DisplayMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmedInput,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    // textarea 높이 리셋
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      // 대화 히스토리 구성
      const chatMessages: ChatMessage[] = [...messages, userMessage].map(m => ({
        role: m.role,
        content: m.content
      }));

      // 메시지 전송 및 응답 받기 (세션 ID 포함)
      const result = await sendMessage(chatMessages, { sessionId: sessionId || undefined });

      // 새 세션 ID 저장
      if (result.sessionId && !sessionId) {
        setSessionId(result.sessionId);
      }

      // 어시스턴트 응답 추가
      if (result.response) {
        setMessages(prev => [...prev, {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: result.response,
          timestamp: new Date()
        }]);
      }
    } catch (error) {
      console.error('[ChatPanel] 전송 오류:', error);
      // 에러 메시지 표시
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        timestamp: new Date()
      }]);
    }
  };

  // 세션 선택
  const handleSelectSession = async (selectedSession: ChatSession) => {
    setShowSessionList(false);
    const detail = await loadSession(selectedSession.session_id);

    if (detail) {
      setSessionId(selectedSession.session_id);
      setMessages(detail.messages.map((m, idx) => ({
        id: `${m.role}-${idx}-${Date.now()}`,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.timestamp)
      })));
    }
  };

  // 새 대화 시작
  const handleNewChat = () => {
    if (isLoading) {
      abort();
    }
    setSessionId(null);
    setMessages([]);
    setInput('');
    setShowSessionList(false);
    // 세션 목록 새로고침
    fetchSessions(1, 10);
  };

  // 세션 삭제
  const handleDeleteSession = async (e: React.MouseEvent, targetSessionId: string) => {
    e.stopPropagation();
    const confirmed = await deleteSession(targetSessionId);
    if (confirmed && sessionId === targetSessionId) {
      handleNewChat();
    }
  };

  // Enter 키 처리 (Shift+Enter는 줄바꿈)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // 대화 초기화 (= 새 대화)
  const handleClear = handleNewChat;

  return (
    <div
      ref={panelRef}
      className={`chat-panel ${isOpen ? 'chat-panel--open' : ''} ${isResizing ? 'chat-panel--resizing' : ''}`}
      style={{ width: panelWidth }}
    >
      {/* 리사이즈 핸들 */}
      <div
        className="chat-panel__resize-handle"
        onMouseDown={handleResizeStart}
        title="드래그하여 너비 조절"
      />
      {/* Header */}
      <div className="chat-panel__header">
        <div className="chat-panel__title">
          {/* AI 로봇 아이콘 v3 - 미니멀 모던 스타일 */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="robotGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#8B5CF6" />
                <stop offset="100%" stopColor="#06B6D4" />
              </linearGradient>
            </defs>
            {/* 머리 - 둥근 사각형 */}
            <rect x="4" y="5" width="16" height="14" rx="4" fill="url(#robotGradient)" />
            {/* 눈 - LED 스타일 */}
            <rect x="7" y="9" width="3" height="4" rx="1" fill="white" />
            <rect x="14" y="9" width="3" height="4" rx="1" fill="white" />
            {/* 안테나 */}
            <line x1="12" y1="5" x2="12" y2="2" stroke="url(#robotGradient)" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="1.5" r="1.5" fill="url(#robotGradient)" />
            {/* 귀 */}
            <rect x="1" y="9" width="3" height="6" rx="1" fill="url(#robotGradient)" />
            <rect x="20" y="9" width="3" height="6" rx="1" fill="url(#robotGradient)" />
          </svg>
          <span>AI 어시스턴트</span>
        </div>
        <div className="chat-panel__header-actions">
          {/* 이전 대화 목록 */}
          <Tooltip content="이전 대화">
            <button
              type="button"
              className={`chat-panel__header-btn ${showSessionList ? 'chat-panel__header-btn--active' : ''}`}
              onClick={() => setShowSessionList(!showSessionList)}
              aria-label="이전 대화"
            >
              <SFSymbol name="clock.arrow.circlepath" size={SFSymbolSize.CAPTION_1} />
            </button>
          </Tooltip>
          {/* 새 대화 */}
          <Tooltip content="새 대화">
            <button
              type="button"
              className="chat-panel__header-btn"
              onClick={handleNewChat}
              aria-label="새 대화"
            >
              <SFSymbol name="plus" size={SFSymbolSize.CAPTION_1} />
            </button>
          </Tooltip>
          {/* 삭제 */}
          {messages.length > 0 && (
            <Tooltip content="대화 초기화">
              <button
                type="button"
                className="chat-panel__header-btn"
                onClick={handleClear}
                aria-label="대화 초기화"
              >
                <SFSymbol name="trash" size={SFSymbolSize.CAPTION_1} />
              </button>
            </Tooltip>
          )}
          <Tooltip content="닫기">
            <button
              type="button"
              className="chat-panel__header-btn chat-panel__close"
              onClick={onClose}
              aria-label="닫기"
            >
              <SFSymbol name="xmark" size={SFSymbolSize.FOOTNOTE} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* 세션 목록 드롭다운 */}
      {showSessionList && (
        <div className="chat-panel__session-list">
          <div className="chat-panel__session-list-header">
            <span>이전 대화</span>
            {isLoadingSessions && <span className="chat-panel__session-loading">...</span>}
          </div>
          {sessions.length === 0 ? (
            <div className="chat-panel__session-empty">저장된 대화가 없습니다</div>
          ) : (
            <div className="chat-panel__session-items">
              {sessions.map((s) => (
                <div
                  key={s.session_id}
                  className={`chat-panel__session-item ${sessionId === s.session_id ? 'chat-panel__session-item--active' : ''}`}
                  onClick={() => handleSelectSession(s)}
                >
                  <div className="chat-panel__session-info">
                    <div className="chat-panel__session-title">{s.title}</div>
                    <div className="chat-panel__session-meta">
                      {s.message_count}개 메시지 · {new Date(s.updated_at).toLocaleDateString('ko-KR')}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="chat-panel__session-delete"
                    onClick={(e) => handleDeleteSession(e, s.session_id)}
                    title="삭제"
                  >
                    <SFSymbol name="xmark" size={SFSymbolSize.CAPTION_2} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 메시지 로딩 오버레이 */}
      {isLoadingMessages && (
        <div className="chat-panel__loading-overlay">
          <span className="chat-panel__loading-dot" />
          <span className="chat-panel__loading-dot" />
          <span className="chat-panel__loading-dot" />
        </div>
      )}

      {/* Messages */}
      <div className="chat-panel__messages">
        {messages.length === 0 && !isLoading && (
          <div className="chat-panel__empty">
            <SFSymbol
              name="sparkles"
              size={SFSymbolSize.TITLE_2}
              weight={SFSymbolWeight.LIGHT}
            />
            <p>무엇이든 물어보세요!</p>
            <span>고객, 문서, 계약 정보를 검색할 수 있습니다.</span>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-panel__message chat-panel__message--${msg.role}`}
          >
            <div className="chat-panel__message-content">
              {msg.content}
            </div>
          </div>
        ))}

        {/* 스트리밍 응답 */}
        {isLoading && currentResponse && (
          <div className="chat-panel__message chat-panel__message--assistant chat-panel__message--streaming">
            <div className="chat-panel__message-content">
              {currentResponse}
              <span className="chat-panel__cursor" />
            </div>
          </div>
        )}

        {/* 도구 사용 인디케이터 */}
        {activeTools.length > 0 && (
          <div className="chat-panel__tool-indicator">
            <span className="chat-panel__tool-spinner" />
            <span>데이터 조회 중: {activeTools.join(', ')}</span>
          </div>
        )}

        {/* 로딩 인디케이터 (응답 대기 중) */}
        {isLoading && !currentResponse && activeTools.length === 0 && (
          <div className="chat-panel__loading">
            <span className="chat-panel__loading-dot" />
            <span className="chat-panel__loading-dot" />
            <span className="chat-panel__loading-dot" />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form className="chat-panel__input-area" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          className="chat-panel__input"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            adjustTextareaHeight();
          }}
          onKeyDown={handleKeyDown}
          placeholder="메시지를 입력하세요... (Shift+Enter로 줄바꿈)"
          disabled={isLoading}
          rows={1}
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={!input.trim() || isLoading}
        >
          {isLoading ? (
            <SFSymbol name="stop.fill" size={SFSymbolSize.CAPTION_1} />
          ) : (
            <SFSymbol name="arrow.up" size={SFSymbolSize.CAPTION_1} />
          )}
        </Button>
      </form>
    </div>
  );
};

export default ChatPanel;
