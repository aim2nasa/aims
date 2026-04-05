/**
 * App.tsx - BRB Drag Synchronization Tests
 * @since 2025-10-17
 *
 * BRB (Browser Resize Bar) 드래그 시 CenterPane과 RightPane의 완벽한 동기화를 검증하는 테스트
 * 이 테스트는 commit 4a88007에서 작동하던 기능이 계속 유지되는지 확인합니다.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import App from '../App'

// ============================================


// ============================================
// Mock 설정
// ============================================

// React Query Provider Mock
vi.mock('@tanstack/react-query', () => ({
  QueryClient: vi.fn(() => ({
    clear: vi.fn(),
    invalidateQueries: vi.fn(),
  })),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
  QueryCache: vi.fn(() => ({ find: vi.fn(), findAll: vi.fn() })),
  MutationCache: vi.fn(() => ({ find: vi.fn(), findAll: vi.fn() })),
  useQuery: () => ({ data: null, isLoading: false, error: null }),
  useMutation: () => ({ mutate: vi.fn(), isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
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

  // localStorage mock - RightPane을 보이도록 설정
  const localStorageMock = {
    getItem: vi.fn((key: string) => {
      if (key === 'aims-layout-state') {
        return JSON.stringify({
          rightPaneVisible: true,  // ⭐ RightPane을 보이도록 설정
          centerWidth: 60,
        })
      }
      return null
    }),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    length: 0,
    key: vi.fn(),
  }
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
  })

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

  it('BRB 드래그 중 mousemove 이벤트에 즉시 반응해야 함', () => {
    const { container } = render(<App />)

    const brb = container.querySelector('.layout-brb')
    const centerPane = container.querySelector('.layout-centerpane') as HTMLElement

    // BRB 드래그 시작
    fireEvent.mouseDown(brb!, { clientX: 960 })

    // 여러 번의 mousemove 이벤트 — 드래그 중 no-transition 유지 확인
    const positions = [950, 940, 930, 920, 910]
    positions.forEach(x => {
      fireEvent.mouseMove(document, { clientX: x })
      // 각 이벤트마다 no-transition 클래스가 유지되어야 함 (드래그 동기화)
      expect(centerPane.classList.contains('no-transition')).toBe(true)
    })

    fireEvent.mouseUp(document)
  })

  it('[핵심] BRB 드래그 시 RightPane 컨테이너에도 no-transition이 적용되어야 함 (commit a014f2bb)', () => {
    const { container } = render(<App />)

    const brb = container.querySelector('.layout-brb')
    const centerPane = container.querySelector('.layout-centerpane') as HTMLElement
    const rightPaneContainer = container.querySelector('.layout-rightpane-container') as HTMLElement

    // 초기 상태: 둘 다 no-transition 클래스 없음
    expect(centerPane?.classList.contains('no-transition')).toBe(false)
    expect(rightPaneContainer?.classList.contains('no-transition')).toBe(false)

    // BRB 드래그 시작
    fireEvent.mouseDown(brb!, { clientX: 960 })

    // 핵심 검증: CenterPane과 RightPane 컨테이너 모두 no-transition 적용
    expect(centerPane?.classList.contains('no-transition')).toBe(true)
    expect(rightPaneContainer?.classList.contains('no-transition')).toBe(true)

    // 드래그 중에도 유지
    fireEvent.mouseMove(document, { clientX: 900 })
    expect(centerPane?.classList.contains('no-transition')).toBe(true)
    expect(rightPaneContainer?.classList.contains('no-transition')).toBe(true)

    // 드래그 종료
    fireEvent.mouseUp(document)

    // 드래그 종료 후: 둘 다 no-transition 클래스 제거
    expect(centerPane?.classList.contains('no-transition')).toBe(false)
    expect(rightPaneContainer?.classList.contains('no-transition')).toBe(false)
  })

  it('[핵심] 브라우저 리사이즈 시에도 RightPane 컨테이너에 no-transition이 적용되어야 함', () => {
    vi.useFakeTimers()
    const { container } = render(<App />)

    const centerPane = container.querySelector('.layout-centerpane') as HTMLElement
    const rightPaneContainer = container.querySelector('.layout-rightpane-container') as HTMLElement

    // 브라우저 리사이즈 시작
    act(() => {
      fireEvent(window, new Event('resize'))
    })

    // 핵심 검증: CenterPane과 RightPane 컨테이너 모두 no-transition 적용
    expect(centerPane?.classList.contains('no-transition')).toBe(true)
    expect(rightPaneContainer?.classList.contains('no-transition')).toBe(true)

    // 100ms 후 리사이즈 완료
    act(() => {
      vi.advanceTimersByTime(100)
    })

    // 리사이즈 완료 후: 둘 다 no-transition 클래스 제거
    expect(centerPane?.classList.contains('no-transition')).toBe(false)
    expect(rightPaneContainer?.classList.contains('no-transition')).toBe(false)

    vi.useRealTimers()
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

  it('[회귀 방지] 브라우저 리사이즈 시 CenterPane과 RightPane이 동기화되어야 함 (commit 0b19ed7)', () => {
    vi.useFakeTimers()
    const { container } = render(<App />)

    const centerPane = container.querySelector('.layout-centerpane') as HTMLElement

    // 브라우저 리사이즈 시작
    act(() => {
      fireEvent(window, new Event('resize'))
    })

    // 리사이즈 중에는 no-transition 클래스가 적용되어야 함 (CenterPane과 RightPane 동기화)
    expect(centerPane.classList.contains('no-transition')).toBe(true)

    // 100ms 후 리사이즈 완료 (타이머에서 isResizing이 false로 변경됨)
    act(() => {
      vi.advanceTimersByTime(100)
    })

    // 리사이즈 완료 후에는 no-transition 클래스가 제거되어야 함
    expect(centerPane.classList.contains('no-transition')).toBe(false)

    vi.useRealTimers()
  })

  it('[회귀 방지] 브라우저 리사이즈와 BRB 드래그가 독립적으로 작동해야 함', () => {
    const { container } = render(<App />)

    const centerPane = container.querySelector('.layout-centerpane') as HTMLElement

    // BRB 드래그 시에만 no-transition 클래스가 적용되어야 함
    const brb = container.querySelector('.layout-brb')
    fireEvent.mouseDown(brb!, { clientX: 960 })
    expect(centerPane.classList.contains('no-transition')).toBe(true)

    fireEvent.mouseUp(document)
    expect(centerPane.classList.contains('no-transition')).toBe(false)
  })
})

// ============================================
// Edge Cases 테스트
// ============================================

describe('App - BRB 드래그 엣지 케이스', () => {
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

  it('브라우저 리사이즈 중 BRB 드래그를 시작해도 정상 작동해야 함 (commit 0b19ed7)', () => {
    vi.useFakeTimers()
    const { container } = render(<App />)

    const brb = container.querySelector('.layout-brb')
    const centerPane = container.querySelector('.layout-centerpane') as HTMLElement

    // 1. 브라우저 리사이즈 시작
    act(() => {
      fireEvent(window, new Event('resize'))
    })
    expect(centerPane.classList.contains('no-transition')).toBe(true)

    // 2. 리사이즈 중에 BRB 드래그 시작 (두 조건 모두 true)
    fireEvent.mouseDown(brb!, { clientX: 960 })
    expect(centerPane.classList.contains('no-transition')).toBe(true)

    // 3. 드래그 이동
    fireEvent.mouseMove(document, { clientX: 800 })
    expect(centerPane.classList.contains('no-transition')).toBe(true)

    // 4. 드래그 종료 (리사이즈는 여전히 진행 중)
    fireEvent.mouseUp(document)
    expect(centerPane.classList.contains('no-transition')).toBe(true) // isResizing이 여전히 true

    // 5. 리사이즈 완료 (100ms 후)
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(centerPane.classList.contains('no-transition')).toBe(false)

    vi.useRealTimers()
  })

  it('BRB 드래그 중 브라우저 리사이즈가 발생해도 동기화 유지되어야 함 (commit 0b19ed7)', () => {
    vi.useFakeTimers()
    const { container } = render(<App />)

    const brb = container.querySelector('.layout-brb')
    const centerPane = container.querySelector('.layout-centerpane') as HTMLElement

    // 1. BRB 드래그 시작
    fireEvent.mouseDown(brb!, { clientX: 960 })
    expect(centerPane.classList.contains('no-transition')).toBe(true)

    // 2. 드래그 중 브라우저 리사이즈 발생
    act(() => {
      fireEvent(window, new Event('resize'))
    })
    expect(centerPane.classList.contains('no-transition')).toBe(true) // 여전히 true (isDraggingBRB || isResizing)

    // 3. 드래그 계속
    fireEvent.mouseMove(document, { clientX: 800 })
    expect(centerPane.classList.contains('no-transition')).toBe(true)

    // 4. 드래그 종료 (리사이즈는 여전히 진행 중)
    fireEvent.mouseUp(document)
    expect(centerPane.classList.contains('no-transition')).toBe(true) // isResizing이 여전히 true

    // 5. 리사이즈 완료
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(centerPane.classList.contains('no-transition')).toBe(false)

    vi.useRealTimers()
  })

  it('연속 브라우저 리사이즈 이벤트가 발생해도 안정적으로 작동해야 함 (commit 0b19ed7)', () => {
    vi.useFakeTimers()
    const { container } = render(<App />)

    const centerPane = container.querySelector('.layout-centerpane') as HTMLElement

    // 1. 첫 번째 리사이즈
    act(() => {
      fireEvent(window, new Event('resize'))
    })
    expect(centerPane.classList.contains('no-transition')).toBe(true)

    // 2. 50ms 후 두 번째 리사이즈 (타이머 리셋됨)
    act(() => {
      vi.advanceTimersByTime(50)
      fireEvent(window, new Event('resize'))
    })
    expect(centerPane.classList.contains('no-transition')).toBe(true)

    // 3. 50ms 후 세 번째 리사이즈 (타이머 다시 리셋됨)
    act(() => {
      vi.advanceTimersByTime(50)
      fireEvent(window, new Event('resize'))
    })
    expect(centerPane.classList.contains('no-transition')).toBe(true)

    // 4. 마지막 리사이즈 후 100ms 대기 (총 타이머 완료)
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(centerPane.classList.contains('no-transition')).toBe(false)

    vi.useRealTimers()
  })
})
