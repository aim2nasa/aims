/**
 * ChatPanel.tsx
 * AI 채팅 패널 컴포넌트
 * @since 2025-12-20
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useChatSSE, ChatMessage, ChatEvent } from '@/shared/hooks/useChatSSE';
import { useChatHistory, ChatSession } from '@/shared/hooks/useChatHistory';
import { useDevModeStore } from '@/shared/store/useDevModeStore';
import { CustomerService } from '@/services/customerService';
import { DocumentService } from '@/services/DocumentService';
import { DocumentStatusService } from '@/services/DocumentStatusService';
import { ContractService } from '@/services/contractService';
import { SavedQuestionsService, SavedQuestion, FrequentQuestionsService, FrequentQuestion } from '@/services/savedQuestionsService';
import Button from '@/shared/ui/Button';
import Tooltip from '@/shared/ui/Tooltip';
import DraggableModal from '@/shared/ui/DraggableModal';
import { CustomerDocumentPreviewModal } from '@/features/customer/views/CustomerDetailView/tabs/CustomerDocumentPreviewModal';
import type { PreviewDocumentInfo } from '@/features/customer/controllers/useCustomerDocumentsController';
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../SFSymbol';
import { errorReporter } from '@/shared/lib/errorReporter';
import './ChatPanel.css';

// 데이터 변경을 유발하는 MCP 도구 목록
const DATA_MUTATING_TOOLS = {
  // 고객 관련
  customers: ['create_customer', 'update_customer', 'restore_customer'],
  // 문서 관련
  documents: ['delete_document'],
  // 관계 관련
  relationships: ['create_relationship'],
  // 메모 관련
  memos: ['add_customer_memo', 'delete_customer_memo'],
};

interface ChatPanelProps {
  /** 패널 열림 상태 */
  isOpen: boolean;
  /** 패널 닫기 핸들러 */
  onClose: () => void;
  /** 팝업 모드 (분리 모드 비활성화, 항상 도킹 모드로 렌더링) */
  isPopup?: boolean;
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
    icon: '🔍', title: '고객 조회', desc: '고객 검색 및 상세 정보 조회',
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
      '고객 상세 정보 알려줘',
      '고객 전체 정보 보여줘',
      '고객 연락처와 주소 알려줘',
      '고객 등록일과 상태 확인해줘',
      '고객 언제 등록됐는지 알려줘',
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
    icon: '📄', title: '계약 조회', desc: '목록, 상세, 피보험자 조회',
    examples: [
      '전체 계약 목록 보여줘',
      '고객 계약 현황 알려줘',
      '메트라이프 계약 목록 조회해줘',
      '종신보험 계약만 보여줘',
      '고객의 모든 계약 보여줘',
      '최근 체결한 계약 20개 보여줘',
      '계약 상세 정보 보여줘',
      '계약 피보험자 알려줘',
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
    icon: '🔎', title: '문서 검색', desc: '키워드 + AI 의미 통합 검색',
    examples: [
      '퇴직연금 관련 서류 찾아줘',
      '자동차보험 문서 검색해줘',
      '건강검진 서류 있어?',
      '청구서 관련 문서 찾아줘',
      '사고 관련 서류 보여줘',
    ]
  },
  {
    icon: '📁', title: '고객별 문서 조회', desc: '특정 고객의 문서 목록',
    examples: [
      '고객 문서 목록 보여줘',
      '고객 최근 업로드 문서 보여줘',
      '고객 문서 몇 개 있는지 알려줘',
    ]
  },
  // 메모 관리 (3 tools: add, list, delete)
  {
    icon: '📝', title: '고객 메모', desc: '메모 추가 및 조회',
    examples: [
      '고객 메모 추가해줘',
      '메모 추가해줘',
      '메모 삭제해줘',
      '고객 메모 보여줘',
      '최근에 추가한 메모 보여줘',
    ]
  },
  // 관계 관리 (2 tools: list, create)
  {
    icon: '🔗', title: '고객 관계', desc: '관계 조회 및 등록',
    examples: [
      '고객 관계 보여줘',
      '가족관계 조회해줘',
      '법인 관계인 조회해줘',
      '관계 등록해줘',
      '관계자 등록해줘',
      '부모자녀 관계 추가해줘',
    ]
  },
];

