/**
 * DocumentTypePickerModal - 문서유형 2단 선택 모달
 * 좌측: 9대분류 카테고리 / 우측: 소분류 목록 + 검색
 */

import React, { useState, useMemo, useCallback } from 'react'
import { Modal } from '@/shared/ui/Modal'
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_TYPE_LABELS,
  getGroupedDocumentTypes,
  type DocumentTypeGroup,
} from '@/shared/constants/documentCategories'
import './DocumentTypePickerModal.css'

interface DocumentTypePickerModalProps {
  visible: boolean
  currentType: string | null | undefined
  onSelect: (type: string) => void
  onClose: () => void
}

const GROUPED_TYPES = getGroupedDocumentTypes()

export const DocumentTypePickerModal: React.FC<DocumentTypePickerModalProps> = ({
  visible,
  currentType,
  onSelect,
  onClose,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>(
    () => GROUPED_TYPES[0]?.category.value ?? ''
  )
  const [searchQuery, setSearchQuery] = useState('')

  // 검색 결과: 전체 소분류에서 필터링
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null
    const q = searchQuery.trim().toLowerCase()
    const results: Array<{ value: string; label: string; categoryLabel: string }> = []
    for (const group of GROUPED_TYPES) {
      for (const t of group.types) {
        if (t.label.toLowerCase().includes(q) || t.value.toLowerCase().includes(q)) {
          results.push({ ...t, categoryLabel: group.category.label })
        }
      }
    }
    return results
  }, [searchQuery])

  // 현재 선택된 카테고리의 소분류 목록
  const currentGroup = useMemo(
    () => GROUPED_TYPES.find(g => g.category.value === selectedCategory),
    [selectedCategory]
  )

  const handleSelect = useCallback((type: string) => {
    onSelect(type)
    onClose()
  }, [onSelect, onClose])

  const handleClose = useCallback(() => {
    setSearchQuery('')
    onClose()
  }, [onClose])

  return (
    <Modal
      visible={visible}
      onClose={handleClose}
      title="문서유형 변경"
      size="sm"
      backdropClosable
      className="doc-type-picker-modal"
    >
      {/* 검색 */}
      <div className="doc-type-picker__search">
        <input
          type="text"
          className="doc-type-picker__search-input"
          placeholder="문서유형 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
        />
      </div>

      {/* 검색 모드 */}
      {searchResults ? (
        <div className="doc-type-picker__search-results">
          {searchResults.length === 0 ? (
            <div className="doc-type-picker__empty">검색 결과가 없습니다</div>
          ) : (
            searchResults.map(item => (
              <button
                key={item.value}
                className={`doc-type-picker__item ${item.value === currentType ? 'doc-type-picker__item--selected' : ''}`}
                onClick={() => handleSelect(item.value)}
              >
                <span className="doc-type-picker__item-label">{item.label}</span>
                <span className="doc-type-picker__item-category">{item.categoryLabel}</span>
              </button>
            ))
          )}
        </div>
      ) : (
        /* 2단 패널 모드 */
        <div className="doc-type-picker__panels">
          {/* 좌측: 대분류 */}
          <div className="doc-type-picker__categories">
            {GROUPED_TYPES.map(group => (
              <button
                key={group.category.value}
                className={`doc-type-picker__category ${group.category.value === selectedCategory ? 'doc-type-picker__category--active' : ''}`}
                onClick={() => setSelectedCategory(group.category.value)}
              >
                {group.category.label}
              </button>
            ))}
          </div>

          {/* 우측: 소분류 */}
          <div className="doc-type-picker__types">
            {currentGroup?.types.map(t => (
              <button
                key={t.value}
                className={`doc-type-picker__item ${t.value === currentType ? 'doc-type-picker__item--selected' : ''}`}
                onClick={() => handleSelect(t.value)}
              >
                <span className="doc-type-picker__item-label">{t.label}</span>
                {t.value === currentType && (
                  <span className="doc-type-picker__check">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}

export default DocumentTypePickerModal
