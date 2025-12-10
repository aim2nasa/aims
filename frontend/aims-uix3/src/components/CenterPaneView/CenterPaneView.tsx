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
  /** 제목 앞에 표시할 아이콘 (React Node) */
  titleIcon?: React.ReactNode
  /** 제목 바로 뒤에 표시할 액션 버튼 (예: 뷰 전환 버튼) */
  titleAction?: React.ReactNode
  /** 제목 왼쪽에 표시할 액세서리 (예: 돌아가기 버튼) */
  titleLeftAccessory?: React.ReactNode
  /** 제목 오른쪽에 표시할 액세서리 (예: RefreshButton) */
  titleAccessory?: React.ReactNode
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
  /** 플레이스홀더 아이콘 이름 (SF Symbol) */
  placeholderIcon?: string
  /** 플레이스홀더 메시지 */
  placeholderMessage?: string
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
 *
 * // With titleIcon
 * <CenterPaneView
 *   visible={isVisible}
 *   title="Customer Registration"
 *   titleIcon={<SFSymbol name="person-fill-badge-plus" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />}
 *   onClose={handleClose}
 * >
 *   <div>Content</div>
 * </CenterPaneView>
 * ```
 */
export const CenterPaneView: React.FC<CenterPaneViewProps> = ({
  visible,
  title,
  titleIcon,
  titleAction,
  titleLeftAccessory,
  titleAccessory,
  onClose: _onClose,
  marginTop = 4,
  marginBottom = 4,
  marginLeft = 4,
  marginRight = 4,
  className = '',
  children,
  placeholderIcon = 'doc.text',
  placeholderMessage
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
        {/* 왼쪽 액세서리 (돌아가기 버튼 등) */}
        {titleLeftAccessory && (
          <div className="center-pane-view__title-left-accessory">
            {titleLeftAccessory}
          </div>
        )}
        <h2 className="center-pane-view__title">
          {titleIcon && <span className="center-pane-view__title-icon">{titleIcon}</span>}
          {title}
          {titleAction && <span className="center-pane-view__title-action">{titleAction}</span>}
        </h2>
        {titleAccessory && (
          <div className="center-pane-view__title-accessory">
            {titleAccessory}
          </div>
        )}
        {/* X 버튼 제거 - 애플의 미니멀 디자인 철학 적용 */}
      </div>

      {/* 콘텐츠 영역 */}
      <div className="center-pane-view__content">
        {children || (
          <div className="center-pane-view__placeholder">
            <SFSymbol
              name={placeholderIcon}
              size={SFSymbolSize.TITLE_1}
              weight={SFSymbolWeight.ULTRALIGHT} // 더 서브틀한 아이콘
              decorative={true}
            />
            <p>{placeholderMessage || `${title} 인터페이스가 여기에 표시됩니다.`}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default CenterPaneView