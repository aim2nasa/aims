/**
 * Header View Component
 * @since 1.0.0
 *
 * Header의 순수 렌더링 컴포넌트
 * ARCHITECTURE.md 준수: 순수 View 컴포넌트, 모든 로직은 Controller에서 수신
 * CLAUDE.md 준수: 애플 디자인 철학 "Progressive Disclosure" UI 구현
 */

import React, { useEffect, memo } from 'react'
import { HeaderProps, HeaderControllerReturn } from './Header.types'
import ThemeToggle from '../ThemeToggle'
import HeaderTooltip from './HeaderTooltip'
import useHeaderTooltip from './useHeaderTooltip'
import { HAPTIC_TYPES } from '../../hooks/useHapticFeedback'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../SFSymbol'
import Tooltip from '../../shared/ui/Tooltip'
import { useDevModeStore } from '../../shared/store/useDevModeStore'
import { useUserStore } from '../../stores/user'
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
  theme,
  onLayoutControlOpen,
  onThemeToggle,
  className = '',
  controller
}) => {
  const { state, handleMouseEnter, handleMouseLeave, handleFocus, handleBlur } = controller

  // 개발자 모드 상태 (Ctrl+Shift+D로 토글)
  const { isDevMode } = useDevModeStore()

  // 현재 사용자 정보
  const { userId } = useUserStore()

  // 3단계: 애플스러운 툴팁 Hook + 4단계: 펄스 애니메이션
  const { showTooltip, showPulse, dismissTooltip } = useHeaderTooltip()

  // Header-CBR 연동: 클래스 기반 접근법 (모달 격리)
  useEffect(() => {
    const layoutMain = document.querySelector('.layout-main');
    if (!layoutMain) return;

    if (state.isHovered || state.showControls) {
      // Header 확장 시: CBR 요소들을 아래로 이동
      layoutMain.classList.add('layout-main--header-expanded');
    } else {
      // Header 축소 시: CBR 요소들을 원래 위치로
      layoutMain.classList.remove('layout-main--header-expanded');
    }

    // 접근성: 스크린 리더에 레이아웃 변경 알림 (변화가 있을 때만)
    const announcement = state.isHovered ? 'Header expanded' : 'Header collapsed';
    const ariaLive = document.getElementById('layout-status-announcement');
    if (ariaLive && ariaLive.textContent !== announcement) {
      ariaLive.textContent = announcement;
    }
  }, [state.isHovered, state.showControls])

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

  // 제어 버튼 클래스명 (현재 미사용이지만 향후 확장을 위해 유지)
  // const controlButtonClasses = [
  //   'header-control-button',
  //   layoutControlModalOpen ? 'header-control-button--active' : ''
  // ].filter(Boolean).join(' ')

  // 툴팁 및 펄스 상호작용 처리 + 햅틱 피드백
  const handleHeaderMouseEnter = () => {
    handleMouseEnter()
    // Progressive Disclosure 확장 시 가벼운 햅틱 피드백
    if (window.aimsHaptic) {
      window.aimsHaptic.triggerHaptic(HAPTIC_TYPES.LIGHT)
    }
    if (showTooltip || showPulse) {
      dismissTooltip() // 사용자가 상호작용하면 툴팁/펄스 즉시 해제
    }
  }

  // 레이아웃 제어 버튼 클릭 핸들러 (햅틱 추가)
  const handleLayoutControlClick = () => {
    if (window.aimsHaptic) {
      window.aimsHaptic.triggerHaptic(HAPTIC_TYPES.MEDIUM)
    }
    onLayoutControlOpen()
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
        {/* 현재 사용자 표시 - 개발자 모드(Ctrl+Shift+D)에서만 표시 */}
        {isDevMode && (
          <div
            className="header-user-indicator"
            style={{
              opacity: state.showControls ? 1 : 0,
              transform: state.showControls ? 'translateY(0)' : 'translateY(-8px)'
            }}
          >
            <span className="header-user-label">사용자:</span>
            <span className="header-user-id">{userId}</span>
          </div>
        )}

        {/* 레이아웃 제어 버튼 - 개발자 모드(Ctrl+Shift+D)에서만 표시 */}
        {isDevMode && (
          <Tooltip content="레이아웃 제어">
            <button
              onClick={handleLayoutControlClick}
              className="header-control-button haptic-enabled micro-button micro-haptic-medium"
              aria-label="레이아웃 제어"
              style={{
                opacity: state.showControls ? 1 : 0,
                transform: state.showControls ? 'translateY(0)' : 'translateY(-8px)'
              }}
            >
              <SFSymbol
                name="gear"
                size={SFSymbolSize.CALLOUT}
                weight={SFSymbolWeight.MEDIUM}
                decorative={true}
              />
            </button>
          </Tooltip>
        )}

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
        {!state.showControls && (
          <SFSymbol
            name="ellipsis"
            size={SFSymbolSize.FOOTNOTE}
            weight={SFSymbolWeight.MEDIUM}
          />
        )}
      </div>

      {/* 3단계: 애플스러운 툴팁 - 첫 방문자용 */}
      <HeaderTooltip visible={showTooltip}>
        Hover for controls
      </HeaderTooltip>
    </header>
  )
}

export default memo(HeaderView)