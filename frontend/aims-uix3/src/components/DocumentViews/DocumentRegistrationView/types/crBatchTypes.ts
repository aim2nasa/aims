/**
 * CRS Batch Types
 * @description CRS(Customer Review Service) 다중 문서 일괄 처리를 위한 타입 정의
 * @see docs/AR_CRS_BATCH_REGISTRATION_COMPARISON.md
 */

import type { Customer } from '@/entities/customer/model'

/**
 * CRS 메타데이터
 */
export interface CrMetadata {
  /** 상품명 */
  product_name?: string
  /** 발행일 (YYYY-MM-DD) */
  issue_date?: string
  /** 계약자명 (= 고객 매칭용) */
  contractor_name?: string
  /** 피보험자명 */
  insured_name?: string
  /** FSR 이름 */
  fsr_name?: string
  /** 증권번호 (중복 검사용) */
  policy_number?: string
}

/**
 * CRS 파일 정보
 */
export interface CrFileInfo {
  /** 원본 File 객체 */
  file: File
  /** 고유 파일 ID */
  fileId: string
  /** CRS 메타데이터 (1페이지에서 추출) */
  metadata: CrMetadata
  /** 중복 상태 */
  duplicateStatus: {
    /** 파일 해시 중복 여부 */
    isHashDuplicate: boolean
    /** 발행일+증권번호 중복 여부 */
    isIssueDatePolicyDuplicate: boolean
    /** 중복된 기존 문서 ID */
    existingDocId?: string
    /** 중복된 발행일 */
    duplicateIssueDate?: string
    /** 중복된 증권번호 */
    duplicatePolicyNumber?: string
  }
  /** 등록 포함 여부 (중복 시 사용자가 제외 가능) */
  included: boolean
}

/**
 * 매칭 상태
 */
export type CrMatchStatus =
  | 'auto'            // 정확히 1명 매칭 → 자동 선택
  | 'needs_selection' // 2명 이상 매칭 → 사용자 선택 필요
  | 'no_match'        // 0명 매칭 → 새 고객 생성 또는 기존 고객 검색

/**
 * CRS 파일 그룹 (계약자명별)
 */
export interface CrFileGroup {
  /** 그룹 고유 ID */
  groupId: string
  /** CRS에서 추출한 계약자명 */
  contractorNameFromCr: string
  /** 이 그룹에 속한 CRS 파일들 */
  files: CrFileInfo[]
  /** 매칭된 기존 고객 목록 */
  matchingCustomers: Customer[]
  /** 매칭 상태 */
  matchStatus: CrMatchStatus
  /** 사용자가 선택한 고객 ID (null = 새 고객 생성) */
  selectedCustomerId: string | null
  /** 선택된 고객명 (UI 표시용) */
  selectedCustomerName?: string
  /** 새 고객 생성 시 사용할 이름 */
  newCustomerName?: string
  /** 그룹 펼침/접힘 상태 */
  isExpanded: boolean
}

/**
 * 일괄 매핑 모달 상태
 */
export interface CrBatchMappingState {
  /** 전체 그룹 목록 */
  groups: CrFileGroup[]
  /** 모달 표시 여부 */
  isOpen: boolean
  /** 분석 진행 중 여부 */
  isAnalyzing: boolean
  /** 모두 선택 완료 여부 */
  isAllSelected: boolean
  /** 등록 진행 중 여부 */
  isProcessing: boolean
  /** 등록 진행률 (0~100) */
  progress: number
  /** 현재 처리 중인 파일명 */
  currentFileName?: string
  /** 총 파일 수 */
  totalFiles: number
  /** 완료된 파일 수 */
  completedFiles: number
}

/**
 * CRS 분석 결과
 */
export interface CrAnalysisResult {
  /** CRS 여부 */
  is_customer_review: boolean
  /** 신뢰도 (0~1) */
  confidence: number
  /** 메타데이터 */
  metadata?: CrMetadata
}

/**
 * 그룹핑 결과
 */
export interface CrGroupingResult {
  /** 모든 그룹 */
  groups: CrFileGroup[]
  /** 자동 매칭된 그룹 수 */
  autoMatchedCount: number
  /** 선택 필요 그룹 수 */
  needsSelectionCount: number
  /** 새 고객 필요 그룹 수 */
  noMatchCount: number
  /** 분석 실패 파일 수 */
  failedCount: number
  /** 총 파일 수 */
  totalFiles: number
}

/**
 * 일괄 등록 결과
 */
export interface CrBatchRegistrationResult {
  /** 성공 여부 */
  success: boolean
  /** 등록된 파일 수 */
  registeredCount: number
  /** 건너뛴 파일 수 */
  skippedCount: number
  /** 실패한 파일 수 */
  failedCount: number
  /** 에러 목록 */
  errors: Array<{
    fileName: string
    message: string
  }>
}

// ============================================
// 테이블 뷰 타입 (파일별 개별 매핑 지원)
// ============================================

/**
 * 테이블 정렬 필드
 */
export type CrTableSortField =
  | 'fileName'
  | 'extractedContractor'
  | 'mappedCustomer'
  | 'policyNumber'
  | 'issueDate'
  | 'status'

/**
 * 매핑 상태 필터
 */
export type CrMappingStatusFilter = 'all' | 'mapped' | 'unmapped' | 'duplicate'

/**
 * 테이블 행 데이터 (파일별 개별 매핑 지원)
 * @description 각 파일이 독립적인 고객 선택을 가질 수 있음
 */
export interface CrFileTableRow {
  /** 파일 정보 (기존 CrFileInfo) */
  fileInfo: CrFileInfo
  /** 파일별 개별 선택된 고객 ID (null = 미선택 또는 새 고객) */
  individualCustomerId: string | null
  /** 파일별 개별 선택된 고객명 */
  individualCustomerName?: string
  /** 파일별 새 고객 생성 이름 */
  individualNewCustomerName?: string
  /** 행 선택 상태 (다중 선택용) */
  isSelected: boolean
  /** 원본 그룹 ID (드롭다운 옵션 참조용) */
  groupId: string
  /** CRS에서 추출한 계약자명 (표시용) */
  extractedContractorName: string
  /** CRS에서 추출한 증권번호 (표시용) */
  extractedPolicyNumber?: string
}

/**
 * 테이블 뷰 상태
 * @description 페이지네이션, 정렬, 필터 등 테이블 UI 상태 관리
 */
export interface CrTableViewState {
  /** 전체 행 목록 */
  rows: CrFileTableRow[]
  /** 그룹 정보 (드롭다운 옵션용) - 기존 구조 유지 */
  groups: CrFileGroup[]
  /** 현재 페이지 (1-based) */
  currentPage: number
  /** 페이지당 항목 수 */
  itemsPerPage: number
  /** 정렬 필드 */
  sortField: CrTableSortField | null
  /** 정렬 방향 */
  sortDirection: 'asc' | 'desc'
  /** 검색어 (파일명 검색) */
  searchQuery: string
  /** 필터: 매핑 상태 */
  mappingStatusFilter: CrMappingStatusFilter
}
