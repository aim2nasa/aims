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
    if (!sheet) {
      return { name, columns: [], data: [] }
    }
    const jsonData = XLSX.utils.sheet_to_json<CellValue[]>(sheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' })

    // 첫 번째 행은 컬럼 헤더
    const columns = (jsonData[0] || []).map(col => String(col ?? ''))
    const rawData = jsonData.slice(1) as CellValue[][]

    // 연속된 데이터만 포함 (첫 번째 빈 행이 나오면 그 이후는 무시)
    // - 엑셀에서 데이터는 연속적으로 입력되는 것이 표준
    // - 중간에 빈 행 후 데이터가 있으면 대부분 실수 (오타, 잘못된 입력 등)
    const data: CellValue[][] = []
    const skippedRows: number[] = []
    let foundEmptyRow = false

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i]
      const excelRowNumber = i + 2 // 엑셀 행 번호 (헤더가 1행)

      // 빈 배열 체크
      const isEmpty = !row || row.length === 0

      // 모든 셀이 비어있는지 체크
      const hasValue = !isEmpty && row.some(cell => {
        if (cell === null || cell === undefined) return false
        const str = String(cell).trim()
        return str.length > 0
      })

      if (!foundEmptyRow) {
        // 아직 빈 행을 만나지 않음
        if (isEmpty || !hasValue) {
          // 첫 번째 빈 행 발견 → 이후부터는 스킵 모드
          foundEmptyRow = true
        } else {
          // 데이터 있음 → 추가
          data.push(row)
        }
      } else {
        // 빈 행 이후 모드
        if (hasValue) {
          // 빈 행 이후에 데이터가 있음 → 경고 대상
          skippedRows.push(excelRowNumber)
        }
      }
    }

    return {
      name,
      columns,
      data,
      ...(skippedRows.length > 0 ? { skippedRows } : {})
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
  if (slashMatch && slashMatch[1] && slashMatch[2] && slashMatch[3]) {
    const month = slashMatch[1]
    const day = slashMatch[2]
    const year = slashMatch[3]
    const fullYear = parseInt(year) > 50 ? `19${year}` : `20${year}`
    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // m/d/yyyy 또는 mm/dd/yyyy 형식 (예: 9/14/2006)
  const slashFullMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashFullMatch && slashFullMatch[1] && slashFullMatch[2] && slashFullMatch[3]) {
    const month = slashFullMatch[1]
    const day = slashFullMatch[2]
    const year = slashFullMatch[3]
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // yyyy/mm/dd 형식
  const slashYmdMatch = str.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (slashYmdMatch && slashYmdMatch[1] && slashYmdMatch[2] && slashYmdMatch[3]) {
    const year = slashYmdMatch[1]
    const month = slashYmdMatch[2]
    const day = slashYmdMatch[3]
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
