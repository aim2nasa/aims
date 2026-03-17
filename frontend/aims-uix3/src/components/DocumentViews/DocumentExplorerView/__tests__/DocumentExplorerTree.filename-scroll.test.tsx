/**
 * DocumentExplorerTree 별칭↔원본 전환 시 선택 문서 자동 스크롤 regression 테스트
 * @description filenameMode 변경 시 선택된 문서로 scrollIntoView가 호출되는지 검증
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'

// === Mock: 내부 의존성 ===
vi.mock('@/components/SFSymbol', () => ({
  SFSymbol: () => <span data-testid="sf-symbol" />,
  SFSymbolSize: {},
  SFSymbolWeight: {},
}))

vi.mock('@/entities/document', () => ({
  DocumentUtils: {
    getDisplayName: vi.fn((doc: { displayName?: string; filename?: string }) =>
      doc.displayName || doc.filename || 'unknown'
    ),
  },
}))

vi.mock('@/services/DocumentStatusService', () => ({
  DocumentStatusService: {
    extractFilename: vi.fn((doc: { filename?: string }) => doc.filename || 'unknown'),
  },
}))

vi.mock('../components/DocumentActionIcons', () => ({
  SummaryIcon: () => null,
  DocumentIcon: () => null,
}))

vi.mock('@/shared/ui/InlineRenameInput', () => ({
  InlineRenameInput: () => null,
}))

vi.mock('./hooks/useDocumentExplorerKeyboard', () => ({
  useDocumentExplorerKeyboard: () => ({
    focusedKey: null,
    setFocusedKey: vi.fn(),
    handleKeyDown: vi.fn(),
    needsScroll: false,
    clearNeedsScroll: vi.fn(),
  }),
}))

vi.mock('./utils/treeBuilders', () => ({
  getDocumentDate: vi.fn(() => '2026-01-01'),
}))

vi.mock('./components/HoverPreview', () => ({
  HoverPreview: () => null,
}))

vi.mock('@/shared/ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/shared/ui/DocumentTypeCell/DocumentTypeCell', () => ({
  DocumentTypeCell: () => <span>type</span>,
}))

vi.mock('@/shared/lib/highlightText', () => ({
  highlightText: (text: string) => text,
}))

import { DocumentExplorerTree } from '../DocumentExplorerTree'

// scrollIntoView mock
const mockScrollIntoView = vi.fn()

/** 최소 필수 props 생성 */
const createDefaultProps = (overrides: Record<string, unknown> = {}) => ({
  nodes: [],
  expandedKeys: new Set<string>(),
  selectedDocumentId: null as string | null,
  groupBy: 'customer' as const,
  onToggleNode: vi.fn(),
  onDocumentClick: vi.fn(),
  onDocumentDoubleClick: vi.fn(),
  filenameMode: 'display' as 'display' | 'original',
  ...overrides,
})

describe('DocumentExplorerTree — 별칭↔원본 전환 시 자동 스크롤', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockScrollIntoView.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('별칭→원본 전환 시 선택된 문서로 scrollIntoView가 호출되어야 함', () => {
    const docId = 'test-doc-001'

    // 선택된 문서에 해당하는 DOM 요소를 미리 생성
    const el = document.createElement('div')
    el.setAttribute('data-node-key', `doc-${docId}`)
    el.scrollIntoView = mockScrollIntoView
    document.body.appendChild(el)

    const props = createDefaultProps({
      selectedDocumentId: docId,
      filenameMode: 'display',
    })

    const { rerender } = render(<DocumentExplorerTree {...props} />)

    // filenameMode를 'original'로 변경
    rerender(<DocumentExplorerTree {...props} filenameMode="original" />)

    // 300ms 타이머 진행
    act(() => { vi.advanceTimersByTime(300) })

    expect(mockScrollIntoView).toHaveBeenCalledWith({
      block: 'center',
      behavior: 'instant',
    })

    // 정리
    document.body.removeChild(el)
  })

  it('원본→별칭 전환 시에도 scrollIntoView가 호출되어야 함', () => {
    const docId = 'test-doc-002'

    const el = document.createElement('div')
    el.setAttribute('data-node-key', `doc-${docId}`)
    el.scrollIntoView = mockScrollIntoView
    document.body.appendChild(el)

    const props = createDefaultProps({
      selectedDocumentId: docId,
      filenameMode: 'original',
    })

    const { rerender } = render(<DocumentExplorerTree {...props} />)

    // filenameMode를 'display'로 변경
    rerender(<DocumentExplorerTree {...props} filenameMode="display" />)

    act(() => { vi.advanceTimersByTime(300) })

    expect(mockScrollIntoView).toHaveBeenCalledWith({
      block: 'center',
      behavior: 'instant',
    })

    document.body.removeChild(el)
  })

  it('선택된 문서가 없으면 scrollIntoView가 호출되지 않아야 함', () => {
    const props = createDefaultProps({
      selectedDocumentId: null,
      filenameMode: 'display',
    })

    const { rerender } = render(<DocumentExplorerTree {...props} />)

    rerender(<DocumentExplorerTree {...props} filenameMode="original" />)

    act(() => { vi.advanceTimersByTime(300) })

    // document.querySelector 결과가 없으므로 scrollIntoView 호출 안 됨
    expect(mockScrollIntoView).not.toHaveBeenCalled()
  })

  it('filenameMode가 변경되지 않으면 scrollIntoView가 호출되지 않아야 함', () => {
    const docId = 'test-doc-003'

    const el = document.createElement('div')
    el.setAttribute('data-node-key', `doc-${docId}`)
    el.scrollIntoView = mockScrollIntoView
    document.body.appendChild(el)

    const props = createDefaultProps({
      selectedDocumentId: docId,
      filenameMode: 'display',
    })

    const { rerender } = render(<DocumentExplorerTree {...props} />)

    // 같은 filenameMode로 rerender (다른 prop 변경)
    rerender(<DocumentExplorerTree {...props} filenameMode="display" />)

    act(() => { vi.advanceTimersByTime(300) })

    expect(mockScrollIntoView).not.toHaveBeenCalled()

    document.body.removeChild(el)
  })
})
