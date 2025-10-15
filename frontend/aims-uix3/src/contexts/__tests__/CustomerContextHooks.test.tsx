/**
 * CustomerContextHooks 테스트
 * @since 1.0.0
 *
 * useCustomerState, useCustomerActions Hook 테스트
 */

import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { CustomerContextProvider } from '../CustomerContext'
import {
  useCustomerContext,
  useCustomerState,
  useCustomerActions
} from '../CustomerContextHooks'
import type { Customer } from '@/entities/customer'

describe('CustomerContextHooks', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <CustomerContextProvider>{children}</CustomerContextProvider>
  )

  const mockCustomer: Customer = {
    _id: '1',
    personal_info: {
      name: '홍길동',
      mobile_phone: '010-1234-5678',
      address: {
        address1: '서울시 강남구'
      }
    },
    meta: {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'active'
    },
    contracts: [],
    documents: [],
    consultations: [],
    tags: []
  }

  describe('useCustomerContext', () => {
    it('Provider 없이 사용하면 에러를 던져야 함', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        renderHook(() => useCustomerContext())
      }).toThrow(/useCustomerContext must be used within.*CustomerContextProvider/)

      consoleError.mockRestore()
    })

    it('Provider 내에서 사용하면 context를 반환해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      expect(result.current).toBeDefined()
      expect(result.current.state).toBeDefined()
      expect(result.current.dispatch).toBeDefined()
    })
  })

  describe('useCustomerState', () => {
    it('state만 반환해야 함', () => {
      const { result } = renderHook(() => useCustomerState(), { wrapper })

      expect(result.current).toBeDefined()
      expect(result.current.customers).toEqual([])
      expect(result.current.selectedCustomer).toBeNull()
      expect(result.current.isLoading).toBe(false)
      expect(result.current.searchQuery).toBe('')
    })

    it('useCustomerState로 상태에 접근할 수 있어야 함', () => {
      const { result: contextResult } = renderHook(() => useCustomerContext(), { wrapper })
      const { result: stateResult } = renderHook(() => useCustomerState(), { wrapper })

      // 초기 상태 확인
      expect(contextResult.current.state.customers).toEqual([])
      expect(stateResult.current.customers).toEqual([])
    })

    it('로딩 상태 변경을 반영해야 함', () => {
      const { result } = renderHook(() => {
        const context = useCustomerContext()
        const state = useCustomerState()
        return { context, state }
      }, { wrapper })

      expect(result.current.state.isLoading).toBe(false)

      act(() => {
        result.current.context.setLoading(true)
      })

      expect(result.current.state.isLoading).toBe(true)
    })

    it('검색어 변경을 반영해야 함', () => {
      const { result } = renderHook(() => {
        const context = useCustomerContext()
        const state = useCustomerState()
        return { context, state }
      }, { wrapper })

      expect(result.current.state.searchQuery).toBe('')

      act(() => {
        result.current.context.setSearchQuery('홍길동')
      })

      expect(result.current.state.searchQuery).toBe('홍길동')
    })
  })

  describe('useCustomerActions', () => {
    it('모든 액션 함수를 반환해야 함', () => {
      const { result } = renderHook(() => useCustomerActions(), { wrapper })

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
    })

    it('setLoading 액션이 동작해야 함', () => {
      const { result } = renderHook(() => {
        const actions = useCustomerActions()
        const state = useCustomerState()
        return { actions, state }
      }, { wrapper })

      expect(result.current.state.isLoading).toBe(false)

      act(() => {
        result.current.actions.setLoading(true)
      })

      expect(result.current.state.isLoading).toBe(true)
    })

    it('useCustomerActions로 액션에 접근할 수 있어야 함', () => {
      const { result } = renderHook(() => useCustomerActions(), { wrapper })

      // 액션 함수들이 모두 존재하는지 확인
      expect(typeof result.current.setCustomers).toBe('function')
      expect(typeof result.current.addCustomer).toBe('function')
      expect(typeof result.current.updateCustomer).toBe('function')
    })

    it('addCustomer 액션이 동작해야 함', () => {
      const { result } = renderHook(() => {
        const actions = useCustomerActions()
        const state = useCustomerState()
        return { actions, state }
      }, { wrapper })

      act(() => {
        result.current.actions.addCustomer(mockCustomer)
      })

      expect(result.current.state.customers).toHaveLength(1)
      expect(result.current.state.customers[0]?._id).toBe('1')
    })

    it('updateCustomer 액션이 동작해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      // 먼저 고객 추가
      act(() => {
        result.current.addCustomer(mockCustomer)
      })

      expect(result.current.state.customers).toHaveLength(1)

      // 고객 정보 수정
      const updatedCustomer = {
        ...mockCustomer,
        personal_info: {
          ...mockCustomer.personal_info,
          name: '김철수'
        }
      }

      act(() => {
        result.current.updateCustomer(updatedCustomer)
      })

      expect(result.current.state.customers[0]?.personal_info?.name).toBe('김철수')
    })

    it('removeCustomer 액션이 동작해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      // 먼저 고객 추가
      act(() => {
        result.current.addCustomer(mockCustomer)
      })

      expect(result.current.state.customers).toHaveLength(1)

      // 고객 삭제
      act(() => {
        result.current.removeCustomer('1')
      })

      expect(result.current.state.customers).toHaveLength(0)
    })

    it('selectCustomer 액션이 동작해야 함', () => {
      const { result } = renderHook(() => {
        const actions = useCustomerActions()
        const state = useCustomerState()
        return { actions, state }
      }, { wrapper })

      act(() => {
        result.current.actions.selectCustomer(mockCustomer)
      })

      expect(result.current.state.selectedCustomer?._id).toBe('1')
    })

    it('setSearchQuery 액션이 동작해야 함', () => {
      const { result } = renderHook(() => {
        const actions = useCustomerActions()
        const state = useCustomerState()
        return { actions, state }
      }, { wrapper })

      act(() => {
        result.current.actions.setSearchQuery('테스트 검색')
      })

      expect(result.current.state.searchQuery).toBe('테스트 검색')
    })

    it('setSearchParams 액션이 동작해야 함', () => {
      const { result } = renderHook(() => {
        const actions = useCustomerActions()
        const state = useCustomerState()
        return { actions, state }
      }, { wrapper })

      act(() => {
        result.current.actions.setSearchParams({ limit: 50, page: 2 })
      })

      expect(result.current.state.searchParams.limit).toBe(50)
      expect(result.current.state.searchParams.page).toBe(2)
    })

    it('showCreateForm 액션이 동작해야 함', () => {
      const { result } = renderHook(() => {
        const actions = useCustomerActions()
        const state = useCustomerState()
        return { actions, state }
      }, { wrapper })

      expect(result.current.state.showCreateForm).toBe(false)

      act(() => {
        result.current.actions.showCreateForm(true)
      })

      expect(result.current.state.showCreateForm).toBe(true)
    })

    it('showEditForm 액션이 동작해야 함', () => {
      const { result } = renderHook(() => {
        const actions = useCustomerActions()
        const state = useCustomerState()
        return { actions, state }
      }, { wrapper })

      expect(result.current.state.showEditForm).toBe(false)

      act(() => {
        result.current.actions.showEditForm(true, mockCustomer)
      })

      expect(result.current.state.showEditForm).toBe(true)
      expect(result.current.state.editingCustomer?._id).toBe('1')
    })

    it('setCreating 액션이 동작해야 함', () => {
      const { result } = renderHook(() => {
        const actions = useCustomerActions()
        const state = useCustomerState()
        return { actions, state }
      }, { wrapper })

      expect(result.current.state.isCreating).toBe(false)

      act(() => {
        result.current.actions.setCreating(true)
      })

      expect(result.current.state.isCreating).toBe(true)
    })

    it('setUpdating 액션이 동작해야 함', () => {
      const { result } = renderHook(() => {
        const actions = useCustomerActions()
        const state = useCustomerState()
        return { actions, state }
      }, { wrapper })

      expect(result.current.state.isUpdating).toBe(false)

      act(() => {
        result.current.actions.setUpdating(true)
      })

      expect(result.current.state.isUpdating).toBe(true)
    })

    it('setDeleting 액션이 동작해야 함', () => {
      const { result } = renderHook(() => {
        const actions = useCustomerActions()
        const state = useCustomerState()
        return { actions, state }
      }, { wrapper })

      expect(result.current.state.isDeleting).toBe(false)

      act(() => {
        result.current.actions.setDeleting(true)
      })

      expect(result.current.state.isDeleting).toBe(true)
    })

    it('setError 액션이 동작해야 함', () => {
      const { result } = renderHook(() => {
        const actions = useCustomerActions()
        const state = useCustomerState()
        return { actions, state }
      }, { wrapper })

      expect(result.current.state.error).toBeNull()

      act(() => {
        result.current.actions.setError('테스트 에러')
      })

      expect(result.current.state.error).toBe('테스트 에러')
    })

    it('resetState 액션이 동작해야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      // 먼저 상태를 변경
      act(() => {
        result.current.addCustomer(mockCustomer)
        result.current.setSearchQuery('테스트')
        result.current.setError('에러')
      })

      expect(result.current.state.customers).toHaveLength(1)
      expect(result.current.state.searchQuery).toBe('테스트')
      expect(result.current.state.error).toBe('에러')

      // 리셋
      act(() => {
        result.current.resetState()
      })

      expect(result.current.state.customers).toEqual([])
      expect(result.current.state.searchQuery).toBe('')
      expect(result.current.state.error).toBeNull()
    })
  })

  describe('통합 시나리오', () => {
    it('state와 actions를 함께 사용할 수 있어야 함', () => {
      const { result } = renderHook(() => {
        const actions = useCustomerActions()
        const state = useCustomerState()
        return { actions, state }
      }, { wrapper })

      // 초기 상태 확인
      expect(result.current.state.customers).toEqual([])
      expect(result.current.state.isLoading).toBe(false)

      // 로딩 시작
      act(() => {
        result.current.actions.setLoading(true)
      })
      expect(result.current.state.isLoading).toBe(true)

      // 고객 추가
      act(() => {
        result.current.actions.addCustomer(mockCustomer)
        result.current.actions.setLoading(false)
      })

      expect(result.current.state.customers).toHaveLength(1)
      expect(result.current.state.isLoading).toBe(false)

      // 고객 선택
      act(() => {
        result.current.actions.selectCustomer(mockCustomer)
      })

      expect(result.current.state.selectedCustomer?._id).toBe('1')
    })

    it('여러 액션을 순차적으로 실행할 수 있어야 함', () => {
      const { result } = renderHook(() => useCustomerContext(), { wrapper })

      act(() => {
        // 검색 파라미터 설정
        result.current.setSearchParams({ limit: 10, page: 1 })
        // 검색어 설정
        result.current.setSearchQuery('홍길동')
        // 로딩 시작
        result.current.setLoading(true)
        // 고객 추가
        result.current.addCustomer(mockCustomer)
        // 로딩 종료
        result.current.setLoading(false)
      })

      expect(result.current.state.searchParams.limit).toBe(10)
      expect(result.current.state.searchQuery).toBe('홍길동')
      expect(result.current.state.customers).toHaveLength(1)
      expect(result.current.state.isLoading).toBe(false)
    })
  })
})
