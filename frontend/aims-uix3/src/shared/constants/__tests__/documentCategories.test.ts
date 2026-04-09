import { describe, it, expect, beforeAll, vi } from 'vitest'

/**
 * API 모킹: vi.mock 팩토리는 hoisting되므로 인라인으로 데이터 정의
 */
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({
      success: true,
      data: [
        // 1. 보험계약 (insurance) — 정규 7개
        { _id: '1', value: 'policy', label: '보험증권', category: 'insurance', order: 1, isSystem: false, isLegacy: false },
        { _id: '2', value: 'coverage_analysis', label: '보장분석', category: 'insurance', order: 2, isSystem: false, isLegacy: false },
        { _id: '3', value: 'application', label: '청약서', category: 'insurance', order: 3, isSystem: false, isLegacy: false },
        { _id: '4', value: 'plan_design', label: '가입설계서', category: 'insurance', order: 4, isSystem: false, isLegacy: false },
        { _id: '5', value: 'annual_report', label: '연간보고서(AR)', category: 'insurance', order: 5, isSystem: true, isLegacy: false },
        { _id: '6', value: 'customer_review', label: '변액리포트(CRS)', category: 'insurance', order: 6, isSystem: true, isLegacy: false },
        { _id: '7', value: 'insurance_etc', label: '기타 보험관련', category: 'insurance', order: 7, isSystem: false, isLegacy: false },

        // 2. 보험금 청구 (claim) — 정규 4개
        { _id: '8', value: 'diagnosis', label: '진단서/소견서', category: 'claim', order: 8, isSystem: false, isLegacy: false },
        { _id: '9', value: 'medical_receipt', label: '진료비영수증', category: 'claim', order: 9, isSystem: false, isLegacy: false },
        { _id: '10', value: 'claim_form', label: '보험금청구서', category: 'claim', order: 10, isSystem: false, isLegacy: false },
        { _id: '11', value: 'consent_delegation', label: '위임장/동의서', category: 'claim', order: 11, isSystem: false, isLegacy: false },

        // 3. 신분/증명 (identity) — 정규 3개
        { _id: '12', value: 'id_card', label: '신분증', category: 'identity', order: 12, isSystem: false, isLegacy: false },
        { _id: '13', value: 'family_cert', label: '가족관계서류', category: 'identity', order: 13, isSystem: false, isLegacy: false },
        { _id: '14', value: 'personal_docs', label: '기타 통장 및 개인서류', category: 'identity', order: 14, isSystem: false, isLegacy: false },

        // 4. 건강/의료 (medical) — 정규 1개
        { _id: '15', value: 'health_checkup', label: '건강검진결과', category: 'medical', order: 15, isSystem: false, isLegacy: false },

        // 5. 자산 (asset) — 정규 2개
        { _id: '16', value: 'asset_document', label: '자산관련서류', category: 'asset', order: 16, isSystem: false, isLegacy: false },
        { _id: '17', value: 'inheritance_gift', label: '상속/증여', category: 'asset', order: 17, isSystem: false, isLegacy: false },

        // 6. 법인 (corporate) — 정규 5개
        { _id: '18', value: 'corp_basic', label: '기본서류', category: 'corporate', order: 18, isSystem: false, isLegacy: false },
        { _id: '19', value: 'hr_document', label: '인사/노무', category: 'corporate', order: 19, isSystem: false, isLegacy: false },
        { _id: '20', value: 'corp_tax', label: '세무', category: 'corporate', order: 20, isSystem: false, isLegacy: false },
        { _id: '21', value: 'corp_asset', label: '법인자산', category: 'corporate', order: 21, isSystem: false, isLegacy: false },
        { _id: '22', value: 'legal_document', label: '기타 법률서류', category: 'corporate', order: 22, isSystem: false, isLegacy: false },

        // 7. 기타 (etc) — 정규 3개
        { _id: '23', value: 'general', label: '일반문서', category: 'etc', order: 23, isSystem: false, isLegacy: false },
        { _id: '24', value: 'unclassifiable', label: '분류불가', category: 'etc', order: 24, isSystem: false, isLegacy: false },
        { _id: '25', value: 'unspecified', label: '-', category: 'etc', order: 25, isSystem: true, isLegacy: false },

        // === 레거시 매핑 ===
        { _id: '100', value: 'proposal', label: '제안서', category: 'insurance', order: 100, isSystem: false, isLegacy: true },
        { _id: '101', value: 'terms', label: '약관', category: 'insurance', order: 101, isSystem: false, isLegacy: true },
        { _id: '102', value: 'change_request', label: '변경요청', category: 'insurance', order: 102, isSystem: false, isLegacy: true },
        { _id: '103', value: 'surrender', label: '해지', category: 'insurance', order: 103, isSystem: false, isLegacy: true },
        { _id: '104', value: 'hospital_cert', label: '진료확인서', category: 'claim', order: 104, isSystem: false, isLegacy: true },
        { _id: '105', value: 'medical_record', label: '진료기록', category: 'claim', order: 105, isSystem: false, isLegacy: true },
        { _id: '106', value: 'accident_cert', label: '사고증명서', category: 'claim', order: 106, isSystem: false, isLegacy: true },
        { _id: '107', value: 'consent_form', label: '동의서', category: 'claim', order: 107, isSystem: false, isLegacy: true },
        { _id: '108', value: 'power_of_attorney', label: '위임장', category: 'claim', order: 108, isSystem: false, isLegacy: true },
        { _id: '109', value: 'bank_account', label: '통장사본', category: 'identity', order: 109, isSystem: false, isLegacy: true },
        { _id: '110', value: 'seal_signature', label: '인감', category: 'identity', order: 110, isSystem: false, isLegacy: true },
        { _id: '111', value: 'business_card', label: '명함', category: 'identity', order: 111, isSystem: false, isLegacy: true },
        { _id: '112', value: 'income_proof', label: '소득증명', category: 'asset', order: 112, isSystem: false, isLegacy: true },
        { _id: '113', value: 'employment_cert', label: '재직증명', category: 'asset', order: 113, isSystem: false, isLegacy: true },
        { _id: '114', value: 'financial_statement', label: '재무제표', category: 'asset', order: 114, isSystem: false, isLegacy: true },
        { _id: '115', value: 'tax_document', label: '세무서류', category: 'corporate', order: 115, isSystem: false, isLegacy: true },
        { _id: '116', value: 'transaction_proof', label: '거래증명', category: 'asset', order: 116, isSystem: false, isLegacy: true },
        { _id: '117', value: 'property_registry', label: '부동산등기', category: 'asset', order: 117, isSystem: false, isLegacy: true },
        { _id: '118', value: 'vehicle_registry', label: '차량등록', category: 'asset', order: 118, isSystem: false, isLegacy: true },
        { _id: '119', value: 'business_registry', label: '사업자등록', category: 'asset', order: 119, isSystem: false, isLegacy: true },
        { _id: '120', value: 'corp_registry', label: '법인등기', category: 'corporate', order: 120, isSystem: false, isLegacy: true },
        { _id: '121', value: 'shareholder', label: '주주명부', category: 'corporate', order: 121, isSystem: false, isLegacy: true },
        { _id: '122', value: 'meeting_minutes', label: '의사록', category: 'corporate', order: 122, isSystem: false, isLegacy: true },
        { _id: '123', value: 'pension', label: '연금', category: 'corporate', order: 123, isSystem: false, isLegacy: true },
        { _id: '124', value: 'business_plan', label: '사업계획서', category: 'corporate', order: 124, isSystem: false, isLegacy: true },
        { _id: '125', value: 'contract', label: '계약서', category: 'corporate', order: 125, isSystem: false, isLegacy: true },
        { _id: '126', value: 'memo', label: '메모', category: 'etc', order: 126, isSystem: false, isLegacy: true },
        { _id: '127', value: 'claim', label: '보험금청구', category: 'claim', order: 127, isSystem: false, isLegacy: true },
      ],
    }),
  },
}))

