/**
 * DocumentCategoryFilter — 문서 탭 분류 트리 네비게이션
 *
 * @since 2026-04-11 (드롭다운 → 드릴다운 트리 전환)
 * @updated 2026-04-11 (상위로 버튼 제거 + "전체" 가상 폴더 추가 + "분류" 라벨 중복 제거)
 *
 * 합의된 명세 (DISCUSSION_2026-04-11_customer-doc-tab-tree-filter.md):
 * - 드릴다운(Finder/탐색기 스타일) — 한 화면 = 한 단계
 * - 루트에 "전체" 가상 폴더 추가(맨 앞) — sentinel `ALL_CATEGORY_SENTINEL`로 표현
 * - 폴더만 OR 파일만 (한 레벨 = 한 종류, 혼재 금지)
 * - 빈 폴더 숨김
 *
 * 컴포넌트 구조:
 * - <DocumentCategoryFilter />        : 브레드크럼 (필터 바에 렌더)
 * - <DocumentCategoryFolderGrid />    : 폴더 그리드 (파일 리스트 영역에 렌더)
 *
 * 상태는 부모(DocumentsTab)가 보유 — selectedCategory + selectedSubType
 * - selectedCategory === null                  → 루트 (전체 + 대분류 N개)
 * - selectedCategory === ALL_CATEGORY_SENTINEL → 전체 모드 (모든 파일, 즉시 파일 테이블)
 * - selectedCategory !== null && selectedSubType === null → 소분류 폴더 표시
 * - selectedSubType !== null                   → 파일 모드 (부모가 파일 테이블 렌더)
 */

import React, { useMemo } from 'react'
import { Button } from '@/shared/ui'
import {
  DOCUMENT_CATEGORIES,
  getCategoryForType,
  getCategoryInfo,
  getDocumentTypeLabel,
  getTypeDisplayOrder,
} from '@/shared/constants/documentCategories'
import type { CustomerDocumentItem } from '@/services/DocumentService'

/**
 * "전체" 가상 폴더 sentinel — 실제 카테고리 값과 충돌 방지를 위해 __all__ 사용.
 * DOCUMENT_CATEGORIES 상수에는 없으며, buildCategoryTree 결과 배열 맨 앞에만 삽입된다.
 * selectedCategory === ALL_CATEGORY_SENTINEL이면 분류 필터를 우회하여 모든 문서 표시.
 */
export const ALL_CATEGORY_SENTINEL = '__all__'

/** 대분류 카테고리별 이모지 — treeBuilders.ts와 동일 매핑 (재사용을 위해 import 대신 동일 값 정의) */
const CATEGORY_EMOJI: Record<string, string> = {
  insurance: '🛡️',
  claim: '🏥',
  identity: '🪪',
  medical: '❤️',
  asset: '🏢',
  corporate: '🏛️',
  etc: '📄',
}

// ============================================================================
// 공통 데이터 빌더 — 빈 폴더 숨김 + 카운트 계산
// ============================================================================

interface CategoryFolder {
  value: string
  label: string
  emoji: string
  count: number
}

interface SubTypeFolder {
  value: string
  label: string
  count: number
}

interface CategoryTree {
  /** 루트: 표시할 대분류 (count > 0) */
  rootCategories: CategoryFolder[]
  /** category value → 소분류 폴더 목록 (count > 0) */
  subTypesByCategory: Map<string, SubTypeFolder[]>
}

