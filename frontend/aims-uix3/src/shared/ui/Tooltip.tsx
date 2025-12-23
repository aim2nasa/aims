/**
 * AIMS UIX-3 Tooltip Component
 * @since 2025-10-02
 * @version 1.2.0 - 하이브리드 위치 계산 (요소 기반 수직 + 마우스 기반 수평)
 *
 * 🍎 iOS 스타일 툴팁 컴포넌트
 * - 호버 시 부드럽게 나타나는 툴팁
 * - 수직 위치: 요소 기준 (버튼을 가리지 않음)
 * - 수평 위치: 마우스 기준 (마우스 근처에 표시)
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
  const [arrowOffset, setArrowOffset] = useState<number | null>(null) // 말꼬리 위치 (px)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const timeoutRef = useRef<number | undefined>(undefined)
  const triggerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  /**
   * 툴팁이 표시된 후 위치 계산 (하이브리드: 요소 기반 수직 + 마우스 기반 수평)
   */
  useEffect(() => {
    if (!isVisible || !tooltipRef.current || !triggerRef.current) return

    const tooltipRect = tooltipRef.current.getBoundingClientRect()
    const triggerRect = triggerRef.current.getBoundingClientRect()

    let top = 0
    let left = 0

    // 수직: 요소 기준 (버튼을 가리지 않음), 수평: 마우스 기준 (마우스 근처)
    switch (placement) {
      case 'top':
        top = triggerRect.top - tooltipRect.height - 8  // 요소 위
        left = mousePos.x - tooltipRect.width / 2       // 마우스 X 기준
        break
      case 'bottom':
        top = triggerRect.bottom + 8                    // 요소 아래
        left = mousePos.x - tooltipRect.width / 2       // 마우스 X 기준
        break
      case 'left':
        top = mousePos.y - tooltipRect.height / 2       // 마우스 Y 기준
        left = triggerRect.left - tooltipRect.width - 8 // 요소 왼쪽
        break
      case 'right':
        top = mousePos.y - tooltipRect.height / 2       // 마우스 Y 기준
        left = triggerRect.right + 8                    // 요소 오른쪽
        break
    }

    // 화면 경계 체크
    const padding = 8
    if (left < padding) left = padding
    if (left + tooltipRect.width > window.innerWidth - padding) {
      left = window.innerWidth - tooltipRect.width - padding
    }
    if (top < padding) top = triggerRect.bottom + 8 // top이 화면 밖이면 bottom으로

    // 말꼬리 위치 계산: 타겟 요소 중심을 향하도록
    const triggerCenterX = triggerRect.left + triggerRect.width / 2
    const triggerCenterY = triggerRect.top + triggerRect.height / 2

    let arrowPos: number | null = null
    const arrowPadding = 12 // 말꼬리가 모서리에 너무 가깝지 않게

    if (placement === 'top' || placement === 'bottom') {
      // 수평 방향: 타겟 중심 X를 기준으로 말꼬리 위치 계산
      arrowPos = triggerCenterX - left
      // 범위 제한: 툴팁 내부에 있도록
      arrowPos = Math.max(arrowPadding, Math.min(arrowPos, tooltipRect.width - arrowPadding))
    } else {
      // 수직 방향: 타겟 중심 Y를 기준으로 말꼬리 위치 계산
      arrowPos = triggerCenterY - top
      arrowPos = Math.max(arrowPadding, Math.min(arrowPos, tooltipRect.height - arrowPadding))
    }

    setArrowOffset(arrowPos)
    setPosition({ top, left })
  }, [isVisible, placement, mousePos])

  /**
   * 마우스 진입 시 지연 후 툴팁 표시
   */
  const handleMouseEnter = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY })
    timeoutRef.current = window.setTimeout(() => {
      setIsVisible(true)
    }, delay)
  }

  /**
   * 마우스 이탈 시 즉시 툴팁 숨김
   */
  const handleMouseLeave = () => {
    if (timeoutRef.current !== undefined) {
      window.clearTimeout(timeoutRef.current)
    }
    setIsVisible(false)
  }

  /**
   * 클린업
   */
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current)
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
  } as React.HTMLAttributes<HTMLElement>)

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
      <div
        className="tooltip-arrow"
        style={
          arrowOffset !== null
            ? (placement === 'top' || placement === 'bottom')
              ? { left: `${arrowOffset}px`, marginLeft: '-4px' }
              : { top: `${arrowOffset}px`, marginTop: '-4px' }
            : undefined
        }
      />
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
