import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useGaps } from './hooks/useGaps'
import { GapConfig, DEFAULT_GAPS } from './types/layout'
import LayoutControlModal from './components/LayoutControlModal'
import HamburgerButton from './components/HamburgerButton'
import CustomMenu from './components/CustomMenu/CustomMenu'
import Header from './components/Header'

// 모달 상태 영속화를 위한 전역 저장소 (컴포넌트 리마운트와 독립)
const persistentModalState = {
  layoutControlModalOpen: false
}

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

  // 통합 제어 모달 상태 (영속화 지원)
  const [layoutControlModalOpen, setLayoutControlModalOpen] = useState(false)
  const [modalClickProtection, setModalClickProtection] = useState(false)
  const modalStateRef = useRef(false)

  // 컴포넌트 마운트 시 이전 모달 상태 복원
  useEffect(() => {
    if (persistentModalState.layoutControlModalOpen) {
      setLayoutControlModalOpen(true)
      modalStateRef.current = true
    }
  }, [])

  // 모달 상태 변경 시 전역 저장소 동기화
  useEffect(() => {
    persistentModalState.layoutControlModalOpen = layoutControlModalOpen
    modalStateRef.current = layoutControlModalOpen
  }, [layoutControlModalOpen])

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

      // 모달 상태 보호: 모달이 열려있거나 클릭 보호 중일 때는 리마운트 지연
      if (!modalStateRef.current && !modalClickProtection) {
        // 즉시 레이아웃 강제 업데이트 (Gap 계산 포함)
        setForceUpdate(prev => prev + 1)
      } else {
        // 모달 상태 보호를 위해 리마운트를 지연
        setTimeout(() => {
          if (!modalStateRef.current && !modalClickProtection) {
            setForceUpdate(prev => prev + 1)
          }
        }, 100)
      }

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

      // BRB position calculations - CenterPane 우측 경계에 정확히 맞춤
      brbLeftPosition: rightPaneVisible
        ? `calc(${leftPaneWidthPx} + var(--gap-left) + (100vw - ${leftPaneWidthPx}) * ${centerWidth} / 100 - var(--gap-left))`
        : `calc(${leftPaneWidthPx} + (100vw - ${leftPaneWidthPx}) - var(--gap-right))`,

      // Common height calculations
      mainContentHeight: 'calc(100vh - 60px)',
      centerPaneHeight: paginationVisible ? 'calc(100vh - 116px)' : 'calc(100vh - 76px)',
      layoutContentHeight: `calc(100vh - 60px - var(--gap-top) - var(--gap-bottom))`
    }
  }, [leftPaneCollapsed, rightPaneVisible, centerWidth, paginationVisible])

  // 모달 열기 핸들러 (강화된 보호 로직)
  const handleModalOpen = useCallback(() => {
    // 이미 열려있거나 보호 중이면 무시
    if (layoutControlModalOpen || modalClickProtection) return

    setModalClickProtection(true)
    setLayoutControlModalOpen(true)
    modalStateRef.current = true
    persistentModalState.layoutControlModalOpen = true

    // 클릭 보호 해제 (300ms → 100ms로 단축)
    setTimeout(() => {
      setModalClickProtection(false)
    }, 100)
  }, [layoutControlModalOpen, modalClickProtection])

  // 모달 닫기 핸들러
  const handleModalClose = useCallback(() => {
    setLayoutControlModalOpen(false)
    modalStateRef.current = false
    persistentModalState.layoutControlModalOpen = false
  }, [])

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
      {/* Header - Progressive Disclosure 애플 스타일 */}
      <Header
        visible={headerVisible}
        layoutControlModalOpen={layoutControlModalOpen}
        theme={theme}
        onLayoutControlOpen={handleModalOpen}
        onThemeToggle={toggleTheme}
      />

      {/* LeftPane - 독립 레이어 */}
      {leftPaneVisible && (
        <div
          className={`layout-pane layout-leftpane ${isResizing ? '' : 'transition-smooth'}`}
          style={{
            top: `calc(var(--header-height-base) + var(--gap-top))`,
            width: layoutDimensions.leftPaneWidthPx,
            height: `calc(100vh - var(--header-height-base) - var(--gap-top) - var(--gap-bottom))`,
            padding: leftPaneCollapsed ? '10px' : '20px'
          }}
        >
          {/* CustomMenu - color.png 기반 완벽한 구현 */}
          <CustomMenu
            collapsed={leftPaneCollapsed}
            onMenuClick={(key) => {
              console.log('Menu clicked:', key)
            }}
          />

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

      {/* CenterPane - Header-CBR 연동 레이어 */}
      {centerPaneVisible && (
        <div
          className="layout-pane layout-centerpane"
          style={{
            top: `calc(var(--header-height-base) + var(--gap-top))`,
            left: `calc(${layoutDimensions.leftPaneWidthPx} + var(--gap-left))`,
            width: layoutDimensions.centerPaneWidth,
            height: `calc(100vh - var(--header-height-base) - var(--gap-top) - var(--gap-bottom))`,
            color: 'var(--color-text-primary)'
          }}
        >
          <h3 className="section-heading" style={{
            color: 'var(--color-text-primary)',
            marginBottom: 'var(--spacing-3)', /* 12px - 애플 표준 제목-내용 간격 */
            marginTop: '0'
          }}>
            CenterPane {rightPaneVisible ? '(Resized according to BRB)' : '(Maximized state)'}
          </h3>
          <p className="description-text" style={{
            color: 'var(--color-text-secondary)',
            marginBottom: 'var(--spacing-4)', /* 16px - 애플 표준 문단 간격 */
            marginTop: '0'
          }}>Main content area</p>
          <p className="text-sm m-0 pagination-status" style={{
            color: 'var(--color-text-tertiary)',
            margin: '0'
          }}>
            Pagination: {paginationVisible ? 'ON' : 'OFF'}
          </p>
        </div>
      )}

      {/* Pagination - Header-CBR 연동 레이어 (조건부) */}
      {paginationVisible && (
        <div
          className="layout-pane layout-pagination"
          style={{
            bottom: `var(--gap-bottom)`,
            left: `calc(${layoutDimensions.leftPaneWidthPx} + var(--gap-left))`,
            width: layoutDimensions.paginationWidth,
          }}
        >
          Pagination Pane (On/Off depends on CenterPane content)
        </div>
      )}

      {/* RightPane + BRB 통합 컨테이너 - Header-CBR 연동 완벽 동기화 */}
      <div
        className="layout-rightpane-container"
        style={{
          position: 'absolute',
          top: `calc(var(--header-height-base) + var(--gap-top))`,
          right: `var(--gap-right)`,
          width: rightPaneVisible ? `calc(${layoutDimensions.rightPaneWidth} + 4px)` : '0px',
          height: `calc(100vh - var(--header-height-base) - var(--gap-top) - var(--gap-bottom))`,
          display: 'flex',
          flexDirection: 'row',
          opacity: rightPaneVisible ? 1 : 0,
          overflow: 'hidden',
          // transition 제거: CSS에서 Header-CBR 연동 전용 transition 사용
          zIndex: 10,
        }}
      >
        {/* BRB - RightPane 컨테이너 내부에서 좌측에 위치 */}
        {brbVisible && (
          <div
            className="layout-brb"
            style={{
              width: '4px',
              height: '100%',
              flexShrink: 0,
              cursor: rightPaneVisible ? 'col-resize' : 'default',
              // CSS 클래스에서 처리되는 속성들을 인라인에서 제거
              // backgroundColor, zIndex, position, display, alignItems, justifyContent는 CSS에서 처리
              // transition 제거 - 컨테이너의 transition 사용
            }}
            onMouseDown={(e) => {
              e.preventDefault()
              const startX = e.clientX
              const startWidth = centerWidth

              const handleMouseMove = (e: MouseEvent) => {
                e.preventDefault()
                const deltaX = e.clientX - startX
                const mainPaneWidth = window.innerWidth - layoutDimensions.leftPaneWidth
                const deltaPercent = (deltaX / mainPaneWidth) * 100
                const newWidth = startWidth + deltaPercent
                setCenterWidth(Math.max(20, Math.min(80, newWidth)))
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

        {/* RightPane - 컨테이너 내부에서 우측에 위치 */}
        <div
          className="layout-rightpane-content"
          style={{
            flex: 1,
            padding: rightPaneVisible ? 'var(--spacing-6) var(--spacing-5)' : '0px', /* 애플 표준 패딩 */
            overflow: 'hidden',
            color: 'var(--color-text-primary)'
            // transition 제거 - 컨테이너의 transition 사용
          }}
        >
          {rightPaneVisible && (
            <>
              <h3 className="section-heading" style={{
                color: 'var(--color-text-primary)',
                marginBottom: 'var(--spacing-3)', /* 12px - 애플 표준 제목-내용 간격 */
                marginTop: '0'
              }}>RightPane (Resized according to BRB)</h3>
              <p className="description-text" style={{
                color: 'var(--color-text-secondary)',
                marginBottom: 'var(--spacing-4)', /* 16px - 애플 표준 문단 간격 */
                marginTop: '0'
              }}>Additional tools & info</p>
              <p className="text-sm m-0 pagination-status" style={{
                color: 'var(--color-text-tertiary)',
                margin: '0'
              }}>
                Pagination: {paginationVisible ? 'ON' : 'OFF'}
              </p>
            </>
          )}
        </div>
      </div>

      {/* 접근성: 레이아웃 상태 알림 영역 */}
      <div
        id="layout-status-announcement"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      {/* 통합 제어 모달 */}
      <LayoutControlModal
        isOpen={layoutControlModalOpen}
        onClose={handleModalClose}
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