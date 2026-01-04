/**
 * DocumentExplorerToolbar
 * @description 문서 탐색기 툴바 - 분류 기준 선택, 검색, 펼치기/접기, 빠른 필터
 */

import React, { useCallback, useRef } from 'react'
import { Dropdown, type DropdownOption } from '@/shared/ui/Dropdown'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '@/components/SFSymbol'
import type { DocumentGroupBy, DocumentSortBy, SortDirection, QuickFilterType } from './types/documentExplorer'
import { GROUP_BY_LABELS, SORT_BY_LABELS, QUICK_FILTER_LABELS } from './types/documentExplorer'

export interface DocumentExplorerToolbarProps {
  groupBy: DocumentGroupBy
  onGroupByChange: (groupBy: DocumentGroupBy) => void
  searchTerm: string
  onSearchChange: (term: string) => void
  isAllExpanded: boolean
  onToggleExpandAll: () => void
  onRefresh: () => void
  totalDocuments: number
  groupCount: number
  isLoading?: boolean
  /** 기타 분류 최소 기준 (태그별 분류 시) */
  minTagCount: number
  onMinTagCountChange: (value: number) => void
  /** 정렬 기준 */
  sortBy: DocumentSortBy
  sortDirection: SortDirection
  onSortByChange: (sortBy: DocumentSortBy) => void
  /** 빠른 필터 */
  quickFilter: QuickFilterType
  onQuickFilterChange: (filter: QuickFilterType) => void
  /** 고객 필터 */
  customerFilter: string | null
  onCustomerFilterClear: () => void
}

const GROUP_BY_OPTIONS: DropdownOption[] = [
  { value: 'customer', label: '고객별' },
  { value: 'badgeType', label: '문서유형별' },
  { value: 'tag', label: '태그별' },
  { value: 'date', label: '날짜별' },
]

const SORT_OPTIONS: DocumentSortBy[] = ['name', 'customer', 'date', 'badgeType']

// 빠른 필터 칩 옵션 (전체 제외)
const QUICK_FILTER_OPTIONS: QuickFilterType[] = ['today', 'thisWeek', 'ocrPending']

