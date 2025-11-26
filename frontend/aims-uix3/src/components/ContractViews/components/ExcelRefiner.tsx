/**
 * Excel Refiner Component for ContractImportView
 * @since 1.0.0
 *
 * aims-uix3 공용 컴포넌트 사용:
 * - Button: @/shared/ui/Button
 * - Modal: @/shared/ui/Modal
 */

import { useState, useCallback, useMemo } from 'react'
import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Modal'
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
  type InsuranceProduct
} from '@aims/excel-refiner-core'
import { ProductSearchModal } from './ProductSearchModal'
import './ExcelRefiner.css'

// 우측 정렬이 필요한 컬럼명 패턴
const RIGHT_ALIGN_PATTERNS = ['증권번호', '보험료', '이체일', '납입주기', '납입기간', '납입상태', '연락처', '계약일', '피보험자']

function isRightAlignColumn(columnName: string): boolean {
  if (!columnName) return false
  return RIGHT_ALIGN_PATTERNS.some(pattern => columnName.includes(pattern))
}

export function ExcelRefiner() {
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
      alert('엑셀 파일(.xlsx, .xls)만 지원합니다.')
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
      // 상품명 검증 상태 초기화
      setProductMatchResult(null)
      setProductNameColumnIndex(null)
      setProductStatusFilter(null)
      // 정렬 상태 초기화
      setSortColumn(null)
      setSortDirection('asc')
      // 삭제 모드 해제
      setIsDeleteMode(false)

      // 액션 로그 표시
      const totalRows = parsedSheets.reduce((sum, s) => sum + s.data.length, 0)
      setActionLog(`✓ "${file.name}" 로드 완료 (${parsedSheets.length}개 시트, ${totalRows}행)`)
    } catch (error) {
      console.error('파일 파싱 오류:', error)
      alert('파일을 읽는 중 오류가 발생했습니다.')
    }
  }, [])

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
  }, [])

  // 시트 탭 변경
  const handleSheetChange = useCallback((index: number) => {
    setActiveSheetIndex(index)
    setSelectedRows(new Set())
    setValidatingColumns(new Set())
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

  // 컬럼 헤더 클릭 - 검증 활성화 (해제는 별도 버튼으로)
  const handleColumnClick = useCallback(async (colIndex: number, columnName: string) => {
    // 검증 로직이 정의된 컬럼만 클릭 가능
    const type = getValidationType(columnName)
    if (type === 'default') return

    // 마지막으로 클릭된 컬럼 표시
    setLastClickedColumn(colIndex)

    // 이미 검증된 컬럼이면 무시
    if (validatingColumns.has(colIndex)) return

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

        // 검증 컬럼에 추가
        setValidatingColumns(prev => {
          const next = new Set(prev)
          next.add(colIndex)
          return next
        })
      } catch (error) {
        console.error('상품명 검증 오류:', error)
        alert('상품명 검증 중 오류가 발생했습니다.')
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
    setProductMatchResult(null)
    setProductNameColumnIndex(null)
  }, [])

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

  // 선택 해제
  const handleClearSelection = useCallback(() => {
    setSelectedRows(new Set())
  }, [])

  // 선택 행 삭제 (two-step confirmation)
  const handleDeleteSelected = useCallback(() => {
    if (selectedRows.size === 0 || !currentSheet) return

    const selectedIndices = Array.from(selectedRows).sort((a, b) => a - b)
    const rowNumbers = selectedIndices.map(i => i + 2)
    const beforeCount = currentSheet.data.length

    // 1단계: 경고 메시지
    const warning = window.confirm(
      `⚠️ 경고: 선택한 ${selectedRows.size}개의 행을 삭제합니다.\n\n` +
      `삭제할 행 번호: ${rowNumbers.join(', ')}\n` +
      `현재 총 행 수: ${beforeCount}행\n\n` +
      `계속하시겠습니까?`
    )
    if (!warning) return

    // 2단계: 최종 확인
    const finalConfirm = window.confirm(
      `🗑️ 최종 확인\n\n` +
      `정말로 ${selectedRows.size}개의 행을 삭제하시겠습니까?\n\n` +
      `[확인]을 누르면 즉시 삭제됩니다.`
    )
    if (!finalConfirm) return

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
  }, [selectedRows, currentSheet, activeSheetIndex, productMatchResult])

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

  // 데이터 행 번호
  const getExcelRowNumber = (dataIndex: number) => dataIndex + 2

  // 컬럼 검증 배지 렌더링
  const renderColumnBadge = (colIndex: number, columnName: string) => {
    const type = getValidationType(columnName)

    // 상품명 검증 결과 표시
    if (type === 'productName' && productMatchResult && productNameColumnIndex === colIndex) {
      const originalCount = productMatchResult.originalMatch.size
      const modifiedCount = productMatchResult.modified.size
      const unmatchedCount = productMatchResult.unmatched.length

      if (unmatchedCount === 0) {
        return <span className="excel-refiner__th-badge excel-refiner__th-badge--success">✓ {originalCount + modifiedCount}</span>
      } else {
        return <span className="excel-refiner__th-badge excel-refiner__th-badge--error">{unmatchedCount} 미매칭</span>
      }
    }

    const result = columnValidationResults.get(colIndex)
    if (!result) return null

    const issueCount = result.empties.length + result.duplicates.length

    if (result.valid && result.duplicates.length === 0) {
      return <span className="excel-refiner__th-badge excel-refiner__th-badge--success">✓</span>
    } else {
      const label = type === 'customerName'
        ? `${result.empties.length}오류 ${result.duplicates.length}경고`
        : `${issueCount}`
      return <span className="excel-refiner__th-badge excel-refiner__th-badge--error">{label}</span>
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
            <div className="excel-refiner__dropzone-content">
              <svg
                className="excel-refiner__dropzone-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
              <p>엑셀 파일을 여기에 드래그하거나</p>
              <label className="excel-refiner__file-label">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="excel-refiner__file-input"
                />
                <span>파일 선택</span>
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

            {/* 검증 안내 */}
            <div className="excel-refiner__validation">
              <div className="excel-refiner__validation-header">
                <span>컬럼 헤더를 클릭하여 검증하세요</span>
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
                  {problematicRows.length === 0 ? (
                    <div className="excel-refiner__validation-status excel-refiner__validation-status--success">
                      모든 검증 통과
                    </div>
                  ) : (
                    <div className="excel-refiner__validation-status excel-refiner__validation-status--error">
                      문제 발견: {problematicRows.length}행
                    </div>
                  )}
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
              {/* 액션 로그 메시지 */}
              {actionLog && (
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
                      const type = getValidationType(col)
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
    </div>
  )
}

export default ExcelRefiner
