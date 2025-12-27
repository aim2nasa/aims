/**
 * Excel Refiner Type Definitions
 */

export interface SheetData {
  name: string
  columns: string[]
  data: CellValue[][]
  /** 빈 행 이후에 발견된 데이터 행 번호들 (경고용) */
  skippedRows?: number[]
}

export type CellValue = string | number | boolean | Date | null | undefined

export interface ValidationResult {
  empties: number[]      // 빈 값 행 인덱스
  duplicates: number[]   // 중복 값 행 인덱스
  valid: boolean
}

// 보험상품 정보
export interface InsuranceProduct {
  _id: string
  productName: string
  category?: string
  saleStartDate?: string
  saleEndDate?: string
  status?: string
  surveyDate?: string
  createdAt?: string
  updatedAt?: string
}

// 상품명 매칭 결과
export interface ProductMatchResult {
  originalMatch: Map<number, string>   // 원래부터 정확히 매칭 (행 인덱스 → ObjectId)
  modified: Map<number, string>        // 수정되어 매칭됨 (행 인덱스 → ObjectId)
  unmatched: number[]                  // 매칭 안 된 행 인덱스
  productNames: Map<string, string>    // 상품명 → ObjectId
  allProducts: Map<string, InsuranceProduct>  // ObjectId → 전체 상품 정보
}

export interface ValidationConfig {
  columnIndex: number
  columnName: string
}

export type RowStatus = 'normal' | 'empty' | 'duplicate' | 'selected'

// 상품명 셀 상태 (상품명 칼럼에만 적용)
export type ProductCellStatus = 'original' | 'modified' | 'unmatched'

// 고객명 DB 검증 결과 상태
export type CustomerNameStatus = 'new' | 'update' | 'type_conflict' | 'empty'

// 기존 고객 정보 (DB에서 조회)
export interface ExistingCustomer {
  _id: string
  name: string
  customerType: '개인' | '법인'
  email?: string
  phone?: string
  address?: string
  birthDate?: string
  businessNumber?: string
  representativeName?: string
}

// 고객명 검증 결과 (단일 행)
export interface CustomerNameValidationItem {
  name: string
  status: CustomerNameStatus
  message: string
  existingCustomer?: ExistingCustomer
  existingType?: '개인' | '법인'
  requestedType?: '개인' | '법인'
}

// 고객명 DB 검증 결과 (전체)
export interface CustomerNameValidationResult {
  results: Map<number, CustomerNameValidationItem>  // 행 인덱스 → 검증 결과
  stats: {
    total: number
    new: number
    update: number
    typeConflict: number
    empty: number
  }
}

// 포맷 준수 검사 결과
export type FormatComplianceStatus = 'compliant' | 'warning' | 'error'

export interface RequiredColumnCheck {
  name: string           // 필수 컬럼 이름 (예: '고객명')
  patterns: string[]     // 인식 패턴 (예: ['고객명', '이름', '성명', '고객'])
  found: boolean         // 발견 여부
  foundAs?: string       // 변형된 컬럼명으로 찾은 경우 (예: '계약자이름')
}

export interface SheetComplianceCheck {
  name: string                          // 시트명 (예: '개인고객', '법인고객', '계약')
  found: boolean                        // 시트 존재 여부
  requiredColumns: RequiredColumnCheck[] // 필수 컬럼 검사 결과
  hasAllRequired: boolean               // 모든 필수 컬럼 존재 여부
  missingOptionalColumns?: string[]     // 누락된 선택 컬럼 (표준에 있지만 없는 컬럼)
  extraColumns?: string[]               // 규격 외 컬럼 (표준에 없는 컬럼)
}

export interface FormatComplianceResult {
  status: FormatComplianceStatus        // 전체 준수 상태
  sheets: SheetComplianceCheck[]        // 시트별 검사 결과
  message: string                       // 요약 메시지
  missingOptionalColumns?: string[]     // 전체 누락된 선택 컬럼 목록
  extraColumns?: string[]               // 전체 규격 외 컬럼 목록
}
