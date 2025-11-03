/**
 * ImageViewer Component
 * @since 2025-11-03
 * @refactored 2025-11-03 - 공통 Hook 및 컴포넌트 적용 (DRY 원칙)
 *
 * 이미지 문서 프리뷰 컴포넌트
 * PDFViewer와 동일한 레이아웃 및 컨트롤 구조
 * Apple 디자인 철학 준수 - 깔끔하고 직관적인 컨트롤
 */

import React, { useState } from 'react'
import { ViewerControls } from '../ViewerControls'
import { useViewerControls } from '../../hooks/useViewerControls'
import '../../styles/viewer-common.css'
import './ImageViewer.css'

interface ImageViewerProps {
  /** 이미지 파일 URL */
  file: string
  /** 파일명 (alt text용) */
  alt?: string
  /** 다운로드 핸들러 */
  onDownload?: () => void
}

/**
 * ImageViewer React 컴포넌트
 *
 * 이미지 문서를 렌더링하고 확대/축소 기능 제공
 * PDFViewer와 동일한 UX
 * @example
 * ```tsx
 * <ImageViewer
 *   file="https://example.com/image.jpg"
 *   alt="문서 이미지"
 *   onDownload={handleDownload}
 * />
 * ```
 */
export const ImageViewer: React.FC<ImageViewerProps> = ({ file, alt = '이미지', onDownload }) => {
  // 🎯 공통 Hook 사용 (확대/축소/드래그)
  const controls = useViewerControls()

  // Image 전용 state
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 이미지 로드 핸들러
  const handleImageLoad = () => {
    setIsLoading(false)
    setError(null)
  }

  const handleImageError = () => {
    setIsLoading(false)
    setError('이미지를 불러오는 데 실패했습니다.')
  }

  return (
    <div className="viewer-container"> {/* 공통 CSS */}
      {/* Image Content */}
      <div
        className={`viewer-content image-viewer-content ${controls.scale > 1.0 ? (controls.isDragging ? 'viewer-content--dragging' : 'viewer-content--draggable') : ''}`}
        onMouseDown={controls.handleMouseDown}
        onMouseMove={controls.handleMouseMove}
        onMouseUp={controls.handleMouseUp}
        onMouseLeave={controls.handleMouseUp}
      >
        {isLoading && (
          <div className="viewer-loading">
            <div className="viewer-loading__spinner" aria-label="로딩 중" />
            <span>이미지를 불러오는 중...</span>
          </div>
        )}

        {error && (
          <div className="viewer-error">
            <span className="viewer-error__icon" aria-hidden="true">⚠️</span>
            <p className="viewer-error__message">{error}</p>
          </div>
        )}

        <div
          className="image-container"
          style={{
            // ⚠️ 예외: 런타임 동적 계산 (CSS로 불가능)
            transform: `translate(${controls.position.x}px, ${controls.position.y}px) scale(${controls.scale})`,
            display: isLoading || error ? 'none' : 'block'
          }}
        >
          <img
            src={file}
            alt={alt}
            className="image-viewer-image"
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        </div>
      </div>

      {/* 🎯 공통 컴포넌트 사용 (Controls) */}
      <ViewerControls
        scale={controls.scale}
        isModified={controls.isModified}
        onZoomIn={controls.zoomIn}
        onZoomOut={controls.zoomOut}
        onReset={controls.resetView}
        {...(onDownload ? { onDownload } : {})}
        // pageNav 없음 (이미지는 페이지 없음)
      />
    </div>
  )
}

export default ImageViewer
