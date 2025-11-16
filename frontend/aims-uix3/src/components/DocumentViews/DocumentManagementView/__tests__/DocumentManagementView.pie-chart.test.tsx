/**
 * DocumentManagementView - Pie Chart Regression Tests
 * @since 2025-11-16
 * @commit 18b2ec8e
 *
 * 문서 관리 대시보드 TXT/OCR/BIN 파일 타입 비율 파이 차트 기능 회귀 방지 테스트
 *
 * 테스트 범위:
 * - TXT/OCR/BIN 파일 타입 통계 계산
 * - 파이 차트 렌더링
 * - 데이터 없을 때 처리
 * - 파이 차트 크기 및 스타일
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentManagementView } from '../DocumentManagementView'
import * as DocumentService from '@/services/DocumentService'

// Mock DocumentService
vi.mock('@/services/DocumentService', () => ({
  getDocumentStatistics: vi.fn(),
  DocumentService: {
    fetchAllDocuments: vi.fn()
  }
}))

// Mock DocumentStatusService
vi.mock('@/services/DocumentStatusService', () => ({
  DocumentStatusService: {
    getAllDocuments: vi.fn().mockResolvedValue({ documents: [] })
  }
}))

const mockGetDocumentStatistics = DocumentService.getDocumentStatistics as ReturnType<typeof vi.fn>

const createMockStats = (badgeTypes: { TXT?: number; OCR?: number; BIN?: number }) => {
  const total = (badgeTypes.TXT || 0) + (badgeTypes.OCR || 0) + (badgeTypes.BIN || 0)
  return {
    total,
    completed: total,
    processing: 0,
    error: 0,
    pending: 0,
    completed_with_skip: 0,
    stages: {
      upload: total,
      meta: total,
      ocr_prep: badgeTypes.OCR || 0,
      ocr: badgeTypes.OCR || 0,
      docembed: total
    },
    badgeTypes: {
      TXT: badgeTypes.TXT || 0,
      OCR: badgeTypes.OCR || 0,
      BIN: badgeTypes.BIN || 0
    }
  }
}

describe('DocumentManagementView - Pie Chart (커밋 18b2ec8e)', () => {
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
        <DocumentManagementView
          visible={true}
          onClose={() => {}}
          {...props}
        />
      </QueryClientProvider>
    )
  }

  describe('[회귀 방지] 파이 차트 렌더링', () => {
    it('문서 통계 데이터가 있으면 파이 차트를 렌더링해야 함', async () => {
      mockGetDocumentStatistics.mockResolvedValue(createMockStats({
        TXT: 3,
        OCR: 5,
        BIN: 2
      }))

      const { container } = renderComponent()

      await waitFor(() => {
        const pieChartsGrid = container.querySelector('.document-management-view__pie-charts-grid')
        expect(pieChartsGrid).toBeInTheDocument()
      })
    })

    it('문서 통계가 0이면 파이 차트를 렌더링하지 않아야 함', async () => {
      mockGetDocumentStatistics.mockResolvedValue(createMockStats({
        TXT: 0,
        OCR: 0,
        BIN: 0
      }))

      const { container } = renderComponent()

      await waitFor(() => {
        const statsCards = container.querySelectorAll('.stat-card')
        expect(statsCards.length).toBeGreaterThan(0) // 통계 카드는 렌더링됨
      })

      const pieChartsGrid = container.querySelector('.document-management-view__pie-charts-grid')
      expect(pieChartsGrid).not.toBeInTheDocument()
    })

    it('파이 차트가 FileTypePieChart 컴포넌트를 사용해야 함', async () => {
      mockGetDocumentStatistics.mockResolvedValue(createMockStats({
        TXT: 3,
        OCR: 5,
        BIN: 2
      }))

      const { container } = renderComponent()

      await waitFor(() => {
        const pieChartSvg = container.querySelector('.file-type-pie-chart svg')
        expect(pieChartSvg).toBeInTheDocument()
        expect(pieChartSvg).toHaveAttribute('role', 'img')
      })
    })
  })

  describe('[회귀 방지] TXT/OCR/BIN 통계 계산', () => {
    it('TXT 파일만 있을 때 올바르게 계산해야 함', async () => {
      mockGetDocumentStatistics.mockResolvedValue(createMockStats({
        TXT: 5,
        OCR: 0,
        BIN: 0
      }))

      const { container } = renderComponent()

      await waitFor(() => {
        const legendLabel = screen.getByText('TXT')
        expect(legendLabel).toBeInTheDocument()

        const legendValues = container.querySelectorAll('.file-type-pie-chart__legend-value')
        expect(legendValues[0]).toHaveTextContent('5 (100.00%)')
        expect(legendValues[1]).toHaveTextContent('0 (0.00%)')
        expect(legendValues[2]).toHaveTextContent('0 (0.00%)')
      })
    })

    it('OCR 파일만 있을 때 올바르게 계산해야 함', async () => {
      mockGetDocumentStatistics.mockResolvedValue(createMockStats({
        TXT: 0,
        OCR: 8,
        BIN: 0
      }))

      const { container } = renderComponent()

      await waitFor(() => {
        const legendLabel = screen.getByText('OCR')
        expect(legendLabel).toBeInTheDocument()

        const legendValues = container.querySelectorAll('.file-type-pie-chart__legend-value')
        expect(legendValues[0]).toHaveTextContent('0 (0.00%)')
        expect(legendValues[1]).toHaveTextContent('8 (100.00%)')
        expect(legendValues[2]).toHaveTextContent('0 (0.00%)')
      })
    })

    it('BIN 파일만 있을 때 올바르게 계산해야 함', async () => {
      mockGetDocumentStatistics.mockResolvedValue(createMockStats({
        TXT: 0,
        OCR: 0,
        BIN: 3
      }))

      const { container } = renderComponent()

      await waitFor(() => {
        const legendLabel = screen.getByText('BIN')
        expect(legendLabel).toBeInTheDocument()

        const legendValues = container.querySelectorAll('.file-type-pie-chart__legend-value')
        expect(legendValues[0]).toHaveTextContent('0 (0.00%)')
        expect(legendValues[1]).toHaveTextContent('0 (0.00%)')
        expect(legendValues[2]).toHaveTextContent('3 (100.00%)')
      })
    })

    it('TXT/OCR/BIN 혼합일 때 올바른 비율을 계산해야 함', async () => {
      mockGetDocumentStatistics.mockResolvedValue(createMockStats({
        TXT: 10,  // 50%
        OCR: 8,   // 40%
        BIN: 2    // 10%
      }))

      const { container } = renderComponent()

      await waitFor(() => {
        const legendValues = container.querySelectorAll('.file-type-pie-chart__legend-value')
        expect(legendValues[0]).toHaveTextContent('10 (50.00%)')
        expect(legendValues[1]).toHaveTextContent('8 (40.00%)')
        expect(legendValues[2]).toHaveTextContent('2 (10.00%)')
      })
    })
  })

  describe('[회귀 방지] 파이 차트 스타일 및 크기', () => {
    it('파이 차트가 180px 크기로 렌더링되어야 함', async () => {
      mockGetDocumentStatistics.mockResolvedValue(createMockStats({
        TXT: 3,
        OCR: 5,
        BIN: 2
      }))

      const { container } = renderComponent()

      await waitFor(() => {
        const svg = container.querySelector('.file-type-pie-chart svg')
        expect(svg).toHaveAttribute('width', '180')
        expect(svg).toHaveAttribute('height', '180')
      })
    })

    it('파이 차트가 도넛 차트 형태여야 함 (innerRadius=45)', async () => {
      mockGetDocumentStatistics.mockResolvedValue(createMockStats({
        TXT: 3,
        OCR: 5,
        BIN: 2
      }))

      const { container } = renderComponent()

      await waitFor(() => {
        const centerText = container.querySelector('.file-type-pie-chart__center-text')
        expect(centerText).toBeInTheDocument()
      })
    })

    it('파이 차트 그리드가 올바른 CSS 클래스를 가져야 함', async () => {
      mockGetDocumentStatistics.mockResolvedValue(createMockStats({
        TXT: 3,
        OCR: 5,
        BIN: 2
      }))

      const { container } = renderComponent()

      await waitFor(() => {
        const pieChartsGrid = container.querySelector('.document-management-view__pie-charts-grid')
        expect(pieChartsGrid).toBeInTheDocument()
        expect(pieChartsGrid).toHaveClass('document-management-view__pie-charts-grid')
      })
    })
  })

  describe('[회귀 방지] 파이 차트 색상 (커밋 18b2ec8e)', () => {
    it('TXT는 녹색(success), OCR은 파란색(primary-500), BIN은 회색(neutral-600) 사용해야 함', async () => {
      mockGetDocumentStatistics.mockResolvedValue(createMockStats({
        TXT: 3,
        OCR: 5,
        BIN: 2
      }))

      const { container } = renderComponent()

      await waitFor(() => {
        const paths = container.querySelectorAll('.file-type-pie-chart__path')
        expect(paths[0]).toHaveAttribute('fill', 'var(--color-success)')
        expect(paths[1]).toHaveAttribute('fill', 'var(--color-primary-500)')
        expect(paths[2]).toHaveAttribute('fill', 'var(--color-neutral-600)')
      })
    })

    it('레전드 색상 표시기가 올바른 색상을 사용해야 함', async () => {
      mockGetDocumentStatistics.mockResolvedValue(createMockStats({
        TXT: 3,
        OCR: 5,
        BIN: 2
      }))

      const { container } = renderComponent()

      await waitFor(() => {
        const colorIndicators = container.querySelectorAll('.file-type-pie-chart__legend-color')
        expect(colorIndicators[0]).toHaveStyle({ backgroundColor: 'var(--color-success)' })
        expect(colorIndicators[1]).toHaveStyle({ backgroundColor: 'var(--color-primary-500)' })
        expect(colorIndicators[2]).toHaveStyle({ backgroundColor: 'var(--color-neutral-600)' })
      })
    })
  })

  describe('[회귀 방지] 통계 카드와 파이 차트 일관성', () => {
    it('통계 카드의 전체 문서 수와 파이 차트의 합계가 일치해야 함', async () => {
      mockGetDocumentStatistics.mockResolvedValue(createMockStats({
        TXT: 7,
        OCR: 6,
        BIN: 2
      }))

      const { container } = renderComponent()

      await waitFor(() => {
        // 파이 차트 중앙 텍스트 확인
        const totalCount = container.querySelector('.file-type-pie-chart__total-count')
        expect(totalCount).toHaveTextContent('15')

        // 통계 카드의 전체 문서 수와 일치하는지 확인
        const statCards = container.querySelectorAll('.stat-card')
        const totalDocumentCard = Array.from(statCards).find(card =>
          card.textContent?.includes('전체 문서')
        )
        expect(totalDocumentCard).toHaveTextContent('15')
      })
    })

    it('OCR 완료 통계 카드와 파이 차트 OCR 개수가 일치해야 함', async () => {
      mockGetDocumentStatistics.mockResolvedValue(createMockStats({
        TXT: 5,
        OCR: 12,
        BIN: 3
      }))

      const { container } = renderComponent()

      await waitFor(() => {
        // 파이 차트 OCR 개수
        const legendValues = container.querySelectorAll('.file-type-pie-chart__legend-value')
        expect(legendValues[1]).toHaveTextContent('12')

        // 통계 카드 OCR 완료 수
        const statCards = container.querySelectorAll('.stat-card')
        const ocrCompletedCard = Array.from(statCards).find(card =>
          card.textContent?.includes('OCR 완료')
        )
        expect(ocrCompletedCard).toHaveTextContent('12')
      })
    })
  })
})
