/**
 * DocumentRegistrationView Component
 * @since 1.0.0
 *
 * 문서 등록 View 컴포넌트
 * 애플 스타일의 파일 업로드 시스템 구현
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol'
import FileUploadArea from './FileUploadArea/FileUploadArea'
import CustomerFileUploadArea from './CustomerFileUploadArea/CustomerFileUploadArea'
import ProcessingLog from './ProcessingLog/ProcessingLog'
import { Modal, Tooltip } from '@/shared/ui'
import { showAppleConfirm, showOversizedFilesModal } from '../../../utils/appleConfirm'
import { UploadFile, UploadState, UploadStatus, UploadProgressEvent } from './types/uploadTypes'
import { ProcessingLog as Log, LogLevel } from './types/logTypes'
import { uploadService } from './services/uploadService'
import { uploadConfig, UserContextService } from './services/userContextService'
import { api, API_CONFIG, getAuthToken } from '@/shared/lib/api'
import { cachedRequest } from '@/shared/lib/requestCache'
import { waitForDocumentProcessing } from '@/shared/lib/waitForDocumentProcessing'
import { checkAnnualReportFromPDF } from '@/features/customer'
import type { Customer } from '@/entities/customer/model'
import type { Document } from '../../../types/documentStatus'
import { DocumentService } from '@/services/DocumentService'
import { processAnnualReportFile, registerArDocument, formatIssueDateKorean, clearDuplicateCheckCache, prefetchCustomerData, precomputeFileHashes } from './utils/annualReportProcessor'
import { processCustomerReviewFile, formatIssueDateKorean as formatIssueDateKoreanCR } from './utils/customerReviewProcessor'
import { CustomerSelectionModal, NewCustomerInputModal } from '@/features/annual-report'
import { AnnualReportApi } from '@/features/customer'
import CustomerService from '@/services/customerService'
import { getMyStorageInfo, type StorageInfo } from '@/services/userService'
import {
  validateFile,
  checkStorageWithInfo,
  getCustomerFileHashes,
  checkDuplicateFile,
  checkSystemDuplicate,
  type ExistingFileHash,
} from '@/shared/lib/fileValidation'
import { StorageExceededDialog, DuplicateDialog, type DuplicateAction, type DuplicateFile } from '@/features/batch-upload'
import { errorReporter } from '@/shared/lib/errorReporter'
import { autoClassifyDocument } from '@/services/documentTypesService'
import { useArBatchAnalysis } from './hooks/useArBatchAnalysis'
import { useCrBatchAnalysis } from './hooks/useCrBatchAnalysis'
import { BatchArMappingModal } from './components/BatchArMappingModal'
import { BatchCrMappingModal } from './components/BatchCrMappingModal'
import { registerArDocument as registerArDocumentBatch } from './utils/annualReportProcessor'
import { getEffectiveMapping } from './utils/arGroupingUtils'
import { getEffectiveMapping as getCrEffectiveMapping } from './utils/crGroupingUtils'
import { BatchUploadApi } from '@/features/batch-upload'
import type { ArFileTableRow } from './types/arBatchTypes'
import type { CrFileTableRow } from './types/crBatchTypes'
import { getBatchId, setBatchId, addBatchExpectedTotal, useBatchId } from '@/hooks/useBatchId'
import { useDocumentStatistics } from '@/hooks/useDocumentStatistics'
import { DocumentProcessingStatusBar } from '../DocumentLibraryView/DocumentProcessingStatusBar'
import './DocumentRegistrationView.css'
import './DocumentRegistrationView.mobile.css'

interface DocumentRegistrationViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
}

/**
 * DocumentRegistrationView React 컴포넌트
 *
 * 애플 스타일의 문서 업로드 시스템
 * - 드래그앤드롭 파일 선택
 * - 실시간 업로드 진행률
 * - 에러 처리 및 재시도
 * - 사용자별 업로드 지원 (미래 확장)
 *
 * @example
 * ```tsx
 * <DocumentRegistrationView
 *   visible={isVisible}
 *   onClose={handleClose}
 * />
 * ```
 */
