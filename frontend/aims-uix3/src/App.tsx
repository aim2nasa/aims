import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react'
import { useGaps } from './hooks/useGaps'
import { useDynamicType, initializeDynamicType } from './hooks/useDynamicType'
import { useHapticFeedback, initializeHapticStyles, HAPTIC_TYPES } from './hooks/useHapticFeedback'
import { GapConfig, DEFAULT_GAPS } from './types/layout'
import Header from './components/Header'

// Lazy loading으로 성능 최적화
const LayoutControlModal = lazy(() => import('./components/LayoutControlModal'))
const HamburgerButton = lazy(() => import('./components/HamburgerButton'))
const CustomMenu = lazy(() => import('./components/CustomMenu/CustomMenu'))

// 모달 상태 영속화를 위한 전역 저장소 (컴포넌트 리마운트와 독립)
const persistentModalState = {
  layoutControlModalOpen: false
}

interface AppProps {
  gaps?: Partial<GapConfig>;
}

function App({ gaps: initialGaps }: AppProps = {}) {
  const [rightPaneVisible, setRightPaneVisible] = useState(true)
  const [centerWidth, setCenterWidth] = useState(60)
  const [paginationVisible, setPaginationVisible] = useState(true)

  // iOS Dynamic Type 시스템 초기화 및 추적
  const dynamicType = useDynamicType()

  // iOS 햅틱 피드백 시스템
  const haptic = useHapticFeedback()

  // 각 레이어별 visibility 상태
  const [headerVisible, setHeaderVisible] = useState(true)
  const [leftPaneVisible, setLeftPaneVisible] = useState(true)
  const [centerPaneVisible, setCenterPaneVisible] = useState(true)
  const [mainPaneVisible, setMainPaneVisible] = useState(true)
  const [brbVisible, setBrbVisible] = useState(true)

  // LeftPane 축소/확장 상태
  const [leftPaneCollapsed, setLeftPaneCollapsed] = useState(false)


  // 갭 시스템 (실시간 조정 가능) - DEFAULT_GAPS 기본값 적용
  const [dynamicGaps, setDynamicGaps] = useState<Partial<GapConfig>>(initialGaps || DEFAULT_GAPS)
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

  // iOS Dynamic Type + 햅틱 피드백 시스템 초기화
  useEffect(() => {
    initializeDynamicType()
    initializeHapticStyles()

    console.log('[App] iOS 네이티브 시스템 초기화 완료', {
      dynamicType: {
        currentSize: dynamicType.currentSize,
        scaleFactor: dynamicType.scaleFactor,
        isAccessibilitySize: dynamicType.isAccessibilitySize
      },
      hapticEnabled: haptic.isHapticEnabled
    })
  }, [])

  // 햅틱 피드백을 전역적으로 사용할 수 있도록 window 객체에 바인딩
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.aimsHaptic = haptic
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete window.aimsHaptic
      }
    }
  }, [haptic])

  // 모달 상태 변경 시 전역 저장소 동기화
  useEffect(() => {
    persistentModalState.layoutControlModalOpen = layoutControlModalOpen
    modalStateRef.current = layoutControlModalOpen
  }, [layoutControlModalOpen])

  // 테마 시스템
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')

  // 테마 적용 및 시스템 설정 감지
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)

    // 시스템 테마일 때만 미디어 쿼리 리스너 등록
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

      const handleSystemThemeChange = () => {
        // 시스템 설정이 변경되었을 때 재렌더링 트리거
        // CSS는 이미 @media (prefers-color-scheme: dark) 로 처리됨
        console.log(`[Theme] 시스템 테마 변경 감지: ${mediaQuery.matches ? 'dark' : 'light'}`)
      }

      // 초기 로그
      console.log(`[Theme] 시스템 테마 모드 활성화 - 현재: ${mediaQuery.matches ? 'dark' : 'light'}`)

      mediaQuery.addEventListener('change', handleSystemThemeChange)

      return () => {
        mediaQuery.removeEventListener('change', handleSystemThemeChange)
      }
    }

    // 시스템 테마가 아닐 때는 정리 함수 불필요
    return () => {}
  }, [theme])

  const toggleTheme = () => {
    // iOS 16+ 미디움 햅틱 피드백 - 인터페이스 변경
    haptic.triggerHaptic('medium')
    setTheme(prev => {
      switch (prev) {
        case 'light': return 'dark'
        case 'dark': return 'system'
        case 'system': return 'light'
        default: return 'system'
      }
    })
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
  }, [resizeTimer, modalClickProtection])

  // 이벤트 핸들러들 메모이제이션 (성능 최적화, 기존 동작 보존)
  const toggleHeader = useCallback(() => setHeaderVisible(prev => !prev), [])
  const toggleLeftPane = useCallback(() => setLeftPaneVisible(prev => !prev), [])
  const toggleCenterPane = useCallback(() => setCenterPaneVisible(prev => !prev), [])
  const toggleRightPane = useCallback(() => setRightPaneVisible(prev => !prev), [])
  const toggleBrb = useCallback(() => setBrbVisible(prev => !prev), [])
  const togglePagination = useCallback(() => setPaginationVisible(prev => !prev), [])
  const toggleMainPane = useCallback(() => setMainPaneVisible(prev => !prev), [])
  const toggleLeftPaneCollapsed = useCallback(() => setLeftPaneCollapsed(prev => !prev), [])
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


  // CSS 계산식들 메모이제이션 (성능 최적화, 애플 표준 크기 사용)
  const layoutDimensions = useMemo(() => {
    const leftPaneWidth = leftPaneCollapsed ? 60 : 250
    const leftPaneWidthVar = leftPaneCollapsed ? 'var(--leftpane-width-collapsed)' : 'var(--leftpane-width-expanded)'
    const mainPaneWidth = `calc(100vw - ${leftPaneWidthVar})`

    return {
      leftPaneWidth,
      leftPaneWidthVar,
      mainPaneWidth,
      // CenterPane width calculations
      centerPaneWidth: rightPaneVisible
        ? `calc((100vw - ${leftPaneWidthVar}) * ${centerWidth} / 100 - var(--gap-left) - var(--gap-center))`
        : `calc((100vw - ${leftPaneWidthVar}) - var(--gap-left) - var(--gap-right))`,

      // RightPane width calculation
      rightPaneWidth: `calc((100vw - ${leftPaneWidthVar}) * ${100 - centerWidth} / 100 - var(--gap-center) - var(--gap-right))`,

      // Pagination width (same as CenterPane)
      paginationWidth: rightPaneVisible
        ? `calc((100vw - ${leftPaneWidthVar}) * ${centerWidth} / 100 - var(--gap-left) - var(--gap-center))`
        : `calc((100vw - ${leftPaneWidthVar}) - var(--gap-left) - var(--gap-right))`,

      // BRB position calculations - CenterPane 우측 경계에 정확히 맞춤
      brbLeftPosition: rightPaneVisible
        ? `calc(${leftPaneWidthVar} + var(--gap-left) + (100vw - ${leftPaneWidthVar}) * ${centerWidth} / 100 - var(--gap-left))`
        : `calc(${leftPaneWidthVar} + (100vw - ${leftPaneWidthVar}) - var(--gap-right))`,

      // Common height calculations - 애플 표준 크기 사용
      mainContentHeight: 'var(--mainpane-height)',
      centerPaneHeight: paginationVisible ? 'var(--centerpane-height-with-pagination)' : 'var(--centerpane-height-no-pagination)',
      layoutContentHeight: `calc(var(--mainpane-height) - var(--gap-top) - var(--gap-bottom))`
    }
  }, [leftPaneCollapsed, rightPaneVisible, centerWidth, paginationVisible])

  // 모달 열기 핸들러 (강화된 보호 로직)
  const handleModalOpen = useCallback(() => {
    // 이미 열려있거나 보호 중이면 무시
    if (layoutControlModalOpen || modalClickProtection) return

    // iOS 16+ 라이트 햅틱 피드백 - 인터페이스 호버/오픈
    haptic.triggerHaptic('light')

    setModalClickProtection(true)
    setLayoutControlModalOpen(true)
    modalStateRef.current = true
    persistentModalState.layoutControlModalOpen = true

    // 클릭 보호 해제 (300ms → 100ms로 단축)
    setTimeout(() => {
      setModalClickProtection(false)
    }, 100)
  }, [layoutControlModalOpen, modalClickProtection, haptic])

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

      {/* 🍎 Apple A11y: Skip Navigation - VoiceOver 완벽 지원 */}
      <a
        href="#main-content"
        className="skip-navigation"
        style={{
          position: 'absolute',
          top: 'var(--skip-nav-offset)',
          left: 'var(--spacing-2)',
          background: 'var(--color-primary-500)',
          color: 'white',
          padding: 'var(--spacing-2) var(--spacing-4)',
          borderRadius: 'var(--radius-sm)',
          textDecoration: 'none',
          fontSize: 'var(--font-size-footnote)',
          fontWeight: 'var(--font-weight-semibold)',
          zIndex: 'var(--z-index-notification)',
          transform: 'translateY(var(--skip-nav-offset))',
          transition: 'transform var(--duration-ios-standard) var(--easing-ios-default)',
          outline: '2px solid transparent',
          outlineOffset: '2px'
        }}
        onFocus={(e) => {
          e.currentTarget.style.transform = 'translateY(var(--skip-nav-visible-offset))'
        }}
        onBlur={(e) => {
          e.currentTarget.style.transform = 'translateY(var(--skip-nav-offset))'
        }}
        aria-label="메인 콘텐츠로 바로 가기"
      >
        메인 콘텐츠로 바로 가기
      </a>

      {/* 🍎 Apple A11y: 접근성 상태 알림 영역 */}
      <div
        id="accessibility-announcements"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        style={{
          position: 'absolute',
          width: 'var(--sr-only-size)',
          height: 'var(--sr-only-size)',
          padding: '0',
          margin: 'calc(var(--sr-only-size) * -1)',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: '0'
        }}
      />

      {/* Header - Progressive Disclosure 애플 스타일 */}
      <Header
        visible={headerVisible}
        theme={theme}
        onLayoutControlOpen={handleModalOpen}
        onThemeToggle={toggleTheme}
      />

      {/* LeftPane - 독립 레이어 */}
      {leftPaneVisible && (
        <nav
          className={`layout-pane layout-leftpane ${isResizing ? '' : 'transition-smooth'}`}
          role="navigation"
          aria-label="메인 네비게이션 메뉴"
          style={{
            top: `calc(var(--header-height-base) + var(--gap-top))`,
            width: layoutDimensions.leftPaneWidthVar,
            height: `calc(var(--mainpane-height) - var(--gap-top) - var(--gap-bottom))`,
            padding: leftPaneCollapsed ? 'var(--spacing-3)' : 'var(--spacing-6)' /* 🍎 애플 표준: 1:2 비율 (12px/24px) */
          }}
        >
          {/* CustomMenu - color.png 기반 완벽한 구현 */}
          <Suspense fallback={<div style={{ width: '100%', height: '32px', backgroundColor: 'var(--color-skeleton-base)', borderRadius: '4px', opacity: 0.6 }} />}>
            <CustomMenu
              collapsed={leftPaneCollapsed}
              onMenuClick={() => {
                // Menu click handler - implement actual navigation logic here
              }}
            />
          </Suspense>

          {/* 햄버거 버튼 - aims-uix2 스타일 */}
          <div className={`hamburger-container ${leftPaneCollapsed ? 'hamburger-container--collapsed' : 'hamburger-container--expanded'}`}>
            <Suspense fallback={<div style={{ width: '32px', height: '32px', backgroundColor: 'var(--color-skeleton-base)', borderRadius: '4px', opacity: 0.6 }} />}>
              <HamburgerButton
                collapsed={leftPaneCollapsed}
                onClick={toggleLeftPaneCollapsed}
              />
            </Suspense>
          </div>
        </nav>
      )}

      {/* MainPane - 독립 레이어 (배경) */}
      {mainPaneVisible && (
        <div
          className={`layout-pane layout-mainpane ${isResizing ? '' : 'transition-smooth'}`}
          style={{
            left: layoutDimensions.leftPaneWidthVar,
            width: layoutDimensions.mainPaneWidth,
            height: layoutDimensions.mainContentHeight,
            padding: 'var(--gap-right)'
          }}
        >
        </div>
      )}

      {/* CenterPane - Header-CBR 연동 레이어 */}
      {centerPaneVisible && (
        <main
          id="main-content"
          className="layout-pane layout-centerpane"
          role="main"
          aria-label="메인 콘텐츠 영역"
          style={{
            top: `calc(var(--header-height-base) + var(--gap-top))`,
            left: `calc(${layoutDimensions.leftPaneWidthVar} + var(--gap-left))`,
            width: layoutDimensions.centerPaneWidth,
            height: `calc(var(--mainpane-height) - var(--gap-top) - var(--gap-bottom))`,
            color: 'var(--color-text-primary)'
          }}
        >
          <h3 className="section-heading" style={{
            color: 'var(--color-text-primary)',
            margin: '0'
          }}>
            CenterPane
          </h3>
        </main>
      )}

      {/* Pagination - Header-CBR 연동 레이어 (조건부) */}
      {paginationVisible && (
        <div
          className="layout-pane layout-pagination"
          style={{
            bottom: `var(--gap-bottom)`,
            left: `calc(${layoutDimensions.leftPaneWidthVar} + var(--gap-left))`,
            width: layoutDimensions.paginationWidth,
          }}
        >
          PaginationPane
        </div>
      )}

      {/* RightPane + BRB 통합 컨테이너 - Header-CBR 연동 완벽 동기화 */}
      <aside
        className="layout-rightpane-container"
        role="complementary"
        aria-label="보조 정보 패널"
        style={{
          position: 'absolute',
          top: `calc(var(--header-height-base) + var(--gap-top))`,
          right: `var(--gap-right)`,
          width: rightPaneVisible ? `calc(${layoutDimensions.rightPaneWidth} + var(--rightpane-container-offset))` : '0px',
          height: `calc(var(--mainpane-height) - var(--gap-top) - var(--gap-bottom))`,
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
              width: 'var(--brb-width)',
              height: '100%',
              flexShrink: 0,
              cursor: rightPaneVisible ? 'col-resize' : 'default',
              // CSS 클래스에서 처리되는 속성들을 인라인에서 제거
              // backgroundColor, zIndex, position, display, alignItems, justifyContent는 CSS에서 처리
              // transition 제거 - 컨테이너의 transition 사용
            }}
            onMouseDown={(e) => {
              e.preventDefault()

              // iOS 16+ 셀렉션 햅틱 피드백 - 드래그 시작
              haptic.triggerHaptic(HAPTIC_TYPES.SELECTION)

              const startX = e.clientX
              const startWidth = centerWidth

              const handleMouseMove = (e: MouseEvent) => {
                e.preventDefault()

                // 완벽한 픽셀 계산으로 동기화 보장
                const deltaX = e.clientX - startX
                const mainPaneWidth = window.innerWidth - layoutDimensions.leftPaneWidth
                const availableWidth = mainPaneWidth - gapValues.gapLeft - gapValues.gapCenter - gapValues.gapRight

                // 픽셀 단위로 정확한 계산
                const newCenterWidthPx = Math.max(
                  availableWidth * 0.2,
                  Math.min(
                    availableWidth * 0.8,
                    (availableWidth * startWidth / 100) + deltaX
                  )
                )

                // 퍼센트로 변환하여 React state 업데이트
                const newCenterPercent = (newCenterWidthPx / availableWidth) * 100
                setCenterWidth(newCenterPercent)
              }

              const handleMouseUp = () => {
                // iOS 16+ 라이트 햅틱 피드백 - 드래그 완료
                haptic.triggerHaptic(HAPTIC_TYPES.LIGHT)

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
            padding: rightPaneVisible ? 'var(--spacing-6) var(--spacing-5)' : '0', /* 애플 표준 패딩 */
            overflow: 'hidden',
            color: 'var(--color-text-primary)'
            // transition 제거 - 컨테이너의 transition 사용
          }}
        >
          {rightPaneVisible && (
            <>
              <h3 className="section-heading" style={{
                color: 'var(--color-text-primary)',
                margin: '0'
              }}>RightPane</h3>
            </>
          )}
        </div>
      </aside>

      {/* 접근성: 레이아웃 상태 알림 영역 */}
      <div
        id="layout-status-announcement"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      {/* 통합 제어 모달 - Lazy Loading */}
      <Suspense fallback={null}>
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
      </Suspense>

    </div>
  )
}

export default App