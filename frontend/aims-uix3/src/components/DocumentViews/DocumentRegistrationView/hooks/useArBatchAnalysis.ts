/**
 * useArBatchAnalysis Hook
 * @description AR 파일들을 일괄 분석하고 고객명별로 그룹핑하는 훅
 * @see docs/AR_MULTI_UPLOAD_UX_ANALYSIS.md
 */

import { useState, useCallback, useRef } from 'react'
import { checkAnnualReportFromPDF } from '@/features/customer/utils/pdfParser'
import { AnnualReportApi } from '@/features/customer/api/annualReportApi'
import type { Customer } from '@/entities/customer/model'
import type {
  ArFileInfo,
  ArFileGroup,
  BatchMappingState,
  GroupingResult,
  ArTableViewState,
  ArFileTableRow,
  ArTableSortField,
  ArMappingStatusFilter,
  AnalyzingFileInfo,
} from '../types/arBatchTypes'
import type { BatchRegistrationSummary } from '../types/batchTypes'
import {
  generateFileId,
  createArFileInfo,
  groupArFilesByCustomerName,
  createArFileGroup,
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
  getIncludedRowsCount,
} from '../utils/arGroupingUtils'

export interface UseArBatchAnalysisOptions {
  /** 사용자 ID */
  userId: string
  /** 로그 추가 함수 */
  addLog?: (type: string, message: string, detail?: string) => void
}

export interface UseArBatchAnalysisReturn {
  /** 일괄 매핑 상태 */
  batchState: BatchMappingState
  /** 테이블 뷰 상태 */
  tableState: ArTableViewState
  /** AR 파일 분석 시작 */
  analyzeArFiles: (files: File[]) => Promise<GroupingResult | null>
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
  /** 🚀 진행 상태 + 완료 수 일괄 업데이트 */
  batchSetProgress: (completedCount: number, totalCount: number, currentFileName?: string) => void
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
  setTableSort: (field: ArTableSortField | null, direction: 'asc' | 'desc') => void
  /** 테이블 페이지 변경 */
  setTablePage: (page: number) => void
  /** 페이지당 항목 수 변경 */
  setTableItemsPerPage: (count: number) => void
  /** 테이블 검색어 설정 */
  setTableSearchQuery: (query: string) => void
  /** 테이블 필터 설정 */
  setTableFilter: (filter: ArMappingStatusFilter) => void
  /** 모든 행이 매핑되었는지 확인 */
  isTableAllMapped: () => boolean
  /** 테이블 행 목록 (읽기용) */
  getTableRows: () => ArFileTableRow[]
  /** 새 고객을 그룹의 matchingCustomers에 추가 */
  addCustomerToGroups: (extractedCustomerName: string, customer: { _id: string; name: string; customer_type?: string }) => void
}

