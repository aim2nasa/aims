/**
 * Excel Refiner Component for ContractImportView
 * @since 1.0.0
 *
 * aims-uix3 공용 컴포넌트 사용:
 * - Button: @/shared/ui/Button
 * - Modal: @/shared/ui/Modal
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useAppleConfirm } from '@/contexts/AppleConfirmProvider'
import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Modal'
import { DraggableModal } from '@/shared/ui/DraggableModal'
import { Tooltip } from '@/shared/ui/Tooltip'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol'
import {
  parseExcel,
  exportExcel,
  isValidExcelFile,
  getRefinedFileName,
  cellToString,
  validateColumn,
  getValidationType,
  getRowStatus,
  getProblematicRows,
  validateProductNames,
  validateCustomerNamesWithDB,
  checkFormatCompliance,
  getStandardColumnOrder,
  EXCEL_SPEC_VERSION,
  type SheetData,
  type CellValue,
  type ValidationResult,
  type ProductMatchResult,
  type InsuranceProduct,
  type ValidationType,
  type FormatComplianceResult,
  type CustomerNameValidationResult
} from '@aims/excel-refiner-core'
import { CustomerService, type BulkCustomerInput } from '@/services/customerService'
import { ContractService } from '@/services/contractService'
import { useAuthStore } from '@/shared/stores/authStore'
import { ProductSearchModal } from './ProductSearchModal'
import './ExcelRefiner.css'

// 우측 정렬이 필요한 컬럼명 패턴
const RIGHT_ALIGN_PATTERNS = ['증권번호', '보험료', '이체일', '납입주기', '납입기간', '납입상태', '연락처', '계약일', '피보험자']

// 시트별 검증 상태 타입
type SheetValidationStatus = 'pending' | 'validating' | 'valid' | 'invalid'

function isRightAlignColumn(columnName: string): boolean {
  if (!columnName) return false
  return RIGHT_ALIGN_PATTERNS.some(pattern => columnName.includes(pattern))
}

// sessionStorage 키
const STORAGE_KEY = 'excelRefiner_state'

// ===== P2-1: Map 직렬화 유틸리티 =====

// ProductMatchResult를 JSON 직렬화 가능한 형태로 변환
interface SerializedProductMatchResult {
  originalMatch: Array<[number, string]>
  modified: Array<[number, string]>
  unmatched: number[]
  productNames: Array<[string, string]>
  allProducts: Array<[string, InsuranceProduct]>
}

function serializeProductMatchResult(result: ProductMatchResult): SerializedProductMatchResult {
  return {
    originalMatch: Array.from(result.originalMatch.entries()),
    modified: Array.from(result.modified.entries()),
    unmatched: result.unmatched,
    productNames: Array.from(result.productNames.entries()),
    allProducts: Array.from(result.allProducts.entries())
  }
}

function deserializeProductMatchResult(serialized: SerializedProductMatchResult): ProductMatchResult {
  return {
    originalMatch: new Map(serialized.originalMatch),
    modified: new Map(serialized.modified),
    unmatched: serialized.unmatched,
    productNames: new Map(serialized.productNames),
    allProducts: new Map(serialized.allProducts)
  }
}

// ===== P2-2: 고객 결과 분류 유틸리티 =====

// API 응답 타입 (bulkImportCustomers)
interface BulkImportResult {
  created: Array<{ name: string; [key: string]: unknown }>
  updated: Array<{ name: string; changes?: string[]; [key: string]: unknown }>
  skipped: Array<{ name: string; [key: string]: unknown }>
  errors: Array<{ name: string; [key: string]: unknown }>
}

// 분류된 고객 결과 타입
interface PartitionedCustomerResult {
  개인고객: {
    created: Array<{ name: string; mobile_phone?: string; address?: string; gender?: string; birth_date?: string }>
    updated: Array<{ name: string; mobile_phone?: string; address?: string; gender?: string; birth_date?: string; changes: string[] }>
    skipped: Array<{ name: string; reason: string }>
    errors: Array<{ name: string; reason: string }>
  }
  법인고객: {
    created: Array<{ name: string; mobile_phone?: string; address?: string }>
    updated: Array<{ name: string; mobile_phone?: string; address?: string; changes: string[] }>
    skipped: Array<{ name: string; reason: string }>
    errors: Array<{ name: string; reason: string }>
  }
}

/**
 * P2-2: API 결과를 개인/법인으로 분류하는 유틸리티 함수
 * 3곳에서 중복되던 로직을 통합
 */
function partitionBulkResultByType(
  result: BulkImportResult,
  customers: BulkCustomerInput[]
): PartitionedCustomerResult {
  const customerMap = new Map(customers.map(c => [c.name, c]))

  // 개인 고객 결과
  const 개인Created = result.created
    .map(c => customerMap.get(c.name))
    .filter((c): c is BulkCustomerInput => c !== undefined && c.customer_type === '개인')
    .map(c => ({ name: c.name, mobile_phone: c.mobile_phone, address: c.address, gender: c.gender, birth_date: c.birth_date }))

  const 개인Updated = result.updated
    .filter(c => customerMap.get(c.name)?.customer_type === '개인')
    .map(c => {
      const input = customerMap.get(c.name)
      return { name: c.name, mobile_phone: input?.mobile_phone, address: input?.address, gender: input?.gender, birth_date: input?.birth_date, changes: c.changes || [] }
    })

  const 개인Skipped = result.skipped
    .filter(c => customerMap.get(c.name)?.customer_type === '개인')
    .map(c => ({ name: c.name, reason: (c as { reason?: string }).reason || '변경사항 없음' }))
  const 개인Errors = result.errors
    .filter(c => customerMap.get(c.name)?.customer_type === '개인')
    .map(c => ({ name: c.name, reason: (c as { reason?: string }).reason || '등록 오류' }))

  // 법인 고객 결과
  const 법인Created = result.created
    .map(c => customerMap.get(c.name))
    .filter((c): c is BulkCustomerInput => c !== undefined && c.customer_type === '법인')
    .map(c => ({ name: c.name, mobile_phone: c.mobile_phone, address: c.address }))

  const 법인Updated = result.updated
    .filter(c => customerMap.get(c.name)?.customer_type === '법인')
    .map(c => {
      const input = customerMap.get(c.name)
      return { name: c.name, mobile_phone: input?.mobile_phone, address: input?.address, changes: c.changes || [] }
    })

  const 법인Skipped = result.skipped
    .filter(c => customerMap.get(c.name)?.customer_type === '법인')
    .map(c => ({ name: c.name, reason: (c as { reason?: string }).reason || '변경사항 없음' }))
  const 법인Errors = result.errors
    .filter(c => customerMap.get(c.name)?.customer_type === '법인')
    .map(c => ({ name: c.name, reason: (c as { reason?: string }).reason || '등록 오류' }))

  return {
    개인고객: { created: 개인Created, updated: 개인Updated, skipped: 개인Skipped, errors: 개인Errors },
    법인고객: { created: 법인Created, updated: 법인Updated, skipped: 법인Skipped, errors: 법인Errors }
  }
}

// sessionStorage에 저장할 상태 타입
interface PersistedState {
  fileName: string | null
  sheets: SheetData[]
  activeSheetIndex: number
  // 시트별 검증 컬럼 (Map<sheetName, colIndices[]> → 배열로 직렬화)
  validatingColumnsBySheet: Array<[string, number[]]>
  validatedColumnsHistoryBySheet: Array<[string, number[]]>
  // 시트별 검증 상태 (Map → 배열로 직렬화)
  sheetValidationStatus: Array<[string, SheetValidationStatus]>
  sheetIssueCount: Array<[string, number]>
  // 등록 결과
  importResult: {
    개인고객: { total: number; success: number }
    법인고객: { total: number; success: number }
    계약: { total: number; success: number }
  } | null
  // 포맷 준수 검사 결과
  formatCompliance: FormatComplianceResult | null
  // 액션 로그
  actionLog: string | null
  // P2-1: 상품명 매칭 결과 (Map → 배열로 직렬화)
  productMatchResult?: SerializedProductMatchResult | null
  productNameColumnIndex?: number | null
}

// sessionStorage에서 상태 로드
function loadPersistedState(): PersistedState | null {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    if (!saved) return null
    return JSON.parse(saved) as PersistedState
  } catch {
    return null
  }
}

// sessionStorage에 상태 저장
function savePersistedState(state: PersistedState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 저장 실패 시 무시 (quota 초과 등)
  }
}

// sessionStorage에서 상태 삭제
function clearPersistedState(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // 삭제 실패 시 무시
  }
}

