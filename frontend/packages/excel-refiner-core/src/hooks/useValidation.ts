/**
 * Excel Refiner Validation Hook
 * Python excel_refiner_gui.py 검증 로직 포팅
 */

import { useMemo } from 'react'
import type {
  CellValue,
  ValidationResult,
  ProductMatchResult,
  InsuranceProduct,
  SheetData,
  FormatComplianceResult,
  SheetComplianceCheck,
  RequiredColumnCheck
} from '../types/excel'
import { cellToString } from '../utils/excel'

// 보험상품 API URL (Vite 프록시를 통해 tars.giize.com:3010으로 전달)
const INSURANCE_PRODUCTS_API = '/api/insurance-products'

/**
 * 증권번호 검증 함수
 * - 빈 값 → 오류
 * - 중복 값 → 오류 (100% 고유성 필수)
 */
export function validatePolicyNumbers(
  data: CellValue[][],
  columnIndex: number
): ValidationResult {
  const normalized = data.map(row => {
    const value = row[columnIndex]
    const str = cellToString(value).trim().toLowerCase()
    return str === 'nan' || str === '' ? '' : str
  })

  const empties: number[] = []
  normalized.forEach((value, index) => {
    if (!value) {
      empties.push(index)
    }
  })

  // 중복 체크 (오류로 처리)
  const seen = new Map<string, number[]>()
  normalized.forEach((value, index) => {
    if (value) {
      if (!seen.has(value)) {
        seen.set(value, [])
      }
      seen.get(value)!.push(index)
    }
  })

  const duplicates: number[] = []
  seen.forEach(indices => {
    if (indices.length > 1) {
      duplicates.push(...indices)
    }
  })

  const uniqueDuplicates = [...new Set(duplicates)].sort((a, b) => a - b)

  return {
    empties,
    duplicates: uniqueDuplicates,
    valid: empties.length === 0 && uniqueDuplicates.length === 0
  }
}

/**
 * 계약일 검증 함수
 * - 형식 검증: YYYY-MM-DD 형식인지
 * - 유효성 검증: 실제 존재하는 날짜인지 (2월 30일 등 무효)
 */
export function validateContractDate(
  data: CellValue[][],
  columnIndex: number
): ValidationResult {
  const empties: number[] = []

  data.forEach((row, index) => {
    const value = cellToString(row[columnIndex]).trim()

    // 빈값 체크
    if (!value || value.toLowerCase() === 'nan') {
      empties.push(index)
      return
    }

    // YYYY-MM-DD 형식 체크
    const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/
    const match = value.match(datePattern)

    if (!match || !match[1] || !match[2] || !match[3]) {
      // 형식이 맞지 않음
      empties.push(index)
      return
    }

    const year = parseInt(match[1], 10)
    const month = parseInt(match[2], 10)
    const day = parseInt(match[3], 10)

    // 월 범위 체크 (1-12)
    if (month < 1 || month > 12) {
      empties.push(index)
      return
    }

    // 일 범위 체크 (각 월의 최대 일수)
    const daysInMonth = new Date(year, month, 0).getDate()
    if (day < 1 || day > daysInMonth) {
      empties.push(index)
      return
    }

    // Date 객체로 최종 유효성 확인
    const date = new Date(year, month - 1, day)
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      empties.push(index)
      return
    }
  })

  return {
    empties,
    duplicates: [], // 계약일은 중복 체크 안함
    valid: empties.length === 0
  }
}

/**
 * 고객명 검증 함수
 * - 오류(empties): 빈값만 체크
 * - 숫자, 특수문자 허용 (기업명 가능: "365", "(주)삼성" 등)
 * - 중복은 체크하지 않음 (동명이인 당연히 존재)
 */
export function validateCustomerName(
  data: CellValue[][],
  columnIndex: number
): ValidationResult {
  const empties: number[] = []

  data.forEach((row, index) => {
    const value = cellToString(row[columnIndex]).trim()

    // 빈값만 체크
    if (!value || value.toLowerCase() === 'nan') {
      empties.push(index)
    }
  })

  return {
    empties,
    duplicates: [],  // 고객명은 중복 체크 안함
    valid: empties.length === 0
  }
}

/**
 * 컬럼명에 따른 검증 타입 결정
 */
export type ValidationType = 'policyNumber' | 'customerName' | 'contractDate' | 'productName' | 'default'

export function getValidationType(columnName: string): ValidationType {
  const name = columnName.toLowerCase()
  if (name.includes('증권번호') || name.includes('policy')) {
    return 'policyNumber'
  }
  if (name.includes('고객명') || name.includes('이름') || name.includes('성명') || name === '고객') {
    return 'customerName'
  }
  if (name.includes('계약일')) {
    return 'contractDate'
  }
  if (name.includes('상품명') || name.includes('상품') || name.includes('보험명')) {
    return 'productName'
  }
  return 'default'
}

