/**
 * AR Batch Types
 * @description AR 다중 문서 일괄 처리를 위한 타입 정의
 * @see docs/AR_MULTI_UPLOAD_UX_ANALYSIS.md
 * @see docs/AR_CRS_BATCH_REGISTRATION_COMPARISON.md
 */

// 공통 타입 import
import type {
  ArMetadata,
  ArDuplicateStatus,
  BaseFileInfo,
  BaseFileGroup,
  MatchStatus,
  BaseBatchMappingState,
  BaseGroupingResult,
  BatchRegistrationResult,
  MappingStatusFilter,
  BaseFileTableRow,
  BaseTableViewState,
} from './batchTypes'

// 공통 타입 re-export
export type { MatchStatus, BatchRegistrationResult, MappingStatusFilter }
export type { ArMetadata, ArDuplicateStatus }

// ============================================
// AR 전용 타입
// ============================================

/**
 * AR 파일 정보
 */
export type ArFileInfo = BaseFileInfo<ArMetadata, ArDuplicateStatus>

/**
 * AR 파일 그룹 (고객명별)
 * @extends BaseFileGroup with AR-specific field
 */
export interface ArFileGroup extends BaseFileGroup<ArFileInfo> {
  /** AR에서 추출한 고객명 */
  customerNameFromAr: string
}

/**
 * 일괄 매핑 모달 상태
 */
export type BatchMappingState = BaseBatchMappingState<ArFileGroup>

/**
 * AR 분석 결과
 */
export interface ArAnalysisResult {
  /** AR 여부 */
  is_annual_report: boolean
  /** 신뢰도 (0~1) */
  confidence: number
  /** 메타데이터 */
  metadata?: {
    customer_name?: string
    issue_date?: string
    report_title?: string
    fsr_name?: string
  }
}

/**
 * 그룹핑 결과
 */
export type GroupingResult = BaseGroupingResult<ArFileGroup>

// ============================================
// 테이블 뷰 타입 (파일별 개별 매핑 지원)
// ============================================

/**
 * 테이블 정렬 필드
 */
export type ArTableSortField =
  | 'fileName'
  | 'extractedCustomer'
  | 'mappedCustomer'
  | 'issueDate'
  | 'status'

/**
 * 매핑 상태 필터 (공통 타입 사용)
 */
export type ArMappingStatusFilter = MappingStatusFilter

/**
 * 테이블 행 데이터 (파일별 개별 매핑 지원)
 * @description 각 파일이 독립적인 고객 선택을 가질 수 있음
 * @extends BaseFileTableRow with AR-specific field
 */
export interface ArFileTableRow extends BaseFileTableRow<ArFileInfo> {
  /** AR에서 추출한 고객명 (표시용) */
  extractedCustomerName: string
}

/**
 * 테이블 뷰 상태
 * @description 페이지네이션, 정렬, 필터 등 테이블 UI 상태 관리
 */
export type ArTableViewState = BaseTableViewState<ArFileTableRow, ArFileGroup, ArTableSortField>
