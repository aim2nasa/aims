/**
 * @aims/excel-refiner-core
 * Excel Refiner 공유 패키지 - 로직 단일 소스
 *
 * 사용처:
 * - excel-refiner (부품 검증용 독립 앱)
 * - aims-uix3 (통합 검증용 메인 앱)
 */

// Types
export type {
  CellValue,
  SheetData,
  ValidationResult,
  ProductMatchResult,
  InsuranceProduct,
  ValidationConfig,
  RowStatus,
  ProductCellStatus,
  FormatComplianceStatus,
  FormatComplianceResult,
  SheetComplianceCheck,
  RequiredColumnCheck
} from './types/excel'

// Utils
export {
  parseExcel,
  exportExcel,
  isValidExcelFile,
  getRefinedFileName,
  cellToString
} from './utils/excel'

// Hooks & Validation
export {
  validateColumn,
  validatePolicyNumbers,
  validateCustomerName,
  validateContractDate,
  validateProductNames,
  getValidationType,
  getRowStatus,
  getProblematicRows,
  fetchInsuranceProducts,
  useValidation,
  checkFormatCompliance,
  getStandardColumnOrder
} from './hooks/useValidation'

export type { ValidationType } from './hooks/useValidation'
