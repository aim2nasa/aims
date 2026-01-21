/**
 * CRS Batch Types
 * @description CRS(Customer Review Service) 다중 문서 일괄 처리를 위한 타입 정의
 * @see docs/AR_CRS_BATCH_REGISTRATION_COMPARISON.md
 */

// 공통 타입 import
import type {
  CrMetadata,
  CrDuplicateStatus,
  BaseFileInfo,
  BaseFileGroup,
  MatchStatus,
  BaseBatchMappingState,
  BaseGroupingResult,
  BatchRegistrationResult,
  MappingStatusFilter,
  BaseFileTableRow,
  BaseTableViewState,
  FileAnalysisStatus,
  AnalyzingFileInfo,
} from './batchTypes'

// 공통 타입 re-export
export type { MatchStatus as CrMatchStatus, BatchRegistrationResult as CrBatchRegistrationResult, MappingStatusFilter }
export type { CrMetadata, CrDuplicateStatus }
export type { FileAnalysisStatus, AnalyzingFileInfo }

// ============================================
// CRS 전용 타입
// ============================================

/**
 * CRS 파일 정보
 */
export type CrFileInfo = BaseFileInfo<CrMetadata, CrDuplicateStatus>

/**
 * CRS 파일 그룹 (계약자명별)
 * @extends BaseFileGroup with CRS-specific field
 */
export interface CrFileGroup extends BaseFileGroup<CrFileInfo> {
  /** CRS에서 추출한 계약자명 */
  contractorNameFromCr: string
}

/**
 * 일괄 매핑 모달 상태
 */
export type CrBatchMappingState = BaseBatchMappingState<CrFileGroup>

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
export type CrGroupingResult = BaseGroupingResult<CrFileGroup>

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
 * 매핑 상태 필터 (공통 타입 사용)
 */
export type CrMappingStatusFilter = MappingStatusFilter

/**
 * 테이블 행 데이터 (파일별 개별 매핑 지원)
 * @description 각 파일이 독립적인 고객 선택을 가질 수 있음
 * @extends BaseFileTableRow with CRS-specific fields
 */
export interface CrFileTableRow extends BaseFileTableRow<CrFileInfo> {
  /** CRS에서 추출한 계약자명 (표시용) */
  extractedContractorName: string
  /** CRS에서 추출한 증권번호 (표시용) */
  extractedPolicyNumber?: string
}

/**
 * 테이블 뷰 상태
 * @description 페이지네이션, 정렬, 필터 등 테이블 UI 상태 관리
 */
export type CrTableViewState = BaseTableViewState<CrFileTableRow, CrFileGroup, CrTableSortField>
