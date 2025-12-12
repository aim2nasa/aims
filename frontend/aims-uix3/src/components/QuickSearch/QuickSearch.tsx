/**
 * QuickSearch Component
 * @since 1.0.0
 *
 * 헤더에 배치되는 빠른 검색 컴포넌트
 * 고객명/문서명을 빠르게 검색하여 즉시 이동할 수 있는 기능 제공
 * 애플 디자인 시스템 준수
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../SFSymbol'
import { CustomerService } from '@/services/customerService'
import { CustomerUtils, type Customer } from '@/entities/customer/model'
import './QuickSearch.css'

interface QuickSearchProps {
  /** 검색 결과 클릭 시 네비게이션 핸들러 */
  onNavigate?: (type: 'customer' | 'document', id: string) => void
  /** 고객 클릭 핸들러 */
  onCustomerClick?: (customerId: string, customer: Customer) => void
  /** 플레이스홀더 텍스트 */
  placeholder?: string
  /** 추가 CSS 클래스 */
  className?: string
}

interface SearchResult {
  id: string
  type: 'customer' | 'document'
  title: string
  subtitle?: string
  customerType?: '개인' | '법인'
}

/**
 * QuickSearch 컴포넌트
 *
 * 빠른 고객/문서 검색을 위한 검색바
 * - 실시간 검색 결과 표시
 * - 키보드 네비게이션 지원
 * - 애플 스타일 UI
 */
