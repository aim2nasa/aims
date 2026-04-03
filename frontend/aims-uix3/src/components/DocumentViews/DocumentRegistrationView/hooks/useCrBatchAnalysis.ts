/**
 * useCrBatchAnalysis Hook
 * @description CRS 파일들을 일괄 분석하고 계약자명별로 그룹핑하는 훅
 * @see docs/AR_CRS_BATCH_REGISTRATION_COMPARISON.md
 */

import { useState, useCallback, useRef } from 'react'
import { checkCustomerReviewFromPDF, AnnualReportApi } from '@/features/customer'
import type { Customer } from '@/entities/customer/model'
import type {
  CrFileInfo,
  CrFileGroup,
  CrBatchMappingState,
  CrGroupingResult,
  CrTableViewState,
  CrFileTableRow,
  CrTableSortField,
  CrMappingStatusFilter,
  AnalyzingFileInfo,
} from '../types/crBatchTypes'
import type { BatchRegistrationSummary } from '../types/batchTypes'
import {
  generateFileId,
  createCrFileInfo,
  groupCrFilesByContractorName,
  createCrFileGroup,
  createGroupingResult,
  updateGroupCustomerSelection,
  updateGroupNewCustomerName,
  toggleGroupExpanded,
  toggleFileIncluded,
  isAllGroupsSelected,
  getTotalIncludedFilesCount,
  // 테이블 뷰 유틸리티
  groupsToTableRows,
  updateRowCustomerMapping,
  updateRowNewCustomerName,
  toggleRowSelection,
  setAllRowsSelection,
  bulkAssignCustomer,
  bulkAssignNewCustomer,
  toggleTableRowIncluded,
  isAllRowsMapped,
} from '../utils/crGroupingUtils'

export interface UseCrBatchAnalysisOptions {
  /** 사용자 ID */
  userId: string
  /** 로그 추가 함수 */
  addLog?: (type: string, message: string, detail?: string) => void
}

export interface UseCrBatchAnalysisReturn {
  /** 일괄 매핑 상태 */
  batchState: CrBatchMappingState
  /** 테이블 뷰 상태 */
  tableState: CrTableViewState
  /** CRS 파일 분석 시작 */
  analyzeCrFiles: (files: File[]) => Promise<CrGroupingResult | null>
  /** 그룹 고객 선택 업데이트 */
  selectGroupCustomer: (groupId: string, customerId: string | null, customerName?: string) => void
  /** 그룹 새 고객 이름 업데이트 */
  setGroupNewCustomerName: (groupId: string, name: string) => void
  /** 그룹 펼침/접힘 토글 */
  toggleGroup: (groupId: string) => void
  /** 파일 포함/제외 토글 */
  toggleFile: (groupId: string, fileId: string) => void
  /** 모달 열기 */
  openModal: () => void
  /** 모달 닫기 */
  closeModal: () => void
  /** 상태 초기화 */
  reset: () => void
  /** 등록 진행 상태 설정 */
  setProcessing: (isProcessing: boolean, progress?: number, currentFileName?: string) => void
  /** 완료 파일 수 증가 */
  incrementCompleted: () => void
  /** 등록 결과 저장 (요약 화면 표시용) */
  setRegistrationResult: (result: BatchRegistrationSummary) => void

  // ===== 테이블 뷰 함수들 =====
  /** 테이블 행 고객 매핑 업데이트 */
  updateTableRowMapping: (fileId: string, customerId: string | null, customerName?: string) => void
  /** 테이블 행 새 고객 이름 업데이트 */
  updateTableRowNewCustomer: (fileId: string, newCustomerName: string) => void
  /** 테이블 행 선택 토글 */
  toggleTableRow: (fileId: string) => void
  /** 모든 테이블 행 선택/해제 */
  selectAllTableRows: (selected: boolean) => void
  /** 특정 행들 선택/해제 (토글이 아닌 직접 설정) */
  setRowsSelection: (fileIds: string[], selected: boolean) => void
  /** 선택된 행들에 고객 일괄 할당 */
  bulkAssignToCustomer: (fileIds: string[], customerId: string, customerName: string) => void
  /** 선택된 행들에 새 고객 이름 일괄 할당 */
  bulkAssignToNewCustomer: (fileIds: string[], newCustomerName: string) => void
  /** 테이블 행 포함/제외 토글 */
  toggleTableFileIncluded: (fileId: string) => void
  /** 테이블 정렬 설정 */
  setTableSort: (field: CrTableSortField | null, direction: 'asc' | 'desc') => void
  /** 테이블 페이지 변경 */
  setTablePage: (page: number) => void
  /** 페이지당 항목 수 변경 */
  setTableItemsPerPage: (count: number) => void
  /** 테이블 검색어 설정 */
  setTableSearchQuery: (query: string) => void
  /** 테이블 필터 설정 */
  setTableFilter: (filter: CrMappingStatusFilter) => void
  /** 모든 행이 매핑되었는지 확인 */
  isTableAllMapped: () => boolean
  /** 테이블 행 목록 (읽기용) */
  getTableRows: () => CrFileTableRow[]
  /** 새 고객을 그룹의 matchingCustomers에 추가 */
  addCustomerToGroups: (extractedContractorName: string, customer: { _id: string; name: string; customer_type?: string }) => void
}

