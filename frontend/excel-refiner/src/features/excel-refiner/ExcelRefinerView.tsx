/**
 * Excel Refiner Main View
 * 엑셀 파일 정제 도구의 메인 컴포넌트
 */

import { useState, useCallback, useMemo } from 'react'
import { Button } from '@/shared/ui'
import { parseExcel, exportExcel, isValidExcelFile, getRefinedFileName, cellToString } from './utils/excel'
import { validateColumn, getValidationType, getRowStatus, getProblematicRows } from './hooks/useValidation'
import type { SheetData, CellValue, ValidationResult } from './types/excel'
import './ExcelRefinerView.css'

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

  // 전체 문제 행 인덱스 (모든 검증 컬럼 결합)
  const problematicRows = useMemo(() => {
    const allRows: number[] = []
    columnValidationResults.forEach(result => {
      allRows.push(...getProblematicRows(result))
    })
    return [...new Set(allRows)].sort((a, b) => a - b)
  }, [columnValidationResults])

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

    // 문제 행 우선 정렬 (검증 활성화시)
    if (problematicRows.length > 0) {
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
  }, [currentSheet?.data, problematicRows, sortColumn, sortDirection])

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
  const handleColumnClick = useCallback((colIndex: number, columnName: string) => {
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

    // 약간의 지연 후 실제 검증 시작 (UI 업데이트를 위한 시간 확보)
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
  }, [validatingColumns])

  // 검증 초기화
  const handleClearValidation = useCallback(() => {
    setValidatingColumns(new Set())
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
    const result = columnValidationResults.get(colIndex)
    if (!result) return null

    const type = getValidationType(columnName)
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

  // 행 상태 계산
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
                          title={isValidatable ? `클릭하여 검증 (${type === 'policyNumber' ? '증권번호' : '고객명'} 검증)` : '클릭하여 정렬'}
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
                        {currentSheet.columns.map((_, colIndex) => (
                          <td
                            key={colIndex}
                            className={`excel-refiner__td ${validatingColumns.has(colIndex) ? 'excel-refiner__td--validation' : ''}`}
                          >
                            {cellToString(row[colIndex] as CellValue)}
                          </td>
                        ))}
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
