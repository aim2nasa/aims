/**
 * DocumentStatusList 삭제 모드 테스트
 *
 * 커밋 963fa65: 문서 라이브러리 편집 모드 및 삭제 기능 개선
 *
 * 주요 변경사항:
 * - DocumentStatusList에 체크박스 기능 추가 (isDeleteMode props)
 * - 전체 선택/개별 선택 기능 구현
 * - 선택된 문서 하이라이트 표시 (status-item--selected)
 * - CSS 그리드 레이아웃 동적 조정 (체크박스 열 추가)
 * - 삭제 모드에서 문서 클릭 비활성화
 */

import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { DocumentStatusList } from '../DocumentStatusList'
import type { Document } from '../../../../../types/documentStatus'

describe('DocumentStatusList - 삭제 모드 테스트 (커밋 963fa65)', () => {
  const createMockDocument = (id: string, filename: string): Document => ({
    _id: id,
    filename,
    fileSize: 1024000,
    mimeType: 'application/pdf',
    status: 'completed' as const,
    progress: 100,
    uploaded_at: new Date().toISOString(),
  })

  const mockDocuments = [
    createMockDocument('doc-1', 'document-1.pdf'),
    createMockDocument('doc-2', 'document-2.pdf'),
    createMockDocument('doc-3', 'document-3.pdf'),
  ]

  const defaultProps = {
    documents: mockDocuments,
    isEmpty: false,
    isLoading: false,
    error: null,
    onRefresh: vi.fn(),
    onDocumentClick: vi.fn(),
  }

  describe('삭제 모드 활성화', () => {
    it('isDeleteMode가 false면 체크박스가 표시되지 않아야 함', () => {
      const { container } = render(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={false}
        />
      )

      const checkboxes = container.querySelectorAll('.document-checkbox')
      expect(checkboxes.length).toBe(0)

      const selectAllCheckbox = container.querySelector('.document-select-all-checkbox')
      expect(selectAllCheckbox).toBeNull()
    })

    it('isDeleteMode가 true면 전체 선택 체크박스가 표시되어야 함', () => {
      const { container } = render(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={true}
          selectedDocumentIds={new Set()}
          onSelectAll={vi.fn()}
          onSelectDocument={vi.fn()}
        />
      )

      const selectAllCheckbox = container.querySelector('.document-select-all-checkbox')
      expect(selectAllCheckbox).not.toBeNull()
    })

    it('isDeleteMode가 true면 각 문서에 개별 체크박스가 표시되어야 함', () => {
      const { container } = render(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={true}
          selectedDocumentIds={new Set()}
          onSelectAll={vi.fn()}
          onSelectDocument={vi.fn()}
        />
      )

      const checkboxes = container.querySelectorAll('.document-checkbox')
      expect(checkboxes.length).toBe(mockDocuments.length)
    })

    it('isDeleteMode가 true면 CSS 클래스가 추가되어야 함', () => {
      const { container } = render(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={true}
          selectedDocumentIds={new Set()}
          onSelectAll={vi.fn()}
          onSelectDocument={vi.fn()}
        />
      )

      const listContainer = container.querySelector('.document-status-list')
      expect(listContainer?.classList.contains('document-status-list--delete-mode')).toBe(true)
    })
  })

  describe('전체 선택 기능', () => {
    it('전체 선택 체크박스를 클릭하면 onSelectAll이 true와 함께 호출되어야 함', () => {
      const handleSelectAll = vi.fn()
      const { container } = render(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={true}
          selectedDocumentIds={new Set()}
          onSelectAll={handleSelectAll}
          onSelectDocument={vi.fn()}
        />
      )

      const selectAllCheckbox = container.querySelector('.document-select-all-checkbox') as HTMLInputElement
      expect(selectAllCheckbox).not.toBeNull()

      fireEvent.click(selectAllCheckbox)
      expect(handleSelectAll).toHaveBeenCalledWith(true)
    })

    it('모든 문서가 선택되었을 때 전체 선택 체크박스가 체크되어야 함', () => {
      const selectedIds = new Set(['doc-1', 'doc-2', 'doc-3'])
      const { container } = render(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={true}
          selectedDocumentIds={selectedIds}
          onSelectAll={vi.fn()}
          onSelectDocument={vi.fn()}
        />
      )

      const selectAllCheckbox = container.querySelector('.document-select-all-checkbox') as HTMLInputElement
      expect(selectAllCheckbox.checked).toBe(true)
    })

    it('일부 문서만 선택되었을 때 전체 선택 체크박스가 체크 해제되어야 함', () => {
      const selectedIds = new Set(['doc-1', 'doc-2'])
      const { container } = render(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={true}
          selectedDocumentIds={selectedIds}
          onSelectAll={vi.fn()}
          onSelectDocument={vi.fn()}
        />
      )

      const selectAllCheckbox = container.querySelector('.document-select-all-checkbox') as HTMLInputElement
      expect(selectAllCheckbox.checked).toBe(false)
    })

    it('전체 선택 체크박스가 체크된 상태에서 클릭하면 onSelectAll이 false와 함께 호출되어야 함', () => {
      const handleSelectAll = vi.fn()
      const selectedIds = new Set(['doc-1', 'doc-2', 'doc-3'])
      const { container } = render(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={true}
          selectedDocumentIds={selectedIds}
          onSelectAll={handleSelectAll}
          onSelectDocument={vi.fn()}
        />
      )

      const selectAllCheckbox = container.querySelector('.document-select-all-checkbox') as HTMLInputElement
      fireEvent.click(selectAllCheckbox)
      expect(handleSelectAll).toHaveBeenCalledWith(false)
    })
  })

  describe('개별 선택 기능', () => {
    it('문서 체크박스를 클릭하면 onSelectDocument가 호출되어야 함', () => {
      const handleSelectDocument = vi.fn()
      const { container } = render(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={true}
          selectedDocumentIds={new Set()}
          onSelectAll={vi.fn()}
          onSelectDocument={handleSelectDocument}
        />
      )

      const checkboxWrappers = container.querySelectorAll('.document-checkbox-wrapper')
      expect(checkboxWrappers.length).toBeGreaterThan(0)

      fireEvent.click(checkboxWrappers[0]!)
      expect(handleSelectDocument).toHaveBeenCalledWith('doc-1', expect.anything())
    })

    it('선택된 문서의 체크박스가 체크되어야 함', () => {
      const selectedIds = new Set(['doc-1'])
      const { container } = render(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={true}
          selectedDocumentIds={selectedIds}
          onSelectAll={vi.fn()}
          onSelectDocument={vi.fn()}
        />
      )

      const checkboxes = container.querySelectorAll('.document-checkbox') as NodeListOf<HTMLInputElement>
      expect(checkboxes[0]!.checked).toBe(true)
      expect(checkboxes[1]!.checked).toBe(false)
      expect(checkboxes[2]!.checked).toBe(false)
    })

    it('여러 문서를 선택했을 때 모든 선택된 체크박스가 체크되어야 함', () => {
      const selectedIds = new Set(['doc-1', 'doc-3'])
      const { container } = render(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={true}
          selectedDocumentIds={selectedIds}
          onSelectAll={vi.fn()}
          onSelectDocument={vi.fn()}
        />
      )

      const checkboxes = container.querySelectorAll('.document-checkbox') as NodeListOf<HTMLInputElement>
      expect(checkboxes[0]!.checked).toBe(true)
      expect(checkboxes[1]!.checked).toBe(false)
      expect(checkboxes[2]!.checked).toBe(true)
    })
  })

  describe('선택 하이라이트', () => {
    it('선택된 문서에 status-item--selected 클래스가 추가되어야 함', () => {
      const selectedIds = new Set(['doc-1'])
      const { container } = render(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={true}
          selectedDocumentIds={selectedIds}
          onSelectAll={vi.fn()}
          onSelectDocument={vi.fn()}
        />
      )

      const items = container.querySelectorAll('.status-item')
      expect(items[0]!.classList.contains('status-item--selected')).toBe(true)
      expect(items[1]!.classList.contains('status-item--selected')).toBe(false)
      expect(items[2]!.classList.contains('status-item--selected')).toBe(false)
    })

    it('선택되지 않은 문서에는 selected 클래스가 없어야 함', () => {
      const selectedIds = new Set(['doc-2'])
      const { container } = render(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={true}
          selectedDocumentIds={selectedIds}
          onSelectAll={vi.fn()}
          onSelectDocument={vi.fn()}
        />
      )

      const items = container.querySelectorAll('.status-item')
      expect(items[0]!.classList.contains('status-item--selected')).toBe(false)
      expect(items[1]!.classList.contains('status-item--selected')).toBe(true)
      expect(items[2]!.classList.contains('status-item--selected')).toBe(false)
    })

    it('모든 문서가 선택되면 모든 아이템에 selected 클래스가 추가되어야 함', () => {
      const selectedIds = new Set(['doc-1', 'doc-2', 'doc-3'])
      const { container } = render(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={true}
          selectedDocumentIds={selectedIds}
          onSelectAll={vi.fn()}
          onSelectDocument={vi.fn()}
        />
      )

      const items = container.querySelectorAll('.status-item')
      items.forEach(item => {
        expect(item.classList.contains('status-item--selected')).toBe(true)
      })
    })
  })

  describe('삭제 모드에서 문서 클릭 동작', () => {
    it('삭제 모드가 아닐 때 문서 클릭 시 onDocumentClick이 호출되어야 함', () => {
      const handleDocumentClick = vi.fn()
      const { container } = render(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={false}
          onDocumentClick={handleDocumentClick}
        />
      )

      const items = container.querySelectorAll('.status-item')
      fireEvent.click(items[0]!)
      expect(handleDocumentClick).toHaveBeenCalledWith('doc-1')
    })

    it('삭제 모드일 때 문서 클릭 시 onDocumentClick이 호출되지 않아야 함', () => {
      const handleDocumentClick = vi.fn()
      const { container } = render(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={true}
          selectedDocumentIds={new Set()}
          onSelectAll={vi.fn()}
          onSelectDocument={vi.fn()}
          onDocumentClick={handleDocumentClick}
        />
      )

      const items = container.querySelectorAll('.status-item')
      fireEvent.click(items[0]!)
      expect(handleDocumentClick).not.toHaveBeenCalled()
    })

    it('삭제 모드일 때 Enter 키 입력 시 onDocumentClick이 호출되지 않아야 함', () => {
      const handleDocumentClick = vi.fn()
      const { container } = render(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={true}
          selectedDocumentIds={new Set()}
          onSelectAll={vi.fn()}
          onSelectDocument={vi.fn()}
          onDocumentClick={handleDocumentClick}
        />
      )

      const items = container.querySelectorAll('.status-item')
      fireEvent.keyDown(items[0]!, { key: 'Enter' })
      expect(handleDocumentClick).not.toHaveBeenCalled()
    })
  })

  describe('접근성 (Accessibility)', () => {
    it('전체 선택 체크박스에 aria-label이 있어야 함', () => {
      const { container } = render(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={true}
          selectedDocumentIds={new Set()}
          onSelectAll={vi.fn()}
          onSelectDocument={vi.fn()}
        />
      )

      const selectAllCheckbox = container.querySelector('.document-select-all-checkbox')
      expect(selectAllCheckbox?.getAttribute('aria-label')).toBe('전체 선택')
    })

    it('개별 체크박스에 문서명이 포함된 aria-label이 있어야 함', () => {
      const { container } = render(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={true}
          selectedDocumentIds={new Set()}
          onSelectAll={vi.fn()}
          onSelectDocument={vi.fn()}
        />
      )

      const checkboxes = container.querySelectorAll('.document-checkbox')
      expect(checkboxes[0]?.getAttribute('aria-label')).toBe('document-1.pdf 선택')
      expect(checkboxes[1]?.getAttribute('aria-label')).toBe('document-2.pdf 선택')
      expect(checkboxes[2]?.getAttribute('aria-label')).toBe('document-3.pdf 선택')
    })
  })

  describe('이벤트 전파 (Event Propagation)', () => {
    it('체크박스 클릭 시 이벤트가 부모로 전파되지 않아야 함', () => {
      const handleDocumentClick = vi.fn()
      const handleSelectDocument = vi.fn()
      const { container } = render(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={true}
          selectedDocumentIds={new Set()}
          onSelectAll={vi.fn()}
          onSelectDocument={handleSelectDocument}
          onDocumentClick={handleDocumentClick}
        />
      )

      const checkboxWrapper = container.querySelector('.document-checkbox-wrapper') as HTMLElement
      fireEvent.click(checkboxWrapper)

      expect(handleSelectDocument).toHaveBeenCalled()
      expect(handleDocumentClick).not.toHaveBeenCalled()
    })
  })

  describe('통합 테스트', () => {
    it('삭제 모드 활성화 → 문서 선택 → 하이라이트 표시 흐름이 정상 작동해야 함', () => {
      const handleSelectDocument = vi.fn()
      let selectedIds = new Set<string>()

      const { container, rerender } = render(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={true}
          selectedDocumentIds={selectedIds}
          onSelectAll={vi.fn()}
          onSelectDocument={handleSelectDocument}
        />
      )

      // 초기 상태: 선택 없음
      let items = container.querySelectorAll('.status-item')
      expect(items[0]!.classList.contains('status-item--selected')).toBe(false)

      // 첫 번째 문서 선택
      const checkboxWrappers = container.querySelectorAll('.document-checkbox-wrapper')
      fireEvent.click(checkboxWrappers[0]!)
      expect(handleSelectDocument).toHaveBeenCalledWith('doc-1', expect.anything())

      // 리렌더링: 선택 상태 업데이트
      selectedIds = new Set(['doc-1'])
      rerender(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={true}
          selectedDocumentIds={selectedIds}
          onSelectAll={vi.fn()}
          onSelectDocument={handleSelectDocument}
        />
      )

      items = container.querySelectorAll('.status-item')
      expect(items[0]!.classList.contains('status-item--selected')).toBe(true)
    })

    it('전체 선택 → 모든 문서 하이라이트 흐름이 정상 작동해야 함', () => {
      const handleSelectAll = vi.fn()
      let selectedIds = new Set<string>()

      const { container, rerender } = render(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={true}
          selectedDocumentIds={selectedIds}
          onSelectAll={handleSelectAll}
          onSelectDocument={vi.fn()}
        />
      )

      // 전체 선택 클릭
      const selectAllCheckbox = container.querySelector('.document-select-all-checkbox') as HTMLInputElement
      fireEvent.click(selectAllCheckbox)
      expect(handleSelectAll).toHaveBeenCalledWith(true)

      // 리렌더링: 모든 문서 선택됨
      selectedIds = new Set(['doc-1', 'doc-2', 'doc-3'])
      rerender(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={true}
          selectedDocumentIds={selectedIds}
          onSelectAll={handleSelectAll}
          onSelectDocument={vi.fn()}
        />
      )

      // 모든 체크박스 확인
      const checkboxes = container.querySelectorAll('.document-checkbox') as NodeListOf<HTMLInputElement>
      checkboxes.forEach(checkbox => {
        expect(checkbox.checked).toBe(true)
      })

      // 모든 아이템 하이라이트 확인
      const items = container.querySelectorAll('.status-item')
      items.forEach(item => {
        expect(item.classList.contains('status-item--selected')).toBe(true)
      })
    })
  })
})
