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

export interface ValidationConfig {
  columnIndex: number
  columnName: string
}

export type RowStatus = 'normal' | 'empty' | 'duplicate' | 'selected'
