/**
 * Modal Core Hooks
 * @since 2025-11-06
 * @version 1.0.0
 *
 * 모든 모달의 공통 기능을 제공하는 핵심 훅 모음
 * - ESC 키로 닫기
 * - body overflow 제어 (iOS 대응)
 * - backdrop 클릭 처리
 *
 * Phase 1: BaseModalCore 훅 생성
 */

import { useEffect, useCallback } from 'react'

/**
 * ESC 키로 모달 닫기
 *
 * @param enabled - ESC 키 활성화 여부
 * @param onClose - 모달 닫기 핸들러
 *
 * @example
 * ```tsx
 * useEscapeKey(true, () => setVisible(false))
 * ```
 */
export const useEscapeKey = (
  enabled: boolean,
  onClose: () => void
) => {
  useEffect(() => {
    if (!enabled) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [enabled, onClose])
}

/**
 * body overflow 제어 (iOS 대응)
 *
 * 모달이 열릴 때 body 스크롤을 방지하고,
 * 닫힐 때 원래 스크롤 위치로 복원합니다.
 *
 * iOS에서 position: fixed 사용 시 스크롤 위치가 초기화되는
 * 문제를 해결하기 위해 top 값을 저장/복원합니다.
 *
 * @param visible - 모달 표시 여부
 *
 * @example
 * ```tsx
 * useBodyOverflow(isOpen)
 * ```
 */
export const useBodyOverflow = (visible: boolean) => {
  useEffect(() => {
    if (visible) {
      // 현재 스크롤 위치 저장 (iOS 대응)
      const scrollY = window.scrollY
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.width = '100%'
    }

    return () => {
      // 스크롤 위치 복원
      const scrollY = document.body.style.top
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''

      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0', 10) * -1)
      }
    }
  }, [visible])
}

/**
 * backdrop 클릭 핸들러
 *
 * backdrop 영역 클릭 시 모달을 닫는 핸들러를 반환합니다.
 * e.target === e.currentTarget 체크로 backdrop 영역만 감지합니다.
 *
 * @param backdropClosable - backdrop 클릭으로 닫기 활성화 여부
 * @param onClose - 모달 닫기 핸들러
 * @returns backdrop 클릭 이벤트 핸들러
 *
 * @example
 * ```tsx
 * const handleBackdropClick = useBackdropClick(true, () => setVisible(false))
 * <div onClick={handleBackdropClick}>...</div>
 * ```
 */
export const useBackdropClick = (
  backdropClosable: boolean,
  onClose: () => void
) => {
  return useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (backdropClosable && e.target === e.currentTarget) {
      onClose()
    }
  }, [backdropClosable, onClose])
}
