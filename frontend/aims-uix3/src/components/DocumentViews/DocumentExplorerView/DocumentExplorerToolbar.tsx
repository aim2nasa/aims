/**
 * DocumentExplorerToolbar
 * @description 문서 탐색기 툴바 - 분류 기준 선택, 통합검색(파일명), 펼치기/접기, 빠른 필터
 */

import React, { useCallback, useRef, useState, useMemo, useEffect } from 'react'
import { Button } from '@/shared/ui/Button'
import { Tooltip } from '@/shared/ui/Tooltip'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '@/components/SFSymbol'
import type { DocumentGroupBy, DocumentSortBy, SortDirection, QuickFilterType, DateRange } from './types/documentExplorer'
import { GROUP_BY_LABELS, SORT_BY_LABELS, QUICK_FILTER_LABELS } from './types/documentExplorer'
import { AliasAIButton } from '@/shared/ui/AliasAIButton/AliasAIButton'
import '../DocumentLibraryView/DocumentLibraryView-delete.css'

/** 탐색기 검색 모드 (filename만 사용) */
export type ExplorerSearchMode = 'filename'

// 빠른 필터 툴팁 설명
const QUICK_FILTER_TOOLTIPS: Record<QuickFilterType, string> = {
  none: '',
  today: '오늘 등록된 문서만 표시',
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
  /** 날짜 범위 필터 */
  dateRange: DateRange | null
  onDateRangeChange: (range: DateRange | null) => void
  /** 썸네일 미리보기 활성화 */
  thumbnailEnabled: boolean
  onThumbnailEnabledChange: (enabled: boolean) => void
  /** 🍎 파일명 표시 모드 (별칭/원본) */
  filenameMode: 'display' | 'original'
  onFilenameModeChange: (mode: 'display' | 'original') => void
  /** 편집 모드 */
  editMode?: EditModeType
  /** 편집 모드 변경 */
  onEditModeChange?: (mode: EditModeType) => void
  /** 선택된 문서 수 */
  selectedCount?: number
  /** 별칭 생성 실행 */
  onGenerateAliases?: (force: boolean) => void
  /** 별칭 생성 중 */
  isGeneratingAliases?: boolean
  /** 별칭 없는 문서 존재 여부 (Progressive Disclosure) */
  hasDocWithoutAlias?: boolean
  /** 별칭 없는 문서 수 (카운트 문구용) */
  aliasSelectableCount?: number
  /** 요약 모드 여부 (초성 미선택) — placeholder 동적 변경용 */
  isSummaryMode?: boolean
}

/** 검색 모드별 placeholder — 초성 모드 */
const SEARCH_MODE_PLACEHOLDERS_INITIAL: Record<ExplorerSearchMode, string> = {
  filename: '파일명 · 고객명으로 검색...',
}

/** 검색 모드별 placeholder — 요약 모드 */
const SEARCH_MODE_PLACEHOLDERS_SUMMARY: Record<ExplorerSearchMode, string> = {
  filename: '고객명 · 파일명으로 검색...',
}

const SORT_OPTIONS: DocumentSortBy[] = ['name', 'ext', 'size', 'customer', 'date', 'badgeType']

