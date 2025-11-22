/**
 * ViewerControls Component
 * @since 2025-11-03
 *
 * PDFViewer, ImageViewer 등 모든 뷰어의 공통 컨트롤 UI
 * DRY 원칙 적용 - 중복 JSX 제거
 * Apple 디자인 철학 준수 - 깔끔하고 직관적한 컨트롤
 */

import React from 'react'
import Tooltip from '../../shared/ui/Tooltip'
import './ViewerControls.css'

interface PageNavigation {
  currentPage: number
  totalPages: number | null
  onPrevPage: () => void
  onNextPage: () => void
}

export interface ViewerControlsProps {
  /** 현재 확대 비율 */
  scale: number
  /** 뷰가 기본 상태에서 벗어났는지 여부 */
  isModified: boolean
  /** 확대 핸들러 */
  onZoomIn: () => void
  /** 축소 핸들러 */
  onZoomOut: () => void
  /** 리셋 핸들러 */
  onReset: () => void
  /** 다운로드 핸들러 (선택적) */
  onDownload?: () => void
  /** 페이지 네비게이션 (PDF 전용, 선택적) */
  pageNav?: PageNavigation
}

/**
 * ViewerControls React 컴포넌트
 *
 * 모든 뷰어의 하단 컨트롤 바 (확대/축소, 페이지 네비게이션, 다운로드)
 *
 * @example
 * ```tsx
 * // ImageViewer - 페이지 네비게이션 없음
 * <ViewerControls
 *   scale={1.5}
 *   isModified={true}
 *   onZoomIn={handleZoomIn}
 *   onZoomOut={handleZoomOut}
 *   onReset={handleReset}
 *   onDownload={handleDownload}
 * />
 *
 * // PDFViewer - 페이지 네비게이션 포함
 * <ViewerControls
 *   scale={1.0}
 *   isModified={false}
 *   onZoomIn={handleZoomIn}
 *   onZoomOut={handleZoomOut}
 *   onReset={handleReset}
 *   onDownload={handleDownload}
 *   pageNav={{
 *     currentPage: 1,
 *     totalPages: 10,
 *     onPrevPage: handlePrev,
 *     onNextPage: handleNext
 *   }}
 * />
 * ```
 */
export const ViewerControls: React.FC<ViewerControlsProps> = ({
  scale,
  isModified,
  onZoomIn,
  onZoomOut,
  onReset,
  onDownload,
  pageNav
}) => {
  return (
    <div
      className="viewer-controls"
      onDoubleClick={(e) => e.stopPropagation()} // 더블클릭 이벤트 전파 차단 (페이지 네비게이션 클릭 시 모달 전환 방지)
    >
      {/* Left - Reset Button */}
      <div className="viewer-controls__left">
        {isModified && (
          <Tooltip content="원래 크기로 리셋">
            <button
              className="viewer-controls__button viewer-controls__button--ghost"
              onClick={onReset}
              aria-label="원래 크기로 되돌리기"
            >
              <span aria-hidden="true">⟲</span>
            </button>
          </Tooltip>
        )}
      </div>

      {/* Center - Page Navigation (PDF only) + Zoom Controls */}
      <div className="viewer-controls__center">
        {/* Page Navigation - PDF 전용 */}
        {pageNav && (
          <div className="viewer-controls__section">
            <Tooltip content="이전 페이지">
              <button
                className="viewer-controls__button"
                disabled={pageNav.currentPage <= 1}
                onClick={pageNav.onPrevPage}
                aria-label="이전 페이지"
              >
                <span aria-hidden="true">‹</span>
              </button>
            </Tooltip>
            <span className="viewer-controls__info">
              {pageNav.currentPage} / {pageNav.totalPages || '--'}
            </span>
            <Tooltip content="다음 페이지">
              <button
                className="viewer-controls__button"
                disabled={pageNav.currentPage >= (pageNav.totalPages || 0)}
                onClick={pageNav.onNextPage}
                aria-label="다음 페이지"
              >
                <span aria-hidden="true">›</span>
              </button>
            </Tooltip>
          </div>
        )}

        {/* Zoom Controls */}
        <div className="viewer-controls__section">
          <Tooltip content="축소">
            <button
              className="viewer-controls__button"
              onClick={onZoomOut}
              aria-label="축소"
            >
              <span aria-hidden="true">−</span>
            </button>
          </Tooltip>
          <span className="viewer-controls__info">
            {Math.round(scale * 100)}%
          </span>
          <Tooltip content="확대">
            <button
              className="viewer-controls__button"
              onClick={onZoomIn}
              aria-label="확대"
            >
              <span aria-hidden="true">+</span>
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Right - Download Button */}
      <div className="viewer-controls__right">
        {onDownload && (
          <Tooltip content="다운로드">
            <button
              className="viewer-controls__button viewer-controls__button--primary"
              onClick={onDownload}
              aria-label="다운로드"
            >
              <span aria-hidden="true">↓</span>
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

export default ViewerControls
