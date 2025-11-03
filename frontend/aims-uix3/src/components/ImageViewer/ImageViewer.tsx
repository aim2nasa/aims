/**
 * ImageViewer Component
 * @since 2025-11-03
 *
 * 이미지 문서 프리뷰 컴포넌트
 * PDFViewer와 동일한 레이아웃 및 컨트롤 구조
 * Apple 디자인 철학 준수 - 깔끔하고 직관적인 컨트롤
 */

import React, { useState, useCallback, useEffect } from 'react'
import Tooltip from '../../shared/ui/Tooltip'
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
  const [scale, setScale] = useState(1.0)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const zoomIn = useCallback(() => setScale(prev => Math.min(prev + 0.25, 3.0)), [])
  const zoomOut = useCallback(() => setScale(prev => Math.max(prev - 0.25, 0.5)), [])
  const resetView = useCallback(() => {
    setScale(1.0)
    setPosition({ x: 0, y: 0 })
  }, [])

  // 마우스 휠로 확대/축소
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setScale(prev => Math.max(0.5, Math.min(3.0, prev + delta)))
  }, [])

  // 마우스 드래그 시작
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1.0) return // 확대되지 않았으면 드래그 불가
    setIsDragging(true)
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    })
  }, [scale, position])

  // 마우스 드래그 중
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    })
  }, [isDragging, dragStart])

  // 마우스 드래그 종료
  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // 스케일 변경 시 위치 초기화
  useEffect(() => {
    setPosition({ x: 0, y: 0 })
  }, [scale])

  // 뷰가 기본 상태에서 벗어났는지 확인
  const isModified = scale !== 1.0 || position.x !== 0 || position.y !== 0

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
    <div className="image-viewer">
      {/* Image Content */}
      <div
        className={`image-viewer-content ${scale > 1.0 ? (isDragging ? 'image-viewer-content--dragging' : 'image-viewer-content--draggable') : ''}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {isLoading && (
          <div className="image-viewer-loading">
            <div className="loading-spinner" aria-label="로딩 중" />
            <span>이미지를 불러오는 중...</span>
          </div>
        )}

        {error && (
          <div className="image-viewer-error">
            <span className="error-icon" aria-hidden="true">⚠️</span>
            <p className="error-message">{error}</p>
          </div>
        )}

        <div
          className="image-container"
          style={{
            // ⚠️ 예외: 런타임 동적 계산 (CSS로 불가능)
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
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

      {/* Controls - PDFViewer와 동일한 구조 */}
      <div className="image-viewer-controls">
        {/* Left - Reset Button */}
        <div className="controls-left">
          {isModified && (
            <Tooltip content="원래 크기로 리셋">
              <button
                className="control-button control-button--ghost"
                onClick={resetView}
                aria-label="원래 크기로 되돌리기"
              >
                <span aria-hidden="true">⟲</span>
              </button>
            </Tooltip>
          )}
        </div>

        {/* Center - Zoom Controls */}
        <div className="controls-center">
          <div className="controls-section">
            <Tooltip content="축소">
              <button
                className="control-button"
                onClick={zoomOut}
                aria-label="축소"
              >
                <span aria-hidden="true">−</span>
              </button>
            </Tooltip>
            <span className="zoom-info">{Math.round(scale * 100)}%</span>
            <Tooltip content="확대">
              <button
                className="control-button"
                onClick={zoomIn}
                aria-label="확대"
              >
                <span aria-hidden="true">+</span>
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Right - Download Button */}
        <div className="controls-right">
          {onDownload && (
            <Tooltip content="다운로드">
              <button
                className="control-button control-button--primary"
                onClick={onDownload}
                aria-label="다운로드"
              >
                <span aria-hidden="true">↓</span>
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  )
}

export default ImageViewer
