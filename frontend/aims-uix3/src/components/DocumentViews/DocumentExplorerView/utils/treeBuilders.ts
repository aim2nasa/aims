/**
 * 트리 빌더 유틸리티
 * @description 분류 기준별로 문서 목록을 트리 구조로 변환
 */

import type { Document } from '@/types/documentStatus'
import type { DocumentGroupBy, DocumentSortBy, SortDirection, DocumentTreeNode, DocumentTreeData } from '../types/documentExplorer'

/**
 * 문서의 표시 이름을 가져옵니다
 */
function getDocumentDisplayName(doc: Document): string {
  return doc.displayName || doc.originalName || doc.filename || doc.name || '이름 없음'
}

/**
 * 문서에서 날짜를 추출합니다
 * 우선순위: upload.uploaded_at > uploaded_at > created_at > timestamp
 */
export function getDocumentDate(doc: Document): string | undefined {
  // upload 객체 내의 uploaded_at (실제 데이터 위치)
  const upload = doc.upload
  if (upload && typeof upload === 'object') {
    const uploadData = upload as { uploaded_at?: string; timestamp?: string }
    if (uploadData.uploaded_at) return uploadData.uploaded_at
    if (uploadData.timestamp) return uploadData.timestamp
  }
  // 문서 루트 레벨의 날짜 필드들
  return doc.uploaded_at || doc.created_at || doc.timestamp
}

/**
 * 문서를 리프 노드로 변환합니다
 */
function createDocumentNode(doc: Document, includeDate = false): DocumentTreeNode {
  const badgeType = doc.badgeType || 'BIN'
  const iconMap: Record<string, string> = {
    TXT: 'doc.text.fill',
    OCR: 'doc.viewfinder.fill',
    BIN: 'doc.fill',
  }

  const metadata: DocumentTreeNode['metadata'] = {
    badgeType: badgeType as 'TXT' | 'OCR' | 'BIN',
  }

  // 날짜별 분류 시 uploadedAt 포함
  if (includeDate) {
    metadata.uploadedAt = getDocumentDate(doc)
  }

  return {
    key: `doc-${doc._id || doc.id}`,
    label: getDocumentDisplayName(doc),
    type: 'document',
    icon: iconMap[badgeType],
    document: doc,
    metadata,
  }
}

/**
 * 분류 기준에 따라 트리를 빌드합니다
 */
export function buildTree(documents: Document[], groupBy: DocumentGroupBy, minTagCount: number = 1): DocumentTreeData {
  switch (groupBy) {
    case 'customer':
      return buildCustomerTree(documents)
    case 'customerTag':
      return buildCustomerTagTree(documents, minTagCount)
    case 'badgeType':
      return buildBadgeTypeTree(documents)
    case 'tag':
      return buildTagTree(documents, minTagCount)
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
      children: unlinked.map((doc) => createDocumentNode(doc)),
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
        children: docs.map((doc) => createDocumentNode(doc)),
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
 * 고객>태그별 트리: 고객명 → 태그 → 문서들
 */
function buildCustomerTagTree(documents: Document[], minTagCount: number = 1): DocumentTreeData {
  const customerGroups = new Map<string, { docs: Document[]; customerId?: string; customerType?: string }>()
  const unlinked: Document[] = []

  // 1단계: 고객별로 문서 분류
  documents.forEach((doc) => {
    const customerName = doc.customer_relation?.customer_name
    if (customerName) {
      if (!customerGroups.has(customerName)) {
        customerGroups.set(customerName, {
          docs: [],
          customerId: doc.customer_relation?.customer_id,
          customerType: doc.customer_relation?.customer_type || undefined,
        })
      }
      customerGroups.get(customerName)!.docs.push(doc)
    } else {
      unlinked.push(doc)
    }
  })

  const nodes: DocumentTreeNode[] = []
  let totalSubgroups = 0

  // 미연결 문서 (맨 위) - 태그별 서브그룹
  if (unlinked.length > 0) {
    const { tagNodes, subgroupCount } = buildTagSubgroups(unlinked, minTagCount)
    totalSubgroups += subgroupCount
    nodes.push({
      key: 'unlinked',
      label: '미연결 문서',
      type: 'group',
      icon: 'exclamationmark.triangle.fill',
      count: unlinked.length,
      children: tagNodes,
    })
  }

  // 고객별 그룹 (가나다순)
  Array.from(customerGroups.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'ko'))
    .forEach(([customerName, { docs, customerId, customerType }]) => {
      const isCorpo = customerType === 'corporate'
      const { tagNodes, subgroupCount } = buildTagSubgroups(docs, minTagCount)
      totalSubgroups += subgroupCount

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
        children: tagNodes,
      })
    })

  return {
    nodes,
    totalDocuments: documents.length,
    groupStats: {
      groupCount: customerGroups.size + (unlinked.length ? 1 : 0),
      subgroupCount: totalSubgroups,
    },
  }
}

/**
 * 문서 목록을 태그별 서브그룹으로 분류 (고객>태그별용)
 * - minTagCount 이하의 태그는 "기타" 폴더로 그룹화
 */
