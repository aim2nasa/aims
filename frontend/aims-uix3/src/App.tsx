import { useState } from 'react'

function App() {
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

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      position: 'relative',
      margin: 0,
      padding: 0,
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#000000'
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
          padding: '8px',
          zIndex: 1,
          transition: 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        }}>
        </div>
      )}

      {/* CenterPane - 독립 레이어 */}
      {centerPaneVisible && (
        <div style={{
          position: 'absolute',
          top: '68px',
          left: leftPaneCollapsed ? '64px' : '254px',
          width: rightPaneVisible ?
            `calc((100vw - ${leftPaneCollapsed ? '60px' : '250px'}) * ${centerWidth} / 100 - 8px)` :
            `calc((100vw - ${leftPaneCollapsed ? '60px' : '250px'}) - 12px)`,
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
          bottom: '8px',
          left: leftPaneCollapsed ? '64px' : '254px',
          width: rightPaneVisible ?
            `calc((100vw - ${leftPaneCollapsed ? '60px' : '250px'}) * ${centerWidth} / 100 - 8px)` :
            `calc((100vw - ${leftPaneCollapsed ? '60px' : '250px'}) - 12px)`,
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
            top: '68px',
            left: rightPaneVisible ?
              `calc(${leftPaneCollapsed ? '64px' : '254px'} + (100vw - ${leftPaneCollapsed ? '60px' : '250px'}) * ${centerWidth} / 100 - 4.7px)` :
              `calc(${leftPaneCollapsed ? '64px' : '254px'} + (100vw - ${leftPaneCollapsed ? '60px' : '250px'}) - 10px)`,
            width: '4px',
            height: 'calc(100vh - 76px)',
            backgroundColor: '#ec4899',
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
        top: '68px',
        right: '8px',
        width: rightPaneVisible ?
          `calc((100vw - ${leftPaneCollapsed ? '60px' : '250px'}) * ${100 - centerWidth} / 100 - 14px)` :
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

    </div>
  )
}

export default App