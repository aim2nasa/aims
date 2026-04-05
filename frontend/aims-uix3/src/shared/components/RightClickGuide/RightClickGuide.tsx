/* eslint-disable react-refresh/only-export-components -- 컴포넌트와 관련 유틸을 함께 export */
/**
 * RightClickGuide Component
 *
 * 첫 방문 사용자에게 마우스 우클릭 기능을 안내하는 가이드
 * 컨텍스트별로 다른 메뉴가 표시됨을 시각적으로 안내
 */

import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Button from '@/shared/ui/Button'
import { hasCompletedOnboarding } from '../OnboardingTour'
import './RightClickGuide.css'

const STORAGE_KEY = 'aims_rightclick_guide_shown'

interface RightClickGuideProps {
  /** 강제로 가이드 표시 (개발용) */
  forceShow?: boolean
  /** 가이드 닫힘 콜백 */
  onClose?: () => void
}

/**
 * 컨텍스트별 우클릭 메뉴 정보
 */
const CONTEXT_MENUS = [
  {
    id: 'customer',
    title: '고객 목록',
    icon: '👤',
    color: '#007AFF',
    items: ['상세 보기', '전화하기', '문자 보내기', '휴면 전환', '삭제']
  },
  {
    id: 'document',
    title: '문서',
    icon: '📄',
    color: '#34C759',
    items: ['미리보기', 'AI 요약', '다운로드', '삭제']
  },
  {
    id: 'files',
    title: '내 보관함',
    icon: '📁',
    color: '#FF9500',
    items: ['이름 변경', '이동', '새 폴더', '삭제']
  },
  {
    id: 'chat',
    title: 'AI 채팅',
    icon: '💬',
    color: '#AF52DE',
    items: ['메시지 복사']
  }
]

