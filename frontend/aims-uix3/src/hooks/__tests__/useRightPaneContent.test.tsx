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
import { renderHook, act, waitFor } from '@testing-library/react'
import { useRightPaneContent, type UseRightPaneContentOptions } from '../useRightPaneContent'

// api 모듈 mock
const mockApiGet = vi.fn()
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

// CustomerService mock
const mockGetCustomer = vi.fn()
vi.mock('@/services/customerService', () => ({
  CustomerService: {
    getCustomer: (...args: unknown[]) => mockGetCustomer(...args),
  },
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

    it('customers-full-detail 뷰에서는 RightPane을 열지 않아야 한다', async () => {
      const options = createDefaultOptions()
      options.activeDocumentView = 'customers-full-detail'

      const { result } = renderHook(() => useRightPaneContent(options))

      await act(async () => {
        await result.current.handleCustomerClick('customer123', mockCustomer as any)
      })

      expect(result.current.rightPaneVisible).toBe(false)
      expect(result.current.selectedCustomer).toBeNull()
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
    it('전체 정보 페이지를 열어야 한다', () => {
      const options = createDefaultOptions()

      const { result } = renderHook(() => useRightPaneContent(options))

      act(() => {
        result.current.handleOpenFullDetail('customer123')
      })

      expect(options.setFullDetailCustomerId).toHaveBeenCalledWith('customer123')
      expect(options.setActiveDocumentView).toHaveBeenCalledWith('customers-full-detail')
      expect(result.current.rightPaneVisible).toBe(false)
      expect(result.current.selectedCustomer).toBeNull()
    })

    it('URL을 업데이트해야 한다', () => {
      const options = createDefaultOptions()

      const { result } = renderHook(() => useRightPaneContent(options))

      act(() => {
        result.current.handleOpenFullDetail('customer123')
      })

      expect(options.updateURLParams).toHaveBeenCalledWith({
        view: 'customers-full-detail',
        customerId: 'customer123',
        tab: null,
      })
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