// 데이터 현황 인터페이스
interface DataStats {
  customers: number;
  contracts: number;
  documents: number;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ isOpen, onClose, isPopup = false }) => {
  // 대화 내용 (localStorage 영속화 - F5 새로고침 시 유지)
  const [messages, setMessages] = useState<DisplayMessage[]>(() => {
    try {
      const saved = localStorage.getItem('aims-chat-messages');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // 무시
    }
    return [];
  });
  const [input, setInput] = useState('');
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  // 세션 ID (localStorage 영속화)
  const [sessionId, setSessionId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('aims-chat-session-id');
    } catch {
      return null;
    }
  });
  const [showSessionList, setShowSessionList] = useState(false);
  // 분리 모드 (독립 모달) - 팝업 모드에서는 항상 false
  const [isDetached, setIsDetached] = useState(() => {
    if (isPopup) return false;
    return localStorage.getItem('aims-chat-detached') === 'true';
  });
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
  // 예시 목록 모달 (더블클릭으로 열기)
  const [exampleModalIdx, setExampleModalIdx] = useState<number | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 나만의 질문 저장소 + 자주 쓰는 질문
  const [questionTab, setQuestionTab] = useState<'examples' | 'saved' | 'frequent'>('examples');
  const [savedQuestions, setSavedQuestions] = useState<SavedQuestion[]>([]);
  const [isSavedQuestionsLoading, setIsSavedQuestionsLoading] = useState(false);
  const [frequentQuestions, setFrequentQuestions] = useState<FrequentQuestion[]>([]);
  const [isFrequentQuestionsLoading, setIsFrequentQuestionsLoading] = useState(false);
  // 컨텍스트 메뉴 (우클릭 복사)
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    content: string;
  }>({ visible: false, x: 0, y: 0, content: '' });
  // 문서 프리뷰 모달 상태
  const [previewDocument, setPreviewDocument] = useState<PreviewDocumentInfo | null>(null);
  const [isDocumentPreviewVisible, setDocumentPreviewVisible] = useState(false);
  const [isDocumentPreviewLoading, setDocumentPreviewLoading] = useState(false);
  const [documentPreviewError, setDocumentPreviewError] = useState<string | null>(null);
  // 입력 히스토리 (위/아래 화살표로 탐색) - localStorage 영속화
  const [inputHistory, setInputHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('aims-chat-input-history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // 무시
    }
    return [];
  });
  const [historyIndex, setHistoryIndex] = useState(-1); // -1 = 현재 입력
  const tempInputRef = useRef(''); // 히스토리 탐색 중 현재 작성 내용 임시 저장
  const prevIsOpenRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // messages 변경 시 localStorage에 저장
  useEffect(() => {
    try {
      localStorage.setItem('aims-chat-messages', JSON.stringify(messages));
    } catch {
      // 무시
    }
  }, [messages]);

  // sessionId 변경 시 localStorage에 저장
  useEffect(() => {
    try {
      if (sessionId) {
        localStorage.setItem('aims-chat-session-id', sessionId);
      } else {
        localStorage.removeItem('aims-chat-session-id');
      }
    } catch {
      // 무시
    }
  }, [sessionId]);

  // inputHistory 변경 시 localStorage에 저장
  useEffect(() => {
    try {
      localStorage.setItem('aims-chat-input-history', JSON.stringify(inputHistory));
    } catch {
      // 무시
    }
  }, [inputHistory]);

  // 분리/도킹 토글
  const handleToggleDetach = useCallback(() => {
    setIsDetached(prev => {
      const newValue = !prev;
      localStorage.setItem('aims-chat-detached', newValue ? 'true' : 'false');
      return newValue;
    });
  }, []);

  // 팝업 창으로 열기
  const handleOpenPopup = useCallback(() => {
    // 이미 팝업이 열려있는지 확인
    if (localStorage.getItem('aims-ai-popup-open') === 'true') {
      // 기존 팝업에 포커스 시도
      const existingPopup = window.open('', 'AIMS_AI_Assistant');
      if (existingPopup && !existingPopup.closed) {
        existingPopup.focus();
        onClose();
        return;
      }
    }

    // 현재 세션 ID를 localStorage에 저장 (팝업에서 복원용)
    if (sessionId) {
      localStorage.setItem('aims-chat-resume-session', sessionId);
    }

    const width = 420;
    const height = 700;
    const left = window.screenX + window.innerWidth - width - 20;
    const top = window.screenY + 80;

    // 주소창 숨기기 옵션 추가 (브라우저에 따라 동작이 다를 수 있음)
    const popup = window.open(
      '/ai-assistant',
      'AIMS_AI_Assistant',
      `width=${width},height=${height},left=${left},top=${top},popup=yes,toolbar=no,location=no,directories=no,status=no,menubar=no,scrollbars=yes,resizable=yes`
    );

    if (popup) {
      // 팝업 열림 상태 저장
      localStorage.setItem('aims-ai-popup-open', 'true');

      // 팝업 닫힘 감지
      const checkPopupClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkPopupClosed);
          localStorage.removeItem('aims-ai-popup-open');
          // 팝업 닫힘 이벤트 발생 (메인 창에서 감지 가능)
          window.dispatchEvent(new CustomEvent('aiAssistantPopupClosed'));
        }
      }, 500);

      // 팝업 열린 후 현재 창의 ChatPanel 닫기
      onClose();
    }
  }, [onClose, sessionId]);

  // 브라우저 내로 이동 (팝업 창에서 사용)
  const handleMoveToMainWindow = useCallback(() => {
    if (window.opener && !window.opener.closed) {
      // 현재 세션 ID를 localStorage에 저장 (메인 창에서 복원용)
      if (sessionId) {
        localStorage.setItem('aims-chat-resume-session', sessionId);
      }
      // 팝업 닫힘 상태 먼저 제거 (메인 창에서 ChatPanel이 표시되도록)
      localStorage.removeItem('aims-ai-popup-open');
      // 메인 창에 ChatPanel 열기 이벤트 전송
      window.opener.dispatchEvent(new CustomEvent('aiAssistantOpenInMain'));
      // 팝업 창 닫기
      window.close();
    }
  }, [sessionId]);

  const {
    sendMessage,
    abort,
    isLoading,
    currentResponse,
    activeTools,
    retryStatus
  } = useChatSSE();

  const { isDevMode } = useDevModeStore();

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

  // 예시 기능 클릭 핸들러 (싱글클릭: 입력, 더블클릭: 모달)
  const handleFeatureClick = useCallback((featureIdx: number) => {
    if (clickTimerRef.current) {
      // 더블클릭: 타이머 취소하고 모달 열기
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      setExampleModalIdx(featureIdx);
    } else {
      // 싱글클릭: 타이머 시작
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        // 현재 예시를 입력창에 입력
        setInput(HELP_FEATURES[featureIdx].examples[exampleIndices[featureIdx]]);
        inputRef.current?.focus();
      }, 250);
    }
  }, [exampleIndices, setInput]);

  // 예시 선택 (모달에서)
  const handleExampleSelect = useCallback((featureIdx: number, exampleIdx: number, example: string) => {
    setInput(example);
    // 페이지네이션 인덱스도 동기화
    setExampleIndices(prev => {
      const newIndices = [...prev];
      newIndices[featureIdx] = exampleIdx;
      return newIndices;
    });
    setExampleModalIdx(null);
    inputRef.current?.focus();
  }, [setInput]);

  // 나만의 질문 목록 로드
  const fetchSavedQuestions = useCallback(async () => {
    setIsSavedQuestionsLoading(true);
    try {
      const questions = await SavedQuestionsService.list();
      setSavedQuestions(questions);
    } catch (error) {
      console.error('[ChatPanel] 저장된 질문 로드 실패:', error);
    } finally {
      setIsSavedQuestionsLoading(false);
    }
  }, []);

  // 질문 저장
  const handleSaveQuestion = useCallback(async (text: string) => {
    if (!text.trim()) return;
    try {
      const newQuestion = await SavedQuestionsService.create(text);
      setSavedQuestions(prev => [newQuestion, ...prev]);
    } catch (error) {
      console.error('[ChatPanel] 질문 저장 실패:', error);
      // 중복 질문 등 에러는 무시
    }
  }, []);

  // 질문 삭제
  const handleDeleteSavedQuestion = useCallback(async (id: string) => {
    try {
      await SavedQuestionsService.delete(id);
      setSavedQuestions(prev => prev.filter(q => q._id !== id));
    } catch (error) {
      console.error('[ChatPanel] 질문 삭제 실패:', error);
    }
  }, []);

  // 저장된 질문 선택
  const handleSelectSavedQuestion = useCallback((text: string) => {
    setInput(text);
    inputRef.current?.focus();
  }, [setInput]);

  // 자주 쓰는 질문 목록 로드
  const fetchFrequentQuestions = useCallback(async () => {
    setIsFrequentQuestionsLoading(true);
    try {
      const questions = await FrequentQuestionsService.list();
      setFrequentQuestions(questions);
    } catch (error) {
      console.error('[ChatPanel] 자주 쓰는 질문 로드 실패:', error);
    } finally {
      setIsFrequentQuestionsLoading(false);
    }
  }, []);

  // 패널 열릴 때 세션 목록 로드
  useEffect(() => {
    if (isOpen) {
      fetchSessions(1, 10);
    }
  }, [isOpen, fetchSessions]);

  // 나만의 질문/자주 쓰는 질문 탭 선택 시 데이터 로드
  useEffect(() => {
    if (questionTab === 'saved' && savedQuestions.length === 0) {
      fetchSavedQuestions();
    }
    if (questionTab === 'frequent' && frequentQuestions.length === 0) {
      fetchFrequentQuestions();
    }
  }, [questionTab, savedQuestions.length, frequentQuestions.length, fetchSavedQuestions, fetchFrequentQuestions]);

  // 통계 오버레이 표시 함수 (세션 첫 방문 및 헤더 아이콘 클릭 시 사용)
  const showStatsOverlay = useCallback(async () => {
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

      // 카운트업 애니메이션 (800ms)
      const duration = 800;
      const steps = 30;
      const interval = duration / steps;
      let step = 0;

      const animationTimer = setInterval(() => {
        step++;
        const progress = step / steps;
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
      errorReporter.reportApiError(error as Error, { component: 'ChatPanel.showStatsOverlay' });
    }
  }, []);

  // 세션 복원 함수 (공통)
  const restoreSession = useCallback(async (targetSessionId: string) => {
    try {
      const detail = await loadSession(targetSessionId);
      if (detail) {
        setSessionId(targetSessionId);
        setMessages(detail.messages.map((m, idx) => ({
          id: `${m.role}-${idx}-${Date.now()}`,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: new Date(m.timestamp)
        })));
      }
    } catch (error) {
      console.error('[ChatPanel] 세션 복원 실패:', error);
      errorReporter.reportApiError(error as Error, { component: 'ChatPanel.restoreSession' });
    }
  }, [loadSession]);

  // 팝업 모드: 마운트 시 세션 복원 (한 번만 실행)
  useEffect(() => {
    if (isPopup) {
      const resumeSessionId = localStorage.getItem('aims-chat-resume-session');
      if (resumeSessionId) {
        localStorage.removeItem('aims-chat-resume-session');
        restoreSession(resumeSessionId);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 팝업 마운트 시 한 번만 실행

  // 패널이 열릴 때 처리 (데이터 오버레이 표시 + 세션 복원)
  useEffect(() => {
    // isOpen이 false -> true로 변할 때만 실행
    if (isOpen && !prevIsOpenRef.current) {
      // 1. 세션 복원 (팝업이 아닌 경우만 - 팝업은 위에서 별도 처리)
      if (!isPopup) {
        const resumeSessionId = localStorage.getItem('aims-chat-resume-session');
        if (resumeSessionId) {
          localStorage.removeItem('aims-chat-resume-session');
          restoreSession(resumeSessionId);
          prevIsOpenRef.current = isOpen;
          return;
        }
      }

      // 2. 세션당 첫 방문인지 확인 (Progressive Disclosure)
      const statsShownKey = 'aims-chat-stats-shown';
      if (sessionStorage.getItem(statsShownKey)) {
        prevIsOpenRef.current = isOpen;
        return; // 이미 이번 세션에서 표시됨
      }
      sessionStorage.setItem(statsShownKey, 'true');

      // 통계 오버레이 표시
      showStatsOverlay();
    }

    prevIsOpenRef.current = isOpen;
  }, [isOpen, showStatsOverlay, restoreSession, isPopup]);

  // 리사이즈 핸들러
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  // 컨텍스트 메뉴 핸들러 (우클릭 복사)
  const handleMessageContextMenu = useCallback((e: React.MouseEvent, content: string) => {
    e.preventDefault();
    e.stopPropagation();

    // 선택된 텍스트가 있으면 그것만, 없으면 전체 메시지
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();

    // 메뉴 크기 (대략적인 값)
    const menuWidth = 120;
    const menuHeight = 40;

    // 화면 경계를 고려한 위치 계산
    let x = e.clientX;
    let y = e.clientY;

    // 오른쪽 경계 체크 - 화면 밖으로 나가면 왼쪽으로 표시
    if (x + menuWidth > window.innerWidth) {
      x = e.clientX - menuWidth;
    }

    // 하단 경계 체크 - 화면 밖으로 나가면 위로 표시
    if (y + menuHeight > window.innerHeight) {
      y = e.clientY - menuHeight;
    }

    // 최소 위치 보정 (음수 방지)
    x = Math.max(8, x);
    y = Math.max(8, y);

    setContextMenu({
      visible: true,
      x,
      y,
      content: selectedText || content
    });
  }, []);

  const handleCopyMessage = useCallback(async () => {
    if (contextMenu.content) {
      try {
        await navigator.clipboard.writeText(contextMenu.content);
      } catch (err) {
        console.error('[ChatPanel] 복사 실패:', err);
      }
    }
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, [contextMenu.content]);

  // 컨텍스트 메뉴 외부 클릭 시 닫기 (capture phase 사용)
  useEffect(() => {
    if (!contextMenu.visible) return;
    const handleClick = (e: MouseEvent) => {
      // 메뉴 내부 클릭이면 무시
      const target = e.target as HTMLElement;
      if (target.closest('.chat-panel__context-menu')) return;
      setContextMenu(prev => ({ ...prev, visible: false }));
    };
    // capture: true로 이벤트 캡처 단계에서 잡아서 Portal/Modal 내부 클릭도 감지
    document.addEventListener('mousedown', handleClick, true);
    return () => document.removeEventListener('mousedown', handleClick, true);
  }, [contextMenu.visible]);

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

  // 파일 경로를 절대 URL로 변환
  const buildFileUrl = useCallback((path?: string | null): string | null => {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) {
      return path;
    }
    const normalized = path.startsWith('/data') ? path.replace('/data', '') : path;
    const prefixed = normalized.startsWith('/') ? normalized : `/${normalized}`;
    return `https://tars.giize.com${prefixed}`;
  }, []);

  // 문서 프리뷰 모달 열기 핸들러
  const handleDocumentPreviewClick = useCallback(async (docId: string) => {
    // 모달 열기 및 로딩 상태 설정
    setDocumentPreviewVisible(true);
    setDocumentPreviewLoading(true);
    setDocumentPreviewError(null);
    setPreviewDocument(null);

    try {
      const response = await DocumentStatusService.getDocumentDetailViaWebhook(docId);

      if (!response) {
        setDocumentPreviewError('문서 상세 정보를 찾을 수 없습니다.');
        setDocumentPreviewLoading(false);
        return;
      }

      // API 응답 구조: { success: true, data: { raw: {...}, computed: {...} } }
      const apiResponse = response as Record<string, unknown>;
      const raw = (apiResponse['data'] as Record<string, unknown>)?.['raw'] || apiResponse['raw'] || response;
      const computed = (apiResponse['data'] as Record<string, unknown>)?.['computed'] || apiResponse['computed'] || null;

      // raw 데이터에서 메타데이터 추출
      const upload = (raw as Record<string, unknown>)?.['upload'] as Record<string, unknown> | undefined;
      const payload = (raw as Record<string, unknown>)?.['payload'] as Record<string, unknown> | undefined;
      const meta = (raw as Record<string, unknown>)?.['meta'] as Record<string, unknown> | undefined;
      const computedData = computed as Record<string, unknown> | null;

      const originalName =
        upload?.['originalName'] as string ??
        payload?.['original_name'] as string ??
        meta?.['originalName'] as string ??
        (raw as Record<string, unknown>)?.['originalName'] as string ??
        (raw as Record<string, unknown>)?.['filename'] as string ??
        '문서';

      const destPath =
        upload?.['destPath'] as string ??
        payload?.['dest_path'] as string ??
        meta?.['destPath'] as string ??
        (raw as Record<string, unknown>)?.['destPath'] as string ??
        null;

      const previewFilePath = computedData?.['previewFilePath'] as string ?? null;
      const conversionStatus = computedData?.['conversionStatus'] as string ?? upload?.['conversion_status'] as string ?? null;
      const canPreview = computedData?.['canPreview'] as boolean ?? false;

      const mimeType =
        upload?.['mimeType'] as string ??
        payload?.['mime_type'] as string ??
        meta?.['mimeType'] as string ??
        meta?.['mime'] as string ??
        (raw as Record<string, unknown>)?.['mimeType'] as string ??
        (raw as Record<string, unknown>)?.['mime'] as string ??
        undefined;

      const sizeBytes =
        (upload?.['fileSize'] as number) ??
        (upload?.['size'] as number) ??
        (payload?.['size_bytes'] as number) ??
        (meta?.['size_bytes'] as number) ??
        ((raw as Record<string, unknown>)?.['size_bytes'] as number) ??
        null;

      const uploadedAt =
        upload?.['uploaded_at'] as string ??
        payload?.['uploaded_at'] as string ??
        meta?.['uploaded_at'] as string ??
        (raw as Record<string, unknown>)?.['uploaded_at'] as string ??
        undefined;

      const fileUrl = buildFileUrl(destPath);
      const previewFileUrl = buildFileUrl(previewFilePath) ?? fileUrl;

      // 변환된 PDF로 프리뷰하는지 여부
      const isConverted = !!(
        previewFileUrl &&
        fileUrl &&
        previewFileUrl !== fileUrl &&
        previewFileUrl.toLowerCase().endsWith('.pdf')
      );

      // 원본 파일 확장자 추출
      const extMatch = originalName.match(/\.([^.]+)$/);
      const originalExtension = extMatch ? extMatch[1].toLowerCase() : undefined;

      const previewInfo: PreviewDocumentInfo = {
        id: docId,
        originalName,
        fileUrl,
        previewFileUrl,
        mimeType,
        sizeBytes,
        uploadedAt,
        conversionStatus,
        canPreview,
        isConverted,
        originalExtension,
        document: {
          _id: docId,
          originalName,
          linkedAt: uploadedAt || '',
          fileSize: sizeBytes ?? undefined,
          mimeType
        },
        rawDetail: raw as Record<string, unknown>
      };

      setPreviewDocument(previewInfo);
      setDocumentPreviewLoading(false);
    } catch (error) {
      console.error('[ChatPanel] 문서 프리뷰 로드 오류:', error);
      errorReporter.reportApiError(error as Error, { component: 'ChatPanel.handleDocumentPreviewClick' });
      setDocumentPreviewError('문서를 불러오는 중 오류가 발생했습니다.');
      setDocumentPreviewLoading(false);
    }
  }, [buildFileUrl]);

  // 문서 프리뷰 모달 닫기 핸들러
  const handleDocumentPreviewClose = useCallback(() => {
    setDocumentPreviewVisible(false);
    setTimeout(() => {
      setPreviewDocument(null);
      setDocumentPreviewError(null);
    }, 300);
  }, []);

  // 문서 프리뷰 재시도 핸들러
  const handleDocumentPreviewRetry = useCallback(() => {
    if (previewDocument?.id) {
      handleDocumentPreviewClick(previewDocument.id);
    }
  }, [previewDocument?.id, handleDocumentPreviewClick]);

  // 메시지 내용에서 문서 링크를 파싱하여 클릭 가능한 요소로 변환
  // 파일명에 []가 포함된 경우도 처리 (예: [비용+준비서류 안내]_xxx.pdf)
  const renderMessageContent = useCallback((content: string) => {
    // ](doc:문서ID) 패턴을 먼저 찾고, 매칭되는 여는 [ 를 역추적
    const docSuffixPattern = /\]\(doc:([a-f0-9]{24})\)/g;
    const parts: (string | React.ReactElement)[] = [];
    let lastIndex = 0;
    let match;

    while ((match = docSuffixPattern.exec(content)) !== null) {
      const suffixStart = match.index; // ] 위치
      const docId = match[1];

      // 여는 [ 를 찾기 위해 역추적 (중첩 bracket 고려)
      let bracketCount = 1; // 닫는 ] 를 이미 찾았으므로 1로 시작
      let openBracketPos = -1;

      for (let i = suffixStart - 1; i >= lastIndex; i--) {
        if (content[i] === ']') {
          bracketCount++;
        } else if (content[i] === '[') {
          bracketCount--;
          if (bracketCount === 0) {
            openBracketPos = i;
            break;
          }
        }
      }

      if (openBracketPos !== -1) {
        // 링크 앞의 텍스트 추가
        if (openBracketPos > lastIndex) {
          parts.push(content.slice(lastIndex, openBracketPos));
        }

        // 파일명 추출 ([ 와 ] 사이)
        const fileName = content.slice(openBracketPos + 1, suffixStart);

        // 문서 링크 추가
        parts.push(
          <button
            key={`doc-${docId}-${match.index}`}
            type="button"
            className="chat-panel__doc-link"
            onClick={() => handleDocumentPreviewClick(docId)}
            title="클릭하여 문서 미리보기"
          >
            📄 {fileName}
          </button>
        );

        lastIndex = match.index + match[0].length;
      }
    }

    // 나머지 텍스트 추가
    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex));
    }

    // 링크가 없으면 원본 텍스트 반환
    if (parts.length === 0) {
      return content;
    }

    return <>{parts}</>;
  }, [handleDocumentPreviewClick]);

  // 메시지 전송
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    // 입력 히스토리에 추가 (중복 방지, 최대 50개)
    setInputHistory(prev => {
      const filtered = prev.filter(h => h !== trimmedInput);
      return [trimmedInput, ...filtered].slice(0, 50);
    });
    setHistoryIndex(-1);
    tempInputRef.current = '';

    // 자주 쓰는 질문 사용 추적 (비동기, 실패해도 무시)
    FrequentQuestionsService.track(trimmedInput);

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

      // 데이터 변경 도구 성공 시 페이지 새로고침 플래그 설정
      let shouldReloadPage = false;
      const handleToolResult = (event: ChatEvent) => {
        if (event.type === 'tool_result' && event.success && event.name) {
          const toolName = event.name;
          const allMutatingTools = [
            ...DATA_MUTATING_TOOLS.customers,
            ...DATA_MUTATING_TOOLS.documents,
            ...DATA_MUTATING_TOOLS.relationships,
            ...DATA_MUTATING_TOOLS.memos
          ];

          if (allMutatingTools.includes(toolName)) {
            console.log('[ChatPanel] 데이터 변경 감지, 응답 완료 후 페이지 새로고침 예정:', toolName);
            shouldReloadPage = true;
          }
        }
      };

      // 메시지 전송 및 응답 받기 (세션 ID 포함, 도구 결과 콜백)
      const result = await sendMessage(chatMessages, {
        sessionId: sessionId || undefined,
        onChunk: handleToolResult
      });

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

      // 🚨 AI 어시스턴트 데이터 변경 시 페이지 새로고침 (CenterPane + RightPane 모두 갱신)
      // aims-uix3 전체 강제 규정: 데이터 변경 도구 성공 시 항상 페이지 새로고침
      if (shouldReloadPage) {
        console.log('[ChatPanel] 데이터 변경 완료, 페이지 새로고침 실행');
        // 응답이 화면에 표시된 후 새로고침 (사용자가 결과를 볼 수 있도록 약간의 딜레이)
        setTimeout(() => {
          // 팝업 모드: 메인 창 새로고침 (팝업은 유지)
          if (isPopup && window.opener && !window.opener.closed) {
            console.log('[ChatPanel] 팝업 모드 - 메인 창 새로고침');
            window.opener.location.reload();
          } else {
            // 도킹/분리 모드: 현재 창 새로고침
            window.location.reload();
          }
        }, 1500);
      }
    } catch (error) {
      console.error('[ChatPanel] 전송 오류:', error);
      errorReporter.reportApiError(error as Error, { component: 'ChatPanel.handleSend' });
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

  // 키보드 처리 (Enter: 전송, 위/아래 화살표: 히스토리 탐색)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 키: 전송 (Shift+Enter는 줄바꿈)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
      return;
    }

    // 위 화살표: 이전 입력 히스토리
    if (e.key === 'ArrowUp' && inputHistory.length > 0) {
      const textarea = e.currentTarget;
      // 커서가 첫 줄에 있을 때만 히스토리 탐색 (여러 줄 입력 시 기본 동작 유지)
      const cursorPos = textarea.selectionStart;
      const textBeforeCursor = textarea.value.substring(0, cursorPos);
      if (textBeforeCursor.includes('\n')) return;

      e.preventDefault();

      // 처음 탐색 시작 시 현재 입력 저장
      if (historyIndex === -1) {
        tempInputRef.current = input;
      }

      const newIndex = Math.min(historyIndex + 1, inputHistory.length - 1);
      setHistoryIndex(newIndex);
      setInput(inputHistory[newIndex]);
      return;
    }

    // 아래 화살표: 최근 입력으로 이동
    if (e.key === 'ArrowDown' && historyIndex >= 0) {
      const textarea = e.currentTarget;
      // 커서가 마지막 줄에 있을 때만 (여러 줄 입력 시 기본 동작 유지)
      const cursorPos = textarea.selectionStart;
      const textAfterCursor = textarea.value.substring(cursorPos);
      if (textAfterCursor.includes('\n')) return;

      e.preventDefault();

      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);

      if (newIndex === -1) {
        // 현재 입력으로 복원
        setInput(tempInputRef.current);
      } else {
        setInput(inputHistory[newIndex]);
      }
    }
  };

  // 대화 초기화 (= 새 대화)
  const handleClear = handleNewChat;

  // 패널 닫기 (컨텍스트 초기화 후 닫기)
  // - 창 닫기 시: 컨텍스트 초기화 (새 대화로 시작)
  // - F5 새로고침 시: 세션 유지 (localStorage는 그대로)
  const handlePanelClose = useCallback(() => {
    // localStorage에서 대화 내용 삭제
    try {
      localStorage.removeItem('aims-chat-messages');
      localStorage.removeItem('aims-chat-session-id');
    } catch {
      // 무시
    }
    // 메모리 상태도 초기화
    setMessages([]);
    setSessionId(null);
    // 원래 닫기 핸들러 호출
    onClose();
  }, [onClose]);

  // 패널 콘텐츠 (공통)
  const panelContent = (
    <>
      {/* 도킹 모드에서만 리사이즈 핸들 표시 */}
      {!isDetached && (
        <div
          className="chat-panel__resize-handle"
          onMouseDown={handleResizeStart}
        />
      )}
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
              {/* square.and.pencil - Option 3: Apple 스타일 */}
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                {/* 사각형 */}
                <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3H8v1.5H4.5v9h9V10H15v3.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 13.5v-9z"/>
                {/* 연필 */}
                <path d="M12.854 1.146a.5.5 0 0 1 .707 0l1.293 1.293a.5.5 0 0 1 0 .707L8.207 9.793 6 10l.207-2.207 6.647-6.647z"/>
              </svg>
            </button>
          </Tooltip>
          {/* 내 데이터 통계 */}
          <Tooltip content="내 데이터" placement="bottom">
            <button
              type="button"
              className="chat-panel__header-btn"
              onClick={showStatsOverlay}
              aria-label="내 데이터"
            >
              <SFSymbol name="chart.bar" size={SFSymbolSize.CAPTION_1} decorative />
            </button>
          </Tooltip>
          {/* 분리/도킹 토글 (팝업 모드에서는 숨김) */}
          {!isPopup && (
            <Tooltip content={isDetached ? "도킹" : "분리"} placement="bottom">
              <button
                type="button"
                className={`chat-panel__header-btn ${isDetached ? 'chat-panel__header-btn--active' : ''}`}
                onClick={handleToggleDetach}
                aria-label={isDetached ? "도킹" : "분리"}
              >
                {isDetached ? (
                  // 도킹 아이콘: 오른쪽으로 붙이기
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <rect x="1" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M14 4v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                ) : (
                  // 분리 아이콘: 떠 있는 창
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <rect x="2" y="4" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M8 1h6.5a.5.5 0 0 1 .5.5V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                )}
              </button>
            </Tooltip>
          )}
          {/* 새 창에서 열기 (팝업 모드에서는 숨김) */}
          {!isPopup && (
            <Tooltip content="새 창에서 열기" placement="bottom">
              <button
                type="button"
                className="chat-panel__header-btn"
                onClick={handleOpenPopup}
                aria-label="새 창에서 열기"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="1" y="4" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M5 1h10v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M8 8L14.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </Tooltip>
          )}
          {/* 브라우저 내로 이동 (팝업 모드에서만 표시) */}
          {isPopup && (
            <Tooltip content="브라우저 내로 이동" placement="bottom">
              <button
                type="button"
                className="chat-panel__header-btn"
                onClick={handleMoveToMainWindow}
                aria-label="브라우저 내로 이동"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="1" y="1" width="14" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M1 4h14" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="3" cy="2.5" r="0.5" fill="currentColor"/>
                  <circle cx="5" cy="2.5" r="0.5" fill="currentColor"/>
                  <circle cx="7" cy="2.5" r="0.5" fill="currentColor"/>
                  <path d="M8 13v2M6 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </Tooltip>
          )}
          <Tooltip content="닫기" placement="bottom">
            <button
              type="button"
              className="chat-panel__header-btn chat-panel__close"
              onClick={handlePanelClose}
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
                  <div className="chat-panel__welcome-feature-title">자유롭게 질문하기</div>
                  <div className="chat-panel__welcome-feature-desc">원하는 내용을 직접 입력하세요</div>
                </div>
              </button>
              {/* 탭 헤더 */}
              <div className="chat-panel__question-tabs">
                <button
                  type="button"
                  className={`chat-panel__question-tab ${questionTab === 'examples' ? 'chat-panel__question-tab--active' : ''}`}
                  onClick={() => setQuestionTab('examples')}
                >
                  💡 질문 예시
                </button>
                <button
                  type="button"
                  className={`chat-panel__question-tab ${questionTab === 'saved' ? 'chat-panel__question-tab--active' : ''}`}
                  onClick={() => setQuestionTab('saved')}
                >
                  ⭐ 나만의 질문
                </button>
                <button
                  type="button"
                  className={`chat-panel__question-tab ${questionTab === 'frequent' ? 'chat-panel__question-tab--active' : ''}`}
                  onClick={() => setQuestionTab('frequent')}
                >
                  🔥 자주쓰는 질문
                </button>
              </div>

              {/* 예시 질문 목록 */}
              {questionTab === 'examples' && (
                <div className="chat-panel__welcome-features">
                  {HELP_FEATURES.map((feature, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="chat-panel__welcome-feature"
                      onClick={() => handleFeatureClick(idx)}
                    >
                      <span className="chat-panel__welcome-feature-icon">{feature.icon}</span>
                      <div className="chat-panel__welcome-feature-content">
                        <div className="chat-panel__welcome-feature-title">{feature.examples[exampleIndices[idx]]}</div>
                        <div className="chat-panel__welcome-feature-desc">{feature.title}</div>
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
              )}

              {/* 나만의 질문 목록 */}
              {questionTab === 'saved' && (
                <div className="chat-panel__saved-questions">
                  {isSavedQuestionsLoading ? (
                    <div className="chat-panel__saved-questions-loading">
                      <span className="chat-panel__loading-dot" />
                      <span className="chat-panel__loading-dot" />
                      <span className="chat-panel__loading-dot" />
                    </div>
                  ) : savedQuestions.length === 0 ? (
                    <div className="chat-panel__saved-questions-empty">
                      <p>저장된 질문이 없습니다</p>
                      <span>자주 사용하는 질문을 입력 후 ⭐ 버튼으로 저장하세요</span>
                    </div>
                  ) : (
                    savedQuestions.map((q) => (
                      <div key={q._id} className="chat-panel__saved-question">
                        <button
                          type="button"
                          className="chat-panel__saved-question-text"
                          onClick={() => handleSelectSavedQuestion(q.text)}
                        >
                          "{q.text}"
                        </button>
                        <button
                          type="button"
                          className="chat-panel__saved-question-delete"
                          onClick={() => handleDeleteSavedQuestion(q._id)}
                          aria-label="삭제"
                        >
                          <SFSymbol name="xmark" size={SFSymbolSize.CAPTION_2} decorative />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* 자주 쓰는 질문 목록 */}
              {questionTab === 'frequent' && (
                <div className="chat-panel__saved-questions">
                  {isFrequentQuestionsLoading ? (
                    <div className="chat-panel__saved-questions-loading">
                      <span className="chat-panel__loading-dot" />
                      <span className="chat-panel__loading-dot" />
                      <span className="chat-panel__loading-dot" />
                    </div>
                  ) : frequentQuestions.length === 0 ? (
                    <div className="chat-panel__saved-questions-empty">
                      <p>자주 쓰는 질문이 없습니다</p>
                      <span>질문을 사용하면 자동으로 기록됩니다</span>
                    </div>
                  ) : (
                    frequentQuestions.map((q) => (
                      <div key={q._id} className="chat-panel__saved-question">
                        <button
                          type="button"
                          className="chat-panel__saved-question-text"
                          onClick={() => handleSelectSavedQuestion(q.text)}
                        >
                          "{q.text}"
                        </button>
                        <span className="chat-panel__frequent-count">
                          {q.count}회
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-panel__message chat-panel__message--${msg.role}`}
            onContextMenu={(e) => handleMessageContextMenu(e, msg.content)}
          >
            <div className="chat-panel__message-content">
              {renderMessageContent(msg.content)}
            </div>
          </div>
        ))}

        {/* 스트리밍 응답 */}
        {isLoading && currentResponse && (
          <div className="chat-panel__message chat-panel__message--assistant chat-panel__message--streaming">
            <div className="chat-panel__message-content">
              {renderMessageContent(currentResponse)}
              <span className="chat-panel__cursor" />
            </div>
          </div>
        )}

        {/* 도구 사용 인디케이터 */}
        {activeTools.length > 0 && (
          <div className="chat-panel__tool-indicator">
            <svg className="chat-panel__tool-spinner" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
              <path d="M12 2C6.47715 2 2 6.47715 2 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <span>{isDevMode ? `데이터 조회 중: ${activeTools.join(', ')}` : '검색 중...'}</span>
          </div>
        )}

        {/* Rate Limit 재시도 인디케이터 */}
        {retryStatus?.isRetrying && (
          <div className="chat-panel__retry-indicator">
            <span className="chat-panel__retry-spinner" />
            <span>요청이 많아 잠시 대기 중... ({retryStatus.attempt}/{retryStatus.maxAttempts})</span>
          </div>
        )}

        {/* 로딩 인디케이터 (응답 대기 중) */}
        {isLoading && !currentResponse && activeTools.length === 0 && !retryStatus?.isRetrying && (
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
        {/* 질문 저장 버튼 */}
        {input.trim() && !isLoading && (
          <Tooltip content="나만의 질문에 저장" placement="top">
            <button
              type="button"
              className="chat-panel__input-save"
              onClick={() => handleSaveQuestion(input)}
              aria-label="질문 저장"
            >
              <span>⭐</span>
            </button>
          </Tooltip>
        )}
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
    </>
  );

  // 분리 모드용 콘텐츠 (헤더 제외)
  const detachedPanelContent = (
    <>
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
            <div className="chat-panel__empty">
              <SFSymbol
                name="sparkles"
                size={SFSymbolSize.TITLE_3}
                weight={SFSymbolWeight.LIGHT}
                decorative
              />
              <p>무엇이든 물어보세요!</p>
              <span>고객, 계약, 문서 관련 질문을 자유롭게 하세요</span>
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
              <button
                type="button"
                className="chat-panel__welcome-feature chat-panel__welcome-feature--primary"
                onClick={() => handleToggleMode(true)}
              >
                <span className="chat-panel__welcome-feature-icon">💬</span>
                <div className="chat-panel__welcome-feature-content">
                  <div className="chat-panel__welcome-feature-title">자유롭게 질문하기</div>
                  <div className="chat-panel__welcome-feature-desc">원하는 내용을 직접 입력하세요</div>
                </div>
              </button>
              {/* 탭 헤더 */}
              <div className="chat-panel__question-tabs">
                <button
                  type="button"
                  className={`chat-panel__question-tab ${questionTab === 'examples' ? 'chat-panel__question-tab--active' : ''}`}
                  onClick={() => setQuestionTab('examples')}
                >
                  💡 질문 예시
                </button>
                <button
                  type="button"
                  className={`chat-panel__question-tab ${questionTab === 'saved' ? 'chat-panel__question-tab--active' : ''}`}
                  onClick={() => setQuestionTab('saved')}
                >
                  ⭐ 나만의 질문
                </button>
                <button
                  type="button"
                  className={`chat-panel__question-tab ${questionTab === 'frequent' ? 'chat-panel__question-tab--active' : ''}`}
                  onClick={() => setQuestionTab('frequent')}
                >
                  🔥 자주쓰는 질문
                </button>
              </div>

              {/* 예시 질문 목록 */}
              {questionTab === 'examples' && (
                <div className="chat-panel__welcome-features">
                  {HELP_FEATURES.map((feature, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="chat-panel__welcome-feature"
                      onClick={() => handleFeatureClick(idx)}
                    >
                      <span className="chat-panel__welcome-feature-icon">{feature.icon}</span>
                      <div className="chat-panel__welcome-feature-content">
                        <div className="chat-panel__welcome-feature-title">{feature.examples[exampleIndices[idx]]}</div>
                        <div className="chat-panel__welcome-feature-desc">{feature.title}</div>
                      </div>
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
              )}

              {/* 나만의 질문 목록 */}
              {questionTab === 'saved' && (
                <div className="chat-panel__saved-questions">
                  {isSavedQuestionsLoading ? (
                    <div className="chat-panel__saved-questions-loading">
                      <span className="chat-panel__loading-dot" />
                      <span className="chat-panel__loading-dot" />
                      <span className="chat-panel__loading-dot" />
                    </div>
                  ) : savedQuestions.length === 0 ? (
                    <div className="chat-panel__saved-questions-empty">
                      <p>저장된 질문이 없습니다</p>
                      <span>자주 사용하는 질문을 입력 후 ⭐ 버튼으로 저장하세요</span>
                    </div>
                  ) : (
                    savedQuestions.map((q) => (
                      <div key={q._id} className="chat-panel__saved-question">
                        <button
                          type="button"
                          className="chat-panel__saved-question-text"
                          onClick={() => handleSelectSavedQuestion(q.text)}
                        >
                          "{q.text}"
                        </button>
                        <button
                          type="button"
                          className="chat-panel__saved-question-delete"
                          onClick={() => handleDeleteSavedQuestion(q._id)}
                          aria-label="삭제"
                        >
                          <SFSymbol name="xmark" size={SFSymbolSize.CAPTION_2} decorative />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* 자주 쓰는 질문 목록 */}
              {questionTab === 'frequent' && (
                <div className="chat-panel__saved-questions">
                  {isFrequentQuestionsLoading ? (
                    <div className="chat-panel__saved-questions-loading">
                      <span className="chat-panel__loading-dot" />
                      <span className="chat-panel__loading-dot" />
                      <span className="chat-panel__loading-dot" />
                    </div>
                  ) : frequentQuestions.length === 0 ? (
                    <div className="chat-panel__saved-questions-empty">
                      <p>자주 쓰는 질문이 없습니다</p>
                      <span>질문을 사용하면 자동으로 기록됩니다</span>
                    </div>
                  ) : (
                    frequentQuestions.map((q) => (
                      <div key={q._id} className="chat-panel__saved-question">
                        <button
                          type="button"
                          className="chat-panel__saved-question-text"
                          onClick={() => handleSelectSavedQuestion(q.text)}
                        >
                          "{q.text}"
                        </button>
                        <span className="chat-panel__frequent-count">
                          {q.count}회
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-panel__message chat-panel__message--${msg.role}`}
            onContextMenu={(e) => handleMessageContextMenu(e, msg.content)}
          >
            <div className="chat-panel__message-content">
              {renderMessageContent(msg.content)}
            </div>
          </div>
        ))}

        {isLoading && currentResponse && (
          <div className="chat-panel__message chat-panel__message--assistant chat-panel__message--streaming">
            <div className="chat-panel__message-content">
              {renderMessageContent(currentResponse)}
              <span className="chat-panel__cursor" />
            </div>
          </div>
        )}

        {/* 도구 사용 인디케이터 */}
        {activeTools.length > 0 && (
          <div className="chat-panel__tool-indicator">
            <svg className="chat-panel__tool-spinner" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
              <path d="M12 2C6.47715 2 2 6.47715 2 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <span>{isDevMode ? `데이터 조회 중: ${activeTools.join(', ')}` : '검색 중...'}</span>
          </div>
        )}

        {/* Rate Limit 재시도 인디케이터 */}
        {retryStatus?.isRetrying && (
          <div className="chat-panel__retry-indicator">
            <span className="chat-panel__retry-spinner" />
            <span>요청이 많아 잠시 대기 중... ({retryStatus.attempt}/{retryStatus.maxAttempts})</span>
          </div>
        )}

        {isLoading && !currentResponse && activeTools.length === 0 && !retryStatus?.isRetrying && (
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
    </>
  );

  // 분리 모드용 헤더 타이틀 (드래그 가능한 영역에 액션 버튼 포함)
  const detachedHeaderTitle = (
    <div className="chat-panel__detached-header">
      <div className="chat-panel__title">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="robotGradientModal" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8B5CF6" />
              <stop offset="100%" stopColor="#06B6D4" />
            </linearGradient>
          </defs>
          <rect x="4" y="5" width="16" height="14" rx="4" fill="url(#robotGradientModal)" />
          <rect x="7" y="9" width="3" height="4" rx="1" fill="white" />
          <rect x="14" y="9" width="3" height="4" rx="1" fill="white" />
          <line x1="12" y1="5" x2="12" y2="2" stroke="url(#robotGradientModal)" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="1.5" r="1.5" fill="url(#robotGradientModal)" />
          <rect x="1" y="9" width="3" height="6" rx="1" fill="url(#robotGradientModal)" />
          <rect x="20" y="9" width="3" height="6" rx="1" fill="url(#robotGradientModal)" />
        </svg>
        <span>AI 어시스턴트</span>
      </div>
      <div className="chat-panel__detached-actions">
        <Tooltip content="이전 대화" placement="bottom">
          <button
            type="button"
            className={`chat-panel__header-btn ${showSessionList ? 'chat-panel__header-btn--active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setShowSessionList(!showSessionList); }}
            aria-label="이전 대화"
          >
            <SFSymbol name="clock.arrow.circlepath" size={SFSymbolSize.CAPTION_1} decorative />
          </button>
        </Tooltip>
        <Tooltip content="새 대화" placement="bottom">
          <button
            type="button"
            className="chat-panel__header-btn"
            onClick={(e) => { e.stopPropagation(); handleNewChat(); }}
            aria-label="새 대화"
          >
            {/* square.and.pencil - Option 3: Apple 스타일 */}
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              {/* 사각형 */}
              <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3H8v1.5H4.5v9h9V10H15v3.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 13.5v-9z"/>
              {/* 연필 */}
              <path d="M12.854 1.146a.5.5 0 0 1 .707 0l1.293 1.293a.5.5 0 0 1 0 .707L8.207 9.793 6 10l.207-2.207 6.647-6.647z"/>
            </svg>
          </button>
        </Tooltip>
        <Tooltip content="내 데이터" placement="bottom">
          <button
            type="button"
            className="chat-panel__header-btn"
            onClick={(e) => { e.stopPropagation(); showStatsOverlay(); }}
            aria-label="내 데이터"
          >
            <SFSymbol name="chart.bar" size={SFSymbolSize.CAPTION_1} decorative />
          </button>
        </Tooltip>
        <Tooltip content="도킹" placement="bottom">
          <button
            type="button"
            className="chat-panel__header-btn chat-panel__header-btn--active"
            onClick={(e) => { e.stopPropagation(); handleToggleDetach(); }}
            aria-label="도킹"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="1" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M14 4v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </Tooltip>
        <Tooltip content="새 창에서 열기" placement="bottom">
          <button
            type="button"
            className="chat-panel__header-btn"
            onClick={(e) => { e.stopPropagation(); handleOpenPopup(); }}
            aria-label="새 창에서 열기"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="1" y="4" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M5 1h10v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M8 8L14.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </Tooltip>
      </div>
    </div>
  );

  // 컨텍스트 메뉴 UI (우클릭 복사) - Portal로 body에 직접 렌더링하여 z-index 문제 해결
  const contextMenuUI = contextMenu.visible && createPortal(
    <div
      className="chat-panel__context-menu"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="chat-panel__context-menu-item"
        onClick={handleCopyMessage}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2zm2-.5a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5V2a.5.5 0 0 0-.5-.5H6zM2 4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h1v1H2z"/>
        </svg>
        복사
      </button>
    </div>,
    document.body
  );

  // 분리 모드: DraggableModal 사용
  if (isDetached) {
    return (
      <>
        <DraggableModal
          visible={isOpen}
          onClose={handlePanelClose}
          title={detachedHeaderTitle}
          showHeader={true}
          initialWidth={450}
          initialHeight={820}
          minWidth={360}
          minHeight={550}
          className="chat-panel-modal"
          escapeToClose={false}
          backdropClosable={false}
        >
          <div className="chat-panel chat-panel--detached">
            {detachedPanelContent}
          </div>
        </DraggableModal>
        {contextMenuUI}
        {/* 문서 프리뷰 모달 */}
        <CustomerDocumentPreviewModal
          visible={isDocumentPreviewVisible}
          isLoading={isDocumentPreviewLoading}
          error={documentPreviewError}
          document={previewDocument}
          onClose={handleDocumentPreviewClose}
          onRetry={handleDocumentPreviewRetry}
        />
        {/* 예시 질문 목록 모달 */}
        <DraggableModal
          visible={exampleModalIdx !== null}
          onClose={() => setExampleModalIdx(null)}
          title={exampleModalIdx !== null ? `${HELP_FEATURES[exampleModalIdx].icon} ${HELP_FEATURES[exampleModalIdx].title}` : ''}
          initialWidth={400}
          initialHeight={450}
          minWidth={300}
          minHeight={200}
          className="chat-panel__example-modal-container"
        >
          <div className="chat-panel__example-modal">
            {exampleModalIdx !== null && HELP_FEATURES[exampleModalIdx].examples.map((example, i) => (
              <button
                key={i}
                type="button"
                className={`chat-panel__example-item ${exampleModalIdx !== null && exampleIndices[exampleModalIdx] === i ? 'chat-panel__example-item--selected' : ''}`}
                onClick={() => handleExampleSelect(exampleModalIdx!, i, example)}
              >
                <span className="chat-panel__example-number">{i + 1}/{HELP_FEATURES[exampleModalIdx].examples.length}</span>
                "{example}"
              </button>
            ))}
          </div>
        </DraggableModal>
      </>
    );
  }

  // 도킹 모드: 기존 슬라이드 패널
  return (
    <>
      <div
        ref={panelRef}
        className={`chat-panel ${isOpen ? 'chat-panel--open' : ''} ${isResizing ? 'chat-panel--resizing' : ''}`}
        style={{ width: panelWidth }}
      >
        {panelContent}
      </div>
      {contextMenuUI}
      {/* 문서 프리뷰 모달 */}
      <CustomerDocumentPreviewModal
        visible={isDocumentPreviewVisible}
        isLoading={isDocumentPreviewLoading}
        error={documentPreviewError}
        document={previewDocument}
        onClose={handleDocumentPreviewClose}
        onRetry={handleDocumentPreviewRetry}
      />
      {/* 예시 질문 목록 모달 */}
      <DraggableModal
        visible={exampleModalIdx !== null}
        onClose={() => setExampleModalIdx(null)}
        title={exampleModalIdx !== null ? `${HELP_FEATURES[exampleModalIdx].icon} ${HELP_FEATURES[exampleModalIdx].title}` : ''}
        initialWidth={400}
        initialHeight={450}
        minWidth={300}
        minHeight={200}
      >
        <div className="chat-panel__example-modal">
          {exampleModalIdx !== null && HELP_FEATURES[exampleModalIdx].examples.map((example, i) => (
            <button
              key={i}
              type="button"
              className="chat-panel__example-item"
              onClick={() => handleExampleSelect(exampleModalIdx!, i, example)}
            >
              <span className="chat-panel__example-number">{i + 1}/{HELP_FEATURES[exampleModalIdx].examples.length}</span>
              "{example}"
            </button>
          ))}
        </div>
      </DraggableModal>
    </>
  );
};

export default ChatPanel;
