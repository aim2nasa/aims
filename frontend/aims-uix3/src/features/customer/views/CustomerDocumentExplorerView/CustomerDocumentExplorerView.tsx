/**
 * CustomerDocumentExplorerView - CenterPane 고객별 문서 탐색기
 * 2단 트리: 대분류(9) → 소분류(45) → 문서
 */

import React, { useState, useMemo, useCallback } from 'react'
import { CenterPaneView } from '@/components/CenterPaneView/CenterPaneView'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '@/components/SFSymbol'
import { Tooltip } from '@/shared/ui'
import { useCustomerDocumentsController } from '@/features/customer/controllers/useCustomerDocumentsController'
import {
  DOCUMENT_CATEGORIES,
  getCategoryForType,
  getDocumentTypeLabel,
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

/** 소분류 그룹 */
interface SubTypeGroup {
  typeValue: string
  label: string
  documents: CustomerDocumentItem[]
}

/** 대분류 그룹 */
interface CategoryGroup {
  value: string
  label: string
  icon: string
  color: string
  subTypes: SubTypeGroup[]
  totalCount: number
}

/**
 * 문서에서 실질적 document_type 값을 추출
 * - isAnnualReport/isCustomerReview 플래그도 반영
 */
function getEffectiveType(doc: CustomerDocumentItem): string {
  if (doc.document_type) return doc.document_type
  if (doc.isAnnualReport) return 'annual_report'
  return ''
}

export const CustomerDocumentExplorerView: React.FC<CustomerDocumentExplorerViewProps> = ({
  visible,
  customerId,
  customerName,
  onClose,
  onCollapse,
}) => {
  // 펼침 상태: "category:insurance" 또는 "subtype:insurance/annual_report" 형식
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set())

  const {
    documents,
    isLoading,
    error,
  } = useCustomerDocumentsController(visible ? customerId : null)

  // 2단 트리 구성: 대분류 → 소분류 → 문서
  const categoryGroups = useMemo<CategoryGroup[]>(() => {
    if (!documents || documents.length === 0) return []

    // 1단계: document_type별로 문서 그룹화
    const typeGroups = new Map<string, CustomerDocumentItem[]>()
    for (const doc of documents) {
      const docType = getEffectiveType(doc) || 'unspecified'
      if (!typeGroups.has(docType)) typeGroups.set(docType, [])
      typeGroups.get(docType)!.push(doc)
    }

    // 2단계: 대분류별로 소분류 그룹을 모음
    const categoryMap = new Map<string, SubTypeGroup[]>()
    for (const [docType, docs] of typeGroups) {
      const cat = getCategoryForType(docType)
      if (!categoryMap.has(cat)) categoryMap.set(cat, [])
      categoryMap.get(cat)!.push({
        typeValue: docType,
        label: getDocumentTypeLabel(docType),
        documents: docs,
      })
    }

    // 3단계: DOCUMENT_CATEGORIES 순서대로 정렬, 소분류는 건수 내림차순
    return DOCUMENT_CATEGORIES
      .filter(cat => categoryMap.has(cat.value))
      .map(cat => {
        const subTypes = categoryMap.get(cat.value)!
        subTypes.sort((a, b) => b.documents.length - a.documents.length)
        return {
          value: cat.value,
          label: cat.label,
          icon: cat.icon,
          color: cat.color,
          subTypes,
          totalCount: subTypes.reduce((sum, st) => sum + st.documents.length, 0),
        }
      })
  }, [documents])

  const toggleNode = useCallback((nodeKey: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeKey)) {
        next.delete(nodeKey)
      } else {
        next.add(nodeKey)
      }
      return next
    })
  }, [])

  // 전체 펼침: 대분류만 (소분류는 접힌 상태)
  const toggleAll = useCallback(() => {
    setExpandedNodes(prev => {
      const catKeys = categoryGroups.map(g => `cat:${g.value}`)
      const allCatsExpanded = catKeys.every(k => prev.has(k))
      if (allCatsExpanded) {
        return new Set()
      }
      return new Set(catKeys)
    })
  }, [categoryGroups])

  const allExpanded = categoryGroups.length > 0 &&
    categoryGroups.every(g => expandedNodes.has(`cat:${g.value}`))

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
            const catKey = `cat:${group.value}`
            const isCatExpanded = expandedNodes.has(catKey)

            return (
              <div key={group.value} className="cde-category" style={{ '--cde-cat-color': group.color } as React.CSSProperties}>
                {/* 대분류 헤더 */}
                <button
                  type="button"
                  className="cde-category__header"
                  onClick={() => toggleNode(catKey)}
                  aria-expanded={isCatExpanded}
                >
                  <SFSymbol
                    name={isCatExpanded ? 'chevron.down' : 'chevron.right'}
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
                  <span className="cde-category__count">({group.totalCount}건)</span>
                </button>

                {/* 소분류 목록 */}
                {isCatExpanded && (
                  <div className="cde-subtypes">
                    {group.subTypes.map(subType => {
                      const stKey = `st:${group.value}/${subType.typeValue}`
                      const isStExpanded = expandedNodes.has(stKey)

                      return (
                        <div key={subType.typeValue} className="cde-subtype">
                          {/* 소분류 헤더 */}
                          <button
                            type="button"
                            className="cde-subtype__header"
                            onClick={() => toggleNode(stKey)}
                            aria-expanded={isStExpanded}
                          >
                            <SFSymbol
                              name={isStExpanded ? 'chevron.down' : 'chevron.right'}
                              size={SFSymbolSize.CAPTION_2}
                              weight={SFSymbolWeight.MEDIUM}
                              color={group.color}
                              decorative={true}
                            />
                            <SFSymbol
                              name="folder"
                              size={SFSymbolSize.CAPTION_2}
                              weight={SFSymbolWeight.MEDIUM}
                              color={group.color}
                              decorative={true}
                            />
                            <span className="cde-subtype__label">{subType.label}</span>
                            <span className="cde-subtype__count">({subType.documents.length}건)</span>
                          </button>

                          {/* 문서 목록 */}
                          {isStExpanded && (
                            <div className="cde-subtype__docs">
                              {subType.documents.map(doc => (
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
              </div>
            )
          })}
        </div>
      )}
    </CenterPaneView>
  )
}

export default CustomerDocumentExplorerView
