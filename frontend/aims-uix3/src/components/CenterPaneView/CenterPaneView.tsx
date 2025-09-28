/**
 * CenterPaneView Component
 * @since 1.0.0
 *
 * CenterPane 위 모든 View들의 공통 상위 클래스 (베이스 컴포넌트)
 * 애플 디자인 시스템 및 AIMS 가이드라인 준수
 * 객체지향 상속 구조의 부모 클래스 역할
 */

import React from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../SFSymbol'
import './CenterPaneView.css'

interface CenterPaneViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 제목 */
  title: string
  /** View 닫기 핸들러 */
  onClose: () => void
  /** 상단 마진 (px) */
  marginTop?: number
  /** 하단 마진 (px) */
  marginBottom?: number
  /** 좌측 마진 (px) */
  marginLeft?: number
  /** 우측 마진 (px) */
  marginRight?: number
  /** 추가 CSS 클래스 */
  className?: string
  /** 자식 컴포넌트 */
  children?: React.ReactNode
}

/**
 * CenterPaneView React 컴포넌트
 *
 * CenterPane 위에 오버레이되는 모든 View의 공통 상위 클래스
 * 객체지향의 상속 개념을 React에서 구현
 *
 * 상속 구조:
 * - CenterPaneView (상위 클래스)
 *   ├── DocumentManagementView
 *   ├── DocumentRegistrationView
 *   ├── DocumentSearchView
 *   ├── DocumentStatusView
 *   ├── CustomerManagementView
 *   ├── CustomerRegistrationView
 *   ├── CustomerAllView
 *   ├── CustomerRegionalView
 *   └── CustomerRelationshipView
 *
 * 애플 디자인 개선 사항:
 * - 제목 폰트 크기: 17px → 15px (서브틀함)
 * - 제목 폰트 두께: semibold → medium
 * - 제목 색상: 60% 투명도 적용
 * - X 버튼 완전 제거 (깔끔한 인터페이스)
 *
 * @example
 * ```tsx
 * <CenterPaneView
 *   visible={isVisible}
 *   title="문서 등록"
 *   onClose={handleClose}
 *   marginTop={4}
 *   marginBottom={4}
 *   marginLeft={4}
 *   marginRight={4}
 * >
 *   <div>콘텐츠</div>
 * </CenterPaneView>
 * ```
 */
export const CenterPaneView: React.FC<CenterPaneViewProps> = ({
  visible,
  title,
  onClose: _onClose, // eslint-disable-line @typescript-eslint/no-unused-vars
  marginTop = 4,
  marginBottom = 4,
  marginLeft = 4,
  marginRight = 4,
  className = '',
  children
}) => {
  if (!visible) return null

  return (
    <div
      className={`center-pane-view ${className}`}
      style={{
        '--margin-top': `${marginTop}px`,
        '--margin-bottom': `${marginBottom}px`,
        '--margin-left': `${marginLeft}px`,
        '--margin-right': `${marginRight}px`
      } as React.CSSProperties}
      role="dialog"
      aria-label={title}
      aria-modal="true"
    >
      {/* 헤더 영역 - 애플 스타일 적용 */}
      <div className="center-pane-view__header">
        <h2 className="center-pane-view__title">
          {title}
        </h2>
        {/* X 버튼 제거 - 애플의 미니멀 디자인 철학 적용 */}
      </div>

      {/* 콘텐츠 영역 */}
      <div className="center-pane-view__content">
        {children || (
          <div className="center-pane-view__placeholder">
            <SFSymbol
              name="doc.text"
              size={SFSymbolSize.TITLE_1}
              weight={SFSymbolWeight.LIGHT}
              decorative={true}
            />
            <p>{title} 인터페이스가 여기에 표시됩니다.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default CenterPaneView