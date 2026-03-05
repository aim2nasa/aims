/**
 * CustomerDocumentExplorerView - CenterPane 고객별 문서 탐색기
 * Phase 3: 카테고리 트리 + 확대/축소 전환
 */

import React, { useState, useMemo, useCallback } from 'react'
import { CenterPaneView } from '@/components/CenterPaneView/CenterPaneView'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '@/components/SFSymbol'
import { Tooltip } from '@/shared/ui'
import { useCustomerDocumentsController } from '@/features/customer/controllers/useCustomerDocumentsController'
import {
  DOCUMENT_CATEGORIES,
  getCategoryForType,
} from '@/shared/constants/documentCategories'
import { formatDateTimeCompact } from '@/shared/lib/timeUtils'
import type { CustomerDocumentItem } from '@/services/DocumentService'
import './CustomerDocumentExplorerView.css'

interface CustomerDocumentExplorerViewProps {
  visible: boolean
  customerId: string | null
  customerName: string | null
  onClose: () => void
  onCollapse: () => void
}

interface CategoryGroup {
  value: string
  label: string
  icon: string
  color: string
  documents: CustomerDocumentItem[]
}

export const CustomerDocumentExplorerView: React.FC<CustomerDocumentExplorerViewProps> = ({
  visible,
  customerId,
  customerName,
  onClose,
  onCollapse,
}) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => new Set())

  const {
    documents,
    isLoading,
    error,
  } = useCustomerDocumentsController(visible ? customerId : null)

  // 카테고리별 그룹화
  const categoryGroups = useMemo<CategoryGroup[]>(() => {
    if (!documents || documents.length === 0) return []

    const groups = new Map<string, CustomerDocumentItem[]>()

    for (const doc of documents) {
      const docType = doc.document_type || (doc.isAnnualReport ? 'annual_report' : '')
      const cat = getCategoryForType(docType)
      if (!groups.has(cat)) groups.set(cat, [])
      groups.get(cat)!.push(doc)
    }

    return DOCUMENT_CATEGORIES
      .filter(cat => {
        const docs = groups.get(cat.value)
        return docs && docs.length > 0
      })
      .map(cat => ({
        value: cat.value,
        label: cat.label,
        icon: cat.icon,
        color: cat.color,
        documents: groups.get(cat.value)!,
      }))
  }, [documents])

  // 펼침/접힘 토글
  const toggleCategory = useCallback((categoryValue: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(categoryValue)) {
        next.delete(categoryValue)
      } else {
        next.add(categoryValue)
      }
      return next
    })
  }, [])

  // 전체 펼침/접힘
  const toggleAll = useCallback(() => {
    setExpandedCategories(prev => {
      if (prev.size === categoryGroups.length) {
        return new Set()
      }
      return new Set(categoryGroups.map(g => g.value))
    })
  }, [categoryGroups])

  const allExpanded = expandedCategories.size === categoryGroups.length && categoryGroups.length > 0

  if (!visible) return null

  return (
    <CenterPaneView
      visible={visible}
      title={`${customerName || '고객'} 문서 탐색기`}
      titleIcon={
        <SFSymbol
          name="folder"
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.MEDIUM}
          decorative={true}
        />
      }
      titleAccessory={
        <div className="cde-header-actions">
          <Tooltip content={allExpanded ? '모두 접기' : '모두 펼치기'}>
            <button
              type="button"
              className="cde-header-btn"
              onClick={toggleAll}
              aria-label={allExpanded ? '모두 접기' : '모두 펼치기'}
            >
              <SFSymbol
                name={allExpanded ? 'chevron.up' : 'chevron.down'}
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.MEDIUM}
                decorative={true}
              />
            </button>
          </Tooltip>
          <Tooltip content="간략 뷰로 축소">
            <button
              type="button"
              className="cde-header-btn"
              onClick={onCollapse}
              aria-label="간략 뷰로 축소"
            >
              <SFSymbol
                name="xmark"
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.MEDIUM}
                decorative={true}
              />
            </button>
          </Tooltip>
        </div>
      }
      onClose={onClose}
      className="customer-document-explorer"
    >
      {isLoading && (
        <div className="cde-state">
          <SFSymbol name="arrow.clockwise" size={SFSymbolSize.BODY} weight={SFSymbolWeight.MEDIUM} decorative={true} />
          <span>문서를 불러오는 중...</span>
        </div>
      )}

      {error && !isLoading && (
        <div className="cde-state cde-state--error">
          <SFSymbol name="exclamationmark" size={SFSymbolSize.BODY} weight={SFSymbolWeight.MEDIUM} decorative={true} />
          <span>문서를 불러올 수 없습니다</span>
        </div>
      )}

      {!isLoading && !error && categoryGroups.length === 0 && (
        <div className="cde-state">
          <SFSymbol name="doc" size={SFSymbolSize.BODY} weight={SFSymbolWeight.MEDIUM} decorative={true} />
          <span>문서가 없습니다</span>
        </div>
      )}

      {!isLoading && !error && categoryGroups.length > 0 && (
        <div className="cde-tree">
          <div className="cde-summary">
            총 <strong>{documents.length}</strong>건 · {categoryGroups.length}개 분류
          </div>
          {categoryGroups.map(group => {
            const isExpanded = expandedCategories.has(group.value)
            return (
              <div key={group.value} className="cde-category" style={{ '--cde-cat-color': group.color } as React.CSSProperties}>
                <button
                  type="button"
                  className="cde-category__header"
                  onClick={() => toggleCategory(group.value)}
                  aria-expanded={isExpanded}
                >
                  <SFSymbol
                    name={isExpanded ? 'chevron.down' : 'chevron.right'}
                    size={SFSymbolSize.CAPTION_2}
                    weight={SFSymbolWeight.SEMIBOLD}
                    color={group.color}
                    decorative={true}
                  />
                  <SFSymbol
                    name="folder"
                    size={SFSymbolSize.CAPTION_1}
                    weight={SFSymbolWeight.MEDIUM}
                    color={group.color}
                    decorative={true}
                  />
                  <span className="cde-category__label">{group.label}</span>
                  <span className="cde-category__count">({group.documents.length}건)</span>
                </button>

                {isExpanded && (
                  <div className="cde-category__docs">
                    {group.documents.map(doc => (
                      <div key={doc._id} className="cde-doc-row">
                        <span className="cde-doc-row__icon">
                          <SFSymbol
                            name="doc"
                            size={SFSymbolSize.CAPTION_2}
                            weight={SFSymbolWeight.MEDIUM}
                            color={group.color}
                            decorative={true}
                          />
                        </span>
                        <span className="cde-doc-row__name" title={doc.originalName}>
                          {doc.originalName}
                        </span>
                        <span className="cde-doc-row__type">
                          {doc.document_type || '-'}
                        </span>
                        <span className="cde-doc-row__date">
                          {doc.linkedAt ? formatDateTimeCompact(doc.linkedAt) : '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </CenterPaneView>
  )
}

export default CustomerDocumentExplorerView