export const DocumentExplorerToolbar: React.FC<DocumentExplorerToolbarProps> = ({
  groupBy,
  onGroupByChange,
  searchTerm,
  onSearchChange,
  isAllExpanded,
  onToggleExpandAll,
  onRefresh,
  totalDocuments,
  groupCount,
  isLoading = false,
  minTagCount,
  onMinTagCountChange,
  sortBy,
  sortDirection,
  onSortByChange,
  quickFilter,
  onQuickFilterChange,
  customerFilter,
  onCustomerFilterClear,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null)

  const handleGroupByChange = useCallback(
    (value: string) => {
      onGroupByChange(value as DocumentGroupBy)
    },
    [onGroupByChange]
  )

  const handleSearchClear = useCallback(() => {
    onSearchChange('')
    searchInputRef.current?.focus()
  }, [onSearchChange])

  return (
    <div className="doc-explorer-toolbar">
      {/* 분류 기준 드롭다운 */}
      <div className="doc-explorer-toolbar__group">
        <Dropdown
          options={GROUP_BY_OPTIONS}
          value={groupBy}
          onChange={handleGroupByChange}
        />
      </div>

      {/* 기타 분류 기준 (태그별 분류 시에만 표시) */}
      {groupBy === 'tag' && (
        <div className="doc-explorer-toolbar__min-count" title={`${minTagCount}건 이하 태그는 기타로 분류`}>
          <button
            type="button"
            className="doc-explorer-toolbar__stepper-btn"
            onClick={() => minTagCount > 1 && onMinTagCountChange(minTagCount - 1)}
            disabled={minTagCount <= 1}
          >
            −
          </button>
          <span className="doc-explorer-toolbar__stepper-value">{minTagCount}</span>
          <button
            type="button"
            className="doc-explorer-toolbar__stepper-btn"
            onClick={() => minTagCount < 99 && onMinTagCountChange(minTagCount + 1)}
            disabled={minTagCount >= 99}
          >
            +
          </button>
        </div>
      )}

      {/* 검색 입력 */}
      <div className="doc-explorer-toolbar__search">
        <SFSymbol
          name="magnifyingglass"
          size={SFSymbolSize.CAPTION_1}
          weight={SFSymbolWeight.REGULAR}
          className="doc-explorer-toolbar__search-icon"
        />
        <input
          ref={searchInputRef}
          type="text"
          className="doc-explorer-toolbar__search-input"
          placeholder="문서 검색..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {searchTerm && (
          <button
            type="button"
            className="doc-explorer-toolbar__search-clear"
            onClick={handleSearchClear}
            aria-label="검색어 지우기"
          >
            <SFSymbol
              name="xmark.circle.fill"
              size={SFSymbolSize.CAPTION_1}
              weight={SFSymbolWeight.REGULAR}
            />
          </button>
        )}
      </div>

      {/* 빠른 필터 칩 */}
      <div className="doc-explorer-toolbar__quick-filters">
        {QUICK_FILTER_OPTIONS.map((filter) => (
          <button
            key={filter}
            type="button"
            className={`doc-explorer-toolbar__filter-chip ${quickFilter === filter ? 'doc-explorer-toolbar__filter-chip--active' : ''}`}
            onClick={() => onQuickFilterChange(quickFilter === filter ? 'none' : filter)}
          >
            {QUICK_FILTER_LABELS[filter]}
          </button>
        ))}
      </div>

      {/* 고객 필터 표시 (활성화 시) */}
      {customerFilter && (
        <div className="doc-explorer-toolbar__customer-filter">
          <span className="doc-explorer-toolbar__customer-filter-label">
            <SFSymbol
              name="person.fill"
              size={SFSymbolSize.CAPTION_2}
              weight={SFSymbolWeight.REGULAR}
            />
            {customerFilter}
          </span>
          <button
            type="button"
            className="doc-explorer-toolbar__customer-filter-clear"
            onClick={onCustomerFilterClear}
            title="필터 해제"
          >
            <SFSymbol
              name="xmark.circle.fill"
              size={SFSymbolSize.CAPTION_1}
              weight={SFSymbolWeight.REGULAR}
            />
          </button>
        </div>
      )}

      {/* 액션 버튼들 */}
      <div className="doc-explorer-toolbar__actions">
        <button
          type="button"
          className="doc-explorer-toolbar__expand-btn"
          onClick={onToggleExpandAll}
          title={isAllExpanded ? '모두 접기' : '모두 펼치기'}
        >
          {isAllExpanded ? (
            /* 접기: 트리가 접힌 모양 (평평한 리스트) */
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 4H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M3 12H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          ) : (
            /* 펼치기: 트리가 펼쳐진 모양 (들여쓰기 리스트) */
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 4H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M6 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M9 12H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          )}
        </button>

      </div>

      {/* 정렬 기준 */}
      <div className="doc-explorer-toolbar__sort">
        <div className="doc-explorer-toolbar__sort-buttons">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`doc-explorer-toolbar__sort-btn ${sortBy === option ? 'doc-explorer-toolbar__sort-btn--active' : ''}`}
              onClick={() => onSortByChange(option)}
              title={`${SORT_BY_LABELS[option]}순 정렬`}
            >
              {SORT_BY_LABELS[option]}
              {sortBy === option && (
                <SFSymbol
                  name={sortDirection === 'asc' ? 'chevron.up' : 'chevron.down'}
                  size={SFSymbolSize.CAPTION_2}
                  weight={SFSymbolWeight.MEDIUM}
                  className="doc-explorer-toolbar__sort-icon"
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 통계 */}
      <div className="doc-explorer-toolbar__stats">
        <span className="doc-explorer-toolbar__stat">
          {GROUP_BY_LABELS[groupBy]} {groupCount}개
        </span>
        <span className="doc-explorer-toolbar__stat-separator">·</span>
        <span className="doc-explorer-toolbar__stat">
          문서 {totalDocuments}개
        </span>
      </div>
    </div>
  )
}
