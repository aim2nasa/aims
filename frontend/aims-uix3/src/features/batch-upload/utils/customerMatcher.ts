/**
 * 폴더 트리 빌드 + 3상태 매핑 계산 유틸리티
 * @since 2025-12-05
 * @version 4.0.0 (2026-04-11 재설계 — 명시적 인식 기반)
 *
 * 설계 원칙 (docs/DISCUSSION_2026-04-11_folder-mapping-redesign.md):
 * - 자동 매핑 없음. 드롭 직후 모든 폴더는 unmapped
 * - 3상태 배타: direct / inherited / unmapped
 * - 불변식: 루트→리프 경로상 direct는 최대 1개
 * - 업로드 단위 = direct 폴더의 subtreeFiles (자기 + 전체 하위)
 */

import type { FolderMapping, FolderMappingState } from '../types'

/**
 * 고객 정보 (매칭에 필요한 최소 정보)
 */
export interface CustomerForMatching {
  _id: string
  personal_info?: {
    name?: string
    birth_date?: string
    phone?: string
  }
  insurance_info?: {
    customer_type?: string // '개인' | '법인'
  }
}

/**
 * 폴더 트리 노드 (파일 배열 → 계층 구조 변환용)
 */
export interface FolderNode {
  /** 전체 경로 (루트부터 자기까지, unique key) */
  folderPath: string
  /** 리프 폴더명 */
  folderName: string
  /** 부모 경로 (루트면 null) */
  parentFolderPath: string | null
  /** 자기 직하 파일 (하위 폴더 파일 제외) */
  directFiles: File[]
  /** 자식 폴더 노드 */
  children: FolderNode[]
}

/**
 * groupFilesByFolder 반환 타입
 * 재그룹화 시 원본 부모 폴더 정보를 함께 반환
 */
export interface FolderGroupResult {
  /** 재그룹화 시 원본 부모 폴더명 (재그룹화 안 했으면 null) */
  parentFolderName: string | null
  /** 부모 폴더 직하 파일들 (하위 폴더에 속하지 않는 루트 파일) */
  rootFiles: File[]
  /** 폴더별 파일 그룹 (기존 Map<string, File[]>과 동일) */
  groups: Map<string, File[]>
}

// ==================== 트리 빌드 ====================

/**
 * File[] → FolderNode[] 트리 구축
 *
 * 각 파일의 webkitRelativePath를 분해하여 경로 계층을 만들고,
 * 폴더 노드에 직하 파일을 할당한다.
 *
 * @param files webkitRelativePath를 가진 File 배열
 * @returns 루트 FolderNode 배열 (최상위가 여러 개일 수 있음)
 */
export function buildFolderTree(files: File[]): FolderNode[] {
  // path → FolderNode
  const nodeMap = new Map<string, FolderNode>()
  const roots: FolderNode[] = []

  /** 폴더 노드 가져오거나 생성 (조상 체인까지 보장) */
  const ensureNode = (folderPath: string): FolderNode => {
    const existing = nodeMap.get(folderPath)
    if (existing) return existing

    const parts = folderPath.split('/')
    const folderName = parts[parts.length - 1]
    const parentFolderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : null

    const node: FolderNode = {
      folderPath,
      folderName,
      parentFolderPath,
      directFiles: [],
      children: [],
    }
    nodeMap.set(folderPath, node)

    if (parentFolderPath === null) {
      roots.push(node)
    } else {
      const parent = ensureNode(parentFolderPath)
      parent.children.push(node)
    }
    return node
  }

  for (const file of files) {
    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || ''
    if (!relativePath) continue

    // 빈 파트 방어 ("a//b/file" 같은 경로)
    const parts = relativePath.split('/').filter(p => p.length > 0)
    if (parts.length < 2) continue // 폴더 없이 파일만 있는 경우는 스킵 (폴더 드롭만 지원)

    // 파일의 부모 폴더 경로
    const folderPath = parts.slice(0, -1).join('/')
    if (!folderPath) continue

    const folderNode = ensureNode(folderPath)
    folderNode.directFiles.push(file)
  }

  // 정렬: 자식 폴더를 이름 순으로
  const sortTree = (nodes: FolderNode[]): void => {
    nodes.sort((a, b) => a.folderName.localeCompare(b.folderName, 'ko'))
    for (const node of nodes) {
      sortTree(node.children)
    }
  }
  sortTree(roots)

  return roots
}

/**
 * 트리 평탄화 (DFS pre-order)
 * FolderMapping 배열로 변환하기 위한 순서 결정용
 */
