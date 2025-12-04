/**
 * Excel Refiner Type Definitions
 */

export interface SheetData {
  name: string
  columns: string[]
  data: CellValue[][]
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
}

export interface FormatComplianceResult {
  status: FormatComplianceStatus        // 전체 준수 상태
  sheets: SheetComplianceCheck[]        // 시트별 검사 결과
  message: string                       // 요약 메시지
}
