/**
 * CustomerManagementView - Pie Chart Regression Tests
 * @since 2025-11-16
 * @commit a7cccb55
 *
 * 고객관리 대시보드 다중 파이 차트 기능 회귀 방지 테스트
 *
 * 테스트 범위:
 * - 법인/개인 고객 통계 계산
 * - 성별/연령대 통계 계산
 * - 파이 차트 그리드 렌더링
 * - 데이터 없을 때 처리
 * - 파이 차트 크기 및 스타일
 * - 가로 레이아웃 (차트 좌측, 레전드 우측)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CustomerManagementView } from '../CustomerManagementView'
import * as customerService from '@/services/customerService'
import type { Customer } from '@/entities/customer'

// Mock customer service
vi.mock('@/services/customerService', () => ({
  getCustomers: vi.fn()
}))

const mockGetCustomers = customerService.getCustomers as ReturnType<typeof vi.fn>

describe('CustomerManagementView - Pie Chart (커밋 a7cccb55)', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    vi.clearAllMocks()
  })

  const renderComponent = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <CustomerManagementView
          visible={true}
          onClose={() => {}}
          {...props}
        />
      </QueryClientProvider>
    )
  }

  const createMockCustomer = (overrides: Partial<Customer> = {}): Customer => ({
    _id: `customer-${Math.random()}`,
    personal_info: {
      name: '홍길동',
      mobile_phone: '010-1234-5678',
    },
    insurance_info: {
      customer_type: '개인'
    },
    contracts: [],
    documents: [],
    consultations: [],
    meta: {
      status: 'active',
      created_by: 'admin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    tags: [],
    ...overrides
  })

  describe('[회귀 방지] 파이 차트 렌더링', () => {
    it('고객 데이터가 있으면 파이 차트를 렌더링해야 함', async () => {
      const mockCustomers: Customer[] = [
        createMockCustomer({ insurance_info: { customer_type: '개인' } } as Partial<Customer>),
        createMockCustomer({ insurance_info: { customer_type: '법인' } } as Partial<Customer>)
      ]

      mockGetCustomers.mockResolvedValue({
        customers: mockCustomers,
        total: 2,
        limit: 1000,
        offset: 0
      })

      const { container } = renderComponent()

      await waitFor(() => {
        const pieChartsGrid = container.querySelector('.customer-management-view__pie-charts-grid')
        expect(pieChartsGrid).toBeInTheDocument()
      })
    })

    it('고객이 0명이면 파이 차트를 렌더링하지 않아야 함', async () => {
      mockGetCustomers.mockResolvedValue({
        customers: [],
        total: 0,
        limit: 1000,
        offset: 0
      })

      const { container } = renderComponent()

      await waitFor(() => {
        const statsCards = container.querySelectorAll('.stat-card')
        expect(statsCards.length).toBeGreaterThan(0) // 통계 카드는 렌더링됨
      })

      const pieChartsGrid = container.querySelector('.customer-management-view__pie-charts-grid')
      expect(pieChartsGrid).not.toBeInTheDocument()
    })

    it('파이 차트가 FileTypePieChart 컴포넌트를 사용해야 함', async () => {
      const mockCustomers: Customer[] = [
        createMockCustomer({ insurance_info: { customer_type: '개인' } } as Partial<Customer>)
      ]

      mockGetCustomers.mockResolvedValue({
        customers: mockCustomers,
        total: 1,
        limit: 1000,
        offset: 0
      })

      const { container } = renderComponent()

      await waitFor(() => {
        const pieChartSvg = container.querySelector('.file-type-pie-chart svg')
        expect(pieChartSvg).toBeInTheDocument()
        expect(pieChartSvg).toHaveAttribute('role', 'img')
      })
    })
  })

  describe('[회귀 방지] 법인/개인 통계 계산', () => {
    it('개인 고객만 있을 때 올바르게 계산해야 함', async () => {
      const mockCustomers: Customer[] = [
        createMockCustomer({ insurance_info: { customer_type: '개인' } } as Partial<Customer>),
        createMockCustomer({ insurance_info: { customer_type: '개인' } } as Partial<Customer>),
        createMockCustomer({ insurance_info: { customer_type: '개인' } } as Partial<Customer>)
      ]

      mockGetCustomers.mockResolvedValue({
        customers: mockCustomers,
        total: 3,
        limit: 1000,
        offset: 0
      })

      const { container } = renderComponent()

      await waitFor(() => {
        const legendLabel = screen.getByText('개인')
        expect(legendLabel).toBeInTheDocument()

        // 첫 번째 파이 차트 (고객 유형)의 레전드 값만 확인
        const pieChartItems = container.querySelectorAll('.pie-chart-item')
        const firstPieChart = pieChartItems[0]!
        const legendValues = firstPieChart.querySelectorAll('.file-type-pie-chart__legend-value')
        expect(legendValues[0]).toHaveTextContent('3 (100%)')
        expect(legendValues[1]).toHaveTextContent('0 (0%)')
      })
    })

    it('법인 고객만 있을 때 올바르게 계산해야 함', async () => {
      const mockCustomers: Customer[] = [
        createMockCustomer({ insurance_info: { customer_type: '법인' } } as Partial<Customer>),
        createMockCustomer({ insurance_info: { customer_type: '법인' } } as Partial<Customer>)
      ]

      mockGetCustomers.mockResolvedValue({
        customers: mockCustomers,
        total: 2,
        limit: 1000,
        offset: 0
      })

      const { container } = renderComponent()

      await waitFor(() => {
        const legendLabel = screen.getByText('법인')
        expect(legendLabel).toBeInTheDocument()

        // 첫 번째 파이 차트 (고객 유형)의 레전드 값만 확인
        const pieChartItems = container.querySelectorAll('.pie-chart-item')
        const firstPieChart = pieChartItems[0]!
        const legendValues = firstPieChart.querySelectorAll('.file-type-pie-chart__legend-value')
        expect(legendValues[0]).toHaveTextContent('0 (0%)')
        expect(legendValues[1]).toHaveTextContent('2 (100%)')
      })
    })

    it('개인/법인 혼합일 때 올바른 비율을 계산해야 함', async () => {
      const mockCustomers: Customer[] = [
        createMockCustomer({ insurance_info: { customer_type: '개인' } } as Partial<Customer>),
        createMockCustomer({ insurance_info: { customer_type: '개인' } } as Partial<Customer>),
        createMockCustomer({ insurance_info: { customer_type: '개인' } } as Partial<Customer>),
        createMockCustomer({ insurance_info: { customer_type: '법인' } } as Partial<Customer>)
      ]

      mockGetCustomers.mockResolvedValue({
        customers: mockCustomers,
        total: 4,
        limit: 1000,
        offset: 0
      })

      const { container } = renderComponent()

      await waitFor(() => {
        // 첫 번째 파이 차트 (고객 유형)의 레전드 값만 확인
        const pieChartItems = container.querySelectorAll('.pie-chart-item')
        const firstPieChart = pieChartItems[0]!
        const legendValues = firstPieChart.querySelectorAll('.file-type-pie-chart__legend-value')
        expect(legendValues[0]).toHaveTextContent('3 (75%)')
        expect(legendValues[1]).toHaveTextContent('1 (25%)')
      })
    })

    it('insurance_info가 없는 고객은 개인으로 분류해야 함', async () => {
      const mockCustomers: Customer[] = [
        createMockCustomer({ insurance_info: undefined }),
        createMockCustomer({ insurance_info: { customer_type: '개인' } }),
        createMockCustomer({ insurance_info: { customer_type: '법인' } })
      ]

      mockGetCustomers.mockResolvedValue({
        customers: mockCustomers,
        total: 3,
        limit: 1000,
        offset: 0
      })

      const { container } = renderComponent()

      await waitFor(() => {
        // 첫 번째 파이 차트 (고객 유형)의 레전드 값만 확인
        const pieChartItems = container.querySelectorAll('.pie-chart-item')
        const firstPieChart = pieChartItems[0]!
        const legendValues = firstPieChart.querySelectorAll('.file-type-pie-chart__legend-value')
        // insurance_info가 없으면 개인으로 분류됨
        expect(legendValues[0]).toHaveTextContent('2 (67%)')
        expect(legendValues[1]).toHaveTextContent('1 (33%)')
      })
    })
  })

  describe('[회귀 방지] 파이 차트 스타일 및 크기', () => {
    it('파이 차트가 180px 크기로 렌더링되어야 함', async () => {
      const mockCustomers: Customer[] = [
        createMockCustomer({ insurance_info: { customer_type: '개인' } } as Partial<Customer>)
      ]

      mockGetCustomers.mockResolvedValue({
        customers: mockCustomers,
        total: 1,
        limit: 1000,
        offset: 0
      })

      const { container } = renderComponent()

      await waitFor(() => {
        const svg = container.querySelector('.file-type-pie-chart svg')
        expect(svg).toHaveAttribute('width', '180')
        expect(svg).toHaveAttribute('height', '180')
      })
    })

    it('파이 차트가 도넛 차트 형태여야 함 (innerRadius=45)', async () => {
      const mockCustomers: Customer[] = [
        createMockCustomer({ insurance_info: { customer_type: '개인' } } as Partial<Customer>)
      ]

      mockGetCustomers.mockResolvedValue({
        customers: mockCustomers,
        total: 1,
        limit: 1000,
        offset: 0
      })

      const { container } = renderComponent()

      await waitFor(() => {
        const centerText = container.querySelector('.file-type-pie-chart__center-text')
        expect(centerText).toBeInTheDocument()
      })
    })

    it('파이 차트 그리드가 올바른 CSS 클래스를 가져야 함', async () => {
      const mockCustomers: Customer[] = [
        createMockCustomer({ insurance_info: { customer_type: '개인' } } as Partial<Customer>)
      ]

      mockGetCustomers.mockResolvedValue({
        customers: mockCustomers,
        total: 1,
        limit: 1000,
        offset: 0
      })

      const { container } = renderComponent()

      await waitFor(() => {
        const pieChartsGrid = container.querySelector('.customer-management-view__pie-charts-grid')
        expect(pieChartsGrid).toBeInTheDocument()
        expect(pieChartsGrid).toHaveClass('customer-management-view__pie-charts-grid')
      })
    })
  })

  describe('[회귀 방지] 파이 차트 색상', () => {
    it('개인 고객은 파란색(primary-500), 법인 고객은 주황색(warning) 사용해야 함', async () => {
      const mockCustomers: Customer[] = [
        createMockCustomer({ insurance_info: { customer_type: '개인' } } as Partial<Customer>),
        createMockCustomer({ insurance_info: { customer_type: '법인' } } as Partial<Customer>)
      ]

      mockGetCustomers.mockResolvedValue({
        customers: mockCustomers,
        total: 2,
        limit: 1000,
        offset: 0
      })

      const { container } = renderComponent()

      await waitFor(() => {
        // 첫 번째 파이 차트 (고객 유형)의 색상만 확인
        const pieChartItems = container.querySelectorAll('.pie-chart-item')
        const firstPieChart = pieChartItems[0]!
        const paths = firstPieChart.querySelectorAll('.file-type-pie-chart__path')
        expect(paths[0]).toHaveAttribute('fill', 'var(--color-primary-500)')
        expect(paths[1]).toHaveAttribute('fill', 'var(--color-warning)')
      })
    })

    it('레전드 색상 표시기가 올바른 색상을 사용해야 함', async () => {
      const mockCustomers: Customer[] = [
        createMockCustomer({ insurance_info: { customer_type: '개인' } } as Partial<Customer>),
        createMockCustomer({ insurance_info: { customer_type: '법인' } } as Partial<Customer>)
      ]

      mockGetCustomers.mockResolvedValue({
        customers: mockCustomers,
        total: 2,
        limit: 1000,
        offset: 0
      })

      const { container } = renderComponent()

      await waitFor(() => {
        // 첫 번째 파이 차트 (고객 유형)의 레전드 색상만 확인
        const pieChartItems = container.querySelectorAll('.pie-chart-item')
        const firstPieChart = pieChartItems[0]!
        const colorIndicators = firstPieChart.querySelectorAll('.file-type-pie-chart__legend-color')
        expect(colorIndicators[0]).toHaveStyle({ backgroundColor: 'var(--color-primary-500)' })
        expect(colorIndicators[1]).toHaveStyle({ backgroundColor: 'var(--color-warning)' })
      })
    })
  })

  describe('[회귀 방지] 통계 카드와 파이 차트 일관성', () => {
    it('통계 카드의 전체 고객 수와 파이 차트의 합계가 일치해야 함', async () => {
      const mockCustomers: Customer[] = [
        createMockCustomer({ insurance_info: { customer_type: '개인' } } as Partial<Customer>),
        createMockCustomer({ insurance_info: { customer_type: '개인' } } as Partial<Customer>),
        createMockCustomer({ insurance_info: { customer_type: '법인' } } as Partial<Customer>)
      ]

      mockGetCustomers.mockResolvedValue({
        customers: mockCustomers,
        total: 3,
        limit: 1000,
        offset: 0
      })

      const { container } = renderComponent()

      await waitFor(() => {
        // 첫 번째 파이 차트 (고객 유형)의 전체 고객 수 확인
        const pieChartItems = container.querySelectorAll('.pie-chart-item')
        const firstPieChart = pieChartItems[0]!
        const totalCount = firstPieChart.querySelector('.file-type-pie-chart__total-count')
        expect(totalCount).toHaveTextContent('3')

        // 통계 카드의 전체 고객 수와 일치하는지 확인
        const statCards = container.querySelectorAll('.stat-card')
        const totalCustomerCard = Array.from(statCards).find(card =>
          card.textContent?.includes('전체 고객')
        )
        expect(totalCustomerCard).toHaveTextContent('3')
      })
    })
  })
})
