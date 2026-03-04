import { describe, it, expect } from 'vitest'
import { buildTree } from '../treeBuilders'
import type { Document } from '@/types/documentStatus'

/** 최소 Document mock */
function mockDoc(overrides: Partial<Document> & { tags?: string[] }): Document {
  return {
    _id: `doc-${Math.random().toString(36).slice(2, 8)}`,
    filename: 'test.pdf',
    originalName: 'test.pdf',
    name: 'test.pdf',
    badgeType: 'TXT',
    customer_relation: undefined,
    ...overrides,
  } as unknown as Document
}

/** 트리 노드에서 모든 key를 재귀 수집 */
function collectAllKeys(nodes: { key: string; children?: { key: string; children?: unknown[] }[] }[]): string[] {
  const keys: string[] = []
  function traverse(node: { key: string; children?: unknown[] }) {
    keys.push(node.key)
    if (Array.isArray(node.children)) {
      node.children.forEach((child) => traverse(child as { key: string; children?: unknown[] }))
    }
  }
  nodes.forEach(traverse)
  return keys
}

describe('buildTagSubgroups 키 유니크성', () => {
  it('서로 다른 고객의 같은 태그(AR)가 유니크한 키를 가져야 한다', () => {
    const docs: Document[] = [
      mockDoc({
        tags: ['AR'],
        customer_relation: { customer_id: 'c1', customer_name: '강지윤', customer_type: 'personal' },
      }),
      mockDoc({
        tags: ['AR'],
        customer_relation: { customer_id: 'c2', customer_name: '강혜정', customer_type: 'personal' },
      }),
    ]

    const result = buildTree(docs, 'customerTag', 1)
    const allKeys = collectAllKeys(result.nodes)

    // 키 중복 검사
    const uniqueKeys = new Set(allKeys)
    expect(uniqueKeys.size).toBe(allKeys.length)

    // 각 고객의 AR 태그 키가 고객ID를 포함해야 함
    const arKeys = allKeys.filter((k) => k.includes('tag-AR'))
    expect(arKeys.length).toBe(2)
    expect(arKeys[0]).not.toBe(arKeys[1])
  })

  it('미연결 문서와 고객 문서가 같은 태그를 가질 때 키 충돌 없음', () => {
    const docs: Document[] = [
      mockDoc({ tags: ['AR'] }), // 미연결
      mockDoc({
        tags: ['AR'],
        customer_relation: { customer_id: 'c1', customer_name: '강지윤', customer_type: 'personal' },
      }),
    ]

    const result = buildTree(docs, 'customerTag', 1)
    const allKeys = collectAllKeys(result.nodes)

    const uniqueKeys = new Set(allKeys)
    expect(uniqueKeys.size).toBe(allKeys.length)
  })

  it('other-tags, no-tag 키도 parentKey 프리픽스 적용', () => {
    const docs: Document[] = [
      mockDoc({
        tags: ['희귀태그'],
        customer_relation: { customer_id: 'c1', customer_name: '강지윤', customer_type: 'personal' },
      }),
      mockDoc({
        customer_relation: { customer_id: 'c1', customer_name: '강지윤', customer_type: 'personal' },
      }), // 태그 없음
    ]

    // minTagCount=10으로 설정해서 '희귀태그'가 기타로 분류되도록
    const result = buildTree(docs, 'customerTag', 10)
    const allKeys = collectAllKeys(result.nodes)

    // other-tags와 no-tag가 고객ID 프리픽스를 가져야 함
    const otherTagKey = allKeys.find((k) => k.includes('other-tags'))
    const noTagKey = allKeys.find((k) => k.includes('no-tag'))

    expect(otherTagKey).toContain('c1')
    expect(noTagKey).toContain('c1')
  })

  it('3명의 고객이 AR, CRS를 모두 가질 때 키 전체 유니크', () => {
    const customers = [
      { id: 'c1', name: '강지윤' },
      { id: 'c2', name: '강혜정' },
      { id: 'c3', name: '강정모' },
    ]

    const docs = customers.flatMap((c) => [
      mockDoc({
        tags: ['AR'],
        customer_relation: { customer_id: c.id, customer_name: c.name, customer_type: 'personal' },
      }),
      mockDoc({
        tags: ['CRS'],
        customer_relation: { customer_id: c.id, customer_name: c.name, customer_type: 'personal' },
      }),
    ])

    const result = buildTree(docs, 'customerTag', 1)
    const allKeys = collectAllKeys(result.nodes)

    const uniqueKeys = new Set(allKeys)
    expect(uniqueKeys.size).toBe(allKeys.length)

    // AR 키 3개, CRS 키 3개 — 모두 다른 값
    const arKeys = allKeys.filter((k) => k.includes('tag-AR'))
    const crsKeys = allKeys.filter((k) => k.includes('tag-CRS'))
    expect(arKeys.length).toBe(3)
    expect(crsKeys.length).toBe(3)
    expect(new Set(arKeys).size).toBe(3)
    expect(new Set(crsKeys).size).toBe(3)
  })
})
