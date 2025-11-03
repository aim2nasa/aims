/**
 * PDFViewer Component
 * @since 1.0.0
 * @refactored 2025-11-03 - 공통 Hook 및 컴포넌트 적용 (DRY 원칙)
 *
 * PDF 문서 프리뷰 컴포넌트
 * react-pdf를 사용하여 PDF 렌더링
 * Apple 디자인 철학 준수 - 깔끔하고 직관적인 컨트롤
 */

import React, { useState, useCallback, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { ViewerControls } from '../ViewerControls'
import { useViewerControls } from '../../hooks/useViewerControls'
import '../../styles/viewer-common.css'
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
  /** 초기 scale (fit to page) */
  initialScale?: number
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
export const PDFViewer: React.FC<PDFViewerProps> = ({ file, onDownload, initialScale }) => {
  // 🎯 공통 Hook 사용 (확대/축소/드래그)
  const controls = useViewerControls(initialScale)

  // PDF 전용 state
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [containerWidth, setContainerWidth] = useState(600)
  const [error, setError] = useState<string | null>(null)
  const [isRetrying, setIsRetrying] = useState(false)

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

  // 페이지 변경 시 위치 초기화
  useEffect(() => {
    controls.resetView()
  }, [pageNumber])

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
    <div className="viewer-container"> {/* 공통 CSS */}
      {/* PDF Document */}
      <div
        className={`viewer-content pdf-viewer-content ${controls.scale > 1.0 ? (controls.isDragging ? 'viewer-content--dragging' : 'viewer-content--draggable') : ''}`}
        onMouseDown={controls.handleMouseDown}
        onMouseMove={controls.handleMouseMove}
        onMouseUp={controls.handleMouseUp}
        onMouseLeave={controls.handleMouseUp}
      >
        <Document
          file={file}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={
            <div className="viewer-loading">
              <div className="viewer-loading__spinner" aria-label="로딩 중" />
              <span>{isRetrying ? 'CDN으로 재시도 중...' : '문서를 불러오는 중...'}</span>
            </div>
          }
          error={
            <div className="viewer-error">
              <span className="viewer-error__icon" aria-hidden="true">⚠️</span>
              <p className="viewer-error__message">{error || 'PDF 파일을 불러오는 데 실패했습니다.'}</p>
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
              transform: `translate(${controls.position.x}px, ${controls.position.y}px)`
            }}
          >
            <Page
              pageNumber={pageNumber}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              scale={controls.scale}
              width={containerWidth}
            />
          </div>
        </Document>
      </div>

      {/* 🎯 공통 컴포넌트 사용 (Controls) */}
      <ViewerControls
        scale={controls.scale}
        isModified={controls.isModified}
        onZoomIn={controls.zoomIn}
        onZoomOut={controls.zoomOut}
        onReset={controls.resetView}
        {...(onDownload ? { onDownload } : {})}
        pageNav={{
          currentPage: pageNumber,
          totalPages: numPages,
          onPrevPage: previousPage,
          onNextPage: nextPage
        }}
      />
    </div>
  )
}

export default PDFViewer
