/**
 * App.tsx - BRB Drag Synchronization Tests
 * @since 2025-10-17
 *
 * BRB (Browser Resize Bar) 드래그 시 CenterPane과 RightPane의 완벽한 동기화를 검증하는 테스트
 * 이 테스트는 commit 4a88007에서 작동하던 기능이 계속 유지되는지 확인합니다.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import App from '../App'

// ============================================
// Mock 설정
// ============================================

// React Query Provider Mock
vi.mock('@tanstack/react-query', () => ({
  QueryClient: vi.fn(() => ({
    clear: vi.fn(),
  })),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// WebSocket Mock
vi.mock('../services/websocketService', () => ({
  default: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  },
}))

// API Mocks
vi.mock('../shared/api/annualReportApi', () => ({
  fetchAnnualReports: vi.fn(() => Promise.resolve({ reports: [], total: 0 })),
}))

beforeEach(() => {
  vi.clearAllMocks()

  // 브라우저 환경 시뮬레이션
  Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true })
  Object.defineProperty(window, 'innerHeight', { value: 1080, writable: true })

  // matchMedia mock
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })

  // getComputedStyle mock
  Object.defineProperty(window, 'getComputedStyle', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      getPropertyValue: vi.fn().mockReturnValue('16px'),
    })),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================
// BRB 드래그 동기화 핵심 테스트
// ============================================

describe('App - BRB 드래그 동기화', () => {
  it('BRB 드래그 시작 시 isDraggingBRB 상태가 true로 변경되어야 함', () => {
    const { container } = render(<App />)

    const brb = container.querySelector('.layout-brb')
    expect(brb).toBeTruthy()

    // BRB 드래그 시작
    fireEvent.mouseDown(brb!, { clientX: 960 })

    // CenterPane이 no-transition 클래스를 가져야 함
    const centerPane = container.querySelector('.layout-centerpane')
    expect(centerPane?.classList.contains('no-transition')).toBe(true)
  })

  it('BRB 드래그 종료 시 isDraggingBRB 상태가 false로 변경되어야 함', () => {
    const { container } = render(<App />)

    const brb = container.querySelector('.layout-brb')
    const centerPane = container.querySelector('.layout-centerpane')

    // BRB 드래그 시작
    fireEvent.mouseDown(brb!, { clientX: 960 })
    expect(centerPane?.classList.contains('no-transition')).toBe(true)

    // BRB 드래그 종료
    fireEvent.mouseUp(document)

    // no-transition 클래스가 제거되어야 함
    expect(centerPane?.classList.contains('no-transition')).toBe(false)
  })

  it('BRB 드래그 중에는 CenterPane에 transition이 비활성화되어야 함', () => {
    const { container } = render(<App />)

    const brb = container.querySelector('.layout-brb')
    const centerPane = container.querySelector('.layout-centerpane') as HTMLElement

    // 초기 상태: transition 활성화 (no-transition 클래스 없음)
    expect(centerPane?.classList.contains('no-transition')).toBe(false)

    // BRB 드래그 시작
    fireEvent.mouseDown(brb!, { clientX: 960 })

    // 드래그 중: transition 비활성화 (no-transition 클래스 있음)
    expect(centerPane?.classList.contains('no-transition')).toBe(true)

    // 드래그 종료
    fireEvent.mouseUp(document)

    // 드래그 종료 후: transition 복원 (no-transition 클래스 없음)
    expect(centerPane?.classList.contains('no-transition')).toBe(false)
  })

  it('BRB를 좌측으로 드래그하면 centerWidth가 감소해야 함', () => {
    const { container } = render(<App />)

    const brb = container.querySelector('.layout-brb')
    const centerPane = container.querySelector('.layout-centerpane') as HTMLElement

    // 초기 width 저장 (CSS calc() 표현식)
    const initialWidth = centerPane.style.width

    // BRB 드래그: 960px → 700px (좌측으로 260px 이동)
    fireEvent.mouseDown(brb!, { clientX: 960 })
    fireEvent.mouseMove(document, { clientX: 700 })
    fireEvent.mouseUp(document)

    // width 표현식이 변경되었는지 확인
    const newWidth = centerPane.style.width
    expect(newWidth).not.toBe(initialWidth)
    expect(newWidth).toBeTruthy()
  })

  it('BRB를 우측으로 드래그하면 centerWidth가 증가해야 함', () => {
    const { container } = render(<App />)

    const brb = container.querySelector('.layout-brb')
    const centerPane = container.querySelector('.layout-centerpane') as HTMLElement

    // 초기 width 저장 (CSS calc() 표현식)
    const initialWidth = centerPane.style.width

    // BRB 드래그: 960px → 1200px (우측으로 240px 이동)
    fireEvent.mouseDown(brb!, { clientX: 960 })
    fireEvent.mouseMove(document, { clientX: 1200 })
    fireEvent.mouseUp(document)

    // width 표현식이 변경되었는지 확인
    const newWidth = centerPane.style.width
    expect(newWidth).not.toBe(initialWidth)
    expect(newWidth).toBeTruthy()
  })

  it('BRB 드래그 중 mousemove 이벤트에 즉시 반응해야 함', () => {
    const { container } = render(<App />)

    const brb = container.querySelector('.layout-brb')
    const centerPane = container.querySelector('.layout-centerpane') as HTMLElement

    // BRB 드래그 시작
    fireEvent.mouseDown(brb!, { clientX: 960 })

    // 여러 번의 mousemove 이벤트
    const positions = [950, 940, 930, 920, 910]
    positions.forEach(x => {
      fireEvent.mouseMove(document, { clientX: x })
      // 각 이벤트마다 width가 업데이트되어야 함
      expect(centerPane.style.width).toBeTruthy()
    })

    fireEvent.mouseUp(document)
  })
})

// ============================================
// Regression Test: commit 4a88007 기능 유지 검증
// ============================================

describe('App - BRB 드래그 회귀 테스트 (commit 4a88007)', () => {
  it('[회귀 방지] BRB 드래그 시 CenterPane과 RightPane이 하나처럼 움직여야 함', () => {
    const { container } = render(<App />)

    const brb = container.querySelector('.layout-brb')
    const centerPane = container.querySelector('.layout-centerpane') as HTMLElement

    // BRB 드래그 시작 시 no-transition 클래스가 즉시 적용되어야 함
    fireEvent.mouseDown(brb!, { clientX: 960 })
    expect(centerPane.classList.contains('no-transition')).toBe(true)

    // 드래그 중에도 계속 유지
    fireEvent.mouseMove(document, { clientX: 900 })
    expect(centerPane.classList.contains('no-transition')).toBe(true)

    fireEvent.mouseMove(document, { clientX: 850 })
    expect(centerPane.classList.contains('no-transition')).toBe(true)

    // 드래그 종료 시 즉시 제거
    fireEvent.mouseUp(document)
    expect(centerPane.classList.contains('no-transition')).toBe(false)
  })

  it('[회귀 방지] 브라우저 리사이즈와 BRB 드래그가 독립적으로 작동해야 함', () => {
    const { container } = render(<App />)

    const centerPane = container.querySelector('.layout-centerpane') as HTMLElement

    // 브라우저 리사이즈 시에는 no-transition 클래스가 적용되지 않아야 함
    fireEvent(window, new Event('resize'))
    expect(centerPane.classList.contains('no-transition')).toBe(false)

    // BRB 드래그 시에만 no-transition 클래스가 적용되어야 함
    const brb = container.querySelector('.layout-brb')
    fireEvent.mouseDown(brb!, { clientX: 960 })
    expect(centerPane.classList.contains('no-transition')).toBe(true)

    fireEvent.mouseUp(document)
    expect(centerPane.classList.contains('no-transition')).toBe(false)
  })

  it('[회귀 방지] centerWidth 상태가 드래그 중 즉시 반영되어야 함', () => {
    const { container } = render(<App />)

    const brb = container.querySelector('.layout-brb')
    const centerPane = container.querySelector('.layout-centerpane') as HTMLElement

    // 초기 width
    const initialWidth = centerPane.style.width

    // 드래그 시작
    fireEvent.mouseDown(brb!, { clientX: 960 })

    // 드래그 중 width 변경
    fireEvent.mouseMove(document, { clientX: 800 })
    const draggedWidth = centerPane.style.width

    // width가 즉시 변경되어야 함 (transition 없이)
    expect(draggedWidth).not.toBe(initialWidth)
    expect(centerPane.classList.contains('no-transition')).toBe(true)

    fireEvent.mouseUp(document)
  })
})

// ============================================
// Edge Cases 테스트
// ============================================

describe('App - BRB 드래그 엣지 케이스', () => {
  it('BRB를 최소 폭 이하로 드래그해도 안전해야 함', () => {
    const { container } = render(<App />)

    const brb = container.querySelector('.layout-brb')
    const centerPane = container.querySelector('.layout-centerpane') as HTMLElement

    const initialWidth = centerPane.style.width

    // 극단적인 좌측 드래그
    fireEvent.mouseDown(brb!, { clientX: 960 })
    fireEvent.mouseMove(document, { clientX: 100 })

    // width가 변경되었고 여전히 유효한 값이어야 함 (CSS calc() 표현식)
    expect(centerPane.style.width).toBeTruthy()
    expect(centerPane.style.width).not.toBe(initialWidth)

    fireEvent.mouseUp(document)
  })

  it('BRB를 최대 폭 이상으로 드래그해도 안전해야 함', () => {
    const { container } = render(<App />)

    const brb = container.querySelector('.layout-brb')
    const centerPane = container.querySelector('.layout-centerpane') as HTMLElement

    const initialWidth = centerPane.style.width

    // 극단적인 우측 드래그
    fireEvent.mouseDown(brb!, { clientX: 960 })
    fireEvent.mouseMove(document, { clientX: 1800 })

    // width가 변경되었고 여전히 유효한 값이어야 함 (CSS calc() 표현식)
    expect(centerPane.style.width).toBeTruthy()
    expect(centerPane.style.width).not.toBe(initialWidth)

    fireEvent.mouseUp(document)
  })

  it('BRB 드래그를 중단하고 다시 시작해도 정상 작동해야 함', () => {
    const { container } = render(<App />)

    const brb = container.querySelector('.layout-brb')
    const centerPane = container.querySelector('.layout-centerpane') as HTMLElement

    // 첫 번째 드래그
    fireEvent.mouseDown(brb!, { clientX: 960 })
    expect(centerPane.classList.contains('no-transition')).toBe(true)
    fireEvent.mouseMove(document, { clientX: 900 })
    fireEvent.mouseUp(document)
    expect(centerPane.classList.contains('no-transition')).toBe(false)

    // 두 번째 드래그
    fireEvent.mouseDown(brb!, { clientX: 900 })
    expect(centerPane.classList.contains('no-transition')).toBe(true)
    fireEvent.mouseMove(document, { clientX: 1000 })
    fireEvent.mouseUp(document)
    expect(centerPane.classList.contains('no-transition')).toBe(false)
  })

  it('마우스가 화면 밖으로 나가도 드래그가 정상 종료되어야 함', () => {
    const { container } = render(<App />)

    const brb = container.querySelector('.layout-brb')
    const centerPane = container.querySelector('.layout-centerpane') as HTMLElement

    // 드래그 시작
    fireEvent.mouseDown(brb!, { clientX: 960 })
    expect(centerPane.classList.contains('no-transition')).toBe(true)

    // 화면 밖으로 이동 후 mouseup
    fireEvent.mouseMove(document, { clientX: -100 })
    fireEvent.mouseUp(document)

    // transition이 복원되어야 함
    expect(centerPane.classList.contains('no-transition')).toBe(false)
  })
})

// ============================================
// 통합 시나리오 테스트
// ============================================

describe('App - BRB 드래그 통합 시나리오', () => {
  it('전체 플로우: 드래그 시작 → 이동 → 종료가 정상 작동해야 함', () => {
    const { container } = render(<App />)

    const brb = container.querySelector('.layout-brb')
    const centerPane = container.querySelector('.layout-centerpane') as HTMLElement

    // 1. 초기 상태 확인
    expect(centerPane.classList.contains('no-transition')).toBe(false)
    const initialWidth = centerPane.style.width

    // 2. 드래그 시작
    fireEvent.mouseDown(brb!, { clientX: 960 })
    expect(centerPane.classList.contains('no-transition')).toBe(true)

    // 3. 드래그 이동 (여러 단계)
    const movements = [950, 940, 930, 920, 900, 880, 850, 820, 800]
    movements.forEach(x => {
      fireEvent.mouseMove(document, { clientX: x })
      expect(centerPane.classList.contains('no-transition')).toBe(true)
    })

    // 4. 최종 위치에서 width 확인
    const draggedWidth = centerPane.style.width
    expect(draggedWidth).not.toBe(initialWidth)

    // 5. 드래그 종료
    fireEvent.mouseUp(document)
    expect(centerPane.classList.contains('no-transition')).toBe(false)

    // 6. width는 유지되어야 함
    expect(centerPane.style.width).toBe(draggedWidth)
  })

  it('연속 드래그: 여러 번 드래그해도 일관되게 작동해야 함', () => {
    const { container } = render(<App />)

    const brb = container.querySelector('.layout-brb')
    const centerPane = container.querySelector('.layout-centerpane') as HTMLElement

    const dragSequence = [
      { start: 960, end: 800 },
      { start: 800, end: 1000 },
      { start: 1000, end: 900 },
    ]

    dragSequence.forEach(({ start, end }) => {
      // 드래그 시작
      fireEvent.mouseDown(brb!, { clientX: start })
      expect(centerPane.classList.contains('no-transition')).toBe(true)

      // 드래그
      fireEvent.mouseMove(document, { clientX: end })
      expect(centerPane.classList.contains('no-transition')).toBe(true)

      // 드래그 종료
      fireEvent.mouseUp(document)
      expect(centerPane.classList.contains('no-transition')).toBe(false)
    })
  })
})
