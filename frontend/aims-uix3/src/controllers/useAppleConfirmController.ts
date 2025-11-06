/**
 * AppleConfirmModal Controller Hook
 * @since 1.0.0
 * @version 2.0.0 - Modal 컴포넌트 기반으로 마이그레이션 (Phase 6)
 * @updated 2025-11-06
 *
 * 🍎 애플 스타일 확인 모달의 비즈니스 로직을 관리하는 Controller Hook
 * COMPONENT_GUIDE.md와 ARCHITECTURE.md 패턴을 준수합니다.
 *
 * Modal 컴포넌트가 ESC, body overflow, Portal을 자동 처리합니다.
 */

import { useState, useCallback } from 'react'
import { ModalService } from '../services/modalService'

export interface AppleConfirmState {
  isOpen: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmStyle?: 'primary' | 'destructive'
  showCancel?: boolean
  iconType?: 'success' | 'error' | 'warning' | 'info'
}

export interface AppleConfirmActions {
  openModal: (params: AppleConfirmParams) => Promise<boolean>
  closeModal: () => void
  handleConfirm: () => void
  handleCancel: () => void
}

export interface AppleConfirmParams {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmStyle?: 'primary' | 'destructive'
  showCancel?: boolean
  iconType?: 'success' | 'error' | 'warning' | 'info'
}

/**
 * AppleConfirmModal Controller Hook
 *
 * View와 비즈니스 로직을 완전히 분리하여 Document-Controller-View 패턴을 구현합니다.
 * Modal 컴포넌트가 ESC, body overflow, Portal, 애니메이션을 자동 처리합니다.
 *
 * @returns {object} state와 actions를 포함한 컨트롤러 객체
 */
export const useAppleConfirmController = () => {
  // === STATE ===
  const [state, setState] = useState<AppleConfirmState>({
    isOpen: false,
    message: '',
    title: '확인',
    confirmText: '확인',
    cancelText: '취소',
    confirmStyle: 'primary',
    showCancel: true,
    iconType: 'warning'
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
        isOpen: true
      }))

      setResolver(() => resolve)
    })
  }, [])

  /**
   * 모달 닫기 (Modal 컴포넌트가 애니메이션 자동 처리)
   */
  const closeModal = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: false }))
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

  // === RETURN ===
  return {
    // State
    state,

    // Actions
    actions: {
      openModal,
      closeModal,
      handleConfirm,
      handleCancel
    }
  }
}

export default useAppleConfirmController