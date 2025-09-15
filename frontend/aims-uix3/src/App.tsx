import { useState, useEffect, useCallback, useMemo } from 'react'
import { useGaps } from './hooks/useGaps'
import { GapConfig, DEFAULT_GAPS } from './types/layout'

interface AppProps {
  gaps?: Partial<GapConfig>;
  showGapController?: boolean;
}

function App({ gaps: initialGaps, showGapController = true }: AppProps = {}) {
  const [rightPaneVisible, setRightPaneVisible] = useState(false)
  const [centerWidth, setCenterWidth] = useState(60)
  const [paginationVisible, setPaginationVisible] = useState(true)

  // 각 레이어별 visibility 상태
  const [headerVisible, setHeaderVisible] = useState(true)
  const [leftPaneVisible, setLeftPaneVisible] = useState(true)
  const [centerPaneVisible, setCenterPaneVisible] = useState(true)
  const [mainPaneVisible, setMainPaneVisible] = useState(true)
  const [brbVisible, setBrbVisible] = useState(true)

  // LeftPane 축소/확장 상태
  const [leftPaneCollapsed, setLeftPaneCollapsed] = useState(false)

  // 갭 시스템 (실시간 조정 가능)
  const [dynamicGaps, setDynamicGaps] = useState<Partial<GapConfig>>(initialGaps || {})
  const [gapControllerVisible, setGapControllerVisible] = useState(false)
  const { cssVariables, gapValues } = useGaps(dynamicGaps)

  // 테마 시스템
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  // 테마 적용
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  // 브라우저 리사이즈 상태 관리
  const [isResizing, setIsResizing] = useState(false)
  const [resizeTimer, setResizeTimer] = useState<NodeJS.Timeout | null>(null)
  const [forceUpdate, setForceUpdate] = useState(0)

  // 브라우저 리사이즈 이벤트 핸들러
  useEffect(() => {
    const handleResize = () => {
      setIsResizing(true)

      // 즉시 레이아웃 강제 업데이트 (Gap 계산 포함)
      setForceUpdate(prev => prev + 1)

      // 기존 타이머가 있으면 클리어
      if (resizeTimer) {
        clearTimeout(resizeTimer)
      }

      // 리사이즈 완료 후 100ms 뒤에 transition 재활성화 (더 빠른 반응)
      const newTimer = setTimeout(() => {
        setIsResizing(false)
      }, 100)

      setResizeTimer(newTimer)
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (resizeTimer) {
        clearTimeout(resizeTimer)
      }
    }
  }, [resizeTimer])

  // 이벤트 핸들러들 메모이제이션 (성능 최적화, 기존 동작 보존)
  const toggleHeader = useCallback(() => setHeaderVisible(prev => !prev), [])
  const toggleLeftPane = useCallback(() => setLeftPaneVisible(prev => !prev), [])
  const toggleCenterPane = useCallback(() => setCenterPaneVisible(prev => !prev), [])
  const toggleRightPane = useCallback(() => setRightPaneVisible(prev => !prev), [])
  const toggleBrb = useCallback(() => setBrbVisible(prev => !prev), [])
  const togglePagination = useCallback(() => setPaginationVisible(prev => !prev), [])
  const toggleMainPane = useCallback(() => setMainPaneVisible(prev => !prev), [])
  const toggleLeftPaneCollapsed = useCallback(() => setLeftPaneCollapsed(prev => !prev), [])
  const toggleGapController = useCallback(() => setGapControllerVisible(prev => !prev), [])
  const resetGaps = useCallback(() => setDynamicGaps(DEFAULT_GAPS), [])

  // Gap 슬라이더 핸들러들
  const handleGapLeftChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDynamicGaps(prev => ({ ...prev, gapLeft: Number(e.target.value) }))
  }, [])
  const handleGapCenterChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDynamicGaps(prev => ({ ...prev, gapCenter: Number(e.target.value) }))
  }, [])
  const handleGapRightChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDynamicGaps(prev => ({ ...prev, gapRight: Number(e.target.value) }))
  }, [])
  const handleGapTopChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDynamicGaps(prev => ({ ...prev, gapTop: Number(e.target.value) }))
  }, [])
  const handleGapBottomChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDynamicGaps(prev => ({ ...prev, gapBottom: Number(e.target.value) }))
  }, [])

  // CSS 계산식들 메모이제이션 (성능 최적화, 기존 동작 보존)
  const layoutDimensions = useMemo(() => {
    const leftPaneWidth = leftPaneCollapsed ? 60 : 250
    const leftPaneWidthPx = leftPaneCollapsed ? '60px' : '250px'
    const mainPaneWidth = `calc(100vw - ${leftPaneWidthPx})`

    return {
      leftPaneWidth,
      leftPaneWidthPx,
      mainPaneWidth,
      // CenterPane width calculations
      centerPaneWidth: rightPaneVisible
        ? `calc((100vw - ${leftPaneWidthPx}) * ${centerWidth} / 100 - var(--gap-left) - var(--gap-center))`
        : `calc((100vw - ${leftPaneWidthPx}) - var(--gap-left) - var(--gap-right))`,

      // RightPane width calculation
      rightPaneWidth: `calc((100vw - ${leftPaneWidthPx}) * ${100 - centerWidth} / 100 - var(--gap-center) - var(--gap-right))`,

      // Pagination width (same as CenterPane)
      paginationWidth: rightPaneVisible
        ? `calc((100vw - ${leftPaneWidthPx}) * ${centerWidth} / 100 - var(--gap-left) - var(--gap-center))`
        : `calc((100vw - ${leftPaneWidthPx}) - var(--gap-left) - var(--gap-right))`,

      // BRB position calculations
      brbLeftPosition: rightPaneVisible
        ? `calc(${leftPaneWidthPx} + var(--gap-left) + (100vw - ${leftPaneWidthPx}) * ${centerWidth} / 100 - var(--gap-left) - 2px)`
        : `calc(${leftPaneWidthPx} + (100vw - ${leftPaneWidthPx}) - var(--gap-right))`,

      // Common height calculations
      mainContentHeight: 'calc(100vh - 60px)',
      centerPaneHeight: paginationVisible ? 'calc(100vh - 116px)' : 'calc(100vh - 76px)',
      layoutContentHeight: `calc(100vh - 60px - var(--gap-top) - var(--gap-bottom))`
    }
  }, [leftPaneCollapsed, rightPaneVisible, centerWidth, paginationVisible])

  return (
    <div
      key={forceUpdate} // 브라우저 리사이즈 시 강제 리렌더링
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        margin: 0,
        padding: 0,
        fontFamily: 'var(--font-family-primary)',
        backgroundColor: 'var(--color-layout-main-bg)',
        ...cssVariables // CSS 변수 적용
      }}>
      {/* Header - 독립 레이어 */}
      {headerVisible && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100vw',
          height: '60px',
          backgroundColor: 'var(--color-layout-header-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          borderBottom: '2px solid var(--color-border-primary)',
          zIndex: 100
        }}>
          <h1 style={{ margin: 0, color: 'var(--color-text-primary)' }}>AIMS UIX3</h1>

          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            {/* Layer Toggle Checkboxes */}
            <div style={{ display: 'flex', gap: '10px', fontSize: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-text-primary)' }}>
                <input type="checkbox" checked={headerVisible} onChange={toggleHeader} />
                Header
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-text-primary)' }}>
                <input type="checkbox" checked={leftPaneVisible} onChange={toggleLeftPane} />
                LeftPane
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-text-primary)' }}>
                <input type="checkbox" checked={centerPaneVisible} onChange={toggleCenterPane} />
                CenterPane
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-text-primary)' }}>
                <input type="checkbox" checked={rightPaneVisible} onChange={toggleRightPane} />
                RightPane
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-text-primary)' }}>
                <input type="checkbox" checked={brbVisible} onChange={toggleBrb} />
                BRB
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-text-primary)' }}>
                <input type="checkbox" checked={paginationVisible} onChange={togglePagination} />
                Pagination
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-text-primary)' }}>
                <input type="checkbox" checked={mainPaneVisible} onChange={toggleMainPane} />
                MainPane
              </label>
            </div>

            {/* Theme Toggle 버튼 */}
            <button
              onClick={toggleTheme}
              style={{
                backgroundColor: 'var(--color-button-secondary-bg)',
                color: 'var(--color-button-secondary-text)',
                border: '1px solid var(--color-button-secondary-border)',
                borderRadius: '4px',
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: '12px',
                marginLeft: '15px'
              }}
            >
              {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
            </button>

            {/* Gap 버튼 */}
            {showGapController && (
              <button
                onClick={toggleGapController}
                style={{
                  backgroundColor: gapControllerVisible ? 'var(--color-gap-button-active)' : 'var(--color-gap-button-inactive)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '6px 12px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  marginLeft: '15px'
                }}
              >
                Gap
              </button>
            )}

          </div>
        </div>
      )}

      {/* LeftPane - 독립 레이어 */}
      {leftPaneVisible && (
        <div style={{
          position: 'absolute',
          top: '60px',
          left: 0,
          width: layoutDimensions.leftPaneWidthPx,
          height: layoutDimensions.mainContentHeight,
          backgroundColor: 'var(--color-layout-leftpane-bg)',
          padding: leftPaneCollapsed ? '10px' : '20px',
          borderRight: '2px solid var(--color-border-primary)',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          transition: isResizing ? 'none' : 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        }}>
          {!leftPaneCollapsed && (
            <>
              <h3 style={{ margin: '0 0 10px 0', color: 'var(--color-text-primary)' }}>LeftPane (Fixed)</h3>
              <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '14px' }}>Navigation & Controls</p>
            </>
          )}

          {/* 햄버거 버튼 - 우측 하단 */}
          <div style={{
            marginTop: 'auto',
            display: 'flex',
            justifyContent: leftPaneCollapsed ? 'center' : 'flex-end',
            paddingTop: '10px'
          }}>
            <button
              style={{
                backgroundColor: 'var(--color-bg-tertiary)',
                border: 'none',
                borderRadius: '4px',
                padding: '6px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                width: '28px',
                height: '28px'
              }}
              onClick={toggleLeftPaneCollapsed}
            >
              <div style={{ width: '12px', height: '1.5px', backgroundColor: 'white', borderRadius: '0.5px' }}></div>
              <div style={{ width: '12px', height: '1.5px', backgroundColor: 'white', borderRadius: '0.5px' }}></div>
              <div style={{ width: '12px', height: '1.5px', backgroundColor: 'white', borderRadius: '0.5px' }}></div>
            </button>
          </div>
        </div>
      )}

      {/* MainPane - 독립 레이어 (배경) */}
      {mainPaneVisible && (
        <div style={{
          position: 'absolute',
          top: '60px',
          left: layoutDimensions.leftPaneWidthPx,
          width: layoutDimensions.mainPaneWidth,
          height: layoutDimensions.mainContentHeight,
          backgroundColor: 'var(--color-layout-mainpane-bg)',
          padding: 'var(--gap-right)',
          zIndex: 1,
          transition: isResizing ? 'none' : 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        }}>
        </div>
      )}

      {/* CenterPane - 독립 레이어 */}
      {centerPaneVisible && (
        <div style={{
          position: 'absolute',
          top: `calc(60px + var(--gap-top))`,
          left: `calc(${layoutDimensions.leftPaneWidthPx} + var(--gap-left))`,
          width: layoutDimensions.centerPaneWidth,
          height: layoutDimensions.centerPaneHeight,
          backgroundColor: 'var(--color-layout-centerpane-bg)',
          padding: '20px',
          boxSizing: 'border-box',
          zIndex: 10,
          transition: isResizing ? 'none' : 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        }}>
          <h3 style={{ margin: '0 0 10px 0', color: 'var(--color-text-primary)' }}>
            CenterPane {rightPaneVisible ? '(Resized according to BRB)' : '(Maximized state)'}
          </h3>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '14px' }}>Main content area</p>
          <p style={{ margin: '10px 0 0 0', color: 'var(--color-text-secondary)', fontSize: '12px' }}>
            Pagination: {paginationVisible ? 'ON' : 'OFF'}
          </p>
        </div>
      )}

      {/* Pagination - 독립 레이어 (조건부) */}
      {paginationVisible && (
        <div style={{
          position: 'absolute',
          bottom: `var(--gap-bottom)`,
          left: `calc(${layoutDimensions.leftPaneWidthPx} + var(--gap-left))`,
          width: layoutDimensions.paginationWidth,
          height: '40px',
          backgroundColor: 'var(--color-layout-pagination-bg)',
          color: 'var(--color-text-inverse)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          boxSizing: 'border-box',
          zIndex: 10,
          transition: isResizing ? 'none' : 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        }}>
          Pagination Pane (On/Off depends on CenterPane content)
        </div>
      )}

      {/* BRB - 독립 레이어 (조건부) */}
      {brbVisible && (
        <div
          style={{
            position: 'absolute',
            top: `calc(60px + var(--gap-top))`,
            left: layoutDimensions.brbLeftPosition,
            width: '4px',
            height: layoutDimensions.layoutContentHeight,
            backgroundColor: 'var(--color-layout-brb-bg)',
            opacity: rightPaneVisible ? 1 : 0,
            cursor: rightPaneVisible ? 'col-resize' : 'default',
            zIndex: 20,
            transition: isResizing ? 'none' : 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
          }}
          onMouseDown={(e) => {
            e.preventDefault()
            const startX = e.clientX
            const startWidth = centerWidth

            const handleMouseMove = (e: MouseEvent) => {
              e.preventDefault()
              const deltaX = e.clientX - startX
              const mainPaneWidth = window.innerWidth - layoutDimensions.leftPaneWidth // MainPane 너비
              const deltaPercent = (deltaX / mainPaneWidth) * 100
              const newWidth = startWidth + deltaPercent
              setCenterWidth(Math.max(20, Math.min(80, newWidth)))

              // BRB 드래그 중에도 레이아웃 강제 업데이트
              setForceUpdate(prev => prev + 1)
            }

            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove)
              document.removeEventListener('mouseup', handleMouseUp)
              document.body.style.cursor = 'default'
            }

            document.body.style.cursor = 'col-resize'
            document.addEventListener('mousemove', handleMouseMove)
            document.addEventListener('mouseup', handleMouseUp)
          }}
        >
        </div>
      )}

      {/* RightPane - 독립 레이어 (조건부) */}
      <div style={{
        position: 'absolute',
        top: `calc(60px + var(--gap-top))`,
        right: `var(--gap-right)`,
        width: rightPaneVisible ? layoutDimensions.rightPaneWidth : '0px',
        opacity: rightPaneVisible ? 1 : 0,
        height: layoutDimensions.layoutContentHeight,
        backgroundColor: 'var(--color-layout-rightpane-bg)',
        padding: rightPaneVisible ? '20px' : '0px',
        zIndex: 10,
        overflow: 'hidden',
        transition: 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
      }}>
        {rightPaneVisible && (
          <>
            <h3 style={{ margin: '0 0 10px 0', color: 'var(--color-text-primary)' }}>RightPane (Resized according to BRB)</h3>
            <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '14px' }}>Additional tools & info</p>
            <p style={{ margin: '10px 0 0 0', color: 'var(--color-text-secondary)', fontSize: '12px' }}>
              Pagination: {paginationVisible ? 'ON' : 'OFF'}
            </p>
          </>
        )}
      </div>

      {/* 갭 컨트롤러 패널 */}
      {showGapController && gapControllerVisible && (
        <div style={{ position: 'fixed', top: '120px', right: '10px', zIndex: 1000 }}>
          <div style={{
            backgroundColor: 'var(--color-bg-primary)',
            padding: '15px',
            borderRadius: '8px',
            boxShadow: 'var(--shadow-md)',
            minWidth: '220px',
            fontSize: '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h4 style={{ margin: 0, color: 'var(--color-text-primary)' }}>Gap</h4>
              <button
                onClick={resetGaps}
                style={{
                  backgroundColor: 'var(--color-gap-button-reset)',
                  color: 'var(--color-text-inverse)',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  fontSize: '11px'
                }}
              >
                디폴트
              </button>
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                gapLeft: {gapValues.gapLeft}px
              </label>
              <input
                type="range"
                min="0"
                max="20"
                value={gapValues.gapLeft}
                onChange={handleGapLeftChange}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                gapCenter: {gapValues.gapCenter}px
              </label>
              <input
                type="range"
                min="0"
                max="20"
                value={gapValues.gapCenter}
                onChange={handleGapCenterChange}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                gapRight: {gapValues.gapRight}px
              </label>
              <input
                type="range"
                min="0"
                max="20"
                value={gapValues.gapRight}
                onChange={handleGapRightChange}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                gapTop: {gapValues.gapTop}px
              </label>
              <input
                type="range"
                min="0"
                max="20"
                value={gapValues.gapTop}
                onChange={handleGapTopChange}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                gapBottom: {gapValues.gapBottom}px
              </label>
              <input
                type="range"
                min="0"
                max="20"
                value={gapValues.gapBottom}
                onChange={handleGapBottomChange}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default App