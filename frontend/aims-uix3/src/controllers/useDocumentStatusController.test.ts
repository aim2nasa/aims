/**
 * useDocumentStatusController Hook Tests
 * @since 1.0.0
 *
 * COMPONENT_GUIDE.md 준수: Controller Hook Testing (라인 614-667)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDocumentStatusController } from './useDocumentStatusController'
import * as DocumentStatusContext from '../contexts/DocumentStatusContext'
import type { Document } from '../types/documentStatus'

// Mock Context
const mockContextValue = {
  state: {
    documents: [] as Document[],
    filteredDocuments: [] as Document[],
    isLoading: false,
    error: null,
    statusFilter: 'all' as const,
    isPollingEnabled: false,
    lastUpdated: null,
    selectedDocument: null,
    searchTerm: '',
    apiHealth: true,
  },
  actions: {
    setStatusFilter: vi.fn(),
    togglePolling: vi.fn(),
    refreshDocuments: vi.fn(),
  },
}

vi.mock('../contexts/DocumentStatusContext', () => ({
  useDocumentStatusContext: vi.fn(),
}))

describe('useDocumentStatusController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(DocumentStatusContext.useDocumentStatusContext).mockReturnValue(mockContextValue as unknown as DocumentStatusContext.DocumentStatusContextValue)
  })

  describe('초기 상태', () => {
    it('초기 모달 상태가 올바르게 설정된다', () => {
      const { result } = renderHook(() => useDocumentStatusController())

      // Detail Modal
      expect(result.current.selectedDocument).toBeNull()
      expect(result.current.isDetailModalVisible).toBe(false)

      // Summary Modal
      expect(result.current.selectedDocumentForSummary).toBeNull()
      expect(result.current.isSummaryModalVisible).toBe(false)

      // Full Text Modal
      expect(result.current.selectedDocumentForFullText).toBeNull()
      expect(result.current.isFullTextModalVisible).toBe(false)
    })

    it('Context 상태를 올바르게 노출한다', () => {
      const { result } = renderHook(() => useDocumentStatusController())

      expect(result.current.documents).toEqual([])
      expect(result.current.filteredDocuments).toEqual([])
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeNull()
      expect(result.current.statusFilter).toBe('all')
      expect(result.current.isPollingEnabled).toBe(false)
    })

    it('Context actions를 올바르게 노출한다', () => {
      const { result } = renderHook(() => useDocumentStatusController())

      expect(result.current.setStatusFilter).toBeDefined()
      expect(result.current.togglePolling).toBeDefined()
      expect(result.current.refreshDocuments).toBeDefined()
    })
  })

  describe('Document Detail Modal', () => {
    it('handleDocumentClick가 모달을 올바르게 연다', () => {
      const { result } = renderHook(() => useDocumentStatusController())

      const mockDocument: Document = {
        _id: 'test-doc-1',
        filename: 'test.pdf',
        uploadedDate: '2025-01-01T00:00:00Z',
        stages: {
          upload: { status: 'completed' },
          meta: { status: 'completed' },
          ocr: { status: 'completed' },
          tag: { status: 'completed' },
        },
      } as Document

      act(() => {
        result.current.handleDocumentClick(mockDocument)
      })

      expect(result.current.selectedDocument).toEqual(mockDocument)
      expect(result.current.isDetailModalVisible).toBe(true)
    })

    it('handleDetailModalClose가 모달을 올바르게 닫는다', () => {
      const { result } = renderHook(() => useDocumentStatusController())

      const mockDocument: Document = {
        _id: 'test-doc-1',
        filename: 'test.pdf',
      } as Document

      // 먼저 모달 열기
      act(() => {
        result.current.handleDocumentClick(mockDocument)
      })

      // 모달 닫기
      act(() => {
        result.current.handleDetailModalClose()
      })

      expect(result.current.isDetailModalVisible).toBe(false)
      // selectedDocument는 애니메이션 후 null이 되므로 여기선 테스트하지 않음
    })
  })

  describe('Document Summary Modal', () => {
    it('handleDocumentSummary가 모달을 올바르게 연다', () => {
      const { result } = renderHook(() => useDocumentStatusController())

      const mockDocument: Document = {
        _id: 'test-doc-2',
        filename: 'summary-test.pdf',
      } as Document

      act(() => {
        result.current.handleDocumentSummary(mockDocument)
      })

      expect(result.current.selectedDocumentForSummary).toEqual(mockDocument)
      expect(result.current.isSummaryModalVisible).toBe(true)
    })

    it('handleSummaryModalClose가 모달을 올바르게 닫는다', () => {
      const { result } = renderHook(() => useDocumentStatusController())

      const mockDocument: Document = {
        _id: 'test-doc-2',
        filename: 'summary-test.pdf',
      } as Document

      act(() => {
        result.current.handleDocumentSummary(mockDocument)
      })

      act(() => {
        result.current.handleSummaryModalClose()
      })

      expect(result.current.isSummaryModalVisible).toBe(false)
    })
  })

  describe('Document Full Text Modal', () => {
    it('handleDocumentFullText가 모달을 올바르게 연다', () => {
      const { result } = renderHook(() => useDocumentStatusController())

      const mockDocument: Document = {
        _id: 'test-doc-3',
        filename: 'fulltext-test.pdf',
      } as Document

      act(() => {
        result.current.handleDocumentFullText(mockDocument)
      })

      expect(result.current.selectedDocumentForFullText).toEqual(mockDocument)
      expect(result.current.isFullTextModalVisible).toBe(true)
    })

    it('handleFullTextModalClose가 모달을 올바르게 닫는다', () => {
      const { result } = renderHook(() => useDocumentStatusController())

      const mockDocument: Document = {
        _id: 'test-doc-3',
        filename: 'fulltext-test.pdf',
      } as Document

      act(() => {
        result.current.handleDocumentFullText(mockDocument)
      })

      act(() => {
        result.current.handleFullTextModalClose()
      })

      expect(result.current.isFullTextModalVisible).toBe(false)
    })
  })

  describe('Context Actions 통합', () => {
    it('setStatusFilter를 올바르게 호출한다', () => {
      const { result } = renderHook(() => useDocumentStatusController())

      act(() => {
        result.current.setStatusFilter('completed')
      })

      expect(mockContextValue.actions.setStatusFilter).toHaveBeenCalledWith('completed')
    })

    it('togglePolling를 올바르게 호출한다', () => {
      const { result } = renderHook(() => useDocumentStatusController())

      act(() => {
        result.current.togglePolling()
      })

      expect(mockContextValue.actions.togglePolling).toHaveBeenCalled()
    })

    it('refreshDocuments를 올바르게 호출한다', () => {
      const { result } = renderHook(() => useDocumentStatusController())

      act(() => {
        result.current.refreshDocuments()
      })

      expect(mockContextValue.actions.refreshDocuments).toHaveBeenCalled()
    })
  })

  describe('useCallback 메모이제이션', () => {
    it('핸들러 함수들이 안정적인 참조를 유지한다', () => {
      const { result, rerender } = renderHook(() => useDocumentStatusController())

      const initialHandlers = {
        handleDocumentClick: result.current.handleDocumentClick,
        handleDetailModalClose: result.current.handleDetailModalClose,
        handleDocumentSummary: result.current.handleDocumentSummary,
        handleSummaryModalClose: result.current.handleSummaryModalClose,
        handleDocumentFullText: result.current.handleDocumentFullText,
        handleFullTextModalClose: result.current.handleFullTextModalClose,
      }

      // 리렌더
      rerender()

      // 참조 동일성 확인
      expect(result.current.handleDocumentClick).toBe(initialHandlers.handleDocumentClick)
      expect(result.current.handleDetailModalClose).toBe(initialHandlers.handleDetailModalClose)
      expect(result.current.handleDocumentSummary).toBe(initialHandlers.handleDocumentSummary)
      expect(result.current.handleSummaryModalClose).toBe(initialHandlers.handleSummaryModalClose)
      expect(result.current.handleDocumentFullText).toBe(initialHandlers.handleDocumentFullText)
      expect(result.current.handleFullTextModalClose).toBe(initialHandlers.handleFullTextModalClose)
    })
  })

  describe('여러 모달 동시 관리', () => {
    it('여러 모달을 독립적으로 관리한다', () => {
      const { result } = renderHook(() => useDocumentStatusController())

      const doc1: Document = { _id: 'doc1', filename: 'test1.pdf' } as Document
      const doc2: Document = { _id: 'doc2', filename: 'test2.pdf' } as Document
      const doc3: Document = { _id: 'doc3', filename: 'test3.pdf' } as Document

      // 모든 모달 동시 열기
      act(() => {
        result.current.handleDocumentClick(doc1)
        result.current.handleDocumentSummary(doc2)
        result.current.handleDocumentFullText(doc3)
      })

      expect(result.current.selectedDocument).toEqual(doc1)
      expect(result.current.isDetailModalVisible).toBe(true)

      expect(result.current.selectedDocumentForSummary).toEqual(doc2)
      expect(result.current.isSummaryModalVisible).toBe(true)

      expect(result.current.selectedDocumentForFullText).toEqual(doc3)
      expect(result.current.isFullTextModalVisible).toBe(true)
    })
  })
})
