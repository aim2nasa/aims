/**
 * FeedbackToast Component
 * @since 1.0.0
 *
 * 애플 스타일의 사용자 피드백 토스트
 * alert() 대신 사용하는 우아한 알림 시스템
 */

import React, { useEffect, useState } from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../SFSymbol'
import './FeedbackToast.css'

export interface FeedbackToastProps {
  /** 표시할 메시지 */
  message: string
  /** 토스트 타입 */
  type?: 'error' | 'warning' | 'info'
  /** 표시 시간 (ms) */
  duration?: number
  /** 표시 여부 */
  visible: boolean
  /** 닫기 콜백 */
  onClose: () => void
}

/**
 * FeedbackToast React 컴포넌트
 *
 * 애플 스타일의 Progressive Disclosure 피드백
 * - alert() 대신 사용하는 우아한 알림
 * - 자동 사라짐 + 수동 닫기 지원
 * - 다크모드 완전 지원
 */
export const FeedbackToast: React.FC<FeedbackToastProps> = ({
  message,
  type = 'error',
  duration = 5000,
  visible,
  onClose
}) => {
  const [isAnimating, setIsAnimating] = useState(false)

  // 표시/숨김 애니메이션 관리
  useEffect(() => {
    if (visible) {
      setIsAnimating(true)

      // 자동 닫기 타이머
      const timer = setTimeout(() => {
        handleClose()
      }, duration)

      return () => clearTimeout(timer)
    } else {
      setIsAnimating(false)
    }
    return undefined
  }, [visible, duration])

  const handleClose = () => {
    setIsAnimating(false)
    // 애니메이션 완료 후 실제 닫기
    setTimeout(() => {
      onClose()
    }, 300)
  }

  const getIcon = () => {
    switch (type) {
      case 'error':
        return 'exclamationmark.circle.fill'
      case 'warning':
        return 'exclamationmark.triangle.fill'
      case 'info':
        return 'info.circle.fill'
      default:
        return 'exclamationmark.circle.fill'
    }
  }

  if (!visible && !isAnimating) return null

  return (
    <div
      className={`feedback-toast feedback-toast--${type} ${isAnimating ? 'feedback-toast--visible' : ''}`}
      role="alert"
      aria-live="polite"
    >
      <div className="feedback-toast__content">
        <div className="feedback-toast__icon">
          <SFSymbol
            name={getIcon()}
            size={SFSymbolSize.CAPTION_1}
            weight={SFSymbolWeight.MEDIUM}
            decorative={true}
          />
        </div>

        <div className="feedback-toast__message">
          {message.split('\\n').map((line, index) => (
            <div key={index} className="feedback-toast__line">
              {line}
            </div>
          ))}
        </div>

        <button
          className="feedback-toast__close"
          onClick={handleClose}
          aria-label="닫기"
        >
          <SFSymbol
            name="xmark"
            size={SFSymbolSize.CAPTION_1}
            weight={SFSymbolWeight.MEDIUM}
            decorative={true}
          />
        </button>
      </div>
    </div>
  )
}

export default FeedbackToast