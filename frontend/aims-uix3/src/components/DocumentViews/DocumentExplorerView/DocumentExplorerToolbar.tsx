/**
 * DocumentExplorerToolbar
 * @description 문서 탐색기 툴바 - 분류 기준 선택, 검색(파일명/내용/AI), 펼치기/접기, 빠른 필터
 */

import React, { useCallback, useRef, useState, useMemo, useEffect } from 'react'
import { Button } from '@/shared/ui/Button'
import { Tooltip } from '@/shared/ui/Tooltip'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '@/components/SFSymbol'
import type { DocumentGroupBy, DocumentSortBy, SortDirection, QuickFilterType } from './types/documentExplorer'
import { GROUP_BY_LABELS, SORT_BY_LABELS, QUICK_FILTER_LABELS } from './types/documentExplorer'
import { getRecentSearchQueries, addRecentSearchQuery, type RecentSearchQuery } from '../../../utils/recentSearchQueries'
import '../DocumentLibraryView/DocumentLibraryView-delete.css'

/** 탐색기 검색 모드 */
export type ExplorerSearchMode = 'filename' | 'content' | 'semantic'

// 빠른 필터 툴팁 설명
const QUICK_FILTER_TOOLTIPS: Record<QuickFilterType, string> = {
  none: '',
  today: '오늘 등록된 문서만 표시',
  thisWeek: '이번 주 등록된 문서만 표시',
}

/** 편집 모드 타입 */
export type EditModeType = 'none' | 'delete' | 'alias'

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
  /** 날짜 점프 */
  onJumpToDate: (date: Date) => boolean
  getAvailableDates: () => Date[]
  /** 날짜 필터 */
  dateFilter: Date | null
  onDateFilterClear: () => void
  /** 썸네일 미리보기 활성화 */
  thumbnailEnabled: boolean
  onThumbnailEnabledChange: (enabled: boolean) => void
  /** 🍎 파일명 표시 모드 (별칭/원본) */
  filenameMode: 'display' | 'original'
  onFilenameModeChange: (mode: 'display' | 'original') => void
  /** 검색 모드 (파일명/내용/AI질문) */
  searchMode: ExplorerSearchMode
  onSearchModeChange: (mode: ExplorerSearchMode) => void
  /** 내용검색/AI질문 실행 핸들러 (Enter 키) */
  onContentSearch: (query: string) => void
  /** 내용검색 로딩 상태 */
  isContentSearching?: boolean
  /** 내용검색 결과 초기화 (검색어 X 클릭 시) */
  onContentSearchClear?: () => void
  /** 편집 모드 */
  editMode?: EditModeType
  /** 편집 모드 변경 */
  onEditModeChange?: (mode: EditModeType) => void
  /** 선택된 문서 수 */
  selectedCount?: number
  /** 고객 범위 검색 필터 (특정 고객의 문서만 검색) */
  scopeCustomer?: { id: string; name: string; type: '개인' | '법인' } | null
  /** 고객 범위 필터 해제 */
  onScopeCustomerClear?: () => void
  /** 요약 모드 여부 (초성 미선택) — 칩/placeholder 동적 변경용 */
  isSummaryMode?: boolean
}

/** 검색 모드 칩 정의 — 초성 모드 (문서 트리) */
const SEARCH_MODE_CHIPS_INITIAL: { value: ExplorerSearchMode; label: string; icon: string }[] = [
  { value: 'filename', label: '파일명', icon: 'doc.text' },
  { value: 'content', label: '내용', icon: 'magnifyingglass' },
  { value: 'semantic', label: 'AI 질문', icon: 'sparkles' },
]

/** 검색 모드 칩 정의 — 요약 모드 (고객 목록) */
const SEARCH_MODE_CHIPS_SUMMARY: { value: ExplorerSearchMode; label: string; icon: string }[] = [
  { value: 'filename', label: '고객명', icon: 'person.fill' },
  { value: 'content', label: '문서 검색', icon: 'magnifyingglass' },
  { value: 'semantic', label: 'AI 질문', icon: 'sparkles' },
]

