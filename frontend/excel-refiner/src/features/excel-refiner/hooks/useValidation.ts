/**
 * Excel Refiner Validation Hook
 * Python excel_refiner_gui.py 검증 로직 포팅
 */

import { useMemo } from 'react'
import type { CellValue, ValidationResult } from '../types/excel'
import { cellToString } from '../utils/excel'

/**
 * 증권번호 검증 함수
 * - 빈 값 체크
 * - 중복 값 체크
 * - 100% 고유성 검증 (엄격 모드)
 */
export function validatePolicyNumbers(
  data: CellValue[][],
  columnIndex: number
): ValidationResult {
  // 컬럼 값 추출 및 정규화
  const normalized = data.map(row => {
    const value = row[columnIndex]
    const str = cellToString(value).trim().toLowerCase()
    // 'nan', 빈 문자열은 빈 값으로 처리
    return str === 'nan' || str === '' ? '' : str
  })

  // 빈 값 체크 (행 인덱스 수집)
  const empties: number[] = []
  normalized.forEach((value, index) => {
    if (!value) {
      empties.push(index)
    }
  })

  // 중복 체크
  const seen = new Map<string, number[]>()
  normalized.forEach((value, index) => {
    if (value) {
      if (!seen.has(value)) {
        seen.set(value, [])
      }
      seen.get(value)!.push(index)
    }
  })

  // 중복된 행 인덱스 수집 (2개 이상 등장한 값들의 모든 인덱스)
  const duplicates: number[] = []
  seen.forEach(indices => {
    if (indices.length > 1) {
      duplicates.push(...indices)
    }
  })

  // 중복 인덱스 정렬 및 중복 제거
  const uniqueDuplicates = [...new Set(duplicates)].sort((a, b) => a - b)

  return {
    empties,
    duplicates: uniqueDuplicates,
    valid: empties.length === 0 && uniqueDuplicates.length === 0
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
