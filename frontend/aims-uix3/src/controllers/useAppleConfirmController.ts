/**
 * AppleConfirmModal Controller Hook
 * @since 1.0.0
 *
 * 🍎 애플 스타일 확인 모달의 비즈니스 로직을 관리하는 Controller Hook
 * COMPONENT_GUIDE.md와 ARCHITECTURE.md 패턴을 준수합니다.
 */

import { useState, useCallback, useEffect } from 'react'
import { ModalService } from '../services/modalService'

export interface AppleConfirmState {
  isOpen: boolean
  isAnimating: boolean
  shouldRender: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmStyle?: 'primary' | 'destructive'
}

export interface AppleConfirmActions {
  openModal: (params: AppleConfirmParams) => Promise<boolean>
  closeModal: () => void
  handleConfirm: () => void
  handleCancel: () => void
  handleKeyDown: (e: KeyboardEvent) => void
  handleOverlayClick: (e: React.MouseEvent) => void
}

export interface AppleConfirmParams {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmStyle?: 'primary' | 'destructive'
}

/**
 * AppleConfirmModal Controller Hook
 *
 * View와 비즈니스 로직을 완전히 분리하여 Document-Controller-View 패턴을 구현합니다.
 *
 * @returns {object} state와 actions를 포함한 컨트롤러 객체
 */
export const useAppleConfirmController = () => {
  // === STATE ===
  const [state, setState] = useState<AppleConfirmState>({
    isOpen: false,
    isAnimating: false,
    shouldRender: false,
    message: '',
    title: '확인',
    confirmText: '확인',
    cancelText: '취소',
    confirmStyle: 'primary'
  })

  // Promise resolver 저장
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null)

  // === BUSINESS LOGIC ===

  /**
   * 모달을 열고 사용자 응답을 Promise로 반환
   * Service Layer를 통해 파라미터 검증 및 전처리
   */
  const openModal = useCallback(async (params: AppleConfirmParams): Promise<boolean> => {
    return new Promise((resolve) => {
      // Service Layer를 통한 파라미터 검증 및 전처리
      const validatedParams = ModalService.validateParams(params)

      setState(prev => ({
        ...prev,
        ...validatedParams,
        isOpen: true,
        shouldRender: true
      }))

      setResolver(() => resolve)

      // 다음 프레임에서 애니메이션 시작 (Progressive Disclosure)
      requestAnimationFrame(() => {
        setState(prev => ({ ...prev, isAnimating: true }))
      })
    })
  }, [])

  /**
   * 모달을 닫고 애니메이션 처리
   */
  const closeModal = useCallback(() => {
    // 🔒 1단계: 애니메이션 시작 (모달 축소)
    setState(prev => ({ ...prev, isAnimating: false }))

    // 🔒 2단계: 애니메이션 완료 후 완전히 닫기
    const timer = setTimeout(() => {
      setState(prev => ({
        ...prev,
        isOpen: false,
        shouldRender: false
      }))
    }, 350) // 350ms로 여유있게 설정

    return () => clearTimeout(timer)
  }, [])

  /**
   * 확인 버튼 클릭 처리
   */
  const handleConfirm = useCallback(() => {
    if (resolver) {
      resolver(true)
      setResolver(null)
    }
    closeModal()
  }, [resolver, closeModal])

  /**
   * 취소 버튼 클릭 처리
   */
  const handleCancel = useCallback(() => {
    if (resolver) {
      resolver(false)
      setResolver(null)
    }
    closeModal()
  }, [resolver, closeModal])

  /**
   * ESC 키 처리
   */
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel()
    }
  }, [handleCancel])

  /**
   * 오버레이 클릭 처리
   */
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleCancel()
    }
  }, [handleCancel])

  // === SIDE EFFECTS ===

  /**
   * 모달 열릴 때 키보드 이벤트 리스너 및 스크롤 방지
   */
  useEffect(() => {
    if (state.isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [state.isOpen, handleKeyDown])

  /**
   * 🔒 신뢰성: 브라우저 리사이즈 시 모달 상태 보호
   * 모달이 열린 상태에서는 외부 요인으로 인한 상태 변경 방지
   */
  useEffect(() => {
    if (state.isOpen) {
      const handleResize = () => {
        // 🔒 절대 신뢰성: 모달이 열린 상태라면 무조건 보호
        requestAnimationFrame(() => {
          setState(prev => {
            if (prev.isOpen) {
              return {
                ...prev,
                isOpen: true,
                isAnimating: true,
                shouldRender: true
              }
            }
            return prev
          })
        })
      }

      const handleVisibilityChange = () => {
        // 🔒 탭 전환 시에도 모달 상태 유지
        requestAnimationFrame(() => {
          setState(prev => {
            if (prev.isOpen && !document.hidden) {
              return {
                ...prev,
                isOpen: true,
                isAnimating: true,
                shouldRender: true
              }
            }
            return prev
          })
        })
      }

      const handleOrientationChange = () => {
        // 🔒 화면 회전 시에도 모달 상태 유지
        requestAnimationFrame(() => {
          setState(prev => {
            if (prev.isOpen) {
              return {
                ...prev,
                isOpen: true,
                isAnimating: true,
                shouldRender: true
              }
            }
            return prev
          })
        })
      }

      // 🔒 모든 가능한 이벤트에 대한 방어
      window.addEventListener('resize', handleResize, { passive: true })
      window.addEventListener('orientationchange', handleOrientationChange, { passive: true })
      document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true })

      // 🔒 주기적으로 모달 상태 검증 (500ms마다, 더 빠른 복원)
      const stateChecker = setInterval(() => {
        setState(prev => {
          if (prev.isOpen && (!prev.shouldRender)) {
            console.warn('🔒 Critical: shouldRender was false while modal is open! Restoring immediately.')
            return {
              ...prev,
              isOpen: true,
              isAnimating: true,
              shouldRender: true
            }
          }
          if (prev.isOpen && !prev.isAnimating) {
            console.warn('🔒 Modal animation lost, restoring...')
            return {
              ...prev,
              isOpen: true,
              isAnimating: true,
              shouldRender: true
            }
          }
          return prev
        })
      }, 500) // 더 빠른 복원을 위해 500ms로 단축

      return () => {
        window.removeEventListener('resize', handleResize)
        window.removeEventListener('orientationchange', handleOrientationChange)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        clearInterval(stateChecker)
      }
    }

    // 🔒 TypeScript: 모든 경우에 cleanup 함수 반환
    return () => {
      // 모달이 닫힌 상태에서는 아무것도 정리할 필요 없음
    }
  }, [state.isOpen])

  // === RETURN ===
  return {
    // State
    state,

    // Actions
    actions: {
      openModal,
      closeModal,
      handleConfirm,
      handleCancel,
      handleKeyDown,
      handleOverlayClick
    }
  }
}

export default useAppleConfirmController