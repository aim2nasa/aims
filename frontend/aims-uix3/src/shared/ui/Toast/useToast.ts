/**
 * useToast - Toast Queue 시스템 훅
 * 여러 토스트를 동시에 관리하고 표시합니다.
 */
import { useState, useCallback, useRef } from 'react'

export type ToastType = 'error' | 'warning' | 'info' | 'success'

export interface Toast {
  id: string
  message: string
  type: ToastType
  duration: number
  createdAt: number
}

export interface ToastOptions {
  type?: ToastType
  duration?: number
}

const DEFAULT_DURATION = 5000
const MAX_TOASTS = 5

let toastIdCounter = 0

function generateId(): string {
  return `toast-${Date.now()}-${++toastIdCounter}`
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const dismiss = useCallback((id: string) => {
    // 타이머 정리
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }

    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const show = useCallback((message: string, options: ToastOptions = {}) => {
    const { type = 'info', duration = DEFAULT_DURATION } = options
    const id = generateId()

    const newToast: Toast = {
      id,
      message,
      type,
      duration,
      createdAt: Date.now(),
    }

    setToasts(prev => {
      // 최대 개수 초과 시 가장 오래된 것 제거
      const updated = [...prev, newToast]
      if (updated.length > MAX_TOASTS) {
        const removed = updated.shift()
        if (removed) {
          const timer = timersRef.current.get(removed.id)
          if (timer) {
            clearTimeout(timer)
            timersRef.current.delete(removed.id)
          }
        }
      }
      return updated
    })

    // 자동 dismiss 타이머 설정
    if (duration !== Infinity) {
      const timer = setTimeout(() => {
        dismiss(id)
      }, duration)
      timersRef.current.set(id, timer)
    }

    return id
  }, [dismiss])

  // 편의 메서드들
  const error = useCallback((message: string, duration?: number) => {
    return show(message, { type: 'error', duration })
  }, [show])

  const warning = useCallback((message: string, duration?: number) => {
    return show(message, { type: 'warning', duration })
  }, [show])

  const info = useCallback((message: string, duration?: number) => {
    return show(message, { type: 'info', duration })
  }, [show])

  const success = useCallback((message: string, duration?: number) => {
    return show(message, { type: 'success', duration })
  }, [show])

  // 기존 토스트 메시지 업데이트 (진행률 표시 등에 활용)
  const update = useCallback((id: string, message: string, options?: ToastOptions) => {
    setToasts(prev => prev.map(t => {
      if (t.id !== id) return t
      return {
        ...t,
        message,
        ...(options?.type ? { type: options.type } : {}),
      }
    }))
  }, [])

  const dismissAll = useCallback(() => {
    // 모든 타이머 정리
    timersRef.current.forEach(timer => clearTimeout(timer))
    timersRef.current.clear()
    setToasts([])
  }, [])

  return {
    toasts,
    show,
    update,
    dismiss,
    dismissAll,
    error,
    warning,
    info,
    success,
  }
}

export type UseToastReturn = ReturnType<typeof useToast>
