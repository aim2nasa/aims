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
import { Tooltip } from '@/shared/ui/Tooltip'
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
  type SheetData,
  type CellValue,
  type ValidationResult,
  type ProductMatchResult,
  type InsuranceProduct,
  type ValidationType
} from '@aims/excel-refiner-core'
import { CustomerService } from '@/services/customerService'
import { ContractService } from '@/services/contractService'
import { useAuthStore } from '@/shared/stores/authStore'
import { ProductSearchModal } from './ProductSearchModal'
import './ExcelRefiner.css'

// 우측 정렬이 필요한 컬럼명 패턴
const RIGHT_ALIGN_PATTERNS = ['증권번호', '보험료', '이체일', '납입주기', '납입기간', '납입상태', '연락처', '계약일', '피보험자']

function isRightAlignColumn(columnName: string): boolean {
  if (!columnName) return false
  return RIGHT_ALIGN_PATTERNS.some(pattern => columnName.includes(pattern))
}

// sessionStorage 키
const STORAGE_KEY = 'excelRefiner_state'

// sessionStorage에 저장할 상태 타입
// 주의: productMatchResult는 Map 객체를 포함하므로 JSON 직렬화 불가 → 저장하지 않음
interface PersistedState {
  fileName: string | null
  sheets: SheetData[]
  activeSheetIndex: number
  validatingColumns: number[]
  validatedColumnsHistory: number[]
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

