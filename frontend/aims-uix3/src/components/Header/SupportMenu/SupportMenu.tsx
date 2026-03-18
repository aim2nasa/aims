/**
 * SupportMenu — 원격 지원 v5
 * 설계사 UX 최적화: 기술 용어 제거, 단계 최소화, 한글 VBS Blob
 */

import React, { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Tooltip from '../../../shared/ui/Tooltip'
import { api } from '@/shared/lib/api'
import './SupportMenu.css'

type PortStatus = 'idle' | 'opening' | 'open' | 'error'
type ModalMode = 'none' | 'setup' | 'connect'

/** RustDesk exe 직접 다운로드 (서버 호스팅) */
const RUSTDESK_EXE_URL = '/public/downloads/rustdesk-1.4.6-x86_64.exe'

/** VBS를 UTF-16LE Blob으로 생성 (한글 정상 출력) */
function downloadConfigVbs() {
  const vbs = [
    "' AIMS Remote Support Config",
    'On Error Resume Next',
    'Set WshShell = CreateObject("WScript.Shell")',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    '',
    'configDir = WshShell.ExpandEnvironmentStrings("%APPDATA%\\RustDesk\\config")',
    'rustdeskExe = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%\\RustDesk\\rustdesk.exe")',
    '',
    'If Not fso.FolderExists(WshShell.ExpandEnvironmentStrings("%APPDATA%\\RustDesk")) Then',
    '    fso.CreateFolder WshShell.ExpandEnvironmentStrings("%APPDATA%\\RustDesk")',
    'End If',
    'If Not fso.FolderExists(configDir) Then',
    '    fso.CreateFolder configDir',
    'End If',
    '',
    'Set f = fso.CreateTextFile(configDir & "\\RustDesk2.toml", True)',
    "f.WriteLine \"rendezvous_server = 'tars.giize.com:21116'\"",
    'f.WriteLine "nat_type = 1"',
    'f.WriteLine "serial = 0"',
    "f.WriteLine \"unlock_pin = ''\"",
    "f.WriteLine \"trusted_devices = ''\"",
    'f.WriteLine ""',
    'f.WriteLine "[options]"',
    "f.WriteLine \"custom-rendezvous-server = 'tars.giize.com'\"",
    "f.WriteLine \"relay-server = 'tars.giize.com'\"",
    "f.WriteLine \"key = 'w3ikDgCswFKYkOz4dNUk96cYy6uK2rrUWsu8EVP55O0='\"",
    'f.Close',
    '',
    'If fso.FileExists(rustdeskExe) Then',
    '    WshShell.Run """" & rustdeskExe & """", 1, False',
    'Else',
    '    MsgBox "\uC6D0\uACA9 \uC9C0\uC6D0 \uD504\uB85C\uADF8\uB7A8\uC774 \uC124\uCE58\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." & vbCrLf & vbCrLf & "AIMS \uC6D0\uACA9 \uC9C0\uC6D0 \uBA54\uB274\uC5D0\uC11C" & vbCrLf & "\uD504\uB85C\uADF8\uB7A8\uC744 \uBA3C\uC800 \uC124\uCE58\uD574 \uC8FC\uC138\uC694.", vbExclamation, "AIMS"',
    'End If',
  ].join('\r\n')

  const bom = new Uint8Array([0xFF, 0xFE])
  const codeUnits = new Uint16Array(vbs.length)
  for (let i = 0; i < vbs.length; i++) codeUnits[i] = vbs.charCodeAt(i)
  const blob = new Blob([bom, new Uint8Array(codeUnits.buffer)], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'AIMS_\uC6D0\uACA9\uC9C0\uC6D0.vbs'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** 헤드셋 아이콘 */
const HeadsetIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z"/>
  </svg>
)

const CheckIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
  </svg>
)

export const SupportMenu: React.FC = () => {
  const [modalMode, setModalMode] = useState<ModalMode>('none')
  const [portStatus, setPortStatus] = useState<PortStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [step, setStep] = useState(0) // 0: 초기, 1: exe 다운로드됨, 2: 설정 완료

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
        downloadConfigVbs()
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
      setStep(0)
      setModalMode('setup')
    } else {
      setModalMode('connect')
      requestSupport()
    }
  }, [isFirstTime, requestSupport])

  const handleClose = useCallback(() => {
    setModalMode('none')
    setPortStatus('idle')
    setErrorMessage('')
    setStep(0)
  }, [])

  /** Step 1: exe 다운로드 */
  const handleDownloadExe = useCallback(() => {
    const a = document.createElement('a')
    a.href = RUSTDESK_EXE_URL
    a.download = 'AIMS_원격지원_설치.exe'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setStep(1)
  }, [])

  /** Step 2: 설치 확인 → 설정 VBS 자동 다운로드 */
  const handleInstallDone = useCallback(() => {
    downloadConfigVbs()
    setStep(2)
  }, [])

  /** Step 3: 모든 설정 완료 */
  const handleSetupComplete = useCallback(() => {
    localStorage.setItem('aims-rustdesk-setup', 'done')
    setModalMode('connect')
    requestSupport()
  }, [requestSupport])

  const handleNeedSetup = useCallback(() => {
    setStep(0)
    setModalMode('setup')
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

            <button type="button" className="sp-close" onClick={handleClose} aria-label="닫기">
              <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>

            {/* ===== 최초 설치 ===== */}
            {modalMode === 'setup' && (
              <>
                <div className="sp-hero">
                  <div className="sp-hero-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z"/></svg>
                  </div>
                  <h2 className="sp-title">원격 지원 준비</h2>
                  <p className="sp-desc">
                    관리자가 화면을 보며 도와드리기 위한<br/>프로그램을 설치합니다
                  </p>
                </div>

                {/* 한 번에 한 가지만 보여줌 (Progressive Disclosure) */}
                <div className="sp-wizard">

                  {/* Step 1: 프로그램 다운로드 */}
                  {step === 0 && (
                    <div className="sp-card">
                      <div className="sp-card-step">1 / 3</div>
                      <p className="sp-card-title">프로그램 다운로드</p>
                      <p className="sp-card-desc">아래 버튼을 누르면 설치 파일이 받아집니다</p>
                      <button type="button" className="sp-card-btn sp-card-btn--primary" onClick={handleDownloadExe}>
                        다운로드
                      </button>
                    </div>
                  )}

                  {/* Step 2: 설치 확인 */}
                  {step === 1 && (
                    <div className="sp-card">
                      <div className="sp-card-step">2 / 3</div>
                      <p className="sp-card-title">프로그램 설치</p>
                      <p className="sp-card-desc">
                        받은 파일을 <strong>더블클릭</strong>해서 설치하세요.<br/>
                        설치가 끝나면 아래 버튼을 눌러주세요.
                      </p>
                      <p className="sp-card-note">
                        보안 알림이 나타나면 <strong>"설치"</strong> 또는 <strong>"실행"</strong>을 눌러주세요
                      </p>
                      <button type="button" className="sp-card-btn sp-card-btn--primary" onClick={handleInstallDone}>
                        설치했습니다
                      </button>
                      <div className="sp-card-nav">
                        <button type="button" className="sp-card-btn--ghost" onClick={() => setStep(0)}>← 이전</button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: 설정 완료 */}
                  {step === 2 && (
                    <div className="sp-card sp-card--done">
                      <div className="sp-card-check"><CheckIcon /></div>
                      <p className="sp-card-title">설정 완료</p>
                      <p className="sp-card-desc">
                        받은 파일(<strong>AIMS_원격지원</strong>)을 <strong>더블클릭</strong>하면<br/>
                        원격 지원이 바로 시작됩니다.
                      </p>
                      <p className="sp-card-note">
                        보안 알림이 나타나면 <strong>"실행"</strong>을 눌러주세요
                      </p>
                      <button type="button" className="sp-card-btn sp-card-btn--primary" onClick={handleSetupComplete}>
                        원격 지원 시작
                      </button>
                    </div>
                  )}

                  {/* 진행 표시 */}
                  <div className="sp-progress">
                    <div className={`sp-dot ${step >= 0 ? 'sp-dot--active' : ''}`} />
                    <div className={`sp-dot ${step >= 1 ? 'sp-dot--active' : ''}`} />
                    <div className={`sp-dot ${step >= 2 ? 'sp-dot--active' : ''}`} />
                  </div>
                </div>

                <button type="button" className="sp-dismiss" onClick={handleClose}>나중에 할게요</button>
              </>
            )}

            {/* ===== 원격 지원 연결 ===== */}
            {modalMode === 'connect' && (
              <>
                <div className="sp-hero">
                  <div className={`sp-status sp-status--${portStatus}`}>
                    {portStatus === 'opening' && <div className="sp-spinner" />}
                    {portStatus === 'open' && <CheckIcon />}
                    {portStatus === 'error' && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                    )}
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
                  <div className="sp-guide">
                    <div className="sp-guide-arrow">↓</div>
                    <p className="sp-guide-main">
                      화면 하단에 받아진 파일을 <strong>클릭</strong>하면<br/>원격 지원이 시작됩니다
                    </p>
                    <p className="sp-guide-sub">
                      실행 후 화면의 <strong>접속 번호</strong>를 관리자에게 알려주세요
                    </p>
                  </div>
                )}

                {portStatus === 'error' && (
                  <div className="sp-actions">
                    <button type="button" className="sp-card-btn sp-card-btn--primary" onClick={() => requestSupport()}>다시 시도</button>
                  </div>
                )}

                <div className="sp-footer">
                  <button type="button" className="sp-link" onClick={handleNeedSetup}>
                    프로그램을 아직 설치하지 않으셨나요?
                  </button>
                  <button type="button" className="sp-card-btn sp-card-btn--primary sp-footer-btn" onClick={handleClose}>
                    {portStatus === 'open' ? '알겠습니다' : '닫기'}
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