const initialState: CrBatchMappingState = {
  groups: [],
  isOpen: false,
  isAnalyzing: false,
  isAllSelected: true,
  isProcessing: false,
  progress: 0,
  totalFiles: 0,
  originalTotalFiles: 0,
  completedFiles: 0,
  analyzingFiles: [],
}

const initialTableState: CrTableViewState = {
  rows: [],
  groups: [],
  currentPage: 1,
  itemsPerPage: 50,
  sortField: null,
  sortDirection: 'asc',
  searchQuery: '',
  mappingStatusFilter: 'all',
}

/**
 * CRS 파일 일괄 분석 및 그룹핑 훅
 */
export function useCrBatchAnalysis(options: UseCrBatchAnalysisOptions): UseCrBatchAnalysisReturn {
  const { userId, addLog } = options
  const [batchState, setBatchState] = useState<CrBatchMappingState>(initialState)
  const [tableState, setTableState] = useState<CrTableViewState>(initialTableState)

  // 분석 중단 플래그
  const abortRef = useRef(false)

  /**
   * CRS 파일들 분석 및 그룹핑
   */
  const analyzeCrFiles = useCallback(async (files: File[]): Promise<CrGroupingResult | null> => {
    if (files.length === 0) return null

    abortRef.current = false

    // analyzingFiles 데이터를 로컬 배열로 관리 (per-file state update 제거 → OOM 방지)
    const analyzingFilesData: AnalyzingFileInfo[] = files.map(f => ({
      fileName: f.name,
      status: 'pending' as const,
    }))

    setBatchState(prev => ({
      ...prev,
      isAnalyzing: true,
      isOpen: true,
      totalFiles: files.length,
      originalTotalFiles: files.length,
      completedFiles: 0,
      groups: [],
      analyzingFiles: analyzingFilesData.slice(),
      registrationResult: undefined,
    }))

    // 테이블 상태도 초기화 (이전 분석 결과 제거)
    setTableState({
      ...initialTableState,
      rows: [],
      groups: [],
    })

    addLog?.('info', `[CRS 일괄 분석] ${files.length}개 파일 분석 시작`)

    const crFiles: CrFileInfo[] = []
    const nonCrFiles: File[] = []
    const failedFiles: Array<{ file: File; error: string }> = []

    // 메모리 효율적 처리를 위한 상수
    const STATE_FLUSH_INTERVAL = 20  // N개 파일마다 React state 갱신
    const GC_YIELD_INTERVAL = 50     // N개 파일마다 이벤트 루프에 양보 (GC 기회)
    // pdf.destroy()가 매 파일마다 PDF.js 메모리를 즉시 해제하므로
    // 50개 간격이면 충분 (대량 파일: 양보 횟수 1/5로 감소, ~240ms 절약)

    // 1. 각 파일 CRS 분석
    for (let i = 0; i < files.length; i++) {
      if (abortRef.current) {
        addLog?.('warning', '[CRS 일괄 분석] 분석 중단됨')
        break
      }

      const file = files[i]

      // 로컬 배열 직접 업데이트 (React state가 아님 - 리렌더링 없음)
      analyzingFilesData[i] = { fileName: file.name, status: 'analyzing' }

      try {
        // PDF 파일만 CRS 분석
        if (file.type !== 'application/pdf') {
          nonCrFiles.push(file)
          analyzingFilesData[i] = { fileName: file.name, status: 'non_ar' }
          continue
        }

        const result = await checkCustomerReviewFromPDF(file)

        if (result.is_customer_review) {
          // CRS로 감지된 파일은 contractor_name 없어도 포함
          // contractor_name 없으면 __UNKNOWN__ 그룹으로 자동 분류 (crGroupingUtils에서 처리)
          const crFile = createCrFileInfo(file, { ...result, metadata: result.metadata || undefined }, generateFileId())
          crFiles.push(crFile)
          analyzingFilesData[i] = { fileName: file.name, status: 'completed' }
          const contractorDisplay = result.metadata?.contractor_name || '(알 수 없음)'
          addLog?.('success', `[CRS 감지] ${file.name}`, `계약자: ${contractorDisplay}`)
        } else {
          nonCrFiles.push(file)
          analyzingFilesData[i] = { fileName: file.name, status: 'non_ar' }
        }
      } catch (error) {
        console.error('[useCrBatchAnalysis] CRS 분석 실패:', file.name, error)
        failedFiles.push({ file, error: String(error) })
        analyzingFilesData[i] = { fileName: file.name, status: 'failed', error: String(error) }
        addLog?.('error', `[CRS 분석 실패] ${file.name}`, String(error))
      }

      // 주기적으로 React state 갱신 (배치 처리 - 리렌더링 최소화)
      if ((i + 1) % STATE_FLUSH_INTERVAL === 0 || i === files.length - 1) {
        setBatchState(prev => ({
          ...prev,
          currentFileName: file.name,
          progress: Math.round(((i + 1) / files.length) * 50),
          analyzingFiles: analyzingFilesData.slice(),
        }))
      }

      // 주기적으로 이벤트 루프에 양보 → GC + 렌더링 기회 제공
      if ((i + 1) % GC_YIELD_INTERVAL === 0) {
        await new Promise<void>(resolve => setTimeout(resolve, 0))
      }
    }

    // CRS가 아닌 파일들 처리는 여기서 하지 않음 (호출자가 처리)
    if (crFiles.length === 0) {
      addLog?.('info', '[CRS 일괄 분석] CRS 파일 없음')
      setBatchState(prev => ({
        ...prev,
        isAnalyzing: false,
        isOpen: false,
      }))
      return null
    }

    // 2. 계약자명별 그룹핑
    addLog?.('info', `[CRS 그룹핑] ${crFiles.length}개 CRS 파일 그룹핑 중...`)
    const groupedMap = groupCrFilesByContractorName(crFiles)

    // 3. 각 그룹별 고객 매칭
    const groups: CrFileGroup[] = []
    const groupEntries = Array.from(groupedMap.entries())

    for (let i = 0; i < groupEntries.length; i++) {
      if (abortRef.current) break

      const [contractorName, files] = groupEntries[i]

      setBatchState(prev => ({
        ...prev,
        currentFileName: `고객 매칭: ${contractorName}`,
        progress: 50 + Math.round(((i + 1) / groupEntries.length) * 50), // 매칭 50%
      }))

      let matchingCustomers: Customer[] = []

      // 알 수 없는 계약자명이 아닌 경우에만 매칭 시도
      if (contractorName !== '__UNKNOWN__') {
        try {
          matchingCustomers = await AnnualReportApi.searchCustomersByName(contractorName, userId)
          addLog?.('info', `[고객 매칭] "${contractorName}"`, `${matchingCustomers.length}명 발견`)
        } catch (error) {
          console.error('[useCrBatchAnalysis] 고객 검색 실패:', contractorName, error)
        }
      }

      const group = createCrFileGroup(contractorName, files, matchingCustomers)
      groups.push(group)
    }

    // 4. 결과 생성
    const result = createGroupingResult(groups)
    result.failedCount = failedFiles.length

    setBatchState(prev => ({
      ...prev,
      groups,
      isAnalyzing: false,
      isAllSelected: isAllGroupsSelected(groups),
      totalFiles: getTotalIncludedFilesCount(groups),
      progress: 100,
      currentFileName: undefined,
    }))

    // 5. 테이블 상태 초기화
    const tableRows = groupsToTableRows(groups)
    setTableState({
      ...initialTableState,
      rows: tableRows,
      groups: groups,
    })

    addLog?.('success', `[CRS 일괄 분석 완료]`,
      `${groups.length}개 그룹 (자동: ${result.autoMatchedCount}, 선택필요: ${result.needsSelectionCount}, 새고객: ${result.noMatchCount})`)

    return result
  }, [userId, addLog])

  /**
   * 그룹 고객 선택 업데이트
   */
  const selectGroupCustomer = useCallback((
    groupId: string,
    customerId: string | null,
    customerName?: string
  ) => {
    setBatchState(prev => {
      const newGroups = updateGroupCustomerSelection(prev.groups, groupId, customerId, customerName)
      return {
        ...prev,
        groups: newGroups,
        isAllSelected: isAllGroupsSelected(newGroups),
      }
    })
  }, [])

  /**
   * 그룹 새 고객 이름 업데이트
   */
  const setGroupNewCustomerName = useCallback((groupId: string, name: string) => {
    setBatchState(prev => {
      const newGroups = updateGroupNewCustomerName(prev.groups, groupId, name)
      return {
        ...prev,
        groups: newGroups,
        isAllSelected: isAllGroupsSelected(newGroups),
      }
    })
  }, [])

  /**
   * 그룹 펼침/접힘 토글
   */
  const toggleGroup = useCallback((groupId: string) => {
    setBatchState(prev => ({
      ...prev,
      groups: toggleGroupExpanded(prev.groups, groupId),
    }))
  }, [])

  /**
   * 파일 포함/제외 토글
   */
  const toggleFile = useCallback((groupId: string, fileId: string) => {
    setBatchState(prev => {
      const newGroups = toggleFileIncluded(prev.groups, groupId, fileId)
      return {
        ...prev,
        groups: newGroups,
        totalFiles: getTotalIncludedFilesCount(newGroups),
      }
    })
  }, [])

  /**
   * 모달 열기
   */
  const openModal = useCallback(() => {
    setBatchState(prev => ({ ...prev, isOpen: true }))
  }, [])

  /**
   * 모달 닫기
   */
  const closeModal = useCallback(() => {
    abortRef.current = true
    setBatchState(prev => ({
      ...prev,
      isOpen: false,
      isAnalyzing: false,
      isProcessing: false,
      registrationResult: undefined,
    }))
  }, [])

  /**
   * 상태 초기화
   */
  const reset = useCallback(() => {
    abortRef.current = true
    setBatchState(initialState)
    setTableState(initialTableState)
  }, [])

  /**
   * 등록 진행 상태 설정
   */
  const setProcessing = useCallback((
    isProcessing: boolean,
    progress?: number,
    currentFileName?: string
  ) => {
    setBatchState(prev => ({
      ...prev,
      isProcessing,
      progress: progress ?? prev.progress,
      currentFileName,
    }))
  }, [])

  /**
   * 완료 파일 수 증가
   */
  const incrementCompleted = useCallback(() => {
    setBatchState(prev => ({
      ...prev,
      completedFiles: prev.completedFiles + 1,
    }))
  }, [])

  /**
   * 등록 결과 저장 (요약 화면 표시용)
   * isProcessing을 false로 전환하되 모달은 유지
   */
  const setRegistrationResult = useCallback((result: BatchRegistrationSummary) => {
    setBatchState(prev => ({
      ...prev,
      isProcessing: false,
      progress: 100,
      registrationResult: result,
    }))
  }, [])

  // ===== 테이블 뷰 함수들 =====

  /**
   * 테이블 행 고객 매핑 업데이트
   */
  const updateTableRowMapping = useCallback((
    fileId: string,
    customerId: string | null,
    customerName?: string
  ) => {
    setTableState(prev => ({
      ...prev,
      rows: updateRowCustomerMapping(prev.rows, fileId, customerId, customerName),
    }))
  }, [])

  /**
   * 테이블 행 새 고객 이름 업데이트
   */
  const updateTableRowNewCustomer = useCallback((
    fileId: string,
    newCustomerName: string
  ) => {
    setTableState(prev => ({
      ...prev,
      rows: updateRowNewCustomerName(prev.rows, fileId, newCustomerName),
    }))
  }, [])

  /**
   * 테이블 행 선택 토글
   */
  const toggleTableRow = useCallback((fileId: string) => {
    setTableState(prev => ({
      ...prev,
      rows: toggleRowSelection(prev.rows, fileId),
    }))
  }, [])

  /**
   * 모든 테이블 행 선택/해제
   */
  const selectAllTableRows = useCallback((selected: boolean) => {
    setTableState(prev => {
      // 모든 행의 fileIds 추출
      const allFileIds = prev.rows.map(row => row.fileInfo.fileId)
      return {
        ...prev,
        rows: setAllRowsSelection(prev.rows, allFileIds, selected),
      }
    })
  }, [])

  /**
   * 특정 행들 선택/해제 (토글이 아닌 직접 설정)
   */
  const setRowsSelection = useCallback((fileIds: string[], selected: boolean) => {
    setTableState(prev => ({
      ...prev,
      rows: setAllRowsSelection(prev.rows, fileIds, selected),
    }))
  }, [])

  /**
   * 선택된 행들에 고객 일괄 할당
   */
  const bulkAssignToCustomer = useCallback((
    fileIds: string[],
    customerId: string,
    customerName: string
  ) => {
    setTableState(prev => ({
      ...prev,
      rows: bulkAssignCustomer(prev.rows, fileIds, customerId, customerName),
    }))
  }, [])

  /**
   * 선택된 행들에 새 고객 이름 일괄 할당
   */
  const bulkAssignToNewCustomer = useCallback((
    fileIds: string[],
    newCustomerName: string
  ) => {
    setTableState(prev => ({
      ...prev,
      rows: bulkAssignNewCustomer(prev.rows, fileIds, newCustomerName),
    }))
  }, [])

  /**
   * 테이블 행 포함/제외 토글
   */
  const toggleTableFileIncluded = useCallback((fileId: string) => {
    setTableState(prev => ({
      ...prev,
      rows: toggleTableRowIncluded(prev.rows, fileId),
    }))
  }, [])

  /**
   * 테이블 정렬 설정
   */
  const setTableSort = useCallback((
    field: CrTableSortField | null,
    direction: 'asc' | 'desc'
  ) => {
    setTableState(prev => ({
      ...prev,
      sortField: field,
      sortDirection: direction,
      currentPage: 1, // 정렬 변경 시 첫 페이지로
    }))
  }, [])

  /**
   * 테이블 페이지 변경
   */
  const setTablePage = useCallback((page: number) => {
    setTableState(prev => ({
      ...prev,
      currentPage: page,
    }))
  }, [])

  /**
   * 페이지당 항목 수 변경
   */
  const setTableItemsPerPage = useCallback((count: number) => {
    setTableState(prev => ({
      ...prev,
      itemsPerPage: count,
      currentPage: 1, // 항목 수 변경 시 첫 페이지로
    }))
  }, [])

  /**
   * 테이블 검색어 설정
   */
  const setTableSearchQuery = useCallback((query: string) => {
    setTableState(prev => ({
      ...prev,
      searchQuery: query,
      currentPage: 1, // 검색 시 첫 페이지로
    }))
  }, [])

  /**
   * 테이블 필터 설정
   */
  const setTableFilter = useCallback((filter: CrMappingStatusFilter) => {
    setTableState(prev => ({
      ...prev,
      mappingStatusFilter: filter,
      currentPage: 1, // 필터 변경 시 첫 페이지로
    }))
  }, [])

  /**
   * 모든 행이 매핑되었는지 확인
   */
  const isTableAllMapped = useCallback(() => {
    return isAllRowsMapped(tableState.rows, tableState.groups)
  }, [tableState.rows, tableState.groups])

  /**
   * 테이블 행 목록 반환 (읽기용)
   */
  const getTableRows = useCallback(() => {
    return tableState.rows
  }, [tableState.rows])

  /**
   * 새 고객을 그룹의 matchingCustomers에 추가
   * @description 새 고객 생성 후 같은 CRS 계약자명 그룹의 드롭다운에 표시되도록 함
   */
  const addCustomerToGroups = useCallback((
    extractedContractorName: string,
    customer: { _id: string; name: string; customer_type?: string }
  ) => {
    setTableState(prev => ({
      ...prev,
      groups: prev.groups.map(group => {
        if (group.contractorNameFromCr === extractedContractorName) {
          // 이미 존재하는지 확인
          const exists = group.matchingCustomers.some(c => c._id === customer._id)
          if (exists) return group

          // 새 고객을 matchingCustomers 맨 앞에 추가
          const newCustomer: Customer = {
            _id: customer._id,
            personal_info: { name: customer.name },
            insurance_info: { customer_type: customer.customer_type || '개인' },
          } as Customer

          return {
            ...group,
            matchingCustomers: [newCustomer, ...group.matchingCustomers],
          }
        }
        return group
      }),
    }))
  }, [])

  return {
    batchState,
    tableState,
    analyzeCrFiles,
    selectGroupCustomer,
    setGroupNewCustomerName,
    toggleGroup,
    toggleFile,
    openModal,
    closeModal,
    reset,
    setProcessing,
    incrementCompleted,
    setRegistrationResult,
    // 테이블 뷰 함수들
    updateTableRowMapping,
    updateTableRowNewCustomer,
    toggleTableRow,
    selectAllTableRows,
    setRowsSelection,
    bulkAssignToCustomer,
    bulkAssignToNewCustomer,
    toggleTableFileIncluded,
    setTableSort,
    setTablePage,
    setTableItemsPerPage,
    setTableSearchQuery,
    setTableFilter,
    isTableAllMapped,
    getTableRows,
    addCustomerToGroups,
  }
}