/** 검색 모드별 placeholder — 초성 모드 */
const SEARCH_MODE_PLACEHOLDERS_INITIAL: Record<ExplorerSearchMode, string> = {
  filename: '파일명 · 고객명으로 검색...',
  content: '문서 내용 검색...',
  semantic: 'AI에게 질문하기...',
}

/** 검색 모드별 placeholder — 요약 모드 */
const SEARCH_MODE_PLACEHOLDERS_SUMMARY: Record<ExplorerSearchMode, string> = {
  filename: '고객명으로 검색...',
  content: '파일명 또는 문서 내용 검색... (Enter)',
  semantic: 'AI에게 질문하기...',
}

const SORT_OPTIONS: DocumentSortBy[] = ['name', 'customer', 'date', 'badgeType']

// 빠른 필터 칩 옵션 (전체 제외)
const QUICK_FILTER_OPTIONS: QuickFilterType[] = ['today', 'thisWeek']

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
  sortBy,
  sortDirection,
  onSortByChange,
  quickFilter,
  onQuickFilterChange,
  customerFilter,
  onCustomerFilterClear,
  onJumpToDate,
  getAvailableDates,
  dateFilter,
  onDateFilterClear,
  thumbnailEnabled,
  onThumbnailEnabledChange,
  filenameMode,
  onFilenameModeChange,
  searchMode,
  onSearchModeChange,
  onContentSearch,
  isContentSearching = false,
  onContentSearchClear,
  editMode = 'none',
  onEditModeChange,
  selectedCount = 0,
  scopeCustomer,
  onScopeCustomerClear,
  isSummaryMode = false,
}) => {
  // 모드별 칩/placeholder 선택
  const searchModeChips = isSummaryMode ? SEARCH_MODE_CHIPS_SUMMARY : SEARCH_MODE_CHIPS_INITIAL
  const searchModePlaceholders = isSummaryMode ? SEARCH_MODE_PLACEHOLDERS_SUMMARY : SEARCH_MODE_PLACEHOLDERS_INITIAL
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const datePickerRef = useRef<HTMLDivElement>(null)
  const dateButtonRef = useRef<HTMLButtonElement>(null)
  const [showSettings, setShowSettings] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)

  // 문서가 있는 날짜 Set (빠른 조회용)
  const availableDatesSet = useMemo(() => {
    const dates = getAvailableDates()
    const set = new Set<string>()
    dates.forEach((date) => {
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      set.add(key)
    })
    return set
  }, [getAvailableDates])

  // 현재 보고 있는 달력의 년월 (단일 상태로 원자적 업데이트)
  const [calendarDate, setCalendarDate] = useState(() => ({
    year: new Date().getFullYear(),
    month: new Date().getMonth()
  }))

  const calendarYear = calendarDate.year
  const calendarMonth = calendarDate.month

  // 날짜 선택 핸들러
  const handleDateSelect = useCallback(
    (year: number, month: number, day: number) => {
      const date = new Date(year, month, day)
      const success = onJumpToDate(date)
      if (success) {
        setShowDatePicker(false)
      }
    },
    [onJumpToDate]
  )

  // 이전/다음 달 이동 (단일 상태로 원자적 업데이트)
  const goToPrevMonth = useCallback(() => {
    setCalendarDate((prev) => {
      if (prev.month === 0) {
        return { year: prev.year - 1, month: 11 }
      }
      return { ...prev, month: prev.month - 1 }
    })
  }, [])

  const goToNextMonth = useCallback(() => {
    setCalendarDate((prev) => {
      if (prev.month === 11) {
        return { year: prev.year + 1, month: 0 }
      }
      return { ...prev, month: prev.month + 1 }
    })
  }, [])

  // 오늘로 이동
  const goToToday = useCallback(() => {
    const today = new Date()
    setCalendarDate({ year: today.getFullYear(), month: today.getMonth() })
  }, [])

  // 달력 데이터 생성
  const calendarDays = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1)
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0)
    const startDayOfWeek = firstDay.getDay() // 0 = 일요일

    const days: Array<{ day: number; hasDocuments: boolean; isToday: boolean } | null> = []

    // 이전 달의 빈 칸
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null)
    }

    // 현재 달의 날짜들
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      days.push({
        day,
        hasDocuments: availableDatesSet.has(dateStr),
        isToday: dateStr === todayStr,
      })
    }

    return days
  }, [calendarYear, calendarMonth, availableDatesSet])

  // 월 이름
  const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
  const dayNames = ['일', '월', '화', '수', '목', '금', '토']

  const handleGroupByChange = useCallback(
    (value: string) => {
      onGroupByChange(value as DocumentGroupBy)
    },
    [onGroupByChange]
  )

  // 최근 검색어 상태
  const [recentQueries, setRecentQueries] = useState<RecentSearchQuery[]>([])
  const [showRecentQueries, setShowRecentQueries] = useState(false)
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 검색 모드 변경 핸들러
  const handleSearchModeChange = useCallback((value: string) => {
    onSearchModeChange(value as ExplorerSearchMode)
    // 모드 전환 시 검색어 초기화
    onSearchChange('')
    searchInputRef.current?.focus()
  }, [onSearchModeChange, onSearchChange])

  // 검색 실행 핸들러 (Enter 키) — IME 입력 중에는 무시
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' && searchTerm.trim()) {
      if (searchMode === 'content' || searchMode === 'semantic') {
        addRecentSearchQuery(searchTerm.trim())
        onContentSearch(searchTerm.trim())
        setShowRecentQueries(false)
      }
    }
    if (e.key === 'Escape') {
      setShowRecentQueries(false)
      searchInputRef.current?.blur()
    }
  }, [searchTerm, searchMode, onContentSearch])

  // 검색창 포커스 시 최근 검색어 표시 (내용/AI 모드만)
  const handleSearchFocus = useCallback(() => {
    if (searchMode !== 'filename') {
      const queries = getRecentSearchQueries()
      setRecentQueries(queries)
      if (queries.length > 0) {
        setShowRecentQueries(true)
      }
    }
  }, [searchMode])

  // 검색창 blur 시 최근 검색어 드롭다운 닫기 (약간 지연하여 클릭 허용)
  const handleSearchBlur = useCallback(() => {
    blurTimerRef.current = setTimeout(() => {
      setShowRecentQueries(false)
    }, 200)
  }, [])

  // 최근 검색어 클릭 핸들러
  const handleRecentQueryClick = useCallback((query: string) => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
    onSearchChange(query)
    setShowRecentQueries(false)
    addRecentSearchQuery(query)
    onContentSearch(query)
  }, [onSearchChange, onContentSearch])

  // cleanup
  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
    }
  }, [])

  const handleSearchClear = useCallback(() => {
    onSearchChange('')
    onContentSearchClear?.()
    searchInputRef.current?.focus()
  }, [onSearchChange, onContentSearchClear])

  return (
    <div className="doc-explorer-toolbar">
      {/* 검색 모드 칩 + 입력 */}
      <div className="doc-explorer-toolbar__search-group">
        <div className="doc-explorer-toolbar__mode-chips">
          {searchModeChips.map((chip) => (
            <Tooltip key={chip.value} content={chip.value === 'filename' ? (isSummaryMode ? '고객명으로 실시간 필터링' : '파일명 · 고객명으로 실시간 필터링') : chip.value === 'content' ? (isSummaryMode ? '파일명 또는 문서 내용 검색 (Enter)' : '문서 내용에서 키워드 검색 (Enter)') : 'AI가 문서 내용을 이해하여 답변 (Enter)'} placement="bottom">
              <button
                type="button"
                className={`doc-explorer-toolbar__mode-chip ${searchMode === chip.value ? 'doc-explorer-toolbar__mode-chip--active' : ''} ${chip.value === 'semantic' ? 'doc-explorer-toolbar__mode-chip--ai' : ''}`}
                onClick={() => handleSearchModeChange(chip.value)}
              >
                <SFSymbol
                  name={chip.icon}
                  size={SFSymbolSize.CAPTION_2}
                  weight={SFSymbolWeight.MEDIUM}
                  decorative
                />
                <span>{chip.label}</span>
              </button>
            </Tooltip>
          ))}
        </div>
        <div className={`doc-explorer-toolbar__search${searchMode === 'semantic' ? ' doc-explorer-toolbar__search--ai' : searchMode === 'content' ? ' doc-explorer-toolbar__search--content' : ''}`}>
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
            placeholder={searchModePlaceholders[searchMode]}
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            onFocus={handleSearchFocus}
            onBlur={handleSearchBlur}
          />
          {isContentSearching && (
            <span className="doc-explorer-toolbar__search-spinner" />
          )}
          {/* Enter 버튼 (내용/AI 모드에서 검색어 입력 시 — 클릭으로도 검색 실행) */}
          {searchMode !== 'filename' && searchTerm && !isContentSearching && (
            <button
              type="button"
              className="doc-explorer-toolbar__enter-btn"
              onClick={() => {
                addRecentSearchQuery(searchTerm.trim())
                onContentSearch(searchTerm.trim())
                setShowRecentQueries(false)
              }}
              aria-label="검색 실행"
            >
              Enter ↵
            </button>
          )}
          {searchTerm && !isContentSearching && (
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
          {/* 최근 검색어 드롭다운 (내용/AI 모드) */}
          {showRecentQueries && recentQueries.length > 0 && (
            <div className="doc-explorer-toolbar__recent-queries">
              <div className="doc-explorer-toolbar__recent-queries-header">
                최근 검색어
              </div>
              {recentQueries.slice(0, 5).map((item) => (
                <button
                  key={item.timestamp}
                  type="button"
                  className="doc-explorer-toolbar__recent-query-item"
                  onMouseDown={(e) => {
                    e.preventDefault() // blur 방지
                    handleRecentQueryClick(item.query)
                  }}
                >
                  <SFSymbol
                    name="clock.arrow.circlepath"
                    size={SFSymbolSize.CAPTION_2}
                    weight={SFSymbolWeight.REGULAR}
                    decorative
                  />
                  <span className="doc-explorer-toolbar__recent-query-text">{item.query}</span>
                </button>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* 고객 범위 검색 칩 (특정 고객 문서만 검색 시) */}
      {scopeCustomer && (
        <div className="doc-explorer-toolbar__scope-chip">
          <SFSymbol
            name={scopeCustomer.type === '법인' ? 'building.2' : 'person.fill'}
            size={SFSymbolSize.CAPTION_2}
            weight={SFSymbolWeight.REGULAR}
            decorative
          />
          <span className="doc-explorer-toolbar__scope-chip-name">{scopeCustomer.name}</span>
          <Tooltip content="범위 해제 — 전체 문서 검색" placement="bottom">
            <button
              type="button"
              className="doc-explorer-toolbar__scope-chip-clear"
              onClick={onScopeCustomerClear}
              aria-label="고객 범위 해제"
            >
              <SFSymbol
                name="xmark"
                size={SFSymbolSize.CAPTION_2}
                weight={SFSymbolWeight.MEDIUM}
                decorative
              />
            </button>
          </Tooltip>
        </div>
      )}

      {/* 빠른 필터 칩 */}
      <div className="doc-explorer-toolbar__quick-filters">
        {QUICK_FILTER_OPTIONS.map((filter) => (
          <Tooltip key={filter} content={QUICK_FILTER_TOOLTIPS[filter]} placement="bottom">
            <button
              type="button"
              className={`doc-explorer-toolbar__filter-chip ${quickFilter === filter ? 'doc-explorer-toolbar__filter-chip--active' : ''}`}
              onClick={() => onQuickFilterChange(quickFilter === filter ? 'none' : filter)}
            >
              {QUICK_FILTER_LABELS[filter]}
            </button>
          </Tooltip>
        ))}

        {/* 날짜 점프 버튼 */}
        <div className="doc-explorer-toolbar__date-jump">
          <Tooltip content="날짜로 이동" placement="bottom">
            <button
              ref={dateButtonRef}
              type="button"
              className={`doc-explorer-toolbar__date-btn ${showDatePicker ? 'doc-explorer-toolbar__date-btn--active' : ''}`}
              onClick={() => setShowDatePicker(!showDatePicker)}
              disabled={availableDatesSet.size === 0}
              aria-label="날짜로 이동"
            >
              <SFSymbol
                name="calendar"
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.REGULAR}
                decorative
              />
            </button>
          </Tooltip>

          {/* 달력 팝오버 */}
          {showDatePicker && (
            <>
              <div
                className="doc-explorer-toolbar__date-backdrop"
                onClick={() => setShowDatePicker(false)}
              />
              <div
                ref={datePickerRef}
                className="doc-explorer-toolbar__calendar"
              >
                {/* 달력 헤더 */}
                <div className="doc-explorer-toolbar__calendar-header">
                  <button
                    type="button"
                    className="doc-explorer-toolbar__calendar-nav"
                    onClick={goToPrevMonth}
                    aria-label="이전 달"
                  >
                    ‹
                  </button>
                  <Tooltip content="오늘로 이동" placement="bottom">
                    <button
                      type="button"
                      className="doc-explorer-toolbar__calendar-title"
                      onClick={goToToday}
                      aria-label="오늘로 이동"
                    >
                      {calendarYear}년 {monthNames[calendarMonth]}
                    </button>
                  </Tooltip>
                  <button
                    type="button"
                    className="doc-explorer-toolbar__calendar-nav"
                    onClick={goToNextMonth}
                    aria-label="다음 달"
                  >
                    ›
                  </button>
                </div>

                {/* 요일 헤더 */}
                <div className="doc-explorer-toolbar__calendar-weekdays">
                  {dayNames.map((day, i) => (
                    <div
                      key={day}
                      className={`doc-explorer-toolbar__calendar-weekday ${i === 0 ? 'doc-explorer-toolbar__calendar-weekday--sunday' : ''}`}
                    >
                      {day}
                    </div>
                  ))}
                </div>

                {/* 날짜 그리드 */}
                <div className="doc-explorer-toolbar__calendar-grid">
                  {calendarDays.map((dayInfo, index) => (
                    <div key={index} className="doc-explorer-toolbar__calendar-cell">
                      {dayInfo && (
                        <button
                          type="button"
                          className={`doc-explorer-toolbar__calendar-day ${dayInfo.hasDocuments ? 'doc-explorer-toolbar__calendar-day--has-docs' : ''} ${dayInfo.isToday ? 'doc-explorer-toolbar__calendar-day--today' : ''}`}
                          onClick={() => dayInfo.hasDocuments && handleDateSelect(calendarYear, calendarMonth, dayInfo.day)}
                          disabled={!dayInfo.hasDocuments}
                        >
                          {dayInfo.day}
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* 범례 */}
                <div className="doc-explorer-toolbar__calendar-legend">
                  <span className="doc-explorer-toolbar__calendar-legend-item">
                    <span className="doc-explorer-toolbar__calendar-legend-dot" />
                    문서 있음
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 고객 필터 표시 (활성화 시) */}
      {customerFilter && (
        <div className="doc-explorer-toolbar__customer-filter">
          <span className="doc-explorer-toolbar__customer-filter-label">
            <SFSymbol
              name="person.fill"
              size={SFSymbolSize.CAPTION_2}
              weight={SFSymbolWeight.REGULAR}
              decorative
            />
            {customerFilter}
          </span>
          <Tooltip content="필터 해제" placement="bottom">
            <button
              type="button"
              className="doc-explorer-toolbar__customer-filter-clear"
              onClick={onCustomerFilterClear}
              aria-label="고객 필터 해제"
            >
              <SFSymbol
                name="xmark.circle.fill"
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.REGULAR}
                decorative
              />
            </button>
          </Tooltip>
        </div>
      )}

      {/* 날짜 필터 표시 (활성화 시) */}
      {dateFilter && (
        <div className="doc-explorer-toolbar__date-filter">
          <span className="doc-explorer-toolbar__date-filter-label">
            <SFSymbol
              name="calendar"
              size={SFSymbolSize.CAPTION_2}
              weight={SFSymbolWeight.REGULAR}
              decorative
            />
            {dateFilter.getFullYear()}.{String(dateFilter.getMonth() + 1).padStart(2, '0')}.{String(dateFilter.getDate()).padStart(2, '0')}
          </span>
          <Tooltip content="날짜 필터 해제" placement="bottom">
            <button
              type="button"
              className="doc-explorer-toolbar__date-filter-clear"
              onClick={onDateFilterClear}
              aria-label="날짜 필터 해제"
            >
              <SFSymbol
                name="xmark.circle.fill"
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.REGULAR}
                decorative
              />
            </button>
          </Tooltip>
        </div>
      )}

      {/* 편집 모드 버튼 (삭제/별칭AI) */}
      {onEditModeChange && (
        <div className="doc-explorer-toolbar__edit-group">
          <Tooltip content={editMode === 'alias' ? '별칭 완료' : 'AI가 문서 내용을 분석하여 알아보기 쉬운 별칭을 자동 생성합니다'} placement="bottom">
            <Button
              variant="ghost"
              size="sm"
              className={`alias-ai-button ${editMode === 'alias' ? 'doc-explorer-toolbar__edit-btn--active' : ''}`}
              onClick={() => onEditModeChange(editMode === 'alias' ? 'none' : 'alias')}
              disabled={editMode === 'delete'}
              aria-label={editMode === 'alias' ? '별칭 완료' : 'AI 별칭 생성'}
            >
              <SFSymbol
                name={editMode === 'alias' ? 'checkmark' : 'sparkles'}
                size={SFSymbolSize.CAPTION_2}
                weight={SFSymbolWeight.MEDIUM}
                decorative
              />
              {editMode === 'alias' ? '완료' : '별칭AI'}
            </Button>
          </Tooltip>

          <Tooltip content={editMode === 'delete' ? '삭제 완료' : '일괄 삭제'} placement="bottom">
            <button
              type="button"
              className={`edit-mode-icon-button ${editMode === 'delete' ? 'edit-mode-icon-button--active' : ''}`}
              onClick={() => onEditModeChange(editMode === 'delete' ? 'none' : 'delete')}
              disabled={editMode === 'alias'}
              aria-label={editMode === 'delete' ? '삭제 완료' : '일괄 삭제'}
            >
              {editMode === 'delete' ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <SFSymbol
                  name="trash"
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.MEDIUM}
                  decorative
                />
              )}
            </button>
          </Tooltip>

          {/* 편집 모드 활성화 시 선택 건수 표시 */}
          {editMode !== 'none' && (
            <span className="doc-explorer-toolbar__edit-count">
              {selectedCount}건 선택
            </span>
          )}
        </div>
      )}

      {/* Primary 액션: 펼치기/접기 */}
      <div className="doc-explorer-toolbar__actions">
        <Tooltip content={isAllExpanded ? '모두 접기' : '모두 펼치기'} placement="bottom">
          <button
            type="button"
            className="doc-explorer-toolbar__expand-btn"
            onClick={onToggleExpandAll}
            aria-label={isAllExpanded ? '모두 접기' : '모두 펼치기'}
          >
            {isAllExpanded ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 4H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M3 12H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 4H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M6 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M9 12H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            )}
          </button>
        </Tooltip>

        {/* 설정 팝오버 토글 (정렬 · 썸네일 · 파일명 모드) */}
        <div className="doc-explorer-toolbar__settings-wrapper" ref={settingsRef}>
          <Tooltip content="보기 설정" placement="bottom">
            <button
              type="button"
              className={`doc-explorer-toolbar__settings-btn ${showSettings ? 'doc-explorer-toolbar__settings-btn--active' : ''}`}
              onClick={() => setShowSettings(!showSettings)}
              aria-label="보기 설정"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </Tooltip>

          {showSettings && (
            <>
              <div
                className="doc-explorer-toolbar__settings-backdrop"
                onClick={() => setShowSettings(false)}
              />
              <div className="doc-explorer-toolbar__settings-popover">
                {/* 정렬 */}
                <div className="doc-explorer-toolbar__settings-section">
                  <span className="doc-explorer-toolbar__settings-label">정렬</span>
                  <div className="doc-explorer-toolbar__sort-buttons">
                    {SORT_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`doc-explorer-toolbar__sort-btn ${sortBy === option ? 'doc-explorer-toolbar__sort-btn--active' : ''}`}
                        onClick={() => onSortByChange(option)}
                        aria-label={`${SORT_BY_LABELS[option]}순 정렬`}
                      >
                        {SORT_BY_LABELS[option]}
                        {sortBy === option && (
                          <SFSymbol
                            name={sortDirection === 'asc' ? 'chevron.up' : 'chevron.down'}
                            size={SFSymbolSize.CAPTION_2}
                            weight={SFSymbolWeight.MEDIUM}
                            className="doc-explorer-toolbar__sort-icon"
                            decorative
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="doc-explorer-toolbar__settings-divider" />

                {/* 보기 옵션 */}
                <div className="doc-explorer-toolbar__settings-section">
                  <span className="doc-explorer-toolbar__settings-label">보기</span>
                  <div className="doc-explorer-toolbar__settings-toggles">
                    {/* 썸네일 */}
                    <button
                      type="button"
                      className={`doc-explorer-toolbar__settings-toggle ${thumbnailEnabled ? 'doc-explorer-toolbar__settings-toggle--active' : ''}`}
                      onClick={() => onThumbnailEnabledChange(!thumbnailEnabled)}
                      aria-label={thumbnailEnabled ? '썸네일 끄기' : '썸네일 켜기'}
                    >
                      <SFSymbol
                        name="photo"
                        size={SFSymbolSize.CAPTION_1}
                        weight={SFSymbolWeight.REGULAR}
                        decorative
                      />
                      <span>썸네일</span>
                      {thumbnailEnabled && (
                        <SFSymbol
                          name="checkmark"
                          size={SFSymbolSize.CAPTION_2}
                          weight={SFSymbolWeight.MEDIUM}
                          className="doc-explorer-toolbar__settings-check"
                          decorative
                        />
                      )}
                    </button>

                    {/* 파일명 모드 */}
                    <button
                      type="button"
                      className={`doc-explorer-toolbar__settings-toggle ${filenameMode === 'original' ? 'doc-explorer-toolbar__settings-toggle--active' : ''}`}
                      onClick={() => onFilenameModeChange(filenameMode === 'display' ? 'original' : 'display')}
                      aria-label={filenameMode === 'display' ? '원본 파일명으로 전환' : '별칭으로 전환'}
                    >
                      <SFSymbol
                        name="doc.text"
                        size={SFSymbolSize.CAPTION_1}
                        weight={SFSymbolWeight.REGULAR}
                        decorative
                      />
                      <span>{filenameMode === 'display' ? '별칭 표시' : '원본 표시'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 통계 */}
      <div className="doc-explorer-toolbar__stats">
        <span className="doc-explorer-toolbar__stat">
          {GROUP_BY_LABELS[groupBy]} {groupCount}
        </span>
        <span className="doc-explorer-toolbar__stat-separator">·</span>
        <span className="doc-explorer-toolbar__stat">
          문서 {totalDocuments}
        </span>
      </div>
    </div>
  )
}
