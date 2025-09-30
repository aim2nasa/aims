/**
 * ImageViewer Component
 * @since 1.0.0
 *
 * 이미지 파일 프리뷰 컴포넌트
 * Apple 디자인 철학 준수 - 깔끔하고 직관적인 컨트롤
 * 지원 포맷: jpg, jpeg, png, gif, bmp, webp
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import './ImageViewer.css'

interface ImageViewerProps {
  /** 이미지 파일 URL */
  file: string
  /** 다운로드 핸들러 */
  onDownload?: () => void
}

/**
 * ImageViewer React 컴포넌트
 *
 * 이미지를 렌더링하고 확대/축소 기능 제공
 * @example
 * ```tsx
 * <ImageViewer
 *   file="https://example.com/image.jpg"
 *   onDownload={handleDownload}
 * />
 * ```
 */
export const ImageViewer: React.FC<ImageViewerProps> = ({ file, onDownload }) => {
  const [scale, setScale] = useState(1.0)
  const [imageLoading, setImageLoading] = useState(true)
  const [imageError, setImageError] = useState(false)
  const [maxImageWidth, setMaxImageWidth] = useState<number>(600)
  const containerRef = useRef<HTMLDivElement>(null)

  // 확대/축소 함수
  const zoomIn = useCallback(() => setScale(prev => Math.min(prev + 0.25, 3.0)), [])
  const zoomOut = useCallback(() => setScale(prev => Math.max(prev - 0.25, 0.2)), [])

  // 컨테이너 크기 변경에 따른 이미지 최대 너비 동적 조정
  useEffect(() => {
    const updateImageSize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth
        setMaxImageWidth(containerWidth * 0.9) // 90%로 설정
      }
    }

    updateImageSize()

    // ResizeObserver를 사용해서 크기 변화 감지
    const currentContainer = containerRef.current
    if (currentContainer) {
      const resizeObserver = new ResizeObserver(updateImageSize)
      resizeObserver.observe(currentContainer)

      return () => {
        resizeObserver.disconnect()
      }
    }

    return undefined
  }, [])

  const handleImageLoad = useCallback(() => {
    setImageLoading(false)
    setImageError(false)
  }, [])

  const handleImageError = useCallback(() => {
    setImageLoading(false)
    setImageError(true)
  }, [])

  if (imageError) {
    return (
      <div className="image-viewer-error">
        <div className="error-content">
          <span className="error-icon" aria-hidden="true">⚠️</span>
          <h3 className="error-title">이미지 로딩 오류</h3>
          <p className="error-message">이미지 파일을 불러오는 데 실패했습니다.</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="image-viewer-container">
      {/* 로딩 인디케이터 */}
      {imageLoading && (
        <div className="loading-indicator">
          <div className="loading-spinner" />
          <p className="loading-text">이미지를 불러오는 중입니다...</p>
        </div>
      )}

      {/* 이미지 콘텐츠 영역 */}
      <div className="image-content">
        <div className={`image-wrapper ${imageLoading ? 'image-hidden' : 'image-visible'}`}>
          <img
            src={file}
            alt="Preview"
            className="preview-image"
            style={{
              transform: `scale(${scale})`,
              maxWidth: `${maxImageWidth}px`
            }}
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        </div>
      </div>

      {/* === 🍎 APPLE STYLE CONTROLS === */}
      <div className="controls-container">
        {/* 왼쪽 공간 (균형) */}
        <div className="controls-spacer" />

        {/* 중앙 - 확대/축소 컨트롤 */}
        <div className="zoom-controls">
          <button
            className="control-button control-button--ghost"
            onClick={zoomOut}
            disabled={scale <= 0.2}
            aria-label="이미지 축소"
            title="이미지를 축소합니다"
          >
            <span aria-hidden="true">−</span>
          </button>
          <span className="zoom-text" aria-live="polite">
            {Math.round(scale * 100)}%
          </span>
          <button
            className="control-button control-button--ghost"
            onClick={zoomIn}
            disabled={scale >= 3.0}
            aria-label="이미지 확대"
            title="이미지를 확대합니다"
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>

        {/* 오른쪽 - 다운로드 버튼 */}
        {onDownload && (
          <button
            className="control-button control-button--primary"
            onClick={onDownload}
            aria-label="이미지 다운로드"
            title="다운로드"
          >
            <span aria-hidden="true">↓</span>
          </button>
        )}
      </div>
    </div>
  )
}

export default ImageViewer
