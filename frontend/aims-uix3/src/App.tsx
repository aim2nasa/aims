import { useState } from 'react'
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

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      position: 'relative',
      margin: 0,
      padding: 0,
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#000000',
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
          backgroundColor: '#f3e8ff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          borderBottom: '2px solid #e5e7eb',
          zIndex: 100
        }}>
          <h1 style={{ margin: 0, color: '#1a1a1a' }}>AIMS UIX3</h1>

          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            {/* Layer Toggle Checkboxes */}
            <div style={{ display: 'flex', gap: '10px', fontSize: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#1a1a1a' }}>
                <input type="checkbox" checked={headerVisible} onChange={() => setHeaderVisible(!headerVisible)} />
                Header
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#1a1a1a' }}>
                <input type="checkbox" checked={leftPaneVisible} onChange={() => setLeftPaneVisible(!leftPaneVisible)} />
                LeftPane
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#1a1a1a' }}>
                <input type="checkbox" checked={centerPaneVisible} onChange={() => setCenterPaneVisible(!centerPaneVisible)} />
                CenterPane
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#1a1a1a' }}>
                <input type="checkbox" checked={rightPaneVisible} onChange={() => setRightPaneVisible(!rightPaneVisible)} />
                RightPane
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#1a1a1a' }}>
                <input type="checkbox" checked={brbVisible} onChange={() => setBrbVisible(!brbVisible)} />
                BRB
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#1a1a1a' }}>
                <input type="checkbox" checked={paginationVisible} onChange={() => setPaginationVisible(!paginationVisible)} />
                Pagination
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#1a1a1a' }}>
                <input type="checkbox" checked={mainPaneVisible} onChange={() => setMainPaneVisible(!mainPaneVisible)} />
                MainPane
              </label>
            </div>

            {/* Gap 버튼 */}
            {showGapController && (
              <button
                onClick={() => setGapControllerVisible(!gapControllerVisible)}
                style={{
                  backgroundColor: gapControllerVisible ? '#ef4444' : '#374151',
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
          width: leftPaneCollapsed ? '60px' : '250px',
          height: 'calc(100vh - 60px)',
          backgroundColor: '#fef3e3',
          padding: leftPaneCollapsed ? '10px' : '20px',
          borderRight: '2px solid #e5e7eb',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          transition: 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        }}>
          {!leftPaneCollapsed && (
            <>
              <h3 style={{ margin: '0 0 10px 0', color: '#1a1a1a' }}>LeftPane (Fixed)</h3>
              <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>Navigation & Controls</p>
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
                backgroundColor: '#374151',
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
              onClick={() => setLeftPaneCollapsed(!leftPaneCollapsed)}
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
          left: leftPaneCollapsed ? '60px' : '250px',
          width: leftPaneCollapsed ? 'calc(100vw - 60px)' : 'calc(100vw - 250px)',
          height: 'calc(100vh - 60px)',
          backgroundColor: '#3b82f6',
          padding: 'var(--gap-right)',
          zIndex: 1,
          transition: 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        }}>
        </div>
      )}

      {/* CenterPane - 독립 레이어 */}
      {centerPaneVisible && (
        <div style={{
          position: 'absolute',
          top: `calc(60px + var(--gap-top))`,
          left: `calc(${leftPaneCollapsed ? '60px' : '250px'} + var(--gap-left))`,
          width: rightPaneVisible ?
            `calc((100vw - ${leftPaneCollapsed ? '60px' : '250px'}) * ${centerWidth} / 100 - var(--gap-left) - var(--gap-center))` :
            `calc((100vw - ${leftPaneCollapsed ? '60px' : '250px'}) - var(--gap-left) - var(--gap-right))`,
          height: paginationVisible ? 'calc(100vh - 116px)' : 'calc(100vh - 76px)',
          backgroundColor: '#e0f2fe',
          padding: '20px',
          boxSizing: 'border-box',
          zIndex: 10,
          transition: 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#1a1a1a' }}>
            CenterPane {rightPaneVisible ? '(Resized according to BRB)' : '(Maximized state)'}
          </h3>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>Main content area</p>
          <p style={{ margin: '10px 0 0 0', color: '#6b7280', fontSize: '12px' }}>
            Pagination: {paginationVisible ? 'ON' : 'OFF'}
          </p>
        </div>
      )}

      {/* Pagination - 독립 레이어 (조건부) */}
      {paginationVisible && (
        <div style={{
          position: 'absolute',
          bottom: `var(--gap-bottom)`,
          left: `calc(${leftPaneCollapsed ? '60px' : '250px'} + var(--gap-left))`,
          width: rightPaneVisible ?
            `calc((100vw - ${leftPaneCollapsed ? '60px' : '250px'}) * ${centerWidth} / 100 - var(--gap-left) - var(--gap-center))` :
            `calc((100vw - ${leftPaneCollapsed ? '60px' : '250px'}) - var(--gap-left) - var(--gap-right))`,
          height: '40px',
          backgroundColor: '#06b6d4',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          boxSizing: 'border-box',
          zIndex: 10,
          transition: 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
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
            left: rightPaneVisible ?
              `calc(${leftPaneCollapsed ? '60px' : '250px'} + var(--gap-left) + (100vw - ${leftPaneCollapsed ? '60px' : '250px'}) * ${centerWidth} / 100 - var(--gap-left) - 2px)` :
              `calc(${leftPaneCollapsed ? '60px' : '250px'} + (100vw - ${leftPaneCollapsed ? '60px' : '250px'}) - var(--gap-right))`,
            width: '4px',
            height: 'calc(100vh - 76px)',
            backgroundColor: '#ec4899',
            opacity: rightPaneVisible ? 1 : 0,
            cursor: rightPaneVisible ? 'col-resize' : 'default',
            zIndex: 20,
            transition: 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
          }}
          onMouseDown={(e) => {
            e.preventDefault()
            const startX = e.clientX
            const startWidth = centerWidth

            const handleMouseMove = (e: MouseEvent) => {
              e.preventDefault()
              const deltaX = e.clientX - startX
              const mainPaneWidth = window.innerWidth - (leftPaneCollapsed ? 60 : 250) // MainPane 너비
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
        >
        </div>
      )}

      {/* RightPane - 독립 레이어 (조건부) */}
      <div style={{
        position: 'absolute',
        top: `calc(60px + var(--gap-top))`,
        right: `var(--gap-right)`,
        width: rightPaneVisible ?
          `calc((100vw - ${leftPaneCollapsed ? '60px' : '250px'}) * ${100 - centerWidth} / 100 - var(--gap-center) - var(--gap-right))` :
          '0px',
        opacity: rightPaneVisible ? 1 : 0,
        height: 'calc(100vh - 76px)',
        backgroundColor: '#f0fdf4',
        padding: rightPaneVisible ? '20px' : '0px',
        zIndex: 10,
        overflow: 'hidden',
        transition: 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
      }}>
        {rightPaneVisible && (
          <>
            <h3 style={{ margin: '0 0 10px 0', color: '#1a1a1a' }}>RightPane (Resized according to BRB)</h3>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>Additional tools & info</p>
            <p style={{ margin: '10px 0 0 0', color: '#6b7280', fontSize: '12px' }}>
              Pagination: {paginationVisible ? 'ON' : 'OFF'}
            </p>
          </>
        )}
      </div>

      {/* 갭 컨트롤러 패널 */}
      {showGapController && gapControllerVisible && (
        <div style={{ position: 'fixed', top: '120px', right: '10px', zIndex: 1000 }}>
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            padding: '15px',
            borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
            minWidth: '220px',
            fontSize: '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h4 style={{ margin: 0, color: '#1a1a1a' }}>Gap</h4>
              <button
                onClick={() => setDynamicGaps(DEFAULT_GAPS)}
                style={{
                  backgroundColor: '#10b981',
                  color: 'white',
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
              <label style={{ display: 'block', marginBottom: '4px', color: '#374151' }}>
                gapLeft: {gapValues.gapLeft}px
              </label>
              <input
                type="range"
                min="0"
                max="20"
                value={gapValues.gapLeft}
                onChange={(e) => setDynamicGaps(prev => ({ ...prev, gapLeft: Number(e.target.value) }))}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px', color: '#374151' }}>
                gapCenter: {gapValues.gapCenter}px
              </label>
              <input
                type="range"
                min="0"
                max="20"
                value={gapValues.gapCenter}
                onChange={(e) => setDynamicGaps(prev => ({ ...prev, gapCenter: Number(e.target.value) }))}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px', color: '#374151' }}>
                gapRight: {gapValues.gapRight}px
              </label>
              <input
                type="range"
                min="0"
                max="20"
                value={gapValues.gapRight}
                onChange={(e) => setDynamicGaps(prev => ({ ...prev, gapRight: Number(e.target.value) }))}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px', color: '#374151' }}>
                gapTop: {gapValues.gapTop}px
              </label>
              <input
                type="range"
                min="0"
                max="20"
                value={gapValues.gapTop}
                onChange={(e) => setDynamicGaps(prev => ({ ...prev, gapTop: Number(e.target.value) }))}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px', color: '#374151' }}>
                gapBottom: {gapValues.gapBottom}px
              </label>
              <input
                type="range"
                min="0"
                max="20"
                value={gapValues.gapBottom}
                onChange={(e) => setDynamicGaps(prev => ({ ...prev, gapBottom: Number(e.target.value) }))}
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