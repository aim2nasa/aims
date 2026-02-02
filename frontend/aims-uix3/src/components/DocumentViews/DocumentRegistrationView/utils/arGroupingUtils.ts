/**
 * AR Grouping Utilities
 * @description AR 파일을 고객명별로 그룹핑하고 매칭 상태를 분류하는 유틸리티
 * @see docs/AR_MULTI_UPLOAD_UX_ANALYSIS.md
 */

import type { Customer } from '@/entities/customer/model'
import type {
  ArFileInfo,
  ArFileGroup,
  MatchStatus,
  GroupingResult,
  ArAnalysisResult,
  ArFileTableRow,
} from '../types/arBatchTypes'

/**
 * 고유 그룹 ID 생성
 */
export function generateGroupId(): string {
  return `group_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * 고유 파일 ID 생성
 */
export function generateFileId(): string {
  return `file_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * AR 분석 결과에서 ArFileInfo 생성
 */
export function createArFileInfo(
  file: File,
  analysisResult: ArAnalysisResult,
  fileId?: string
): ArFileInfo {
  return {
    file,
    fileId: fileId || generateFileId(),
    metadata: {
      customer_name: analysisResult.metadata?.customer_name || '',
      issue_date: analysisResult.metadata?.issue_date || '',
      report_title: analysisResult.metadata?.report_title,
    },
    duplicateStatus: {
      isHashDuplicate: false,
      isIssueDateDuplicate: false,
    },
    included: true,
  }
}

/**
 * 고객명 정규화 (비교용)
 * - 공백 제거
 * - 소문자 변환
 * - 특수문자 제거
 */
export function normalizeCustomerName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\w가-힣]/g, '')
}

/**
 * AR 파일들을 고객명별로 그룹핑
 * @description O(n) 복잡도 - 정규화된 이름을 키로 하는 Map 사용
 */
export function groupArFilesByCustomerName(
  arFiles: ArFileInfo[]
): Map<string, ArFileInfo[]> {
  // 정규화된 이름 → { 원본 이름, 파일 목록 } 매핑
  const normalizedMap = new Map<string, { originalName: string; files: ArFileInfo[] }>()

  for (const arFile of arFiles) {
    const customerName = arFile.metadata.customer_name
    if (!customerName) {
      // 고객명이 없는 경우 별도 그룹
      const unknownKey = '__UNKNOWN__'
      const existing = normalizedMap.get(unknownKey)
      if (existing) {
        existing.files.push(arFile)
      } else {
        normalizedMap.set(unknownKey, { originalName: unknownKey, files: [arFile] })
      }
      continue
    }

    // 정규화된 고객명으로 O(1) 조회
    const normalized = normalizeCustomerName(customerName)

    const existing = normalizedMap.get(normalized)
    if (existing) {
      existing.files.push(arFile)
    } else {
      normalizedMap.set(normalized, { originalName: customerName, files: [arFile] })
    }
  }

  // 원본 형태 (원본 고객명 → 파일 목록)로 변환
  const result = new Map<string, ArFileInfo[]>()
  for (const { originalName, files } of normalizedMap.values()) {
    result.set(originalName, files)
  }

  return result
}

/**
 * 검색 결과에서 정확히 이름이 일치하는 고객 필터링
 * (백엔드 search API가 부분 일치도 반환하므로 정확 매치만 걸러냄)
 */
function findExactMatchCustomers(customerNameFromAr: string, matchingCustomers: Customer[]): Customer[] {
  const normalized = normalizeCustomerName(customerNameFromAr)
  return matchingCustomers.filter(c => {
    const name = c.personal_info?.name
    return name ? normalizeCustomerName(name) === normalized : false
  })
}

/**
 * 매칭 상태 결정
 */
export function determineMatchStatus(matchingCustomers: Customer[]): MatchStatus {
  if (matchingCustomers.length === 0) {
    return 'no_match'
  }
  if (matchingCustomers.length === 1) {
    return 'auto'
  }
  return 'needs_selection'
}

/**
 * ArFileGroup 생성
 */
export function createArFileGroup(
  customerNameFromAr: string,
  files: ArFileInfo[],
  matchingCustomers: Customer[]
): ArFileGroup {
  // 정확 매치 우선: "이경" 검색 시 이경아/이경옥 등 부분 매치 제외
  const exactMatches = findExactMatchCustomers(customerNameFromAr, matchingCustomers)
  const effectiveCustomers = exactMatches.length > 0 ? exactMatches : matchingCustomers
  const matchStatus = determineMatchStatus(effectiveCustomers)

  // 자동 매칭인 경우 첫 번째 고객 선택
  const selectedCustomerId = matchStatus === 'auto' ? effectiveCustomers[0]._id : null
  const selectedCustomerName = matchStatus === 'auto'
    ? effectiveCustomers[0].personal_info?.name
    : undefined

  return {
    groupId: generateGroupId(),
    customerNameFromAr,
    files,
    matchingCustomers,  // 드롭다운용으로 전체 검색 결과 유지
    matchStatus,
    selectedCustomerId,
    selectedCustomerName,
    newCustomerName: matchStatus === 'no_match' ? customerNameFromAr : undefined,
    isExpanded: true,
  }
}

