/**
 * ArFileTable
 * @description AR 파일 매핑 테이블 컴포넌트 (엑셀 스타일)
 */

import React, { useMemo, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Customer } from '@/features/customer/types/customer'
import type {
  ArFileTableRow,
  ArFileGroup,
  ArTableSortField,
  ArMappingStatusFilter,
} from '../../types/arBatchTypes'
import {
  formatIssueDate,
  isRowMapped,
  getRowMappingDisplayText,
} from '../../utils/arGroupingUtils'
import './ArFileTable.css'

export interface ArFileTableProps {
  /** 테이블 행 데이터 */
  rows: ArFileTableRow[]
  /** 그룹 정보 (드롭다운 옵션용) */
  groups: ArFileGroup[]
  /** 정렬 필드 */
  sortField: ArTableSortField | null
  /** 정렬 방향 */
  sortDirection: 'asc' | 'desc'
  /** 검색어 */
  searchQuery: string
  /** 매핑 상태 필터 */
  mappingStatusFilter: ArMappingStatusFilter
  /** 현재 페이지 */
  currentPage: number
  /** 페이지당 항목 수 */
  itemsPerPage: number
  /** 비활성화 */
  disabled?: boolean
  /** 행 선택 토글 */
  onToggleRowSelection: (fileId: string) => void
  /** 전체 선택/해제 */
  onSelectAllRows: (fileIds: string[], selected: boolean) => void
  /** 고객 매핑 변경 */
  onUpdateRowMapping: (fileId: string, customerId: string | null, customerName?: string) => void
  /** 새 고객 이름 변경 */
  onUpdateRowNewCustomer: (fileId: string, newCustomerName: string) => void
  /** 파일 포함/제외 토글 */
  onToggleRowIncluded: (fileId: string) => void
  /** 정렬 변경 */
  onSortChange: (field: ArTableSortField | null, direction: 'asc' | 'desc') => void
  /** 검색어 변경 */
  onSearchChange: (query: string) => void
  /** 필터 변경 */
  onFilterChange: (filter: ArMappingStatusFilter) => void
  /** 페이지 변경 */
  onPageChange: (page: number) => void
  /** 페이지당 항목 수 변경 */
  onItemsPerPageChange: (count: number) => void
  /** 일괄 고객 매핑 */
  onBulkAssignCustomer: (fileIds: string[], customerId: string, customerName: string) => void
  /** 일괄 새 고객 매핑 */
  onBulkAssignNewCustomer: (fileIds: string[], newCustomerName: string) => void
  /** 새 고객 등록 모달 열기 */
  onOpenNewCustomerModal: (fileId: string, defaultName: string) => void
  /** 고객 검색 모달 열기 */
  onOpenCustomerSearchModal: (fileId: string) => void
}

