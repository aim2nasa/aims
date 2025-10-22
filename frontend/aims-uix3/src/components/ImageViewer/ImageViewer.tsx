/**
 * ImageViewer Component
 * @since 1.0.0
 *
 * 이미지 파일 프리뷰 컴포넌트
 * Apple 디자인 철학 준수 - 깔끔하고 직관적인 컨트롤
 * 지원 포맷: jpg, jpeg, png, gif, bmp, webp
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import Tooltip from '../../shared/ui/Tooltip'
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
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLDivElement>(null)

  // 확대/축소 함수
  const zoomIn = useCallback(() => setScale(prev => Math.min(prev + 0.25, 3.0)), [])
  const zoomOut = useCallback(() => setScale(prev => Math.max(prev - 0.25, 0.2)), [])
  const resetView = useCallback(() => {
    setScale(1.0)
    setPosition({ x: 0, y: 0 })
  }, [])

  // 마우스 휠로 확대/축소
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setScale(prev => Math.max(0.2, Math.min(3.0, prev + delta)))
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
    if (scale <= 1.0) {
      setPosition({ x: 0, y: 0 })
    }
  }, [scale])

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

  // 뷰가 기본 상태에서 벗어났는지 확인
  const isModified = scale !== 1.0 || position.x !== 0 || position.y !== 0

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
      <div
        className={`image-content ${scale > 1.0 ? (isDragging ? 'image-content--dragging' : 'image-content--draggable') : ''}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          ref={imageRef}
          className={`image-wrapper ${imageLoading ? 'image-hidden' : 'image-visible'}`}
        >
          <img
            src={file}
            alt="Preview"
            className="preview-image"
            style={{
              // ⚠️ 예외: 런타임 동적 계산 (CSS로 불가능)
              transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
              maxWidth: `${maxImageWidth}px`
            }}
            onLoad={handleImageLoad}
            onError={handleImageError}
            draggable={false}
          />
        </div>
      </div>

      {/* === 🍎 APPLE STYLE CONTROLS === */}
      <div className="controls-container">
        {/* 왼쪽 - 리셋 버튼 */}
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

        {/* 중앙 - 확대/축소 컨트롤 */}
        <div className="zoom-controls">
          <Tooltip content="축소">
            <button
              className="control-button control-button--ghost"
              onClick={zoomOut}
              disabled={scale <= 0.2}
              aria-label="이미지 축소"
            >
              <span aria-hidden="true">−</span>
            </button>
          </Tooltip>
          <span className="zoom-text" aria-live="polite">
            {Math.round(scale * 100)}%
          </span>
          <Tooltip content="확대">
            <button
              className="control-button control-button--ghost"
              onClick={zoomIn}
              disabled={scale >= 3.0}
              aria-label="이미지 확대"
            >
              <span aria-hidden="true">+</span>
            </button>
          </Tooltip>
        </div>

        {/* 오른쪽 - 다운로드 버튼 */}
        <div className="controls-right">
          {onDownload && (
            <Tooltip content="다운로드">
              <button
                className="control-button control-button--primary"
                onClick={onDownload}
                aria-label="이미지 다운로드"
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