  // 선택 상태
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())

  // 드래그 상태
  const [isDragging, setIsDragging] = useState(false)

  // 검증 대상 컬럼 (사용자가 클릭한 컬럼)
  const [validatingColumns, setValidatingColumns] = useState<Set<number>>(new Set())

  // 검증 진행 중인 컬럼 (클릭 직후 ~ 검증 완료 전)
  const [validatingInProgress, setValidatingInProgress] = useState<Set<number>>(new Set())

  // 검증 완료 이력 (컬럼별 클릭 시에도 누적됨, 4개 필수 컬럼 완료 추적용)
  const [validatedColumnsHistory, setValidatedColumnsHistory] = useState<Set<number>>(new Set())

  // 정렬 상태
  const [sortColumn, setSortColumn] = useState<number | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // 마지막으로 클릭된 컬럼 (검증 클릭)
  const [lastClickedColumn, setLastClickedColumn] = useState<number | null>(null)

  // 상품명 검증 결과 (행 인덱스 → ObjectId 매칭)
  const [productMatchResult, setProductMatchResult] = useState<ProductMatchResult | null>(null)
  const [productNameColumnIndex, setProductNameColumnIndex] = useState<number | null>(null)

  // 상품명 상태 필터 (범례 클릭 시 해당 상태 행을 맨 위로)
  const [productStatusFilter, setProductStatusFilter] = useState<'original' | 'modified' | 'unmatched' | null>(null)

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

  // 계약 가져오기 결과 상태 (등록 완료 후 표시용)
  const [importResult, setImportResult] = useState<{
    total: number       // 전체 계약 수
    inserted: number    // 등록된 계약 수
    skipped: number     // 건너뛴 계약 수
    errors: number      // 오류 계약 수
  } | null>(null)

  // 계약 가져오기 확인 모달 상태
  const [importConfirmModal, setImportConfirmModal] = useState<{
    isOpen: boolean
    customerCount: number
    customerNames: string[]
  }>({ isOpen: false, customerCount: 0, customerNames: [] })

  // 고객명-연락처 매핑 (계약 가져오기 시 사용)
  const [customerPhoneMap, setCustomerPhoneMap] = useState<Map<string, string>>(new Map())

  // 초기화 완료 여부 (sessionStorage 로드 후 true)
  const isInitialized = useRef(false)

  // sessionStorage에서 상태 복원 (마운트 시 1회)
  useEffect(() => {
    const saved = loadPersistedState()
    if (saved) {
      setFileName(saved.fileName)
      setSheets(saved.sheets)
      setActiveSheetIndex(saved.activeSheetIndex)
      setValidatingColumns(new Set(saved.validatingColumns))
      setValidatedColumnsHistory(new Set(saved.validatedColumnsHistory))
      // productMatchResult는 Map을 포함하므로 저장/복원 불가 → 검증 다시 실행 필요
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

    savePersistedState({
      fileName,
      sheets,
      activeSheetIndex,
      validatingColumns: Array.from(validatingColumns),
      validatedColumnsHistory: Array.from(validatedColumnsHistory)
    })
  }, [fileName, sheets, activeSheetIndex, validatingColumns, validatedColumnsHistory])

  // 현재 시트 데이터
  const currentSheet = sheets[activeSheetIndex] || null

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

  // 전체 문제 행 인덱스 (모든 검증 컬럼 결합 + 상품명 미매칭)
  const problematicRows = useMemo(() => {
    const allRows: number[] = []
    columnValidationResults.forEach(result => {
      allRows.push(...getProblematicRows(result))
    })
    // 상품명 미매칭 행 추가
    if (productMatchResult) {
      allRows.push(...productMatchResult.unmatched)
    }
    return [...new Set(allRows)].sort((a, b) => a - b)
  }, [columnValidationResults, productMatchResult])

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
          aMatch = productMatchResult.originalMatch.has(a.originalIndex)
          bMatch = productMatchResult.originalMatch.has(b.originalIndex)
        } else if (productStatusFilter === 'modified') {
          aMatch = productMatchResult.modified.has(a.originalIndex)
          bMatch = productMatchResult.modified.has(b.originalIndex)
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
      setValidatingColumns(new Set())
      setValidatingInProgress(new Set())
      setValidatedColumnsHistory(new Set())
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
    setValidatingColumns(new Set())
    setValidatingInProgress(new Set())
    setValidatedColumnsHistory(new Set())
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
    // sessionStorage 정리
    clearPersistedState()
  }, [])

  // 시트 탭 변경
  const handleSheetChange = useCallback((index: number) => {
    setActiveSheetIndex(index)
    setSelectedRows(new Set())
    setValidatingColumns(new Set())
    setValidatedColumnsHistory(new Set())
    setSortColumn(null)
    setSortDirection('asc')
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
    // 검증 로직이 정의된 컬럼만 클릭 가능
    if (!columnName) return
    const type = getValidationType(columnName)
    if (type === 'default') return

    // 마지막으로 클릭된 컬럼 표시
    setLastClickedColumn(colIndex)
    // 범례 필터 초기화 (컬럼 클릭이 우선)
    setProductStatusFilter(null)

    // 검증 초기화 (항상 하나의 컬럼만 검증 상태 유지)
    setValidatingColumns(new Set())
    setProductMatchResult(null)
    setProductNameColumnIndex(null)

    // 먼저 "검증 중" 상태 표시
    setValidatingInProgress(prev => {
      const next = new Set(prev)
      next.add(colIndex)
      return next
    })

    // 상품명 검증은 비동기로 처리
    if (type === 'productName' && currentSheet) {
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

        // 검증 컬럼에 추가 (현재 활성 상태)
        setValidatingColumns(prev => {
          const next = new Set(prev)
          next.add(colIndex)
          return next
        })
        // 검증 완료 이력에 추가 (누적)
        setValidatedColumnsHistory(prev => {
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
      setValidatingColumns(prev => {
        const next = new Set(prev)
        next.add(colIndex)
        return next
      })
      // 검증 완료 이력에 추가 (누적)
      setValidatedColumnsHistory(prev => {
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
  }, [validatingColumns, currentSheet, activeSheetIndex])

  // 검증 초기화
  const handleClearValidation = useCallback(() => {
    setValidatingColumns(new Set())
    setValidatedColumnsHistory(new Set())
    setProductMatchResult(null)
    setProductNameColumnIndex(null)
    setActionLog(null)
  }, [])

  // 필수컬럼검증 (고객명, 상품명, 계약일, 증권번호 순차 검증)
  const handleValidateAllRequired = useCallback(async () => {
    if (!currentSheet || isImporting) return

    // 검증 가능한 컬럼 찾기 (순서: 고객명 → 상품명 → 계약일 → 증권번호)
    const requiredTypes: Array<{ type: ValidationType; label: string }> = [
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

      // 검증 완료 - 컬럼 추가
      setValidatingColumns(prev => {
        const next = new Set(prev)
        next.add(colIndex)
        return next
      })

      // 검증 완료 이력에 추가 (누적)
      setValidatedColumnsHistory(prev => {
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

  // 문제 행 모두 선택
  const handleSelectProblematic = useCallback(() => {
    setSelectedRows(new Set(problematicRows))
  }, [problematicRows])

  // 문제 행 원클릭 삭제 (삭제 모드 없이 바로 삭제)
  const handleDeleteProblematicRows = useCallback(async () => {
    if (problematicRows.length === 0 || !currentSheet) return

    const beforeCount = currentSheet.data.length
    const rowsToDelete = new Set(problematicRows)

    // AppleConfirmModal로 삭제 확인
    const confirmed = await showConfirm({
      title: '문제 행 삭제',
      message: `${problematicRows.length}개의 문제 행을 삭제하시겠습니까?`,
      confirmText: '삭제',
      confirmStyle: 'destructive',
      cancelText: '취소'
    })
    if (!confirmed) return

    const selectedIndices = Array.from(rowsToDelete).sort((a, b) => a - b)
    const newData = currentSheet.data.filter((_, index) => !rowsToDelete.has(index))
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

    // productMatchResult 업데이트: 삭제된 행 제거 및 인덱스 재계산
    if (productMatchResult) {
      setProductMatchResult(prev => {
        if (!prev) return prev

        const remapIndex = (oldIndex: number): number => {
          let newIndex = oldIndex
          for (const deletedIdx of selectedIndices) {
            if (deletedIdx < oldIndex) {
              newIndex--
            }
          }
          return newIndex
        }

        const newOriginalMatch = new Map<number, string>()
        prev.originalMatch.forEach((objectId, rowIndex) => {
          if (!rowsToDelete.has(rowIndex)) {
            newOriginalMatch.set(remapIndex(rowIndex), objectId)
          }
        })

        const newModified = new Map<number, string>()
        prev.modified.forEach((objectId, rowIndex) => {
          if (!rowsToDelete.has(rowIndex)) {
            newModified.set(remapIndex(rowIndex), objectId)
          }
        })

        const newUnmatched = prev.unmatched
          .filter(rowIndex => !rowsToDelete.has(rowIndex))
          .map(rowIndex => remapIndex(rowIndex))

        return {
          ...prev,
          originalMatch: newOriginalMatch,
          modified: newModified,
          unmatched: newUnmatched
        }
      })
    }

    // 액션 로그 표시
    setActionLog(`✓ ${problematicRows.length}개 행 삭제 (${beforeCount}행 → ${afterCount}행)`)
  }, [problematicRows, currentSheet, activeSheetIndex, productMatchResult, showConfirm])

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

    // productMatchResult 업데이트: 삭제된 행 제거 및 인덱스 재계산
    if (productMatchResult) {
      setProductMatchResult(prev => {
        if (!prev) return prev

        // 인덱스 재매핑 함수: 삭제된 행보다 큰 인덱스는 삭제된 개수만큼 감소
        const remapIndex = (oldIndex: number): number => {
          let newIndex = oldIndex
          for (const deletedIdx of selectedIndices) {
            if (deletedIdx < oldIndex) {
              newIndex--
            }
          }
          return newIndex
        }

        // originalMatch 재계산
        const newOriginalMatch = new Map<number, string>()
        prev.originalMatch.forEach((objectId, rowIndex) => {
          if (!selectedRows.has(rowIndex)) {
            newOriginalMatch.set(remapIndex(rowIndex), objectId)
          }
        })

        // modified 재계산
        const newModified = new Map<number, string>()
        prev.modified.forEach((objectId, rowIndex) => {
          if (!selectedRows.has(rowIndex)) {
            newModified.set(remapIndex(rowIndex), objectId)
          }
        })

        // unmatched 재계산
        const newUnmatched = prev.unmatched
          .filter(rowIndex => !selectedRows.has(rowIndex))
          .map(rowIndex => remapIndex(rowIndex))

        return {
          ...prev,
          originalMatch: newOriginalMatch,
          modified: newModified,
          unmatched: newUnmatched
        }
      })
    }

    // 삭제 후 상태 초기화
    setSelectedRows(new Set())
    setIsDeleteMode(false)

    // 액션 로그 표시
    setActionLog(`✓ ${selectedRows.size}개 행 삭제 (${beforeCount}행 → ${afterCount}행)`)
  }, [selectedRows, currentSheet, activeSheetIndex, productMatchResult, showConfirm])

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

    // productMatchResult 업데이트: unmatched에서 제거하고 modified로 이동
    setProductMatchResult(prev => {
      if (!prev) return prev
      const newUnmatched = prev.unmatched.filter(idx => !rowsToUpdate.includes(idx))
      const newModified = new Map(prev.modified)
      rowsToUpdate.forEach(rowIdx => {
        newModified.set(rowIdx, productId)
      })
      return {
        ...prev,
        unmatched: newUnmatched,
        modified: newModified
      }
    })

    // 로그 메시지 표시
    setActionLog(`✓ "${originalProductName}" → "${productName}" (${rowsToUpdate.length}개 행)`)

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
      setActionLog(`✓ 셀 편집: "${oldValue}" → "${value}"`)
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

  // 계약 가져오기 버튼 클릭 - 확인 모달 열기
  const handleImportContracts = useCallback(() => {
    if (!currentSheet) return

    // 고객명 컬럼 찾기
    const customerNameColIndex = currentSheet.columns.findIndex(
      col => col && getValidationType(col) === 'customerName'
    )

    if (customerNameColIndex === -1) {
      showAlert({
        title: '컬럼 오류',
        message: '고객명 컬럼을 찾을 수 없습니다.',
        iconType: 'warning'
      })
      return
    }

    // 연락처 컬럼 찾기
    const contactColIndex = currentSheet.columns.findIndex(
      col => col && col.includes('연락처')
    )

    // 고유한 고객명 및 연락처 매핑 추출
    const customerNames = new Set<string>()
    const customerPhoneMap = new Map<string, string>() // 고객명 → 연락처
    currentSheet.data.forEach(row => {
      const name = cellToString(row[customerNameColIndex] as CellValue).trim()
      if (name) {
        customerNames.add(name)
        // 첫 번째로 발견된 연락처를 사용 (같은 고객이 여러 계약을 가질 수 있음)
        if (contactColIndex !== -1 && !customerPhoneMap.has(name)) {
          const phone = cellToString(row[contactColIndex] as CellValue).trim()
          if (phone) {
            customerPhoneMap.set(name, phone)
          }
        }
      }
    })

    const uniqueNames = Array.from(customerNames)
    if (uniqueNames.length === 0) {
      showAlert({
        title: '데이터 오류',
        message: '고객명 데이터가 없습니다.',
        iconType: 'warning'
      })
      return
    }

    // 확인 모달 열기 (customerPhoneMap을 전달하기 위해 state 저장)
    setCustomerPhoneMap(customerPhoneMap)
    setImportConfirmModal({
      isOpen: true,
      customerCount: uniqueNames.length,
      customerNames: uniqueNames
    })
  }, [currentSheet])

  // 계약 가져오기 확인 후 실행
  const handleConfirmImport = useCallback(async () => {
    const { customerNames } = importConfirmModal
    setImportConfirmModal({ isOpen: false, customerCount: 0, customerNames: [] })

    if (customerNames.length === 0 || !currentSheet || !user?._id) {
      if (!user?._id) {
        showAlert({
          title: '로그인 필요',
          message: '로그인이 필요합니다.',
          iconType: 'warning'
        })
      }
      return
    }

    setIsImporting(true)
    setImportProgress({ current: 0, total: 3, message: '1/3: 고객 생성 준비 중...' })

    let customerCreatedCount = 0
    let customerSkippedCount = 0
    const customerErrors: string[] = []

    try {
      // === 1단계: 고객 생성 ===
      const existingResponse = await CustomerService.getCustomers({ limit: 100000 })
      const existingNames = new Set(
        existingResponse.customers.map(c => c.personal_info?.name?.trim().toLowerCase()).filter(Boolean)
      )

      for (let i = 0; i < customerNames.length; i++) {
        const name = customerNames[i]!
        setImportProgress({
          current: 1,
          total: 3,
          message: `1/3: 고객 생성 중 (${i + 1}/${customerNames.length}) - ${name}`
        })

        if (existingNames.has(name.toLowerCase())) {
          customerSkippedCount++
          continue
        }

        try {
          // 연락처 정보 가져오기
          const phone = customerPhoneMap.get(name)
          const result = await CustomerService.createCustomer({
            personal_info: {
              name,
              ...(phone && { mobile_phone: phone })
            },
            insurance_info: {
              customer_type: '개인'  // 명시적으로 지정되지 않으면 개인 고객으로 생성
            },
            contracts: [],
            documents: [],
            consultations: []
          })
          if (import.meta.env.DEV) {
            console.log(`[고객 생성 성공] ${name}:`, result)
          }
          customerCreatedCount++
          existingNames.add(name.toLowerCase())
        } catch (err) {
          console.error(`[고객 생성 실패] ${name}:`, err)
          customerErrors.push(`${name}: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
        }
      }

      // === 2단계: Excel 데이터에서 계약 추출 ===
      setImportProgress({ current: 2, total: 3, message: '2/3: 계약 데이터 추출 중...' })

      // 컬럼 인덱스 찾기
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

      currentSheet.columns.forEach((colName, idx) => {
        if (!colName) return // null 체크
        for (const [korName, engName] of Object.entries(columnMapping)) {
          if (colName.includes(korName)) {
            colIndexMap[engName] = idx
            break
          }
        }
      })

      // 필수 컬럼 확인
      if (colIndexMap['policy_number'] === undefined) {
        showAlert({
          title: '컬럼 오류',
          message: '증권번호 컬럼을 찾을 수 없습니다.',
          iconType: 'warning'
        })
        return
      }

      // 계약 데이터 추출
      const contracts = currentSheet.data.map(row => {
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
          payment_day: getValue('payment_day') || null,  // 원본 텍스트 그대로 저장
          payment_cycle: getValue('payment_cycle') || null,
          payment_period: getValue('payment_period') || null,
          insured_person: getValue('insured_person') || null,
          payment_status: getValue('payment_status') || null
        }
      }).filter(c => c.policy_number) // 증권번호가 있는 행만

      if (contracts.length === 0) {
        setActionLog(`✓ 고객 생성: ${customerCreatedCount}명 | 건너뜀: ${customerSkippedCount}명 | 계약: 0건 (증권번호 없음)`)
        return
      }

      // === 3단계: 계약 일괄 등록 ===
      setImportProgress({ current: 3, total: 3, message: `3/3: 계약 등록 중 (${contracts.length}건)...` })

      const bulkResult = await ContractService.createContractsBulk({
        agent_id: user._id,
        contracts
      })

      // 최종 결과 메시지
      const contractResult = bulkResult.data
      let resultMsg = `✓ 가져오기 완료 | 고객: ${customerCreatedCount}명 생성, ${customerSkippedCount}명 건너뜀`
      resultMsg += ` | 계약: ${contractResult.insertedCount}건 등록, ${contractResult.skippedCount}건 건너뜀`

      if (customerErrors.length > 0 || contractResult.errorCount > 0) {
        resultMsg += ` | 오류: ${customerErrors.length + contractResult.errorCount}건`
      }

      // 중복 증권번호로 건너뛴 계약 상세 정보 표시
      if (contractResult.skipped && contractResult.skipped.length > 0) {
        const skippedPolicies = contractResult.skipped
          .map(s => s.contract?.policy_number)
          .filter(Boolean) as string[]
        if (skippedPolicies.length > 0) {
          const displayPolicies = skippedPolicies.slice(0, 5).join(', ')
          resultMsg += ` | 중복: ${displayPolicies}`
          if (contractResult.skippedCount > 5) {
            resultMsg += ` 외 ${contractResult.skippedCount - 5}건`
          }
        }
      }

      setActionLog(resultMsg)

      // 계약 등록 결과 저장 (Wizard 4단계 색상 표시용)
      setImportResult({
        total: contracts.length,
        inserted: contractResult.insertedCount,
        skipped: contractResult.skippedCount,
        errors: contractResult.errorCount
      })

      if (customerErrors.length > 0) {
        console.error('고객 생성 오류:', customerErrors)
      }

      // 가져오기 완료 후 이벤트 발생 (대시보드 동기화)
      window.dispatchEvent(new CustomEvent('customerChanged'))
      window.dispatchEvent(new CustomEvent('contractChanged'))

    } catch (err) {
      console.error('가져오기 오류:', err)
      showAlert({
        title: '가져오기 오류',
        message: `가져오기 중 오류 발생: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
        iconType: 'error'
      })
      // 오류 발생 시 결과 초기화 (완전 실패)
      setImportResult({
        total: 0,
        inserted: 0,
        skipped: 0,
        errors: 1
      })
    } finally {
      setIsImporting(false)
      setImportProgress(null)
    }
  }, [importConfirmModal, currentSheet, user, customerPhoneMap])

  // 데이터 행 번호
  const getExcelRowNumber = (dataIndex: number) => dataIndex + 2

  // Wizard 단계 계산
  const wizardStep = useMemo(() => {
    if (!currentSheet) return null

    // 필수 컬럼 타입
    const requiredTypes = ['customerName', 'productName', 'contractDate', 'policyNumber']

    // 현재 시트에서 필수 컬럼 찾기
    const requiredColIndices: number[] = []
    currentSheet.columns.forEach((col, idx) => {
      if (!col) return // null 체크
      const type = getValidationType(col)
      if (requiredTypes.includes(type)) {
        requiredColIndices.push(idx)
      }
    })

    // 검증된 필수 컬럼 수 (이력 기반 - 컬럼별 클릭으로도 누적됨)
    const validatedRequiredCount = requiredColIndices.filter(idx => validatedColumnsHistory.has(idx)).length

    // 검증 진행 중인지
    const isValidating = validatingInProgress.size > 0

    // 등록 결과 상태 계산 (step 4 색상용)
    // 'success': 100% 성공 (녹색), 'partial': 부분 성공 (주황색), 'error': 완전 실패 (빨간색), null: 아직 등록 안함
    let resultStatus: 'success' | 'partial' | 'error' | null = null
    if (importResult) {
      if (importResult.inserted === 0 && importResult.total > 0) {
        // 0% 등록 = 완전 실패
        resultStatus = 'error'
      } else if (importResult.inserted === importResult.total && importResult.total > 0) {
        // 100% 등록 = 완전 성공
        resultStatus = 'success'
      } else if (importResult.inserted > 0) {
        // 부분 등록
        resultStatus = 'partial'
      } else if (importResult.errors > 0) {
        // 오류만 있는 경우
        resultStatus = 'error'
      }
    }

    // Step 결정
    if (validatedRequiredCount === 0) {
      // 아직 검증 시작 안함
      return { step: 1, label: '필수컬럼검증', message: "'필수컬럼검증' 버튼을 클릭하여 데이터를 검증하세요.", resultStatus: null }
    } else if (isValidating) {
      // 검증 진행 중
      return { step: 2, label: '검증 중', message: '데이터를 검증하고 있습니다. 잠시만 기다려주세요...', resultStatus: null }
    } else if (problematicRows.length > 0) {
      // 문제 발견
      return { step: 3, label: '데이터 수정', message: `${problematicRows.length}개 문제 발견 → '검증 초기화' 클릭 → 컬럼별로 검증하며 수정`, resultStatus: null }
    } else if (validatedRequiredCount === requiredColIndices.length && requiredColIndices.length === requiredTypes.length) {
      // 모든 필수 컬럼(4개) 검증 완료, 문제 없음
      // 등록 결과가 있으면 결과 메시지 표시
      if (importResult && resultStatus) {
        let message = ''
        if (resultStatus === 'success') {
          message = `${importResult.inserted}건 모두 등록 완료`
        } else if (resultStatus === 'partial') {
          message = `${importResult.inserted}/${importResult.total}건 등록 (${importResult.skipped}건은 이미 등록된 증권번호)`
        } else {
          message = `0/${importResult.total}건 등록 (모두 이미 등록된 증권번호)`
        }
        return { step: 4, label: '등록', message, resultStatus }
      }
      return { step: 4, label: '일괄등록', message: "'계약 일괄등록' 버튼을 클릭하여 계약 데이터를 등록하세요.", resultStatus: null }
    } else if (requiredColIndices.length < requiredTypes.length) {
      // 필수 4개 컬럼이 없는 시트 (개인/법인 등)
      const missingCount = requiredTypes.length - requiredColIndices.length
      return { step: 1, label: '컬럼 부족', message: `필수 컬럼 ${missingCount}개 누락. 계약 데이터가 있는 시트를 선택하세요.`, resultStatus: null }
    } else {
      // 일부 필수 컬럼만 검증됨
      return { step: 2, label: '검증 계속', message: `필수 컬럼 ${validatedRequiredCount}/${requiredColIndices.length}개 검증 완료. 계속 검증하세요.`, resultStatus: null }
    }
  }, [currentSheet, validatedColumnsHistory, validatingInProgress.size, problematicRows.length, importResult])

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
      return `${result.empties.length}개 오류\n• 빈 값\n• 숫자만 있는 경우\n• 특수문자 포함\n• 더미 데이터 (테스트, 홍길동 등)\n→ 셀을 직접 수정하세요`
    }

    return ''
  }

  // 컬럼 검증 배지 렌더링
  const renderColumnBadge = (colIndex: number, columnName: string) => {
    if (!columnName) return null
    const type = getValidationType(columnName)

    // 상품명 검증 결과 표시
    if (type === 'productName' && productMatchResult && productNameColumnIndex === colIndex) {
      const originalCount = productMatchResult.originalMatch.size
      const modifiedCount = productMatchResult.modified.size
      const unmatchedCount = productMatchResult.unmatched.length
      const tooltip = getValidationTooltip(type, null, productMatchResult)

      if (unmatchedCount === 0) {
        return (
          <Tooltip content={tooltip}>
            <span className="excel-refiner__th-badge excel-refiner__th-badge--success">✓ {originalCount + modifiedCount}</span>
          </Tooltip>
        )
      } else {
        return (
          <Tooltip content={tooltip}>
            <span className="excel-refiner__th-badge excel-refiner__th-badge--error">{unmatchedCount} 미매칭</span>
          </Tooltip>
        )
      }
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
              {/* 엑셀 표준 포맷 가이드 - 상단 중앙 배치 (클릭시 샘플 다운로드) */}
              <a
                href="/일괄등록_샘플.xlsx"
                download="일괄등록_샘플.xlsx"
                className="excel-refiner__format-guide excel-refiner__format-guide--clickable"
              >
                <div className="excel-refiner__format-guide-header">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                    <line x1="2" y1="5.5" x2="14" y2="5.5" stroke="currentColor" strokeWidth="1.2"/>
                    <line x1="5.5" y1="2" x2="5.5" y2="14" stroke="currentColor" strokeWidth="1.2"/>
                    <line x1="9" y1="2" x2="9" y2="14" stroke="currentColor" strokeWidth="1.2"/>
                  </svg>
                  <span>엑셀 표준 포맷 예시</span>
                </div>
                <div className="excel-refiner__format-table-wrapper">
                  <table className="excel-refiner__format-table">
                    <thead>
                      <tr>
                        <th className="excel-refiner__format-th excel-refiner__format-th--required">고객명</th>
                        <th className="excel-refiner__format-th excel-refiner__format-th--required">상품명</th>
                        <th className="excel-refiner__format-th excel-refiner__format-th--required">계약일</th>
                        <th className="excel-refiner__format-th excel-refiner__format-th--required">증권번호</th>
                        <th className="excel-refiner__format-th">보험료(원)</th>
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
                        <td className="excel-refiner__format-td">무배당프로미라이프</td>
                        <td className="excel-refiner__format-td">2024-01-15</td>
                        <td className="excel-refiner__format-td">1234567890</td>
                        <td className="excel-refiner__format-td excel-refiner__format-td--right">150,000</td>
                        <td className="excel-refiner__format-td">15일</td>
                        <td className="excel-refiner__format-td">월납</td>
                        <td className="excel-refiner__format-td">20년</td>
                        <td className="excel-refiner__format-td">홍길동</td>
                        <td className="excel-refiner__format-td">정상</td>
                      </tr>
                      <tr>
                        <td className="excel-refiner__format-td">김철수</td>
                        <td className="excel-refiner__format-td">The건강한종신보험</td>
                        <td className="excel-refiner__format-td">2023-06-20</td>
                        <td className="excel-refiner__format-td">9876543210</td>
                        <td className="excel-refiner__format-td excel-refiner__format-td--right">200,000</td>
                        <td className="excel-refiner__format-td">25일</td>
                        <td className="excel-refiner__format-td">월납</td>
                        <td className="excel-refiner__format-td">종신</td>
                        <td className="excel-refiner__format-td">김철수</td>
                        <td className="excel-refiner__format-td">정상</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="excel-refiner__format-legend">
                  <span className="excel-refiner__format-legend-item excel-refiner__format-legend-item--required">■ 필수 컬럼</span>
                  <span className="excel-refiner__format-legend-item">□ 선택 컬럼</span>
                  <span className="excel-refiner__format-legend-item excel-refiner__format-legend-item--download">클릭하여 샘플 다운로드</span>
                </div>
              </a>

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
            {/* 툴바 */}
            <div className="excel-refiner__toolbar">
              <div className="excel-refiner__toolbar-left">
                <span className="excel-refiner__filename">{fileName}</span>
                <span className="excel-refiner__row-count">
                  ({currentSheet.data.length}행)
                </span>
              </div>
              <div className="excel-refiner__toolbar-right">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCloseExcel}
                >
                  엑셀닫기
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveRefined}
                >
                  다운로드
                </Button>
              </div>
            </div>

            {/* 시트 탭 */}
            {sheets.length > 1 && (
              <div className="excel-refiner__tabs">
                {sheets.map((sheet, index) => (
                  <button
                    key={sheet.name}
                    type="button"
                    className={`excel-refiner__tab ${index === activeSheetIndex ? 'excel-refiner__tab--active' : ''}`}
                    onClick={() => handleSheetChange(index)}
                  >
                    {sheet.name}
                  </button>
                ))}
              </div>
            )}

            {/* Wizard 안내 - 파일 로드 후 단계별 가이드 */}
            {wizardStep && (
              <div className={`excel-refiner__wizard excel-refiner__wizard--step-${wizardStep.step}`}>
                <div className="excel-refiner__wizard-steps">
                  <div className={`excel-refiner__wizard-step ${wizardStep.step >= 1 ? 'excel-refiner__wizard-step--active' : ''} ${wizardStep.step > 1 ? 'excel-refiner__wizard-step--completed' : ''}`}>
                    <span className="excel-refiner__wizard-step-number">1</span>
                    <span className="excel-refiner__wizard-step-label">검증</span>
                  </div>
                  <div className="excel-refiner__wizard-connector" />
                  <div className={`excel-refiner__wizard-step ${wizardStep.step >= 2 ? 'excel-refiner__wizard-step--active' : ''} ${wizardStep.step > 2 ? 'excel-refiner__wizard-step--completed' : ''}`}>
                    <span className="excel-refiner__wizard-step-number">2</span>
                    <span className="excel-refiner__wizard-step-label">진행</span>
                  </div>
                  <div className="excel-refiner__wizard-connector" />
                  <div className={`excel-refiner__wizard-step ${wizardStep.step >= 3 ? 'excel-refiner__wizard-step--active' : ''} ${wizardStep.step > 3 ? 'excel-refiner__wizard-step--completed' : ''}`}>
                    <span className="excel-refiner__wizard-step-number">3</span>
                    <span className="excel-refiner__wizard-step-label">수정</span>
                  </div>
                  <div className="excel-refiner__wizard-connector" />
                  <div className={`excel-refiner__wizard-step ${wizardStep.step >= 4 ? 'excel-refiner__wizard-step--active' : ''} ${wizardStep.resultStatus ? `excel-refiner__wizard-step--result-${wizardStep.resultStatus}` : ''}`}>
                    <span className="excel-refiner__wizard-step-number">
                      {wizardStep.resultStatus === 'success' ? '✓' : wizardStep.resultStatus === 'error' ? '✕' : '4'}
                    </span>
                    <span className="excel-refiner__wizard-step-label">
                      {wizardStep.resultStatus && importResult
                        ? `등록 ${Math.round((importResult.inserted / (importResult.total || 1)) * 100)}%`
                        : '등록'}
                    </span>
                  </div>
                </div>
                <div className={`excel-refiner__wizard-message ${wizardStep.resultStatus ? `excel-refiner__wizard-message--${wizardStep.resultStatus}` : ''}`}>
                  <span className="excel-refiner__wizard-message-icon">
                    {wizardStep.step === 1 && '👆'}
                    {wizardStep.step === 2 && '⏳'}
                    {wizardStep.step === 3 && '⚠️'}
                    {wizardStep.step === 4 && !wizardStep.resultStatus && '✅'}
                    {wizardStep.step === 4 && wizardStep.resultStatus === 'success' && '🎉'}
                    {wizardStep.step === 4 && wizardStep.resultStatus === 'partial' && '⚠️'}
                    {wizardStep.step === 4 && wizardStep.resultStatus === 'error' && '❌'}
                  </span>
                  <span className="excel-refiner__wizard-message-text">{wizardStep.message}</span>
                </div>
              </div>
            )}

            {/* 검증 안내 */}
            <div className="excel-refiner__validation">
              <div className="excel-refiner__validation-header">
                <span>컬럼 헤더를 클릭하여 검증하세요</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleValidateAllRequired}
                  title="고객명, 상품명, 계약일, 증권번호 컬럼을 순차 검증합니다"
                >
                  필수컬럼검증
                </Button>
                {validatingColumns.size > 0 && (
                  <>
                    <span className="excel-refiner__validation-column">
                      (선택: {validatingColumns.size}개 컬럼)
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleClearValidation}
                    >
                      검증 초기화
                    </Button>
                  </>
                )}
              </div>

              {validatingColumns.size > 0 && (
                <div className="excel-refiner__validation-result">
                  {wizardStep?.step === 4 && problematicRows.length === 0 ? (
                    <>
                      <div className="excel-refiner__validation-status excel-refiner__validation-status--success">
                        모든 검증 통과
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleImportContracts}
                        disabled={isImporting}
                      >
                        {isImporting ? '등록 중...' : '계약 일괄등록'}
                      </Button>
                    </>
                  ) : problematicRows.length > 0 ? (
                    <div className="excel-refiner__validation-status excel-refiner__validation-status--error">
                      문제 발견: {problematicRows.length}행
                    </div>
                  ) : null}
                </div>
              )}

              {/* 상품명 검증 색상 범례 */}
              {productMatchResult && (
                <div className="excel-refiner__validation-legend">
                  <span
                    className="excel-refiner__legend-label"
                    title="수작업으로 입력하여 틀릴 수 있는 상품명을 보험상품 DB에 등록된 정확한 이름과 비교 검증합니다."
                  >상품명 검증:</span>
                  <span
                    className={`excel-refiner__legend-item excel-refiner__legend-item--original${productStatusFilter === 'original' ? ' excel-refiner__legend-item--active' : ''}`}
                    title="보험상품 DB에 등록된 상품명과 정확히 일치합니다. 수정이 필요 없습니다. (클릭하면 맨 위로 정렬)"
                    onClick={() => setProductStatusFilter(productStatusFilter === 'original' ? null : 'original')}
                  >정확 매칭 ({productMatchResult.originalMatch.size})</span>
                  <span
                    className={`excel-refiner__legend-item excel-refiner__legend-item--modified${productStatusFilter === 'modified' ? ' excel-refiner__legend-item--active' : ''}`}
                    title="공백이나 대소문자 차이가 있었지만 DB 상품명으로 자동 수정되었습니다. (클릭하면 맨 위로 정렬)"
                    onClick={() => setProductStatusFilter(productStatusFilter === 'modified' ? null : 'modified')}
                  >수정 매칭 ({productMatchResult.modified.size})</span>
                  <span
                    className={`excel-refiner__legend-item excel-refiner__legend-item--unmatched${productStatusFilter === 'unmatched' ? ' excel-refiner__legend-item--active' : ''}`}
                    title="보험상품 DB에서 찾을 수 없는 상품명입니다. 상품명을 확인해주세요. (클릭하면 맨 위로 정렬)"
                    onClick={() => setProductStatusFilter(productStatusFilter === 'unmatched' ? null : 'unmatched')}
                  >미매칭 ({productMatchResult.unmatched.length})</span>
                </div>
              )}
            </div>

            {/* 액션 바 */}
            <div className="excel-refiner__actions">
              <div className="excel-refiner__actions-left">
                {/* 삭제 모드 토글 버튼 - 테이블 바로 위에 배치 */}
                <button
                  type="button"
                  className={`excel-refiner__delete-mode-btn ${isDeleteMode ? 'excel-refiner__delete-mode-btn--active' : ''}`}
                  onClick={handleToggleDeleteMode}
                  title={isDeleteMode ? '삭제 완료' : '행 삭제'}
                >
                  {isDeleteMode ? (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
                {/* 삭제 모드가 아닐 때: 문제 행 원클릭 삭제 버튼 */}
                {!isDeleteMode && problematicRows.length > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteProblematicRows}
                  >
                    문제 행 삭제 ({problematicRows.length})
                  </Button>
                )}
                {/* 삭제 모드: 선택 개수 + 삭제 버튼 */}
                {isDeleteMode && (
                  <>
                    <span className="excel-refiner__selected-count">{selectedRows.size}개 선택됨</span>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDeleteSelected}
                      disabled={selectedRows.size === 0}
                    >
                      삭제
                    </Button>
                  </>
                )}
                {/* 삭제 모드일 때 문제 행 선택 버튼 표시 */}
                {isDeleteMode && problematicRows.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSelectProblematic}
                  >
                    문제 행 선택 ({problematicRows.length})
                  </Button>
                )}
                {isDeleteMode && selectedRows.size > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearSelection}
                  >
                    선택 해제
                  </Button>
                )}
              </div>
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
                  {actionLog}
                  <button
                    type="button"
                    className="excel-refiner__action-log-clear"
                    onClick={() => setActionLog(null)}
                    title="로그 지우기"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* 데이터 테이블 */}
            <div className="excel-refiner__table-container">
              <table className="excel-refiner__table">
                <thead>
                  <tr>
                    {/* 삭제 모드일 때 체크박스 컬럼 */}
                    {isDeleteMode && (
                      <th className="excel-refiner__th excel-refiner__th--checkbox">
                        <input
                          type="checkbox"
                          checked={selectedRows.size === sortedDataWithIndices.length && sortedDataWithIndices.length > 0}
                          onChange={handleSelectAll}
                          title="전체 선택/해제"
                        />
                      </th>
                    )}
                    <th className={`excel-refiner__th excel-refiner__th--row-num ${sortColumn === -1 ? 'excel-refiner__th--sorted' : ''}`}>
                      <div className="excel-refiner__th-content">
                        <span className="excel-refiner__th-text">#</span>
                        <button
                          type="button"
                          className="excel-refiner__sort-btn"
                          onClick={(e) => handleSortClick(-1, e)}
                          title={sortColumn === -1 ? (sortDirection === 'asc' ? '내림차순 정렬' : '오름차순 정렬') : '오름차순 정렬'}
                        >
                          {sortColumn === -1 ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
                        </button>
                      </div>
                    </th>
                    {currentSheet.columns.map((col, index) => {
                      const isInProgress = validatingInProgress.has(index)
                      const isValidated = validatingColumns.has(index)
                      const result = columnValidationResults.get(index)
                      const hasIssues = result && (!result.valid || result.duplicates.length > 0)
                      const type = col ? getValidationType(col) : 'default'
                      const isValidatable = type !== 'default'
                      const isSorted = sortColumn === index

                      // 검증 가능한 컬럼만 검증 클릭 스타일 적용
                      let thClassName = 'excel-refiner__th excel-refiner__th--sortable'
                      if (isValidatable) {
                        thClassName += ' excel-refiner__th--clickable'
                      }
                      if (isInProgress) {
                        thClassName += ' excel-refiner__th--validating'
                      } else if (isValidated) {
                        // 상품명 칼럼은 미매칭 여부에 따라 error/success 구분
                        if (type === 'productName' && productMatchResult && productNameColumnIndex === index) {
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

                      return (
                        <th
                          key={index}
                          className={thClassName}
                          onClick={isValidatable ? () => handleColumnClick(index, col) : undefined}
                          title={isValidatable ? `클릭하여 검증 (${type === 'policyNumber' ? '증권번호' : type === 'customerName' ? '고객명' : type === 'productName' ? '상품명' : '계약일'} 검증)` : '클릭하여 정렬'}
                        >
                          <div className="excel-refiner__th-content">
                            {lastClickedColumn === index && (
                              <span className="excel-refiner__th-last-clicked" title="마지막 클릭">
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                  <circle cx="8" cy="8" r="4" />
                                </svg>
                              </span>
                            )}
                            <span className="excel-refiner__th-text">{col || `열 ${index + 1}`}</span>
                            {isInProgress && <span className="excel-refiner__th-badge excel-refiner__th-badge--validating">...</span>}
                            {!isInProgress && renderColumnBadge(index, col)}
                            <button
                              type="button"
                              className="excel-refiner__sort-btn"
                              onClick={(e) => handleSortClick(index, e)}
                              title={isSorted ? (sortDirection === 'asc' ? '내림차순 정렬' : '오름차순 정렬') : '오름차순 정렬'}
                            >
                              {isSorted ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
                            </button>
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

                    return (
                      <tr
                        key={originalIndex}
                        className={`excel-refiner__tr excel-refiner__tr--${status} ${isSelected ? 'excel-refiner__tr--selected' : ''} ${isDeleteMode ? 'excel-refiner__tr--delete-mode' : ''}`}
                        onClick={() => {
                          // 삭제 모드일 때만 행 클릭으로 선택
                          if (isDeleteMode) {
                            handleDeleteSelect(originalIndex)
                          }
                        }}
                      >
                        {/* 삭제 모드일 때 체크박스 */}
                        {isDeleteMode && (
                          <td className="excel-refiner__td excel-refiner__td--checkbox">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleDeleteSelect(originalIndex)}
                              onClick={(e) => e.stopPropagation()}
                              title={`행 ${getExcelRowNumber(originalIndex)} 선택`}
                            />
                          </td>
                        )}
                        <td className="excel-refiner__td excel-refiner__td--row-num">
                          {getExcelRowNumber(originalIndex)}
                        </td>
                        {currentSheet.columns.map((colName, colIndex) => {
                          const isRightAlign = isRightAlignColumn(colName)
                          let tdClassName = 'excel-refiner__td'
                          if (isRightAlign) {
                            tdClassName += ' excel-refiner__td--right'
                          }
                          if (validatingColumns.has(colIndex)) {
                            tdClassName += ' excel-refiner__td--validation'
                          }

                          // 상품명 칼럼에만 매칭 상태 색상 적용
                          let matchedProductId: string | null = null
                          let isUnmatchedProduct = false
                          if (colIndex === productNameColumnIndex && productMatchResult) {
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

                          const cellValue = cellToString(row[colIndex] as CellValue)

                          // 현재 셀이 편집 중인지 확인
                          const isEditing = editingCell?.rowIndex === originalIndex && editingCell?.colIndex === colIndex

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
                              handleCellDoubleClick(originalIndex, colIndex, cellValue)
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
                              key={colIndex}
                              className={tdClassName}
                              title={cellTitle}
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

      {/* 상태바 */}
      <footer className="excel-refiner__footer">
        <span>
          {currentSheet
            ? `${currentSheet.data.length}행 | 선택: ${selectedRows.size}행`
            : '파일을 드래그하여 시작하세요'}
        </span>
      </footer>

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

      {/* 계약 일괄등록 확인 모달 */}
      <Modal
        visible={importConfirmModal.isOpen}
        onClose={() => setImportConfirmModal({ isOpen: false, customerCount: 0, customerNames: [] })}
        title="계약 일괄등록"
        size="sm"
        backdropClosable
      >
        <div className="excel-refiner__confirm-modal">
          <p className="excel-refiner__confirm-message">
            <strong>{importConfirmModal.customerCount}명</strong>의 고객을 생성하시겠습니까?
          </p>
          <p className="excel-refiner__confirm-note">
            동일한 이름의 기존 고객이 있으면 생성하지 않습니다.
          </p>
          <div className="excel-refiner__confirm-actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setImportConfirmModal({ isOpen: false, customerCount: 0, customerNames: [] })}
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
    </div>
  )
}

export default ExcelRefiner
