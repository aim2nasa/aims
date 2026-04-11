/**
 * DocumentCategoryFilter — buildCategoryTree Regression 테스트
 *
 * @regression feat/customer-doc-tab-tree-filter
 * @description 드롭다운 → 드릴다운 트리 필터 전환 시 추가된 "전체" 가상 폴더
 *              (ALL_CATEGORY_SENTINEL) 및 빈 폴더 숨김 로직 회귀 방지.
 *
 * 테스트 범위:
 * - buildCategoryTree 순수 함수 단위 테스트 (옵션 B)
 *   → sentinel 삽입, 빈 documents 가드, subTypesByCategory 키 구성,
 *     빈 폴더 숨김, 소분류 정렬 5가지 케이스.
 *
 * 옵션 B 선택 이유:
 * - filteredDocuments 분기는 DocumentsTab 내부의 7줄짜리 단순 if/else
 *   (selectedCategory === ALL_CATEGORY_SENTINEL ? documents : 필터링)
 *   이므로 코드 리뷰로 충분히 검증 가능하며, React Testing Library로 통합
 *   테스트할 경우 DocumentsTab이 의존하는 수많은 props/스토어/쿼리 모킹이
 *   필요해 테스트 비용 대비 가치가 낮음.
 * - buildCategoryTree는 이번 커밋의 핵심 신규 로직(sentinel 삽입 + 빈 폴더
 *   숨김 + 정렬)이 모두 모여 있는 단일 함수라 단위 테스트가 가장 효과적.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CustomerDocumentItem } from '@/services/DocumentService'

// ============================================================================
// documentCategories 모듈 모킹
// ----------------------------------------------------------------------------
// buildCategoryTree는 getCategoryForType / getDocumentTypeLabel /
// getTypeDisplayOrder 를 사용한다. 이 함수들은 내부 _typeCache에 의존하고,
// 캐시는 prefetchDocumentTypes()가 호출돼야 채워진다. 테스트 환경에서는
// API를 띄울 수 없으므로 명시적으로 mock 하여 결정론적 매핑을 제공한다.
// DOCUMENT_CATEGORIES 상수는 실제 정의(7개 대분류)를 그대로 사용한다.
// ============================================================================

vi.mock('@/shared/constants/documentCategories', async (importOriginal) => {
  const original = await importOriginal<
    typeof import('@/shared/constants/documentCategories')
  >()

  // 테스트용 doc_type → category 매핑
  const typeToCategory: Record<string, string> = {
    policy: 'insurance',
    application: 'insurance',
    premium_receipt: 'insurance',
    claim_form: 'claim',
    medical_receipt: 'claim',
    id_card: 'identity',
    health_report: 'medical',
    property_doc: 'asset',
    corporate_reg: 'corporate',
    etc_misc: 'etc',
  }

  // 테스트용 doc_type → 한글 레이블 매핑
  const typeLabels: Record<string, string> = {
    policy: '보험증권',
    application: '청약서',
    premium_receipt: '보험료영수증',
    claim_form: '청구서',
    medical_receipt: '의료비영수증',
    id_card: '신분증',
    health_report: '건강검진결과지',
    property_doc: '부동산서류',
    corporate_reg: '법인등기부등본',
    etc_misc: '기타',
  }

  // 테스트용 정렬 순서 — policy(1) < application(2) < premium_receipt(3)
  const typeOrder: Record<string, number> = {
    policy: 1,
    application: 2,
    premium_receipt: 3,
    claim_form: 10,
    medical_receipt: 11,
    id_card: 20,
    health_report: 30,
    property_doc: 40,
    corporate_reg: 50,
    etc_misc: 99,
  }

  return {
    ...original,
    getCategoryForType: (docType: string | undefined | null) =>
      (docType && typeToCategory[docType]) || 'etc',
    getDocumentTypeLabel: (docType: string | undefined | null) =>
      (docType && typeLabels[docType]) || '기타',
    getTypeDisplayOrder: (docType: string) => typeOrder[docType] ?? 999,
  }
})

// mock 적용 이후에 대상 모듈 import (ESM hoisting과 무관하게 명시적으로 분리)
import {
  buildCategoryTree,
  ALL_CATEGORY_SENTINEL,
} from '../DocumentCategoryFilter'

// ============================================================================
// 헬퍼: 최소 필드로 CustomerDocumentItem mock 생성
// ============================================================================

let nextId = 1
function makeDoc(
  documentType: string,
  overrides: Partial<CustomerDocumentItem> = {}
): CustomerDocumentItem {
  return {
    _id: `doc_${nextId++}`,
    originalName: `${documentType}_${nextId}.pdf`,
    document_type: documentType,
    ...overrides,
  }
}

/** document_type 없는 문서 (엣지 케이스용) */
function makeDocNoType(
  overrides: Partial<CustomerDocumentItem> = {}
): CustomerDocumentItem {
  return {
    _id: `doc_${nextId++}`,
    originalName: `untyped_${nextId}.pdf`,
    ...overrides,
  }
}