const initialState: BatchMappingState = {
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

const initialTableState: ArTableViewState = {
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
 * AR 파일 일괄 분석 및 그룹핑 훅
 */
export function useArBatchAnalysis(options: UseArBatchAnalysisOptions): UseArBatchAnalysisReturn {
  const { userId, addLog } = options
  const [batchState, setBatchState] = useState<BatchMappingState>(initialState)
  const [tableState, setTableState] = useState<ArTableViewState>(initialTableState)

  // 분석 중단 플래그
  const abortRef = useRef(false)

  /**
   * AR 파일들 분석 및 그룹핑
   *
   * 메모리 최적화:
   * - analyzingFiles를 로컬 배열로 관리 (per-file React state 업데이트 방지)
   * - STATE_FLUSH_INTERVAL 마다 한 번만 React state 갱신 (~2,250회 → ~40회)
   * - GC_YIELD_INTERVAL 마다 이벤트 루프에 양보하여 GC 실행 기회 제공
   */
  const analyzeArFiles = useCallback(async (files: File[]): Promise<GroupingResult | null> => {
    if (files.length === 0) return null

    abortRef.current = false

    // analyzingFiles 데이터를 로컬 배열로 관리 (per-file state update 제거 → OOM 방지)
    // React state는 주기적으로만 갱신하여 리렌더링 최소화
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
    }))

    // 테이블 상태도 초기화 (이전 분석 결과 제거)
    setTableState({
      ...initialTableState,
      rows: [],
      groups: [],
    })

    addLog?.('info', `[AR 일괄 분석] ${files.length}개 파일 분석 시작`)

    const arFiles: ArFileInfo[] = []
    const nonArFiles: File[] = []
    const failedFiles: Array<{ file: File; error: string }> = []

    // 메모리 효율적 처리를 위한 상수
    const STATE_FLUSH_INTERVAL = 20  // N개 파일마다 React state 갱신
    const GC_YIELD_INTERVAL = 50     // N개 파일마다 이벤트 루프에 양보 (GC 기회)
    // pdf.destroy()가 매 파일마다 PDF.js 메모리를 즉시 해제하므로
    // 50개 간격이면 충분 (738파일: 74회→15회, ~240ms 절약)

    // 1. 각 파일 AR 분석
    for (let i = 0; i < files.length; i++) {
      if (abortRef.current) {
        addLog?.('warning', '[AR 일괄 분석] 분석 중단됨')
        break
      }

      const file = files[i]

      // 로컬 배열 직접 업데이트 (React state가 아님 - 리렌더링 없음)
      analyzingFilesData[i] = { fileName: file.name, status: 'analyzing' }

      try {
        // PDF 파일만 AR 분석
        if (file.type !== 'application/pdf') {
          nonArFiles.push(file)
          analyzingFilesData[i] = { fileName: file.name, status: 'non_ar' }
          continue
        }

        const result = await checkAnnualReportFromPDF(file)

        if (result.is_annual_report && result.metadata?.customer_name) {
          const arFile = createArFileInfo(file, { ...result, metadata: result.metadata || undefined }, generateFileId())
          arFiles.push(arFile)
          analyzingFilesData[i] = { fileName: file.name, status: 'completed' }
          addLog?.('success', `[AR 감지] ${file.name}`, `고객: ${result.metadata.customer_name}`)
        } else {
          nonArFiles.push(file)
          analyzingFilesData[i] = { fileName: file.name, status: 'non_ar' }
        }
      } catch (error) {
        console.error('[useArBatchAnalysis] AR 분석 실패:', file.name, error)
        failedFiles.push({ file, error: String(error) })
        analyzingFilesData[i] = { fileName: file.name, status: 'failed', error: String(error) }
        addLog?.('error', `[AR 분석 실패] ${file.name}`, String(error))
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

    // AR이 아닌 파일들 처리는 여기서 하지 않음 (호출자가 처리)
    if (arFiles.length === 0) {
      addLog?.('info', '[AR 일괄 분석] AR 파일 없음')
      setBatchState(prev => ({
        ...prev,
        isAnalyzing: false,
        isOpen: false,
      }))
      return null
    }

    // 2. 고객명별 그룹핑
    addLog?.('info', `[AR 그룹핑] ${arFiles.length}개 AR 파일 그룹핑 중...`)
    const groupedMap = groupArFilesByCustomerName(arFiles)

    // 3. 각 그룹별 고객 매칭
    const groups: ArFileGroup[] = []
    const groupEntries = Array.from(groupedMap.entries())

    for (let i = 0; i < groupEntries.length; i++) {
      if (abortRef.current) break

      const [customerName, files] = groupEntries[i]

      setBatchState(prev => ({
        ...prev,
        currentFileName: `고객 매칭: ${customerName}`,
        progress: 50 + Math.round(((i + 1) / groupEntries.length) * 50), // 매칭 50%
      }))

      let matchingCustomers: Customer[] = []

      // 알 수 없는 고객명이 아닌 경우에만 매칭 시도
      if (customerName !== '__UNKNOWN__') {
        try {
          matchingCustomers = await AnnualReportApi.searchCustomersByName(customerName, userId)
          addLog?.('info', `[고객 매칭] "${customerName}"`, `${matchingCustomers.length}명 발견`)
        } catch (error) {
          console.error('[useArBatchAnalysis] 고객 검색 실패:', customerName, error)
        }
      }

      const group = createArFileGroup(customerName, files, matchingCustomers)
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

    addLog?.('success', `[AR 일괄 분석 완료]`,
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
   * 🚀 진행 상태 + 완료 수 일괄 업데이트 (setProcessing + incrementCompleted 통합)
   * 매 파일마다 2번 상태 업데이트 → 1번으로 합침, 호출도 N개 간격으로 스로틀
   */
  const batchSetProgress = useCallback((
    completedCount: number,
    totalCount: number,
    currentFileName?: string
  ) => {
    setBatchState(prev => ({
      ...prev,
      isProcessing: true,
      progress: Math.round((completedCount / totalCount) * 100),
      currentFileName,
      completedFiles: completedCount,
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
    field: ArTableSortField | null,
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
  const setTableFilter = useCallback((filter: ArMappingStatusFilter) => {
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
   * @description 새 고객 생성 후 같은 AR 고객명 그룹의 드롭다운에 표시되도록 함
   */
  const addCustomerToGroups = useCallback((
    extractedCustomerName: string,
    customer: { _id: string; name: string; customer_type?: string }
  ) => {
    setTableState(prev => ({
      ...prev,
      groups: prev.groups.map(group => {
        if (group.customerNameFromAr === extractedCustomerName) {
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
    analyzeArFiles,
    selectGroupCustomer,
    setGroupNewCustomerName,
    toggleGroup,
    toggleFile,
    openModal,
    closeModal,
    reset,
    setProcessing,
    incrementCompleted,
    batchSetProgress,
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
