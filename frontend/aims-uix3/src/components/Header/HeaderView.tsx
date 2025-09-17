/**
 * Header View Component
 * @since 1.0.0
 *
 * Header의 순수 렌더링 컴포넌트
 * ARCHITECTURE.md 준수: 순수 View 컴포넌트, 모든 로직은 Controller에서 수신
 * CLAUDE.md 준수: 애플 디자인 철학 "Progressive Disclosure" UI 구현
 */

import React from 'react'
import { HeaderProps, HeaderControllerReturn } from './Header.types'
import ThemeToggle from '../ThemeToggle'
import HeaderTooltip from './HeaderTooltip'
import useHeaderTooltip from './useHeaderTooltip'
import './Header.css'

interface HeaderViewProps extends HeaderProps {
  /** Controller에서 제공하는 상태와 핸들러 */
  controller: HeaderControllerReturn;
}

/**
 * HeaderView 컴포넌트
 *
 * Progressive Disclosure 패턴으로 구현된 애플 스타일 Header
 * - 기본: 거의 보이지 않는 서브틀한 상태
 * - 호버: 자연스럽게 확장되어 제어 요소들 표시
 * - "Invisible until you need it" 철학 구현
 */
export const HeaderView: React.FC<HeaderViewProps> = ({
  visible,
  layoutControlModalOpen,
  theme,
  onLayoutControlOpen,
  onThemeToggle,
  className = '',
  controller
}) => {
  const { state, handleMouseEnter, handleMouseLeave, handleFocus, handleBlur } = controller

  // 3단계: 애플스러운 툴팁 Hook + 4단계: 펄스 애니메이션
  const { showTooltip, showPulse, dismissTooltip } = useHeaderTooltip()

  // 헤더 표시 여부 확인
  if (!visible) return null

  // 클래스명 조합
  const headerClasses = [
    'header-progressive',                                    // 기본 Progressive Disclosure 클래스
    state.isHovered ? 'header-progressive--expanded' : '',  // 확장 상태
    state.showControls ? 'header-progressive--controls-visible' : '', // 제어 요소 표시
    state.isAnimating ? 'header-progressive--animating' : '', // 애니메이션 중
    className
  ].filter(Boolean).join(' ')

  // 제어 버튼 클래스명
  const controlButtonClasses = [
    'header-control-button',
    layoutControlModalOpen ? 'header-control-button--active' : ''
  ].filter(Boolean).join(' ')

  // 툴팁 및 펄스 상호작용 처리
  const handleHeaderMouseEnter = () => {
    handleMouseEnter()
    if (showTooltip || showPulse) {
      dismissTooltip() // 사용자가 상호작용하면 툴팁/펄스 즉시 해제
    }
  }

  return (
    <header
      className={headerClasses}
      onMouseEnter={handleHeaderMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      role="banner"
      aria-label="메인 네비게이션"
    >
      {/* 서브틀한 브랜딩 - 항상 표시 */}
      <div className="header-branding">
        <h1 className="header-title">
          AIMS UIX3
        </h1>
      </div>

      {/* 제어 요소들 - Progressive Disclosure */}
      <div className="header-controls">
        {/* 레이아웃 제어 버튼 */}
        <button
          onClick={onLayoutControlOpen}
          className="header-control-button"
          aria-label="레이아웃 제어"
          title="레이아웃 제어"
          style={{
            opacity: state.showControls ? 1 : 0,
            transform: state.showControls ? 'translateY(0)' : 'translateY(-8px)'
          }}
        >
          ⚙
        </button>

        {/* 테마 토글 */}
        <div
          className="header-theme-container"
          style={{
            opacity: state.showControls ? 1 : 0,
            transform: state.showControls ? 'translateY(0)' : 'translateY(-8px)'
          }}
        >
          <ThemeToggle theme={theme} onToggle={onThemeToggle} />
        </div>
      </div>

      {/* Progressive Disclosure 인디케이터 - BRB 스타일 + 4단계 펄스 */}
      <div
        className={[
          'header-disclosure-indicator',
          showPulse ? 'header-disclosure-indicator--pulse' : ''
        ].filter(Boolean).join(' ')}
        aria-hidden="true"
      >
        {!state.showControls && '⋯'}
      </div>

      {/* 3단계: 애플스러운 툴팁 - 첫 방문자용 */}
      <HeaderTooltip visible={showTooltip}>
        Hover for controls
      </HeaderTooltip>
    </header>
  )
}

export default HeaderView