/**
 * 검색 결과 모두 표시 — Regression 테스트
 *
 * @description 검색 시 고객당 5건 제한 제거 후,
 *   "더 보기" 노드가 생성되지 않고 모든 문서가 트리에 포함되는지 검증.
 *   customerSummaryTree useMemo 로직의 핵심 분기를 순수 함수 형태로 재현하여 테스트.
 *
 * @regression 고객당 5건 제한 제거 + "더 보기" subgroup 노드 삭제
 */

import { describe, it, expect } from 'vitest'

// === customerSummaryTree 빌드 로직 재현 ===
// ⚠️ 동기화 필요: 이 로직은 DocumentExplorerView.tsx의 customerSummaryTree useMemo(약 line 632~700)와
// 동일한 구조를 재현합니다. 해당 useMemo 로직이 변경되면 이 테스트도 함께 수정해야 합니다.

interface SearchDocument {
  _id: string
  displayName: string | null
  originalName: string
  uploadedAt: string | null
  fileSize: number | null
  mimeType: string | null
  customerId: string
  customerName: string
  document_type: string | null
  badgeType: string
}

interface CustomerEntry {
  customerId: string
  name: string
  initial: string
  docCount: number
  latestUpload: string | null
  customerType?: string | null
  matchedDocCount?: number
  nameMatched?: boolean
}

interface TreeNode {
  key: string
  label: string
  type: 'group' | 'document' | 'subgroup'
  icon: string
  count?: number
  children?: TreeNode[]
  metadata?: Record<string, unknown>
}

/**
 * 검색 결과 트리 노드 빌드 (DocumentExplorerView의 customerSummaryTree 핵심 로직 재현)
 */
function buildSearchResultNodes(
  customers: CustomerEntry[],
  searchDocuments: SearchDocument[],
): TreeNode[] {
  // searchDocuments를 고객별로 그룹핑
  const searchDocsByCustomer = new Map<string, SearchDocument[]>()
  searchDocuments.forEach(doc => {
    if (!doc.customerId) return
    const existing = searchDocsByCustomer.get(doc.customerId) || []
    existing.push(doc)
    searchDocsByCustomer.set(doc.customerId, existing)
  })

  return customers.map(c => {
    const matchedDocs = searchDocsByCustomer.get(c.customerId) || []
    const totalMatchCount = c.matchedDocCount || matchedDocs.length
    const children: TreeNode[] = matchedDocs.map(doc => ({
      key: `search-doc-${doc._id}`,
      label: doc.displayName || doc.originalName,
      type: 'document' as const,
      icon: 'doc.fill',
    }))

    // NOTE: "더 보기" 노드 생성 로직이 제거됨 (이 테스트의 핵심)

    return {
      key: `customer-${c.customerId}`,
      label: c.name,
      type: 'group' as const,
      icon: c.customerType === '법인' ? 'building.2.fill' : 'person.fill',
      count: totalMatchCount > 0 ? totalMatchCount : c.docCount,
      children,
      metadata: {
        customerId: c.customerId,
        customerType: c.customerType === '법인' ? 'corporate' : 'personal',
        nameMatched: c.nameMatched || false,
      },
    }
  })
}

// === 테스트 데이터 ===

/** 고객당 10건의 검색 결과 (이전에는 5건 제한으로 "더 보기"가 표시됨) */
function createSearchDocs(customerId: string, customerName: string, count: number): SearchDocument[] {
  return Array.from({ length: count }, (_, i) => ({
    _id: `doc-${customerId}-${i}`,
    displayName: `문서_${i + 1}.pdf`,
    originalName: `document_${i + 1}.pdf`,
    uploadedAt: '2026-04-01T00:00:00Z',
    fileSize: 1024 * (i + 1),
    mimeType: 'application/pdf',
    customerId,
    customerName,
    document_type: null,
    badgeType: 'PDF',
  }))
}

// === 테스트 ===

describe('검색 결과 모두 표시 — "더 보기" 노드 제거 regression', () => {

  it('고객당 10건 매칭 시 모든 문서가 children에 포함되어야 함', () => {
    const customers: CustomerEntry[] = [
      { customerId: 'c1', name: '홍길동', initial: 'ㅎ', docCount: 50, latestUpload: null, matchedDocCount: 10 },
    ]
    const searchDocs = createSearchDocs('c1', '홍길동', 10)

    const nodes = buildSearchResultNodes(customers, searchDocs)

    expect(nodes).toHaveLength(1)
    expect(nodes[0].children).toHaveLength(10) // 이전에는 5건 + "더 보기" = 6건이었음
    expect(nodes[0].count).toBe(10)
  })

  it('"더 보기" subgroup 노드가 존재하지 않아야 함', () => {
    const customers: CustomerEntry[] = [
      { customerId: 'c1', name: '홍길동', initial: 'ㅎ', docCount: 100, latestUpload: null, matchedDocCount: 30 },
    ]
    const searchDocs = createSearchDocs('c1', '홍길동', 30)

    const nodes = buildSearchResultNodes(customers, searchDocs)

    const allChildren = nodes[0].children || []
    const subgroupNodes = allChildren.filter(n => n.type === 'subgroup')
    const moreDocsNodes = allChildren.filter(n => n.key.startsWith('more-docs'))

    expect(subgroupNodes).toHaveLength(0)
    expect(moreDocsNodes).toHaveLength(0)
  })

  it('matchedDocCount와 실제 문서 수가 동일해야 함 (서버가 전체 반환)', () => {
    const customers: CustomerEntry[] = [
      { customerId: 'c1', name: '김영희', initial: 'ㄱ', docCount: 200, latestUpload: null, matchedDocCount: 15 },
      { customerId: 'c2', name: '이철수', initial: 'ㅇ', docCount: 80, latestUpload: null, matchedDocCount: 3 },
    ]
    const searchDocs = [
      ...createSearchDocs('c1', '김영희', 15),
      ...createSearchDocs('c2', '이철수', 3),
    ]

    const nodes = buildSearchResultNodes(customers, searchDocs)

    // c1: 15건 모두 표시
    expect(nodes[0].children).toHaveLength(15)
    expect(nodes[0].count).toBe(15)

    // c2: 3건 모두 표시
    expect(nodes[1].children).toHaveLength(3)
    expect(nodes[1].count).toBe(3)

    // 어떤 노드에도 "더 보기" 없음
    nodes.forEach(node => {
      const subgroups = (node.children || []).filter(c => c.type === 'subgroup')
      expect(subgroups).toHaveLength(0)
    })
  })

  it('매칭 문서가 0건인 고객도 정상 처리', () => {
    const customers: CustomerEntry[] = [
      { customerId: 'c1', name: '박민수', initial: 'ㅂ', docCount: 10, latestUpload: null, matchedDocCount: 0, nameMatched: true },
    ]

    const nodes = buildSearchResultNodes(customers, [])

    expect(nodes[0].children).toHaveLength(0)
    expect(nodes[0].count).toBe(10) // matchedDocCount 0이면 docCount 사용
  })

  it('검색 결과가 1건인 경우도 정상 처리', () => {
    const customers: CustomerEntry[] = [
      { customerId: 'c1', name: '최수진', initial: 'ㅊ', docCount: 50, latestUpload: null, matchedDocCount: 1 },
    ]
    const searchDocs = createSearchDocs('c1', '최수진', 1)

    const nodes = buildSearchResultNodes(customers, searchDocs)

    expect(nodes[0].children).toHaveLength(1)
    expect(nodes[0].count).toBe(1)
  })
})
