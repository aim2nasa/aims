import { useState } from 'react'

function App() {
  const [rightPaneVisible, setRightPaneVisible] = useState(false)
  const [centerWidth, setCenterWidth] = useState(60)
  const [paginationVisible, setPaginationVisible] = useState(true)

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
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setRightPaneVisible(!rightPaneVisible)}
            style={{
              backgroundColor: '#3b82f6',
              color: 'white',
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            {rightPaneVisible ? 'Hide Right Pane' : 'Show Right Pane'}
          </button>
          <button
            onClick={() => setPaginationVisible(!paginationVisible)}
            style={{
              backgroundColor: '#06b6d4',
              color: 'white',
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            {paginationVisible ? 'Hide Pagination' : 'Show Pagination'}
          </button>
        </div>
      </div>

      {/* LeftPane - 독립 레이어 */}
      <div style={{
        position: 'absolute',
        top: '60px',
        left: 0,
        width: '250px',
        height: 'calc(100vh - 60px)',
        backgroundColor: '#fef3e3',
        padding: '20px',
        borderRight: '2px solid #e5e7eb',
        zIndex: 10
      }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#1a1a1a' }}>LeftPane (Fixed)</h3>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>Navigation & Controls</p>
      </div>

      {/* MainPane - 독립 레이어 (배경) */}
      <div style={{
        position: 'absolute',
        top: '60px',
        left: '250px',
        width: 'calc(100vw - 250px)',
        height: 'calc(100vh - 60px)',
        backgroundColor: '#3b82f6',
        padding: '8px',
        zIndex: 1
      }}>
      </div>

      {/* CenterPane - 독립 레이어 */}
      <div style={{
        position: 'absolute',
        top: '68px',
        left: '254px',
        width: rightPaneVisible ? `calc((100vw - 250px) * ${centerWidth} / 100 - 8px)` : 'calc((100vw - 250px) - 8px)',
        height: paginationVisible ? 'calc(100vh - 116px)' : 'calc(100vh - 76px)',
        backgroundColor: '#e0f2fe',
        padding: '20px',
        zIndex: 10
      }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#1a1a1a' }}>
          CenterPane {rightPaneVisible ? '(Resized according to BRB)' : '(Maximized state)'}
        </h3>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>Main content area</p>
        <p style={{ margin: '10px 0 0 0', color: '#6b7280', fontSize: '12px' }}>
          Pagination: {paginationVisible ? 'ON' : 'OFF'}
        </p>
      </div>

      {/* BRB - 독립 레이어 (조건부) */}
      {rightPaneVisible && (
        <div
          style={{
            position: 'absolute',
            top: '68px',
            left: `calc(254px + (100vw - 250px) * ${centerWidth} / 100 - 2px)`,
            width: '4px',
            height: 'calc(100vh - 76px)',
            backgroundColor: '#ec4899',
            cursor: 'col-resize',
            zIndex: 20
          }}
          onMouseDown={(e) => {
            e.preventDefault()
            const startX = e.clientX
            const startWidth = centerWidth

            const handleMouseMove = (e: MouseEvent) => {
              e.preventDefault()
              const deltaX = e.clientX - startX
              const mainPaneWidth = window.innerWidth - 250 // MainPane 너비
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
      {rightPaneVisible && (
        <div style={{
          position: 'absolute',
          top: '68px',
          left: `calc(254px + (100vw - 250px) * ${centerWidth} / 100 + 6px)`,
          width: `calc((100vw - 250px) * ${100 - centerWidth} / 100 - 14px)`,
          height: 'calc(100vh - 76px)',
          backgroundColor: '#f0fdf4',
          padding: '20px',
          zIndex: 10
        }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#1a1a1a' }}>RightPane (Resized according to BRB)</h3>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>Additional tools & info</p>
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
          left: '254px',
          width: rightPaneVisible ? `calc((100vw - 250px) * ${centerWidth} / 100 - 8px)` : 'calc((100vw - 250px) - 8px)',
          height: '40px',
          backgroundColor: '#06b6d4',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          zIndex: 10
        }}>
          Pagination Pane (On/Off depends on CenterPane content)
        </div>
      )}
    </div>
  )
}

export default App