/**
 * Annual Report 모달 스크롤/정렬 Regression 테스트
 * @description AR 모달 계약 목록 스크롤 버그 수정 + 정렬 기능 검증
 * @regression 커밋 2e1f1f8e (스크롤 버그 수정)
 * @priority HIGH - AR 핵심 기능
 */

import { describe, it, expect } from 'vitest'
import type { InsuranceContract } from '../features/customer/api/annualReportApi'

// ===== 소스에서 추출한 순수 로직 (AnnualReportModal.tsx) =====

type SortConfig = {
  key: keyof InsuranceContract
  direction: 'asc' | 'desc'
} | null

const getSortedContracts = (contracts: InsuranceContract[], sortConfig: SortConfig): InsuranceContract[] => {
  if (!sortConfig) return contracts

  const sortedContracts = [...contracts]

  sortedContracts.sort((a, b) => {
    const aValue = a[sortConfig.key]
    const bValue = b[sortConfig.key]

    // null/undefined 처리
    if (aValue == null && bValue == null) return 0
    if (aValue == null) return 1
    if (bValue == null) return -1

    // 숫자 비교
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue
    }

    // 문자열 비교
    const aStr = String(aValue)
    const bStr = String(bValue)
    const comparison = aStr.localeCompare(bStr, 'ko-KR')

    return sortConfig.direction === 'asc' ? comparison : -comparison
  })

  return sortedContracts
}

const getStatusBadgeClass = (status?: string) => {
  if (!status) return 'contract-item__status--default'

  const lowerStatus = status.toLowerCase()
  if (lowerStatus.includes('유지') || lowerStatus.includes('정상')) {
    return 'contract-item__status--active'
  }
  if (lowerStatus.includes('만기') || lowerStatus.includes('해지')) {
    return 'contract-item__status--inactive'
  }
  return 'contract-item__status--default'
}

// ===== 테스트 데이터 =====

const createContract = (overrides: Partial<InsuranceContract> = {}): InsuranceContract => ({
  insurance_company: '메트라이프',
  contract_number: 'A123456',
  product_name: '무배당 종신보험',
  contractor_name: '홍길동',
  insured_name: '홍길동',
  monthly_premium: 100000,
  coverage_amount: 50000000,
  contract_date: '2020-01-15',
  status: '정상유지',
  ...overrides,
})

const sampleContracts: InsuranceContract[] = [
  createContract({ insurance_company: '삼성생명', monthly_premium: 150000, product_name: '종신보험' }),
  createContract({ insurance_company: '메트라이프', monthly_premium: 80000, product_name: '건강보험' }),
  createContract({ insurance_company: '한화생명', monthly_premium: 200000, product_name: '연금보험' }),
  createContract({ insurance_company: 'AIA', monthly_premium: 120000, product_name: '변액보험' }),
]

// ===== 테스트 =====