export function flattenTree(roots: FolderNode[]): FolderNode[] {
  const result: FolderNode[] = []
  const walk = (node: FolderNode): void => {
    result.push(node)
    for (const child of node.children) {
      walk(child)
    }
  }
  for (const root of roots) {
    walk(root)
  }
  return result
}

/**
 * subtree 파일 수집 (자기 + 전체 하위)
 */
function collectSubtreeFiles(node: FolderNode): File[] {
  const result: File[] = [...node.directFiles]
  for (const child of node.children) {
    result.push(...collectSubtreeFiles(child))
  }
  return result
}

// ==================== 상태 계산 ====================

/**
 * 폴더 트리 + 매핑 Map → FolderMapping[] 계산
 *
 * @param roots FolderNode 루트 배열
 * @param directMap folderPath → customerId 명시적 매핑
 * @param customers 고객 조회용 (이름 해결)
 * @returns DFS 순서로 정렬된 FolderMapping 배열
 */
export function computeFolderMappings(
  roots: FolderNode[],
  directMap: Map<string, string>,
  customers: CustomerForMatching[]
): FolderMapping[] {
  const customerById = new Map(customers.map(c => [c._id, c]))
  const flat = flattenTree(roots)
  const result: FolderMapping[] = []

  // 각 노드의 state / 상속 정보 계산
  for (const node of flat) {
    const directCustomerId = directMap.get(node.folderPath)

    let state: FolderMappingState
    let customerId: string | null = null
    let customerName: string | null = null
    let inheritedFromPath: string | null = null

    if (directCustomerId) {
      state = 'direct'
      customerId = directCustomerId
      customerName = customerById.get(directCustomerId)?.personal_info?.name || null
    } else {
      // 조상 체인에서 direct 탐색
      let ancestorPath = node.parentFolderPath
      let foundAncestor: { path: string; customerId: string } | null = null
      while (ancestorPath !== null) {
        const ancestorDirect = directMap.get(ancestorPath)
        if (ancestorDirect) {
          foundAncestor = { path: ancestorPath, customerId: ancestorDirect }
          break
        }
        const parts = ancestorPath.split('/')
        ancestorPath = parts.length > 1 ? parts.slice(0, -1).join('/') : null
      }

      if (foundAncestor) {
        state = 'inherited'
        customerId = foundAncestor.customerId
        customerName = customerById.get(foundAncestor.customerId)?.personal_info?.name || null
        inheritedFromPath = foundAncestor.path
      } else {
        state = 'unmapped'
      }
    }

    const directTotalSize = node.directFiles.reduce((sum, f) => sum + f.size, 0)
    const subtreeFiles = collectSubtreeFiles(node)
    const subtreeTotalSize = subtreeFiles.reduce((sum, f) => sum + f.size, 0)

    result.push({
      folderPath: node.folderPath,
      folderName: node.folderName,
      parentFolderPath: node.parentFolderPath,
      state,
      customerId,
      customerName,
      inheritedFromPath,
      directFiles: node.directFiles,
      directFileCount: node.directFiles.length,
      directTotalSize,
      subtreeFiles,
      subtreeFileCount: subtreeFiles.length,
      subtreeTotalSize,
    })
  }

  return result
}

// ==================== 공존 금지 검증 ====================

/**
 * 공존 금지 충돌 정보
 * - type='descendant': folderPath의 자손에 이미 direct가 존재
 * - type='ancestor': folderPath의 조상에 이미 direct가 존재 (자식은 inherited여야 함)
 */
export type DirectMapConflict =
  | { type: 'descendant'; path: string }
  | { type: 'ancestor'; path: string; customerId: string }

/**
 * 해당 폴더에 direct 매핑을 설정할 수 있는지 검증
 *
 * 규칙 (R3): 루트→리프 경로상 direct는 최대 1개 — 한 체인에 direct 2개 공존 금지 불변식
 * 방향 검사:
 * 1. 자손 방향 — folderPath 하위에 이미 direct가 있으면 불가
 * 2. 조상 방향 — folderPath 상위 경로에 이미 direct가 있으면 불가
 *    (이 경우 folderPath는 inherited 상태여야 하며, direct로 재지정하려면 조상을 먼저 해제해야 함)
 *
 * @param folderPath 매핑 대상 폴더 경로
 * @param directMap 현재 direct 매핑 Map
 * @returns { ok: true } | { ok: false, conflicts: 충돌 정보 목록 }
 */
