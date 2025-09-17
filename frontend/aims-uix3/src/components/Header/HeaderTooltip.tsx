/**
 * HeaderTooltip Component
 * @since 1.0.0
 *
 * 애플스러운 툴팁 컴포넌트
 * COMPONENT_GUIDE.md 준수: 독립적인 재사용 가능 컴포넌트
 * CLAUDE.md 준수: CSS 변수 100% 활용, 하드코딩 금지
 */

import React from 'react'

export interface HeaderTooltipProps {
  /** 툴팁 표시 여부 */
  visible: boolean;
  /** 툴팁 내용 */
  children: React.ReactNode;
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * HeaderTooltip 컴포넌트
 *
 * 애플 디자인 철학 구현:
 * - Contextual Help: 위치 기반 도움말
 * - Progressive Disclosure: 필요한 시점에만 표시
 * - Non-intrusive: 방해하지 않는 서브틀한 표현
 */
export const HeaderTooltip: React.FC<HeaderTooltipProps> = ({
  visible,
  children,
  className = ''
}) => {
  const tooltipClasses = [
    'header-tooltip',
    visible ? 'header-tooltip--visible' : '',
    className
  ].filter(Boolean).join(' ')

  return (
    <div
      className={tooltipClasses}
      role="tooltip"
      aria-hidden={!visible}
    >
      {children}
    </div>
  )
}

export default HeaderTooltip