beforeEach(() => {
  nextId = 1
})

// ============================================================================
// 케이스 1: rootCategories 맨 앞에 sentinel "전체" 폴더가 삽입되는가
// ============================================================================

describe('buildCategoryTree — "전체" sentinel 삽입', () => {
  it('documents가 있을 때 rootCategories[0]이 sentinel이고 필드가 올바르다', () => {
    const documents = [
      makeDoc('policy'),
      makeDoc('claim_form'),
      makeDoc('id_card'),
      makeDoc('health_report'),
      makeDoc('etc_misc'),
    ]

    const { rootCategories } = buildCategoryTree(documents)

    expect(rootCategories[0].value).toBe(ALL_CATEGORY_SENTINEL)
    expect(rootCategories[0].count).toBe(documents.length)
    expect(rootCategories[0].label).toBe('전체')
    expect(rootCategories[0].emoji).toBe('📂')
  })
})

// ============================================================================
// 케이스 2: 빈 documents일 때 sentinel 미삽입
// ============================================================================

describe('buildCategoryTree — 빈 documents 가드', () => {
  it('documents가 비어있으면 rootCategories도 비어있다 (전체 폴더 미삽입)', () => {
    const { rootCategories, subTypesByCategory } = buildCategoryTree([])

    expect(rootCategories).toHaveLength(0)
    expect(subTypesByCategory.size).toBe(0)
  })
})

// ============================================================================
// 케이스 3: subTypesByCategory에 sentinel 키가 없음
// ============================================================================

describe('buildCategoryTree — subTypesByCategory 키 구성', () => {
  it('sentinel("__all__")은 subTypesByCategory의 키로 사용되지 않는다', () => {
    const documents = [
      makeDoc('policy'),
      makeDoc('claim_form'),
      makeDoc('id_card'),
    ]

    const { subTypesByCategory } = buildCategoryTree(documents)

    expect(subTypesByCategory.has(ALL_CATEGORY_SENTINEL)).toBe(false)
    // 실제 대분류 키만 존재
    expect(subTypesByCategory.has('insurance')).toBe(true)
    expect(subTypesByCategory.has('claim')).toBe(true)
    expect(subTypesByCategory.has('identity')).toBe(true)
  })
})

// ============================================================================
// 케이스 4: 빈 폴더 숨김 — 해당 문서가 없는 대분류는 rootCategories에 포함 X
// ============================================================================

describe('buildCategoryTree — 빈 폴더 숨김', () => {
  it('특정 카테고리 문서만 있을 때 다른 대분류는 rootCategories에서 제외된다', () => {
    // 보험계약(insurance) 카테고리 문서만 5개
    const documents = [
      makeDoc('policy'),
      makeDoc('policy'),
      makeDoc('application'),
      makeDoc('premium_receipt'),
      makeDoc('premium_receipt'),
    ]

    const { rootCategories, subTypesByCategory } = buildCategoryTree(documents)

    // 전체(sentinel) + insurance 두 개만 있어야 함
    expect(rootCategories).toHaveLength(2)
    expect(rootCategories[0].value).toBe(ALL_CATEGORY_SENTINEL)
    expect(rootCategories[1].value).toBe('insurance')
    expect(rootCategories[1].count).toBe(5)

    // subTypesByCategory에도 insurance만 존재
    expect(subTypesByCategory.size).toBe(1)
    expect(subTypesByCategory.has('insurance')).toBe(true)
    expect(subTypesByCategory.has('claim')).toBe(false)
    expect(subTypesByCategory.has('identity')).toBe(false)
    expect(subTypesByCategory.has('medical')).toBe(false)
    expect(subTypesByCategory.has('asset')).toBe(false)
    expect(subTypesByCategory.has('corporate')).toBe(false)
    expect(subTypesByCategory.has('etc')).toBe(false)
  })
})

// ============================================================================
// 케이스 5: 소분류 정렬 — getTypeDisplayOrder 오름차순 따름
// ============================================================================

