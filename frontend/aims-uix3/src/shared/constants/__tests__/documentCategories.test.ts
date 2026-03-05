import { describe, it, expect } from 'vitest'
import {
  DOCUMENT_CATEGORIES,
  getCategoryForType,
  getCategoryInfo,
} from '../documentCategories'

describe('documentCategories', () => {
  describe('DOCUMENT_CATEGORIES', () => {
    it('9개 대분류 카테고리가 정의되어 있다', () => {
      expect(DOCUMENT_CATEGORIES).toHaveLength(9)
    })

    it('모든 카테고리에 value, label, icon이 있다', () => {
      for (const cat of DOCUMENT_CATEGORIES) {
        expect(cat.value).toBeTruthy()
        expect(cat.label).toBeTruthy()
        expect(cat.icon).toBeTruthy()
      }
    })

    it('카테고리 value가 중복되지 않는다', () => {
      const values = DOCUMENT_CATEGORIES.map(c => c.value)
      expect(new Set(values).size).toBe(values.length)
    })
  })

  describe('getCategoryForType', () => {
    it('보험계약 10개 타입이 insurance로 매핑된다', () => {
      const types = ['application', 'policy', 'terms', 'plan_design', 'proposal',
        'coverage_analysis', 'change_request', 'surrender', 'annual_report', 'customer_review']
      for (const t of types) expect(getCategoryForType(t)).toBe('insurance')
    })

    it('보험금청구 5개 타입이 claim으로 매핑된다', () => {
      const types = ['claim_form', 'diagnosis', 'medical_receipt', 'accident_cert', 'hospital_cert']
      for (const t of types) expect(getCategoryForType(t)).toBe('claim')
    })

    it('신분/증빙 7개 타입이 identity로 매핑된다', () => {
      const types = ['id_card', 'family_cert', 'seal_signature', 'bank_account',
        'power_of_attorney', 'consent_form', 'business_card']
      for (const t of types) expect(getCategoryForType(t)).toBe('identity')
    })

    it('재정/세무 5개 타입이 financial로 매핑된다', () => {
      const types = ['income_proof', 'employment_cert', 'financial_statement', 'tax_document', 'transaction_proof']
      for (const t of types) expect(getCategoryForType(t)).toBe('financial')
    })

    it('건강/의료 2개 타입이 medical로 매핑된다', () => {
      expect(getCategoryForType('health_checkup')).toBe('medical')
      expect(getCategoryForType('medical_record')).toBe('medical')
    })

    it('자산 3개 타입이 asset으로 매핑된다', () => {
      const types = ['property_registry', 'vehicle_registry', 'business_registry']
      for (const t of types) expect(getCategoryForType(t)).toBe('asset')
    })

    it('법인 7개 타입이 corporate로 매핑된다', () => {
      const types = ['corp_registry', 'shareholder', 'meeting_minutes', 'hr_document',
        'pension', 'business_plan', 'inheritance_gift']
      for (const t of types) expect(getCategoryForType(t)).toBe('corporate')
    })

    it('법률 2개 타입이 legal로 매핑된다', () => {
      expect(getCategoryForType('contract')).toBe('legal')
      expect(getCategoryForType('legal_document')).toBe('legal')
    })

    it('기타 4개 타입이 general로 매핑된다', () => {
      const types = ['memo', 'general', 'unclassifiable', 'unspecified']
      for (const t of types) expect(getCategoryForType(t)).toBe('general')
    })

    it('레거시 타입도 올바르게 매핑된다', () => {
      expect(getCategoryForType('claim')).toBe('claim')
    })

    it('알 수 없는 타입은 general로 매핑된다', () => {
      expect(getCategoryForType('unknown_type')).toBe('general')
      expect(getCategoryForType('xyz')).toBe('general')
    })

    it('null/undefined/빈문자열은 general로 매핑된다', () => {
      expect(getCategoryForType(null)).toBe('general')
      expect(getCategoryForType(undefined)).toBe('general')
      expect(getCategoryForType('')).toBe('general')
    })
  })

  describe('getCategoryInfo', () => {
    it('유효한 카테고리 value로 정보를 반환한다', () => {
      const info = getCategoryInfo('insurance')
      expect(info).toBeDefined()
      expect(info!.label).toBe('보험계약')
    })

    it('존재하지 않는 value는 undefined를 반환한다', () => {
      expect(getCategoryInfo('nonexistent')).toBeUndefined()
    })
  })
})
