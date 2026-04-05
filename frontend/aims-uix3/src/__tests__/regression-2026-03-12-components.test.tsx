/**
 * Regression 테스트 (컴포넌트 렌더링): 2026-03-12 기준 최근 커밋
 *
 * 대상 커밋:
 * - 0166c8b3: Input id 하드코딩 제거 — useId()로 인스턴스별 고유 ID 생성
 * - 6e328671: Tooltip id 하드코딩 제거 — useId()로 인스턴스별 고유 ID 생성
 * - d9cefae5: AppleConfirmModal requireTextConfirm 기능
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { renderHook, act } from '@testing-library/react'
import { Input } from '@/shared/ui/Input'
import { useAppleConfirmController } from '@/controllers/useAppleConfirmController'

// ============================================================
// 1. Input 컴포넌트: useId() 고유 ID (커밋 0166c8b3)
// ============================================================

describe('[회귀] Input useId 고유 ID 생성 (0166c8b3)', () => {
  it('에러 메시지가 있을 때 aria-describedby가 설정된다', () => {
    const { container } = render(
      <Input error errorMessage="잘못된 입력입니다" />
    )

    const input = container.querySelector('input')
    const errorMsg = container.querySelector('.input-error-message')

    expect(input).toBeTruthy()
    expect(errorMsg).toBeTruthy()
    expect(input?.getAttribute('aria-invalid')).toBe('true')

    // aria-describedby가 에러 메시지의 id와 일치해야 함
    const describedBy = input?.getAttribute('aria-describedby')
    const errorId = errorMsg?.getAttribute('id')
    expect(describedBy).toBeTruthy()
    expect(errorId).toBeTruthy()
    expect(describedBy).toBe(errorId)
  })

  it('에러가 없으면 aria-describedby가 설정되지 않는다', () => {
    const { container } = render(
      <Input placeholder="테스트" />
    )

    const input = container.querySelector('input')
    expect(input?.getAttribute('aria-describedby')).toBeNull()
  })

  it('여러 Input이 각각 고유한 에러 ID를 가진다', () => {
    const { container } = render(
      <div>
        <Input error errorMessage="에러 1" data-testid="input-1" />
        <Input error errorMessage="에러 2" data-testid="input-2" />
      </div>
    )

    const errorMessages = container.querySelectorAll('.input-error-message')
    expect(errorMessages.length).toBe(2)

    const id1 = errorMessages[0]?.getAttribute('id')
    const id2 = errorMessages[1]?.getAttribute('id')

    expect(id1).toBeTruthy()
    expect(id2).toBeTruthy()
    // 핵심: 두 ID가 서로 달라야 한다 (하드코딩 id="input-error" 문제 해결)
    expect(id1).not.toBe(id2)
  })

  it('하드코딩된 "input-error" ID가 사용되지 않는다', () => {
    const { container } = render(
      <Input error errorMessage="에러 메시지" />
    )

    const errorMsg = container.querySelector('.input-error-message')
    const errorId = errorMsg?.getAttribute('id')

    // useId()로 생성된 ID는 "input-error"가 아님
    expect(errorId).not.toBe('input-error')
  })
})

// ============================================================
// 2. useAppleConfirmController: requireTextConfirm (커밋 d9cefae5)
// ============================================================

// ModalService 모킹
vi.mock('@/services/modalService', () => ({
  ModalService: {
    validateParams: vi.fn((params: Record<string, unknown>) => ({
      title: params.title || '확인',
      message: params.message,
      confirmText: params.confirmText || '확인',
      cancelText: params.cancelText || '취소',
      confirmStyle: params.confirmStyle || 'primary',
      showCancel: params.showCancel !== undefined ? params.showCancel : true,
      iconType: params.iconType || 'warning',
      requireTextConfirm: params.requireTextConfirm,
    })),
  },
}))

describe('[회귀] AppleConfirmController requireTextConfirm (d9cefae5)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('requireTextConfirm 파라미터가 state에 전달된다', () => {
    const { result } = renderHook(() => useAppleConfirmController())

    act(() => {
      result.current.actions.openModal({
        message: '전체 문서를 삭제하시겠습니까?',
        requireTextConfirm: '전체삭제',
        confirmStyle: 'destructive',
      })
    })

    expect(result.current.state.isOpen).toBe(true)
    expect(result.current.state.requireTextConfirm).toBe('전체삭제')
  })

  it('requireTextConfirm 없이 열면 undefined이다', () => {
    const { result } = renderHook(() => useAppleConfirmController())

    act(() => {
      result.current.actions.openModal({
        message: '이 고객의 문서를 삭제하시겠습니까?',
      })
    })

    expect(result.current.state.requireTextConfirm).toBeUndefined()
  })

  it('destructive 스타일과 함께 사용할 수 있다', () => {
    const { result } = renderHook(() => useAppleConfirmController())

    act(() => {
      result.current.actions.openModal({
        message: '위험한 작업입니다',
        confirmStyle: 'destructive',
        requireTextConfirm: '삭제',
      })
    })

    expect(result.current.state.confirmStyle).toBe('destructive')
    expect(result.current.state.requireTextConfirm).toBe('삭제')
  })
})