export const RightClickGuide: React.FC<RightClickGuideProps> = ({
  forceShow = false,
  onClose
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const [activeContext, setActiveContext] = useState(0)

  useEffect(() => {
    if (forceShow) {
      setIsVisible(true)
      return
    }

    // 이미 본 적 있으면 표시 안 함
    const hasShown = localStorage.getItem(STORAGE_KEY)
    if (hasShown) return

    // OnboardingTour가 이미 완료된 경우 바로 표시
    if (hasCompletedOnboarding()) {
      const timer = setTimeout(() => {
        setIsVisible(true)
      }, 500)
      return () => clearTimeout(timer)
    }

    // OnboardingTour가 아직 완료되지 않은 경우, 완료될 때까지 폴링
    const checkOnboardingComplete = setInterval(() => {
      if (hasCompletedOnboarding()) {
        clearInterval(checkOnboardingComplete)
        // OnboardingTour 완료 후 잠시 대기 후 표시
        setTimeout(() => {
          setIsVisible(true)
        }, 800)
      }
    }, 500)

    return () => clearInterval(checkOnboardingComplete)
  }, [forceShow])

  // 'show-rightclick-guide' 이벤트 리스너 (다시 보기 기능)
  useEffect(() => {
    const handleShowGuide = () => {
      setIsVisible(true)
    }

    window.addEventListener('show-rightclick-guide', handleShowGuide)
    return () => window.removeEventListener('show-rightclick-guide', handleShowGuide)
  }, [])

  // 컨텍스트 자동 순환 애니메이션
  useEffect(() => {
    if (!isVisible) return

    const interval = setInterval(() => {
      setActiveContext(prev => (prev + 1) % CONTEXT_MENUS.length)
    }, 2500)

    return () => clearInterval(interval)
  }, [isVisible])

  const handleClose = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setIsVisible(false)
    onClose?.()
  }, [onClose])

  if (!isVisible) return null

  const currentContext = CONTEXT_MENUS[activeContext]

  return createPortal(
    <div className="rightclick-guide" role="dialog" aria-modal="true" aria-label="우클릭 가이드">
      {/* 오버레이 */}
      <div className="rightclick-guide__overlay" onClick={handleClose} />

      {/* 모달 */}
      <div className="rightclick-guide__modal">
        {/* 헤더 */}
        <div className="rightclick-guide__header">
          <h2 className="rightclick-guide__title">마우스 우클릭을 활용하세요</h2>
          <p className="rightclick-guide__subtitle">
            화면마다 다른 메뉴가 나타납니다
          </p>
        </div>

        {/* 메인 비주얼: 마우스 + 컨텍스트 메뉴 */}
        <div className="rightclick-guide__visual">
          {/* 마우스 */}
          <div className="rightclick-guide__mouse">
            <svg viewBox="0 0 80 130" className="rightclick-guide__mouse-svg">
              {/* 마우스 본체 */}
              <rect
                x="5" y="25"
                width="70" height="100"
                rx="35" ry="35"
                className="rightclick-guide__mouse-body"
              />
              {/* 좌클릭 */}
              <path
                d="M5 60 L5 45 Q5 25 40 25 L40 60 Z"
                className="rightclick-guide__mouse-left"
              />
              {/* 우클릭 (하이라이트) */}
              <path
                d="M40 25 Q75 25 75 45 L75 60 L40 60 Z"
                className="rightclick-guide__mouse-right"
              />
              {/* 휠 */}
              <rect x="34" y="35" width="12" height="20" rx="6" className="rightclick-guide__mouse-wheel" />
              {/* 구분선 */}
              <line x1="40" y1="25" x2="40" y2="60" className="rightclick-guide__mouse-divider" />
            </svg>
            {/* 클릭 이펙트 */}
            <div className="rightclick-guide__click-effect" />
          </div>

          {/* 화살표 */}
          <div className="rightclick-guide__arrow">→</div>

          {/* 컨텍스트 메뉴 프리뷰 */}
          <div
            className="rightclick-guide__menu-preview"
            style={{ '--context-color': currentContext.color } as React.CSSProperties}
          >
            <div className="rightclick-guide__menu-header">
              <span className="rightclick-guide__menu-icon">{currentContext.icon}</span>
              <span className="rightclick-guide__menu-title">{currentContext.title}</span>
            </div>
            <div className="rightclick-guide__menu-items">
              {currentContext.items.map((item, idx) => (
                <div
                  key={idx}
                  className={`rightclick-guide__menu-item ${idx === 0 ? 'rightclick-guide__menu-item--highlight' : ''}`}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 컨텍스트 인디케이터 */}
        <div className="rightclick-guide__contexts">
          {CONTEXT_MENUS.map((ctx, idx) => (
            <button
              key={ctx.id}
              type="button"
              className={`rightclick-guide__context-btn ${idx === activeContext ? 'rightclick-guide__context-btn--active' : ''}`}
              onClick={() => setActiveContext(idx)}
              style={{ '--btn-color': ctx.color } as React.CSSProperties}
            >
              <span className="rightclick-guide__context-icon">{ctx.icon}</span>
              <span className="rightclick-guide__context-label">{ctx.title}</span>
            </button>
          ))}
        </div>

        {/* 팁 */}
        <div className="rightclick-guide__tip">
          <span className="rightclick-guide__tip-icon">💡</span>
          <span className="rightclick-guide__tip-text">
            도움말 → 사용 가이드에서 언제든 다시 볼 수 있습니다
          </span>
        </div>

        {/* 액션 버튼 */}
        <div className="rightclick-guide__actions">
          <Button variant="primary" size="md" onClick={handleClose}>
            알겠습니다
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}

/**
 * 가이드 표시 상태 초기화 (설정에서 다시 보기용)
 */
export const resetRightClickGuide = () => {
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * 가이드를 이미 봤는지 확인
 */
export const hasSeenRightClickGuide = () => {
  return localStorage.getItem(STORAGE_KEY) === 'true'
}

/**
 * 가이드 강제 표시 (설정에서 호출)
 */
export const showRightClickGuide = () => {
  localStorage.removeItem(STORAGE_KEY)
  // 컴포넌트가 다시 마운트되도록 이벤트 발생
  window.dispatchEvent(new CustomEvent('show-rightclick-guide'))
}

