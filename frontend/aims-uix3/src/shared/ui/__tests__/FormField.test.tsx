/**
 * FormField 컴포넌트 테스트
 * iOS Settings 스타일 폼 필드 컴포넌트 검증
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormField } from '../FormField'

describe('FormField', () => {
  describe('기본 렌더링', () => {
    it('라벨과 입력 필드가 렌더링되어야 함', () => {
      render(<FormField label="이름" />)

      expect(screen.getByLabelText('이름')).toBeInTheDocument()
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('placeholder가 표시되어야 함', () => {
      render(<FormField label="이름" placeholder="홍길동" />)

      expect(screen.getByPlaceholderText('홍길동')).toBeInTheDocument()
    })
  })

  describe('label prop', () => {
    it('label 텍스트가 표시되어야 함', () => {
      render(<FormField label="이메일" />)

      expect(screen.getByText('이메일')).toBeInTheDocument()
    })

    it('label이 input과 연결되어야 함 (htmlFor)', () => {
      render(<FormField label="이메일" />)

      const label = screen.getByText('이메일')
      const input = screen.getByRole('textbox')

      expect(label).toHaveAttribute('for', input.id)
    })

    it('공백이 포함된 label도 정상 처리되어야 함', () => {
      render(<FormField label="전화 번호" />)

      const input = screen.getByLabelText('전화 번호')
      expect(input.id).toBe('form-field-전화-번호')
    })
  })

  describe('required prop', () => {
    it('required=true일 때 필수 표시(*) 렌더링', () => {
      render(<FormField label="이름" required />)

      expect(screen.getByLabelText('필수')).toBeInTheDocument()
      expect(screen.getByText('*')).toBeInTheDocument()
    })

    it('required=false일 때 필수 표시 없음', () => {
      render(<FormField label="이름" required={false} />)

      expect(screen.queryByLabelText('필수')).not.toBeInTheDocument()
      expect(screen.queryByText('*')).not.toBeInTheDocument()
    })

    it('required일 때 input에 aria-required 속성 적용', () => {
      render(<FormField label="이름" required />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('aria-required', 'true')
      expect(input).toBeRequired()
    })
  })

  describe('helpText prop', () => {
    it('도움말 텍스트가 표시되어야 함', () => {
      render(<FormField label="이름" helpText="실명을 입력해주세요" />)

      expect(screen.getByText('실명을 입력해주세요')).toBeInTheDocument()
    })

    it('에러 상태일 때 도움말 텍스트 숨김', () => {
      render(
        <FormField
          label="이메일"
          helpText="올바른 이메일 형식으로 입력하세요"
          error
          errorMessage="이메일 형식이 올바르지 않습니다"
        />
      )

      // 도움말은 숨겨지고 에러 메시지만 표시
      expect(screen.queryByText('올바른 이메일 형식으로 입력하세요')).not.toBeInTheDocument()
      expect(screen.getByText('이메일 형식이 올바르지 않습니다')).toBeInTheDocument()
    })

    it('빈 문자열 helpText는 렌더링되지 않아야 함', () => {
      const { container } = render(<FormField label="이름" helpText="" />)

      const helpText = container.querySelector('.form-field__help-text')
      expect(helpText).not.toBeInTheDocument()
    })

    it('공백만 있는 helpText는 렌더링되지 않아야 함', () => {
      const { container } = render(<FormField label="이름" helpText="   " />)

      const helpText = container.querySelector('.form-field__help-text')
      expect(helpText).not.toBeInTheDocument()
    })
  })

  describe('error prop', () => {
    it('에러 상태일 때 에러 클래스 적용', () => {
      const { container } = render(<FormField label="이메일" error />)

      const formField = container.querySelector('.form-field')
      expect(formField).toHaveClass('form-field--error')
    })

    it('에러 메시지가 표시되어야 함', () => {
      render(<FormField label="이메일" error errorMessage="필수 입력 항목입니다" />)

      expect(screen.getByText('필수 입력 항목입니다')).toBeInTheDocument()
    })

    it('error=false일 때 에러 메시지 미표시', () => {
      render(<FormField label="이메일" error={false} errorMessage="에러 메시지" />)

      expect(screen.queryByText('에러 메시지')).not.toBeInTheDocument()
    })
  })

  describe('type prop', () => {
    it('text 타입 (기본값)', () => {
      render(<FormField label="이름" type="text" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('type', 'text')
    })

    it('email 타입', () => {
      render(<FormField label="이메일" type="email" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('type', 'email')
    })

    it('password 타입', () => {
      render(<FormField label="비밀번호" type="password" />)

      const input = document.querySelector('input[type="password"]')
      expect(input).toBeInTheDocument()
    })

    it('tel 타입', () => {
      render(<FormField label="전화번호" type="tel" />)

      const input = document.querySelector('input[type="tel"]')
      expect(input).toBeInTheDocument()
    })

    it('number 타입', () => {
      render(<FormField label="나이" type="number" />)

      const input = screen.getByRole('spinbutton')
      expect(input).toBeInTheDocument()
    })
  })

  describe('사용자 입력', () => {
    it('텍스트 입력 가능', async () => {
      const user = userEvent.setup()

      render(<FormField label="이름" />)

      const input = screen.getByRole('textbox')
      await user.type(input, 'Hello World')

      expect(input).toHaveValue('Hello World')
    })

    it('onChange 핸들러 호출', async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()

      render(<FormField label="이름" onChange={handleChange} />)

      const input = screen.getByRole('textbox')
      await user.type(input, 'A')

      expect(handleChange).toHaveBeenCalled()
    })

    it('disabled 상태에서 입력 불가', async () => {
      const user = userEvent.setup()

      render(<FormField label="이름" disabled />)

      const input = screen.getByRole('textbox')
      await user.type(input, 'Test')

      expect(input).toHaveValue('')
    })
  })

  describe('fullWidth 적용', () => {
    it('Input이 항상 fullWidth여야 함', () => {
      const { container } = render(<FormField label="이름" />)

      const inputWrapper = container.querySelector('.input-wrapper')
      expect(inputWrapper).toHaveClass('input-wrapper--full-width')
    })
  })

  describe('HTML 속성', () => {
    it('value 속성 적용', () => {
      render(<FormField label="이름" value="초기값" readOnly />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('초기값')
    })

    it('maxLength 속성 적용', () => {
      render(<FormField label="이름" maxLength={10} />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('maxLength', '10')
    })

    it('aria-label 속성 적용', () => {
      render(<FormField label="이름" aria-label="사용자 이름 입력" />)

      expect(screen.getByLabelText('사용자 이름 입력')).toBeInTheDocument()
    })
  })

  describe('id prop', () => {
    it('커스텀 id 적용', () => {
      render(<FormField label="이메일" id="custom-email-input" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('id', 'custom-email-input')
    })

    it('id가 없으면 자동 생성', () => {
      render(<FormField label="이메일" />)

      const input = screen.getByRole('textbox')
      expect(input.id).toBe('form-field-이메일')
    })

    it('자동 생성된 id에 label이 연결되어야 함', () => {
      render(<FormField label="이메일" />)

      const label = screen.getByText('이메일')
      const input = screen.getByRole('textbox')

      expect(label).toHaveAttribute('for', input.id)
    })
  })

  describe('아이콘', () => {
    it('leftIcon 렌더링', () => {
      const LeftIcon = () => <span data-testid="left-icon">🔍</span>

      render(<FormField label="검색" leftIcon={<LeftIcon />} />)

      expect(screen.getByTestId('left-icon')).toBeInTheDocument()
    })

    it('rightIcon 렌더링', () => {
      const RightIcon = () => <span data-testid="right-icon">✓</span>

      render(<FormField label="이메일" rightIcon={<RightIcon />} />)

      expect(screen.getByTestId('right-icon')).toBeInTheDocument()
    })
  })

  describe('포커스', () => {
    it('키보드 포커스 가능', () => {
      render(<FormField label="이름" />)

      const input = screen.getByRole('textbox')
      input.focus()

      expect(input).toHaveFocus()
    })

    it('onFocus 핸들러 호출', async () => {
      const user = userEvent.setup()
      const handleFocus = vi.fn()

      render(<FormField label="이름" onFocus={handleFocus} />)

      const input = screen.getByRole('textbox')
      await user.click(input)

      expect(handleFocus).toHaveBeenCalled()
    })

    it('onBlur 핸들러 호출', async () => {
      const user = userEvent.setup()
      const handleBlur = vi.fn()

      render(
        <div>
          <FormField label="이름" onBlur={handleBlur} />
          <button>외부 버튼</button>
        </div>
      )

      const input = screen.getByRole('textbox')
      await user.click(input)
      await user.click(screen.getByText('외부 버튼'))

      expect(handleBlur).toHaveBeenCalled()
    })
  })

  describe('조합 테스트', () => {
    it('required + error + errorMessage', () => {
      render(
        <FormField
          label="이메일"
          required
          error
          errorMessage="필수 입력 항목입니다"
        />
      )

      expect(screen.getByLabelText('필수')).toBeInTheDocument()
      expect(screen.getByText('필수 입력 항목입니다')).toBeInTheDocument()
      expect(screen.getByRole('textbox')).toBeRequired()
    })

    it('helpText + error (helpText 숨김)', () => {
      render(
        <FormField
          label="이메일"
          helpText="도움말"
          error
          errorMessage="에러 메시지"
        />
      )

      expect(screen.queryByText('도움말')).not.toBeInTheDocument()
      expect(screen.getByText('에러 메시지')).toBeInTheDocument()
    })

    it('required + type + placeholder', () => {
      render(
        <FormField
          label="이메일"
          type="email"
          placeholder="example@email.com"
          required
        />
      )

      const input = screen.getByRole('textbox')
      expect(input).toBeRequired()
      expect(input).toHaveAttribute('type', 'email')
      expect(input).toHaveAttribute('placeholder', 'example@email.com')
    })

    it('leftIcon + rightIcon + helpText', () => {
      const LeftIcon = () => <span data-testid="left">🔍</span>
      const RightIcon = () => <span data-testid="right">✓</span>

      render(
        <FormField
          label="검색"
          leftIcon={<LeftIcon />}
          rightIcon={<RightIcon />}
          helpText="검색어를 입력하세요"
        />
      )

      expect(screen.getByTestId('left')).toBeInTheDocument()
      expect(screen.getByTestId('right')).toBeInTheDocument()
      expect(screen.getByText('검색어를 입력하세요')).toBeInTheDocument()
    })
  })

  describe('접근성', () => {
    it('label과 input의 연결', () => {
      render(<FormField label="이름" />)

      const input = screen.getByLabelText('이름')
      expect(input).toBeInTheDocument()
    })

    it('필수 필드 접근성', () => {
      render(<FormField label="이름" required />)

      const requiredMark = screen.getByLabelText('필수')
      expect(requiredMark).toBeInTheDocument()

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('aria-required', 'true')
    })

    it('에러 상태 접근성', () => {
      const { container } = render(
        <FormField label="이메일" error errorMessage="에러 발생" />
      )

      const formField = container.querySelector('.form-field')
      expect(formField).toHaveClass('form-field--error')
    })
  })
})
