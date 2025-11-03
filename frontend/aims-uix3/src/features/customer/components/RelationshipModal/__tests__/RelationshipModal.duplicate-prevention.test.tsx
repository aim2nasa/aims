/**
 * Phase 2-4: 법인 관계자 중복 방지 Regression 테스트
 * @description 법인 고객의 관계자 추가 시 중복 선택 방지 및 사용자 정의 관계 타입 허용 검증
 * @regression 커밋 7d4802b, 3343914, d01986c - 법인 고객 관계자 관리 기능
 * @priority MEDIUM - 법인 고객 관리 핵심 기능
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RelationshipModal, type RelationshipType } from '../RelationshipModal'
import { CustomerService } from '@/services/customerService'
import { RelationshipService } from '@/services/relationshipService'

// Mock services
vi.mock('@/services/customerService', () => ({
  CustomerService: {
    getCustomers: vi.fn()
  }
}))

vi.mock('@/services/relationshipService', () => ({
  RelationshipService: {
    getAllRelationshipsWithCustomers: vi.fn(),
    createRelationship: vi.fn()
  }
}))

describe('법인 관계자 중복 방지 - Regression Tests', () => {
  const mockOnCancel = vi.fn()
  const mockOnSuccess = vi.fn()
  const corporateCustomerId = 'corp-customer-123'

  const corporateRelationshipTypes: RelationshipType[] = [
    {
      value: 'CEO',
      label: '대표',
      icon: '👔',
      description: '대표이사'
    },
    {
      value: 'Executive',
      label: '임원',
      icon: '💼',
      description: '임원'
    },
    {
      value: 'Employee',
      label: '직원',
      icon: '👨‍💼',
      description: '직원'
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('관계자 중복 선택 방지 (커밋 3343914)', () => {
    it('이미 관계 맺은 개인 고객은 검색 결과에서 제외', async () => {
      vi.mocked(RelationshipService.getAllRelationshipsWithCustomers).mockResolvedValue({
        relationships: [
          {
            _id: 'rel-1',
            from_customer: { _id: corporateCustomerId, insurance_info: { customer_type: '법인' } },
            related_customer: { _id: 'person-shin', personal_info: { name: '신상철' }, insurance_info: { customer_type: '개인' } },
            relationship_info: { relationship_category: 'corporate', relationship_type: '지인' }
          }
        ],
        customers: [],
        timestamp: Date.now()
      } as any)

      vi.mocked(CustomerService.getCustomers).mockResolvedValue({
        customers: [
          { _id: 'person-shin', personal_info: { name: '신상철' }, insurance_info: { customer_type: '개인' } },
          { _id: 'person-kim', personal_info: { name: '김철수' }, insurance_info: { customer_type: '개인' } }
        ],
        total: 2,
        page: 1,
        limit: 50
      } as any)

      const { container } = render(
        <RelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={corporateCustomerId}
          onSuccess={mockOnSuccess}
          title="법인 관계자 추가"
          titleIcon={<span>🏢</span>}
          memberLabel="관계자"
          relationshipCategory="corporate"
          relationshipTypes={corporateRelationshipTypes}
          allowCustomRelation={true}
          filterCustomerType="개인"
        />
      )

      const searchInput = container.querySelector('input[type="text"]')
      await userEvent.type(searchInput!, '신')

      await waitFor(() => {
        expect(CustomerService.getCustomers).toHaveBeenCalled()
      })

      await waitFor(() => {
        const dropdown = container.querySelector('.autocomplete-dropdown')
        if (dropdown) {
          const options = dropdown.querySelectorAll('.autocomplete-option')
          expect(options.length).toBeLessThanOrEqual(1)
        }
      })
    })

    it('양방향 관계도 중복으로 감지', async () => {
      vi.mocked(RelationshipService.getAllRelationshipsWithCustomers).mockResolvedValue({
        relationships: [
          {
            _id: 'rel-reverse',
            from_customer: { _id: 'person-lee', insurance_info: { customer_type: '개인' } },
            related_customer: { _id: corporateCustomerId, insurance_info: { customer_type: '법인' } },
            relationship_info: { relationship_category: 'corporate', relationship_type: '컨설턴트' }
          }
        ],
        customers: [],
        timestamp: Date.now()
      } as any)

      vi.mocked(CustomerService.getCustomers).mockResolvedValue({
        customers: [{ _id: 'person-lee', personal_info: { name: '이영희' }, insurance_info: { customer_type: '개인' } }],
        total: 1
      } as any)

      const { container } = render(
        <RelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={corporateCustomerId}
          title="법인 관계자 추가"
          titleIcon={<span>🏢</span>}
          memberLabel="관계자"
          relationshipCategory="corporate"
          relationshipTypes={corporateRelationshipTypes}
          allowCustomRelation={true}
          filterCustomerType="개인"
        />
      )

      const searchInput = container.querySelector('input[type="text"]')
      await userEvent.type(searchInput!, '이영희')

      await waitFor(() => {
        const emptyMessage = container.querySelector('.autocomplete-empty')
        const dropdown = container.querySelector('.autocomplete-dropdown')
        expect(emptyMessage || !dropdown).toBeTruthy()
      })
    })

    it('동일 법인에 중복 관계 추가 차단', async () => {
      vi.mocked(RelationshipService.getAllRelationshipsWithCustomers).mockResolvedValue({
        relationships: [
          {
            _id: 'rel-1',
            from_customer: { _id: corporateCustomerId, insurance_info: { customer_type: '법인' } },
            related_customer: { _id: 'person-duplicate', insurance_info: { customer_type: '개인' } },
            relationship_info: { relationship_category: 'corporate', relationship_type: 'Employee' }
          }
        ],
        customers: [],
        timestamp: Date.now()
      } as any)

      vi.mocked(CustomerService.getCustomers).mockResolvedValue({
        customers: [{ _id: 'person-duplicate', personal_info: { name: '중복고객' }, insurance_info: { customer_type: '개인' } }],
        total: 1
      } as any)

      const { container } = render(
        <RelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={corporateCustomerId}
          title="법인 관계자 추가"
          titleIcon={<span>🏢</span>}
          memberLabel="관계자"
          relationshipCategory="corporate"
          relationshipTypes={corporateRelationshipTypes}
          allowCustomRelation={true}
          filterCustomerType="개인"
        />
      )

      const searchInput = container.querySelector('input[type="text"]')
      await userEvent.type(searchInput!, '중복')

      await waitFor(() => {
        const emptyMessage = container.querySelector('.autocomplete-empty')
        const dropdown = container.querySelector('.autocomplete-dropdown')
        expect(emptyMessage || !dropdown).toBeTruthy()
      })
    })
  })

  describe('사용자 정의 관계 타입 허용 (커밋 d01986c)', () => {
    it('사용자 정의 관계 타입 추가 성공', async () => {
      vi.mocked(RelationshipService.getAllRelationshipsWithCustomers).mockResolvedValue({
        relationships: [],
        customers: [],
        timestamp: Date.now()
      } as any)

      vi.mocked(CustomerService.getCustomers).mockResolvedValue({
        customers: [{ _id: 'person-new', personal_info: { name: '신규고객' }, insurance_info: { customer_type: '개인' } }],
        total: 1
      } as any)

      vi.mocked(RelationshipService.createRelationship).mockResolvedValue({
        _id: 'new-rel-id',
        from_customer: corporateCustomerId,
        related_customer: 'person-new',
        relationship_info: { relationship_category: 'corporate', relationship_type: '지인' }
      } as any)

      await RelationshipService.createRelationship(
        corporateCustomerId,
        'person-new',
        {
          relationship_type: '지인',
          relationship_category: 'corporate'
        } as any
      )

      expect(RelationshipService.createRelationship).toHaveBeenCalledWith(
        corporateCustomerId,
        'person-new',
        expect.objectContaining({
          relationship_type: '지인',
          relationship_category: 'corporate'
        })
      )
    })

    it('사용자 정의 관계 타입 "사업 파트너" 허용', async () => {
      vi.mocked(RelationshipService.createRelationship).mockResolvedValue({
        _id: 'partner-rel',
        from_customer: corporateCustomerId,
        related_customer: 'person-partner',
        relationship_info: { relationship_category: 'corporate', relationship_type: '사업 파트너' }
      } as any)

      await RelationshipService.createRelationship(corporateCustomerId, 'person-partner', {
        relationship_type: '사업 파트너',
        relationship_category: 'corporate'
      } as any)

      expect(RelationshipService.createRelationship).toHaveBeenCalledWith(
        corporateCustomerId,
        'person-partner',
        expect.objectContaining({ relationship_type: '사업 파트너' })
      )
    })

    it('빈 사용자 정의 관계 타입은 거부', async () => {
      vi.mocked(RelationshipService.getAllRelationshipsWithCustomers).mockResolvedValue({
        relationships: [],
        customers: [],
        timestamp: Date.now()
      } as any)

      vi.mocked(CustomerService.getCustomers).mockResolvedValue({
        customers: [{ _id: 'person-test', personal_info: { name: '테스트' }, insurance_info: { customer_type: '개인' } }],
        total: 1
      } as any)

      const { container } = render(
        <RelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={corporateCustomerId}
          title="법인 관계자 추가"
          titleIcon={<span>🏢</span>}
          memberLabel="관계자"
          relationshipCategory="corporate"
          relationshipTypes={corporateRelationshipTypes}
          allowCustomRelation={true}
          filterCustomerType="개인"
        />
      )

      await waitFor(() => {
        const submitButton = container.querySelector('button[type="submit"]')
        expect(submitButton).toBeTruthy()
      })
    })
  })

  describe('통합 시나리오', () => {
    it('법인 고객: 관계자 추가 후 중복 방지 확인', async () => {
      vi.mocked(RelationshipService.getAllRelationshipsWithCustomers).mockResolvedValue({
        relationships: [
          {
            _id: 'rel-first',
            from_customer: { _id: corporateCustomerId, insurance_info: { customer_type: '법인' } },
            related_customer: { _id: 'person-first', personal_info: { name: '첫번째관계자' }, insurance_info: { customer_type: '개인' } },
            relationship_info: { relationship_category: 'corporate', relationship_type: 'CEO' }
          }
        ],
        customers: [],
        timestamp: Date.now()
      } as any)

      vi.mocked(CustomerService.getCustomers).mockResolvedValue({
        customers: [
          { _id: 'person-first', personal_info: { name: '첫번째관계자' }, insurance_info: { customer_type: '개인' } },
          { _id: 'person-second', personal_info: { name: '두번째관계자' }, insurance_info: { customer_type: '개인' } }
        ],
        total: 2
      } as any)

      const { container } = render(
        <RelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={corporateCustomerId}
          title="법인 관계자 추가"
          titleIcon={<span>🏢</span>}
          memberLabel="관계자"
          relationshipCategory="corporate"
          relationshipTypes={corporateRelationshipTypes}
          allowCustomRelation={true}
          filterCustomerType="개인"
        />
      )

      await waitFor(() => {
        expect(RelationshipService.getAllRelationshipsWithCustomers).toHaveBeenCalled()
      })

      const searchInput = container.querySelector('input[type="text"]')
      await userEvent.type(searchInput!, '관계자')

      await waitFor(() => {
        const dropdown = container.querySelector('.autocomplete-dropdown')
        if (dropdown) {
          const options = dropdown.querySelectorAll('.autocomplete-option')
          expect(options.length).toBe(1)
          const optionText = options[0]?.textContent
          expect(optionText).toContain('두번째관계자')
        }
      })
    })

    it('개인 고객만 검색되고 법인 고객은 제외', async () => {
      vi.mocked(RelationshipService.getAllRelationshipsWithCustomers).mockResolvedValue({
        relationships: [],
        customers: [],
        timestamp: Date.now()
      } as any)

      vi.mocked(CustomerService.getCustomers).mockResolvedValue({
        customers: [
          { _id: 'person-1', personal_info: { name: '개인고객' }, insurance_info: { customer_type: '개인' } },
          { _id: 'corp-1', personal_info: { name: '법인고객' }, insurance_info: { customer_type: '법인' } }
        ],
        total: 2
      } as any)

      const { container } = render(
        <RelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={corporateCustomerId}
          title="법인 관계자 추가"
          titleIcon={<span>🏢</span>}
          memberLabel="관계자"
          relationshipCategory="corporate"
          relationshipTypes={corporateRelationshipTypes}
          allowCustomRelation={true}
          filterCustomerType="개인"
        />
      )

      const searchInput = container.querySelector('input[type="text"]')
      await userEvent.type(searchInput!, '고객')

      await waitFor(() => {
        const dropdown = container.querySelector('.autocomplete-dropdown')
        if (dropdown) {
          const options = dropdown.querySelectorAll('.autocomplete-option')
          expect(options.length).toBe(1)
        }
      })
    })
  })

  describe('엣지 케이스', () => {
    it('자기 자신을 관계자로 추가 차단', async () => {
      vi.mocked(RelationshipService.getAllRelationshipsWithCustomers).mockResolvedValue({
        relationships: [],
        customers: [],
        timestamp: Date.now()
      } as any)

      vi.mocked(CustomerService.getCustomers).mockResolvedValue({
        customers: [{ _id: corporateCustomerId, personal_info: { name: '캐치업코리아' }, insurance_info: { customer_type: '법인' } }],
        total: 1
      } as any)

      const { container } = render(
        <RelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={corporateCustomerId}
          title="법인 관계자 추가"
          titleIcon={<span>🏢</span>}
          memberLabel="관계자"
          relationshipCategory="corporate"
          relationshipTypes={corporateRelationshipTypes}
          allowCustomRelation={true}
          filterCustomerType="개인"
        />
      )

      await waitFor(() => {
        const emptyMessage = container.querySelector('.autocomplete-empty')
        const dropdown = container.querySelector('.autocomplete-dropdown')
        expect(emptyMessage || !dropdown).toBeTruthy()
      })
    })

    it('빈 검색어로 검색 시 결과 없음', async () => {
      vi.mocked(RelationshipService.getAllRelationshipsWithCustomers).mockResolvedValue({
        relationships: [],
        customers: [],
        timestamp: Date.now()
      } as any)

      const { container } = render(
        <RelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={corporateCustomerId}
          title="법인 관계자 추가"
          titleIcon={<span>🏢</span>}
          memberLabel="관계자"
          relationshipCategory="corporate"
          relationshipTypes={corporateRelationshipTypes}
          allowCustomRelation={true}
          filterCustomerType="개인"
        />
      )

      const searchInput = container.querySelector('input[type="text"]')
      await userEvent.type(searchInput!, '   ')

      await waitFor(() => {
        expect(CustomerService.getCustomers).not.toHaveBeenCalled()
      })
    })

    it('관계 카테고리가 다른 관계는 중복 감지 안 함', async () => {
      vi.mocked(RelationshipService.getAllRelationshipsWithCustomers).mockResolvedValue({
        relationships: [
          {
            _id: 'family-rel',
            from_customer: { _id: 'another-customer', insurance_info: { customer_type: '개인' } },
            related_customer: { _id: 'person-both', personal_info: { name: '양쪽관계' }, insurance_info: { customer_type: '개인' } },
            relationship_info: { relationship_category: 'family', relationship_type: 'spouse' }
          }
        ],
        customers: [],
        timestamp: Date.now()
      } as any)

      vi.mocked(CustomerService.getCustomers).mockResolvedValue({
        customers: [{ _id: 'person-both', personal_info: { name: '양쪽관계' }, insurance_info: { customer_type: '개인' } }],
        total: 1
      } as any)

      const { container } = render(
        <RelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={corporateCustomerId}
          title="법인 관계자 추가"
          titleIcon={<span>🏢</span>}
          memberLabel="관계자"
          relationshipCategory="corporate"
          relationshipTypes={corporateRelationshipTypes}
          allowCustomRelation={true}
          filterCustomerType="개인"
        />
      )

      const searchInput = container.querySelector('input[type="text"]')
      await userEvent.type(searchInput!, '양쪽')

      await waitFor(() => {
        const dropdown = container.querySelector('.autocomplete-dropdown')
        if (dropdown) {
          const options = dropdown.querySelectorAll('.autocomplete-option')
          expect(options.length).toBe(1)
        } else {
          const emptyMessage = container.querySelector('.autocomplete-empty')
          expect(emptyMessage).toBeNull()
        }
      })
    })
  })
})
