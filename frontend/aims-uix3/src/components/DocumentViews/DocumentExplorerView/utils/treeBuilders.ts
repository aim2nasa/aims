/**
 * 트리 빌더 유틸리티
 * @description 분류 기준별로 문서 목록을 트리 구조로 변환
 */

import type { Document } from '@/types/documentStatus'
import type { DocumentGroupBy, DocumentSortBy, SortDirection, DocumentTreeNode, DocumentTreeData, InitialType } from '../types/documentExplorer'
import { DOCUMENT_CATEGORIES, getCategoryForType, getDocumentTypeLabel, getTypeDisplayOrder } from '@/shared/constants/documentCategories'
import { DocumentUtils } from '@/entities/document'
import { DocumentStatusService } from '@/services/DocumentStatusService'

/** 대분류 카테고리별 이모지 (SF Symbol 이름 대신 실제 이모지 사용) */
const CATEGORY_EMOJI: Record<string, string> = {
  insurance: '🛡️',
  claim: '🏥',
  identity: '🪪',
  medical: '❤️',
  asset: '🏢',
  corporate: '🏛️',
  etc: '📄',
}

/**
 * 한글 초성 추출 함수
 * 완성형 한글(가-힣)에서 초성을 추출하거나, 자음(ㄱ-ㅎ)은 그대로 반환
 */
export function getKoreanInitial(name: string): string {
  if (!name) return ''
  const firstChar = name.charAt(0)
  const code = firstChar.charCodeAt(0)

  // 1. 한글 완성형 문자 (가-힣: 0xAC00-0xD7A3)
  if (code >= 0xAC00 && code <= 0xD7A3) {
    const initialIndex = Math.floor((code - 0xAC00) / 588)
    const initials = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']
    return initials[initialIndex] || ''
  }

  // 2. 한글 자음 (ㄱ-ㅎ: 0x3131-0x314E)
  if (code >= 0x3131 && code <= 0x314E) {
    return firstChar
  }

  return ''
}

/**
 * 영문 알파벳 초성 추출 함수 (대소문자 구분 없음)
 */
export function getAlphabetInitial(name: string): string {
  if (!name) return ''
  const firstChar = name.charAt(0).toUpperCase()
  if (firstChar >= 'A' && firstChar <= 'Z') {
    return firstChar
  }
  return ''
}

/**
 * 숫자 초성 추출 함수
 */
export function getNumberInitial(name: string): string {
  if (!name) return ''
  const firstChar = name.charAt(0)
  if (firstChar >= '0' && firstChar <= '9') {
    return firstChar
  }
  return ''
}

/**
 * 이름의 초성 추출 (타입에 따라)
 */
export function getNameInitial(name: string, type: InitialType): string {
  if (type === 'korean') return getKoreanInitial(name)
  if (type === 'alphabet') return getAlphabetInitial(name)
  if (type === 'number') return getNumberInitial(name)
  return ''
}

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
  // badgeType을 DocumentUtils로 통일 계산
  const badgeType = DocumentUtils.getDocumentTypeLabel(doc) || 'BIN'
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
export function buildTree(documents: Document[], groupBy: DocumentGroupBy): DocumentTreeData {
  switch (groupBy) {
    case 'customer':
      return buildCustomerTree(documents)
    case 'badgeType':
      return buildBadgeTypeTree(documents)
    case 'date':
      return buildDateTree(documents)
    default:
      return buildCustomerTree(documents)
  }
}

