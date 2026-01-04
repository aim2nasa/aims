/**
 * 트리 빌더 유틸리티
 * @description 분류 기준별로 문서 목록을 트리 구조로 변환
 */

import type { Document } from '@/types/documentStatus'
import type { DocumentGroupBy, DocumentTreeNode, DocumentTreeData } from '../types/documentExplorer'

/**
 * 문서의 표시 이름을 가져옵니다
 */
function getDocumentDisplayName(doc: Document): string {
  return doc.displayName || doc.originalName || doc.filename || doc.name || '이름 없음'
}

/**
 * 문서를 리프 노드로 변환합니다
 */
function createDocumentNode(doc: Document): DocumentTreeNode {
  const badgeType = doc.badgeType || 'BIN'
  const iconMap: Record<string, string> = {
    TXT: 'doc.text.fill',
    OCR: 'doc.viewfinder.fill',
    BIN: 'doc.fill',
  }

  return {
    key: `doc-${doc._id || doc.id}`,
    label: getDocumentDisplayName(doc),
    type: 'document',
    icon: iconMap[badgeType],
    document: doc,
    metadata: {
      badgeType: badgeType as 'TXT' | 'OCR' | 'BIN',
    },
  }
}

/**
 * 분류 기준에 따라 트리를 빌드합니다
 */
export function buildTree(documents: Document[], groupBy: DocumentGroupBy): DocumentTreeData {
  switch (groupBy) {
    case 'customer':
      return buildCustomerTree(documents)
    case 'badgeType':
      return buildBadgeTypeTree(documents)
    case 'tag':
      return buildTagTree(documents)
    case 'date':
      return buildDateTree(documents)
    default:
      return buildCustomerTree(documents)
  }
}

/**
 * 고객별 트리: 고객명 → 문서들
 */
function buildCustomerTree(documents: Document[]): DocumentTreeData {
  const groups = new Map<string, { docs: Document[]; customerId?: string; customerType?: string }>()
  const unlinked: Document[] = []

  documents.forEach((doc) => {
    const customerName = doc.customer_relation?.customer_name
    if (customerName) {
      if (!groups.has(customerName)) {
        groups.set(customerName, {
          docs: [],
          customerId: doc.customer_relation?.customer_id,
          customerType: doc.customer_relation?.customer_type || undefined,
        })
      }
      groups.get(customerName)!.docs.push(doc)
    } else {
      unlinked.push(doc)
    }
  })

  const nodes: DocumentTreeNode[] = []

  // 미연결 문서 (맨 위)
  if (unlinked.length > 0) {
    nodes.push({
      key: 'unlinked',
      label: '미연결 문서',
      type: 'group',
      icon: 'exclamationmark.triangle.fill',
      count: unlinked.length,
      children: unlinked.map(createDocumentNode),
    })
  }

  // 고객별 그룹 (가나다순)
  Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'ko'))
    .forEach(([customerName, { docs, customerId, customerType }]) => {
      const isCorpo = customerType === 'corporate'
      nodes.push({
        key: `customer-${customerId || customerName}`,
        label: customerName,
        type: 'group',
        icon: isCorpo ? 'building.2.fill' : 'person.fill',
        count: docs.length,
        metadata: {
          customerId,
          customerType: isCorpo ? 'corporate' : 'personal',
        },
        children: docs.map(createDocumentNode),
      })
    })

  return {
    nodes,
    totalDocuments: documents.length,
    groupStats: {
      groupCount: groups.size + (unlinked.length ? 1 : 0),
    },
  }
}

/**
 * 문서유형별 트리: TXT/OCR/BIN → 문서들
 */
function buildBadgeTypeTree(documents: Document[]): DocumentTreeData {
  const groups: Record<'TXT' | 'OCR' | 'BIN', Document[]> = {
    TXT: [],
    OCR: [],
    BIN: [],
  }

  documents.forEach((doc) => {
    const type = (doc.badgeType || 'BIN') as 'TXT' | 'OCR' | 'BIN'
    groups[type].push(doc)
  })

  const nodeConfigs: Array<{ key: 'TXT' | 'OCR' | 'BIN'; label: string; icon: string }> = [
    { key: 'TXT', label: 'TXT (텍스트 추출)', icon: 'doc.text.fill' },
    { key: 'OCR', label: 'OCR (이미지 스캔)', icon: 'doc.viewfinder.fill' },
    { key: 'BIN', label: 'BIN (바이너리)', icon: 'doc.badge.ellipsis' },
  ]

  const nodes: DocumentTreeNode[] = nodeConfigs
    .filter((cfg) => groups[cfg.key].length > 0)
    .map((cfg) => ({
      key: `badge-${cfg.key}`,
      label: cfg.label,
      type: 'group' as const,
      icon: cfg.icon,
      count: groups[cfg.key].length,
      metadata: { badgeType: cfg.key },
      children: groups[cfg.key].map(createDocumentNode),
    }))

  return {
    nodes,
    totalDocuments: documents.length,
    groupStats: { groupCount: nodes.length },
  }
}

