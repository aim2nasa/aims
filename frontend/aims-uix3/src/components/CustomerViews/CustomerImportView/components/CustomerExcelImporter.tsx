/**
 * CustomerExcelImporter Component
 * 고객 엑셀 가져오기 핵심 컴포넌트
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useAppleConfirm } from '@/contexts/AppleConfirmProvider'
import { Button } from '@/shared/ui/Button'
import {
  parseExcel,
  isValidExcelFile,
  cellToString,
  type SheetData,
  type CellValue
} from '@aims/excel-refiner-core'
import { CustomerService, type BulkCustomerInput, type BulkImportResult } from '@/services/customerService'
import { SFSymbol, SFSymbolSize } from '../../../SFSymbol'
import './CustomerExcelImporter.css'

interface ColumnMapping {
  name: number
  phone: number
  address: number
  gender: number
  birthDate: number
}

function detectColumnMapping(columns: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    name: -1,
    phone: -1,
    address: -1,
    gender: -1,
    birthDate: -1
  }

  columns.forEach((col, idx) => {
    const lowerCol = col?.toLowerCase() || ''
    if (lowerCol.includes('고객명') || lowerCol.includes('이름') || lowerCol === '성명') {
      mapping.name = idx
    } else if (lowerCol.includes('연락처') || lowerCol.includes('전화') || lowerCol.includes('휴대폰')) {
      mapping.phone = idx
    } else if (lowerCol.includes('주소')) {
      mapping.address = idx
    } else if (lowerCol.includes('성별')) {
      mapping.gender = idx
    } else if (lowerCol.includes('생년월일') || lowerCol.includes('생일') || lowerCol.includes('생년')) {
      mapping.birthDate = idx
    }
  })

  return mapping
}

function detectCustomerType(sheetName: string): '개인' | '법인' {
  const lowerName = sheetName.toLowerCase()
  if (lowerName.includes('법인')) return '법인'
  return '개인'
}

// sessionStorage 키
const STORAGE_KEY = 'customerExcelImporter_state'

// sessionStorage에 저장할 상태 타입
interface PersistedState {
  fileName: string | null
  sheets: SheetData[]
  activeSheetIndex: number
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

export default function CustomerExcelImporter() {
  const { showAlert, showConfirm } = useAppleConfirm()

  // 파일 상태
  const [fileName, setFileName] = useState<string | null>(null)
  const [sheets, setSheets] = useState<SheetData[]>([])
  const [activeSheetIndex, setActiveSheetIndex] = useState(0)

  // 드래그 상태
  const [isDragging, setIsDragging] = useState(false)

  // Import 상태
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null)

  // 결과 상세 보기 토글
  const [showCreated, setShowCreated] = useState(false)
  const [showUpdated, setShowUpdated] = useState(false)
  const [showSkipped, setShowSkipped] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  // 액션 로그 (계약 가져오기와 동일한 UX)
  const [actionLog, setActionLog] = useState<string | null>(null)

  // 초기화 완료 여부 (sessionStorage 로드 후 true)
  const initialized = useRef(false)

  // sessionStorage에서 상태 복원 (마운트 시 1회)
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const saved = loadPersistedState()
    if (saved) {
      setFileName(saved.fileName)
      setSheets(saved.sheets)
      setActiveSheetIndex(saved.activeSheetIndex)
    }
  }, [])

  // 상태 변경 시 sessionStorage에 저장
  useEffect(() => {
    if (!initialized.current) return
    if (!fileName) return // 파일 없으면 저장하지 않음

    savePersistedState({
      fileName,
      sheets,
      activeSheetIndex
    })
  }, [fileName, sheets, activeSheetIndex])

  // 현재 시트 데이터
  const currentSheet = sheets[activeSheetIndex] || null
  const customerType = currentSheet ? detectCustomerType(currentSheet.name) : '개인'
  const columnMapping = currentSheet ? detectColumnMapping(currentSheet.columns) : null

  // 검증 결과 계산
  const validationResult = useMemo(() => {
    if (!currentSheet?.data || !columnMapping || columnMapping.name < 0) {
      return { valid: true, emptyNames: [] as number[], total: 0 }
    }

    const emptyNames: number[] = []
    currentSheet.data.forEach((row, idx) => {
      const name = cellToString(row[columnMapping.name] as CellValue).trim()
      if (!name) {
        emptyNames.push(idx)
      }
    })

    return {
      valid: emptyNames.length === 0,
      emptyNames,
      total: currentSheet.data.length
    }
  }, [currentSheet?.data, columnMapping])

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
      setImportResult(null)
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

  // 엑셀 닫기
  const handleCloseExcel = useCallback(() => {
    setFileName(null)
    setSheets([])
    setActiveSheetIndex(0)
    setImportResult(null)
    setShowCreated(false)
    setShowUpdated(false)
    setShowSkipped(false)
    setShowErrors(false)
    setActionLog(null)
    // sessionStorage 정리
    clearPersistedState()
  }, [])

  // 시트 탭 변경
  const handleSheetChange = useCallback((index: number) => {
    setActiveSheetIndex(index)
    setImportResult(null)
  }, [])

  // 고객 가져오기 실행
  const handleImport = useCallback(async () => {
    if (!currentSheet?.data || !columnMapping || columnMapping.name < 0) {
      showAlert({
        title: '데이터 오류',
        message: '고객명 컬럼을 찾을 수 없습니다.',
        iconType: 'warning'
      })
      return
    }

    if (!validationResult.valid) {
      const confirmed = await showConfirm({
        title: '검증 경고',
        message: `고객명이 비어있는 행이 ${validationResult.emptyNames.length}개 있습니다. 이 행들은 건너뛰고 진행하시겠습니까?`,
        iconType: 'warning',
        confirmText: '계속',
        cancelText: '취소'
      })
      if (!confirmed) return
    }

    const customers: BulkCustomerInput[] = []

    currentSheet.data.forEach((row) => {
      const name = cellToString(row[columnMapping.name] as CellValue).trim()
      if (!name) return // 이름 없는 행 건너뜀

      const customer: BulkCustomerInput = {
        name,
        customer_type: customerType
      }

      if (columnMapping.phone >= 0) {
        const phone = cellToString(row[columnMapping.phone] as CellValue).trim()
        if (phone) customer.mobile_phone = phone
      }

      if (columnMapping.address >= 0) {
        const address = cellToString(row[columnMapping.address] as CellValue).trim()
        if (address) customer.address = address
      }

      if (columnMapping.gender >= 0 && customerType === '개인') {
        const gender = cellToString(row[columnMapping.gender] as CellValue).trim()
        if (gender) customer.gender = gender
      }

      if (columnMapping.birthDate >= 0 && customerType === '개인') {
        const birthDate = cellToString(row[columnMapping.birthDate] as CellValue).trim()
        if (birthDate) customer.birth_date = birthDate
      }

      customers.push(customer)
    })

    if (customers.length === 0) {
      showAlert({
        title: '데이터 없음',
        message: '가져올 고객 데이터가 없습니다.',
        iconType: 'warning'
      })
      return
    }

    setIsImporting(true)
    setImportResult(null)

    try {
      const result = await CustomerService.bulkImportCustomers(customers)
      setImportResult(result)

      // customerChanged 이벤트 발생
      window.dispatchEvent(new CustomEvent('customerChanged'))

      // 액션 로그로 결과 표시 (계약 가져오기와 동일한 UX)
      const parts: string[] = []
      if (result.createdCount > 0) parts.push(`등록 ${result.createdCount}`)
      if (result.updatedCount > 0) parts.push(`업데이트 ${result.updatedCount}`)
      if (result.skippedCount > 0) parts.push(`건너뜀 ${result.skippedCount}`)
      if (result.errorCount > 0) parts.push(`오류 ${result.errorCount}`)
      setActionLog(`✓ 고객 가져오기 완료: ${parts.join(' | ')}`)
    } catch (error) {
      console.error('고객 가져오기 오류:', error)
      setActionLog(`✗ 가져오기 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`)
    } finally {
      setIsImporting(false)
    }
  }, [currentSheet, columnMapping, customerType, validationResult, showAlert, showConfirm])

  // 드롭존 렌더링
  if (!fileName) {
    return (
      <div className="customer-excel-importer">
        <div
          className={`customer-excel-importer__dropzone ${isDragging ? 'customer-excel-importer__dropzone--active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="customer-excel-importer__dropzone-inner">
            {/* 엑셀 표준 포맷 가이드 */}
            <div className="customer-excel-importer__format-guide">
              <div className="customer-excel-importer__format-guide-header">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                  <line x1="2" y1="5.5" x2="14" y2="5.5" stroke="currentColor" strokeWidth="1.2"/>
                  <line x1="5.5" y1="2" x2="5.5" y2="14" stroke="currentColor" strokeWidth="1.2"/>
                  <line x1="9" y1="2" x2="9" y2="14" stroke="currentColor" strokeWidth="1.2"/>
                </svg>
                <span>엑셀 표준 포맷 예시</span>
              </div>

              {/* 개인고객 테이블 */}
              <div className="customer-excel-importer__format-section">
                <h4>개인고객명단 시트</h4>
                <div className="customer-excel-importer__format-table-wrapper">
                  <table className="customer-excel-importer__format-table">
                    <colgroup>
                      <col /><col /><col /><col /><col />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="customer-excel-importer__format-th customer-excel-importer__format-th--required">고객명</th>
                        <th className="customer-excel-importer__format-th">연락처</th>
                        <th className="customer-excel-importer__format-th">주소</th>
                        <th className="customer-excel-importer__format-th">성별</th>
                        <th className="customer-excel-importer__format-th">생년월일</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="customer-excel-importer__format-td">홍길동</td>
                        <td className="customer-excel-importer__format-td">010-2345-5678</td>
                        <td className="customer-excel-importer__format-td">경기도 고양시 일산동구 백석동 1234</td>
                        <td className="customer-excel-importer__format-td">남</td>
                        <td className="customer-excel-importer__format-td">1990-12-23</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 법인고객 테이블 */}
              <div className="customer-excel-importer__format-section customer-excel-importer__format-section--corporate">
                <h4>법인고객명단 시트</h4>
                <div className="customer-excel-importer__format-table-wrapper">
                  <table className="customer-excel-importer__format-table">
                    <colgroup>
                      <col /><col /><col />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="customer-excel-importer__format-th customer-excel-importer__format-th--required">고객명</th>
                        <th className="customer-excel-importer__format-th">연락처</th>
                        <th className="customer-excel-importer__format-th">주소</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="customer-excel-importer__format-td">청운테크</td>
                        <td className="customer-excel-importer__format-td">010-2345-7896</td>
                        <td className="customer-excel-importer__format-td">서울시 강남구 역삼동 123</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="customer-excel-importer__format-legend">
                <span className="customer-excel-importer__format-legend-item customer-excel-importer__format-legend-item--required">■ 필수 컬럼</span>
                <span className="customer-excel-importer__format-legend-item">□ 선택 컬럼</span>
              </div>
            </div>

            {/* 파일 업로드 영역 */}
            <div className="customer-excel-importer__dropzone-content">
              <svg
                className="customer-excel-importer__dropzone-icon"
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
              <label className="customer-excel-importer__file-label">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="customer-excel-importer__file-input"
                />
                <span>파일 선택</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 데이터 테이블 렌더링
  return (
    <div className="customer-excel-importer">
      {/* 헤더 */}
      <div className="customer-excel-importer__header">
        <div className="customer-excel-importer__file-info">
          <SFSymbol name="doc.text" size={SFSymbolSize.FOOTNOTE} />
          <span className="customer-excel-importer__file-name">{fileName}</span>
          <span className="customer-excel-importer__customer-type">
            {customerType === '법인' ? '🏢 법인' : '👤 개인'}
          </span>
        </div>
        <div className="customer-excel-importer__actions">
          {/* 액션 로그 메시지 */}
          {actionLog && !isImporting && (
            <div className="customer-excel-importer__action-log">
              {actionLog}
              <button
                type="button"
                className="customer-excel-importer__action-log-clear"
                onClick={() => setActionLog(null)}
                title="로그 지우기"
              >
                ×
              </button>
            </div>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={handleImport}
            disabled={isImporting || !validationResult.total}
          >
            {isImporting ? '가져오는 중...' : `${validationResult.total}건 가져오기`}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCloseExcel}>
            닫기
          </Button>
        </div>
      </div>

      {/* 시트 탭 */}
      {sheets.length > 1 && (
        <div className="customer-excel-importer__tabs">
          {sheets.map((sheet, idx) => (
            <button
              key={idx}
              type="button"
              className={`customer-excel-importer__tab ${idx === activeSheetIndex ? 'customer-excel-importer__tab--active' : ''}`}
              onClick={() => handleSheetChange(idx)}
            >
              {detectCustomerType(sheet.name) === '법인' ? '🏢' : '👤'} {sheet.name}
              <span className="customer-excel-importer__tab-count">{sheet.data.length}</span>
            </button>
          ))}
        </div>
      )}

      {/* 검증 상태 */}
      {!validationResult.valid && (
        <div className="customer-excel-importer__validation-warning">
          <SFSymbol name="exclamationmark.triangle" size={SFSymbolSize.FOOTNOTE} />
          <span>고객명이 비어있는 행: {validationResult.emptyNames.length}개 (가져오기 시 건너뜀)</span>
        </div>
      )}

      {/* 컬럼 매핑 상태 */}
      {columnMapping && (
        <div className="customer-excel-importer__mapping-info">
          <span>컬럼 매핑:</span>
          <span className={columnMapping.name >= 0 ? 'mapped' : 'unmapped'}>
            고객명{columnMapping.name >= 0 ? '✓' : '✗'}
          </span>
          <span className={columnMapping.phone >= 0 ? 'mapped' : 'unmapped'}>
            연락처{columnMapping.phone >= 0 ? '✓' : ''}
          </span>
          <span className={columnMapping.address >= 0 ? 'mapped' : 'unmapped'}>
            주소{columnMapping.address >= 0 ? '✓' : ''}
          </span>
          {customerType === '개인' && (
            <>
              <span className={columnMapping.gender >= 0 ? 'mapped' : 'unmapped'}>
                성별{columnMapping.gender >= 0 ? '✓' : ''}
              </span>
              <span className={columnMapping.birthDate >= 0 ? 'mapped' : 'unmapped'}>
                생년월일{columnMapping.birthDate >= 0 ? '✓' : ''}
              </span>
            </>
          )}
        </div>
      )}

      {/* 데이터 테이블 */}
      <div className="customer-excel-importer__table-wrapper">
        <table className="customer-excel-importer__table">
          <thead>
            <tr>
              <th className="customer-excel-importer__th customer-excel-importer__th--index">#</th>
              {currentSheet?.columns.map((col, idx) => (
                <th
                  key={idx}
                  className={`customer-excel-importer__th ${idx === columnMapping?.name ? 'customer-excel-importer__th--required' : ''}`}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {currentSheet?.data.map((row, rowIdx) => {
              const hasEmptyName = validationResult.emptyNames.includes(rowIdx)
              return (
                <tr
                  key={rowIdx}
                  className={hasEmptyName ? 'customer-excel-importer__row--error' : ''}
                >
                  <td className="customer-excel-importer__td customer-excel-importer__td--index">
                    {rowIdx + 1}
                  </td>
                  {row.map((cell, cellIdx) => (
                    <td
                      key={cellIdx}
                      className={`customer-excel-importer__td ${cellIdx === columnMapping?.name && hasEmptyName ? 'customer-excel-importer__td--error' : ''}`}
                    >
                      {cellToString(cell as CellValue)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 가져오기 결과 */}
      {importResult && (
        <div className="customer-excel-importer__result">
          <div className="customer-excel-importer__result-summary">
            <div className="customer-excel-importer__result-item customer-excel-importer__result-item--created">
              <span className="label">신규 등록</span>
              <span className="count">{importResult.createdCount}건</span>
              {importResult.createdCount > 0 && (
                <button
                  type="button"
                  className="toggle"
                  onClick={() => setShowCreated(!showCreated)}
                >
                  {showCreated ? '접기' : '펼치기'}
                </button>
              )}
            </div>
            <div className="customer-excel-importer__result-item customer-excel-importer__result-item--updated">
              <span className="label">업데이트</span>
              <span className="count">{importResult.updatedCount}건</span>
              {importResult.updatedCount > 0 && (
                <button
                  type="button"
                  className="toggle"
                  onClick={() => setShowUpdated(!showUpdated)}
                >
                  {showUpdated ? '접기' : '펼치기'}
                </button>
              )}
            </div>
            <div className="customer-excel-importer__result-item customer-excel-importer__result-item--skipped">
              <span className="label">건너뜀</span>
              <span className="count">{importResult.skippedCount}건</span>
              {importResult.skippedCount > 0 && (
                <button
                  type="button"
                  className="toggle"
                  onClick={() => setShowSkipped(!showSkipped)}
                >
                  {showSkipped ? '접기' : '펼치기'}
                </button>
              )}
            </div>
            {importResult.errorCount > 0 && (
              <div className="customer-excel-importer__result-item customer-excel-importer__result-item--error">
                <span className="label">오류</span>
                <span className="count">{importResult.errorCount}건</span>
                <button
                  type="button"
                  className="toggle"
                  onClick={() => setShowErrors(!showErrors)}
                >
                  {showErrors ? '접기' : '펼치기'}
                </button>
              </div>
            )}
          </div>

          {/* 상세 목록 */}
          {showCreated && importResult.created.length > 0 && (
            <div className="customer-excel-importer__result-detail">
              <h4>신규 등록 고객</h4>
              <ul>
                {importResult.created.map((c, idx) => (
                  <li key={idx}>{c.name}</li>
                ))}
              </ul>
            </div>
          )}
          {showUpdated && importResult.updated.length > 0 && (
            <div className="customer-excel-importer__result-detail">
              <h4>업데이트된 고객</h4>
              <ul>
                {importResult.updated.map((c, idx) => (
                  <li key={idx}>{c.name} ({c.changes.join(', ')})</li>
                ))}
              </ul>
            </div>
          )}
          {showSkipped && importResult.skipped.length > 0 && (
            <div className="customer-excel-importer__result-detail">
              <h4>건너뛴 고객</h4>
              <ul>
                {importResult.skipped.map((c, idx) => (
                  <li key={idx}>{c.name}: {c.reason}</li>
                ))}
              </ul>
            </div>
          )}
          {showErrors && importResult.errors.length > 0 && (
            <div className="customer-excel-importer__result-detail customer-excel-importer__result-detail--error">
              <h4>오류 발생</h4>
              <ul>
                {importResult.errors.map((c, idx) => (
                  <li key={idx}>{c.name}: {c.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