/**
 * 컬럼명에 따른 검증 함수 선택 및 실행
 */
export function validateColumn(
  data: CellValue[][],
  columnIndex: number,
  columnName: string
): ValidationResult {
  const type = getValidationType(columnName)
  switch (type) {
    case 'policyNumber':
      return validatePolicyNumbers(data, columnIndex)
    case 'customerName':
      return validateCustomerName(data, columnIndex)
    case 'contractDate':
      return validateContractDate(data, columnIndex)
    default:
      // 기본: 빈값만 체크
      const empties: number[] = []
      data.forEach((row, index) => {
        const value = cellToString(row[columnIndex]).trim()
        if (!value || value.toLowerCase() === 'nan') {
          empties.push(index)
        }
      })
      return { empties, duplicates: [], valid: empties.length === 0 }
  }
}

/**
 * 검증 훅 - 데이터와 컬럼 인덱스가 변경될 때마다 검증 수행
 */
export function useValidation(
  data: CellValue[][] | null,
  columnIndex: number | null
): ValidationResult | null {
  return useMemo(() => {
    if (!data || columnIndex === null || columnIndex < 0) {
      return null
    }
    return validatePolicyNumbers(data, columnIndex)
  }, [data, columnIndex])
}

/**
 * 문제 행 인덱스 목록 가져오기 (빈 값 + 중복)
 */
export function getProblematicRows(result: ValidationResult): number[] {
  const allProblematic = [...result.empties, ...result.duplicates]
  return [...new Set(allProblematic)].sort((a, b) => a - b)
}

/**
 * 행 상태 판단
 */
export function getRowStatus(
  rowIndex: number,
  result: ValidationResult | null
): 'normal' | 'empty' | 'duplicate' {
  if (!result) return 'normal'
  if (result.empties.includes(rowIndex)) return 'empty'
  if (result.duplicates.includes(rowIndex)) return 'duplicate'
  return 'normal'
}

/**
 * 보험상품 목록 가져오기
 */
export async function fetchInsuranceProducts(): Promise<InsuranceProduct[]> {
  try {
    const response = await fetch(INSURANCE_PRODUCTS_API)
    const data = await response.json()
    if (data.success && data.data) {
      return data.data
    }
    return []
  } catch (error) {
    console.error('보험상품 조회 오류:', error)
    return []
  }
}

/**
 * 상품명 검증 함수 (비동기)
 * - 보험상품 DB에서 상품명 조회
 * - originalMatch: 정확히 일치하는 상품명 (수정 불필요)
 * - modified: 공백/대소문자 등 정규화 후 매칭된 상품명
 * - unmatched: 매칭 안 됨
 */
export async function validateProductNames(
  data: CellValue[][],
  columnIndex: number
): Promise<ProductMatchResult> {
  // 보험상품 목록 가져오기
  const insuranceProducts = await fetchInsuranceProducts()

  // 상품명 → ObjectId 맵 생성 (원본)
  const productNameMap = new Map<string, string>()
  // 정규화된 상품명 → 원본 상품명 맵 (매칭용)
  const normalizedToOriginal = new Map<string, string>()

  // ObjectId → 전체 상품 정보 맵
  const allProducts = new Map<string, InsuranceProduct>()

  insuranceProducts.forEach(product => {
    productNameMap.set(product.productName, product._id)
    allProducts.set(product._id, product)
    // 정규화: 공백 제거, 소문자 변환
    const normalized = product.productName.replace(/\s+/g, '').toLowerCase()
    normalizedToOriginal.set(normalized, product.productName)
  })

  // 매칭 결과
  const originalMatch = new Map<number, string>()  // 원래부터 정확히 매칭
  const modified = new Map<number, string>()        // 수정되어 매칭됨
  const unmatched: number[] = []

  data.forEach((row, index) => {
    const rawValue = cellToString(row[columnIndex])
    const value = rawValue.trim()

    // 빈값 체크
    if (!value || value.toLowerCase() === 'nan') {
      unmatched.push(index)
      return
    }

    // 1. 정확히 매칭되는지 확인 (원본 그대로)
    if (productNameMap.has(value)) {
      originalMatch.set(index, productNameMap.get(value)!)
      return
    }

    // 2. 정규화 후 매칭 시도
    const normalizedValue = value.replace(/\s+/g, '').toLowerCase()
    if (normalizedToOriginal.has(normalizedValue)) {
      const originalProductName = normalizedToOriginal.get(normalizedValue)!
      modified.set(index, productNameMap.get(originalProductName)!)
      return
    }

    // 3. 매칭 실패
    unmatched.push(index)
  })

  return {
    originalMatch,
    modified,
    unmatched,
    productNames: productNameMap,
    allProducts
  }
}