/**
 * 태그별 트리: 태그명 → 문서들
 */
function buildTagTree(documents: Document[]): DocumentTreeData {
  const tagGroups = new Map<string, Document[]>()
  const noTag: Document[] = []

  documents.forEach((doc) => {
    // 태그는 meta.tags에 저장됨
    const meta = (doc as unknown as { meta?: { tags?: string[] } }).meta
    const tags = meta?.tags
    if (tags && tags.length > 0) {
      tags.forEach((tag: string) => {
        if (!tagGroups.has(tag)) {
          tagGroups.set(tag, [])
        }
        tagGroups.get(tag)!.push(doc)
      })
    } else {
      noTag.push(doc)
    }
  })

  const nodes: DocumentTreeNode[] = []

  // 태그 없음 (맨 위)
  if (noTag.length > 0) {
    nodes.push({
      key: 'no-tag',
      label: '태그 없음',
      type: 'group',
      icon: 'tag.slash.fill',
      count: noTag.length,
      children: noTag.map(createDocumentNode),
    })
  }

  // 태그별 그룹 (가나다순)
  Array.from(tagGroups.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'ko'))
    .forEach(([tag, docs]) => {
      nodes.push({
        key: `tag-${tag}`,
        label: tag,
        type: 'group',
        icon: 'tag.fill',
        count: docs.length,
        metadata: { tag },
        children: docs.map(createDocumentNode),
      })
    })

  return {
    nodes,
    totalDocuments: documents.length,
    groupStats: { groupCount: tagGroups.size + (noTag.length ? 1 : 0) },
  }
}

/**
 * 날짜별 트리: 연도 → 월 → 문서들
 */
function buildDateTree(documents: Document[]): DocumentTreeData {
  const yearGroups = new Map<number, Map<number, Document[]>>()
  const noDate: Document[] = []

  documents.forEach((doc) => {
    const dateStr = doc.uploaded_at || doc.created_at || doc.timestamp
    if (dateStr) {
      const date = new Date(dateStr)
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear()
        const month = date.getMonth() + 1

        if (!yearGroups.has(year)) {
          yearGroups.set(year, new Map())
        }
        if (!yearGroups.get(year)!.has(month)) {
          yearGroups.get(year)!.set(month, [])
        }
        yearGroups.get(year)!.get(month)!.push(doc)
        return
      }
    }
    noDate.push(doc)
  })

  const nodes: DocumentTreeNode[] = []

  // 날짜 없음 (맨 위)
  if (noDate.length > 0) {
    nodes.push({
      key: 'no-date',
      label: '날짜 없음',
      type: 'group',
      icon: 'calendar.badge.exclamationmark',
      count: noDate.length,
      children: noDate.map(createDocumentNode),
    })
  }

  // 연도별 그룹 (최신순)
  Array.from(yearGroups.entries())
    .sort((a, b) => b[0] - a[0])
    .forEach(([year, months]) => {
      const yearDocCount = Array.from(months.values()).reduce((sum, docs) => sum + docs.length, 0)

      const monthNodes: DocumentTreeNode[] = Array.from(months.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([month, docs]) => ({
          key: `month-${year}-${month}`,
          label: `${month}월`,
          type: 'subgroup' as const,
          icon: 'calendar',
          count: docs.length,
          metadata: { year, month },
          children: docs.map(createDocumentNode),
        }))

      nodes.push({
        key: `year-${year}`,
        label: `${year}년`,
        type: 'group',
        icon: 'calendar',
        count: yearDocCount,
        metadata: { year },
        children: monthNodes,
      })
    })

  const subgroupCount = Array.from(yearGroups.values()).reduce((sum, m) => sum + m.size, 0)

  return {
    nodes,
    totalDocuments: documents.length,
    groupStats: {
      groupCount: yearGroups.size + (noDate.length ? 1 : 0),
      subgroupCount,
    },
  }
}

/**
 * 트리의 모든 노드 키를 수집합니다 (모두 펼치기용)
 */
export function collectAllKeys(nodes: DocumentTreeNode[]): string[] {
  const keys: string[] = []

  function traverse(node: DocumentTreeNode) {
    if (node.type !== 'document') {
      keys.push(node.key)
      node.children?.forEach(traverse)
    }
  }

  nodes.forEach(traverse)
  return keys
}

/**
 * 검색어로 문서를 필터링합니다
 */
export function filterDocuments(documents: Document[], searchTerm: string): Document[] {
  if (!searchTerm.trim()) return documents

  const term = searchTerm.toLowerCase()
  return documents.filter((doc) => {
    const name = getDocumentDisplayName(doc).toLowerCase()
    const customerName = doc.customer_relation?.customer_name?.toLowerCase() || ''
    return name.includes(term) || customerName.includes(term)
  })
}
