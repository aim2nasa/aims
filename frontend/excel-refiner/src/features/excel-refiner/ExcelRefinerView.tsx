/**
 * Excel Refiner Main View
 * 엑셀 파일 정제 도구의 메인 컴포넌트
 */

import { useState, useCallback, useMemo } from 'react'
import { Button } from '@/shared/ui'
import { parseExcel, exportExcel, isValidExcelFile, getRefinedFileName, cellToString } from './utils/excel'
import { validateColumn, getValidationType, getRowStatus, getProblematicRows, validateProductNames } from './hooks/useValidation'
import type { SheetData, CellValue, ValidationResult, ProductMatchResult } from './types/excel'
import './ExcelRefinerView.css'

// 우측 정렬이 필요한 컬럼명 패턴
const RIGHT_ALIGN_PATTERNS = ['증권번호', '보험료', '이체일', '납입주기', '납입기간', '납입상태', '연락처', '계약일', '피보험자']

function isRightAlignColumn(columnName: string): boolean {
  if (!columnName) return false
  return RIGHT_ALIGN_PATTERNS.some(pattern => columnName.includes(pattern))
}

export function ExcelRefinerView() {
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

  // 상품명 검증 결과 (행 인덱스 → ObjectId 매칭)
  const [productMatchResult, setProductMatchResult] = useState<ProductMatchResult | null>(null)
  const [productNameColumnIndex, setProductNameColumnIndex] = useState<number | null>(null)

  // 상품명 상태 필터 (범례 클릭 시 해당 상태 행을 맨 위로)
  const [productStatusFilter, setProductStatusFilter] = useState<'original' | 'modified' | 'unmatched' | null>(null)

  // 현재 시트 데이터
  const currentSheet = sheets[activeSheetIndex] || null

  // 컬럼별 검증 결과 계산
  const columnValidationResults = useMemo(() => {
    if (!currentSheet?.data || validatingColumns.size === 0) {
      return new Map<number, ValidationResult>()
    }

    const results = new Map<number, ValidationResult>()
    validatingColumns.forEach(colIndex => {
      if (colIndex >= 0 && colIndex < currentSheet.columns.length) {
        const columnName = currentSheet.columns[colIndex]
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
    // 문제 행 우선 정렬 (검증 활성화시, 상품명 필터가 없을 때만)
    else if (problematicRows.length > 0) {
      const problematicSet = new Set(problematicRows)
      indexed.sort((a, b) => {
        const aProblematic = problematicSet.has(a.originalIndex)
        const bProblematic = problematicSet.has(b.originalIndex)
        if (aProblematic && !bProblematic) return -1
        if (!aProblematic && bProblematic) return 1
        return 0
      })
    }

    return indexed
  }, [currentSheet?.data, problematicRows, sortColumn, sortDirection, productStatusFilter, productMatchResult])

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
            const newData = [...updated[activeSheetIndex].data]

            // modified된 상품명만 정확한 상품명으로 대체
            result.modified.forEach((objectId, rowIndex) => {
              const originalProductName = idToName.get(objectId)
              if (originalProductName && newData[rowIndex]) {
                newData[rowIndex] = [...newData[rowIndex]]
                newData[rowIndex][colIndex] = originalProductName
              }
            })

            updated[activeSheetIndex] = {
              ...updated[activeSheetIndex],
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

  // 마지막 클릭한 행 (정렬된 뷰 기준)
  const [lastClickedViewIndex, setLastClickedViewIndex] = useState<number | null>(null)

  // 행 선택 토글 (정렬된 뷰 기준으로 범위 선택)
  const handleRowSelect = useCallback((originalIndex: number, viewIndex: number, e: React.MouseEvent) => {
    setSelectedRows(prev => {
      const next = new Set(prev)

      if (e.shiftKey && lastClickedViewIndex !== null) {
        // 정렬된 뷰 기준으로 범위 선택
        const start = Math.min(lastClickedViewIndex, viewIndex)
        const end = Math.max(lastClickedViewIndex, viewIndex)
        for (let i = start; i <= end; i++) {
          if (sortedDataWithIndices[i]) {
            next.add(sortedDataWithIndices[i].originalIndex)
          }
        }
      } else if (e.ctrlKey || e.metaKey) {
        if (next.has(originalIndex)) {
          next.delete(originalIndex)
        } else {
          next.add(originalIndex)
        }
      } else {
        next.clear()
        next.add(originalIndex)
      }

      return next
    })
    setLastClickedViewIndex(viewIndex)
  }, [lastClickedViewIndex, sortedDataWithIndices])

  // 문제 행 모두 선택
  const handleSelectProblematic = useCallback(() => {
    setSelectedRows(new Set(problematicRows))
  }, [problematicRows])

  // 선택 해제
  const handleClearSelection = useCallback(() => {
    setSelectedRows(new Set())
  }, [])

  // 선택 행 삭제
  const handleDeleteSelected = useCallback(() => {
    if (selectedRows.size === 0 || !currentSheet) return

    const selectedIndices = Array.from(selectedRows).sort((a, b) => a - b)
    const rowNumbers = selectedIndices.map(i => i + 2)
    const beforeCount = currentSheet.data.length

    const confirmed = window.confirm(
      `선택한 ${selectedRows.size}개 행을 삭제하시겠습니까?\n\n삭제할 행 번호: ${rowNumbers.join(', ')}\n현재 총 행 수: ${beforeCount}행`
    )

    if (!confirmed) return

    const newData = currentSheet.data.filter((_, index) => !selectedRows.has(index))
    const afterCount = newData.length

    alert(`삭제 완료!\n\n삭제된 행: ${rowNumbers.join(', ')} (${selectedRows.size}개)\n이전: ${beforeCount}행 → 이후: ${afterCount}행`)

    setSheets(prev => {
      const updated = [...prev]
      updated[activeSheetIndex] = {
        ...updated[activeSheetIndex],
        data: newData
      }
      return updated
    })

    setSelectedRows(new Set())
  }, [selectedRows, currentSheet, activeSheetIndex])

  // 정제된 파일 저장
  const handleSaveRefined = useCallback(() => {
    if (sheets.length === 0 || !fileName) return

    const refinedFileName = getRefinedFileName(fileName)
    exportExcel(sheets, refinedFileName)
  }, [sheets, fileName])

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
      {/* 헤더 */}
      <header className="excel-refiner__header">
        <h1>Excel Refiner</h1>
        <span className="excel-refiner__version">v0.1.0</span>
      </header>

      {/* 메인 컨텐츠 */}
      <main className="excel-refiner__main">
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
                <label className="excel-refiner__file-label excel-refiner__file-label--small">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileSelect}
                    className="excel-refiner__file-input"
                  />
                  <span>다른 파일</span>
                </label>
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
                      variant="ghost"
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
                {problematicRows.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSelectProblematic}
                  >
                    문제 행 선택 ({problematicRows.length})
                  </Button>
                )}
                {selectedRows.size > 0 && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearSelection}
                    >
                      선택 해제
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDeleteSelected}
                    >
                      선택 삭제 ({selectedRows.size})
                    </Button>
                  </>
                )}
              </div>
              <div className="excel-refiner__actions-right">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveRefined}
                >
                  정제된 파일 저장
                </Button>
              </div>
            </div>

            {/* 데이터 테이블 */}
            <div className="excel-refiner__table-container">
              <table className="excel-refiner__table">
                <thead>
                  <tr>
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
                        thClassName += hasIssues
                          ? ' excel-refiner__th--validation-error'
                          : ' excel-refiner__th--validation-success'
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
                  {sortedDataWithIndices.map(({ row, originalIndex }, viewIndex) => {
                    const status = getRowValidationStatus(originalIndex)
                    const isSelected = selectedRows.has(originalIndex)

                    return (
                      <tr
                        key={originalIndex}
                        className={`excel-refiner__tr excel-refiner__tr--${status} ${isSelected ? 'excel-refiner__tr--selected' : ''}`}
                        onClick={(e) => handleRowSelect(originalIndex, viewIndex, e)}
                      >
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
                          let productTitle: string | undefined
                          if (colIndex === productNameColumnIndex) {
                            const productStatus = getProductCellStatus(originalIndex)
                            if (productStatus) {
                              tdClassName += ` excel-refiner__td--product-${productStatus}`
                              // 호버 시 설명 툴팁
                              if (productStatus === 'original') {
                                productTitle = '✓ 정확 매칭: DB 상품명과 정확히 일치'
                              } else if (productStatus === 'modified') {
                                productTitle = '⚠ 수정 매칭: 공백/대소문자 정규화 후 매칭됨 (자동 수정됨)'
                              } else if (productStatus === 'unmatched') {
                                productTitle = '✕ 미매칭: DB에서 찾을 수 없는 상품명'
                              }
                            }
                          }

                          return (
                            <td key={colIndex} className={tdClassName} title={productTitle}>
                              {cellToString(row[colIndex] as CellValue)}
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
      </main>

      {/* 상태바 */}
      <footer className="excel-refiner__footer">
        <span>
          {currentSheet
            ? `${currentSheet.data.length}행 | 선택: ${selectedRows.size}행`
            : '파일을 드래그하여 시작하세요'}
        </span>
      </footer>
    </div>
  )
}

export default ExcelRefinerView
