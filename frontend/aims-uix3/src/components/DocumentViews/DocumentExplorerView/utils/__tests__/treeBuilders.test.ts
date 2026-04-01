import { describe, it, expect } from 'vitest'
import { buildTree } from '../treeBuilders'
import type { Document } from '@/types/documentStatus'

/** 최소 Document mock */
function mockDoc(overrides: Partial<Document>): Document {
  return {
    _id: `doc-${Math.random().toString(36).slice(2, 8)}`,
    filename: 'test.pdf',
    originalName: 'test.pdf',
    name: 'test.pdf',
    customer_relation: undefined,
    ...overrides,
  } as unknown as Document
}

describe('buildTree', () => {
  it('고객별 분류 시 고객명으로 그룹화한다', () => {
    const docs: Document[] = [
      mockDoc({
        customer_relation: { customer_id: 'c1', customer_name: '강지윤', customer_type: 'personal' },
      }),
      mockDoc({
        customer_relation: { customer_id: 'c1', customer_name: '강지윤', customer_type: 'personal' },
      }),
      mockDoc({
        customer_relation: { customer_id: 'c2', customer_name: '김철수', customer_type: 'personal' },
      }),
    ]

    const result = buildTree(docs, 'customer')
    expect(result.totalDocuments).toBe(3)
    expect(result.groupStats.groupCount).toBe(2)
  })

  it('미연결 문서는 별도 그룹으로 분류한다', () => {
    const docs: Document[] = [
      mockDoc({}), // 고객 미연결
      mockDoc({
        customer_relation: { customer_id: 'c1', customer_name: '강지윤', customer_type: 'personal' },
      }),
    ]

    const result = buildTree(docs, 'customer')
    const unlinked = result.nodes.find((n) => n.key === 'unlinked')
    expect(unlinked).toBeDefined()
    expect(unlinked!.count).toBe(1)
  })

  it('문서유형별 분류 시 TXT/OCR/BIN으로 그룹화한다', () => {
    const docs: Document[] = [
      mockDoc({ meta: { full_text: '텍스트 내용' } } as any),
      mockDoc({ ocr: { status: 'done', confidence: '0.85' } } as any),
      mockDoc({} as any), // meta/ocr 없으면 BIN
    ]

    const result = buildTree(docs, 'badgeType')
    expect(result.nodes.length).toBe(3)
  })
})
