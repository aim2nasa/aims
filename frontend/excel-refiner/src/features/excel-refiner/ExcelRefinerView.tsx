/**
 * Excel Refiner Main View
 * 엑셀 파일 정제 도구의 메인 컴포넌트
 */

import { useState, useCallback, useMemo } from 'react'
import { Button } from '@/shared/ui'
import { parseExcel, exportExcel, isValidExcelFile, getRefinedFileName, cellToString } from './utils/excel'
import { useValidation, getRowStatus, getProblematicRows } from './hooks/useValidation'
import type { SheetData, CellValue } from './types/excel'
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

  // 현재 시트 데이터
  const currentSheet = sheets[activeSheetIndex] || null

  // 증권번호 컬럼 자동 감지
  const policyNumberColumnIndex = useMemo(() => {
    if (!currentSheet?.columns) return null
    const index = currentSheet.columns.findIndex(col =>
      col.includes('증권번호') || col.toLowerCase().includes('policy')
    )
    return index >= 0 ? index : null
  }, [currentSheet?.columns])

  // 검증 결과 (증권번호 컬럼에만 적용)
  const validationResult = useValidation(currentSheet?.data || null, policyNumberColumnIndex)

  // 문제 행 인덱스
  const problematicRows = useMemo(() => {
    if (!validationResult) return []
    return getProblematicRows(validationResult)
  }, [validationResult])

  // 정렬된 데이터 (문제 행을 맨 위로)
  const sortedDataWithIndices = useMemo(() => {
    if (!currentSheet?.data) return []

    // 원본 인덱스와 함께 데이터 배열 생성
    const indexed = currentSheet.data.map((row, idx) => ({ row, originalIndex: idx }))

    if (!validationResult || validationResult.valid) {
      return indexed
    }

    // 문제 행을 맨 위로 정렬
    const problematicSet = new Set(problematicRows)
    return indexed.sort((a, b) => {
      const aProblematic = problematicSet.has(a.originalIndex)
      const bProblematic = problematicSet.has(b.originalIndex)
      if (aProblematic && !bProblematic) return -1
      if (!aProblematic && bProblematic) return 1
      return a.originalIndex - b.originalIndex
    })
  }, [currentSheet?.data, validationResult, problematicRows])

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
  }, [])

  // 행 선택 토글
  const handleRowSelect = useCallback((rowIndex: number, e: React.MouseEvent) => {
    setSelectedRows(prev => {
      const next = new Set(prev)

      if (e.shiftKey && prev.size > 0) {
        // Shift 클릭: 범위 선택
        const lastSelected = [...prev].pop()!
        const start = Math.min(lastSelected, rowIndex)
        const end = Math.max(lastSelected, rowIndex)
        for (let i = start; i <= end; i++) {
          next.add(i)
        }
      } else if (e.ctrlKey || e.metaKey) {
        // Ctrl/Cmd 클릭: 토글
        if (next.has(rowIndex)) {
          next.delete(rowIndex)
        } else {
          next.add(rowIndex)
        }
      } else {
        // 일반 클릭: 단일 선택
        next.clear()
        next.add(rowIndex)
      }

      return next
    })
  }, [])

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

    const confirmed = window.confirm(
      `선택한 ${selectedRows.size}개 행을 삭제하시겠습니까?`
    )

    if (!confirmed) return

    // 선택된 행 제외하고 새 데이터 생성
    const newData = currentSheet.data.filter((_, index) => !selectedRows.has(index))

    // 시트 데이터 업데이트
    setSheets(prev => {
      const updated = [...prev]
      updated[activeSheetIndex] = {
        ...updated[activeSheetIndex],
        data: newData
      }
      return updated
    })

    // 선택 초기화
    setSelectedRows(new Set())
  }, [selectedRows, currentSheet, activeSheetIndex])

  // 정제된 파일 저장
  const handleSaveRefined = useCallback(() => {
    if (sheets.length === 0 || !fileName) return

    const refinedFileName = getRefinedFileName(fileName)
    exportExcel(sheets, refinedFileName)
  }, [sheets, fileName])

  // 데이터 행 번호 (엑셀 기준: 헤더가 1행이므로 데이터는 2행부터)
  const getExcelRowNumber = (dataIndex: number) => dataIndex + 2

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
                    className={`excel-refiner__tab ${index === activeSheetIndex ? 'excel-refiner__tab--active' : ''}`}
                    onClick={() => handleSheetChange(index)}
                  >
                    {sheet.name}
                  </button>
                ))}
              </div>
            )}

            {/* 검증 패널 */}
            <div className="excel-refiner__validation">
              <div className="excel-refiner__validation-header">
                <span>증권번호 검증:</span>
                {policyNumberColumnIndex !== null ? (
                  <span className="excel-refiner__validation-column">
                    {currentSheet.columns[policyNumberColumnIndex]} (열 {policyNumberColumnIndex + 1})
                  </span>
                ) : (
                  <span className="excel-refiner__validation-warning">
                    증권번호 컬럼을 찾을 수 없습니다
                  </span>
                )}
              </div>

              {validationResult && (
                <div className="excel-refiner__validation-result">
                  <div className={`excel-refiner__validation-status ${validationResult.valid ? 'excel-refiner__validation-status--success' : 'excel-refiner__validation-status--error'}`}>
                    {validationResult.valid ? '검증 통과' : '검증 실패'}
                  </div>
                  {!validationResult.valid && (
                    <>
                      <span className="excel-refiner__validation-detail">
                        빈 값: {validationResult.empties.length}개
                      </span>
                      <span className="excel-refiner__validation-detail">
                        중복: {validationResult.duplicates.length}개
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 액션 바 */}
            <div className="excel-refiner__actions">
              <div className="excel-refiner__actions-left">
                {validationResult && !validationResult.valid && (
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
                    <th className="excel-refiner__th excel-refiner__th--row-num">#</th>
                    {currentSheet.columns.map((col, index) => (
                      <th
                        key={index}
                        className={`excel-refiner__th ${policyNumberColumnIndex === index ? 'excel-refiner__th--validation' : ''}`}
                      >
                        {col || `열 ${index + 1}`}
                        {policyNumberColumnIndex === index && (
                          <span className="excel-refiner__th-badge">검증</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedDataWithIndices.map(({ row, originalIndex }) => {
                    const status = getRowStatus(originalIndex, validationResult)
                    const isSelected = selectedRows.has(originalIndex)

                    return (
                      <tr
                        key={originalIndex}
                        className={`excel-refiner__tr excel-refiner__tr--${status} ${isSelected ? 'excel-refiner__tr--selected' : ''}`}
                        onClick={(e) => handleRowSelect(originalIndex, e)}
                      >
                        <td className="excel-refiner__td excel-refiner__td--row-num">
                          {getExcelRowNumber(originalIndex)}
                        </td>
                        {currentSheet.columns.map((_, colIndex) => (
                          <td
                            key={colIndex}
                            className={`excel-refiner__td ${policyNumberColumnIndex === colIndex ? 'excel-refiner__td--validation' : ''}`}
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
