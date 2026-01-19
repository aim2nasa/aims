/**
 * useArBatchAnalysis Hook
 * @description AR 파일들을 일괄 분석하고 고객명별로 그룹핑하는 훅
 * @see docs/AR_MULTI_UPLOAD_UX_ANALYSIS.md
 */

import { useState, useCallback, useRef } from 'react'
import { checkAnnualReportFromPDF } from '@/features/customer/utils/pdfParser'
import { AnnualReportApi } from '@/features/customer/api/annualReportApi'
import type { Customer } from '@/features/customer/types/customer'
import type {
  ArFileInfo,
  ArFileGroup,
  BatchMappingState,
  GroupingResult,
} from '../types/arBatchTypes'
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
}

const initialState: BatchMappingState = {
  groups: [],
  isOpen: false,
  isAnalyzing: false,
  isAllSelected: true,
  isProcessing: false,
  progress: 0,
  totalFiles: 0,
  completedFiles: 0,
}

/**
 * AR 파일 일괄 분석 및 그룹핑 훅
 */
export function useArBatchAnalysis(options: UseArBatchAnalysisOptions): UseArBatchAnalysisReturn {
  const { userId, addLog } = options
  const [batchState, setBatchState] = useState<BatchMappingState>(initialState)

  // 분석 중단 플래그
  const abortRef = useRef(false)

  /**
   * AR 파일들 분석 및 그룹핑
   */
  const analyzeArFiles = useCallback(async (files: File[]): Promise<GroupingResult | null> => {
    if (files.length === 0) return null

    abortRef.current = false

    setBatchState(prev => ({
      ...prev,
      isAnalyzing: true,
      isOpen: true,
      totalFiles: files.length,
      completedFiles: 0,
      groups: [],
    }))

    addLog?.('info', `[AR 일괄 분석] ${files.length}개 파일 분석 시작`)

    const arFiles: ArFileInfo[] = []
    const nonArFiles: File[] = []
    const failedFiles: Array<{ file: File; error: string }> = []

    // 1. 각 파일 AR 분석
    for (let i = 0; i < files.length; i++) {
      if (abortRef.current) {
        addLog?.('warning', '[AR 일괄 분석] 분석 중단됨')
        break
      }

      const file = files[i]

      setBatchState(prev => ({
        ...prev,
        currentFileName: file.name,
        progress: Math.round(((i + 1) / files.length) * 50), // 분석 50%
      }))

      try {
        // PDF 파일만 AR 분석
        if (file.type !== 'application/pdf') {
          nonArFiles.push(file)
          continue
        }

        const result = await checkAnnualReportFromPDF(file)

        if (result.is_annual_report && result.metadata?.customer_name) {
          const arFile = createArFileInfo(file, result, generateFileId())
          arFiles.push(arFile)
          addLog?.('success', `[AR 감지] ${file.name}`, `고객: ${result.metadata.customer_name}`)
        } else {
          nonArFiles.push(file)
        }
      } catch (error) {
        console.error('[useArBatchAnalysis] AR 분석 실패:', file.name, error)
        failedFiles.push({ file, error: String(error) })
        addLog?.('error', `[AR 분석 실패] ${file.name}`, String(error))
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

  return {
    batchState,
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
  }
}
