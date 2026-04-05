/**
 * DocumentStatusProvider initialType Filter Tests
 *
 * initialType 카테고리 필터 (한글/영문/숫자 탭) 시나리오 검증:
 * 1. initialTypeFilter prop 전달 시 getRecentDocuments 10번째 인자로 전달되는지
 * 2. initialTypeFilter 변경 시 1페이지 초기화 + 재조회되는지
 * 3. initialFilter + initialTypeFilter 동시 전달 시 둘 다 전달되는지
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { DocumentStatusProvider } from '../DocumentStatusProvider'
import { useDocumentStatusContext } from '../../contexts/DocumentStatusContext'
import * as DocumentStatusService from '../../services/DocumentStatusService'

// Mock DocumentStatusService
vi.mock('../../services/DocumentStatusService', () => ({
  DocumentStatusService: {
    getRecentDocuments: vi.fn(),
    checkHealth: vi.fn(),
    extractFilename: vi.fn((doc: any) => doc.filename || doc.originalName || ''),
  },
}))

const createMockApiResponse = () => ({
  data: {
    documents: [
      {
        _id: 'doc-1',
        originalName: '김보성보유계약현황.pdf',
        fileSize: 1024000,
        mimeType: 'application/pdf',
        uploadedAt: new Date().toISOString(),
        customer_relation: {
          customer_id: 'customer-1',
          customer_name: '김보성',
          relationship_type: 'policy_holder',
          assigned_by: 'tester',
          assigned_at: new Date().toISOString(),
        },
        stages: {},
        overallStatus: 'completed' as const,
        progress: 100,
      },
    ],
    pagination: {
      totalPages: 1,
      totalCount: 1,
      currentPage: 1,
      itemsPerPage: 15,
    },
  },
})

describe('DocumentStatusProvider - initialType 카테고리 필터 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(DocumentStatusService.DocumentStatusService.getRecentDocuments).mockResolvedValue(
      createMockApiResponse()
    )
    vi.mocked(DocumentStatusService.DocumentStatusService.checkHealth).mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('initialTypeFilter prop 전달 테스트', () => {
    it('initialTypeFilter="korean" 전달 시 getRecentDocuments 10번째 인자가 "korean"이어야 함', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DocumentStatusProvider initialTypeFilter="korean">{children}</DocumentStatusProvider>
      )

      const { result } = renderHook(() => useDocumentStatusContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      expect(DocumentStatusService.DocumentStatusService.getRecentDocuments).toHaveBeenCalledWith(
        1, // page
        15, // limit
        'uploadDate_desc', // sort (기본값)
        undefined, // searchQuery
        undefined, // customerLink
        undefined, // fileScope
        undefined, // searchField
        undefined, // period
        undefined, // initial
        'korean',   // initialType
        undefined  // customerId
      )
    })

    it('initialTypeFilter="alphabet" 전달 시 getRecentDocuments 10번째 인자가 "alphabet"이어야 함', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DocumentStatusProvider initialTypeFilter="alphabet">{children}</DocumentStatusProvider>
      )

      const { result } = renderHook(() => useDocumentStatusContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      expect(DocumentStatusService.DocumentStatusService.getRecentDocuments).toHaveBeenCalledWith(
        1, 15, 'uploadDate_desc',
        undefined, undefined, undefined, undefined,
        undefined, // period
        undefined, // initial
        'alphabet', // initialType
        undefined  // customerId
      )
    })

    it('initialTypeFilter="number" 전달 시 getRecentDocuments 10번째 인자가 "number"이어야 함', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DocumentStatusProvider initialTypeFilter="number">{children}</DocumentStatusProvider>
      )

      const { result } = renderHook(() => useDocumentStatusContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      expect(DocumentStatusService.DocumentStatusService.getRecentDocuments).toHaveBeenCalledWith(
        1, 15, 'uploadDate_desc',
        undefined, undefined, undefined, undefined,
        undefined, // period
        undefined, // initial
        'number',   // initialType
        undefined  // customerId
      )
    })

    it('initialTypeFilter 미전달 시 getRecentDocuments 10번째 인자가 undefined이어야 함', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DocumentStatusProvider>{children}</DocumentStatusProvider>
      )

      const { result } = renderHook(() => useDocumentStatusContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      expect(DocumentStatusService.DocumentStatusService.getRecentDocuments).toHaveBeenCalledWith(
        1, 15, 'uploadDate_desc',
        undefined, undefined, undefined, undefined,
        undefined, // period
        undefined, // initial
        undefined, // initialType
        undefined  // customerId
      )
    })
  })

  describe('initialFilter + initialTypeFilter 동시 전달 테스트', () => {
    it('initialFilter="ㄱ" + initialTypeFilter="korean" 동시 전달 시 둘 다 전달되어야 함', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DocumentStatusProvider initialFilter="ㄱ" initialTypeFilter="korean">{children}</DocumentStatusProvider>
      )

      const { result } = renderHook(() => useDocumentStatusContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      expect(DocumentStatusService.DocumentStatusService.getRecentDocuments).toHaveBeenCalledWith(
        1, 15, 'uploadDate_desc',
        undefined, undefined, undefined, undefined,
        undefined, // period
        'ㄱ',      // initial
        'korean',   // initialType
        undefined  // customerId
      )
    })

    it('initialFilter="#" + initialTypeFilter="number" 동시 전달 시 둘 다 전달되어야 함', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DocumentStatusProvider initialFilter="#" initialTypeFilter="number">{children}</DocumentStatusProvider>
      )

      const { result } = renderHook(() => useDocumentStatusContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      expect(DocumentStatusService.DocumentStatusService.getRecentDocuments).toHaveBeenCalledWith(
        1, 15, 'uploadDate_desc',
        undefined, undefined, undefined, undefined,
        undefined, // period
        '#',       // initial
        'number',   // initialType
        undefined  // customerId
      )
    })
  })

  describe('initialTypeFilter 변경 시 재조회 테스트', () => {
    it('initialTypeFilter 변경 시 fetchDocuments가 재호출되어야 함', async () => {
      let typeFilter = 'korean'
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DocumentStatusProvider initialTypeFilter={typeFilter}>{children}</DocumentStatusProvider>
      )

      const { result, rerender } = renderHook(() => useDocumentStatusContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false)
      })

      const initialCallCount = vi.mocked(
        DocumentStatusService.DocumentStatusService.getRecentDocuments
      ).mock.calls.length

      // initialTypeFilter 변경
      typeFilter = 'alphabet'
      rerender()

      await waitFor(() => {
        expect(
          vi.mocked(DocumentStatusService.DocumentStatusService.getRecentDocuments).mock.calls.length
        ).toBeGreaterThan(initialCallCount)
      })
    })
  })
})
