/**
 * Input 컴포넌트 테스트
 * iOS Settings 스타일 입력 필드 컴포넌트 검증
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input } from '../Input'

describe('Input', () => {
  describe('기본 렌더링', () => {
    it('input 요소가 렌더링되어야 함', () => {
      render(<Input />)

      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('placeholder가 표시되어야 함', () => {
      render(<Input placeholder="이름을 입력하세요" />)

      expect(screen.getByPlaceholderText('이름을 입력하세요')).toBeInTheDocument()
    })
  })

  describe('type prop', () => {
    it('text 타입 (기본값)', () => {
      render(<Input type="text" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('type', 'text')
    })

    it('email 타입', () => {
      render(<Input type="email" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('type', 'email')
    })

    it('password 타입', () => {
      render(<Input type="password" />)

      const input = document.querySelector('input[type="password"]')
      expect(input).toBeInTheDocument()
    })

    it('tel 타입', () => {
      render(<Input type="tel" />)

      const input = document.querySelector('input[type="tel"]')
      expect(input).toBeInTheDocument()
    })

    it('number 타입', () => {
      render(<Input type="number" />)

      const input = screen.getByRole('spinbutton')
      expect(input).toBeInTheDocument()
    })
  })

  describe('error prop', () => {
    it('에러 상태 적용', () => {
      render(<Input error />)

      const wrapper = screen.getByRole('textbox').closest('.input-wrapper')
      expect(wrapper).toHaveClass('input-wrapper--error')
    })

    it('에러 메시지 표시', () => {
      render(<Input error errorMessage="잘못된 입력입니다" />)

      expect(screen.getByText('잘못된 입력입니다')).toBeInTheDocument()
    })

    it('에러 상태 없으면 메시지 미표시', () => {
      render(<Input errorMessage="에러 메시지" />)

      expect(screen.queryByText('에러 메시지')).not.toBeInTheDocument()
    })
  })

  describe('disabled prop', () => {
    it('disabled 상태 적용', () => {
      render(<Input disabled />)

      const input = screen.getByRole('textbox')
      expect(input).toBeDisabled()
    })

    it('disabled 클래스 적용', () => {
      render(<Input disabled />)

      const wrapper = screen.getByRole('textbox').closest('.input-wrapper')
      expect(wrapper).toHaveClass('input-wrapper--disabled')
    })
  })

  describe('fullWidth prop', () => {
    it('fullWidth 클래스 적용', () => {
      render(<Input fullWidth />)

      const wrapper = screen.getByRole('textbox').closest('.input-wrapper')
      expect(wrapper).toHaveClass('input-wrapper--full-width')
    })
  })

  describe('아이콘', () => {
    it('leftIcon 렌더링', () => {
      const LeftIcon = () => <span data-testid="left-icon">🔍</span>

      render(<Input leftIcon={<LeftIcon />} />)

      expect(screen.getByTestId('left-icon')).toBeInTheDocument()
    })

    it('rightIcon 렌더링', () => {
      const RightIcon = () => <span data-testid="right-icon">✓</span>

      render(<Input rightIcon={<RightIcon />} />)

      expect(screen.getByTestId('right-icon')).toBeInTheDocument()
    })

    it('양쪽 아이콘 동시 렌더링', () => {
      const LeftIcon = () => <span data-testid="left-icon">🔍</span>
      const RightIcon = () => <span data-testid="right-icon">✓</span>

      render(<Input leftIcon={<LeftIcon />} rightIcon={<RightIcon />} />)

      expect(screen.getByTestId('left-icon')).toBeInTheDocument()
      expect(screen.getByTestId('right-icon')).toBeInTheDocument()
    })

    it('leftIcon 있을 때 클래스 적용', () => {
      const LeftIcon = () => <span>🔍</span>

      render(<Input leftIcon={<LeftIcon />} />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveClass('input--with-left-icon')
    })
  })

  describe('사용자 입력', () => {
    it('텍스트 입력 가능', async () => {
      const user = userEvent.setup()

      render(<Input />)

      const input = screen.getByRole('textbox')
      await user.type(input, 'Hello World')

      expect(input).toHaveValue('Hello World')
    })

    it('onChange 핸들러 호출', async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()

      render(<Input onChange={handleChange} />)

      const input = screen.getByRole('textbox')
      await user.type(input, 'A')

      expect(handleChange).toHaveBeenCalled()
    })

    it('disabled 상태에서 입력 불가', async () => {
      const user = userEvent.setup()

      render(<Input disabled />)

      const input = screen.getByRole('textbox')
      await user.type(input, 'Test')

      expect(input).toHaveValue('')
    })
  })

  describe('HTML 속성', () => {
    it('value 속성 적용', () => {
      render(<Input value="초기값" readOnly />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('초기값')
    })

    it('maxLength 속성 적용', () => {
      render(<Input maxLength={10} />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('maxLength', '10')
    })

    it('required 속성 적용', () => {
      render(<Input required />)

      const input = screen.getByRole('textbox')
      expect(input).toBeRequired()
    })

    it('aria-label 속성 적용', () => {
      render(<Input aria-label="이름 입력" />)

      expect(screen.getByLabelText('이름 입력')).toBeInTheDocument()
    })

    it('className prop 적용', () => {
      render(<Input className="custom-input" />)

      const wrapper = screen.getByRole('textbox').closest('.input-wrapper')
      expect(wrapper).toHaveClass('custom-input')
    })
  })

  describe('포커스', () => {
    it('키보드 포커스 가능', () => {
      render(<Input />)

      const input = screen.getByRole('textbox')
      input.focus()

      expect(input).toHaveFocus()
    })

    it('onFocus 핸들러 호출', async () => {
      const user = userEvent.setup()
      const handleFocus = vi.fn()

      render(<Input onFocus={handleFocus} />)

      const input = screen.getByRole('textbox')
      await user.click(input)

      expect(handleFocus).toHaveBeenCalled()
    })

    it('onBlur 핸들러 호출', async () => {
      const user = userEvent.setup()
      const handleBlur = vi.fn()

      render(
        <div>
          <Input onBlur={handleBlur} />
          <button>외부 버튼</button>
        </div>
      )

      const input = screen.getByRole('textbox')
      await user.click(input)
      await user.click(screen.getByText('외부 버튼'))

      expect(handleBlur).toHaveBeenCalled()
    })
  })

  describe('ref forwarding', () => {
    it('ref를 통해 input 요소 접근 가능', () => {
      const ref = { current: null as HTMLInputElement | null }

      render(<Input ref={ref as any} />)

      expect(ref.current).toBeInstanceOf(HTMLInputElement)
    })

    it('ref를 통한 focus 메서드 호출', () => {
      const ref = { current: null as HTMLInputElement | null }

      render(<Input ref={ref as any} />)

      ref.current?.focus()

      expect(ref.current).toHaveFocus()
    })
  })

  describe('조합 테스트', () => {
    it('error + errorMessage + fullWidth', () => {
      render(<Input error errorMessage="에러!" fullWidth />)

      const wrapper = screen.getByRole('textbox').closest('.input-wrapper')
      expect(wrapper).toHaveClass('input-wrapper--error')
      expect(wrapper).toHaveClass('input-wrapper--full-width')
      expect(screen.getByText('에러!')).toBeInTheDocument()
    })

    it('disabled + leftIcon + placeholder', () => {
      const Icon = () => <span data-testid="icon">🔍</span>

      render(<Input disabled leftIcon={<Icon />} placeholder="검색 불가" />)

      const input = screen.getByRole('textbox')
      expect(input).toBeDisabled()
      expect(screen.getByTestId('icon')).toBeInTheDocument()
      expect(input).toHaveAttribute('placeholder', '검색 불가')
    })
  })
})
