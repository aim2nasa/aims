/**
 * BaseViewer Component
 * @since 1.0.0
 *
 * RightPane 위 모든 뷰어의 공통 상위 컴포넌트
 * 닫기 버튼, 타이틀바 등 공통 UI 제공
 * 애플 디자인 시스템 및 AIMS 가이드라인 준수
 */

import React from 'react'
import { CloseButton } from '@/shared/ui/CloseButton'
import './BaseViewer.css'

interface BaseViewerProps {
  /** 뷰어 표시 여부 */
  visible: boolean
  /** 파일명 또는 제목 */
  title?: React.ReactNode
  /** 뷰어 닫기 핸들러 */
  onClose: () => void
  /** 자식 컴포넌트 (실제 뷰어) */
  children: React.ReactNode
  /** RightPane과의 좌측 간격 (px) */
  gapLeft?: number
  /** RightPane과의 우측 간격 (px) */
  gapRight?: number
  /** RightPane과의 상단 간격 (px) */
  gapTop?: number
  /** RightPane과의 하단 간격 (px) */
  gapBottom?: number
}

/**
 * BaseViewer React 컴포넌트
 *
 * RightPane에서 사용되는 모든 뷰어의 공통 컨테이너
 *
 * 상속 구조:
 * - BaseViewer (상위 클래스)
 *   ├── PDFViewer
 *   ├── ImageViewer
 *   ├── DownloadOnlyViewer
 *   └── (향후 추가될 뷰어들...)
 *
 * @example
 * ```tsx
 * <BaseViewer
 *   visible={true}
 *   title="document.pdf"
 *   onClose={handleClose}
 * >
 *   <PDFViewer file={fileUrl} />
 * </BaseViewer>
 * ```
 */
export const BaseViewer: React.FC<BaseViewerProps> = ({
  visible,
  title,
  onClose,
  children,
  gapLeft = 2,
  gapRight = 2,
  gapTop = 2,
  gapBottom = 2
}) => {
  if (!visible) return null

  const ariaLabel = typeof title === 'string' ? title : '문서 뷰어'

  return (
    <div
      className="base-viewer"
      role="dialog"
      aria-label={ariaLabel}
      aria-modal="true"
      style={{
        top: `${gapTop}px`,
        left: `${gapLeft}px`,
        right: `${gapRight}px`,
        bottom: `${gapBottom}px`
      }}
    >
      {/* 🍎 헤더 영역 - iOS 스타일 */}
      <div className="base-viewer__header">
        {title && (
          <h2 className="base-viewer__title">
            {title}
          </h2>
        )}

        {/* 🍎 닫기 버튼 - CloseButton 공통 컴포넌트 */}
        <CloseButton onClick={onClose} ariaLabel="뷰어 닫기" />
      </div>

      {/* 콘텐츠 영역 - 실제 뷰어 렌더링 */}
      <div className="base-viewer__content">
        {children}
      </div>
    </div>
  )
}

export default BaseViewer