/**
 * 그룹에서 등록 가능한 파일 수 계산
 */
export function getIncludedFilesCount(group: ArFileGroup): number {
  return group.files.filter(f => f.included && !f.duplicateStatus.isHashDuplicate).length
}

/**
 * 전체 그룹에서 등록 가능한 파일 수 계산
 */
export function getTotalIncludedFilesCount(groups: ArFileGroup[]): number {
  return groups.reduce((sum, group) => sum + getIncludedFilesCount(group), 0)
}

/**
 * 모든 그룹이 선택 완료되었는지 확인
 */
export function isAllGroupsSelected(groups: ArFileGroup[]): boolean {
  return groups.every(group => {
    // 등록 가능한 파일이 없는 그룹은 건너뜀
    if (getIncludedFilesCount(group) === 0) return true

    // 고객이 선택되었거나 새 고객 이름이 있어야 함
    return group.selectedCustomerId !== null ||
           (group.matchStatus === 'no_match' && group.newCustomerName)
  })
}

/**
 * 그룹핑 결과 생성
 */
export function createGroupingResult(groups: ArFileGroup[]): GroupingResult {
  const autoMatchedCount = groups.filter(g => g.matchStatus === 'auto').length
  const needsSelectionCount = groups.filter(g => g.matchStatus === 'needs_selection').length
  const noMatchCount = groups.filter(g => g.matchStatus === 'no_match').length
  const totalFiles = groups.reduce((sum, g) => sum + g.files.length, 0)

  return {
    groups,
    autoMatchedCount,
    needsSelectionCount,
    noMatchCount,
    failedCount: 0,
    totalFiles,
  }
}

/**
 * 그룹의 고객 선택 업데이트
 */
export function updateGroupCustomerSelection(
  groups: ArFileGroup[],
  groupId: string,
  customerId: string | null,
  customerName?: string
): ArFileGroup[] {
  return groups.map(group => {
    if (group.groupId !== groupId) return group

    return {
      ...group,
      selectedCustomerId: customerId,
      selectedCustomerName: customerName,
      // 기존 고객 선택 시 새 고객 이름 초기화
      newCustomerName: customerId ? undefined : group.newCustomerName,
    }
  })
}

/**
 * 그룹의 새 고객 이름 업데이트
 */
export function updateGroupNewCustomerName(
  groups: ArFileGroup[],
  groupId: string,
  newCustomerName: string
): ArFileGroup[] {
  return groups.map(group => {
    if (group.groupId !== groupId) return group

    return {
      ...group,
      selectedCustomerId: null, // 새 고객 생성이므로 기존 선택 초기화
      selectedCustomerName: undefined,
      newCustomerName,
    }
  })
}

/**
 * 그룹 펼침/접힘 토글
 */
export function toggleGroupExpanded(
  groups: ArFileGroup[],
  groupId: string
): ArFileGroup[] {
  return groups.map(group => {
    if (group.groupId !== groupId) return group
    return { ...group, isExpanded: !group.isExpanded }
  })
}

/**
 * 파일 포함/제외 토글
 */
export function toggleFileIncluded(
  groups: ArFileGroup[],
  groupId: string,
  fileId: string
): ArFileGroup[] {
  return groups.map(group => {
    if (group.groupId !== groupId) return group

    return {
      ...group,
      files: group.files.map(file => {
        if (file.fileId !== fileId) return file
        return { ...file, included: !file.included }
      }),
    }
  })
}

/**
 * 발행일 포맷 (YYYY.MM.DD)
 */
export function formatIssueDate(dateStr: string): string {
  if (!dateStr) return ''

  // YYYY-MM-DD 형식을 YYYY.MM.DD로 변환
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    return `${match[1]}.${match[2]}.${match[3]}`
  }

  return dateStr
}

/**
 * 그룹 상태 아이콘 결정
 */
export function getGroupStatusIcon(matchStatus: MatchStatus, isSelected: boolean): string {
  if (matchStatus === 'auto' || isSelected) return '✅'
  if (matchStatus === 'needs_selection') return '⚠️'
  return '🆕'
}

/**
 * 그룹 상태 라벨 결정
 */
export function getGroupStatusLabel(matchStatus: MatchStatus, isSelected: boolean): string {
  if (matchStatus === 'auto') return '자동 매칭'
  if (matchStatus === 'needs_selection') {
    return isSelected ? '선택 완료' : '선택 필요'
  }
  return '새 고객'
}

