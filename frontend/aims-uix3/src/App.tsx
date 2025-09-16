import { useState, useEffect, useCallback, useMemo } from 'react'
import { useGaps } from './hooks/useGaps'
import { GapConfig, DEFAULT_GAPS } from './types/layout'
import ThemeToggle from './components/ThemeToggle'
import LayoutControlModal from './components/LayoutControlModal'
import HamburgerButton from './components/HamburgerButton'

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

  // 통합 제어 모달 상태
  const [layoutControlModalOpen, setLayoutControlModalOpen] = useState(false)

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
      className="layout-main"
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        ...cssVariables // CSS 변수 적용
      }}>
      {/* Header - 독립 레이어 */}
      {headerVisible && (
        <div className="layout-pane layout-header">
          <h1 className="page-title">AIMS UIX3</h1>

          <div className="control-section">
            {/* 통합 제어 버튼 */}
            <button
              onClick={() => setLayoutControlModalOpen(true)}
              className="layout-control-button"
              aria-label="레이아웃 제어"
              title="레이아웃 제어"
            >
              ⚙️
            </button>

            {/* Theme Toggle 컴포넌트 */}
            <ThemeToggle theme={theme} onToggle={toggleTheme} />

          </div>
        </div>
      )}

      {/* LeftPane - 독립 레이어 */}
      {leftPaneVisible && (
        <div
          className={`layout-pane layout-leftpane ${isResizing ? '' : 'transition-smooth'}`}
          style={{
            width: layoutDimensions.leftPaneWidthPx,
            height: layoutDimensions.mainContentHeight,
            padding: leftPaneCollapsed ? '10px' : '20px'
          }}
        >
          {!leftPaneCollapsed && (
            <>
              <h3 className="section-heading">LeftPane (Fixed)</h3>
              <p className="description-text">Navigation & Controls</p>
            </>
          )}

          {/* 햄버거 버튼 - aims-uix2 스타일 */}
          <div className={`hamburger-container ${leftPaneCollapsed ? 'hamburger-container--collapsed' : 'hamburger-container--expanded'}`}>
            <HamburgerButton
              collapsed={leftPaneCollapsed}
              onClick={toggleLeftPaneCollapsed}
            />
          </div>
        </div>
      )}

      {/* MainPane - 독립 레이어 (배경) */}
      {mainPaneVisible && (
        <div
          className={`layout-pane layout-mainpane ${isResizing ? '' : 'transition-smooth'}`}
          style={{
            left: layoutDimensions.leftPaneWidthPx,
            width: layoutDimensions.mainPaneWidth,
            height: layoutDimensions.mainContentHeight,
            padding: 'var(--gap-right)'
          }}
        >
        </div>
      )}

      {/* CenterPane - 독립 레이어 */}
      {centerPaneVisible && (
        <div
          className={`layout-pane layout-centerpane ${isResizing ? '' : 'transition-smooth'}`}
          style={{
            top: `calc(60px + var(--gap-top))`,
            left: `calc(${layoutDimensions.leftPaneWidthPx} + var(--gap-left))`,
            width: layoutDimensions.centerPaneWidth,
            height: layoutDimensions.centerPaneHeight
          }}
        >
          <h3 className="section-heading">
            CenterPane {rightPaneVisible ? '(Resized according to BRB)' : '(Maximized state)'}
          </h3>
          <p className="description-text">Main content area</p>
          <p className="text-sm m-0" style={{ marginTop: '10px', color: 'var(--color-text-secondary)' }}>
            Pagination: {paginationVisible ? 'ON' : 'OFF'}
          </p>
        </div>
      )}

      {/* Pagination - 독립 레이어 (조건부) */}
      {paginationVisible && (
        <div
          className={`layout-pane layout-pagination ${isResizing ? 'layout-pane--no-transition' : ''}`}
          style={{
            bottom: `var(--gap-bottom)`,
            left: `calc(${layoutDimensions.leftPaneWidthPx} + var(--gap-left))`,
            width: layoutDimensions.paginationWidth,
          }}
        >
          Pagination Pane (On/Off depends on CenterPane content)
        </div>
      )}

      {/* BRB - 독립 레이어 (조건부) */}
      {brbVisible && (
        <div
          className={`layout-pane layout-brb ${rightPaneVisible ? '' : 'layout-brb--hidden'} ${isResizing ? 'layout-pane--no-transition' : ''}`}
          style={{
            top: `calc(60px + var(--gap-top))`,
            left: layoutDimensions.brbLeftPosition,
            height: layoutDimensions.layoutContentHeight,
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
          aria-label="패널 크기 조절"
          role="separator"
          aria-orientation="vertical"
        >
        </div>
      )}

      {/* RightPane - 독립 레이어 (조건부) */}
      <div
        className={`layout-pane layout-rightpane ${rightPaneVisible ? '' : 'layout-rightpane--hidden'}`}
        style={{
          top: `calc(60px + var(--gap-top))`,
          right: `var(--gap-right)`,
          width: rightPaneVisible ? layoutDimensions.rightPaneWidth : '0px',
          height: layoutDimensions.layoutContentHeight,
          padding: rightPaneVisible ? '20px' : '0px',
        }}
      >
        {rightPaneVisible && (
          <>
            <h3 className="section-heading">RightPane (Resized according to BRB)</h3>
            <p className="description-text">Additional tools & info</p>
            <p className="text-sm m-0" style={{ marginTop: '10px', color: 'var(--color-text-secondary)' }}>
              Pagination: {paginationVisible ? 'ON' : 'OFF'}
            </p>
          </>
        )}
      </div>

      {/* 통합 제어 모달 */}
      <LayoutControlModal
        isOpen={layoutControlModalOpen}
        onClose={() => setLayoutControlModalOpen(false)}
        headerVisible={headerVisible}
        leftPaneVisible={leftPaneVisible}
        centerPaneVisible={centerPaneVisible}
        rightPaneVisible={rightPaneVisible}
        brbVisible={brbVisible}
        paginationVisible={paginationVisible}
        mainPaneVisible={mainPaneVisible}
        toggleHeader={toggleHeader}
        toggleLeftPane={toggleLeftPane}
        toggleCenterPane={toggleCenterPane}
        toggleRightPane={toggleRightPane}
        toggleBrb={toggleBrb}
        togglePagination={togglePagination}
        toggleMainPane={toggleMainPane}
        resetGaps={resetGaps}
        gapValues={gapValues}
        handleGapLeftChange={handleGapLeftChange}
        handleGapCenterChange={handleGapCenterChange}
        handleGapRightChange={handleGapRightChange}
        handleGapTopChange={handleGapTopChange}
        handleGapBottomChange={handleGapBottomChange}
      />

    </div>
  )
}

export default App