/**
 * CustomerContext 테스트
 * @since 1.0.0
 */

import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { CustomerContextProvider } from '../CustomerContext'
import { useCustomerContext } from '../CustomerContextHooks'
import type { Customer } from '@/entities/customer'

describe('CustomerContext', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <CustomerContextProvider>{children}</CustomerContextProvider>
  )

  const mockCustomer: Customer = {
    _id: '1',
    name: '홍길동',
    phone: '010-1234-5678',
    address: {
      current: '서울시 강남구'
    }
  }

  const mockCustomer2: Customer = {
    _id: '2',
    name: '김철수',
    phone: '010-9876-5432',
    address: {
      current: '서울시 서초구'
    }
  }

  describe('초기 상태', () => {
    it('초기값이 올바르게 설정되어야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      expect(result.current.state.customers).toEqual([])
      expect(result.current.state.selectedCustomer).toBeNull()
      expect(result.current.state.isLoading).toBe(false)
      expect(result.current.state.isCreating).toBe(false)
      expect(result.current.state.isUpdating).toBe(false)
      expect(result.current.state.isDeleting).toBe(false)
      expect(result.current.state.searchQuery).toBe('')
      expect(result.current.state.searchParams).toEqual({ limit: 20, page: 1 })
      expect(result.current.state.showCreateForm).toBe(false)
      expect(result.current.state.showEditForm).toBe(false)
      expect(result.current.state.editingCustomer).toBeNull()
      expect(result.current.state.error).toBeNull()
      expect(result.current.state.total).toBe(0)
      expect(result.current.state.hasMore).toBe(false)
    })

    it('액션 함수들이 제공되어야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      expect(typeof result.current.setLoading).toBe('function')
      expect(typeof result.current.setCustomers).toBe('function')
      expect(typeof result.current.addCustomer).toBe('function')
      expect(typeof result.current.updateCustomer).toBe('function')
      expect(typeof result.current.removeCustomer).toBe('function')
      expect(typeof result.current.selectCustomer).toBe('function')
      expect(typeof result.current.setSearchQuery).toBe('function')
      expect(typeof result.current.setSearchParams).toBe('function')
      expect(typeof result.current.showCreateForm).toBe('function')
      expect(typeof result.current.showEditForm).toBe('function')
      expect(typeof result.current.setCreating).toBe('function')
      expect(typeof result.current.setUpdating).toBe('function')
      expect(typeof result.current.setDeleting).toBe('function')
      expect(typeof result.current.setError).toBe('function')
      expect(typeof result.current.resetState).toBe('function')
      expect(typeof result.current.dispatch).toBe('function')
    })
  })

  describe('Provider 없이 사용 시 에러', () => {
    it('Provider 없이 사용하면 에러를 던져야 함', () => {
      // Suppress console.error for this test
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        renderHook(() => useCustomerContext())
      }).toThrow(/useCustomerContext must be used within.*CustomerContextProvider/)

      consoleError.mockRestore()
    })
  })

  describe('SET_LOADING 액션', () => {
    it('로딩 상태를 true로 설정해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.setLoading(true)
      })

      expect(result.current.state.isLoading).toBe(true)
    })

    it('로딩 상태를 false로 설정해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.setLoading(true)
      })

      act(() => {
        result.current.setLoading(false)
      })

      expect(result.current.state.isLoading).toBe(false)
    })
  })

  describe('SET_CUSTOMERS 액션', () => {
    it('고객 목록을 설정해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.setCustomers({
          customers: [mockCustomer, mockCustomer2],
          total: 2,
          hasMore: false
        })
      })

      expect(result.current.state.customers).toHaveLength(2)
      expect(result.current.state.total).toBe(2)
      expect(result.current.state.hasMore).toBe(false)
      expect(result.current.state.isLoading).toBe(false)
      expect(result.current.state.error).toBeNull()
    })

    it('hasMore가 true일 때 설정되어야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.setCustomers({
          customers: [mockCustomer],
          total: 100,
          hasMore: true
        })
      })

      expect(result.current.state.hasMore).toBe(true)
      expect(result.current.state.total).toBe(100)
    })
  })

  describe('ADD_CUSTOMER 액션', () => {
    it('새 고객을 추가해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      // 먼저 기존 고객 추가
      act(() => {
        result.current.setCustomers({
          customers: [mockCustomer],
          total: 1,
          hasMore: false
        })
      })

      // 새 고객 추가
      act(() => {
        result.current.addCustomer(mockCustomer2)
      })

      expect(result.current.state.customers).toHaveLength(2)
      expect(result.current.state.customers[0]).toEqual(mockCustomer2) // 맨 앞에 추가됨
      expect(result.current.state.total).toBe(2)
      expect(result.current.state.isCreating).toBe(false)
      expect(result.current.state.showCreateForm).toBe(false)
      expect(result.current.state.error).toBeNull()
    })

    it('빈 목록에 고객을 추가해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.addCustomer(mockCustomer)
      })

      expect(result.current.state.customers).toHaveLength(1)
      expect(result.current.state.customers[0]).toEqual(mockCustomer)
      expect(result.current.state.total).toBe(1)
    })
  })

  describe('UPDATE_CUSTOMER 액션', () => {
    it('고객 정보를 수정해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.setCustomers({
          customers: [mockCustomer, mockCustomer2],
          total: 2,
          hasMore: false
        })
      })

      const updatedCustomer = { ...mockCustomer, name: '홍길동(수정)' }

      act(() => {
        result.current.updateCustomer(updatedCustomer)
      })

      expect(result.current.state.customers[0].name).toBe('홍길동(수정)')
      expect(result.current.state.customers[1]).toEqual(mockCustomer2) // 다른 고객은 변경 없음
      expect(result.current.state.isUpdating).toBe(false)
      expect(result.current.state.showEditForm).toBe(false)
      expect(result.current.state.editingCustomer).toBeNull()
      expect(result.current.state.error).toBeNull()
    })

    it('선택된 고객을 수정하면 selectedCustomer도 업데이트되어야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.setCustomers({
          customers: [mockCustomer],
          total: 1,
          hasMore: false
        })
      })

      act(() => {
        result.current.selectCustomer(mockCustomer)
      })

      const updatedCustomer = { ...mockCustomer, name: '홍길동(수정)' }

      act(() => {
        result.current.updateCustomer(updatedCustomer)
      })

      expect(result.current.state.selectedCustomer?.name).toBe('홍길동(수정)')
    })

    it('선택되지 않은 고객을 수정하면 selectedCustomer는 변경 없어야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.setCustomers({
          customers: [mockCustomer, mockCustomer2],
          total: 2,
          hasMore: false
        })
      })

      act(() => {
        result.current.selectCustomer(mockCustomer)
      })

      const updatedCustomer2 = { ...mockCustomer2, name: '김철수(수정)' }

      act(() => {
        result.current.updateCustomer(updatedCustomer2)
      })

      expect(result.current.state.selectedCustomer).toEqual(mockCustomer) // 변경 없음
    })
  })

  describe('REMOVE_CUSTOMER 액션', () => {
    it('고객을 삭제해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.setCustomers({
          customers: [mockCustomer, mockCustomer2],
          total: 2,
          hasMore: false
        })
      })

      act(() => {
        result.current.removeCustomer('1')
      })

      expect(result.current.state.customers).toHaveLength(1)
      expect(result.current.state.customers[0]).toEqual(mockCustomer2)
      expect(result.current.state.total).toBe(1)
      expect(result.current.state.isDeleting).toBe(false)
      expect(result.current.state.error).toBeNull()
    })

    it('선택된 고객을 삭제하면 selectedCustomer가 null이 되어야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.setCustomers({
          customers: [mockCustomer, mockCustomer2],
          total: 2,
          hasMore: false
        })
      })

      act(() => {
        result.current.selectCustomer(mockCustomer)
      })

      act(() => {
        result.current.removeCustomer('1')
      })

      expect(result.current.state.selectedCustomer).toBeNull()
    })

    it('선택되지 않은 고객을 삭제하면 selectedCustomer는 유지되어야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.setCustomers({
          customers: [mockCustomer, mockCustomer2],
          total: 2,
          hasMore: false
        })
      })

      act(() => {
        result.current.selectCustomer(mockCustomer)
      })

      act(() => {
        result.current.removeCustomer('2')
      })

      expect(result.current.state.selectedCustomer).toEqual(mockCustomer)
    })
  })

  describe('SELECT_CUSTOMER 액션', () => {
    it('고객을 선택해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.selectCustomer(mockCustomer)
      })

      expect(result.current.state.selectedCustomer).toEqual(mockCustomer)
    })

    it('고객 선택을 해제해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.selectCustomer(mockCustomer)
      })

      act(() => {
        result.current.selectCustomer(null)
      })

      expect(result.current.state.selectedCustomer).toBeNull()
    })
  })

  describe('SET_SEARCH_QUERY 액션', () => {
    it('검색어를 설정해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.setSearchQuery('홍길동')
      })

      expect(result.current.state.searchQuery).toBe('홍길동')
      expect(result.current.state.searchParams.page).toBe(1) // 페이지 초기화됨
    })

    it('검색어 변경 시 페이지가 1로 리셋되어야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.setSearchParams({ page: 5 })
      })

      act(() => {
        result.current.setSearchQuery('김철수')
      })

      expect(result.current.state.searchParams.page).toBe(1)
    })
  })

  describe('SET_SEARCH_PARAMS 액션', () => {
    it('검색 파라미터를 설정해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.setSearchParams({ limit: 50, page: 2 })
      })

      expect(result.current.state.searchParams.limit).toBe(50)
      expect(result.current.state.searchParams.page).toBe(2)
    })

    it('기존 파라미터를 유지하고 일부만 업데이트해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.setSearchParams({ limit: 30 })
      })

      expect(result.current.state.searchParams.limit).toBe(30)
      expect(result.current.state.searchParams.page).toBe(1) // 기본값 유지
    })
  })

  describe('SHOW_CREATE_FORM 액션', () => {
    it('생성 폼을 표시해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.showCreateForm(true)
      })

      expect(result.current.state.showCreateForm).toBe(true)
    })

    it('생성 폼을 숨겨야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.showCreateForm(true)
      })

      act(() => {
        result.current.showCreateForm(false)
      })

      expect(result.current.state.showCreateForm).toBe(false)
    })
  })

  describe('SHOW_EDIT_FORM 액션', () => {
    it('수정 폼을 표시하고 편집 대상 설정해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.showEditForm(true, mockCustomer)
      })

      expect(result.current.state.showEditForm).toBe(true)
      expect(result.current.state.editingCustomer).toEqual(mockCustomer)
    })

    it('수정 폼을 숨기고 편집 대상 초기화해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.showEditForm(true, mockCustomer)
      })

      act(() => {
        result.current.showEditForm(false)
      })

      expect(result.current.state.showEditForm).toBe(false)
      expect(result.current.state.editingCustomer).toBeNull()
    })
  })

  describe('로딩 상태 액션', () => {
    it('생성 중 상태를 설정해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.setCreating(true)
      })

      expect(result.current.state.isCreating).toBe(true)
    })

    it('수정 중 상태를 설정해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.setUpdating(true)
      })

      expect(result.current.state.isUpdating).toBe(true)
    })

    it('삭제 중 상태를 설정해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.setDeleting(true)
      })

      expect(result.current.state.isDeleting).toBe(true)
    })
  })

  describe('SET_ERROR 액션', () => {
    it('에러를 설정하고 모든 로딩 상태를 false로 해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.setLoading(true)
        result.current.setCreating(true)
        result.current.setUpdating(true)
        result.current.setDeleting(true)
      })

      act(() => {
        result.current.setError('에러 발생')
      })

      expect(result.current.state.error).toBe('에러 발생')
      expect(result.current.state.isLoading).toBe(false)
      expect(result.current.state.isCreating).toBe(false)
      expect(result.current.state.isUpdating).toBe(false)
      expect(result.current.state.isDeleting).toBe(false)
    })

    it('에러를 초기화해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        result.current.setError('에러')
      })

      act(() => {
        result.current.setError(null)
      })

      expect(result.current.state.error).toBeNull()
    })
  })

  describe('RESET_STATE 액션', () => {
    it('모든 상태를 초기화해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      // 상태 변경
      act(() => {
        result.current.setCustomers({
          customers: [mockCustomer],
          total: 1,
          hasMore: false
        })
        result.current.selectCustomer(mockCustomer)
        result.current.setSearchQuery('테스트')
        result.current.setError('에러')
        result.current.showCreateForm(true)
      })

      // 리셋
      act(() => {
        result.current.resetState()
      })

      expect(result.current.state.customers).toEqual([])
      expect(result.current.state.selectedCustomer).toBeNull()
      expect(result.current.state.searchQuery).toBe('')
      expect(result.current.state.error).toBeNull()
      expect(result.current.state.showCreateForm).toBe(false)
      expect(result.current.state.total).toBe(0)
    })
  })

  describe('통합 시나리오', () => {
    it('전체 CRUD 플로우가 정상 동작해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      // 1. 목록 로드
      act(() => {
        result.current.setLoading(true)
      })

      act(() => {
        result.current.setCustomers({
          customers: [mockCustomer],
          total: 1,
          hasMore: false
        })
      })

      expect(result.current.state.customers).toHaveLength(1)

      // 2. 고객 추가
      act(() => {
        result.current.addCustomer(mockCustomer2)
      })

      expect(result.current.state.customers).toHaveLength(2)

      // 3. 고객 수정
      const updatedCustomer = { ...mockCustomer2, name: '김철수(수정)' }
      act(() => {
        result.current.updateCustomer(updatedCustomer)
      })

      expect(result.current.state.customers[0].name).toBe('김철수(수정)')

      // 4. 고객 선택
      act(() => {
        result.current.selectCustomer(updatedCustomer)
      })

      expect(result.current.state.selectedCustomer?.name).toBe('김철수(수정)')

      // 5. 고객 삭제
      act(() => {
        result.current.removeCustomer(updatedCustomer._id)
      })

      expect(result.current.state.customers).toHaveLength(1)
      expect(result.current.state.selectedCustomer).toBeNull()
    })

    it('검색 플로우가 정상 동작해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      // 검색어 입력
      act(() => {
        result.current.setSearchQuery('홍길동')
      })

      expect(result.current.state.searchQuery).toBe('홍길동')
      expect(result.current.state.searchParams.page).toBe(1)

      // 검색 파라미터 설정
      act(() => {
        result.current.setSearchParams({ limit: 50 })
      })

      expect(result.current.state.searchParams.limit).toBe(50)

      // 검색 결과 설정
      act(() => {
        result.current.setCustomers({
          customers: [mockCustomer],
          total: 100,
          hasMore: true
        })
      })

      expect(result.current.state.customers).toHaveLength(1)
      expect(result.current.state.hasMore).toBe(true)
    })

    it('에러 처리 플로우가 정상 동작해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      // 로딩 시작
      act(() => {
        result.current.setLoading(true)
      })

      expect(result.current.state.isLoading).toBe(true)

      // 에러 발생
      act(() => {
        result.current.setError('네트워크 오류')
      })

      expect(result.current.state.error).toBe('네트워크 오류')
      expect(result.current.state.isLoading).toBe(false)

      // 재시도 (에러 초기화)
      act(() => {
        result.current.setError(null)
        result.current.setLoading(true)
      })

      expect(result.current.state.error).toBeNull()
      expect(result.current.state.isLoading).toBe(true)

      // 성공
      act(() => {
        result.current.setCustomers({
          customers: [mockCustomer],
          total: 1,
          hasMore: false
        })
      })

      expect(result.current.state.isLoading).toBe(false)
      expect(result.current.state.error).toBeNull()
    })
  })

  describe('메모이제이션', () => {
    it('액션 함수들의 참조가 안정적이어야 함', () => {
      const { result, rerender } = renderHook(() => useCustomerContext(), { wrapper })

      const initialActions = {
        setLoading: result.current.setLoading,
        setCustomers: result.current.setCustomers,
        addCustomer: result.current.addCustomer
      }

      // 상태 변경
      act(() => {
        result.current.setLoading(true)
      })

      rerender()

      // 액션 함수 참조는 동일해야 함
      expect(result.current.setLoading).toBe(initialActions.setLoading)
      expect(result.current.setCustomers).toBe(initialActions.setCustomers)
      expect(result.current.addCustomer).toBe(initialActions.addCustomer)
    })
  })
})
