/**
 * SupportMenu — 원격 지원 요청 v3
 */

import React, { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Tooltip from '../../../shared/ui/Tooltip'
import { api } from '@/shared/lib/api'
import './SupportMenu.css'

type PortStatus = 'idle' | 'opening' | 'open' | 'error'
type ModalMode = 'none' | 'first-time' | 'returning'

const INSTALLER_URL = '/public/downloads/AIMS_remote_support.bat'

/** 헤드셋 아이콘 (헤더용, 17px 이하) */
const HeadsetIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z"/>
  </svg>
)

export const SupportMenu: React.FC = () => {
  const [modalMode, setModalMode] = useState<ModalMode>('none')
  const [portStatus, setPortStatus] = useState<PortStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [downloadStarted, setDownloadStarted] = useState(false)

  const isFirstTime = localStorage.getItem('aims-rustdesk-setup') !== 'done'

  useEffect(() => {
    if (modalMode === 'none') return
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [modalMode])

  const requestSupport = useCallback(async () => {
    setPortStatus('opening')
    setErrorMessage('')
    try {
      const result = await api.post<{ success: boolean }>('/api/rustdesk/support-request')
      if (result.success) {
        setPortStatus('open')
        // bat 파일 자동 다운로드 → 사용자가 실행하면 RustDesk 시작
        const a = document.createElement('a')
        a.href = INSTALLER_URL
        a.download = 'AIMS_원격지원.bat'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } else {
        setPortStatus('error')
        setErrorMessage('연결 준비에 실패했습니다. 잠시 후 다시 시도해 주세요.')
      }
    } catch {
      setPortStatus('error')
      setErrorMessage('서버에 연결할 수 없습니다.')
    }
  }, [])

  const handleClick = useCallback(() => {
    if (isFirstTime) {
      setModalMode('first-time')
    } else {
      setModalMode('returning')
      requestSupport()
    }
  }, [isFirstTime, requestSupport])

  const handleClose = useCallback(() => {
    setModalMode('none')
    setPortStatus('idle')
    setErrorMessage('')
    setDownloadStarted(false)
  }, [])

  const handleDownload = useCallback(() => {
    const a = document.createElement('a')
    a.href = INSTALLER_URL
    a.download = 'AIMS_원격지원_설치.bat'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setDownloadStarted(true)
  }, [])

  const handleSetupDone = useCallback(() => {
    localStorage.setItem('aims-rustdesk-setup', 'done')
    setModalMode('returning')
    requestSupport()
  }, [requestSupport])

  const handleNeedSetup = useCallback(() => {
    setModalMode('first-time')
    setPortStatus('idle')
  }, [])

  return (
    <>
      <Tooltip content="원격 지원" placement="bottom">
        <button type="button" className="header-support-button" onClick={handleClick} aria-label="원격 지원 요청">
          <HeadsetIcon />
        </button>
      </Tooltip>

      {modalMode !== 'none' && createPortal(
        <div className="sp-overlay" onClick={handleClose}>
          <div className="sp-modal" onClick={e => e.stopPropagation()}>

            {/* 닫기 */}
            <button type="button" className="sp-close" onClick={handleClose} aria-label="닫기">
              <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>

            {/* === 첫 사용 === */}
            {modalMode === 'first-time' && (
              <>
                <div className="sp-hero">
                  <div className="sp-hero-badge">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z"/></svg>
                  </div>
                  <h2 className="sp-title">원격 지원 준비</h2>
                  <p className="sp-desc">한 번만 설치하면 다음부터 바로 사용 가능합니다</p>
                </div>

                <div className="sp-steps">
                  <div className={`sp-step ${downloadStarted ? 'sp-step--done' : ''}`}>
                    <span className="sp-step-n">{downloadStarted ? '✓' : '1'}</span>
                    <span className="sp-step-text">설치 파일 다운로드</span>
                    {!downloadStarted && <button type="button" className="sp-dl" onClick={handleDownload}>다운로드</button>}
                    {downloadStarted && <span className="sp-step-ok">완료</span>}
                  </div>
                  <div className="sp-step">
                    <span className="sp-step-n sp-step-n--sub">2</span>
                    <span className="sp-step-text">다운로드된 파일을 <strong>더블클릭</strong>하면 자동 설치됩니다</span>
                  </div>
                </div>

                <div className="sp-buttons">
                  <button type="button" className="sp-btn sp-btn--outline" onClick={handleClose}>나중에</button>
                  <button type="button" className="sp-btn sp-btn--fill" onClick={handleSetupDone}>설치 완료</button>
                </div>
              </>
            )}

            {/* === 기존 사용자 === */}
            {modalMode === 'returning' && (
              <>
                <div className="sp-hero">
                  <div className={`sp-ring sp-ring--${portStatus}`}>
                    {portStatus === 'opening' && <div className="sp-spinner" />}
                    {portStatus === 'open' && <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>}
                    {portStatus === 'error' && <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>}
                    {portStatus === 'idle' && <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z"/></svg>}
                  </div>
                  <h2 className="sp-title">
                    {portStatus === 'opening' && '연결 준비 중...'}
                    {portStatus === 'open' && '연결 준비 완료'}
                    {portStatus === 'error' && '연결 실패'}
                    {portStatus === 'idle' && '원격 지원'}
                  </h2>
                  {portStatus === 'error' && <p className="sp-desc sp-desc--err">{errorMessage}</p>}
                </div>

                {portStatus === 'open' && (
                  <div className="sp-launch-guide">
                    <div className="sp-launch-arrow">↓</div>
                    <p className="sp-launch-text">화면 하단에 다운로드된 파일을 <strong>클릭</strong>하면<br/>원격 지원이 시작됩니다</p>
                    <p className="sp-launch-sub">실행 후 화면의 <strong>숫자(ID)</strong>를 관리자에게 알려주세요</p>
                  </div>
                )}

                <div className="sp-sub-link">
                  <button type="button" className="sp-link" onClick={handleNeedSetup}>프로그램을 아직 설치하지 않으셨나요?</button>
                </div>

                <div className="sp-buttons">
                  {portStatus === 'error' && <button type="button" className="sp-btn sp-btn--outline" onClick={() => requestSupport()}>다시 시도</button>}
                  {portStatus !== 'error' && <div />}
                  <button type="button" className="sp-btn sp-btn--fill" onClick={handleClose}>확인</button>
                </div>
              </>
            )}

          </div>
        </div>,
        document.body
      )}
    </>
  )
}

export default SupportMenu