// ============================================
// 테이블 뷰 유틸리티 (파일별 개별 매핑 지원)
// ============================================

/**
 * 그룹에서 테이블 행 목록으로 변환
 * @description 그룹 구조를 플랫한 테이블 행 목록으로 변환
 */
export function groupsToTableRows(groups: ArFileGroup[]): ArFileTableRow[] {
  return groups.flatMap(group =>
    group.files.map(fileInfo => {
      // 자동 매칭(auto)인 경우 그룹의 선택값을 개별 매핑으로 복사
      const isAutoMatched = group.matchStatus === 'auto'

      return {
        fileInfo,
        individualCustomerId: isAutoMatched ? group.selectedCustomerId : null,
        individualCustomerName: isAutoMatched ? group.selectedCustomerName : undefined,
        individualNewCustomerName: undefined,
        isSelected: false,
        groupId: group.groupId,
        extractedCustomerName: group.customerNameFromAr,
      }
    })
  )
}

/**
 * 테이블 행에서 실제 매핑 정보 추출 (등록 시 사용)
 * @description 개별 매핑이 있으면 개별 값 사용
 */
export function getEffectiveMapping(
  row: ArFileTableRow,
  groups: ArFileGroup[]
): {
  customerId: string | null
  customerName: string | undefined
  newCustomerName: string | undefined
} {
  // 개별 매핑이 있으면 우선
  if (row.individualCustomerId !== null) {
    return {
      customerId: row.individualCustomerId,
      customerName: row.individualCustomerName,
      newCustomerName: undefined,
    }
  }
  if (row.individualNewCustomerName) {
    return {
      customerId: null,
      customerName: undefined,
      newCustomerName: row.individualNewCustomerName,
    }
  }

  // 그룹 기본값 사용 (호환성)
  const group = groups.find(g => g.groupId === row.groupId)
  return {
    customerId: group?.selectedCustomerId ?? null,
    customerName: group?.selectedCustomerName,
    newCustomerName: group?.newCustomerName,
  }
}

/**
 * 행의 매핑 여부 확인
 */
export function isRowMapped(row: ArFileTableRow, groups: ArFileGroup[]): boolean {
  const mapping = getEffectiveMapping(row, groups)
  return mapping.customerId !== null || !!mapping.newCustomerName
}

/**
 * 행의 매핑 표시 텍스트 가져오기
 */
export function getRowMappingDisplayText(row: ArFileTableRow, groups: ArFileGroup[]): string {
  const mapping = getEffectiveMapping(row, groups)

  if (mapping.customerId && mapping.customerName) {
    return mapping.customerName
  }
  if (mapping.newCustomerName) {
    return `새 고객: ${mapping.newCustomerName}`
  }

  return '선택하세요'
}

// ============================================
// groupMap 캐싱 버전 (O(1) 조회)
// ============================================

/**
 * 테이블 행에서 실제 매핑 정보 추출 (groupMap 캐싱 버전)
 * @description O(1) 복잡도 - Map.get() 사용
 */
export function getEffectiveMappingWithMap(
  row: ArFileTableRow,
  groupMap: Map<string, ArFileGroup>
): {
  customerId: string | null
  customerName: string | undefined
  newCustomerName: string | undefined
} {
  // 개별 매핑이 있으면 우선
  if (row.individualCustomerId !== null) {
    return {
      customerId: row.individualCustomerId,
      customerName: row.individualCustomerName,
      newCustomerName: undefined,
    }
  }
  if (row.individualNewCustomerName) {
    return {
      customerId: null,
      customerName: undefined,
      newCustomerName: row.individualNewCustomerName,
    }
  }

  // 그룹 기본값 사용 - O(1) Map.get()
  const group = groupMap.get(row.groupId)
  return {
    customerId: group?.selectedCustomerId ?? null,
    customerName: group?.selectedCustomerName,
    newCustomerName: group?.newCustomerName,
  }
}

/**
 * 행의 매핑 여부 확인 (groupMap 캐싱 버전)
 */
export function isRowMappedWithMap(row: ArFileTableRow, groupMap: Map<string, ArFileGroup>): boolean {
  const mapping = getEffectiveMappingWithMap(row, groupMap)
  return mapping.customerId !== null || !!mapping.newCustomerName
}

/**
 * 행의 매핑 표시 텍스트 가져오기 (groupMap 캐싱 버전)
 */
export function getRowMappingDisplayTextWithMap(row: ArFileTableRow, groupMap: Map<string, ArFileGroup>): string {
  const mapping = getEffectiveMappingWithMap(row, groupMap)

  if (mapping.customerId && mapping.customerName) {
    return mapping.customerName
  }
  if (mapping.newCustomerName) {
    return `새 고객: ${mapping.newCustomerName}`
  }

  return '선택하세요'
}

