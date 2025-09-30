/**
 * DocumentLibraryView Component
 * @since 1.0.0
 *
 * 문서 라이브러리 View 컴포넌트
 * BaseDocumentView를 확장하여 구현
 * /api/documents API를 사용하여 문서 리스트 표시
 */

import React from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import { useDocumentsController } from '@/controllers/useDocumentsController'
import { DocumentUtils } from '@/entities/document'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol'
import './DocumentLibraryView.css'

interface DocumentLibraryViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
  /** 문서 클릭 핸들러 */
  onDocumentClick?: (documentId: string) => void
}

/**
 * DocumentLibraryView React 컴포넌트
 *
 * 문서 라이브러리 및 리스트 표시 기능을 위한 View
 * 6px 마진으로 설정된 약간 넓은 간격 사용
 * 애플 디자인 철학 준수 - 서브틀하고 깔끔한 인터페이스
 *
 * @example
 * ```tsx
 * <DocumentLibraryView
 *   visible={isVisible}
 *   onClose={handleClose}
 * />
 * ```
 */
export const DocumentLibraryView: React.FC<DocumentLibraryViewProps> = ({
  visible,
  onClose,
  onDocumentClick
}) => {
  const {
    documents,
    isLoading,
    isInitialLoad,
    error,
    searchQuery,
    searchParams,
    searchResultMessage,
    isEmpty,
    currentPage,
    totalPages,
    itemsPerPage,
    loadDocuments,
    handleSearchChange,
    handleSortChange,
    handlePageChange,
    handleLimitChange,
    clearError,
  } = useDocumentsController()

  // 현재 정렬 상태
  const currentSortBy = searchParams.sortBy || 'uploadDate'
  const currentSortOrder = searchParams.sortOrder || 'desc'

  // 정렬 옵션을 결합한 값
  const sortValue = `${currentSortBy}_${currentSortOrder}`

  // 정렬 변경 핸들러
  const handleSortSelectChange = (value: string) => {
    const [sortBy, sortOrder] = value.split('_')
    if (sortBy && sortOrder) {
      handleSortChange(sortBy, sortOrder as 'asc' | 'desc')
    }
  }

  // View가 열려있는 동안 주기적으로 데이터 새로고침 (3초마다)
  // Silent refresh: 초기 로딩 후에는 백그라운드에서 조용히 업데이트
  React.useEffect(() => {
    if (!visible) return

    // 즉시 로드 (초기 로딩)
    loadDocuments(searchParams, false)

    // 3초마다 자동 새로고침 (silent mode)
    const intervalId = setInterval(() => {
      loadDocuments(searchParams, true) // silent=true로 깜빡임 방지
    }, 3000)

    return () => clearInterval(intervalId)
  }, [visible, loadDocuments, searchParams])

  return (
    <CenterPaneView
      visible={visible}
      title="문서 라이브러리"
      onClose={onClose}
      marginTop={6}
      marginBottom={6}
      marginLeft={6}
      marginRight={6}
      className="document-library-view"
    >
      <div className="document-library-container">
        {/* 검색 바 */}
        <div className="document-library-bar">
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
              placeholder="파일명 또는 파일 형식 검색..."
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
          <div className="document-library-error" role="alert">
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
          <div className="document-library-result-header">
            <span className="result-count">{searchResultMessage}</span>

            {/* 🍎 정렬 드롭다운 */}
            <div className="sort-selector">
              <select
                className="sort-select"
                value={sortValue}
                onChange={(e) => handleSortSelectChange(e.target.value)}
                aria-label="정렬 기준 선택"
              >
                <option value="uploadDate_desc">최신순</option>
                <option value="uploadDate_asc">오래된순</option>
                <option value="filename_asc">이름순 (가나다)</option>
                <option value="filename_desc">이름순 (하파타)</option>
                <option value="size_desc">크기순 (큰 것부터)</option>
                <option value="size_asc">크기순 (작은 것부터)</option>
              </select>
            </div>
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
              <div
                key={document._id}
                className="document-item"
                onClick={() => onDocumentClick?.(document._id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onDocumentClick?.(document._id);
                  }
                }}
              >
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
        {!isLoading && !isEmpty && (
          <div className="document-pagination">
            {/* 🍎 페이지당 항목 수 선택 */}
            <div className="pagination-limit">
              <select
                className="pagination-limit-select"
                value={itemsPerPage}
                onChange={(e) => handleLimitChange(Number(e.target.value))}
                aria-label="페이지당 항목 수"
              >
                <option value={10}>10개씩</option>
                <option value={20}>20개씩</option>
                <option value={50}>50개씩</option>
                <option value={100}>100개씩</option>
              </select>
            </div>

            {/* 🍎 페이지 네비게이션 - 페이지가 2개 이상일 때만 표시 */}
            {totalPages > 1 && (
              <div className="pagination-controls">
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

            {/* 🍎 페이지가 1개일 때 빈 공간 유지 */}
            {totalPages <= 1 && <div className="pagination-spacer"></div>}
          </div>
        )}
      </div>
    </CenterPaneView>
  )
}

export default DocumentLibraryView