export const ArFileTable: React.FC<ArFileTableProps> = ({
  rows,
  groups,
  sortField,
  sortDirection,
  searchQuery,
  mappingStatusFilter,
  currentPage,
  itemsPerPage,
  disabled = false,
  onToggleRowSelection,
  onSelectAllRows,
  onUpdateRowMapping,
  onUpdateRowNewCustomer,
  onToggleRowIncluded,
  onSortChange,
  onSearchChange,
  onFilterChange,
  onPageChange,
  onItemsPerPageChange,
  onBulkAssignCustomer,
  onBulkAssignNewCustomer,
  onOpenNewCustomerModal,
  onOpenCustomerSearchModal,
}) => {
  // 드롭다운 상태
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })
  const dropdownTriggerRef = useRef<HTMLButtonElement | null>(null)

  // 필터링된 행
  const filteredRows = useMemo(() => {
    let result = rows

    // 검색 필터
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(row =>
        row.fileInfo.file.name.toLowerCase().includes(query) ||
        row.extractedCustomerName.toLowerCase().includes(query)
      )
    }

    // 매핑 상태 필터
    if (mappingStatusFilter !== 'all') {
      result = result.filter(row => {
        const isMapped = isRowMapped(row, groups)
        const isDuplicate = row.fileInfo.duplicateStatus.isHashDuplicate

        switch (mappingStatusFilter) {
          case 'mapped':
            return isMapped && !isDuplicate
          case 'unmapped':
            return !isMapped && !isDuplicate
          case 'duplicate':
            return isDuplicate
          default:
            return true
        }
      })
    }

    return result
  }, [rows, searchQuery, mappingStatusFilter, groups])

  // 정렬된 행
  const sortedRows = useMemo(() => {
    if (!sortField) return filteredRows

    return [...filteredRows].sort((a, b) => {
      let comparison = 0

      switch (sortField) {
        case 'fileName':
          comparison = a.fileInfo.file.name.localeCompare(b.fileInfo.file.name)
          break
        case 'extractedCustomer':
          comparison = a.extractedCustomerName.localeCompare(b.extractedCustomerName)
          break
        case 'mappedCustomer': {
          const aText = getRowMappingDisplayText(a, groups)
          const bText = getRowMappingDisplayText(b, groups)
          comparison = aText.localeCompare(bText)
          break
        }
        case 'issueDate':
          comparison = a.fileInfo.metadata.issue_date.localeCompare(b.fileInfo.metadata.issue_date)
          break
        case 'status': {
          const aStatus = a.fileInfo.duplicateStatus.isHashDuplicate ? 2 : (isRowMapped(a, groups) ? 0 : 1)
          const bStatus = b.fileInfo.duplicateStatus.isHashDuplicate ? 2 : (isRowMapped(b, groups) ? 0 : 1)
          comparison = aStatus - bStatus
          break
        }
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [filteredRows, sortField, sortDirection, groups])

  // 페이지네이션된 행
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return sortedRows.slice(start, start + itemsPerPage)
  }, [sortedRows, currentPage, itemsPerPage])

  // 총 페이지 수
  const totalPages = Math.ceil(sortedRows.length / itemsPerPage)

  // 현재 페이지의 모든 행이 선택되었는지
  const isAllPageSelected = paginatedRows.length > 0 && paginatedRows.every(row => row.isSelected)
  const isSomePageSelected = paginatedRows.some(row => row.isSelected)

  // 선택된 행 수
  const selectedCount = rows.filter(row => row.isSelected).length

  // 미매핑 행 목록 (중복 제외)
  const unmappedRows = useMemo(() => {
    return rows.filter(row =>
      !row.fileInfo.duplicateStatus.isHashDuplicate &&
      row.fileInfo.included &&
      !isRowMapped(row, groups)
    )
  }, [rows, groups])

  // 정렬 토글
  const handleSortToggle = useCallback((field: ArTableSortField) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        onSortChange(field, 'desc')
      } else {
        onSortChange(null, 'asc')
      }
    } else {
      onSortChange(field, 'asc')
    }
  }, [sortField, sortDirection, onSortChange])

  // 전체 선택 토글
  const handleSelectAllToggle = useCallback(() => {
    const pageFileIds = paginatedRows.map(row => row.fileInfo.fileId)
    onSelectAllRows(pageFileIds, !isAllPageSelected)
  }, [paginatedRows, isAllPageSelected, onSelectAllRows])

  // 드롭다운 열기
  const openDropdown = useCallback((fileId: string, triggerElement: HTMLButtonElement) => {
    const rect = triggerElement.getBoundingClientRect()
    setDropdownPosition({
      top: rect.bottom + 4,
      left: rect.left,
    })
    setOpenDropdownId(fileId)
    dropdownTriggerRef.current = triggerElement
  }, [])

  // 드롭다운 닫기
  const closeDropdown = useCallback(() => {
    setOpenDropdownId(null)
    dropdownTriggerRef.current = null
  }, [])

  // 고객 선택
  const handleSelectCustomer = useCallback((fileId: string, customer: Customer) => {
    onUpdateRowMapping(fileId, customer._id, customer.personal_info?.name)
    closeDropdown()
  }, [onUpdateRowMapping, closeDropdown])

  // 새 고객 등록
  const handleNewCustomer = useCallback((fileId: string, defaultName: string) => {
    closeDropdown()
    onOpenNewCustomerModal(fileId, defaultName)
  }, [closeDropdown, onOpenNewCustomerModal])

  // 고객 검색
  const handleSearchCustomer = useCallback((fileId: string) => {
    closeDropdown()
    onOpenCustomerSearchModal(fileId)
  }, [closeDropdown, onOpenCustomerSearchModal])

  // 일괄 매핑용 드롭다운 열기
  const [bulkDropdownOpen, setBulkDropdownOpen] = useState(false)
  const [bulkDropdownPosition, setBulkDropdownPosition] = useState({ top: 0, left: 0 })
  const bulkTriggerRef = useRef<HTMLButtonElement | null>(null)

  const openBulkDropdown = useCallback((triggerElement: HTMLButtonElement) => {
    const rect = triggerElement.getBoundingClientRect()
    setBulkDropdownPosition({
      top: rect.bottom + 4,
      left: rect.left,
    })
    setBulkDropdownOpen(true)
    bulkTriggerRef.current = triggerElement
  }, [])

  const closeBulkDropdown = useCallback(() => {
    setBulkDropdownOpen(false)
    bulkTriggerRef.current = null
  }, [])

  // 일괄 고객 선택
  const handleBulkSelectCustomer = useCallback((customer: Customer) => {
    const selectedFileIds = rows.filter(r => r.isSelected).map(r => r.fileInfo.fileId)
    onBulkAssignCustomer(selectedFileIds, customer._id, customer.personal_info?.name || '')
    closeBulkDropdown()
  }, [rows, onBulkAssignCustomer, closeBulkDropdown])

  // 모든 그룹의 매칭 고객 목록 (중복 제거)
  const allMatchingCustomers = useMemo(() => {
    const customerMap = new Map<string, Customer>()
    groups.forEach(group => {
      group.matchingCustomers.forEach(customer => {
        customerMap.set(customer._id, customer)
      })
    })
    return Array.from(customerMap.values())
  }, [groups])

  // 현재 행의 그룹 찾기
  const getGroupForRow = useCallback((row: ArFileTableRow) => {
    return groups.find(g => g.groupId === row.groupId)
  }, [groups])

  // 외부 클릭 시 드롭다운 닫기
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node

      if (openDropdownId) {
        const dropdownEl = document.querySelector('.ar-table-dropdown--open')
        if (dropdownEl && !dropdownEl.contains(target) && !dropdownTriggerRef.current?.contains(target)) {
          closeDropdown()
        }
      }

      if (bulkDropdownOpen) {
        const bulkDropdownEl = document.querySelector('.ar-table-bulk-dropdown--open')
        if (bulkDropdownEl && !bulkDropdownEl.contains(target) && !bulkTriggerRef.current?.contains(target)) {
          closeBulkDropdown()
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openDropdownId, bulkDropdownOpen, closeDropdown, closeBulkDropdown])

  return (
    <div className="ar-file-table">
      {/* 도구바 */}
      <div className="ar-file-table__toolbar">
        <div className="ar-file-table__toolbar-left">
          {/* 검색 */}
          <input
            type="text"
            className="ar-file-table__search"
            placeholder="파일명 또는 고객명 검색..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            disabled={disabled}
          />

          {/* 필터 */}
          <select
            className="ar-file-table__filter"
            value={mappingStatusFilter}
            onChange={(e) => onFilterChange(e.target.value as ArMappingStatusFilter)}
            disabled={disabled}
          >
            <option value="all">전체</option>
            <option value="mapped">매핑 완료</option>
            <option value="unmapped">미매핑</option>
            <option value="duplicate">중복</option>
          </select>
        </div>

        <div className="ar-file-table__toolbar-right">
          {/* 미매핑 전체 선택 버튼 */}
          {unmappedRows.length > 0 && selectedCount === 0 && (
            <button
              type="button"
              className="ar-file-table__quick-select-btn"
              onClick={() => {
                const unmappedFileIds = unmappedRows.map(r => r.fileInfo.fileId)
                onSelectAllRows(unmappedFileIds, true)
              }}
              disabled={disabled}
            >
              미매핑 {unmappedRows.length}개 전체 선택
            </button>
          )}
          <span className="ar-file-table__count">
            {filteredRows.length}개 파일
          </span>
        </div>
      </div>

      {/* 일괄 매핑 도구바 - 선택된 파일이 있을 때 표시 */}
      {selectedCount > 0 && (
        <div className="ar-file-table__bulk-toolbar">
          <span className="ar-file-table__bulk-count">
            ✓ {selectedCount}개 파일 선택됨
          </span>
          <span className="ar-file-table__bulk-arrow">→</span>
          <button
            type="button"
            className="ar-file-table__bulk-btn ar-file-table__bulk-btn--primary"
            onClick={(e) => openBulkDropdown(e.currentTarget)}
            disabled={disabled}
          >
            같은 고객에게 일괄 매핑 ▼
          </button>
          <button
            type="button"
            className="ar-file-table__bulk-btn ar-file-table__bulk-btn--ghost"
            onClick={() => {
              const selectedFileIds = rows.filter(r => r.isSelected).map(r => r.fileInfo.fileId)
              onSelectAllRows(selectedFileIds, false)
            }}
            disabled={disabled}
          >
            선택 해제
          </button>
        </div>
      )}

      {/* 테이블 헤더 */}
      <div className="ar-file-table__header">
        <div className="ar-file-table__col ar-file-table__col--checkbox">
          <input
            type="checkbox"
            checked={isAllPageSelected}
            ref={input => {
              if (input) input.indeterminate = isSomePageSelected && !isAllPageSelected
            }}
            onChange={handleSelectAllToggle}
            disabled={disabled}
          />
        </div>
        <div
          className={`ar-file-table__col ar-file-table__col--filename ar-file-table__col--sortable ${sortField === 'fileName' ? 'ar-file-table__col--sorted' : ''}`}
          onClick={() => handleSortToggle('fileName')}
        >
          파일명
          {sortField === 'fileName' && (
            <span className="ar-file-table__sort-icon">{sortDirection === 'asc' ? '▲' : '▼'}</span>
          )}
        </div>
        <div
          className={`ar-file-table__col ar-file-table__col--extracted ar-file-table__col--sortable ${sortField === 'extractedCustomer' ? 'ar-file-table__col--sorted' : ''}`}
          onClick={() => handleSortToggle('extractedCustomer')}
        >
          AR 고객명
          {sortField === 'extractedCustomer' && (
            <span className="ar-file-table__sort-icon">{sortDirection === 'asc' ? '▲' : '▼'}</span>
          )}
        </div>
        <div
          className={`ar-file-table__col ar-file-table__col--mapped ar-file-table__col--sortable ${sortField === 'mappedCustomer' ? 'ar-file-table__col--sorted' : ''}`}
          onClick={() => handleSortToggle('mappedCustomer')}
        >
          매핑 고객
          {sortField === 'mappedCustomer' && (
            <span className="ar-file-table__sort-icon">{sortDirection === 'asc' ? '▲' : '▼'}</span>
          )}
        </div>
        <div
          className={`ar-file-table__col ar-file-table__col--date ar-file-table__col--sortable ${sortField === 'issueDate' ? 'ar-file-table__col--sorted' : ''}`}
          onClick={() => handleSortToggle('issueDate')}
        >
          발행일
          {sortField === 'issueDate' && (
            <span className="ar-file-table__sort-icon">{sortDirection === 'asc' ? '▲' : '▼'}</span>
          )}
        </div>
        <div
          className={`ar-file-table__col ar-file-table__col--status ar-file-table__col--sortable ${sortField === 'status' ? 'ar-file-table__col--sorted' : ''}`}
          onClick={() => handleSortToggle('status')}
        >
          상태
          {sortField === 'status' && (
            <span className="ar-file-table__sort-icon">{sortDirection === 'asc' ? '▲' : '▼'}</span>
          )}
        </div>
        <div className="ar-file-table__col ar-file-table__col--include">
          포함
        </div>
      </div>

      {/* 테이블 바디 */}
      <div className="ar-file-table__body">
        {paginatedRows.length === 0 ? (
          <div className="ar-file-table__empty">
            {searchQuery || mappingStatusFilter !== 'all'
              ? '검색 결과가 없습니다'
              : '파일이 없습니다'}
          </div>
        ) : (
          paginatedRows.map(row => {
            const isMapped = isRowMapped(row, groups)
            const isDuplicate = row.fileInfo.duplicateStatus.isHashDuplicate
            const isDateDuplicate = row.fileInfo.duplicateStatus.isIssueDateDuplicate
            const displayText = getRowMappingDisplayText(row, groups)
            const group = getGroupForRow(row)
            const needsSelection = !isMapped && !isDuplicate

            return (
              <div
                key={row.fileInfo.fileId}
                className={`ar-file-table__row ${row.isSelected ? 'ar-file-table__row--selected' : ''} ${!row.fileInfo.included ? 'ar-file-table__row--excluded' : ''} ${isDuplicate ? 'ar-file-table__row--duplicate' : ''}`}
              >
                {/* 체크박스 */}
                <div className="ar-file-table__col ar-file-table__col--checkbox">
                  <input
                    type="checkbox"
                    checked={row.isSelected}
                    onChange={() => onToggleRowSelection(row.fileInfo.fileId)}
                    disabled={disabled}
                  />
                </div>

                {/* 파일명 */}
                <div className="ar-file-table__col ar-file-table__col--filename">
                  <span className="ar-file-table__filename" title={row.fileInfo.file.name}>
                    {row.fileInfo.file.name}
                  </span>
                </div>

                {/* AR 추출 고객명 */}
                <div className="ar-file-table__col ar-file-table__col--extracted">
                  <span title={row.extractedCustomerName}>
                    {row.extractedCustomerName === '__UNKNOWN__' ? '(알 수 없음)' : row.extractedCustomerName}
                  </span>
                </div>

                {/* 매핑 고객 드롭다운 */}
                <div className="ar-file-table__col ar-file-table__col--mapped">
                  <button
                    type="button"
                    className={`ar-file-table__dropdown-trigger ${needsSelection ? 'ar-file-table__dropdown-trigger--needs' : ''} ${openDropdownId === row.fileInfo.fileId ? 'ar-file-table__dropdown-trigger--open' : ''}`}
                    onClick={(e) => openDropdown(row.fileInfo.fileId, e.currentTarget)}
                    disabled={disabled || isDuplicate}
                  >
                    <span className="ar-file-table__dropdown-text">{displayText}</span>
                    <span className="ar-file-table__dropdown-arrow">▼</span>
                  </button>
                </div>

                {/* 발행일 */}
                <div className="ar-file-table__col ar-file-table__col--date">
                  {formatIssueDate(row.fileInfo.metadata.issue_date)}
                </div>

                {/* 상태 */}
                <div className="ar-file-table__col ar-file-table__col--status">
                  {isDuplicate ? (
                    <span className="ar-file-table__badge ar-file-table__badge--duplicate">중복</span>
                  ) : isDateDuplicate ? (
                    <span className="ar-file-table__badge ar-file-table__badge--warning">날짜중복</span>
                  ) : isMapped ? (
                    <span className="ar-file-table__badge ar-file-table__badge--ok">✓</span>
                  ) : (
                    <span className="ar-file-table__badge ar-file-table__badge--pending">미매핑</span>
                  )}
                </div>

                {/* 포함 여부 */}
                <div className="ar-file-table__col ar-file-table__col--include">
                  <input
                    type="checkbox"
                    checked={row.fileInfo.included}
                    onChange={() => onToggleRowIncluded(row.fileInfo.fileId)}
                    disabled={disabled || isDuplicate}
                  />
                </div>

                {/* 행별 드롭다운 메뉴 (Portal) */}
                {openDropdownId === row.fileInfo.fileId && group && createPortal(
                  <div
                    className="ar-table-dropdown ar-table-dropdown--open"
                    style={{
                      position: 'fixed',
                      top: dropdownPosition.top,
                      left: dropdownPosition.left,
                    }}
                  >
                    {/* 매칭된 고객 목록 */}
                    {group.matchingCustomers.length > 0 && (
                      <>
                        <div className="ar-table-dropdown__section-title">추천 고객</div>
                        {group.matchingCustomers.map(customer => (
                          <button
                            key={customer._id}
                            type="button"
                            className={`ar-table-dropdown__option ${row.individualCustomerId === customer._id ? 'ar-table-dropdown__option--selected' : ''}`}
                            onClick={() => handleSelectCustomer(row.fileInfo.fileId, customer)}
                          >
                            <span className="ar-table-dropdown__option-name">
                              {customer.personal_info?.name || '이름 없음'}
                            </span>
                            <span className="ar-table-dropdown__option-type">
                              ({customer.insurance_info?.customer_type || '개인'})
                            </span>
                            {row.individualCustomerId === customer._id && (
                              <span className="ar-table-dropdown__option-check">✓</span>
                            )}
                          </button>
                        ))}
                        <div className="ar-table-dropdown__divider" />
                      </>
                    )}

                    {/* 새 고객 등록 */}
                    <button
                      type="button"
                      className="ar-table-dropdown__option ar-table-dropdown__option--action"
                      onClick={() => handleNewCustomer(row.fileInfo.fileId, row.extractedCustomerName)}
                    >
                      <span className="ar-table-dropdown__option-icon">+</span>
                      <span className="ar-table-dropdown__option-text">새 고객 등록</span>
                    </button>

                    {/* 다른 고객 검색 */}
                    <button
                      type="button"
                      className="ar-table-dropdown__option ar-table-dropdown__option--action"
                      onClick={() => handleSearchCustomer(row.fileInfo.fileId)}
                    >
                      <span className="ar-table-dropdown__option-icon">Q</span>
                      <span className="ar-table-dropdown__option-text">
                        {group.matchingCustomers.length > 0 ? '다른 고객 검색' : '기존 고객 검색'}
                      </span>
                    </button>
                  </div>,
                  document.body
                )}
              </div>
            )
          })
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="ar-file-table__pagination">
          <div className="ar-file-table__pagination-info">
            {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, sortedRows.length)} / {sortedRows.length}
          </div>
          <div className="ar-file-table__pagination-controls">
            <button
              type="button"
              className="ar-file-table__pagination-btn"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1 || disabled}
            >
              ◀
            </button>
            <span className="ar-file-table__pagination-current">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              className="ar-file-table__pagination-btn"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages || disabled}
            >
              ▶
            </button>
          </div>
          <select
            className="ar-file-table__pagination-size"
            value={itemsPerPage}
            onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
            disabled={disabled}
          >
            <option value={10}>10개씩</option>
            <option value={20}>20개씩</option>
            <option value={50}>50개씩</option>
            <option value={100}>100개씩</option>
          </select>
        </div>
      )}

      {/* 일괄 매핑 드롭다운 (Portal) */}
      {bulkDropdownOpen && createPortal(
        <div
          className="ar-table-dropdown ar-table-bulk-dropdown--open"
          style={{
            position: 'fixed',
            top: bulkDropdownPosition.top,
            left: bulkDropdownPosition.left,
          }}
        >
          <div className="ar-table-dropdown__section-title">일괄 매핑할 고객 선택</div>
          {allMatchingCustomers.length > 0 ? (
            allMatchingCustomers.map(customer => (
              <button
                key={customer._id}
                type="button"
                className="ar-table-dropdown__option"
                onClick={() => handleBulkSelectCustomer(customer)}
              >
                <span className="ar-table-dropdown__option-name">
                  {customer.personal_info?.name || '이름 없음'}
                </span>
                <span className="ar-table-dropdown__option-type">
                  ({customer.insurance_info?.customer_type || '개인'})
                </span>
              </button>
            ))
          ) : (
            <div className="ar-table-dropdown__empty">매칭된 고객이 없습니다</div>
          )}
          <div className="ar-table-dropdown__divider" />
          <button
            type="button"
            className="ar-table-dropdown__option ar-table-dropdown__option--action"
            onClick={() => {
              closeBulkDropdown()
              // 첫 번째 선택된 행의 추출 고객명 사용
              const firstSelected = rows.find(r => r.isSelected)
              if (firstSelected) {
                onOpenNewCustomerModal('__BULK__', firstSelected.extractedCustomerName)
              }
            }}
          >
            <span className="ar-table-dropdown__option-icon">+</span>
            <span className="ar-table-dropdown__option-text">새 고객으로 일괄 등록</span>
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}

export default ArFileTable
