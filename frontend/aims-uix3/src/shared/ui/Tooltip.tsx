/**
 * AIMS UIX-3 Tooltip Component
 * @since 2025-10-02
 * @version 1.0.1 - 위치 계산 로직 수정
 *
 * 🍎 iOS 스타일 툴팁 컴포넌트
 * - 호버 시 부드럽게 나타나는 툴팁
 * - Progressive Disclosure 철학 적용
 * - 접근성 준수 (ARIA)
 */

import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import './Tooltip.css'

export interface TooltipProps {
  /** 툴팁 내용 */
  content: string
  /** 툴팁을 감쌀 자식 요소 */
  children: React.ReactElement
  /** 툴팁 위치 (기본값: top) */
  placement?: 'top' | 'bottom' | 'left' | 'right'
  /** 툴팁 표시 지연 시간 (ms, 기본값: 300ms) */
  delay?: number
}

/**
 * Tooltip Component
 *
 * @example
 * ```tsx
 * <Tooltip content="새로고침">
 *   <button>🔄</button>
 * </Tooltip>
 * ```
 */
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  placement = 'top',
  delay = 300
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const timeoutRef = useRef<NodeJS.Timeout>()
  const triggerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  /**
   * 툴팁이 표시된 후 위치 계산
   */
  useEffect(() => {
    if (!isVisible || !triggerRef.current || !tooltipRef.current) return

    const triggerRect = triggerRef.current.getBoundingClientRect()
    const tooltipRect = tooltipRef.current.getBoundingClientRect()

    let top = 0
    let left = 0

    switch (placement) {
      case 'top':
        top = triggerRect.top - tooltipRect.height - 8
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
        break
      case 'bottom':
        top = triggerRect.bottom + 8
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
        break
      case 'left':
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2
        left = triggerRect.left - tooltipRect.width - 8
        break
      case 'right':
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2
        left = triggerRect.right + 8
        break
    }

    // 화면 경계 체크
    const padding = 8
    if (left < padding) left = padding
    if (left + tooltipRect.width > window.innerWidth - padding) {
      left = window.innerWidth - tooltipRect.width - padding
    }
    if (top < padding) top = triggerRect.bottom + 8 // top이 화면 밖이면 bottom으로

    setPosition({ top, left })
  }, [isVisible, placement])

  /**
   * 마우스 진입 시 지연 후 툴팁 표시
   */
  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true)
    }, delay)
  }

  /**
   * 마우스 이탈 시 즉시 툴팁 숨김
   */
  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setIsVisible(false)
  }

  /**
   * 클린업
   */
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  /**
   * 자식 요소에 이벤트 핸들러 연결
   */
  const childWithHandlers = React.cloneElement(children, {
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    'aria-describedby': isVisible ? 'tooltip' : undefined
  })

  /**
   * 툴팁 렌더링
   */
  const tooltipElement = isVisible ? (
    <div
      ref={tooltipRef}
      className={`tooltip tooltip--${placement}`}
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        opacity: position.top === 0 && position.left === 0 ? 0 : 1
      }}
      role="tooltip"
      id="tooltip"
    >
      <div className="tooltip-content">
        {content}
      </div>
      <div className="tooltip-arrow" />
    </div>
  ) : null

  return (
    <>
      <div ref={triggerRef} className="tooltip-trigger">
        {childWithHandlers}
      </div>

      {/* Portal로 body에 렌더링 */}
      {tooltipElement && createPortal(tooltipElement, document.body)}
    </>
  )
}

export default Tooltip