export function canDirectMap(
  folderPath: string,
  directMap: Map<string, string>
): { ok: true } | { ok: false; conflicts: DirectMapConflict[] } {
  const conflicts: DirectMapConflict[] = []

  // 1. 조상 방향 검사 — folderPath의 상위 경로에 direct가 있는가?
  //    folderPath="A/B/C" → 검사 대상: "A/B", "A"
  const parts = folderPath.split('/')
  for (let i = parts.length - 1; i >= 1; i--) {
    const ancestorPath = parts.slice(0, i).join('/')
    const ancestorCustomer = directMap.get(ancestorPath)
    if (ancestorCustomer) {
      conflicts.push({ type: 'ancestor', path: ancestorPath, customerId: ancestorCustomer })
    }
  }

  // 2. 자손 방향 검사 — folderPath 하위에 direct가 있는가?
  const prefix = folderPath + '/'
  for (const mappedPath of directMap.keys()) {
    if (mappedPath === folderPath) continue
    if (mappedPath.startsWith(prefix)) {
      conflicts.push({ type: 'descendant', path: mappedPath })
    }
  }

  if (conflicts.length === 0) {
    return { ok: true }
  }
  return { ok: false, conflicts }
}

/**
 * 해제 시 파생 처리: 대상 폴더와 **모든 자손 inherited**를 날림
 *
 * 실제로는 directMap에서 대상 폴더 키만 삭제하면 inherited는 자동으로 풀림 (재계산 시).
 * 이 함수는 명시적 의도 문서화용이며, 자손의 별도 direct 매핑은 유지된다.
 *
 * @param folderPath 해제 대상 direct 폴더 경로
 * @param directMap 현재 direct 매핑 Map
 * @returns 새 directMap (원본 불변)
 */
export function releaseDirectMapping(
  folderPath: string,
  directMap: Map<string, string>
): Map<string, string> {
  const next = new Map(directMap)
  next.delete(folderPath)
  return next
}

// ==================== 기존 유틸 (FolderDropZone 호환용) ====================

/**
 * 이름 양쪽 트림 (기존 호환)
 */
export function normalizeName(name: string): string {
  return name.trim()
}

/**
 * File 객체 배열을 폴더별로 그룹화 (기존 호환 API)
 *
 * 상위 폴더를 드래그한 경우 하위 폴더들을 반환:
 * - "temp/한승우/file.pdf" → groups["한승우"]
 * - 단일 최상위 폴더가 고객명과 일치하면 그대로 반환
 *
 * @deprecated v4에서는 buildFolderTree + computeFolderMappings 사용 권장.
 * 기존 BatchDocumentUploadView의 어댑터 경로 유지를 위해 남겨둠.
 */
export function groupFilesByFolder(
  files: File[],
  _customers?: CustomerForMatching[]
): FolderGroupResult {
  // 1단계: 일단 최상위 폴더로 그룹화하여 구조 분석
  const topLevelGroups = new Map<string, File[]>()

  for (const file of files) {
    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || ''
    const parts = relativePath.split('/')
    const topFolder = parts.length > 1 ? parts[0] : ''

    if (!topFolder) continue

    const existing = topLevelGroups.get(topFolder) || []
    existing.push(file)
    topLevelGroups.set(topFolder, existing)
  }

  // 2단계: 최상위 폴더가 하나인 경우, 하위 폴더가 있으면 재그룹화
  if (topLevelGroups.size === 1) {
    const [parentFolderName, parentFiles] = [...topLevelGroups.entries()][0]

    // 하위 폴더가 있는지 확인 (path parts가 3개 이상: parent/child/file.ext)
    const hasSubfolders = parentFiles.some(file => {
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || ''
      const parts = relativePath.split('/')
      return parts.length >= 3
    })

    if (hasSubfolders) {
      const subfolderGroups = new Map<string, File[]>()
      const rootFiles: File[] = []

      for (const file of parentFiles) {
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || ''
        const parts = relativePath.split('/')

        if (parts.length >= 3) {
          const subFolder = parts[1]
          const existing = subfolderGroups.get(subFolder) || []
          existing.push(file)
          subfolderGroups.set(subFolder, existing)
        } else if (parts.length === 2) {
          rootFiles.push(file)
        }
      }

      if (subfolderGroups.size > 0) {
        return { parentFolderName, rootFiles, groups: subfolderGroups }
      }
    }
  }

  return { parentFolderName: null, rootFiles: [], groups: topLevelGroups }
}
