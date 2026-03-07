/**
 * DocumentStatusHeader 편집 버튼 재배치 테스트
 *
 * 커밋 c8c49b7: 편집 버튼을 문서 개수 옆으로 이동 및 아이콘 버튼으로 변경
 *
 * 주요 변경사항:
 * - DocumentStatusHeader에 편집 버튼 props 추가 (showEditButton, isEditMode, onToggleEditMode)
 * - 편집 버튼을 검색 바에서 DocumentStatusHeader로 이동 (문서 개수 앞)
 * - 텍스트 버튼 → 아이콘 버튼 변경 (연필 ↔ 체크마크)
 * - iOS 스타일 호버 효과 적용 (투명 배경 + 스케일)
 * - 편집 모드 시 초록색 체크마크로 상태 표시
 */

import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { DocumentStatusHeader } from '../DocumentStatusHeader'

describe('DocumentStatusHeader - 편집 버튼 재배치 테스트 (커밋 c8c49b7)', () => {
  const defaultProps = {
    documentsCount: 10,
  }

  describe('편집 버튼 표시 제어', () => {
    it('showEditButton이 false면 편집 버튼이 표시되지 않아야 함', () => {
      const { container } = render(
        <DocumentStatusHeader
          {...defaultProps}
          showEditButton={false}
        />
      )

      const editButton = container.querySelector('.edit-mode-icon-button')
      expect(editButton).toBeNull()
    })

    it('showEditButton이 true면 편집 버튼이 표시되어야 함', () => {
      const { container } = render(
        <DocumentStatusHeader
          {...defaultProps}
          showEditButton={true}
          isEditMode={false}
          onToggleEditMode={vi.fn()}
        />
      )

      const editButton = container.querySelector('.edit-mode-icon-button')
      expect(editButton).not.toBeNull()
    })

    it('showEditButton이 true여도 onToggleEditMode가 없으면 버튼이 표시되지 않아야 함', () => {
      const { container } = render(
        <DocumentStatusHeader
          {...defaultProps}
          showEditButton={true}
          isEditMode={false}
        />
      )

      const editButton = container.querySelector('.edit-mode-icon-button')
      expect(editButton).toBeNull()
    })
  })

  describe('편집/완료 아이콘 전환', () => {
    it('isEditMode가 false면 연필 아이콘이 표시되어야 함', () => {
      const { container } = render(
        <DocumentStatusHeader
          {...defaultProps}
          showEditButton={true}
          isEditMode={false}
          onToggleEditMode={vi.fn()}
        />
      )

      const editButton = container.querySelector('.edit-mode-icon-button')
      expect(editButton).not.toBeNull()

      // 연필 아이콘 SVG path 확인
      const pencilIcon = editButton?.querySelector('svg path[d*="11.333 2"]')
      expect(pencilIcon).not.toBeNull()
    })

    it('isEditMode가 true면 체크마크 아이콘이 표시되어야 함', () => {
      const { container } = render(
        <DocumentStatusHeader
          {...defaultProps}
          showEditButton={true}
          isEditMode={true}
          onToggleEditMode={vi.fn()}
        />
      )

      const editButton = container.querySelector('.edit-mode-icon-button')
      expect(editButton).not.toBeNull()

      // 체크마크 아이콘 SVG path 확인
      const checkIcon = editButton?.querySelector('svg path[d*="13.5 4.5"]')
      expect(checkIcon).not.toBeNull()
    })
  })

  describe('편집 모드 활성화 상태 CSS', () => {
    it('isEditMode가 false면 active 클래스가 없어야 함', () => {
      const { container } = render(
        <DocumentStatusHeader
          {...defaultProps}
          showEditButton={true}
          isEditMode={false}
          onToggleEditMode={vi.fn()}
        />
      )

      const editButton = container.querySelector('.edit-mode-icon-button')
      expect(editButton?.classList.contains('edit-mode-icon-button--active')).toBe(false)
    })

    it('isEditMode가 true면 active 클래스가 추가되어야 함', () => {
      const { container } = render(
        <DocumentStatusHeader
          {...defaultProps}
          showEditButton={true}
          isEditMode={true}
          onToggleEditMode={vi.fn()}
        />
      )

      const editButton = container.querySelector('.edit-mode-icon-button')
      expect(editButton?.classList.contains('edit-mode-icon-button--active')).toBe(true)
    })
  })

  describe('편집 버튼 클릭 동작', () => {
    it('편집 버튼 클릭 시 onToggleEditMode가 호출되어야 함', () => {
      const handleToggleEditMode = vi.fn()
      const { container } = render(
        <DocumentStatusHeader
          {...defaultProps}
          showEditButton={true}
          isEditMode={false}
          onToggleEditMode={handleToggleEditMode}
        />
      )

      const editButton = container.querySelector('.edit-mode-icon-button') as HTMLElement
      expect(editButton).not.toBeNull()

      fireEvent.click(editButton)
      expect(handleToggleEditMode).toHaveBeenCalledTimes(1)
    })

    it('활성 상태에서 편집 버튼 클릭 시에도 onToggleEditMode가 호출되어야 함', () => {
      const handleToggleEditMode = vi.fn()
      const { container } = render(
        <DocumentStatusHeader
          {...defaultProps}
          showEditButton={true}
          isEditMode={true}
          onToggleEditMode={handleToggleEditMode}
        />
      )

      const editButton = container.querySelector('.edit-mode-icon-button') as HTMLElement
      fireEvent.click(editButton)
      expect(handleToggleEditMode).toHaveBeenCalledTimes(1)
    })
  })

  describe('접근성 (Accessibility)', () => {
    it('편집 모드가 아닐 때 aria-label이 "편집"이어야 함', () => {
      const { container } = render(
        <DocumentStatusHeader
          {...defaultProps}
          showEditButton={true}
          isEditMode={false}
          onToggleEditMode={vi.fn()}
        />
      )

      const editButton = container.querySelector('.edit-mode-icon-button')
      expect(editButton?.getAttribute('aria-label')).toBe('편집')
    })

    it('편집 모드일 때 aria-label이 "편집 완료"여야 함', () => {
      const { container } = render(
        <DocumentStatusHeader
          {...defaultProps}
          showEditButton={true}
          isEditMode={true}
          onToggleEditMode={vi.fn()}
        />
      )

      const editButton = container.querySelector('.edit-mode-icon-button')
      expect(editButton?.getAttribute('aria-label')).toBe('편집 완료')
    })
  })

  describe('편집 버튼 위치', () => {
    it('편집 버튼이 header-left 내부의 filter-group에 있어야 함', () => {
      const { container } = render(
        <DocumentStatusHeader
          {...defaultProps}
          showEditButton={true}
          isEditMode={false}
          onToggleEditMode={vi.fn()}
        />
      )

      const headerLeft = container.querySelector('.header-left')
      expect(headerLeft).not.toBeNull()

      const filterGroup = headerLeft?.querySelector('.filter-group')
      expect(filterGroup).not.toBeNull()

      const editButton = filterGroup?.querySelector('.edit-mode-icon-button')
      expect(editButton).not.toBeNull()
    })

    it('편집 버튼이 총 문서 개수(result-count) 앞에 위치해야 함', () => {
      const { container } = render(
        <DocumentStatusHeader
          {...defaultProps}
          showEditButton={true}
          isEditMode={false}
          onToggleEditMode={vi.fn()}
        />
      )

      const filterGroup = container.querySelector('.filter-group')
      const children = filterGroup?.children

      expect(children).not.toBeUndefined()
      if (!children) return

      expect(children.length).toBeGreaterThanOrEqual(2)

      // 첫 번째 자식이 편집 버튼 (Tooltip으로 감싸져 있을 수 있음)
      const firstChild = children[0]
      expect(firstChild).not.toBeUndefined()
      // Tooltip으로 감싸진 경우, 내부에서 편집 버튼을 찾음
      const editButton = firstChild?.classList.contains('edit-mode-icon-button')
        ? firstChild
        : firstChild?.querySelector('.edit-mode-icon-button')
      expect(editButton).not.toBeNull()

      // 두 번째 자식이 총 문서 개수
      const secondChild = children[1]
      expect(secondChild).not.toBeUndefined()
      expect(secondChild?.classList.contains('result-count')).toBe(true)
    })
  })

  describe('CSS 클래스 및 스타일', () => {
    it('편집 버튼에 기본 CSS 클래스가 적용되어야 함', () => {
      const { container } = render(
        <DocumentStatusHeader
          {...defaultProps}
          showEditButton={true}
          isEditMode={false}
          onToggleEditMode={vi.fn()}
        />
      )

      const editButton = container.querySelector('.edit-mode-icon-button')
      expect(editButton?.classList.contains('edit-mode-icon-button')).toBe(true)
    })

    it('아이콘 SVG가 14x14 크기여야 함', () => {
      const { container } = render(
        <DocumentStatusHeader
          {...defaultProps}
          showEditButton={true}
          isEditMode={false}
          onToggleEditMode={vi.fn()}
        />
      )

      const svg = container.querySelector('.edit-mode-icon-button svg')
      expect(svg?.getAttribute('width')).toBe('14')
      expect(svg?.getAttribute('height')).toBe('14')
    })
  })

  describe('통합 테스트', () => {
    it('편집 모드 전환 시나리오가 정상 작동해야 함', () => {
      let isEditMode = false
      const handleToggleEditMode = vi.fn(() => {
        isEditMode = !isEditMode
      })

      const { container, rerender } = render(
        <DocumentStatusHeader
          {...defaultProps}
          showEditButton={true}
          isEditMode={isEditMode}
          onToggleEditMode={handleToggleEditMode}
        />
      )

      // 초기 상태: 연필 아이콘
      let editButton = container.querySelector('.edit-mode-icon-button')
      expect(editButton?.querySelector('svg path[d*="11.333 2"]')).not.toBeNull()
      expect(editButton?.classList.contains('edit-mode-icon-button--active')).toBe(false)

      // 클릭: 편집 모드 활성화
      fireEvent.click(editButton as HTMLElement)
      expect(handleToggleEditMode).toHaveBeenCalledTimes(1)

      // 리렌더링: 체크마크 아이콘
      rerender(
        <DocumentStatusHeader
          {...defaultProps}
          showEditButton={true}
          isEditMode={true}
          onToggleEditMode={handleToggleEditMode}
        />
      )

      editButton = container.querySelector('.edit-mode-icon-button')
      expect(editButton?.querySelector('svg path[d*="13.5 4.5"]')).not.toBeNull()
      expect(editButton?.classList.contains('edit-mode-icon-button--active')).toBe(true)
    })

    it('다른 props와 함께 정상 작동해야 함', () => {
      const { container } = render(
        <DocumentStatusHeader
          {...defaultProps}
          showEditButton={true}
          isEditMode={false}
          onToggleEditMode={vi.fn()}
          documentsCount={42}
        />
      )

      // 편집 버튼 존재
      const editButton = container.querySelector('.edit-mode-icon-button')
      expect(editButton).not.toBeNull()

      // 문서 개수 표시
      const resultCount = container.querySelector('.result-count')
      expect(resultCount?.textContent).toContain('42')

      // 폴링/새로고침 UI 제거됨 (SSE 자동 갱신으로 대체)
      expect(container.querySelector('.header-right')).toBeNull()
    })
  })
})
