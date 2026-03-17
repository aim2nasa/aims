/**
 * DevModePasswordModal - 개발자 모드 진입 비밀번호 확인 모달
 *
 * Ctrl+Shift+E 단축키로 개발자 모드 진입 시 비밀번호 인증을 요구.
 * AutoClicker와 동일한 PIN(3007)을 SHA-256 해시로 검증.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { Modal } from '@/shared/ui/Modal/Modal'
import { useDevModeStore } from '@/shared/store/useDevModeStore'
import './DevModePasswordModal.css'

/** SHA-256 of "3007" — AutoClicker _DEV_PIN_HASH와 동일 */
const DEV_PIN_HASH = '7e66b5dd3d158d14ba3300cad5702ee6d72befaec37890eed25c91687bb649df'

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export function DevModePasswordModal() {
  const showPasswordModal = useDevModeStore((s) => s.showPasswordModal)
  const closePasswordModal = useDevModeStore((s) => s.closePasswordModal)
  const setDevMode = useDevModeStore((s) => s.setDevMode)

  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // 모달 열릴 때 입력 필드 포커스
  useEffect(() => {
    if (showPasswordModal) {
      setPin('')
      setError(false)
      const timer = setTimeout(() => inputRef.current?.focus(), 100)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [showPasswordModal])

  const handleConfirm = useCallback(async () => {
    const hash = await sha256(pin)
    if (hash === DEV_PIN_HASH) {
      setDevMode(true)
      closePasswordModal()
    } else {
      setError(true)
      setPin('')
      inputRef.current?.focus()
    }
  }, [pin, setDevMode, closePasswordModal])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirm()
    }
  }, [handleConfirm])

  const handleClose = useCallback(() => {
    closePasswordModal()
  }, [closePasswordModal])

  const inputClassName = `dev-mode-password__input${error ? ' dev-mode-password__input--error' : ''}`

  return (
    <Modal
      visible={showPasswordModal}
      onClose={handleClose}
      title="개발자 모드"
      size="sm"
      variant="alert"
      escapeToClose
      backdropClosable={false}
      useHistory={false}
    >
      <div className="dev-mode-password__body">
        <label className="dev-mode-password__label" htmlFor="dev-mode-pin">
          코드를 입력하세요:
        </label>
        <input
          id="dev-mode-pin"
          ref={inputRef}
          type="password"
          value={pin}
          onChange={(e) => { setPin(e.target.value); setError(false) }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          placeholder="코드 입력"
          className={inputClassName}
        />
        {error && (
          <span className="dev-mode-password__error">
            코드가 올바르지 않습니다.
          </span>
        )}
        <div className="dev-mode-password__actions">
          <button
            type="button"
            onClick={handleClose}
            className="btn btn--ghost btn--sm"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="btn btn--primary btn--sm"
          >
            확인
          </button>
        </div>
      </div>
    </Modal>
  )
}