/**
 * 고객별 트리: 고객명 → 대분류 → 소분류 → 문서 (3단계 계층)
 * 설계사가 고객별 문서함에서 모든 분류 정보를 바로 볼 수 있도록 구조화
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

  // 고객별 그룹 (가나다순) — 내부를 대분류→소분류→문서 계층으로 구조화
  Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'ko'))
    .forEach(([customerName, { docs, customerId, customerType }]) => {
      const isCorpo = customerType === '법인'

      // 문서를 소분류(doc_type)별로 그룹화
      const typeGroups = new Map<string, Document[]>()
      docs.forEach(doc => {
        const docType = doc.document_type || doc.docType || 'unclassifiable'
        if (!typeGroups.has(docType)) typeGroups.set(docType, [])
        typeGroups.get(docType)!.push(doc)
      })

      // 대분류별로 소분류를 묶기
      const categoryChildren: DocumentTreeNode[] = []
      DOCUMENT_CATEGORIES.forEach(cat => {
        const subTypeNodes: DocumentTreeNode[] = []

        // 이 대분류에 속하는 소분류들을 GT 순서대로 순회
        Array.from(typeGroups.entries())
          .filter(([typeValue]) => getCategoryForType(typeValue) === cat.value)
          .sort((a, b) => getTypeDisplayOrder(a[0]) - getTypeDisplayOrder(b[0]))
          .forEach(([typeValue, typeDocs]) => {
            subTypeNodes.push({
              key: `customer-${customerId}-type-${typeValue}`,
              label: getDocumentTypeLabel(typeValue),
              type: 'group',
              icon: 'doc.fill',
              count: typeDocs.length,
              children: typeDocs.map(doc => createDocumentNode(doc)),
            })
          })

        // 이 대분류에 문서가 있는 경우만 추가
        if (subTypeNodes.length > 0) {
          const catDocCount = subTypeNodes.reduce((sum, n) => sum + (n.count || 0), 0)
          categoryChildren.push({
            key: `customer-${customerId}-cat-${cat.value}`,
            label: `${CATEGORY_EMOJI[cat.value] || '📁'} ${cat.label}`,
            type: 'group',
            icon: 'folder.fill',
            count: catDocCount,
            children: subTypeNodes,
          })
        }
      })

      // 분류 안 된 문서 (general 등이 어느 카테고리에도 안 속하는 경우)
      const categorized = new Set<string>()
      DOCUMENT_CATEGORIES.forEach(cat => {
        Array.from(typeGroups.keys()).forEach(t => {
          if (getCategoryForType(t) === cat.value) categorized.add(t)
        })
      })
      const uncategorized: Document[] = []
      typeGroups.forEach((typeDocs, typeValue) => {
        if (!categorized.has(typeValue)) uncategorized.push(...typeDocs)
      })
      if (uncategorized.length > 0) {
        categoryChildren.push({
          key: `customer-${customerId}-cat-uncategorized`,
          label: '미분류',
          type: 'group',
          icon: 'questionmark.folder.fill',
          count: uncategorized.length,
          children: uncategorized.map(doc => createDocumentNode(doc)),
        })
      }

      nodes.push({
        key: `customer-${customerId || customerName}`,
        label: customerName,
        type: 'group',
        icon: isCorpo ? 'building.2.fill' : 'person.fill',
        count: docs.length,
        metadata: {
          customerId,
          customerType: isCorpo ? 'corporate' : 'personal',
          // 대분류 요약 정보 (카드 표시용)
          categorySummary: categoryChildren.map(c => ({
            label: c.label,
            count: c.count || 0,
          })),
        },
        children: categoryChildren,
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
    const type = (DocumentUtils.getDocumentTypeLabel(doc) || 'BIN') as 'TXT' | 'OCR' | 'BIN'
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
  sortDirection: SortDirection,
  filenameMode: 'display' | 'original' = 'display'
): DocumentTreeNode[] {
  const multiplier = sortDirection === 'asc' ? 1 : -1

  return [...nodes].sort((a, b) => {
    const docA = a.document
    const docB = b.document

    if (!docA || !docB) return 0

    switch (sortBy) {
      case 'name': {
        // 🍎 filenameMode에 따라 정렬 기준 변경
        const nameA = (filenameMode === 'display' && docA.displayName
          ? docA.displayName
          : (docA.originalName || docA.filename || docA.name || '')
        ).toLowerCase()
        const nameB = (filenameMode === 'display' && docB.displayName
          ? docB.displayName
          : (docB.originalName || docB.filename || docB.name || '')
        ).toLowerCase()
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
        const typeA = (DocumentUtils.getDocumentTypeLabel(docA) || 'BIN') as 'TXT' | 'OCR' | 'BIN'
        const typeB = (DocumentUtils.getDocumentTypeLabel(docB) || 'BIN') as 'TXT' | 'OCR' | 'BIN'
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
      case 'ext': {
        const extA = (docA.mimeType ? DocumentUtils.getFileExtension(docA.mimeType) : '').toLowerCase()
        const extB = (docB.mimeType ? DocumentUtils.getFileExtension(docB.mimeType) : '').toLowerCase()
        if (!extA && !extB) return 0
        if (!extA) return 1
        if (!extB) return -1
        return extA.localeCompare(extB) * multiplier
      }
      case 'size': {
        const sizeA = DocumentStatusService.extractFileSize(docA)
        const sizeB = DocumentStatusService.extractFileSize(docB)
        return (sizeA - sizeB) * multiplier
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
  sortDirection: SortDirection,
  filenameMode: 'display' | 'original' = 'display'
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
    const sortedDocumentNodes = sortDocumentNodes(documentNodes, sortBy, sortDirection, filenameMode)

    // 그룹 노드는 재귀적으로 처리
    const sortedGroupNodes = sortTreeNodes(groupNodes, sortBy, sortDirection, filenameMode)

    return {
      ...node,
      children: [...sortedGroupNodes, ...sortedDocumentNodes],
    }
  })
}
