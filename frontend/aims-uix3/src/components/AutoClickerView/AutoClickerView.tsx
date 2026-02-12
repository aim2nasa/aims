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
        window.location.href = `aims-ac://start?token=${response.token}&auto_start=false`
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
        {/* 메인 액션 영역 */}
        <div className="autoclicker-view__hero">
          <div className="autoclicker-view__hero-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 2l12 10-5 .5 3 6.5-2 1-3-6.5L5 18V2z"/>
              <circle cx="19" cy="5" r="1.5" opacity="0.5"/>
              <circle cx="21" cy="10" r="1" opacity="0.35"/>
            </svg>
          </div>
          <h2 className="autoclicker-view__hero-title">AutoClicker란?</h2>
          <p className="autoclicker-view__hero-description">
            고객의 변액리포트(CRS), Annual Report(AR) PDF 파일들을 자동으로 다운로드합니다.
            <br />
            다운로드된 PDF는 <span className="autoclicker-view__menu-ref"><span className="autoclicker-view__inline-icon-orange"><SFSymbol name="doc-badge-plus" size={SFSymbolSize.CAPTION_1} weight={SFSymbolWeight.MEDIUM} /></span>고객·계약·문서 등록</span> 메뉴에서 고객 및 계약등록에 사용합니다.
          </p>

          <div className="autoclicker-view__actions">
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
          </div>
        </div>

        {/* 설치 가이드 */}
        <div className="autoclicker-view__section">
          <h3 className="autoclicker-view__section-title">
            <svg className="autoclicker-view__section-icon--green" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12l7 7 7-7"/>
              <circle cx="12" cy="12" r="10" fill="none"/>
            </svg>
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12M5 12l7 7 7-7M4 21h16"/>
              </svg>
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
            <svg className="autoclicker-view__section-icon--blue" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/>
              <text x="3" y="7" fontSize="6" fill="currentColor" stroke="none" fontWeight="bold">1</text>
              <text x="3" y="13" fontSize="6" fill="currentColor" stroke="none" fontWeight="bold">2</text>
              <text x="3" y="19" fontSize="6" fill="currentColor" stroke="none" fontWeight="bold">3</text>
            </svg>
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
                <strong>자동 다운로드</strong>
                <p>AutoClicker가 MetLife 홈페이지에서 PDF 파일들을 자동으로 다운로드합니다.</p>
              </div>
            </div>
          </div>
        </div>

        {/* 참고사항 */}
        <div className="autoclicker-view__section">
          <h3 className="autoclicker-view__section-title">
            <svg className="autoclicker-view__section-icon--amber" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            참고
          </h3>
          <div className="autoclicker-view__card">
            <ul className="autoclicker-view__notes">
              <li>Windows PC, 1920×1080 해상도에서만 사용할 수 있습니다.</li>
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
