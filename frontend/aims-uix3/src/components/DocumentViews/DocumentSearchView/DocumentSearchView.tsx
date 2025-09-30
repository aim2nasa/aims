/**
 * DocumentSearchView Component
 * @since 1.0.0
 *
 * 문서 검색 View 컴포넌트
 * BaseDocumentView를 확장하여 구현
 * /api/documents API를 사용하여 문서 리스트 표시
 */

import React from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import { useDocumentsController } from '@/controllers/useDocumentsController'
import { DocumentUtils } from '@/entities/document'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol'
import './DocumentSearchView.css'

interface DocumentSearchViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
}

/**
 * DocumentSearchView React 컴포넌트
 *
 * 문서 검색 및 리스트 표시 기능을 위한 View
 * 6px 마진으로 설정된 약간 넓은 간격 사용
 * 애플 디자인 철학 준수 - 서브틀하고 깔끔한 인터페이스
 *
 * @example
 * ```tsx
 * <DocumentSearchView
 *   visible={isVisible}
 *   onClose={handleClose}
 * />
 * ```
 */
export const DocumentSearchView: React.FC<DocumentSearchViewProps> = ({
  visible,
  onClose
}) => {
  const {
    documents,
    isLoading,
    isInitialLoad,
    error,
    searchQuery,
    searchResultMessage,
    isEmpty,
    currentPage,
    totalPages,
    loadDocuments,
    handleSearchChange,
    handlePageChange,
    clearError,
  } = useDocumentsController()

  // View가 열려있는 동안 주기적으로 데이터 새로고침 (3초마다)
  // Silent refresh: 초기 로딩 후에는 백그라운드에서 조용히 업데이트
  React.useEffect(() => {
    if (!visible) return

    // 즉시 로드 (초기 로딩)
    loadDocuments(undefined, false)

    // 3초마다 자동 새로고침 (silent mode)
    const intervalId = setInterval(() => {
      loadDocuments(undefined, true) // silent=true로 깜빡임 방지
    }, 3000)

    return () => clearInterval(intervalId)
  }, [visible, loadDocuments])

  return (
    <CenterPaneView
      visible={visible}
      title="문서 검색"
      onClose={onClose}
      marginTop={6}
      marginBottom={6}
      marginLeft={6}
      marginRight={6}
      className="document-search-view"
    >
      <div className="document-search-container">
        {/* 검색 바 */}
        <div className="document-search-bar">
          <div className="search-input-wrapper">
            <SFSymbol
              name="magnifyingglass"
              size={SFSymbolSize.BODY}
              weight={SFSymbolWeight.REGULAR}
              className="search-icon"
              decorative={true}
            />
            <input
              type="text"
              className="search-input"
              placeholder="파일명 또는 내용 검색..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              aria-label="문서 검색"
            />
            {searchQuery && (
              <button
                className="search-clear-button"
                onClick={() => handleSearchChange('')}
                aria-label="검색어 지우기"
              >
                <SFSymbol
                  name="xmark.circle.fill"
                  size={SFSymbolSize.BODY}
                  weight={SFSymbolWeight.REGULAR}
                  decorative={true}
                />
              </button>
            )}
          </div>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="document-search-error" role="alert">
            <SFSymbol
              name="exclamationmark.triangle.fill"
              size={SFSymbolSize.BODY}
              weight={SFSymbolWeight.REGULAR}
              className="error-icon"
              decorative={true}
            />
            <span>{error}</span>
            <button
              className="error-dismiss-button"
              onClick={clearError}
              aria-label="에러 메시지 닫기"
            >
              <SFSymbol
                name="xmark"
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.REGULAR}
                decorative={true}
              />
            </button>
          </div>
        )}

        {/* 검색 결과 헤더 */}
        {!isLoading && !isEmpty && (
          <div className="document-search-result-header">
            <span className="result-count">{searchResultMessage}</span>
          </div>
        )}

        {/* 문서 리스트 */}
        <div className="document-list">
          {isLoading && isInitialLoad ? (
            <div className="document-list-loading">
              <div className="loading-spinner" aria-label="로딩 중" />
              <span>문서를 불러오는 중...</span>
            </div>
          ) : isEmpty ? (
            <div className="document-list-empty">
              <SFSymbol
                name="doc.text"
                size={SFSymbolSize.TITLE_1}
                weight={SFSymbolWeight.ULTRALIGHT}
                className="empty-icon"
                decorative={true}
              />
              <p className="empty-message">
                {searchQuery ? '검색 결과가 없습니다' : '등록된 문서가 없습니다'}
              </p>
            </div>
          ) : (
            documents.map((document) => (
              <div key={document._id} className="document-item">
                {/* 🍎 ICON: File type indicator with color class */}
                <div className={`document-icon ${DocumentUtils.getFileTypeClass(document.mimeType, document.filename)}`}>
                  <SFSymbol
                    name={DocumentUtils.getFileIcon(document.mimeType, document.filename)}
                    size={SFSymbolSize.CAPTION_1}
                    weight={SFSymbolWeight.REGULAR}
                    decorative={true}
                  />
                </div>

                {/* 🍎 NAME: Primary information (flexible width) */}
                <div className="document-info">
                  <div className="document-name" title={DocumentUtils.getDisplayName(document)}>
                    {DocumentUtils.getDisplayName(document)}
                  </div>
                </div>

                {/* 🍎 SIZE: Fixed width column */}
                <span className="document-size">
                  {DocumentUtils.formatFileSize(document.size)}
                </span>

                {/* 🍎 DATE: Fixed width column */}
                <span className="document-date">
                  {DocumentUtils.formatUploadDate(document.uploadDate)}
                </span>

                {/* 🍎 TYPE: Fixed width column */}
                <span className="document-type">
                  {document.mimeType ? DocumentUtils.getFileExtension(document.mimeType) : '-'}
                </span>
              </div>
            ))
          )}
        </div>

        {/* 페이지네이션 */}
        {!isLoading && !isEmpty && totalPages > 1 && (
          <div className="document-pagination">
            <button
              className="pagination-button pagination-button--prev"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              aria-label="이전 페이지"
            >
              <span className="pagination-arrow">‹</span>
            </button>

            <div className="pagination-info">
              <span className="pagination-current">{currentPage}</span>
              <span className="pagination-separator">/</span>
              <span className="pagination-total">{totalPages}</span>
            </div>

            <button
              className="pagination-button pagination-button--next"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              aria-label="다음 페이지"
            >
              <span className="pagination-arrow">›</span>
            </button>
          </div>
        )}
      </div>
    </CenterPaneView>
  )
}

export default DocumentSearchView