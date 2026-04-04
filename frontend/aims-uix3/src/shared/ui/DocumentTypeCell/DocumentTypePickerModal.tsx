/**
 * DocumentTypePickerPopover - 문서유형 선택 팝오버
 * Accordion 방식: 카테고리별 접기/펼치기 + 검색 + 확인/취소
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  getCategoryForType,
  getGroupedDocumentTypes,
} from '@/shared/constants/documentCategories'
import './DocumentTypePickerModal.css'

interface DocumentTypePickerPopoverProps {
  visible: boolean
  currentType: string | null | undefined
  triggerRef: React.RefObject<HTMLElement | null>
  onSelect: (type: string) => void
  onClose: () => void
}

export const DocumentTypePickerPopover: React.FC<DocumentTypePickerPopoverProps> = ({
  visible,
  currentType,
  triggerRef,
  onSelect,
  onClose,
}) => {
  // 🐛 FIX: 모듈 레벨에서 호출하면 prefetch 전이라 빈 배열. 렌더 시점에 호출
  const GROUPED_TYPES = useMemo(() => getGroupedDocumentTypes(), [visible])
  const currentCategory = getCategoryForType(currentType)
  const [expandedCategory, setExpandedCategory] = useState<string>(currentCategory)
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const popoverRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 팝오버 위치 계산
  useEffect(() => {
    if (visible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const popoverHeight = 420
      const popoverWidth = 280
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceRight = window.innerWidth - rect.left

      setPosition({
        top: spaceBelow < popoverHeight && rect.top > spaceBelow
          ? rect.top + window.scrollY - popoverHeight - 4
          : rect.bottom + window.scrollY + 4,
        left: spaceRight < popoverWidth
          ? rect.right + window.scrollX - popoverWidth
          : rect.left + window.scrollX,
      })

      setExpandedCategory(getCategoryForType(currentType))
      setSelectedType(null)
      setSearchQuery('')
    }
  }, [visible, currentType, triggerRef])

  // 자동 포커스
  useEffect(() => {
    if (visible) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [visible])

  // 외부 클릭 / ESC 닫기
  useEffect(() => {
    if (!visible) return
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [visible, onClose, triggerRef])

  // 검색 결과
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null
    const q = searchQuery.trim().toLowerCase()
    const results: Array<{ value: string; label: string; categoryLabel: string; categoryColor: string }> = []
    for (const group of GROUPED_TYPES) {
      for (const t of group.types) {
        if (t.label.toLowerCase().includes(q) || t.value.toLowerCase().includes(q)) {
          results.push({ ...t, categoryLabel: group.category.label, categoryColor: group.category.color })
        }
      }
    }
    return results
  }, [searchQuery])

  const handleToggleCategory = useCallback((catValue: string) => {
    setExpandedCategory(prev => prev === catValue ? '' : catValue)
  }, [])

  const handleConfirm = useCallback(() => {
    if (selectedType && selectedType !== currentType) {
      onSelect(selectedType)
    }
    onClose()
  }, [selectedType, currentType, onSelect, onClose])

  const effectiveSelected = selectedType ?? currentType
  const hasChange = !!selectedType && selectedType !== currentType

  if (!visible) return null

  return createPortal(
    <>
    <div className="doc-type-popover__backdrop" onClick={onClose} />
    <div
      ref={popoverRef}
      className="doc-type-popover"
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
    >
      {/* 검색바 */}
      <div className="doc-type-popover__search">
        <svg className="doc-type-popover__search-icon" width="13" height="13" viewBox="0 0 13 13" fill="none">
          <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2" />
          <line x1="9" y1="9" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <input
          ref={searchInputRef}
          type="text"
          className="doc-type-popover__search-input"
          placeholder="문서유형 검색"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* 콘텐츠 영역 */}
      <div className="doc-type-popover__content">
        {searchResults ? (
          searchResults.length === 0 ? (
            <div className="doc-type-popover__empty">검색 결과 없음</div>
          ) : (
            searchResults.map(item => (
              <button
                key={item.value}
                type="button"
                className={`doc-type-popover__item ${item.value === effectiveSelected ? 'doc-type-popover__item--selected' : ''}`}
                onClick={() => setSelectedType(item.value)}
              >
                <span className="doc-type-popover__item-dot" style={{ backgroundColor: item.categoryColor }} />
                <span className="doc-type-popover__item-label">{item.label}</span>
                <span className="doc-type-popover__item-cat">{item.categoryLabel}</span>
                {item.value === effectiveSelected && <span className="doc-type-popover__check">✓</span>}
              </button>
            ))
          )
        ) : (
          GROUPED_TYPES.map(group => {
            const isExpanded = expandedCategory === group.category.value
            return (
              <div key={group.category.value} className="doc-type-popover__group">
                <button
                  type="button"
                  className={`doc-type-popover__cat-header ${isExpanded ? 'doc-type-popover__cat-header--expanded' : ''}`}
                  onClick={() => handleToggleCategory(group.category.value)}
                >
                  <span className={`doc-type-popover__disclosure ${isExpanded ? 'doc-type-popover__disclosure--open' : ''}`}>▸</span>
                  <span className="doc-type-popover__cat-dot" style={{ backgroundColor: group.category.color }} />
                  <span className="doc-type-popover__cat-label">{group.category.label}</span>
                  <span className="doc-type-popover__cat-count">{group.types.length}</span>
                </button>
                {isExpanded && (
                  <div className="doc-type-popover__sub-list">
                    {group.types.map(t => (
                      <button
                        key={t.value}
                        type="button"
                        className={`doc-type-popover__item doc-type-popover__item--sub ${t.value === effectiveSelected ? 'doc-type-popover__item--selected' : ''}`}
                        onClick={() => setSelectedType(t.value)}
                      >
                        <span className="doc-type-popover__item-label">{t.label}</span>
                        {t.value === effectiveSelected && <span className="doc-type-popover__check">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* 하단 액션 바 */}
      <div className="doc-type-popover__actions">
        <button type="button" className="doc-type-popover__btn-cancel" onClick={onClose}>취소</button>
        <button
          type="button"
          className={`doc-type-popover__btn-confirm ${!hasChange ? 'doc-type-popover__btn-confirm--disabled' : ''}`}
          onClick={handleConfirm}
          disabled={!hasChange}
        >
          변경하기
        </button>
      </div>
    </div>
    </>,
    document.body
  )
}

// 하위 호환성
export const DocumentTypePickerModal = DocumentTypePickerPopover