function buildTagSubgroups(docs: Document[], minTagCount: number = 1): { tagNodes: DocumentTreeNode[]; subgroupCount: number } {
  const tagGroups = new Map<string, Document[]>()
  const noTag: Document[] = []

  docs.forEach((doc) => {
    const meta = (doc as unknown as { meta?: { tags?: string[] } }).meta
    const tags = meta?.tags
    if (tags && tags.length > 0) {
      // 모든 태그에 문서 추가 (중복 표시)
      tags.forEach((tag) => {
        if (!tagGroups.has(tag)) {
          tagGroups.set(tag, [])
        }
        tagGroups.get(tag)!.push(doc)
      })
    } else {
      noTag.push(doc)
    }
  })

  const tagNodes: DocumentTreeNode[] = []

  // 문서 수 기준 내림차순 정렬
  const sortedTags = Array.from(tagGroups.entries())
    .sort((a, b) => b[1].length - a[1].length)

  // 메인 태그와 기타 태그 분리
  const mainTags: Array<[string, Document[]]> = []
  const otherTags: Array<[string, Document[]]> = []

  sortedTags.forEach(([tag, tagDocs]) => {
    if (tagDocs.length > minTagCount) {
      mainTags.push([tag, tagDocs])
    } else {
      otherTags.push([tag, tagDocs])
    }
  })

  // 메인 태그 노드 (문서 수 내림차순)
  mainTags.forEach(([tag, tagDocs]) => {
    tagNodes.push({
      key: `tag-${tag}`,
      label: tag,
      type: 'subgroup',
      icon: 'tag.fill',
      count: tagDocs.length,
      metadata: { tag },
      children: tagDocs.map((doc) => createDocumentNode(doc)),
    })
  })

  // 기타 폴더 (minTagCount건 이하 태그들)
  if (otherTags.length > 0) {
    const otherChildren: DocumentTreeNode[] = otherTags.map(([tag, tagDocs]) => ({
      key: `tag-${tag}`,
      label: tag,
      type: 'subgroup' as const,
      icon: 'tag',
      count: tagDocs.length,
      metadata: { tag },
      children: tagDocs.map((doc) => createDocumentNode(doc)),
    }))

    tagNodes.push({
      key: 'other-tags',
      label: '기타',
      type: 'subgroup',
      icon: 'ellipsis.circle.fill',
      count: otherTags.reduce((sum, [, tagDocs]) => sum + tagDocs.length, 0),
      children: otherChildren,
      metadata: { isSpecial: true },
    })
  }

  // 태그 없음 (맨 아래)
  if (noTag.length > 0) {
    tagNodes.push({
      key: 'no-tag',
      label: '태그 없음',
      type: 'subgroup',
      icon: 'tag.slash',
      count: noTag.length,
      metadata: { isSpecial: true },
      children: noTag.map((doc) => createDocumentNode(doc)),
    })
  }

  return {
    tagNodes,
    subgroupCount: mainTags.length + (otherTags.length ? 1 : 0) + (noTag.length ? 1 : 0),
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
      children: groups[cfg.key].map((doc) => createDocumentNode(doc)),
    }))

  return {
    nodes,
    totalDocuments: documents.length,
    groupStats: { groupCount: nodes.length },
  }
}

/**
 * 태그별 트리: 태그명 → 문서들
 * - 메인 태그: 문서 수 내림차순 정렬
 * - 기타: minTagCount 이하 태그들
 * - 태그 없음: 맨 아래
 */
function buildTagTree(documents: Document[], minTagCount: number = 1): DocumentTreeData {
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

  // 문서 수 기준 내림차순 정렬
  const sortedTags = Array.from(tagGroups.entries())
    .sort((a, b) => b[1].length - a[1].length)

  // 1. 메인 태그와 기타 태그 분리
  const mainTags: Array<[string, Document[]]> = []
  const otherTags: Array<[string, Document[]]> = []

  sortedTags.forEach(([tag, docs]) => {
    if (docs.length > minTagCount) {
      mainTags.push([tag, docs])
    } else {
      otherTags.push([tag, docs])
    }
  })

  // 2. 메인 태그 노드 (문서 수 내림차순)
  mainTags.forEach(([tag, docs]) => {
    nodes.push({
      key: `tag-${tag}`,
      label: tag,
      type: 'group',
      icon: 'tag.fill',
      count: docs.length,
      metadata: { tag },
      children: docs.map((doc) => createDocumentNode(doc)),
    })
  })

  // 3. 기타 폴더 (minTagCount건 이하 태그들)
  if (otherTags.length > 0) {
    const otherChildren: DocumentTreeNode[] = otherTags.map(([tag, docs]) => ({
      key: `tag-${tag}`,
      label: tag,
      type: 'subgroup' as const,
      icon: 'tag',
      count: docs.length,
      metadata: { tag },
      children: docs.map((doc) => createDocumentNode(doc)),
    }))

    nodes.push({
      key: 'other-tags',
      label: '기타',
      type: 'group',
      icon: 'ellipsis.circle.fill',
      count: otherTags.reduce((sum, [, docs]) => sum + docs.length, 0),
      children: otherChildren,
      metadata: { isSpecial: true },
    })
  }

  // 4. 태그 없음 (맨 아래)
  if (noTag.length > 0) {
    nodes.push({
      key: 'no-tag',
      label: '태그 없음',
      type: 'group',
      icon: 'tag.slash.fill',
      count: noTag.length,
      children: noTag.map((doc) => createDocumentNode(doc)),
      metadata: { isSpecial: true },
    })
  }

  return {
    nodes,
    totalDocuments: documents.length,
    groupStats: { groupCount: mainTags.length + (noTag.length ? 1 : 0) + (otherTags.length ? 1 : 0) },
  }
}

