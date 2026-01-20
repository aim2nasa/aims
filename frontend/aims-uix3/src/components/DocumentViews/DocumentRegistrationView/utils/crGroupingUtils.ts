/**
 * CRS Grouping Utilities
 * @description CRS 파일을 계약자명별로 그룹핑하고 매칭 상태를 분류하는 유틸리티
 * @see docs/AR_CRS_BATCH_REGISTRATION_COMPARISON.md
 */

import type { Customer } from '@/entities/customer/model'
import type {
  CrFileInfo,
  CrFileGroup,
  CrMatchStatus,
  CrGroupingResult,
  CrAnalysisResult,
  CrFileTableRow,
  CrMetadata,
} from '../types/crBatchTypes'

/**
 * 고유 그룹 ID 생성
 */
export function generateGroupId(): string {
  return `crgroup_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * 고유 파일 ID 생성
 */
export function generateFileId(): string {
  return `crfile_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * CRS 분석 결과에서 CrFileInfo 생성
 */
export function createCrFileInfo(
  file: File,
  analysisResult: CrAnalysisResult,
  fileId?: string
): CrFileInfo {
  const metadata: CrMetadata = {
    product_name: analysisResult.metadata?.product_name,
    issue_date: analysisResult.metadata?.issue_date,
    contractor_name: analysisResult.metadata?.contractor_name,
    insured_name: analysisResult.metadata?.insured_name,
    fsr_name: analysisResult.metadata?.fsr_name,
    policy_number: analysisResult.metadata?.policy_number,
  }

  return {
    file,
    fileId: fileId || generateFileId(),
    metadata,
    duplicateStatus: {
      isHashDuplicate: false,
      isIssueDatePolicyDuplicate: false,
    },
    included: true,
  }
}

/**
 * 고객명(계약자명) 정규화 (비교용)
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
 * CRS 파일들을 계약자명별로 그룹핑
 */
export function groupCrFilesByContractorName(
  crFiles: CrFileInfo[]
): Map<string, CrFileInfo[]> {
  const groups = new Map<string, CrFileInfo[]>()

  for (const crFile of crFiles) {
    const contractorName = crFile.metadata.contractor_name
    if (!contractorName) {
      // 계약자명이 없는 경우 별도 그룹
      const unknownKey = '__UNKNOWN__'
      const existing = groups.get(unknownKey) || []
      existing.push(crFile)
      groups.set(unknownKey, existing)
      continue
    }

    // 정규화된 계약자명으로 그룹핑 키 생성
    const normalizedName = normalizeCustomerName(contractorName)

    // 기존 그룹 찾기 (원본 계약자명 기준)
    let foundKey: string | null = null
    for (const [key] of groups) {
      if (normalizeCustomerName(key) === normalizedName) {
        foundKey = key
        break
      }
    }

    if (foundKey) {
      groups.get(foundKey)!.push(crFile)
    } else {
      groups.set(contractorName, [crFile])
    }
  }

  return groups
}

/**
 * 매칭 상태 결정
 */
export function determineMatchStatus(matchingCustomers: Customer[]): CrMatchStatus {
  if (matchingCustomers.length === 0) {
    return 'no_match'
  }
  if (matchingCustomers.length === 1) {
    return 'auto'
  }
  return 'needs_selection'
}

/**
 * CrFileGroup 생성
 */
export function createCrFileGroup(
  contractorNameFromCr: string,
  files: CrFileInfo[],
  matchingCustomers: Customer[]
): CrFileGroup {
  const matchStatus = determineMatchStatus(matchingCustomers)

  // 자동 매칭인 경우 첫 번째 고객 선택
  const selectedCustomerId = matchStatus === 'auto' ? matchingCustomers[0]._id : null
  const selectedCustomerName = matchStatus === 'auto'
    ? matchingCustomers[0].personal_info?.name
    : undefined

  return {
    groupId: generateGroupId(),
    contractorNameFromCr,
    files,
    matchingCustomers,
    matchStatus,
    selectedCustomerId,
    selectedCustomerName,
    newCustomerName: matchStatus === 'no_match' ? contractorNameFromCr : undefined,
    isExpanded: true, // 기본 펼침
  }
}

/**
 * 그룹에서 등록 가능한 파일 수 계산
 */
export function getIncludedFilesCount(group: CrFileGroup): number {
  return group.files.filter(f => f.included && !f.duplicateStatus.isHashDuplicate).length
}

/**
 * 전체 그룹에서 등록 가능한 파일 수 계산
 */
export function getTotalIncludedFilesCount(groups: CrFileGroup[]): number {
  return groups.reduce((sum, group) => sum + getIncludedFilesCount(group), 0)
}

/**
 * 모든 그룹이 선택 완료되었는지 확인
 */
export function isAllGroupsSelected(groups: CrFileGroup[]): boolean {
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
export function createGroupingResult(groups: CrFileGroup[]): CrGroupingResult {
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
  groups: CrFileGroup[],
  groupId: string,
  customerId: string | null,
  customerName?: string
): CrFileGroup[] {
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
  groups: CrFileGroup[],
  groupId: string,
  newCustomerName: string
): CrFileGroup[] {
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
  groups: CrFileGroup[],
  groupId: string
): CrFileGroup[] {
  return groups.map(group => {
    if (group.groupId !== groupId) return group
    return { ...group, isExpanded: !group.isExpanded }
  })
}

/**
 * 파일 포함/제외 토글
 */
export function toggleFileIncluded(
  groups: CrFileGroup[],
  groupId: string,
  fileId: string
): CrFileGroup[] {
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
export function getGroupStatusIcon(matchStatus: CrMatchStatus, isSelected: boolean): string {
  if (matchStatus === 'auto' || isSelected) return '✅'
  if (matchStatus === 'needs_selection') return '⚠️'
  return '🆕'
}

/**
 * 그룹 상태 라벨 결정
 */
export function getGroupStatusLabel(matchStatus: CrMatchStatus, isSelected: boolean): string {
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
export function groupsToTableRows(groups: CrFileGroup[]): CrFileTableRow[] {
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
        extractedContractorName: group.contractorNameFromCr,
        extractedPolicyNumber: fileInfo.metadata.policy_number,
      }
    })
  )
}

