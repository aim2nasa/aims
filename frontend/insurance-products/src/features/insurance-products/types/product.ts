/**
 * Insurance Product Type Definitions
 */

// 상품 구분
export type ProductCategory =
  | '보장'    // Protection
  | '변액'    // Variable
  | '연금'    // Pension
  | '법인'    // Corporate
  | '양로'    // Endowment
  | '저축'    // Savings

// 판매 상태
export type ProductStatus = '판매중' | '판매중지'

// 보험 상품 인터페이스
export interface InsuranceProduct {
  _id?: string                    // MongoDB ObjectId
  category: ProductCategory       // 구분
  productName: string             // 주보험상품명
  saleStartDate: string           // 판매시작일 (YYYY.MM.DD)
  saleEndDate?: string            // 판매종료일 (YYYY.MM.DD), 없으면 판매중
  status: ProductStatus           // 판매상태
  surveyDate: string              // 조사일
  createdAt?: string              // 생성일
  updatedAt?: string              // 수정일
}

// 파일 업로드 결과
export interface ParseResult {
  success: boolean
  products: InsuranceProduct[]
  errors: string[]
  surveyDate: string
}

// API 응답 타입
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// 필터 옵션
export interface FilterOptions {
  category: ProductCategory | 'all'
  status: ProductStatus | 'all'
  searchTerm: string
}

// 정렬 옵션
export type SortField = 'productName' | 'category' | 'saleStartDate' | 'saleEndDate' | 'status' | 'surveyDate'
export type SortOrder = 'asc' | 'desc'

export interface SortOptions {
  field: SortField
  order: SortOrder
}

// 테이블 컬럼 정의
export interface TableColumn {
  key: keyof InsuranceProduct | 'actions'
  label: string
  width?: string
  sortable?: boolean
}

// 카테고리 레이블 매핑
export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  '보장': '보장성',
  '변액': '변액',
  '연금': '연금',
  '법인': '법인',
  '양로': '양로',
  '저축': '저축'
}

// 카테고리 색상 클래스 매핑
export const CATEGORY_COLORS: Record<ProductCategory, string> = {
  '보장': 'category--protection',
  '변액': 'category--variable',
  '연금': 'category--pension',
  '법인': 'category--corporate',
  '양로': 'category--endowment',
  '저축': 'category--savings'
}