export function ExcelRefiner() {
  // 🍎 애플 스타일 알림/확인 모달
  const { showAlert, showConfirm } = useAppleConfirm()

  // 로그인 사용자 정보
  const { user } = useAuthStore()

  // 파일 상태
  const [fileName, setFileName] = useState<string | null>(null)
  const [sheets, setSheets] = useState<SheetData[]>([])
  const [activeSheetIndex, setActiveSheetIndex] = useState(0)

  // 선택 상태 (삭제 모드용)
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())

  // 현재 클릭한 행 (일반 모드에서 행 번호 표시용)
  const [focusedRow, setFocusedRow] = useState<number | null>(null)

  // 선택된 컬럼 (컬럼 삭제용) - dataIndex 기준
  const [selectedColumn, setSelectedColumn] = useState<number | null>(null)

  // 드래그 상태
  const [isDragging, setIsDragging] = useState(false)

  // 양식 가이드 탭 상태
  const [formatGuideTab, setFormatGuideTab] = useState<'개인고객' | '법인고객' | '계약'>('개인고객')

  // 시트별 검증 대상 컬럼 (Map<sheetName, Set<colIndex>>)
  const [validatingColumnsBySheet, setValidatingColumnsBySheet] = useState<Map<string, Set<number>>>(new Map())

  // 검증 진행 중인 컬럼 (클릭 직후 ~ 검증 완료 전)
  const [validatingInProgress, setValidatingInProgress] = useState<Set<number>>(new Set())

  // 시트별 검증 완료 이력 (Map<sheetName, Set<colIndex>>)
  const [validatedColumnsHistoryBySheet, setValidatedColumnsHistoryBySheet] = useState<Map<string, Set<number>>>(new Map())

  // 정렬 상태
  const [sortColumn, setSortColumn] = useState<number | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // 마지막으로 클릭된 컬럼 (검증 클릭)
  const [lastClickedColumn, setLastClickedColumn] = useState<number | null>(null)

  // 상품명 검증 결과 (행 인덱스 → ObjectId 매칭)
  const [productMatchResult, setProductMatchResult] = useState<ProductMatchResult | null>(null)
  const [productNameColumnIndex, setProductNameColumnIndex] = useState<number | null>(null)

  // 고객명 DB 검증 결과 (행 인덱스 → 검증 결과)
  const [customerNameValidationResult, setCustomerNameValidationResult] = useState<CustomerNameValidationResult | null>(null)
  const [customerNameColumnIndex, setCustomerNameColumnIndex] = useState<number | null>(null)

  // 상품명 상태 필터 (범례 클릭 시 해당 상태 행을 맨 위로)
  const [productStatusFilter, setProductStatusFilter] = useState<'original' | 'unmatched' | null>(null)

  // 삭제 모드 상태
  const [isDeleteMode, setIsDeleteMode] = useState(false)

  // 액션 로그 메시지 (일시적으로 표시)
  const [actionLog, setActionLog] = useState<string | null>(null)

  // 상품 정보 뷰어 모달 상태
  const [viewingProduct, setViewingProduct] = useState<InsuranceProduct | null>(null)

  // 상품 검색 모달 상태
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false)
  const [productSearchKeyword, setProductSearchKeyword] = useState('')
  const [productSearchRowIndex, setProductSearchRowIndex] = useState<number | null>(null)

  // 셀 편집 상태
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; colIndex: number; value: string } | null>(null)

  // 계약 가져오기 진행 상태
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; message: string } | null>(null)

  // 포맷 준수 검사 결과 (파일 로드 즉시 표시)
  const [formatCompliance, setFormatCompliance] = useState<FormatComplianceResult | null>(null)

  // 일괄등록 결과 상태 (등록 완료 후 표시용)
  const [importResult, setImportResult] = useState<{
    개인고객: { total: number; success: number }
    법인고객: { total: number; success: number }
    계약: { total: number; success: number }
  } | null>(null)

  // 일괄등록 상세 결과 (모달 표시용) - 모든 상세 정보 포함
  const [importResultDetail, setImportResultDetail] = useState<{
    isOpen: boolean
    summary: string
    activeTab: '개인고객' | '법인고객' | '계약'
    hideSkipped: boolean
    개인고객: {
      created: Array<{ name: string; mobile_phone?: string | undefined; address?: string | undefined; gender?: string | undefined; birth_date?: string | undefined }>
      updated: Array<{ name: string; mobile_phone?: string | undefined; address?: string | undefined; gender?: string | undefined; birth_date?: string | undefined; changes: string[] }>
      skipped: Array<{ name: string; reason: string }>
      errors: Array<{ name: string; reason: string }>
    }
    법인고객: {
      created: Array<{ name: string; mobile_phone?: string | undefined; address?: string | undefined }>
      updated: Array<{ name: string; mobile_phone?: string | undefined; address?: string | undefined; changes: string[] }>
      skipped: Array<{ name: string; reason: string }>
      errors: Array<{ name: string; reason: string }>
    }
    계약: {
      created: Array<{
        customer_name: string
        product_name: string
        policy_number: string
        contract_date?: string | undefined
        premium?: number | undefined
        payment_day?: number | undefined
        payment_cycle?: string | undefined
        payment_period?: string | undefined
        insured_person?: string | undefined
        payment_status?: string | undefined
      }>
      updated: Array<{
        customer_name: string
        product_name: string
        policy_number: string
        contract_date?: string | undefined
        premium?: number | undefined
        payment_day?: number | undefined
        payment_cycle?: string | undefined
        payment_period?: string | undefined
        insured_person?: string | undefined
        payment_status?: string | undefined
        changes: string[]
      }>
      skipped: Array<{ customer_name: string; policy_number: string; reason: string }>
      errors: Array<{ customer_name: string; policy_number: string; reason: string }>
    }
  }>({
    isOpen: false,
    summary: '',
    activeTab: '개인고객',
    hideSkipped: true,
    개인고객: { created: [], updated: [], skipped: [], errors: [] },
    법인고객: { created: [], updated: [], skipped: [], errors: [] },
    계약: { created: [], updated: [], skipped: [], errors: [] }
  })

  // 일괄등록 확인 모달 상태
  const [importConfirmModal, setImportConfirmModal] = useState<{
    isOpen: boolean
    customerCount: number
    customerNames: string[]
    customers: BulkCustomerInput[]  // 고객 전체 정보 (bulkImportCustomers용)
    isCustomerSheet: boolean        // 고객 시트 여부
    개인고객Count: number           // 개인고객 수
    법인고객Count: number           // 법인고객 수
    계약Count: number               // 계약 수
  }>({ isOpen: false, customerCount: 0, customerNames: [], customers: [], isCustomerSheet: false, 개인고객Count: 0, 법인고객Count: 0, 계약Count: 0 })

  // 고객명-연락처 매핑 (계약 가져오기 시 사용)
  const [customerPhoneMap, setCustomerPhoneMap] = useState<Map<string, string>>(new Map())

  // === 시트별 검증 상태 (새 UX 플로우) ===
  const [sheetValidationStatus, setSheetValidationStatus] = useState<Map<string, SheetValidationStatus>>(new Map())
  const [sheetIssueCount, setSheetIssueCount] = useState<Map<string, number>>(new Map())
  const [isValidatingAll, setIsValidatingAll] = useState(false)

  // === 개인/법인 동명이인 모달 상태 ===
  type DuplicateCustomerInfo = {
    name: string
    contact: string
    address: string
    rowIndex: number
  }
  type DuplicateNameModalState = {
    isOpen: boolean
    duplicateName: string
    individualCustomers: DuplicateCustomerInfo[]
    corporateCustomers: DuplicateCustomerInfo[]
    allDuplicateNames: string[]  // 전체 동명이인 목록
    currentIndex: number         // 현재 처리 중인 인덱스
  }
  const [duplicateNameModal, setDuplicateNameModal] = useState<DuplicateNameModalState>({
    isOpen: false,
    duplicateName: '',
    individualCustomers: [],
    corporateCustomers: [],
    allDuplicateNames: [],
    currentIndex: 0
  })
  // 이름 변경 편집 상태
  const [editingCustomerName, setEditingCustomerName] = useState<{
    type: 'individual' | 'corporate'
    rowIndex: number
    newName: string
  } | null>(null)


  // 초기화 완료 여부 (sessionStorage 로드 후 true)
  const isInitialized = useRef(false)

  // sessionStorage에서 상태 복원 (마운트 시 1회)
  useEffect(() => {
    const saved = loadPersistedState()
    if (saved) {
      setFileName(saved.fileName)
      setSheets(saved.sheets)
      setActiveSheetIndex(saved.activeSheetIndex)
      // 시트별 검증 컬럼 복원 (Array<[string, number[]]> → Map<string, Set<number>>)
      if (saved.validatingColumnsBySheet) {
        const map = new Map<string, Set<number>>()
        for (const [sheetName, cols] of saved.validatingColumnsBySheet) {
          map.set(sheetName, new Set(cols))
        }
        setValidatingColumnsBySheet(map)
      }
      if (saved.validatedColumnsHistoryBySheet) {
        const map = new Map<string, Set<number>>()
        for (const [sheetName, cols] of saved.validatedColumnsHistoryBySheet) {
          map.set(sheetName, new Set(cols))
        }
        setValidatedColumnsHistoryBySheet(map)
      }
      // 시트별 검증 상태 복원
      if (saved.sheetValidationStatus) {
        setSheetValidationStatus(new Map(saved.sheetValidationStatus))
      }
      if (saved.sheetIssueCount) {
        setSheetIssueCount(new Map(saved.sheetIssueCount))
      }
      if (saved.importResult) {
        setImportResult(saved.importResult)
      }
      // 포맷 준수 검사 결과 복원
      if (saved.formatCompliance) {
        setFormatCompliance(saved.formatCompliance)
      }
      // 액션 로그 복원
      if (saved.actionLog) {
        setActionLog(saved.actionLog)
      }
      // P2-1: productMatchResult 복원 (직렬화된 Map 역직렬화)
      if (saved.productMatchResult) {
        setProductMatchResult(deserializeProductMatchResult(saved.productMatchResult))
        if (saved.productNameColumnIndex !== undefined) {
          setProductNameColumnIndex(saved.productNameColumnIndex)
        }
      }
    }
    isInitialized.current = true
  }, [])

  // 상태 변경 시 sessionStorage에 저장
  useEffect(() => {
    // 초기화 전에는 저장하지 않음 (로드 중 덮어쓰기 방지)
    if (!isInitialized.current) return

    // 파일이 없으면 저장할 것도 없음
    if (!fileName || sheets.length === 0) {
      clearPersistedState()
      return
    }

    // Map<string, Set<number>> → Array<[string, number[]]>로 직렬화
    const validatingBySheetArr: Array<[string, number[]]> = []
    validatingColumnsBySheet.forEach((cols, sheetName) => {
      validatingBySheetArr.push([sheetName, Array.from(cols)])
    })
    const validatedHistoryBySheetArr: Array<[string, number[]]> = []
    validatedColumnsHistoryBySheet.forEach((cols, sheetName) => {
      validatedHistoryBySheetArr.push([sheetName, Array.from(cols)])
    })

    savePersistedState({
      fileName,
      sheets,
      activeSheetIndex,
      validatingColumnsBySheet: validatingBySheetArr,
      validatedColumnsHistoryBySheet: validatedHistoryBySheetArr,
      sheetValidationStatus: Array.from(sheetValidationStatus.entries()),
      sheetIssueCount: Array.from(sheetIssueCount.entries()),
      importResult,
      formatCompliance,
      actionLog,
      // P2-1: productMatchResult 직렬화하여 저장
      productMatchResult: productMatchResult ? serializeProductMatchResult(productMatchResult) : null,
      productNameColumnIndex: productNameColumnIndex
    })
  }, [fileName, sheets, activeSheetIndex, validatingColumnsBySheet, validatedColumnsHistoryBySheet, sheetValidationStatus, sheetIssueCount, importResult, formatCompliance, actionLog, productMatchResult, productNameColumnIndex])

  // 현재 시트 데이터
  const currentSheet = sheets[activeSheetIndex] || null

  // 원본 엑셀 순서 기준 컬럼 배치 (규격 외 컬럼도 원본 위치에 표시, 누락 컬럼은 표준 순서 위치에 삽입)
  // { name: 컬럼명, dataIndex: 실제 데이터 인덱스 (-1이면 누락), isMissing: 누락 여부, isExtra: 규격 외 여부 }
  const orderedColumns = useMemo(() => {
    if (!currentSheet) return []

    const sheetName = currentSheet.name
    const standardOrder = getStandardColumnOrder(sheetName)

    // 비표준 시트는 그대로 반환
    if (!standardOrder) {
      return currentSheet.columns.map((name, index) => ({
        name,
        dataIndex: index,
        isMissing: false,
        isExtra: false
      }))
    }

    // 실제 컬럼 매핑: dataIndex -> 매칭된 표준 컬럼
    const columnToStandard = new Map<number, string>()
    const matchedStandards = new Set<string>()

    currentSheet.columns.forEach((col, index) => {
      const lowerCol = col.toLowerCase()
      for (const stdCol of standardOrder) {
        if (matchedStandards.has(stdCol)) continue
        const lowerStdCol = stdCol.toLowerCase()
        if (lowerCol.includes(lowerStdCol) || lowerStdCol.includes(lowerCol)) {
          columnToStandard.set(index, stdCol)
          matchedStandards.add(stdCol)
          break
        }
      }
    })

    // 표준 인덱스 맵
    const stdIndexMap = new Map(standardOrder.map((s, i) => [s, i]))

    // 결과 배열 생성
    const result: { name: string; dataIndex: number; isMissing: boolean; isExtra: boolean }[] = []
    const insertedMissing = new Set<string>()
    let lastStdIndex = -1

    // 원본 컬럼 순서대로 처리
    currentSheet.columns.forEach((col, index) => {
      const matchedStd = columnToStandard.get(index)

      if (matchedStd) {
        const currentStdIndex = stdIndexMap.get(matchedStd)!

        // 이전 표준 컬럼과 현재 표준 컬럼 사이에 누락 컬럼 삽입
        standardOrder.forEach(stdCol => {
          if (matchedStandards.has(stdCol)) return // 이미 매칭된 표준 컬럼은 건너뜀
          if (insertedMissing.has(stdCol)) return // 이미 삽입된 누락 컬럼은 건너뜀

          const missingIdx = stdIndexMap.get(stdCol)!
          if (missingIdx > lastStdIndex && missingIdx < currentStdIndex) {
            result.push({
              name: stdCol,
              dataIndex: -1,
              isMissing: true,
              isExtra: false
            })
            insertedMissing.add(stdCol)
          }
        })

        lastStdIndex = currentStdIndex
      }

      result.push({
        name: col,
        dataIndex: index,
        isMissing: false,
        isExtra: !matchedStd
      })
    })

    // 마지막에 남은 누락 컬럼 추가
    standardOrder.forEach(stdCol => {
      if (matchedStandards.has(stdCol)) return
      if (insertedMissing.has(stdCol)) return

      result.push({
        name: stdCol,
        dataIndex: -1,
        isMissing: true,
        isExtra: false
      })
    })

    return result
  }, [currentSheet])

  // 현재 시트의 검증 컬럼 (파생 상태)
  const validatingColumns = useMemo(() => {
    const sheetName = currentSheet?.name
    if (!sheetName) return new Set<number>()
    return validatingColumnsBySheet.get(sheetName) || new Set<number>()
  }, [validatingColumnsBySheet, currentSheet?.name])

  // 현재 시트의 검증 이력 (파생 상태)
  const validatedColumnsHistory = useMemo(() => {
    const sheetName = currentSheet?.name
    if (!sheetName) return new Set<number>()
    return validatedColumnsHistoryBySheet.get(sheetName) || new Set<number>()
  }, [validatedColumnsHistoryBySheet, currentSheet?.name])

  // 시트별 검증 컬럼 업데이트 헬퍼
  const updateValidatingColumns = useCallback((sheetName: string, updater: (prev: Set<number>) => Set<number>) => {
    setValidatingColumnsBySheet(prev => {
      const next = new Map(prev)
      const existing = prev.get(sheetName) || new Set()
      next.set(sheetName, updater(existing))
      return next
    })
  }, [])

  const updateValidatedHistory = useCallback((sheetName: string, updater: (prev: Set<number>) => Set<number>) => {
    setValidatedColumnsHistoryBySheet(prev => {
      const next = new Map(prev)
      const existing = prev.get(sheetName) || new Set()
      next.set(sheetName, updater(existing))
      return next
    })
  }, [])

  // 컬럼별 검증 결과 계산
  const columnValidationResults = useMemo(() => {
    if (!currentSheet?.data || !currentSheet?.columns || validatingColumns.size === 0) {
      return new Map<number, ValidationResult>()
    }

    const results = new Map<number, ValidationResult>()
    validatingColumns.forEach(colIndex => {
      if (colIndex >= 0 && colIndex < currentSheet.columns.length) {
        const columnName = currentSheet.columns[colIndex] || ''
        results.set(colIndex, validateColumn(currentSheet.data, colIndex, columnName))
      }
    })
    return results
  }, [currentSheet?.data, currentSheet?.columns, validatingColumns])

  // 정렬된 데이터 (컬럼 정렬 → 문제 행 우선)
  const sortedDataWithIndices = useMemo(() => {
    if (!currentSheet?.data) return []

    const indexed = currentSheet.data.map((row, idx) => ({ row, originalIndex: idx }))

    // 컬럼 정렬 적용
    if (sortColumn !== null) {
      indexed.sort((a, b) => {
        // "#" 컬럼 (행 번호) 정렬
        if (sortColumn === -1) {
          return sortDirection === 'asc'
            ? a.originalIndex - b.originalIndex
            : b.originalIndex - a.originalIndex
        }

        const aVal = cellToString(a.row[sortColumn] as CellValue).toLowerCase()
        const bVal = cellToString(b.row[sortColumn] as CellValue).toLowerCase()

        // 숫자 비교 시도
        const aNum = parseFloat(aVal.replace(/,/g, ''))
        const bNum = parseFloat(bVal.replace(/,/g, ''))
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return sortDirection === 'asc' ? aNum - bNum : bNum - aNum
        }

        // 문자열 비교
        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
        return 0
      })
    }

    // 상품명 상태 필터 우선 정렬 (범례 클릭 시)
    if (productStatusFilter && productMatchResult) {
      indexed.sort((a, b) => {
        let aMatch = false
        let bMatch = false

        if (productStatusFilter === 'original') {
          // "매칭" = originalMatch + modified 모두 포함
          aMatch = productMatchResult.originalMatch.has(a.originalIndex) || productMatchResult.modified.has(a.originalIndex)
          bMatch = productMatchResult.originalMatch.has(b.originalIndex) || productMatchResult.modified.has(b.originalIndex)
        } else if (productStatusFilter === 'unmatched') {
          aMatch = productMatchResult.unmatched.includes(a.originalIndex)
          bMatch = productMatchResult.unmatched.includes(b.originalIndex)
        }

        if (aMatch && !bMatch) return -1
        if (!aMatch && bMatch) return 1
        return 0
      })
    }
    // 문제 행 우선 정렬 (마지막 클릭된 컬럼 기준, 오류 상태일 때만)
    else if (lastClickedColumn !== null) {
      // 마지막 클릭된 컬럼의 문제 행만 가져오기
      let lastClickedProblematicRows: number[] = []

      // 상품명 컬럼인 경우
      if (lastClickedColumn === productNameColumnIndex && productMatchResult) {
        // 미매칭이 있을 때만 (오류 상태)
        if (productMatchResult.unmatched.length > 0) {
          lastClickedProblematicRows = productMatchResult.unmatched
        }
      } else {
        // 일반 검증 컬럼인 경우
        const result = columnValidationResults.get(lastClickedColumn)
        if (result) {
          const hasIssues = !result.valid || result.duplicates.length > 0
          // 오류가 있을 때만 정렬
          if (hasIssues) {
            lastClickedProblematicRows = getProblematicRows(result)
          }
        }
      }

      // 오류 행이 있을 때만 정렬
      if (lastClickedProblematicRows.length > 0) {
        const problematicSet = new Set(lastClickedProblematicRows)
        indexed.sort((a, b) => {
          const aProblematic = problematicSet.has(a.originalIndex)
          const bProblematic = problematicSet.has(b.originalIndex)
          if (aProblematic && !bProblematic) return -1
          if (!aProblematic && bProblematic) return 1
          return 0
        })
      }
    }

    return indexed
  }, [currentSheet?.data, sortColumn, sortDirection, productStatusFilter, productMatchResult, lastClickedColumn, productNameColumnIndex, columnValidationResults])

  // 파일 처리
  const handleFile = useCallback(async (file: File) => {
    if (!isValidExcelFile(file)) {
      showAlert({
        title: '파일 형식 오류',
        message: '엑셀 파일(.xlsx, .xls)만 지원합니다.',
        iconType: 'warning'
      })
      return
    }

    try {
      const parsedSheets = await parseExcel(file)
      setSheets(parsedSheets)
      setFileName(file.name)
      setActiveSheetIndex(0)
      setSelectedRows(new Set())
      setValidatingColumnsBySheet(new Map())
      setValidatingInProgress(new Set())
      setValidatedColumnsHistoryBySheet(new Map())
      // 상품명 검증 상태 초기화
      setProductMatchResult(null)
      setProductNameColumnIndex(null)
      setProductStatusFilter(null)
      // 정렬 상태 초기화
      setSortColumn(null)
      setSortDirection('asc')
      // 삭제 모드 해제
      setIsDeleteMode(false)
      // 이전 import 결과 초기화 (중요: 이전 파일의 import 결과가 남아있으면 자동 import된 것처럼 보임)
      setImportResult(null)
      setIsImporting(false)
      setImportProgress(null)

      // 포맷 준수 검사 (파일 로드 즉시)
      const complianceResult = checkFormatCompliance(parsedSheets)
      setFormatCompliance(complianceResult)

      // 표준규격 위반 시 경고 모달 표시
      if (complianceResult.status === 'error') {
        showAlert({
          title: '엑셀 표준규격 위반',
          message: `이 파일은 엑셀 표준규격을 준수하지 않아 일괄등록을 진행할 수 없습니다.\n\n위반 사유: ${complianceResult.message}\n\n일괄등록을 진행하려면 엑셀 파일을 표준규격에 맞게 수정해주세요.\n\n엑셀 표준규격을 준수하는 샘플 파일은 고객·계약 일괄등록 페이지에서 다운로드 할 수 있습니다.`,
          iconType: 'error'
        })
      }

      // 액션 로그 표시
      const totalRows = parsedSheets.reduce((sum, s) => sum + s.data.length, 0)
      setActionLog(`✓ "${file.name}" 로드 완료 (${parsedSheets.length}개 시트, ${totalRows}행)`)
    } catch (error) {
      console.error('파일 파싱 오류:', error)
      showAlert({
        title: '파일 읽기 오류',
        message: '파일을 읽는 중 오류가 발생했습니다.',
        iconType: 'error'
      })
    }
  }, [showAlert])

  // 드래그앤드롭 핸들러
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  // 파일 선택
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  // 엑셀 닫기 (초기 상태로 복귀)
  const handleCloseExcel = useCallback(() => {
    setFileName(null)
    setSheets([])
    setActiveSheetIndex(0)
    setSelectedRows(new Set())
    setValidatingColumnsBySheet(new Map())
    setValidatingInProgress(new Set())
    setValidatedColumnsHistoryBySheet(new Map())
    setSortColumn(null)
    setSortDirection('asc')
    setProductMatchResult(null)
    setProductNameColumnIndex(null)
    setProductStatusFilter(null)
    setIsDeleteMode(false)
    setActionLog(null)
    setViewingProduct(null)
    setIsProductSearchOpen(false)
    setProductSearchKeyword('')
    setProductSearchRowIndex(null)
    setEditingCell(null)
    // import 상태 초기화
    setImportResult(null)
    setIsImporting(false)
    setImportProgress(null)
    // 포맷 준수 검사 초기화
    setFormatCompliance(null)
    // sessionStorage 정리
    clearPersistedState()
  }, [])

  // 시트 탭 변경 (시트별 검증 상태는 유지)
  const handleSheetChange = useCallback((index: number) => {
    setActiveSheetIndex(index)
    setSelectedRows(new Set())
    // 시트별 검증 상태는 Map에 유지되므로 초기화하지 않음
    setSortColumn(null)
    setSortDirection('asc')
    // 시트 전환 시 필터 상태 초기화 (다른 시트에 적용되지 않도록)
    setProductStatusFilter(null)
    setLastClickedColumn(null)
  }, [])

  // 컬럼 정렬
  const handleSortClick = useCallback((colIndex: number, e: React.MouseEvent) => {
    e.stopPropagation() // 검증 클릭과 분리
    if (sortColumn === colIndex) {
      // 같은 컬럼 클릭 시 방향 토글
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(colIndex)
      setSortDirection('asc')
    }
  }, [sortColumn])

  // 컬럼 헤더 클릭 - 검증 활성화 (항상 하나의 컬럼만 검증 상태 유지)
  const handleColumnClick = useCallback(async (colIndex: number, columnName: string) => {
    // 검증 진행 중이면 클릭 무시 (경쟁 상태 방지)
    if (validatingInProgress.size > 0) return

    // 검증 로직이 정의된 컬럼만 클릭 가능
    if (!columnName || !currentSheet) return
    const type = getValidationType(columnName)
    if (type === 'default') return

    const sheetName = currentSheet.name

    // 마지막으로 클릭된 컬럼 표시
    setLastClickedColumn(colIndex)
    // 범례 필터 초기화 (컬럼 클릭이 우선)
    setProductStatusFilter(null)

    // 해당 타입의 컬럼 결과만 초기화 (기존 검증 상태는 유지)
    if (type === 'productName') {
      setProductMatchResult(null)
      setProductNameColumnIndex(null)
    }
    if (type === 'customerName') {
      setCustomerNameValidationResult(null)
      setCustomerNameColumnIndex(null)
    }

    // 먼저 "검증 중" 상태 표시
    setValidatingInProgress(prev => {
      const next = new Set(prev)
      next.add(colIndex)
      return next
    })

    // 고객명 DB 검증 (개인고객/법인고객 시트에서만)
    if (type === 'customerName' && (sheetName === '개인고객' || sheetName === '법인고객')) {
      try {
        const customerType = sheetName === '개인고객' ? '개인' : '법인'
        const result = await validateCustomerNamesWithDB(currentSheet.data, colIndex, customerType)
        setCustomerNameValidationResult(result)
        setCustomerNameColumnIndex(colIndex)

        // 검증 컬럼에 추가 (현재 시트)
        updateValidatingColumns(sheetName, prev => {
          const next = new Set(prev)
          next.add(colIndex)
          return next
        })
        // 검증 완료 이력에 추가 (현재 시트, 누적)
        updateValidatedHistory(sheetName, prev => {
          const next = new Set(prev)
          next.add(colIndex)
          return next
        })
      } catch (error) {
        console.error('고객명 DB 검증 오류:', error)
        showAlert({
          title: '검증 오류',
          message: '고객명 DB 검증 중 오류가 발생했습니다.',
          iconType: 'error'
        })
      } finally {
        setValidatingInProgress(prev => {
          const next = new Set(prev)
          next.delete(colIndex)
          return next
        })
      }
      return
    }

    // 상품명 검증은 비동기로 처리
    if (type === 'productName') {
      try {
        const result = await validateProductNames(currentSheet.data, colIndex)
        setProductMatchResult(result)
        setProductNameColumnIndex(colIndex)

        // 수정된 상품명만 보험상품 관리의 상품명으로 대체 (originalMatch는 이미 정확함)
        if (result.modified.size > 0) {
          // 역방향 맵: ObjectId → 상품명
          const idToName = new Map<string, string>()
          result.productNames.forEach((id, name) => {
            idToName.set(id, name)
          })

          setSheets(prev => {
            const updated = [...prev]
            const sheet = updated[activeSheetIndex]
            if (!sheet) return prev

            const newData = [...sheet.data]

            // modified된 상품명만 정확한 상품명으로 대체
            result.modified.forEach((objectId, rowIndex) => {
              const originalProductName = idToName.get(objectId)
              if (originalProductName && newData[rowIndex]) {
                newData[rowIndex] = [...newData[rowIndex]]
                newData[rowIndex][colIndex] = originalProductName
              }
            })

            updated[activeSheetIndex] = {
              name: sheet.name,
              columns: sheet.columns,
              data: newData
            }
            return updated
          })
        }

        // 검증 컬럼에 추가 (현재 시트)
        updateValidatingColumns(sheetName, prev => {
          const next = new Set(prev)
          next.add(colIndex)
          return next
        })
        // 검증 완료 이력에 추가 (현재 시트, 누적)
        updateValidatedHistory(sheetName, prev => {
          const next = new Set(prev)
          next.add(colIndex)
          return next
        })
      } catch (error) {
        console.error('상품명 검증 오류:', error)
        showAlert({
          title: '검증 오류',
          message: '상품명 검증 중 오류가 발생했습니다.',
          iconType: 'error'
        })
      } finally {
        setValidatingInProgress(prev => {
          const next = new Set(prev)
          next.delete(colIndex)
          return next
        })
      }
      return
    }

    // 일반 검증 (동기)
    setTimeout(() => {
      updateValidatingColumns(sheetName, prev => {
        const next = new Set(prev)
        next.add(colIndex)
        return next
      })
      // 검증 완료 이력에 추가 (현재 시트, 누적)
      updateValidatedHistory(sheetName, prev => {
        const next = new Set(prev)
        next.add(colIndex)
        return next
      })
      // 검증 완료 후 "검증 중" 상태 해제
      setValidatingInProgress(prev => {
        const next = new Set(prev)
        next.delete(colIndex)
        return next
      })
    }, 100)
  }, [currentSheet, activeSheetIndex, updateValidatingColumns, updateValidatedHistory, showAlert, validatingInProgress])

  // 필수컬럼검증 (시트별로 다른 필수컬럼 적용)
  const handleValidateAllRequired = useCallback(async () => {
    if (!currentSheet || isImporting) return

    // 시트별 필수컬럼 정의
    // - 개인고객, 법인고객: 고객명만 필수
    // - 계약: 고객명, 상품명, 계약일, 증권번호 필수
    const isCustomerSheet = currentSheet.name === '개인고객' || currentSheet.name === '법인고객'
    const requiredTypes: Array<{ type: ValidationType; label: string }> = isCustomerSheet
      ? [{ type: 'customerName', label: '고객명' }]
      : [
          { type: 'customerName', label: '고객명' },
          { type: 'productName', label: '상품명' },
          { type: 'contractDate', label: '계약일' },
          { type: 'policyNumber', label: '증권번호' }
        ]

    const columnsToValidate: Array<{ colIndex: number; columnName: string; type: ValidationType; label: string }> = []

    // 각 타입별로 컬럼 찾기
    requiredTypes.forEach(({ type, label }) => {
      const colIndex = currentSheet.columns.findIndex(col => col && getValidationType(col) === type)
      if (colIndex !== -1) {
        const columnName = currentSheet.columns[colIndex] as string
        columnsToValidate.push({ colIndex, columnName, type, label })
      }
    })

    if (columnsToValidate.length === 0) {
      setActionLog('⚠️ 검증 가능한 필수 컬럼이 없습니다.')
      return
    }

    // 범례 필터 초기화
    setProductStatusFilter(null)

    // 프로그레스바 초기화
    setIsImporting(true)
    setImportProgress({ current: 0, total: columnsToValidate.length, message: '필수컬럼 검증 준비 중...' })

    // 결과 요약을 위한 변수
    const results: Array<{ label: string; hasIssues: boolean; issueCount: number }> = []

    try {
      // 순차적으로 검증 실행
      for (let i = 0; i < columnsToValidate.length; i++) {
        const { colIndex, columnName, type, label } = columnsToValidate[i]!

        // 프로그레스 업데이트
        setImportProgress({
          current: i + 1,
          total: columnsToValidate.length,
          message: `${label} 검증 중...`
        })

        // 이미 검증된 컬럼이면 건너뛰기
        if (validatingColumns.has(colIndex)) {
          // 기존 결과에서 이슈 수 가져오기
          if (type === 'productName' && productMatchResult) {
            results.push({ label, hasIssues: productMatchResult.unmatched.length > 0, issueCount: productMatchResult.unmatched.length })
          } else {
            const existingResult = columnValidationResults.get(colIndex)
            if (existingResult) {
              const issueCount = existingResult.empties.length + existingResult.duplicates.length
              results.push({ label, hasIssues: issueCount > 0, issueCount })
            }
          }
          continue
        }

        // 검증 중 상태 표시
        setValidatingInProgress(prev => {
          const next = new Set(prev)
          next.add(colIndex)
          return next
        })

      // 상품명은 비동기 검증
      if (type === 'productName') {
        try {
          const result = await validateProductNames(currentSheet.data, colIndex)
          setProductMatchResult(result)
          setProductNameColumnIndex(colIndex)

          // 수정된 상품명 대체
          if (result.modified.size > 0) {
            const idToName = new Map<string, string>()
            result.productNames.forEach((id, name) => {
              idToName.set(id, name)
            })

            setSheets(prev => {
              const updated = [...prev]
              const sheet = updated[activeSheetIndex]
              if (!sheet) return prev

              const newData = [...sheet.data]
              result.modified.forEach((objectId, rowIndex) => {
                const originalProductName = idToName.get(objectId)
                if (originalProductName && newData[rowIndex]) {
                  newData[rowIndex] = [...newData[rowIndex]]
                  newData[rowIndex][colIndex] = originalProductName
                }
              })

              updated[activeSheetIndex] = {
                name: sheet.name,
                columns: sheet.columns,
                data: newData
              }
              return updated
            })
          }

          results.push({ label, hasIssues: result.unmatched.length > 0, issueCount: result.unmatched.length })
        } catch (error) {
          console.error('상품명 검증 오류:', error)
          results.push({ label, hasIssues: true, issueCount: -1 })
        }
      } else {
        // 일반 검증 (동기)
        await new Promise(resolve => setTimeout(resolve, 50)) // UI 업데이트를 위한 짧은 대기
        const validationResult = validateColumn(currentSheet.data, colIndex, columnName)
        const issueCount = validationResult.empties.length + validationResult.duplicates.length
        results.push({ label, hasIssues: issueCount > 0, issueCount })
      }

      // 검증 완료 - 컬럼 추가 (현재 시트)
      updateValidatingColumns(currentSheet.name, prev => {
        const next = new Set(prev)
        next.add(colIndex)
        return next
      })

      // 검증 완료 이력에 추가 (현재 시트, 누적)
      updateValidatedHistory(currentSheet.name, prev => {
        const next = new Set(prev)
        next.add(colIndex)
        return next
      })

      // 검증 중 상태 해제
      setValidatingInProgress(prev => {
        const next = new Set(prev)
        next.delete(colIndex)
        return next
      })

      // 마지막으로 클릭된 컬럼 업데이트
      setLastClickedColumn(colIndex)
    }

      // 결과 요약 로그 생성
      const failedCount = results.filter(r => r.hasIssues).length
      const totalIssues = results.reduce((sum, r) => sum + (r.issueCount > 0 ? r.issueCount : 0), 0)

      const summary = results.map(r => {
        if (r.issueCount === -1) return `${r.label}(오류)`
        return r.hasIssues ? `${r.label}(${r.issueCount})` : `${r.label}(✓)`
      }).join(', ')

      if (failedCount === 0) {
        setActionLog(`✓ 필수컬럼검증 완료: ${summary}`)
      } else {
        setActionLog(`⚠️ 필수컬럼검증: ${summary} - 총 ${totalIssues}건 문제`)
      }
    } finally {
      setIsImporting(false)
      setImportProgress(null)
    }
  }, [currentSheet, activeSheetIndex, validatingColumns, productMatchResult, columnValidationResults, isImporting])

  // === 전체 시트 순차 검증 (새 UX 플로우) ===
  const handleValidateAllSheets = useCallback(async () => {
    if (!sheets.length || isImporting || isValidatingAll) return

    setIsValidatingAll(true)
    setActionLog('검증 시작...')

    // 기존 상태 초기화
    setSheetValidationStatus(new Map())
    setSheetIssueCount(new Map())
    setValidatingColumnsBySheet(new Map())
    setValidatedColumnsHistoryBySheet(new Map())
    setProductMatchResult(null)
    setProductNameColumnIndex(null)
    setProductStatusFilter(null)

    const newStatus = new Map<string, SheetValidationStatus>()
    const newIssueCount = new Map<string, number>()

    // 시트 순서: 개인고객 → 법인고객 → 계약
    const sheetOrder = ['개인고객', '법인고객', '계약']

    for (const sheetName of sheetOrder) {
      const sheetIndex = sheets.findIndex(s => s.name === sheetName)
      if (sheetIndex === -1) continue

      const sheet = sheets[sheetIndex]
      if (!sheet) continue

      // 검증 중 상태로 표시
      newStatus.set(sheetName, 'validating')
      setSheetValidationStatus(new Map(newStatus))
      setActiveSheetIndex(sheetIndex)

      // UI 업데이트를 위한 짧은 대기
      await new Promise(resolve => setTimeout(resolve, 100))

      // 시트별 필수컬럼 정의
      const isCustomerSheet = sheetName === '개인고객' || sheetName === '법인고객'
      const requiredTypes: Array<{ type: ValidationType; label: string }> = isCustomerSheet
        ? [{ type: 'customerName', label: '고객명' }]
        : [
            { type: 'customerName', label: '고객명' },
            { type: 'productName', label: '상품명' },
            { type: 'contractDate', label: '계약일' },
            { type: 'policyNumber', label: '증권번호' }
          ]

      let totalIssues = 0
      const issueDetails: string[] = []

      // 각 필수컬럼 검증
      for (const { type, label } of requiredTypes) {
        const colIndex = sheet.columns.findIndex(col => col && getValidationType(col) === type)
        if (colIndex === -1) {
          issueDetails.push(`${label} 컬럼 없음`)
          totalIssues++
          continue
        }

        const columnName = sheet.columns[colIndex] as string

        if (type === 'productName') {
          // 상품명은 비동기 검증
          try {
            const result = await validateProductNames(sheet.data, colIndex)
            setProductMatchResult(result)
            setProductNameColumnIndex(colIndex)

            // 수정된 상품명 대체
            if (result.modified.size > 0) {
              const idToName = new Map<string, string>()
              result.productNames.forEach((id, name) => {
                idToName.set(id, name)
              })

              setSheets(prev => {
                const updated = [...prev]
                const targetSheet = updated[sheetIndex]
                if (!targetSheet) return prev

                const newData = [...targetSheet.data]
                result.modified.forEach((objectId, rowIndex) => {
                  const originalProductName = idToName.get(objectId)
                  if (originalProductName && newData[rowIndex]) {
                    newData[rowIndex] = [...newData[rowIndex]]
                    newData[rowIndex][colIndex] = originalProductName
                  }
                })

                updated[sheetIndex] = {
                  name: targetSheet.name,
                  columns: targetSheet.columns,
                  data: newData
                }
                return updated
              })
            }

            if (result.unmatched.length > 0) {
              issueDetails.push(`${label} 미매칭 ${result.unmatched.length}건`)
              totalIssues += result.unmatched.length
            }

            // 검증 완료 컬럼 추가 (해당 시트)
            updateValidatingColumns(sheetName, prev => new Set([...prev, colIndex]))
            updateValidatedHistory(sheetName, prev => new Set([...prev, colIndex]))
          } catch (error) {
            console.error('상품명 검증 오류:', error)
            issueDetails.push(`${label} 검증 오류`)
            totalIssues++
          }
        } else {
          // 일반 검증 (동기)
          const validationResult = validateColumn(sheet.data, colIndex, columnName)
          const empties = validationResult.empties.length
          const duplicates = type === 'policyNumber' ? validationResult.duplicates.length : 0

          if (empties > 0) {
            issueDetails.push(`${label} 빈값 ${empties}건`)
            totalIssues += empties
          }
          if (duplicates > 0) {
            issueDetails.push(`${label} 중복 ${duplicates}건`)
            totalIssues += duplicates
          }

          // 검증 완료 컬럼 추가 (해당 시트)
          updateValidatingColumns(sheetName, prev => new Set([...prev, colIndex]))
          updateValidatedHistory(sheetName, prev => new Set([...prev, colIndex]))
        }
      }

      // 시트 검증 결과 반영
      if (totalIssues > 0) {
        newStatus.set(sheetName, 'invalid')
        newIssueCount.set(sheetName, totalIssues)
        setSheetValidationStatus(new Map(newStatus))
        setSheetIssueCount(new Map(newIssueCount))
        setActionLog(`⚠️ ${sheetName}: ${issueDetails.join(', ')}`)
        setIsValidatingAll(false)
        return // 문제 발견 시 중단
      }

      newStatus.set(sheetName, 'valid')
      setSheetValidationStatus(new Map(newStatus))

      // 법인고객 시트 검증 완료 후: 개인/법인 간 동명이인 검증
      if (sheetName === '법인고객') {
        const individualSheet = sheets.find(s => s.name === '개인고객')
        const corporateSheet = sheets.find(s => s.name === '법인고객')

        if (individualSheet && corporateSheet) {
          const findCustomerNameColIndex = (s: SheetData) =>
            s.columns.findIndex(col => col && getValidationType(col) === 'customerName')
          const findColIdx = (s: SheetData, pattern: string) =>
            s.columns.findIndex(col => col && col.includes(pattern))

          const indNameIdx = findCustomerNameColIndex(individualSheet)
          const corpNameIdx = findCustomerNameColIndex(corporateSheet)

          if (indNameIdx !== -1 && corpNameIdx !== -1) {
            // 개인고객 컬럼 인덱스
            const indContactIdx = findColIdx(individualSheet, '연락처')
            const indAddressIdx = findColIdx(individualSheet, '주소')

            // 법인고객 컬럼 인덱스
            const corpContactIdx = findColIdx(corporateSheet, '연락처')
            const corpAddressIdx = findColIdx(corporateSheet, '주소')

            // 개인고객 이름-행 매핑
            const individualNameMap = new Map<string, { contact: string; address: string; rowIndex: number }[]>()
            individualSheet.data.forEach((row, rowIndex) => {
              const name = cellToString(row[indNameIdx] as CellValue).trim()
              if (name) {
                const existing = individualNameMap.get(name) || []
                existing.push({
                  contact: indContactIdx !== -1 ? cellToString(row[indContactIdx] as CellValue).trim() : '',
                  address: indAddressIdx !== -1 ? cellToString(row[indAddressIdx] as CellValue).trim() : '',
                  rowIndex
                })
                individualNameMap.set(name, existing)
              }
            })

            // 법인고객과 겹치는 이름 찾기
            const duplicateNames: string[] = []
            corporateSheet.data.forEach(row => {
              const name = cellToString(row[corpNameIdx] as CellValue).trim()
              if (name && individualNameMap.has(name)) {
                duplicateNames.push(name)
              }
            })

            if (duplicateNames.length > 0) {
              const uniqueDuplicates = [...new Set(duplicateNames)]
              const firstName = uniqueDuplicates[0]

              // 첫 번째 동명이인에 대한 상세 정보 수집
              const individualCustomers = (individualNameMap.get(firstName) || []).map(info => ({
                name: firstName,
                contact: info.contact,
                address: info.address,
                rowIndex: info.rowIndex
              }))

              const corporateCustomers: { name: string; contact: string; address: string; rowIndex: number }[] = []
              corporateSheet.data.forEach((row, rowIndex) => {
                const name = cellToString(row[corpNameIdx] as CellValue).trim()
                if (name === firstName) {
                  corporateCustomers.push({
                    name,
                    contact: corpContactIdx !== -1 ? cellToString(row[corpContactIdx] as CellValue).trim() : '',
                    address: corpAddressIdx !== -1 ? cellToString(row[corpAddressIdx] as CellValue).trim() : '',
                    rowIndex
                  })
                }
              })

              // 검증 상태 업데이트 - 개인/법인 모두 invalid 처리
              newStatus.set('개인고객', 'invalid')
              newStatus.set('법인고객', 'invalid')
              newIssueCount.set('개인고객', uniqueDuplicates.length)
              newIssueCount.set('법인고객', uniqueDuplicates.length)
              setSheetValidationStatus(new Map(newStatus))
              setSheetIssueCount(new Map(newIssueCount))

              // 동명이인 모달 열기
              setDuplicateNameModal({
                isOpen: true,
                duplicateName: firstName,
                individualCustomers,
                corporateCustomers,
                allDuplicateNames: uniqueDuplicates,
                currentIndex: 0
              })

              setIsValidatingAll(false)
              return
            }
          }
        }
      }
    }

    // 모든 시트 검증 완료
    setIsValidatingAll(false)
    setActionLog('✓ 모든 시트 검증 완료 - 등록 가능')
  }, [sheets, isImporting, isValidatingAll])

  // === 동명이인 모달 핸들러 ===

  // 동명이인 모달 닫기
  const closeDuplicateNameModal = useCallback(() => {
    setDuplicateNameModal({
      isOpen: false,
      duplicateName: '',
      individualCustomers: [],
      corporateCustomers: [],
      allDuplicateNames: [],
      currentIndex: 0
    })
    setEditingCustomerName(null)
  }, [])

  // 동명이인: 개인고객에서 삭제
  const handleDeleteFromIndividual = useCallback((rowIndex: number) => {
    const individualSheet = sheets.find(s => s.name === '개인고객')
    if (!individualSheet) return

    const sheetIndex = sheets.findIndex(s => s.name === '개인고객')
    const newData = individualSheet.data.filter((_, idx) => idx !== rowIndex)

    // 데이터 수정 시 모든 검증 상태 초기화
    setSheetValidationStatus(new Map())
    setSheetIssueCount(new Map())
    setValidatingColumnsBySheet(new Map())
    setValidatedColumnsHistoryBySheet(new Map())
    setProductMatchResult(null)
    setProductNameColumnIndex(null)
    setImportResult(null)

    setSheets(prev => {
      const updated = [...prev]
      updated[sheetIndex] = {
        ...individualSheet,
        data: newData
      }
      return updated
    })

    // 모달에서 해당 고객 제거
    setDuplicateNameModal(prev => ({
      ...prev,
      individualCustomers: prev.individualCustomers.filter(c => c.rowIndex !== rowIndex)
    }))

    setActionLog(`⚠️ 개인고객에서 '${duplicateNameModal.duplicateName}' 삭제됨 - 재검증 필요`)
  }, [sheets, duplicateNameModal.duplicateName])

  // 동명이인: 법인고객에서 삭제
  const handleDeleteFromCorporate = useCallback((rowIndex: number) => {
    const corporateSheet = sheets.find(s => s.name === '법인고객')
    if (!corporateSheet) return

    const sheetIndex = sheets.findIndex(s => s.name === '법인고객')
    const newData = corporateSheet.data.filter((_, idx) => idx !== rowIndex)

    // 데이터 수정 시 모든 검증 상태 초기화
    setSheetValidationStatus(new Map())
    setSheetIssueCount(new Map())
    setValidatingColumnsBySheet(new Map())
    setValidatedColumnsHistoryBySheet(new Map())
    setProductMatchResult(null)
    setProductNameColumnIndex(null)
    setImportResult(null)

    setSheets(prev => {
      const updated = [...prev]
      updated[sheetIndex] = {
        ...corporateSheet,
        data: newData
      }
      return updated
    })

    // 모달에서 해당 고객 제거
    setDuplicateNameModal(prev => ({
      ...prev,
      corporateCustomers: prev.corporateCustomers.filter(c => c.rowIndex !== rowIndex)
    }))

    setActionLog(`⚠️ 법인고객에서 '${duplicateNameModal.duplicateName}' 삭제됨 - 재검증 필요`)
  }, [sheets, duplicateNameModal.duplicateName])

  // 동명이인: 이름 변경 시작
  const startEditingCustomerName = useCallback((type: 'individual' | 'corporate', rowIndex: number, currentName: string) => {
    setEditingCustomerName({
      type,
      rowIndex,
      newName: currentName
    })
  }, [])

  // 동명이인: 이름 변경 저장
  const saveCustomerNameChange = useCallback(() => {
    if (!editingCustomerName) return

    const { type, rowIndex, newName } = editingCustomerName
    const trimmedName = newName.trim()

    if (!trimmedName) {
      setActionLog('⚠️ 고객명을 입력해주세요')
      return
    }

    if (trimmedName === duplicateNameModal.duplicateName) {
      setActionLog('⚠️ 기존 이름과 동일합니다')
      return
    }

    const sheetName = type === 'individual' ? '개인고객' : '법인고객'
    const sheet = sheets.find(s => s.name === sheetName)
    if (!sheet) return

    // 고객명 컬럼 인덱스 찾기
    const nameColIdx = sheet.columns.findIndex(col => col && getValidationType(col) === 'customerName')
    if (nameColIdx === -1) return

    const sheetIndex = sheets.findIndex(s => s.name === sheetName)

    // 데이터 수정 시 모든 검증 상태 초기화
    setSheetValidationStatus(new Map())
    setSheetIssueCount(new Map())
    setValidatingColumnsBySheet(new Map())
    setValidatedColumnsHistoryBySheet(new Map())
    setProductMatchResult(null)
    setProductNameColumnIndex(null)
    setImportResult(null)

    setSheets(prev => {
      const updated = [...prev]
      const newData = [...sheet.data]
      newData[rowIndex] = [...newData[rowIndex]]
      newData[rowIndex][nameColIdx] = trimmedName
      updated[sheetIndex] = {
        ...sheet,
        data: newData
      }
      return updated
    })

    // 모달에서 해당 고객 제거 (이름이 변경되었으므로 더 이상 동명이인 아님)
    if (type === 'individual') {
      setDuplicateNameModal(prev => ({
        ...prev,
        individualCustomers: prev.individualCustomers.filter(c => c.rowIndex !== rowIndex)
      }))
    } else {
      setDuplicateNameModal(prev => ({
        ...prev,
        corporateCustomers: prev.corporateCustomers.filter(c => c.rowIndex !== rowIndex)
      }))
    }

    setEditingCustomerName(null)
    setActionLog(`⚠️ ${sheetName}의 고객명이 '${trimmedName}'(으)로 변경됨 - 재검증 필요`)
  }, [editingCustomerName, duplicateNameModal.duplicateName, sheets])

  // 동명이인: 다음 동명이인으로 이동
  const goToNextDuplicateName = useCallback(() => {
    const { allDuplicateNames, currentIndex } = duplicateNameModal
    if (currentIndex >= allDuplicateNames.length - 1) {
      // 마지막 동명이인이면 모달 닫고 재검증
      closeDuplicateNameModal()
      setActionLog('동명이인 처리 완료 - 검증을 다시 실행해주세요')
      return
    }

    const nextIndex = currentIndex + 1
    const nextName = allDuplicateNames[nextIndex]

    // 다음 동명이인 정보 수집
    const individualSheet = sheets.find(s => s.name === '개인고객')
    const corporateSheet = sheets.find(s => s.name === '법인고객')
    if (!individualSheet || !corporateSheet) return

    const findCustomerNameColIndex = (s: SheetData) =>
      s.columns.findIndex(col => col && getValidationType(col) === 'customerName')
    const findColIdx = (s: SheetData, pattern: string) =>
      s.columns.findIndex(col => col && col.includes(pattern))

    const indNameIdx = findCustomerNameColIndex(individualSheet)
    const corpNameIdx = findCustomerNameColIndex(corporateSheet)

    const indContactIdx = findColIdx(individualSheet, '연락처')
    const indAddressIdx = findColIdx(individualSheet, '주소')
    const corpContactIdx = findColIdx(corporateSheet, '연락처')
    const corpAddressIdx = findColIdx(corporateSheet, '주소')

    const individualCustomers: typeof duplicateNameModal.individualCustomers = []
    individualSheet.data.forEach((row, rowIndex) => {
      const name = cellToString(row[indNameIdx] as CellValue).trim()
      if (name === nextName) {
        individualCustomers.push({
          name,
          contact: indContactIdx !== -1 ? cellToString(row[indContactIdx] as CellValue).trim() : '',
          address: indAddressIdx !== -1 ? cellToString(row[indAddressIdx] as CellValue).trim() : '',
          rowIndex
        })
      }
    })

    const corporateCustomers: typeof duplicateNameModal.corporateCustomers = []
    corporateSheet.data.forEach((row, rowIndex) => {
      const name = cellToString(row[corpNameIdx] as CellValue).trim()
      if (name === nextName) {
        corporateCustomers.push({
          name,
          contact: corpContactIdx !== -1 ? cellToString(row[corpContactIdx] as CellValue).trim() : '',
          address: corpAddressIdx !== -1 ? cellToString(row[corpAddressIdx] as CellValue).trim() : '',
          rowIndex
        })
      }
    })

    setDuplicateNameModal(prev => ({
      ...prev,
      duplicateName: nextName,
      individualCustomers,
      corporateCustomers,
      currentIndex: nextIndex
    }))
    setEditingCustomerName(null)
  }, [duplicateNameModal, sheets, closeDuplicateNameModal])

  // 동명이인 해결 완료 확인 (양쪽 중 하나가 비면 해결된 것)
  const isDuplicateResolved = duplicateNameModal.individualCustomers.length === 0 || duplicateNameModal.corporateCustomers.length === 0

  // 삭제 모드 토글
  const handleToggleDeleteMode = useCallback(() => {
    if (isDeleteMode) {
      setSelectedRows(new Set())
    }
    setIsDeleteMode(!isDeleteMode)
  }, [isDeleteMode])

  // 삭제 모드에서 행 선택/해제
  const handleDeleteSelect = useCallback((rowIndex: number) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev)
      if (newSet.has(rowIndex)) {
        newSet.delete(rowIndex)
      } else {
        newSet.add(rowIndex)
      }
      return newSet
    })
  }, [])

  // 전체 선택/해제 (삭제 모드)
  const handleSelectAll = useCallback(() => {
    if (!currentSheet) return
    if (selectedRows.size === sortedDataWithIndices.length) {
      setSelectedRows(new Set())
    } else {
      const allIndices = sortedDataWithIndices.map(item => item.originalIndex)
      setSelectedRows(new Set(allIndices))
    }
  }, [currentSheet, sortedDataWithIndices, selectedRows.size])

  // 선택 해제
  const handleClearSelection = useCallback(() => {
    setSelectedRows(new Set())
  }, [])

  // 선택 행 삭제 (AppleConfirmModal 사용)
  const handleDeleteSelected = useCallback(async () => {
    if (selectedRows.size === 0 || !currentSheet) return

    const selectedIndices = Array.from(selectedRows).sort((a, b) => a - b)
    const beforeCount = currentSheet.data.length

    // AppleConfirmModal로 삭제 확인
    const confirmed = await showConfirm({
      title: '행 삭제',
      message: `선택한 ${selectedRows.size}개의 행을 삭제하시겠습니까?`,
      confirmText: '삭제',
      confirmStyle: 'destructive',
      cancelText: '취소'
    })
    if (!confirmed) return

    // 데이터 수정 시 모든 검증 상태 초기화
    setSheetValidationStatus(new Map())
    setSheetIssueCount(new Map())
    setValidatingColumnsBySheet(new Map())
    setValidatedColumnsHistoryBySheet(new Map())
    setProductMatchResult(null)
    setProductNameColumnIndex(null)
    setImportResult(null)

    const newData = currentSheet.data.filter((_, index) => !selectedRows.has(index))
    const afterCount = newData.length

    setSheets(prev => {
      const updated = [...prev]
      const sheet = updated[activeSheetIndex]
      if (!sheet) return prev
      updated[activeSheetIndex] = {
        name: sheet.name,
        columns: sheet.columns,
        data: newData
      }
      return updated
    })

    // 삭제 후 상태 초기화
    setSelectedRows(new Set())
    setIsDeleteMode(false)

    // 액션 로그 표시
    setActionLog(`⚠️ ${selectedRows.size}개 행 삭제 (${beforeCount}행 → ${afterCount}행) - 재검증 필요`)
  }, [selectedRows, currentSheet, activeSheetIndex, showConfirm])

  // 컬럼 선택 (헤더 클릭 시) - 표준규격 외 컬럼만 선택 가능
  const handleSelectColumn = useCallback((dataIndex: number) => {
    if (!currentSheet) return

    // 표준 컬럼인지 확인
    const columnName = currentSheet.columns[dataIndex]
    const standardColumns = getStandardColumnOrder(currentSheet.name) || []
    const isStandardColumn = standardColumns.includes(columnName)

    // 표준 컬럼은 선택하지 않음 (정렬만 가능)
    if (isStandardColumn) {
      setSelectedColumn(null)
      return
    }

    // 같은 컬럼 클릭 시 선택 해제
    if (selectedColumn === dataIndex) {
      setSelectedColumn(null)
    } else {
      setSelectedColumn(dataIndex)
    }
  }, [selectedColumn, currentSheet])

  // 선택된 컬럼 삭제
  const handleDeleteColumn = useCallback(async () => {
    if (selectedColumn === null || !currentSheet) return

    // 선택된 컬럼명 찾기
    const columnName = currentSheet.columns[selectedColumn] || `컬럼 ${selectedColumn + 1}`

    // 삭제 확인
    const confirmed = await showConfirm({
      title: '컬럼 삭제',
      message: `"${columnName}" 컬럼을 삭제하시겠습니까?\n모든 행에서 해당 컬럼 데이터가 삭제됩니다.`,
      confirmText: '삭제',
      confirmStyle: 'destructive',
      cancelText: '취소'
    })

    if (!confirmed) return

    // 새로운 sheets 계산
    const newSheets = sheets.map((sheet, idx) => {
      if (idx !== activeSheetIndex) return sheet

      // 컬럼 헤더에서 삭제
      const newColumns = sheet.columns.filter((_, colIdx) => colIdx !== selectedColumn)

      // 각 행에서 해당 컬럼 데이터 삭제
      const newData = sheet.data.map(row => row.filter((_, colIdx) => colIdx !== selectedColumn))

      return {
        ...sheet,
        columns: newColumns,
        data: newData
      }
    })

    // 컬럼 삭제 실행
    setSheets(newSheets)

    // 표준규격 준수 재검증
    const complianceResult = checkFormatCompliance(newSheets)
    setFormatCompliance(complianceResult)

    // 상태 초기화
    setSelectedColumn(null)

    // 액션 로그 표시
    setActionLog(`⚠️ "${columnName}" 컬럼 삭제됨 - 표준규격 재검증 완료`)
  }, [selectedColumn, currentSheet, activeSheetIndex, sheets, showConfirm])

  // 정제된 파일 저장
  const handleSaveRefined = useCallback(() => {
    if (sheets.length === 0 || !fileName) return

    const refinedFileName = getRefinedFileName(fileName)
    exportExcel(sheets, refinedFileName)

    // 액션 로그 표시
    setActionLog(`✓ "${refinedFileName}" 저장 완료`)
  }, [sheets, fileName])

  // 매칭된 상품명 우클릭 - MongoDB Document 모달 열기
  const handleMatchedProductClick = useCallback((objectId: string) => {
    if (!productMatchResult?.allProducts) return
    const product = productMatchResult.allProducts.get(objectId)
    if (product) {
      setViewingProduct(product)
    }
  }, [productMatchResult])

  // 미매칭 상품명 더블클릭 - 검색 모달 열기
  const handleUnmatchedProductClick = useCallback((rowIndex: number, currentProductName: string) => {
    setProductSearchKeyword(currentProductName)
    setProductSearchRowIndex(rowIndex)
    setIsProductSearchOpen(true)
  }, [])

  // 상품 선택 시 데이터 업데이트
  const handleProductSelect = useCallback((productName: string, productId: string, applyToAll: boolean) => {
    if (productSearchRowIndex === null || productNameColumnIndex === null || !currentSheet) return

    // 클릭한 셀의 원래 상품명 가져오기
    const rowData = currentSheet.data[productSearchRowIndex]
    if (!rowData) return
    const originalProductName = cellToString(rowData[productNameColumnIndex] as CellValue)

    // applyToAll이 true면 동일한 상품명을 가진 모든 행 찾기
    const rowsToUpdate: number[] = applyToAll
      ? currentSheet.data
          .map((row, idx) => ({ idx, value: cellToString(row[productNameColumnIndex] as CellValue) }))
          .filter(item => item.value === originalProductName)
          .map(item => item.idx)
      : [productSearchRowIndex]

    // 데이터 수정 시 모든 검증 상태 초기화
    setSheetValidationStatus(new Map())
    setSheetIssueCount(new Map())
    setValidatingColumnsBySheet(new Map())
    setValidatedColumnsHistoryBySheet(new Map())
    setProductMatchResult(null)
    setProductNameColumnIndex(null)
    setImportResult(null)

    // 데이터 업데이트
    setSheets(prev => {
      const updated = [...prev]
      const sheet = updated[activeSheetIndex]
      if (!sheet) return prev
      const newData = [...sheet.data]
      rowsToUpdate.forEach(rowIdx => {
        if (newData[rowIdx]) {
          newData[rowIdx] = [...newData[rowIdx]]
          newData[rowIdx][productNameColumnIndex] = productName
        }
      })
      updated[activeSheetIndex] = {
        name: sheet.name,
        columns: sheet.columns,
        data: newData
      }
      return updated
    })

    // 로그 메시지 표시
    setActionLog(`⚠️ "${originalProductName}" → "${productName}" (${rowsToUpdate.length}개 행) - 재검증 필요`)

    // 모달 닫기
    setIsProductSearchOpen(false)
    setProductSearchRowIndex(null)
  }, [productSearchRowIndex, productNameColumnIndex, activeSheetIndex, currentSheet])

  // 셀 더블클릭 - 편집 모드 진입 (모든 셀 편집 가능)
  const handleCellDoubleClick = useCallback((rowIndex: number, colIndex: number, value: string) => {
    setEditingCell({ rowIndex, colIndex, value })
  }, [])

  // 셀 편집 완료 - 저장
  const handleCellEditSave = useCallback(() => {
    if (!editingCell || !currentSheet) return

    const { rowIndex, colIndex, value } = editingCell
    const rowData = currentSheet.data[rowIndex]
    if (!rowData) {
      setEditingCell(null)
      return
    }
    const oldValue = cellToString(rowData[colIndex] as CellValue)

    // 값이 변경되었을 때만 업데이트
    if (value !== oldValue) {
      // 어떤 셀이든 수정되면 모든 검증 상태 초기화 (재검증 필요)
      setSheetValidationStatus(new Map())
      setSheetIssueCount(new Map())
      setValidatingColumnsBySheet(new Map())
      setValidatedColumnsHistoryBySheet(new Map())
      setProductMatchResult(null)
      setProductNameColumnIndex(null)
      setImportResult(null)
      setActionLog(`⚠️ 데이터 수정됨 - 재검증 필요`)

      setSheets(prev => {
        const updated = [...prev]
        const sheet = updated[activeSheetIndex]
        if (!sheet) return prev
        const newData = [...sheet.data]
        if (newData[rowIndex]) {
          newData[rowIndex] = [...newData[rowIndex]]
          newData[rowIndex][colIndex] = value
        }
        updated[activeSheetIndex] = {
          name: sheet.name,
          columns: sheet.columns,
          data: newData
        }
        return updated
      })
    }

    setEditingCell(null)
  }, [editingCell, currentSheet, activeSheetIndex])

  // 셀 편집 취소
  const handleCellEditCancel = useCallback(() => {
    setEditingCell(null)
  }, [])

  // 셀 편집 키 핸들러
  const handleCellEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCellEditSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCellEditCancel()
    }
  }, [handleCellEditSave, handleCellEditCancel])

  // 일괄등록 버튼 클릭 - 확인 모달 열기 (모든 시트에서 고객 수집)
  const handleImportContracts = useCallback(() => {
    if (!sheets.length) return

    // 모든 시트에서 고객 정보 수집
    const allCustomers: BulkCustomerInput[] = []
    const customerNamesSet = new Set<string>()
    const phoneMap = new Map<string, string>()
    let 개인고객Count = 0
    let 법인고객Count = 0

    // 헬퍼: 시트에서 컬럼 인덱스 찾기
    const findColIndex = (sheet: SheetData, pattern: string) =>
      sheet.columns.findIndex(col => col && col.includes(pattern))
    const findCustomerNameColIndex = (sheet: SheetData) =>
      sheet.columns.findIndex(col => col && getValidationType(col) === 'customerName')

    // 1. 개인고객 시트 처리
    const individualSheet = sheets.find(s => s.name === '개인고객')
    if (individualSheet) {
      const nameIdx = findCustomerNameColIndex(individualSheet)
      const contactIdx = findColIndex(individualSheet, '연락처')
      const addressIdx = findColIndex(individualSheet, '주소')
      const genderIdx = findColIndex(individualSheet, '성별')
      const birthIdx = findColIndex(individualSheet, '생년월일')

      if (nameIdx !== -1) {
        individualSheet.data.forEach(row => {
          const name = cellToString(row[nameIdx] as CellValue).trim()
          if (!name || customerNamesSet.has(name)) return
          customerNamesSet.add(name)

          const customer: BulkCustomerInput = { name, customer_type: '개인' }
          if (contactIdx !== -1) {
            const phone = cellToString(row[contactIdx] as CellValue).trim()
            if (phone) { customer.mobile_phone = phone; phoneMap.set(name, phone) }
          }
          if (addressIdx !== -1) {
            const addr = cellToString(row[addressIdx] as CellValue).trim()
            if (addr) customer.address = addr
          }
          if (genderIdx !== -1) {
            const gender = cellToString(row[genderIdx] as CellValue).trim()
            if (gender) customer.gender = gender
          }
          if (birthIdx !== -1) {
            const birth = cellToString(row[birthIdx] as CellValue).trim()
            if (birth) customer.birth_date = birth
          }
          allCustomers.push(customer)
          개인고객Count++
        })
      }
    }

    // 2. 법인고객 시트 처리
    const corporateSheet = sheets.find(s => s.name === '법인고객')
    if (corporateSheet) {
      const nameIdx = findCustomerNameColIndex(corporateSheet)
      const contactIdx = findColIndex(corporateSheet, '연락처')
      const addressIdx = findColIndex(corporateSheet, '주소')

      if (nameIdx !== -1) {
        corporateSheet.data.forEach(row => {
          const name = cellToString(row[nameIdx] as CellValue).trim()
          if (!name || customerNamesSet.has(name)) return
          customerNamesSet.add(name)

          const customer: BulkCustomerInput = { name, customer_type: '법인' }
          if (contactIdx !== -1) {
            const phone = cellToString(row[contactIdx] as CellValue).trim()
            if (phone) { customer.mobile_phone = phone; phoneMap.set(name, phone) }
          }
          if (addressIdx !== -1) {
            const addr = cellToString(row[addressIdx] as CellValue).trim()
            if (addr) customer.address = addr
          }
          allCustomers.push(customer)
          법인고객Count++
        })
      }
    }

    // 3. 계약 시트에서 추가 고객명 수집 (고객 시트에 없는 고객)
    const contractSheet = sheets.find(s => s.name === '계약')
    let 계약Count = 0
    if (contractSheet) {
      계약Count = contractSheet.data.length
      const nameIdx = findCustomerNameColIndex(contractSheet)
      const contactIdx = findColIndex(contractSheet, '연락처')

      if (nameIdx !== -1) {
        contractSheet.data.forEach(row => {
          const name = cellToString(row[nameIdx] as CellValue).trim()
          if (!name || customerNamesSet.has(name)) return
          customerNamesSet.add(name)

          // 계약 시트에만 있는 고객은 기본값으로 개인고객
          const customer: BulkCustomerInput = { name, customer_type: '개인' }
          if (contactIdx !== -1) {
            const phone = cellToString(row[contactIdx] as CellValue).trim()
            if (phone) { customer.mobile_phone = phone; phoneMap.set(name, phone) }
          }
          allCustomers.push(customer)
          개인고객Count++
        })
      }
    }

    if (allCustomers.length === 0 && 계약Count === 0) {
      showAlert({
        title: '데이터 오류',
        message: '등록할 데이터가 없습니다.',
        iconType: 'warning'
      })
      return
    }

    setCustomerPhoneMap(phoneMap)
    setImportConfirmModal({
      isOpen: true,
      customerCount: allCustomers.length,
      customerNames: allCustomers.map(c => c.name),
      customers: allCustomers,
      isCustomerSheet: false,
      개인고객Count,
      법인고객Count,
      계약Count
    })
  }, [sheets])

  // 일괄등록 확인 후 실행
  const handleConfirmImport = useCallback(async () => {
    const { customerNames, customers, isCustomerSheet, 개인고객Count, 법인고객Count, 계약Count } = importConfirmModal
    setImportConfirmModal({ isOpen: false, customerCount: 0, customerNames: [], customers: [], isCustomerSheet: false, 개인고객Count: 0, 법인고객Count: 0, 계약Count: 0 })

    if (!user?._id) {
      showAlert({
        title: '로그인 필요',
        message: '로그인이 필요합니다.',
        iconType: 'warning'
      })
      return
    }

    setIsImporting(true)

    try {
      if (isCustomerSheet) {
        // === 고객 시트: bulkImportCustomers API 사용 ===
        if (customers.length === 0) return

        setImportProgress({ current: 1, total: 1, message: `고객 등록 중 (${customers.length}명)...` })

        const rawResult = await CustomerService.bulkImportCustomers(customers)

        // API 응답 검증 및 기본값 설정
        const result = {
          createdCount: rawResult?.createdCount ?? 0,
          updatedCount: rawResult?.updatedCount ?? 0,
          skippedCount: rawResult?.skippedCount ?? 0,
          errorCount: rawResult?.errorCount ?? 0,
          created: Array.isArray(rawResult?.created) ? rawResult.created : [],
          updated: Array.isArray(rawResult?.updated) ? rawResult.updated : [],
          skipped: Array.isArray(rawResult?.skipped) ? rawResult.skipped : [],
          errors: Array.isArray(rawResult?.errors) ? rawResult.errors : []
        }

        // 결과 메시지 생성
        const hasSuccess = result.createdCount > 0 || result.updatedCount > 0
        const hasFailure = result.skippedCount > 0 || result.errorCount > 0

        let statusIcon: string
        let statusText: string
        if (hasSuccess && !hasFailure) {
          statusIcon = '✓'
          statusText = '일괄등록 완료'
        } else if (hasSuccess && hasFailure) {
          statusIcon = '⚠️'
          statusText = '일괄등록 일부 완료'
        } else {
          statusIcon = '✗'
          statusText = '일괄등록 실패'
        }

        const parts: string[] = [`${statusIcon} ${statusText}`]

        if (result.createdCount > 0) {
          parts.push(`${result.createdCount}명 생성`)
        }
        if (result.updatedCount > 0) {
          parts.push(`${result.updatedCount}명 정보 업데이트`)
        }
        if (result.skippedCount > 0) {
          parts.push(`${result.skippedCount}명 변경없음`)
        }
        if (result.errorCount > 0) {
          parts.push(`오류 ${result.errorCount}건`)
        }

        setActionLog(parts.join(' | '))

        // 결과 저장 (Wizard 표시용) - 고객 시트만 처리한 경우 (신규 생성만 성공으로 카운트)
        setImportResult({
          개인고객: { total: 개인고객Count, success: customers.length > 0 ? Math.round(result.createdCount * (개인고객Count / customers.length)) : 0 },
          법인고객: { total: 법인고객Count, success: customers.length > 0 ? Math.round(result.createdCount * (법인고객Count / customers.length)) : 0 },
          계약: { total: 0, success: 0 }
        })

        // 상세 결과 저장 (결과 상세 모달용) - P2-2: 헬퍼 함수 사용
        const partitioned = partitionBulkResultByType(result, customers)

        // 데이터가 있는 탭을 기본 선택
        const 개인Total = partitioned.개인고객.created.length + partitioned.개인고객.updated.length + partitioned.개인고객.skipped.length + partitioned.개인고객.errors.length
        const 법인Total = partitioned.법인고객.created.length + partitioned.법인고객.updated.length + partitioned.법인고객.skipped.length + partitioned.법인고객.errors.length
        let defaultTab: '개인고객' | '법인고객' | '계약' = '개인고객'
        if (개인Total > 0) defaultTab = '개인고객'
        else if (법인Total > 0) defaultTab = '법인고객'

        setImportResultDetail({
          isOpen: false,
          summary: statusText,
          activeTab: defaultTab,
          hideSkipped: true,
          ...partitioned,
          계약: { created: [], updated: [], skipped: [], errors: [] }
        })

        // 완료 이벤트
        window.dispatchEvent(new CustomEvent('customerChanged'))

      } else {
        // === 전체 등록: 고객(bulkImport) + 계약 ===
        const contractSheet = sheets.find(s => s.name === '계약')
        if (!contractSheet) {
          // 계약 시트 없으면 고객만 등록
          if (customers.length > 0) {
            setImportProgress({ current: 1, total: 1, message: `고객 등록 중 (${customers.length}명)...` })
            const rawResult = await CustomerService.bulkImportCustomers(customers)

            // API 응답 검증 및 기본값 설정
            const result = {
              createdCount: rawResult?.createdCount ?? 0,
              updatedCount: rawResult?.updatedCount ?? 0,
              skippedCount: rawResult?.skippedCount ?? 0,
              errorCount: rawResult?.errorCount ?? 0,
              created: Array.isArray(rawResult?.created) ? rawResult.created : [],
              updated: Array.isArray(rawResult?.updated) ? rawResult.updated : [],
              skipped: Array.isArray(rawResult?.skipped) ? rawResult.skipped : [],
              errors: Array.isArray(rawResult?.errors) ? rawResult.errors : []
            }

            const parts: string[] = []
            if (result.createdCount > 0) parts.push(`${result.createdCount}명 생성`)
            if (result.updatedCount > 0) parts.push(`${result.updatedCount}명 업데이트`)
            setActionLog(`✓ 고객 등록 완료: ${parts.join(', ')}`)
            setImportResult({
              개인고객: { total: 개인고객Count, success: customers.length > 0 ? Math.round(result.createdCount * (개인고객Count / customers.length)) : 0 },
              법인고객: { total: 법인고객Count, success: customers.length > 0 ? Math.round(result.createdCount * (법인고객Count / customers.length)) : 0 },
              계약: { total: 0, success: 0 }
            })

            // 상세 결과 저장 (결과 상세 모달용) - P2-2: 헬퍼 함수 사용
            const partitioned = partitionBulkResultByType(result, customers)

            // 데이터가 있는 탭을 기본 선택
            const 개인Total = partitioned.개인고객.created.length + partitioned.개인고객.updated.length + partitioned.개인고객.skipped.length + partitioned.개인고객.errors.length
            const 법인Total = partitioned.법인고객.created.length + partitioned.법인고객.updated.length + partitioned.법인고객.skipped.length + partitioned.법인고객.errors.length
            let defaultTab: '개인고객' | '법인고객' | '계약' = '개인고객'
            if (개인Total > 0) defaultTab = '개인고객'
            else if (법인Total > 0) defaultTab = '법인고객'

            // 상태 텍스트
            const hasSuccess = result.createdCount > 0 || result.updatedCount > 0
            const hasFailure = result.skippedCount > 0 || result.errorCount > 0
            let statusText = '일괄등록 완료'
            if (hasSuccess && hasFailure) statusText = '일괄등록 일부 완료'
            else if (!hasSuccess) statusText = '일괄등록 실패'

            setImportResultDetail({
              isOpen: false,
              summary: statusText,
              activeTab: defaultTab,
              hideSkipped: true,
              ...partitioned,
              계약: { created: [], updated: [], skipped: [], errors: [] }
            })

            window.dispatchEvent(new CustomEvent('customerChanged'))
          }
          return
        }

        setImportProgress({ current: 0, total: 3, message: '1/3: 고객 생성 준비 중...' })

        let customerCreatedCount = 0
        let customerSkippedCount = 0
        let customerUpdatedCount = 0
        const customerErrors: string[] = []

        // 상세 결과 저장용
        let customerBulkResult: {
          created: Array<{ name: string; _id: string }>
          updated: Array<{ name: string; _id: string; changes: string[] }>
          skipped: Array<{ name: string; reason: string }>
          errors: Array<{ name: string; reason: string }>
        } | null = null

        // 1단계: bulkImportCustomers로 고객 생성 (customer_type 반영)
        if (customers.length > 0) {
          setImportProgress({ current: 1, total: 3, message: `1/3: 고객 등록 중 (${customers.length}명)...` })
          try {
            const rawResult = await CustomerService.bulkImportCustomers(customers)

            // API 응답 검증 및 기본값 설정
            customerCreatedCount = rawResult?.createdCount ?? 0
            customerUpdatedCount = rawResult?.updatedCount ?? 0
            customerSkippedCount = rawResult?.skippedCount ?? 0
            customerBulkResult = {
              created: Array.isArray(rawResult?.created) ? rawResult.created : [],
              updated: Array.isArray(rawResult?.updated) ? rawResult.updated : [],
              skipped: Array.isArray(rawResult?.skipped) ? rawResult.skipped : [],
              errors: Array.isArray(rawResult?.errors) ? rawResult.errors : []
            }
            const errorCount = rawResult?.errorCount ?? 0
            if (errorCount > 0) {
              customerErrors.push(`${errorCount}건 오류`)
            }
          } catch (err) {
            console.error('[고객 일괄등록 실패]:', err)
            customerErrors.push(`일괄등록 오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
          }
        }

        // 2단계: 계약 데이터 추출
        setImportProgress({ current: 2, total: 3, message: '2/3: 계약 데이터 추출 중...' })

        const colIndexMap: Record<string, number> = {}
        const columnMapping: Record<string, string> = {
          '고객명': 'customer_name',
          '상품명': 'product_name',
          '계약일': 'contract_date',
          '증권번호': 'policy_number',
          '보험료': 'premium',
          '이체일': 'payment_day',
          '납입주기': 'payment_cycle',
          '납입기간': 'payment_period',
          '피보험자': 'insured_person',
          '납입상태': 'payment_status'
        }

        contractSheet.columns.forEach((colName, idx) => {
          if (!colName) return
          for (const [korName, engName] of Object.entries(columnMapping)) {
            if (colName.includes(korName)) {
              colIndexMap[engName] = idx
              break
            }
          }
        })

        if (colIndexMap['policy_number'] === undefined) {
          showAlert({
            title: '컬럼 오류',
            message: '증권번호 컬럼을 찾을 수 없습니다.',
            iconType: 'warning'
          })
          return
        }

        const contracts = contractSheet.data.map(row => {
          const getValue = (field: string): string => {
            const idx = colIndexMap[field]
            if (idx === undefined) return ''
            return cellToString(row[idx] as CellValue).trim()
          }
          const getNumberValue = (field: string): number => {
            const val = getValue(field)
            const num = parseInt(val.replace(/[^0-9]/g, ''), 10)
            return isNaN(num) ? 0 : num
          }
          return {
            customer_name: getValue('customer_name'),
            product_name: getValue('product_name'),
            contract_date: getValue('contract_date') || null,
            policy_number: getValue('policy_number'),
            premium: getNumberValue('premium'),
            payment_day: getValue('payment_day') || null,
            payment_cycle: getValue('payment_cycle') || null,
            payment_period: getValue('payment_period') || null,
            insured_person: getValue('insured_person') || null,
            payment_status: getValue('payment_status') || null
          }
        }).filter(c => c.policy_number)

        if (contracts.length === 0) {
          setActionLog(`✓ 고객 생성: ${customerCreatedCount}명 | 건너뜀: ${customerSkippedCount}명 | 계약: 0건 (증권번호 없음)`)
          return
        }

        // 3단계: 계약 등록
        setImportProgress({ current: 3, total: 3, message: `3/3: 계약 등록 중 (${contracts.length}건)...` })

        const bulkResult = await ContractService.createContractsBulk({
          agent_id: user._id,
          contracts
        })

        // API 응답 검증 및 기본값 설정
        const rawContractResult = bulkResult?.data
        const contractResult = {
          createdCount: rawContractResult?.createdCount ?? 0,
          updatedCount: rawContractResult?.updatedCount ?? 0,
          skippedCount: rawContractResult?.skippedCount ?? 0,
          errorCount: rawContractResult?.errorCount ?? 0,
          created: Array.isArray(rawContractResult?.created) ? rawContractResult.created : [],
          updated: Array.isArray(rawContractResult?.updated) ? rawContractResult.updated : [],
          skipped: Array.isArray(rawContractResult?.skipped) ? rawContractResult.skipped : [],
          errors: Array.isArray(rawContractResult?.errors) ? rawContractResult.errors : []
        }

        const contractSuccessCount = contractResult.createdCount + contractResult.updatedCount
        const totalErrors = customerErrors.length + contractResult.errorCount
        const hasSuccess = customerCreatedCount > 0 || customerUpdatedCount > 0 || contractSuccessCount > 0
        const hasFailure = customerSkippedCount > 0 || contractResult.skippedCount > 0 || totalErrors > 0

        // 모달용 상태 텍스트 (공식 상태)
        let statusText: string
        if (hasSuccess && !hasFailure) {
          statusText = '일괄등록 완료'
        } else if (hasSuccess && hasFailure) {
          statusText = '일괄등록 일부 완료'
        } else {
          statusText = '일괄등록 실패'
        }

        // 액션 로그용 간결한 메시지 (신규/수정 구분)
        const totalCreated = customerCreatedCount + contractResult.createdCount
        const totalUpdated = customerUpdatedCount + contractResult.updatedCount

        // 변경 내역 문구 생성
        const changeParts: string[] = []
        if (totalCreated > 0) changeParts.push(`신규 ${totalCreated}건`)
        if (totalUpdated > 0) changeParts.push(`업데이트 ${totalUpdated}건`)
        const changeText = changeParts.join(', ')

        let actionLogMessage: string
        if (hasSuccess && !hasFailure) {
          actionLogMessage = `✓ ${changeText} 완료`
        } else if (hasSuccess && hasFailure) {
          actionLogMessage = `⚠️ ${changeText} 완료, 일부 건너뜀`
        } else if (totalErrors > 0) {
          actionLogMessage = `✗ 등록 중 오류 발생 (${totalErrors}건)`
        } else {
          actionLogMessage = '변경사항 없음 - 이미 등록된 데이터입니다'
        }

        setActionLog(actionLogMessage)

        // 신규 등록 + 업데이트 성공률 계산
        const totalCustomers = 개인고객Count + 법인고객Count
        const customerSuccessCount = customerCreatedCount + customerUpdatedCount
        setImportResult({
          개인고객: { total: 개인고객Count, success: totalCustomers > 0 ? Math.round(customerSuccessCount * (개인고객Count / totalCustomers)) : 0 },
          법인고객: { total: 법인고객Count, success: totalCustomers > 0 ? Math.round(customerSuccessCount * (법인고객Count / totalCustomers)) : 0 },
          계약: { total: contracts.length, success: contractSuccessCount }
        })

        // 상세 결과 저장 - P2-2: 헬퍼 함수 사용
        const customerPartitioned = partitionBulkResultByType({
          created: customerBulkResult?.created || [],
          updated: customerBulkResult?.updated || [],
          skipped: customerBulkResult?.skipped || [],
          errors: customerBulkResult?.errors || []
        }, customers)

        // 계약 상세 결과 - API에서 직접 반환된 배열 사용
        const 계약Created = (contractResult.created || []).map(c => ({
          customer_name: c.customer_name || '',
          product_name: c.product_name || '',
          policy_number: c.policy_number || '',
          contract_date: c.contract_date || undefined,
          premium: c.premium || 0,
          payment_day: c.payment_day || undefined,
          payment_cycle: c.payment_cycle || undefined,
          payment_period: c.payment_period || undefined,
          insured_person: c.insured_person || undefined,
          payment_status: c.payment_status || undefined
        }))

        const 계약Updated = (contractResult.updated || []).map(c => ({
          customer_name: c.customer_name || '',
          product_name: c.product_name || '',
          policy_number: c.policy_number || '',
          contract_date: c.contract_date || undefined,
          premium: c.premium || 0,
          payment_day: c.payment_day || undefined,
          payment_cycle: c.payment_cycle || undefined,
          payment_period: c.payment_period || undefined,
          insured_person: c.insured_person || undefined,
          payment_status: c.payment_status || undefined,
          changes: c.changes || []
        }))

        const 계약Skipped = (contractResult.skipped || []).map(s => ({
          customer_name: s.customer_name || '',
          policy_number: s.policy_number || '',
          reason: s.reason || '변경사항 없음'
        }))

        const 계약Errors = (contractResult.errors || []).map(e => ({
          customer_name: e.customer_name || '',
          policy_number: e.policy_number || '',
          reason: e.reason || '등록 오류'
        }))

        // 데이터가 있는 탭을 자동 선택 (created, updated, skipped, errors 중 하나라도 있는 첫 번째 탭)
        const 개인Total = customerPartitioned.개인고객.created.length + customerPartitioned.개인고객.updated.length + customerPartitioned.개인고객.skipped.length + customerPartitioned.개인고객.errors.length
        const 법인Total = customerPartitioned.법인고객.created.length + customerPartitioned.법인고객.updated.length + customerPartitioned.법인고객.skipped.length + customerPartitioned.법인고객.errors.length
        const 계약Total = 계약Created.length + 계약Updated.length + 계약Skipped.length + 계약Errors.length

        let defaultActiveTab: '개인고객' | '법인고객' | '계약' = '개인고객'
        if (개인Total > 0) {
          defaultActiveTab = '개인고객'
        } else if (법인Total > 0) {
          defaultActiveTab = '법인고객'
        } else if (계약Total > 0) {
          defaultActiveTab = '계약'
        }

        setImportResultDetail({
          isOpen: false,
          summary: statusText,
          activeTab: defaultActiveTab,
          hideSkipped: true,
          ...customerPartitioned,
          계약: {
            created: 계약Created,
            updated: 계약Updated,
            skipped: 계약Skipped,
            errors: 계약Errors
          }
        })

        if (customerErrors.length > 0) {
          console.error('고객 생성 오류:', customerErrors)
        }

        window.dispatchEvent(new CustomEvent('customerChanged'))
        window.dispatchEvent(new CustomEvent('contractChanged'))
      }

    } catch (err) {
      console.error('일괄등록 오류:', err)

      // 에러 유형별 메시지 분류
      let errorTitle = '일괄등록 오류'
      let errorMessage = '알 수 없는 오류가 발생했습니다.'

      if (err instanceof Error) {
        const message = err.message.toLowerCase()
        if (message.includes('network') || message.includes('fetch') || message.includes('failed to fetch')) {
          errorTitle = '네트워크 오류'
          errorMessage = '서버에 연결할 수 없습니다. 네트워크 연결을 확인해주세요.'
        } else if (message.includes('401') || message.includes('unauthorized') || message.includes('token')) {
          errorTitle = '인증 오류'
          errorMessage = '로그인이 만료되었습니다. 다시 로그인해주세요.'
        } else if (message.includes('403') || message.includes('forbidden')) {
          errorTitle = '권한 오류'
          errorMessage = '이 작업을 수행할 권한이 없습니다.'
        } else if (message.includes('500') || message.includes('server')) {
          errorTitle = '서버 오류'
          errorMessage = '서버에서 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
        } else {
          errorMessage = err.message
        }
      }

      showAlert({
        title: errorTitle,
        message: errorMessage,
        iconType: 'error'
      })
      setImportResult({
        개인고객: { total: 개인고객Count, success: 0 },
        법인고객: { total: 법인고객Count, success: 0 },
        계약: { total: 계약Count, success: 0 }
      })
    } finally {
      setIsImporting(false)
      setImportProgress(null)
    }
  }, [importConfirmModal, currentSheet, user, customerPhoneMap])

  // 데이터 행 번호
  const getExcelRowNumber = (dataIndex: number) => dataIndex + 2

  // Wizard 단계 계산 (개인고객 → 법인고객 → 계약 → 등록)
  const wizardStep = useMemo(() => {
    if (!sheets.length) return null

    const sheetNames = ['개인고객', '법인고객', '계약']

    // 각 시트의 상태 확인
    const getSheetStatus = (name: string) => sheetValidationStatus.get(name) || 'pending'

    // 등록 결과 상태 계산
    let resultStatus: 'success' | 'partial' | 'error' | null = null
    if (importResult) {
      const totalItems = importResult.개인고객.total + importResult.법인고객.total + importResult.계약.total
      const successItems = importResult.개인고객.success + importResult.법인고객.success + importResult.계약.success
      if (successItems === 0 && totalItems > 0) {
        resultStatus = 'error'
      } else if (successItems === totalItems && totalItems > 0) {
        resultStatus = 'success'
      } else if (successItems > 0) {
        resultStatus = 'partial'
      }
    }

    // 모든 시트가 valid인지 확인
    const existingSheets = sheetNames.filter(name => sheets.some(s => s.name === name))
    const allValid = existingSheets.length > 0 && existingSheets.every(name => getSheetStatus(name) === 'valid')

    // Step 4: 모든 검증 완료 → 등록 단계
    if (allValid) {
      if (importResult && resultStatus) {
        // 퍼센트 계산 헬퍼
        const pct = (s: number, t: number) => t > 0 ? Math.round((s / t) * 100) : 0
        const fmt = (s: number, t: number) => `${pct(s, t)}%(${s}/${t})`

        // 결과 메시지 생성 (있는 항목만 표시)
        const parts: string[] = []
        if (importResult.개인고객.total > 0) parts.push(`개인:${fmt(importResult.개인고객.success, importResult.개인고객.total)}`)
        if (importResult.법인고객.total > 0) parts.push(`법인:${fmt(importResult.법인고객.success, importResult.법인고객.total)}`)
        if (importResult.계약.total > 0) parts.push(`계약:${fmt(importResult.계약.success, importResult.계약.total)}`)

        const message = parts.join(' ')
        return { step: 4, label: '등록결과', message, resultStatus }
      }
      return { step: 4, label: '일괄등록', message: '등록 가능', resultStatus: null }
    }

    // 시트별 단계 결정
    for (let i = 0; i < sheetNames.length; i++) {
      const sheetName = sheetNames[i] as string
      const status = getSheetStatus(sheetName)
      const step = i + 1

      if (status === 'validating') {
        return { step, label: sheetName, message: '검증 중...', resultStatus: null }
      }
      if (status === 'invalid') {
        const count = sheetIssueCount.get(sheetName) || 0
        return { step, label: sheetName, message: `${count}건 수정 필요`, resultStatus: null }
      }
      if (status === 'pending') {
        return { step, label: sheetName, message: '검증 대기', resultStatus: null }
      }
    }

    return { step: 1, label: '개인고객', message: '검증 대기', resultStatus: null }
  }, [sheets, sheetValidationStatus, sheetIssueCount, importResult])

  // 컬럼별 검증 실패 이유 생성
  const getValidationTooltip = (type: ValidationType, result: ValidationResult | null, productResult?: ProductMatchResult): string => {
    if (type === 'productName' && productResult) {
      const unmatchedCount = productResult.unmatched.length
      if (unmatchedCount === 0) return '모든 상품명이 DB에 매칭됨'
      return `${unmatchedCount}개 미매칭\n• DB에 등록되지 않은 상품명\n• 빈 값도 미매칭으로 처리됨\n→ 상품명 클릭하여 수정`
    }

    if (!result) return ''

    if (type === 'policyNumber') {
      const parts: string[] = []
      if (result.empties.length > 0) parts.push(`• 빈 값: ${result.empties.length}개`)
      if (result.duplicates.length > 0) parts.push(`• 중복: ${result.duplicates.length}개`)
      if (parts.length === 0) return '모든 증권번호 유효'
      return `${result.empties.length + result.duplicates.length}개 오류\n${parts.join('\n')}\n→ 셀을 직접 수정하세요`
    }

    if (type === 'contractDate') {
      if (result.empties.length === 0) return '모든 계약일 유효'
      return `${result.empties.length}개 오류\n• 빈 값\n• YYYY-MM-DD 형식 아님\n• 존재하지 않는 날짜 (예: 2월 30일)\n→ 셀을 직접 수정하세요`
    }

    if (type === 'customerName') {
      if (result.empties.length === 0) return '모든 고객명 유효'
      return `${result.empties.length}개 오류\n• 빈 값\n→ 셀을 직접 수정하세요`
    }

    return ''
  }

  // 컬럼 검증 배지 렌더링
  const renderColumnBadge = (colIndex: number, columnName: string) => {
    if (!columnName) return null
    const type = getValidationType(columnName)

    // 상품명 검증 결과 표시 - 매칭/미매칭 모두 컬럼 헤더에 표시
    if (type === 'productName' && productMatchResult && productNameColumnIndex === colIndex) {
      const matchedCount = productMatchResult.originalMatch.size + productMatchResult.modified.size
      const unmatchedCount = productMatchResult.unmatched.length
      const tooltip = getValidationTooltip(type, null, productMatchResult)

      return (
        <Tooltip content={tooltip}>
          <span className="excel-refiner__th-badge-group">
            <span className="excel-refiner__th-badge excel-refiner__th-badge--success">{matchedCount} 매칭</span>
            {unmatchedCount > 0 && (
              <span className="excel-refiner__th-badge excel-refiner__th-badge--error">{unmatchedCount} 미매칭</span>
            )}
          </span>
        </Tooltip>
      )
    }

    // 고객명 DB 검증 결과 표시 (개인고객/법인고객 시트)
    if (type === 'customerName' && customerNameValidationResult && customerNameColumnIndex === colIndex) {
      const { stats } = customerNameValidationResult
      const validCount = stats.new + stats.update
      const errorCount = stats.typeConflict + stats.empty
      const tooltip = `신규: ${stats.new}명\n업데이트: ${stats.update}명${errorCount > 0 ? `\n\n오류:\n• 타입 충돌: ${stats.typeConflict}명\n• 빈 값: ${stats.empty}명` : ''}`

      return (
        <Tooltip content={tooltip}>
          <span className="excel-refiner__th-badge-group">
            {validCount > 0 && (
              <span className="excel-refiner__th-badge excel-refiner__th-badge--success">{validCount} 유효</span>
            )}
            {errorCount > 0 && (
              <span className="excel-refiner__th-badge excel-refiner__th-badge--error">{errorCount} 오류</span>
            )}
          </span>
        </Tooltip>
      )
    }

    const result = columnValidationResults.get(colIndex)
    if (!result) return null

    const issueCount = result.empties.length + result.duplicates.length
    const tooltip = getValidationTooltip(type, result)

    if (result.valid && result.duplicates.length === 0) {
      return (
        <Tooltip content={tooltip || '검증 완료'}>
          <span className="excel-refiner__th-badge excel-refiner__th-badge--success">✓</span>
        </Tooltip>
      )
    } else {
      const label = type === 'customerName'
        ? `${result.empties.length}오류 ${result.duplicates.length}경고`
        : `${issueCount}`
      return (
        <Tooltip content={tooltip}>
          <span className="excel-refiner__th-badge excel-refiner__th-badge--error">{label}</span>
        </Tooltip>
      )
    }
  }

  // 상품명 셀 상태 계산 (상품명 칼럼에만 적용)
  const getProductCellStatus = (rowIndex: number): 'original' | 'modified' | 'unmatched' | null => {
    if (!productMatchResult || productNameColumnIndex === null) return null

    if (productMatchResult.originalMatch.has(rowIndex)) return 'original'
    if (productMatchResult.modified.has(rowIndex)) return 'modified'
    if (productMatchResult.unmatched.includes(rowIndex)) return 'unmatched'
    return null
  }

  // 고객명 셀 상태 계산 (고객명 칼럼에만 적용)
  const getCustomerNameCellStatus = (rowIndex: number): 'new' | 'update' | 'type_conflict' | 'empty' | null => {
    if (!customerNameValidationResult || customerNameColumnIndex === null) return null

    const item = customerNameValidationResult.results.get(rowIndex)
    if (!item) return null

    return item.status
  }

  // 행 상태 계산 (상품명 미매칭은 셀 레벨에서만 적용, 행 레벨 제외)
  const getRowValidationStatus = (rowIndex: number): 'normal' | 'empty' | 'duplicate' => {
    for (const [, result] of columnValidationResults) {
      const status = getRowStatus(rowIndex, result)
      if (status !== 'normal') return status
    }
    return 'normal'
  }

  return (
    <div className="excel-refiner">
      {/* 메인 컨텐츠 */}
      <div className="excel-refiner__main">
        {!currentSheet ? (
          /* 파일 드롭존 */
          <div
            className={`excel-refiner__dropzone ${isDragging ? 'excel-refiner__dropzone--active' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="excel-refiner__dropzone-inner">
              {/* 엑셀 표준 포맷 가이드 - 상단 중앙 배치 */}
              <div className="excel-refiner__format-guide">
                {/* 헤더: 엑셀 예시 + 다운로드 */}
                <div className="excel-refiner__format-header">
                  <span className="excel-refiner__format-title">엑셀 예시</span>
                  <Tooltip content="샘플 엑셀 다운로드">
                    <a
                      href="/일괄등록_샘플.xlsx"
                      download="일괄등록_샘플.xlsx"
                      className="excel-refiner__format-download"
                      aria-label="샘플 엑셀 다운로드"
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M8 2v8M8 10L5 7M8 10l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M3 12v1.5a.5.5 0 00.5.5h9a.5.5 0 00.5-.5V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </a>
                  </Tooltip>
                </div>

                {/* 시트 탭 */}
                <div className="excel-refiner__format-tabs">
                  <button
                    type="button"
                    className={`excel-refiner__format-tab ${formatGuideTab === '개인고객' ? 'excel-refiner__format-tab--active' : ''}`}
                    onClick={() => setFormatGuideTab('개인고객')}
                  >
                    개인고객
                  </button>
                  <button
                    type="button"
                    className={`excel-refiner__format-tab ${formatGuideTab === '법인고객' ? 'excel-refiner__format-tab--active' : ''}`}
                    onClick={() => setFormatGuideTab('법인고객')}
                  >
                    법인고객
                  </button>
                  <button
                    type="button"
                    className={`excel-refiner__format-tab ${formatGuideTab === '계약' ? 'excel-refiner__format-tab--active' : ''}`}
                    onClick={() => setFormatGuideTab('계약')}
                  >
                    계약
                  </button>
                </div>

                {/* 개인고객 시트 */}
                {formatGuideTab === '개인고객' && (
                  <div className="excel-refiner__format-table-wrapper">
                    <table className="excel-refiner__format-table">
                      <thead>
                        <tr>
                          <th className="excel-refiner__format-th excel-refiner__format-th--required">고객명</th>
                          <th className="excel-refiner__format-th">이메일</th>
                          <th className="excel-refiner__format-th">연락처</th>
                          <th className="excel-refiner__format-th">주소</th>
                          <th className="excel-refiner__format-th">성별</th>
                          <th className="excel-refiner__format-th">생년월일</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="excel-refiner__format-td">홍길동</td>
                          <td className="excel-refiner__format-td">hong@gmail.com</td>
                          <td className="excel-refiner__format-td">010-1234-5678</td>
                          <td className="excel-refiner__format-td">서울시 강남구 역삼동 123-45</td>
                          <td className="excel-refiner__format-td">남</td>
                          <td className="excel-refiner__format-td">1985-03-15</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 법인고객 시트 */}
                {formatGuideTab === '법인고객' && (
                  <div className="excel-refiner__format-table-wrapper">
                    <table className="excel-refiner__format-table">
                      <thead>
                        <tr>
                          <th className="excel-refiner__format-th excel-refiner__format-th--required">고객명</th>
                          <th className="excel-refiner__format-th">이메일</th>
                          <th className="excel-refiner__format-th">연락처</th>
                          <th className="excel-refiner__format-th">주소</th>
                          <th className="excel-refiner__format-th">사업자번호</th>
                          <th className="excel-refiner__format-th">대표자명</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="excel-refiner__format-td">(주)행복산업</td>
                          <td className="excel-refiner__format-td">info@happyind.co.kr</td>
                          <td className="excel-refiner__format-td">02-1234-5678</td>
                          <td className="excel-refiner__format-td">서울시 강남구 테헤란로 123</td>
                          <td className="excel-refiner__format-td">123-45-67890</td>
                          <td className="excel-refiner__format-td">김대표</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 계약 시트 */}
                {formatGuideTab === '계약' && (
                  <div className="excel-refiner__format-table-wrapper">
                    <table className="excel-refiner__format-table">
                      <thead>
                        <tr>
                          <th className="excel-refiner__format-th excel-refiner__format-th--required">고객명</th>
                          <th className="excel-refiner__format-th excel-refiner__format-th--required">상품명</th>
                          <th className="excel-refiner__format-th excel-refiner__format-th--required">계약일</th>
                          <th className="excel-refiner__format-th excel-refiner__format-th--required">증권번호</th>
                          <th className="excel-refiner__format-th">보험료(원)</th>
                          <th className="excel-refiner__format-th">모집/이양</th>
                          <th className="excel-refiner__format-th">이체일</th>
                          <th className="excel-refiner__format-th">납입주기</th>
                          <th className="excel-refiner__format-th">납입기간</th>
                          <th className="excel-refiner__format-th">피보험자</th>
                          <th className="excel-refiner__format-th">납입상태</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="excel-refiner__format-td">홍길동</td>
                          <td className="excel-refiner__format-td">무배당 마스터플랜 변액유니버셜종신보험</td>
                          <td className="excel-refiner__format-td">2024-01-15</td>
                          <td className="excel-refiner__format-td">1234567890</td>
                          <td className="excel-refiner__format-td excel-refiner__format-td--right">250,000</td>
                          <td className="excel-refiner__format-td">모집</td>
                          <td className="excel-refiner__format-td">15일</td>
                          <td className="excel-refiner__format-td">월납</td>
                          <td className="excel-refiner__format-td">종신</td>
                          <td className="excel-refiner__format-td">홍길동</td>
                          <td className="excel-refiner__format-td">정상</td>
                        </tr>
                        <tr>
                          <td className="excel-refiner__format-td">(주)행복산업</td>
                          <td className="excel-refiner__format-td">무배당 미리받는 변액종신보험 공감</td>
                          <td className="excel-refiner__format-td">2023-06-20</td>
                          <td className="excel-refiner__format-td">9876543210</td>
                          <td className="excel-refiner__format-td excel-refiner__format-td--right">200,000</td>
                          <td className="excel-refiner__format-td">모집</td>
                          <td className="excel-refiner__format-td">25일</td>
                          <td className="excel-refiner__format-td">월납</td>
                          <td className="excel-refiner__format-td">종신</td>
                          <td className="excel-refiner__format-td">김영희</td>
                          <td className="excel-refiner__format-td">정상</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="excel-refiner__format-legend">
                  <span className="excel-refiner__format-legend-item excel-refiner__format-legend-item--required">■ 필수 컬럼</span>
                  <span className="excel-refiner__format-legend-item">□ 선택 컬럼</span>
                </div>
              </div>

              {/* 파일 업로드 영역 - 하단 배치 */}
              <label className="excel-refiner__dropzone-content">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="excel-refiner__file-input"
                />
                {/* + 버튼 */}
                <div className="excel-refiner__plus-icon">
                  <svg width="28" height="28" viewBox="0 0 48 48" fill="none">
                    <path d="M24 10V38M10 24H38" stroke="white" strokeWidth="4" strokeLinecap="round"/>
                  </svg>
                </div>
                <span className="excel-refiner__dropzone-hint">엑셀 파일을 끌어다 놓으세요!</span>
                <span className="excel-refiner__dropzone-subhint">또는 클릭하여 엑셀 파일 선택</span>
              </label>
            </div>
          </div>
        ) : (
          /* 데이터 뷰 */
          <div className="excel-refiner__content">
            {/* 행1: 헤더바 - 파일정보 + 위자드 + 전역버튼 */}
            <div className="excel-refiner__header-bar">
              <div className="excel-refiner__header-left">
                <span className="excel-refiner__filename">{fileName}</span>
                {/* 포맷 준수 배지 + 위반 사유 */}
                {formatCompliance && (
                  <>
                    <span className={`excel-refiner__compliance-badge excel-refiner__compliance-badge--${formatCompliance.status}`}>
                      {formatCompliance.status === 'compliant' && `✓ 엑셀 표준규격 준수(${EXCEL_SPEC_VERSION})`}
                      {formatCompliance.status === 'warning' && `⚠ 엑셀 표준규격 준수(${EXCEL_SPEC_VERSION})`}
                      {formatCompliance.status === 'error' && `✕ 엑셀 표준규격 준수(${EXCEL_SPEC_VERSION})`}
                    </span>
                    {formatCompliance.status !== 'compliant' && formatCompliance.message && (
                      <span className={`excel-refiner__compliance-message excel-refiner__compliance-message--${formatCompliance.status}`}>
                        {formatCompliance.message}
                      </span>
                    )}
                  </>
                )}
                {/* 규격 외 컬럼 안내 */}
                {formatCompliance?.extraColumns && formatCompliance.extraColumns.length > 0 && (
                  <span className="excel-refiner__extra-columns-info">
                    ⓘ 규격 외 컬럼: {formatCompliance.extraColumns.join(', ')}
                  </span>
                )}
              </div>

              {/* 위자드 스텝 (중앙): 개인고객 → 법인고객 → 계약 → 등록 */}
              {wizardStep && (() => {
                // 각 시트의 검증 상태에 따른 스텝 클래스 결정
                const getStepClass = (sheetName: string) => {
                  const status = sheetValidationStatus.get(sheetName)
                  if (!status || status === 'pending') return '' // 회색 (기본)
                  if (status === 'validating') return 'excel-refiner__wizard-step--active' // 파란색
                  if (status === 'valid') return 'excel-refiner__wizard-step--completed' // 녹색
                  if (status === 'invalid') return 'excel-refiner__wizard-step--invalid' // 빨간색
                  return ''
                }

                const allValid = ['개인고객', '법인고객', '계약'].every(
                  name => sheetValidationStatus.get(name) === 'valid'
                )

                return (
                  <div className={`excel-refiner__wizard-compact excel-refiner__wizard--step-${wizardStep.step}`}>
                    <div className={`excel-refiner__wizard-step ${getStepClass('개인고객')}`}>
                      <span className="excel-refiner__wizard-step-number">1</span>
                      <span className="excel-refiner__wizard-step-label">개인고객 검증</span>
                    </div>
                    <div className="excel-refiner__wizard-connector" />
                    <div className={`excel-refiner__wizard-step ${getStepClass('법인고객')}`}>
                      <span className="excel-refiner__wizard-step-number">2</span>
                      <span className="excel-refiner__wizard-step-label">법인고객 검증</span>
                    </div>
                    <div className="excel-refiner__wizard-connector" />
                    <div className={`excel-refiner__wizard-step ${getStepClass('계약')}`}>
                      <span className="excel-refiner__wizard-step-number">3</span>
                      <span className="excel-refiner__wizard-step-label">계약 검증</span>
                    </div>
                    <div className="excel-refiner__wizard-connector" />
                    <div
                      className={`excel-refiner__wizard-step ${allValid ? 'excel-refiner__wizard-step--active' : ''} ${wizardStep.resultStatus ? `excel-refiner__wizard-step--result-${wizardStep.resultStatus} excel-refiner__wizard-step--clickable` : ''}`}
                      onClick={wizardStep.resultStatus ? () => setImportResultDetail(prev => ({ ...prev, isOpen: true })) : undefined}
                    >
                      <span className="excel-refiner__wizard-step-number">
                        {wizardStep.resultStatus === 'success' ? '✓' : wizardStep.resultStatus === 'error' ? '✕' : '4'}
                      </span>
                      <span className="excel-refiner__wizard-step-label">
                        {wizardStep.step === 4 && wizardStep.resultStatus
                          ? '등록결과'
                          : '일괄등록'}
                      </span>
                    </div>
                  </div>
                )
              })()}

              <div className="excel-refiner__header-right">
                <Tooltip content="엑셀 저장">
                  <button
                    type="button"
                    className="excel-refiner__icon-btn"
                    onClick={handleSaveRefined}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M8 2v8M8 10L5 7M8 10l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M3 12v1.5a.5.5 0 00.5.5h9a.5.5 0 00.5-.5V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                </Tooltip>
                <Tooltip content="엑셀 닫기">
                  <button
                    type="button"
                    className="excel-refiner__icon-btn excel-refiner__icon-btn--close"
                    onClick={handleCloseExcel}
                  >
                    <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
                      <path d="M4.5 4.5L12.5 12.5M12.5 4.5L4.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* 행2: 액션바 - 검증버튼 + 상태 + 삭제모드 + 범례 */}
            <div className="excel-refiner__action-bar">
              <div className="excel-refiner__action-bar-left">
                {/* 검증/일괄등록 버튼: 규격 준수 시에만 표시 */}
                {formatCompliance?.status !== 'error' && (
                  <>
                    {/* 검증 버튼 */}
                    <Tooltip content="개인고객 → 법인고객 → 계약 순으로 검증합니다">
                      <Button
                        variant={sheetValidationStatus.size > 0 ? "secondary" : "primary"}
                        size="sm"
                        onClick={handleValidateAllSheets}
                        disabled={isValidatingAll || isImporting}
                      >
                        {isValidatingAll ? '검증 중...' : '검증'}
                      </Button>
                    </Tooltip>

                    {/* 일괄등록 버튼 */}
                    {wizardStep?.step === 4 ? (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleImportContracts}
                        disabled={isImporting}
                      >
                        {isImporting ? '등록 중...' : '일괄등록'}
                      </Button>
                    ) : wizardStep?.step === 3 ? (
                  // pending 상태가 아닌 경우에만 수정 필요 건수 표시 (pending은 우측 actionLog에서 표시)
                  !Array.from(sheetValidationStatus.values()).some(v => v === 'pending') && (
                    <span className="excel-refiner__status excel-refiner__status--error">
                      ⚠️ {sheetIssueCount.get(Array.from(sheetValidationStatus.entries()).find(([_, v]) => v === 'invalid')?.[0] || '') || 0}건 수정 필요
                    </span>
                  )
                ) : wizardStep?.step === 1 ? (
                  <span className="excel-refiner__status excel-refiner__status--hint">
                    👆 클릭하여 시작
                  </span>
                ) : null}
                  </>
                )}
              </div>

              <div className="excel-refiner__action-bar-right">
                {/* 진행 상태 표시 */}
                {importProgress && (
                  <div className="excel-refiner__import-progress">
                    <span className="excel-refiner__import-progress-text">
                      {importProgress.message} ({importProgress.current}/{importProgress.total})
                    </span>
                    <div className="excel-refiner__import-progress-bar">
                      <div
                        className="excel-refiner__import-progress-fill"
                        style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* 액션 로그 메시지 */}
                {actionLog && !importProgress && (
                  <div className="excel-refiner__action-log">
                    <span>{actionLog}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 행3: 시트 탭 */}
            <div className="excel-refiner__sheet-tabs">
              {sheets.map((sheet, index) => {
                const status = sheetValidationStatus.get(sheet.name)
                const issueCount = sheetIssueCount.get(sheet.name) || 0
                const isStandardSheet = ['개인고객', '법인고객', '계약'].includes(sheet.name)
                const isExtraSheet = !isStandardSheet && formatCompliance

                // 규격 준수 상태 확인 (누락 컬럼 여부)
                const sheetCheck = formatCompliance?.sheets.find(s => s.name === sheet.name)
                const hasFormatIssue = sheetCheck && (
                  !sheetCheck.hasAllRequired ||
                  (sheetCheck.missingOptionalColumns && sheetCheck.missingOptionalColumns.length > 0)
                )

                // 탭 스타일 결정: 규격 위반 > 검증 상태
                let tabStatus = ''
                if (isExtraSheet) {
                  tabStatus = 'excel-refiner__sheet-tab--extra'
                } else if (hasFormatIssue) {
                  tabStatus = 'excel-refiner__sheet-tab--format-error'
                } else if (status) {
                  tabStatus = `excel-refiner__sheet-tab--${status}`
                }

                return (
                  <button
                    key={sheet.name}
                    type="button"
                    className={`excel-refiner__sheet-tab ${index === activeSheetIndex ? 'excel-refiner__sheet-tab--active' : ''} ${tabStatus}`}
                    onClick={() => handleSheetChange(index)}
                  >
                    {sheet.name}
                    {!isExtraSheet && !hasFormatIssue && status === 'valid' && ' ✓'}
                    {hasFormatIssue && ' ✕'}
                    {!hasFormatIssue && status === 'invalid' && ` (${issueCount})`}
                    {status === 'validating' && ' ...'}
                  </button>
                )
              })}
            </div>

            {/* 데이터 테이블 */}
            {/* 시트별로 개별 규격준수 상태에 따라 테두리 표시 */}
            <div className={`excel-refiner__table-container ${
              (() => {
                const sheetName = currentSheet?.name || ''
                const isStandardSheet = ['개인고객', '법인고객', '계약'].includes(sheetName)
                if (!isStandardSheet) {
                  return 'excel-refiner__table-container--extra'
                }
                // 현재 시트의 규격 준수 상태 확인
                const sheetCheck = formatCompliance?.sheets.find(s => s.name === sheetName)
                if (!sheetCheck || !sheetCheck.found) {
                  return ''  // 시트가 없으면 기본
                }
                // 시트에 문제가 있는지 확인 (필수 컬럼 누락 또는 선택 컬럼 누락)
                const hasRequiredMissing = !sheetCheck.hasAllRequired
                const hasOptionalMissing = sheetCheck.missingOptionalColumns && sheetCheck.missingOptionalColumns.length > 0
                if (hasRequiredMissing || hasOptionalMissing) {
                  return 'excel-refiner__table-container--error'
                }
                return 'excel-refiner__table-container--compliant'
              })()
            }`}>
              <table className="excel-refiner__table">
                <thead>
                  <tr>
                    {/* 삭제 모드일 때 체크박스 컬럼 */}
                    {isDeleteMode && (
                      <th className="excel-refiner__th excel-refiner__th--checkbox">
                        <Tooltip content="전체 선택/해제">
                        <input
                          type="checkbox"
                          checked={selectedRows.size === sortedDataWithIndices.length && sortedDataWithIndices.length > 0}
                          onChange={handleSelectAll}
                        />
                        </Tooltip>
                      </th>
                    )}
                    <th className={`excel-refiner__th excel-refiner__th--row-num ${sortColumn === -1 ? 'excel-refiner__th--sorted' : ''}`}>
                      <div className="excel-refiner__th-content">
                        <span className="excel-refiner__th-text">#</span>
                        <Tooltip content={sortColumn === -1 ? (sortDirection === 'asc' ? '내림차순 정렬' : '오름차순 정렬') : '오름차순 정렬'}>
                        <button
                          type="button"
                          className="excel-refiner__sort-btn"
                          onClick={(e) => handleSortClick(-1, e)}
                        >
                          {sortColumn === -1 ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
                        </button>
                        </Tooltip>
                      </div>
                    </th>
                    {orderedColumns.map((orderedCol, displayIndex) => {
                      const { name: col, dataIndex, isMissing, isExtra } = orderedCol

                      // 누락된 컬럼은 빨간색 스타일
                      if (isMissing) {
                        return (
                          <th key={`missing-${col}`} className="excel-refiner__th excel-refiner__th--missing">
                            <div className="excel-refiner__th-content">
                              <span className="excel-refiner__th-text">{col}</span>
                              <span className="excel-refiner__th-badge excel-refiner__th-badge--missing">누락</span>
                            </div>
                          </th>
                        )
                      }

                      // 규격 외 컬럼은 회색 스타일
                      if (isExtra) {
                        const isSelected = selectedColumn === dataIndex
                        return (
                          <th
                            key={`extra-${col}-${dataIndex}`}
                            className={`excel-refiner__th excel-refiner__th--extra${isSelected ? ' excel-refiner__th--selected' : ''}`}
                            onClick={() => handleSelectColumn(dataIndex)}
                          >
                            <div className="excel-refiner__th-content">
                              <span className="excel-refiner__th-text">{col}</span>
                              <span className="excel-refiner__th-badge excel-refiner__th-badge--extra">규격 외</span>
                            </div>
                          </th>
                        )
                      }

                      // 정상 컬럼
                      const isInProgress = validatingInProgress.has(dataIndex)
                      const isValidated = validatingColumns.has(dataIndex)
                      const result = columnValidationResults.get(dataIndex)
                      const hasIssues = result && (!result.valid || result.duplicates.length > 0)
                      const type = col ? getValidationType(col) : 'default'
                      const isValidatable = type !== 'default'
                      const isSorted = sortColumn === dataIndex
                      const isSelected = selectedColumn === dataIndex

                      // 검증 가능하지만 아직 검증되지 않은 컬럼만 파란색(clickable) 스타일 적용
                      // 파란색 = 필수검증 컬럼 (아직 검증 안 됨)
                      // 초록색 = 검증 완료됨
                      let thClassName = 'excel-refiner__th excel-refiner__th--sortable'
                      if (isValidatable && !isValidated && !isInProgress) {
                        thClassName += ' excel-refiner__th--clickable'
                      }
                      if (isInProgress) {
                        thClassName += ' excel-refiner__th--validating'
                      } else if (isValidated) {
                        // 상품명 칼럼은 미매칭 여부에 따라 error/success 구분
                        if (type === 'productName' && productMatchResult && productNameColumnIndex === dataIndex) {
                          const hasUnmatched = productMatchResult.unmatched.length > 0
                          thClassName += hasUnmatched
                            ? ' excel-refiner__th--validation-error'
                            : ' excel-refiner__th--validation-success'
                        } else {
                          thClassName += hasIssues
                            ? ' excel-refiner__th--validation-error'
                            : ' excel-refiner__th--validation-success'
                        }
                      }
                      if (isSorted) {
                        thClassName += ' excel-refiner__th--sorted'
                      }
                      if (isSelected) {
                        thClassName += ' excel-refiner__th--selected'
                      }

                      return (
                        <th
                          key={dataIndex}
                          className={thClassName}
                          onClick={() => {
                            handleSelectColumn(dataIndex)
                            if (isValidatable) {
                              handleColumnClick(dataIndex, col)
                            }
                          }}
                        >
                          <div className="excel-refiner__th-content">
                            {lastClickedColumn === dataIndex && (
                              <Tooltip content="마지막 클릭"><span className="excel-refiner__th-last-clicked">
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                  <circle cx="8" cy="8" r="4" />
                                </svg>
                              </span></Tooltip>
                            )}
                            <span className="excel-refiner__th-text">{col || `열 ${dataIndex + 1}`}</span>
                            {isInProgress && <span className="excel-refiner__th-badge excel-refiner__th-badge--validating">...</span>}
                            {!isInProgress && renderColumnBadge(dataIndex, col)}
                            <Tooltip content={isSorted ? (sortDirection === 'asc' ? '내림차순 정렬' : '오름차순 정렬') : '오름차순 정렬'}>
                            <button
                              type="button"
                              className="excel-refiner__sort-btn"
                              onClick={(e) => handleSortClick(dataIndex, e)}
                            >
                              {isSorted ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
                            </button>
                            </Tooltip>
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sortedDataWithIndices.map(({ row, originalIndex }) => {
                    const status = getRowValidationStatus(originalIndex)
                    const isSelected = selectedRows.has(originalIndex)
                    const isFocused = !isDeleteMode && focusedRow === originalIndex

                    return (
                      <tr
                        key={originalIndex}
                        className={`excel-refiner__tr excel-refiner__tr--${status} ${isSelected ? 'excel-refiner__tr--selected' : ''} ${isFocused ? 'excel-refiner__tr--focused' : ''} ${isDeleteMode ? 'excel-refiner__tr--delete-mode' : ''}`}
                        onClick={() => {
                          if (isDeleteMode) {
                            // 삭제 모드: 다중 선택
                            handleDeleteSelect(originalIndex)
                          } else {
                            // 일반 모드: 현재 행 표시
                            setFocusedRow(originalIndex)
                          }
                        }}
                      >
                        {/* 삭제 모드일 때 체크박스 */}
                        {isDeleteMode && (
                          <td className="excel-refiner__td excel-refiner__td--checkbox">
                            <Tooltip content={`행 ${getExcelRowNumber(originalIndex)} 선택`}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleDeleteSelect(originalIndex)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            </Tooltip>
                          </td>
                        )}
                        <td className="excel-refiner__td excel-refiner__td--row-num">
                          {getExcelRowNumber(originalIndex)}
                        </td>
                        {orderedColumns.map((orderedCol) => {
                          const { name: colName, dataIndex, isMissing, isExtra } = orderedCol

                          // 누락된 컬럼은 빈 셀
                          if (isMissing) {
                            return (
                              <td key={`missing-${colName}`} className="excel-refiner__td excel-refiner__td--missing">
                                -
                              </td>
                            )
                          }

                          // 규격 외 컬럼은 회색 스타일로 데이터 표시
                          if (isExtra) {
                            const cellValue = cellToString(row[dataIndex] as CellValue)
                            return (
                              <td key={`extra-${colName}-${dataIndex}`} className="excel-refiner__td excel-refiner__td--extra">
                                {cellValue || '-'}
                              </td>
                            )
                          }

                          const isRightAlign = isRightAlignColumn(colName)
                          let tdClassName = 'excel-refiner__td'
                          if (isRightAlign) {
                            tdClassName += ' excel-refiner__td--right'
                          }
                          if (validatingColumns.has(dataIndex)) {
                            tdClassName += ' excel-refiner__td--validation'
                          }

                          // 상품명 칼럼에만 매칭 상태 색상 적용 (계약 시트에서만)
                          let matchedProductId: string | null = null
                          let isUnmatchedProduct = false
                          if (currentSheet?.name === '계약' && dataIndex === productNameColumnIndex && productMatchResult) {
                            const productStatus = getProductCellStatus(originalIndex)
                            if (productStatus) {
                              tdClassName += ` excel-refiner__td--product-${productStatus}`
                              if (productStatus === 'original') {
                                matchedProductId = productMatchResult.originalMatch.get(originalIndex) || null
                              } else if (productStatus === 'modified') {
                                matchedProductId = productMatchResult.modified.get(originalIndex) || null
                              } else if (productStatus === 'unmatched') {
                                isUnmatchedProduct = true
                              }
                            }
                          }

                          // 고객명 칼럼에 DB 검증 상태 색상 적용 (개인고객/법인고객 시트)
                          const isCustomerSheet = currentSheet?.name === '개인고객' || currentSheet?.name === '법인고객'
                          if (isCustomerSheet && dataIndex === customerNameColumnIndex && customerNameValidationResult) {
                            const customerStatus = getCustomerNameCellStatus(originalIndex)
                            if (customerStatus) {
                              // new, update = 녹색 (유효), type_conflict, empty = 빨간색 (오류)
                              if (customerStatus === 'new' || customerStatus === 'update') {
                                tdClassName += ' excel-refiner__td--customer-valid'
                              } else if (customerStatus === 'type_conflict' || customerStatus === 'empty') {
                                tdClassName += ' excel-refiner__td--customer-error'
                              }
                            }
                          }

                          const cellValue = cellToString(row[dataIndex] as CellValue)

                          // 현재 셀이 편집 중인지 확인
                          const isEditing = editingCell?.rowIndex === originalIndex && editingCell?.colIndex === dataIndex

                          // 미매칭 상품명 외에는 편집 가능
                          if (!isUnmatchedProduct) {
                            tdClassName += ' excel-refiner__td--editable'
                          }
                          if (isEditing) {
                            tdClassName += ' excel-refiner__td--editing'
                          }

                          // 더블클릭 핸들러: 미매칭 → 검색 모달, 그 외 → 편집
                          const handleDoubleClick = (e: React.MouseEvent) => {
                            e.stopPropagation()
                            if (isUnmatchedProduct) {
                              handleUnmatchedProductClick(originalIndex, cellValue)
                            } else {
                              handleCellDoubleClick(originalIndex, dataIndex, cellValue)
                            }
                          }

                          // 우클릭 핸들러 (매칭된 상품명 → MongoDB Document 보기)
                          const handleContextMenu = matchedProductId
                            ? (e: React.MouseEvent) => {
                                e.preventDefault()
                                e.stopPropagation()
                                handleMatchedProductClick(matchedProductId!)
                              }
                            : undefined

                          // 툴팁 결정
                          let cellTitle = '더블클릭하여 편집'
                          if (isUnmatchedProduct) {
                            cellTitle = '더블클릭: 상품 검색'
                          } else if (matchedProductId) {
                            cellTitle = '우클릭: 상품 정보 | 더블클릭: 편집'
                          }

                          return (
                            <td
                              key={dataIndex}
                              className={tdClassName}
                              onDoubleClick={handleDoubleClick}
                              onContextMenu={handleContextMenu}
                            >
                              {/* 원래 텍스트 (폭 유지용, 편집 시 투명) */}
                              <span className={isEditing ? 'excel-refiner__cell-text--hidden' : undefined}>{cellValue}</span>
                              {/* 편집 입력 필드 (오버레이) */}
                              {isEditing && (
                                <input
                                  type="text"
                                  className={`excel-refiner__cell-input${isRightAlign ? ' excel-refiner__cell-input--right' : ''}`}
                                  value={editingCell.value}
                                  onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                                  onKeyDown={handleCellEditKeyDown}
                                  onBlur={handleCellEditSave}
                                  autoFocus
                                  aria-label="셀 편집"
                                />
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 상태바 - 파일 로드 후에만 표시 */}
      {currentSheet && (
      <footer className="excel-refiner__footer">
        <span>
          {isDeleteMode
            ? `${currentSheet.data.length}행 | 선택: ${selectedRows.size}행`
            : focusedRow !== null
              ? `${currentSheet.data.length}행 | ${getExcelRowNumber(focusedRow)}행`
              : `${currentSheet.data.length}행`}
          {selectedColumn !== null && currentSheet.columns[selectedColumn] && (
            <> | 컬럼: {currentSheet.columns[selectedColumn]}</>
          )}
        </span>
        {/* 컬럼 삭제 UI - 표준규격 외 컬럼만 표시 */}
        {selectedColumn !== null && currentSheet.columns[selectedColumn] && (() => {
          const columnName = currentSheet.columns[selectedColumn]
          const standardColumns = getStandardColumnOrder(currentSheet.name) || []
          const isExtraColumn = !standardColumns.includes(columnName)
          // 표준 컬럼이면 UI 표시 안 함
          if (!isExtraColumn) return null
          return (
            <div className="excel-refiner__footer-actions">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteColumn}
              >
                컬럼 삭제
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedColumn(null)}
              >
                선택 해제
              </Button>
            </div>
          )
        })()}
        {/* 행 삭제 관련 UI: 휴지통 아이콘 + 삭제/선택해제 버튼 */}
        {currentSheet && selectedColumn === null && (
          <div className="excel-refiner__footer-actions">
            <Tooltip key={isDeleteMode ? 'delete-done' : 'delete-select'} content={isDeleteMode ? '삭제 완료' : '행 선택 삭제'}>
              <button
                type="button"
                className={`excel-refiner__delete-mode-btn ${isDeleteMode ? 'excel-refiner__delete-mode-btn--active' : ''}`}
                onClick={handleToggleDeleteMode}
                aria-label={isDeleteMode ? '삭제 완료' : '행 선택 삭제'}
              >
                {isDeleteMode ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <SFSymbol
                    name="trash"
                    size={SFSymbolSize.CAPTION_1}
                    weight={SFSymbolWeight.MEDIUM}
                    decorative={true}
                  />
                )}
              </button>
            </Tooltip>
            {isDeleteMode && (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteSelected}
                  disabled={selectedRows.size === 0}
                >
                  선택 삭제
                </Button>
                {selectedRows.size > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearSelection}
                  >
                    선택 해제
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </footer>
      )}

      {/* 상품 검색 모달 */}
      <ProductSearchModal
        isOpen={isProductSearchOpen}
        onClose={() => {
          setIsProductSearchOpen(false)
          setProductSearchRowIndex(null)
        }}
        initialKeyword={productSearchKeyword}
        onSelect={handleProductSelect}
      />

      {/* MongoDB Document 뷰어 모달 - aims-uix3 Modal 사용 */}
      <Modal
        visible={!!viewingProduct}
        onClose={() => setViewingProduct(null)}
        title="MongoDB Document"
        size="md"
        backdropClosable
      >
        {viewingProduct && (
          <pre className="excel-refiner__doc-viewer-content">
            {JSON.stringify({
              _id: viewingProduct._id ? `ObjectId('${viewingProduct._id}')` : undefined,
              category: viewingProduct.category,
              productName: viewingProduct.productName,
              saleStartDate: viewingProduct.saleStartDate,
              saleEndDate: viewingProduct.saleEndDate,
              status: viewingProduct.status,
              surveyDate: viewingProduct.surveyDate,
              createdAt: viewingProduct.createdAt,
              updatedAt: viewingProduct.updatedAt
            }, null, 2)}
          </pre>
        )}
      </Modal>

      {/* 일괄등록 확인 모달 */}
      <Modal
        visible={importConfirmModal.isOpen}
        onClose={() => setImportConfirmModal({ isOpen: false, customerCount: 0, customerNames: [], customers: [], isCustomerSheet: false, 개인고객Count: 0, 법인고객Count: 0, 계약Count: 0 })}
        title="일괄등록 확인"
        size="sm"
        backdropClosable
      >
        <div className="excel-refiner__confirm-modal">
          <p className="excel-refiner__confirm-message">
            다음 데이터를 등록하시겠습니까?
          </p>
          <div className="excel-refiner__confirm-stats">
            <div className="excel-refiner__confirm-stat">
              <span>개인고객</span>
              <strong>{importConfirmModal.개인고객Count}명</strong>
            </div>
            <div className="excel-refiner__confirm-stat">
              <span>법인고객</span>
              <strong>{importConfirmModal.법인고객Count}명</strong>
            </div>
            <div className="excel-refiner__confirm-stat">
              <span>계약</span>
              <strong>{importConfirmModal.계약Count}건</strong>
            </div>
          </div>
          <p className="excel-refiner__confirm-note">
            ※ 이미 등록된 고객과 중복 증권번호는 건너뜁니다.
          </p>
          <div className="excel-refiner__confirm-actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setImportConfirmModal({ isOpen: false, customerCount: 0, customerNames: [], customers: [], isCustomerSheet: false, 개인고객Count: 0, 법인고객Count: 0, 계약Count: 0 })}
            >
              취소
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirmImport}
            >
              확인
            </Button>
          </div>
        </div>
      </Modal>

      {/* 개인/법인 동명이인 모달 */}
      <Modal
        visible={duplicateNameModal.isOpen}
        onClose={closeDuplicateNameModal}
        title="개인/법인 동명이인 확인"
        size="lg"
        backdropClosable={false}
      >
        <div className="excel-refiner__duplicate-modal">
          {/* 설명 섹션 */}
          <div className="excel-refiner__duplicate-info">
            <p className="excel-refiner__duplicate-info-text">
              개인고객과 법인고객에서 동일한 고객명이 발견되었습니다.
              <br />
              <strong>하나의 고객명은 개인 또는 법인 중 한 곳에만 존재해야 합니다.</strong>
              <br />
              아래에서 유지할 고객을 확인하고, 나머지는 삭제하거나 이름을 변경해주세요.
            </p>
          </div>

          {/* 진행 상황 */}
          {duplicateNameModal.allDuplicateNames.length > 1 && (
            <div className="excel-refiner__duplicate-progress">
              동명이인 처리: {duplicateNameModal.currentIndex + 1} / {duplicateNameModal.allDuplicateNames.length}
            </div>
          )}

          {/* 동명이인 이름 표시 */}
          <div className="excel-refiner__duplicate-name-header">
            <span className="excel-refiner__duplicate-name-label">동명이인:</span>
            <span className="excel-refiner__duplicate-name-value">{duplicateNameModal.duplicateName}</span>
          </div>

          {/* 두 테이블을 나란히 배치 */}
          <div className="excel-refiner__duplicate-tables">
            {/* 개인고객 테이블 */}
            <div className="excel-refiner__duplicate-table-section">
              <h4 className="excel-refiner__duplicate-table-title">
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="excel-refiner__type-icon excel-refiner__type-icon--personal">
                  <circle cx="10" cy="10" r="10" opacity="0.2" />
                  <circle cx="10" cy="7" r="3" />
                  <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
                </svg>
                개인고객 ({duplicateNameModal.individualCustomers.length}명)
              </h4>
              {duplicateNameModal.individualCustomers.length === 0 ? (
                <div className="excel-refiner__duplicate-empty">삭제됨</div>
              ) : (
                <table className="excel-refiner__duplicate-table">
                  <thead>
                    <tr>
                      <th>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="excel-refiner__th-icon excel-refiner__th-icon--person">
                          <path d="M8 8a3 3 0 100-6 3 3 0 000 6zM2 14s-1 0-1-1 1-4 7-4 7 3 7 4-1 1-1 1H2z"/>
                        </svg>
                        고객명
                      </th>
                      <th>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="excel-refiner__th-icon excel-refiner__th-icon--phone">
                          <path d="M3.654 1.328a.678.678 0 00-1.015-.063L1.605 2.3c-.483.484-.661 1.169-.45 1.77a17.568 17.568 0 004.168 6.608 17.569 17.569 0 006.608 4.168c.601.211 1.286.033 1.77-.45l1.034-1.034a.678.678 0 00-.063-1.015l-2.307-1.794a.678.678 0 00-.58-.122l-2.19.547a1.745 1.745 0 01-1.657-.459L5.482 8.062a1.745 1.745 0 01-.46-1.657l.548-2.19a.678.678 0 00-.122-.58L3.654 1.328z"/>
                        </svg>
                        연락처
                      </th>
                      <th>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="excel-refiner__th-icon excel-refiner__th-icon--address">
                          <path d="M8 1l-7 6h2v7h4V9h2v5h4V7h2L8 1z"/>
                        </svg>
                        주소
                      </th>
                      <th>작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {duplicateNameModal.individualCustomers.map((customer) => (
                      <tr key={customer.rowIndex}>
                        <td>
                          {editingCustomerName?.type === 'individual' && editingCustomerName.rowIndex === customer.rowIndex ? (
                            <input
                              type="text"
                              className="excel-refiner__duplicate-name-input"
                              value={editingCustomerName.newName}
                              onChange={(e) => setEditingCustomerName({ ...editingCustomerName, newName: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveCustomerNameChange()
                                if (e.key === 'Escape') setEditingCustomerName(null)
                              }}
                              autoFocus
                              aria-label="새 고객명 입력"
                              placeholder="새 고객명"
                            />
                          ) : (
                            customer.name
                          )}
                        </td>
                        <td>{customer.contact || '-'}</td>
                        <td className="excel-refiner__duplicate-address">{customer.address || '-'}</td>
                        <td className="excel-refiner__duplicate-actions">
                          {editingCustomerName?.type === 'individual' && editingCustomerName.rowIndex === customer.rowIndex ? (
                            <>
                              <Button variant="primary" size="sm" onClick={saveCustomerNameChange}>
                                저장
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setEditingCustomerName(null)}>
                                취소
                              </Button>
                            </>
                          ) : (
                            <>
                              <Tooltip content="이름 변경">
                                <button
                                  type="button"
                                  className="excel-refiner__icon-btn excel-refiner__icon-btn--edit"
                                  onClick={() => startEditingCustomerName('individual', customer.rowIndex, customer.name)}
                                  aria-label="이름 변경"
                                >
                                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M12.146.146a.5.5 0 01.708 0l3 3a.5.5 0 010 .708l-10 10a.5.5 0 01-.168.11l-5 2a.5.5 0 01-.65-.65l2-5a.5.5 0 01.11-.168l10-10zM11.207 2.5L13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 01.5.5v.5h.5a.5.5 0 01.5.5v.5h.293l6.5-6.5z"/>
                                  </svg>
                                </button>
                              </Tooltip>
                              <Tooltip content="삭제">
                                <button
                                  type="button"
                                  className="excel-refiner__icon-btn excel-refiner__icon-btn--delete"
                                  onClick={() => handleDeleteFromIndividual(customer.rowIndex)}
                                  aria-label="삭제"
                                >
                                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/>
                                    <path fillRule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                                  </svg>
                                </button>
                              </Tooltip>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* 법인고객 테이블 */}
            <div className="excel-refiner__duplicate-table-section">
              <h4 className="excel-refiner__duplicate-table-title">
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="excel-refiner__type-icon excel-refiner__type-icon--corporate">
                  <circle cx="10" cy="10" r="10" opacity="0.2" />
                  <path d="M6 5h2v2H6V5zm0 3h2v2H6V8zm0 3h2v2H6v-2zm3-6h2v2H9V5zm0 3h2v2H9V8zm0 3h2v2H9v-2zm3-6h2v2h-2V5zm0 3h2v2h-2V8zm0 3h2v2h-2v-2zM5 14h10v2H5v-2z" />
                </svg>
                법인고객 ({duplicateNameModal.corporateCustomers.length}명)
              </h4>
              {duplicateNameModal.corporateCustomers.length === 0 ? (
                <div className="excel-refiner__duplicate-empty">삭제됨</div>
              ) : (
                <table className="excel-refiner__duplicate-table">
                  <thead>
                    <tr>
                      <th>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="excel-refiner__th-icon excel-refiner__th-icon--person">
                          <path d="M8 8a3 3 0 100-6 3 3 0 000 6zM2 14s-1 0-1-1 1-4 7-4 7 3 7 4-1 1-1 1H2z"/>
                        </svg>
                        고객명
                      </th>
                      <th>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="excel-refiner__th-icon excel-refiner__th-icon--phone">
                          <path d="M3.654 1.328a.678.678 0 00-1.015-.063L1.605 2.3c-.483.484-.661 1.169-.45 1.77a17.568 17.568 0 004.168 6.608 17.569 17.569 0 006.608 4.168c.601.211 1.286.033 1.77-.45l1.034-1.034a.678.678 0 00-.063-1.015l-2.307-1.794a.678.678 0 00-.58-.122l-2.19.547a1.745 1.745 0 01-1.657-.459L5.482 8.062a1.745 1.745 0 01-.46-1.657l.548-2.19a.678.678 0 00-.122-.58L3.654 1.328z"/>
                        </svg>
                        연락처
                      </th>
                      <th>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="excel-refiner__th-icon excel-refiner__th-icon--address">
                          <path d="M8 1l-7 6h2v7h4V9h2v5h4V7h2L8 1z"/>
                        </svg>
                        주소
                      </th>
                      <th>작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {duplicateNameModal.corporateCustomers.map((customer) => (
                      <tr key={customer.rowIndex}>
                        <td>
                          {editingCustomerName?.type === 'corporate' && editingCustomerName.rowIndex === customer.rowIndex ? (
                            <input
                              type="text"
                              className="excel-refiner__duplicate-name-input"
                              value={editingCustomerName.newName}
                              onChange={(e) => setEditingCustomerName({ ...editingCustomerName, newName: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveCustomerNameChange()
                                if (e.key === 'Escape') setEditingCustomerName(null)
                              }}
                              autoFocus
                              aria-label="새 고객명 입력"
                              placeholder="새 고객명"
                            />
                          ) : (
                            customer.name
                          )}
                        </td>
                        <td>{customer.contact || '-'}</td>
                        <td className="excel-refiner__duplicate-address">{customer.address || '-'}</td>
                        <td className="excel-refiner__duplicate-actions">
                          {editingCustomerName?.type === 'corporate' && editingCustomerName.rowIndex === customer.rowIndex ? (
                            <>
                              <Button variant="primary" size="sm" onClick={saveCustomerNameChange}>
                                저장
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setEditingCustomerName(null)}>
                                취소
                              </Button>
                            </>
                          ) : (
                            <>
                              <Tooltip content="이름 변경">
                                <button
                                  type="button"
                                  className="excel-refiner__icon-btn excel-refiner__icon-btn--edit"
                                  onClick={() => startEditingCustomerName('corporate', customer.rowIndex, customer.name)}
                                  aria-label="이름 변경"
                                >
                                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M12.146.146a.5.5 0 01.708 0l3 3a.5.5 0 010 .708l-10 10a.5.5 0 01-.168.11l-5 2a.5.5 0 01-.65-.65l2-5a.5.5 0 01.11-.168l10-10zM11.207 2.5L13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 01.5.5v.5h.5a.5.5 0 01.5.5v.5h.293l6.5-6.5z"/>
                                  </svg>
                                </button>
                              </Tooltip>
                              <Tooltip content="삭제">
                                <button
                                  type="button"
                                  className="excel-refiner__icon-btn excel-refiner__icon-btn--delete"
                                  onClick={() => handleDeleteFromCorporate(customer.rowIndex)}
                                  aria-label="삭제"
                                >
                                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/>
                                    <path fillRule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                                  </svg>
                                </button>
                              </Tooltip>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* 해결됨 안내 */}
          {isDuplicateResolved && (
            <div className="excel-refiner__duplicate-resolved">
              ✓ 이 동명이인이 해결되었습니다
            </div>
          )}

          {/* 하단 버튼 */}
          <div className="excel-refiner__duplicate-footer">
            {!isDuplicateResolved && (
              <Button variant="secondary" size="sm" onClick={closeDuplicateNameModal}>
                취소
              </Button>
            )}
            {isDuplicateResolved && (
              <Button variant="primary" size="sm" onClick={goToNextDuplicateName}>
                {duplicateNameModal.currentIndex < duplicateNameModal.allDuplicateNames.length - 1
                  ? '다음 동명이인'
                  : '완료'}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* 일괄등록 상세 결과 모달 */}
      <DraggableModal
        visible={importResultDetail.isOpen}
        onClose={() => setImportResultDetail(prev => ({ ...prev, isOpen: false }))}
        title="일괄등록 결과 상세"
        initialWidth={1200}
        initialHeight={560}
        minWidth={900}
        minHeight={400}
      >
        <div className="excel-refiner__result-detail">
          {/* 상태 배지 */}
          <div className="excel-refiner__result-summary">
            <span className={`excel-refiner__result-badge excel-refiner__result-badge--${
              importResultDetail.summary === '일괄등록 완료' ? 'success' :
              importResultDetail.summary === '일괄등록 일부 완료' ? 'partial' : 'error'
            }`}>
              {importResultDetail.summary}
            </span>
          </div>

          {/* 탭 네비게이션 - 데이터가 있는 탭만 표시 */}
          <div className="excel-refiner__result-tabs-wrapper">
            <div className="excel-refiner__result-tabs">
              {(['개인고객', '법인고객', '계약'] as const)
                .map(tab => {
                  const totalCount = tab === '계약'
                    ? importResultDetail.계약.created.length + importResultDetail.계약.updated.length + importResultDetail.계약.skipped.length + importResultDetail.계약.errors.length
                    : importResultDetail[tab].created.length + importResultDetail[tab].updated.length + importResultDetail[tab].skipped.length + importResultDetail[tab].errors.length
                  return { tab, totalCount }
                })
                .filter(({ totalCount }) => totalCount > 0)
                .map(({ tab, totalCount }) => (
                  <button
                    key={tab}
                    type="button"
                    className={`excel-refiner__result-tab ${importResultDetail.activeTab === tab ? 'excel-refiner__result-tab--active' : ''}`}
                    onClick={() => setImportResultDetail(prev => ({ ...prev, activeTab: tab }))}
                  >
                    {tab === '개인고객' && (
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--personal">
                        <circle cx="10" cy="10" r="10" opacity="0.2" />
                        <circle cx="10" cy="7" r="3" />
                        <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
                      </svg>
                    )}
                    {tab === '법인고객' && (
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--corporate">
                        <circle cx="10" cy="10" r="10" opacity="0.2" />
                        <path d="M6 5h2v2H6V5zm0 3h2v2H6V8zm0 3h2v2H6v-2zm3-6h2v2H9V5zm0 3h2v2H9V8zm0 3h2v2H9v-2zm3-6h2v2h-2V5zm0 3h2v2h-2V8zm0 3h2v2h-2v-2zM5 14h10v2H5v-2z" />
                      </svg>
                    )}
                    {tab === '계약' && (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M4 1.5a.5.5 0 00-.5.5v12a.5.5 0 00.5.5h8a.5.5 0 00.5-.5V4.707L9.293 1.5H4z"/>
                      </svg>
                    )}
                    {tab}
                    <span className="excel-refiner__result-tab-count">{totalCount}</span>
                  </button>
                ))}
            </div>
            <label className="excel-refiner__result-filter">
              <input
                type="checkbox"
                checked={importResultDetail.hideSkipped}
                onChange={(e) => setImportResultDetail(prev => ({ ...prev, hideSkipped: e.target.checked }))}
              />
              <span>변경된 항목만 보기</span>
            </label>
          </div>

          {/* 탭 콘텐츠 - 개인고객 */}
          {importResultDetail.activeTab === '개인고객' && (
            <div className="excel-refiner__result-table-container">
              {importResultDetail.개인고객.created.length + importResultDetail.개인고객.updated.length + importResultDetail.개인고객.skipped.length === 0 ? (
                <div className="excel-refiner__result-empty">등록된 개인고객이 없습니다</div>
              ) : (
                <table className="excel-refiner__result-table">
                  <thead>
                    <tr>
                      <th className="excel-refiner__result-th">상태</th>
                      <th className="excel-refiner__result-th">고객명</th>
                      <th className="excel-refiner__result-th">연락처</th>
                      <th className="excel-refiner__result-th">주소</th>
                      <th className="excel-refiner__result-th">성별</th>
                      <th className="excel-refiner__result-th">생년월일</th>
                      <th className="excel-refiner__result-th">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResultDetail.개인고객.created.map((c, i) => (
                      <tr key={`created-${i}`} className="excel-refiner__result-tr excel-refiner__result-tr--created">
                        <td className="excel-refiner__result-td excel-refiner__result-td--status-created">신규</td>
                        <td className="excel-refiner__result-td">{c.name}</td>
                        <td className="excel-refiner__result-td">{c.mobile_phone || '-'}</td>
                        <td className="excel-refiner__result-td">{c.address || '-'}</td>
                        <td className="excel-refiner__result-td">{c.gender || '-'}</td>
                        <td className="excel-refiner__result-td">{c.birth_date || '-'}</td>
                        <td className="excel-refiner__result-td">-</td>
                      </tr>
                    ))}
                    {importResultDetail.개인고객.updated.map((c, i) => (
                      <tr key={`updated-${i}`} className="excel-refiner__result-tr excel-refiner__result-tr--updated">
                        <td className="excel-refiner__result-td excel-refiner__result-td--status-updated">업데이트</td>
                        <td className="excel-refiner__result-td">{c.name}</td>
                        <td className={`excel-refiner__result-td ${c.changes.includes('mobile_phone') ? 'excel-refiner__result-td--changed' : ''}`}>{c.mobile_phone || '-'}</td>
                        <td className={`excel-refiner__result-td ${c.changes.includes('address') ? 'excel-refiner__result-td--changed' : ''}`}>{c.address || '-'}</td>
                        <td className={`excel-refiner__result-td ${c.changes.includes('gender') ? 'excel-refiner__result-td--changed' : ''}`}>{c.gender || '-'}</td>
                        <td className={`excel-refiner__result-td ${c.changes.includes('birth_date') ? 'excel-refiner__result-td--changed' : ''}`}>{c.birth_date || '-'}</td>
                        <td className="excel-refiner__result-td excel-refiner__result-td--changes">{c.changes.join(', ')}</td>
                      </tr>
                    ))}
                    {!importResultDetail.hideSkipped && importResultDetail.개인고객.skipped.map((c, i) => (
                      <tr key={`skipped-${i}`} className="excel-refiner__result-tr excel-refiner__result-tr--skipped">
                        <td className="excel-refiner__result-td excel-refiner__result-td--status-skipped">건너뜀</td>
                        <td className="excel-refiner__result-td">{c.name}</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">{c.reason}</td>
                      </tr>
                    ))}
                    {importResultDetail.개인고객.errors.map((c, i) => (
                      <tr key={`error-${i}`} className="excel-refiner__result-tr excel-refiner__result-tr--error">
                        <td className="excel-refiner__result-td excel-refiner__result-td--status-error">오류</td>
                        <td className="excel-refiner__result-td">{c.name}</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">{c.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* 탭 콘텐츠 - 법인고객 */}
          {importResultDetail.activeTab === '법인고객' && (
            <div className="excel-refiner__result-table-container">
              {importResultDetail.법인고객.created.length + importResultDetail.법인고객.updated.length + importResultDetail.법인고객.skipped.length === 0 ? (
                <div className="excel-refiner__result-empty">등록된 법인고객이 없습니다</div>
              ) : (
                <table className="excel-refiner__result-table">
                  <thead>
                    <tr>
                      <th className="excel-refiner__result-th">상태</th>
                      <th className="excel-refiner__result-th">법인명</th>
                      <th className="excel-refiner__result-th">연락처</th>
                      <th className="excel-refiner__result-th">주소</th>
                      <th className="excel-refiner__result-th">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResultDetail.법인고객.created.map((c, i) => (
                      <tr key={`created-${i}`} className="excel-refiner__result-tr excel-refiner__result-tr--created">
                        <td className="excel-refiner__result-td excel-refiner__result-td--status-created">신규</td>
                        <td className="excel-refiner__result-td">{c.name}</td>
                        <td className="excel-refiner__result-td">{c.mobile_phone || '-'}</td>
                        <td className="excel-refiner__result-td">{c.address || '-'}</td>
                        <td className="excel-refiner__result-td">-</td>
                      </tr>
                    ))}
                    {importResultDetail.법인고객.updated.map((c, i) => (
                      <tr key={`updated-${i}`} className="excel-refiner__result-tr excel-refiner__result-tr--updated">
                        <td className="excel-refiner__result-td excel-refiner__result-td--status-updated">업데이트</td>
                        <td className="excel-refiner__result-td">{c.name}</td>
                        <td className={`excel-refiner__result-td ${c.changes.includes('mobile_phone') ? 'excel-refiner__result-td--changed' : ''}`}>{c.mobile_phone || '-'}</td>
                        <td className={`excel-refiner__result-td ${c.changes.includes('address') ? 'excel-refiner__result-td--changed' : ''}`}>{c.address || '-'}</td>
                        <td className="excel-refiner__result-td excel-refiner__result-td--changes">{c.changes.join(', ')}</td>
                      </tr>
                    ))}
                    {!importResultDetail.hideSkipped && importResultDetail.법인고객.skipped.map((c, i) => (
                      <tr key={`skipped-${i}`} className="excel-refiner__result-tr excel-refiner__result-tr--skipped">
                        <td className="excel-refiner__result-td excel-refiner__result-td--status-skipped">건너뜀</td>
                        <td className="excel-refiner__result-td">{c.name}</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">{c.reason}</td>
                      </tr>
                    ))}
                    {importResultDetail.법인고객.errors.map((c, i) => (
                      <tr key={`error-${i}`} className="excel-refiner__result-tr excel-refiner__result-tr--error">
                        <td className="excel-refiner__result-td excel-refiner__result-td--status-error">오류</td>
                        <td className="excel-refiner__result-td">{c.name}</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">{c.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* 탭 콘텐츠 - 계약 */}
          {importResultDetail.activeTab === '계약' && (
            <div className="excel-refiner__result-table-container">
              {importResultDetail.계약.created.length + importResultDetail.계약.updated.length + importResultDetail.계약.skipped.length + importResultDetail.계약.errors.length === 0 ? (
                <div className="excel-refiner__result-empty">등록된 계약이 없습니다</div>
              ) : (
                <table className="excel-refiner__result-table">
                  <thead>
                    <tr>
                      <th className="excel-refiner__result-th">상태</th>
                      <th className="excel-refiner__result-th">고객명</th>
                      <th className="excel-refiner__result-th">상품명</th>
                      <th className="excel-refiner__result-th">계약일</th>
                      <th className="excel-refiner__result-th">증권번호</th>
                      <th className="excel-refiner__result-th">보험료</th>
                      <th className="excel-refiner__result-th">이체일</th>
                      <th className="excel-refiner__result-th">납입주기</th>
                      <th className="excel-refiner__result-th">납입기간</th>
                      <th className="excel-refiner__result-th">피보험자</th>
                      <th className="excel-refiner__result-th">납입상태</th>
                      <th className="excel-refiner__result-th">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResultDetail.계약.created.map((c, i) => (
                      <tr key={`created-${i}`} className="excel-refiner__result-tr excel-refiner__result-tr--created">
                        <td className="excel-refiner__result-td excel-refiner__result-td--status-created">신규</td>
                        <td className="excel-refiner__result-td">{c.customer_name}</td>
                        <td className="excel-refiner__result-td">{c.product_name}</td>
                        <td className="excel-refiner__result-td">{c.contract_date || '-'}</td>
                        <td className="excel-refiner__result-td">{c.policy_number}</td>
                        <td className="excel-refiner__result-td">{c.premium ? c.premium.toLocaleString() + '원' : '-'}</td>
                        <td className="excel-refiner__result-td">{c.payment_day ? (String(c.payment_day).endsWith('일') ? c.payment_day : c.payment_day + '일') : '-'}</td>
                        <td className="excel-refiner__result-td">{c.payment_cycle || '-'}</td>
                        <td className="excel-refiner__result-td">{c.payment_period || '-'}</td>
                        <td className="excel-refiner__result-td">{c.insured_person || '-'}</td>
                        <td className="excel-refiner__result-td">{c.payment_status || '-'}</td>
                        <td className="excel-refiner__result-td">-</td>
                      </tr>
                    ))}
                    {importResultDetail.계약.updated.map((c, i) => (
                      <tr key={`updated-${i}`} className="excel-refiner__result-tr excel-refiner__result-tr--updated">
                        <td className="excel-refiner__result-td excel-refiner__result-td--status-updated">업데이트</td>
                        <td className="excel-refiner__result-td">{c.customer_name}</td>
                        <td className="excel-refiner__result-td">{c.product_name}</td>
                        <td className="excel-refiner__result-td">{c.contract_date || '-'}</td>
                        <td className={`excel-refiner__result-td ${c.changes.includes('보험료') ? 'excel-refiner__result-td--changed' : ''}`}>{c.premium ? c.premium.toLocaleString() + '원' : '-'}</td>
                        <td className={`excel-refiner__result-td ${c.changes.includes('이체일') ? 'excel-refiner__result-td--changed' : ''}`}>{c.payment_day ? (String(c.payment_day).endsWith('일') ? c.payment_day : c.payment_day + '일') : '-'}</td>
                        <td className={`excel-refiner__result-td ${c.changes.includes('납입주기') ? 'excel-refiner__result-td--changed' : ''}`}>{c.payment_cycle || '-'}</td>
                        <td className={`excel-refiner__result-td ${c.changes.includes('납입기간') ? 'excel-refiner__result-td--changed' : ''}`}>{c.payment_period || '-'}</td>
                        <td className={`excel-refiner__result-td ${c.changes.includes('피보험자') ? 'excel-refiner__result-td--changed' : ''}`}>{c.insured_person || '-'}</td>
                        <td className={`excel-refiner__result-td ${c.changes.includes('납입상태') ? 'excel-refiner__result-td--changed' : ''}`}>{c.payment_status || '-'}</td>
                        <td className="excel-refiner__result-td excel-refiner__result-td--changes">{c.changes.join(', ')}</td>
                      </tr>
                    ))}
                    {!importResultDetail.hideSkipped && importResultDetail.계약.skipped.map((c, i) => (
                      <tr key={`skipped-${i}`} className="excel-refiner__result-tr excel-refiner__result-tr--skipped">
                        <td className="excel-refiner__result-td excel-refiner__result-td--status-skipped">건너뜀</td>
                        <td className="excel-refiner__result-td">{c.customer_name}</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">{c.policy_number}</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">{c.reason}</td>
                      </tr>
                    ))}
                    {importResultDetail.계약.errors.map((c, i) => (
                      <tr key={`error-${i}`} className="excel-refiner__result-tr excel-refiner__result-tr--error">
                        <td className="excel-refiner__result-td excel-refiner__result-td--status-error">오류</td>
                        <td className="excel-refiner__result-td">{c.customer_name || '-'}</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">{c.policy_number || '-'}</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">-</td>
                        <td className="excel-refiner__result-td">{c.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

        </div>
      </DraggableModal>
    </div>
  )
}

export default ExcelRefiner
