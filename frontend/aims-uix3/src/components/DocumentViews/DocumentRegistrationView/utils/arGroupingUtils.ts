/**
 * AR Grouping Utilities
 * @description AR 파일을 고객명별로 그룹핑하고 매칭 상태를 분류하는 유틸리티
 * @see docs/AR_MULTI_UPLOAD_UX_ANALYSIS.md
 */

import type { Customer } from '@/features/customer/types/customer'
import type {
  ArFileInfo,
  ArFileGroup,
  MatchStatus,
  GroupingResult,
  ArAnalysisResult,
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
 */
export function groupArFilesByCustomerName(
  arFiles: ArFileInfo[]
): Map<string, ArFileInfo[]> {
  const groups = new Map<string, ArFileInfo[]>()

  for (const arFile of arFiles) {
    const customerName = arFile.metadata.customer_name
    if (!customerName) {
      // 고객명이 없는 경우 별도 그룹
      const unknownKey = '__UNKNOWN__'
      const existing = groups.get(unknownKey) || []
      existing.push(arFile)
      groups.set(unknownKey, existing)
      continue
    }

    // 정규화된 고객명으로 그룹핑 키 생성
    const normalizedName = normalizeCustomerName(customerName)

    // 기존 그룹 찾기 (원본 고객명 기준)
    let foundKey: string | null = null
    for (const [key] of groups) {
      if (normalizeCustomerName(key) === normalizedName) {
        foundKey = key
        break
      }
    }

    if (foundKey) {
      groups.get(foundKey)!.push(arFile)
    } else {
      groups.set(customerName, [arFile])
    }
  }

  return groups
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
  const matchStatus = determineMatchStatus(matchingCustomers)

  // 자동 매칭인 경우 첫 번째 고객 선택
  const selectedCustomerId = matchStatus === 'auto' ? matchingCustomers[0]._id : null
  const selectedCustomerName = matchStatus === 'auto'
    ? matchingCustomers[0].personal_info?.name
    : undefined

  return {
    groupId: generateGroupId(),
    customerNameFromAr,
    files,
    matchingCustomers,
    matchStatus,
    selectedCustomerId,
    selectedCustomerName,
    newCustomerName: matchStatus === 'no_match' ? customerNameFromAr : undefined,
    isExpanded: true, // 기본 펼침
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
