import { useState, useCallback, useEffect, useMemo } from 'react'
import CenterPaneView from '../CenterPaneView/CenterPaneView'
import { api } from '@/shared/lib/api'
import './AutoClickerView.css'

interface AutoClickerViewProps {
  visible: boolean
  onClose: () => void
}

interface VersionInfo {
  latest: string
  installerUrl: string
  releaseNotes: string
}

/** 현재 기기의 OS 판별 (AutoClicker는 Windows 전용) */
const detectPlatform = () => {
  const ua = navigator.userAgent
  if (/windows/i.test(ua)) return { isWindows: true, name: 'Windows' }
  if (/iPhone|iPod/i.test(ua)) return { isWindows: false, name: 'iPhone' }
  if (/iPad/i.test(ua)) return { isWindows: false, name: 'iPad' }
  if (/Android/i.test(ua)) return { isWindows: false, name: 'Android' }
  // iPadOS 13+ reports as Macintosh — touch 지원 여부로 구분
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return { isWindows: false, name: 'iPad' }
  if (/Macintosh|Mac OS/i.test(ua)) return { isWindows: false, name: 'Mac' }
  if (/Linux/i.test(ua)) return { isWindows: false, name: 'Linux' }
  return { isWindows: false, name: '이 기기' }
}

const AutoClickerView = ({ visible, onClose }: AutoClickerViewProps) => {
  const [launching, setLaunching] = useState(false)
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)
  const [downloadHint, setDownloadHint] = useState(false)
  const [showUnsupported, setShowUnsupported] = useState(false)

  const platform = useMemo(() => detectPlatform(), [])

  // 인스톨러 완료 후 열린 페이지에서 설치 확인 플래그 설정
  // (installer.iss [Run] → aims.giize.com/?view=autoclicker&ac_installed=1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('ac_installed') === '1') {
      localStorage.setItem('ac-installed', 'true')
      params.delete('ac_installed')
      const cleanSearch = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (cleanSearch ? '?' + cleanSearch : ''))
    }
  }, [])

  // 버전 정보 로드
  useEffect(() => {
    if (!visible) return
    api.get<{ success: boolean } & VersionInfo>('/api/ac/latest-version')
      .then(res => {
        if (res.success) {
          setVersionInfo({ latest: res.latest, installerUrl: res.installerUrl, releaseNotes: res.releaseNotes })
        }
      })
      .catch(() => { /* 실패해도 무시 */ })
  }, [visible])

  const downloadInstaller = useCallback(() => {
    if (versionInfo?.installerUrl) {
      const a = document.createElement('a')
      a.href = versionInfo.installerUrl
      a.download = ''
      a.click()
    }
  }, [versionInfo])

  // AC 실행
  // - 비 Windows → 미지원 메시지
  // - 설치 기록 있음 → URI Scheme으로 앱 실행 (blur 감지로 성공 판단)
  // - 설치 기록 없음 → 인스톨러 다운로드 (인스톨러가 AC 자동 실행)
  // - URI Scheme 실패 (삭제됨) → 인스톨러 재다운로드
  const handleLaunch = useCallback(async () => {
    if (!platform.isWindows) {
      setShowUnsupported(true)
      return
    }
    if (launching) return
    setLaunching(true)
    try {
      const acInstalled = localStorage.getItem('ac-installed') === 'true'

      if (acInstalled) {
        // URI Scheme으로 앱 실행 시도
        const response = await api.post<{ success: boolean; token: string; expiresIn: number }>(
          '/api/ac/request-token'
        )
        if (!response.success || !response.token) {
          alert('토큰 발급에 실패했습니다.')
          return
        }

        window.location.href = `aims-ac://start?token=${response.token}&auto_start=false`

        // blur 감지: 앱이 포커스를 가져가면 성공
        await new Promise<void>((resolve) => {
          const failTimer = setTimeout(() => {
            window.removeEventListener('blur', onBlur)
            // 3초 내 blur 없음 → 삭제된 것으로 판단 → 인스톨러 재다운로드
            localStorage.removeItem('ac-installed')
            downloadInstaller()
            resolve()
          }, 3000)

          const onBlur = () => {
            clearTimeout(failTimer)
            window.removeEventListener('blur', onBlur)
            resolve()
          }
          window.addEventListener('blur', onBlur)
        })
      } else {
        // 미설치 → 인스톨러 다운로드 (인스톨러 완료 시 AC 자동 실행됨)
        downloadInstaller()
        localStorage.setItem('ac-installed', 'true')
        setDownloadHint(true)
        setTimeout(() => setDownloadHint(false), 10000)
      }
    } catch {
      alert('AutoClicker 실행에 실패했습니다. 다시 시도하세요.')
    } finally {
      setLaunching(false)
    }
  }, [launching, downloadInstaller, platform])

  return (
    <CenterPaneView
      visible={visible}
      title="AutoClicker"
      titleIcon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5 2l12 10-5 .5 3 6.5-2 1-3-6.5L5 18V2z"/>
          <circle cx="19" cy="5" r="1.5" opacity="0.5"/>
          <circle cx="21" cy="10" r="1" opacity="0.35"/>
        </svg>
      }
      onClose={onClose}
      marginTop={0}
      marginBottom={0}
      marginLeft={0}
      marginRight={0}
      className="autoclicker-view"
    >
      <div className="autoclicker-view__content">
        {/* 메인 카드 */}
        <div className="autoclicker-view__hero">
          <div className="autoclicker-view__hero-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 2l12 10-5 .5 3 6.5-2 1-3-6.5L5 18V2z"/>
              <circle cx="19" cy="5" r="1.5" opacity="0.5"/>
              <circle cx="21" cy="10" r="1" opacity="0.35"/>
            </svg>
          </div>
          <h2 className="autoclicker-view__hero-title">AutoClicker</h2>
          <p className="autoclicker-view__hero-description">
            사용자를 대신하여 MetLife CRS, AR PDF
            다운로드를 자동화한 도구입니다.
          </p>
          <p className="autoclicker-view__hero-security">
            <svg className="autoclicker-view__lock-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
            작업 결과는 오로지 설계사님 PC에만 저장됩니다.
          </p>

          <button
            type="button"
            className="autoclicker-view__launch-btn"
            onClick={handleLaunch}
            disabled={launching}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 2l12 10-5 .5 3 6.5-2 1-3-6.5L5 18V2z"/>
              <circle cx="19" cy="5" r="1.5" opacity="0.5"/>
              <circle cx="21" cy="10" r="1" opacity="0.35"/>
            </svg>
            {launching ? '실행 중...' : 'AutoClicker 실행'}
          </button>

          {showUnsupported && (
            <div className="autoclicker-view__unsupported">
              <svg className="autoclicker-view__unsupported-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span>
                AutoClicker는 Windows PC 전용입니다.
                <br />{platform.name}에서는 사용할 수 없습니다.
              </span>
            </div>
          )}

          {downloadHint && (
            <p className="autoclicker-view__download-hint">
              다운로드된 설치 파일을 실행하세요. 설치 완료 후 AutoClicker가 자동 시작됩니다.
            </p>
          )}

          {/* 시스템 요구사항 — 카드 하단 */}
          <div className="autoclicker-view__hero-footer">
            <span className="autoclicker-view__hero-footer-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" opacity="0.45">
                <path d="M0 3.5l9.9-1.4v9.5H0zm11.1-1.6L24 0v11.5H11.1zM0 12.7h9.9v9.5L0 20.8zm11.1-.2H24V24l-12.9-1.8z"/>
              </svg>
              Windows 10 / 11
            </span>
            <span className="autoclicker-view__hero-footer-sep">·</span>
            <span className="autoclicker-view__hero-footer-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.45">
                <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              1920 × 1080
            </span>
          </div>
        </div>

        {/* 사용 방법 */}
        <div className="autoclicker-view__guide">
          <h3 className="autoclicker-view__guide-title">사용 방법</h3>
          <div className="autoclicker-view__guide-card">
            <div className="autoclicker-view__step">
              <span className="autoclicker-view__step-number">1</span>
              <p>MetDO 로그인</p>
            </div>
            <div className="autoclicker-view__step">
              <span className="autoclicker-view__step-number">2</span>
              <p>AIMS 로그인하여 "AutoClicker 실행" 클릭 (첫 사용 시 자동 설치)</p>
            </div>
            <div className="autoclicker-view__step">
              <span className="autoclicker-view__step-number">3</span>
              <p>대상 고객 선택 (초성 또는 고객명)</p>
            </div>
            <div className="autoclicker-view__step">
              <span className="autoclicker-view__step-number">4</span>
              <p>완료까지 마우스를 사용하지 않고 대기</p>
            </div>
          </div>
        </div>
      </div>
    </CenterPaneView>
  )
}

export default AutoClickerView
