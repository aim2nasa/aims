/**
 * CrFileTable
 * @description CRS 파일 매핑 테이블 컴포넌트 (엑셀 스타일 - native table)
 * @see docs/AR_CRS_BATCH_REGISTRATION_COMPARISON.md
 */

import React, { useMemo, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Customer } from '@/entities/customer/model'
import type {
  CrFileTableRow,
  CrFileGroup,
  CrTableSortField,
  CrMappingStatusFilter,
} from '../../types/crBatchTypes'
import {
  formatIssueDate,
  isRowMapped,
  getRowMappingDisplayText,
  isRowMappedWithMap,
  getRowMappingDisplayTextWithMap,
} from '../../utils/crGroupingUtils'
// CSS는 AR 스타일 재사용 (Phase 2에서 공통화)
import { SortIndicator } from '@/shared/ui/SortIndicator'
import '../BatchArMappingModal/ArFileTable.css'

// ===== 타입 정의 =====

export interface CrFileTableProps {
  /** 테이블 행 데이터 */
  rows: CrFileTableRow[]
  /** 그룹 정보 (드롭다운 옵션용) */
  groups: CrFileGroup[]
  /** 정렬 필드 */
  sortField: CrTableSortField | null
  /** 정렬 방향 */
  sortDirection: 'asc' | 'desc'
  /** 검색어 */
  searchQuery: string
  /** 매핑 상태 필터 */
  mappingStatusFilter: CrMappingStatusFilter
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
  onSortChange: (field: CrTableSortField | null, direction: 'asc' | 'desc') => void
  /** 검색어 변경 */
  onSearchChange: (query: string) => void
  /** 필터 변경 */
  onFilterChange: (filter: CrMappingStatusFilter) => void
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
}

interface CrFileTableRowProps {
  row: CrFileTableRow
  rowIndex: number
  rowNumber: number // 표시용 행 번호
  group: CrFileGroup | undefined
  isMapped: boolean
  isDuplicate: boolean
  isIssueDatePolicyDuplicate: boolean
  displayText: string
  sameNameCount: number
  isDropdownOpen: boolean
  disabled: boolean
  /** 체크박스 비활성화 (다른 계약자명 선택 시) */
  isCheckboxDisabled: boolean
  /** 드롭다운 비활성화 (2개 이상 선택 시 - 일괄 매핑만 가능) */
  isDropdownDisabled: boolean
  onCheckboxClick: (e: React.MouseEvent, rowIndex: number, fileId: string) => void
  onExtractedNameClick: (customerName: string) => void
  onDropdownOpen: (fileId: string, el: HTMLButtonElement) => void
  onToggleIncluded: (fileId: string) => void
}

// ===== 행 컴포넌트 (React.memo) =====

