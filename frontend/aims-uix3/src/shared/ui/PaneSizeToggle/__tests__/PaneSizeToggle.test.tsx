/**
 * PaneSizeToggle 컴포넌트 테스트
 * RightPane 크기 3단계(대/중/소) 세그먼트 컨트롤 검증
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaneSizeToggle, PANE_SIZE_PRESETS } from '../PaneSizeToggle'

describe('PaneSizeToggle', () => {
  const defaultProps = {
    currentCenterWidth: 50,
    onSizeChange: vi.fn(),
  }

  describe('렌더링', () => {
    it('대/중/소 3개 버튼이 렌더링되어야 함', () => {
      render(<PaneSizeToggle {...defaultProps} />)

      expect(screen.getByRole('button', { name: '패널 크기 대' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '패널 크기 중' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '패널 크기 소' })).toBeInTheDocument()
    })

    it('group role과 aria-label이 있어야 함', () => {
      render(<PaneSizeToggle {...defaultProps} />)

      expect(screen.getByRole('group', { name: '패널 크기 조절' })).toBeInTheDocument()
    })
  })

  describe('활성 상태 표시', () => {
    it('centerWidth=50이면 "대" 버튼이 활성화', () => {
      render(<PaneSizeToggle {...defaultProps} currentCenterWidth={50} />)

      const largeBtn = screen.getByRole('button', { name: '패널 크기 대' })
      expect(largeBtn).toHaveAttribute('aria-pressed', 'true')
      expect(largeBtn).toHaveClass('pane-size-toggle__btn--active')
    })

    it('centerWidth=65이면 "중" 버튼이 활성화', () => {
      render(<PaneSizeToggle {...defaultProps} currentCenterWidth={65} />)

      const mediumBtn = screen.getByRole('button', { name: '패널 크기 중' })
      expect(mediumBtn).toHaveAttribute('aria-pressed', 'true')
      expect(mediumBtn).toHaveClass('pane-size-toggle__btn--active')
    })

    it('centerWidth=80이면 "소" 버튼이 활성화', () => {
      render(<PaneSizeToggle {...defaultProps} currentCenterWidth={80} />)

      const smallBtn = screen.getByRole('button', { name: '패널 크기 소' })
      expect(smallBtn).toHaveAttribute('aria-pressed', 'true')
      expect(smallBtn).toHaveClass('pane-size-toggle__btn--active')
    })

    it('프리셋과 ±0.5 이내면 활성화 (드래그 오차 허용)', () => {
      render(<PaneSizeToggle {...defaultProps} currentCenterWidth={50.3} />)

      expect(screen.getByRole('button', { name: '패널 크기 대' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('프리셋과 불일치 시 모든 버튼 비활성 (BRB 드래그 후)', () => {
      render(<PaneSizeToggle {...defaultProps} currentCenterWidth={55} />)

      const buttons = screen.getAllByRole('button')
      buttons.forEach(btn => {
        expect(btn).toHaveAttribute('aria-pressed', 'false')
        expect(btn).not.toHaveClass('pane-size-toggle__btn--active')
      })
    })
  })

  describe('클릭 동작', () => {
    it('"대" 클릭 시 centerWidth=50 전달', async () => {
      const onSizeChange = vi.fn()
      render(<PaneSizeToggle currentCenterWidth={65} onSizeChange={onSizeChange} />)

      await userEvent.click(screen.getByRole('button', { name: '패널 크기 대' }))

      expect(onSizeChange).toHaveBeenCalledWith(PANE_SIZE_PRESETS.large)
      expect(onSizeChange).toHaveBeenCalledWith(50)
    })

    it('"중" 클릭 시 centerWidth=65 전달', async () => {
      const onSizeChange = vi.fn()
      render(<PaneSizeToggle currentCenterWidth={50} onSizeChange={onSizeChange} />)

      await userEvent.click(screen.getByRole('button', { name: '패널 크기 중' }))

      expect(onSizeChange).toHaveBeenCalledWith(PANE_SIZE_PRESETS.medium)
      expect(onSizeChange).toHaveBeenCalledWith(65)
    })

    it('"소" 클릭 시 centerWidth=80 전달', async () => {
      const onSizeChange = vi.fn()
      render(<PaneSizeToggle currentCenterWidth={50} onSizeChange={onSizeChange} />)

      await userEvent.click(screen.getByRole('button', { name: '패널 크기 소' }))

      expect(onSizeChange).toHaveBeenCalledWith(PANE_SIZE_PRESETS.small)
      expect(onSizeChange).toHaveBeenCalledWith(80)
    })
  })

  describe('프리셋 상수', () => {
    it('프리셋 값이 올바름', () => {
      expect(PANE_SIZE_PRESETS.large).toBe(50)
      expect(PANE_SIZE_PRESETS.medium).toBe(65)
      expect(PANE_SIZE_PRESETS.small).toBe(80)
    })
  })
})
