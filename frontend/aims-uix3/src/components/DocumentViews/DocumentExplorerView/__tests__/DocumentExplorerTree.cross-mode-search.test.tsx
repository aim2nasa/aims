/**
 * DocumentExplorerTree 검색 크로스 모드 전환 버튼 regression 테스트
 * @description 검색 시 현재 모드에서 매칭 안 되는 문서에 반대쪽 모드 전환 버튼이 표시되는지 검증
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
    getFileExtension: vi.fn(() => 'PDF'),
    formatFileSize: vi.fn(() => '1.2 MB'),
    getFileTypeClass: vi.fn(() => ''),
    getFileIcon: vi.fn(() => 'doc.fill'),
    getDocumentType: vi.fn(() => 'bin'),
    getDocumentTypeLabel: vi.fn(() => 'BIN'),
  },
  DocumentProcessingModule: {
    getProcessingStatus: vi.fn(() => ({ label: '완료' })),
  },
}))

vi.mock('@/services/DocumentStatusService', () => ({
  DocumentStatusService: {
    extractFilename: vi.fn((doc: { filename?: string; upload?: { originalName?: string } }) =>
      doc.upload?.originalName || doc.filename || 'unknown'
    ),
    extractOriginalFilename: vi.fn((doc: { upload?: { originalName?: string } }) =>
      doc.upload?.originalName || 'unknown'
    ),
    extractFileSize: vi.fn(() => 1200000),
    extractStatus: vi.fn(() => 'completed'),
  },
}))

vi.mock('../components/DocumentActionIcons', () => ({
  SummaryIcon: () => null,
  DocumentIcon: () => null,
}))

vi.mock('../hooks/useDocumentExplorerKeyboard', () => ({
  useDocumentExplorerKeyboard: () => ({
    focusedKey: null,
    setFocusedKey: vi.fn(),
    handleKeyDown: vi.fn(),
    needsScroll: false,
    clearNeedsScroll: vi.fn(),
  }),
}))

vi.mock('../utils/treeBuilders', () => ({
  getDocumentDate: vi.fn(() => '2026-01-01T00:00:00Z'),
}))

vi.mock('../components/HoverPreview', () => ({
  HoverPreview: () => null,
}))

vi.mock('@/shared/ui/Tooltip', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/shared/ui/FilenameModeToggle', () => ({
  __esModule: true,
  FilenameModeToggle: () => <button>모드토글</button>,
  default: () => <button>모드토글</button>,
}))

vi.mock('@/shared/ui/DocumentTypeCell/DocumentTypeCell', () => ({
  DocumentTypeCell: () => <span>type</span>,
}))

vi.mock('@/shared/lib/highlightText', () => ({
  highlightText: (text: string, query: string) => {
    if (!query || !text) return text
    const lower = text.toLowerCase()
    const q = query.trim().toLowerCase()
    if (!q || !lower.includes(q)) return text
    // 매칭 부분을 mark 태그로 감싸서 반환 (실제 highlightText와 유사)
    const idx = lower.indexOf(q)
    return (
      <>
        {text.slice(0, idx)}
        <mark>{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    )
  },
}))

vi.mock('@/shared/lib/timeUtils', () => ({
  formatDateTime: vi.fn(() => '2026.01.01 00:00:00'),
  formatDate: vi.fn(() => '2026.01.01'),
}))

vi.mock('@/shared/store/useLayoutStore', () => ({
  useLayoutStore: () => false,
}))

import { DocumentExplorerTree } from '../DocumentExplorerTree'
import type { DocumentTreeNode } from '../types/documentExplorer'

// 문서 노드 생성 헬퍼
const createDocNode = (id: string, originalName: string, displayName: string | null): DocumentTreeNode => ({
  key: `doc-${id}`,
  label: displayName || originalName,
  type: 'document',
  icon: 'doc.fill',
  document: {
    _id: id,
    displayName: displayName,
    displayNameStatus: displayName ? 'completed' : undefined,
    upload: { originalName },
    mimeType: 'application/pdf',
    fileSize: 1200000,
    badgeType: 'AR',
    progress: 100,
    customer_relation: { customer_id: 'c1', customer_name: '테스트고객' },
  } as any,
})

/** 최소 필수 props */
const createDefaultProps = (overrides: Record<string, unknown> = {}) => ({
  nodes: [] as DocumentTreeNode[],
  expandedKeys: new Set<string>(),
  selectedDocumentId: null as string | null,
  groupBy: 'customer' as const,
  onToggleNode: vi.fn(),
  onDocumentClick: vi.fn(),
  onDocumentDoubleClick: vi.fn(),
  filenameMode: 'display' as 'display' | 'original',
  ...overrides,
})

