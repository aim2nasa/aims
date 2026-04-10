/**
 * Button 컴포넌트 테스트
 * 접근성을 준수하는 다양한 스타일의 버튼 컴포넌트 검증
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Button from '../Button'

describe('Button', () => {
  describe('기본 렌더링', () => {
    it('버튼이 렌더링되어야 함', () => {
      render(<Button>클릭</Button>)

      expect(screen.getByRole('button', { name: '클릭' })).toBeInTheDocument()
    })

    it('children prop이 렌더링되어야 함', () => {
      render(<Button>버튼 텍스트</Button>)

      expect(screen.getByText('버튼 텍스트')).toBeInTheDocument()
    })
  })

  describe('variant prop', () => {
    it('primary variant 적용', () => {
      render(<Button variant="primary">Primary</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('button--primary')
    })

    it('secondary variant 적용', () => {
      render(<Button variant="secondary">Secondary</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('button--secondary')
    })

    it('ghost variant 적용', () => {
      render(<Button variant="ghost">Ghost</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('button--ghost')
    })

    it('destructive variant 적용', () => {
      render(<Button variant="destructive">Delete</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('button--destructive')
    })

    it('link variant 적용', () => {
      render(<Button variant="link">Link</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('button--link')
    })
  })

  describe('size prop', () => {
    it('small 크기 적용', () => {
      render(<Button size="sm">Small</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('button--sm')
    })

    it('medium 크기 적용', () => {
      render(<Button size="md">Medium</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('button--md')
    })

    it('large 크기 적용', () => {
      render(<Button size="lg">Large</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('button--lg')
    })

    // 이슈 #56: default size가 sm으로 변경됨
    it('size 미지정 시 기본값은 sm', () => {
      render(<Button>Default Size</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('button--sm')
      expect(button).not.toHaveClass('button--md')
      expect(button).not.toHaveClass('button--lg')
    })
  })

  describe('loading prop', () => {
    it('loading 상태에서 버튼 비활성화', () => {
      render(<Button loading>Loading</Button>)

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })

    it('loading 상태에서 로딩 스피너 표시', () => {
      render(<Button loading>Loading</Button>)

      expect(screen.getByRole('img', { name: '로딩 중' })).toBeInTheDocument()
    })

    it('loading=false일 때 로딩 스피너 없음', () => {
      render(<Button loading={false}>Not Loading</Button>)

      expect(screen.queryByRole('img', { name: '로딩 중' })).not.toBeInTheDocument()
    })
  })

  describe('fullWidth prop', () => {
    it('fullWidth 적용 시 전체 너비 클래스', () => {
      render(<Button fullWidth>Full Width</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('button--full-width')
    })

    it('fullWidth=false일 때 기본 너비', () => {
      render(<Button fullWidth={false}>Normal Width</Button>)

      const button = screen.getByRole('button')
      expect(button).not.toHaveClass('button--full-width')
    })
  })

  describe('아이콘', () => {
    it('leftIcon 렌더링', () => {
      const LeftIcon = () => <span data-testid="left-icon">←</span>

      render(
        <Button leftIcon={<LeftIcon />}>
          With Left Icon
        </Button>
      )

      expect(screen.getByTestId('left-icon')).toBeInTheDocument()
      expect(screen.getByText('With Left Icon')).toBeInTheDocument()
    })

    it('rightIcon 렌더링', () => {
      const RightIcon = () => <span data-testid="right-icon">→</span>

      render(
        <Button rightIcon={<RightIcon />}>
          With Right Icon
        </Button>
      )

      expect(screen.getByTestId('right-icon')).toBeInTheDocument()
      expect(screen.getByText('With Right Icon')).toBeInTheDocument()
    })

    it('양쪽 아이콘 동시 렌더링', () => {
      const LeftIcon = () => <span data-testid="left-icon">←</span>
      const RightIcon = () => <span data-testid="right-icon">→</span>

      render(
        <Button leftIcon={<LeftIcon />} rightIcon={<RightIcon />}>
          Both Icons
        </Button>
      )

      expect(screen.getByTestId('left-icon')).toBeInTheDocument()
      expect(screen.getByTestId('right-icon')).toBeInTheDocument()
    })
  })

  describe('이벤트 핸들러', () => {
    it('onClick 핸들러 호출', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()

      render(<Button onClick={handleClick}>Click Me</Button>)

      await user.click(screen.getByRole('button'))

      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('disabled 상태에서 onClick 호출 안 됨', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()

      render(
        <Button onClick={handleClick} disabled>
          Disabled
        </Button>
      )

      await user.click(screen.getByRole('button'))

      expect(handleClick).not.toHaveBeenCalled()
    })

    it('loading 상태에서 onClick 호출 안 됨', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()

      render(
        <Button onClick={handleClick} loading>
          Loading
        </Button>
      )

      await user.click(screen.getByRole('button'))

      expect(handleClick).not.toHaveBeenCalled()
    })
  })

  describe('HTML 속성', () => {
    it('type 속성 적용', () => {
      render(<Button type="submit">Submit</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('type', 'submit')
    })

    it('disabled 속성 적용', () => {
      render(<Button disabled>Disabled</Button>)

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })

    it('aria-label 속성 적용', () => {
      render(<Button aria-label="닫기 버튼">X</Button>)

      const button = screen.getByRole('button', { name: '닫기 버튼' })
      expect(button).toBeInTheDocument()
    })

    it('className prop 적용', () => {
      render(<Button className="custom-class">Custom</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('custom-class')
    })
  })

  describe('조합 테스트', () => {
    it('primary + large + fullWidth', () => {
      render(
        <Button variant="primary" size="lg" fullWidth>
          Large Primary Full Width
        </Button>
      )

      const button = screen.getByRole('button')
      expect(button).toHaveClass('button--primary')
      expect(button).toHaveClass('button--lg')
      expect(button).toHaveClass('button--full-width')
    })

    it('destructive + loading + leftIcon', () => {
      const Icon = () => <span data-testid="icon">🗑️</span>

      render(
        <Button variant="destructive" loading leftIcon={<Icon />}>
          Delete
        </Button>
      )

      const button = screen.getByRole('button')
      expect(button).toHaveClass('button--destructive')
      expect(button).toBeDisabled()
      expect(screen.getByRole('img', { name: '로딩 중' })).toBeInTheDocument()
    })
  })

  describe('접근성', () => {
    it('button 역할을 가져야 함', () => {
      render(<Button>Accessible</Button>)

      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('키보드 포커스 가능해야 함', () => {
      render(<Button>Focus Me</Button>)

      const button = screen.getByRole('button')
      button.focus()

      expect(button).toHaveFocus()
    })

    it('disabled 상태에서 포커스 불가', () => {
      render(<Button disabled>No Focus</Button>)

      const button = screen.getByRole('button')
      button.focus()

      // disabled 버튼은 포커스 받지 않음
      expect(button).not.toHaveFocus()
    })
  })
})
