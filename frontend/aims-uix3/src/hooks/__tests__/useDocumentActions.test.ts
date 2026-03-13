/**
 * useDocumentActions Hook 테스트
 * 문서 삭제/이름변경 공통 로직 검증
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDocumentActions } from '../useDocumentActions'

// Mock dependencies
const mockShowConfirm = vi.fn()
const mockShowAlert = vi.fn()

vi.mock('@/contexts/AppleConfirmProvider', () => ({
  useAppleConfirm: () => ({
    showConfirm: mockShowConfirm,
    showAlert: mockShowAlert,
  }),
}))

const mockApiDelete = vi.fn()
const mockApiPatch = vi.fn()

vi.mock('@/shared/lib/api', () => ({
  api: {
    delete: (...args: unknown[]) => mockApiDelete(...args),
    patch: (...args: unknown[]) => mockApiPatch(...args),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'ApiError'
    }
  },
}))

vi.mock('@/shared/lib/errorReporter', () => ({
  errorReporter: {
    reportApiError: vi.fn(),
  },
}))

/** 테스트용 기본 콜백 */
const mockOnDeleteSuccess = vi.fn()
const mockOnRenameSuccess = vi.fn()
const defaultOptions = () => ({
  onDeleteSuccess: mockOnDeleteSuccess,
  onRenameSuccess: mockOnRenameSuccess,
})

