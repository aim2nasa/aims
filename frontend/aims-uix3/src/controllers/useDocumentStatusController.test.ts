/**
 * useDocumentStatusController Hook Tests
 * @since 1.0.0
 *
 * COMPONENT_GUIDE.md 준수: Controller Hook Testing (라인 614-667)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDocumentStatusController } from './useDocumentStatusController'
import * as DocumentStatusContext from '../contexts/DocumentStatusContext'
import type { Document } from '../types/documentStatus'
import { DocumentService } from '../services/DocumentService'
import { CustomerService } from '../services/customerService'
import { DocumentStatusService } from '../services/DocumentStatusService'

// Mock Services
vi.mock('../services/DocumentService')
vi.mock('../services/customerService')
vi.mock('../services/DocumentStatusService')

// Mock Context
const mockContextValue = {
  state: {
    documents: [] as Document[],
    filteredDocuments: [] as Document[],
    isLoading: false,
    error: null,
    isPollingEnabled: false,
    lastUpdated: null,
    selectedDocument: null,
    searchTerm: '',
    apiHealth: true,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 10,
    paginatedDocuments: [] as Document[],
  },
  actions: {
    togglePolling: vi.fn(),
    refreshDocuments: vi.fn(),
    handlePageChange: vi.fn(),
    handleLimitChange: vi.fn(),
    updateDocumentCustomerRelation: vi.fn(),
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
      expect(result.current.isPollingEnabled).toBe(false)
    })

    it('Context actions를 올바르게 노출한다', () => {
      const { result } = renderHook(() => useDocumentStatusController())

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

  describe('Document Link Modal', () => {
    it('handleDocumentLink가 모달을 올바르게 연다', () => {
      const { result } = renderHook(() => useDocumentStatusController())

      const mockDocument: Document = {
        _id: 'test-doc-link',
        filename: 'link-test.pdf',
      } as Document

      act(() => {
        result.current.handleDocumentLink(mockDocument)
      })

      expect(result.current.selectedDocumentForLink).toEqual(mockDocument)
      expect(result.current.isLinkModalVisible).toBe(true)
    })

    it('handleLinkModalClose가 모달을 올바르게 닫는다', () => {
      const { result } = renderHook(() => useDocumentStatusController())

      const mockDocument: Document = {
        _id: 'test-doc-link',
        filename: 'link-test.pdf',
      } as Document

      act(() => {
        result.current.handleDocumentLink(mockDocument)
      })

      act(() => {
        result.current.handleLinkModalClose()
      })

      expect(result.current.isLinkModalVisible).toBe(false)
    })

    it('searchCustomers가 CustomerService를 호출한다', async () => {
      const mockSearchResponse = {
        customers: [
          { _id: 'cust1', name: '홍길동' },
          { _id: 'cust2', name: '김철수' },
        ],
        pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
      }

      vi.mocked(CustomerService.searchCustomers).mockResolvedValue(mockSearchResponse as any)

      const { result } = renderHook(() => useDocumentStatusController())

      const response = await result.current.searchCustomers('홍길동', 1, 20)

      expect(CustomerService.searchCustomers).toHaveBeenCalledWith('홍길동', { page: 1, limit: 20 })
      expect(response).toEqual(mockSearchResponse)
    })

    it('searchCustomers가 기본값으로 호출된다', async () => {
      const mockSearchResponse = {
        customers: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      }

      vi.mocked(CustomerService.searchCustomers).mockResolvedValue(mockSearchResponse as any)

      const { result } = renderHook(() => useDocumentStatusController())

      await result.current.searchCustomers('test')

      expect(CustomerService.searchCustomers).toHaveBeenCalledWith('test', { page: 1, limit: 20 })
    })
  })

  describe('linkDocumentToCustomer', () => {
    it('문서를 고객에게 성공적으로 연결한다', async () => {
      const mockRelation = {
        customer_id: 'cust1',
        document_id: 'doc1',
        relationship_type: 'policy',
      }

      vi.mocked(DocumentService.linkDocumentToCustomer).mockResolvedValue(undefined)
      vi.mocked(DocumentStatusService.getDocumentStatus).mockResolvedValue({
        data: {
          rawDocument: {
            customer_relation: mockRelation,
          },
        },
      } as any)

      const { result } = renderHook(() => useDocumentStatusController())

      const response = await result.current.linkDocumentToCustomer({
        customerId: 'cust1',
        documentId: 'doc1',
        relationshipType: 'policy',
      })

      expect(DocumentService.linkDocumentToCustomer).toHaveBeenCalledWith('cust1', {
        document_id: 'doc1',
        relationship_type: 'policy',
      })
      expect(DocumentStatusService.getDocumentStatus).toHaveBeenCalledWith('doc1')
      expect(mockContextValue.actions.updateDocumentCustomerRelation).toHaveBeenCalledWith('doc1', mockRelation)
      expect(response).toEqual(mockRelation)
    })

    it('notes를 포함하여 문서를 고객에게 연결한다', async () => {
      const mockRelation = {
        customer_id: 'cust1',
        document_id: 'doc1',
        relationship_type: 'claim',
      }

      vi.mocked(DocumentService.linkDocumentToCustomer).mockResolvedValue(undefined)
      vi.mocked(DocumentStatusService.getDocumentStatus).mockResolvedValue({
        data: {
          rawDocument: {
            customer_relation: mockRelation,
          },
        },
      } as any)

      const { result } = renderHook(() => useDocumentStatusController())

      await result.current.linkDocumentToCustomer({
        customerId: 'cust1',
        documentId: 'doc1',
        relationshipType: 'claim',
        notes: '보험 청구서',
      })

      expect(DocumentService.linkDocumentToCustomer).toHaveBeenCalledWith('cust1', {
        document_id: 'doc1',
        relationship_type: 'claim',
        notes: '보험 청구서',
      })
    })

    it('notes가 없을 때 notes 필드를 포함하지 않는다', async () => {
      vi.mocked(DocumentService.linkDocumentToCustomer).mockResolvedValue(undefined)
      vi.mocked(DocumentStatusService.getDocumentStatus).mockResolvedValue({
        data: { rawDocument: { customer_relation: {} } },
      } as any)

      const { result } = renderHook(() => useDocumentStatusController())

      await result.current.linkDocumentToCustomer({
        customerId: 'cust1',
        documentId: 'doc1',
        relationshipType: 'policy',
      })

      expect(DocumentService.linkDocumentToCustomer).toHaveBeenCalledWith('cust1', {
        document_id: 'doc1',
        relationship_type: 'policy',
      })
    })

    it('API 호출 실패 시 에러를 throw한다', async () => {
      vi.mocked(DocumentService.linkDocumentToCustomer).mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => useDocumentStatusController())

      await expect(
        result.current.linkDocumentToCustomer({
          customerId: 'cust1',
          documentId: 'doc1',
          relationshipType: 'policy',
        })
      ).rejects.toThrow('Network error')
    })
  })

  describe('fetchCustomerDocuments', () => {
    it('고객의 문서 목록을 성공적으로 조회한다', async () => {
      const mockDocuments = [
        { _id: 'doc1', filename: 'test1.pdf' },
        { _id: 'doc2', filename: 'test2.pdf' },
      ]

      vi.mocked(DocumentService.getCustomerDocuments).mockResolvedValue(mockDocuments as any)

      const { result } = renderHook(() => useDocumentStatusController())

      const documents = await result.current.fetchCustomerDocuments('cust1')

      expect(DocumentService.getCustomerDocuments).toHaveBeenCalledWith('cust1')
      expect(documents).toEqual(mockDocuments)
    })

    it('문서가 없을 때 빈 배열을 반환한다', async () => {
      const emptyResult = {
        customer_id: 'cust-no-docs',
        documents: [],
        total: 0,
      }
      vi.mocked(DocumentService.getCustomerDocuments).mockResolvedValue(emptyResult as any)

      const { result } = renderHook(() => useDocumentStatusController())

      const documents = await result.current.fetchCustomerDocuments('cust-no-docs')

      expect(documents).toEqual(emptyResult)
    })
  })

  describe('Pagination 통합', () => {
    it('Pagination 상태를 올바르게 노출한다', () => {
      const { result } = renderHook(() => useDocumentStatusController())

      expect(result.current.currentPage).toBe(1)
      expect(result.current.totalPages).toBe(1)
      expect(result.current.itemsPerPage).toBe(10)
      expect(result.current.paginatedDocuments).toEqual([])
    })

    it('handlePageChange를 올바르게 호출한다', () => {
      const { result } = renderHook(() => useDocumentStatusController())

      act(() => {
        result.current.handlePageChange(2)
      })

      expect(mockContextValue.actions.handlePageChange).toHaveBeenCalledWith(2)
    })

    it('handleLimitChange를 올바르게 호출한다', () => {
      const { result } = renderHook(() => useDocumentStatusController())

      act(() => {
        result.current.handleLimitChange(20)
      })

      expect(mockContextValue.actions.handleLimitChange).toHaveBeenCalledWith(20)
    })
  })

  describe('Modal 애니메이션 timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('Detail Modal 닫기 후 300ms 후에 selectedDocument가 null이 된다', () => {
      const { result } = renderHook(() => useDocumentStatusController())

      const mockDocument: Document = { _id: 'doc1', filename: 'test.pdf' } as Document

      act(() => {
        result.current.handleDocumentClick(mockDocument)
      })

      expect(result.current.selectedDocument).toEqual(mockDocument)

      act(() => {
        result.current.handleDetailModalClose()
      })

      expect(result.current.isDetailModalVisible).toBe(false)
      expect(result.current.selectedDocument).toEqual(mockDocument) // 아직 null이 아님

      act(() => {
        vi.advanceTimersByTime(300)
      })

      expect(result.current.selectedDocument).toBeNull() // 300ms 후 null
    })

    it('여러 모달을 동시에 닫을 수 있다', () => {
      const { result } = renderHook(() => useDocumentStatusController())

      const doc1: Document = { _id: 'doc1', filename: 'test1.pdf' } as Document
      const doc2: Document = { _id: 'doc2', filename: 'test2.pdf' } as Document

      act(() => {
        result.current.handleDocumentClick(doc1)
        result.current.handleDocumentSummary(doc2)
      })

      act(() => {
        result.current.handleDetailModalClose()
        result.current.handleSummaryModalClose()
      })

      expect(result.current.isDetailModalVisible).toBe(false)
      expect(result.current.isSummaryModalVisible).toBe(false)

      act(() => {
        vi.advanceTimersByTime(300)
      })

      expect(result.current.selectedDocument).toBeNull()
      expect(result.current.selectedDocumentForSummary).toBeNull()
    })
  })
})
