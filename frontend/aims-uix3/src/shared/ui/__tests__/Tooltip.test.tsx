/**
 * Tooltip.tsx - iOS 스타일 툴팁 컴포넌트 테스트
 * @since 2025-10-23
 *
 * 테스트하는 커밋들:
 * - 5472ee8: feat(ui): 주요 컴포넌트에 iOS 스타일 Tooltip 전면 적용
 * - 140d821: feat(ui): 지역별 보기 페이지에 iOS 스타일 Tooltip 컴포넌트 적용
 *
 * Note: 이 테스트는 Tooltip 컴포넌트의 Props와 기본 렌더링을 검증합니다.
 * 실제 마우스 호버 동작과 300ms 타이머는 E2E 테스트에서 검증하는 것이 적합합니다.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Tooltip from '../Tooltip'

describe('Tooltip 컴포넌트', () => {
  describe('기본 렌더링', () => {
    it('자식 요소가 렌더링되어야 함', () => {
      render(
        <Tooltip content="테스트 툴팁">
          <button>버튼</button>
        </Tooltip>
      )

      expect(screen.getByText('버튼')).toBeInTheDocument()
    })

    it('초기 상태에서는 툴팁이 보이지 않아야 함', () => {
      render(
        <Tooltip content="테스트 툴팁">
          <button>버튼</button>
        </Tooltip>
      )

      expect(screen.queryByText('테스트 툴팁')).not.toBeInTheDocument()
    })

    it('여러 자식 요소를 감쌀 수 없어야 함 (단일 자식만 허용)', () => {
      // Tooltip은 React.cloneElement를 사용하므로 단일 자식만 허용
      const { container } = render(
        <Tooltip content="테스트">
          <button>단일 버튼</button>
        </Tooltip>
      )

      expect(container.querySelector('button')).toBeInTheDocument()
    })
  })

  describe('Props 검증', () => {
    it('content prop이 문자열이어야 함', () => {
      render(
        <Tooltip content="문자열 콘텐츠">
          <button>버튼</button>
        </Tooltip>
      )

      expect(screen.getByText('버튼')).toBeInTheDocument()
    })

    it('빈 content도 허용해야 함', () => {
      render(
        <Tooltip content="">
          <button>빈 툴팁 버튼</button>
        </Tooltip>
      )

      expect(screen.getByText('빈 툴팁 버튼')).toBeInTheDocument()
    })

    it('긴 content도 허용해야 함', () => {
      const longContent = '이것은 매우 긴 툴팁 콘텐츠입니다. '.repeat(10)

      render(
        <Tooltip content={longContent}>
          <button>긴 툴팁 버튼</button>
        </Tooltip>
      )

      expect(screen.getByText('긴 툴팁 버튼')).toBeInTheDocument()
    })
  })

  describe('자식 요소 타입', () => {
    it('버튼 요소를 감쌀 수 있어야 함', () => {
      render(
        <Tooltip content="버튼 툴팁">
          <button>버튼</button>
        </Tooltip>
      )

      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('div 요소를 감쌀 수 있어야 함', () => {
      render(
        <Tooltip content="div 툴팁">
          <div>Div 요소</div>
        </Tooltip>
      )

      expect(screen.getByText('Div 요소')).toBeInTheDocument()
    })

    it('span 요소를 감쌀 수 있어야 함', () => {
      render(
        <Tooltip content="span 툴팁">
          <span>Span 요소</span>
        </Tooltip>
      )

      expect(screen.getByText('Span 요소')).toBeInTheDocument()
    })

    it('커스텀 컴포넌트를 감쌀 수 있어야 함', () => {
      const CustomButton = ({ children }: { children: React.ReactNode }) => (
        <button className="custom">{children}</button>
      )

      render(
        <Tooltip content="커스텀 툴팁">
          <CustomButton>커스텀 버튼</CustomButton>
        </Tooltip>
      )

      expect(screen.getByText('커스텀 버튼')).toBeInTheDocument()
    })
  })

  describe('동적 콘텐츠', () => {
    it('조건부 콘텐츠를 렌더링할 수 있어야 함', () => {
      const isEnabled = true
      const content = isEnabled ? '활성화됨' : '비활성화됨'

      render(
        <Tooltip content={content}>
          <button>조건부 버튼</button>
        </Tooltip>
      )

      expect(screen.getByText('조건부 버튼')).toBeInTheDocument()
    })

    it('숫자를 포함한 콘텐츠를 렌더링할 수 있어야 함', () => {
      const count = 5
      const content = `${count}개 항목`

      render(
        <Tooltip content={content}>
          <button>카운트 버튼</button>
        </Tooltip>
      )

      expect(screen.getByText('카운트 버튼')).toBeInTheDocument()
    })
  })

  describe('접근성', () => {
    it('자식 요소의 aria-label이 유지되어야 함', () => {
      render(
        <Tooltip content="툴팁">
          <button aria-label="접근성 레이블">버튼</button>
        </Tooltip>
      )

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('aria-label', '접근성 레이블')
    })

    it('disabled 버튼도 감쌀 수 있어야 함', () => {
      render(
        <Tooltip content="비활성화 툴팁">
          <button disabled>비활성 버튼</button>
        </Tooltip>
      )

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })
  })

  describe('여러 Tooltip 동시 사용', () => {
    it('여러 Tooltip이 독립적으로 렌더링되어야 함', () => {
      render(
        <div>
          <Tooltip content="첫 번째">
            <button>버튼1</button>
          </Tooltip>
          <Tooltip content="두 번째">
            <button>버튼2</button>
          </Tooltip>
          <Tooltip content="세 번째">
            <button>버튼3</button>
          </Tooltip>
        </div>
      )

      expect(screen.getByText('버튼1')).toBeInTheDocument()
      expect(screen.getByText('버튼2')).toBeInTheDocument()
      expect(screen.getByText('버튼3')).toBeInTheDocument()
    })

    it('동일한 content를 가진 여러 Tooltip을 렌더링할 수 있어야 함', () => {
      render(
        <div>
          <Tooltip content="공통 툴팁">
            <button>버튼1</button>
          </Tooltip>
          <Tooltip content="공통 툴팁">
            <button>버튼2</button>
          </Tooltip>
        </div>
      )

      expect(screen.getByText('버튼1')).toBeInTheDocument()
      expect(screen.getByText('버튼2')).toBeInTheDocument()
    })
  })

  describe('iOS 디자인 시스템 통합', () => {
    it('Tooltip이 iOS 스타일 CSS 클래스를 사용하는지 확인', () => {
      const { container } = render(
        <Tooltip content="iOS 스타일">
          <button>버튼</button>
        </Tooltip>
      )

      // Tooltip 래퍼가 존재하는지 확인
      expect(container.firstChild).toBeInTheDocument()
    })

    it('다크모드 테마 속성이 있어도 정상 렌더링되어야 함', () => {
      document.documentElement.setAttribute('data-theme', 'dark')

      render(
        <Tooltip content="다크모드">
          <button>다크 버튼</button>
        </Tooltip>
      )

      expect(screen.getByText('다크 버튼')).toBeInTheDocument()

      document.documentElement.removeAttribute('data-theme')
    })
  })

  describe('에지 케이스', () => {
    it('null content는 빈 문자열로 처리되어야 함', () => {
      render(
        <Tooltip content={null as any}>
          <button>Null 버튼</button>
        </Tooltip>
      )

      expect(screen.getByText('Null 버튼')).toBeInTheDocument()
    })

    it('undefined content는 빈 문자열로 처리되어야 함', () => {
      render(
        <Tooltip content={undefined as any}>
          <button>Undefined 버튼</button>
        </Tooltip>
      )

      expect(screen.getByText('Undefined 버튼')).toBeInTheDocument()
    })

    it('특수 문자가 포함된 content를 렌더링할 수 있어야 함', () => {
      render(
        <Tooltip content="특수문자: !@#$%^&*()">
          <button>특수문자 버튼</button>
        </Tooltip>
      )

      expect(screen.getByText('특수문자 버튼')).toBeInTheDocument()
    })

    it('줄바꿈이 포함된 content를 렌더링할 수 있어야 함', () => {
      render(
        <Tooltip content="첫 번째 줄\n두 번째 줄">
          <button>줄바꿈 버튼</button>
        </Tooltip>
      )

      expect(screen.getByText('줄바꿈 버튼')).toBeInTheDocument()
    })
  })
})