// 빠른 필터 칩 옵션 (전체 제외)
const QUICK_FILTER_OPTIONS: QuickFilterType[] = ['today']

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
  dateRange,
  onDateRangeChange,
  thumbnailEnabled,
  onThumbnailEnabledChange,
  filenameMode,
  onFilenameModeChange,
  editMode = 'none',
  onEditModeChange,
  selectedCount = 0,
  onGenerateAliases,
  isGeneratingAliases = false,
  hasDocWithoutAlias = true,
  aliasSelectableCount = 0,
  isSummaryMode = false,
}) => {
  // 모드별 placeholder 선택
  const searchModePlaceholders = isSummaryMode ? SEARCH_MODE_PLACEHOLDERS_SUMMARY : SEARCH_MODE_PLACEHOLDERS_INITIAL
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const datePickerRef = useRef<HTMLDivElement>(null)
  const dateButtonRef = useRef<HTMLButtonElement>(null)
  const [showSettings, setShowSettings] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)
  const [forceRegenerateAlias, setForceRegenerateAlias] = useState(false)

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

  // 범위 선택 상태: 시작일 임시 저장, 호버 미리보기
  const [pendingStart, setPendingStart] = useState<Date | null>(null)
  const [hoverDate, setHoverDate] = useState<Date | null>(null)

  // 날짜 선택 핸들러 (범위 선택 지원)
  const handleDateSelect = useCallback(
    (year: number, month: number, day: number) => {
      const date = new Date(year, month, day)

      if (!pendingStart) {
        // 1클릭: 시작일 저장
        setPendingStart(date)
      } else {
        // 2클릭: 범위 확정
        const start = pendingStart.getTime() <= date.getTime() ? pendingStart : date
        const end = pendingStart.getTime() <= date.getTime() ? date : pendingStart

        if (start.getTime() === end.getTime()) {
          // 같은 날 2번 클릭 → 단일 날짜 선택 (문서 있으면 jumpToDate, 없으면 범위 필터)
          const success = onJumpToDate(date)
          if (!success) {
            onDateRangeChange({ start, end })
          }
        } else {
          // 범위 선택
          onDateRangeChange({ start, end })
        }
        setPendingStart(null)
        setHoverDate(null)
        setShowDatePicker(false)
      }
    },
    [pendingStart, onJumpToDate, onDateRangeChange]
  )

  // 달력 닫힐 때 pendingStart 초기화
  useEffect(() => {
    if (!showDatePicker) {
      setPendingStart(null)
      setHoverDate(null)
    }
  }, [showDatePicker])

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

  // 달력 데이터 생성 (범위 선택 상태 포함)
  const calendarDays = useMemo(() => {
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0)
    const startDayOfWeek = new Date(calendarYear, calendarMonth, 1).getDay()

    const days: Array<{
      day: number
      hasDocuments: boolean
      isToday: boolean
      isSelected: boolean
      isInRange: boolean
      isRangeStart: boolean
      isRangeEnd: boolean
    } | null> = []

    // 이전 달의 빈 칸
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null)
    }

    // 범위 계산용 변수
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    // 현재 확정된 범위 또는 호버 미리보기 범위 계산
    let rangeStart: number | null = null
    let rangeEnd: number | null = null
    if (pendingStart && hoverDate) {
      // 호버 미리보기
      rangeStart = Math.min(pendingStart.getTime(), hoverDate.getTime())
      rangeEnd = Math.max(pendingStart.getTime(), hoverDate.getTime())
    } else if (dateRange && !pendingStart) {
      // 확정된 범위
      rangeStart = dateRange.start.getTime()
      rangeEnd = dateRange.end.getTime()
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const dayTime = new Date(calendarYear, calendarMonth, day).getTime()

      // 단일 날짜 필터 선택 상태
      const isSelected = dateFilter
        ? dateFilter.getFullYear() === calendarYear && dateFilter.getMonth() === calendarMonth && dateFilter.getDate() === day
        : false

      // pendingStart 선택 상태
      const isPendingStart = pendingStart
        ? pendingStart.getFullYear() === calendarYear && pendingStart.getMonth() === calendarMonth && pendingStart.getDate() === day
        : false

      const isInRange = rangeStart !== null && rangeEnd !== null && dayTime >= rangeStart && dayTime <= rangeEnd
      const isRangeStart = rangeStart !== null && dayTime === rangeStart
      const isRangeEnd = rangeEnd !== null && dayTime === rangeEnd

      days.push({
        day,
        hasDocuments: availableDatesSet.has(dateStr),
        isToday: dateStr === todayStr,
        isSelected: isSelected || isPendingStart,
        isInRange,
        isRangeStart,
        isRangeEnd,
      })
    }

    return days
  }, [calendarYear, calendarMonth, availableDatesSet, pendingStart, hoverDate, dateFilter, dateRange])

  // 월 이름
  const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
  const dayNames = ['일', '월', '화', '수', '목', '금', '토']

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
      {/* 통계 (맨 앞 — ㅈ 전체 문서 보기와 동일 배치) */}
      <div className="doc-explorer-toolbar__stats">
        <span className="doc-explorer-toolbar__stat">
          {GROUP_BY_LABELS[groupBy]} {groupCount}
        </span>
        <span className="doc-explorer-toolbar__stat-separator">·</span>
        <span className="doc-explorer-toolbar__stat">
          문서 {totalDocuments}
        </span>
      </div>

      {/* 편집 모드 버튼 (삭제) — 통계 바로 뒤 배치 (전체 문서 보기와 동일) */}
      {onEditModeChange && (
        <div className="doc-explorer-toolbar__edit-group">
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

          {/* 삭제 모드 시 선택 건수 표시 */}
          {editMode === 'delete' && (
            <span className="doc-explorer-toolbar__edit-count">
              {selectedCount}건 선택
            </span>
          )}
        </div>
      )}

      {/* 통합 검색 입력 */}
      <div className="doc-explorer-toolbar__search-group">
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
            placeholder={searchModePlaceholders.filename}
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
      </div>

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
              disabled={!isSummaryMode && availableDatesSet.size === 0}
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
                          className={[
                            'doc-explorer-toolbar__calendar-day',
                            (dayInfo.hasDocuments || isSummaryMode) ? 'doc-explorer-toolbar__calendar-day--has-docs' : '',
                            dayInfo.isToday ? 'doc-explorer-toolbar__calendar-day--today' : '',
                            dayInfo.isSelected ? 'doc-explorer-toolbar__calendar-day--selected' : '',
                            dayInfo.isInRange ? 'doc-explorer-toolbar__calendar-day--in-range' : '',
                            dayInfo.isRangeStart ? 'doc-explorer-toolbar__calendar-day--range-start' : '',
                            dayInfo.isRangeEnd ? 'doc-explorer-toolbar__calendar-day--range-end' : '',
                          ].filter(Boolean).join(' ')}
                          onClick={() => handleDateSelect(calendarYear, calendarMonth, dayInfo.day)}
                          onMouseEnter={() => pendingStart && setHoverDate(new Date(calendarYear, calendarMonth, dayInfo.day))}
                          onMouseLeave={() => pendingStart && setHoverDate(null)}
                        >
                          {dayInfo.day}
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* 범례 / 범위 선택 안내 */}
                <div className="doc-explorer-toolbar__calendar-legend">
                  {pendingStart ? (
                    <span className="doc-explorer-toolbar__calendar-legend-item">
                      끝 날짜를 선택하세요
                    </span>
                  ) : (
                    <span className="doc-explorer-toolbar__calendar-legend-item">
                      <span className="doc-explorer-toolbar__calendar-legend-dot" />
                      클릭 2회로 범위 선택
                    </span>
                  )}
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

      {/* 날짜 필터 표시 — 단일 날짜 또는 범위 (활성화 시) */}
      {(dateFilter || dateRange) && (
        <div className="doc-explorer-toolbar__date-filter">
          <span className="doc-explorer-toolbar__date-filter-label">
            <SFSymbol
              name="calendar"
              size={SFSymbolSize.CAPTION_2}
              weight={SFSymbolWeight.REGULAR}
              decorative
            />
            {dateRange
              ? `${dateRange.start.getMonth() + 1}월 ${dateRange.start.getDate()}일 ~ ${dateRange.end.getMonth() + 1}월 ${dateRange.end.getDate()}일`
              : dateFilter
                ? `${dateFilter.getMonth() + 1}월 ${dateFilter.getDate()}일`
                : ''}
          </span>
          <Tooltip content="날짜 필터 해제" placement="bottom">
            <button
              type="button"
              className="doc-explorer-toolbar__date-filter-clear"
              onClick={() => {
                onDateFilterClear()
                onDateRangeChange(null)
              }}
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

                    {/* 파일명 모드 토글은 컬럼 헤더로 이동됨 */}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 별칭 영역: 우측 끝 고정 (별칭 없는 문서가 있거나, 별칭 모드 활성 시만 표시) */}
      {onEditModeChange && (hasDocWithoutAlias || editMode === 'alias') && (
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--spacing-1-5)' }}>
          {/* 별칭 모드 활성 시: 선택 카운트 */}
          {editMode === 'alias' && (
            <div className="alias-mode-group" style={{ paddingRight: 'var(--spacing-2)', borderRight: '1px solid var(--color-border-primary)' }}>
              <span className="alias-mode-count">
                {selectedCount > 0
                  ? `${selectedCount}개 선택됨`
                  : `별칭 없는 ${aliasSelectableCount}건 선택 가능`}
              </span>
            </div>
          )}

          {/* 별칭AI ↔ 완료: 공용 토글 버튼 */}
          <AliasAIButton
            active={editMode === 'alias'}
            onClick={() => {
              if (editMode === 'alias' && selectedCount > 0) {
                onGenerateAliases?.(forceRegenerateAlias)
              }
              onEditModeChange(editMode === 'alias' ? 'none' : 'alias')
            }}
            disabled={editMode === 'delete' || isGeneratingAliases}
          />
        </div>
      )}
    </div>
  )
}
