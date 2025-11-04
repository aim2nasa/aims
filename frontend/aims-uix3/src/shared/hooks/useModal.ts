/**
 * useModal Hook
 * @since 2025-11-04
 * @version 1.0.0
 *
 * 모달 상태 관리를 위한 커스텀 훅
 * - visible 상태 관리
 * - open/close 헬퍼 함수
 * - 선택적 콜백 지원
 */

import { useState, useCallback } from 'react'

export interface UseModalOptions {
  /** 초기 visible 상태 */
  initialVisible?: boolean
  /** 모달 열릴 때 호출되는 콜백 */
  onOpen?: () => void
  /** 모달 닫힐 때 호출되는 콜백 */
  onClose?: () => void
}

export interface UseModalReturn {
  /** 현재 모달 표시 상태 */
  visible: boolean
  /** 모달 열기 */
  open: () => void
  /** 모달 닫기 */
  close: () => void
  /** visible 상태 토글 */
  toggle: () => void
}

/**
 * 모달 상태 관리 훅
 *
 * @example
 * ```tsx
 * const notesModal = useModal({
 *   onClose: () => console.log('Modal closed')
 * })
 *
 * <button onClick={notesModal.open}>열기</button>
 * <Modal visible={notesModal.visible} onClose={notesModal.close}>
 *   내용
 * </Modal>
 * ```
 */
export function useModal(options: UseModalOptions = {}): UseModalReturn {
  const { initialVisible = false, onOpen, onClose } = options
  const [visible, setVisible] = useState(initialVisible)

  const open = useCallback(() => {
    setVisible(true)
    onOpen?.()
  }, [onOpen])

  const close = useCallback(() => {
    setVisible(false)
    onClose?.()
  }, [onClose])

  const toggle = useCallback(() => {
    setVisible((prev) => !prev)
  }, [])

  return {
    visible,
    open,
    close,
    toggle
  }
}