import {
  DOCUMENT_CATEGORIES,
  getCategoryForType,
  getCategoryInfo,
  getDocumentTypeLabel,
  getGroupedDocumentTypes,
  getTypeDisplayOrder,
  getDocumentTypeLabelsMap,
  prefetchDocumentTypes,
  isDocumentTypeCacheReady,
} from '../documentCategories'

describe('documentCategories (v4 — DB SSoT)', () => {
  // 모든 테스트 전에 캐시 초기화
  beforeAll(async () => {
    await prefetchDocumentTypes()
    expect(isDocumentTypeCacheReady()).toBe(true)
  })

  describe('DOCUMENT_CATEGORIES', () => {
    it('7개 대분류 카테고리가 정의되어 있다', () => {
      expect(DOCUMENT_CATEGORIES).toHaveLength(7)
    })

    it('모든 카테고리에 value, label, icon, color가 있다', () => {
      for (const cat of DOCUMENT_CATEGORIES) {
        expect(cat.value).toBeTruthy()
        expect(cat.label).toBeTruthy()
        expect(cat.icon).toBeTruthy()
        expect(cat.color).toBeTruthy()
      }
    })

    it('카테고리 value가 중복되지 않는다', () => {
      const values = DOCUMENT_CATEGORIES.map(c => c.value)
      expect(new Set(values).size).toBe(values.length)
    })

    it('v4 7대분류가 올바른 순서로 정의되어 있다', () => {
      const values = DOCUMENT_CATEGORIES.map(c => c.value)
      expect(values).toEqual([
        'insurance', 'claim', 'identity', 'medical', 'asset', 'corporate', 'etc',
      ])
    })

    it('삭제된 대분류(financial, legal, general)가 없다', () => {
      const values = DOCUMENT_CATEGORIES.map(c => c.value)
      expect(values).not.toContain('financial')
      expect(values).not.toContain('legal')
      expect(values).not.toContain('general')
    })
  })

  describe('getDocumentTypeLabel', () => {
    it('v4 정규 타입의 레이블을 반환한다', () => {
      expect(getDocumentTypeLabel('insurance_etc')).toBe('기타 보험관련')
      expect(getDocumentTypeLabel('consent_delegation')).toBe('위임장/동의서')
      expect(getDocumentTypeLabel('personal_docs')).toBe('기타 통장 및 개인서류')
    })

    it('null/undefined는 분류불가를 반환한다', () => {
      expect(getDocumentTypeLabel(null)).toBe('분류불가')
      expect(getDocumentTypeLabel(undefined)).toBe('분류불가')
      expect(getDocumentTypeLabel('')).toBe('분류불가')
    })

    it('"-" 문자열이 레이블로 반환되지 않는다 (regression #49)', () => {
      // null/undefined/빈문자열 — 모두 '분류불가'여야 함
      expect(getDocumentTypeLabel(null)).not.toBe('-')
      expect(getDocumentTypeLabel(undefined)).not.toBe('-')
      expect(getDocumentTypeLabel('')).not.toBe('-')
    })

    it('매핑에 없는 타입은 기타를 반환한다', () => {
      expect(getDocumentTypeLabel('unknown')).toBe('기타')
    })
  })

  describe('getDocumentTypeLabelsMap', () => {
    it('레거시 제외한 라벨 맵을 반환한다', () => {
      const map = getDocumentTypeLabelsMap()
      expect(Object.keys(map)).toHaveLength(25)
      expect(map.insurance_etc).toBe('기타 보험관련')
      expect(map.consent_delegation).toBe('위임장/동의서')
      expect(map.personal_docs).toBe('기타 통장 및 개인서류')
      expect(map.asset_document).toBe('자산관련서류')
      expect(map.corp_basic).toBe('기본서류')
      expect(map.corp_tax).toBe('세무')
      expect(map.corp_asset).toBe('법인자산')
    })

    it('레거시 타입이 포함되지 않는다', () => {
      const map = getDocumentTypeLabelsMap()
      expect(map.proposal).toBeUndefined()
      expect(map.memo).toBeUndefined()
    })
  })

  describe('getCategoryForType — v4 정규 매핑', () => {
    it('보험계약 7개 타입이 insurance로 매핑된다', () => {
      const types = ['policy', 'coverage_analysis', 'application', 'plan_design',
        'annual_report', 'customer_review', 'insurance_etc']
      for (const t of types) expect(getCategoryForType(t)).toBe('insurance')
    })

    it('보험금청구 4개 타입이 claim으로 매핑된다', () => {
      const types = ['diagnosis', 'medical_receipt', 'claim_form', 'consent_delegation']
      for (const t of types) expect(getCategoryForType(t)).toBe('claim')
    })

    it('신분/증명 3개 타입이 identity로 매핑된다', () => {
      const types = ['id_card', 'family_cert', 'personal_docs']
      for (const t of types) expect(getCategoryForType(t)).toBe('identity')
    })

    it('건강/의료 1개 타입이 medical로 매핑된다', () => {
      expect(getCategoryForType('health_checkup')).toBe('medical')
    })

    it('자산 2개 타입이 asset으로 매핑된다', () => {
      const types = ['asset_document', 'inheritance_gift']
      for (const t of types) expect(getCategoryForType(t)).toBe('asset')
    })

    it('법인 5개 타입이 corporate로 매핑된다', () => {
      const types = ['corp_basic', 'hr_document', 'corp_tax', 'corp_asset', 'legal_document']
      for (const t of types) expect(getCategoryForType(t)).toBe('corporate')
    })

    it('기타 3개 타입이 etc로 매핑된다', () => {
      const types = ['general', 'unclassifiable', 'unspecified']
      for (const t of types) expect(getCategoryForType(t)).toBe('etc')
    })
  })

  describe('getCategoryForType — 레거시 매핑', () => {
    it('v3 보험계약 레거시 타입이 insurance로 매핑된다', () => {
      const types = ['proposal', 'terms', 'change_request', 'surrender']
      for (const t of types) expect(getCategoryForType(t)).toBe('insurance')
    })

    it('v3 청구 레거시 타입이 claim으로 매핑된다', () => {
      const types = ['hospital_cert', 'medical_record', 'accident_cert',
        'consent_form', 'power_of_attorney', 'claim']
      for (const t of types) expect(getCategoryForType(t)).toBe('claim')
    })

    it('v3 신분/증빙 레거시 타입이 identity로 매핑된다', () => {
      const types = ['bank_account', 'seal_signature', 'business_card']
      for (const t of types) expect(getCategoryForType(t)).toBe('identity')
    })

    it('v3 재정/세무 레거시 타입이 v4 카테고리로 매핑된다', () => {
      expect(getCategoryForType('income_proof')).toBe('asset')
      expect(getCategoryForType('employment_cert')).toBe('asset')
      expect(getCategoryForType('financial_statement')).toBe('asset')
      expect(getCategoryForType('transaction_proof')).toBe('asset')
      expect(getCategoryForType('tax_document')).toBe('corporate')
    })

    it('v3 자산 레거시 타입이 asset으로 매핑된다', () => {
      const types = ['property_registry', 'vehicle_registry', 'business_registry']
      for (const t of types) expect(getCategoryForType(t)).toBe('asset')
    })

    it('v3 법인 레거시 타입이 corporate로 매핑된다', () => {
      const types = ['corp_registry', 'shareholder', 'meeting_minutes', 'pension',
        'business_plan', 'contract']
      for (const t of types) expect(getCategoryForType(t)).toBe('corporate')
    })

    it('v3 기타 레거시 타입이 etc로 매핑된다', () => {
      expect(getCategoryForType('memo')).toBe('etc')
    })
  })

  describe('getCategoryForType — 엣지 케이스', () => {
    it('알 수 없는 타입은 etc로 매핑된다', () => {
      expect(getCategoryForType('unknown_type')).toBe('etc')
      expect(getCategoryForType('xyz')).toBe('etc')
    })

    it('null/undefined/빈문자열은 etc로 매핑된다', () => {
      expect(getCategoryForType(null)).toBe('etc')
      expect(getCategoryForType(undefined)).toBe('etc')
      expect(getCategoryForType('')).toBe('etc')
    })
  })

  describe('getCategoryInfo', () => {
    it('유효한 카테고리 value로 정보를 반환한다', () => {
      const info = getCategoryInfo('insurance')
      expect(info).toBeDefined()
      expect(info!.label).toBe('보험계약')
    })

    it('v4 etc 카테고리 정보를 반환한다', () => {
      const info = getCategoryInfo('etc')
      expect(info).toBeDefined()
      expect(info!.label).toBe('기타')
    })

    it('삭제된 v3 카테고리는 undefined를 반환한다', () => {
      expect(getCategoryInfo('financial')).toBeUndefined()
      expect(getCategoryInfo('legal')).toBeUndefined()
      expect(getCategoryInfo('general')).toBeUndefined()
    })

    it('존재하지 않는 value는 undefined를 반환한다', () => {
      expect(getCategoryInfo('nonexistent')).toBeUndefined()
    })
  })

  describe('getTypeDisplayOrder', () => {
    it('order 필드 값을 반환한다', () => {
      expect(getTypeDisplayOrder('policy')).toBe(1)
      expect(getTypeDisplayOrder('general')).toBe(23)
    })

    it('알 수 없는 타입은 999를 반환한다', () => {
      expect(getTypeDisplayOrder('unknown')).toBe(999)
    })
  })

  describe('getGroupedDocumentTypes', () => {
    it('시스템 타입(annual_report, customer_review)이 제외된다', () => {
      const groups = getGroupedDocumentTypes()
      const allTypes = groups.flatMap(g => g.types.map(t => t.value))
      expect(allTypes).not.toContain('annual_report')
      expect(allTypes).not.toContain('customer_review')
    })

    it('모든 그룹에 하나 이상의 타입이 있다', () => {
      const groups = getGroupedDocumentTypes()
      for (const group of groups) {
        expect(group.types.length).toBeGreaterThan(0)
      }
    })

    it('레거시 타입이 UI 선택 목록에 노출되지 않는다', () => {
      const groups = getGroupedDocumentTypes()
      const allTypes = groups.flatMap(g => g.types.map(t => t.value))
      const legacyTypes = ['proposal', 'hospital_cert', 'medical_record', 'accident_cert',
        'consent_form', 'power_of_attorney', 'bank_account', 'seal_signature',
        'business_card', 'income_proof', 'employment_cert', 'financial_statement',
        'tax_document', 'transaction_proof', 'property_registry', 'vehicle_registry',
        'business_registry', 'corp_registry', 'shareholder', 'meeting_minutes',
        'pension', 'business_plan', 'contract', 'memo', 'claim',
        'terms', 'change_request', 'surrender']
      for (const legacy of legacyTypes) {
        expect(allTypes).not.toContain(legacy)
      }
    })

    it('총 노출 타입 수가 v4 정규 타입(시스템 제외) 23개이다', () => {
      const groups = getGroupedDocumentTypes()
      const allTypes = groups.flatMap(g => g.types.map(t => t.value))
      expect(allTypes).toHaveLength(23)
    })
  })

  describe('LEGACY_TYPE_MAP fallback — 캐시에 없는 레거시 값 방어', () => {
    it('LEGACY_TYPE_MAP에 정의된 claim은 캐시에 있으므로 claim 카테고리를 반환한다', () => {
      // mock에 claim이 category: 'claim'으로 포함되어 있으므로 캐시 히트
      expect(getCategoryForType('claim')).toBe('claim')
      expect(getDocumentTypeLabel('claim')).toBe('보험금청구')
    })

    it('캐시에 없는 미지 타입은 etc로 fallback된다', () => {
      expect(getCategoryForType('totally_unknown')).toBe('etc')
      expect(getDocumentTypeLabel('totally_unknown')).toBe('기타')
    })
  })
})

