/**
 * OnboardingTour Component
 * @since 1.0.0
 * @version 2.0.0
 *
 * 첫 방문 사용자를 위한 가이드 투어
 * Apple 디자인 철학: Clarity, Deference, Depth
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '@/components/SFSymbol'
import Button from '@/shared/ui/Button'
import './OnboardingTour.css'

const STORAGE_KEY = 'aims_onboarding_completed'

export interface TourStep {
  /** 하이라이트할 요소의 selector */
  target: string
  /** 단계 제목 */
  title: string
  /** 단계 설명 */
  description: string
  /** 툴팁 위치 */
  placement?: 'top' | 'bottom' | 'left' | 'right'
  /** 아이콘 (SF Symbol name) */
  icon?: string
}

interface OnboardingTourProps {
  /** 투어 단계들 */
  steps: TourStep[]
  /** 투어 완료 콜백 */
  onComplete?: () => void
  /** 투어 스킵 콜백 */
  onSkip?: () => void
  /** 강제로 투어 표시 (개발용) */
  forceShow?: boolean
}

/**
 * OnboardingTour 컴포넌트
 *
 * - localStorage로 완료 상태 관리
 * - 스텝별 하이라이트 + 툴팁
 * - 키보드 네비게이션 지원
 */
export const OnboardingTour: React.FC<OnboardingTourProps> = ({
  steps,
  onComplete,
  onSkip,
  forceShow = false
}) => {
  const [isActive, setIsActive] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // 투어 완료 여부 확인
  useEffect(() => {
    if (forceShow) {
      setIsActive(true)
      return
    }

    const hasCompleted = localStorage.getItem(STORAGE_KEY)
    if (!hasCompleted) {
      // 약간의 딜레이 후 투어 시작 (UI 렌더링 대기)
      const timer = setTimeout(() => {
        setIsActive(true)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [forceShow])

  // 현재 스텝의 타겟 요소 위치 계산
  useEffect(() => {
    if (!isActive || !steps[currentStep]) return

    const updateTargetPosition = () => {
      const step = steps[currentStep]
      const element = document.querySelector(step.target)

      if (element) {
        const rect = element.getBoundingClientRect()
        setTargetRect(rect)
      } else {
        setTargetRect(null)
      }
    }

    updateTargetPosition()

    // 리사이즈 시 위치 업데이트
    window.addEventListener('resize', updateTargetPosition)
    window.addEventListener('scroll', updateTargetPosition, true)

    return () => {
      window.removeEventListener('resize', updateTargetPosition)
      window.removeEventListener('scroll', updateTargetPosition, true)
    }
  }, [isActive, currentStep, steps])

  // 키보드 네비게이션
  useEffect(() => {
    if (!isActive) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
        case 'Enter':
          e.preventDefault()
          handleNext()
          break
        case 'ArrowLeft':
          e.preventDefault()
          handlePrev()
          break
        case 'Escape':
          e.preventDefault()
          handleSkip()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isActive, currentStep])

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1)
    } else {
      handleComplete()
    }
  }, [currentStep, steps.length])

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }, [currentStep])

  const handleComplete = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setIsActive(false)
    onComplete?.()
  }, [onComplete])

  // 건너뛰기 (이번에만 닫기)
  const handleSkip = useCallback(() => {
    setIsActive(false)
    onSkip?.()
  }, [onSkip])

  // 다시 보지 않기 (영구 숨김)
  const handleNeverShow = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setIsActive(false)
    onSkip?.()
  }, [onSkip])

  // 툴팁 위치 계산
  const getTooltipStyle = useCallback((): React.CSSProperties => {
    if (!targetRect) return {}

    const step = steps[currentStep]
    const placement = step.placement || 'bottom'
    const padding = 20
    const tooltipWidth = 360

    let top = 0
    let left = 0

    switch (placement) {
      case 'top':
        top = targetRect.top - padding - 8
        left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2
        break
      case 'bottom':
        top = targetRect.bottom + padding
        left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2
        break
      case 'left':
        top = targetRect.top + targetRect.height / 2
        left = targetRect.left - tooltipWidth - padding
        break
      case 'right':
        top = targetRect.top + targetRect.height / 2
        left = targetRect.right + padding
        break
    }

    // 화면 밖으로 나가지 않도록 보정
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16))
    top = Math.max(16, top)

    return {
      top: `${top}px`,
      left: `${left}px`,
      width: `${tooltipWidth}px`
    }
  }, [targetRect, currentStep, steps])

  if (!isActive || steps.length === 0) return null

  const step = steps[currentStep]
  const isLastStep = currentStep === steps.length - 1
  const isFirstStep = currentStep === 0

  return createPortal(
    <div className="onboarding-tour" role="dialog" aria-modal="true" aria-label="사용 가이드">
      {/* 오버레이 */}
      <div className="onboarding-tour__overlay" onClick={handleSkip}>
        {targetRect && (
          <div
            className="onboarding-tour__spotlight"
            style={{
              top: targetRect.top - 8,
              left: targetRect.left - 8,
              width: targetRect.width + 16,
              height: targetRect.height + 16
            }}
          />
        )}
      </div>

      {/* 툴팁 */}
      <div
        ref={tooltipRef}
        className={`onboarding-tour__tooltip onboarding-tour__tooltip--${step.placement || 'bottom'}`}
        style={getTooltipStyle()}
      >
        {/* 스텝 카운터 + 닫기 버튼 */}
        <div className="onboarding-tour__step-counter">
          <span className="onboarding-tour__step-number">
            {currentStep + 1} / {steps.length}
          </span>
          <button
            type="button"
            className="onboarding-tour__step-close"
            onClick={handleSkip}
            aria-label="닫기"
          >
            <SFSymbol
              name="xmark"
              size={SFSymbolSize.CAPTION_1}
              weight={SFSymbolWeight.SEMIBOLD}
              decorative
            />
          </button>
        </div>

        {/* 헤더 */}
        <div className="onboarding-tour__header">
          {step.icon && (
            <span className="onboarding-tour__icon">
              <SFSymbol
                name={step.icon}
                size={SFSymbolSize.TITLE_3}
                weight={SFSymbolWeight.MEDIUM}
              />
            </span>
          )}
          <h3 className="onboarding-tour__title">{step.title}</h3>
        </div>

        {/* 본문 */}
        <p className="onboarding-tour__description">{step.description}</p>

        {/* 진행 상태 도트 */}
        <div className="onboarding-tour__progress">
          {steps.map((_, index) => (
            <span
              key={index}
              className={`onboarding-tour__dot ${index === currentStep ? 'onboarding-tour__dot--active' : ''} ${index < currentStep ? 'onboarding-tour__dot--completed' : ''}`}
            />
          ))}
        </div>

        {/* 액션 버튼 */}
        <div className="onboarding-tour__actions">
          <button
            type="button"
            className="onboarding-tour__skip"
            onClick={handleSkip}
          >
            건너뛰기
          </button>
          <div className="onboarding-tour__nav">
            {!isFirstStep && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handlePrev}
              >
                이전
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={handleNext}
            >
              {isLastStep ? '시작하기' : '다음'}
            </Button>
          </div>
        </div>

        {/* 다시 보지 않기 */}
        <div className="onboarding-tour__footer">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNeverShow}
            className="onboarding-tour__never-show"
          >
            다시 표시 안 함
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}

/**
 * 투어 완료 상태 초기화 (개발/테스트용)
 */
export const resetOnboardingTour = () => {
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * 투어 완료 여부 확인
 */
export const hasCompletedOnboarding = () => {
  return localStorage.getItem(STORAGE_KEY) === 'true'
}

export default OnboardingTour