describe('DocumentExplorerTree — 검색 크로스 모드 전환 버튼', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('별칭 모드에서 검색어가 원본에만 있으면 [원본] 버튼이 표시되어야 함', () => {
    // displayName에는 "fms" 없음, originalName에는 "fms" 있음
    const node = createDocNode('d1', 'FMS_Manual.pdf', '비행 시스템 설명서.pdf')

    const props = createDefaultProps({
      nodes: [node],
      searchTerm: 'fms',
      filenameMode: 'display',
    })

    render(<DocumentExplorerTree {...props} />)

    // [원본] 버튼이 표시되어야 함
    const btn = screen.getByRole('button', { name: '원본 파일명으로 전환' })
    expect(btn).toBeDefined()
    expect(btn.textContent).toBe('원본')
  })

  it('별칭 모드에서 검색어가 별칭에 있으면 전환 버튼이 표시되지 않아야 함', () => {
    // displayName에 "fms" 포함
    const node = createDocNode('d2', 'some_file.pdf', 'FMS 비행 매뉴얼.pdf')

    const props = createDefaultProps({
      nodes: [node],
      searchTerm: 'fms',
      filenameMode: 'display',
    })

    render(<DocumentExplorerTree {...props} />)

    // 전환 버튼이 없어야 함
    const btn = screen.queryByRole('button', { name: '원본 파일명으로 전환' })
    expect(btn).toBeNull()
    const btn2 = screen.queryByRole('button', { name: '별칭으로 전환' })
    expect(btn2).toBeNull()
  })

  it('원본 모드에서 검색어가 별칭에만 있으면 [별칭] 버튼이 표시되어야 함', () => {
    // originalName에 "비행" 없음, displayName에 "비행" 있음
    const node = createDocNode('d3', 'FMS_Manual.pdf', '비행 시스템 설명서.pdf')

    const props = createDefaultProps({
      nodes: [node],
      searchTerm: '비행',
      filenameMode: 'original',
    })

    render(<DocumentExplorerTree {...props} />)

    const btn = screen.getByRole('button', { name: '별칭으로 전환' })
    expect(btn).toBeDefined()
    expect(btn.textContent).toBe('별칭')
  })

  it('검색어가 없으면 전환 버튼이 표시되지 않아야 함', () => {
    const node = createDocNode('d4', 'FMS_Manual.pdf', '비행 시스템 설명서.pdf')

    const props = createDefaultProps({
      nodes: [node],
      searchTerm: '',
      filenameMode: 'display',
    })

    render(<DocumentExplorerTree {...props} />)

    const btn = screen.queryByRole('button', { name: '원본 파일명으로 전환' })
    expect(btn).toBeNull()
  })

  it('[원본] 버튼 클릭 시 해당 행이 원본으로 전환되고 하이라이트가 표시되어야 함', () => {
    const node = createDocNode('d5', 'FMS_Manual.pdf', '비행 시스템 설명서.pdf')

    const props = createDefaultProps({
      nodes: [node],
      searchTerm: 'fms',
      filenameMode: 'display',
    })

    render(<DocumentExplorerTree {...props} />)

    // 초기: 별칭 "비행 시스템 설명서.pdf" 표시 + [원본] 버튼
    const switchBtn = screen.getByRole('button', { name: '원본 파일명으로 전환' })
    fireEvent.click(switchBtn)

    // 전환 후: 원본 "FMS_Manual.pdf"에서 "FMS" 매칭 → mark 태그 렌더링
    const marks = document.querySelectorAll('mark')
    const hasFmsMark = Array.from(marks).some(m => m.textContent?.toLowerCase() === 'fms')
    expect(hasFmsMark).toBe(true)
  })

  it('전환 후 돌아가기 버튼이 표시되어야 함', () => {
    const node = createDocNode('d6', 'FMS_Manual.pdf', '비행 시스템 설명서.pdf')

    const props = createDefaultProps({
      nodes: [node],
      searchTerm: 'fms',
      filenameMode: 'display',
    })

    render(<DocumentExplorerTree {...props} />)

    // [원본] 버튼 클릭
    const switchBtn = screen.getByRole('button', { name: '원본 파일명으로 전환' })
    fireEvent.click(switchBtn)

    // 전환 후: 원본에서 매칭되므로 crossModeMatch가 null
    // 대신 localModeOverride가 있으므로 돌아가기 버튼 표시
    const backBtn = screen.getByRole('button', { name: '별칭으로 돌아가기' })
    expect(backBtn).toBeDefined()
    expect(backBtn.textContent).toBe('별칭')
  })

  it('전체 모드 변경 시 개별 오버라이드가 초기화되어야 함', () => {
    const node = createDocNode('d7', 'FMS_Manual.pdf', '비행 시스템 설명서.pdf')

    const props = createDefaultProps({
      nodes: [node],
      searchTerm: 'fms',
      filenameMode: 'display',
    })

    const { rerender } = render(<DocumentExplorerTree {...props} />)

    // [원본] 버튼 클릭으로 로컬 오버라이드
    const switchBtn = screen.getByRole('button', { name: '원본 파일명으로 전환' })
    fireEvent.click(switchBtn)

    // 전체 모드를 원본으로 변경
    rerender(<DocumentExplorerTree {...props} filenameMode="original" />)

    // 오버라이드 초기화 → 원본 모드에서 "FMS" 이미 매칭 → 전환 버튼 없어야 함
    const btn = screen.queryByRole('button', { name: '원본 파일명으로 전환' })
    expect(btn).toBeNull()
    const backBtn = screen.queryByRole('button', { name: '별칭으로 돌아가기' })
    expect(backBtn).toBeNull()
  })
})
