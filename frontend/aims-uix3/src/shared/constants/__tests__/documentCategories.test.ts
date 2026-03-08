import { describe, it, expect } from 'vitest'
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_TYPE_LABELS,
  getCategoryForType,
  getCategoryInfo,
  getDocumentTypeLabel,
  getGroupedDocumentTypes,
} from '../documentCategories'

describe('documentCategories (v4)', () => {
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
      // general은 대분류에서 etc로 변경됨
      expect(values).not.toContain('general')
    })
  })

  describe('DOCUMENT_TYPE_LABELS', () => {
    it('v4 25개 소분류 레이블이 정의되어 있다', () => {
      expect(Object.keys(DOCUMENT_TYPE_LABELS)).toHaveLength(25)
    })

    it('신규 소분류 레이블이 존재한다', () => {
      expect(DOCUMENT_TYPE_LABELS.insurance_etc).toBe('기타 보험관련')
      expect(DOCUMENT_TYPE_LABELS.consent_delegation).toBe('위임장/동의서')
      expect(DOCUMENT_TYPE_LABELS.personal_docs).toBe('기타 통장 및 개인서류')
      expect(DOCUMENT_TYPE_LABELS.asset_document).toBe('자산관련서류')
      expect(DOCUMENT_TYPE_LABELS.corp_basic).toBe('기본서류')
      expect(DOCUMENT_TYPE_LABELS.corp_tax).toBe('세무')
      expect(DOCUMENT_TYPE_LABELS.corp_asset).toBe('법인자산')
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
      // 자산으로 이동
      expect(getCategoryForType('income_proof')).toBe('asset')
      expect(getCategoryForType('employment_cert')).toBe('asset')
      expect(getCategoryForType('financial_statement')).toBe('asset')
      expect(getCategoryForType('transaction_proof')).toBe('asset')
      // 법인으로 이동
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

  describe('getDocumentTypeLabel', () => {
    it('v4 정규 타입의 레이블을 반환한다', () => {
      expect(getDocumentTypeLabel('insurance_etc')).toBe('기타 보험관련')
      expect(getDocumentTypeLabel('consent_delegation')).toBe('위임장/동의서')
      expect(getDocumentTypeLabel('personal_docs')).toBe('기타 통장 및 개인서류')
    })

    it('null/undefined는 미지정을 반환한다', () => {
      expect(getDocumentTypeLabel(null)).toBe('미지정')
      expect(getDocumentTypeLabel(undefined)).toBe('미지정')
    })

    it('매핑에 없는 타입은 기타를 반환한다', () => {
      expect(getDocumentTypeLabel('unknown')).toBe('기타')
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
})