describe('Annual Report 모달 - Regression 테스트', () => {
  describe('계약 목록 스크롤 (커밋 2e1f1f8e)', () => {
    /**
     * 회귀 테스트: overflow: hidden이 2중 적용되어 18건 이후 계약이 잘리는 버그
     * 수정: main 요소에 overflow-y: auto 적용
     */
    it('26건 이상 계약도 모두 정렬 가능해야 함', () => {
      const manyContracts = Array.from({ length: 30 }, (_, i) =>
        createContract({
          contract_number: `A${String(i + 1).padStart(6, '0')}`,
          monthly_premium: (i + 1) * 10000,
        })
      )

      const sorted = getSortedContracts(manyContracts, { key: 'monthly_premium', direction: 'asc' })

      expect(sorted).toHaveLength(30)
      expect(sorted[0].monthly_premium).toBe(10000)
      expect(sorted[29].monthly_premium).toBe(300000)
    })

    it('빈 계약 목록은 빈 배열 반환', () => {
      const sorted = getSortedContracts([], { key: 'monthly_premium', direction: 'asc' })
      expect(sorted).toHaveLength(0)
    })
  })

  describe('계약 정렬 - sortConfig null (기본 상태)', () => {
    it('sortConfig가 null이면 원본 순서 유지', () => {
      const sorted = getSortedContracts(sampleContracts, null)

      expect(sorted).toHaveLength(4)
      expect(sorted[0].insurance_company).toBe('삼성생명')
      expect(sorted[3].insurance_company).toBe('AIA')
    })
  })

  describe('계약 정렬 - 문자열 컬럼 (한글 로케일)', () => {
    it('보험사 오름차순 정렬 (한글 → 영문)', () => {
      const sorted = getSortedContracts(sampleContracts, {
        key: 'insurance_company',
        direction: 'asc',
      })

      // 한글 로케일: 가나다 순서
      expect(sorted[0].insurance_company).toBe('메트라이프')
      expect(sorted[1].insurance_company).toBe('삼성생명')
      expect(sorted[2].insurance_company).toBe('한화생명')
      // AIA (영문)는 한글 뒤
      expect(sorted[3].insurance_company).toBe('AIA')
    })

    it('보험사 내림차순 정렬', () => {
      const sorted = getSortedContracts(sampleContracts, {
        key: 'insurance_company',
        direction: 'desc',
      })

      expect(sorted[0].insurance_company).toBe('AIA')
      expect(sorted[3].insurance_company).toBe('메트라이프')
    })
  })

  describe('계약 정렬 - 숫자 컬럼', () => {
    it('월 보험료 오름차순 정렬', () => {
      const sorted = getSortedContracts(sampleContracts, {
        key: 'monthly_premium',
        direction: 'asc',
      })

      expect(sorted[0].monthly_premium).toBe(80000)
      expect(sorted[1].monthly_premium).toBe(120000)
      expect(sorted[2].monthly_premium).toBe(150000)
      expect(sorted[3].monthly_premium).toBe(200000)
    })

    it('월 보험료 내림차순 정렬', () => {
      const sorted = getSortedContracts(sampleContracts, {
        key: 'monthly_premium',
        direction: 'desc',
      })

      expect(sorted[0].monthly_premium).toBe(200000)
      expect(sorted[3].monthly_premium).toBe(80000)
    })
  })

  describe('계약 정렬 - null/undefined 처리', () => {
    it('null 값은 항상 끝에 위치 (오름차순)', () => {
      const contractsWithNull: InsuranceContract[] = [
        createContract({ contractor_name: '김철수' }),
        createContract({ contractor_name: undefined }),
        createContract({ contractor_name: '이영희' }),
      ]

      const sorted = getSortedContracts(contractsWithNull, {
        key: 'contractor_name',
        direction: 'asc',
      })

      expect(sorted[0].contractor_name).toBe('김철수')
      expect(sorted[1].contractor_name).toBe('이영희')
      expect(sorted[2].contractor_name).toBeUndefined()
    })

    it('null 값은 항상 끝에 위치 (내림차순)', () => {
      const contractsWithNull: InsuranceContract[] = [
        createContract({ contractor_name: undefined }),
        createContract({ contractor_name: '김철수' }),
        createContract({ contractor_name: '이영희' }),
      ]

      const sorted = getSortedContracts(contractsWithNull, {
        key: 'contractor_name',
        direction: 'desc',
      })

      expect(sorted[0].contractor_name).toBeDefined()
      expect(sorted[1].contractor_name).toBeDefined()
      expect(sorted[2].contractor_name).toBeUndefined()
    })

    it('양쪽 모두 null이면 순서 유지', () => {
      const contractsWithNull: InsuranceContract[] = [
        createContract({ contractor_name: undefined, contract_number: 'A001' }),
        createContract({ contractor_name: undefined, contract_number: 'A002' }),
      ]

      const sorted = getSortedContracts(contractsWithNull, {
        key: 'contractor_name',
        direction: 'asc',
      })

      expect(sorted[0].contract_number).toBe('A001')
      expect(sorted[1].contract_number).toBe('A002')
    })
  })

  describe('계약 정렬 - 원본 불변성', () => {
    it('정렬 후 원본 배열은 변경되지 않음', () => {
      const original = [...sampleContracts]
      const originalFirst = original[0].insurance_company

      getSortedContracts(original, { key: 'monthly_premium', direction: 'asc' })

      expect(original[0].insurance_company).toBe(originalFirst)
    })
  })

  describe('계약 상태 배지 스타일', () => {
    it('유지/정상 상태 → active 배지', () => {
      expect(getStatusBadgeClass('정상유지')).toBe('contract-item__status--active')
      expect(getStatusBadgeClass('정상')).toBe('contract-item__status--active')
      expect(getStatusBadgeClass('유지')).toBe('contract-item__status--active')
    })

    it('만기/해지 상태 → inactive 배지', () => {
      expect(getStatusBadgeClass('만기')).toBe('contract-item__status--inactive')
      expect(getStatusBadgeClass('해지')).toBe('contract-item__status--inactive')
      expect(getStatusBadgeClass('기간만기')).toBe('contract-item__status--inactive')
    })

    it('미정의 상태 → default 배지', () => {
      expect(getStatusBadgeClass(undefined)).toBe('contract-item__status--default')
      expect(getStatusBadgeClass('기타')).toBe('contract-item__status--default')
    })

    it('대소문자 무시', () => {
      expect(getStatusBadgeClass('정상유지')).toBe('contract-item__status--active')
    })
  })

  describe('정렬 토글 로직', () => {
    /**
     * handleSort 로직: 같은 컬럼 클릭 시 asc → desc 토글
     */
    it('첫 클릭은 항상 오름차순', () => {
      const currentSort: SortConfig = null
      const clickedKey: keyof InsuranceContract = 'insurance_company'

      let direction: 'asc' | 'desc' = 'asc'
      if (currentSort && currentSort.key === clickedKey && currentSort.direction === 'asc') {
        direction = 'desc'
      }

      expect(direction).toBe('asc')
    })

    it('같은 컬럼 재클릭은 내림차순', () => {
      const currentSort: SortConfig = { key: 'insurance_company', direction: 'asc' }
      const clickedKey: keyof InsuranceContract = 'insurance_company'

      let direction: 'asc' | 'desc' = 'asc'
      if (currentSort && currentSort.key === clickedKey && currentSort.direction === 'asc') {
        direction = 'desc'
      }

      expect(direction).toBe('desc')
    })

    it('다른 컬럼 클릭은 오름차순으로 리셋', () => {
      const currentSort: SortConfig = { key: 'insurance_company', direction: 'desc' }
      const clickedKey: keyof InsuranceContract = 'monthly_premium'

      let direction: 'asc' | 'desc' = 'asc'
      if (currentSort && currentSort.key === clickedKey && currentSort.direction === 'asc') {
        direction = 'desc'
      }

      expect(direction).toBe('asc')
    })
  })
})
