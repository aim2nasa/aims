/**
 * SupportMenu — 원격 지원 v7
 *
 * 최초 사용자: 3단계 위자드 (다운로드 → 설치 → 완료 안내)
 * 재방문 사용자: 안내 모달 (다운로드 없음, "RustDesk 실행 → 접속 번호 알려주세요")
 */

import React, { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Tooltip from '../../../shared/ui/Tooltip'
import './SupportMenu.css'

/** RustDesk exe 직접 다운로드 (서버 호스팅) */
const RUSTDESK_EXE_URL = '/public/downloads/rustdesk-1.4.6-x86_64.exe'

/** VBS를 UTF-16LE Blob으로 생성 (최초 설치 시 1회만 사용) */
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

type ModalMode = 'none' | 'setup' | 'guide'

export const SupportMenu: React.FC = () => {
  const [modalMode, setModalMode] = useState<ModalMode>('none')
  const [step, setStep] = useState(0)

  const isFirstTime = localStorage.getItem('aims-rustdesk-setup') !== 'done'

  const handleClose = useCallback(() => {
    setModalMode('none')
    setStep(0)
  }, [])

  useEffect(() => {
    if (modalMode === 'none') return
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [modalMode, handleClose])

  const handleClick = useCallback(() => {
    if (isFirstTime) {
      setStep(0)
      setModalMode('setup')
    } else {
      // 재방문: 안내 모달만 (다운로드 없음)
      setModalMode('guide')
    }
  }, [isFirstTime])

  const handleDownloadExe = useCallback(() => {
    const a = document.createElement('a')
    a.href = RUSTDESK_EXE_URL
    a.download = 'AIMS_원격지원_설치.exe'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setStep(1)
  }, [])

  const handleInstallDone = useCallback(() => {
    downloadConfigVbs()
    setStep(2)
  }, [])

  const handleSetupComplete = useCallback(() => {
    localStorage.setItem('aims-rustdesk-setup', 'done')
    handleClose()
  }, [handleClose])

  /** guide 모드에서 "프로그램 다시 설치하기" */
  const handleReinstall = useCallback(() => {
    localStorage.removeItem('aims-rustdesk-setup')
    setStep(0)
    setModalMode('setup')
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

            {/* ===== 최초 설치 위자드 ===== */}
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

                <div className="sp-wizard">
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

                  {step === 2 && (
                    <div className="sp-card sp-card--done">
                      <div className="sp-card-check"><CheckIcon /></div>
                      <p className="sp-card-title">준비 완료</p>
                      <p className="sp-card-desc">
                        다음부터는 헤드셋 버튼만 누르면<br/>
                        바로 안내가 표시됩니다.
                      </p>
                      <p className="sp-card-note">
                        지금 바로 시작하려면 다운로드된<br/>
                        <strong>AIMS_원격지원</strong> 파일을 더블클릭하세요
                      </p>
                      <button type="button" className="sp-card-btn sp-card-btn--primary" onClick={handleSetupComplete}>
                        확인
                      </button>
                    </div>
                  )}

                  <div className="sp-progress">
                    <div className={`sp-dot ${step >= 0 ? 'sp-dot--active' : ''}`} />
                    <div className={`sp-dot ${step >= 1 ? 'sp-dot--active' : ''}`} />
                    <div className={`sp-dot ${step >= 2 ? 'sp-dot--active' : ''}`} />
                  </div>
                </div>

                <button type="button" className="sp-dismiss" onClick={handleClose}>나중에 할게요</button>
              </>
            )}

            {/* ===== 재방문 안내 (다운로드 없음) ===== */}
            {modalMode === 'guide' && (
              <>
                <div className="sp-hero">
                  <div className="sp-hero-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z"/></svg>
                  </div>
                  <h2 className="sp-title">원격 지원 연결하기</h2>
                </div>

                <div className="sp-guide-steps">
                  <div className="sp-guide-item">
                    <span className="sp-guide-num">1</span>
                    <p className="sp-guide-text">
                      바탕화면의 <strong>RustDesk</strong>를<br/>더블클릭하세요
                    </p>
                  </div>
                  <div className="sp-guide-item">
                    <span className="sp-guide-num">2</span>
                    <p className="sp-guide-text">
                      프로그램에 표시된 <strong>숫자</strong>를<br/>관리자에게 알려주세요
                    </p>
                  </div>
                </div>

                <div className="sp-guide-footer">
                  <button type="button" className="sp-card-btn sp-card-btn--primary sp-guide-ok" onClick={handleClose}>
                    확인
                  </button>
                  <button type="button" className="sp-reinstall" onClick={handleReinstall}>
                    프로그램이 안 보이나요? 다시 설치하기
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
