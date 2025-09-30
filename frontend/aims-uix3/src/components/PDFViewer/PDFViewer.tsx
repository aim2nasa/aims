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
      <div className="pdf-viewer-content">
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
          <div className="pdf-page-container">
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

        {/* Download Button */}
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
  )
}

export default PDFViewer