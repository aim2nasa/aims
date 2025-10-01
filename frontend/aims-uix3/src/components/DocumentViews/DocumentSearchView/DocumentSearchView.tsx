/**
 * DocumentSearchView Component
 * @since 1.0.0
 *
 * 문서 검색 View 컴포넌트
 * Search.py 기능을 React로 구현
 */

import React from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import { useDocumentSearchController } from '@/controllers/useDocumentSearchController'
import { SearchService } from '@/services/searchService'
import type { SearchResultItem } from '@/entities/search'
import './DocumentSearchView.css'

interface DocumentSearchViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
  /** 문서 클릭 핸들러 (RightPane 프리뷰) */
  onDocumentClick?: (documentId: string) => void
}

/**
 * DocumentSearchView React 컴포넌트
 *
 * 시맨틱/키워드 검색 기능을 제공하며,
 * 검색 결과를 리스트로 표시합니다.
 *
 * @example
 * ```tsx
 * <DocumentSearchView
 *   visible={isVisible}
 *   onClose={handleClose}
 *   onDocumentClick={handleDocumentClick}
 * />
 * ```
 */
export const DocumentSearchView: React.FC<DocumentSearchViewProps> = ({
  visible,
  onClose,
  onDocumentClick
}) => {
  const {
    query,
    searchMode,
    keywordMode,
    results,
    answer,
    isLoading,
    error,
    handleSearch,
    handleQueryChange,
    handleSearchModeChange,
    handleKeywordModeChange,
  } = useDocumentSearchController()

  /**
   * Enter 키 입력 핸들러
   */
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  /**
   * 문서 클릭 핸들러
   */
  const handleItemClick = (item: SearchResultItem) => {
    const docId = SearchService.getDocumentId(item)
    if (docId && onDocumentClick) {
      onDocumentClick(docId)
    }
  }

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
        {/* 검색 입력 영역 */}
        <div className="search-input-section">
          <div className="search-input-row">
            <label className="search-label">검색어:</label>
            <input
              type="text"
              className="search-input"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="검색어를 입력하세요"
            />
          </div>

          <div className="search-options-row">
            <label className="search-label">검색 모드:</label>

            <div className="search-mode-group">
              <label className="radio-label">
                <input
                  type="radio"
                  name="searchMode"
                  value="semantic"
                  checked={searchMode === 'semantic'}
                  onChange={() => handleSearchModeChange('semantic')}
                />
                <span>시맨틱 검색</span>
              </label>

              <label className="radio-label">
                <input
                  type="radio"
                  name="searchMode"
                  value="keyword"
                  checked={searchMode === 'keyword'}
                  onChange={() => handleSearchModeChange('keyword')}
                />
                <span>키워드 검색</span>
              </label>
            </div>

            {/* 키워드 모드 선택 (키워드 검색시만 표시) */}
            {searchMode === 'keyword' && (
              <div className="keyword-mode-group">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="keywordMode"
                    value="AND"
                    checked={keywordMode === 'AND'}
                    onChange={() => handleKeywordModeChange('AND')}
                  />
                  <span>AND</span>
                </label>

                <label className="radio-label">
                  <input
                    type="radio"
                    name="keywordMode"
                    value="OR"
                    checked={keywordMode === 'OR'}
                    onChange={() => handleKeywordModeChange('OR')}
                  />
                  <span>OR</span>
                </label>
              </div>
            )}

            <button
              className="search-button"
              onClick={handleSearch}
              disabled={isLoading}
            >
              {isLoading ? '검색 중...' : '검색'}
            </button>
          </div>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="search-error">
            {error}
          </div>
        )}

        {/* 검색 결과 영역 */}
        <div className="search-results-section">
          {isLoading ? (
            <div className="search-loading">
              검색 중입니다. 잠시만 기다려 주세요...
            </div>
          ) : results.length > 0 ? (
            <>
              {/* AI 답변 (시맨틱 검색시) */}
              {answer && (
                <div className="search-answer">
                  <h3 className="answer-title">AI 답변:</h3>
                  <p className="answer-content">{answer}</p>
                </div>
              )}

              {/* 검색 결과 안내 */}
              <div className="search-results-header">
                {searchMode === 'semantic' ? (
                  <p>주어진 검색어와 유사도가 높은 상위 {results.length}개의 문서를 보여드립니다.</p>
                ) : (
                  <>
                    <p>총 {results.length}건의 결과가 발견되었습니다.</p>
                    <p className="results-divider">--- 검색 결과 ---</p>
                  </>
                )}
              </div>

              {/* 검색 결과 리스트 */}
              <div className="search-results-list">
                {results.map((item, index) => {
                  const originalName = SearchService.getOriginalName(item)
                  const summary = SearchService.getSummary(item)
                  const confidence = SearchService.getOCRConfidence(item)
                  const score = 'score' in item ? item.score : null

                  return (
                    <div
                      key={index}
                      className="search-result-item"
                      onClick={() => handleItemClick(item)}
                    >
                      <div className="result-header">
                        <span className="result-index">[{index + 1}]</span>
                        <span className="result-title">{originalName}</span>

                        {score !== null && (
                          <span className="result-score">
                            (유사도: {score.toFixed(4)},
                          </span>
                        )}

                        {confidence && (
                          <span className="result-confidence">
                            {score !== null ? '' : '('}문자 인식률: {confidence})
                          </span>
                        )}
                      </div>

                      <p className="result-summary">{summary}</p>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            !isLoading && (
              <div className="search-empty">
                상세 영역: 검색을 실행하면 결과가 표시됩니다.
              </div>
            )
          )}
        </div>
      </div>
    </CenterPaneView>
  )
}

export default DocumentSearchView
