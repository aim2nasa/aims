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
    setState(prev => ({ ...prev, isAnimating: false }))

    // 애니메이션 완료 후 DOM에서 제거
    const timer = setTimeout(() => {
      setState(prev => ({
        ...prev,
        isOpen: false,
        shouldRender: false
      }))
    }, 300)

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