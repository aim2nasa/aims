/**
 * DocumentStatusList 프리뷰 하이라이트 테스트
 *
 * CP에서 문서 클릭 시 RP에 표시되는 문서가 CP에서 하이라이트되는 기능 검증
 * - previewDocumentId 전달 시 해당 행에 status-item--preview 클래스 적용
 * - previewDocumentId 미전달 시 클래스 없음
 * - isSelected와 isPreview가 독립적으로 동작
 */

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { DocumentStatusList } from '../DocumentStatusList'
import type { Document } from '../../../../../types/documentStatus'

describe('DocumentStatusList - 프리뷰 하이라이트 테스트', () => {
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

  describe('프리뷰 하이라이트 표시', () => {
    it('previewDocumentId가 전달되면 해당 행에 status-item--preview 클래스가 적용되어야 함', () => {
      const { container } = render(
        <DocumentStatusList
          {...defaultProps}
          previewDocumentId="doc-2"
        />
      )

      const rows = container.querySelectorAll('.status-item')
      const previewRows = container.querySelectorAll('.status-item--preview')
      expect(previewRows.length).toBe(1)
      // doc-2는 두 번째 행 (index 1)
      expect(rows[1]?.classList.contains('status-item--preview')).toBe(true)
      expect(rows[0]?.classList.contains('status-item--preview')).toBe(false)
      expect(rows[2]?.classList.contains('status-item--preview')).toBe(false)
    })

    it('previewDocumentId가 없으면 어떤 행에도 status-item--preview가 없어야 함', () => {
      const { container } = render(
        <DocumentStatusList
          {...defaultProps}
        />
      )

      const previewRows = container.querySelectorAll('.status-item--preview')
      expect(previewRows.length).toBe(0)
    })

    it('previewDocumentId가 null이면 어떤 행에도 status-item--preview가 없어야 함', () => {
      const { container } = render(
        <DocumentStatusList
          {...defaultProps}
          previewDocumentId={null}
        />
      )

      const previewRows = container.querySelectorAll('.status-item--preview')
      expect(previewRows.length).toBe(0)
    })

    it('isSelected와 isPreview가 독립적으로 동작해야 함', () => {
      const { container } = render(
        <DocumentStatusList
          {...defaultProps}
          isDeleteMode={true}
          selectedDocumentIds={new Set(['doc-1'])}
          onSelectAll={vi.fn()}
          onSelectDocument={vi.fn()}
          previewDocumentId="doc-2"
        />
      )

      const rows = container.querySelectorAll('.status-item')
      // doc-1: selected O, preview X
      expect(rows[0]?.classList.contains('status-item--selected')).toBe(true)
      expect(rows[0]?.classList.contains('status-item--preview')).toBe(false)
      // doc-2: selected X, preview O
      expect(rows[1]?.classList.contains('status-item--selected')).toBe(false)
      expect(rows[1]?.classList.contains('status-item--preview')).toBe(true)
    })
  })
})