export function buildCategoryTree(documents: CustomerDocumentItem[]): CategoryTree {
  // 1. 소분류(doc_type)별 카운트 집계
  const typeCounts = new Map<string, number>()
  for (const doc of documents) {
    const docType = doc.document_type || (doc.isAnnualReport ? 'annual_report' : '')
    if (!docType) continue
    typeCounts.set(docType, (typeCounts.get(docType) || 0) + 1)
  }

  // 2. 대분류별로 소분류 그룹화 (treeBuilders.ts 189-235 패턴 동일)
  const subTypesByCategory = new Map<string, SubTypeFolder[]>()
  const categoryCounts = new Map<string, number>()

  for (const cat of DOCUMENT_CATEGORIES) {
    const subTypes: SubTypeFolder[] = []
    let catTotal = 0

    Array.from(typeCounts.entries())
      .filter(([typeValue]) => getCategoryForType(typeValue) === cat.value)
      .sort((a, b) => getTypeDisplayOrder(a[0]) - getTypeDisplayOrder(b[0]))
      .forEach(([typeValue, count]) => {
        subTypes.push({
          value: typeValue,
          label: getDocumentTypeLabel(typeValue),
          count,
        })
        catTotal += count
      })

    if (subTypes.length > 0) {
      subTypesByCategory.set(cat.value, subTypes)
      categoryCounts.set(cat.value, catTotal)
    }
  }

  // 3. 루트 카테고리 (자식 있는 것만, DOCUMENT_CATEGORIES 정의 순서 유지)
  const realCategories: CategoryFolder[] = DOCUMENT_CATEGORIES
    .filter(cat => (categoryCounts.get(cat.value) || 0) > 0)
    .map(cat => ({
      value: cat.value,
      label: cat.label,
      emoji: CATEGORY_EMOJI[cat.value] || '📁',
      count: categoryCounts.get(cat.value) || 0,
    }))

  // "전체" 가상 폴더 — 문서가 한 건이라도 있으면 맨 앞에 삽입
  // DOCUMENT_CATEGORIES 상수는 수정하지 않고, 결과 배열에만 추가한다.
  const rootCategories: CategoryFolder[] = documents.length > 0
    ? [
        {
          value: ALL_CATEGORY_SENTINEL,
          label: '전체',
          emoji: '📂',
          count: documents.length,
        },
        ...realCategories,
      ]
    : realCategories

  return { rootCategories, subTypesByCategory }
}

// ============================================================================
// Breadcrumb — 필터 바에 렌더
// ============================================================================

export interface DocumentCategoryFilterProps {
  documents: CustomerDocumentItem[]
  /** 선택된 대분류 (null = 루트) */
  selectedCategory: string | null
  /** 선택된 소분류 (null = 폴더 모드) */
  selectedSubType: string | null
  /** 대분류 변경 (소분류는 부모에서 자동으로 null로 리셋해야 함) */
  onCategoryChange: (category: string | null) => void
  /** 소분류 변경 */
  onSubTypeChange: (subType: string | null) => void
}

export const DocumentCategoryFilter: React.FC<DocumentCategoryFilterProps> = ({
  selectedCategory,
  selectedSubType,
  onCategoryChange,
  onSubTypeChange,
}) => {
  const categoryLabel = useMemo(() => {
    if (!selectedCategory) return null
    if (selectedCategory === ALL_CATEGORY_SENTINEL) return '전체'
    return getCategoryInfo(selectedCategory)?.label ?? selectedCategory
  }, [selectedCategory])

  const subTypeLabel = useMemo(() => {
    if (!selectedSubType) return null
    return getDocumentTypeLabel(selectedSubType)
  }, [selectedSubType])

  const handleRoot = () => {
    onSubTypeChange(null)
    onCategoryChange(null)
  }

  const handleCategory = () => {
    onSubTypeChange(null)
  }

  // "전체" 모드에서는 소분류 단계가 없으므로 카테고리 크럼을 렌더하지 않는다.
  const isAllMode = selectedCategory === ALL_CATEGORY_SENTINEL

  return (
    <div className="document-category-filter" role="navigation" aria-label="문서 분류 탐색">
      {/* 브레드크럼 */}
      <nav className="document-category-filter__crumbs" aria-label="분류 경로">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className={`document-category-filter__crumb${
            !selectedCategory ? ' document-category-filter__crumb--current' : ''
          }`}
          onClick={handleRoot}
          disabled={!selectedCategory && !selectedSubType}
          aria-current={!selectedCategory ? 'page' : undefined}
        >
          분류
        </Button>

        {selectedCategory && isAllMode && (
          <>
            <span className="document-category-filter__sep" aria-hidden="true">›</span>
            <span
              className="document-category-filter__crumb document-category-filter__crumb--current document-category-filter__crumb--all"
              aria-current="page"
            >
              전체
            </span>
          </>
        )}

        {selectedCategory && !isAllMode && (
          <>
            <span className="document-category-filter__sep" aria-hidden="true">›</span>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className={`document-category-filter__crumb${
                !selectedSubType ? ' document-category-filter__crumb--current' : ''
              }`}
              onClick={handleCategory}
              disabled={!selectedSubType}
              aria-current={!selectedSubType ? 'page' : undefined}
            >
              {categoryLabel}
            </Button>
          </>
        )}

        {selectedSubType && (
          <>
            <span className="document-category-filter__sep" aria-hidden="true">›</span>
            <span
              className="document-category-filter__crumb document-category-filter__crumb--current"
              aria-current="page"
            >
              {subTypeLabel}
            </span>
          </>
        )}
      </nav>
    </div>
  )
}

