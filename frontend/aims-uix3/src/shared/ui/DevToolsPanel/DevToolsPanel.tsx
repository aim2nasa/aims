/**
 * DevToolsPanel - 개발자 도구 패널
 *
 * 개발자 모드에서만 표시되는 플로팅 도구 패널
 * - 캐시 클리어 (localStorage, sessionStorage)
 * - 페이지 새로고침
 *
 * 위치: 화면 우측 하단 고정
 */

import { useState } from 'react'
import { useDevModeStore } from '@/shared/store/useDevModeStore'
import './DevToolsPanel.css'

export function DevToolsPanel() {
  const { isDevMode } = useDevModeStore()
  const [isExpanded, setIsExpanded] = useState(false)
  const [clearing, setClearing] = useState(false)

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
            Ctrl+Shift+D: 개발모드 토글
          </div>
        </div>
      )}
    </div>
  )
}
