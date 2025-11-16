/**
 * FileTypePieChart Unit Tests
 * @since 2025-11-16
 *
 * 파이 차트 컴포넌트의 렌더링, 데이터 표시, 툴팁 등을 테스트
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FileTypePieChart } from '../FileTypePieChart'
import type { FileTypeData } from '../FileTypePieChart'

describe('FileTypePieChart', () => {
  describe('기본 렌더링', () => {
    it('데이터가 주어지면 파이 차트를 렌더링해야 함', () => {
      const data: FileTypeData[] = [
        { label: 'TXT', count: 100, color: 'var(--color-success)' },
        { label: 'OCR', count: 50, color: 'var(--color-primary-500)' },
        { label: 'BIN', count: 10, color: 'var(--color-neutral-600)' }
      ]

      const { container } = render(<FileTypePieChart data={data} size={200} />)

      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
      expect(svg).toHaveAttribute('role', 'img')
      expect(svg).toHaveAttribute('aria-label', '파일 타입별 비율 차트')
    })

    it('레전드가 모든 데이터 항목을 표시해야 함', () => {
      const data: FileTypeData[] = [
        { label: 'TXT', count: 100, color: 'var(--color-success)' },
        { label: 'OCR', count: 50, color: 'var(--color-primary-500)' },
        { label: 'BIN', count: 10, color: 'var(--color-neutral-600)' }
      ]

      render(<FileTypePieChart data={data} />)

      expect(screen.getByText('TXT')).toBeInTheDocument()
      expect(screen.getByText('OCR')).toBeInTheDocument()
      expect(screen.getByText('BIN')).toBeInTheDocument()
    })

    it('각 레전드 항목에 개수와 백분율을 표시해야 함', () => {
      const data: FileTypeData[] = [
        { label: 'TXT', count: 80, color: 'var(--color-success)' },
        { label: 'OCR', count: 20, color: 'var(--color-primary-500)' }
      ]

      const { container } = render(<FileTypePieChart data={data} />)

      const legendValues = container.querySelectorAll('.file-type-pie-chart__legend-value')
      expect(legendValues[0]).toHaveTextContent('80 (80.00%)')
      expect(legendValues[1]).toHaveTextContent('20 (20.00%)')
    })
  })

  describe('도넛 차트 모드', () => {
    it('innerRadius가 주어지면 중앙 텍스트를 표시해야 함', () => {
      const data: FileTypeData[] = [
        { label: 'TXT', count: 100, color: 'var(--color-success)' },
        { label: 'OCR', count: 50, color: 'var(--color-primary-500)' }
      ]

      const { container } = render(
        <FileTypePieChart data={data} innerRadius={50} />
      )

      const centerText = container.querySelector('.file-type-pie-chart__center-text')
      expect(centerText).toBeInTheDocument()
    })

    it('중앙 텍스트에 전체 개수를 표시해야 함', () => {
      const data: FileTypeData[] = [
        { label: 'TXT', count: 100, color: 'var(--color-success)' },
        { label: 'OCR', count: 50, color: 'var(--color-primary-500)' }
      ]

      const { container } = render(
        <FileTypePieChart data={data} innerRadius={50} />
      )

      const totalLabel = container.querySelector('.file-type-pie-chart__total-label')
      const totalCount = container.querySelector('.file-type-pie-chart__total-count')

      expect(totalLabel).toHaveTextContent('전체')
      expect(totalCount).toHaveTextContent('150')
    })

    it('innerRadius가 0이면 중앙 텍스트를 표시하지 않아야 함', () => {
      const data: FileTypeData[] = [
        { label: 'TXT', count: 100, color: 'var(--color-success)' }
      ]

      const { container } = render(
        <FileTypePieChart data={data} innerRadius={0} />
      )

      const centerText = container.querySelector('.file-type-pie-chart__center-text')
      expect(centerText).not.toBeInTheDocument()
    })
  })

  describe('크기 조정', () => {
    it('size prop에 따라 SVG 크기가 설정되어야 함', () => {
      const data: FileTypeData[] = [
        { label: 'TXT', count: 100, color: 'var(--color-success)' }
      ]

      const { container } = render(<FileTypePieChart data={data} size={300} />)

      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('width', '300')
      expect(svg).toHaveAttribute('height', '300')
      expect(svg).toHaveAttribute('viewBox', '0 0 300 300')
    })

    it('기본 크기는 200px이어야 함', () => {
      const data: FileTypeData[] = [
        { label: 'TXT', count: 100, color: 'var(--color-success)' }
      ]

      const { container } = render(<FileTypePieChart data={data} />)

      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('width', '200')
      expect(svg).toHaveAttribute('height', '200')
    })
  })

  describe('백분율 계산', () => {
    it('정확한 백분율을 계산해야 함', () => {
      const data: FileTypeData[] = [
        { label: 'TXT', count: 75, color: 'var(--color-success)' },
        { label: 'OCR', count: 25, color: 'var(--color-primary-500)' }
      ]

      const { container } = render(<FileTypePieChart data={data} />)

      const legendValues = container.querySelectorAll('.file-type-pie-chart__legend-value')
      expect(legendValues[0]).toHaveTextContent('75 (75.00%)')
      expect(legendValues[1]).toHaveTextContent('25 (25.00%)')
    })

    it('소수점 백분율을 올바르게 반올림해야 함', () => {
      const data: FileTypeData[] = [
        { label: 'A', count: 33, color: 'var(--color-success)' },
        { label: 'B', count: 33, color: 'var(--color-primary-500)' },
        { label: 'C', count: 34, color: 'var(--color-neutral-600)' }
      ]

      const { container } = render(<FileTypePieChart data={data} />)

      const legendValues = container.querySelectorAll('.file-type-pie-chart__legend-value')
      expect(legendValues[0]).toHaveTextContent('33 (33.00%)')
      expect(legendValues[1]).toHaveTextContent('33 (33.00%)')
      expect(legendValues[2]).toHaveTextContent('34 (34.00%)')
    })
  })

  describe('엣지 케이스', () => {
    it('데이터가 1개만 있어도 렌더링해야 함', () => {
      const data: FileTypeData[] = [
        { label: 'TXT', count: 100, color: 'var(--color-success)' }
      ]

      const { container } = render(<FileTypePieChart data={data} />)

      expect(screen.getByText('TXT')).toBeInTheDocument()
      const legendValue = container.querySelector('.file-type-pie-chart__legend-value')
      expect(legendValue).toHaveTextContent('100 (100.00%)')
    })

    it('개수가 0인 항목도 표시해야 함', () => {
      const data: FileTypeData[] = [
        { label: 'TXT', count: 100, color: 'var(--color-success)' },
        { label: 'OCR', count: 0, color: 'var(--color-primary-500)' }
      ]

      const { container } = render(<FileTypePieChart data={data} />)

      expect(screen.getByText('OCR')).toBeInTheDocument()
      const legendValues = container.querySelectorAll('.file-type-pie-chart__legend-value')
      expect(legendValues[1]).toHaveTextContent('0 (0.00%)')
    })

    it('모든 항목의 개수가 0이면 0% 표시해야 함', () => {
      const data: FileTypeData[] = [
        { label: 'TXT', count: 0, color: 'var(--color-success)' },
        { label: 'OCR', count: 0, color: 'var(--color-primary-500)' }
      ]

      const { container } = render(
        <FileTypePieChart data={data} innerRadius={50} />
      )

      const totalCount = container.querySelector('.file-type-pie-chart__total-count')
      expect(totalCount).toHaveTextContent('0')
    })
  })

  describe('색상 시스템', () => {
    it('각 조각에 올바른 색상을 적용해야 함', () => {
      const data: FileTypeData[] = [
        { label: 'TXT', count: 100, color: 'var(--color-success)' },
        { label: 'OCR', count: 50, color: 'var(--color-primary-500)' }
      ]

      const { container } = render(<FileTypePieChart data={data} />)

      const paths = container.querySelectorAll('.file-type-pie-chart__path')
      expect(paths[0]).toHaveAttribute('fill', 'var(--color-success)')
      expect(paths[1]).toHaveAttribute('fill', 'var(--color-primary-500)')
    })

    it('레전드 색상 표시기에 올바른 색상을 적용해야 함', () => {
      const data: FileTypeData[] = [
        { label: 'TXT', count: 100, color: 'var(--color-success)' }
      ]

      const { container } = render(<FileTypePieChart data={data} />)

      const colorIndicator = container.querySelector('.file-type-pie-chart__legend-color')
      expect(colorIndicator).toHaveStyle({ backgroundColor: 'var(--color-success)' })
    })
  })

  describe('접근성', () => {
    it('각 조각에 title 요소로 툴팁을 제공해야 함', () => {
      const data: FileTypeData[] = [
        { label: 'TXT', count: 80, color: 'var(--color-success)' },
        { label: 'OCR', count: 20, color: 'var(--color-primary-500)' }
      ]

      const { container } = render(<FileTypePieChart data={data} />)

      const titles = container.querySelectorAll('title')
      // 각 조각마다 title이 있어야 함
      expect(titles.length).toBeGreaterThanOrEqual(2)

      // title 내용 확인
      const titleTexts = Array.from(titles).map(t => t.textContent)
      expect(titleTexts.some(t => t?.includes('TXT') && t?.includes('80'))).toBe(true)
      expect(titleTexts.some(t => t?.includes('OCR') && t?.includes('20'))).toBe(true)
    })

    it('SVG에 aria-label이 있어야 함', () => {
      const data: FileTypeData[] = [
        { label: 'TXT', count: 100, color: 'var(--color-success)' }
      ]

      const { container } = render(<FileTypePieChart data={data} />)

      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('aria-label')
    })
  })
})