/**
 * 날짜별 트리: 연도 → 월 → 문서들
 */
function buildDateTree(documents: Document[]): DocumentTreeData {
  const yearGroups = new Map<number, Map<number, Document[]>>()
  const noDate: Document[] = []

  documents.forEach((doc) => {
    const dateStr = getDocumentDate(doc)
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
      children: noDate.map((doc) => createDocumentNode(doc, true)),
      metadata: { isSpecial: true },
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
          // 날짜별 분류: 문서에 날짜/시간 포함
          children: docs.map((doc) => createDocumentNode(doc, true)),
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
 * 파일명 매칭 문서를 우선 정렬합니다
 */
export function filterDocuments(documents: Document[], searchTerm: string): Document[] {
  if (!searchTerm.trim()) return documents

  const term = searchTerm.toLowerCase()

  // 필터링 + 관련도 점수 계산
  const filtered = documents
    .map((doc) => {
      const name = getDocumentDisplayName(doc).toLowerCase()
      const customerName = doc.customer_relation?.customer_name?.toLowerCase() || ''
      const nameMatch = name.includes(term)
      const customerMatch = customerName.includes(term)

      if (!nameMatch && !customerMatch) return null

      // 점수: 파일명 매칭 = 2, 고객명만 매칭 = 1
      const score = nameMatch ? 2 : 1
      return { doc, score }
    })
    .filter((item): item is { doc: Document; score: number } => item !== null)

  // 점수 내림차순 정렬 (파일명 매칭 우선)
  filtered.sort((a, b) => b.score - a.score)

  return filtered.map((item) => item.doc)
}

/**
 * 문서 노드들을 정렬합니다
 */
function sortDocumentNodes(
  nodes: DocumentTreeNode[],
  sortBy: DocumentSortBy,
  sortDirection: SortDirection
): DocumentTreeNode[] {
  const multiplier = sortDirection === 'asc' ? 1 : -1

  return [...nodes].sort((a, b) => {
    const docA = a.document
    const docB = b.document

    if (!docA || !docB) return 0

    switch (sortBy) {
      case 'name': {
        const nameA = getDocumentDisplayName(docA).toLowerCase()
        const nameB = getDocumentDisplayName(docB).toLowerCase()
        return nameA.localeCompare(nameB, 'ko') * multiplier
      }
      case 'date': {
        const dateA = getDocumentDate(docA) || ''
        const dateB = getDocumentDate(docB) || ''
        // 날짜가 없는 문서는 맨 뒤로
        if (!dateA && !dateB) return 0
        if (!dateA) return 1
        if (!dateB) return -1
        return dateA.localeCompare(dateB) * multiplier
      }
      case 'badgeType': {
        const typeOrder = { TXT: 1, OCR: 2, BIN: 3 }
        const typeA = (docA.badgeType || 'BIN') as 'TXT' | 'OCR' | 'BIN'
        const typeB = (docB.badgeType || 'BIN') as 'TXT' | 'OCR' | 'BIN'
        return (typeOrder[typeA] - typeOrder[typeB]) * multiplier
      }
      case 'customer': {
        const customerA = docA.customer_relation?.customer_name?.toLowerCase() || ''
        const customerB = docB.customer_relation?.customer_name?.toLowerCase() || ''
        // 고객 없는 문서는 맨 뒤로
        if (!customerA && !customerB) return 0
        if (!customerA) return 1
        if (!customerB) return -1
        return customerA.localeCompare(customerB, 'ko') * multiplier
      }
      default:
        return 0
    }
  })
}

/**
 * 트리의 모든 문서 노드에 정렬을 적용합니다 (재귀)
 */
export function sortTreeNodes(
  nodes: DocumentTreeNode[],
  sortBy: DocumentSortBy,
  sortDirection: SortDirection
): DocumentTreeNode[] {
  return nodes.map((node) => {
    if (node.type === 'document') {
      return node
    }

    // 그룹/서브그룹 노드: 자식 노드 정렬
    const children = node.children || []

    // 문서 노드와 그룹 노드 분리
    const documentNodes = children.filter((child) => child.type === 'document')
    const groupNodes = children.filter((child) => child.type !== 'document')

    // 문서 노드만 정렬
    const sortedDocumentNodes = sortDocumentNodes(documentNodes, sortBy, sortDirection)

    // 그룹 노드는 재귀적으로 처리
    const sortedGroupNodes = sortTreeNodes(groupNodes, sortBy, sortDirection)

    return {
      ...node,
      children: [...sortedGroupNodes, ...sortedDocumentNodes],
    }
  })
}