export const QuickSearch: React.FC<QuickSearchProps> = ({
  onNavigate,
  onCustomerClick,
  placeholder = '고객, 문서 검색...',
  className = ''
}) => {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  // 디바운스된 검색어
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  // 고객 검색 쿼리
  const { data: customersData, isLoading: isCustomersLoading } = useQuery({
    queryKey: ['quickSearch', 'customers', debouncedQuery],
    queryFn: () => CustomerService.getCustomers({
      search: debouncedQuery,
      limit: 5
    }),
    enabled: debouncedQuery.length >= 1,
    staleTime: 30000,
  })

  // 검색 결과 통합
  const searchResults = useMemo<SearchResult[]>(() => {
    const results: SearchResult[] = []

    // 고객 결과
    if (customersData?.customers) {
      customersData.customers.slice(0, 5).forEach(customer => {
        const customerType = CustomerUtils.getCustomerTypeText(customer)
        results.push({
          id: customer._id,
          type: 'customer',
          title: customer.personal_info?.name || '이름 없음',
          subtitle: customerType,
          customerType: customerType as '개인' | '법인'
        })
      })
    }

    return results
  }, [customersData])

  const isLoading = isCustomersLoading

  // 고객 타입별 아이콘 렌더링 (AllCustomersView와 동일한 아이콘 사용)
  const renderCustomerIcon = (customerType?: '개인' | '법인') => {
    if (customerType === '법인') {
      // 법인: 건물 아이콘 (orange)
      return (
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="quick-search__customer-icon quick-search__customer-icon--corporate">
          <circle cx="10" cy="10" r="10" opacity="0.2" />
          <path d="M6 5h2v2H6V5zm0 3h2v2H6V8zm0 3h2v2H6v-2zm3-6h2v2H9V5zm0 3h2v2H9V8zm0 3h2v2H9v-2zm3-6h2v2h-2V5zm0 3h2v2h-2V8zm0 3h2v2h-2v-2zM5 14h10v2H5v-2z" />
        </svg>
      )
    }
    // 개인: 사람 아이콘 (blue)
    return (
      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="quick-search__customer-icon quick-search__customer-icon--personal">
        <circle cx="10" cy="10" r="10" opacity="0.2" />
        <circle cx="10" cy="7" r="3" />
        <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
      </svg>
    )
  }

  // 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSelectedIndex(-1)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 키보드 네비게이션
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen || searchResults.length === 0) {
      if (e.key === 'ArrowDown' && query.length >= 1) {
        setIsOpen(true)
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev =>
          prev < searchResults.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev =>
          prev > 0 ? prev - 1 : searchResults.length - 1
        )
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && searchResults[selectedIndex]) {
          handleResultClick(searchResults[selectedIndex])
        }
        break
      case 'Escape':
        setIsOpen(false)
        setSelectedIndex(-1)
        inputRef.current?.blur()
        break
    }
  }, [isOpen, searchResults, selectedIndex, query])

  // 결과 클릭 핸들러
  const handleResultClick = useCallback((result: SearchResult) => {
    if (result.type === 'customer') {
      const customer = customersData?.customers.find(c => c._id === result.id)
      if (customer && onCustomerClick) {
        onCustomerClick(result.id, customer)
      } else if (onNavigate) {
        onNavigate('customer', result.id)
      }
    } else if (onNavigate) {
      onNavigate('document', result.id)
    }

    // 검색 초기화
    setQuery('')
    setIsOpen(false)
    setSelectedIndex(-1)
    inputRef.current?.blur()
  }, [customersData, onCustomerClick, onNavigate])

  // 입력 변경 핸들러
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    setSelectedIndex(-1)
    if (value.length >= 1) {
      setIsOpen(true)
    } else {
      setIsOpen(false)
    }
  }

  // 입력 포커스 핸들러
  const handleFocus = () => {
    if (query.length >= 1 && searchResults.length > 0) {
      setIsOpen(true)
    }
  }

  // 검색 초기화
  const handleClear = () => {
    setQuery('')
    setIsOpen(false)
    setSelectedIndex(-1)
    inputRef.current?.focus()
  }

  return (
    <div
      ref={containerRef}
      className={`quick-search ${className}`}
      role="combobox"
      aria-expanded={isOpen}
      aria-haspopup="listbox"
      aria-owns="quick-search-results"
    >
      {/* 검색 입력 */}
      <div className="quick-search__input-wrapper">
        <span className="quick-search__icon">
          <SFSymbol
            name="magnifyingglass"
            size={SFSymbolSize.FOOTNOTE}
            weight={SFSymbolWeight.MEDIUM}
          />
        </span>
        <input
          ref={inputRef}
          type="text"
          className="quick-search__input"
          placeholder={placeholder}
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          aria-label="빠른 검색"
          aria-autocomplete="list"
          aria-controls="quick-search-results"
          aria-activedescendant={selectedIndex >= 0 ? `quick-search-result-${selectedIndex}` : undefined}
        />
        {query && (
          <button
            className="quick-search__clear"
            onClick={handleClear}
            aria-label="검색어 지우기"
            type="button"
          >
            <SFSymbol
              name="xmark-circle-fill"
              size={SFSymbolSize.CAPTION_1}
              weight={SFSymbolWeight.MEDIUM}
            />
          </button>
        )}
      </div>

      {/* 검색 결과 드롭다운 */}
      {isOpen && (
        <div
          ref={resultsRef}
          id="quick-search-results"
          className="quick-search__results"
          role="listbox"
          aria-label="검색 결과"
        >
          {isLoading && (
            <div className="quick-search__loading">
              <span className="quick-search__loading-text">검색 중...</span>
            </div>
          )}

          {!isLoading && searchResults.length === 0 && debouncedQuery.length >= 1 && (
            <div className="quick-search__empty">
              <SFSymbol
                name="magnifyingglass"
                size={SFSymbolSize.CALLOUT}
                weight={SFSymbolWeight.ULTRALIGHT}
              />
              <span>"{debouncedQuery}"에 대한 결과가 없습니다</span>
            </div>
          )}

          {!isLoading && searchResults.length > 0 && (
            <>
              {/* 고객 섹션 */}
              {searchResults.some(r => r.type === 'customer') && (
                <div className="quick-search__section">
                  <div className="quick-search__section-header">
                    <SFSymbol
                      name="person"
                      size={SFSymbolSize.CAPTION_1}
                      weight={SFSymbolWeight.MEDIUM}
                    />
                    <span>고객</span>
                  </div>
                  {searchResults
                    .filter(r => r.type === 'customer')
                    .map((result, index) => {
                      const globalIndex = searchResults.findIndex(r => r.id === result.id)
                      return (
                        <div
                          key={result.id}
                          id={`quick-search-result-${globalIndex}`}
                          className={`quick-search__result ${globalIndex === selectedIndex ? 'quick-search__result--selected' : ''}`}
                          role="option"
                          aria-selected={globalIndex === selectedIndex}
                          onClick={() => handleResultClick(result)}
                          onMouseEnter={() => setSelectedIndex(globalIndex)}
                        >
                          <span className="quick-search__result-icon">
                            {renderCustomerIcon(result.customerType)}
                          </span>
                          <div className="quick-search__result-content">
                            <span className="quick-search__result-title">{result.title}</span>
                            {result.subtitle && (
                              <span className="quick-search__result-subtitle">{result.subtitle}</span>
                            )}
                          </div>
                          <span className="quick-search__result-arrow">
                            <SFSymbol
                              name="chevron-right"
                              size={SFSymbolSize.CAPTION_2}
                              weight={SFSymbolWeight.MEDIUM}
                            />
                          </span>
                        </div>
                      )
                    })}
                </div>
              )}

              {/* 고급 검색 링크 */}
              <div className="quick-search__footer">
                <button
                  className="quick-search__advanced-link"
                  onClick={() => {
                    if (onNavigate) {
                      onNavigate('document', 'search')
                    }
                    setIsOpen(false)
                  }}
                  type="button"
                >
                  <SFSymbol
                    name="magnifyingglass"
                    size={SFSymbolSize.CAPTION_1}
                    weight={SFSymbolWeight.MEDIUM}
                  />
                  <span>고급 검색</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default QuickSearch
