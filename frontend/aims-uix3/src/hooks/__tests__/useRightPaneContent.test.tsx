/**
 * useRightPaneContent 훅 테스트
 *
 * @since 2025-12-05
 * @description
 * RightPane 콘텐츠 관리 훅의 동작을 검증합니다.
 * - 상태 초기화
 * - 문서 클릭 핸들러
 * - 고객 클릭 핸들러
 * - 전체 정보 페이지 열기/닫기
 * - 고객 정보 새로고침
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRightPaneContent, type UseRightPaneContentOptions } from '../useRightPaneContent'

// vi.hoisted를 사용하여 mock 함수들이 vi.mock과 함께 호이스팅되도록 함
const { mockApiGet, mockGetCustomer, mockRecordNavigation } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockGetCustomer: vi.fn(),
  mockRecordNavigation: vi.fn(),
}))

// api 모듈 mock
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: mockApiGet,
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  NetworkError: class NetworkError extends Error {
    constructor(message: string, public originalError?: Error) {
      super(message);
      this.name = 'NetworkError';
    }
  },
  TimeoutError: class TimeoutError extends Error {
    constructor(message = '요청 시간이 초과되었습니다') {
      super(message);
      this.name = 'TimeoutError';
    }
  },
}))

// errorReporter mock
vi.mock('@/shared/lib/errorReporter', () => ({
  errorReporter: {
    reportApiError: vi.fn(),
  },
}))

// CustomerService mock
vi.mock('@/services/customerService', () => ({
  CustomerService: {
    getCustomer: mockGetCustomer,
  },
}))

// useNavigationStore mock
vi.mock('@/shared/store/useNavigationStore', () => ({
  useNavigationStore: (selector: (state: { recordNavigation: typeof mockRecordNavigation }) => unknown) =>
    selector({ recordNavigation: mockRecordNavigation }),
}))

describe('useRightPaneContent', () => {
  // 기본 옵션
  const createDefaultOptions = (): UseRightPaneContentOptions => ({
    updateURLParams: vi.fn(),
    activeDocumentView: null,
    setActiveDocumentView: vi.fn(),
    setFullDetailCustomerId: vi.fn(),
    customerAllViewRefreshRef: { current: null },
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('초기 상태', () => {
    it('RightPane이 초기에 숨겨져 있어야 한다', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useRightPaneContent(options))

      expect(result.current.rightPaneVisible).toBe(false)
    })

    it('초기 콘텐츠 타입이 null이어야 한다', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useRightPaneContent(options))

      expect(result.current.rightPaneContentType).toBeNull()
    })

    it('선택된 문서가 초기에 null이어야 한다', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useRightPaneContent(options))

      expect(result.current.selectedDocument).toBeNull()
    })

    it('선택된 고객이 초기에 null이어야 한다', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useRightPaneContent(options))

      expect(result.current.selectedCustomer).toBeNull()
    })
  })

  describe('toggleRightPane', () => {
    it('RightPane 가시성을 토글해야 한다', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useRightPaneContent(options))

      expect(result.current.rightPaneVisible).toBe(false)

      act(() => {
        result.current.toggleRightPane()
      })

      expect(result.current.rightPaneVisible).toBe(true)

      act(() => {
        result.current.toggleRightPane()
      })

      expect(result.current.rightPaneVisible).toBe(false)
    })
  })

  describe('handleDocumentClick', () => {
    it('문서 클릭 시 RightPane을 열고 문서를 선택해야 한다', async () => {
      const options = createDefaultOptions()
      const mockDocument = {
        _id: 'doc123',
        filename: 'test.pdf',
        mimetype: 'application/pdf',
        file_url: 'https://example.com/test.pdf',
      }

      mockApiGet.mockResolvedValueOnce({
        success: true,
        data: { raw: mockDocument },
      })

      const { result } = renderHook(() => useRightPaneContent(options))

      await act(async () => {
        await result.current.handleDocumentClick('doc123')
      })

      expect(result.current.rightPaneVisible).toBe(true)
      expect(result.current.rightPaneContentType).toBe('document')
      expect(result.current.selectedDocument).not.toBeNull()
      expect(options.updateURLParams).toHaveBeenCalledWith({
        documentId: 'doc123',
        customerId: null,
      })
    })

    it('API 오류 시 RightPane을 열지 않아야 한다', async () => {
      const options = createDefaultOptions()

      mockApiGet.mockRejectedValueOnce(new Error('API Error'))

      const { result } = renderHook(() => useRightPaneContent(options))

      await act(async () => {
        await result.current.handleDocumentClick('doc123')
      })

      expect(result.current.rightPaneVisible).toBe(false)
      expect(result.current.selectedDocument).toBeNull()
    })

    it('문서 데이터가 없으면 RightPane을 열지 않아야 한다', async () => {
      const options = createDefaultOptions()

      mockApiGet.mockResolvedValueOnce({
        success: false,
        data: null,
      })

      const { result } = renderHook(() => useRightPaneContent(options))

      await act(async () => {
        await result.current.handleDocumentClick('doc123')
      })

      expect(result.current.rightPaneVisible).toBe(false)
      expect(result.current.selectedDocument).toBeNull()
    })
  })

  describe('handleCustomerClick', () => {
    const mockCustomer = {
      _id: 'customer123',
      name: '홍길동',
      phone: '010-1234-5678',
    }

    it('고객 클릭 시 RightPane을 열고 고객을 선택해야 한다', async () => {
      const options = createDefaultOptions()

      mockGetCustomer.mockResolvedValueOnce(mockCustomer)

      const { result } = renderHook(() => useRightPaneContent(options))

      await act(async () => {
        await result.current.handleCustomerClick('customer123')
      })

      expect(result.current.rightPaneVisible).toBe(true)
      expect(result.current.rightPaneContentType).toBe('customer')
      expect(result.current.selectedCustomer).toEqual(mockCustomer)
      expect(options.updateURLParams).toHaveBeenCalledWith({
        customerId: 'customer123',
        documentId: null,
        tab: null,
      })
    })

    it('customerData가 제공되면 API 호출 없이 사용해야 한다', async () => {
      const options = createDefaultOptions()

      const { result } = renderHook(() => useRightPaneContent(options))

      await act(async () => {
        await result.current.handleCustomerClick('customer123', mockCustomer as any)
      })

      expect(mockGetCustomer).not.toHaveBeenCalled()
      expect(result.current.selectedCustomer).toEqual(mockCustomer)
    })

    it('customerId가 null이면 RightPane을 닫아야 한다', async () => {
      const options = createDefaultOptions()

      const { result } = renderHook(() => useRightPaneContent(options))

      // 먼저 고객 선택
      await act(async () => {
        await result.current.handleCustomerClick('customer123', mockCustomer as any)
      })

      expect(result.current.rightPaneVisible).toBe(true)

      // null로 호출하여 닫기
      await act(async () => {
        await result.current.handleCustomerClick(null)
      })

      expect(result.current.rightPaneVisible).toBe(false)
      expect(result.current.selectedCustomer).toBeNull()
    })

    it('customers-full-detail 뷰에서는 RightPane을 열지만 URL을 변경하지 않아야 한다', async () => {
      const options = createDefaultOptions()
      options.activeDocumentView = 'customers-full-detail'

      const { result } = renderHook(() => useRightPaneContent(options))

      await act(async () => {
        await result.current.handleCustomerClick('customer123', mockCustomer as any)
      })

      // RightPane은 열림 (관계 고객 싱글클릭으로 요약보기 표시)
      expect(result.current.rightPaneVisible).toBe(true)
      expect(result.current.selectedCustomer).toEqual(mockCustomer)
      // URL 파라미터는 변경하지 않음 (전체보기 대상 고객 ID 보호)
      expect(options.updateURLParams).not.toHaveBeenCalled()
    })

    it('initialTab 파라미터가 URL에 전달되어야 한다', async () => {
      const options = createDefaultOptions()

      mockGetCustomer.mockResolvedValueOnce(mockCustomer)

      const { result } = renderHook(() => useRightPaneContent(options))

      await act(async () => {
        await result.current.handleCustomerClick('customer123', undefined, 'contracts')
      })

      expect(options.updateURLParams).toHaveBeenCalledWith({
        customerId: 'customer123',
        documentId: null,
        tab: 'contracts',
      })
    })
  })

  describe('handleOpenFullDetail', () => {
    it('전체 정보 페이지를 열어야 한다', async () => {
      const options = createDefaultOptions()
      // CustomerService.getCustomer mock 설정
      mockGetCustomer.mockResolvedValue({ _id: 'customer123', personal_info: { name: '테스트' } })

      const { result } = renderHook(() => useRightPaneContent(options))

      await act(async () => {
        await result.current.handleOpenFullDetail('customer123')
      })

      expect(options.setFullDetailCustomerId).toHaveBeenCalledWith('customer123')
      expect(options.setActiveDocumentView).toHaveBeenCalledWith('customers-full-detail')
      expect(result.current.rightPaneVisible).toBe(false)
      expect(result.current.selectedCustomer).toBeNull()
    })

    it('URL을 업데이트해야 한다', async () => {
      const options = createDefaultOptions()
      // CustomerService.getCustomer mock 설정
      mockGetCustomer.mockResolvedValue({ _id: 'customer123', personal_info: { name: '테스트' } })

      const { result } = renderHook(() => useRightPaneContent(options))

      await act(async () => {
        await result.current.handleOpenFullDetail('customer123')
      })

      expect(options.updateURLParams).toHaveBeenCalledWith({
        view: 'customers-full-detail',
        customerId: 'customer123',
        tab: null,
      })
    })

    it('recordNavigation을 internal 소스로 호출해야 한다', async () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useRightPaneContent(options))

      await act(async () => {
        await result.current.handleOpenFullDetail('customer123')
      })

      expect(mockRecordNavigation).toHaveBeenCalledWith('customers-full-detail', 'internal')
    })
  })

  describe('handleCloseFullDetail', () => {
    it('전체 정보 페이지를 닫고 기본 뷰로 돌아가야 한다', () => {
      const options = createDefaultOptions()

      const { result } = renderHook(() => useRightPaneContent(options))

      act(() => {
        result.current.handleCloseFullDetail()
      })

      expect(options.setFullDetailCustomerId).toHaveBeenCalledWith(null)
      expect(options.setActiveDocumentView).toHaveBeenCalledWith('customers-all')
    })

    it('복귀 시 recordNavigation을 sidebar 소스로 호출해야 한다 (BackButton 숨김)', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useRightPaneContent(options))

      act(() => {
        result.current.handleCloseFullDetail()
      })

      // 폴백 경로: customers-all로 복귀
      expect(mockRecordNavigation).toHaveBeenCalledWith('customers-all', 'sidebar')
    })
  })

  describe('handleExpandToExplorer', () => {
    it('recordNavigation을 internal 소스로 호출해야 한다', () => {
      const options = createDefaultOptions()
      options.setExplorerCustomerId = vi.fn()
      options.setExplorerCustomerName = vi.fn()
      options.setExplorerCustomerType = vi.fn()
      const { result } = renderHook(() => useRightPaneContent(options))

      act(() => {
        result.current.handleExpandToExplorer('customer123', '홍길동', '개인')
      })

      expect(mockRecordNavigation).toHaveBeenCalledWith('customer-document-explorer', 'internal')
      expect(options.setActiveDocumentView).toHaveBeenCalledWith('customer-document-explorer')
    })
  })

  describe('handleCollapseExplorer', () => {
    it('복귀 시 recordNavigation을 sidebar 소스로 호출해야 한다 (BackButton 숨김)', () => {
      const options = createDefaultOptions()
      options.setExplorerCustomerId = vi.fn()
      options.setExplorerCustomerName = vi.fn()
      const { result } = renderHook(() => useRightPaneContent(options))

      act(() => {
        result.current.handleCollapseExplorer()
      })

      // 폴백 경로: customers-all로 복귀
      expect(mockRecordNavigation).toHaveBeenCalledWith('customers-all', 'sidebar')
      expect(options.setActiveDocumentView).toHaveBeenCalledWith('customers-all')
    })
  })

  describe('handleCustomerRefresh', () => {
    it('선택된 고객이 없으면 아무것도 하지 않아야 한다', async () => {
      const options = createDefaultOptions()

      const { result } = renderHook(() => useRightPaneContent(options))

      await act(async () => {
        await result.current.handleCustomerRefresh()
      })

      expect(mockGetCustomer).not.toHaveBeenCalled()
    })

    it('선택된 고객이 있으면 새로고침해야 한다', async () => {
      const options = createDefaultOptions()
      const mockCustomer = {
        _id: 'customer123',
        name: '홍길동',
      }
      const updatedCustomer = {
        _id: 'customer123',
        name: '홍길동 (수정됨)',
      }

      mockGetCustomer
        .mockResolvedValueOnce(mockCustomer)
        .mockResolvedValueOnce(updatedCustomer)

      const { result } = renderHook(() => useRightPaneContent(options))

      // 먼저 고객 선택
      await act(async () => {
        await result.current.handleCustomerClick('customer123')
      })

      expect(result.current.selectedCustomer).toEqual(mockCustomer)

      // 새로고침
      await act(async () => {
        await result.current.handleCustomerRefresh()
      })

      expect(result.current.selectedCustomer).toEqual(updatedCustomer)
    })

    it('customerAllViewRefreshRef가 있으면 호출해야 한다', async () => {
      const mockRefresh = vi.fn()
      const options = createDefaultOptions()
      options.customerAllViewRefreshRef = { current: mockRefresh }

      const mockCustomer = { _id: 'customer123', name: '홍길동' }
      mockGetCustomer.mockResolvedValue(mockCustomer)

      const { result } = renderHook(() => useRightPaneContent(options))

      // 먼저 고객 선택
      await act(async () => {
        await result.current.handleCustomerClick('customer123')
      })

      // 새로고침
      await act(async () => {
        await result.current.handleCustomerRefresh()
      })

      expect(mockRefresh).toHaveBeenCalled()
    })
  })

  describe('handleCustomerDelete', () => {
    it('customerAllViewRefreshRef가 있으면 호출해야 한다', () => {
      const mockRefresh = vi.fn()
      const options = createDefaultOptions()
      options.customerAllViewRefreshRef = { current: mockRefresh }

      const { result } = renderHook(() => useRightPaneContent(options))

      act(() => {
        result.current.handleCustomerDelete()
      })

      expect(mockRefresh).toHaveBeenCalled()
    })

    it('customerAllViewRefreshRef가 없으면 오류 없이 실행되어야 한다', () => {
      const options = createDefaultOptions()
      options.customerAllViewRefreshRef = { current: null }

      const { result } = renderHook(() => useRightPaneContent(options))

      expect(() => {
        act(() => {
          result.current.handleCustomerDelete()
        })
      }).not.toThrow()
    })
  })

  describe('setters', () => {
    it('setRightPaneVisible이 상태를 변경해야 한다', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useRightPaneContent(options))

      act(() => {
        result.current.setRightPaneVisible(true)
      })

      expect(result.current.rightPaneVisible).toBe(true)
    })

    it('setRightPaneContentType이 상태를 변경해야 한다', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useRightPaneContent(options))

      act(() => {
        result.current.setRightPaneContentType('customer')
      })

      expect(result.current.rightPaneContentType).toBe('customer')
    })
  })
})
