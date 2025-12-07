/**
 * CustomerProvider.test.tsx
 * @since 2025-12-07
 * @version 1.0.0
 *
 * CustomerProvider 및 CustomerContext 테스트
 * - Context 초기 상태
 * - 고객 데이터 관리
 * - 검색/필터 상태
 * - 폼 상태 관리
 * - 에러 처리
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CustomerContextProvider, CustomerContext } from '@/contexts/CustomerContext'
import type { CustomerContextValue, CustomerState } from '@/contexts/CustomerContext'
import type { Customer } from '@/entities/customer'
import React, { useContext } from 'react'

// ==================== Mock Data ====================

const createMockCustomer = (overrides: Partial<Customer> = {}): Customer => ({
  _id: 'cust-001',
  personal_info: {
    name: '홍길동',
    mobile_phone: '010-1234-5678',
  },
  insurance_info: {
    customer_type: '개인',
  },
  contracts: [],
  documents: [],
  consultations: [],
  meta: {
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-15T00:00:00.000Z',
    status: 'active',
  },
  tags: [],
  ...overrides,
})

const mockCustomer1 = createMockCustomer()
const mockCustomer2 = createMockCustomer({
  _id: 'cust-002',
  personal_info: {
    name: '김영희',
    mobile_phone: '010-9876-5432',
  },
})

// ==================== Test Helpers ====================

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

// Context 값을 캡처하기 위한 테스트 컴포넌트
const ContextConsumer: React.FC<{
  onContextValue: (value: CustomerContextValue | null) => void
}> = ({ onContextValue }) => {
  const context = useContext(CustomerContext)
  React.useEffect(() => {
    onContextValue(context)
  }, [context, onContextValue])
  return null
}

// 상태를 렌더링하는 테스트 컴포넌트
const StateDisplay: React.FC = () => {
  const context = useContext(CustomerContext)
  if (!context) return <div>No Context</div>

  return (
    <div>
      <span data-testid="loading">{context.state.isLoading.toString()}</span>
      <span data-testid="customer-count">{context.state.customers.length}</span>
      <span data-testid="total">{context.state.total}</span>
      <span data-testid="search-query">{context.state.searchQuery}</span>
      <span data-testid="error">{context.state.error || 'none'}</span>
      <span data-testid="show-create-form">{context.state.showCreateForm.toString()}</span>
      <span data-testid="show-edit-form">{context.state.showEditForm.toString()}</span>
      <span data-testid="selected-customer">{context.state.selectedCustomer?._id || 'none'}</span>
    </div>
  )
}

// ==================== Tests ====================

describe('CustomerContextProvider', () => {
  describe('초기 상태', () => {
    it('기본 초기 상태가 올바르게 설정됨', () => {
      let contextValue: CustomerContextValue | null = null

      render(
        <CustomerContextProvider>
          <ContextConsumer onContextValue={(v) => (contextValue = v)} />
        </CustomerContextProvider>
      )

      expect(contextValue).not.toBeNull()
      expect(contextValue!.state.customers).toEqual([])
      expect(contextValue!.state.selectedCustomer).toBeNull()
      expect(contextValue!.state.isLoading).toBe(false)
      expect(contextValue!.state.isCreating).toBe(false)
      expect(contextValue!.state.isUpdating).toBe(false)
      expect(contextValue!.state.isDeleting).toBe(false)
      expect(contextValue!.state.searchQuery).toBe('')
      expect(contextValue!.state.showCreateForm).toBe(false)
      expect(contextValue!.state.showEditForm).toBe(false)
      expect(contextValue!.state.error).toBeNull()
      expect(contextValue!.state.total).toBe(0)
      expect(contextValue!.state.hasMore).toBe(false)
    })

    it('initialData로 초기 상태를 오버라이드할 수 있음', () => {
      let contextValue: CustomerContextValue | null = null
      const initialData: Partial<CustomerState> = {
        customers: [mockCustomer1],
        total: 1,
        searchQuery: '홍길동',
      }

      render(
        <CustomerContextProvider initialData={initialData}>
          <ContextConsumer onContextValue={(v) => (contextValue = v)} />
        </CustomerContextProvider>
      )

      expect(contextValue!.state.customers).toHaveLength(1)
      expect(contextValue!.state.total).toBe(1)
      expect(contextValue!.state.searchQuery).toBe('홍길동')
    })
  })

  describe('고객 데이터 관리', () => {
    it('setCustomers로 고객 목록을 설정할 수 있음', () => {
      let contextValue: CustomerContextValue | null = null

      render(
        <CustomerContextProvider>
          <ContextConsumer onContextValue={(v) => (contextValue = v)} />
        </CustomerContextProvider>
      )

      act(() => {
        contextValue!.setCustomers({
          customers: [mockCustomer1, mockCustomer2],
          total: 2,
          hasMore: false,
        })
      })

      expect(contextValue!.state.customers).toHaveLength(2)
      expect(contextValue!.state.total).toBe(2)
      expect(contextValue!.state.hasMore).toBe(false)
      expect(contextValue!.state.isLoading).toBe(false)
    })

    it('addCustomer로 고객을 추가할 수 있음', () => {
      let contextValue: CustomerContextValue | null = null

      render(
        <CustomerContextProvider initialData={{ customers: [mockCustomer1], total: 1 }}>
          <ContextConsumer onContextValue={(v) => (contextValue = v)} />
        </CustomerContextProvider>
      )

      act(() => {
        contextValue!.addCustomer(mockCustomer2)
      })

      expect(contextValue!.state.customers).toHaveLength(2)
      expect(contextValue!.state.total).toBe(2)
      // 새 고객이 맨 앞에 추가됨
      expect(contextValue!.state.customers[0]._id).toBe('cust-002')
    })

    it('updateCustomer로 고객 정보를 수정할 수 있음', () => {
      let contextValue: CustomerContextValue | null = null
      const updatedCustomer = {
        ...mockCustomer1,
        personal_info: { ...mockCustomer1.personal_info, name: '홍길동(수정)' },
      }

      render(
        <CustomerContextProvider initialData={{ customers: [mockCustomer1, mockCustomer2], total: 2 }}>
          <ContextConsumer onContextValue={(v) => (contextValue = v)} />
        </CustomerContextProvider>
      )

      act(() => {
        contextValue!.updateCustomer(updatedCustomer)
      })

      expect(contextValue!.state.customers).toHaveLength(2)
      const updated = contextValue!.state.customers.find((c) => c._id === 'cust-001')
      expect(updated?.personal_info.name).toBe('홍길동(수정)')
    })

    it('removeCustomer로 고객을 삭제할 수 있음', () => {
      let contextValue: CustomerContextValue | null = null

      render(
        <CustomerContextProvider initialData={{ customers: [mockCustomer1, mockCustomer2], total: 2 }}>
          <ContextConsumer onContextValue={(v) => (contextValue = v)} />
        </CustomerContextProvider>
      )

      act(() => {
        contextValue!.removeCustomer('cust-001')
      })

      expect(contextValue!.state.customers).toHaveLength(1)
      expect(contextValue!.state.total).toBe(1)
      expect(contextValue!.state.customers[0]._id).toBe('cust-002')
    })

    it('선택된 고객 삭제 시 selectedCustomer가 null로 설정됨', () => {
      let contextValue: CustomerContextValue | null = null

      render(
        <CustomerContextProvider
          initialData={{
            customers: [mockCustomer1],
            total: 1,
            selectedCustomer: mockCustomer1,
          }}
        >
          <ContextConsumer onContextValue={(v) => (contextValue = v)} />
        </CustomerContextProvider>
      )

      expect(contextValue!.state.selectedCustomer?._id).toBe('cust-001')

      act(() => {
        contextValue!.removeCustomer('cust-001')
      })

      expect(contextValue!.state.selectedCustomer).toBeNull()
    })

    it('selectCustomer로 고객을 선택할 수 있음', () => {
      let contextValue: CustomerContextValue | null = null

      render(
        <CustomerContextProvider initialData={{ customers: [mockCustomer1, mockCustomer2] }}>
          <ContextConsumer onContextValue={(v) => (contextValue = v)} />
        </CustomerContextProvider>
      )

      act(() => {
        contextValue!.selectCustomer(mockCustomer2)
      })

      expect(contextValue!.state.selectedCustomer?._id).toBe('cust-002')

      act(() => {
        contextValue!.selectCustomer(null)
      })

      expect(contextValue!.state.selectedCustomer).toBeNull()
    })
  })

  describe('검색/필터 상태', () => {
    it('setSearchQuery로 검색어를 설정할 수 있음', () => {
      let contextValue: CustomerContextValue | null = null

      render(
        <CustomerContextProvider>
          <ContextConsumer onContextValue={(v) => (contextValue = v)} />
        </CustomerContextProvider>
      )

      act(() => {
        contextValue!.setSearchQuery('홍길동')
      })

      expect(contextValue!.state.searchQuery).toBe('홍길동')
      // 검색 시 페이지가 1로 리셋됨
      expect(contextValue!.state.searchParams.page).toBe(1)
    })

    it('setSearchParams로 검색 파라미터를 설정할 수 있음', () => {
      let contextValue: CustomerContextValue | null = null

      render(
        <CustomerContextProvider>
          <ContextConsumer onContextValue={(v) => (contextValue = v)} />
        </CustomerContextProvider>
      )

      act(() => {
        contextValue!.setSearchParams({ limit: 50, page: 2 })
      })

      expect(contextValue!.state.searchParams.limit).toBe(50)
      expect(contextValue!.state.searchParams.page).toBe(2)
    })
  })

  describe('폼 상태 관리', () => {
    it('showCreateForm으로 생성 폼 표시를 제어할 수 있음', () => {
      let contextValue: CustomerContextValue | null = null

      render(
        <CustomerContextProvider>
          <ContextConsumer onContextValue={(v) => (contextValue = v)} />
        </CustomerContextProvider>
      )

      expect(contextValue!.state.showCreateForm).toBe(false)

      act(() => {
        contextValue!.showCreateForm(true)
      })

      expect(contextValue!.state.showCreateForm).toBe(true)

      act(() => {
        contextValue!.showCreateForm(false)
      })

      expect(contextValue!.state.showCreateForm).toBe(false)
    })

    it('showEditForm으로 수정 폼 표시를 제어할 수 있음', () => {
      let contextValue: CustomerContextValue | null = null

      render(
        <CustomerContextProvider>
          <ContextConsumer onContextValue={(v) => (contextValue = v)} />
        </CustomerContextProvider>
      )

      expect(contextValue!.state.showEditForm).toBe(false)
      expect(contextValue!.state.editingCustomer).toBeNull()

      act(() => {
        contextValue!.showEditForm(true, mockCustomer1)
      })

      expect(contextValue!.state.showEditForm).toBe(true)
      expect(contextValue!.state.editingCustomer?._id).toBe('cust-001')

      act(() => {
        contextValue!.showEditForm(false)
      })

      expect(contextValue!.state.showEditForm).toBe(false)
      expect(contextValue!.state.editingCustomer).toBeNull()
    })
  })

  describe('로딩 상태', () => {
    it('setLoading으로 로딩 상태를 제어할 수 있음', () => {
      let contextValue: CustomerContextValue | null = null

      render(
        <CustomerContextProvider>
          <ContextConsumer onContextValue={(v) => (contextValue = v)} />
        </CustomerContextProvider>
      )

      act(() => {
        contextValue!.setLoading(true)
      })

      expect(contextValue!.state.isLoading).toBe(true)

      act(() => {
        contextValue!.setLoading(false)
      })

      expect(contextValue!.state.isLoading).toBe(false)
    })

    it('setCreating으로 생성 중 상태를 제어할 수 있음', () => {
      let contextValue: CustomerContextValue | null = null

      render(
        <CustomerContextProvider>
          <ContextConsumer onContextValue={(v) => (contextValue = v)} />
        </CustomerContextProvider>
      )

      act(() => {
        contextValue!.setCreating(true)
      })

      expect(contextValue!.state.isCreating).toBe(true)
    })

    it('setUpdating으로 수정 중 상태를 제어할 수 있음', () => {
      let contextValue: CustomerContextValue | null = null

      render(
        <CustomerContextProvider>
          <ContextConsumer onContextValue={(v) => (contextValue = v)} />
        </CustomerContextProvider>
      )

      act(() => {
        contextValue!.setUpdating(true)
      })

      expect(contextValue!.state.isUpdating).toBe(true)
    })

    it('setDeleting으로 삭제 중 상태를 제어할 수 있음', () => {
      let contextValue: CustomerContextValue | null = null

      render(
        <CustomerContextProvider>
          <ContextConsumer onContextValue={(v) => (contextValue = v)} />
        </CustomerContextProvider>
      )

      act(() => {
        contextValue!.setDeleting(true)
      })

      expect(contextValue!.state.isDeleting).toBe(true)
    })
  })

  describe('에러 처리', () => {
    it('setError로 에러를 설정할 수 있음', () => {
      let contextValue: CustomerContextValue | null = null

      render(
        <CustomerContextProvider>
          <ContextConsumer onContextValue={(v) => (contextValue = v)} />
        </CustomerContextProvider>
      )

      act(() => {
        contextValue!.setError('API 오류가 발생했습니다')
      })

      expect(contextValue!.state.error).toBe('API 오류가 발생했습니다')
    })

    it('setError(null)로 에러를 클리어할 수 있음', () => {
      let contextValue: CustomerContextValue | null = null

      render(
        <CustomerContextProvider initialData={{ error: '이전 에러' }}>
          <ContextConsumer onContextValue={(v) => (contextValue = v)} />
        </CustomerContextProvider>
      )

      expect(contextValue!.state.error).toBe('이전 에러')

      act(() => {
        contextValue!.setError(null)
      })

      expect(contextValue!.state.error).toBeNull()
    })

    it('에러 설정 시 모든 로딩 상태가 false로 설정됨', () => {
      let contextValue: CustomerContextValue | null = null

      render(
        <CustomerContextProvider
          initialData={{
            isLoading: true,
            isCreating: true,
            isUpdating: true,
            isDeleting: true,
          }}
        >
          <ContextConsumer onContextValue={(v) => (contextValue = v)} />
        </CustomerContextProvider>
      )

      act(() => {
        contextValue!.setError('에러 발생')
      })

      expect(contextValue!.state.isLoading).toBe(false)
      expect(contextValue!.state.isCreating).toBe(false)
      expect(contextValue!.state.isUpdating).toBe(false)
      expect(contextValue!.state.isDeleting).toBe(false)
    })
  })

  describe('상태 초기화', () => {
    it('resetState로 모든 상태를 초기화할 수 있음', () => {
      let contextValue: CustomerContextValue | null = null

      render(
        <CustomerContextProvider
          initialData={{
            customers: [mockCustomer1],
            total: 1,
            searchQuery: '검색어',
            error: '에러',
            showCreateForm: true,
          }}
        >
          <ContextConsumer onContextValue={(v) => (contextValue = v)} />
        </CustomerContextProvider>
      )

      expect(contextValue!.state.customers).toHaveLength(1)
      expect(contextValue!.state.searchQuery).toBe('검색어')

      act(() => {
        contextValue!.resetState()
      })

      expect(contextValue!.state.customers).toHaveLength(0)
      expect(contextValue!.state.total).toBe(0)
      expect(contextValue!.state.searchQuery).toBe('')
      expect(contextValue!.state.error).toBeNull()
      expect(contextValue!.state.showCreateForm).toBe(false)
    })
  })

  describe('Context 없이 사용 시', () => {
    it('Provider 없이 사용하면 null을 반환함', () => {
      let contextValue: CustomerContextValue | null = 'not-null' as unknown as CustomerContextValue

      render(<ContextConsumer onContextValue={(v) => (contextValue = v)} />)

      expect(contextValue).toBeNull()
    })
  })
})
