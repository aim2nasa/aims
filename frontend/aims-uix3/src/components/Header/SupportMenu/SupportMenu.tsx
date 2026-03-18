/**
 * SupportMenu — 원격 지원 v11
 * SFX exe 다운로드 + 텍스트 안내 모달 (이미지 없음)
 */

import React, { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Tooltip from '../../../shared/ui/Tooltip'
import './SupportMenu.css'

const SFX_EXE_URL = '/public/downloads/AIMS_remote_support.exe'

const HeadsetIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z"/>
  </svg>
)

function downloadSfxExe() {
  const a = document.createElement('a')
  a.href = SFX_EXE_URL
  a.download = 'AIMS_원격지원.exe'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export const SupportMenu: React.FC = () => {
  const [open, setOpen] = useState(false)

  const handleClose = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [open, handleClose])

  const handleClick = useCallback(() => {
    downloadSfxExe()
    setOpen(true)
  }, [])

  return (
    <>
      <Tooltip content="원격 지원" placement="bottom">
        <button type="button" className="header-support-button" onClick={handleClick} aria-label="원격 지원 요청">
          <HeadsetIcon />
        </button>
      </Tooltip>

      {open && createPortal(
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
              <p className="sp-msg sp-msg--highlight">
                원격 지원 프로그램을 다운로드하고 있습니다.
              </p>
              <p className="sp-msg">
                다운로드가 완료되면 <strong>AIMS_원격지원.exe</strong>를 실행하시고<br/>
                프로그램에 표시된 <strong>ID</strong>를 관리자에게 알려주세요
              </p>
              <div className="sp-id-example">
                <span className="sp-id-label">예시)</span>
                <span className="sp-id-number">1 726 767 383</span>
                <span className="sp-id-arrow">← 이런 숫자</span>
              </div>
              <p className="sp-msg sp-msg--muted">
                관리자가 연결할 때까지 잠시 기다려주세요
              </p>
            </div>

          </div>
        </div>,
        document.body
      )}
    </>
  )
}

export default SupportMenu
