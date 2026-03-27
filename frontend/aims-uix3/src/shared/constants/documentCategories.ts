/**
 * AIMS 문서 분류 카테고리 매핑
 * TAXONOMY_V4_MIGRATION.md 기준 (7대분류)
 *
 * [Phase 3] DB SSoT 전환:
 * - DOCUMENT_TYPE_LABELS, TYPE_TO_CATEGORY 하드코딩 상수 제거
 * - 모듈 레벨 캐시(_typeCache)에 API 데이터를 저장하여 동기 함수 유지
 * - prefetchDocumentTypes()로 앱 시작 시 캐시 채움
 */

import { api } from '@/shared/lib/api'
import type { DocumentType } from '@/shared/hooks/useDocumentTypes'

export interface DocumentCategory {
  value: string
  label: string
  icon: string
  color: string
}

/** 7개 대분류 카테고리 정의 (표시 순서) — UI 관심사이므로 프론트엔드에 유지 */
export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  { value: 'insurance', label: '보험계약', icon: 'shield', color: '#2563eb' },
  { value: 'claim', label: '보험금청구', icon: 'cross.case', color: '#dc2626' },
  { value: 'identity', label: '신분/증명', icon: 'person.text.rectangle', color: '#7c3aed' },
  { value: 'medical', label: '건강/의료', icon: 'heart.text.square', color: '#e11d48' },
  { value: 'asset', label: '자산', icon: 'building.2', color: '#d97706' },
  { value: 'corporate', label: '법인', icon: 'building.columns', color: '#0891b2' },
  { value: 'etc', label: '기타', icon: 'doc', color: '#6b7280' },
]

// ============================================================================
// 모듈 레벨 캐시 (prefetchDocumentTypes로 채워짐)
// ============================================================================

/** 캐시 엔트리: label + category */
interface TypeCacheEntry {
  label: string
  category: string
  isSystem?: boolean
  isLegacy?: boolean
  order: number
}

/** 모듈 레벨 캐시 — prefetch 후 동기 함수에서 조회 */
let _typeCache: Map<string, TypeCacheEntry> = new Map()

/** 캐시 초기화 완료 여부 */
let _cacheReady = false

/**
 * 앱 시작 시 호출하여 문서 유형 데이터를 API에서 가져와 캐시에 저장합니다.
 * App.tsx 초기화 시점에서 호출하세요.
 *
 * 실패 시 콘솔 경고만 출력하고, 동기 함수는 기본값('-', 'etc')을 반환합니다.
 */
export async function prefetchDocumentTypes(): Promise<void> {
  try {
    const response = await api.get<{ success: boolean; data: DocumentType[] }>(
      '/api/document-types?includeLegacy=true'
    )
    const types = response.data
    const newCache = new Map<string, TypeCacheEntry>()
    for (const t of types) {
      newCache.set(t.value, {
        label: t.label,
        category: t.category || 'etc',
        isSystem: t.isSystem,
        isLegacy: t.isLegacy,
        order: t.order,
      })
    }
    _typeCache = newCache
    _cacheReady = true
  } catch (error) {
    console.warn('[documentCategories] prefetch 실패 — 동기 함수는 기본값을 반환합니다:', error)
  }
}

/**
 * 캐시가 준비되었는지 확인
 */
export function isDocumentTypeCacheReady(): boolean {
  return _cacheReady
}

// ============================================================================
// 동기 함수들 — 기존 시그니처 100% 유지
// ============================================================================

/**
 * document_type 값으로 한글 소분류 레이블을 반환
 * 캐시에 없으면 '기타' 반환
 */
export function getDocumentTypeLabel(documentType: string | undefined | null): string {
  if (!documentType) return '-'
  return _typeCache.get(documentType)?.label ?? '기타'
}

/**
 * document_type 값으로 카테고리 value를 반환
 * 매핑이 없으면 'etc' 반환
 */
export function getCategoryForType(documentType: string | undefined | null): string {
  if (!documentType) return 'etc'
  return _typeCache.get(documentType)?.category ?? 'etc'
}

/**
 * 카테고리 value로 카테고리 정보를 반환
 */
export function getCategoryInfo(categoryValue: string): DocumentCategory | undefined {
  return DOCUMENT_CATEGORIES.find(c => c.value === categoryValue)
}

/**
 * 소분류 표시 순서 (DB order 필드 기준)
 */
export function getTypeDisplayOrder(typeValue: string): number {
  const entry = _typeCache.get(typeValue)
  return entry ? entry.order : 999
}

/** 대분류별 소분류 그룹 목록 (시스템 유형 annual_report, customer_review 제외) */
export interface DocumentTypeGroup {
  category: DocumentCategory
  types: Array<{ value: string; label: string }>
}

const SYSTEM_TYPES = new Set(['annual_report', 'customer_review'])

export function getGroupedDocumentTypes(): DocumentTypeGroup[] {
  return DOCUMENT_CATEGORIES.map(cat => ({
    category: cat,
    types: Array.from(_typeCache.entries())
      .filter(([value, entry]) =>
        entry.category === cat.value &&
        !entry.isLegacy &&
        !SYSTEM_TYPES.has(value)
      )
      .sort((a, b) => a[1].order - b[1].order)
      .map(([value, entry]) => ({ value, label: entry.label }))
  })).filter(group => group.types.length > 0)
}

/**
 * 캐시에서 전체 문서 유형 라벨 맵을 반환 (레거시 제외)
 * DocumentsTab, DocumentLinkModal 등에서 DOCUMENT_TYPE_LABELS 대체용
 */
export function getDocumentTypeLabelsMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const [value, entry] of _typeCache.entries()) {
    if (!entry.isLegacy) {
      map[value] = entry.label
    }
  }
  return map
}
