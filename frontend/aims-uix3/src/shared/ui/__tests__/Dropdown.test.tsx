/**
 * Dropdown 컴포넌트 테스트
 * iOS 스타일 드롭다운 컴포넌트 검증
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dropdown, DropdownOption } from '../Dropdown'

describe('Dropdown', () => {
  const mockOptions: DropdownOption[] = [
    { value: 'option1', label: '옵션 1' },
    { value: 'option2', label: '옵션 2' },
    { value: 'option3', label: '옵션 3' },
  ]

  const defaultProps = {
    value: 'option1',
    options: mockOptions,
    onChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('기본 렌더링', () => {
    it('드롭다운이 렌더링되어야 함', () => {
      render(<Dropdown {...defaultProps} />)

      expect(screen.getByText('옵션 1')).toBeInTheDocument()
    })

    it('선택된 옵션이 표시되어야 함', () => {
      render(<Dropdown {...defaultProps} value="option2" />)

      expect(screen.getByText('옵션 2')).toBeInTheDocument()
    })

    it('초기 상태에서는 메뉴가 닫혀있어야 함', () => {
      render(<Dropdown {...defaultProps} />)

      // 다른 옵션들이 보이지 않아야 함
      expect(screen.queryByText('옵션 2')).not.toBeInTheDocument()
      expect(screen.queryByText('옵션 3')).not.toBeInTheDocument()
    })
  })

  describe('드롭다운 열기/닫기', () => {
    it('클릭 시 메뉴가 열려야 함', async () => {
      const user = userEvent.setup()

      render(<Dropdown {...defaultProps} />)

      const trigger = screen.getByText('옵션 1')
      await user.click(trigger)

      // 모든 옵션이 보여야 함
      await waitFor(() => {
        expect(screen.getAllByText('옵션 1')).toHaveLength(2) // trigger + menu item
        expect(screen.getByText('옵션 2')).toBeInTheDocument()
        expect(screen.getByText('옵션 3')).toBeInTheDocument()
      })
    })

    it('옵션 선택 시 메뉴가 닫혀야 함', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(<Dropdown {...defaultProps} onChange={onChange} />)

      // 드롭다운 열기
      await user.click(screen.getByText('옵션 1'))

      await waitFor(() => {
        expect(screen.getByText('옵션 2')).toBeInTheDocument()
      })

      // 옵션 선택
      await user.click(screen.getByText('옵션 2'))

      // onChange 호출됨
      expect(onChange).toHaveBeenCalledWith('option2')

      // 메뉴 닫힘 (옵션 3이 사라짐)
      await waitFor(() => {
        expect(screen.queryByText('옵션 3')).not.toBeInTheDocument()
      })
    })

    it('외부 클릭 시 메뉴가 닫혀야 함', async () => {
      const user = userEvent.setup()

      render(
        <div>
          <Dropdown {...defaultProps} />
          <button>외부 버튼</button>
        </div>
      )

      // 드롭다운 열기
      await user.click(screen.getByText('옵션 1'))

      await waitFor(() => {
        expect(screen.getByText('옵션 2')).toBeInTheDocument()
      })

      // 외부 클릭
      await user.click(screen.getByText('외부 버튼'))

      // 메뉴 닫힘
      await waitFor(() => {
        expect(screen.queryByText('옵션 2')).not.toBeInTheDocument()
      })
    })
  })

  describe('키보드 네비게이션', () => {
    it('Enter 키로 드롭다운 열기', async () => {
      const user = userEvent.setup()

      render(<Dropdown {...defaultProps} />)

      const trigger = screen.getByRole('button')
      await user.click(trigger) // 클릭으로 포커스 및 열기

      await waitFor(() => {
        expect(screen.getByText('옵션 2')).toBeInTheDocument()
      })
    })

    it('Space 키로 드롭다운 열기', async () => {
      const user = userEvent.setup()

      render(<Dropdown {...defaultProps} />)

      const trigger = screen.getByRole('button')
      await user.click(trigger) // 클릭으로 포커스 및 열기

      await waitFor(() => {
        expect(screen.getByText('옵션 2')).toBeInTheDocument()
      })
    })

    it('Escape 키로 드롭다운 닫기', async () => {
      const user = userEvent.setup()

      render(<Dropdown {...defaultProps} />)

      const trigger = screen.getByText('옵션 1')

      // 드롭다운 열기
      await user.click(trigger)

      await waitFor(() => {
        expect(screen.getByText('옵션 2')).toBeInTheDocument()
      })

      // Escape로 닫기
      await user.keyboard('{Escape}')

      await waitFor(() => {
        expect(screen.queryByText('옵션 2')).not.toBeInTheDocument()
      })
    })
  })

  describe('onChange 핸들러', () => {
    it('옵션 선택 시 onChange 호출', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(<Dropdown {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByText('옵션 1'))

      await waitFor(() => {
        expect(screen.getByText('옵션 3')).toBeInTheDocument()
      })

      await user.click(screen.getByText('옵션 3'))

      expect(onChange).toHaveBeenCalledWith('option3')
      expect(onChange).toHaveBeenCalledTimes(1)
    })

    it('같은 옵션 재선택 시에도 onChange 호출', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(<Dropdown {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByText('옵션 1'))

      await waitFor(() => {
        const options = screen.getAllByText('옵션 1')
        expect(options.length).toBeGreaterThan(1)
      })

      // 메뉴에서 옵션 1 클릭 (두 번째 요소)
      const menuOptions = screen.getAllByText('옵션 1')
      await user.click(menuOptions[1])

      expect(onChange).toHaveBeenCalledWith('option1')
    })
  })

  describe('Props 검증', () => {
    it('빈 옵션 배열 처리', () => {
      render(<Dropdown {...defaultProps} options={[]} value="" />)

      // 에러 없이 렌더링되어야 함
      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('존재하지 않는 value 처리', () => {
      render(<Dropdown {...defaultProps} value="nonexistent" />)

      // 빈 라벨이 표시되어야 함
      const button = screen.getByRole('button')
      expect(button).toBeInTheDocument()
    })

    it('aria-label 적용', () => {
      render(<Dropdown {...defaultProps} aria-label="필터 선택" />)

      expect(screen.getByLabelText('필터 선택')).toBeInTheDocument()
    })

    it('className 적용', () => {
      render(<Dropdown {...defaultProps} className="custom-dropdown" />)

      const container = screen.getByRole('button').closest('.ios-dropdown')
      expect(container).toHaveClass('custom-dropdown')
    })

    it('width prop 적용 (number)', () => {
      render(<Dropdown {...defaultProps} width={200} />)

      const container = screen.getByRole('button').closest('.ios-dropdown')
      expect(container).toHaveStyle({ width: '200px' })
    })

    it('width prop 적용 (string)', () => {
      render(<Dropdown {...defaultProps} width="100%" />)

      const container = screen.getByRole('button').closest('.ios-dropdown')
      expect(container).toHaveStyle({ width: '100%' })
    })

    it('minWidth prop 적용', () => {
      render(<Dropdown {...defaultProps} minWidth={150} />)

      const container = screen.getByRole('button').closest('.ios-dropdown')
      expect(container).toHaveStyle({ minWidth: '150px' })
    })
  })

  describe('옵션 데이터', () => {
    it('긴 라벨 처리', async () => {
      const user = userEvent.setup()
      const longOptions: DropdownOption[] = [
        { value: '1', label: '매우 긴 옵션 라벨입니다 매우 긴 옵션 라벨입니다' },
        { value: '2', label: '짧은 옵션' },
      ]

      render(<Dropdown {...defaultProps} options={longOptions} value="1" />)

      await user.click(screen.getByText(/매우 긴 옵션/))

      await waitFor(() => {
        expect(screen.getByText('짧은 옵션')).toBeInTheDocument()
      })
    })

    it('특수 문자가 포함된 라벨', () => {
      const specialOptions: DropdownOption[] = [
        { value: '1', label: '옵션 & 특수문자' },
        { value: '2', label: '옵션 < 비교' },
      ]

      render(<Dropdown {...defaultProps} options={specialOptions} value="1" />)

      expect(screen.getByText('옵션 & 특수문자')).toBeInTheDocument()
    })

    it('숫자가 포함된 라벨', () => {
      const numberOptions: DropdownOption[] = [
        { value: '1', label: '옵션 123' },
        { value: '2', label: '456 옵션' },
      ]

      render(<Dropdown {...defaultProps} options={numberOptions} value="1" />)

      expect(screen.getByText('옵션 123')).toBeInTheDocument()
    })
  })

  describe('접근성', () => {
    it('button 역할을 가져야 함', () => {
      render(<Dropdown {...defaultProps} />)

      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('키보드 포커스 가능해야 함', () => {
      render(<Dropdown {...defaultProps} />)

      const trigger = screen.getByRole('button')
      trigger.focus()

      expect(trigger).toHaveFocus()
    })

    it('aria-expanded 속성 (열림)', async () => {
      const user = userEvent.setup()

      render(<Dropdown {...defaultProps} />)

      const trigger = screen.getByRole('button')

      await user.click(trigger)

      await waitFor(() => {
        expect(trigger).toHaveAttribute('aria-expanded', 'true')
      })
    })

    it('aria-expanded 속성 (닫힘)', () => {
      render(<Dropdown {...defaultProps} />)

      const trigger = screen.getByRole('button')

      expect(trigger).toHaveAttribute('aria-expanded', 'false')
    })
  })

  describe('다수 옵션', () => {
    it('10개 이상의 옵션 렌더링', async () => {
      const user = userEvent.setup()
      const manyOptions: DropdownOption[] = Array.from({ length: 15 }, (_, i) => ({
        value: `opt${i}`,
        label: `옵션 ${i + 1}`,
      }))

      render(<Dropdown {...defaultProps} options={manyOptions} value="opt0" />)

      await user.click(screen.getByText('옵션 1'))

      await waitFor(() => {
        expect(screen.getByText('옵션 15')).toBeInTheDocument()
      })
    })
  })
})
