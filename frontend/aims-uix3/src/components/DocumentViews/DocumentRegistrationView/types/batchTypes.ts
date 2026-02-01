/**
 * Common Batch Types
 * @description AR/CRS 공통 일괄 처리 타입 정의
 * @see docs/AR_CRS_BATCH_REGISTRATION_COMPARISON.md
 */

import type { Customer } from '@/entities/customer/model'

// ============================================
// 기본 메타데이터 인터페이스
// ============================================

/**
 * 기본 메타데이터 인터페이스 (AR/CRS 공통)
 */
export interface BaseMetadata {
  /** 발행일 (YYYY-MM-DD) */
  issue_date?: string
}

/**
 * AR 메타데이터
 */
export interface ArMetadata extends BaseMetadata {
  /** AR에서 추출한 고객명 */
  customer_name: string
  /** 보고서 제목 */
  report_title?: string
}

/**
 * CRS 메타데이터
 */
export interface CrMetadata extends BaseMetadata {
  /** 상품명 */
  product_name?: string
  /** 계약자명 (= 고객 매칭용) */
  contractor_name?: string
  /** 피보험자명 */
  insured_name?: string
  /** FSR 이름 */
  fsr_name?: string
  /** 증권번호 (중복 검사용) */
  policy_number?: string
}

// ============================================
// 기본 중복 상태 인터페이스
// ============================================

/**
 * 기본 중복 상태 (AR/CRS 공통)
 */
export interface BaseDuplicateStatus {
  /** 파일 해시 중복 여부 */
  isHashDuplicate: boolean
  /** 중복된 기존 문서 ID */
  existingDocId?: string
}

/**
 * AR 중복 상태
 */
export interface ArDuplicateStatus extends BaseDuplicateStatus {
  /** 발행일 중복 여부 */
  isIssueDateDuplicate: boolean
}

/**
 * CRS 중복 상태
 */
export interface CrDuplicateStatus extends BaseDuplicateStatus {
  /** 발행일+증권번호 중복 여부 */
  isIssueDatePolicyDuplicate: boolean
  /** 중복된 발행일 */
  duplicateIssueDate?: string
  /** 중복된 증권번호 */
  duplicatePolicyNumber?: string
}

// ============================================
// 제네릭 파일 정보
// ============================================

/**
 * 제네릭 파일 정보
 * @template TMetadata 메타데이터 타입
 * @template TDuplicateStatus 중복 상태 타입
 */
export interface BaseFileInfo<
  TMetadata extends BaseMetadata,
  TDuplicateStatus extends BaseDuplicateStatus
> {
  /** 원본 File 객체 */
  file: File
  /** 고유 파일 ID */
  fileId: string
  /** 메타데이터 */
  metadata: TMetadata
  /** 중복 상태 */
  duplicateStatus: TDuplicateStatus
  /** 등록 포함 여부 (중복 시 사용자가 제외 가능) */
  included: boolean
}

// ============================================
// 매칭 상태
// ============================================

/**
 * 매칭 상태 (AR/CRS 공통)
 */
export type MatchStatus =
  | 'auto'            // 정확히 1명 매칭 → 자동 선택
  | 'needs_selection' // 2명 이상 매칭 → 사용자 선택 필요
  | 'no_match'        // 0명 매칭 → 새 고객 생성 또는 기존 고객 검색

// ============================================
// 제네릭 파일 그룹
// ============================================

/**
 * 제네릭 파일 그룹
 * @template TFileInfo 파일 정보 타입
 */
export interface BaseFileGroup<TFileInfo> {
  /** 그룹 고유 ID */
  groupId: string
  /** 이 그룹에 속한 파일들 */
  files: TFileInfo[]
  /** 매칭된 기존 고객 목록 */
  matchingCustomers: Customer[]
  /** 매칭 상태 */
  matchStatus: MatchStatus
  /** 사용자가 선택한 고객 ID (null = 새 고객 생성) */
  selectedCustomerId: string | null
  /** 선택된 고객명 (UI 표시용) */
  selectedCustomerName?: string
  /** 새 고객 생성 시 사용할 이름 */
  newCustomerName?: string
  /** 그룹 펼침/접힘 상태 */
  isExpanded: boolean
}

