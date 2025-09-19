/**
 * Header Component Types
 * @since 1.0.0
 *
 * Header 컴포넌트의 TypeScript 인터페이스 정의
 * ARCHITECTURE.md 준수: 예측 가능한 Props 인터페이스
 */

export interface HeaderProps {
  /** 헤더 표시 여부 */
  visible: boolean;
  /** 현재 테마 */
  theme: 'light' | 'dark' | 'system';
  /** 레이아웃 제어 모달 열기 핸들러 */
  onLayoutControlOpen: () => void;
  /** 테마 토글 핸들러 */
  onThemeToggle: () => void;
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