/**
 * 시트별 필수 컬럼 정의
 * EXCEL_IMPORT_SPECIFICATION.md v0.1 기준
 */
const SHEET_REQUIREMENTS: Record<string, { required: Array<{ name: string; patterns: string[] }> }> = {
  '개인고객': {
    required: [
      { name: '고객명', patterns: ['고객명', '이름', '성명', '고객'] }
    ]
  },
  '법인고객': {
    required: [
      { name: '고객명', patterns: ['고객명', '이름', '성명', '고객'] }
    ]
  },
  '계약': {
    required: [
      { name: '고객명', patterns: ['고객명', '이름', '성명', '고객'] },
      { name: '상품명', patterns: ['상품명', '상품', '보험명'] },
      { name: '계약일', patterns: ['계약일'] },
      { name: '증권번호', patterns: ['증권번호', 'policy'] }
    ]
  }
}

/**
 * 컬럼명이 패턴과 일치하는지 검사
 * @returns 일치하는 컬럼명 또는 null
 */
function findMatchingColumn(columns: string[], patterns: string[]): string | null {
  const lowerPatterns = patterns.map(p => p.toLowerCase())

  for (const col of columns) {
    const lowerCol = col.toLowerCase()
    for (const pattern of lowerPatterns) {
      if (lowerCol.includes(pattern)) {
        return col
      }
    }
  }
  return null
}

/**
 * 엑셀 파일의 포맷 준수 여부를 검사합니다.
 * 파일 로드 즉시 호출하여 표준 준수 상태를 확인합니다.
 *
 * @param sheets 파싱된 시트 데이터 배열
 * @returns 포맷 준수 검사 결과
 */
export function checkFormatCompliance(sheets: SheetData[]): FormatComplianceResult {
  const sheetMap = new Map<string, SheetData>()
  sheets.forEach(sheet => sheetMap.set(sheet.name, sheet))

  const sheetChecks: SheetComplianceCheck[] = []
  let hasError = false
  let hasWarning = false

  // 각 표준 시트에 대해 검사
  for (const [sheetName, requirements] of Object.entries(SHEET_REQUIREMENTS)) {
    const sheet = sheetMap.get(sheetName)
    const found = !!sheet

    const columnChecks: RequiredColumnCheck[] = []

    if (found && sheet) {
      // 시트가 존재하면 필수 컬럼 검사
      for (const req of requirements.required) {
        const matchedColumn = findMatchingColumn(sheet.columns, req.patterns)

        if (matchedColumn) {
          // 정확히 일치하는지, 변형된 이름인지 체크
          const isExactMatch = req.patterns.some(p => p.toLowerCase() === matchedColumn.toLowerCase())

          columnChecks.push({
            name: req.name,
            patterns: req.patterns,
            found: true,
            foundAs: isExactMatch ? undefined : matchedColumn
          })

          // 변형된 이름으로 찾은 경우 경고
          if (!isExactMatch) {
            hasWarning = true
          }
        } else {
          // 필수 컬럼 누락 → 오류
          columnChecks.push({
            name: req.name,
            patterns: req.patterns,
            found: false
          })
          hasError = true
        }
      }
    }

    const hasAllRequired = found && columnChecks.every(c => c.found)

    sheetChecks.push({
      name: sheetName,
      found,
      requiredColumns: columnChecks,
      hasAllRequired
    })
  }

  // 최소 1개 시트 필요 검사
  const foundSheets = sheetChecks.filter(s => s.found)
  if (foundSheets.length === 0) {
    hasError = true
  }

  // 상태 결정
  let status: 'compliant' | 'warning' | 'error'
  let message: string

  if (hasError) {
    status = 'error'
    const missingColumns = sheetChecks
      .filter(s => s.found && !s.hasAllRequired)
      .map(s => `${s.name}: ${s.requiredColumns.filter(c => !c.found).map(c => c.name).join(', ')} 누락`)

    if (foundSheets.length === 0) {
      message = '표준 시트(개인고객, 법인고객, 계약)가 없습니다'
    } else if (missingColumns.length > 0) {
      message = missingColumns.join(' | ')
    } else {
      message = '필수 컬럼이 누락되었습니다'
    }
  } else if (hasWarning) {
    status = 'warning'
    const variantColumns = sheetChecks
      .flatMap(s => s.requiredColumns.filter(c => c.foundAs))
      .map(c => `${c.name} → ${c.foundAs}`)
    message = `컬럼명 변형 감지: ${variantColumns.join(', ')}`
  } else {
    status = 'compliant'
    message = '표준 규격 준수'
  }

  return {
    status,
    sheets: sheetChecks,
    message
  }
}
