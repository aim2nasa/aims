/**
 * File Parser Utilities
 * MD, Excel 파일 파싱
 */

import * as XLSX from 'xlsx'
import type { InsuranceProduct, ProductCategory, ProductStatus, ParseResult } from '../types/product'

/**
 * 날짜 문자열에서 조사일 추출
 * 파일명 또는 내용에서 날짜 패턴 찾기
 */
function extractSurveyDate(text: string): string {
  // YYYY.MM.DD 또는 YYYY-MM-DD 패턴 찾기
  const datePattern = /(\d{4})[.\-](\d{2})[.\-](\d{2})/
  const match = text.match(datePattern)
  if (match) {
    return `${match[1]}.${match[2]}.${match[3]}`
  }
  // 기본값: 오늘 날짜
  const today = new Date()
  return `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`
}

/**
 * 파일명에서 판매 상태 추출
 * 파일명에 "판매중지" 또는 "중지"가 포함되어 있으면 판매중지
 */
function extractStatusFromFileName(fileName: string): ProductStatus {
  const lowerName = fileName.toLowerCase()
  if (lowerName.includes('판매중지') || lowerName.includes('중지')) {
    return '판매중지'
  }
  return '판매중'
}

/**
 * 판매기간 파싱
 * "2025.09.01 ~" 또는 "2019.04.01 ~ 2020.04.09" 형식
 */
function parseSalePeriod(period: string): { startDate: string; endDate?: string } {
  const trimmed = period.trim()
  const parts = trimmed.split('~').map(p => p.trim())

  const startDate = parts[0] || ''
  const endDate = parts[1] && parts[1] !== '' ? parts[1] : undefined

  return { startDate, endDate }
}

/**
 * 카테고리 유효성 검사
 */
function isValidCategory(category: string): category is ProductCategory {
  return ['보장', '변액', '연금', '법인', '양로', '저축'].includes(category)
}

/**
 * MD 파일 파싱
 * Markdown 테이블 형식 파싱
 */
export function parseMdFile(content: string, fileName: string): ParseResult {
  const errors: string[] = []
  const products: InsuranceProduct[] = []
  const surveyDate = extractSurveyDate(fileName)
  const status = extractStatusFromFileName(fileName)

  // 라인별로 분리
  const lines = content.split('\n').filter(line => line.trim())

  // 테이블 행 찾기 (| 로 시작하는 행)
  const tableLines = lines.filter(line => line.trim().startsWith('|'))

  // 헤더 행과 구분선 건너뛰기 (처음 2줄)
  const dataLines = tableLines.slice(2)

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i]
    const cells = line.split('|').map(cell => cell.trim()).filter(cell => cell)

    if (cells.length < 3) {
      errors.push(`라인 ${i + 3}: 컬럼 수 부족`)
      continue
    }

    const [categoryStr, productName, salePeriod] = cells

    if (!isValidCategory(categoryStr)) {
      errors.push(`라인 ${i + 3}: 알 수 없는 구분 "${categoryStr}"`)
      continue
    }

    const { startDate, endDate } = parseSalePeriod(salePeriod)

    products.push({
      category: categoryStr,
      productName: productName.trim(),
      saleStartDate: startDate,
      saleEndDate: endDate,
      status,
      surveyDate
    })
  }

  return {
    success: errors.length === 0,
    products,
    errors,
    surveyDate
  }
}

/**
 * Excel 파일 파싱
 */
export function parseExcelFile(data: ArrayBuffer, fileName: string): ParseResult {
  const errors: string[] = []
  const products: InsuranceProduct[] = []
  const surveyDate = extractSurveyDate(fileName)
  const status = extractStatusFromFileName(fileName)

  try {
    const workbook = XLSX.read(data, { type: 'array' })
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1 })

    // 헤더 행 건너뛰기
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as unknown[]

      if (!row || row.length < 3) continue

      const [categoryStr, productName, salePeriod] = row

      if (!categoryStr || !productName) continue

      const category = String(categoryStr).trim()
      if (!isValidCategory(category)) {
        errors.push(`행 ${i + 1}: 알 수 없는 구분 "${category}"`)
        continue
      }

      const { startDate, endDate } = parseSalePeriod(String(salePeriod || ''))

      products.push({
        category,
        productName: String(productName).trim(),
        saleStartDate: startDate,
        saleEndDate: endDate,
        status,
        surveyDate
      })
    }
  } catch (err) {
    errors.push(`Excel 파싱 오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
  }

  return {
    success: errors.length === 0,
    products,
    errors,
    surveyDate
  }
}

/**
 * 파일 타입에 따른 파서 선택
 */
export async function parseFile(file: File): Promise<ParseResult> {
  const fileName = file.name.toLowerCase()

  if (fileName.endsWith('.md')) {
    const content = await file.text()
    return parseMdFile(content, file.name)
  }

  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    const buffer = await file.arrayBuffer()
    return parseExcelFile(buffer, file.name)
  }

  return {
    success: false,
    products: [],
    errors: [`지원하지 않는 파일 형식: ${fileName}`],
    surveyDate: ''
  }
}
