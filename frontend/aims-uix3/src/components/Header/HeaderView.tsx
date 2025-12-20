/**
 * Header View Component
 * @since 1.0.0
 *
 * Header의 순수 렌더링 컴포넌트
 * ARCHITECTURE.md 준수: 순수 View 컴포넌트, 모든 로직은 Controller에서 수신
 * CLAUDE.md 준수: 애플 디자인 철학 "Progressive Disclosure" UI 구현
 */

import React, { useEffect, memo, useState, useRef, useCallback } from 'react'
import { HeaderProps, HeaderControllerReturn } from './Header.types'
import ThemeToggle from '../ThemeToggle'
import HeaderTooltip from './HeaderTooltip'
import useHeaderTooltip from './useHeaderTooltip'
import { HAPTIC_TYPES } from '../../hooks/useHapticFeedback'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../SFSymbol'
import Tooltip from '../../shared/ui/Tooltip'
import { useDevModeStore } from '../../shared/store/useDevModeStore'
import { useUserStore } from '../../stores/user'
import { useAuthStore } from '../../shared/stores/authStore'
import { UserProfileMenu } from './UserProfileMenu'
import { QuickSearch } from '../QuickSearch'
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
  onMenuClick,
  onQuickSearchCustomerClick,
  onChatToggle,
  isChatOpen,
  className = '',
  controller
}) => {
  const { state, handleMouseEnter, handleMouseLeave, handleFocus, handleBlur } = controller

  // 개발자 모드 상태 (Ctrl+Shift+D로 토글)
  const { isDevMode } = useDevModeStore()

  // 현재 사용자 정보 (레거시)
  const { userId, setUserId, currentUser, availableUsers, loading } = useUserStore()

  // 소셜 로그인 사용자 정보
  const { user: authUser, isAuthenticated } = useAuthStore()

  // 사용자 프로필 메뉴 상태
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const userAvatarRef = useRef<HTMLDivElement>(null)

  // 사용자 전환 핸들러
  const handleUserChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newUserId = event.target.value;
    setUserId(newUserId);
  }

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

  // 빠른검색 네비게이션 핸들러
  const handleQuickSearchNavigate = useCallback((type: 'customer' | 'document', id: string) => {
    if (type === 'document' && id === 'search') {
      // 고급 검색으로 이동
      onMenuClick?.('documents-search')
    } else if (type === 'customer') {
      // 고객 전체보기로 이동
      onMenuClick?.('customers-full-detail')
    }
  }, [onMenuClick])

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
        {/* Developer Mode Badge - AIMS UIX3 우측 */}
        {isDevMode && (
          <div className="header-dev-badge">
            🔧 DEV
          </div>
        )}
      </div>

      {/* 제어 요소들 - Progressive Disclosure */}
      <div className="header-controls">
        {/* 사용자 전환 드롭다운 - 개발자 모드(Ctrl+Shift+D)에서만 표시 */}
        {isDevMode && (
          <div
            className="header-user-selector"
            style={{
              opacity: 1, // 개발자 모드에서는 항상 표시
              transform: 'translateY(0)'
            }}
          >
            <label htmlFor="user-select" className="header-user-label">
              사용자:
            </label>
            {loading ? (
              <span className="header-user-loading">로딩중...</span>
            ) : (
              <select
                id="user-select"
                value={userId}
                onChange={handleUserChange}
                className="header-user-select"
                aria-label="사용자 선택"
              >
                {availableUsers.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.id})
                  </option>
                ))}
              </select>
            )}
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
                opacity: 1, // 개발자 모드에서는 항상 표시
                transform: 'translateY(0)'
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

        {/* 빠른 검색 - 항상 표시 */}
        <div className="header-quick-search-container">
          <QuickSearch
            onNavigate={handleQuickSearchNavigate}
            onCustomerClick={onQuickSearchCustomerClick}
            placeholder="고객 검색..."
          />
        </div>

        {/* AI 채팅 버튼 - 항상 표시 */}
        {onChatToggle && (
          <Tooltip content={isChatOpen ? 'AI 채팅 닫기' : 'AI 채팅'}>
            <button
              type="button"
              onClick={onChatToggle}
              className={`header-chat-button ${isChatOpen ? 'header-chat-button--active' : ''}`}
              aria-label={isChatOpen ? 'AI 채팅 닫기' : 'AI 채팅 열기'}
              aria-pressed={isChatOpen === true}
            >
              <span className="header-chat-icon">
  {/* AI 말풍선 커스텀 아이콘 - 그라데이션 */}
                <svg
                  className="header-chat-ai-icon"
                  viewBox="0 0 36 26"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  {/* 그라데이션 정의 - 1번: 보라-시안 */}
                  <defs>
                    <linearGradient id="aiGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#8B5CF6" />
                      <stop offset="100%" stopColor="#06B6D4" />
                    </linearGradient>
                    <linearGradient id="aiGradientHover" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#7C3AED" />
                      <stop offset="100%" stopColor="#0891B2" />
                    </linearGradient>
                  </defs>
                  {/* 말풍선 - 그라데이션 채움 */}
                  <path
                    d="M8 2C4.68629 2 2 4.68629 2 8V14C2 17.3137 4.68629 20 8 20H9V24L15 20H28C31.3137 20 34 17.3137 34 14V8C34 4.68629 31.3137 2 28 2H8Z"
                    fill={isChatOpen ? 'url(#aiGradientHover)' : 'url(#aiGradient)'}
                  />
                  {/* AI 텍스트 - 항상 흰색 */}
                  <text
                    x="18"
                    y="12"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fontSize="12"
                    fontWeight="800"
                    fontFamily="system-ui, -apple-system, sans-serif"
                  >
                    AI
                  </text>
                </svg>
              </span>
            </button>
          </Tooltip>
        )}

        {/* 테마 토글 - 항상 표시 */}
        <div className="header-theme-container">
          <ThemeToggle theme={theme} onToggle={onThemeToggle} />
        </div>

        {/* 사용자 계정 정보 - 항상 표시, 맨 우측 (Google 스타일) */}
        <div className="header-user-profile">
          {loading ? (
            <div className="header-user-avatar-skeleton" aria-label="사용자 정보 로딩 중">
              <span className="header-user-avatar-loading-text">...</span>
            </div>
          ) : (() => {
            // 개발자 모드: userId로 직접 조회, 일반 모드: authStore 우선 (소셜 로그인)
            const displayUser = isDevMode
              ? availableUsers.find(u => u.id === userId)
              : (() => {
                  const authUserDisplay = isAuthenticated && authUser ? {
                    id: authUser._id,
                    name: authUser.name || '사용자',
                    email: authUser.email || '',
                    avatarUrl: authUser.avatarUrl || undefined
                  } : null;
                  return authUserDisplay || currentUser || availableUsers.find(u => u.id === userId);
                })();
            const userName = displayUser?.name || userId;
            const userInitial = userName.charAt(0).toUpperCase();
            const avatarUrl = displayUser?.avatarUrl;

            return (
              <div
                ref={userAvatarRef}
                className="header-user-avatar"
                role="button"
                tabIndex={0}
                aria-label={`현재 사용자: ${userName}. 클릭하여 프로필 메뉴 열기`}
                aria-haspopup="menu"
                aria-expanded={isProfileMenuOpen}
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setIsProfileMenuOpen(!isProfileMenuOpen);
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                <div className="header-user-avatar-circle">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={userName} />
                  ) : (
                    userInitial
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {/* 사용자 프로필 메뉴 */}
        {!loading && (() => {
          // 개발자 모드: userId로 직접 조회, 일반 모드: authStore 우선 (소셜 로그인)
          const displayUser = isDevMode
            ? availableUsers.find(u => u.id === userId)
            : (() => {
                const authUserDisplay = isAuthenticated && authUser ? {
                  id: authUser._id,
                  name: authUser.name || '사용자',
                  email: authUser.email || '',
                  avatarUrl: authUser.avatarUrl || undefined
                } : null;
                return authUserDisplay || currentUser || availableUsers.find(u => u.id === userId);
              })();
          if (!displayUser) return null;

          return (
            <UserProfileMenu
              isOpen={isProfileMenuOpen}
              onClose={() => setIsProfileMenuOpen(false)}
              user={{
                id: displayUser.id,
                name: displayUser.name,
                email: displayUser.email || `${displayUser.id}@example.com`,
                ...(displayUser.avatarUrl && { avatarUrl: displayUser.avatarUrl })
              }}
              anchorElement={userAvatarRef.current}
              {...(onMenuClick && { onMenuClick })}
            />
          );
        })()}
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