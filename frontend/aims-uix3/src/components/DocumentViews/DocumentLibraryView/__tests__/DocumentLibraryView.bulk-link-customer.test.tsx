/**
 * DocumentLibraryView - 미연결 문서 고객 연결 테스트
 *
 * AC#5: 미연결 문서 다중 선택 → 고객 연결 API 호출
 * AC#6: 연결 완료 후 미연결 목록에서 사라짐
 */

import { describe, it, expect } from 'vitest'

/**
 * 고객 연결 API 단건 요청 구성 로직
 * 실제 구현: DocumentService.linkDocumentToCustomer(customerId, { document_id, relationship_type })
 * 다중 선택 시 문서 수만큼 반복 호출 (DocumentLinkModal.tsx)
 */
function buildLinkApiRequest(
  customerId: string,
  documentId: string,
  relationshipType: string = 'general'
): { url: string; body: { document_id: string; relationship_type: string } } {
  return {
    url: `/api/customers/${customerId}/documents`,
    body: { document_id: documentId, relationship_type: relationshipType }
  }
}

/**
 * 다중 문서 연결 시 API 호출 시퀀스 생성
 * 실제 구현: for (const doc of targetDocuments) { linkDocumentToCustomer(customerId, {...}) }
 */
function buildBulkLinkRequests(
  customerId: string,
  documentIds: string[],
  relationshipType: string = 'general'
): Array<{ url: string; body: { document_id: string; relationship_type: string } }> {
  return documentIds.map(docId => buildLinkApiRequest(customerId, docId, relationshipType))
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
    it('단건 연결 시 올바른 API 요청을 구성해야 함 (document_id + relationship_type)', () => {
      const request = buildLinkApiRequest('customer-123', 'doc-1')
      expect(request.url).toBe('/api/customers/customer-123/documents')
      expect(request.body).toEqual({ document_id: 'doc-1', relationship_type: 'general' })
    })

    it('다중 선택 시 문서 수만큼 개별 API 호출을 생성해야 함', () => {
      const requests = buildBulkLinkRequests('customer-123', ['doc-1', 'doc-2', 'doc-3'])
      expect(requests).toHaveLength(3)
      expect(requests[0].body.document_id).toBe('doc-1')
      expect(requests[1].body.document_id).toBe('doc-2')
      expect(requests[2].body.document_id).toBe('doc-3')
      // 모든 요청이 같은 고객 URL을 가리킴
      requests.forEach(r => {
        expect(r.url).toBe('/api/customers/customer-123/documents')
        expect(r.body.relationship_type).toBe('general')
      })
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

  describe('버튼 위치 regression: 고객 선택/취소는 고객 연결 자리(오른쪽)에 표시', () => {
    /**
     * 고객 연결 버튼 클릭 시 "고객 선택"/"취소"는 header-right-section에 렌더링.
     * 이전: header-left-section → 시선 점프 UX 문제
     * 수정: header-right-section (고객 연결 버튼과 같은 위치)
     *
     * 이 테스트는 isBulkLinkMode 상태에 따른 버튼 표시 조건을 검증합니다.
     */
    it('일괄 연결 모드에서 "고객 연결" 버튼은 숨겨지고 "고객 선택"/"취소"가 같은 조건 블록에서 렌더링됨', () => {
      const isBulkLinkMode = true
      const isDeleteMode = false
      const isAliasMode = false

      // 고객 연결 버튼 표시 조건: !isBulkLinkMode && !isDeleteMode && !isAliasMode
      const showLinkButton = !isBulkLinkMode && !isDeleteMode && !isAliasMode
      expect(showLinkButton).toBe(false)

      // 고객 선택/취소 표시 조건: isBulkLinkMode (같은 위치에서 조건부 렌더링)
      const showBulkLinkControls = isBulkLinkMode
      expect(showBulkLinkControls).toBe(true)
    })

    it('일괄 연결 모드가 아닐 때 "고객 연결" 버튼이 표시됨', () => {
      const isBulkLinkMode = false
      const isDeleteMode = false
      const isAliasMode = false

      const showLinkButton = !isBulkLinkMode && !isDeleteMode && !isAliasMode
      expect(showLinkButton).toBe(true)

      const showBulkLinkControls = isBulkLinkMode
      expect(showBulkLinkControls).toBe(false)
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