/**
 * 테이블 행의 고객 매핑 업데이트
 */
export function updateRowCustomerMapping(
  rows: ArFileTableRow[],
  fileId: string,
  customerId: string | null,
  customerName?: string
): ArFileTableRow[] {
  return rows.map(row => {
    if (row.fileInfo.fileId !== fileId) return row

    return {
      ...row,
      individualCustomerId: customerId,
      individualCustomerName: customerName,
      individualNewCustomerName: customerId ? undefined : row.individualNewCustomerName,
    }
  })
}

/**
 * 테이블 행의 새 고객 이름 업데이트
 */
export function updateRowNewCustomerName(
  rows: ArFileTableRow[],
  fileId: string,
  newCustomerName: string
): ArFileTableRow[] {
  return rows.map(row => {
    if (row.fileInfo.fileId !== fileId) return row

    return {
      ...row,
      individualCustomerId: null,
      individualCustomerName: undefined,
      individualNewCustomerName: newCustomerName,
    }
  })
}

/**
 * 다중 행 선택 토글
 */
export function toggleRowSelection(
  rows: ArFileTableRow[],
  fileId: string
): ArFileTableRow[] {
  return rows.map(row => {
    if (row.fileInfo.fileId !== fileId) return row
    return { ...row, isSelected: !row.isSelected }
  })
}

/**
 * 모든 행 선택/해제 (현재 페이지용)
 */
export function setAllRowsSelection(
  rows: ArFileTableRow[],
  fileIds: string[],
  selected: boolean
): ArFileTableRow[] {
  const fileIdSet = new Set(fileIds)
  return rows.map(row => {
    if (!fileIdSet.has(row.fileInfo.fileId)) return row
    return { ...row, isSelected: selected }
  })
}

/**
 * 일괄 고객 매핑
 */
export function bulkAssignCustomer(
  rows: ArFileTableRow[],
  fileIds: string[],
  customerId: string,
  customerName: string
): ArFileTableRow[] {
  const fileIdSet = new Set(fileIds)
  return rows.map(row => {
    if (!fileIdSet.has(row.fileInfo.fileId)) return row

    return {
      ...row,
      individualCustomerId: customerId,
      individualCustomerName: customerName,
      individualNewCustomerName: undefined,
      isSelected: false, // 선택 해제
    }
  })
}

/**
 * 일괄 새 고객 매핑
 */
export function bulkAssignNewCustomer(
  rows: ArFileTableRow[],
  fileIds: string[],
  newCustomerName: string
): ArFileTableRow[] {
  const fileIdSet = new Set(fileIds)
  return rows.map(row => {
    if (!fileIdSet.has(row.fileInfo.fileId)) return row

    return {
      ...row,
      individualCustomerId: null,
      individualCustomerName: undefined,
      individualNewCustomerName: newCustomerName,
      isSelected: false, // 선택 해제
    }
  })
}

/**
 * 파일 포함/제외 토글 (테이블 행용)
 */
export function toggleTableRowIncluded(
  rows: ArFileTableRow[],
  fileId: string
): ArFileTableRow[] {
  return rows.map(row => {
    if (row.fileInfo.fileId !== fileId) return row

    return {
      ...row,
      fileInfo: {
        ...row.fileInfo,
        included: !row.fileInfo.included,
      },
    }
  })
}

/**
 * 모든 행이 매핑되었는지 확인 (등록 가능 여부)
 */
export function isAllRowsMapped(rows: ArFileTableRow[], groups: ArFileGroup[]): boolean {
  return rows
    .filter(row => row.fileInfo.included && !row.fileInfo.duplicateStatus.isHashDuplicate)
    .every(row => isRowMapped(row, groups))
}

/**
 * 매핑 완료된 행 수 계산
 */
export function getMappedRowsCount(rows: ArFileTableRow[], groups: ArFileGroup[]): number {
  return rows.filter(row =>
    row.fileInfo.included &&
    !row.fileInfo.duplicateStatus.isHashDuplicate &&
    isRowMapped(row, groups)
  ).length
}

/**
 * 등록 가능한 행 수 계산
 */
export function getIncludedRowsCount(rows: ArFileTableRow[]): number {
  return rows.filter(row =>
    row.fileInfo.included &&
    !row.fileInfo.duplicateStatus.isHashDuplicate
  ).length
}

/**
 * 선택된 행 수 계산
 */
export function getSelectedRowsCount(rows: ArFileTableRow[]): number {
  return rows.filter(row => row.isSelected).length
}

/**
 * 선택된 행의 파일 ID 목록
 */
export function getSelectedFileIds(rows: ArFileTableRow[]): string[] {
  return rows
    .filter(row => row.isSelected)
    .map(row => row.fileInfo.fileId)
}