export const DocumentRegistrationView: React.FC<DocumentRegistrationViewProps> = ({
  visible,
  onClose
}) => {
  // 고객 파일 등록 상태
  const [customerFileCustomer, setCustomerFileCustomer] = useState<Customer | null>(null)
  // 고객 ID 변경 추적용 (이전 고객 ID)
  const prevCustomerIdRef = useRef<string | null>(null)

  // 🔴 현재 업로드 배치 ID (실시간 추적 - 파이프라인 처리 진행률 표시용)
  const currentBatchId = useBatchId()
  const { statistics: docStats, isLoading: statsLoading } = useDocumentStatistics({ enabled: visible })
  const { statistics: batchStats, isLoading: batchLoading } = useDocumentStatistics({
    enabled: visible && !!currentBatchId,
    batchId: currentBatchId
  })

  // 🍎 처리 로그 표시 상태 (업로드 시작 전에는 숨김)
  const [isLogVisible, setIsLogVisible] = useState<boolean>(false)

  // 🍎 AR/CRS 일괄등록 완료 후 네비게이션 버튼 표시
  const [showBatchCompletionNav, setShowBatchCompletionNav] = useState(false)

  // 🍎 도움말 모달 상태
  const [helpModalVisible, setHelpModalVisible] = useState(false)

  // 🍎 스토리지 용량 초과 다이얼로그 상태
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)
  const [showStorageExceededDialog, setShowStorageExceededDialog] = useState(false)
  const [storageExceededInfo, setStorageExceededInfo] = useState<{
    selectedFilesSize: number
    selectedFilesCount: number
    partialUploadInfo: { fileCount: number; totalSize: number } | null
  } | null>(null)
  const [pendingFilesForUpload, setPendingFilesForUpload] = useState<File[]>([])

  // 🔴 중복 파일 처리 다이얼로그 상태
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [currentDuplicateFile, setCurrentDuplicateFile] = useState<DuplicateFile | null>(null)
  const duplicateResolverRef = useRef<((action: DuplicateAction) => void) | null>(null)
  const duplicateApplyAllRef = useRef<{ action: DuplicateAction } | null>(null)

  // 🎯 AR 고객 선택 모달 상태
  const [arCustomerSelectionState, setArCustomerSelectionState] = useState<{
    isOpen: boolean
    arFile: File | null
    arMetadata: { customer_name: string; issue_date: string } | null
    matchingCustomers: Customer[]
    fileId: string
    existingHashes: ExistingFileHash[]
    newlyCreatedCustomerId: string | null
  }>({
    isOpen: false,
    arFile: null,
    arMetadata: null,
    matchingCustomers: [],
    fileId: '',
    existingHashes: [],
    newlyCreatedCustomerId: null
  })
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false)

  // 🎯 AR 파일 미발견 경고 메시지 (3초 후 자동 사라짐)
  const [noArFoundWarning, setNoArFoundWarning] = useState<string | null>(null)

  // 🎯 CRS 파일 미발견 경고 메시지 (3초 후 자동 사라짐)
  const [noCrFoundWarning, setNoCrFoundWarning] = useState<string | null>(null)

  // 경고 메시지 자동 사라짐 타이머 (AR)
  useEffect(() => {
    if (noArFoundWarning) {
      const timer = setTimeout(() => {
        setNoArFoundWarning(null)
      }, 3000) // 3초 후 사라짐
      return () => clearTimeout(timer)
    }
    return undefined
  }, [noArFoundWarning])

  // 경고 메시지 자동 사라짐 타이머 (CRS)
  useEffect(() => {
    if (noCrFoundWarning) {
      const timer = setTimeout(() => {
        setNoCrFoundWarning(null)
      }, 3000) // 3초 후 사라짐
      return () => clearTimeout(timer)
    }
    return undefined
  }, [noCrFoundWarning])

  // 🎯 AR 파일 큐 - 다중 AR 파일 순차 처리용
  // 문제: 여러 AR 파일 업로드 시 두 번째 파일이 첫 번째를 덮어씀
  // 해결: 큐에 저장 후 한 파일씩 순차 처리
  interface PendingArFile {
    file: File
    arMetadata: { customer_name: string; issue_date: string }
    matchingCustomers: Customer[]
    fileId: string
    existingHashes: ExistingFileHash[]
  }
  const pendingArFilesQueueRef = useRef<PendingArFile[]>([])

  // 🎯 CRS 고객 선택 모달 상태 (AR과 동일한 패턴)
  const [crCustomerSelectionState, setCrCustomerSelectionState] = useState<{
    isOpen: boolean
    crFile: File | null
    crMetadata: { customer_name?: string; product_name?: string; issue_date?: string; contractor_name?: string; insured_name?: string; fsr_name?: string; policy_number?: string } | null
    matchingCustomers: Customer[]
    fileId: string
    existingHashes: ExistingFileHash[]
  }>({
    isOpen: false,
    crFile: null,
    crMetadata: null,
    matchingCustomers: [],
    fileId: '',
    existingHashes: []
  })
  const [showNewCustomerModalForCR, setShowNewCustomerModalForCR] = useState(false)

  // 🎯 AR 일괄 매핑용 새 고객 등록 모달 상태
  const [batchNewCustomerModal, setBatchNewCustomerModal] = useState<{
    isOpen: boolean
    fileId: string | null  // '__BULK__'면 일괄 매핑, 아니면 개별 파일
    defaultName: string
  }>({ isOpen: false, fileId: null, defaultName: '' })

  // 🎯 CRS 일괄 매핑용 새 고객 등록 모달 상태
  const [crBatchNewCustomerModal, setCrBatchNewCustomerModal] = useState<{
    isOpen: boolean
    fileId: string | null  // '__BULK__'면 일괄 매핑, 아니면 개별 파일
    defaultName: string
  }>({ isOpen: false, fileId: null, defaultName: '' })

  // 🎯 문서 유형 선택 상태 (AR/CRS는 고객 선택 불필요 - 업로드 후 모달로 선택)
  type DocumentTypeMode = 'normal' | 'annual_report' | 'customer_review' | null
  const [documentTypeMode, setDocumentTypeMode] = useState<DocumentTypeMode>(null)

  // UI 상태 (localStorage에서 복원)
  const [isGuideExpanded, setIsGuideExpanded] = useState(() => {
    const saved = localStorage.getItem('doc-reg-guide-expanded')
    return saved === null ? true : saved === 'true' // 기본값: 펼친 상태
  })

  // 가이드 접기/펼치기 토글
  const toggleGuide = useCallback(() => {
    setIsGuideExpanded(prev => {
      const newValue = !prev
      localStorage.setItem('doc-reg-guide-expanded', String(newValue))
      return newValue
    })
  }, [])

  // SessionStorage 키
  const SESSION_KEY = 'document-upload-state'

  // 초기 상태 복원 또는 기본값
  const getInitialState = (): UploadState => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as StoredUploadState
        const restoredFiles: UploadFile[] = parsed.files?.map((savedFile) => {
          // 더미 File 객체 생성 (실제 파일은 복원 불가)
          const dummyFile = new File(
            [''], // 빈 내용
            savedFile.fileInfo?.name ?? 'unknown',
            {
              type: savedFile.fileInfo?.type ?? 'application/octet-stream',
              lastModified: savedFile.fileInfo?.lastModified ?? Date.now()
            }
          )

          // 실제 업로드 프로세스(XHR)는 리마운트 시 소멸하므로
          // 'uploading' 상태 파일은 중단된 것으로 처리
          const wasUploading = savedFile.status === 'uploading' || savedFile.status === 'pending'

          return {
            id: savedFile.id,
            file: dummyFile,
            fileSize: savedFile.fileSize ?? savedFile.fileInfo?.size ?? 0,
            status: wasUploading ? 'error' as const : savedFile.status,
            progress: wasUploading ? 0 : savedFile.progress,
            error: wasUploading ? '업로드가 중단되었습니다 (페이지 새로고침)' : savedFile.error,
            completedAt: savedFile.completedAt ? new Date(savedFile.completedAt) : undefined,
          }
        }) ?? []

        return {
          ...parsed,
          files: restoredFiles,
          uploading: false // 실제 업로드 프로세스는 리마운트 시 소멸 — 항상 false
        }
      }
    } catch (error) {
      console.warn('[DocumentRegistrationView] Failed to restore state:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentRegistrationView.restoreState' })
    }

    return {
      files: [],
      uploading: false,
      totalProgress: 0,
      completedCount: 0,
      errors: [],
      context: {
        identifierType: 'userId',
        identifierValue: typeof window !== 'undefined' ? localStorage.getItem('aims-current-user-id') || 'tester' : 'tester'
      }
    }
  }

  // 업로드 상태 관리
  const [uploadState, setUploadState] = useState<UploadState>(getInitialState)


  // 🏷️ AR 파일명 추적 (업로드 완료 후 DB 플래그 설정용)
  const arFilenamesRef = useRef<Set<string>>(new Set())

  // 🔗 AR 파일명 → 고객 ID 매핑 (자동 연결용)
  const arCustomerMappingRef = useRef<Map<string, string>>(new Map())

  // 📝 AR 파일명 → metadata 매핑 (발행일 등 DB 저장용)
  const arMetadataMappingRef = useRef<Map<string, { issue_date?: string; report_title?: string }>>(new Map())

  // 🔗 AR 문서 ID → 고객 ID 매핑 (더 확실한 연결용)
  const arDocumentCustomerMappingRef = useRef<Map<string, string>>(new Map())

  // 👤 고객 ID → 고객명 매핑 (로그 표시용)
  const customerNameMappingRef = useRef<Map<string, string>>(new Map())

  // 📊 AR 처리 성공 카운터 (중복 건너뛴 건 제외)
  const arProcessedCountRef = useRef<number>(0)

  // 🚀 진행률 스로틀: 파일당 최소 300ms 간격으로만 UI 업데이트
  const progressThrottleRef = useRef<Map<string, number>>(new Map())

  // 🚀 로그 배치 버퍼: 대량 등록 시 addLog 호출마다 배열 복사 방지
  const pendingLogsRef = useRef<Log[]>([])
  const logFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 🏷️ CRS 파일명 추적 (업로드 완료 후 DB 플래그 설정용)
  const crFilenamesRef = useRef<Set<string>>(new Set())

  // 🔗 CRS 파일명 → 고객 ID 매핑 (자동 연결용)
  const crCustomerMappingRef = useRef<Map<string, string>>(new Map())

  // 📝 CRS 파일명 → metadata 매핑 (발행일 등 DB 저장용)
  const crMetadataMappingRef = useRef<Map<string, { product_name?: string; issue_date?: string; contractor_name?: string; insured_name?: string; fsr_name?: string; policy_number?: string }>>(new Map())

  // 📄 일반 문서 파일명 → 문서 ID 매핑 (백그라운드 처리 완료 확인용)
  const normalDocumentMappingRef = useRef<Map<string, string>>(new Map())

  // 🔗 고객 파일 등록 탭에서 업로드된 파일 추적 (파일명 → 고객 정보 매핑)
  const customerFileUploadMappingRef = useRef<Map<string, {
    customerId: string
    customerName: string
    documentType: string
  }>>(new Map())

  // 📝 처리 로그 상태 (sessionStorage에서 복원)
  const getInitialLogs = (): Log[] => {
    try {
      const LOGS_KEY = 'document-upload-logs'
      const saved = sessionStorage.getItem(LOGS_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as Log[]
        // timestamp를 Date 객체로 변환
        return parsed.map(log => ({
          ...log,
          timestamp: new Date(log.timestamp)
        }))
      }
    } catch (error) {
      console.warn('[DocumentRegistrationView] Failed to restore logs:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentRegistrationView.restoreLogs' })
    }
    return []
  }

  const [processingLogs, setProcessingLogs] = useState<Log[]>(getInitialLogs)
  const logCounterRef = useRef(0) // 로그 카운터 (고유 ID 보장)

  /**
   * 로그 추가 헬퍼 함수
   * 고객명이 지정되면 메시지 앞에 [고객명]을 자동으로 추가
   *
   * @param level - 로그 레벨
   * @param message - 로그 메시지
   * @param details - 상세 정보 (선택)
   * @param customerName - 고객명 (선택)
   */
  // 로그 버퍼 플러시: 버퍼에 쌓인 로그를 한 번에 state에 반영
  const flushPendingLogs = useCallback(() => {
    if (pendingLogsRef.current.length === 0) return
    const batch = pendingLogsRef.current.splice(0)
    // 최신 로그가 앞에 오도록 reverse
    setProcessingLogs(prev => [...batch.reverse(), ...prev])
  }, [])

  const addLog = useCallback((level: LogLevel, message: string, details?: string, customerName?: string) => {
    logCounterRef.current += 1
    const counter = logCounterRef.current

    // 고객명이 있으면 메시지 앞에 [고객명] 추가
    const finalMessage = customerName ? `[${customerName}] ${message}` : message

    // 🔒 보안: crypto.randomUUID 사용 (Math.random은 예측 가능)
    const newLog: Log = {
      id: `log_${Date.now()}_${counter}_${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date(),
      level,
      message: finalMessage,
      details
    }

    // 버퍼에 추가, 20개마다 즉시 플러시 (대량 등록 시 배열 복사 횟수 20배 감소)
    pendingLogsRef.current.push(newLog)
    if (pendingLogsRef.current.length >= 20) {
      flushPendingLogs()
      return
    }

    // 소량 호출 시 100ms 후 자동 플러시 (일반 사용 시 즉각적 피드백)
    if (logFlushTimerRef.current) clearTimeout(logFlushTimerRef.current)
    logFlushTimerRef.current = setTimeout(flushPendingLogs, 100)
  }, [flushPendingLogs])

  // 🎯 AR 일괄 처리 훅
  const currentUserId = localStorage.getItem('aims-current-user-id') || 'tester'
  const arBatch = useArBatchAnalysis({
    userId: currentUserId,
    addLog: (type, message, detail) => {
      addLog(type as LogLevel, message, detail)
    },
  })

  // 🎯 CRS 일괄 처리 훅
  const crBatch = useCrBatchAnalysis({
    userId: currentUserId,
    addLog: (type, message, detail) => {
      addLog(type as LogLevel, message, detail)
    },
  })

  /**
   * 상태를 sessionStorage에 저장
   */
  useEffect(() => {
    try {
      // File 객체는 직렬화할 수 없으므로 파일 정보만 저장
      const stateToSave = {
        ...uploadState,
        files: uploadState.files.map(file => ({
          id: file.id,
          status: file.status,
          progress: file.progress,
          error: file.error,
          completedAt: file.completedAt,
          // File 객체 정보만 저장 (실제 File 객체는 저장 불가)
          fileInfo: {
            name: file.file.name,
            size: file.fileSize,
            type: file.file.type,
            lastModified: file.file.lastModified
          }
        }))
      }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(stateToSave))
    } catch (error) {
      console.warn('[DocumentRegistrationView] Failed to save state:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentRegistrationView.saveState' })
    }
  }, [uploadState, SESSION_KEY])

  /**
   * 처리 로그를 sessionStorage에 저장
   */
  useEffect(() => {
    try {
      const LOGS_KEY = 'document-upload-logs'
      sessionStorage.setItem(LOGS_KEY, JSON.stringify(processingLogs))
    } catch (error) {
      console.warn('[DocumentRegistrationView] Failed to save logs:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentRegistrationView.saveLogs' })
    }
  }, [processingLogs])

  /**
   * 고유 ID 생성
   * 🔒 보안: crypto.randomUUID 사용 (Math.random은 예측 가능)
   */
  const generateFileId = useCallback((): string => {
    return `file_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
  }, [])

  /**
   * 🔴 중복 파일 처리 다이얼로그 핸들러
   */
  const handleDuplicateAction = useCallback((action: DuplicateAction, applyToAll: boolean) => {
    if (applyToAll) {
      duplicateApplyAllRef.current = { action }
    }
    if (duplicateResolverRef.current) {
      duplicateResolverRef.current(action)
      duplicateResolverRef.current = null
    }
    setShowDuplicateDialog(false)
    setCurrentDuplicateFile(null)
  }, [])

  /**
   * 🔴 중복 파일 처리 다이얼로그 취소 핸들러
   */
  const handleDuplicateCancel = useCallback(() => {
    // 🔴 resolver가 있으면 반드시 resolve하여 Promise 해소 (무한 대기 방지)
    if (duplicateResolverRef.current) {
      duplicateResolverRef.current('skip' as DuplicateAction)
      duplicateResolverRef.current = null
    }
    duplicateApplyAllRef.current = null
    setShowDuplicateDialog(false)
    setCurrentDuplicateFile(null)
  }, [])

  /**
   * 🔴 중복 파일 발견 시 다이얼로그 표시 및 사용자 액션 대기
   */
  const promptDuplicateAction = useCallback((
    file: File,
    existingDoc: { uploadedAt?: string; size?: number },
    customerName: string
  ): Promise<DuplicateAction | 'cancel'> => {
    return new Promise((resolve) => {
      // 이미 일괄 적용 설정이 있으면 바로 반환
      if (duplicateApplyAllRef.current) {
        resolve(duplicateApplyAllRef.current.action)
        return
      }

      const duplicateFile: DuplicateFile = {
        fileName: file.name,
        folderName: '',
        customerName,
        existingFileDate: existingDoc.uploadedAt
          ? new Date(existingDoc.uploadedAt).toLocaleString('ko-KR')
          : undefined,
        newFileSize: file.size,
        existingFileSize: existingDoc.size
      }

      setCurrentDuplicateFile(duplicateFile)
      setShowDuplicateDialog(true)

      duplicateResolverRef.current = (action: DuplicateAction) => {
        resolve(action)
      }
    })
  }, [])

  /**
   * 🔄 컴포넌트 레벨 파일 상태 업데이트 (AR 핸들러용)
   */
  const updateFileStatusByFile = useCallback((file: File, status: UploadStatus, error?: string) => {
    setUploadState(prev => ({
      ...prev,
      files: prev.files.map(f =>
        f.file.name === file.name && f.file.size === file.size
          ? { ...f, status, error }
          : f
      )
    }));
  }, []);

  /**
   * 파일 선택 핸들러
   */
  const handleFilesSelected = useCallback(async (files: File[]) => {

    // 🧹 새 업로드 시작 시 기존 로그 클리어
    setProcessingLogs([])
    logCounterRef.current = 0
    setShowBatchCompletionNav(false)

    // 🔴 중복 처리 일괄 적용 설정 초기화
    duplicateApplyAllRef.current = null

    // 🔴 업로드 묶음 ID: 활성 배치가 있으면 재사용 (AR 처리중 CRS 업로드 시 누적 표시)
    // 항상 setBatchId 호출 → StatusBar의 cleanup 타이머를 취소하여 경쟁 조건 방지
    const existingBatchId = getBatchId()
    const newBatchId = existingBatchId || `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    setBatchId(newBatchId)
    // 🔴 업로드 예정 파일 수 등록 — 서버 total이 이 수에 도달하기 전까지 프로그레스바 cleanup 차단
    addBatchExpectedTotal(files.length)
    if (import.meta.env.DEV) {
      console.log(`[DocumentRegistrationView] 배치 ID: ${newBatchId}${existingBatchId ? ' (기존 재사용)' : ' (신규)'}, 파일 수: ${files.length}`)
    }

    // 🎯🎯🎯 AR 배치 모드: 제일 먼저 체크! (uploadState 건드리기 전에 처리)
    // 이유: setUploadState → useEffect → uploadService.queueFiles 자동 호출 방지
    if (documentTypeMode === 'annual_report') {
      // 🔴🔴🔴 자동 업로드 완전 차단!
      // 1. uploadState.files를 빈 배열로 설정 (이전 파일 제거)
      // 2. uploadService 큐 취소 (혹시 큐에 있던 파일도 취소)
      setUploadState(prev => ({ ...prev, files: [] }))
      uploadService.cancelAllUploads()

      // PDF 파일만 필터링
      const pdfFiles = files.filter(f => f.type === 'application/pdf')

      if (pdfFiles.length === 0) {
        addLog('warning', 'PDF 파일이 없습니다', 'Annual Report는 PDF 파일만 지원합니다.')
        return
      }

      if (pdfFiles.length < files.length) {
        const nonPdfCount = files.length - pdfFiles.length
        addLog('warning', `${nonPdfCount}개 파일 제외`, 'PDF가 아닌 파일은 AR 등록에서 제외됩니다.')
      }

      // 배치 분석 시작 (모달이 자동으로 열림)
      addLog('info', `${pdfFiles.length}개 AR 파일 배치 분석 시작...`)
      setNoArFoundWarning(null) // 이전 경고 초기화
      const arAnalysisResult = await arBatch.analyzeArFiles(pdfFiles)

      // AR 파일이 하나도 발견되지 않은 경우
      if (!arAnalysisResult) {
        setNoArFoundWarning('Annual Report가 아닙니다.')
        return
      }

      return // 이후 처리는 BatchArMappingModal에서 진행
    }

    // 🎯🎯🎯 CRS 배치 모드: AR과 동일한 패턴
    if (documentTypeMode === 'customer_review') {
      // 🔴🔴🔴 자동 업로드 완전 차단!
      setUploadState(prev => ({ ...prev, files: [] }))
      uploadService.cancelAllUploads()

      // PDF 파일만 필터링
      const pdfFiles = files.filter(f => f.type === 'application/pdf')

      if (pdfFiles.length === 0) {
        addLog('warning', 'PDF 파일이 없습니다', 'Customer Review는 PDF 파일만 지원합니다.')
        return
      }

      if (pdfFiles.length < files.length) {
        const nonPdfCount = files.length - pdfFiles.length
        addLog('warning', `${nonPdfCount}개 파일 제외`, 'PDF가 아닌 파일은 CRS 등록에서 제외됩니다.')
      }

      // 배치 분석 시작 (모달이 자동으로 열림)
      addLog('info', `${pdfFiles.length}개 CRS 파일 배치 분석 시작...`)
      const crAnalysisResult = await crBatch.analyzeCrFiles(pdfFiles)

      // CRS 파일이 하나도 발견되지 않은 경우
      if (!crAnalysisResult) {
        setNoCrFoundWarning('Customer Review가 아닙니다.')
        return
      }

      return // 이후 처리는 BatchCrMappingModal에서 진행
    }

    // 🚀 [UX 개선] 파일 선택 즉시 목록 표시 (analyzing 상태) - AR/CRS 모드 아닐 때만!
    const initialUploadFiles: UploadFile[] = files.map(file => ({
      id: generateFileId(),
      file,
      fileSize: file.size,
      status: 'analyzing' as const,
      progress: 0,
      error: undefined,
      completedAt: undefined,
      batchId: newBatchId  // 🔴 업로드 묶음 ID 추가
    }))

    // 즉시 UI 업데이트 - 파일 목록 표시
    setUploadState(prev => ({
      ...prev,
      files: initialUploadFiles
    }))
    setIsLogVisible(true)
    addLog('info', `${files.length}개 파일 분석 시작...`)

    // 🍎 스토리지 용량 체크 (공통 모듈 사용)
    try {
      const storage = await getMyStorageInfo()
      console.log('[DocumentRegistration] Storage info:', storage)
      setStorageInfo(storage)

      // 공통 모듈로 스토리지 검사
      const storageCheck = checkStorageWithInfo(files, storage)

      // 용량 초과 시 다이얼로그 표시
      if (!storageCheck.canUpload) {
        console.log('[DocumentRegistration] Storage exceeded, showing dialog')

        // 파일 목록 초기화 (다이얼로그 표시 전)
        setUploadState(prev => ({ ...prev, files: [] }))
        setIsLogVisible(false)

        // 다이얼로그 상태 설정
        setPendingFilesForUpload(files)
        setStorageExceededInfo({
          selectedFilesSize: storageCheck.requestedBytes,
          selectedFilesCount: files.length,
          partialUploadInfo: storageCheck.partialUploadInfo
            ? { fileCount: storageCheck.partialUploadInfo.fileCount, totalSize: storageCheck.partialUploadInfo.totalSize }
            : null
        })
        setShowStorageExceededDialog(true)
        return // 업로드 진행하지 않음
      }
    } catch (error) {
      console.error('스토리지 정보 조회 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentRegistrationView.handleFilesSelected.getStorage' })
      // 에러 시에도 정상 진행 (서버에서 최종 검증)
    }

    // 🔴 중복 파일 검사 (고객이 선택된 경우에만)
    let existingHashes: ExistingFileHash[] = []
    if (customerFileCustomer) {
      try {
        console.log('[DocumentRegistration] 🔍 중복 파일 검사 시작:', customerFileCustomer._id)
        existingHashes = await getCustomerFileHashes(customerFileCustomer._id)
        console.log('[DocumentRegistration] 기존 파일 해시 조회 완료:', existingHashes.length, '개')
      } catch (error) {
        console.error('[DocumentRegistration] 중복 검사용 해시 조회 실패:', error)
        errorReporter.reportApiError(error as Error, { component: 'DocumentRegistrationView.handleFilesSelected.getHashes' })
        // 에러 시에도 정상 진행 (중복 검사 건너뜀)
      }
    }

    // 🔄 파일 ID 매핑 (초기 파일 → 분석 후 상태 업데이트용)
    const fileIdMap = new Map<File, string>()
    initialUploadFiles.forEach(uf => fileIdMap.set(uf.file, uf.id))

    const newUploadFiles: UploadFile[] = []
    const systemFileNames: string[] = []

    // 🔄 개별 파일 상태 업데이트 헬퍼
    const updateFileStatus = (file: File, status: UploadStatus, error?: string) => {
      const fileId = fileIdMap.get(file)
      if (fileId) {
        setUploadState(prev => ({
          ...prev,
          files: prev.files.map(f => f.id === fileId ? { ...f, status, error } : f)
        }))
      }
    }

    // 🔍 PDF 파일 중 Annual Report 체크 (파일 선택 직후, 업로드 전!)
    for (const file of files) {
      const fileId = fileIdMap.get(file) || generateFileId()

      // 파일 검증 (공통 모듈 사용: 확장자, 크기, MIME 검증)
      const validation = validateFile(file)

      if (validation.valid) {
        // 🔴🔴🔴 해당 고객에게 해시 중복 검사 (일반 문서일 때만! AR/CRS는 고객 결정 후 체크) 🔴🔴🔴
        // AR/CRS 탭에서는 시스템 중복 체크 건너뜀 - 고객이 결정된 후에 해당 고객 문서로 중복 체크함
        if (documentTypeMode === 'normal') {
          try {
            const systemDupResult = await checkSystemDuplicate(file, customerFileCustomer?._id)
            if (systemDupResult.isDuplicate && systemDupResult.existingDocument) {
              const existingInfo = systemDupResult.existingDocument
              const customerInfo = existingInfo.customerName
                ? `"${existingInfo.customerName}" 고객에게`
                : '시스템에'

              addLog(
                'info',
                `⊘ 중복 파일 건너뜀: ${file.name}`,
                `이미 ${customerInfo} 동일한 파일이 등록되어 있습니다. (${existingInfo.fileName})`
              )
              console.warn(`[DocumentRegistration] 시스템 해시 중복 건너뜀: ${file.name} (기존: ${existingInfo.fileName})`)
              updateFileStatus(file, 'skipped', `중복 파일 - 이미 ${customerInfo} 등록됨`)
              continue
            }
          } catch (error) {
            console.error('[DocumentRegistration] 시스템 해시 중복 검사 실패:', error)
            // 검사 실패 시 업로드 계속 진행 (백엔드에서 최종 차단)
          }
        }

        // PDF 파일이면 Annual Report 체크
        if (file.type === 'application/pdf') {
          try {
            addLog('info', `[1/4] PDF 분석 중: ${file.name}`)
            console.log('[DocumentRegistrationView] 🔍 PDF 파일 감지, Annual Report 체크:', file.name);
            const checkResult = await checkAnnualReportFromPDF(file);

            if (checkResult.is_annual_report) {
              console.log('[DocumentRegistrationView] ✅ Annual Report 감지!', checkResult.metadata);

              // 🎯 AR 고객 매칭 플로우
              let targetCustomerId: string;
              let targetCustomerName: string;

              if (customerFileCustomer) {
                // 사전 선택된 고객이 있으면 그대로 사용
                targetCustomerId = customerFileCustomer._id;
                targetCustomerName = customerFileCustomer.personal_info?.name || '알 수 없음';
              } else {
                // 사전 선택된 고객이 없으면 AR 메타데이터에서 고객명 추출 후 검색
                const arCustomerName = checkResult.metadata?.customer_name;

                if (!arCustomerName) {
                  addLog('warning', `AR 문서 감지됨: ${file.name}`, '고객명을 추출할 수 없습니다. 고객을 먼저 선택해주세요');
                  updateFileStatus(file, 'error', '고객명 추출 실패');
                  continue;
                }

                addLog('info', `[2/5] AR 고객 검색 중: "${arCustomerName}"`);

                // 고객명으로 부분 일치 검색
                const currentUserId = localStorage.getItem('aims-current-user-id') || 'tester';
                const matchingCustomers = await AnnualReportApi.searchCustomersByName(arCustomerName, currentUserId);

                if (matchingCustomers.length === 0) {
                  // Case 1: 유사 이름 고객 0명 → 자동 등록
                  addLog('info', `[3/5] 유사 고객 없음 → "${arCustomerName}" 자동 등록`);

                  try {
                    const newCustomer = await CustomerService.createCustomer({
                      personal_info: { name: arCustomerName },
                      insurance_info: { customer_type: '개인' },
                      contracts: [],
                      documents: [],
                      consultations: [],
                    });

                    targetCustomerId = newCustomer._id;
                    targetCustomerName = arCustomerName;

                    addLog('success', `[3/5] 새 고객 등록 완료: ${arCustomerName}`);
                  } catch (error) {
                    console.error('[DocumentRegistrationView] 고객 자동 등록 실패:', error);
                    addLog('error', `고객 등록 실패: ${file.name}`, String(error));
                    updateFileStatus(file, 'error', '고객 등록 실패');
                    continue;
                  }
                } else {
                  // Case 2: 유사 이름 고객 1명 이상 → 큐에 추가 후 순차 처리
                  addLog('info', `[3/5] ${matchingCustomers.length}명의 유사 고객 발견 → 선택 필요`);

                  // 🎯 AR 파일을 큐에 추가 (다중 파일 순차 처리)
                  const pendingArFile: PendingArFile = {
                    file,
                    arMetadata: {
                      customer_name: arCustomerName,
                      issue_date: checkResult.metadata?.issue_date || '',
                    },
                    matchingCustomers,
                    fileId,
                    existingHashes,
                  };
                  pendingArFilesQueueRef.current.push(pendingArFile);

                  // 현재 파일은 큐에서 순차 처리될 예정
                  updateFileStatus(file, 'pending', '고객 선택 대기 중');
                  continue;
                }
              }

              const customerId = targetCustomerId;
              const customerName = targetCustomerName;

              // 중복 문서 체크 (해시 + 발행일)
              const processResult = await processAnnualReportFile(file, customerId, checkResult.metadata?.issue_date);
              if (processResult.isDuplicateDoc) {
                addLog(
                  'warning',
                  `🔴 중복 파일 건너뜀: ${file.name}`,
                  `이미 등록된 파일입니다. 업로드를 건너뜁니다.`
                );
                updateFileStatus(file, 'skipped', '중복 파일 - 이미 등록됨')
                continue;
              }
              if (processResult.isDuplicateIssueDate) {
                const formattedDate = formatIssueDateKorean(processResult.duplicateIssueDate);
                addLog(
                  'warning',
                  `🔴 ${formattedDate} 발행일 보고서 이미 존재`,
                  `${file.name} 업로드를 건너뜁니다.`
                );
                updateFileStatus(file, 'skipped', `${formattedDate} 발행일 보고서 이미 존재`)
                continue;
              }

              addLog('success', `[1/4] PDF 분석 완료: ${file.name}`)
              addLog(
                'ar-detect',
                `[2/5] Annual Report 감지`,
                `사전 선택된 고객: ${customerName} → AR 전용 처리로 전환`
              )

              addLog(
                'ar-auto',
                `AR 자동 등록: ${file.name}`,
                `사전 선택된 고객: ${customerName}`
              );

              // ✅ 사전 선택된 고객으로 AR 등록
              const result = await registerArDocument(file, customerId, checkResult.metadata?.issue_date, {
                addLog,
                generateFileId: () => fileId, // 기존 ID 유지
                addToUploadQueue: (uploadFile) => {
                  // 기존 파일의 상태를 pending으로 업데이트
                  updateFileStatus(file, 'pending')
                  newUploadFiles.push({ ...uploadFile, id: fileId, batchId: newBatchId });
                },
                trackArFile: (fileName, custId) => {
                  arFilenamesRef.current.add(fileName);
                  arCustomerMappingRef.current.set(fileName, custId);
                  if (checkResult.metadata) {
                    arMetadataMappingRef.current.set(fileName, checkResult.metadata);
                  }
                  // 고객명 매핑 저장 (자동 연결 로그에서 사용)
                  customerNameMappingRef.current.set(custId, customerName);
                }
              });

              if (result.success) {
                console.log('[DocumentRegistrationView] AR 문서 등록 성공:', file.name);
                arProcessedCountRef.current += 1;
              }

              continue;
            } else {
              // 🔴 CRS 개별 처리는 이제 배치 처리(BatchCrMappingModal)로 대체됨
              // documentTypeMode === 'customer_review'는 handleFilesSelected 초반에서 return됨
              // AR 탭에서 업로드했지만 AR이 아닌 경우 - 일반 문서로 처리
              addLog('info', `[1/4] PDF 분석 완료: ${file.name}`, 'Annual Report 아님 - 일반 문서로 처리');
            }
          } catch (error) {
            console.error('[DocumentRegistrationView] Annual Report 체크 실패:', error);
            errorReporter.reportApiError(error as Error, { component: 'DocumentRegistrationView.handleFilesSelected.arCheck', payload: { fileName: file.name } })
            addLog('warning', `PDF 분석 실패: ${file.name}`, error instanceof Error ? error.message : String(error))
            // 체크 실패 시 일반 문서로 처리
          }
        } else {
          // 이미지 등 PDF가 아닌 일반 파일
          addLog('info', `[1/4] 일반 파일 감지: ${file.name}`, file.type || '알 수 없는 형식')
        }

        // 🔴 중복 파일 검사 (일반 문서용) - 모달로 사용자에게 선택권 제공
        if (existingHashes.length > 0 && customerFileCustomer) {
          try {
            const duplicateResult = await checkDuplicateFile(file, existingHashes)
            if (duplicateResult.isDuplicate && duplicateResult.existingDoc) {
              const customerName = customerFileCustomer.personal_info?.name || '알 수 없음'

              // 🔴 중복 파일 발견 — DuplicateDialog로 사용자에게 선택권 제공 (일괄등록과 동일)
              const duplicateAction = await promptDuplicateAction(
                file,
                { uploadedAt: duplicateResult.existingDoc.uploadedAt, size: duplicateResult.existingDoc.fileSize },
                customerName
              )

              if (duplicateAction === 'skip' || duplicateAction === 'cancel') {
                addLog(
                  'info',
                  `⊘ 중복 파일 건너뜀: ${file.name}`,
                  `"${customerName}" 고객에게 이미 동일한 파일이 등록되어 있습니다.`
                )
                updateFileStatus(file, 'skipped', `중복 파일 - "${customerName}" 고객에게 이미 등록됨`)
                continue
              }
            }
          } catch (error) {
            console.error('[DocumentRegistration] 중복 검사 실패:', error)
            errorReporter.reportApiError(error as Error, { component: 'DocumentRegistrationView.handleFilesSelected.duplicateCheck' })
            // 중복 검사 실패 시에도 업로드 진행
          }
        }

        // 일반 문서 또는 Annual Report가 아닌 PDF - 상태를 pending으로 업데이트
        updateFileStatus(file, 'pending')
        newUploadFiles.push({
          id: fileId,
          file,
          fileSize: file.size,
          status: 'pending',
          progress: 0,
          error: undefined,
          completedAt: undefined,
          customerId: customerFileCustomer?._id,  // 🔗 고객 선택 시 자동 연결
          batchId: newBatchId  // 🔴 업로드 묶음 ID (진행률 추적용)
        })
      } else if (validation.reason === 'system_file') {
        // 시스템/임시 파일은 에러 목록에 넣지 않고 조용히 제외 + 경고 로그
        systemFileNames.push(file.name)
      } else {
        // 검증 실패한 파일은 에러로 표시 - 🔄 개별 파일 상태 업데이트
        updateFileStatus(file, 'error', validation.message || '파일 검증 실패')
        const errorFile: UploadFile = {
          id: fileId,
          file,
          fileSize: file.size,
          status: 'error',
          progress: 0,
          error: validation.message || '파일 검증 실패'
        }
        newUploadFiles.push(errorFile)
      }
    }

    // 시스템/임시 파일 제외 알림
    if (systemFileNames.length > 0) {
      addLog('warning', `편집 중 자동 생성된 파일 ${systemFileNames.length}개가 제외되었습니다`, systemFileNames.join(', '))
    }

    // 검증 실패한 파일 개수 확인 및 팝업 표시 (크기 초과, 차단 확장자, MIME 불일치 등)
    const invalidFiles = newUploadFiles.filter(f => f.status === 'error')

    if (invalidFiles.length > 0) {
      const invalidCount = invalidFiles.length

      // 🍎 애플 스타일 확인 모달 - 검증 실패 파일 안내
      const confirmed = await showAppleConfirm(
        `총 ${newUploadFiles.length}개의 파일 중 ${invalidCount}개의 파일이 검증에 실패했습니다 (차단된 확장자, 위조 파일 등). 해당 파일들은 업로드에서 제외됩니다.`,
        undefined, // 타이틀 없음
        {
          linkText: '검증 실패 파일들',
          onLinkClick: async () => {
            // 파일 정보를 올바른 형식으로 변환
            const fileList = invalidFiles.map((uploadFile: UploadFile) => ({
              name: uploadFile.file.name,
              size: uploadFile.fileSize
            }))

            // 검증 실패 파일 목록 모달 표시
            await showOversizedFilesModal(fileList, 0)

            // 링크 클릭 후에는 아무것도 하지 않음 (모달이 열린 상태 유지)
          },
          showConfirmButton: true // "취소" "확인" 두 버튼 유지
        }
      )

      if (!confirmed) {
        // 사용자가 취소하면 파일 목록 초기화
        setUploadState(prev => ({ ...prev, files: [] }))
        setIsLogVisible(false)
        return
      }
    }

    // 🔄 유효한 파일들만 업로드 큐에 추가 (상태는 이미 개별적으로 업데이트됨)
    const validFiles = newUploadFiles.filter(f => f.status === 'pending')
    if (validFiles.length > 0) {
      // Phase 3: 완료 추적 (await하면 AR큐 블로킹되므로 .then()으로 비동기 추적)
      uploadService.queueFiles(validFiles).then((results) => {
        const failCount = results.filter(r => !r.success).length
        if (failCount > 0) {
          addLog('warning', `일반 문서 업로드 완료: ${results.length - failCount}/${results.length} 성공`)
        }
      })
      addLog('info', `[2/4] 일반 문서 ${validFiles.length}개 업로드 시작`)

      // 🔗 고객이 선택되어 있으면 추적 목록에 추가 (업로드 후 자동 연결)
      // 문서유형은 자동 분류로 처리되므로 'unspecified'로 설정
      if (customerFileCustomer) {
        validFiles.forEach(f => {
          customerFileUploadMappingRef.current.set(f.file.name, {
            customerId: customerFileCustomer._id,
            customerName: customerFileCustomer.personal_info?.name || '이름 없음',
            documentType: 'unspecified'
          })
          console.log(`🔗 [고객 파일 자동 연결] 추적 추가: ${f.file.name} → 고객: ${customerFileCustomer.personal_info?.name}`)
        })
      }
    }

    // 🎯 AR 큐에 파일이 있으면 첫 번째 파일부터 순차 처리 시작
    if (pendingArFilesQueueRef.current.length > 0) {
      const firstArFile = pendingArFilesQueueRef.current.shift()!;
      console.log('[DocumentRegistrationView] 🎯 AR 큐 처리 시작:', firstArFile.file.name, '(대기:', pendingArFilesQueueRef.current.length, '개)');
      setArCustomerSelectionState({
        isOpen: true,
        arFile: firstArFile.file,
        arMetadata: firstArFile.arMetadata,
        matchingCustomers: firstArFile.matchingCustomers,
        fileId: firstArFile.fileId,
        existingHashes: firstArFile.existingHashes,
        newlyCreatedCustomerId: null,
      });
    }

  }, [generateFileId, addLog, customerFileCustomer, promptDuplicateAction, documentTypeMode, arBatch.analyzeArFiles])

  /**
   * 파일 재시도 핸들러
   */
  const handleRetryFile = useCallback((fileId: string) => {
    setUploadState(prev => ({
      ...prev,
      files: prev.files.map(f =>
        f.id === fileId
          ? { ...f, status: 'pending' as UploadStatus, progress: 0, error: undefined, completedAt: undefined }
          : f
      )
    }))

    const file = uploadState.files.find(f => f.id === fileId)
    if (file) {
      uploadService.queueFiles([{ ...file, status: 'pending', progress: 0, error: undefined, completedAt: undefined }])
    }
  }, [uploadState.files])

  /**
   * 전체 업로드 취소
   */
  const handleCancelAll = useCallback(() => {
    uploadService.cancelAllUploads()
    setUploadState(prev => ({
      ...prev,
      uploading: false,
      files: prev.files.map(f =>
        f.status === 'uploading' || f.status === 'pending'
          ? { ...f, status: 'cancelled' as UploadStatus }
          : f
      )
    }))
  }, [])

  /**
   * 🍎 스토리지 초과 다이얼로그: "기존 파일 정리" 클릭
   */
  const handleStorageCleanupFiles = useCallback(() => {
    setShowStorageExceededDialog(false)
    setPendingFilesForUpload([])
    // 전체 문서 보기로 이동
    onClose()
    const url = new URL(window.location.href)
    url.searchParams.set('view', 'documents-library')
    window.history.pushState({}, '', url.toString())
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, [onClose])

  /**
   * 🍎 스토리지 초과 다이얼로그: "일부만 업로드" 클릭
   */
  const handleStoragePartialUpload = useCallback(async () => {
    if (!storageInfo || !pendingFilesForUpload.length) return

    // 용량 내 파일만 필터링 (크기 작은 순)
    const sortedFiles = [...pendingFilesForUpload].sort((a, b) => a.size - b.size)
    const filteredFiles: File[] = []
    let currentSize = 0

    for (const file of sortedFiles) {
      if (currentSize + file.size <= storageInfo.remaining_bytes) {
        filteredFiles.push(file)
        currentSize += file.size
      }
    }

    setShowStorageExceededDialog(false)
    setPendingFilesForUpload([])

    if (filteredFiles.length > 0) {
      // 필터링된 파일로 업로드 진행 (재귀 호출 방지를 위해 직접 처리)
      // handleFilesSelected를 다시 호출하면 무한 루프 가능성 있으므로
      // 여기서는 다이얼로그만 닫고, 사용자가 다시 파일을 선택하도록 안내
      addLog('info', `용량 내 ${filteredFiles.length}개 파일을 선택해주세요`, `${filteredFiles.map(f => f.name).join(', ')}`)
    }
  }, [storageInfo, pendingFilesForUpload, addLog])

  /**
   * 🍎 스토리지 초과 다이얼로그 닫기
   */
  const handleStorageDialogClose = useCallback(() => {
    setShowStorageExceededDialog(false)
    setPendingFilesForUpload([])
  }, [])

  /**
   * 업로드 진행률 콜백 (스로틀: 파일당 300ms 간격, 100%는 즉시 반영)
   * 대량 등록 시 수백 개 파일의 progress event가 연속 발생 →
   * 매번 files.map() 전체 순회 + React 리렌더 = 심각한 병목
   */
  const handleProgress = useCallback((event: UploadProgressEvent) => {
    const now = Date.now()
    const lastUpdate = progressThrottleRef.current.get(event.fileId) || 0
    if (event.progress < 100 && now - lastUpdate < 300) return
    progressThrottleRef.current.set(event.fileId, now)

    setUploadState(prev => ({
      ...prev,
      files: prev.files.map(f =>
        f.id === event.fileId
          ? { ...f, progress: event.progress }
          : f
      )
    }))
  }, [])

  /**
   * 업로드 완료 후 AR DB 플래그 설정 + 문서 처리 완료 대기 후 자동 연결
   */
  const setAnnualReportFlag = useCallback(async (fileName: string) => {
    // 🔒 중복 실행 방지: 이미 처리 중이면 건너뛰기
    if (!arFilenamesRef.current.has(fileName)) {
      console.log(`⚠️ [AR] 이미 처리 중이거나 완료된 파일: ${fileName}`);
      return;
    }

    // 🔒 즉시 추적 목록에서 제거 (중복 실행 방지)
    arFilenamesRef.current.delete(fileName);
    console.log(`🔒 [AR] 추적 목록에서 제거: ${fileName}, 남은 파일: ${arFilenamesRef.current.size}`);

    try {
      // 매핑된 metadata 가져오기
      const metadata = arMetadataMappingRef.current.get(fileName);

      // 🔗 고객 ID 가져오기 (AR 문서가 처음부터 고객에 연결되도록)
      const customerId = arCustomerMappingRef.current.get(fileName);

      // ⭐ 공유 api 클라이언트 사용 (JWT 토큰 자동 포함)
      const responseData = await api.patch<{ success: boolean; document_id?: string }>(
        '/api/documents/set-annual-report',
        { filename: fileName, metadata, customer_id: customerId }
      );
      console.log(`✅ [AR] is_annual_report=true 설정 완료 (metadata 포함):`, responseData);

      // 🔗 문서 처리 완료 대기 후 자동 연결
      const documentId = responseData.document_id;

      console.log(`🔍 [AR] 매핑 조회: fileName="${fileName}", customerId="${customerId}", documentId="${documentId}"`);
      console.log(`🔍 [AR] 전체 매핑:`, Array.from(arCustomerMappingRef.current.entries()));

      if (customerId && documentId) {
        // 문서 ID 기반 매핑 저장 (더 확실함)
        arDocumentCustomerMappingRef.current.set(documentId, customerId);
        console.log(`🔗 [AR] 문서 ID → 고객 ID 매핑 저장: ${documentId} → ${customerId}`);
        console.log(`⏳ [AR] 문서 처리 완료 대기 시작 (SSE): ${documentId}`);

        // 문서 처리 완료될 때까지 SSE로 대기
        const result = await waitForDocumentProcessing(documentId);

        // 👤 고객명 가져오기
        const customerName = customerNameMappingRef.current.get(customerId);

        if (result.success && result.status === 'completed') {
          // ✅ n8n이 이미 문서-고객 연결을 처리함 (중복 호출 제거)
          console.log(`✅ [AR 자동 연결] 문서 처리 완료 (n8n이 이미 연결 처리함)`);
          addLog('success', `[5/5] AR 처리 최종 완료: ${fileName}`, undefined, customerName);

          // 🚀 고객 연결 완료 직후 백그라운드 파싱 트리거!
          try {
            console.log(`🚀 [AR 백그라운드 파싱] 트리거 시작: ${fileName}, customerId=${customerId}`);
            const bgParseData = await api.post<{ success: boolean; message?: string }>(
              '/api/ar-background/trigger-parsing',
              {
                customer_id: customerId,
                file_id: documentId
              }
            );
            console.log(`✅ [AR 백그라운드 파싱] 트리거 완료:`, bgParseData);
          } catch (bgError) {
            console.error(`❌ [AR 백그라운드 파싱] 트리거 실패:`, bgError);
            errorReporter.reportApiError(bgError as Error, { component: 'DocumentRegistrationView.linkARDocument.triggerParsing' });
          }
        } else if (result.status === 'timeout') {
          console.warn(`⚠️ [AR] 문서 처리 대기 시간 초과`);
          addLog('error', `AR 처리 시간 초과: ${fileName}`, undefined, customerName);
        } else {
          // 🔴 에러 상태: 중복 파일 등의 오류
          console.error(`❌ [AR] 문서 처리 실패:`, result);
          const errorMessage = result.status === 'error' ? '동일한 파일이 이미 등록되어 있습니다.' : `처리 실패: ${result.status}`;
          addLog('error', `AR 처리 실패: ${fileName} - ${errorMessage}`, undefined, customerName);
          errorReporter.reportApiError(new Error(`AR 문서 처리 실패: ${result.status}`), { component: 'DocumentRegistrationView.linkARDocument.result', payload: { documentId, result } })

          // 🔴 파일 상태를 'error'로 변경
          setUploadState(prev => ({
            ...prev,
            files: prev.files.map(f =>
              f.file.name === fileName
                ? { ...f, status: 'error' as UploadStatus, error: errorMessage }
                : f
            )
          }));
        }

        // 매핑에서 제거
        arCustomerMappingRef.current.delete(fileName);
        arMetadataMappingRef.current.delete(fileName);
        arDocumentCustomerMappingRef.current.delete(documentId);
      } else {
        console.warn(`⚠️ [AR] 매핑을 찾을 수 없어서 자동 연결을 건너뜁니다. customerId=${customerId}, documentId=${documentId}`);
      }
    } catch (error) {
      console.error(`❌ [AR] 처리 실패:`, error);
      errorReporter.reportApiError(error as Error, { component: 'DocumentRegistrationView.linkARDocument' });
    }
  }, []);

  /**
   * 업로드 완료 후 CRS DB 플래그 설정 + 문서 처리 완료 대기 후 자동 연결
   */
  const setCustomerReviewFlag = useCallback(async (fileName: string) => {
    // 🔒 중복 실행 방지: 이미 처리 중이면 건너뛰기
    if (!crFilenamesRef.current.has(fileName)) {
      console.log(`⚠️ [CRS] 이미 처리 중이거나 완료된 파일: ${fileName}`);
      return;
    }

    // 🔒 즉시 추적 목록에서 제거 (중복 실행 방지)
    crFilenamesRef.current.delete(fileName);
    console.log(`🔒 [CRS] 추적 목록에서 제거: ${fileName}, 남은 파일: ${crFilenamesRef.current.size}`);

    try {
      // 매핑된 metadata 가져오기
      const metadata = crMetadataMappingRef.current.get(fileName);

      // 🔗 고객 ID 가져오기 (CRS 문서가 처음부터 고객에 연결되도록)
      const customerId = crCustomerMappingRef.current.get(fileName);

      // 👤 고객명 가져오기
      const customerName = customerNameMappingRef.current.get(customerId || '');

      // ⭐ 공유 api 클라이언트 사용 (JWT 토큰 자동 포함)
      const responseData = await api.post<{ success: boolean; document_id?: string }>(
        '/api/documents/set-cr-flag',
        { filename: fileName, metadata, customer_id: customerId }
      );
      console.log(`✅ [CRS] is_customer_review=true 설정 완료 (metadata 포함):`, responseData);

      // 🔗 문서 처리 완료 대기 후 자동 연결
      const documentId = responseData.document_id;

      console.log(`🔍 [CRS] 매핑 조회: fileName="${fileName}", customerId="${customerId}", documentId="${documentId}"`);

      if (customerId && documentId) {
        console.log(`⏳ [CRS] 문서 처리 완료 대기 시작 (SSE): ${documentId}`);

        // 문서 처리 완료될 때까지 SSE로 대기
        const result = await waitForDocumentProcessing(documentId);

        if (result.success && result.status === 'completed') {
          console.log(`✅ [CRS 자동 연결] 문서 처리 완료`);
          addLog('success', `[5/5] CRS 처리 최종 완료: ${fileName}`, undefined, customerName);

          // 🚀 고객 연결 완료 직후 백그라운드 파싱 트리거
          try {
            console.log(`🚀 [CRS 백그라운드 파싱] 트리거 시작: ${fileName}, customerId=${customerId}`);
            const bgParseData = await api.post<{ success: boolean; message?: string }>(
              '/api/cr-background/trigger-parsing',
              {
                customer_id: customerId,
                file_id: documentId
              }
            );
            console.log(`✅ [CRS 백그라운드 파싱] 트리거 완료:`, bgParseData);
          } catch (bgError) {
            console.error(`❌ [CRS 백그라운드 파싱] 트리거 실패:`, bgError);
            errorReporter.reportApiError(bgError as Error, { component: 'DocumentRegistrationView.setCustomerReviewFlag.triggerParsing' });
          }
        } else if (result.status === 'timeout') {
          console.warn(`⚠️ [CRS] 문서 처리 대기 시간 초과`);
        } else {
          console.error(`❌ [CRS] 문서 처리 실패:`, result);
          errorReporter.reportApiError(new Error(`CRS 문서 처리 실패: ${result.status}`), { component: 'DocumentRegistrationView.setCustomerReviewFlag.result', payload: { documentId, result } });
        }
      } else {
        console.warn(`⚠️ [CRS] 매핑을 찾을 수 없어서 자동 연결을 건너뜁니다. customerId=${customerId}, documentId=${documentId}`);
      }

      // 매핑에서 제거
      crCustomerMappingRef.current.delete(fileName);
      crMetadataMappingRef.current.delete(fileName);
    } catch (error) {
      console.error(`❌ [CRS] 처리 실패:`, error);
      errorReporter.reportApiError(error as Error, { component: 'DocumentRegistrationView.setCustomerReviewFlag' });
    }
  }, [addLog]);

  /**
   * 고객 파일 등록 탭에서 업로드된 문서를 고객에게 자동 연결
   */
  const linkCustomerFile = useCallback(async (fileName: string) => {
    const customerFileInfo = customerFileUploadMappingRef.current.get(fileName);
    if (!customerFileInfo) {
      console.log(`⚠️ [고객 파일 자동 연결] 추적 정보 없음: ${fileName}`);
      return;
    }

    console.log(`🔗 [고객 파일 자동 연결] 시작: ${fileName} → 고객: ${customerFileInfo.customerName}`);

    try {
      // 1. 파일명으로 문서 조회 (캐시 사용으로 중복 호출 방지)
      const searchData = await cachedRequest(
        'documents-list-100',
        () => api.get<{ success: boolean; data: { documents: Document[] } }>(`/api/documents?limit=100`, { timeout: API_CONFIG.TIMEOUT_LONG }),
        3000 // 3초 캐시 (업로드 중 빠른 갱신 필요)
      );

      if (!searchData.success || !searchData.data || !searchData.data.documents) {
        console.warn(`⚠️ [고객 파일 자동 연결] 문서 목록 조회 실패`);
        return;
      }

      const document = searchData.data.documents.find((doc: Document) => doc.filename === fileName);
      if (!document) {
        console.warn(`⚠️ [고객 파일 자동 연결] 문서를 찾을 수 없음: ${fileName}`);
        return;
      }

      const documentId = document._id;
      if (!documentId) {
        console.warn(`⚠️ [고객 파일 자동 연결] 문서 ID가 없음: ${fileName}`);
        return;
      }

      console.log(`🔍 [고객 파일 자동 연결] 문서 ID 확인: ${fileName} → ${documentId}`);

      // 2. 문서 처리 완료 대기 (SSE)
      console.log(`⏳ [고객 파일 자동 연결] 문서 처리 완료 대기 시작 (SSE): ${documentId}`);
      const result = await waitForDocumentProcessing(documentId);

      if (result.success && result.status === 'completed') {
        // ✅ n8n이 이미 문서-고객 연결을 처리함 (중복 호출 제거)
        console.log(`✅ [고객 파일 자동 연결] 문서 처리 완료 (n8n이 이미 연결 처리함)`);
        addLog('success', `[4/4] 문서 처리 완료: ${fileName}`, undefined, customerFileInfo.customerName);

        // 🏷️ 문서 유형 자동 분류 호출
        try {
          console.log(`🏷️ [자동 분류] 호출 시작: ${documentId}`);
          const classifyResult = await autoClassifyDocument(documentId, true);
          if (classifyResult.autoApplied && classifyResult.type) {
            console.log(`✅ [자동 분류] 자동 적용됨: ${classifyResult.type} (신뢰도: ${classifyResult.confidence})`);
          } else if (classifyResult.suggestedType) {
            console.log(`💡 [자동 분류] 제안됨: ${classifyResult.suggestedType} (신뢰도: ${classifyResult.confidence})`);
          }
        } catch (classifyError) {
          console.warn(`⚠️ [자동 분류] 실패:`, classifyError);
        }

        // 🔔 SSE 알림 트리거: 문서-고객 연결 완료 알림
        try {
          const API_BASE_URL = import.meta.env['VITE_API_BASE_URL'] || '';
          // 🔒 보안: getAuthToken()으로 토큰 통합 관리 (v1/v2 호환)
          const token = getAuthToken();
          if (token) {
            fetch(`${API_BASE_URL}/api/notify/document-uploaded`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                customerId: customerFileInfo.customerId,
                documentId: documentId,
                documentName: fileName
              })
            }).then(() => {
              console.log(`🔔 [SSE] 문서 연결 알림 전송 완료: ${fileName} → ${customerFileInfo.customerName}`);
            }).catch(err => {
              console.warn(`⚠️ [SSE] 문서 연결 알림 전송 실패:`, err);
            });
          }
        } catch (e) {
          console.warn(`⚠️ [SSE] 알림 전송 중 오류:`, e);
        }
      } else if (result.status === 'timeout') {
        console.warn(`⚠️ [고객 파일 자동 연결] 문서 처리 대기 시간 초과: ${fileName}`);
        addLog('warning', `문서 자동 연결 시간 초과: ${fileName}`, '처리가 지연되고 있습니다. 나중에 수동으로 연결해주세요.', customerFileInfo.customerName);
      } else {
        console.error(`❌ [고객 파일 자동 연결] 문서 처리 실패:`, result);
        errorReporter.reportApiError(new Error(`고객 파일 자동 연결 실패: ${result.status}`), { component: 'DocumentRegistrationView.linkCustomerFile.result', payload: { fileName, result } })
      }

      // 추적 목록에서 제거
      customerFileUploadMappingRef.current.delete(fileName);
    } catch (error) {
      console.error(`❌ [고객 파일 자동 연결] 처리 실패:`, error);
      errorReporter.reportApiError(error as Error, { component: 'DocumentRegistrationView.linkCustomerFile' });
      addLog('error', `문서 자동 연결 실패: ${fileName}`, error instanceof Error ? error.message : String(error), customerFileInfo.customerName);
    }
  }, [addLog]);

  /**
   * 일반 문서 백그라운드 처리 완료 확인 (SSE)
   */
  const checkNormalDocumentCompletion = useCallback(async (fileName: string) => {
    try {
      // 1. 파일명으로 문서 조회 (캐시 사용으로 중복 호출 방지)
      const searchData = await cachedRequest(
        'documents-list-100',
        () => api.get<{ success: boolean; data: { documents: Document[] } }>(`/api/documents?limit=100`, { timeout: API_CONFIG.TIMEOUT_LONG }),
        3000 // 3초 캐시 (업로드 중 빠른 갱신 필요)
      );

      if (!searchData.success || !searchData.data || !searchData.data.documents) {
        console.warn(`⚠️ [일반 문서] 문서 목록 조회 실패`);
        return;
      }

      // 파일명으로 문서 찾기 (filename 필드 사용)
      const document = searchData.data.documents.find((doc: Document) => doc.filename === fileName);
      if (!document) {
        console.warn(`⚠️ [일반 문서] 문서를 찾을 수 없음: ${fileName}`);
        return;
      }

      const documentId = document._id;
      if (!documentId) {
        console.warn(`⚠️ [일반 문서] 문서 ID가 없음: ${fileName}`);
        return;
      }
      console.log(`🔍 [일반 문서] 문서 ID 확인: ${fileName} → ${documentId}`);

      // 매핑에 추가
      normalDocumentMappingRef.current.set(fileName, documentId);

      // 2. overallStatus가 completed가 될 때까지 SSE 대기
      console.log(`⏳ [일반 문서] 문서 처리 완료 대기 시작 (SSE): ${documentId}`);
      const result = await waitForDocumentProcessing(documentId);

      if (result.success && result.status === 'completed') {
        console.log(`✅ [일반 문서] 백그라운드 처리 완료: ${fileName}`);
        addLog('success', `[4/4] 백그라운드 처리 완료 - 일반 문서 처리 최종 완료: ${fileName}`);

        // 🏷️ 문서 유형 자동 분류 호출
        try {
          console.log(`🏷️ [자동 분류] 호출 시작: ${documentId}`);
          const classifyResult = await autoClassifyDocument(documentId, true);
          if (classifyResult.autoApplied && classifyResult.type) {
            console.log(`✅ [자동 분류] 자동 적용됨: ${classifyResult.type} (신뢰도: ${classifyResult.confidence})`);
          } else if (classifyResult.suggestedType) {
            console.log(`💡 [자동 분류] 제안됨: ${classifyResult.suggestedType} (신뢰도: ${classifyResult.confidence})`);
          }
        } catch (classifyError) {
          console.warn(`⚠️ [자동 분류] 실패:`, classifyError);
        }
      } else if (result.status === 'timeout') {
        console.warn(`⚠️ [일반 문서] 처리 대기 시간 초과: ${fileName}`);
        addLog('warning', `백그라운드 처리 시간 초과: ${fileName}`, '처리가 지연되고 있습니다. 나중에 확인해주세요.');
      } else {
        console.error(`❌ [일반 문서] 처리 실패:`, result);
        errorReporter.reportApiError(new Error(`일반 문서 처리 실패: ${result.status}`), { component: 'DocumentRegistrationView.checkNormalDocumentCompletion.result', payload: { fileName, result } })
      }

      // 매핑에서 제거
      normalDocumentMappingRef.current.delete(fileName);
    } catch (error) {
      console.error(`❌ [일반 문서] 처리 실패:`, error);
      errorReporter.reportApiError(error as Error, { component: 'DocumentRegistrationView.checkNormalDocumentCompletion' });
    }
  }, [addLog]);

  /**
   * 업로드 상태 변경 콜백
   */
  const handleStatusChange = useCallback((fileId: string, status: UploadStatus, error?: string, retryable?: boolean) => {
    console.log(`🔍 [handleStatusChange] fileId=${fileId}, status=${status}`);

    // 🔍 상태 업데이트 전에 파일 정보 미리 찾기
    const currentFile = uploadState.files.find(f => f.id === fileId);

    setUploadState(prev => {
      // 🚀 Single-pass: map + count를 한 번에 (기존 map + 2 filter + reduce = 4회 순회 → 1회)
      let newCompletedCount = 0
      let uploadingCount = 0
      let progressSum = 0

      const updatedFiles = prev.files.map(f => {
        let result = f
        if (f.id === fileId) {
          result = { ...f, status, error, retryable }

          if (status === 'completed' || status === 'warning') {
            result.completedAt = new Date()
            result.progress = 100

            // 🏷️ Annual Report 파일이면 DB 플래그 설정 및 고객 자동 연결
            if (status === 'completed' && arFilenamesRef.current.has(f.file.name)) {
              const fileName = f.file.name;
              setTimeout(() => setAnnualReportFlag(fileName), 0);
            }

            // 🏷️ Customer Review 파일이면 DB 플래그 설정 및 고객 자동 연결
            if (status === 'completed' && crFilenamesRef.current.has(f.file.name)) {
              const fileName = f.file.name;
              setTimeout(() => setCustomerReviewFlag(fileName), 0);
            }
          }
        }

        // Single-pass counting
        if (result.status === 'completed' || result.status === 'warning') {
          newCompletedCount++
          progressSum += 100
        } else {
          progressSum += result.progress
        }
        if (result.status === 'uploading') uploadingCount++

        return result
      })

      return {
        ...prev,
        files: updatedFiles,
        uploading: uploadingCount > 0,
        totalProgress: updatedFiles.length > 0 ? Math.round(progressSum / updatedFiles.length) : 0,
        completedCount: newCompletedCount,
      }
    })

    // ✅ 로그는 상태 업데이트 함수 밖에서 호출 (부작용 제거)
    if (currentFile) {
      // 👤 AR/CRS 파일이면 고객명 가져오기
      const arCustomerId = arCustomerMappingRef.current.get(currentFile.file.name);
      const crCustomerId = crCustomerMappingRef.current.get(currentFile.file.name);
      const customerId = arCustomerId || crCustomerId;
      const customerName = customerId ? customerNameMappingRef.current.get(customerId) : undefined;

      // AR/CRS 파일 여부 확인
      const isArFile = arFilenamesRef.current.has(currentFile.file.name);
      const isCrFile = crFilenamesRef.current.has(currentFile.file.name);

      if (status === 'uploading') {
        // AR/CRS 파일이면 특수 단계 표시, 일반 파일이면 일반 단계 표시
        if (isArFile) {
          addLog('info', `[4/5] 문서 업로드 중: ${currentFile.file.name}`, undefined, customerName)
        } else if (isCrFile) {
          addLog('info', `[4/5] 문서 업로드 중: ${currentFile.file.name}`, undefined, customerName)
        } else {
          addLog('info', `[2/4] 문서 업로드 중: ${currentFile.file.name}`, undefined, customerName)
        }
      } else if (status === 'completed') {
        // AR/CRS 파일이면 특수 단계 표시, 일반 파일이면 일반 단계 표시
        if (isArFile) {
          addLog('success', `[4/5] 문서 업로드 완료: ${currentFile.file.name}`, undefined, customerName)
          addLog('ar-detect', `AR 문서 처리 중: ${currentFile.file.name}`, '고객 자동 연결 대기 중...', customerName)
        } else if (isCrFile) {
          addLog('success', `[4/5] 문서 업로드 완료: ${currentFile.file.name}`, undefined, customerName)
          addLog('cr-detect', `CRS 문서 처리 중: ${currentFile.file.name}`, '고객 자동 연결 대기 중...', customerName)
        } else {
          // 🔗 고객 파일 등록 탭에서 업로드된 파일인지 확인
          const isCustomerFile = customerFileUploadMappingRef.current.has(currentFile.file.name);

          if (isCustomerFile) {
            // 고객 파일 등록 - 자동 연결 시작
            const customerFileInfo = customerFileUploadMappingRef.current.get(currentFile.file.name);
            addLog('success', `[3/4] 문서 업로드 완료: ${currentFile.file.name}`, '메타데이터 추출 및 임베딩 진행 중...', customerFileInfo?.customerName)

            console.log(`🔗 [고객 파일 자동 연결] linkCustomerFile 호출 예약: ${currentFile.file.name}`);
            setTimeout(() => {
              console.log(`🔗 [고객 파일 자동 연결] linkCustomerFile 호출: ${currentFile.file.name}`);
              linkCustomerFile(currentFile.file.name);
            }, 1000);
          } else {
            // 일반 문서 - 백그라운드 처리 완료 확인
            addLog('success', `[3/4] 문서 업로드 완료: ${currentFile.file.name}`, '메타데이터 추출 및 임베딩 진행 중...', customerName)

            // ✅ 일반 문서도 백그라운드 처리 완료 확인 시작
            console.log(`🚀 [일반 문서] 백그라운드 처리 확인 시작: ${currentFile.file.name}`);
            // 파일명으로부터 문서 ID를 얻어야 하므로 약간의 딜레이 후 polling 시작
            setTimeout(() => {
              console.log(`🔍 [일반 문서] checkNormalDocumentCompletion 호출: ${currentFile.file.name}`);
              checkNormalDocumentCompletion(currentFile.file.name);
            }, 1000);
          }
        }
      } else if (status === 'error') {
        addLog('error', `업로드 실패: ${currentFile.file.name}`, error, customerName)
      } else if (status === 'warning') {
        addLog('warning', `업로드 경고: ${currentFile.file.name}`, error, customerName)
      }
    }
  }, [uploadState.files, setAnnualReportFlag, setCustomerReviewFlag, addLog, linkCustomerFile, checkNormalDocumentCompletion])

  /**
   * 업로드 서비스 콜백 설정 - useRef로 안정적인 참조 유지
   */
  const handleProgressRef = useRef(handleProgress)
  const handleStatusChangeRef = useRef(handleStatusChange)

  // 최신 콜백 함수를 ref에 저장
  handleProgressRef.current = handleProgress
  handleStatusChangeRef.current = handleStatusChange

  useEffect(() => {
    // 안정적인 래퍼 함수 사용
    const stableProgressCallback = (event: UploadProgressEvent) => {
      handleProgressRef.current(event)
    }

    const stableStatusCallback = (fileId: string, status: UploadStatus, error?: string, retryable?: boolean) => {
      handleStatusChangeRef.current(fileId, status, error, retryable)
    }

    const unsubscribeProgress = uploadService.setProgressCallback(stableProgressCallback, 'DocumentRegistrationView')
    const unsubscribeStatus = uploadService.setStatusCallback(stableStatusCallback, 'DocumentRegistrationView')

    return () => {
      unsubscribeProgress()
      unsubscribeStatus()
    }
  }, [])

  /**
   * 개발 환경에서 업로드 중 페이지 이탈 경고
   */
  useEffect(() => {
    if (uploadState.uploading) {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault()
        e.returnValue = '업로드가 진행 중입니다. 페이지를 떠나면 업로드가 취소됩니다.'
        return e.returnValue
      }

      window.addEventListener('beforeunload', handleBeforeUnload)

      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload)
      }
    }
    return undefined
  }, [uploadState.uploading])

  /**
   * 업로드 완료 시 자동 정리 (선택적)
   */
  useEffect(() => {
    const allCompleted = uploadState.files.length > 0 &&
      uploadState.files.every(f => f.status === 'completed' || f.status === 'warning' || f.status === 'error')
    const hasSuccessfulUploads = uploadState.files.some(f => f.status === 'completed' || f.status === 'warning')

    // 모든 업로드 완료 후 5분 뒤 자동 정리 (사용자가 수동으로 정리하지 않은 경우)
    if (allCompleted && hasSuccessfulUploads && !uploadState.uploading) {
      const autoCleanupTimer = setTimeout(() => {
        try {
          sessionStorage.removeItem(SESSION_KEY)
          if (import.meta.env.DEV) {
            console.log('[DocumentRegistrationView] Auto-cleanup completed upload state')
          }
        } catch (error) {
          console.warn('[DocumentRegistrationView] Failed to auto-clear state:', error)
          errorReporter.reportApiError(error as Error, { component: 'DocumentRegistrationView.autoClearState' })
        }
      }, 5 * 60 * 1000) // 5분

      return () => clearTimeout(autoCleanupTimer)
    }
    return undefined
  }, [uploadState, SESSION_KEY])


  /**
   * 파일 선택 옵션
   * - AR/CRS 모드: PDF만 허용 (강제)
   * - 일반 모드: 모든 파일 허용
   */
  const fileSelectionOptions = useMemo(() => ({
    multiple: true,
    directory: true,
    maxFileCount: uploadConfig.limits.maxFileCount,
    // AR/CRS 모드에서는 PDF만 허용
    accept: (documentTypeMode === 'annual_report' || documentTypeMode === 'customer_review')
      ? 'application/pdf,.pdf'
      : undefined
  }), [documentTypeMode])

  /**
   * 통계 계산
   */
  const stats = useMemo(() => {
    const total = uploadState.files.length
    const completed = uploadState.files.filter(f => f.status === 'completed' || f.status === 'warning').length
    const errors = uploadState.files.filter(f => f.status === 'error').length
    const uploading = uploadState.files.filter(f => f.status === 'uploading').length

    return { total, completed, errors, uploading }
  }, [uploadState.files])

  /**
   * 업로드 완료 시 uploading 상태 자동 해제
   */
  useEffect(() => {
    // 업로드 중인 파일이 없는데 uploading 상태가 true면 false로 변경
    if (uploadState.uploading && stats.uploading === 0 && uploadState.files.length > 0) {
      setUploadState(prev => ({ ...prev, uploading: false }))
    }
  }, [stats.uploading, uploadState.uploading, uploadState.files.length])

  /**
   * 🔴 고객 변경 시 상태 초기화
   * 고객이 변경되면(해제 또는 다른 고객 선택) 로그 영역을 숨기고 드래그존이 표시되도록 함
   */
  useEffect(() => {
    const currentCustomerId = customerFileCustomer?._id ?? null
    const prevCustomerId = prevCustomerIdRef.current

    // 고객이 변경되었으면 상태 초기화
    if (prevCustomerId !== null && currentCustomerId !== prevCustomerId) {
      console.log('[DocumentRegistrationView] 🔄 고객 변경 감지, 상태 초기화:', prevCustomerId, '→', currentCustomerId)
      setIsLogVisible(false)
      setProcessingLogs([])
      setUploadState({
        uploading: false,
        files: [],
        totalProgress: 0,
        completedCount: 0,
        errors: [],
        context: {
          identifierType: 'userId',
          identifierValue: localStorage.getItem('aims-current-user-id') || 'tester'
        }
      })
    }

    // 현재 고객 ID를 이전 값으로 저장
    prevCustomerIdRef.current = currentCustomerId
  }, [customerFileCustomer])

  // 🎯 AR 큐에서 다음 파일 처리
  const processNextArFile = useCallback(() => {
    if (pendingArFilesQueueRef.current.length > 0) {
      const nextArFile = pendingArFilesQueueRef.current.shift()!;
      console.log('[DocumentRegistrationView] 🎯 AR 큐 다음 파일 처리:', nextArFile.file.name, '(남은 파일:', pendingArFilesQueueRef.current.length, '개)');
      setArCustomerSelectionState({
        isOpen: true,
        arFile: nextArFile.file,
        arMetadata: nextArFile.arMetadata,
        matchingCustomers: nextArFile.matchingCustomers,
        fileId: nextArFile.fileId,
        existingHashes: nextArFile.existingHashes,
        newlyCreatedCustomerId: null,
      });
    } else {
      console.log('[DocumentRegistrationView] 🎯 AR 큐 처리 완료 (모든 파일 처리됨)');
    }
  }, []);

  // 🎯 AR 고객 선택 완료 핸들러
  const handleArCustomerSelected = useCallback(async (customerId: string) => {
    const { arFile, arMetadata, fileId } = arCustomerSelectionState;

    if (!arFile || !arMetadata) {
      console.error('[DocumentRegistrationView] AR 파일 또는 메타데이터 없음');
      return;
    }

    // 모달 닫기 + newlyCreatedCustomerId 초기화
    setArCustomerSelectionState(prev => ({ ...prev, isOpen: false, newlyCreatedCustomerId: null }));

    // 선택된 고객 정보 조회
    const selectedCustomer = arCustomerSelectionState.matchingCustomers.find(c => c._id === customerId);
    const customerName = selectedCustomer?.personal_info?.name || arMetadata.customer_name;

    addLog('success', `[3/5] 기존 고객 선택: ${customerName}`);

    // AR 등록 처리
    try {
      const processResult = await processAnnualReportFile(arFile, customerId, arMetadata.issue_date);

      if (processResult.isDuplicateDoc) {
        addLog('warning', `🔴 중복 파일 건너뜀: ${arFile.name}`, '이미 등록된 파일입니다.');
        updateFileStatusByFile(arFile, 'skipped', '중복 파일 - 이미 등록됨');
        // 🎯 다음 AR 파일 처리
        processNextArFile();
        return;
      }

      if (processResult.isDuplicateIssueDate) {
        const formattedDate = formatIssueDateKorean(processResult.duplicateIssueDate);
        addLog(
          'warning',
          `🔴 ${formattedDate} 발행일 보고서 이미 존재`,
          `${arFile.name} 업로드를 건너뜁니다.`
        );
        updateFileStatusByFile(arFile, 'skipped', `${formattedDate} 발행일 보고서 이미 존재`);
        // 🎯 다음 AR 파일 처리
        processNextArFile();
        return;
      }

      const result = await registerArDocument(arFile, customerId, arMetadata.issue_date, {
        addLog,
        generateFileId: () => fileId,
        addToUploadQueue: (uploadFile) => {
          // 기존 파일의 상태만 업데이트 (중복 추가 방지)
          updateFileStatusByFile(arFile, 'pending');
          // 🚀 실제 업로드 시작! (uploadService에 큐잉)
          uploadService.queueFiles([{ ...uploadFile, id: fileId, batchId: getBatchId() || undefined }]);
        },
        trackArFile: (fileName, custId) => {
          arFilenamesRef.current.add(fileName);
          arCustomerMappingRef.current.set(fileName, custId);
          arMetadataMappingRef.current.set(fileName, arMetadata);
          customerNameMappingRef.current.set(custId, customerName);
        }
      });

      if (result.success) {
        console.log('[DocumentRegistrationView] AR 문서 등록 성공 (모달 선택):', arFile.name);
        arProcessedCountRef.current += 1;
      }
      // 🎯 다음 AR 파일 처리 (성공 여부와 관계없이)
      processNextArFile();
    } catch (error) {
      console.error('[DocumentRegistrationView] AR 등록 실패:', error);
      addLog('error', `AR 등록 실패: ${arFile.name}`, String(error));
      updateFileStatusByFile(arFile, 'error', 'AR 등록 실패');
      // 🎯 다음 AR 파일 처리
      processNextArFile();
    }
  }, [arCustomerSelectionState, addLog, updateFileStatusByFile, processNextArFile]);

  // 🎯 새 고객 등록 모달 열기 (고객 선택 모달 위에 레이어로 띄움)
  const handleArCreateNewCustomer = useCallback(() => {
    // 고객 선택 모달은 열어둔 채로 새 고객 모달을 위에 띄움
    setShowNewCustomerModal(true);
  }, []);

  // 🎯 새 고객 등록 완료 핸들러
  // 새 고객 생성 후 → 목록에 추가 → 자동 선택 (고객 선택 모달은 이미 열려있음)
  const handleNewCustomerCreated = useCallback(async (customerId: string, customerName: string, customerType: string) => {
    // 새 고객 객체 생성 (목록에 추가할 용도)
    const newCustomer: Customer = {
      _id: customerId,
      personal_info: {
        name: customerName,
      },
      insurance_info: {
        customer_type: customerType as '개인' | '법인',
      },
      meta: {
        status: "active" as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      contracts: [],
      documents: [],
      consultations: [],
      tags: [],
    };

    addLog('success', `새 고객 등록 완료: ${customerName} (${customerType})`);

    // 새 고객 입력 모달 닫기 (고객 선택 모달은 이미 열려있음)
    setShowNewCustomerModal(false);

    // 목록에 새 고객 추가 + 자동 선택
    setArCustomerSelectionState(prev => ({
      ...prev,
      matchingCustomers: [newCustomer, ...prev.matchingCustomers],
      newlyCreatedCustomerId: customerId,
    }));
  }, [addLog]);

  // 🎯 새 고객 등록 모달에서 취소 (고객 선택 모달은 이미 열려있음)
  const handleNewCustomerBack = useCallback(() => {
    setShowNewCustomerModal(false);
  }, []);

  // ===========================================
  // 🎯 CRS 고객 선택 핸들러 (AR과 동일한 패턴)
  // ===========================================

  // 🎯 CRS 기존 고객 선택 핸들러
  const handleCrCustomerSelected = useCallback(async (customerId: string) => {
    const { crFile, crMetadata, fileId } = crCustomerSelectionState;

    if (!crFile || !crMetadata) {
      console.error('[DocumentRegistrationView] CRS 파일 또는 메타데이터 없음');
      return;
    }

    // 모달 닫기
    setCrCustomerSelectionState(prev => ({ ...prev, isOpen: false }));

    // 선택된 고객 정보 조회
    const selectedCustomer = crCustomerSelectionState.matchingCustomers.find(c => c._id === customerId);
    const customerName = selectedCustomer?.personal_info?.name || crMetadata.contractor_name || '알 수 없음';

    addLog('success', `[4/5] 기존 고객 선택: ${customerName}`);

    // CRS 파일 추적 등록 및 업로드 큐 추가
    crFilenamesRef.current.add(crFile.name);
    crCustomerMappingRef.current.set(crFile.name, customerId);
    crMetadataMappingRef.current.set(crFile.name, crMetadata);
    customerNameMappingRef.current.set(customerId, customerName);

    const uploadFile: UploadFile = {
      id: fileId,
      file: crFile,
      fileSize: crFile.size,
      status: 'pending',
      progress: 0,
      error: undefined,
      completedAt: undefined,
      batchId: getBatchId() || undefined,
    };

    updateFileStatusByFile(crFile, 'pending');
    uploadService.queueFiles([uploadFile]);

    addLog(
      'cr-auto',
      `CRS 자동 등록: ${crFile.name}`,
      `고객: ${customerName}`
    );

    console.log('[DocumentRegistrationView] CRS 문서 업로드 시작 (모달 선택):', crFile.name);
  }, [crCustomerSelectionState, addLog, updateFileStatusByFile]);

  // 🎯 CRS 새 고객 등록 모달 열기
  const handleCrCreateNewCustomer = useCallback(() => {
    setCrCustomerSelectionState(prev => ({ ...prev, isOpen: false }));
    setShowNewCustomerModalForCR(true);
  }, []);

  // 🎯 CRS 새 고객 등록 완료 핸들러
  const handleNewCustomerCreatedForCR = useCallback(async (customerId: string, customerName: string) => {
    const { crFile, crMetadata, fileId } = crCustomerSelectionState;

    // 모달 닫기
    setShowNewCustomerModalForCR(false);

    if (!crFile || !crMetadata) {
      console.error('[DocumentRegistrationView] CRS 파일 또는 메타데이터 없음');
      return;
    }

    addLog('success', `[4/5] 새 고객 등록 완료: ${customerName}`);

    // CRS 파일 추적 등록 및 업로드 큐 추가
    crFilenamesRef.current.add(crFile.name);
    crCustomerMappingRef.current.set(crFile.name, customerId);
    crMetadataMappingRef.current.set(crFile.name, crMetadata);
    customerNameMappingRef.current.set(customerId, customerName);

    const uploadFile: UploadFile = {
      id: fileId,
      file: crFile,
      fileSize: crFile.size,
      status: 'pending',
      progress: 0,
      error: undefined,
      completedAt: undefined,
      batchId: getBatchId() || undefined,
    };

    updateFileStatusByFile(crFile, 'pending');
    uploadService.queueFiles([uploadFile]);

    addLog(
      'cr-auto',
      `CRS 자동 등록: ${crFile.name}`,
      `고객: ${customerName}`
    );

    console.log('[DocumentRegistrationView] CRS 문서 업로드 시작 (새 고객):', crFile.name);
  }, [crCustomerSelectionState, addLog, updateFileStatusByFile]);

  // 🎯 CRS 새 고객 등록 모달에서 뒤로가기
  const handleNewCustomerBackForCR = useCallback(() => {
    setShowNewCustomerModalForCR(false);
    setCrCustomerSelectionState(prev => ({ ...prev, isOpen: true }));
  }, []);

  // 제목에 진행 상태 표시
  const getTitle = () => {
    if (uploadState.uploading) {
      return `문서 등록 (업로드 중... ${stats.completed}/${stats.total})`
    }
    if (stats.total > 0 && !uploadState.uploading) {
      return `문서 등록 (${stats.completed}/${stats.total} 완료)`
    }
    return "고객·계약·문서 등록"
  }

  return (
    <CenterPaneView
      visible={visible}
      title={getTitle()}
      titleIcon={<SFSymbol name="doc-badge-plus" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} style={{ color: 'var(--color-icon-doc-register)' }} />}
      onClose={onClose}
      marginTop={4}
      marginBottom={4}
      marginLeft={4}
      marginRight={4}
      className="document-registration-view"
      placeholderIcon="doc.badge.plus"
      placeholderMessage="문서를 업로드하여 시스템에 등록할 수 있습니다"
      description={documentTypeMode === 'normal' ? "고객을 선택하고 고객의 문서들을 등록합니다." : documentTypeMode === 'customer_review' ? "Customer Review로 고객과 변액 정보를 자동 등록합니다." : "Annual Report로 고객과 계약을 자동 등록합니다."}
      titleAccessory={
        <Tooltip content="도움말" placement="bottom">
          <button
            type="button"
            className="help-icon-button"
            onClick={() => setHelpModalVisible(true)}
            aria-label="도움말"
          >
            <SFSymbol name="questionmark.circle" size={SFSymbolSize.BODY} weight={SFSymbolWeight.REGULAR} />
          </button>
        </Tooltip>
      }
    >
      <div className="document-registration-content">
        {/* 🎯 Step 0: 문서 유형 선택 (AR은 고객 선택 불필요) */}
        {!isLogVisible && (
          <div className="document-type-selection">
            <div className="document-type-selection__buttons">
              <button
                type="button"
                className={`document-type-card ${documentTypeMode === 'annual_report' ? 'document-type-card--selected' : ''}`}
                onClick={() => setDocumentTypeMode('annual_report')}
              >
                <svg className="document-type-card__icon document-type-card__icon--green" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M3 3V21H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M7 16L12 11L15 14L21 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M17 8H21V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="document-type-card__label">Annual Report</span>
              </button>
              <button
                type="button"
                className={`document-type-card ${documentTypeMode === 'customer_review' ? 'document-type-card--selected' : ''}`}
                onClick={() => setDocumentTypeMode('customer_review')}
              >
                <svg className="document-type-card__icon document-type-card__icon--purple" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="document-type-card__label">Customer Review</span>
              </button>
              <button
                type="button"
                className={`document-type-card ${documentTypeMode === 'normal' ? 'document-type-card--selected' : ''}`}
                onClick={() => setDocumentTypeMode('normal')}
              >
                <svg className="document-type-card__icon document-type-card__icon--orange" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M14 2V8H20M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="document-type-card__label">일반 문서</span>
              </button>
            </div>
          </div>
        )}

        {/* 🍎 등록 방법 안내 - 문서 유형 선택 후에만 표시 */}
        {documentTypeMode && !isLogVisible && (
          <div className={`registration-guide ${isGuideExpanded ? 'registration-guide--expanded' : 'registration-guide--collapsed'}`}>
            <button
              type="button"
              className="registration-guide__toggle"
              onClick={toggleGuide}
              aria-expanded={isGuideExpanded}
              aria-label={isGuideExpanded ? '도움말 접기' : '도움말 펼치기'}
            >
              <div className="guide-header">
                <div className="guide-icon">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path className="lightbulb-bulb" d="M12 3C8.68629 3 6 5.68629 6 9C6 11.4363 7.4152 13.5392 9.42857 14.3572V17C9.42857 17.5523 9.87629 18 10.4286 18H13.5714C14.1237 18 14.5714 17.5523 14.5714 17V14.3572C16.5848 13.5392 18 11.4363 18 9C18 5.68629 15.3137 3 12 3Z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path className="lightbulb-base" d="M9 18H15M10 21H14" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h3 className="guide-title">
                  {documentTypeMode === 'annual_report' ? 'AR 등록 방법' : documentTypeMode === 'customer_review' ? 'CRS 등록 방법' : '문서 등록 방법'}
                </h3>
                <span className="guide-toggle-icon" aria-hidden="true">
                  {isGuideExpanded ? '▲' : '▼'}
                </span>
              </div>
            </button>

            {isGuideExpanded && (
              <div className="guide-content">
                <div className="guide-section">
                  {documentTypeMode === 'annual_report' ? (
                    <p className="step-description">고객의 Annual Report PDF 파일을 업로드해주세요.</p>
                  ) : documentTypeMode === 'customer_review' ? (
                    <p className="step-description">고객의 Customer Review PDF 파일을 업로드해주세요.</p>
                  ) : (
                    <>
                      <div className="guide-step">
                        <span className="step-number">1</span>
                        <div className="step-content">
                          <h4 className="step-title">고객 선택하기 (선택)</h4>
                          <p className="step-description">• 고객을 선택하면 해당 고객의 문서로 등록됩니다</p>
                          <p className="step-description">• 미선택 시 나중에 전체 문서 보기에서 연결할 수 있습니다</p>
                        </div>
                      </div>
                      <div className="guide-step">
                        <span className="step-number">2</span>
                        <div className="step-content">
                          <h4 className="step-title">파일 올리기</h4>
                          <p className="step-description">• 파일을 끌어다 놓거나 클릭하여 업로드하세요</p>
                          <p className="step-description">• 고객 선택 시 해당 고객에게 자동 연결됩니다</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 🎯 [일반 문서] 고객 선택 영역 - 일반 문서일 때만 표시 */}
        {documentTypeMode === 'normal' && !isLogVisible && (
          <div className="customer-info-section customer-info-section--always-expanded">
            <div className="customer-info-content">
              <CustomerFileUploadArea
                selectedCustomer={customerFileCustomer}
                onCustomerSelect={setCustomerFileCustomer}
                disabled={false}
                showResetButton={isLogVisible && uploadState.files.length > 0}
                onReset={() => {
                  // 초기 상태로 되돌리기 (새 문서 등록 버튼과 동일)
                  setProcessingLogs([])
                  setUploadState({
                    uploading: false,
                    files: [],
                    totalProgress: 0,
                    completedCount: 0,
                    errors: [],
                    context: {
                      identifierType: 'userId',
                      identifierValue: localStorage.getItem('aims-current-user-id') || 'tester'
                    }
                  })
                  setIsLogVisible(false)
                  setCustomerFileCustomer(null)
                }}
              />
            </div>
          </div>
        )}

        {/* 🎯 AR 파일 미발견 경고 메시지 */}
        {documentTypeMode === 'annual_report' && noArFoundWarning && !isLogVisible && (
          <div className="no-ar-warning">
            <div className="no-ar-warning__icon">⚠️</div>
            <div className="no-ar-warning__message">{noArFoundWarning}</div>
            <button
              type="button"
              className="no-ar-warning__close"
              onClick={() => setNoArFoundWarning(null)}
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
        )}

        {/* 🎯 CRS 파일 미발견 경고 메시지 */}
        {documentTypeMode === 'customer_review' && noCrFoundWarning && !isLogVisible && (
          <div className="no-ar-warning">
            <div className="no-ar-warning__icon">⚠️</div>
            <div className="no-ar-warning__message">{noCrFoundWarning}</div>
            <button
              type="button"
              className="no-ar-warning__close"
              onClick={() => setNoCrFoundWarning(null)}
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
        )}

        {/* 고객 선택 상태 안내 메시지 - 일반 문서 모드에서 표시 */}
        {documentTypeMode === 'normal' && !isLogVisible && (
          customerFileCustomer ? (
            <div className="upload-status-info upload-status-info--linked">
              <SFSymbol name="person.fill.checkmark" size={SFSymbolSize.CAPTION_1} weight={SFSymbolWeight.MEDIUM} decorative={true} />
              <span><strong>{customerFileCustomer.personal_info?.name}</strong> 고객의 문서로 업로드됩니다.</span>
            </div>
          ) : (
            <div className="upload-status-info upload-status-info--unlinked">
              <SFSymbol name="info.circle" size={SFSymbolSize.CAPTION_1} weight={SFSymbolWeight.MEDIUM} decorative={true} />
              <span><strong>고객 미선택</strong> : 고객 미지정으로 업로드됩니다. 나중에 전체 문서 보기에서 고객을 연결할 수 있습니다.</span>
            </div>
          )
        )}

        {/* 🎯 [핵심] 파일 업로드 영역 - AR/CRS이거나 일반 문서 시 표시 */}
        {((documentTypeMode === 'annual_report') || (documentTypeMode === 'customer_review') || (documentTypeMode === 'normal')) && !isLogVisible && (
          <FileUploadArea
            onFilesSelected={handleFilesSelected}
            options={fileSelectionOptions}
            uploading={uploadState.uploading}
            disabled={uploadState.uploading}
          />
        )}

        {/* 🍎 문서 처리 흐름 안내 - 업로드 전에만 표시 */}
        {!isLogVisible && (
          <div className="doc-register-flow-guide">
            <div className="flow-step flow-step--active">
              <span className="flow-step__number">①</span>
              <span className="flow-step__title">
                <span className="flow-icon flow-icon--orange"><SFSymbol name="doc-badge-plus" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.MEDIUM} decorative /></span>
                문서 등록
              </span>
              <span className="flow-step__desc">지금 이 화면</span>
            </div>
            <span className="flow-arrow">→</span>
            <div className="flow-step">
              <span className="flow-step__number">②</span>
              <span className="flow-step__title">
                <span className="flow-icon flow-icon--purple"><SFSymbol name="books-vertical" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.MEDIUM} decorative /></span>
                전체 문서 보기
              </span>
              <span className="flow-step__desc">처리 현황 확인</span>
            </div>
            <span className="flow-arrow">→</span>
            <div className="flow-step">
              <span className="flow-step__number">③</span>
              <span className="flow-step__title">
                <span className="flow-icon flow-icon--green"><SFSymbol name="folder" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.MEDIUM} decorative /></span>
                고객별 문서함
              </span>
              <span className="flow-step__desc">등록 문서 확인</span>
            </div>
          </div>
        )}

        {/* 🍎 처리 로그 (업로드 시작 후에만 표시) */}
        {isLogVisible && (
          <div className="file-log-container">
            <ProcessingLog
              logs={processingLogs}
              maxHeight={9999}
              onClear={() => {
                setProcessingLogs([])
                setUploadState(prev => ({ ...prev, files: [] }))
                // 🍎 로그 지우기 시 로그 영역 숨김
                setIsLogVisible(false)
              }}
              uploadState={uploadState}
              uploadStats={stats}
              onCancelUpload={handleCancelAll}
              onRetryFile={handleRetryFile}
              customerName={customerFileCustomer?.personal_info?.name}
            />
          </div>
        )}

        {/* 🔴 파이프라인 처리 진행률 (업로드 후 OCR/임베딩 등 백엔드 처리 상태) */}
        {isLogVisible && (
          <DocumentProcessingStatusBar
            statistics={docStats}
            batchStatistics={currentBatchId ? batchStats : null}
            isLoading={statsLoading || batchLoading}
          />
        )}

        {/* 🍎 다음 단계 안내 (업로드 완료 후 표시) */}
        {isLogVisible && uploadState.files.length > 0 && (
          <div className="doc-register-next-steps">
            <h4 className="doc-register-next-steps__title">다음 단계</h4>
            <div className="doc-register-next-steps__steps">
              <div className="doc-register-next-steps__step">
                <span className="doc-register-next-steps__number">①</span>
                <span><strong>전체 문서 보기</strong>에서 처리 현황을 확인하세요</span>
              </div>
              <div className="doc-register-next-steps__step">
                <span className="doc-register-next-steps__number">②</span>
                <span>처리 완료 후 <strong>고객별 문서함</strong>에서 문서를 확인하세요</span>
              </div>
              {!customerFileCustomer && (
                <div className="doc-register-next-steps__tip">
                  <SFSymbol name="lightbulb" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.MEDIUM} decorative />
                  <span>고객을 지정하지 않았다면, <strong>전체 문서 보기</strong>에서 고객을 연결하세요</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 🍎 처리 상태 보기 & 새 문서 등록 버튼 (업로드 진행/완료 후 표시) */}
        {isLogVisible && uploadState.files.length > 0 && (
          <div className="view-status-button-container">
            <button
              type="button"
              className="view-status-button view-status-button--secondary"
              onClick={() => {
                // 초기 상태로 되돌리기
                setProcessingLogs([])
                setUploadState({
                  uploading: false,
                  files: [],
                  totalProgress: 0,
                  completedCount: 0,
                  errors: [],
                  context: {
                    identifierType: 'userId',
                    identifierValue: localStorage.getItem('aims-current-user-id') || 'tester'
                  }
                })
                setIsLogVisible(false)
                setCustomerFileCustomer(null)
              }}
            >
              <span className="icon-orange"><SFSymbol name="doc-badge-plus" size={SFSymbolSize.FOOTNOTE} weight={SFSymbolWeight.MEDIUM} /></span>
              새 문서 등록
            </button>
            <button
              type="button"
              className="view-status-button view-status-button--primary"
              onClick={() => {
                onClose()
                const url = new URL(window.location.href)
                url.searchParams.set('view', 'documents-library')
                window.history.pushState({}, '', url.toString())
                window.dispatchEvent(new PopStateEvent('popstate'))
              }}
            >
              <SFSymbol name="books-vertical" size={SFSymbolSize.FOOTNOTE} weight={SFSymbolWeight.MEDIUM} />
              전체 문서 보기
            </button>
          </div>
        )}

        {/* 🍎 AR/CRS 일괄등록 완료 후 네비게이션 */}
        {showBatchCompletionNav && (
          <div className="view-status-button-container">
            <button
              type="button"
              className="view-status-button"
              onClick={() => {
                setShowBatchCompletionNav(false)
                setProcessingLogs([])
                setUploadState({
                  uploading: false,
                  files: [],
                  totalProgress: 0,
                  completedCount: 0,
                  errors: [],
                  context: {
                    identifierType: 'userId',
                    identifierValue: localStorage.getItem('aims-current-user-id') || 'tester'
                  }
                })
                setIsLogVisible(false)
                onClose()
                const url = new URL(window.location.href)
                url.searchParams.set('view', 'documents-library')
                window.history.pushState({}, '', url.toString())
                window.dispatchEvent(new PopStateEvent('popstate'))
              }}
            >
              <span className="icon-purple"><SFSymbol name="books-vertical" size={SFSymbolSize.FOOTNOTE} weight={SFSymbolWeight.MEDIUM} /></span>
              전체 문서 보기
            </button>
          </div>
        )}

      </div>

      {/* 🍎 도움말 모달 */}
      <Modal
        visible={helpModalVisible}
        onClose={() => setHelpModalVisible(false)}
        title="📄 새 문서 등록 사용법"
        size="md"
      >
        <div className="help-modal-content">
          <div className="help-modal-section">
            <p><strong>📋 등록 방법</strong></p>
            <ul>
              <li><strong>1단계</strong>: 고객을 먼저 선택</li>
              <li><strong>2단계</strong>: 파일 드래그 또는 클릭</li>
              <li>문서는 선택한 고객에게 <strong>자동 연결</strong>됩니다</li>
            </ul>
          </div>

          <div className="help-modal-section">
            <p><strong>📎 지원 형식</strong></p>
            <ul>
              <li><strong>문서</strong>: PDF, DOCX, XLSX, HWP</li>
              <li><strong>이미지</strong>: JPG, PNG</li>
            </ul>
          </div>

          <div className="help-modal-section">
            <p><strong>🤖 AR 자동 분석</strong></p>
            <ul>
              <li>보험 연간보고서(AR) PDF → AI가 자동 분석</li>
              <li>고객명 감지 시 해당 고객에게 자동 연결</li>
            </ul>
          </div>

          <div className="help-modal-section">
            <p><strong>💡 팁</strong></p>
            <ul>
              <li>여러 파일 동시 업로드 가능</li>
              <li>대량 등록은 <strong>"문서 일괄등록"</strong> 활용</li>
            </ul>
          </div>
        </div>
      </Modal>

      {/* 🍎 스토리지 용량 초과 다이얼로그 */}
      <StorageExceededDialog
        visible={showStorageExceededDialog}
        onClose={handleStorageDialogClose}
        usedBytes={storageInfo?.used_bytes || 0}
        maxBytes={storageInfo?.quota_bytes || 0}
        tierName={storageInfo?.tierName || ''}
        selectedFilesSize={storageExceededInfo?.selectedFilesSize || 0}
        selectedFilesCount={storageExceededInfo?.selectedFilesCount || 0}
        onCleanupFiles={handleStorageCleanupFiles}
        onPartialUpload={handleStoragePartialUpload}
        partialUploadInfo={storageExceededInfo?.partialUploadInfo || null}
      />

      {/* 🔴 중복 파일 처리 다이얼로그 */}
      {showDuplicateDialog && currentDuplicateFile && (
        <DuplicateDialog
          file={currentDuplicateFile}
          onAction={handleDuplicateAction}
          onCancel={handleDuplicateCancel}
        />
      )}

      {/* 🎯 AR 고객 선택 모달 */}
      {arCustomerSelectionState.arMetadata && (
        <CustomerSelectionModal
          isOpen={arCustomerSelectionState.isOpen}
          onClose={() => {
            // 모달 닫기 (고객 선택 취소)
            setArCustomerSelectionState(prev => ({ ...prev, isOpen: false, newlyCreatedCustomerId: null }));
            // 현재 파일 취소 처리
            if (arCustomerSelectionState.arFile) {
              updateFileStatusByFile(arCustomerSelectionState.arFile, 'skipped', '고객 선택 취소');
              addLog('warning', `AR 업로드 취소: ${arCustomerSelectionState.arFile.name}`, '사용자가 고객 선택을 취소했습니다.');
            }
            // 🎯 다음 AR 파일 처리
            processNextArFile();
          }}
          arMetadata={arCustomerSelectionState.arMetadata}
          matchingCustomers={arCustomerSelectionState.matchingCustomers}
          onSelectCustomer={handleArCustomerSelected}
          onCreateNewCustomer={handleArCreateNewCustomer}
          fileName={arCustomerSelectionState.arFile?.name}
          newlyCreatedCustomerId={arCustomerSelectionState.newlyCreatedCustomerId}
        />
      )}

      {/* 🎯 새 고객명 입력 모달 (고객 선택 모달 위에 레이어로 표시) */}
      {arCustomerSelectionState.arMetadata && (
        <NewCustomerInputModal
          isOpen={showNewCustomerModal}
          onClose={() => {
            // 단순히 새 고객 모달만 닫기 (고객 선택 모달은 그대로 유지)
            setShowNewCustomerModal(false);
          }}
          arMetadata={arCustomerSelectionState.arMetadata}
          onSubmit={handleNewCustomerCreated}
          // onBack 제거: 취소 버튼 하나만 사용
        />
      )}

      {/* 🎯 CRS 고객 선택 모달 */}
      {crCustomerSelectionState.crMetadata && (
        <CustomerSelectionModal
          isOpen={crCustomerSelectionState.isOpen}
          onClose={() => setCrCustomerSelectionState(prev => ({ ...prev, isOpen: false }))}
          arMetadata={{
            customer_name: crCustomerSelectionState.crMetadata.contractor_name || '',
            issue_date: crCustomerSelectionState.crMetadata.issue_date || '',
          }}
          matchingCustomers={crCustomerSelectionState.matchingCustomers}
          onSelectCustomer={handleCrCustomerSelected}
          onCreateNewCustomer={handleCrCreateNewCustomer}
        />
      )}

      {/* 🎯 CRS 새 고객명 입력 모달 */}
      {crCustomerSelectionState.crMetadata && (
        <NewCustomerInputModal
          isOpen={showNewCustomerModalForCR}
          onClose={() => setShowNewCustomerModalForCR(false)}
          arMetadata={{
            customer_name: crCustomerSelectionState.crMetadata.contractor_name || '',
            issue_date: crCustomerSelectionState.crMetadata.issue_date || '',
          }}
          onSubmit={handleNewCustomerCreatedForCR}
          onBack={handleNewCustomerBackForCR}
        />
      )}

      {/* 🎯 AR 일괄 매핑용 새 고객 등록 모달 */}
      <NewCustomerInputModal
        isOpen={batchNewCustomerModal.isOpen}
        onClose={() => setBatchNewCustomerModal({ isOpen: false, fileId: null, defaultName: '' })}
        arMetadata={{
          customer_name: batchNewCustomerModal.defaultName,
          issue_date: new Date().toISOString().split('T')[0],
        }}
        onSubmit={(customerId, customerName, customerType) => {
          // 모달 내부에서 고객 생성이 완료된 후 호출됨
          addLog('success', `새 고객 "${customerName}" (${customerType}) 등록 완료`)

          // 🎯 새 고객을 그룹의 matchingCustomers에 추가 (같은 AR 고객명의 다른 파일 드롭다운에서도 보이도록)
          arBatch.addCustomerToGroups(batchNewCustomerModal.defaultName, {
            _id: customerId,
            name: customerName,
            customer_type: customerType,
          })

          const fileId = batchNewCustomerModal.fileId
          if (fileId === '__BULK__') {
            // 일괄 매핑: 선택된 모든 파일에 새 고객 할당
            const selectedFileIds = arBatch.tableState.rows
              .filter(r => r.isSelected)
              .map(r => r.fileInfo.fileId)
            arBatch.bulkAssignToCustomer(selectedFileIds, customerId, customerName)
          } else if (fileId) {
            // 개별 파일에 새 고객 할당
            arBatch.updateTableRowMapping(fileId, customerId, customerName)
          }

          setBatchNewCustomerModal({ isOpen: false, fileId: null, defaultName: '' })
        }}
      />

      {/* 🎯 AR 일괄 매핑 모달 (테이블 UI) */}
      <BatchArMappingModal
        state={arBatch.batchState}
        tableState={arBatch.tableState}
        onClose={() => {
          if (arBatch.batchState.registrationResult) {
            setShowBatchCompletionNav(true)
          } else {
            addLog('warning', 'AR 일괄 등록 취소')
          }
          arBatch.closeModal()
        }}
        onUpdateRowMapping={arBatch.updateTableRowMapping}
        onUpdateRowNewCustomer={arBatch.updateTableRowNewCustomer}
        onToggleRow={arBatch.toggleTableRow}
        onSelectAllRows={arBatch.selectAllTableRows}
        onSetRowsSelection={arBatch.setRowsSelection}
        onBulkAssignCustomer={arBatch.bulkAssignToCustomer}
        onBulkAssignNewCustomer={arBatch.bulkAssignToNewCustomer}
        onToggleFileIncluded={arBatch.toggleTableFileIncluded}
        onSetSort={arBatch.setTableSort}
        onSetPage={arBatch.setTablePage}
        onSetItemsPerPage={arBatch.setTableItemsPerPage}
        onSetSearchQuery={arBatch.setTableSearchQuery}
        onSetFilter={arBatch.setTableFilter}
        onOpenNewCustomerModal={(fileId, defaultName) => {
          // 새 고객 등록 모달 열기
          setBatchNewCustomerModal({
            isOpen: true,
            fileId,
            defaultName,
          })
        }}
        onRegister={async (rows: ArFileTableRow[]) => {
          // 🎯 AR 일괄 등록 처리 (테이블 행 기반)
          clearDuplicateCheckCache() // 배치 시작 전 캐시 초기화
          addLog('info', 'AR 일괄 등록 시작...')

          const { groups } = arBatch.tableState

          // 해시 중복 파일 집계 (분석 단계에서 감지된 중복 — 결과 통계에 반영)
          const hashDuplicateRows = rows.filter(row =>
            row.fileInfo.included && row.fileInfo.duplicateStatus.isHashDuplicate
          )

          // 등록할 파일 수 계산 (포함되고 중복 아닌 파일만)
          const filesToRegister = rows.filter(row => {
            if (!row.fileInfo.included || row.fileInfo.duplicateStatus.isHashDuplicate) return false
            const mapping = getEffectiveMapping(row, groups)
            return mapping.customerId || mapping.newCustomerName
          })

          if (filesToRegister.length === 0 && hashDuplicateRows.length === 0) {
            addLog('warning', '등록할 파일이 없습니다')
            arBatch.closeModal()
            return
          }

          arBatch.setProcessing(true, 0)

          let completedCount = 0
          let successCount = 0
          let errorCount = 0
          let skippedCount = 0
          const skippedFiles: Array<{ fileName: string; reason: string }> = []
          const failedFiles: Array<{ fileName: string; error: string }> = []
          const existingCustomerIds = new Set<string>()
          const registrationStartedAt = Date.now()

          // 해시 중복 파일을 건너뜀 카운트에 포함
          for (const row of hashDuplicateRows) {
            skippedCount++
            skippedFiles.push({ fileName: row.fileInfo.file.name, reason: '중복 파일 (동일한 문서가 이미 존재)' })
          }

          // 해시 중복만 있고 등록할 파일이 없는 경우 → 결과 요약만 표시
          if (filesToRegister.length === 0) {
            addLog('info', `AR 일괄 등록: 모든 파일이 중복 (${skippedCount}개)`)
            arBatch.setRegistrationResult({
              successCount: 0,
              errorCount: 0,
              skippedCount,
              newCustomerCount: 0,
              existingCustomerCount: 0,
              skippedFiles,
              failedFiles: [],
              startedAt: registrationStartedAt,
              completedAt: Date.now(),
            })
            return
          }

          // ═══════════════════════════════════════════════════
          // 🚀 3-Phase 사전 준비 (순차 → 병렬)
          // 기존: 루프 중 고객 생성/해시 계산/API 호출 모두 순차
          // 개선: 루프 전 3단계 병렬 준비 → 루프는 캐시 히트만
          // ═══════════════════════════════════════════════════
          const prepStartedAt = performance.now()

          const newCustomerCache = new Map<string, string>() // name -> customerId

          // ── Phase 1: 새 고객 병렬 일괄 생성 ──
          // 기존: 루프 중 새 고객 만날 때마다 1개씩 순차 생성 API
          // 개선: 루프 전 5개씩 병렬 생성
          const customerNamesToCreate = new Set<string>()
          for (const row of filesToRegister) {
            const mapping = getEffectiveMapping(row, groups)
            if (!mapping.customerId && mapping.newCustomerName) {
              customerNamesToCreate.add(mapping.newCustomerName)
            }
          }

          if (customerNamesToCreate.size > 0) {
            const phase1Start = performance.now()
            addLog('info', `[준비 1/3] 새 고객 ${customerNamesToCreate.size}명 일괄 등록 중...`)
            const CUSTOMER_BATCH_SIZE = 5
            const namesToCreate = [...customerNamesToCreate]
            let customerCreatedCount = 0

            for (let i = 0; i < namesToCreate.length; i += CUSTOMER_BATCH_SIZE) {
              const batch = namesToCreate.slice(i, i + CUSTOMER_BATCH_SIZE)
              await Promise.all(batch.map(async (name) => {
                try {
                  const newCustomer = await CustomerService.createCustomer({
                    personal_info: { name },
                    insurance_info: { customer_type: '개인' },
                    contracts: [],
                    documents: [],
                    consultations: [],
                  })
                  newCustomerCache.set(name, newCustomer._id)
                  customerCreatedCount++
                } catch (error) {
                  addLog('error', `고객 등록 실패: ${name}`, String(error))
                }
              }))
              arBatch.batchSetProgress(0, filesToRegister.length,
                `고객 등록 중... ${Math.min(i + CUSTOMER_BATCH_SIZE, namesToCreate.length)}/${namesToCreate.length}`)
            }
            const phase1Elapsed = ((performance.now() - phase1Start) / 1000).toFixed(1)
            addLog('success', `[준비 1/3] 새 고객 ${customerCreatedCount}명 등록 완료 (${phase1Elapsed}초)`)
          }

          // ── Phase 2: 고객 데이터 병렬 프리페치 (해시 + 발행일) ──
          // 기존 고객 + 방금 생성한 새 고객 모두 프리페치
          const allCustomerIds = filesToRegister
            .map(row => {
              const mapping = getEffectiveMapping(row, groups)
              return mapping.customerId || (mapping.newCustomerName ? newCustomerCache.get(mapping.newCustomerName) : null)
            })
            .filter((id): id is string => !!id)
          const uniqueCustomerIds = [...new Set(allCustomerIds)]

          if (uniqueCustomerIds.length > 0) {
            const phase2Start = performance.now()
            addLog('info', `[준비 2/3] 고객 데이터 프리페치 중 (${uniqueCustomerIds.length}명)...`)
            await prefetchCustomerData(uniqueCustomerIds, (completed, total) => {
              arBatch.batchSetProgress(0, filesToRegister.length,
                `데이터 로딩 중... ${completed}/${total}`)
            })
            const phase2Elapsed = ((performance.now() - phase2Start) / 1000).toFixed(1)
            addLog('success', `[준비 2/3] 고객 데이터 프리페치 완료 (${phase2Elapsed}초)`)
          }

          // ── Phase 3: 파일 해시 병렬 사전 계산 ──
          const phase3Start = performance.now()
          const allFiles = filesToRegister.map(row => row.fileInfo.file)
          addLog('info', `[준비 3/3] 파일 해시 계산 중 (${allFiles.length}개)...`)
          await precomputeFileHashes(allFiles, (completed, total) => {
            arBatch.batchSetProgress(0, filesToRegister.length,
              `해시 계산 중... ${completed}/${total}`)
          })
          const phase3Elapsed = ((performance.now() - phase3Start) / 1000).toFixed(1)
          addLog('success', `[준비 3/3] 파일 해시 계산 완료 (${phase3Elapsed}초)`)

          const prepTotalElapsed = ((performance.now() - prepStartedAt) / 1000).toFixed(1)
          addLog('info', `[사전 준비 완료] 총 ${prepTotalElapsed}초`)

          // ═══════════════════════════════════════════════════
          // 🚀 Main Loop: 모든 캐시가 워밍된 상태 → O(1) 룩업 + 큐 추가만
          // ═══════════════════════════════════════════════════
          const mainLoopStart = performance.now()
          uploadService.setBatchUploadActive(true)

          // 🚀 배치 상태 업데이트 (O(n²) → O(n))
          // 매 파일마다 setUploadState([...prev.files, newItem]) → 배열 전체 복사 = O(n²)
          // 버퍼에 모아서 일정 간격으로 플러시 = O(n)
          const BATCH_FLUSH_SIZE = 50
          const pendingFileUpdates: UploadFile[] = []
          const flushFileUpdates = () => {
            if (pendingFileUpdates.length === 0) return
            const batch = pendingFileUpdates.splice(0)
            setUploadState(prev => ({
              ...prev,
              files: [...prev.files, ...batch]
            }))
          }
          const addFileToState = (file: UploadFile) => {
            pendingFileUpdates.push(file)
            if (pendingFileUpdates.length >= BATCH_FLUSH_SIZE) {
              flushFileUpdates()
            }
          }

          // 🚀 진행률 업데이트 스로틀: 매 파일마다 → 10개 간격
          const PROGRESS_UPDATE_INTERVAL = 10

          // 🚀 직접 업로드 배치 (인메모리 큐 대신 직접 HTTP 업로드로 파일 손실 방지)
          // 기존: uploadService.queueFiles() → 인메모리 배열 → 백그라운드 업로드 → 페이지 이동 시 손실
          // 변경: BatchUploadApi.uploadFile() → 직접 HTTP POST → 서버 도착 확인 후 완료
          const UPLOAD_CONCURRENCY = 10
          const uploadBatch: Array<{
            file: File
            customerId: string
            fileId: string
            customerName: string
          }> = []

          const flushUploadBatch = async () => {
            if (uploadBatch.length === 0) return
            const batch = uploadBatch.splice(0)

            const results = await Promise.all(batch.map(async (item) => {
              try {
                const result = await BatchUploadApi.uploadFile(item.file, item.customerId)
                return { ...result, item }
              } catch (error) {
                return { success: false as const, fileName: item.file.name, customerId: item.customerId, error: String(error), item }
              }
            }))

            for (const r of results) {
              if (r.success) {
                successCount++
                addFileToState({
                  id: r.item.fileId,
                  file: r.item.file,
                  fileSize: r.item.file.size,
                  status: 'completed' as const,
                  progress: 100,
                  customerId: r.item.customerId,
                })
                addLog('success', `[${r.item.customerName}] 업로드 완료: ${r.item.file.name}`)
              } else {
                errorCount++
                const errorMsg = r.error || '업로드 실패'
                failedFiles.push({ fileName: r.item.file.name, error: errorMsg })
                addFileToState({
                  id: r.item.fileId,
                  file: r.item.file,
                  fileSize: r.item.file.size,
                  status: 'error' as const,
                  progress: 0,
                  error: errorMsg,
                  customerId: r.item.customerId,
                })
                addLog('error', `[${r.item.customerName}] 업로드 실패: ${r.item.file.name}`, errorMsg)
              }
              completedCount++
            }

            // UI 업데이트
            arBatch.batchSetProgress(completedCount, filesToRegister.length)
            flushFileUpdates()
            flushPendingLogs()
          }

          let loopIdx = 0

          try {
          for (const row of filesToRegister) {
            const arFile = row.fileInfo
            const mapping = getEffectiveMapping(row, groups)
            loopIdx++

            // 스로틀: 10개 간격 또는 첫 파일에만 진행률 UI 업데이트
            if (loopIdx % PROGRESS_UPDATE_INTERVAL === 0) {
              arBatch.batchSetProgress(completedCount, filesToRegister.length, `검사 중... ${loopIdx}/${filesToRegister.length}`)
            }

            let customerId = mapping.customerId
            const customerName = mapping.customerName || mapping.newCustomerName

            // 기존 고객 매핑 추적
            if (customerId) {
              existingCustomerIds.add(customerId)
            }

            // 새 고객 등록 필요
            if (!customerId && mapping.newCustomerName) {
              // 캐시에서 확인 (같은 이름의 새 고객이 이미 생성되었는지)
              if (newCustomerCache.has(mapping.newCustomerName)) {
                customerId = newCustomerCache.get(mapping.newCustomerName)!
              } else {
                try {
                  addLog('info', `새 고객 등록 중: ${mapping.newCustomerName}`)
                  const newCustomer = await CustomerService.createCustomer({
                    personal_info: { name: mapping.newCustomerName },
                    insurance_info: { customer_type: '개인' },
                    contracts: [],
                    documents: [],
                    consultations: [],
                  })
                  customerId = newCustomer._id
                  newCustomerCache.set(mapping.newCustomerName, customerId)
                  addLog('success', `새 고객 등록 완료: ${mapping.newCustomerName}`)
                } catch (error) {
                  addLog('error', `고객 등록 실패: ${mapping.newCustomerName}`, String(error))
                  errorCount++
                  failedFiles.push({ fileName: arFile.file.name, error: `고객 등록 실패: ${String(error)}` })
                  completedCount++
                  continue
                }
              }
            }

            if (!customerId) {
              addLog('warning', `[${row.extractedCustomerName}] 고객이 선택되지 않아 건너뜀`)
              completedCount++
              continue
            }

            try {
              // 중복 체크 (발행일 기준)
              const processResult = await processAnnualReportFile(arFile.file, customerId, arFile.metadata.issue_date)

              if (processResult.isDuplicateDoc) {
                const reason = '중복 파일 (동일한 문서가 이미 존재)'
                addLog('warning', `[${customerName}] 중복 파일 건너뜀: ${arFile.file.name}`)
                addFileToState({
                  id: arFile.fileId,
                  file: arFile.file,
                  fileSize: arFile.file.size,
                  status: 'skipped' as const,
                  progress: 100,
                  error: reason,
                  customerId,
                })
                skippedCount++
                skippedFiles.push({ fileName: arFile.file.name, reason })
                completedCount++
                continue
              }

              if (processResult.isDuplicateIssueDate) {
                const formattedDate = formatIssueDateKorean(processResult.duplicateIssueDate)
                const reason = `중복 발행일 (${formattedDate} AR 이미 존재)`
                addLog('warning', `[${customerName}] ${formattedDate} 발행일 AR 이미 존재: ${arFile.file.name}`)
                addFileToState({
                  id: arFile.fileId,
                  file: arFile.file,
                  fileSize: arFile.file.size,
                  status: 'skipped' as const,
                  progress: 100,
                  error: reason,
                  customerId,
                })
                skippedCount++
                skippedFiles.push({ fileName: arFile.file.name, reason })
                completedCount++
                continue
              }

              // AR 파일 추적 등록
              arFilenamesRef.current.add(arFile.file.name)
              arCustomerMappingRef.current.set(arFile.file.name, customerId)
              arMetadataMappingRef.current.set(arFile.file.name, arFile.metadata)
              customerNameMappingRef.current.set(customerId, customerName!)

              // 업로드 배치에 추가 (인메모리 큐 대신 직접 HTTP 업로드)
              uploadBatch.push({
                file: arFile.file,
                customerId,
                fileId: arFile.fileId,
                customerName: customerName!,
              })

              // 배치가 차면 직접 업로드 (10개씩 병렬)
              if (uploadBatch.length >= UPLOAD_CONCURRENCY) {
                await flushUploadBatch()
              }
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error)
              addLog('error', `[${customerName}] 등록 실패: ${arFile.file.name}`, errorMsg)
              errorCount++
              completedCount++
              failedFiles.push({ fileName: arFile.file.name, error: `등록 중 오류: ${errorMsg}` })
            }

            // 🚀 50개마다 GC 양보 — 이벤트 루프에 제어권 반환하여 UI 응답성 유지
            if (loopIdx % 50 === 0) {
              flushFileUpdates()
              flushPendingLogs()
              await new Promise(resolve => setTimeout(resolve, 0))
            }
          }

          // 잔여 업로드 배치 플러시 (루프 종료 후 남은 파일)
          await flushUploadBatch()

          } finally {
            uploadService.setBatchUploadActive(false)
          }

          // 최종 진행률 보장
          arBatch.batchSetProgress(completedCount, filesToRegister.length)

          // 잔여 버퍼 플러시 (루프 종료 후 남은 파일/로그 상태 반영)
          flushFileUpdates()
          flushPendingLogs()

          // 스로틀 캐시 정리
          progressThrottleRef.current.clear()

          // 배치 완료 → 캐시 클리어
          clearDuplicateCheckCache()

          // 결과 요약 + 타이밍
          const mainLoopElapsed = ((performance.now() - mainLoopStart) / 1000).toFixed(1)
          const totalElapsed = ((performance.now() - prepStartedAt) / 1000).toFixed(1)
          addLog('success', `AR 일괄 등록 완료 (총 ${totalElapsed}초: 준비 ${prepTotalElapsed}초 + 등록 ${mainLoopElapsed}초)`, `성공: ${successCount}건, 건너뜀: ${skippedCount}건, 실패: ${errorCount}건`)

          // 결과 요약 화면 표시 (모달 유지)
          arBatch.setRegistrationResult({
            successCount,
            errorCount,
            skippedCount,
            newCustomerCount: newCustomerCache.size,
            existingCustomerCount: existingCustomerIds.size,
            skippedFiles,
            failedFiles,
            startedAt: registrationStartedAt,
            completedAt: Date.now(),
          })
        }}
      />

      {/* 🎯 CRS 일괄 매핑용 새 고객 등록 모달 */}
      <NewCustomerInputModal
        isOpen={crBatchNewCustomerModal.isOpen}
        onClose={() => setCrBatchNewCustomerModal({ isOpen: false, fileId: null, defaultName: '' })}
        arMetadata={{
          customer_name: crBatchNewCustomerModal.defaultName,
          issue_date: new Date().toISOString().split('T')[0],
        }}
        onSubmit={(customerId, customerName, customerType) => {
          // 모달 내부에서 고객 생성이 완료된 후 호출됨
          addLog('success', `새 고객 "${customerName}" (${customerType}) 등록 완료`)

          // 🎯 새 고객을 그룹의 matchingCustomers에 추가
          crBatch.addCustomerToGroups(crBatchNewCustomerModal.defaultName, {
            _id: customerId,
            name: customerName,
            customer_type: customerType,
          })

          const fileId = crBatchNewCustomerModal.fileId
          if (fileId === '__BULK__') {
            // 일괄 매핑: 선택된 모든 파일에 새 고객 할당
            const selectedFileIds = crBatch.tableState.rows
              .filter(r => r.isSelected)
              .map(r => r.fileInfo.fileId)
            crBatch.bulkAssignToCustomer(selectedFileIds, customerId, customerName)
          } else if (fileId) {
            // 개별 파일에 새 고객 할당
            crBatch.updateTableRowMapping(fileId, customerId, customerName)
          }

          setCrBatchNewCustomerModal({ isOpen: false, fileId: null, defaultName: '' })
        }}
      />

      {/* 🎯 CRS 일괄 매핑 모달 (테이블 UI) */}
      <BatchCrMappingModal
        state={crBatch.batchState}
        tableState={crBatch.tableState}
        onClose={() => {
          if (crBatch.batchState.registrationResult) {
            setShowBatchCompletionNav(true)
          } else {
            addLog('warning', 'CRS 일괄 등록 취소')
          }
          crBatch.closeModal()
        }}
        onUpdateRowMapping={crBatch.updateTableRowMapping}
        onUpdateRowNewCustomer={crBatch.updateTableRowNewCustomer}
        onToggleRow={crBatch.toggleTableRow}
        onSelectAllRows={crBatch.selectAllTableRows}
        onSetRowsSelection={crBatch.setRowsSelection}
        onBulkAssignCustomer={crBatch.bulkAssignToCustomer}
        onBulkAssignNewCustomer={crBatch.bulkAssignToNewCustomer}
        onToggleFileIncluded={crBatch.toggleTableFileIncluded}
        onSetSort={crBatch.setTableSort}
        onSetPage={crBatch.setTablePage}
        onSetItemsPerPage={crBatch.setTableItemsPerPage}
        onSetSearchQuery={crBatch.setTableSearchQuery}
        onSetFilter={crBatch.setTableFilter}
        onOpenNewCustomerModal={(fileId, defaultName) => {
          // 새 고객 등록 모달 열기
          setCrBatchNewCustomerModal({
            isOpen: true,
            fileId,
            defaultName,
          })
        }}
        onRegister={async (rows: CrFileTableRow[]) => {
          // 🎯 CRS 일괄 등록 처리 (테이블 행 기반)
          addLog('info', 'CRS 일괄 등록 시작...')

          const { groups } = crBatch.tableState

          // 해시 중복 파일 집계 (분석 단계에서 감지된 중복 — 결과 통계에 반영)
          const hashDuplicateRows = rows.filter(row =>
            row.fileInfo.included && row.fileInfo.duplicateStatus.isHashDuplicate
          )

          // 등록할 파일 수 계산 (포함되고 중복 아닌 파일만)
          const filesToRegister = rows.filter(row => {
            if (!row.fileInfo.included || row.fileInfo.duplicateStatus.isHashDuplicate) return false
            const mapping = getCrEffectiveMapping(row, groups)
            return mapping.customerId || mapping.newCustomerName
          })

          if (filesToRegister.length === 0 && hashDuplicateRows.length === 0) {
            addLog('warning', '등록할 파일이 없습니다')
            crBatch.closeModal()
            return
          }

          crBatch.setProcessing(true, 0)
          uploadService.setBatchUploadActive(true)

          let completedCount = 0
          let successCount = 0
          let errorCount = 0
          let skippedCount = 0
          const skippedFiles: Array<{ fileName: string; reason: string }> = []
          const failedFiles: Array<{ fileName: string; error: string }> = []
          const existingCustomerIds = new Set<string>()
          const registrationStartedAt = Date.now()

          // 해시 중복 파일을 건너뜀 카운트에 포함
          for (const row of hashDuplicateRows) {
            skippedCount++
            skippedFiles.push({ fileName: row.fileInfo.file.name, reason: '중복 파일 (동일한 문서가 이미 존재)' })
          }

          // 해시 중복만 있고 등록할 파일이 없는 경우 → 결과 요약만 표시
          if (filesToRegister.length === 0) {
            uploadService.setBatchUploadActive(false)
            addLog('info', `CRS 일괄 등록: 모든 파일이 중복 (${skippedCount}개)`)
            crBatch.setRegistrationResult({
              successCount: 0,
              errorCount: 0,
              skippedCount,
              newCustomerCount: 0,
              existingCustomerCount: 0,
              skippedFiles,
              failedFiles: [],
              startedAt: registrationStartedAt,
              completedAt: Date.now(),
            })
            return
          }

          // 새 고객 생성을 위한 캐시 (같은 이름의 새 고객은 한 번만 생성)
          const newCustomerCache = new Map<string, string>() // name -> customerId

          // 🚀 직접 업로드 배치 (인메모리 큐 대신 직접 HTTP 업로드로 파일 손실 방지)
          const CRS_UPLOAD_CONCURRENCY = 10
          const crsUploadBatch: Array<{
            file: File
            customerId: string
            fileId: string
            customerName: string
          }> = []

          const flushCrsUploadBatch = async () => {
            if (crsUploadBatch.length === 0) return
            const batch = crsUploadBatch.splice(0)

            const results = await Promise.all(batch.map(async (item) => {
              try {
                const result = await BatchUploadApi.uploadFile(item.file, item.customerId)
                return { ...result, item }
              } catch (error) {
                return { success: false as const, fileName: item.file.name, customerId: item.customerId, error: String(error), item }
              }
            }))

            for (const r of results) {
              if (r.success) {
                successCount++
                setUploadState(prev => ({
                  ...prev,
                  files: [...prev.files, {
                    id: r.item.fileId,
                    file: r.item.file,
                    fileSize: r.item.file.size,
                    status: 'completed' as const,
                    progress: 100,
                    customerId: r.item.customerId,
                  }]
                }))
                addLog('success', `[${r.item.customerName}] 업로드 완료: ${r.item.file.name}`)
              } else {
                errorCount++
                const errorMsg = r.error || '업로드 실패'
                failedFiles.push({ fileName: r.item.file.name, error: errorMsg })
                setUploadState(prev => ({
                  ...prev,
                  files: [...prev.files, {
                    id: r.item.fileId,
                    file: r.item.file,
                    fileSize: r.item.file.size,
                    status: 'error' as const,
                    progress: 0,
                    error: errorMsg,
                    customerId: r.item.customerId,
                  }]
                }))
                addLog('error', `[${r.item.customerName}] 업로드 실패: ${r.item.file.name}`, errorMsg)
              }
              completedCount++
              crBatch.incrementCompleted()
            }

            // 진행률 업데이트
            crBatch.setProcessing(true, Math.round((completedCount / filesToRegister.length) * 100))
          }

          try {
          for (const row of filesToRegister) {
            const crFile = row.fileInfo
            const mapping = getCrEffectiveMapping(row, groups)

            let customerId = mapping.customerId
            let customerName = mapping.customerName

            // 기존 고객 매핑 추적
            if (customerId) {
              existingCustomerIds.add(customerId)
            }

            // 새 고객 생성이 필요한 경우
            if (!customerId && mapping.newCustomerName) {
              // 캐시 확인
              if (newCustomerCache.has(mapping.newCustomerName)) {
                customerId = newCustomerCache.get(mapping.newCustomerName)!
                customerName = mapping.newCustomerName
              } else {
                // 새 고객 생성
                try {
                  const newCustomer = await CustomerService.createCustomer({
                    personal_info: { name: mapping.newCustomerName },
                    insurance_info: { customer_type: '개인' },
                    contracts: [],
                    documents: [],
                    consultations: [],
                  })

                  customerId = newCustomer._id
                  customerName = mapping.newCustomerName
                  newCustomerCache.set(mapping.newCustomerName, customerId)

                  addLog('success', `새 고객 "${mapping.newCustomerName}" 등록 완료`)
                } catch (error) {
                  addLog('error', `새 고객 생성 실패: ${mapping.newCustomerName}`, String(error))
                  errorCount++
                  failedFiles.push({ fileName: crFile.file.name, error: `고객 등록 실패: ${String(error)}` })
                  completedCount++
                  continue
                }
              }
            }

            if (!customerId) {
              addLog('warning', `고객 매핑 없음: ${crFile.file.name}`)
              completedCount++
              continue
            }

            // 진행률 업데이트
            crBatch.setProcessing(true, Math.round((completedCount / filesToRegister.length) * 100), crFile.file.name)

            try {
              // 중복 체크 (발행일 + 증권번호 기준)
              const processResult = await processCustomerReviewFile(
                crFile.file,
                customerId,
                crFile.metadata.issue_date,
                crFile.metadata.policy_number
              )

              if (processResult.isDuplicateDoc) {
                const reason = '중복 파일 (동일한 문서가 이미 존재)'
                addLog('warning', `[${customerName}] 중복 파일 건너뜀: ${crFile.file.name}`)
                setUploadState(prev => ({
                  ...prev,
                  files: [...prev.files, {
                    id: crFile.fileId,
                    file: crFile.file,
                    fileSize: crFile.file.size,
                    status: 'skipped' as const,
                    progress: 100,
                    error: reason,
                    customerId,
                  }]
                }))
                skippedCount++
                skippedFiles.push({ fileName: crFile.file.name, reason })
                completedCount++
                continue
              }

              if (processResult.isDuplicateIssueDatePolicy) {
                const formattedDate = formatIssueDateKoreanCR(processResult.duplicateIssueDate)
                const reason = `중복 (${formattedDate} 발행, 증권번호 ${processResult.duplicatePolicyNumber})`
                addLog('warning', `[${customerName}] ${formattedDate} 발행, 증권번호 ${processResult.duplicatePolicyNumber} CRS 이미 존재: ${crFile.file.name}`)
                setUploadState(prev => ({
                  ...prev,
                  files: [...prev.files, {
                    id: crFile.fileId,
                    file: crFile.file,
                    fileSize: crFile.file.size,
                    status: 'skipped' as const,
                    progress: 100,
                    error: reason,
                    customerId,
                  }]
                }))
                skippedCount++
                skippedFiles.push({ fileName: crFile.file.name, reason })
                completedCount++
                continue
              }

              // 파일 추적 등록
              crFilenamesRef.current.add(crFile.file.name)
              crCustomerMappingRef.current.set(crFile.file.name, customerId)
              if (crFile.metadata) {
                crMetadataMappingRef.current.set(crFile.file.name, crFile.metadata)
              }
              customerNameMappingRef.current.set(customerId, customerName!)

              // 업로드 배치에 추가 (인메모리 큐 대신 직접 HTTP 업로드)
              crsUploadBatch.push({
                file: crFile.file,
                customerId,
                fileId: crFile.fileId,
                customerName: customerName!,
              })

              // 배치가 차면 직접 업로드 (10개씩 병렬)
              if (crsUploadBatch.length >= CRS_UPLOAD_CONCURRENCY) {
                await flushCrsUploadBatch()
              }
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error)
              addLog('error', `[${customerName}] 등록 실패: ${crFile.file.name}`, errorMsg)
              errorCount++
              completedCount++
              crBatch.incrementCompleted()
              failedFiles.push({ fileName: crFile.file.name, error: `등록 중 오류: ${errorMsg}` })
            }
          }

          // 잔여 업로드 배치 플러시
          await flushCrsUploadBatch()

          } finally {
            uploadService.setBatchUploadActive(false)
          }

          // 결과 요약
          addLog('success', `CRS 일괄 등록 완료`, `성공: ${successCount}건, 건너뜀: ${skippedCount}건, 실패: ${errorCount}건`)

          // 결과 요약 화면 표시 (모달 유지)
          crBatch.setRegistrationResult({
            successCount,
            errorCount,
            skippedCount,
            newCustomerCount: newCustomerCache.size,
            existingCustomerCount: existingCustomerIds.size,
            skippedFiles,
            failedFiles,
            startedAt: registrationStartedAt,
            completedAt: Date.now(),
          })
        }}
      />
    </CenterPaneView>
  )
}

export default DocumentRegistrationView
type StoredUploadFile = {
  id: string
  status: UploadStatus
  progress: number
  error?: string
  completedAt?: string
  fileSize?: number
  fileInfo?: {
    name?: string
    size?: number
    type?: string
    lastModified?: number
  }
}

type StoredUploadState = Omit<UploadState, 'files'> & {
  files?: StoredUploadFile[]
}

