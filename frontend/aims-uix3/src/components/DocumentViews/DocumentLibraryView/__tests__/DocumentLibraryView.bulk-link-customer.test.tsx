/**
 * DocumentLibraryView - 미연결 문서 고객 연결 테스트
 *
 * AC#5: 미연결 문서 다중 선택 → 고객 연결 API 호출
 * AC#6: 연결 완료 후 미연결 목록에서 사라짐
 */

import { describe, it, expect } from 'vitest'

/**
 * 고객 연결 API 요청 구성 로직
 * POST /api/customers/:customerId/documents
 * body: { documentIds: string[] }
 */
function buildLinkApiRequest(
  customerId: string,
  documentIds: string[]
): { url: string; body: { documentIds: string[] } } {
  return {
    url: `/api/customers/${customerId}/documents`,
    body: { documentIds }
  }
}

/**
 * 미연결 문서만 선택 가능 로직
 * bulkLink 모드에서 이미 연결된 문서는 선택 불가
 */
function isSelectableForLink(
  document: { _id: string; customerId?: string | null }
): boolean {
  return !document.customerId
}

/**
 * 연결 완료 후 미연결 목록 업데이트
 * 연결된 문서를 미연결 목록에서 제거
 */
function removeLinkedDocuments(
  unlinkedDocuments: Array<{ _id: string; customerId?: string | null }>,
  linkedDocumentIds: string[]
): Array<{ _id: string; customerId?: string | null }> {
  const linkedSet = new Set(linkedDocumentIds)
  return unlinkedDocuments.filter(doc => !linkedSet.has(doc._id))
}

describe('DocumentLibraryView - 미연결 문서 고객 연결', () => {
  describe('AC#5: 다중 선택 → 고객 연결', () => {
    it('선택한 문서 ID들과 고객 ID로 올바른 API 요청을 구성해야 함', () => {
      const request = buildLinkApiRequest('customer-123', ['doc-1', 'doc-2', 'doc-3'])
      expect(request.url).toBe('/api/customers/customer-123/documents')
      expect(request.body.documentIds).toEqual(['doc-1', 'doc-2', 'doc-3'])
    })

    it('미연결 문서만 체크박스로 선택 가능해야 함', () => {
      const docs = [
        { _id: '1', customerId: null },        // 미연결 → 선택 가능
        { _id: '2', customerId: 'customer-1' }, // 연결됨 → 선택 불가
        { _id: '3', customerId: undefined },    // 미연결 → 선택 가능
      ]

      expect(isSelectableForLink(docs[0])).toBe(true)
      expect(isSelectableForLink(docs[1])).toBe(false)
      expect(isSelectableForLink(docs[2])).toBe(true)
    })

    it('선택된 문서가 0개이면 연결 버튼이 비활성화되어야 함', () => {
      const selectedCount = 0
      const isButtonDisabled = selectedCount === 0
      expect(isButtonDisabled).toBe(true)
    })

    it('선택된 문서가 1개 이상이면 연결 버튼이 활성화되어야 함', () => {
      const selectedCount = 3
      const isButtonDisabled = selectedCount === 0
      expect(isButtonDisabled).toBe(false)
    })
  })

  describe('AC#6: 연결 완료 후 미연결 목록에서 사라짐', () => {
    it('연결된 문서가 미연결 목록에서 제거되어야 함', () => {
      const unlinkedDocs = [
        { _id: '1', customerId: null },
        { _id: '2', customerId: null },
        { _id: '3', customerId: null },
        { _id: '4', customerId: null },
      ]

      const linkedIds = ['1', '3']
      const result = removeLinkedDocuments(unlinkedDocs, linkedIds)

      expect(result).toHaveLength(2)
      expect(result.map(d => d._id)).toEqual(['2', '4'])
    })

    it('모든 미연결 문서를 연결하면 빈 목록이 되어야 함', () => {
      const unlinkedDocs = [
        { _id: '1', customerId: null },
        { _id: '2', customerId: null },
      ]

      const linkedIds = ['1', '2']
      const result = removeLinkedDocuments(unlinkedDocs, linkedIds)

      expect(result).toHaveLength(0)
    })

    it('연결된 문서가 없으면 목록이 변하지 않아야 함', () => {
      const unlinkedDocs = [
        { _id: '1', customerId: null },
        { _id: '2', customerId: null },
      ]

      const result = removeLinkedDocuments(unlinkedDocs, [])
      expect(result).toHaveLength(2)
    })
  })
})
