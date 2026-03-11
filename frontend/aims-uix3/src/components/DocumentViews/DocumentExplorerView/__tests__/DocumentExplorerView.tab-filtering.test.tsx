/**
 * DocumentExplorerView 탭 필터링 regression 테스트
 * @description ㄱㄴ/AB/12 탭 전환 시 고객 목록 + 카운트 연동 검증
 * @since 커밋 4e16c489 — explorer-tree API 전환 + 탭 필터링
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, fireEvent } from '@testing-library/react'
import React from 'react'
import { DocumentExplorerView } from '../DocumentExplorerView'

// === Mock: DocumentStatusService ===
const mockGetExplorerTree = vi.fn()

vi.mock('@/services/DocumentStatusService', () => ({
  DocumentStatusService: {
    getExplorerTree: (...args: unknown[]) => mockGetExplorerTree(...args),
    getDocumentInitials: vi.fn().mockResolvedValue({}),
  }
}))

// === Mock: useDocumentExplorerTree (트리 빌드 훅) ===
vi.mock('../hooks/useDocumentExplorerTree', () => ({
  useDocumentExplorerTree: () => ({
    groupBy: 'customer' as const,
    expandedKeys: new Set<string>(),
    searchTerm: '',
    selectedDocumentId: null,
    isAllExpanded: false,
    treeData: { nodes: [], totalDocuments: 0, groupStats: { groupCount: 0 } },
    filteredDocuments: [],
    isLoading: false,
    sortBy: 'name' as const,
    sortDirection: 'asc' as const,
    quickFilter: 'none' as const,
    recentDocumentIds: [],
    recentDocuments: [],
    customerFilter: null,
    dateFilter: null,
    dateRange: null,
    thumbnailEnabled: false,
    setGroupBy: vi.fn(),
    toggleNode: vi.fn(),
    toggleExpandAll: vi.fn(),
    setSearchTerm: vi.fn(),
    setSelectedDocumentId: vi.fn(),
    expandToDocument: vi.fn(),
    setSortBy: vi.fn(),
    toggleSortDirection: vi.fn(),
    setQuickFilter: vi.fn(),
    addToRecentDocuments: vi.fn(),
    setCustomerFilter: vi.fn(),
    clearAllFilters: vi.fn(),
    jumpToDate: vi.fn(),
    getAvailableDates: vi.fn().mockReturnValue([]),
    clearDateFilter: vi.fn(),
    setDateRange: vi.fn(),
    setThumbnailEnabled: vi.fn(),
  }),
}))

// === Mock: CenterPaneView ===
vi.mock('../../../CenterPaneView/CenterPaneView', () => ({
  default: ({ children, visible }: { children: React.ReactNode; visible: boolean }) =>
    visible ? <div data-testid="center-pane">{children}</div> : null,
}))

// === Mock: DocumentExplorerToolbar ===
vi.mock('../DocumentExplorerToolbar', () => ({
  DocumentExplorerToolbar: ({ totalDocuments, groupCount }: { totalDocuments: number; groupCount: number }) => (
    <div data-testid="toolbar">
      <span data-testid="group-count">{groupCount}</span>
      <span data-testid="total-documents">{totalDocuments}</span>
    </div>
  ),
}))

// === Mock: DocumentExplorerTree ===
vi.mock('../DocumentExplorerTree', () => ({
  DocumentExplorerTree: ({ nodes }: { nodes: Array<{ key: string; label: string }> }) => (
    <div data-testid="tree">
      {nodes.map(n => <div key={n.key} data-testid="tree-node">{n.label}</div>)}
    </div>
  ),
}))

// === Mock: usePersistedState ===
let mockInitialType = 'korean'
let mockSelectedInitial: string | null = null

vi.mock('@/hooks/usePersistedState', () => ({
  usePersistedState: (key: string, defaultValue: unknown) => {
    if (key === 'doc-explorer-initial-type') {
      return [mockInitialType, (val: string) => { mockInitialType = val }] as const
    }
    if (key === 'doc-explorer-selected-initial') {
      return [mockSelectedInitial, (val: string | null) => { mockSelectedInitial = val }] as const
    }
    return [defaultValue, vi.fn()] as const
  },
}))

// === Mock: breadcrumbUtils ===
vi.mock('@/shared/lib/breadcrumbUtils', () => ({
  getBreadcrumbItems: () => [],
}))

// === 테스트 데이터 ===
const createMockExplorerData = () => ({
  customers: [
    { customerId: 'c1', name: '강동수', initial: 'ㄱ', docCount: 5, latestUpload: null },
    { customerId: 'c2', name: '김철수', initial: 'ㄱ', docCount: 3, latestUpload: null },
    { customerId: 'c3', name: '나영희', initial: 'ㄴ', docCount: 2, latestUpload: null },
    { customerId: 'c4', name: '박지성', initial: 'ㅂ', docCount: 4, latestUpload: null },
    { customerId: 'c5', name: '이순신', initial: 'ㅇ', docCount: 1, latestUpload: null },
    { customerId: 'c6', name: 'AHNHYUK', initial: 'A', docCount: 2, latestUpload: null },
    { customerId: 'c7', name: 'CHIYONG', initial: 'C', docCount: 1, latestUpload: null },
    { customerId: 'c8', name: '(주)아이오아이', initial: '#', docCount: 3, latestUpload: null },
    { customerId: 'c9', name: '(주)원공사', initial: '#', docCount: 2, latestUpload: null },
  ],
  totalCustomers: 9,
  totalDocuments: 23,
  initials: { 'ㄱ': 2, 'ㄴ': 1, 'ㅂ': 1, 'ㅇ': 1, 'A': 1, 'C': 1, '#': 2 },
})

describe('DocumentExplorerView — 탭 필터링 (커밋 4e16c489)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInitialType = 'korean'
    mockSelectedInitial = null
    mockGetExplorerTree.mockResolvedValue(createMockExplorerData())
  })

  const renderView = () => render(
    <DocumentExplorerView visible={true} onClose={vi.fn()} />
  )

  // --- 한글 탭 ---
  describe('한글 탭 (ㄱㄴ)', () => {
    it('한글 초성 고객만 표시해야 함', async () => {
      mockInitialType = 'korean'
      const { getAllByTestId } = renderView()

      await waitFor(() => {
        const nodes = getAllByTestId('tree-node')
        const names = nodes.map(n => n.textContent)
        expect(names).toContain('강동수')
        expect(names).toContain('김철수')
        expect(names).toContain('나영희')
        expect(names).toContain('박지성')
        expect(names).toContain('이순신')
      })
    })

    it('영문/특수문자 고객은 미표시', async () => {
      mockInitialType = 'korean'
      const { getAllByTestId } = renderView()

      await waitFor(() => {
        const nodes = getAllByTestId('tree-node')
        const names = nodes.map(n => n.textContent)
        expect(names).not.toContain('AHNHYUK')
        expect(names).not.toContain('CHIYONG')
        expect(names).not.toContain('(주)아이오아이')
        expect(names).not.toContain('(주)원공사')
      })
    })

    it('고객 수가 한글 고객만 카운트', async () => {
      mockInitialType = 'korean'
      const { getByTestId } = renderView()

      await waitFor(() => {
        expect(getByTestId('group-count').textContent).toBe('5')
      })
    })

    it('문서 수가 한글 고객 문서만 합산', async () => {
      mockInitialType = 'korean'
      const { getByTestId } = renderView()

      // 5+3+2+4+1 = 15
      await waitFor(() => {
        expect(getByTestId('total-documents').textContent).toBe('15')
      })
    })
  })

  // --- 영문 탭 ---
  describe('영문 탭 (AB)', () => {
    it('영문 초성 고객만 표시해야 함', async () => {
      mockInitialType = 'alphabet'
      const { getAllByTestId } = renderView()

      await waitFor(() => {
        const nodes = getAllByTestId('tree-node')
        const names = nodes.map(n => n.textContent)
        expect(names).toContain('AHNHYUK')
        expect(names).toContain('CHIYONG')
        expect(names.length).toBe(2)
      })
    })

    it('한글 고객 미표시', async () => {
      mockInitialType = 'alphabet'
      const { getAllByTestId } = renderView()

      await waitFor(() => {
        const nodes = getAllByTestId('tree-node')
        const names = nodes.map(n => n.textContent)
        expect(names).not.toContain('강동수')
        expect(names).not.toContain('(주)아이오아이')
      })
    })

    it('문서 수가 영문 고객 문서만 합산', async () => {
      mockInitialType = 'alphabet'
      const { getByTestId } = renderView()

      // 2+1 = 3
      await waitFor(() => {
        expect(getByTestId('total-documents').textContent).toBe('3')
      })
    })
  })

  // --- 숫자 탭 ---
  describe('숫자 탭 (12)', () => {
    it('특수문자(#) 고객만 표시해야 함', async () => {
      mockInitialType = 'number'
      const { getAllByTestId } = renderView()

      await waitFor(() => {
        const nodes = getAllByTestId('tree-node')
        const names = nodes.map(n => n.textContent)
        expect(names).toContain('(주)아이오아이')
        expect(names).toContain('(주)원공사')
        expect(names.length).toBe(2)
      })
    })

    it('한글/영문 고객 미표시', async () => {
      mockInitialType = 'number'
      const { getAllByTestId } = renderView()

      await waitFor(() => {
        const nodes = getAllByTestId('tree-node')
        const names = nodes.map(n => n.textContent)
        expect(names).not.toContain('강동수')
        expect(names).not.toContain('AHNHYUK')
      })
    })

    it('문서 수가 특수문자 고객 문서만 합산', async () => {
      mockInitialType = 'number'
      const { getByTestId } = renderView()

      // 3+2 = 5
      await waitFor(() => {
        expect(getByTestId('total-documents').textContent).toBe('5')
      })
    })
  })

  // --- 탭 간 데이터 격리 ---
  describe('탭 간 고객 격리', () => {
    it('한글/영문/숫자 탭 고객 합 = 전체 고객', async () => {
      const data = createMockExplorerData()
      const koreanInitials = new Set(['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'])
      const alphabetInitials = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''))
      const numberInitials = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '#'])

      const korean = data.customers.filter(c => koreanInitials.has(c.initial))
      const alphabet = data.customers.filter(c => alphabetInitials.has(c.initial))
      const number = data.customers.filter(c => numberInitials.has(c.initial))

      expect(korean.length + alphabet.length + number.length).toBe(data.customers.length)
    })
  })
})