describe('buildCategoryTree — 소분류 정렬', () => {
  it('subTypesByCategory 내 소분류는 getTypeDisplayOrder 오름차순이다', () => {
    // 일부러 역순/섞인 순서로 문서 추가
    // mock order: policy=1, application=2, premium_receipt=3
    const documents = [
      makeDoc('premium_receipt'),
      makeDoc('policy'),
      makeDoc('application'),
      makeDoc('premium_receipt'),
      makeDoc('policy'),
    ]

    const { subTypesByCategory } = buildCategoryTree(documents)
    const insuranceSubs = subTypesByCategory.get('insurance')

    expect(insuranceSubs).toBeDefined()
    expect(insuranceSubs!.map(s => s.value)).toEqual([
      'policy',           // order 1
      'application',      // order 2
      'premium_receipt',  // order 3
    ])
    // 카운트도 정확한지 확인
    expect(insuranceSubs!.find(s => s.value === 'policy')!.count).toBe(2)
    expect(insuranceSubs!.find(s => s.value === 'application')!.count).toBe(1)
    expect(insuranceSubs!.find(s => s.value === 'premium_receipt')!.count).toBe(2)
  })
})

// ============================================================================
// 케이스 6 (엣지): document_type 없는 문서는 타입 카운트에서 제외
// ----------------------------------------------------------------------------
// buildCategoryTree 80-84번 라인의 `if (!docType) continue` 가드 회귀 방지.
// ALL_CATEGORY_SENTINEL의 count는 documents.length(필터 전 전체)를 쓰도록
// 설계되어 있으므로 미지정 문서도 "전체" 카운트에는 포함되지만, 실제 대분류
// 폴더에는 포함되지 않는다. 이 동작이 의도된 것임을 잠금한다.
// ============================================================================

describe('buildCategoryTree — document_type 미지정 문서 처리', () => {
  it('document_type이 없고 isAnnualReport도 false인 문서는 대분류에서 제외된다', () => {
    const documents: CustomerDocumentItem[] = [
      makeDoc('policy'),
      makeDocNoType(),           // 미지정
      makeDocNoType(),           // 미지정
      makeDoc('policy'),
    ]

    const { rootCategories, subTypesByCategory } = buildCategoryTree(documents)

    // "전체"는 documents.length(=4) 기준
    expect(rootCategories[0].value).toBe(ALL_CATEGORY_SENTINEL)
    expect(rootCategories[0].count).toBe(4)

    // 실제 대분류는 insurance만, count는 2 (미지정 2건 제외)
    const insurance = rootCategories.find(c => c.value === 'insurance')
    expect(insurance).toBeDefined()
    expect(insurance!.count).toBe(2)

    // 미지정 문서가 'etc'로 흘러들어가면 안 된다
    expect(rootCategories.find(c => c.value === 'etc')).toBeUndefined()
    expect(subTypesByCategory.has('etc')).toBe(false)
  })
})

// ============================================================================
// 케이스 7 (엣지): isAnnualReport 폴백 — document_type 없어도 annual_report로 처리
// ----------------------------------------------------------------------------
// buildCategoryTree 81번 라인 `doc.document_type || (doc.isAnnualReport ? 'annual_report' : '')`
// 폴백 회귀 방지. annual_report는 SYSTEM_TYPES이지만 buildCategoryTree는
// 시스템 유형을 제외하지 않고 카운트한다 (소분류 폴더로 노출됨).
// mock에 annual_report 매핑이 없으므로 getCategoryForType이 'etc' 기본값을
// 반환하고, 해당 문서는 etc 카테고리로 분류되어야 한다.
// ============================================================================

describe('buildCategoryTree — isAnnualReport 폴백', () => {
  it('document_type이 없어도 isAnnualReport=true면 annual_report로 분류된다', () => {
    const documents: CustomerDocumentItem[] = [
      makeDoc('policy'),
      makeDocNoType({ isAnnualReport: true }),
      makeDocNoType({ isAnnualReport: true }),
    ]

    const { rootCategories, subTypesByCategory } = buildCategoryTree(documents)

    // 전체 카운트 = 3
    expect(rootCategories[0].count).toBe(3)

    // annual_report는 mock에서 카테고리 미지정 → 기본 'etc'로 흘러감
    const etc = rootCategories.find(c => c.value === 'etc')
    expect(etc).toBeDefined()
    expect(etc!.count).toBe(2)

    // etc 소분류에 annual_report 항목이 존재
    const etcSubs = subTypesByCategory.get('etc')
    expect(etcSubs).toBeDefined()
    expect(etcSubs!.some(s => s.value === 'annual_report')).toBe(true)
    expect(etcSubs!.find(s => s.value === 'annual_report')!.count).toBe(2)
  })
})
