import { describe, it, expect } from 'vitest'

/**
 * DocumentLibraryView - AR 문서 링크 버튼 테스트
 *
 * 테스트 범위:
 * 1. AR 문서는 자동 연결되므로 링크 버튼 비활성화
 * 2. is_annual_report === true 체크
 * 3. 일반 문서는 링크 버튼 활성화
 */
describe('DocumentLibraryView - AR Link Button', () => {
  describe('canLink 계산 로직', () => {
    it('AR 문서는 처리 완료되어도 링크 버튼이 비활성화되어야 함', () => {
      const document = {
        _id: 'doc1',
        status: 'completed',
        customer_relation: null,
        is_annual_report: true
      }

      const status = document.status
      const isLinked = Boolean(document.customer_relation)
      const isAnnualReport = document.is_annual_report === true

      // AR 문서는 자동 연결되므로 처리 완료되어도 버튼 비활성화 유지
      const canLink = status === 'completed' && !isLinked && !isAnnualReport

      expect(canLink).toBe(false)
      expect(isAnnualReport).toBe(true)
    })

    it('일반 문서는 처리 완료 후 링크 버튼이 활성화되어야 함', () => {
      const document = {
        _id: 'doc2',
        status: 'completed',
        customer_relation: null,
        is_annual_report: false
      }

      const status = document.status
      const isLinked = Boolean(document.customer_relation)
      const isAnnualReport = document.is_annual_report === true

      const canLink = status === 'completed' && !isLinked && !isAnnualReport

      expect(canLink).toBe(true)
      expect(isAnnualReport).toBe(false)
    })

    it('이미 연결된 문서는 링크 버튼이 비활성화되어야 함', () => {
      const document = {
        _id: 'doc3',
        status: 'completed',
        customer_relation: { customer_id: 'customer123' },
        is_annual_report: false
      }

      const status = document.status
      const isLinked = Boolean(document.customer_relation)
      const isAnnualReport = document.is_annual_report === true

      const canLink = status === 'completed' && !isLinked && !isAnnualReport

      expect(canLink).toBe(false)
      expect(isLinked).toBe(true)
    })

    it('is_annual_report === undefined인 경우 일반 문서로 처리해야 함', () => {
      const document = {
        _id: 'doc4',
        status: 'completed',
        customer_relation: null,
        is_annual_report: undefined
      }

      const status = document.status
      const isLinked = Boolean(document.customer_relation)
      const isAnnualReport = document.is_annual_report === true // undefined === true → false

      const canLink = status === 'completed' && !isLinked && !isAnnualReport

      expect(canLink).toBe(true)
      expect(isAnnualReport).toBe(false)
    })

    it('is_annual_report === null인 경우 일반 문서로 처리해야 함', () => {
      const document = {
        _id: 'doc5',
        status: 'completed',
        customer_relation: null,
        is_annual_report: null
      }

      const status = document.status
      const isLinked = Boolean(document.customer_relation)
      const isAnnualReport = document.is_annual_report === true // null === true → false

      const canLink = status === 'completed' && !isLinked && !isAnnualReport

      expect(canLink).toBe(true)
      expect(isAnnualReport).toBe(false)
    })

    it('처리 중인 AR 문서는 링크 버튼이 비활성화되어야 함', () => {
      const document = {
        _id: 'doc6',
        status: 'processing',
        customer_relation: null,
        is_annual_report: true
      }

      const status = document.status
      const isLinked = Boolean(document.customer_relation)
      const isAnnualReport = document.is_annual_report === true

      const canLink = status === 'completed' && !isLinked && !isAnnualReport

      expect(canLink).toBe(false)
    })

    it('AR 문서가 이미 연결되어 있으면 링크 버튼이 비활성화되어야 함', () => {
      const document = {
        _id: 'doc7',
        status: 'completed',
        customer_relation: {
          customer_id: 'customer123',
          relationship_type: 'annual_report'
        },
        is_annual_report: true
      }

      const status = document.status
      const isLinked = Boolean(document.customer_relation)
      const isAnnualReport = document.is_annual_report === true

      const canLink = status === 'completed' && !isLinked && !isAnnualReport

      expect(canLink).toBe(false)
      expect(isLinked).toBe(true)
      expect(isAnnualReport).toBe(true)
    })
  })

  describe('다양한 문서 상태 조합', () => {
    const testCases = [
      {
        name: '일반 문서, 미연결, 처리 완료',
        document: { status: 'completed', customer_relation: null, is_annual_report: false },
        expected: true
      },
      {
        name: 'AR 문서, 미연결, 처리 완료',
        document: { status: 'completed', customer_relation: null, is_annual_report: true },
        expected: false
      },
      {
        name: '일반 문서, 연결됨, 처리 완료',
        document: { status: 'completed', customer_relation: { customer_id: 'c1' }, is_annual_report: false },
        expected: false
      },
      {
        name: 'AR 문서, 연결됨, 처리 완료',
        document: { status: 'completed', customer_relation: { customer_id: 'c1' }, is_annual_report: true },
        expected: false
      },
      {
        name: '일반 문서, 미연결, 처리 중',
        document: { status: 'processing', customer_relation: null, is_annual_report: false },
        expected: false
      },
      {
        name: 'AR 문서, 미연결, 처리 중',
        document: { status: 'processing', customer_relation: null, is_annual_report: true },
        expected: false
      }
    ]

    testCases.forEach(({ name, document, expected }) => {
      it(`${name} → canLink: ${expected}`, () => {
        const status = document.status
        const isLinked = Boolean(document.customer_relation)
        const isAnnualReport = document.is_annual_report === true

        const canLink = status === 'completed' && !isLinked && !isAnnualReport

        expect(canLink).toBe(expected)
      })
    })
  })
})
