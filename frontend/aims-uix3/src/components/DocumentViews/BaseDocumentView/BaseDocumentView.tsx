/**
 * BaseDocumentView Component
 * @since 1.0.0
 *
 * 문서 관리 View들의 공통 베이스 컴포넌트
 * 애플 디자인 시스템 및 AIMS 가이드라인 준수
 */

import React from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol'
import { CloseButton } from '@/shared/ui/CloseButton'
import './BaseDocumentView.css'

interface BaseDocumentViewProps {
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
 * BaseDocumentView React 컴포넌트
 *
 * CenterPane 위에 오버레이되는 문서 관리 View의 공통 기반
 * 애플의 Progressive Disclosure 원칙 적용
 *
 * @example
 * ```tsx
 * <BaseDocumentView
 *   visible={isVisible}
 *   title="문서 등록"
 *   onClose={handleClose}
 *   marginTop={4}
 *   marginBottom={4}
 *   marginLeft={4}
 *   marginRight={4}
 * >
 *   <div>콘텐츠</div>
 * </BaseDocumentView>
 * ```
 */
export const BaseDocumentView: React.FC<BaseDocumentViewProps> = ({
  visible,
  title,
  onClose,
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
      className={`base-document-view ${className}`}
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
      {/* 헤더 영역 */}
      <div className="base-document-view__header">
        <h2 className="base-document-view__title">
          {title}
        </h2>
        <CloseButton onClick={onClose} ariaLabel={`${title} 창 닫기`} size="lg" />
      </div>

      {/* 콘텐츠 영역 */}
      <div className="base-document-view__content">
        {children || (
          <div className="base-document-view__placeholder">
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

export default BaseDocumentView