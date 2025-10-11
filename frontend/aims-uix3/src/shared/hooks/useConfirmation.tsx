/**
 * Confirmation Dialog Hook
 * @since 1.0.0
 *
 * Apple-style 확인 다이얼로그 관리 Hook
 * - 간편한 상태 관리
 * - Promise 기반 API
 * - 타입 안전성 보장
 */

import { useState, useCallback } from 'react'

export interface ConfirmationOptions {
  /** 다이얼로그 제목 */
  title: string
  /** 확인 메시지 */
  message: string
  /** 확인 버튼 텍스트 (기본: "확인") */
  confirmText?: string
  /** 취소 버튼 텍스트 (기본: "취소") */
  cancelText?: string
  /** 위험한 액션 여부 (빨간 버튼) */
  destructive?: boolean
}

export interface ConfirmationState {
  /** 다이얼로그 표시 여부 */
  open: boolean
  /** 다이얼로그 옵션 */
  options: ConfirmationOptions | null
  /** Promise resolver */
  resolver: ((confirmed: boolean) => void) | null
}

/**
 * 확인 다이얼로그 관리 Hook
 *
 * @example
 * ```tsx
 * const { confirmationState, showConfirmation, ConfirmationDialog } = useConfirmation()
 *
 * const handleDelete = async (customer: Customer) => {
 *   const confirmed = await showConfirmation({
 *     title: '고객 삭제',
 *     message: `${customer.name} 고객을 삭제하시겠습니까?`,
 *     destructive: true
 *   })
 *
 *   if (confirmed) {
 *     deleteCustomer(customer._id)
 *   }
 * }
 *
 * return (
 *   <>
 *     <button onClick={() => handleDelete(customer)}>삭제</button>
 *     <ConfirmationDialog />
 *   </>
 * )
 * ```
 */
const INITIAL_STATE: ConfirmationState = {
  open: false,
  options: null,
  resolver: null
}

export const useConfirmation = () => {
  const [state, setState] = useState<ConfirmationState>(INITIAL_STATE)

  const resolveAndReset = useCallback((confirmed: boolean) => {
    setState((prev) => {
      prev.resolver?.(confirmed)
      return INITIAL_STATE
    })
  }, [])

  /**
   * 확인 다이얼로그 표시
   *
   * @param options 다이얼로그 옵션
   * @returns 사용자 선택 결과 (true: 확인, false: 취소)
   */
  const showConfirmation = useCallback((options: ConfirmationOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        open: true,
        options,
        resolver: resolve
      })
    })
  }, [])

  /**
   * 확인 버튼 클릭 핸들러
   */
  const handleConfirm = useCallback(() => {
    resolveAndReset(true)
  }, [resolveAndReset])

  /**
   * 취소 버튼 클릭 핸들러
   */
  const handleCancel = useCallback(() => {
    resolveAndReset(false)
  }, [resolveAndReset])

  /**
   * 다이얼로그 닫기 핸들러
   */
  const handleClose = useCallback(() => {
    resolveAndReset(false)
  }, [resolveAndReset])

  return {
    /** 현재 확인 다이얼로그 상태 */
    confirmationState: state,
    /** 확인 다이얼로그 표시 함수 */
    showConfirmation,
    /** 확인 핸들러 */
    handleConfirm,
    /** 취소 핸들러 */
    handleCancel,
    /** 닫기 핸들러 */
    handleClose
  }
}

export default useConfirmation