/**
 * 테이블 행에서 실제 매핑 정보 추출 (등록 시 사용)
 * @description 개별 매핑이 있으면 개별 값 사용
 */
export function getEffectiveMapping(
  row: CrFileTableRow,
  groups: CrFileGroup[]
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
export function isRowMapped(row: CrFileTableRow, groups: CrFileGroup[]): boolean {
  const mapping = getEffectiveMapping(row, groups)
  return mapping.customerId !== null || !!mapping.newCustomerName
}

/**
 * 행의 매핑 표시 텍스트 가져오기
 */
export function getRowMappingDisplayText(row: CrFileTableRow, groups: CrFileGroup[]): string {
  const mapping = getEffectiveMapping(row, groups)

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
  rows: CrFileTableRow[],
  fileId: string,
  customerId: string | null,
  customerName?: string
): CrFileTableRow[] {
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
  rows: CrFileTableRow[],
  fileId: string,
  newCustomerName: string
): CrFileTableRow[] {
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
  rows: CrFileTableRow[],
  fileId: string
): CrFileTableRow[] {
  return rows.map(row => {
    if (row.fileInfo.fileId !== fileId) return row
    return { ...row, isSelected: !row.isSelected }
  })
}

/**
 * 모든 행 선택/해제 (현재 페이지용)
 */
export function setAllRowsSelection(
  rows: CrFileTableRow[],
  fileIds: string[],
  selected: boolean
): CrFileTableRow[] {
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
  rows: CrFileTableRow[],
  fileIds: string[],
  customerId: string,
  customerName: string
): CrFileTableRow[] {
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
  rows: CrFileTableRow[],
  fileIds: string[],
  newCustomerName: string
): CrFileTableRow[] {
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
  rows: CrFileTableRow[],
  fileId: string
): CrFileTableRow[] {
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
export function isAllRowsMapped(rows: CrFileTableRow[], groups: CrFileGroup[]): boolean {
  return rows
    .filter(row => row.fileInfo.included && !row.fileInfo.duplicateStatus.isHashDuplicate)
    .every(row => isRowMapped(row, groups))
}

/**
 * 매핑 완료된 행 수 계산
 */
export function getMappedRowsCount(rows: CrFileTableRow[], groups: CrFileGroup[]): number {
  return rows.filter(row =>
    row.fileInfo.included &&
    !row.fileInfo.duplicateStatus.isHashDuplicate &&
    isRowMapped(row, groups)
  ).length
}

/**
 * 등록 가능한 행 수 계산
 */
export function getIncludedRowsCount(rows: CrFileTableRow[]): number {
  return rows.filter(row =>
    row.fileInfo.included &&
    !row.fileInfo.duplicateStatus.isHashDuplicate
  ).length
}

/**
 * 선택된 행 수 계산
 */
export function getSelectedRowsCount(rows: CrFileTableRow[]): number {
  return rows.filter(row => row.isSelected).length
}

/**
 * 선택된 행의 파일 ID 목록
 */
export function getSelectedFileIds(rows: CrFileTableRow[]): string[] {
  return rows
    .filter(row => row.isSelected)
    .map(row => row.fileInfo.fileId)
}

/**
 * 그룹에 새 고객 추가 (새 고객 등록 후 호출)
 */
export function addCustomerToGroups(
  groups: CrFileGroup[],
  customer: Customer
): CrFileGroup[] {
  return groups.map(group => ({
    ...group,
    matchingCustomers: [...group.matchingCustomers, customer],
  }))
}
