/**
 * Insurance Products View
 * 보험상품 관리 메인 컴포넌트
 */

import { useState, useCallback, useMemo } from 'react'
import { Button } from '@/shared/ui'
import { parseFile } from './utils/parser'
import type {
  InsuranceProduct,
  ProductCategory,
  ProductStatus,
  FilterOptions,
  SortOptions,
  SortField,
  ParseResult
} from './types/product'
import { CATEGORY_LABELS, CATEGORY_COLORS } from './types/product'
import './InsuranceProductsView.css'

// API Base URL
const API_BASE = '/api/insurance-products'

// 오늘 날짜 (YYYY.MM.DD)
function getTodayString(): string {
  const today = new Date()
  return `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`
}

// 날짜 형식 변환 (input date -> YYYY.MM.DD)
function formatDateToDisplay(dateStr: string): string {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-')
  return `${year}.${month}.${day}`
}

// 날짜 형식 변환 (YYYY.MM.DD -> input date)
function formatDateToInput(dateStr: string): string {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('.')
  return `${year}-${month}-${day}`
}

export function InsuranceProductsView() {
  // State
  const [products, setProducts] = useState<InsuranceProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [parseErrors, setParseErrors] = useState<string[]>([])

  // 기준일 선택 (UI에서 입력)
  const [surveyDate, setSurveyDate] = useState<string>(getTodayString())

  // 파일 업로드 상태 (판매중, 판매중지 각각)
  const [activeFile, setActiveFile] = useState<File | null>(null)
  const [discontinuedFile, setDiscontinuedFile] = useState<File | null>(null)
  const [activeProducts, setActiveProducts] = useState<InsuranceProduct[]>([])
  const [discontinuedProducts, setDiscontinuedProducts] = useState<InsuranceProduct[]>([])

  // 드래그 상태
  const [isDragOverActive, setIsDragOverActive] = useState(false)
  const [isDragOverDiscontinued, setIsDragOverDiscontinued] = useState(false)

  // Filter & Sort State
  const [filters, setFilters] = useState<FilterOptions>({
    category: 'all',
    status: 'all',
    searchTerm: ''
  })
  const [sort, setSort] = useState<SortOptions>({
    field: 'productName',
    order: 'asc'
  })

  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 메시지 자동 제거
  const showMessage = useCallback((type: 'error' | 'success', message: string) => {
    if (type === 'error') {
      setError(message)
      setTimeout(() => setError(null), 5000)
    } else {
      setSuccessMessage(message)
      setTimeout(() => setSuccessMessage(null), 3000)
    }
  }, [])

  // 판매중 파일 처리
  const handleActiveFile = useCallback(async (file: File) => {
    const result: ParseResult = await parseFile(file)

    // 상태를 '판매중'으로 강제 설정
    const productsWithStatus = result.products.map(p => ({
      ...p,
      status: '판매중' as ProductStatus,
      surveyDate
    }))

    setActiveFile(file)
    setActiveProducts(productsWithStatus)

    if (result.errors.length > 0) {
      setParseErrors(prev => [...prev, `[판매중 - ${file.name}]`, ...result.errors])
    }
  }, [surveyDate])

  // 판매중지 파일 처리
  const handleDiscontinuedFile = useCallback(async (file: File) => {
    const result: ParseResult = await parseFile(file)

    // 상태를 '판매중지'로 강제 설정
    const productsWithStatus = result.products.map(p => ({
      ...p,
      status: '판매중지' as ProductStatus,
      surveyDate
    }))

    setDiscontinuedFile(file)
    setDiscontinuedProducts(productsWithStatus)

    if (result.errors.length > 0) {
      setParseErrors(prev => [...prev, `[판매중지 - ${file.name}]`, ...result.errors])
    }
  }, [surveyDate])

  // 드래그 앤 드롭 핸들러 (판매중)
  const handleDragOverActive = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOverActive(true)
  }, [])

  const handleDragLeaveActive = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOverActive(false)
  }, [])

  const handleDropActive = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOverActive(false)
    const file = e.dataTransfer.files[0]
    if (file) handleActiveFile(file)
  }, [handleActiveFile])

  // 드래그 앤 드롭 핸들러 (판매중지)
  const handleDragOverDiscontinued = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOverDiscontinued(true)
  }, [])

  const handleDragLeaveDiscontinued = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOverDiscontinued(false)
  }, [])

  const handleDropDiscontinued = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOverDiscontinued(false)
    const file = e.dataTransfer.files[0]
    if (file) handleDiscontinuedFile(file)
  }, [handleDiscontinuedFile])

  // 파일 선택 핸들러
  const handleActiveFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleActiveFile(file)
    e.target.value = ''
  }, [handleActiveFile])

  const handleDiscontinuedFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleDiscontinuedFile(file)
    e.target.value = ''
  }, [handleDiscontinuedFile])

  // 전체 상품 목록 (파일 업로드 모드와 DB 조회 모드 구분)
  const allProducts = useMemo(() => {
    if (activeProducts.length > 0 || discontinuedProducts.length > 0) {
      return [...activeProducts, ...discontinuedProducts]
    }
    return products
  }, [products, activeProducts, discontinuedProducts])

  // 필터링 & 정렬된 상품 목록
  const filteredProducts = useMemo(() => {
    let result = [...allProducts]

    // 필터 적용
    if (filters.category !== 'all') {
      result = result.filter(p => p.category === filters.category)
    }
    if (filters.status !== 'all') {
      result = result.filter(p => p.status === filters.status)
    }
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase()
      result = result.filter(p => p.productName.toLowerCase().includes(term))
    }

    // 정렬 적용
    result.sort((a, b) => {
      const aVal = a[sort.field] ?? ''
      const bVal = b[sort.field] ?? ''

      if (aVal < bVal) return sort.order === 'asc' ? -1 : 1
      if (aVal > bVal) return sort.order === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [allProducts, filters, sort])

  // 통계 계산
  const stats = useMemo(() => {
    const total = allProducts.length
    const active = allProducts.filter(p => p.status === '판매중').length
    const discontinued = allProducts.filter(p => p.status === '판매중지').length

    const byCategory = allProducts.reduce((acc, p) => {
      acc[p.category] = (acc[p.category] || 0) + 1
      return acc
    }, {} as Record<ProductCategory, number>)

    return { total, active, discontinued, byCategory }
  }, [allProducts])

  // 정렬 토글
  const handleSort = useCallback((field: SortField) => {
    setSort(prev => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc'
    }))
  }, [])

  // 행 선택
  const handleRowSelect = useCallback((id: string, e: React.MouseEvent) => {
    setSelectedIds(prev => {
      const next = new Set(prev)

      if (e.ctrlKey || e.metaKey) {
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
      } else {
        next.clear()
        next.add(id)
      }

      return next
    })
  }, [])

  // 전체 선택
  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredProducts.length) {
      setSelectedIds(new Set())
    } else {
      const ids = filteredProducts.map((_, i) => `temp-${i}`)
      setSelectedIds(new Set(ids))
    }
  }, [filteredProducts, selectedIds])

  // DB 저장 (세트 업로드)
  const handleSaveToDb = useCallback(async () => {
    // 필수 조건 검증
    if (!surveyDate) {
      showMessage('error', '기준일을 선택해주세요.')
      return
    }
    if (activeProducts.length === 0) {
      showMessage('error', '판매중 상품 파일을 업로드해주세요.')
      return
    }
    if (discontinuedProducts.length === 0) {
      showMessage('error', '판매중지 상품 파일을 업로드해주세요.')
      return
    }

    const productsToSave = [...activeProducts, ...discontinuedProducts]
    setLoading(true)

    try {
      const response = await fetch(`${API_BASE}/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: productsToSave,
          surveyDate
        })
      })

      const data = await response.json()

      if (data.success) {
        showMessage('success', `${productsToSave.length}개 상품이 DB에 저장되었습니다.`)
        // 저장 후 상태 초기화
        setActiveFile(null)
        setDiscontinuedFile(null)
        setActiveProducts([])
        setDiscontinuedProducts([])
        // DB에서 다시 불러오기
        handleLoadFromDb()
      } else {
        showMessage('error', data.error || 'DB 저장 실패')
      }
    } catch (err) {
      showMessage('error', `DB 저장 오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
    } finally {
      setLoading(false)
    }
  }, [activeProducts, discontinuedProducts, surveyDate, showMessage])

  // DB에서 불러오기
  const handleLoadFromDb = useCallback(async () => {
    setLoading(true)

    try {
      const response = await fetch(API_BASE)
      const data = await response.json()

      if (data.success && data.data) {
        setProducts(data.data)
        // 파일 업로드 상태 초기화
        setActiveFile(null)
        setDiscontinuedFile(null)
        setActiveProducts([])
        setDiscontinuedProducts([])
        showMessage('success', `${data.data.length}개 상품을 불러왔습니다.`)
      } else {
        showMessage('error', data.error || 'DB 조회 실패')
      }
    } catch (err) {
      showMessage('error', `DB 조회 오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
    } finally {
      setLoading(false)
    }
  }, [showMessage])

  // 모두 초기화
  const handleClear = useCallback(() => {
    setProducts([])
    setActiveFile(null)
    setDiscontinuedFile(null)
    setActiveProducts([])
    setDiscontinuedProducts([])
    setSelectedIds(new Set())
    setParseErrors([])
    setError(null)
    setSuccessMessage(null)
  }, [])

  // 파일 제거
  const handleRemoveActiveFile = useCallback(() => {
    setActiveFile(null)
    setActiveProducts([])
  }, [])

  const handleRemoveDiscontinuedFile = useCallback(() => {
    setDiscontinuedFile(null)
    setDiscontinuedProducts([])
  }, [])

  // 정렬 아이콘
  const getSortIcon = (field: SortField) => {
    if (sort.field !== field) return '↕'
    return sort.order === 'asc' ? '↑' : '↓'
  }

  // 데이터 표시 여부
  const hasDataToShow = allProducts.length > 0

  // DB 저장 가능 여부 (판매중 파일 + 판매중지 파일 + 기준일 모두 필요)
  const canSaveToDb = surveyDate && activeProducts.length > 0 && discontinuedProducts.length > 0

  return (
    <div className="insurance-products">
      {/* 헤더 */}
      <header className="insurance-products__header">
        <div className="insurance-products__title-area">
          <h1>보험상품 관리</h1>
        </div>
        <div className="insurance-products__actions">
          <Button variant="secondary" onClick={handleLoadFromDb} disabled={loading}>
            DB에서 불러오기
          </Button>
          <Button
            variant="primary"
            onClick={handleSaveToDb}
            disabled={loading || !canSaveToDb}
          >
            DB에 저장
          </Button>
        </div>
      </header>

      {/* 메시지 영역 */}
      {error && <div className="message message--error">{error}</div>}
      {successMessage && <div className="message message--success">{successMessage}</div>}

      {/* 업로드 섹션 - 컴팩트 한 줄 레이아웃 */}
      <div className="upload-section-compact">
        {/* 기준일 */}
        <div className="upload-item">
          <label className="upload-item__label">기준일 <span className="required">*</span></label>
          <input
            type="date"
            className="upload-item__input"
            value={formatDateToInput(surveyDate)}
            onChange={e => setSurveyDate(formatDateToDisplay(e.target.value))}
          />
        </div>

        {/* 판매중 파일 */}
        <div className="upload-item">
          <span className="upload-item__label status--active">판매중 상품 <span className="required">*</span></span>
          {activeFile ? (
            <div className="upload-item__file">
              <span className="upload-item__filename" title={activeFile.name}>{activeFile.name} ({activeProducts.length}개)</span>
              <button className="upload-item__remove" onClick={handleRemoveActiveFile}>×</button>
            </div>
          ) : (
            <label
              className={`upload-item__dropzone ${isDragOverActive ? 'upload-item__dropzone--active' : ''}`}
              onDragOver={handleDragOverActive}
              onDragLeave={handleDragLeaveActive}
              onDrop={handleDropActive}
            >
              파일 선택
              <input type="file" accept=".md,.xlsx,.xls" onChange={handleActiveFileSelect} hidden />
            </label>
          )}
        </div>

        {/* 판매중지 파일 */}
        <div className="upload-item">
          <span className="upload-item__label status--discontinued">판매중지 상품 <span className="required">*</span></span>
          {discontinuedFile ? (
            <div className="upload-item__file">
              <span className="upload-item__filename" title={discontinuedFile.name}>{discontinuedFile.name} ({discontinuedProducts.length}개)</span>
              <button className="upload-item__remove" onClick={handleRemoveDiscontinuedFile}>×</button>
            </div>
          ) : (
            <label
              className={`upload-item__dropzone ${isDragOverDiscontinued ? 'upload-item__dropzone--active' : ''}`}
              onDragOver={handleDragOverDiscontinued}
              onDragLeave={handleDragLeaveDiscontinued}
              onDrop={handleDropDiscontinued}
            >
              파일 선택
              <input type="file" accept=".md,.xlsx,.xls" onChange={handleDiscontinuedFileSelect} hidden />
            </label>
          )}
        </div>
      </div>

      {/* 데이터가 있을 때만 표시 */}
      {hasDataToShow && (
        <>
          {/* 통계 */}
          <div className="stats-bar">
            <div className="stat">
              <span className="stat__label">전체</span>
              <span className="stat__value">{stats.total}</span>
            </div>
            <div className="stat stat--active">
              <span className="stat__label">판매중</span>
              <span className="stat__value">{stats.active}</span>
            </div>
            <div className="stat stat--discontinued">
              <span className="stat__label">판매중지</span>
              <span className="stat__value">{stats.discontinued}</span>
            </div>
            <div className="stat__divider" />
            {(Object.entries(stats.byCategory) as [ProductCategory, number][]).map(([cat, count]) => (
              <div key={cat} className={`stat ${CATEGORY_COLORS[cat]}`}>
                <span className="stat__label">{CATEGORY_LABELS[cat]}</span>
                <span className="stat__value">{count}</span>
              </div>
            ))}
          </div>

          {/* 필터/검색/액션 바 */}
          <div className="toolbar">
            <div className="toolbar__filters">
              <select
                className="filter-select"
                value={filters.category}
                onChange={e => setFilters(f => ({ ...f, category: e.target.value as ProductCategory | 'all' }))}
              >
                <option value="all">전체 구분</option>
                <option value="보장">보장</option>
                <option value="변액">변액</option>
                <option value="연금">연금</option>
                <option value="법인">법인</option>
                <option value="양로">양로</option>
                <option value="저축">저축</option>
              </select>

              <select
                className="filter-select"
                value={filters.status}
                onChange={e => setFilters(f => ({ ...f, status: e.target.value as ProductStatus | 'all' }))}
              >
                <option value="all">전체 상태</option>
                <option value="판매중">판매중</option>
                <option value="판매중지">판매중지</option>
              </select>

              <input
                type="text"
                className="search-input"
                placeholder="상품명 검색..."
                value={filters.searchTerm}
                onChange={e => setFilters(f => ({ ...f, searchTerm: e.target.value }))}
              />
            </div>

            <div className="toolbar__actions">
              <Button variant="ghost" onClick={handleClear}>
                초기화
              </Button>
            </div>
          </div>

          {/* 테이블 */}
          <div className="table-container">
            <table className="product-table">
              <thead>
                <tr>
                  <th className="col-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredProducts.length && filteredProducts.length > 0}
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th className="col-category sortable" onClick={() => handleSort('category')}>
                    구분 {getSortIcon('category')}
                  </th>
                  <th className="col-name sortable" onClick={() => handleSort('productName')}>
                    주보험상품명 {getSortIcon('productName')}
                  </th>
                  <th className="col-date sortable" onClick={() => handleSort('saleStartDate')}>
                    판매시작일 {getSortIcon('saleStartDate')}
                  </th>
                  <th className="col-date sortable" onClick={() => handleSort('saleEndDate')}>
                    판매종료일 {getSortIcon('saleEndDate')}
                  </th>
                  <th className="col-status sortable" onClick={() => handleSort('status')}>
                    상태 {getSortIcon('status')}
                  </th>
                  <th className="col-survey-date sortable" onClick={() => handleSort('surveyDate')}>
                    기준일 {getSortIcon('surveyDate')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product, index) => {
                  const id = product._id || `temp-${index}`
                  const isSelected = selectedIds.has(id)

                  return (
                    <tr
                      key={id}
                      className={`product-row ${isSelected ? 'product-row--selected' : ''}`}
                      onClick={(e) => handleRowSelect(id, e)}
                    >
                      <td className="col-checkbox">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          onClick={e => e.stopPropagation()}
                        />
                      </td>
                      <td className="col-category">
                        <span className={`category-badge ${CATEGORY_COLORS[product.category]}`}>
                          {CATEGORY_LABELS[product.category]}
                        </span>
                      </td>
                      <td className="col-name">{product.productName}</td>
                      <td className="col-date">{product.saleStartDate}</td>
                      <td className="col-date">{product.saleEndDate || '-'}</td>
                      <td className="col-status">
                        <span className={`status-badge ${product.status === '판매중' ? 'status--active' : 'status--discontinued'}`}>
                          {product.status}
                        </span>
                      </td>
                      <td className="col-survey-date">{product.surveyDate}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 결과 요약 */}
          <div className="result-summary">
            {filteredProducts.length}개 상품 표시 (전체 {allProducts.length}개 중)
          </div>
        </>
      )}

      {/* 파싱 에러 */}
      {parseErrors.length > 0 && (
        <div className="parse-errors">
          <h4>파싱 오류</h4>
          <ul>
            {parseErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 로딩 오버레이 */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
        </div>
      )}
    </div>
  )
}

export default InsuranceProductsView
