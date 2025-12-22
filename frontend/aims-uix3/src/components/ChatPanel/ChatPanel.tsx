/**
 * ChatPanel.tsx
 * AI 채팅 패널 컴포넌트
 * @since 2025-12-20
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChatSSE, ChatMessage } from '@/shared/hooks/useChatSSE';
import { useChatHistory, ChatSession } from '@/shared/hooks/useChatHistory';
import { CustomerService } from '@/services/customerService';
import { DocumentService } from '@/services/DocumentService';
import { ContractService } from '@/services/contractService';
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

// 도움말 기능 목록 (MCP 도구 100% 커버리지) - 다양한 예시 포함
const HELP_FEATURES = [
  // 고객 관리 (4 tools: search, get, create, update)
  {
    icon: '🔍', title: '고객 검색', desc: '이름, 전화번호, 지역, 유형별 검색',
    examples: [
      '최근 등록한 고객 보여줘',
      '김씨 성을 가진 고객 찾아줘',
      '서울 지역 고객 목록 보여줘',
      '법인 고객 목록 보여줘',
      '개인 고객 중 부산 사는 분 찾아줘',
      '휴면 고객 목록 조회해줘',
      '010-1234로 시작하는 전화번호 가진 고객 검색해줘',
      '경기도에 사는 개인 고객 찾아줘',
      '이메일 주소가 gmail인 고객 검색해줘',
      '대구 사는 법인 고객 찾아줘',
    ]
  },
  {
    icon: '👤', title: '고객 상세 조회', desc: '특정 고객의 전체 정보 조회',
    examples: [
      '이 고객 상세 정보 알려줘',
      '선택한 고객의 전체 정보 보여줘',
      '홍길동 고객의 연락처와 주소 알려줘',
      '고객 등록일과 상태 확인해줘',
      '이 고객이 언제 등록됐는지 알려줘',
    ]
  },
  {
    icon: '➕', title: '고객 등록', desc: '새 고객 추가',
    examples: [
      '새 고객 등록해줘',
      '법인 고객 등록해줘',
      '새 고객 추가해줘',
      '새 고객 등록하고 싶어',
      '개인 고객 등록해줘',
      '고객 신규 등록해줘',
      '법인 고객 추가해줘',
    ]
  },
  {
    icon: '✏️', title: '고객 정보 수정', desc: '고객 연락처, 주소 등 수정',
    examples: [
      '고객 전화번호 수정해줘',
      '고객 이메일 수정해줘',
      '고객 주소 변경해줘',
      '고객 생년월일 수정해줘',
      '고객 연락처 업데이트해줘',
    ]
  },
  // 계약 관리 (3 tools: list, get_details, find_expiring)
  {
    icon: '📄', title: '계약 목록 조회', desc: '고객별 계약 현황, 상품별 필터',
    examples: [
      '내 전체 계약 목록 보여줘',
      '홍길동 고객의 계약 현황 알려줘',
      '삼성생명 계약 목록 조회해줘',
      '종신보험 계약만 보여줘',
      '이 고객의 모든 계약 보여줘',
      '최근 체결한 계약 20개 보여줘',
      '자동차보험 계약 목록 찾아줘',
      '납입 중인 계약만 조회해줘',
    ]
  },
  {
    icon: '📋', title: '계약 상세 조회', desc: '피보험자, 수익자, 특약 정보 포함',
    examples: [
      '계약 상세 정보 전체 보여줘',
      '이 계약의 피보험자와 수익자 알려줘',
      '특약 내용 확인해줘',
      '계약의 보험료와 만기일 알려줘',
      '피보험자가 누구인지 확인해줘',
      '이 계약의 수익자 정보 보여줘',
      '가입한 담보 내역 알려줘',
    ]
  },
  {
    icon: '⏰', title: '만기 예정 계약', desc: 'N일 이내 만기 도래 계약 조회',
    examples: [
      '이번 달 만기되는 계약 보여줘',
      '30일 이내 만기 예정 계약 알려줘',
      '다음 달 만기 예정인 계약 알려줘',
      '60일 내 갱신 필요한 계약 찾아줘',
      '90일 이내 만기 도래 계약 조회해줘',
      '1주일 내 만기인 계약 있어?',
      '올해 안에 만기되는 계약 전부 보여줘',
    ]
  },
  // 생일 (1 tool)
  {
    icon: '🎂', title: '생일 고객', desc: '특정 월/일의 생일 고객 조회',
    examples: [
      '이번 달 생일 고객 알려줘',
      '오늘 생일인 고객 있어?',
      '내일 생일인 고객 알려줘',
      '다음 주 생일인 고객 목록 보여줘',
      '12월 생일인 고객 목록 보여줘',
      '1월 15일 생일인 고객 찾아줘',
      '3월 생일 고객 전체 조회해줘',
      '크리스마스에 생일인 고객 있어?',
    ]
  },
  // 문서 관리 (3 tools: search, get, list_customer)
  {
    icon: '🔎', title: '문서 AI 검색', desc: 'AI 의미 검색 또는 키워드 검색',
    examples: [
      '보험증권 문서 검색해줘',
      '청구서 관련 문서 찾아줘',
      '이 고객의 증권 문서 찾아줘',
      '건강검진 관련 서류 있어?',
      '최근 업로드한 계약서 찾아줘',
      '신분증 사본 검색해줘',
      '사고 관련 문서 전부 보여줘',
      '진단서 키워드로 검색해줘',
      '자동차보험 관련 문서 찾아줘',
      '보험료 납입 영수증 찾아줘',
    ]
  },
  {
    icon: '📁', title: '고객별 문서 조회', desc: '특정 고객의 문서 목록',
    examples: [
      '이 고객의 문서 목록 보여줘',
      '홍길동 고객이 제출한 서류 전체 보여줘',
      '선택한 고객의 파일 목록 조회해줘',
      '이 고객의 최근 업로드 문서 보여줘',
      '고객 문서 몇 개 있는지 알려줘',
    ]
  },
  // 메모 관리 (3 tools: add, list, delete)
  {
    icon: '📝', title: '메모 추가', desc: '고객에게 상담 메모 기록',
    examples: [
      '이 고객에게 메모 추가해줘',
      '고객 메모 추가해줘',
      '고객 메모 기록해줘',
      '메모 추가해줘',
      '고객 특이사항 기록해줘',
      '상담 내용 메모해줘',
      '고객 노트 추가해줘',
    ]
  },
  {
    icon: '📋', title: '메모 조회', desc: '기록된 메모 확인',
    examples: [
      '이 고객 메모 보여줘',
      '홍길동 고객의 상담 기록 확인해줘',
      '고객 메모 내역 전체 조회해줘',
      '최근에 추가한 메모 보여줘',
      '이 고객에게 남긴 메모가 있어?',
    ]
  },
  // 통계 (1 tool with 4 types)
  {
    icon: '📊', title: '전체 통계 요약', desc: '고객수, 계약수, 보험료 현황',
    examples: [
      '내 전체 통계 요약 보여줘',
      '현재 고객수와 계약수 알려줘',
      '전체 보험료 현황 보여줘',
      '내 실적 요약 조회해줘',
      '관리 중인 고객과 계약 현황 알려줘',
    ]
  },
  {
    icon: '📈', title: '월별 신규 현황', desc: '최근 6개월 신규 고객/계약 추이',
    examples: [
      '최근 6개월 실적 추이 보여줘',
      '이번 달 신규 계약 몇 건이야?',
      '최근 월별 신규 고객 현황 알려줘',
      '월별 신규 등록 현황 조회해줘',
      '올해 월별 계약 체결 현황 알려줘',
    ]
  },
  // 관계 네트워크 (1 tool)
  {
    icon: '🔗', title: '고객 관계 조회', desc: '가족, 친척, 지인, 직장 관계',
    examples: [
      '이 고객의 가족관계 보여줘',
      '홍길동 고객과 연결된 관계 조회해줘',
      '가족 구성원 확인해줘',
      '이 고객의 지인 관계 보여줘',
      '소개로 연결된 고객 있어?',
      '고객 네트워크 전체 보여줘',
      '직장 관계로 연결된 고객 찾아줘',
    ]
  },
  // 보험상품 (2 tools: search, get_details)
  {
    icon: '🏢', title: '보험상품 검색', desc: '상품명, 보험사, 카테고리별 검색',
    examples: [
      '종신보험 상품 목록 보여줘',
      '삼성생명 상품 검색해줘',
      '건강보험 상품 찾아줘',
      '연금보험 상품 추천해줘',
      '실손보험 상품 목록 보여줘',
      '어린이보험 상품 있어?',
      '메트라이프 종신보험 상품 알려줘',
      '교보생명 암보험 찾아줘',
      '한화생명 저축보험 알려줘',
      'DB손해보험 자동차보험 찾아줘',
    ]
  },
  {
    icon: '📦', title: '상품 상세 정보', desc: '담보, 보험료, 가입조건 등',
    examples: [
      '이 상품의 상세 정보 보여줘',
      '가입 조건과 보험료 알려줘',
      '담보 내용 확인해줘',
      '이 상품 가입 연령대 알려줘',
      '상품 특징과 장점 설명해줘',
    ]
  },
];

// 데이터 현황 인터페이스
interface DataStats {
  customers: number;
  contracts: number;
  documents: number;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showSessionList, setShowSessionList] = useState(false);
  // 고급 사용자 모드: 기능 목록 없이 바로 채팅
  const [preferDirectChat, setPreferDirectChat] = useState(() => {
    return localStorage.getItem('aims-chat-direct-mode') === 'true';
  });
  // 데이터 현황 오버레이
  const [showDataOverlay, setShowDataOverlay] = useState(false);
  const [dataStats, setDataStats] = useState<DataStats>({ customers: 0, contracts: 0, documents: 0 });
  const [animatedStats, setAnimatedStats] = useState<DataStats>({ customers: 0, contracts: 0, documents: 0 });
  // 각 기능별 현재 예시 인덱스 (pagination용)
  const [exampleIndices, setExampleIndices] = useState<number[]>(
    () => HELP_FEATURES.map(() => 0)
  );
  const prevIsOpenRef = useRef(false);
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

  // 모드 변경 시 localStorage 저장
  const handleToggleMode = useCallback((direct: boolean) => {
    setPreferDirectChat(direct);
    localStorage.setItem('aims-chat-direct-mode', direct ? 'true' : 'false');
    // 바로 채팅 모드: 상태 변경 후 입력창에 포커스
    if (direct) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, []);

  // 예시 pagination 핸들러 (이전)
  const handlePrevExample = useCallback((featureIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExampleIndices(prev => {
      const newIndices = [...prev];
      const total = HELP_FEATURES[featureIdx].examples.length;
      const newIdx = (prev[featureIdx] - 1 + total) % total;
      newIndices[featureIdx] = newIdx;
      // 입력창도 새 예시로 업데이트
      setInput(HELP_FEATURES[featureIdx].examples[newIdx]);
      return newIndices;
    });
  }, [setInput]);

  // 예시 pagination 핸들러 (다음)
  const handleNextExample = useCallback((featureIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExampleIndices(prev => {
      const newIndices = [...prev];
      const total = HELP_FEATURES[featureIdx].examples.length;
      const newIdx = (prev[featureIdx] + 1) % total;
      newIndices[featureIdx] = newIdx;
      // 입력창도 새 예시로 업데이트
      setInput(HELP_FEATURES[featureIdx].examples[newIdx]);
      return newIndices;
    });
  }, [setInput]);

  // 패널 열릴 때 세션 목록 로드
  useEffect(() => {
    if (isOpen) {
      fetchSessions(1, 10);
    }
  }, [isOpen, fetchSessions]);

  // 패널이 열릴 때 데이터 현황 오버레이 표시
  useEffect(() => {
    // isOpen이 false -> true로 변할 때만 실행
    if (isOpen && !prevIsOpenRef.current) {
      // 데이터 통계 로드
      const loadStats = async () => {
        try {
          const [customerStats, contractsResponse, documentStats] = await Promise.all([
            CustomerService.getCustomerStats().catch(() => ({ total: 0 })),
            ContractService.getContracts({ limit: 1 }).catch(() => ({ total: 0 })),
            DocumentService.getDocumentStats().catch(() => ({ total: 0 })),
          ]);

          const stats: DataStats = {
            customers: customerStats.total || 0,
            contracts: contractsResponse.total || 0,
            documents: documentStats.total || 0,
          };

          setDataStats(stats);
          setAnimatedStats({ customers: 0, contracts: 0, documents: 0 });
          setShowDataOverlay(true);

          // 카운트업 애니메이션 (800ms 동안)
          const duration = 800;
          const steps = 30;
          const interval = duration / steps;
          let step = 0;

          const animationTimer = setInterval(() => {
            step++;
            const progress = step / steps;
            // easeOutQuart 이징 함수
            const eased = 1 - Math.pow(1 - progress, 4);

            setAnimatedStats({
              customers: Math.round(stats.customers * eased),
              contracts: Math.round(stats.contracts * eased),
              documents: Math.round(stats.documents * eased),
            });

            if (step >= steps) {
              clearInterval(animationTimer);
              setAnimatedStats(stats);
            }
          }, interval);

          // 3초 후 페이드아웃
          setTimeout(() => {
            setShowDataOverlay(false);
          }, 3000);
        } catch (error) {
          console.error('[ChatPanel] 데이터 통계 로드 실패:', error);
        }
      };

      loadStats();
    }

    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

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
    } finally {
      // 전송 완료 후 입력창 포커스 유지 (disabled 해제 후 렌더링 완료 대기)
      setTimeout(() => inputRef.current?.focus(), 0);
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
    // 기능 목록 화면으로 돌아가기
    setPreferDirectChat(false);
    localStorage.setItem('aims-chat-direct-mode', 'false');
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
          <Tooltip content="이전 대화" placement="bottom">
            <button
              type="button"
              className={`chat-panel__header-btn ${showSessionList ? 'chat-panel__header-btn--active' : ''}`}
              onClick={() => setShowSessionList(!showSessionList)}
              aria-label="이전 대화"
            >
              <SFSymbol name="clock.arrow.circlepath" size={SFSymbolSize.CAPTION_1} decorative />
            </button>
          </Tooltip>
          {/* 새 대화 */}
          <Tooltip content="새 대화" placement="bottom">
            <button
              type="button"
              className="chat-panel__header-btn"
              onClick={handleNewChat}
              aria-label="새 대화"
            >
              <SFSymbol name="plus" size={SFSymbolSize.CAPTION_1} decorative />
            </button>
          </Tooltip>
          <Tooltip content="닫기" placement="bottom">
            <button
              type="button"
              className="chat-panel__header-btn chat-panel__close"
              onClick={onClose}
              aria-label="닫기"
            >
              <SFSymbol name="xmark" size={SFSymbolSize.FOOTNOTE} decorative />
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
                  <Tooltip content="삭제">
                    <button
                      type="button"
                      className="chat-panel__session-delete"
                      onClick={(e) => handleDeleteSession(e, s.session_id)}
                      aria-label="삭제"
                    >
                      <SFSymbol name="xmark" size={SFSymbolSize.CAPTION_2} decorative />
                    </button>
                  </Tooltip>
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

      {/* 데이터 현황 오버레이 */}
      {showDataOverlay && (
        <div className="chat-panel__data-overlay">
          <div className="chat-panel__data-overlay-content">
            <div className="chat-panel__data-overlay-title">내 데이터</div>
            <div className="chat-panel__data-stats">
              <div className="chat-panel__data-stat">
                <span className="chat-panel__data-stat-icon">👤</span>
                <span className="chat-panel__data-stat-value">{animatedStats.customers.toLocaleString()}</span>
                <span className="chat-panel__data-stat-label">고객</span>
              </div>
              <div className="chat-panel__data-stat">
                <span className="chat-panel__data-stat-icon">📋</span>
                <span className="chat-panel__data-stat-value">{animatedStats.contracts.toLocaleString()}</span>
                <span className="chat-panel__data-stat-label">계약</span>
              </div>
              <div className="chat-panel__data-stat">
                <span className="chat-panel__data-stat-icon">📄</span>
                <span className="chat-panel__data-stat-value">{animatedStats.documents.toLocaleString()}</span>
                <span className="chat-panel__data-stat-label">문서</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="chat-panel__messages">
        {messages.length === 0 && !isLoading && (
          preferDirectChat ? (
            // 직접 채팅 모드: 간단한 빈 상태
            <div className="chat-panel__empty">
              <SFSymbol
                name="sparkles"
                size={SFSymbolSize.TITLE_3}
                weight={SFSymbolWeight.LIGHT}
                decorative
              />
              <p>무엇이든 물어보세요!</p>
              <span>고객, 계약, 문서 관련 질문을 자유롭게 하세요</span>
              {/* 기능 보기 - 메뉴 스타일 */}
              <button
                type="button"
                className="chat-panel__welcome-feature chat-panel__welcome-feature--secondary"
                onClick={() => handleToggleMode(false)}
              >
                <span className="chat-panel__welcome-feature-icon">📋</span>
                <div className="chat-panel__welcome-feature-content">
                  <div className="chat-panel__welcome-feature-title">사용 가능한 기능 보기</div>
                  <div className="chat-panel__welcome-feature-desc">18가지 AI 기능 목록 확인</div>
                </div>
              </button>
            </div>
          ) : (
            // 기능 목록 모드: 전체 기능 표시
            <div className="chat-panel__welcome">
              <div className="chat-panel__welcome-header">
                <SFSymbol
                  name="sparkles"
                  size={SFSymbolSize.TITLE_3}
                  weight={SFSymbolWeight.LIGHT}
                  decorative
                />
                <div className="chat-panel__welcome-text">
                  <p>무엇이든 물어보세요!</p>
                  <span>고객, 계약, 문서 관련 질문을 자유롭게 하세요</span>
                </div>
              </div>
              {/* 바로 채팅하기 - 헤더 아래 별도 배치 */}
              <button
                type="button"
                className="chat-panel__welcome-feature chat-panel__welcome-feature--primary"
                onClick={() => handleToggleMode(true)}
              >
                <span className="chat-panel__welcome-feature-icon">💬</span>
                <div className="chat-panel__welcome-feature-content">
                  <div className="chat-panel__welcome-feature-title">바로 채팅하기</div>
                  <div className="chat-panel__welcome-feature-desc">기능 목록 없이 바로 대화 시작</div>
                </div>
              </button>
              {/* 기능 목록 설명 */}
              <div className="chat-panel__welcome-features-header">
                아래 기능을 클릭하면 예시가 입력됩니다
              </div>
              <div className="chat-panel__welcome-features">
                {HELP_FEATURES.map((feature, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="chat-panel__welcome-feature"
                    onClick={() => {
                      setInput(feature.examples[exampleIndices[idx]]);
                      inputRef.current?.focus();
                    }}
                  >
                    <span className="chat-panel__welcome-feature-icon">{feature.icon}</span>
                    <div className="chat-panel__welcome-feature-content">
                      <div className="chat-panel__welcome-feature-title">{feature.title}</div>
                      <div className="chat-panel__welcome-feature-desc">{feature.desc}</div>
                    </div>
                    {/* Pagination 버튼 */}
                    <div className="chat-panel__welcome-feature-pagination">
                      <button
                        type="button"
                        className="chat-panel__welcome-feature-nav"
                        onClick={(e) => handlePrevExample(idx, e)}
                        aria-label="이전 예시"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                          <path d="M7.5 2.5L4 6L7.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <span className="chat-panel__welcome-feature-page">
                        {exampleIndices[idx] + 1}/{feature.examples.length}
                      </span>
                      <button
                        type="button"
                        className="chat-panel__welcome-feature-nav"
                        onClick={(e) => handleNextExample(idx, e)}
                        aria-label="다음 예시"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                          <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
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
        <div className="chat-panel__input-wrapper">
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
          {/* 텍스트 지우기 버튼 */}
          {input.trim() && !isLoading && (
            <button
              type="button"
              className="chat-panel__input-clear"
              onClick={() => {
                setInput('');
                if (inputRef.current) {
                  inputRef.current.style.height = 'auto';
                  inputRef.current.focus();
                }
              }}
              aria-label="입력 지우기"
            >
              <SFSymbol name="xmark.circle.fill" size={SFSymbolSize.FOOTNOTE} decorative />
            </button>
          )}
        </div>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={!input.trim() || isLoading}
        >
          {isLoading ? (
            <SFSymbol name="stop.fill" size={SFSymbolSize.CAPTION_1} decorative />
          ) : (
            <SFSymbol name="arrow.up" size={SFSymbolSize.CAPTION_1} decorative />
          )}
        </Button>
      </form>
    </div>
  );
};

export default ChatPanel;
