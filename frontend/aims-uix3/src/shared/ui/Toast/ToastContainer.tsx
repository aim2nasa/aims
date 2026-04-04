/**
 * ToastContainer - 여러 토스트를 렌더링하는 컨테이너
 */
import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Toast, ToastType } from './useToast'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '@/components/SFSymbol'
import './Toast.css'

interface ToastItemProps {
  toast: Toast
  onDismiss: (id: string) => void
  index: number
}

function ToastItem({ toast, onDismiss, index }: ToastItemProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    // 마운트 시 애니메이션 시작
    requestAnimationFrame(() => {
      setIsVisible(true)
    })
  }, [])

  const handleDismiss = useCallback(() => {
    setIsExiting(true)
    setTimeout(() => {
      onDismiss(toast.id)
    }, 300)
  }, [onDismiss, toast.id])

  const getIcon = (type: ToastType): string => {
    switch (type) {
      case 'error':
        return 'xmark.circle.fill'
      case 'warning':
        return 'exclamationmark.triangle.fill'
      case 'info':
        return 'info.circle.fill'
      case 'success':
        return 'checkmark.circle.fill'
      default:
        return 'info.circle.fill'
    }
  }

  return (
    <div
      className={`toast-item toast-item--${toast.type} ${isVisible && !isExiting ? 'toast-item--visible' : ''} ${isExiting ? 'toast-item--exiting' : ''}`}
      style={{ '--toast-index': index } as React.CSSProperties}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="toast-item__content">
        <div className={`toast-item__icon toast-item__icon--${toast.type}`}>
          <SFSymbol
            name={getIcon(toast.type)}
            size={SFSymbolSize.BODY}
            weight={SFSymbolWeight.MEDIUM}
            decorative={true}
          />
        </div>

        <div className="toast-item__message">
          {toast.message.split('\n').map((line, i) => (
            <div key={i} className="toast-item__line">{line}</div>
          ))}
        </div>

        <button
          className="toast-item__close"
          onClick={handleDismiss}
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

interface ToastContainerProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
  position?: 'top-right' | 'top-center' | 'bottom-right' | 'bottom-center'
}

export function ToastContainer({
  toasts,
  onDismiss,
  position = 'top-right'
}: ToastContainerProps) {
  if (toasts.length === 0) return null

  const content = (
    <div className={`toast-container toast-container--${position}`}>
      {toasts.map((toast, index) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={onDismiss}
          index={index}
        />
      ))}
    </div>
  )

  return createPortal(content, document.body)
}

