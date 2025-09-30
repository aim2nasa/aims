/**
 * DownloadOnlyViewer Component
 * @since 1.0.0
 *
 * 미리보기를 지원하지 않는 파일 형식을 위한 다운로드 전용 뷰어
 * Apple 디자인 철학 준수 - 깔끔하고 직관적한 UI
 * PDFViewer/ImageViewer와 동일한 레이아웃 구조
 */

import React from 'react'
import './DownloadOnlyViewer.css'

interface DownloadOnlyViewerProps {
  /** 파일명 */
  fileName: string
  /** 다운로드 핸들러 */
  onDownload: () => void
}

/**
 * DownloadOnlyViewer React 컴포넌트
 *
 * 미리보기를 지원하지 않는 파일에 대해 다운로드 기능 제공
 * @example
 * ```tsx
 * <DownloadOnlyViewer
 *   fileName="document.hwp"
 *   onDownload={handleDownload}
 * />
 * ```
 */
export const DownloadOnlyViewer: React.FC<DownloadOnlyViewerProps> = ({
  fileName,
  onDownload
}) => {
  return (
    <div className="download-only-viewer">
      {/* 메인 콘텐츠 영역 */}
      <div className="download-only-content">
        <div className="preview-placeholder">
          {/* 파일 아이콘 */}
          <div className="file-icon" aria-hidden="true">
            📄
          </div>

          {/* 안내 메시지 */}
          <p className="preview-message">
            미리보기를 지원하지 않는 형식입니다
          </p>

          {/* 파일명 - 클릭 가능 */}
          <button
            className="file-name-badge file-name-badge--clickable"
            onClick={onDownload}
            aria-label={`${fileName} 다운로드`}
            title="클릭하여 다운로드"
          >
            <span className="file-name-text">
              {fileName}
            </span>
          </button>
        </div>
      </div>

      {/* === 🍎 APPLE STYLE CONTROLS === */}
      <div className="controls-container">
        {/* 왼쪽 공간 (균형) */}
        <div className="controls-spacer" />

        {/* 중앙 공간 */}
        <div className="controls-spacer" />

        {/* 오른쪽 - 다운로드 버튼 */}
        <button
          className="control-button control-button--primary"
          onClick={onDownload}
          aria-label={`${fileName} 다운로드`}
          title="다운로드"
        >
          <span aria-hidden="true">↓</span>
        </button>
      </div>
    </div>
  )
}

export default DownloadOnlyViewer
