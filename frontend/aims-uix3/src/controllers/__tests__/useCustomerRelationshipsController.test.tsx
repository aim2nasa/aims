/**
 * useCustomerRelationshipsController.test.tsx
 * @since 2025-10-14
 * @version 1.0.0
 *
 * useCustomerRelationshipsController Hook의 종합 테스트
 * 총 20개 테스트 케이스 포함
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useCustomerRelationshipsController } from '../useCustomerRelationshipsController'
import { RelationshipService } from '@/services/relationshipService'
import type { Relationship, RelationshipTypeData } from '@/services/relationshipService'

// RelationshipService 모킹
vi.mock('@/services/relationshipService', () => ({
  RelationshipService: {
    getRelationshipTypes: vi.fn(),
    getCustomerRelationships: vi.fn(),
    deleteRelationship: vi.fn(),
  },
}))

describe('useCustomerRelationshipsController', () => {
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

  const mockRelationships: Relationship[] = [
    {
      _id: 'rel1',
      from_customer: 'cust1',
      relationship_info: {
        relationship_type: 'spouse',
        relationship_category: 'family',
      },
      related_customer: 'cust2',
      display_relationship_label: '배우자',
    } as Relationship,
    {
      _id: 'rel2',
      from_customer: 'cust1',
      relationship_info: {
        relationship_type: 'child',
        relationship_category: 'family',
      },
      related_customer: 'cust3',
      display_relationship_label: '자녀',
    } as Relationship,
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    // 기본 모킹 설정
    vi.mocked(RelationshipService.getRelationshipTypes).mockResolvedValue(mockRelationshipTypes)
    vi.mocked(RelationshipService.getCustomerRelationships).mockResolvedValue(mockRelationships)
    vi.mocked(RelationshipService.deleteRelationship).mockResolvedValue()
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  // ===== 1. 초기 상태 테스트 =====

  describe('초기 상태', () => {
    it('초기값이 올바르게 설정되어야 함', () => {
      const { result } = renderHook(() =>
        useCustomerRelationshipsController({
          customerId: 'cust1',
          autoLoad: false,
        })
      )

      expect(result.current.state.relationships).toEqual([])
      expect(result.current.state.relationshipTypes).toEqual({})
      expect(result.current.state.isLoading).toBe(false)
      expect(result.current.state.error).toBeNull()
    })

    it('autoLoad: true일 때 자동으로 데이터를 로드해야 함', async () => {
      const { result } = renderHook(() =>
        useCustomerRelationshipsController({
          customerId: 'cust1',
          autoLoad: true,
        })
      )

      await waitFor(() => {
        expect(result.current.state.relationships).toHaveLength(2)
      })

      expect(RelationshipService.getCustomerRelationships).toHaveBeenCalledWith('cust1')
      expect(RelationshipService.getRelationshipTypes).toHaveBeenCalled()
    })

    it('autoLoad: false일 때 자동 로드하지 않아야 함', async () => {
      renderHook(() =>
        useCustomerRelationshipsController({
          customerId: 'cust1',
          autoLoad: false,
        })
      )

      // 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(RelationshipService.getCustomerRelationships).not.toHaveBeenCalled()
      expect(RelationshipService.getRelationshipTypes).not.toHaveBeenCalled()
    })

    it('customerId가 없을 때 로드하지 않아야 함', async () => {
      const { result } = renderHook(() =>
        useCustomerRelationshipsController({
          customerId: '',
          autoLoad: true,
        })
      )

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(result.current.state.relationships).toEqual([])
      expect(RelationshipService.getCustomerRelationships).not.toHaveBeenCalled()
    })
  })

  // ===== 2. loadRelationships() 테스트 =====

  describe('loadRelationships', () => {
    it('관계 데이터를 로드해야 함', async () => {
      const { result } = renderHook(() =>
        useCustomerRelationshipsController({
          customerId: 'cust1',
          autoLoad: false,
        })
      )

      await act(async () => {
        await result.current.actions.loadRelationships()
      })

      expect(result.current.state.relationships).toHaveLength(2)
      expect(result.current.state.relationships[0]?._id).toBe('rel1')
    })

    it('관계 타입도 함께 로드해야 함', async () => {
      const { result } = renderHook(() =>
        useCustomerRelationshipsController({
          customerId: 'cust1',
          autoLoad: false,
        })
      )

      await act(async () => {
        await result.current.actions.loadRelationships()
      })

      expect(result.current.state.relationshipTypes).toHaveProperty('all_types')
      expect(result.current.state.relationshipTypes.all_types).toHaveProperty('spouse')
    })

    it('silent: true일 때 로딩 상태를 변경하지 않아야 함', async () => {
      const { result } = renderHook(() =>
        useCustomerRelationshipsController({
          customerId: 'cust1',
          autoLoad: false,
        })
      )

      await act(async () => {
        await result.current.actions.loadRelationships({ silent: true })
      })

      // silent 모드에서는 isLoading이 false로 유지되어야 함
      expect(result.current.state.isLoading).toBe(false)
    })

    it('에러 발생 시 에러 메시지를 설정해야 함', async () => {
      vi.mocked(RelationshipService.getCustomerRelationships).mockRejectedValueOnce(
        new Error('Network error')
      )

      const { result } = renderHook(() =>
        useCustomerRelationshipsController({
          customerId: 'cust1',
          autoLoad: false,
        })
      )

      await act(async () => {
        await result.current.actions.loadRelationships()
      })

      expect(result.current.state.error).toBeTruthy()
    })

    it('customerId가 없으면 빈 배열을 설정하고 API를 호출하지 않아야 함', async () => {
      const { result } = renderHook(() =>
        useCustomerRelationshipsController({
          customerId: '',
          autoLoad: false,
        })
      )

      await act(async () => {
        await result.current.actions.loadRelationships()
      })

      expect(result.current.state.relationships).toEqual([])
      expect(RelationshipService.getCustomerRelationships).not.toHaveBeenCalled()
    })
  })

  // ===== 3. deleteRelationship() 테스트 =====

  describe('deleteRelationship', () => {
    it('관계를 삭제하고 목록을 다시 로드해야 함', async () => {
      const { result } = renderHook(() =>
        useCustomerRelationshipsController({
          customerId: 'cust1',
          autoLoad: true,
        })
      )

      await waitFor(() => {
        expect(result.current.state.relationships).toHaveLength(2)
      })

      // 삭제 후 1개만 남도록 모킹 변경
      const secondRel = mockRelationships[1];
      if (secondRel) {
        vi.mocked(RelationshipService.getCustomerRelationships).mockResolvedValueOnce([
          secondRel,
        ])
      }

      await act(async () => {
        await result.current.actions.deleteRelationship('rel1')
      })

      expect(RelationshipService.deleteRelationship).toHaveBeenCalledWith('cust1', 'rel1')
      expect(result.current.state.relationships).toHaveLength(1)
      expect(result.current.state.relationships[0]?._id).toBe('rel2')
    })

    it('삭제 실패 시 에러를 설정해야 함', async () => {
      vi.mocked(RelationshipService.deleteRelationship).mockRejectedValueOnce(
        new Error('Delete failed')
      )

      const { result } = renderHook(() =>
        useCustomerRelationshipsController({
          customerId: 'cust1',
          autoLoad: false,
        })
      )

      await act(async () => {
        await result.current.actions.deleteRelationship('rel1')
      })

      expect(result.current.state.error).toContain('관계 삭제에 실패했습니다')
    })

    it('customerId가 없으면 실행하지 않아야 함', async () => {
      const { result } = renderHook(() =>
        useCustomerRelationshipsController({
          customerId: '',
          autoLoad: false,
        })
      )

      await act(async () => {
        await result.current.actions.deleteRelationship('rel1')
      })

      expect(RelationshipService.deleteRelationship).not.toHaveBeenCalled()
    })
  })

  // ===== 4. getRelationshipTypeLabel() 테스트 =====

  describe('getRelationshipTypeLabel', () => {
    it('display_relationship_label이 있으면 해당 값을 반환해야 함', async () => {
      const { result } = renderHook(() =>
        useCustomerRelationshipsController({
          customerId: 'cust1',
          autoLoad: true,
        })
      )

      await waitFor(() => {
        expect(result.current.state.relationships).toHaveLength(2)
      })

      const firstRel = mockRelationships[0];
      if (firstRel) {
        const label = result.current.actions.getRelationshipTypeLabel(firstRel)
        expect(label).toBe('배우자')
      }
    })

    it('all_types에서 라벨을 찾아야 함', async () => {
      const relationshipWithoutLabel: Relationship = {
        _id: 'rel3',
        from_customer: 'cust1',
        relationship_info: {
          relationship_type: 'parent',
          relationship_category: 'family',
        },
        related_customer: 'cust4',
      } as Relationship

      const { result } = renderHook(() =>
        useCustomerRelationshipsController({
          customerId: 'cust1',
          autoLoad: true,
        })
      )

      await waitFor(() => {
        expect(result.current.state.relationshipTypes).toHaveProperty('all_types')
      })

      const label = result.current.actions.getRelationshipTypeLabel(relationshipWithoutLabel)
      expect(label).toBe('부모')
    })

    it('fallback 라벨을 사용해야 함', async () => {
      const relationshipWithUnknownType: Relationship = {
        _id: 'rel4',
        from_customer: 'cust1',
        relationship_info: {
          relationship_type: 'friend',
          relationship_category: 'other',
        },
        related_customer: 'cust5',
      } as Relationship

      const { result } = renderHook(() =>
        useCustomerRelationshipsController({
          customerId: 'cust1',
          autoLoad: true,
        })
      )

      await waitFor(() => {
        expect(result.current.state.relationshipTypes).toHaveProperty('all_types')
      })

      const label = result.current.actions.getRelationshipTypeLabel(relationshipWithUnknownType)
      expect(label).toBe('친구') // FALLBACK_RELATIONSHIP_LABELS에서
    })

    it('relationship_type이 없으면 "관계"를 반환해야 함', async () => {
      const relationshipWithoutType: Relationship = {
        _id: 'rel5',
        from_customer: 'cust1',
        relationship_info: {
          relationship_type: '',
          relationship_category: '',
        },
        related_customer: 'cust6',
      } as Relationship

      const { result } = renderHook(() =>
        useCustomerRelationshipsController({
          customerId: 'cust1',
          autoLoad: true,
        })
      )

      await waitFor(() => {
        expect(result.current.state.relationshipTypes).toHaveProperty('all_types')
      })

      const label = result.current.actions.getRelationshipTypeLabel(relationshipWithoutType)
      expect(label).toBe('관계')
    })

    it('알 수 없는 타입은 타입 키를 그대로 반환해야 함', async () => {
      const relationshipWithUnknownKey: Relationship = {
        _id: 'rel6',
        from_customer: 'cust1',
        relationship_info: {
          relationship_type: 'unknown_type',
          relationship_category: 'other',
        },
        related_customer: 'cust7',
      } as Relationship

      const { result } = renderHook(() =>
        useCustomerRelationshipsController({
          customerId: 'cust1',
          autoLoad: true,
        })
      )

      await waitFor(() => {
        expect(result.current.state.relationshipTypes).toHaveProperty('all_types')
      })

      const label = result.current.actions.getRelationshipTypeLabel(relationshipWithUnknownKey)
      expect(label).toBe('unknown_type')
    })
  })

  // ===== 5. refreshRelationshipTypes() 테스트 =====

  describe('refreshRelationshipTypes', () => {
    it('관계 타입을 강제로 새로고침해야 함', async () => {
      const { result } = renderHook(() =>
        useCustomerRelationshipsController({
          customerId: 'cust1',
          autoLoad: true,
        })
      )

      await waitFor(() => {
        expect(result.current.state.relationshipTypes).toHaveProperty('all_types')
      })

      // 기존 호출 카운트 확인
      const initialCallCount = vi.mocked(RelationshipService.getRelationshipTypes).mock.calls.length

      await act(async () => {
        await result.current.actions.refreshRelationshipTypes()
      })

      // 한 번 더 호출되었어야 함
      expect(vi.mocked(RelationshipService.getRelationshipTypes).mock.calls.length).toBe(
        initialCallCount + 1
      )
    })
  })

  // ===== 6. relationshipChanged 이벤트 리스너 테스트 =====

  describe('relationshipChanged 이벤트', () => {
    it('relationshipChanged 이벤트 발생 시 데이터를 다시 로드해야 함', async () => {
      const { result } = renderHook(() =>
        useCustomerRelationshipsController({
          customerId: 'cust1',
          autoLoad: true,
        })
      )

      await waitFor(() => {
        expect(result.current.state.relationships).toHaveLength(2)
      })

      // 초기 로드 호출 횟수
      const initialCallCount = vi.mocked(RelationshipService.getCustomerRelationships).mock.calls
        .length

      // relationshipChanged 이벤트 발생
      act(() => {
        window.dispatchEvent(new Event('relationshipChanged'))
      })

      await waitFor(() => {
        expect(vi.mocked(RelationshipService.getCustomerRelationships).mock.calls.length).toBe(
          initialCallCount + 1
        )
      })
    })

    it('customerId가 없으면 이벤트 리스너를 등록하지 않아야 함', async () => {
      const { result } = renderHook(() =>
        useCustomerRelationshipsController({
          customerId: '',
          autoLoad: false,
        })
      )

      // relationshipChanged 이벤트 발생
      act(() => {
        window.dispatchEvent(new Event('relationshipChanged'))
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(result.current.state.relationships).toEqual([])
      expect(RelationshipService.getCustomerRelationships).not.toHaveBeenCalled()
    })
  })

  // ===== 7. 엣지 케이스 테스트 =====

  describe('엣지 케이스', () => {
    it('관계 타입이 이미 로드되어 있으면 다시 로드하지 않아야 함', async () => {
      // 첫 번째 렌더링 - 타입 로드
      const { result, rerender } = renderHook(
        ({ customerId }) =>
          useCustomerRelationshipsController({
            customerId,
            autoLoad: true,
          }),
        {
          initialProps: { customerId: 'cust1' },
        }
      )

      await waitFor(() => {
        expect(result.current.state.relationshipTypes).toHaveProperty('all_types')
      })

      const initialTypeCallCount = vi.mocked(RelationshipService.getRelationshipTypes).mock.calls
        .length

      // 두 번째 렌더링 - 타입은 이미 있으므로 다시 로드하지 않음
      rerender({ customerId: 'cust1' })

      await act(async () => {
        await result.current.actions.loadRelationships()
      })

      // getRelationshipTypes 호출 횟수가 증가하지 않아야 함
      expect(vi.mocked(RelationshipService.getRelationshipTypes).mock.calls.length).toBe(
        initialTypeCallCount
      )
    })
  })
})
