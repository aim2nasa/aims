import { useState, useCallback, useEffect } from 'react'
import CenterPaneView from '../CenterPaneView/CenterPaneView'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../SFSymbol'
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

const AutoClickerView = ({ visible, onClose }: AutoClickerViewProps) => {
  const [launching, setLaunching] = useState(false)
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)

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

  // AC 실행 (토큰 발급 → URI Scheme)
  const handleLaunch = useCallback(async () => {
    if (launching) return
    setLaunching(true)
    try {
      const response = await api.post<{ success: boolean; token: string; expiresIn: number }>(
        '/api/ac/request-token'
      )
      if (response.success && response.token) {
        window.location.href = `aims-ac://start?token=${response.token}`
      } else {
        alert('토큰 발급에 실패했습니다.')
      }
    } catch {
      alert('AutoClicker 토큰 발급에 실패했습니다. 다시 시도하세요.')
    } finally {
      setLaunching(false)
    }
  }, [launching])

  // 인스톨러 다운로드 (새 탭 없이 바로 다운로드)
  const handleDownload = useCallback(() => {
    if (versionInfo?.installerUrl) {
      const a = document.createElement('a')
      a.href = versionInfo.installerUrl
      a.download = ''
      a.click()
    }
  }, [versionInfo])

  return (
    <CenterPaneView
      visible={visible}
      title="AutoClicker"
      titleIcon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5 2l12 10-5 .5 3 6.5-2 1-3-6.5L5 18V2z"/>
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
        {/* 메인 액션 영역 */}
        <div className="autoclicker-view__hero">
          <div className="autoclicker-view__hero-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 2l12 10-5 .5 3 6.5-2 1-3-6.5L5 18V2z"/>
            </svg>
          </div>
          <h2 className="autoclicker-view__hero-title">MetLife 고객 정보 자동수집</h2>
          <p className="autoclicker-view__hero-description">
            MetLife 홈페이지에서 고객 정보를 자동으로 수집합니다.
            AutoClicker가 설치되어 있어야 합니다.
          </p>

          <div className="autoclicker-view__actions">
            <button
              type="button"
              className="autoclicker-view__launch-btn"
              onClick={handleLaunch}
              disabled={launching}
            >
              <SFSymbol name="play-fill" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />
              {launching ? '실행 중...' : 'AutoClicker 실행'}
            </button>
          </div>
        </div>

        {/* 설치 가이드 */}
        <div className="autoclicker-view__section">
          <h3 className="autoclicker-view__section-title">
            <SFSymbol name="arrow-down-circle" size={SFSymbolSize.FOOTNOTE} weight={SFSymbolWeight.MEDIUM} />
            설치
          </h3>
          <div className="autoclicker-view__card">
            <p className="autoclicker-view__card-text">
              AutoClicker가 설치되어 있지 않다면 아래 버튼으로 다운로드하세요.
            </p>
            <button
              type="button"
              className="autoclicker-view__download-btn"
              onClick={handleDownload}
              disabled={!versionInfo?.installerUrl}
            >
              <SFSymbol name="arrow-down-to-line" size={SFSymbolSize.FOOTNOTE} weight={SFSymbolWeight.MEDIUM} />
              {versionInfo?.latest && versionInfo.latest !== '0.0.0'
                ? `설치 프로그램 다운로드 (v${versionInfo.latest})`
                : '설치 프로그램 다운로드'
              }
            </button>
            {!versionInfo?.installerUrl && (
              <p className="autoclicker-view__card-hint">
                설치 프로그램이 아직 준비되지 않았습니다. 관리자에게 문의하세요.
              </p>
            )}
          </div>
        </div>

        {/* 사용 방법 */}
        <div className="autoclicker-view__section">
          <h3 className="autoclicker-view__section-title">
            <SFSymbol name="list-number" size={SFSymbolSize.FOOTNOTE} weight={SFSymbolWeight.MEDIUM} />
            사용 방법
          </h3>
          <div className="autoclicker-view__steps">
            <div className="autoclicker-view__step">
              <span className="autoclicker-view__step-number">1</span>
              <div>
                <strong>설치</strong>
                <p>위 다운로드 버튼으로 설치 프로그램을 받아 실행합니다. (최초 1회)</p>
              </div>
            </div>
            <div className="autoclicker-view__step">
              <span className="autoclicker-view__step-number">2</span>
              <div>
                <strong>실행</strong>
                <p>"AutoClicker 실행" 버튼을 클릭합니다. 브라우저가 앱을 열겠냐고 묻는 팝업이 나타나면 "열기"를 선택합니다.</p>
              </div>
            </div>
            <div className="autoclicker-view__step">
              <span className="autoclicker-view__step-number">3</span>
              <div>
                <strong>자동수집</strong>
                <p>AutoClicker가 MetLife 홈페이지에서 고객 정보를 자동으로 수집합니다.</p>
              </div>
            </div>
          </div>
        </div>

        {/* 참고사항 */}
        <div className="autoclicker-view__section">
          <h3 className="autoclicker-view__section-title">
            <SFSymbol name="info-circle" size={SFSymbolSize.FOOTNOTE} weight={SFSymbolWeight.MEDIUM} />
            참고
          </h3>
          <div className="autoclicker-view__card">
            <ul className="autoclicker-view__notes">
              <li>Windows PC에서만 사용할 수 있습니다.</li>
              <li>실행 버튼 클릭 시 브라우저가 외부 앱 실행을 확인하는 팝업이 나타날 수 있습니다.</li>
              <li>AutoClicker는 실행할 때마다 자동으로 최신 버전으로 업데이트됩니다.</li>
            </ul>
          </div>
        </div>
      </div>
    </CenterPaneView>
  )
}

export default AutoClickerView
