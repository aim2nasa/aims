/**
 * SupportMenu — 원격 지원 v13 (설치형)
 * 최초: 인스톨러 다운로드 → 설치
 * 이후: URI Scheme(aims-rs://)으로 RustDesk 즉시 실행
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import Tooltip from '../../../shared/ui/Tooltip'
import { api } from '../../../shared/lib/api'
import './SupportMenu.css'

const STORAGE_KEY = 'aims-rustdesk-installed'

function detectPlatform() {
  const ua = navigator.userAgent
  if (/windows/i.test(ua)) return { isWindows: true, name: 'Windows' }
  if (/iPhone|iPod/i.test(ua)) return { isWindows: false, name: 'iPhone' }
  if (/iPad/i.test(ua)) return { isWindows: false, name: 'iPad' }
  if (/Android/i.test(ua)) return { isWindows: false, name: 'Android' }
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return { isWindows: false, name: 'iPad' }
  if (/Macintosh|Mac OS/i.test(ua)) return { isWindows: false, name: 'Mac' }
  if (/Linux/i.test(ua)) return { isWindows: false, name: 'Linux' }
  return { isWindows: false, name: '이 기기' }
}

const HeadsetIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z"/>
  </svg>
)

/** 인스톨러 다운로드 */
function downloadInstaller() {
  const a = document.createElement('a')
  a.href = '/api/rustdesk/download-installer'
  a.download = ''
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

type ModalState =
  | { type: 'none' }
  | { type: 'install' }        // 인스톨러 다운로드 안내
  | { type: 'running' }        // RustDesk 실행 완료 → ID 안내
  | { type: 'unsupported' }    // 비-Windows 플랫폼
  | { type: 'error'; message: string }

export const SupportMenu: React.FC = () => {
  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const [loading, setLoading] = useState(false)
  const platform = useMemo(() => detectPlatform(), [])

  const handleClose = useCallback(() => {
    setModal({ type: 'none' })
  }, [])

  // ESC로 닫기
  useEffect(() => {
    if (modal.type === 'none') return
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [modal.type, handleClose])

  const handleClick = useCallback(async () => {
    if (!platform.isWindows) {
      setModal({ type: 'unsupported' })
      return
    }
    if (loading) return
    setLoading(true)

    try {
      const isInstalled = localStorage.getItem(STORAGE_KEY) === 'true'

      if (isInstalled) {
        // 설치됨 → API로 포트 열기 + URI Scheme 실행
        const result = await api.post<{ success: boolean; error?: string }>('/api/rustdesk/support-request')
        if (!result.success) {
          setModal({ type: 'error', message: result.error || '원격 지원 준비에 실패했습니다' })
          return
        }

        // URI Scheme으로 RustDesk 실행
        window.location.href = 'aims-rs://start'

        // blur 감지: 앱이 포커스를 가져가면 성공
        await new Promise<void>((resolve) => {
          const failTimer = setTimeout(() => {
            window.removeEventListener('blur', onBlur)
            // 3초 내 blur 없음 → 삭제된 것으로 판단 → 인스톨러 재다운로드
            localStorage.removeItem(STORAGE_KEY)
            downloadInstaller()
            setModal({ type: 'install' })
            resolve()
          }, 3000)

          const onBlur = () => {
            clearTimeout(failTimer)
            window.removeEventListener('blur', onBlur)
            // 성공 → ID 안내 모달
            setModal({ type: 'running' })
            resolve()
          }
          window.addEventListener('blur', onBlur)
        })
      } else {
        // 미설치 → 인스톨러 다운로드
        downloadInstaller()
        localStorage.setItem(STORAGE_KEY, 'true')
        setModal({ type: 'install' })
      }
    } catch {
      setModal({ type: 'error', message: '서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요' })
    } finally {
      setLoading(false)
    }
  }, [loading, platform])

  const isOpen = modal.type !== 'none'

  return (
    <>
      <Tooltip content="원격 지원" placement="bottom">
        <button type="button" className="header-support-button" onClick={handleClick} aria-label="원격 지원 요청">
          <HeadsetIcon />
        </button>
      </Tooltip>

      {isOpen && createPortal(
        <div className="sp-overlay" onClick={handleClose}>
          <div className="sp-modal" onClick={e => e.stopPropagation()}>

            <button type="button" className="sp-close" onClick={handleClose} aria-label="닫기">
              <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>

            <div className="sp-hero">
              <div className="sp-hero-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z"/></svg>
              </div>
            </div>

            <div className="sp-body">
              {modal.type === 'unsupported' && (
                <>
                  <p className="sp-msg sp-msg--error">
                    Windows에서만 지원되는 기능입니다
                  </p>
                  <p className="sp-msg sp-msg--muted">
                    {platform.name}에서는 사용할 수 없습니다.
                    <br />Windows PC에서 이용해주세요.
                  </p>
                </>
              )}

              {modal.type === 'error' && (
                <p className="sp-msg sp-msg--error">{modal.message}</p>
              )}

              {modal.type === 'install' && (
                <>
                  <p className="sp-msg sp-msg--highlight">
                    원격 지원 프로그램을 다운로드하고 있습니다
                  </p>
                  <p className="sp-msg">
                    다운로드된 <strong>AIMS_RustDesk_Setup.exe</strong>를 실행하여 설치해주세요
                  </p>
                  <p className="sp-msg sp-msg--muted">
                    설치는 최초 1회만 필요합니다. 이후에는 바로 실행됩니다
                  </p>
                </>
              )}

              {modal.type === 'running' && (
                <>
                  <p className="sp-msg sp-msg--highlight">
                    원격 지원 프로그램이 실행되었습니다
                  </p>
                  <p className="sp-msg">
                    프로그램에 표시된 <strong>ID</strong>를 관리자에게 알려주세요
                  </p>
                  <div className="sp-id-example">
                    <span className="sp-id-label">예시)</span>
                    <span className="sp-id-number">1 726 767 383</span>
                    <span className="sp-id-arrow">&larr; 이런 숫자</span>
                  </div>
                  <p className="sp-msg sp-msg--muted">
                    관리자가 연결할 때까지 잠시 기다려주세요
                  </p>
                </>
              )}
            </div>

          </div>
        </div>,
        document.body
      )}
    </>
  )
}

export default SupportMenu
