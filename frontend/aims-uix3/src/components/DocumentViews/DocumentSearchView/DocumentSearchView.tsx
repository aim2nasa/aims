/**
 * DocumentSearchView Component
 * @since 1.0.0
 *
 * 🍎 iOS Spotlight Search 스타일 문서 검색 View
 * DocumentLibrary와 완벽한 디자인 일관성
 * Search.py 기능을 React + iOS 네이티브 스타일로 구현
 */

import React from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import { useDocumentSearch } from '@/contexts/DocumentSearchContext'
import { SearchService } from '@/services/searchService'
import type { SearchResultItem, SearchMode, KeywordMode } from '@/entities/search'
import { Dropdown, type DropdownOption } from '@/shared/ui'
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
 * iOS Spotlight 스타일의 검색 UI를 제공합니다.
 * Progressive Disclosure 원칙에 따라 필요한 옵션만 단계적으로 표시됩니다.
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
// 검색 모드 옵션 정의
const SEARCH_MODE_OPTIONS: DropdownOption[] = [
  { value: 'keyword', label: '키워드 검색' },
  { value: 'semantic', label: 'AI 검색 (실험적)' },
]

// 키워드 모드 옵션 정의
const KEYWORD_MODE_OPTIONS: DropdownOption[] = [
  { value: 'AND', label: 'AND' },
  { value: 'OR', label: 'OR' },
]

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
  } = useDocumentSearch()

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
        {/* 🍎 iOS Spotlight 검색바 - 한 줄 레이아웃 */}
        <div className="search-bar-wrapper">
          {/* A: 검색 입력 필드 (flex-grow) */}
          <div className="search-input-wrapper">
            <span className="search-icon" aria-hidden="true">🔍</span>
            <input
              type="text"
              className="search-input"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="문서 검색"
              aria-label="문서 검색"
            />
          </div>

          {/* B: 검색 모드 드롭다운 */}
          <Dropdown
            value={searchMode}
            options={SEARCH_MODE_OPTIONS}
            onChange={(value) => handleSearchModeChange(value as SearchMode)}
            aria-label="검색 모드 선택"
            width={135}
          />

          {/* 🍎 Progressive Disclosure: 키워드 검색 시 드롭다운으로 AND/OR 선택 */}
          {searchMode === 'keyword' && (
            <Dropdown
              value={keywordMode}
              options={KEYWORD_MODE_OPTIONS}
              onChange={(value) => handleKeywordModeChange(value as KeywordMode)}
              aria-label="키워드 모드 선택"
              width={75}
            />
          )}

          {/* 검색 버튼 */}
          <button
            className="search-button"
            onClick={handleSearch}
            disabled={isLoading}
            aria-label={isLoading ? '검색 중' : '검색 실행'}
          >
            {isLoading ? '검색 중...' : '검색'}
          </button>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="search-error" role="alert" aria-live="assertive">
            {error}
          </div>
        )}

        {/* 검색 결과 영역 */}
        <div className="search-results-section">
          {isLoading ? (
            <div className="search-loading" role="status" aria-live="polite">
              검색 중입니다. 잠시만 기다려 주세요...
            </div>
          ) : results.length > 0 ? (
            <>
              {/* AI 답변 (시맨틱 검색시) */}
              {answer && (
                <div className="search-answer">
                  <h3 className="answer-title">AI 답변</h3>
                  <p className="answer-content">{answer}</p>
                </div>
              )}

              {/* 검색 결과 헤더 */}
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

              {/* 🍎 iOS Table View 스타일 결과 리스트 */}
              <div className="search-results-table" role="list">
                {results.map((item, index) => {
                  const originalName = SearchService.getOriginalName(item)
                  const summary = SearchService.getSummary(item)
                  const confidence = SearchService.getOCRConfidence(item)
                  const score = 'score' in item ? item.score : null

                  return (
                    <div
                      key={index}
                      className="search-result-row"
                      onClick={() => handleItemClick(item)}
                      role="listitem"
                      tabIndex={0}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleItemClick(item)
                        }
                      }}
                      aria-label={`문서: ${originalName}`}
                    >
                      {/* Leading: 인덱스 */}
                      <div className="row-leading">
                        <span className="row-index">[{index + 1}]</span>
                      </div>

                      {/* Content: 제목 + 요약 */}
                      <div className="row-content">
                        <div className="row-title">{originalName}</div>
                        <div className="row-subtitle">{summary}</div>
                      </div>

                      {/* Trailing: 점수 + 화살표 */}
                      <div className="row-trailing">
                        {score !== null && (
                          <div className="row-detail">
                            유사도: {score.toFixed(4)}
                          </div>
                        )}
                        {confidence && !score && (
                          <div className="row-detail">
                            인식률: {confidence}
                          </div>
                        )}
                        <span className="row-chevron" aria-hidden="true">›</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            !isLoading && (
              <div className="search-empty" role="status">
                검색을 실행하면 결과가 표시됩니다.
              </div>
            )
          )}
        </div>
      </div>
    </CenterPaneView>
  )
}

export default DocumentSearchView
