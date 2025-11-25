/**
 * Excel Refiner Utility Functions
 * xlsx (SheetJS) 라이브러리 사용
 */

import * as XLSX from 'xlsx'
import type { SheetData, CellValue } from '../types/excel'

/**
 * 엑셀 파일 파싱
 */
export async function parseExcel(file: File): Promise<SheetData[]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })

  return workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name]
    const jsonData = XLSX.utils.sheet_to_json<CellValue[]>(sheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' })

    // 첫 번째 행은 컬럼 헤더
    const columns = (jsonData[0] || []).map(col => String(col ?? ''))
    const data = jsonData.slice(1) as CellValue[][]

    return {
      name,
      columns,
      data
    }
  })
}

/**
 * 엑셀 파일 내보내기
 */
export function exportExcel(sheets: SheetData[], filename: string): void {
  const workbook = XLSX.utils.book_new()

  sheets.forEach(sheet => {
    // 컬럼 헤더 + 데이터 결합
    const allData = [sheet.columns, ...sheet.data]
    const worksheet = XLSX.utils.aoa_to_sheet(allData)
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name)
  })

  XLSX.writeFile(workbook, filename)
}

/**
 * 파일명에서 확장자 제거
 */
export function getFileNameWithoutExtension(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '')
}

/**
 * 정제된 파일명 생성
 */
export function getRefinedFileName(originalName: string): string {
  const baseName = getFileNameWithoutExtension(originalName)
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `${baseName}_정제_${timestamp}.xlsx`
}

/**
 * 날짜 문자열 정규화 (yyyy-mm-dd 형식으로 통일)
 */
function normalizeDateString(str: string): string | null {
  // 이미 yyyy-mm-dd 형식인 경우
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str
  }

  // m/d/yy 또는 mm/dd/yy 형식 (예: 9/14/06)
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (slashMatch) {
    const [, month, day, year] = slashMatch
    const fullYear = parseInt(year) > 50 ? `19${year}` : `20${year}`
    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // m/d/yyyy 또는 mm/dd/yyyy 형식 (예: 9/14/2006)
  const slashFullMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashFullMatch) {
    const [, month, day, year] = slashFullMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // yyyy/mm/dd 형식
  const slashYmdMatch = str.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (slashYmdMatch) {
    const [, year, month, day] = slashYmdMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  return null
}

/**
 * 셀 값을 문자열로 변환
 */
export function cellToString(value: CellValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const str = String(value)

  // 날짜 형식 정규화 시도
  const normalized = normalizeDateString(str)
  if (normalized) return normalized

  return str
}

/**
 * 엑셀 파일 유효성 검사
 */
export function isValidExcelFile(file: File): boolean {
  const validExtensions = ['.xlsx', '.xls']
  const extension = file.name.toLowerCase().match(/\.[^/.]+$/)?.[0]
  return extension ? validExtensions.includes(extension) : false
}
