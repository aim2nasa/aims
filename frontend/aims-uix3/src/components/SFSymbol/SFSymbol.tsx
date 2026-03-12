/**
 * SF Symbol Component System
 * @since 1.0.0
 *
 * Apple SF Symbols 스타일 아이콘 컴포넌트 라이브러리
 * iOS Human Interface Guidelines 완벽 준수
 * CLAUDE.md 준수: 공용 컴포넌트 시스템 구축
 */

import React from 'react'
import { HAPTIC_TYPES } from '../../hooks/useHapticFeedback'
import {
  SFSymbolAnimation,
  SFSymbolSize,
  SFSymbolVariant,
  SFSymbolWeight
} from './SFSymbol.types'
import type { SFSymbolProps } from './SFSymbol.types'
import './SFSymbol.css'

/**
 * SF Symbol 이름을 CSS 클래스로 변환
 *
 * @param name SF Symbol 이름
 * @returns CSS 클래스명
 */
const symbolNameToClass = (name: string): string => {
  return `sf-symbol--${name.replace(/\./g, '-')}`
}

/**
 * SF Symbol React 컴포넌트
 *
 * Apple SF Symbols 디자인 시스템을 웹에서 구현
 * iOS Human Interface Guidelines 완벽 준수
 *
 * @example
 * ```tsx
 * // 기본 사용법
 * <SFSymbol name="gear" />
 *
 * // 크기와 가중치 지정
 * <SFSymbol
 *   name="sun.max"
 *   size={SFSymbolSize.TITLE_2}
 *   weight={SFSymbolWeight.SEMIBOLD}
 * />
 *
 * // 인터랙티브 심볼 (햅틱 피드백 포함)
 * <SFSymbol
 *   name="moon.stars"
 *   interactive={true}
 *   hapticType="light"
 *   onClick={() => handleMoonClick()}
 *   animation={SFSymbolAnimation.BOUNCE}
 * />
 * ```
 */
export const SFSymbol: React.FC<SFSymbolProps> = ({
  name,
  size = SFSymbolSize.BODY,
  weight = SFSymbolWeight.REGULAR,
  animation = SFSymbolAnimation.NONE,
  variant = SFSymbolVariant.REGULAR,
  color,
  interactive = false,
  hapticType = HAPTIC_TYPES.LIGHT,
  onClick,
  className = '',
  'aria-label': ariaLabel,
  title,
  decorative = false,
  ...props
}) => {
  // 클릭 핸들러 (햅틱 피드백 포함)
  const handleClick = () => {
    if (interactive && onClick) {
      // 햅틱 피드백 트리거
      if (window.aimsHaptic) {
        window.aimsHaptic.triggerHaptic(hapticType)
      }
      onClick()
    }
  }

  // CSS 클래스명 조합
  const symbolClasses = [
    'sf-symbol',
    symbolNameToClass(name),
    `sf-symbol--size-${size}`,
    `sf-symbol--weight-${weight}`,
    `sf-symbol--variant-${variant}`,
    animation !== SFSymbolAnimation.NONE ? `sf-symbol--animation-${animation}` : '',
    interactive ? 'sf-symbol--interactive haptic-enabled' : '',
    className
  ].filter(Boolean).join(' ')

  // 접근성 속성
  const accessibilityProps = {
    'aria-label': decorative ? undefined : (ariaLabel || name),
    'aria-hidden': decorative,
    title: decorative ? undefined : title,
    role: interactive ? 'button' : decorative ? 'presentation' : 'img'
  }

  // 스타일 속성
  const style = {
    ...(color && { color }),
    ...props.style
  }

  return (
    <span
      className={symbolClasses}
      onClick={interactive ? handleClick : undefined}
      style={style}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      } : undefined}
      {...accessibilityProps}
      {...props}
    >
      <span className="sf-symbol__shape" aria-hidden="true">
        {/* SF Symbol 실제 모양은 CSS에서 구현 */}
      </span>
      {interactive && (
        <span className="sf-symbol__ripple" aria-hidden="true" />
      )}
    </span>
  )
}

// 기본 내보내기
export default SFSymbol
