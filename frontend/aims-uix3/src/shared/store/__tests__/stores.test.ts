/**
 * Zustand Stores Tests
 * @since 2025-12-07
 * @version 1.0.0
 *
 * 공유 Zustand 스토어 테스트
 * - useDevModeStore: 개발자 모드 상태
 * - useLayoutStore: 레이아웃 상태
 * - useRecentCustomersStore: 최근 고객 상태
 * - useAccountSettingsStore: 계정 설정 상태
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from '@testing-library/react'
import { useDevModeStore } from '../useDevModeStore'
import { useLayoutStore, DEFAULT_CENTER_WIDTH_PERCENT } from '../useLayoutStore'
import { useRecentCustomersStore } from '../useRecentCustomersStore'
import { useAccountSettingsStore } from '../useAccountSettingsStore'
import type { Customer } from '@/entities/customer'

// ==================== Mock Setup ====================

// localStorage 모킹
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// console.log 모킹
const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

// ==================== Mock Data ====================

const createMockCustomer = (id: string, name: string): Customer => ({
  _id: id,
  personal_info: {
    name,
    mobile_phone: '010-1234-5678',
    address: {
      address1: '서울시 강남구',
      address2: '테헤란로 123',
    },
  },
  insurance_info: {
    customer_type: '개인',
  },
  contracts: [],
  documents: [],
  consultations: [],
  meta: {
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-15T00:00:00.000Z',
    status: 'active',
  },
  tags: [],
})

// ==================== Tests ====================

describe('useDevModeStore', () => {
  beforeEach(() => {
    localStorageMock.clear()
    // 스토어 리셋
    useDevModeStore.setState({ isDevMode: false })
  })

  afterEach(() => {
    consoleSpy.mockClear()
  })

  describe('초기 상태', () => {
    it('기본값은 false', () => {
      const { isDevMode } = useDevModeStore.getState()
      expect(isDevMode).toBe(false)
    })
  })

  describe('toggleDevMode', () => {
    it('개발자 모드를 토글할 수 있음', () => {
      const store = useDevModeStore.getState()
      expect(store.isDevMode).toBe(false)

      act(() => {
        store.toggleDevMode()
      })

      expect(useDevModeStore.getState().isDevMode).toBe(true)
      expect(localStorageMock.setItem).toHaveBeenCalledWith('aims_dev_mode', 'true')

      act(() => {
        useDevModeStore.getState().toggleDevMode()
      })

      expect(useDevModeStore.getState().isDevMode).toBe(false)
      expect(localStorageMock.setItem).toHaveBeenCalledWith('aims_dev_mode', 'false')
    })
  })

  describe('setDevMode', () => {
    it('개발자 모드를 직접 설정할 수 있음', () => {
      act(() => {
        useDevModeStore.getState().setDevMode(true)
      })

      expect(useDevModeStore.getState().isDevMode).toBe(true)
      expect(localStorageMock.setItem).toHaveBeenCalledWith('aims_dev_mode', 'true')

      act(() => {
        useDevModeStore.getState().setDevMode(false)
      })

      expect(useDevModeStore.getState().isDevMode).toBe(false)
    })
  })
})

describe('useLayoutStore', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.useFakeTimers()
    // 스토어 리셋
    useLayoutStore.setState({
      headerVisible: true,
      leftPaneVisible: true,
      centerPaneVisible: true,
      rightPaneVisible: false,
      mainPaneVisible: true,
      brbVisible: true,
      paginationVisible: true,
      centerWidth: DEFAULT_CENTER_WIDTH_PERCENT,
      leftPaneCollapsed: false,
      leftPaneAnimationState: 'idle',
      isDraggingBRB: false,
      isResizing: false,
      resizeTimer: null,
      layoutControlModalOpen: false,
      modalClickProtection: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('초기 상태', () => {
    it('기본 visibility 상태가 올바름', () => {
      const state = useLayoutStore.getState()
      expect(state.headerVisible).toBe(true)
      expect(state.leftPaneVisible).toBe(true)
      expect(state.centerPaneVisible).toBe(true)
      expect(state.rightPaneVisible).toBe(false)
      expect(state.mainPaneVisible).toBe(true)
    })

    it('기본 크기가 올바름', () => {
      const state = useLayoutStore.getState()
      expect(state.centerWidth).toBe(DEFAULT_CENTER_WIDTH_PERCENT)
    })
  })

  describe('visibility 토글', () => {
    it('toggleHeader로 헤더를 토글할 수 있음', () => {
      act(() => {
        useLayoutStore.getState().toggleHeader()
      })
      expect(useLayoutStore.getState().headerVisible).toBe(false)

      act(() => {
        useLayoutStore.getState().toggleHeader()
      })
      expect(useLayoutStore.getState().headerVisible).toBe(true)
    })

    it('toggleLeftPane로 왼쪽 패널을 토글할 수 있음', () => {
      act(() => {
        useLayoutStore.getState().toggleLeftPane()
      })
      expect(useLayoutStore.getState().leftPaneVisible).toBe(false)
    })

    it('toggleCenterPane로 센터 패널을 토글할 수 있음', () => {
      act(() => {
        useLayoutStore.getState().toggleCenterPane()
      })
      expect(useLayoutStore.getState().centerPaneVisible).toBe(false)

      act(() => {
        useLayoutStore.getState().toggleCenterPane()
      })
      expect(useLayoutStore.getState().centerPaneVisible).toBe(true)
    })

    it('toggleRightPane로 오른쪽 패널을 토글할 수 있음', () => {
      act(() => {
        useLayoutStore.getState().toggleRightPane()
      })
      expect(useLayoutStore.getState().rightPaneVisible).toBe(true)
    })

    it('toggleMainPane로 메인 패널을 토글할 수 있음', () => {
      act(() => {
        useLayoutStore.getState().toggleMainPane()
      })
      expect(useLayoutStore.getState().mainPaneVisible).toBe(false)
    })

    it('toggleBrb로 BRB를 토글할 수 있음', () => {
      act(() => {
        useLayoutStore.getState().toggleBrb()
      })
      expect(useLayoutStore.getState().brbVisible).toBe(false)
    })

    it('togglePagination로 페이지네이션을 토글할 수 있음', () => {
      act(() => {
        useLayoutStore.getState().togglePagination()
      })
      expect(useLayoutStore.getState().paginationVisible).toBe(false)
    })
  })

  describe('visibility setter', () => {
    it('setHeaderVisible로 헤더를 설정할 수 있음', () => {
      act(() => {
        useLayoutStore.getState().setHeaderVisible(false)
      })
      expect(useLayoutStore.getState().headerVisible).toBe(false)
    })

    it('setLeftPaneVisible로 왼쪽 패널을 설정할 수 있음', () => {
      act(() => {
        useLayoutStore.getState().setLeftPaneVisible(false)
      })
      expect(useLayoutStore.getState().leftPaneVisible).toBe(false)
    })

    it('setCenterPaneVisible로 센터 패널을 설정할 수 있음', () => {
      act(() => {
        useLayoutStore.getState().setCenterPaneVisible(false)
      })
      expect(useLayoutStore.getState().centerPaneVisible).toBe(false)
    })

    it('setRightPaneVisible로 오른쪽 패널을 설정할 수 있음', () => {
      act(() => {
        useLayoutStore.getState().setRightPaneVisible(true)
      })
      expect(useLayoutStore.getState().rightPaneVisible).toBe(true)
    })

    it('setMainPaneVisible로 메인 패널을 설정할 수 있음', () => {
      act(() => {
        useLayoutStore.getState().setMainPaneVisible(false)
      })
      expect(useLayoutStore.getState().mainPaneVisible).toBe(false)
    })

    it('setBrbVisible로 BRB를 설정할 수 있음', () => {
      act(() => {
        useLayoutStore.getState().setBrbVisible(false)
      })
      expect(useLayoutStore.getState().brbVisible).toBe(false)
    })

    it('setPaginationVisible로 페이지네이션을 설정할 수 있음', () => {
      act(() => {
        useLayoutStore.getState().setPaginationVisible(false)
      })
      expect(useLayoutStore.getState().paginationVisible).toBe(false)
    })
  })

  describe('centerWidth 관리', () => {
    it('setCenterWidth로 너비를 설정할 수 있음', () => {
      act(() => {
        useLayoutStore.getState().setCenterWidth(75)
      })
      expect(useLayoutStore.getState().centerWidth).toBe(75)
    })

    it('resetCenterWidth로 기본값으로 리셋할 수 있음', () => {
      act(() => {
        useLayoutStore.getState().setCenterWidth(75)
      })
      expect(useLayoutStore.getState().centerWidth).toBe(75)

      act(() => {
        useLayoutStore.getState().resetCenterWidth()
      })
      expect(useLayoutStore.getState().centerWidth).toBe(DEFAULT_CENTER_WIDTH_PERCENT)
    })
  })

  describe('leftPaneCollapsed', () => {
    it('toggleLeftPaneCollapsed로 접기/펼치기 토글', () => {
      act(() => {
        useLayoutStore.getState().toggleLeftPaneCollapsed()
      })
      expect(useLayoutStore.getState().leftPaneCollapsed).toBe(true)
      expect(useLayoutStore.getState().leftPaneAnimationState).toBe('collapsing')

      // 애니메이션 완료 대기
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(useLayoutStore.getState().leftPaneAnimationState).toBe('idle')
    })

    it('setLeftPaneCollapsed로 직접 설정할 수 있음', () => {
      act(() => {
        useLayoutStore.getState().setLeftPaneCollapsed(true)
      })
      expect(useLayoutStore.getState().leftPaneCollapsed).toBe(true)
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'aims-leftPaneCollapsed',
        'true'
      )
    })
  })

  describe('드래그/리사이즈 상태', () => {
    it('setIsDraggingBRB로 드래그 상태를 설정할 수 있음', () => {
      act(() => {
        useLayoutStore.getState().setIsDraggingBRB(true)
      })
      expect(useLayoutStore.getState().isDraggingBRB).toBe(true)
    })

    it('setIsResizing으로 리사이즈 상태를 설정할 수 있음', () => {
      act(() => {
        useLayoutStore.getState().setIsResizing(true)
      })
      expect(useLayoutStore.getState().isResizing).toBe(true)
    })

    it('setResizeTimer로 타이머를 설정할 수 있음', () => {
      const timer = setTimeout(() => {}, 1000)

      act(() => {
        useLayoutStore.getState().setResizeTimer(timer)
      })
      expect(useLayoutStore.getState().resizeTimer).toBe(timer)

      act(() => {
        useLayoutStore.getState().setResizeTimer(null)
      })
      expect(useLayoutStore.getState().resizeTimer).toBeNull()
    })

    it('새 타이머 설정 시 기존 타이머를 정리함', () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
      const timer1 = setTimeout(() => {}, 1000)
      const timer2 = setTimeout(() => {}, 2000)

      act(() => {
        useLayoutStore.getState().setResizeTimer(timer1)
      })
      act(() => {
        useLayoutStore.getState().setResizeTimer(timer2)
      })

      expect(clearTimeoutSpy).toHaveBeenCalledWith(timer1)
      clearTimeoutSpy.mockRestore()
    })
  })

  describe('애니메이션 상태', () => {
    it('setLeftPaneAnimationState로 애니메이션 상태를 설정할 수 있음', () => {
      act(() => {
        useLayoutStore.getState().setLeftPaneAnimationState('expanding')
      })
      expect(useLayoutStore.getState().leftPaneAnimationState).toBe('expanding')

      act(() => {
        useLayoutStore.getState().setLeftPaneAnimationState('collapsing')
      })
      expect(useLayoutStore.getState().leftPaneAnimationState).toBe('collapsing')

      act(() => {
        useLayoutStore.getState().setLeftPaneAnimationState('idle')
      })
      expect(useLayoutStore.getState().leftPaneAnimationState).toBe('idle')
    })
  })

  describe('모달 상태', () => {
    it('openLayoutControlModal로 모달을 열 수 있음', () => {
      act(() => {
        useLayoutStore.getState().openLayoutControlModal()
      })
      expect(useLayoutStore.getState().layoutControlModalOpen).toBe(true)
      expect(useLayoutStore.getState().modalClickProtection).toBe(true)

      // 클릭 보호 해제
      act(() => {
        vi.advanceTimersByTime(100)
      })
      expect(useLayoutStore.getState().modalClickProtection).toBe(false)
    })

    it('closeLayoutControlModal로 모달을 닫을 수 있음', () => {
      act(() => {
        useLayoutStore.getState().openLayoutControlModal()
      })
      act(() => {
        useLayoutStore.getState().closeLayoutControlModal()
      })
      expect(useLayoutStore.getState().layoutControlModalOpen).toBe(false)
    })

    it('모달이 이미 열려있으면 다시 열지 않음', () => {
      act(() => {
        useLayoutStore.getState().openLayoutControlModal()
      })

      act(() => {
        useLayoutStore.getState().openLayoutControlModal()
      })
      // modalClickProtection이 그대로 유지됨 (재호출 안됨)
      expect(useLayoutStore.getState().layoutControlModalOpen).toBe(true)
    })

    it('클릭 보호 중에는 모달을 열 수 없음', () => {
      act(() => {
        useLayoutStore.getState().setModalClickProtection(true)
      })

      act(() => {
        useLayoutStore.getState().openLayoutControlModal()
      })

      expect(useLayoutStore.getState().layoutControlModalOpen).toBe(false)
    })

    it('setModalClickProtection으로 클릭 보호를 설정할 수 있음', () => {
      act(() => {
        useLayoutStore.getState().setModalClickProtection(true)
      })
      expect(useLayoutStore.getState().modalClickProtection).toBe(true)

      act(() => {
        useLayoutStore.getState().setModalClickProtection(false)
      })
      expect(useLayoutStore.getState().modalClickProtection).toBe(false)
    })
  })
})

describe('useRecentCustomersStore', () => {
  beforeEach(() => {
    localStorageMock.clear()
    // 스토어 리셋
    useRecentCustomersStore.setState({ recentCustomers: [] })
    consoleSpy.mockClear()
  })

  describe('초기 상태', () => {
    it('빈 배열로 시작', () => {
      const { recentCustomers } = useRecentCustomersStore.getState()
      expect(recentCustomers).toEqual([])
    })
  })

  describe('addRecentCustomer', () => {
    it('고객을 최근 목록에 추가할 수 있음', () => {
      const customer = createMockCustomer('cust-001', '홍길동')

      act(() => {
        useRecentCustomersStore.getState().addRecentCustomer(customer)
      })

      const { recentCustomers } = useRecentCustomersStore.getState()
      expect(recentCustomers).toHaveLength(1)
      expect(recentCustomers[0].name).toBe('홍길동')
      expect(recentCustomers[0]._id).toBe('cust-001')
    })

    it('중복 고객은 맨 앞으로 이동', () => {
      const customer1 = createMockCustomer('cust-001', '홍길동')
      const customer2 = createMockCustomer('cust-002', '김영희')

      act(() => {
        useRecentCustomersStore.getState().addRecentCustomer(customer1)
      })
      act(() => {
        useRecentCustomersStore.getState().addRecentCustomer(customer2)
      })
      act(() => {
        useRecentCustomersStore.getState().addRecentCustomer(customer1) // 다시 추가
      })

      const { recentCustomers } = useRecentCustomersStore.getState()
      expect(recentCustomers).toHaveLength(2)
      expect(recentCustomers[0]._id).toBe('cust-001') // 홍길동이 맨 앞
    })

    it('최대 5개까지만 유지', () => {
      for (let i = 1; i <= 7; i++) {
        act(() => {
          useRecentCustomersStore
            .getState()
            .addRecentCustomer(createMockCustomer(`cust-00${i}`, `고객${i}`))
        })
      }

      const { recentCustomers } = useRecentCustomersStore.getState()
      expect(recentCustomers).toHaveLength(5)
      // 가장 최근에 추가된 고객이 맨 앞
      expect(recentCustomers[0]._id).toBe('cust-007')
    })

    it('전화번호와 주소가 올바르게 저장됨', () => {
      const customer = createMockCustomer('cust-001', '홍길동')

      act(() => {
        useRecentCustomersStore.getState().addRecentCustomer(customer)
      })

      const { recentCustomers } = useRecentCustomersStore.getState()
      expect(recentCustomers[0].phone).toBe('010-1234-5678')
      expect(recentCustomers[0].address).toBe('서울시 강남구 테헤란로 123')
    })
  })

  describe('removeRecentCustomer', () => {
    it('특정 고객을 목록에서 제거할 수 있음', () => {
      act(() => {
        useRecentCustomersStore
          .getState()
          .addRecentCustomer(createMockCustomer('cust-001', '홍길동'))
      })
      act(() => {
        useRecentCustomersStore
          .getState()
          .addRecentCustomer(createMockCustomer('cust-002', '김영희'))
      })

      act(() => {
        useRecentCustomersStore.getState().removeRecentCustomer('cust-001')
      })

      const { recentCustomers } = useRecentCustomersStore.getState()
      expect(recentCustomers).toHaveLength(1)
      expect(recentCustomers[0]._id).toBe('cust-002')
    })
  })

  describe('clearRecentCustomers', () => {
    it('모든 최근 고객을 초기화할 수 있음', () => {
      act(() => {
        useRecentCustomersStore
          .getState()
          .addRecentCustomer(createMockCustomer('cust-001', '홍길동'))
      })
      act(() => {
        useRecentCustomersStore
          .getState()
          .addRecentCustomer(createMockCustomer('cust-002', '김영희'))
      })

      act(() => {
        useRecentCustomersStore.getState().clearRecentCustomers()
      })

      const { recentCustomers } = useRecentCustomersStore.getState()
      expect(recentCustomers).toHaveLength(0)
    })
  })

  describe('getRecentCustomers', () => {
    it('최신순으로 정렬된 목록을 반환', () => {
      // 시간 차이를 두고 추가
      act(() => {
        useRecentCustomersStore
          .getState()
          .addRecentCustomer(createMockCustomer('cust-001', '홍길동'))
      })

      const result = useRecentCustomersStore.getState().getRecentCustomers()
      expect(result).toHaveLength(1)
      expect(result[0]._id).toBe('cust-001')
    })
  })
})

describe('useAccountSettingsStore', () => {
  beforeEach(() => {
    // 스토어 리셋
    useAccountSettingsStore.setState({
      openRequested: false,
      setActiveDocumentView: null,
      setRightPaneVisible: null,
      setSelectedDocument: null,
      setSelectedCustomer: null,
      setRightPaneContentType: null,
      updateURLParams: null,
    })
  })

  describe('초기 상태', () => {
    it('openRequested가 false로 시작', () => {
      const { openRequested } = useAccountSettingsStore.getState()
      expect(openRequested).toBe(false)
    })

    it('모든 setter가 null로 시작', () => {
      const state = useAccountSettingsStore.getState()
      expect(state.setActiveDocumentView).toBeNull()
      expect(state.setRightPaneVisible).toBeNull()
      expect(state.setSelectedDocument).toBeNull()
      expect(state.setSelectedCustomer).toBeNull()
      expect(state.setRightPaneContentType).toBeNull()
      expect(state.updateURLParams).toBeNull()
    })
  })

  describe('requestOpenAccountSettings', () => {
    it('openRequested를 true로 설정', () => {
      act(() => {
        useAccountSettingsStore.getState().requestOpenAccountSettings()
      })
      expect(useAccountSettingsStore.getState().openRequested).toBe(true)
    })
  })

  describe('clearOpenRequest', () => {
    it('openRequested를 false로 리셋', () => {
      act(() => {
        useAccountSettingsStore.getState().requestOpenAccountSettings()
      })
      expect(useAccountSettingsStore.getState().openRequested).toBe(true)

      act(() => {
        useAccountSettingsStore.getState().clearOpenRequest()
      })
      expect(useAccountSettingsStore.getState().openRequested).toBe(false)
    })
  })

  describe('registerSetters (Legacy API)', () => {
    it('setter들을 등록할 수 있음', () => {
      const mockSetters = {
        setActiveDocumentView: vi.fn(),
        setRightPaneVisible: vi.fn(),
        setSelectedDocument: vi.fn(),
        setSelectedCustomer: vi.fn(),
        setRightPaneContentType: vi.fn(),
        updateURLParams: vi.fn(),
      }

      act(() => {
        useAccountSettingsStore.getState().registerSetters(mockSetters)
      })

      const state = useAccountSettingsStore.getState()
      expect(state.setActiveDocumentView).toBe(mockSetters.setActiveDocumentView)
      expect(state.setRightPaneVisible).toBe(mockSetters.setRightPaneVisible)
    })
  })

  describe('openAccountSettingsView (Legacy API)', () => {
    it('openRequested를 true로 설정하고 등록된 setter들을 호출', () => {
      const mockSetters = {
        setActiveDocumentView: vi.fn(),
        setRightPaneVisible: vi.fn(),
        setSelectedDocument: vi.fn(),
        setSelectedCustomer: vi.fn(),
        setRightPaneContentType: vi.fn(),
        updateURLParams: vi.fn(),
      }

      act(() => {
        useAccountSettingsStore.getState().registerSetters(mockSetters)
      })

      act(() => {
        useAccountSettingsStore.getState().openAccountSettingsView()
      })

      expect(useAccountSettingsStore.getState().openRequested).toBe(true)
      expect(mockSetters.setRightPaneVisible).toHaveBeenCalledWith(false)
      expect(mockSetters.setSelectedDocument).toHaveBeenCalledWith(null)
      expect(mockSetters.setSelectedCustomer).toHaveBeenCalledWith(null)
      expect(mockSetters.setRightPaneContentType).toHaveBeenCalledWith(null)
      expect(mockSetters.setActiveDocumentView).toHaveBeenCalledWith('account-settings')
    })
  })
})