// ============================================================================
// FolderGrid — 파일 리스트 영역에 렌더 (폴더 모드일 때만)
// ============================================================================

export interface DocumentCategoryFolderGridProps {
  documents: CustomerDocumentItem[]
  selectedCategory: string | null
  selectedSubType: string | null
  onCategoryChange: (category: string | null) => void
  onSubTypeChange: (subType: string | null) => void
}

export const DocumentCategoryFolderGrid: React.FC<DocumentCategoryFolderGridProps> = ({
  documents,
  selectedCategory,
  selectedSubType,
  onCategoryChange,
  onSubTypeChange,
}) => {
  const tree = useMemo(() => buildCategoryTree(documents), [documents])

  // 파일 모드일 땐 폴더 그리드를 렌더하지 않음 (부모가 파일 테이블을 렌더)
  if (selectedSubType !== null) return null

  // 루트 모드: 대분류 폴더 표시
  if (selectedCategory === null) {
    if (tree.rootCategories.length === 0) {
      return (
        <div className="document-category-folder-grid document-category-folder-grid--empty">
          <p>표시할 분류가 없습니다.</p>
        </div>
      )
    }

    return (
      <div
        className="document-category-folder-grid"
        role="grid"
        aria-label="대분류 폴더 목록"
      >
        {tree.rootCategories.map(cat => (
          <div
            key={cat.value}
            className="document-category-folder"
            role="gridcell"
            tabIndex={0}
            onClick={() => onCategoryChange(cat.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onCategoryChange(cat.value)
              }
            }}
            aria-label={`${cat.label} (${cat.count}개 문서)`}
          >
            <span className="document-category-folder__icon" aria-hidden="true">
              {cat.emoji}
            </span>
            <span className="document-category-folder__label">{cat.label}</span>
            <span className="document-category-folder__count">{cat.count}</span>
          </div>
        ))}
      </div>
    )
  }

  // 카테고리 모드: 소분류 폴더 표시
  const subTypes = tree.subTypesByCategory.get(selectedCategory) || []

  if (subTypes.length === 0) {
    return (
      <div className="document-category-folder-grid document-category-folder-grid--empty">
        <p>이 분류에 해당하는 문서가 없습니다.</p>
      </div>
    )
  }

  return (
    <div
      className="document-category-folder-grid"
      role="grid"
      aria-label="소분류 폴더 목록"
    >
      {subTypes.map(sub => (
        <div
          key={sub.value}
          className="document-category-folder"
          role="gridcell"
          tabIndex={0}
          onClick={() => onSubTypeChange(sub.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onSubTypeChange(sub.value)
            }
          }}
          aria-label={`${sub.label} (${sub.count}개 문서)`}
        >
          <span className="document-category-folder__icon" aria-hidden="true">📁</span>
          <span className="document-category-folder__label">{sub.label}</span>
          <span className="document-category-folder__count">{sub.count}</span>
        </div>
      ))}
    </div>
  )
}
