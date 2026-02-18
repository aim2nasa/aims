/**
 * Modal Core Hooks
 * @since 2025-11-06
 * @version 2.0.0 - 중첩 모달 완벽 지원
 *
 * 모든 모달의 공통 기능을 제공하는 핵심 훅 모음
 *
 * v2.0 해결된 문제 (14개 중첩 모달 패턴 전부 해결):
 * - ESC: 최상위 모달만 닫힘 (기존: 모든 열린 모달 동시 닫힘)
 * - Back button: 연쇄 닫힘 방지 (기존: 자식 닫으면 부모도 연쇄 닫힘)
 * - Body overflow: 참조 카운팅 (기존: 자식 닫으면 body lock 해제)
 */

import { useEffect, useCallback, useRef } from 'react'

// ========================================
// ESC 키: 모달 스택으로 최상위만 응답
// ========================================
const escapeStack: symbol[] = []

/**
 * ESC 키로 모달 닫기 (최상위 모달만)
 *
 * 중첩 모달에서 ESC를 누르면 가장 나중에 열린 모달만 닫힙니다.
 * 각 모달은 스택에 등록되며, 최상위 모달만 ESC 이벤트에 응답합니다.
 *
 * @param enabled - ESC 키 활성화 여부
 * @param onClose - 모달 닫기 핸들러
 */
export const useEscapeKey = (
  enabled: boolean,
  onClose: () => void
) => {
  const idRef = useRef<symbol | null>(null)

  useEffect(() => {
    if (!enabled) return

    const id = Symbol()
    idRef.current = id
    escapeStack.push(id)

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 최상위 모달만 ESC에 반응
        if (escapeStack.length > 0 && escapeStack[escapeStack.length - 1] === id) {
          onClose()
        }
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('keydown', handleEscape)
      const index = escapeStack.indexOf(id)
      if (index !== -1) {
        escapeStack.splice(index, 1)
      }
      idRef.current = null
    }
  }, [enabled, onClose])
}

// ========================================
// Body Overflow: 참조 카운팅으로 중첩 안전
// ========================================
let bodyLockCount = 0
let savedScrollY = 0

/**
 * body overflow 제어 (참조 카운팅)
 *
 * 첫 번째 모달이 열릴 때 body를 잠그고,
 * 마지막 모달이 닫힐 때만 body를 복원합니다.
 * 중첩 모달의 내부 모달이 닫혀도 외부 모달의 body lock을 유지합니다.
 *
 * iOS에서 position: fixed 사용 시 스크롤 위치가 초기화되는
 * 문제를 해결하기 위해 scrollY를 저장/복원합니다.
 *
 * @param visible - 모달 표시 여부
 */
export const useBodyOverflow = (visible: boolean) => {
  const lockedRef = useRef(false)

  useEffect(() => {
    if (visible) {
      bodyLockCount++
      lockedRef.current = true

      if (bodyLockCount === 1) {
        // 첫 번째 모달: 스크롤 위치 저장 & body 잠금
        savedScrollY = window.scrollY
        document.body.style.overflow = 'hidden'
        document.body.style.position = 'fixed'
        document.body.style.top = `-${savedScrollY}px`
        document.body.style.width = '100%'
      }
    }

    return () => {
      if (lockedRef.current) {
        lockedRef.current = false
        bodyLockCount--

        if (bodyLockCount <= 0) {
          bodyLockCount = 0
          // 마지막 모달: body 복원 & 스크롤 위치 복원
          document.body.style.overflow = ''
          document.body.style.position = ''
          document.body.style.top = ''
          document.body.style.width = ''
          window.scrollTo(0, savedScrollY)
        }
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

// ========================================
// Back Button: 전역 핸들러 + 스택으로 연쇄 닫힘 방지
// ========================================
interface BackModalEntry {
  id: symbol
  onClose: () => void
}

const backStack: BackModalEntry[] = []
let popstateHandlerInstalled = false
let popstateIgnoreCount = 0

/**
 * 모달 cleanup에서 history.back() 호출 중인지 확인 + 자동 리셋.
 * App.tsx의 popstate 핸들러가 호출하여 모달 cleanup으로 인한
 * popstate 이벤트를 무시합니다 (뷰 전환 방지).
 */
let _modalCleanupBack = false

export function consumeModalCleanupBack(): boolean {
  if (_modalCleanupBack) {
    _modalCleanupBack = false
    return true
  }
  return false
}

function ensurePopstateHandler() {
  if (popstateHandlerInstalled) return
  popstateHandlerInstalled = true

  window.addEventListener('popstate', () => {
    // 다른 모달의 cleanup에서 history.back()으로 발생한 이벤트는 무시
    if (popstateIgnoreCount > 0) {
      popstateIgnoreCount--
      return
    }

    // 최상위 모달만 닫기
    if (backStack.length > 0) {
      const top = backStack.pop()!
      top.onClose()
    }
  })
}

/**
 * Android 뒤로가기 버튼으로 모달 닫기 (연쇄 닫힘 방지)
 *
 * 전역 popstate 핸들러 + 모달 스택 방식으로 동작:
 * - 뒤로가기 버튼: 최상위 모달만 닫힘
 * - ESC/backdrop으로 닫힘: history.back() 호출하되, 부모 모달에 전파 안됨
 *
 * 동작 원리:
 * 1. 모달 열림 → 스택에 등록 + history.pushState()
 * 2. 뒤로가기 → 전역 핸들러가 스택 최상위 모달 닫기 + 스택에서 제거
 * 3. ESC/backdrop 닫힘 → cleanup에서 popstateIgnoreCount++ 후 history.back()
 *    → 전역 핸들러가 ignore 카운터로 무시 → 부모 모달 영향 없음
 *
 * @param visible - 모달 표시 여부
 * @param onClose - 모달 닫기 핸들러
 */
export const useBackButton = (
  visible: boolean,
  onClose: () => void
) => {
  const entryRef = useRef<BackModalEntry | null>(null)

  // onClose가 변경되면 스택 내 참조도 동기화
  useEffect(() => {
    if (entryRef.current) {
      entryRef.current.onClose = onClose
    }
  }, [onClose])

  useEffect(() => {
    if (!visible) return

    ensurePopstateHandler()

    const entry: BackModalEntry = { id: Symbol(), onClose }
    entryRef.current = entry
    backStack.push(entry)

    history.pushState({ _modal: true }, '')

    return () => {
      const index = backStack.indexOf(entry)
      if (index !== -1) {
        // ESC/backdrop/버튼으로 닫힌 경우 → history 정리 필요
        backStack.splice(index, 1)
        popstateIgnoreCount++
        _modalCleanupBack = true
        history.back()
      }
      // index === -1: 뒤로가기로 닫힌 경우 → 전역 핸들러가 이미 스택에서 제거함
      entryRef.current = null
    }
  }, [visible]) // eslint-disable-line react-hooks/exhaustive-deps
  // onClose는 entryRef를 통해 별도 동기화하므로 deps에서 의도적으로 제외
}