const CrFileTableRowComponent = React.memo<CrFileTableRowProps>(({
  row,
  rowIndex,
  rowNumber,
  group,
  isMapped,
  isDuplicate,
  isIssueDatePolicyDuplicate,
  displayText,
  sameNameCount,
  isDropdownOpen,
  disabled,
  isCheckboxDisabled,
  isDropdownDisabled,
  onCheckboxClick,
  onExtractedNameClick,
  onDropdownOpen,
  onToggleIncluded,
}) => {
  const needsSelection = !isMapped && !isDuplicate

  // 행 클래스 계산 (AR 스타일 재사용)
  const rowClassName = [
    'ar-file-table__tr',
    row.isSelected && 'ar-file-table__tr--selected',
    !row.fileInfo.included && 'ar-file-table__tr--excluded',
    isDuplicate && 'ar-file-table__tr--duplicate',
    isCheckboxDisabled && 'ar-file-table__tr--disabled',
  ].filter(Boolean).join(' ')

  return (
    <tr className={rowClassName}>
      {/* 행 번호 */}
      <td className="ar-file-table__td ar-file-table__td--rownum">
        {rowNumber}
      </td>

      {/* 체크박스 */}
      <td className="ar-file-table__td ar-file-table__td--checkbox">
        <input
          type="checkbox"
          checked={row.isSelected}
          onClick={(e) => {
            e.stopPropagation()
            onCheckboxClick(e, rowIndex, row.fileInfo.fileId)
          }}
          onChange={() => {/* onClick에서 처리 */}}
          disabled={disabled || isCheckboxDisabled}
          title={isCheckboxDisabled ? '다른 계약자명의 파일이 선택되어 있습니다' : undefined}
        />
      </td>

      {/* 파일명 */}
      <td className="ar-file-table__td ar-file-table__td--filename" title={row.fileInfo.file.name}>
        {row.fileInfo.file.name}
      </td>

      {/* CRS 추출 계약자명 */}
      <td className="ar-file-table__td ar-file-table__td--extracted">
        <button
          type="button"
          className="ar-file-table__extracted-name"
          onClick={() => onExtractedNameClick(row.extractedContractorName)}
          disabled={disabled}
          title={sameNameCount > 1 ? `클릭하여 "${row.extractedContractorName}" ${sameNameCount}개 파일 선택/해제` : row.extractedContractorName}
        >
          {row.extractedContractorName === '__UNKNOWN__' ? '(알 수 없음)' : row.extractedContractorName}
          {sameNameCount > 1 && (
            <span className="ar-file-table__extracted-count">({sameNameCount})</span>
          )}
        </button>
      </td>

      {/* 매핑 고객 드롭다운 */}
      <td className="ar-file-table__td ar-file-table__td--mapped">
        <button
          type="button"
          className={[
            'ar-file-table__dropdown-trigger',
            needsSelection && !isDropdownDisabled && 'ar-file-table__dropdown-trigger--needs',
            isDropdownOpen && 'ar-file-table__dropdown-trigger--open',
            isDropdownDisabled && 'ar-file-table__dropdown-trigger--disabled',
          ].filter(Boolean).join(' ')}
          onClick={(e) => onDropdownOpen(row.fileInfo.fileId, e.currentTarget)}
          disabled={disabled || isDuplicate || isDropdownDisabled}
          title={isDropdownDisabled ? '2개 이상 선택 시 "같은 고객에게 일괄 매핑"만 사용 가능' : undefined}
        >
          <span className="ar-file-table__dropdown-text">{displayText}</span>
          <span className="ar-file-table__dropdown-arrow">▼</span>
        </button>
      </td>

      {/* 증권번호 (CRS 전용 컬럼) */}
      <td className="ar-file-table__td ar-file-table__td--policy" title={row.extractedPolicyNumber || ''}>
        {row.extractedPolicyNumber || '-'}
      </td>

      {/* 발행일 */}
      <td className="ar-file-table__td ar-file-table__td--date">
        {formatIssueDate(row.fileInfo.metadata.issue_date ?? "")}
      </td>

      {/* 상태 */}
      <td className="ar-file-table__td ar-file-table__td--status">
        {isDuplicate ? (
          <span className="ar-file-table__badge ar-file-table__badge--duplicate">중복</span>
        ) : isIssueDatePolicyDuplicate ? (
          <span className="ar-file-table__badge ar-file-table__badge--warning">증권중복</span>
        ) : isMapped ? (
          <span className="ar-file-table__badge ar-file-table__badge--ok">✓</span>
        ) : (
          <span className="ar-file-table__badge ar-file-table__badge--pending">미매핑</span>
        )}
      </td>

      {/* 포함 여부 */}
      <td className="ar-file-table__td ar-file-table__td--include">
        <input
          type="checkbox"
          checked={row.fileInfo.included}
          onChange={() => onToggleIncluded(row.fileInfo.fileId)}
          disabled={disabled || isDuplicate}
        />
      </td>
    </tr>
  )
}, (prev, next) => {
  // 얕은 비교로 불필요한 리렌더링 방지
  return (
    prev.row === next.row &&
    prev.isMapped === next.isMapped &&
    prev.isDropdownOpen === next.isDropdownOpen &&
    prev.sameNameCount === next.sameNameCount &&
    prev.disabled === next.disabled &&
    prev.isCheckboxDisabled === next.isCheckboxDisabled &&
    prev.isDropdownDisabled === next.isDropdownDisabled
  )
})