describe('useDocumentActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('deleteDocument', () => {
    it('확인 모달에서 취소하면 삭제하지 않음', async () => {
      mockShowConfirm.mockResolvedValue(false)

      const { result } = renderHook(() => useDocumentActions(defaultOptions()))

      await act(async () => {
        await result.current.deleteDocument('doc123', 'test.pdf')
      })

      expect(mockShowConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '문서 삭제',
          confirmStyle: 'destructive',
        })
      )
      expect(mockApiDelete).not.toHaveBeenCalled()
    })

    it('확인 모달에서 승인하면 API 호출 후 onDeleteSuccess 콜백 호출', async () => {
      mockShowConfirm.mockResolvedValue(true)
      mockApiDelete.mockResolvedValue({})

      const { result } = renderHook(() => useDocumentActions(defaultOptions()))

      await act(async () => {
        await result.current.deleteDocument('doc123', 'test.pdf')
      })

      expect(mockApiDelete).toHaveBeenCalledWith('/api/documents/doc123')
      expect(mockOnDeleteSuccess).toHaveBeenCalled()
    })

    it('API 에러 시 에러 알림 표시', async () => {
      mockShowConfirm.mockResolvedValue(true)
      mockApiDelete.mockRejectedValue(new Error('Server error'))
      mockShowAlert.mockResolvedValue(undefined)

      const { result } = renderHook(() => useDocumentActions(defaultOptions()))

      await act(async () => {
        await result.current.deleteDocument('doc123', 'test.pdf')
      })

      expect(mockShowAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '삭제 실패',
        })
      )
      expect(mockOnDeleteSuccess).not.toHaveBeenCalled()
    })

    it('커스텀 onDeleteSuccess 콜백 호출', async () => {
      mockShowConfirm.mockResolvedValue(true)
      mockApiDelete.mockResolvedValue({})
      const customCallback = vi.fn()

      const { result } = renderHook(() =>
        useDocumentActions({ onDeleteSuccess: customCallback, onRenameSuccess: mockOnRenameSuccess })
      )

      await act(async () => {
        await result.current.deleteDocument('doc123', 'test.pdf')
      })

      expect(customCallback).toHaveBeenCalled()
    })
  })

  describe('deleteDocuments (다중 삭제)', () => {
    it('빈 Set이면 선택 항목 없음 알림', async () => {
      mockShowAlert.mockResolvedValue(undefined)

      const { result } = renderHook(() => useDocumentActions(defaultOptions()))

      await act(async () => {
        await result.current.deleteDocuments(new Set())
      })

      expect(mockShowAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '선택 항목 없음',
        })
      )
      expect(mockApiDelete).not.toHaveBeenCalled()
    })

    it('확인 모달에서 취소하면 삭제하지 않음', async () => {
      mockShowConfirm.mockResolvedValue(false)

      const { result } = renderHook(() => useDocumentActions(defaultOptions()))

      await act(async () => {
        await result.current.deleteDocuments(new Set(['doc1', 'doc2']))
      })

      expect(mockApiDelete).not.toHaveBeenCalled()
    })

    it('다중 문서 삭제 성공', async () => {
      mockShowConfirm.mockResolvedValue(true)
      mockApiDelete.mockResolvedValue({})

      const { result } = renderHook(() => useDocumentActions(defaultOptions()))

      await act(async () => {
        await result.current.deleteDocuments(new Set(['doc1', 'doc2', 'doc3']))
      })

      expect(mockApiDelete).toHaveBeenCalledTimes(3)
      expect(mockOnDeleteSuccess).toHaveBeenCalled()
    })

    it('일부 삭제 실패 시 실패 개수 알림 + 성공 건이 있으므로 콜백 호출', async () => {
      mockShowConfirm.mockResolvedValue(true)
      mockApiDelete
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce({})
      mockShowAlert.mockResolvedValue(undefined)

      const { result } = renderHook(() => useDocumentActions(defaultOptions()))

      await act(async () => {
        await result.current.deleteDocuments(new Set(['doc1', 'doc2', 'doc3']))
      })

      expect(mockShowAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '1개의 문서 삭제에 실패했습니다.',
        })
      )
      // 성공 건(2개)이 있으므로 콜백 호출
      expect(mockOnDeleteSuccess).toHaveBeenCalled()
    })

    it('전체 삭제 실패 시 콜백 호출하지 않음', async () => {
      mockShowConfirm.mockResolvedValue(true)
      mockApiDelete
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
      mockShowAlert.mockResolvedValue(undefined)

      const { result } = renderHook(() => useDocumentActions(defaultOptions()))

      await act(async () => {
        await result.current.deleteDocuments(new Set(['doc1', 'doc2']))
      })

      expect(mockShowAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '2개의 문서 삭제에 실패했습니다.',
        })
      )
      // 성공 건이 0개이므로 콜백 호출 안 됨
      expect(mockOnDeleteSuccess).not.toHaveBeenCalled()
    })
  })

  describe('renameDocument', () => {
    it('이름 변경 성공 시 onRenameSuccess 콜백 호출', async () => {
      mockApiPatch.mockResolvedValue({})

      const { result } = renderHook(() => useDocumentActions(defaultOptions()))

      let success = false
      await act(async () => {
        success = await result.current.renameDocument('doc123', 'newName.pdf')
      })

      expect(success).toBe(true)
      expect(mockApiPatch).toHaveBeenCalledWith(
        '/api/documents/doc123/display-name',
        { displayName: 'newName.pdf' }
      )
      expect(mockOnRenameSuccess).toHaveBeenCalled()
    })

    it('이름 변경 실패 시 에러 알림', async () => {
      mockApiPatch.mockRejectedValue(new Error('Server error'))
      mockShowAlert.mockResolvedValue(undefined)

      const { result } = renderHook(() => useDocumentActions(defaultOptions()))

      let success = true
      await act(async () => {
        success = await result.current.renameDocument('doc123', 'newName.pdf')
      })

      expect(success).toBe(false)
      expect(mockShowAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '이름 변경 실패',
        })
      )
      expect(mockOnRenameSuccess).not.toHaveBeenCalled()
    })

    it('커스텀 onRenameSuccess 콜백 호출', async () => {
      mockApiPatch.mockResolvedValue({})
      const customCallback = vi.fn()

      const { result } = renderHook(() =>
        useDocumentActions({ onRenameSuccess: customCallback, onDeleteSuccess: mockOnDeleteSuccess })
      )

      await act(async () => {
        await result.current.renameDocument('doc123', 'newName.pdf')
      })

      expect(customCallback).toHaveBeenCalled()
    })
  })
})
