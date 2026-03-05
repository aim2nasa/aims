/**
 * DocumentCategoryFilter - 1/4 페인용 카테고리 필터
 * DOCUMENT_TAXONOMY.md Phase 2: 기존 리스트에 카테고리 드롭다운 추가
 */

import React, { useMemo } from 'react'
import { Dropdown } from '@/shared/ui'
import type { DropdownOption } from '@/shared/ui'
import {
  DOCUMENT_CATEGORIES,
  getCategoryForType,
} from '@/shared/constants/documentCategories'
import type { CustomerDocumentItem } from '@/services/DocumentService'

interface DocumentCategoryFilterProps {
  documents: CustomerDocumentItem[]
  selectedCategory: string
  onCategoryChange: (category: string) => void
}

export const DocumentCategoryFilter: React.FC<DocumentCategoryFilterProps> = ({
  documents,
  selectedCategory,
  onCategoryChange,
}) => {
  const options = useMemo<DropdownOption[]>(() => {
    // 각 카테고리별 문서 수 계산
    const counts = new Map<string, number>()
    let total = 0
    for (const doc of documents) {
      const docType = doc.document_type || (doc.isAnnualReport ? 'annual_report' : '')
      const cat = getCategoryForType(docType)
      counts.set(cat, (counts.get(cat) || 0) + 1)
      total++
    }

    const result: DropdownOption[] = [
      { value: '', label: `전체 (${total})` },
    ]

    for (const cat of DOCUMENT_CATEGORIES) {
      const count = counts.get(cat.value) || 0
      if (count > 0) {
        result.push({
          value: cat.value,
          label: `${cat.label} (${count})`,
        })
      }
    }

    return result
  }, [documents])

  return (
    <div className="document-category-filter">
      <span className="document-category-filter__label">분류</span>
      <Dropdown
        value={selectedCategory}
        options={options}
        onChange={onCategoryChange}
        aria-label="문서 카테고리 필터"
        minWidth={80}
      />
    </div>
  )
}
