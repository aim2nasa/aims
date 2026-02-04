/**
 * Header Component Types
 * @since 1.0.0
 *
 * Header 컴포넌트의 TypeScript 인터페이스 정의
 * ARCHITECTURE.md 준수: 예측 가능한 Props 인터페이스
 */

import type { Customer } from '@/entities/customer/model';

export interface HeaderProps {
  /** 헤더 표시 여부 */
  visible: boolean;
  /** 현재 테마 */
  theme: 'light' | 'dark';
  /** 레이아웃 제어 모달 열기 핸들러 */
  onLayoutControlOpen: () => void;
  /** 테마 토글 핸들러 */
  onThemeToggle: () => void;
  /** 메뉴 클릭 핸들러 */
  onMenuClick?: (menuKey: string) => void;
  /** 빠른검색 고객 클릭 핸들러 */
  onQuickSearchCustomerClick?: (customerId: string, customer: Customer) => void;
  /** AI 채팅 토글 핸들러 */
  onChatToggle?: () => void;
  /** AI 채팅 패널 열림 상태 */
  isChatOpen?: boolean;
  /** AI 팝업 창 열림 상태 (팝업 열려있으면 메인 창에서 비활성화) */
  isAiPopupOpen?: boolean;
  /** 모바일 뷰 여부 (768px 이하) */
  isMobile?: boolean;
  /** 모바일 드로어 열림 상태 */
  isMobileDrawerOpen?: boolean;
  /** 모바일 메뉴 토글 핸들러 */
  onMobileMenuToggle?: () => void;
  /** 추가 CSS 클래스명 */
  className?: string;
}

export interface HeaderState {
  /** 헤더 호버 상태 */
  isHovered: boolean;
  /** 제어 요소들 표시 여부 */
  showControls: boolean;
  /** 애니메이션 진행 중 여부 */
  isAnimating: boolean;
}

export interface HeaderControllerReturn {
  /** 헤더 상태 */
  state: HeaderState;
  /** 헤더 호버 시작 핸들러 */
  handleMouseEnter: () => void;
  /** 헤더 호버 종료 핸들러 */
  handleMouseLeave: () => void;
  /** 헤더 포커스 핸들러 */
  handleFocus: () => void;
  /** 헤더 블러 핸들러 */
  handleBlur: () => void;
}

/** Progressive Disclosure 설정 */
export interface ProgressiveDisclosureConfig {
  /** 기본 높이 (px) */
  baseHeight: number;
  /** 확장 높이 (px) */
  expandedHeight: number;
  /** 호버 지연 시간 (ms) */
  hoverDelay: number;
  /** 페이드인 지속 시간 (ms) */
  fadeInDuration: number;
  /** 페이드아웃 지속 시간 (ms) */
  fadeOutDuration: number;
}