/**
 * DocumentActionIcons Component Tests
 * @since 1.0.0
 *
 * 아이콘 SVG 그라데이션 및 색상 개선 테스트
 * 커밋 18d6a8d: SummaryIcon 색상을 진한 빨강/주황으로 변경하여 라이트 테마 가시성 개선
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  EyeIcon,
  SummaryIcon,
  DocumentIcon,
  LinkIcon
} from '../DocumentActionIcons'

describe('DocumentActionIcons', () => {
  describe('EyeIcon', () => {
    it('파란색 톤의 그라데이션으로 렌더링되어야 함', () => {
      const { container } = render(<EyeIcon />)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()

      // 그라데이션 정의 확인
      const eyeGradient = container.querySelector('#eyeGradient')
      expect(eyeGradient).toBeInTheDocument()

      const irisGradient = container.querySelector('#irisGradient')
      expect(irisGradient).toBeInTheDocument()
    })

    it('기본 SVG 속성을 가져야 함', () => {
      const { container } = render(<EyeIcon />)
      const svg = container.querySelector('svg')

      expect(svg).toHaveAttribute('width', '16')
      expect(svg).toHaveAttribute('height', '16')
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
      expect(svg).toHaveAttribute('fill', 'none')
    })

    it('눈 외곽선과 홍채가 렌더링되어야 함', () => {
      const { container } = render(<EyeIcon />)
      const paths = container.querySelectorAll('path')
      const circles = container.querySelectorAll('circle')

      // 눈 외곽 path (2개: fill + stroke)
      expect(paths.length).toBeGreaterThanOrEqual(2)

      // 홍채와 동공 circle (3개: 홍채 fill + stroke, 동공)
      expect(circles.length).toBe(3)
    })
  })

  describe('SummaryIcon - 색상 개선 테스트 (커밋 18d6a8d)', () => {
    it('진한 오렌지-빨강 그라데이션으로 렌더링되어야 함', () => {
      const { container } = render(<SummaryIcon />)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()

      // 3개의 라인 그라데이션 확인
      const line1Gradient = container.querySelector('#line1Gradient')
      const line2Gradient = container.querySelector('#line2Gradient')
      const line3Gradient = container.querySelector('#line3Gradient')

      expect(line1Gradient).toBeInTheDocument()
      expect(line2Gradient).toBeInTheDocument()
      expect(line3Gradient).toBeInTheDocument()
    })

    it('라이트 테마 가시성을 위한 진한 색상을 사용해야 함', () => {
      const { container } = render(<SummaryIcon />)

      // line1Gradient: #ea580c, #dc2626, #c2410c, #9a3412
      const line1Gradient = container.querySelector('#line1Gradient')
      const stops = line1Gradient?.querySelectorAll('stop')

      expect(stops).toHaveLength(4)
      expect(stops?.[0]?.getAttribute('stop-color')).toBe('#ea580c')
      expect(stops?.[1]?.getAttribute('stop-color')).toBe('#dc2626')
      expect(stops?.[2]?.getAttribute('stop-color')).toBe('#c2410c')
      expect(stops?.[3]?.getAttribute('stop-color')).toBe('#9a3412')
    })

    it('글로우 효과 opacity가 0.5로 증가되어야 함', () => {
      const { container } = render(<SummaryIcon />)
      const paths = container.querySelectorAll('path')

      // 배경 글로우 path들 (opacity 0.5)
      const glowPaths = Array.from(paths).filter(path =>
        path.getAttribute('opacity') === '0.5'
      )

      // 첫 번째, 두 번째, 세 번째 라인의 배경 글로우
      expect(glowPaths.length).toBe(3)
    })

    it('불릿 포인트 글로우 opacity가 0.6으로 증가되어야 함', () => {
      const { container } = render(<SummaryIcon />)
      const circles = container.querySelectorAll('circle')

      // 외곽 글로우 circle들 (opacity 0.6)
      const glowCircles = Array.from(circles).filter(circle =>
        circle.getAttribute('opacity') === '0.6'
      )

      // 3개의 불릿 포인트 외곽 글로우
      expect(glowCircles.length).toBe(3)
    })

    it('3개의 불릿 포인트 그라데이션이 정의되어야 함', () => {
      const { container } = render(<SummaryIcon />)

      const bullet1Gradient = container.querySelector('#bullet1Gradient')
      const bullet2Gradient = container.querySelector('#bullet2Gradient')
      const bullet3Gradient = container.querySelector('#bullet3Gradient')

      expect(bullet1Gradient).toBeInTheDocument()
      expect(bullet2Gradient).toBeInTheDocument()
      expect(bullet3Gradient).toBeInTheDocument()
    })

    it('불릿 포인트가 진한 오렌지/빨강 색상을 사용해야 함', () => {
      const { container } = render(<SummaryIcon />)

      // bullet1Gradient: #fed7aa → #ea580c → #c2410c
      const bullet1Gradient = container.querySelector('#bullet1Gradient')
      const stops1 = bullet1Gradient?.querySelectorAll('stop')

      expect(stops1?.[1]?.getAttribute('stop-color')).toBe('#ea580c')
      expect(stops1?.[2]?.getAttribute('stop-color')).toBe('#c2410c')

      // bullet2Gradient: #fecaca → #dc2626 → #b91c1c
      const bullet2Gradient = container.querySelector('#bullet2Gradient')
      const stops2 = bullet2Gradient?.querySelectorAll('stop')

      expect(stops2?.[1]?.getAttribute('stop-color')).toBe('#dc2626')
      expect(stops2?.[2]?.getAttribute('stop-color')).toBe('#b91c1c')
    })

    it('3개의 리스트 라인을 렌더링해야 함', () => {
      const { container } = render(<SummaryIcon />)
      const paths = container.querySelectorAll('path')

      // 각 라인당 2개 path (배경 글로우 + 실제 라인) = 6개
      expect(paths.length).toBe(6)
    })

    it('9개의 circle (3개 불릿 × 3 레이어)을 렌더링해야 함', () => {
      const { container } = render(<SummaryIcon />)
      const circles = container.querySelectorAll('circle')

      // 각 불릿당 3개 circle (외곽 글로우 + 실제 불릿 + 하이라이트) = 9개
      expect(circles.length).toBe(9)
    })
  })

  describe('DocumentIcon', () => {
    it('보라색 톤의 그라데이션으로 렌더링되어야 함', () => {
      const { container } = render(<DocumentIcon />)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()

      const docGradient = container.querySelector('#docGradient')
      const foldGradient = container.querySelector('#foldGradient')

      expect(docGradient).toBeInTheDocument()
      expect(foldGradient).toBeInTheDocument()
    })

    it('문서 본체, 페이지 접힘, 텍스트 라인이 렌더링되어야 함', () => {
      const { container } = render(<DocumentIcon />)
      const paths = container.querySelectorAll('path')

      // 문서 본체 (2), 페이지 접힘 (2), 텍스트 라인 (2) = 6개
      expect(paths.length).toBe(6)
    })

    it('보라색 계열 색상을 사용해야 함', () => {
      const { container } = render(<DocumentIcon />)

      const docGradient = container.querySelector('#docGradient')
      const stops = docGradient?.querySelectorAll('stop')

      expect(stops?.[0]?.getAttribute('stop-color')).toBe('#a78bfa')
      expect(stops?.[1]?.getAttribute('stop-color')).toBe('#8b5cf6')
    })
  })

  describe('LinkIcon', () => {
    it('초록색 톤의 그라데이션으로 렌더링되어야 함', () => {
      const { container } = render(<LinkIcon />)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()

      const linkGradient = container.querySelector('#linkGradient')
      expect(linkGradient).toBeInTheDocument()
    })

    it('체인 링크 상단과 하단이 렌더링되어야 함', () => {
      const { container } = render(<LinkIcon />)
      const paths = container.querySelectorAll('path')

      // 상단 링크 (2), 하단 링크 (2) = 4개
      expect(paths.length).toBe(4)
    })

    it('초록색 계열 그라데이션을 사용해야 함', () => {
      const { container } = render(<LinkIcon />)

      const linkGradient = container.querySelector('#linkGradient')
      const stops = linkGradient?.querySelectorAll('stop')

      expect(stops?.[0]?.getAttribute('stop-color')).toBe('#34d399')
      expect(stops?.[1]?.getAttribute('stop-color')).toBe('#10b981')
      expect(stops?.[2]?.getAttribute('stop-color')).toBe('#059669')
    })
  })

  describe('공통 속성', () => {
    it('모든 아이콘이 16x16 크기를 가져야 함', () => {
      const icons = [
        <EyeIcon key="eye" />,
        <SummaryIcon key="summary" />,
        <DocumentIcon key="document" />,
        <LinkIcon key="link" />
      ]

      icons.forEach(icon => {
        const { container } = render(icon)
        const svg = container.querySelector('svg')

        expect(svg).toHaveAttribute('width', '16')
        expect(svg).toHaveAttribute('height', '16')
      })
    })

    it('모든 아이콘이 24x24 viewBox를 가져야 함', () => {
      const icons = [
        <EyeIcon key="eye" />,
        <SummaryIcon key="summary" />,
        <DocumentIcon key="document" />,
        <LinkIcon key="link" />
      ]

      icons.forEach(icon => {
        const { container } = render(icon)
        const svg = container.querySelector('svg')

        expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
      })
    })

    it('모든 아이콘이 fill="none"을 가져야 함', () => {
      const icons = [
        <EyeIcon key="eye" />,
        <SummaryIcon key="summary" />,
        <DocumentIcon key="document" />,
        <LinkIcon key="link" />
      ]

      icons.forEach(icon => {
        const { container } = render(icon)
        const svg = container.querySelector('svg')

        expect(svg).toHaveAttribute('fill', 'none')
      })
    })

    it('커스텀 props를 전달받을 수 있어야 함', () => {
      const { container } = render(<EyeIcon data-testid="custom-eye" />)
      const svg = container.querySelector('svg')

      expect(svg).toHaveAttribute('data-testid', 'custom-eye')
    })
  })

  describe('접근성', () => {
    it('SVG 아이콘이 decorative role로 사용 가능해야 함', () => {
      const { container } = render(<EyeIcon aria-hidden="true" />)
      const svg = container.querySelector('svg')

      expect(svg).toHaveAttribute('aria-hidden', 'true')
    })
  })

  describe('색상 대비 및 가시성', () => {
    it('SummaryIcon의 진한 색상이 라이트 테마에서 가시성을 보장해야 함', () => {
      const { container } = render(<SummaryIcon />)

      // 첫 번째 라인의 배경 글로우 색상 확인
      const paths = container.querySelectorAll('path')
      const glowPath = paths[0] // 첫 번째 글로우

      expect(glowPath).toHaveAttribute('stroke', '#ea580c')
      expect(glowPath).toHaveAttribute('opacity', '0.5')
    })

    it('모든 아이콘이 적절한 strokeWidth를 가져야 함', () => {
      const { container: eyeContainer } = render(<EyeIcon />)
      const eyePaths = eyeContainer.querySelectorAll('path')
      expect(eyePaths[1]?.getAttribute('stroke-width')).toBe('1.5')

      const { container: summaryContainer } = render(<SummaryIcon />)
      const summaryPaths = summaryContainer.querySelectorAll('path')
      expect(summaryPaths[1]?.getAttribute('stroke-width')).toBe('1.5')

      const { container: docContainer } = render(<DocumentIcon />)
      const docPaths = docContainer.querySelectorAll('path')
      expect(docPaths[1]?.getAttribute('stroke-width')).toBe('1.5')

      const { container: linkContainer } = render(<LinkIcon />)
      const linkPaths = linkContainer.querySelectorAll('path')
      expect(linkPaths[1]?.getAttribute('stroke-width')).toBe('1.5')
    })
  })
})
