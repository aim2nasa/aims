/**
 * SF Symbol Shared Types
 * @since 1.0.0
 *
 * Component 외부에서 재사용되는 열거형과 Props 정의
 * React Fast Refresh 규칙을 지키기 위해 컴포넌트 파일과 분리
 */

import type { CSSProperties } from 'react'

/**
 * SF Symbol 가중치 (Weight) 열거형
 * iOS 표준 글꼴 가중치와 매핑
 */
export enum SFSymbolWeight {
  /** 100 - 가장 얇은 가중치 */
  ULTRALIGHT = 'ultralight',
  /** 200 - 얇은 가중치 */
  THIN = 'thin',
  /** 300 - 가벼운 가중치 */
  LIGHT = 'light',
  /** 400 - 일반 가중치 (기본값) */
  REGULAR = 'regular',
  /** 500 - 중간 가중치 */
  MEDIUM = 'medium',
  /** 600 - 세미볼드 가중치 */
  SEMIBOLD = 'semibold',
  /** 700 - 볼드 가중치 */
  BOLD = 'bold',
  /** 800 - 헤비 가중치 */
  HEAVY = 'heavy',
  /** 900 - 가장 굵은 가중치 */
  BLACK = 'black'
}

/**
 * SF Symbol 크기 열거형
 * iOS Dynamic Type과 연동
 */
export enum SFSymbolSize {
  /** 12px - Caption 2 */
  CAPTION_2 = 'caption-2',
  /** 13px - Caption 1 */
  CAPTION_1 = 'caption-1',
  /** 15px - Footnote */
  FOOTNOTE = 'footnote',
  /** 16px - Callout */
  CALLOUT = 'callout',
  /** 17px - Body (기본값) */
  BODY = 'body',
  /** 17px - Headline */
  HEADLINE = 'headline',
  /** 20px - Title 3 */
  TITLE_3 = 'title-3',
  /** 22px - Title 2 */
  TITLE_2 = 'title-2',
  /** 28px - Title 1 */
  TITLE_1 = 'title-1',
  /** 34px - Large Title */
  LARGE_TITLE = 'large-title'
}

/**
 * SF Symbol 애니메이션 타입
 * iOS 네이티브 애니메이션 패턴
 */
export enum SFSymbolAnimation {
  /** 애니메이션 없음 */
  NONE = 'none',
  /** 바운스 애니메이션 - 성공, 완료 피드백 */
  BOUNCE = 'bounce',
  /** 펄스 애니메이션 - 주의, 알림 */
  PULSE = 'pulse',
  /** 회전 애니메이션 - 로딩, 새로고침 */
  ROTATE = 'rotate',
  /** 스케일 애니메이션 - 선택, 활성화 */
  SCALE = 'scale',
  /** 페이드 애니메이션 - 나타남/사라짐 */
  FADE = 'fade',
  /** 위글 애니메이션 - 오류, 잘못된 입력 */
  WIGGLE = 'wiggle'
}

/**
 * SF Symbol 스타일 변형
 * iOS 시스템에서 제공하는 아이콘 변형
 */
export enum SFSymbolVariant {
  /** 기본 스타일 */
  REGULAR = 'regular',
  /** 채워진 스타일 */
  FILL = 'fill',
  /** 원형 스타일 */
  CIRCLE = 'circle',
  /** 사각형 스타일 */
  SQUARE = 'square',
  /** 채워진 원형 */
  CIRCLE_FILL = 'circle-fill',
  /** 채워진 사각형 */
  SQUARE_FILL = 'square-fill'
}

/**
 * SF Symbol 컴포넌트 Props 인터페이스
 */
export interface SFSymbolProps {
  /** SF Symbol 이름 (예: 'gear', 'sun.max', 'moon.stars') */
  name: string
  /** 심볼 크기 (기본값: BODY) */
  size?: SFSymbolSize
  /** 심볼 가중치 (기본값: REGULAR) */
  weight?: SFSymbolWeight
  /** 심볼 애니메이션 (기본값: NONE) */
  animation?: SFSymbolAnimation
  /** 심볼 변형 (기본값: REGULAR) */
  variant?: SFSymbolVariant
  /** 커스텀 색상 (CSS 변수 권장) */
  color?: string
  /** 클릭 가능 여부 */
  interactive?: boolean
  /** 햅틱 피드백 타입 (interactive=true일 때만) */
  hapticType?: string
  /** 클릭 핸들러 */
  onClick?: () => void
  /** 추가 CSS 클래스 */
  className?: string
  /** 인라인 스타일 */
  style?: CSSProperties
  /** ARIA 접근성 레이블 */
  'aria-label'?: string
  /** 스크린 리더를 위한 제목 */
  title?: string
  /** 장식용 아이콘 여부 (접근성) */
  decorative?: boolean
}
