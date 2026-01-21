/**
 * relationshipService.test.ts
 * @since 2025-10-14
 * @version 1.0.0
 *
 * RelationshipService의 종합 테스트
 * 총 18개 테스트 케이스 포함
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RelationshipService } from '../relationshipService'
import { api } from '@/shared/lib/api'
import type { Relationship, RelationshipTypeData, CreateRelationshipData } from '../relationshipService'

// API 모듈 모킹
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
  isRequestCancelledError: (error: unknown) => {
    return error instanceof Error && error.name === 'RequestCancelledError';
  },
}))

describe('RelationshipService', () => {
  // ===== Mock Data Setup =====

  const mockRelationshipTypes: RelationshipTypeData = {
    all_types: {
      spouse: { label: '배우자', category: 'family' },
      parent: { label: '부모', category: 'family' },
      child: { label: '자녀', category: 'family' },
    },
    categories: {
      family: { label: '가족', types: ['spouse', 'parent', 'child'] },
    },
  }

  const mockRelationship: Relationship = {
    _id: 'rel1',
    from_customer: 'cust1',
    related_customer: 'cust2',
    relationship_info: {
      relationship_type: 'spouse',
      relationship_category: 'family',
      strength: 'strong',
    },
    display_relationship_label: '배우자',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ===== 1. getRelationshipTypes() 테스트 =====

  describe('getRelationshipTypes', () => {
    it('관계 유형을 조회해야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        success: true,
        data: mockRelationshipTypes,
      })

      const result = await RelationshipService.getRelationshipTypes()

      expect(api.get).toHaveBeenCalledWith('/api/relationship-types')
      expect(result).toEqual(mockRelationshipTypes)
      expect(result.all_types).toHaveProperty('spouse')
    })

    it('success가 false일 때 에러를 던져야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        success: false,
        data: null,
      })

      await expect(RelationshipService.getRelationshipTypes()).rejects.toThrow(
        '관계 유형 조회에 실패했습니다'
      )
    })

    it('data가 없을 때 에러를 던져야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        success: true,
        data: null,
      })

      await expect(RelationshipService.getRelationshipTypes()).rejects.toThrow(
        '관계 유형 조회에 실패했습니다'
      )
    })
  })

  // ===== 2. getCustomerRelationships() 테스트 =====

  describe('getCustomerRelationships', () => {
    it('특정 고객의 관계를 조회해야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        success: true,
        data: {
          relationships: [mockRelationship],
        },
      })

      const result = await RelationshipService.getCustomerRelationships('cust1')

      expect(api.get).toHaveBeenCalledWith(
        '/api/customers/cust1/relationships?include_details=true'
      )
      expect(result).toHaveLength(1)
      expect(result?.[0]?._id).toBe('rel1')
    })

    it('빈 고객 ID에 대해 에러를 던져야 함', async () => {
      await expect(RelationshipService.getCustomerRelationships('')).rejects.toThrow(
        '고객 ID가 필요합니다'
      )
      expect(api.get).not.toHaveBeenCalled()
    })

    it('공백만 있는 고객 ID에 대해 에러를 던져야 함', async () => {
      await expect(RelationshipService.getCustomerRelationships('   ')).rejects.toThrow(
        '고객 ID가 필요합니다'
      )
      expect(api.get).not.toHaveBeenCalled()
    })

    it('success가 false일 때 에러를 던져야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        success: false,
        data: null,
      })

      await expect(RelationshipService.getCustomerRelationships('cust1')).rejects.toThrow(
        '관계 조회에 실패했습니다'
      )
    })

    it('relationships가 없을 때 빈 배열을 반환해야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        success: true,
        data: {},
      })

      const result = await RelationshipService.getCustomerRelationships('cust1')

      expect(result).toEqual([])
    })
  })

  // ===== 3. createRelationship() 테스트 =====

  describe('createRelationship', () => {
    const createData: CreateRelationshipData = {
      relationship_type: 'spouse',
      relationship_category: 'family',
      strength: 'strong',
    }

    it('관계를 생성해야 함', async () => {
      vi.mocked(api.post).mockResolvedValueOnce({
        success: true,
        data: mockRelationship,
      })

      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')

      const result = await RelationshipService.createRelationship('cust1', 'cust2', createData)

      expect(api.post).toHaveBeenCalledWith('/api/customers/cust1/relationships', {
        to_customer_id: 'cust2',
        ...createData,
      })
      expect(result).toEqual(mockRelationship)
      expect(dispatchEventSpy).toHaveBeenCalledWith(expect.any(CustomEvent))
    })

    it('빈 fromCustomerId에 대해 에러를 던져야 함', async () => {
      await expect(
        RelationshipService.createRelationship('', 'cust2', createData)
      ).rejects.toThrow('고객 ID가 필요합니다')
      expect(api.post).not.toHaveBeenCalled()
    })

    it('빈 toCustomerId에 대해 에러를 던져야 함', async () => {
      await expect(
        RelationshipService.createRelationship('cust1', '', createData)
      ).rejects.toThrow('고객 ID가 필요합니다')
      expect(api.post).not.toHaveBeenCalled()
    })

    it('자기 자신과의 관계 설정 시 에러를 던져야 함', async () => {
      await expect(
        RelationshipService.createRelationship('cust1', 'cust1', createData)
      ).rejects.toThrow('자기 자신과는 관계를 설정할 수 없습니다')
      expect(api.post).not.toHaveBeenCalled()
    })

    it('success가 false일 때 에러를 던져야 함', async () => {
      vi.mocked(api.post).mockResolvedValueOnce({
        success: false,
        data: null,
      })

      await expect(
        RelationshipService.createRelationship('cust1', 'cust2', createData)
      ).rejects.toThrow('관계 생성에 실패했습니다')
    })

    it('relationshipChanged 이벤트를 발생시켜야 함', async () => {
      vi.mocked(api.post).mockResolvedValueOnce({
        success: true,
        data: mockRelationship,
      })

      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')

      await RelationshipService.createRelationship('cust1', 'cust2', createData)

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'relationshipChanged',
        })
      )
    })
  })

  // ===== 4. deleteRelationship() 테스트 =====

  describe('deleteRelationship', () => {
    it('관계를 삭제해야 함', async () => {
      vi.mocked(api.delete).mockResolvedValueOnce({
        success: true,
      })

      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')

      await RelationshipService.deleteRelationship('cust1', 'rel1')

      expect(api.delete).toHaveBeenCalledWith('/api/customers/cust1/relationships/rel1')
      expect(dispatchEventSpy).toHaveBeenCalledWith(expect.any(CustomEvent))
    })

    it('빈 customerId에 대해 에러를 던져야 함', async () => {
      await expect(RelationshipService.deleteRelationship('', 'rel1')).rejects.toThrow(
        '고객 ID와 관계 ID가 필요합니다'
      )
      expect(api.delete).not.toHaveBeenCalled()
    })

    it('빈 relationshipId에 대해 에러를 던져야 함', async () => {
      await expect(RelationshipService.deleteRelationship('cust1', '')).rejects.toThrow(
        '고객 ID와 관계 ID가 필요합니다'
      )
      expect(api.delete).not.toHaveBeenCalled()
    })

    it('success가 false일 때 에러를 던져야 함', async () => {
      vi.mocked(api.delete).mockResolvedValueOnce({
        success: false,
      })

      await expect(RelationshipService.deleteRelationship('cust1', 'rel1')).rejects.toThrow(
        '관계 삭제에 실패했습니다'
      )
    })

    it('relationshipChanged 이벤트를 발생시켜야 함', async () => {
      vi.mocked(api.delete).mockResolvedValueOnce({
        success: true,
      })

      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')

      await RelationshipService.deleteRelationship('cust1', 'rel1')

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'relationshipChanged',
        })
      )
    })
  })

  // ===== 5. getAllRelationshipsWithCustomers() 테스트 =====

  describe('getAllRelationshipsWithCustomers', () => {
    const mockCustomers = [
      {
        _id: 'cust1',
        personal_info: { name: '홍길동' },
        meta: { status: 'active' },
      },
      {
        _id: 'cust2',
        personal_info: { name: '김영희' },
        meta: { status: 'active' },
      },
    ]

    it('모든 고객과 관계 데이터를 조회해야 함', async () => {
      // 새 벌크 API는 단일 호출로 모든 데이터를 반환
      vi.mocked(api.get).mockResolvedValueOnce({
        success: true,
        data: {
          customers: mockCustomers,
          relationships: [mockRelationship],
          total_count: 1,
          timestamp: Date.now(),
        },
      })

      const result = await RelationshipService.getAllRelationshipsWithCustomers()

      expect(api.get).toHaveBeenCalledWith('/api/relationships')
      expect(result.customers).toHaveLength(2)
      expect(result.relationships).toHaveLength(1)
      expect(result.timestamp).toBeGreaterThan(0)
    })

    it('관계 데이터 조회 실패 시 에러를 던져야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        success: false,
        data: null,
      })

      await expect(RelationshipService.getAllRelationshipsWithCustomers()).rejects.toThrow(
        '관계 데이터 조회에 실패했습니다'
      )
    })
  })
})
