/**
 * SupportMenu — 원격 지원 요청
 * @since 2.0.0
 *
 * Dana 재설계: Apple HIG 수준
 * - 기술 정보(서버 주소/키) 노출 완전 제거
 * - 첫 사용자: 설치 파일 다운로드 → 자동 설정 → 바로 연결
 * - 기존 사용자: 1클릭 → 포트 열기 → 프로그램 실행 안내
 */

import React, { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol'
import Tooltip from '../../../shared/ui/Tooltip'
import { api } from '@/shared/lib/api'
import './SupportMenu.css'

type PortStatus = 'idle' | 'opening' | 'open' | 'error'
type ModalMode = 'none' | 'first-time' | 'returning'

/** 설치 배치 파일 (서버 설정 자동 적용 + RustDesk 다운로드/실행) */
const INSTALLER_URL = '/public/downloads/AIMS_remote_support.bat'

export const SupportMenu: React.FC = () => {
  const [modalMode, setModalMode] = useState<ModalMode>('none')
  const [portStatus, setPortStatus] = useState<PortStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [downloadStarted, setDownloadStarted] = useState(false)

  const isFirstTime = localStorage.getItem('aims-rustdesk-setup') !== 'done'

  // 모달 ESC 닫기
  useEffect(() => {
    if (modalMode === 'none') return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [modalMode])

  // 원격 지원 요청 (포트 열기)
  const requestSupport = useCallback(async () => {
    setPortStatus('opening')
    setErrorMessage('')
    try {
      const result = await api.post<{ success: boolean }>('/api/rustdesk/support-request')
      if (result.success) {
        setPortStatus('open')
      } else {
        setPortStatus('error')
        setErrorMessage('연결 준비에 실패했습니다. 잠시 후 다시 시도해 주세요.')
      }
    } catch {
      setPortStatus('error')
      setErrorMessage('서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.')
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
    window.open(INSTALLER_URL, '_blank')
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

  const handleRetry = useCallback(() => {
    requestSupport()
  }, [requestSupport])

  return (
    <>
      <Tooltip content="원격 지원 요청" placement="bottom">
        <button
          type="button"
          className="header-support-button"
          onClick={handleClick}
          aria-label="원격 지원 요청"
        >
          <SFSymbol
            name="phone"
            size={SFSymbolSize.BODY}
            weight={SFSymbolWeight.MEDIUM}
            decorative={true}
          />
        </button>
      </Tooltip>

      {modalMode !== 'none' && createPortal(
        <div className="support-overlay" onClick={handleClose} role="dialog" aria-modal="true">
          <div className="support-dialog" onClick={e => e.stopPropagation()}>

            {/* === 첫 사용: 설치 안내 === */}
            {modalMode === 'first-time' && (
              <>
                <div className="support-dialog__hero">
                  <div className="support-dialog__hero-icon">
                    <SFSymbol
                      name="phone"
                      size={SFSymbolSize.TITLE_2}
                      weight={SFSymbolWeight.MEDIUM}
                      decorative={true}
                    />
                  </div>
                  <h2 className="support-dialog__title">원격 지원 준비</h2>
                  <p className="support-dialog__subtitle">
                    처음 한 번만 설치하면, 다음부터 바로 사용할 수 있습니다
                  </p>
                </div>

                <div className="support-dialog__steps">
                  <div className={`support-dialog__step ${downloadStarted ? 'support-dialog__step--done' : ''}`}>
                    <div className="support-dialog__step-indicator">
                      {downloadStarted ? (
                        <SFSymbol name="checkmark" size={SFSymbolSize.FOOTNOTE} weight={SFSymbolWeight.BOLD} decorative={true} />
                      ) : (
                        <span className="support-dialog__step-number">1</span>
                      )}
                    </div>
                    <div className="support-dialog__step-body">
                      <span className="support-dialog__step-label">설치 파일 다운로드</span>
                      {!downloadStarted && (
                        <button
                          type="button"
                          className="support-dialog__action-btn"
                          onClick={handleDownload}
                        >
                          다운로드
                        </button>
                      )}
                      {downloadStarted && (
                        <span className="support-dialog__step-hint">다운로드가 시작되었습니다</span>
                      )}
                    </div>
                  </div>

                  <div className="support-dialog__step">
                    <div className="support-dialog__step-indicator">
                      <span className="support-dialog__step-number">2</span>
                    </div>
                    <div className="support-dialog__step-body">
                      <span className="support-dialog__step-label">다운로드된 파일을 <strong>더블클릭</strong></span>
                      <span className="support-dialog__step-hint">
                        자동으로 설치 및 설정이 완료됩니다
                      </span>
                    </div>
                  </div>
                </div>

                <div className="support-dialog__footer">
                  <button type="button" className="support-dialog__btn support-dialog__btn--ghost" onClick={handleClose}>
                    나중에
                  </button>
                  <button type="button" className="support-dialog__btn support-dialog__btn--primary" onClick={handleSetupDone}>
                    설치 완료
                  </button>
                </div>
              </>
            )}

            {/* === 기존 사용자: 지원 요청 === */}
            {modalMode === 'returning' && (
              <>
                <div className="support-dialog__hero">
                  <div className={`support-dialog__status-ring support-dialog__status-ring--${portStatus}`}>
                    {portStatus === 'opening' && <div className="support-dialog__spinner" />}
                    {portStatus === 'open' && (
                      <SFSymbol name="checkmark" size={SFSymbolSize.TITLE_3} weight={SFSymbolWeight.BOLD} decorative={true} />
                    )}
                    {portStatus === 'error' && (
                      <SFSymbol name="exclamationmark" size={SFSymbolSize.TITLE_3} weight={SFSymbolWeight.BOLD} decorative={true} />
                    )}
                    {portStatus === 'idle' && (
                      <SFSymbol name="phone" size={SFSymbolSize.TITLE_3} weight={SFSymbolWeight.MEDIUM} decorative={true} />
                    )}
                  </div>

                  <h2 className="support-dialog__title">
                    {portStatus === 'opening' && '연결 준비 중'}
                    {portStatus === 'open' && '연결 준비 완료'}
                    {portStatus === 'error' && '연결 실패'}
                    {portStatus === 'idle' && '원격 지원'}
                  </h2>

                  {portStatus === 'opening' && (
                    <p className="support-dialog__subtitle">잠시만 기다려 주세요...</p>
                  )}
                  {portStatus === 'error' && (
                    <p className="support-dialog__subtitle support-dialog__subtitle--error">{errorMessage}</p>
                  )}
                </div>

                {portStatus === 'open' && (
                  <div className="support-dialog__steps">
                    <div className="support-dialog__step">
                      <div className="support-dialog__step-indicator">
                        <span className="support-dialog__step-number">1</span>
                      </div>
                      <div className="support-dialog__step-body">
                        <span className="support-dialog__step-label">
                          바탕화면의 <strong>원격 지원</strong> 프로그램을 실행하세요
                        </span>
                      </div>
                    </div>
                    <div className="support-dialog__step">
                      <div className="support-dialog__step-indicator">
                        <span className="support-dialog__step-number">2</span>
                      </div>
                      <div className="support-dialog__step-body">
                        <span className="support-dialog__step-label">
                          화면에 보이는 <strong>숫자(ID)</strong>를 관리자에게 알려주세요
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {portStatus === 'open' && (
                  <p className="support-dialog__footnote">
                    10분 내 연결이 없으면 자동으로 종료됩니다
                  </p>
                )}

                <div className="support-dialog__footer">
                  {portStatus === 'error' && (
                    <button type="button" className="support-dialog__btn support-dialog__btn--ghost" onClick={handleRetry}>
                      다시 시도
                    </button>
                  )}
                  <button
                    type="button"
                    className="support-dialog__link-btn"
                    onClick={handleNeedSetup}
                  >
                    프로그램을 아직 설치하지 않으셨나요?
                  </button>
                  <div className="support-dialog__footer-spacer" />
                  <button type="button" className="support-dialog__btn support-dialog__btn--primary" onClick={handleClose}>
                    확인
                  </button>
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
