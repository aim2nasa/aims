/**
 * AppleConfirmProvider - 전역 확인 모달 Context
 * @since 2025-11-27
 * @version 1.0.0
 *
 * 브라우저 alert() 대신 AppleConfirmModal을 전역에서 사용하기 위한 Provider
 * 기존 useAppleConfirmController + AppleConfirmModal을 재사용합니다.
 */

import React, { createContext, useContext } from 'react'
import { useAppleConfirmController, type AppleConfirmParams } from '../controllers/useAppleConfirmController'
import { AppleConfirmModal } from '../components/DocumentViews/DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal'

/** Context 타입 */
interface AppleConfirmContextType {
  /**
   * alert() 대신 사용하는 함수
   *
   * @example
   * ```tsx
   * const { showAlert } = useAppleConfirm()
   *
   * // 간단한 알림
   * await showAlert({ message: '저장되었습니다.' })
   *
   * // 성공 알림
   * await showAlert({
   *   title: '완료',
   *   message: '153건이 삭제되었습니다.',
   *   iconType: 'success'
   * })
   *
   * // 에러 알림
   * await showAlert({
   *   title: '오류',
   *   message: '삭제 중 오류가 발생했습니다.',
   *   iconType: 'error'
   * })
   * ```
   */
  showAlert: (params: AppleConfirmParams) => Promise<boolean>

  /**
   * 확인/취소 선택이 필요한 경우
   *
   * @example
   * ```tsx
   * const confirmed = await showConfirm({
   *   title: '삭제 확인',
   *   message: '정말 삭제하시겠습니까?',
   *   confirmText: '삭제',
   *   confirmStyle: 'destructive',
   *   showCancel: true
   * })
   * if (confirmed) { ... }
   * ```
   */
  showConfirm: (params: AppleConfirmParams) => Promise<boolean>
}

const AppleConfirmContext = createContext<AppleConfirmContextType | null>(null)

/**
 * AppleConfirmProvider
 *
 * App 최상위에 배치하여 전역에서 showAlert/showConfirm 사용 가능
 */
export const AppleConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const confirmController = useAppleConfirmController()

  /**
   * alert() 대체 - 확인 버튼만 있는 알림
   */
  const showAlert = async (params: AppleConfirmParams): Promise<boolean> => {
    return confirmController.actions.openModal({
      title: '알림',
      confirmText: '확인',
      showCancel: false,
      iconType: 'info',
      ...params
    })
  }

  /**
   * confirm() 대체 - 확인/취소 버튼이 있는 확인
   */
  const showConfirm = async (params: AppleConfirmParams): Promise<boolean> => {
    return confirmController.actions.openModal({
      title: '확인',
      confirmText: '확인',
      cancelText: '취소',
      showCancel: true,
      iconType: 'warning',
      ...params
    })
  }

  return (
    <AppleConfirmContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      <AppleConfirmModal
        state={confirmController.state}
        actions={confirmController.actions}
      />
    </AppleConfirmContext.Provider>
  )
}

/**
 * useAppleConfirm Hook
 *
 * @returns { showAlert, showConfirm }
 *
 * @example
 * ```tsx
 * const { showAlert } = useAppleConfirm()
 *
 * // alert() 대신
 * await showAlert({ message: '저장되었습니다.', iconType: 'success' })
 *
 * // 에러 알림
 * await showAlert({ message: '오류가 발생했습니다.', iconType: 'error' })
 * ```
 */
export const useAppleConfirm = (): AppleConfirmContextType => {
  const context = useContext(AppleConfirmContext)
  if (!context) {
    throw new Error('useAppleConfirm must be used within AppleConfirmProvider')
  }
  return context
}

