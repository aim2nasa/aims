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

export function InsuranceProductsView() {
  // State
  const [products, setProducts] = useState<InsuranceProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [surveyDate, setSurveyDate] = useState<string>('')

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

  // 파일 처리
  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return

    setLoading(true)
    setParseErrors([])

    const allProducts: InsuranceProduct[] = []
    const allErrors: string[] = []
    let lastSurveyDate = ''

    for (const file of Array.from(files)) {
      const result: ParseResult = await parseFile(file)

      if (result.products.length > 0) {
        allProducts.push(...result.products)
        lastSurveyDate = result.surveyDate
      }

      if (result.errors.length > 0) {
        allErrors.push(`[${file.name}]`, ...result.errors)
      }
    }

    setProducts(allProducts)
    setSurveyDate(lastSurveyDate)
    setParseErrors(allErrors)
    setLoading(false)

    if (allProducts.length > 0) {
      showMessage('success', `${allProducts.length}개 상품을 불러왔습니다.`)
    }
  }, [showMessage])

  // 드래그 앤 드롭 핸들러
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  // 파일 선택
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files)
    e.target.value = '' // 같은 파일 다시 선택 가능하게
  }, [handleFiles])

  // 필터링 & 정렬된 상품 목록
  const filteredProducts = useMemo(() => {
    let result = [...products]

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
  }, [products, filters, sort])

  // 통계 계산
  const stats = useMemo(() => {
    const total = products.length
    const active = products.filter(p => p.status === '판매중').length
    const discontinued = products.filter(p => p.status === '판매중지').length

    const byCategory = products.reduce((acc, p) => {
      acc[p.category] = (acc[p.category] || 0) + 1
      return acc
    }, {} as Record<ProductCategory, number>)

    return { total, active, discontinued, byCategory }
  }, [products])

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
        // Ctrl/Cmd + 클릭: 토글
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
      } else {
        // 단일 선택
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

  // 선택 삭제
  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return

    setProducts(prev => prev.filter((_, i) => !selectedIds.has(`temp-${i}`)))
    setSelectedIds(new Set())
    showMessage('success', `${selectedIds.size}개 항목이 삭제되었습니다.`)
  }, [selectedIds, showMessage])

  // DB 저장
  const handleSaveToDb = useCallback(async () => {
    if (products.length === 0) {
      showMessage('error', '저장할 상품이 없습니다.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`${API_BASE}/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products, surveyDate })
      })

      const data = await response.json()

      if (data.success) {
        showMessage('success', `${products.length}개 상품이 DB에 저장되었습니다.`)
      } else {
        showMessage('error', data.error || 'DB 저장 실패')
      }
    } catch (err) {
      showMessage('error', `DB 저장 오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
    } finally {
      setLoading(false)
    }
  }, [products, surveyDate, showMessage])

  // DB에서 불러오기
  const handleLoadFromDb = useCallback(async () => {
    setLoading(true)

    try {
      const response = await fetch(API_BASE)
      const data = await response.json()

      if (data.success && data.data) {
        setProducts(data.data)
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
    setSelectedIds(new Set())
    setParseErrors([])
    setSurveyDate('')
    setError(null)
    setSuccessMessage(null)
  }, [])

  // 정렬 아이콘
  const getSortIcon = (field: SortField) => {
    if (sort.field !== field) return '↕'
    return sort.order === 'asc' ? '↑' : '↓'
  }

  return (
    <div className="insurance-products">
      {/* 헤더 */}
      <header className="insurance-products__header">
        <div className="insurance-products__title-area">
          <h1>보험상품 관리</h1>
          {surveyDate && <span className="survey-date">조사일: {surveyDate}</span>}
        </div>
        <div className="insurance-products__actions">
          <Button variant="secondary" onClick={handleLoadFromDb} disabled={loading}>
            DB에서 불러오기
          </Button>
          <Button variant="primary" onClick={handleSaveToDb} disabled={loading || products.length === 0}>
            DB에 저장
          </Button>
        </div>
      </header>

      {/* 메시지 영역 */}
      {error && <div className="message message--error">{error}</div>}
      {successMessage && <div className="message message--success">{successMessage}</div>}

      {/* 드롭존 */}
      {products.length === 0 ? (
        <div
          className={`dropzone ${isDragOver ? 'dropzone--active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="dropzone__content">
            <div className="dropzone__icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className="dropzone__text">MD 또는 Excel 파일을 드래그하세요</p>
            <p className="dropzone__hint">또는 클릭하여 파일 선택</p>
            <input
              type="file"
              className="dropzone__input"
              accept=".md,.xlsx,.xls"
              multiple
              onChange={handleFileSelect}
            />
          </div>
        </div>
      ) : (
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
              <label className="file-upload-btn">
                <span className="button button--ghost button--md">
                  <span className="button__content">파일 추가</span>
                </span>
                <input
                  type="file"
                  accept=".md,.xlsx,.xls"
                  multiple
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
              </label>

              {selectedIds.size > 0 && (
                <Button variant="destructive" onClick={handleDeleteSelected}>
                  선택 삭제 ({selectedIds.size})
                </Button>
              )}

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
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 결과 요약 */}
          <div className="result-summary">
            {filteredProducts.length}개 상품 표시 (전체 {products.length}개 중)
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
