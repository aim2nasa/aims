/**
 * Header View Component
 * @since 1.0.0
 *
 * Header의 순수 렌더링 컴포넌트
 * ARCHITECTURE.md 준수: 순수 View 컴포넌트, 모든 로직은 Controller에서 수신
 */

import React, { memo, useState, useRef, useCallback, useEffect } from 'react'
import { HeaderProps, HeaderControllerReturn } from './Header.types'
import ThemeToggle from '../ThemeToggle'
import { HAPTIC_TYPES } from '../../hooks/useHapticFeedback'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../SFSymbol'
import Tooltip from '../../shared/ui/Tooltip'
import { useDevModeStore } from '../../shared/store/useDevModeStore'
import { useUserStore } from '../../stores/user'
import { useAuthStore } from '../../shared/stores/authStore'
import { UserProfileMenu } from './UserProfileMenu'
import { QuickSearch } from '../QuickSearch'
import './Header.layout.css';
import './Header.mobile.css';
import './Header.extras.css';

interface HeaderViewProps extends HeaderProps {
  /** Controller에서 제공하는 상태와 핸들러 */
  controller: HeaderControllerReturn;
}

/**
 * HeaderView 컴포넌트
 *
 * 애플 스타일 Header — 모든 핵심 기능이 항상 표시
 * 검색, AI 채팅, 테마 토글, 사용자 프로필이 즉시 접근 가능
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
  isAiPopupOpen = false,
  isMobile = false,
  isMobileDrawerOpen = false,
  onMobileMenuToggle,
  className = '',
  controller
}) => {
  const { state, handleMouseEnter, handleMouseLeave, handleFocus, handleBlur } = controller

  // 개발자 모드 상태 (Ctrl+Shift+D로 토글)
  const { isDevMode } = useDevModeStore()

  // 현재 사용자 정보 (레거시)
  const { userId, currentUser, availableUsers, loading } = useUserStore()

  // 소셜 로그인 사용자 정보
  const { user: authUser, isAuthenticated } = useAuthStore()

  // m-3: 테마 변경 시 스크린리더 알림 (초기 마운트 시 빈 문자열)
  const [themeLiveMsg, setThemeLiveMsg] = useState('')
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setThemeLiveMsg(theme === 'dark' ? '다크 모드로 전환되었습니다' : '라이트 모드로 전환되었습니다')
  }, [theme])

  // 사용자 프로필 메뉴 상태
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const userAvatarRef = useRef<HTMLDivElement>(null)

  // 사용자 전환 핸들러 (개발자 모드: dev override 방식 — 기존 auth 흐름 간섭 없음)
  const handleUserChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newUserId = event.target.value;
    // 개발자 자신의 ID로 돌아오면 override 제거
    const authUserId = authUser?._id || '';
    if (newUserId === authUserId) {
      localStorage.removeItem('aims-dev-user-override');
    } else {
      localStorage.setItem('aims-dev-user-override', newUserId);
    }
    window.location.reload();
  }


  // 헤더 표시 여부 확인
  if (!visible) return null

  // 클래스명 조합
  const headerClasses = [
    'header-progressive',
    state.isHovered ? 'header-progressive--expanded' : '',
    className
  ].filter(Boolean).join(' ')

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
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      role="banner"
      aria-label="메인 네비게이션"
    >
      {/* m-3: 스크린리더 알림 (테마 변경 시에만, 초기 마운트 시 무음) */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {themeLiveMsg}
      </div>

      {/* 서브틀한 브랜딩 - 항상 표시 */}
      <div className="header-branding">
        {/* 📱 모바일 햄버거 메뉴 버튼 */}
        {isMobile && onMobileMenuToggle && (
          <button
            type="button"
            className={`header-mobile-menu-btn ${isMobileDrawerOpen ? 'header-mobile-menu-btn--active' : ''}`}
            onClick={onMobileMenuToggle}
            aria-label={isMobileDrawerOpen ? '메뉴 닫기' : '메뉴 열기'}
            aria-expanded={isMobileDrawerOpen}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {isMobileDrawerOpen ? (
                /* X 아이콘 */
                <>
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="6" y1="18" x2="18" y2="6" />
                </>
              ) : (
                /* 햄버거 아이콘 */
                <>
                  <line x1="4" y1="7" x2="20" y2="7" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="17" x2="20" y2="17" />
                </>
              )}
            </svg>
          </button>
        )}
        <h1 className="header-title">
          <img
            src={theme === 'dark' ? '/assets/logo/aims-logo-full-dark.svg' : '/assets/logo/aims-logo-full-light.svg'}
            alt="AIMS"
            className="header-logo-full"
          />
        </h1>
        {/* Developer Mode Badge - AIMS UIX3 우측 */}
        {isDevMode && (
          <div className="header-dev-badge">
            DEV
          </div>
        )}
      </div>

      {/* 제어 요소들 - Progressive Disclosure */}
      <div className="header-controls">
        {/* 사용자 전환 드롭다운 - 개발자 모드 + 실제 로그인 계정이 agent/admin인 경우만 */}
        {isDevMode && (authUser?.role === 'agent' || authUser?.role === 'admin') && (
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
                value={localStorage.getItem('aims-dev-user-override') || userId}
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
          <Tooltip content="레이아웃 제어" placement="bottom">
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

        {/* AI 채팅 버튼 - 팝업 열림 시 비활성화 */}
        {onChatToggle && (
          <Tooltip
            content={isAiPopupOpen ? 'AI 어시스턴트가 별도 창에서 실행 중' : (isChatOpen ? 'AI 채팅 닫기' : 'AI 채팅')}
            placement="bottom"
          >
            <button
              type="button"
              onClick={isAiPopupOpen ? undefined : onChatToggle}
              className={`header-chat-button ${isChatOpen ? 'header-chat-button--active' : ''} ${isAiPopupOpen ? 'header-chat-button--disabled' : ''}`}
              aria-label={isAiPopupOpen ? 'AI 어시스턴트가 별도 창에서 실행 중' : (isChatOpen ? 'AI 채팅 닫기' : 'AI 채팅 열기')}
              aria-pressed={isChatOpen ? 'true' : 'false'}
              aria-disabled={isAiPopupOpen ? 'true' : undefined}
              disabled={isAiPopupOpen}
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

    </header>
  )
}

export default memo(HeaderView)