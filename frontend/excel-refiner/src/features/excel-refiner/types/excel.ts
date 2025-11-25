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

// 상품명 매칭 결과
export interface ProductMatchResult {
  originalMatch: Map<number, string>   // 원래부터 정확히 매칭 (행 인덱스 → ObjectId)
  modified: Map<number, string>        // 수정되어 매칭됨 (행 인덱스 → ObjectId)
  unmatched: number[]                  // 매칭 안 된 행 인덱스
  productNames: Map<string, string>    // 상품명 → ObjectId
}

export interface ValidationConfig {
  columnIndex: number
  columnName: string
}

export type RowStatus = 'normal' | 'empty' | 'duplicate' | 'selected'

// 상품명 셀 상태 (상품명 칼럼에만 적용)
export type ProductCellStatus = 'original' | 'modified' | 'unmatched'
