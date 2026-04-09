/**
 * 고객명 매칭 유틸리티
 * @since 2025-12-05
 * @version 1.0.0
 *
 * 폴더명과 고객명을 100% 정확 일치로 매칭
 * - 공백은 양쪽 트림 후 비교
 * - 대소문자 구분 (한글 이름이므로 중요)
 */

import type { FolderMapping } from '../types'

/**
 * 고객 정보 (매칭에 필요한 최소 정보)
 */
export interface CustomerForMatching {
  _id: string
  personal_info?: {
    name?: string
  }
  insurance_info?: {
    customer_type?: string  // '개인' | '법인'
  }
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

/**
 * 폴더명에서 고객명 추출 및 정규화
 * @param folderName 폴더명
 * @returns 정규화된 고객명
 */
export function normalizeName(name: string): string {
  return name.trim()
}

/**
 * 단일 폴더명과 고객 목록 매칭
 * 100% 정확 일치만 허용 (trim 후 비교)
 *
 * @param folderName 폴더명
 * @param customers 고객 목록
 * @returns 매칭된 고객 또는 null
 */
export function matchFolderToCustomer(
  folderName: string,
  customers: CustomerForMatching[]
): CustomerForMatching | null {
  const normalizedFolderName = normalizeName(folderName)

  if (!normalizedFolderName) {
    return null
  }

  for (const customer of customers) {
    const customerName = customer.personal_info?.name
    if (!customerName) continue

    const normalizedCustomerName = normalizeName(customerName)

    // 100% 정확 일치만 허용
    if (normalizedFolderName === normalizedCustomerName) {
      return customer
    }
  }

  return null
}

/**
 * 여러 폴더를 고객과 매칭
 *
 * @param folderNames 폴더명 배열
 * @param customers 고객 목록
 * @returns 폴더명 -> 매칭 결과 맵
 */
export function matchFoldersToCustomers(
  folderNames: string[],
  customers: CustomerForMatching[]
): Map<string, CustomerForMatching | null> {
  const result = new Map<string, CustomerForMatching | null>()

  for (const folderName of folderNames) {
    const matchedCustomer = matchFolderToCustomer(folderName, customers)
    result.set(folderName, matchedCustomer)
  }

  return result
}

/**
 * 매칭 통계 계산
 *
 * @param mappings 폴더-고객 매칭 맵
 * @returns 매칭 통계
 */
export function calculateMatchingStats(
  mappings: Map<string, CustomerForMatching | null>
): {
  total: number
  matched: number
  unmatched: number
  matchRate: number
} {
  let matched = 0
  let unmatched = 0

  for (const customer of mappings.values()) {
    if (customer) {
      matched++
    } else {
      unmatched++
    }
  }

  const total = matched + unmatched
  const matchRate = total > 0 ? (matched / total) * 100 : 0

  return {
    total,
    matched,
    unmatched,
    matchRate,
  }
}

/**
 * File 객체 배열을 폴더별로 그룹화
 *
 * 상위 폴더를 드래그한 경우 하위 폴더들을 고객 폴더로 인식:
 * - "temp/한승우/file.pdf" → "한승우" 폴더로 그룹화
 * - "한승우/file.pdf" → "한승우" 폴더로 그룹화
 *
 * 단, 선택한 폴더 자체가 고객명과 일치하면 하위 폴더 분석 없이 해당 폴더를 고객 폴더로 사용:
 * - "곽승철/하위폴더/file.pdf" → "곽승철"이 고객명이면 하위폴더 무시, "곽승철"로 그룹화
 *
 * @param files File 객체 배열 (webkitRelativePath 포함)
 * @param customers 고객 목록 (선택적) - 제공 시 최상위 폴더가 고객명인지 확인
 * @returns 폴더명 -> File 배열 맵
 */
export function groupFilesByFolder(
  files: File[],
  customers?: CustomerForMatching[]
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

  // 2단계: 최상위 폴더가 하나인 경우 처리
  if (topLevelGroups.size === 1) {
    const [parentFolderName, parentFiles] = [...topLevelGroups.entries()][0]

    // 2-1: 최상위 폴더가 고객명과 일치하면 하위 폴더 분석 없이 바로 반환
    // (사용자가 고객 폴더를 직접 선택한 경우)
    if (customers && matchFolderToCustomer(parentFolderName, customers)) {
      return { parentFolderName: null, rootFiles: [], groups: topLevelGroups }
    }

    // 2-2: 하위 폴더가 있는지 확인 (path parts가 3개 이상: parent/child/file.ext)
    const hasSubfolders = parentFiles.some(file => {
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || ''
      const parts = relativePath.split('/')
      return parts.length >= 3  // parent/subfolder/file
    })

    if (hasSubfolders) {
      // 2번째 레벨(하위 폴더)로 재그룹화
      const subfolderGroups = new Map<string, File[]>()
      const rootFiles: File[] = []

      for (const file of parentFiles) {
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || ''
        const parts = relativePath.split('/')

        // parts: [parentFolder, subFolder, ...rest, fileName]
        if (parts.length >= 3) {
          const subFolder = parts[1]  // 두 번째 레벨 폴더
          const existing = subfolderGroups.get(subFolder) || []
          existing.push(file)
          subfolderGroups.set(subFolder, existing)
        } else if (parts.length === 2) {
          // 부모 폴더 직하 파일 — rootFiles에 수집 (기존에는 유실됨)
          rootFiles.push(file)
        }
      }

      // 하위 폴더가 실제로 있으면 부모 정보와 함께 반환
      if (subfolderGroups.size > 0) {
        return { parentFolderName, rootFiles, groups: subfolderGroups }
      }
    }
  }

  // 기본 동작: 최상위 폴더 그룹 반환
  return { parentFolderName: null, rootFiles: [], groups: topLevelGroups }
}

/**
 * 폴더 그룹을 FolderMapping 배열로 변환
 *
 * @param fileGroups 폴더별 파일 그룹
 * @param customers 고객 목록
 * @returns FolderMapping 배열
 */
export function createFolderMappings(
  fileGroups: Map<string, File[]>,
  customers: CustomerForMatching[]
): FolderMapping[] {
  const mappings: FolderMapping[] = []

  for (const [folderName, files] of fileGroups) {
    const matchedCustomer = matchFolderToCustomer(folderName, customers)
    const totalSize = files.reduce((sum, file) => sum + file.size, 0)

    mappings.push({
      folderName,
      customerId: matchedCustomer?._id || null,
      customerName: matchedCustomer?.personal_info?.name || null,
      matched: matchedCustomer !== null,
      files,
      fileCount: files.length,
      totalSize,
    })
  }

  // 매칭된 폴더 먼저, 그 다음 폴더명 순으로 정렬
  mappings.sort((a, b) => {
    if (a.matched !== b.matched) {
      return a.matched ? -1 : 1
    }
    return a.folderName.localeCompare(b.folderName, 'ko')
  })

  return mappings
}