/**
 * LEGACY_TYPE_MAP fallback 실제 발동 테스트
 * DB에 'claim' 레거시 항목의 category가 없는 경우를 재현한다.
 * prefetchDocumentTypes() 2차 보정 로직이 올바르게 동작하는지 검증.
 */
describe('documentCategories — LEGACY_TYPE_MAP 캐시 보정 (category 누락 시나리오)', () => {
  beforeAll(async () => {
    // mock api.get의 반환값을 일시 변경하여 category 누락 시나리오 재현
    const { api } = await import('@/shared/lib/api')
    const mockGet = api.get as ReturnType<typeof vi.fn>
    mockGet.mockResolvedValueOnce({
      success: true,
      data: [
        // claim_form (현행)은 정상
        { _id: '10', value: 'claim_form', label: '보험금청구서', category: 'claim', order: 10, isSystem: false, isLegacy: false },
        // claim (레거시) — category 없음! 이것이 실제 DB 버그 원인
        { _id: '127', value: 'claim', label: '보험금청구', order: 127, isSystem: false, isLegacy: true },
      ],
    })
    await prefetchDocumentTypes()
  })

  it('category 누락된 레거시 claim이 prefetch 보정을 통해 claim 카테고리로 매핑된다', () => {
    // category가 없으면 1차 적재 시 'etc'로 저장되지만,
    // 2차 보정 단계에서 LEGACY_TYPE_MAP을 통해 claim_form의 category('claim')로 보정됨
    expect(getCategoryForType('claim')).toBe('claim')
  })

  it('category 누락된 레거시 claim의 레이블이 정상 반환된다', () => {
    expect(getDocumentTypeLabel('claim')).toBe('보험금청구')
  })

  it('현행 claim_form은 영향받지 않는다', () => {
    expect(getCategoryForType('claim_form')).toBe('claim')
    expect(getDocumentTypeLabel('claim_form')).toBe('보험금청구서')
  })
})