CrFileTableRowComponent.displayName = 'CrFileTableRow'

// ===== 메인 컴포넌트 =====

// 컬럼 기본 너비 설정 (CRS: 증권번호 컬럼 추가)
const DEFAULT_COL_WIDTHS = {
  rownum: 36,
  checkbox: 32,
  filename: 0, // flex (자동)
  extracted: 80,
  mapped: 140,
  policy: 90, // CRS 전용: 증권번호
  date: 75,
  status: 55,
  include: 36,
}

// 컬럼 최소 너비
const MIN_COL_WIDTHS = {
  rownum: 30,
  checkbox: 28,
  filename: 100,
  extracted: 60,
  mapped: 100,
  policy: 70,
  date: 60,
  status: 45,
  include: 30,
}

export const CrFileTable: React.FC<CrFileTableProps> = ({
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
  onToggleRowIncluded,
  onSortChange,
  onSearchChange,
  onFilterChange,
  onPageChange,
  onItemsPerPageChange,
  onBulkAssignCustomer,
  onOpenNewCustomerModal,
}) => {
  // 드롭다운 상태 (단일 관리)
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })
  const dropdownTriggerRef = useRef<HTMLButtonElement | null>(null)

  // Shift+Click 범위 선택을 위한 마지막 클릭 인덱스
  const lastClickedIndexRef = useRef<number | null>(null)

  // 컬럼 리사이즈 상태
  const [colWidths, setColWidths] = useState(DEFAULT_COL_WIDTHS)
  const [isResizing, setIsResizing] = useState(false)
  const resizingColRef = useRef<keyof typeof DEFAULT_COL_WIDTHS | null>(null)
  const resizeStartXRef = useRef<number>(0)
  const resizeStartWidthRef = useRef<number>(0)

  // 컬럼 리사이즈 핸들러
  const handleResizeMouseDown = useCallback((
    e: React.MouseEvent,
    colKey: keyof typeof DEFAULT_COL_WIDTHS
  ) => {
    e.preventDefault()
    e.stopPropagation()
    resizingColRef.current = colKey
    resizeStartXRef.current = e.clientX
    resizeStartWidthRef.current = colWidths[colKey]
    setIsResizing(true)
  }, [colWidths])

  // 리사이즈 중 마우스 이동 처리
  React.useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingColRef.current) return

      const colKey = resizingColRef.current
      const delta = e.clientX - resizeStartXRef.current
      const newWidth = Math.max(MIN_COL_WIDTHS[colKey], resizeStartWidthRef.current + delta)

      setColWidths(prev => ({
        ...prev,
        [colKey]: newWidth,
      }))
    }

    const handleMouseUp = () => {
      resizingColRef.current = null
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  // groupMap 캐싱 (O(1) 조회용)
  const groupMap = useMemo(
    () => new Map(groups.map(g => [g.groupId, g])),
    [groups]
  )

  // 필터링된 행
  const filteredRows = useMemo(() => {
    let result = rows

    // 검색 필터
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(row =>
        row.fileInfo.file.name.toLowerCase().includes(query) ||
        row.extractedContractorName.toLowerCase().includes(query) ||
        (row.extractedPolicyNumber && row.extractedPolicyNumber.toLowerCase().includes(query))
      )
    }

    // 매핑 상태 필터
    if (mappingStatusFilter !== 'all') {
      result = result.filter(row => {
        const isMapped = isRowMappedWithMap(row, groupMap)
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
  }, [rows, searchQuery, mappingStatusFilter, groupMap])

  // 정렬된 행
  const sortedRows = useMemo(() => {
    // 기본 정렬 순서: 미매핑(0) → 매핑됨(1)
    const getDefaultSortOrder = (row: CrFileTableRow) => {
      return isRowMappedWithMap(row, groupMap) ? 1 : 0
    }

    if (!sortField) {
      return [...filteredRows].sort((a, b) => getDefaultSortOrder(a) - getDefaultSortOrder(b))
    }

    return [...filteredRows].sort((a, b) => {
      let comparison = 0

      switch (sortField) {
        case 'fileName':
          comparison = a.fileInfo.file.name.localeCompare(b.fileInfo.file.name)
          break
        case 'extractedContractor':
          comparison = a.extractedContractorName.localeCompare(b.extractedContractorName)
          break
        case 'mappedCustomer': {
          const aText = getRowMappingDisplayTextWithMap(a, groupMap)
          const bText = getRowMappingDisplayTextWithMap(b, groupMap)
          comparison = aText.localeCompare(bText)
          break
        }
        case 'policyNumber':
          comparison = (a.extractedPolicyNumber || '').localeCompare(b.extractedPolicyNumber || '')
          break
        case 'issueDate':
          comparison = (a.fileInfo.metadata.issue_date || '').localeCompare(b.fileInfo.metadata.issue_date || '')
          break
        case 'status': {
          const aStatus = a.fileInfo.duplicateStatus.isHashDuplicate ? 2 : (isRowMappedWithMap(a, groupMap) ? 0 : 1)
          const bStatus = b.fileInfo.duplicateStatus.isHashDuplicate ? 2 : (isRowMappedWithMap(b, groupMap) ? 0 : 1)
          comparison = aStatus - bStatus
          break
        }
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [filteredRows, sortField, sortDirection, groupMap])

  // 페이지네이션된 행
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return sortedRows.slice(start, start + itemsPerPage)
  }, [sortedRows, currentPage, itemsPerPage])

  // 총 페이지 수
  const totalPages = Math.ceil(sortedRows.length / itemsPerPage)

  // 선택된 행 수
  const selectedCount = rows.filter(row => row.isSelected).length

  // 선택된 파일들의 공통 계약자명 확인 (여기서 먼저 정의)
  const selectedRowsInfo = useMemo(() => {
    const selectedRows = rows.filter(r => r.isSelected)
    if (selectedRows.length === 0) {
      return { firstContractorName: null, commonContractorName: null, isAllSameName: true, selectedRows: [] }
    }

    const firstContractorName = selectedRows[0].extractedContractorName
    const isAllSameName = selectedRows.every(r => r.extractedContractorName === firstContractorName)

    return {
      firstContractorName,  // 체크박스 비활성화용 (항상 첫 번째 선택된 파일의 계약자명)
      commonContractorName: isAllSameName ? firstContractorName : null,  // 일괄 매핑용
      isAllSameName,
      selectedRows,
    }
  }, [rows])

  // 현재 페이지에서 enable된 행만 필터링 (1개 이상 선택 시 같은 계약자명만 enable)
  const enabledPageRows = useMemo(() => {
    return paginatedRows.filter(row => {
      if (selectedRowsInfo.firstContractorName === null) return true
      return row.extractedContractorName === selectedRowsInfo.firstContractorName
    })
  }, [paginatedRows, selectedRowsInfo.firstContractorName])

  // 현재 페이지의 모든 enable된 행이 선택되었는지
  const isAllPageSelected = enabledPageRows.length > 0 && enabledPageRows.every(row => row.isSelected)
  const isSomePageSelected = paginatedRows.some(row => row.isSelected)

  // 미매핑 행 목록 (중복 제외)
  const unmappedRows = useMemo(() => {
    return rows.filter(row =>
      !row.fileInfo.duplicateStatus.isHashDuplicate &&
      row.fileInfo.included &&
      !isRowMappedWithMap(row, groupMap)
    )
  }, [rows, groupMap])

  // 같은 계약자명 카운트 맵
  const sameNameCountMap = useMemo(() => {
    const map = new Map<string, number>()
    paginatedRows.forEach(row => {
      const name = row.extractedContractorName
      map.set(name, (map.get(name) || 0) + 1)
    })
    return map
  }, [paginatedRows])

  // 페이지에 여러 계약자명이 있으면 헤더 체크박스 비활성화
  const hasMultipleContractorNames = sameNameCountMap.size > 1
  const isHeaderCheckboxDisabled = hasMultipleContractorNames

  // 정렬 토글
  const handleSortToggle = useCallback((field: CrTableSortField) => {
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

  // 전체 선택 토글 (enable된 체크박스만 선택)
  const handleSelectAllToggle = useCallback(() => {
    // 1개 이상 선택 시, 같은 계약자명만 선택 가능 (disabled 체크박스 제외)
    const enabledRows = paginatedRows.filter(row => {
      if (selectedRowsInfo.firstContractorName === null) return true
      return row.extractedContractorName === selectedRowsInfo.firstContractorName
    })
    const pageFileIds = enabledRows.map(row => row.fileInfo.fileId)
    onSelectAllRows(pageFileIds, !isAllPageSelected)
  }, [paginatedRows, isAllPageSelected, onSelectAllRows, selectedRowsInfo.firstContractorName])

  // Shift+Click 범위 선택 핸들러 (enable된 체크박스만 선택)
  const handleRowCheckboxClick = useCallback((
    e: React.MouseEvent,
    rowIndex: number,
    fileId: string
  ) => {
    if (e.shiftKey && lastClickedIndexRef.current !== null) {
      const start = Math.min(lastClickedIndexRef.current, rowIndex)
      const end = Math.max(lastClickedIndexRef.current, rowIndex)
      // 범위 내에서 enable된 행만 선택 (같은 계약자명)
      const rangeRows = paginatedRows.slice(start, end + 1)
      const enabledRangeRows = rangeRows.filter(row => {
        if (selectedRowsInfo.firstContractorName === null) return true
        return row.extractedContractorName === selectedRowsInfo.firstContractorName
      })
      const rangeFileIds = enabledRangeRows.map(row => row.fileInfo.fileId)
      onSelectAllRows(rangeFileIds, true)
    } else {
      onToggleRowSelection(fileId)
    }
    lastClickedIndexRef.current = rowIndex
  }, [paginatedRows, onSelectAllRows, onToggleRowSelection, selectedRowsInfo.firstContractorName])

  // 계약자명 클릭 시 같은 계약자명 파일들 선택 토글
  const handleExtractedNameClick = useCallback((contractorName: string) => {
    const sameNameRows = paginatedRows.filter(
      row => row.extractedContractorName === contractorName
    )
    const allSelected = sameNameRows.every(row => row.isSelected)
    const fileIds = sameNameRows.map(row => row.fileInfo.fileId)
    onSelectAllRows(fileIds, !allSelected)
  }, [paginatedRows, onSelectAllRows])

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

  // 일괄 매핑용 드롭다운
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

  // 일괄 매핑용 고객 목록 (선택된 파일들의 그룹에서 가져옴)
  const bulkMatchingCustomers = useMemo(() => {
    if (!selectedRowsInfo.isAllSameName || selectedRowsInfo.selectedRows.length === 0) {
      return []
    }

    // 첫 번째 선택된 행의 groupId로 그룹 찾기
    const firstRow = selectedRowsInfo.selectedRows[0]
    const matchingGroup = groups.find(g => g.groupId === firstRow.groupId)

    if (!matchingGroup) {
      return []
    }

    return matchingGroup.matchingCustomers
  }, [groups, selectedRowsInfo])

  // 현재 행의 그룹 찾기
  const getGroupForRow = useCallback((row: CrFileTableRow) => {
    return groups.find(g => g.groupId === row.groupId)
  }, [groups])

  // 현재 열린 드롭다운의 행과 그룹
  const openDropdownRow = useMemo(() => {
    if (!openDropdownId) return null
    return paginatedRows.find(r => r.fileInfo.fileId === openDropdownId) || null
  }, [openDropdownId, paginatedRows])

  const openDropdownGroup = useMemo(() => {
    if (!openDropdownRow) return null
    return getGroupForRow(openDropdownRow)
  }, [openDropdownRow, getGroupForRow])

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

  // 헤더 정렬 아이콘 렌더 (공유 컴포넌트)
  const renderSortIcon = (field: CrTableSortField) => {
    return <SortIndicator field={field} currentSortField={sortField} sortDirection={sortDirection} />
  }

  // 헤더 클래스
  const getThClass = (field: CrTableSortField) => {
    return [
      'ar-file-table__th',
      `ar-file-table__th--${field.toLowerCase()}`,
      'ar-file-table__th--sortable',
      sortField === field && 'ar-file-table__th--sorted',
    ].filter(Boolean).join(' ')
  }

  return (
    <div className="ar-file-table" style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0', minHeight: 0, height: '100%' }}>
      {/* 도구바 */}
      <div className="ar-file-table__toolbar">
        <div className="ar-file-table__toolbar-left">
          <input
            type="text"
            className="ar-file-table__search"
            placeholder="파일명, 계약자명, 증권번호 검색..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            disabled={disabled}
          />
          <select
            className="ar-file-table__filter"
            value={mappingStatusFilter}
            onChange={(e) => onFilterChange(e.target.value as CrMappingStatusFilter)}
            disabled={disabled}
          >
            <option value="all">전체</option>
            <option value="mapped">매핑 완료</option>
            <option value="unmapped">미매핑</option>
          </select>
        </div>

        <div className="ar-file-table__toolbar-right">
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

      {/* 일괄 매핑 도구바 */}
      {selectedCount > 0 && (
        <div className="ar-file-table__bulk-toolbar">
          <span className="ar-file-table__bulk-count">
            ✓ {selectedCount}개 파일 선택됨
            {selectedRowsInfo.isAllSameName && selectedRowsInfo.commonContractorName && (
              <span className="ar-file-table__bulk-group-name">
                ({selectedRowsInfo.commonContractorName})
              </span>
            )}
          </span>
          <span className="ar-file-table__bulk-arrow">→</span>
          {selectedRowsInfo.isAllSameName ? (
            <button
              type="button"
              className="ar-file-table__bulk-btn ar-file-table__bulk-btn--primary"
              onClick={(e) => openBulkDropdown(e.currentTarget)}
              disabled={disabled}
            >
              같은 고객에게 일괄 매핑 ▼
            </button>
          ) : (
            <span className="ar-file-table__bulk-warning">
              ⚠️ 계약자명이 다른 파일은 함께 매핑할 수 없습니다
            </span>
          )}
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

      {/* 테이블 컨테이너 */}
      <div className="ar-file-table__table-container" style={{ flex: '1 1 0', minHeight: 0, overflow: 'auto' }}>
        <table className="ar-file-table__table">
          <colgroup>{/* prettier-ignore */}
            <col style={{ width: colWidths.rownum }} /><col style={{ width: colWidths.checkbox }} /><col /><col style={{ width: colWidths.extracted }} /><col style={{ width: colWidths.mapped }} /><col style={{ width: colWidths.policy }} /><col style={{ width: colWidths.date }} /><col style={{ width: colWidths.status }} /><col style={{ width: colWidths.include }} />
          </colgroup>
          <thead>
            <tr>
              <th className="ar-file-table__th ar-file-table__th--rownum">#</th>
              <th className="ar-file-table__th ar-file-table__th--checkbox">
                <input
                  type="checkbox"
                  checked={isAllPageSelected}
                  ref={input => {
                    if (input) input.indeterminate = isSomePageSelected && !isAllPageSelected
                  }}
                  onChange={handleSelectAllToggle}
                  disabled={disabled || isHeaderCheckboxDisabled}
                  title={isHeaderCheckboxDisabled ? '계약자명별로 개별 선택하세요' : undefined}
                />
              </th>
              <th
                className={getThClass('fileName')}
                onClick={() => handleSortToggle('fileName')}
              >
                파일명 {renderSortIcon('fileName')}
              </th>
              <th
                className={getThClass('extractedContractor')}
                onClick={() => handleSortToggle('extractedContractor')}
              >
                <span className="ar-file-table__th-content">
                  계약자명 {renderSortIcon('extractedContractor')}
                </span>
                <span
                  className="ar-file-table__resize-handle"
                  onMouseDown={(e) => handleResizeMouseDown(e, 'extracted')}
                />
              </th>
              <th
                className={getThClass('mappedCustomer')}
                onClick={() => handleSortToggle('mappedCustomer')}
              >
                <span className="ar-file-table__th-content">
                  매핑 고객 {renderSortIcon('mappedCustomer')}
                </span>
                <span
                  className="ar-file-table__resize-handle"
                  onMouseDown={(e) => handleResizeMouseDown(e, 'mapped')}
                />
              </th>
              <th
                className={getThClass('policyNumber')}
                onClick={() => handleSortToggle('policyNumber')}
              >
                <span className="ar-file-table__th-content">
                  증권번호 {renderSortIcon('policyNumber')}
                </span>
                <span
                  className="ar-file-table__resize-handle"
                  onMouseDown={(e) => handleResizeMouseDown(e, 'policy')}
                />
              </th>
              <th
                className={getThClass('issueDate')}
                onClick={() => handleSortToggle('issueDate')}
              >
                <span className="ar-file-table__th-content">
                  발행일 {renderSortIcon('issueDate')}
                </span>
                <span
                  className="ar-file-table__resize-handle"
                  onMouseDown={(e) => handleResizeMouseDown(e, 'date')}
                />
              </th>
              <th
                className={getThClass('status')}
                onClick={() => handleSortToggle('status')}
              >
                <span className="ar-file-table__th-content">
                  상태 {renderSortIcon('status')}
                </span>
                <span
                  className="ar-file-table__resize-handle"
                  onMouseDown={(e) => handleResizeMouseDown(e, 'status')}
                />
              </th>
              <th className="ar-file-table__th ar-file-table__th--include">
                포함
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="ar-file-table__empty">
                  {searchQuery || mappingStatusFilter !== 'all'
                    ? '검색 결과가 없습니다'
                    : '파일이 없습니다'}
                </td>
              </tr>
            ) : (
              paginatedRows.map((row, rowIndex) => {
                const isMapped = isRowMappedWithMap(row, groupMap)
                const isDuplicate = row.fileInfo.duplicateStatus.isHashDuplicate
                const isIssueDatePolicyDuplicate = row.fileInfo.duplicateStatus.isIssueDatePolicyDuplicate
                const displayText = getRowMappingDisplayTextWithMap(row, groupMap)
                const group = getGroupForRow(row)
                const sameNameCount = sameNameCountMap.get(row.extractedContractorName) || 1
                // 행 번호: (현재 페이지 - 1) * 페이지당 항목 수 + rowIndex + 1
                const rowNumber = (currentPage - 1) * itemsPerPage + rowIndex + 1

                // 다른 계약자명이 선택되어 있으면 체크박스 비활성화
                const isCheckboxDisabled = selectedRowsInfo.firstContractorName !== null &&
                  row.extractedContractorName !== selectedRowsInfo.firstContractorName

                // 2개 이상 선택 시 개별 드롭다운 비활성화 (일괄 매핑만 사용 가능)
                const isDropdownDisabled = selectedCount >= 2

                return (
                  <CrFileTableRowComponent
                    key={row.fileInfo.fileId}
                    row={row}
                    rowIndex={rowIndex}
                    rowNumber={rowNumber}
                    group={group}
                    isMapped={isMapped}
                    isDuplicate={isDuplicate}
                    isIssueDatePolicyDuplicate={isIssueDatePolicyDuplicate}
                    displayText={displayText}
                    sameNameCount={sameNameCount}
                    isCheckboxDisabled={isCheckboxDisabled}
                    isDropdownDisabled={isDropdownDisabled}
                    isDropdownOpen={openDropdownId === row.fileInfo.fileId}
                    disabled={disabled}
                    onCheckboxClick={handleRowCheckboxClick}
                    onExtractedNameClick={handleExtractedNameClick}
                    onDropdownOpen={openDropdown}
                    onToggleIncluded={onToggleRowIncluded}
                  />
                )
              })
            )}
          </tbody>
        </table>
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
            <option value={20}>20개씩</option>
            <option value={50}>50개씩</option>
            <option value={100}>100개씩</option>
            <option value={200}>200개씩</option>
          </select>
        </div>
      )}

      {/* 행별 드롭다운 메뉴 (Portal - 단일 관리) */}
      {openDropdownId && openDropdownRow && openDropdownGroup && createPortal(
        <div
          className="ar-table-dropdown ar-table-dropdown--open"
          style={{
            position: 'fixed',
            top: dropdownPosition.top,
            left: dropdownPosition.left,
          }}
        >
          {openDropdownGroup.matchingCustomers.length > 0 && (
            <>
              <div className="ar-table-dropdown__section-title">추천 고객</div>
              {openDropdownGroup.matchingCustomers.map(customer => (
                <button
                  key={customer._id}
                  type="button"
                  className={`ar-table-dropdown__option ${openDropdownRow.individualCustomerId === customer._id ? 'ar-table-dropdown__option--selected' : ''}`}
                  onClick={() => handleSelectCustomer(openDropdownRow.fileInfo.fileId, customer)}
                >
                  <span className="ar-table-dropdown__option-name">
                    {customer.personal_info?.name || '이름 없음'}
                  </span>
                  <span className="ar-table-dropdown__option-type">
                    ({customer.insurance_info?.customer_type || '개인'})
                  </span>
                  {openDropdownRow.individualCustomerId === customer._id && (
                    <span className="ar-table-dropdown__option-check">✓</span>
                  )}
                </button>
              ))}
              <div className="ar-table-dropdown__divider" />
            </>
          )}

          <button
            type="button"
            className="ar-table-dropdown__option ar-table-dropdown__option--action"
            onClick={() => handleNewCustomer(openDropdownRow.fileInfo.fileId, openDropdownRow.extractedContractorName)}
          >
            <span className="ar-table-dropdown__option-icon">+</span>
            <span className="ar-table-dropdown__option-text">새 고객 등록</span>
          </button>
        </div>,
        document.body
      )}

      {/* 일괄 매핑 드롭다운 (Portal) */}
      {bulkDropdownOpen && selectedRowsInfo.isAllSameName && createPortal(
        <div
          className="ar-table-dropdown ar-table-bulk-dropdown--open"
          style={{
            position: 'fixed',
            top: bulkDropdownPosition.top,
            left: bulkDropdownPosition.left,
          }}
        >
          <div className="ar-table-dropdown__section-title">
            "{selectedRowsInfo.commonContractorName}" 매칭 고객
          </div>
          {bulkMatchingCustomers.length > 0 ? (
            bulkMatchingCustomers.map(customer => (
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
            <div className="ar-table-dropdown__empty">
              "{selectedRowsInfo.commonContractorName}"과 일치하는 고객이 없습니다
            </div>
          )}
          <div className="ar-table-dropdown__divider" />
          <button
            type="button"
            className="ar-table-dropdown__option ar-table-dropdown__option--action"
            onClick={() => {
              closeBulkDropdown()
              if (selectedRowsInfo.commonContractorName) {
                onOpenNewCustomerModal('__BULK__', selectedRowsInfo.commonContractorName)
              }
            }}
          >
            <span className="ar-table-dropdown__option-icon">+</span>
            <span className="ar-table-dropdown__option-text">
              "{selectedRowsInfo.commonContractorName}" 새 고객 등록
            </span>
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}

export default CrFileTable