// ============================================
// 분석 중 파일 상태
// ============================================

/**
 * 개별 파일 분석 상태
 */
export type FileAnalysisStatus = 'pending' | 'analyzing' | 'completed' | 'failed' | 'non_ar'

/**
 * 분석 중인 파일 정보
 */
export interface AnalyzingFileInfo {
  /** 파일명 */
  fileName: string
  /** 분석 상태 */
  status: FileAnalysisStatus
  /** 에러 메시지 (실패 시) */
  error?: string
}

// ============================================
// 일괄 매핑 모달 상태
// ============================================

/**
 * 일괄 매핑 모달 상태 (AR/CRS 공통)
 * @template TFileGroup 파일 그룹 타입
 */
export interface BaseBatchMappingState<TFileGroup> {
  /** 전체 그룹 목록 */
  groups: TFileGroup[]
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
  /** 총 파일 수 (AR 감지된 파일) */
  totalFiles: number
  /** 원본 업로드 파일 수 (분석 전 전체) */
  originalTotalFiles: number
  /** 완료된 파일 수 */
  completedFiles: number
  /** 분석 중인 파일 목록 (실시간 표시용) */
  analyzingFiles?: AnalyzingFileInfo[]
}

// ============================================
// 그룹핑 결과
// ============================================

/**
 * 그룹핑 결과 (AR/CRS 공통)
 * @template TFileGroup 파일 그룹 타입
 */
export interface BaseGroupingResult<TFileGroup> {
  /** 모든 그룹 */
  groups: TFileGroup[]
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

// ============================================
// 일괄 등록 결과
// ============================================

/**
 * 일괄 등록 결과 (AR/CRS 공통)
 */
export interface BatchRegistrationResult {
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
// 테이블 뷰 타입
// ============================================

/**
 * 매핑 상태 필터 (AR/CRS 공통)
 */
export type MappingStatusFilter = 'all' | 'mapped' | 'unmapped' | 'duplicate'

/**
 * 제네릭 테이블 행 데이터
 * @template TFileInfo 파일 정보 타입
 */
export interface BaseFileTableRow<TFileInfo> {
  /** 파일 정보 */
  fileInfo: TFileInfo
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
}

/**
 * 제네릭 테이블 뷰 상태
 * @template TFileTableRow 테이블 행 타입
 * @template TFileGroup 파일 그룹 타입
 * @template TSortField 정렬 필드 타입
 */
export interface BaseTableViewState<
  TFileTableRow,
  TFileGroup,
  TSortField extends string
> {
  /** 전체 행 목록 */
  rows: TFileTableRow[]
  /** 그룹 정보 (드롭다운 옵션용) */
  groups: TFileGroup[]
  /** 현재 페이지 (1-based) */
  currentPage: number
  /** 페이지당 항목 수 */
  itemsPerPage: number
  /** 정렬 필드 */
  sortField: TSortField | null
  /** 정렬 방향 */
  sortDirection: 'asc' | 'desc'
  /** 검색어 (파일명 검색) */
  searchQuery: string
  /** 필터: 매핑 상태 */
  mappingStatusFilter: MappingStatusFilter
}

// ============================================
// 유틸리티 타입
// ============================================

/**
 * 효과적인 매핑 결과 (AR/CRS 공통)
 */
export interface EffectiveMapping {
  /** 고객 ID (그룹 또는 개별 매핑) */
  customerId: string | null
  /** 고객명 */
  customerName?: string
  /** 새 고객 이름 (신규 생성 시) */
  newCustomerName?: string
}

/**
 * 새 고객 정보 (AR/CRS 공통)
 */
export interface NewCustomerInfo {
  _id: string
  name: string
  customer_type: string
}
