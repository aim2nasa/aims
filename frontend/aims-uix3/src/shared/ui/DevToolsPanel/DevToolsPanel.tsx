/**
 * DevToolsPanel - 개발자 도구 패널
 *
 * 개발자 모드에서만 표시되는 플로팅 도구 패널
 * - 시스템 버전 정보 표시 (프론트엔드 + 백엔드)
 * - 캐시 클리어 (localStorage, sessionStorage)
 * - 페이지 새로고침
 *
 * 위치: 화면 우측 하단 고정
 */

import { useState, useEffect, useCallback } from 'react'
import { useDevModeStore } from '@/shared/store/useDevModeStore'
import {
  fetchSystemVersions,
  getFrontendVersion,
  type SystemVersions,
} from '@/services/versionService'
import './DevToolsPanel.css'

export function DevToolsPanel() {
  const { isDevMode } = useDevModeStore()
  const [isExpanded, setIsExpanded] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [versions, setVersions] = useState<SystemVersions | null>(null)
  const [loadingVersions, setLoadingVersions] = useState(false)

  // 버전 정보 로드
  const loadVersions = useCallback(async () => {
    setLoadingVersions(true)
    try {
      const result = await fetchSystemVersions()
      setVersions(result)
    } catch (error) {
      console.error('[DevTools] 버전 정보 로드 실패:', error)
      setVersions({
        frontend: getFrontendVersion(),
        backends: [],
      })
    } finally {
      setLoadingVersions(false)
    }
  }, [])

  // 패널 열릴 때 버전 로드
  useEffect(() => {
    if (isExpanded && !versions) {
      loadVersions()
    }
  }, [isExpanded, versions, loadVersions])

  if (!isDevMode) return null

  const handleClearCache = () => {
    setClearing(true)

    // 모든 캐시 삭제
    try {
      localStorage.clear()
      sessionStorage.clear()
      console.log('🗑️ [DevTools] localStorage, sessionStorage 삭제 완료')

      // 잠시 후 새로고침
      setTimeout(() => {
        location.reload()
      }, 300)
    } catch (error) {
      console.error('❌ [DevTools] 캐시 삭제 실패:', error)
      setClearing(false)
    }
  }

  const handleHardRefresh = () => {
    // 캐시 버스팅 쿼리 파라미터 추가로 브라우저 캐시 우회
    const url = new URL(window.location.href)
    url.searchParams.set('_t', Date.now().toString())
    window.location.href = url.toString()
  }

  return (
    <div className={`dev-tools-panel ${isExpanded ? 'expanded' : 'collapsed'}`}>
      {/* 토글 버튼 */}
      <button
        type="button"
        className="dev-tools-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        title={isExpanded ? '도구 닫기' : '개발자 도구'}
      >
        {isExpanded ? '×' : '🔧'}
      </button>

      {/* 확장된 패널 */}
      {isExpanded && (
        <div className="dev-tools-content">
          <div className="dev-tools-header">DEV TOOLS</div>

          {/* 버전 정보 섹션 */}
          <div className="dev-tools-versions">
            <div className="dev-tools-versions-header">
              SYSTEM VERSIONS
              <button
                type="button"
                className="dev-tools-refresh-btn"
                onClick={loadVersions}
                disabled={loadingVersions}
                title="버전 정보 새로고침"
              >
                {loadingVersions ? '...' : '↻'}
              </button>
            </div>

            {versions ? (
              <div className="dev-tools-versions-list">
                {/* 프론트엔드 */}
                <div className="dev-tools-version-item">
                  <span className="dev-tools-version-name">Frontend</span>
                  <span className="dev-tools-version-value">
                    v{versions.frontend.version}
                    <span className="dev-tools-version-hash">
                      ({versions.frontend.gitHash?.substring(0, 7)})
                    </span>
                  </span>
                </div>

                {/* 백엔드 서비스들 */}
                {versions.backends.map((service) => (
                  <div key={service.name} className="dev-tools-version-item">
                    <span className="dev-tools-version-name">{service.displayName}</span>
                    <span className="dev-tools-version-value">
                      {service.status === 'ok' ? (
                        <>
                          v{service.version}
                          <span className="dev-tools-version-hash">
                            ({service.gitHash?.substring(0, 7)})
                          </span>
                          <span className="dev-tools-version-status ok">OK</span>
                        </>
                      ) : (
                        <span className="dev-tools-version-status error">ERR</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            ) : loadingVersions ? (
              <div className="dev-tools-versions-loading">Loading...</div>
            ) : null}
          </div>

          <div className="dev-tools-buttons">
            {/* 캐시 클리어 버튼 */}
            <button
              type="button"
              className="dev-tools-btn dev-tools-btn-danger"
              onClick={handleClearCache}
              disabled={clearing}
              title="localStorage + sessionStorage 삭제 후 새로고침"
            >
              {clearing ? '삭제 중...' : '🗑️ 캐시 클리어'}
            </button>

            {/* 하드 리프레시 버튼 */}
            <button
              type="button"
              className="dev-tools-btn"
              onClick={handleHardRefresh}
              title="캐시 우회 새로고침 (Ctrl+Shift+R 대체)"
            >
              ⚡ 하드 리프레시
            </button>
          </div>

          <div className="dev-tools-info">
            Ctrl+Alt+Shift+D: 개발모드 토글
          </div>
        </div>
      )}
    </div>
  )
}
