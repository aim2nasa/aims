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
 * @param files File 객체 배열 (webkitRelativePath 포함)
 * @returns 폴더명 -> File 배열 맵
 */
export function groupFilesByFolder(
  files: File[]
): Map<string, File[]> {
  const groups = new Map<string, File[]>()

  for (const file of files) {
    // webkitRelativePath: "폴더명/하위폴더/파일명.pdf"
    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || ''
    const parts = relativePath.split('/')

    // 최상위 폴더명 추출
    const topFolder = parts.length > 1 ? parts[0] : ''

    if (!topFolder) continue

    const existing = groups.get(topFolder) || []
    existing.push(file)
    groups.set(topFolder, existing)
  }

  return groups
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
