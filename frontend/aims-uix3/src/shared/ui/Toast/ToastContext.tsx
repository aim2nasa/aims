/**
 * ToastContext - 전역 Toast 시스템
 * 앱 어디서나 toast.show(), toast.error() 등으로 토스트 표시
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useToast, type UseToastReturn } from './useToast'
import { ToastContainer } from './ToastContainer'

// Context 생성
const ToastContext = createContext<UseToastReturn | null>(null)

interface ToastProviderProps {
  children: ReactNode
  position?: 'top-right' | 'top-center' | 'bottom-right' | 'bottom-center'
}

/**
 * ToastProvider - 앱 최상위에 배치
 *
 * @example
 * ```tsx
 * <ToastProvider position="top-right">
 *   <App />
 * </ToastProvider>
 * ```
 */
export function ToastProvider({ children, position = 'top-right' }: ToastProviderProps) {
  const toast = useToast()

  const value = useMemo(() => toast, [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer
        toasts={toast.toasts}
        onDismiss={toast.dismiss}
        position={position}
      />
    </ToastContext.Provider>
  )
}

/**
 * useToastContext - 전역 Toast 시스템 사용
 *
 * @example
 * ```tsx
 * const toast = useToastContext()
 *
 * // 다양한 방법으로 토스트 표시
 * toast.success('저장되었습니다')
 * toast.error('오류가 발생했습니다')
 * toast.warning('주의가 필요합니다')
 * toast.info('정보를 알려드립니다')
 *
 * // 커스텀 옵션
 * toast.show('메시지', { type: 'info', duration: 10000 })
 *
 * // 개별 토스트 닫기
 * const id = toast.success('저장됨')
 * toast.dismiss(id)
 *
 * // 모든 토스트 닫기
 * toast.dismissAll()
 * ```
 */
export function useToastContext(): UseToastReturn {
  const context = useContext(ToastContext)

  if (!context) {
    throw new Error('useToastContext must be used within a ToastProvider')
  }

  return context
}

