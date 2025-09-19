import { ReactNode } from 'react'

interface GridLayoutProps {
  header?: ReactNode
  navigation?: ReactNode
  main?: ReactNode
  aside?: ReactNode
  showNavigation?: boolean
  showAside?: boolean
  navigationWidth?: string
  asideWidth?: string
  gap?: string
}

/**
 * 🍎 Apple Performance: CSS Grid 기반 레이아웃 시스템
 * JavaScript 계산을 완전히 제거하고 CSS Grid로 대체
 */
const GridLayout = ({
  header,
  navigation,
  main,
  aside,
  showNavigation = true,
  showAside = true,
  navigationWidth = '280px',
  asideWidth = '300px',
  gap = '16px'
}: GridLayoutProps) => {
  return (
    <div
      className="layout-main--grid"
      style={{
        '--layout-nav-width': showNavigation ? navigationWidth : '0px',
        '--layout-aside-width': showAside ? asideWidth : '0px',
        '--layout-gap': gap,
        gridTemplateAreas: showNavigation && showAside
          ? '"header header header" "nav main aside" "nav main aside"'
          : showNavigation
          ? '"header header" "nav main" "nav main"'
          : showAside
          ? '"header header" "main aside" "main aside"'
          : '"header" "main" "main"'
      } as React.CSSProperties}
    >
      {/* Header */}
      {header && (
        <header className="layout-header--grid">
          {header}
        </header>
      )}

      {/* Navigation */}
      {navigation && showNavigation && (
        <nav className="layout-nav--grid">
          {navigation}
        </nav>
      )}

      {/* Main Content */}
      {main && (
        <main className="layout-main-content--grid">
          {main}
        </main>
      )}

      {/* Aside */}
      {aside && showAside && (
        <aside className="layout-aside--grid">
          {aside}
        </aside>
      )}
    </div>
  )
}

export default GridLayout