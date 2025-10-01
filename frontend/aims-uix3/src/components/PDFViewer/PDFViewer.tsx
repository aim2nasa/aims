/**
 * PDFViewer Component
 * @since 1.0.0
 *
 * PDF 문서 프리뷰 컴포넌트
 * react-pdf를 사용하여 PDF 렌더링
 * Apple 디자인 철학 준수 - 깔끔하고 직관적인 컨트롤
 */

import React, { useState, useCallback, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import './PDFViewer.css'

// PDF.js 워커 설정
pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`

interface PDFViewerProps {
  /** PDF 파일 URL */
  file: string
  /** 다운로드 핸들러 */
  onDownload?: () => void
}

/**
 * PDFViewer React 컴포넌트
 *
 * PDF 문서를 렌더링하고 페이지 네비게이션, 확대/축소 기능 제공
 * @example
 * ```tsx
 * <PDFViewer
 *   file="https://example.com/document.pdf"
 *   onDownload={handleDownload}
 * />
 * ```
 */
export const PDFViewer: React.FC<PDFViewerProps> = ({ file, onDownload }) => {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.0)
  const [containerWidth, setContainerWidth] = useState(600)
  const [error, setError] = useState<string | null>(null)
  const [isRetrying, setIsRetrying] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setPageNumber(1)
    setError(null)
    setIsRetrying(false)
  }, [])

  const onDocumentLoadError = useCallback((error: Error) => {
    setError(error.message || 'PDF 파일을 불러오는 데 실패했습니다.')

    // Worker 관련 오류인 경우 CDN fallback 시도
    if (error.message?.includes('worker') && !isRetrying) {
      setIsRetrying(true)
      pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
    }
  }, [isRetrying])

  const handleRetry = useCallback(() => {
    setError(null)
    setIsRetrying(false)
  }, [])

  const changePage = useCallback((offset: number) => {
    setPageNumber(prevPageNumber => prevPageNumber + offset)
  }, [])

  const previousPage = () => changePage(-1)
  const nextPage = () => changePage(1)

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

  // 스케일이나 페이지 변경 시 위치 초기화
  useEffect(() => {
    setPosition({ x: 0, y: 0 })
  }, [scale, pageNumber])

  // 뷰가 기본 상태에서 벗어났는지 확인
  const isModified = scale !== 1.0 || position.x !== 0 || position.y !== 0

  // 컨테이너 크기에 따른 PDF 너비 동적 조정
  useEffect(() => {
    const updateContainerWidth = () => {
      const rightPane = document.querySelector('.layout-rightpane-content')
      if (rightPane) {
        const paneWidth = rightPane.clientWidth
        const optimalWidth = paneWidth * 0.85
        setContainerWidth(optimalWidth)
      }
    }

    updateContainerWidth()

    const rightPane = document.querySelector('.layout-rightpane-content')
    if (rightPane) {
      const resizeObserver = new ResizeObserver(updateContainerWidth)
      resizeObserver.observe(rightPane)

      return () => {
        resizeObserver.disconnect()
      }
    }

    return undefined
  }, [])

  return (
    <div className="pdf-viewer">
      {/* PDF Document */}
      <div
        className={`pdf-viewer-content ${scale > 1.0 ? (isDragging ? 'pdf-viewer-content--dragging' : 'pdf-viewer-content--draggable') : ''}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <Document
          file={file}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={
            <div className="pdf-viewer-loading">
              <div className="loading-spinner" aria-label="로딩 중" />
              <span>{isRetrying ? 'CDN으로 재시도 중...' : '문서를 불러오는 중...'}</span>
            </div>
          }
          error={
            <div className="pdf-viewer-error">
              <span className="error-icon" aria-hidden="true">⚠️</span>
              <p className="error-message">{error || 'PDF 파일을 불러오는 데 실패했습니다.'}</p>
              {!isRetrying && (
                <button className="retry-button" onClick={handleRetry}>
                  다시 시도
                </button>
              )}
            </div>
          }
        >
          <div
            className="pdf-page-container"
            style={{
              // ⚠️ 예외: 런타임 동적 계산 (CSS로 불가능)
              transform: `translate(${position.x}px, ${position.y}px)`
            }}
          >
            <Page
              pageNumber={pageNumber}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              scale={scale}
              width={containerWidth}
            />
          </div>
        </Document>
      </div>

      {/* Controls */}
      <div className="pdf-viewer-controls">
        {/* Left - Reset Button */}
        <div className="controls-left">
          {isModified && (
            <button
              className="control-button control-button--ghost"
              onClick={resetView}
              aria-label="원래 크기로 되돌리기"
              title="100% 크기로 중앙 정렬"
            >
              <span aria-hidden="true">⟲</span>
            </button>
          )}
        </div>

        {/* Center - Page Navigation and Zoom */}
        <div className="controls-center">
          {/* Page Navigation */}
          <div className="controls-section">
            <button
              className="control-button"
              disabled={pageNumber <= 1}
              onClick={previousPage}
              aria-label="이전 페이지"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <span className="page-info">
              {pageNumber} / {numPages || '--'}
            </span>
            <button
              className="control-button"
              disabled={pageNumber >= (numPages || 0)}
              onClick={nextPage}
              aria-label="다음 페이지"
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="controls-section">
            <button
              className="control-button"
              onClick={zoomOut}
              aria-label="축소"
            >
              <span aria-hidden="true">−</span>
            </button>
            <span className="zoom-info">{Math.round(scale * 100)}%</span>
            <button
              className="control-button"
              onClick={zoomIn}
              aria-label="확대"
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>
        </div>

        {/* Right - Download Button */}
        <div className="controls-right">
          {onDownload && (
            <button
              className="control-button control-button--primary"
              onClick={onDownload}
              aria-label="다운로드"
              title="다운로드"
            >
              <span aria-hidden="true">↓</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default PDFViewer