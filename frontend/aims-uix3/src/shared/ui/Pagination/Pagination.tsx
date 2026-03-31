/**
 * 공용 Pagination 컴포넌트
 * @since 2026-03-31
 * @version 1.0.0
 *
 * 모든 페이지네이션 UI의 Single Source of Truth
 * - 처음(<<)/마지막(>>) 버튼 (default 모드)
 * - 이전(<)/다음(>) 버튼
 * - 페이지 번호 클릭 -> input 전환 (Progressive Disclosure)
 * - compact 모드: 처음/마지막 버튼 생략
 */

import React, { useState, useRef, useCallback, useEffect } from 'react'
import './Pagination.css'

export interface PaginationProps {
  /** 현재 페이지 (1-based) */
  currentPage: number
  /** 총 페이지 수 */
  totalPages: number
  /** 페이지 변경 핸들러 */
  onPageChange: (page: number) => void
  /** 모드: default(전체 버튼) / compact(처음/마지막 생략) */
  variant?: 'default' | 'compact'
}

/**
 * 입력값을 유효한 페이지 번호로 clamping
 */
const clampPage = (value: number, totalPages: number): number => {
  if (!Number.isFinite(value) || value < 1) return 1
  if (value > totalPages) return totalPages
  return Math.floor(value)
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  variant = 'default',
}) => {
  // 클릭 피드백 상태
  const [clickedButton, setClickedButton] = useState<string | null>(null)
  // 클릭 피드백 타이머 (메모리 누수 방지)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 페이지 번호 편집 모드
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        clearTimeout(feedbackTimerRef.current)
      }
    }
  }, [])

  const isFirst = currentPage === 1
  const isLast = currentPage === totalPages

  /**
   * 클릭 피드백 포함 페이지 변경
   */
  const handlePageChangeWithFeedback = useCallback((page: number, direction: string) => {
    const clamped = clampPage(page, totalPages)
    if (clamped === currentPage) return

    // 빠른 연속 클릭 시 이전 타이머 정리
    if (feedbackTimerRef.current !== null) {
      clearTimeout(feedbackTimerRef.current)
    }

    setClickedButton(direction)
    onPageChange(clamped)

    feedbackTimerRef.current = setTimeout(() => {
      setClickedButton(null)
      feedbackTimerRef.current = null
    }, 600)
  }, [currentPage, totalPages, onPageChange])

  /**
   * 페이지 번호 클릭 -> 편집 모드 진입
   */
  const handleStartEdit = useCallback(() => {
    if (totalPages <= 1) return
    setEditValue(String(currentPage))
    setIsEditing(true)
  }, [currentPage, totalPages])

  /**
   * 편집 모드에서 input에 포커스
   */
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  /**
   * 편집 확정 (Enter/blur)
   */
  const handleConfirmEdit = useCallback(() => {
    setIsEditing(false)
    const parsed = parseInt(editValue, 10)
    if (isNaN(parsed) || editValue.trim() === '') return

    const clamped = clampPage(parsed, totalPages)
    if (clamped !== currentPage) {
      onPageChange(clamped)
    }
  }, [editValue, totalPages, currentPage, onPageChange])

  /**
   * 편집 취소 (ESC)
   */
  const handleCancelEdit = useCallback(() => {
    setIsEditing(false)
  }, [])

  /**
   * input 키보드 이벤트
   */
  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirmEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelEdit()
    }
  }, [handleConfirmEdit, handleCancelEdit])

  /**
   * input 값 변경 (숫자만 허용)
   */
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    // 빈 문자열 또는 숫자만 허용
    if (val === '' || /^\d+$/.test(val)) {
      setEditValue(val)
    }
  }, [])

  // totalPages <= 1이면 네비게이션 숨김
  if (totalPages <= 1) return null

  const showFirstLast = variant === 'default'

  return (
    <div className="pagination-controls">
      {/* 처음으로 (default 모드만) */}
      {showFirstLast && (
        <button
          type="button"
          className="pagination-button pagination-button--first"
          onClick={() => handlePageChangeWithFeedback(1, 'first')}
          disabled={isFirst}
          aria-label="첫 페이지"
        >
          <span className={`pagination-arrow ${clickedButton === 'first' ? 'pagination-arrow--clicked' : ''}`}>
            {'\u00AB'}
          </span>
        </button>
      )}

      {/* 이전 */}
      <button
        type="button"
        className="pagination-button pagination-button--prev"
        onClick={() => handlePageChangeWithFeedback(currentPage - 1, 'prev')}
        disabled={isFirst}
        aria-label="이전 페이지"
      >
        <span className={`pagination-arrow ${clickedButton === 'prev' ? 'pagination-arrow--clicked' : ''}`}>
          {'\u2039'}
        </span>
      </button>

      {/* 페이지 정보 */}
      <div className="pagination-info">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            className="pagination-input"
            value={editValue}
            onChange={handleInputChange}
            onBlur={handleConfirmEdit}
            onKeyDown={handleInputKeyDown}
            aria-label="페이지 번호 입력"
          />
        ) : (
          <span
            className="pagination-current pagination-current--editable"
            onClick={handleStartEdit}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') handleStartEdit() }}
            aria-label="페이지 번호 입력"
            title="클릭하여 페이지 번호 입력"
          >
            {currentPage}
          </span>
        )}
        <span className="pagination-separator">/</span>
        <span className="pagination-total">{totalPages}</span>
      </div>

      {/* 다음 */}
      <button
        type="button"
        className="pagination-button pagination-button--next"
        onClick={() => handlePageChangeWithFeedback(currentPage + 1, 'next')}
        disabled={isLast}
        aria-label="다음 페이지"
      >
        <span className={`pagination-arrow ${clickedButton === 'next' ? 'pagination-arrow--clicked' : ''}`}>
          {'\u203A'}
        </span>
      </button>

      {/* 마지막으로 (default 모드만) */}
      {showFirstLast && (
        <button
          type="button"
          className="pagination-button pagination-button--last"
          onClick={() => handlePageChangeWithFeedback(totalPages, 'last')}
          disabled={isLast}
          aria-label="마지막 페이지"
        >
          <span className={`pagination-arrow ${clickedButton === 'last' ? 'pagination-arrow--clicked' : ''}`}>
            {'\u00BB'}
          </span>
        </button>
      )}
    </div>
  )
}

export default Pagination
