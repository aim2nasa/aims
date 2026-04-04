/**
 * CloseButton Component
 * @since 2025-12-12
 * @version 1.0.0
 *
 * 모든 모달/뷰어의 X 닫기 버튼 공통 컴포넌트
 * - 중복 코드 제거 및 일관된 UX 제공
 * - SFSymbol xmark 아이콘 사용
 * - CLAUDE.md 준수: 배경 transparent, 아이콘 17px 이하
 */

import React from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../components/SFSymbol'
import './CloseButton.css'

export type CloseButtonSize = 'sm' | 'md' | 'lg'

export interface CloseButtonProps {
  /** 버튼 클릭 핸들러 */
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  /** 크기 변형: sm(24px), md(28px), lg(32px) */
  size?: CloseButtonSize
  /** 접근성 라벨 */
  ariaLabel?: string
  /** 추가 CSS 클래스 */
  className?: string
}

/**
 * SFSymbol 크기 매핑
 */
const sizeToSFSymbol: Record<CloseButtonSize, SFSymbolSize> = {
  sm: SFSymbolSize.FOOTNOTE,   // 13px
  md: SFSymbolSize.BODY,       // 14px
  lg: SFSymbolSize.CALLOUT     // 16px
}

/**
 * CloseButton 공통 컴포넌트
 *
 * @example
 * ```tsx
 * // 기본 사용
 * <CloseButton onClick={onClose} />
 *
 * // 크기 지정
 * <CloseButton onClick={onClose} size="lg" />
 *
 * // 커스텀 라벨
 * <CloseButton onClick={onClose} ariaLabel="문서 뷰어 닫기" />
 * ```
 */
export const CloseButton: React.FC<CloseButtonProps> = ({
  onClick,
  size = 'md',
  ariaLabel = '닫기',
  className = ''
}) => {
  return (
    <button
      className={`close-button close-button--${size} ${className}`.trim()}
      onClick={onClick}
      aria-label={ariaLabel}
      type="button"
    >
      <SFSymbol
        name="xmark"
        size={sizeToSFSymbol[size]}
        weight={SFSymbolWeight.MEDIUM}
        decorative={true}
      />
    </button>
  )
}

