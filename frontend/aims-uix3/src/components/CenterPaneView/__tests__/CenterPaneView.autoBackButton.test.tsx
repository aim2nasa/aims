/**
 * CenterPaneView 조건부 자동 BackButton 테스트
 * @since 2026-03-26
 * @version 1.0.0
 *
 * 조건부 BackButton 표시 로직 regression 테스트
 * - 사이드바 직접 진입 시 BackButton 미표시
 * - 내부 링크 진입 시 BackButton 표시
 * - suppressAutoBackButton prop으로 비활성화
 * - titleLeftAccessory가 있으면 자동 BackButton 미표시
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { CenterPaneView } from '../CenterPaneView'
import { useNavigationStore } from '@/shared/store/useNavigationStore'

// SFSymbol 모킹
vi.mock('../../SFSymbol', () => ({
  SFSymbol: ({ name }: { name: string }) => <span data-testid={`sf-${name}`} />,
  SFSymbolSize: { TITLE_1: 'title1', CALLOUT: 'callout', CAPTION_2: 'caption2' },
  SFSymbolWeight: { ULTRALIGHT: 'ultralight', MEDIUM: 'medium', SEMIBOLD: 'semibold' },
}))

// Tooltip 모킹
vi.mock('@/shared/ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Breadcrumb 모킹
vi.mock('@/shared/ui/Breadcrumb', () => ({
  Breadcrumb: () => null,
}))

const noop = () => {}

describe('CenterPaneView 자동 BackButton', () => {
  beforeEach(() => {
    act(() => {
      useNavigationStore.getState().resetHistory()
    })
  })

  it('사이드바 직접 진입 시 BackButton이 표시되지 않아야 한다', () => {
    // 사이드바로 진입
    act(() => {
      useNavigationStore.getState().recordNavigation('customers-all', 'sidebar')
    })

    render(
      <CenterPaneView visible title="고객 전체보기" onClose={noop} />
    )

    // BackButton이 없어야 함
    expect(screen.queryByRole('button', { name: '돌아가기' })).toBeNull()
  })

  it('내부 링크로 진입 시 BackButton이 표시되어야 한다', () => {
    // 사이드바로 먼저 진입 후, 내부 링크로 이동
    act(() => {
      useNavigationStore.getState().recordNavigation('customers-all', 'sidebar')
    })
    act(() => {
      useNavigationStore.getState().recordNavigation('customers-full-detail', 'internal')
    })

    render(
      <CenterPaneView visible title="고객 상세" onClose={noop} />
    )

    // BackButton이 있어야 함
    expect(screen.getByRole('button', { name: '돌아가기' })).toBeTruthy()
  })

  it('suppressAutoBackButton이 true이면 내부 링크 진입이어도 BackButton이 표시되지 않아야 한다', () => {
    // 내부 링크로 이동
    act(() => {
      useNavigationStore.getState().recordNavigation('customers-all', 'sidebar')
    })
    act(() => {
      useNavigationStore.getState().recordNavigation('customers-full-detail', 'internal')
    })

    render(
      <CenterPaneView visible suppressAutoBackButton title="고객 상세" onClose={noop} />
    )

    // BackButton이 없어야 함
    expect(screen.queryByRole('button', { name: '돌아가기' })).toBeNull()
  })

  it('titleLeftAccessory가 전달되면 자동 BackButton 대신 전달된 요소가 표시되어야 한다', () => {
    // 내부 링크로 이동
    act(() => {
      useNavigationStore.getState().recordNavigation('customers-all', 'sidebar')
    })
    act(() => {
      useNavigationStore.getState().recordNavigation('documents-search', 'internal')
    })

    render(
      <CenterPaneView
        visible
        title="문서 검색"
        onClose={noop}
        titleLeftAccessory={<button>커스텀 버튼</button>}
      />
    )

    // 커스텀 버튼이 보여야 함
    expect(screen.getByRole('button', { name: '커스텀 버튼' })).toBeTruthy()
    // 자동 BackButton은 없어야 함 (커스텀 버튼이 대체)
    expect(screen.queryByRole('button', { name: '돌아가기' })).toBeNull()
  })

  it('previousView가 없으면 (초기 상태) BackButton이 표시되지 않아야 한다', () => {
    // 히스토리 초기 상태 (direct 접근)
    render(
      <CenterPaneView visible title="홈" onClose={noop} />
    )

    expect(screen.queryByRole('button', { name: '돌아가기' })).toBeNull()
  })

  it('내부 링크 진입 후 사이드바 클릭 시 BackButton이 사라져야 한다', () => {
    // 내부 링크로 이동
    act(() => {
      useNavigationStore.getState().recordNavigation('customers-all', 'sidebar')
    })
    act(() => {
      useNavigationStore.getState().recordNavigation('customers-full-detail', 'internal')
    })

    const { rerender } = render(
      <CenterPaneView visible title="고객 상세" onClose={noop} />
    )

    // BackButton이 있어야 함
    expect(screen.getByRole('button', { name: '돌아가기' })).toBeTruthy()

    // 사이드바로 다른 뷰에 진입
    act(() => {
      useNavigationStore.getState().recordNavigation('documents-library', 'sidebar')
    })

    rerender(
      <CenterPaneView visible title="문서 라이브러리" onClose={noop} />
    )

    // BackButton이 없어야 함
    expect(screen.queryByRole('button', { name: '돌아가기' })).toBeNull()
  })
})
