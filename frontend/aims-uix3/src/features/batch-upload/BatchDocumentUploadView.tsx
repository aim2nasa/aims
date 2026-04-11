/**
 * BatchDocumentUploadView Component
 * @since 2025-12-05
 * @version 1.0.0
 *
 * 고객 문서 일괄등록 뷰
 * - 폴더 선택/드래그앤드롭
 * - 폴더명-고객명 자동 매핑
 * - 업로드 진행률 표시
 * - sessionStorage 상태 저장 (새로고침 시 복원)
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { CenterPaneView } from '../../components/CenterPaneView/CenterPaneView'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../components/SFSymbol'
import { Modal, Tooltip } from '@/shared/ui'
import Button from '@/shared/ui/Button'
import FolderDropZone from './components/FolderDropZone'
import MappingPreview from './components/MappingPreview'
import UploadProgress from './components/UploadProgress'
import UploadSummary from './components/UploadSummary'
import DuplicateDialog, { type DuplicateFile } from './components/DuplicateDialog'
import StorageExceededDialog from './components/StorageExceededDialog'
import { useBatchUpload } from './hooks/useBatchUpload'
import { BatchUploadApi } from './api/batchUploadApi'
import { buildFolderTree, computeFolderMappings, canDirectMap, type CustomerForMatching } from './utils/customerMatcher'
import { validateBatch } from './utils/fileValidation'
import { getMyStorageInfo, type StorageInfo } from '@/services/userService'
import { checkStorageWithInfo } from '@/shared/lib/fileValidation'
import type { FolderMapping, BatchAnalyzeProgress } from './types'
import { getBatchId, setBatchId, addBatchExpectedTotal } from '@/hooks/useBatchId'
import './BatchDocumentUploadView.css'
import './BatchDocumentUploadView.mobile.css'

// ==================== SessionStorage 관련 ====================

const SESSION_KEY = 'aims-batch-upload-state'

/**
 * 직렬화된 파일 정보 (File 객체 대신 메타데이터만)
 */
interface SerializedFileInfo {
  name: string
  size: number
  webkitRelativePath: string
}

/**
 * sessionStorage에 저장할 상태 (File 객체 제외)
 * v4 재설계: 전체 파일 메타데이터 + direct 매핑 Map만 저장 → 복원 시 트리 재계산
 */
interface SerializedState {
  step: 'select' | 'preview' | 'upload' | 'complete'
  customers: CustomerForMatching[]
  /** 드롭된 전체 파일 메타데이터 */
  allFiles: SerializedFileInfo[]
  /** folderPath → customerId 사용자 명시 매핑 */
  directMappingEntries: Array<[string, string]>
  expandedPaths: string[]
  savedAt: string
}

/**
 * 상태를 sessionStorage에 저장
 */
function saveToSessionStorage(
  step: SerializedState['step'],
  customers: CustomerForMatching[],
  allFiles: File[],
  directMap: Map<string, string>,
  expandedPaths: string[]
): void {
  try {
    const state: SerializedState = {
      step,
      customers,
      allFiles: allFiles.map(f => ({
        name: f.name,
        size: f.size,
        webkitRelativePath: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
      })),
      directMappingEntries: Array.from(directMap.entries()),
      expandedPaths,
      savedAt: new Date().toISOString(),
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state))
  } catch (e) {
    console.warn('Failed to save batch upload state to sessionStorage:', e)
  }
}

/**
 * sessionStorage에서 상태 복원
 */
function loadFromSessionStorage(): SerializedState | null {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY)
    if (!stored) return null
    return JSON.parse(stored) as SerializedState
  } catch (e) {
    console.warn('Failed to load batch upload state from sessionStorage:', e)
    return null
  }
}

/**
 * 직렬화된 파일 정보를 가짜 File 객체로 변환 (트리 표시용)
 * 실제 파일 내용은 없으므로 업로드 불가 - isPlaceholder 플래그로 구분
 */
function createPlaceholderFile(info: SerializedFileInfo): File & { isPlaceholder?: boolean } {
  const file = new File([], info.name, { type: '' }) as File & { isPlaceholder?: boolean }
  Object.defineProperty(file, 'size', { value: info.size, writable: false })
  Object.defineProperty(file, 'webkitRelativePath', { value: info.webkitRelativePath, writable: false })
  Object.defineProperty(file, 'isPlaceholder', { value: true, writable: false })
  return file
}

/**
 * sessionStorage 초기화
 */
function clearSessionStorage(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch (e) {
    console.warn('Failed to clear batch upload state from sessionStorage:', e)
  }
}

interface BatchDocumentUploadViewProps {
  visible: boolean
  onClose: () => void
  onViewDocuments?: () => void  // "전체 문서 보기"로 이동
}

export default function BatchDocumentUploadView({
  visible,
  onClose,
  onViewDocuments
}: BatchDocumentUploadViewProps) {
  const [step, setStep] = useState<'select' | 'preview' | 'upload' | 'complete'>('select')
  // v4: 드롭된 전체 파일 (Source of Truth)
  const [allFiles, setAllFiles] = useState<File[]>([])
  // v4: 사용자가 명시한 folderPath → customerId 매핑 (Source of Truth)
  const [directMap, setDirectMap] = useState<Map<string, string>>(new Map())
  // v4: sessionStorage 복원 플래그 (실제 파일 내용 없음)
  const [isPlaceholder, setIsPlaceholder] = useState(false)

  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [customers, setCustomers] = useState<CustomerForMatching[]>([])
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const isInitializedRef = useRef(false)

  // 파일 트리 (derived) — allFiles에서 파생
  const folderTree = useMemo(() => buildFolderTree(allFiles), [allFiles])

  // 폴더 매핑 배열 (derived) — 트리 + directMap + customers
  const folderMappings = useMemo<FolderMapping[]>(() => {
    if (allFiles.length === 0) return []
    const mappings = computeFolderMappings(folderTree, directMap, customers)
    // placeholder 플래그 전파
    return isPlaceholder ? mappings.map(m => ({ ...m, isPlaceholder: true })) : mappings
  }, [allFiles.length, folderTree, directMap, customers, isPlaceholder])

  // 🍎 도움말 모달 상태
  const [helpModalVisible, setHelpModalVisible] = useState(false)

  // 폴더 분석 진행률 (reading → validating → matching → checking-storage)
  // reading 단계는 FolderDropZone이 보고, 이후 단계는 handleFilesSelected에서 직접 업데이트
  const [analyzeProgress, setAnalyzeProgress] = useState<BatchAnalyzeProgress | null>(null)

  // 스토리지 용량 초과 다이얼로그 상태
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)
  const [showStorageExceededDialog, setShowStorageExceededDialog] = useState(false)
  const [storageExceededInfo, setStorageExceededInfo] = useState<{
    selectedFilesSize: number
    selectedFilesCount: number
    partialUploadInfo: { fileCount: number; totalSize: number } | null
  } | null>(null)
  // 용량 초과로 필터링 대기 중인 파일들
  const [pendingFiles, setPendingFiles] = useState<File[]>([])

  // 업로드 훅
  const {
    progress,
    startUpload,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    retryFailed,
    reset: resetUpload,
    handleDuplicateAction,
  } = useBatchUpload()

  // max_batch_upload_bytes 제거됨 — 저장 용량 쿼터(remaining_bytes)로 관리
  // remaining_bytes를 tierLimit으로 사용 (-1이면 무제한)
  const tierLimit = storageInfo?.remaining_bytes ?? 0

  // 초기화 시 sessionStorage에서 상태 복원
  useEffect(() => {
    if (isInitializedRef.current) return
    isInitializedRef.current = true

    const saved = loadFromSessionStorage()
    // 구 스키마 방어: saved가 v4 이전 형식이거나 타입이 깨진 경우 전체 복원 스킵
    if (
      saved &&
      saved.step === 'preview' &&
      Array.isArray(saved.allFiles) &&
      saved.allFiles.length > 0 &&
      Array.isArray(saved.directMappingEntries) &&
      Array.isArray(saved.customers) &&
      Array.isArray(saved.expandedPaths)
    ) {
      // 미리보기 상태 복원 (placeholder — 실제 업로드 불가)
      setStep(saved.step)
      setCustomers(saved.customers)
      setExpandedPaths(new Set(saved.expandedPaths))
      setAllFiles(saved.allFiles.map(createPlaceholderFile))
      setDirectMap(new Map(saved.directMappingEntries))
      setIsPlaceholder(true)
    } else if (saved) {
      // 구 스키마 감지 시 제거하여 다음 로드 시 깨끗한 상태 보장
      clearSessionStorage()
    }
  }, [])

  // 상태 변경 시 sessionStorage에 저장
  useEffect(() => {
    if (!isInitializedRef.current) return
    if (step === 'upload') return // 업로드 중에는 저장하지 않음

    saveToSessionStorage(step, customers, allFiles, directMap, Array.from(expandedPaths))
  }, [step, customers, allFiles, directMap, expandedPaths])

  // 고객 목록 및 스토리지 정보 로드
  useEffect(() => {
    if (!visible) return

    // 고객 목록 로드
    if (customers.length === 0) {
      setIsLoadingCustomers(true)
      BatchUploadApi.getCustomersForMatching()
        .then((result) => {
          if (result.success) {
            setCustomers(result.customers)
          }
        })
        .finally(() => {
          setIsLoadingCustomers(false)
        })
    }

    // 스토리지 정보 로드 (티어별 제한값 포함)
    if (!storageInfo) {
      getMyStorageInfo()
        .then((info) => {
          setStorageInfo(info)
        })
        .catch((error) => {
          console.error('스토리지 정보 조회 실패:', error)
        })
    }
  }, [visible, customers.length, storageInfo])

  // 업로드 완료 감지
  useEffect(() => {
    if (progress.state === 'completed' || progress.state === 'cancelled') {
      setStep('complete')
    }
  }, [progress.state])

  // 업로드 진행 중 브라우저 탭 닫기/새로고침 방지
  useEffect(() => {
    if (progress.state !== 'uploading') return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // 표준 규격: returnValue 설정 (브라우저가 기본 확인 다이얼로그 표시)
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [progress.state])

  /**
   * 용량 내 파일만 필터링하여 mappings 생성
   */
  const filterMappingsToFitStorage = useCallback((
    files: File[],
    remainingBytes: number
  ): File[] => {
    const sorted = [...files].sort((a, b) => a.size - b.size)
    const filtered: File[] = []
    let totalSize = 0

    for (const file of sorted) {
      if (totalSize + file.size <= remainingBytes) {
        filtered.push(file)
        totalSize += file.size
      }
    }

    return filtered
  }, [])

  const handleFilesSelected = useCallback(async (files: File[]) => {
    // 스토리지 정보가 로드되지 않았으면 대기
    if (!storageInfo) {
      console.warn('[BatchUpload] Storage info not loaded yet')
      setAnalyzeProgress(null)
      return
    }

    try {
      // 🔵 validating 단계 시작
      setAnalyzeProgress({ stage: 'validating', current: 0, total: files.length })
      await new Promise<void>(resolve => setTimeout(resolve, 0))
      const validation = validateBatch(files, tierLimit)
      setAnalyzeProgress({ stage: 'validating', current: files.length, total: files.length })

      // 시스템/임시 파일과 기타 검증 실패를 분리
      const systemFiles = validation.invalidFiles.filter(f => f.reason === 'system_file')
      const otherInvalidFiles = validation.invalidFiles.filter(f => f.reason !== 'system_file')

      // 시스템 파일 제거 후 유효 파일만 유지
      const systemFileSet = new Set(systemFiles.map(f => f.file))
      const validFiles = files.filter(f => !systemFileSet.has(f))

      const errors: string[] = []
      if (systemFiles.length > 0) {
        const officeTempCount = systemFiles.filter(f => f.file.name.startsWith('~$')).length
        const osSystemCount = systemFiles.length - officeTempCount
        if (officeTempCount > 0) {
          errors.push(`편집 중 자동 생성된 파일 ${officeTempCount}개가 제외되었습니다`)
        }
        if (osSystemCount > 0) {
          errors.push(`시스템 파일 ${osSystemCount}개가 제외되었습니다`)
        }
      }
      if (otherInvalidFiles.length > 0) {
        errors.push(`${otherInvalidFiles.length}개 파일이 제외되었습니다 (크기 초과 또는 차단된 확장자)`)
      }
      if (validation.isBatchSizeExceeded) {
        errors.push('배치 총 크기가 등급 한도를 초과했습니다')
      }
      setValidationErrors(errors)

      if (validFiles.length === 0) {
        setValidationErrors([...errors, '업로드 가능한 파일이 없습니다.'])
        setAnalyzeProgress(null)
        return
      }

      // 🔵 matching 단계 (v4: 자동 매칭 없음 — 트리만 구축)
      setAnalyzeProgress({ stage: 'matching', current: 0, total: validFiles.length })
      await new Promise<void>(resolve => setTimeout(resolve, 0))
      const previewTree = buildFolderTree(validFiles)
      setAnalyzeProgress({ stage: 'matching', current: validFiles.length, total: validFiles.length })

      if (previewTree.length === 0) {
        setValidationErrors([...errors, '폴더 구조가 없는 파일입니다. 폴더를 선택해주세요.'])
        setAnalyzeProgress(null)
        return
      }

      // 🔵 checking-storage 단계
      setAnalyzeProgress({ stage: 'checking-storage', current: 0, total: null })
      await new Promise<void>(resolve => setTimeout(resolve, 0))
      const storageCheck = checkStorageWithInfo(validFiles, storageInfo)

      if (!storageCheck.canUpload) {
        console.log('[BatchUpload] Storage exceeded, showing dialog')
        setPendingFiles(validFiles)
        setStorageExceededInfo({
          selectedFilesSize: storageCheck.requestedBytes,
          selectedFilesCount: validFiles.length,
          partialUploadInfo: storageCheck.partialUploadInfo
            ? { fileCount: storageCheck.partialUploadInfo.fileCount, totalSize: storageCheck.partialUploadInfo.totalSize }
            : null,
        })
        setShowStorageExceededDialog(true)
        setAnalyzeProgress(null)
        return
      }

      // 정상 진행: allFiles + directMap 초기화 후 preview 단계로 (모두 unmapped)
      setAllFiles(validFiles)
      setDirectMap(new Map())
      setIsPlaceholder(false)

      // 기본 펼침: 루트 폴더들만
      const rootPaths = new Set(previewTree.map(n => n.folderPath))
      setExpandedPaths(rootPaths)

      setStep('preview')
    } catch (err) {
      console.error('[BatchUpload] 분석 단계 오류:', err)
      setValidationErrors(['폴더 분석 중 오류가 발생했습니다. 다시 시도해주세요.'])
    } finally {
      setAnalyzeProgress(null)
    }
  }, [tierLimit, storageInfo])

  /**
   * 고객 매핑 변경 핸들러 (folderPath 기준)
   *
   * - customer !== null: direct 매핑 설정. 불변식 위반 시 조용히 무시 (UI 가드 이중 방어)
   * - customer === null: 해제 → directMap에서 키 삭제 → 하위 inherited 자동 풀림
   *
   * 불변식: 루트→리프 경로상 direct는 최대 1개 (자손·조상 방향 모두 검사)
   */
  const handleMappingChange = useCallback((folderPath: string, customer: CustomerForMatching | null) => {
    setDirectMap(prev => {
      const next = new Map(prev)
      if (customer) {
        // 이중 방어: UI가 canDirectMap 가드를 통과시켰어도 프로그래매틱 호출 대비 재검증
        const guard = canDirectMap(folderPath, prev)
        if (!guard.ok) {
          console.warn(
            '[BatchUpload] handleMappingChange: canDirectMap 위반 — 매핑 무시',
            { folderPath, conflicts: guard.conflicts }
          )
          return prev
        }
        next.set(folderPath, customer._id)
      } else {
        next.delete(folderPath)
      }
      return next
    })
  }, [])

  const handleBack = useCallback(() => {
    setStep('select')
    setAllFiles([])
    setDirectMap(new Map())
    setIsPlaceholder(false)
    setValidationErrors([])
    setExpandedPaths(new Set())
  }, [])

  // 스토리지 초과 다이얼로그: "기존 파일 정리" 클릭
  const handleCleanupFiles = useCallback(() => {
    setShowStorageExceededDialog(false)
    setPendingFiles([])
    // 일괄등록 뷰 닫기
    onClose()
    // 전체 문서 보기로 이동
    const url = new URL(window.location.href)
    url.searchParams.set('view', 'documents-library')
    url.searchParams.delete('customerId')
    url.searchParams.delete('documentId')
    window.history.pushState({}, '', url.toString())
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, [onClose])

  // 스토리지 초과 다이얼로그: "일부만 업로드" 클릭
  const handlePartialUpload = useCallback(() => {
    if (!storageInfo || !pendingFiles.length) return

    const filteredFiles = filterMappingsToFitStorage(pendingFiles, storageInfo.remaining_bytes)

    if (filteredFiles.length === 0) {
      setShowStorageExceededDialog(false)
      setPendingFiles([])
      return
    }

    setAllFiles(filteredFiles)
    setDirectMap(new Map())
    setIsPlaceholder(false)

    const previewTree = buildFolderTree(filteredFiles)
    setExpandedPaths(new Set(previewTree.map(n => n.folderPath)))

    setShowStorageExceededDialog(false)
    setPendingFiles([])

    if (previewTree.length > 0) {
      setStep('preview')
    }
  }, [storageInfo, pendingFiles, filterMappingsToFitStorage])

  // 스토리지 초과 다이얼로그 닫기
  const handleStorageDialogClose = useCallback(() => {
    setShowStorageExceededDialog(false)
    setPendingFiles([])
  }, [])

  /**
   * 업로드 시작: direct 매핑 폴더들만 useBatchUpload가 기대하는 형식으로 어댑팅
   *
   * useBatchUpload는 { matched, customerId, files, folderName, customerName }를 사용하므로,
   * v4 FolderMapping을 기존 형식으로 변환해 전달한다 (hook 변경 없이 호환).
   */
  const handleStartUpload = useCallback(async (directMappings: FolderMapping[]) => {
    // 🔴 업로드 묶음 ID 설정
    const existingBatchId = getBatchId()
    const batchId = existingBatchId || `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    setBatchId(batchId)

    // useBatchUpload 호환 어댑터 (FolderMapping 구버전 필드 주입)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const legacyMappings: any[] = directMappings.map(m => ({
      folderName: m.folderName,
      customerId: m.customerId,
      customerName: m.customerName,
      matched: true,
      files: m.subtreeFiles,
      fileCount: m.subtreeFileCount,
      totalSize: m.subtreeTotalSize,
    }))

    const totalFiles = legacyMappings.reduce((sum, m) => sum + m.files.length, 0)
    addBatchExpectedTotal(totalFiles)

    setStep('upload')
    await startUpload(legacyMappings)
  }, [startUpload])

  const handleCancel = useCallback(() => {
    cancelUpload()
  }, [cancelUpload])

  const handleComplete = useCallback(() => {
    resetUpload()
    setStep('select')
    setAllFiles([])
    setDirectMap(new Map())
    setIsPlaceholder(false)
    setValidationErrors([])
    setExpandedPaths(new Set())
    clearSessionStorage()
  }, [resetUpload])

  const handleRetryFailed = useCallback(async () => {
    setStep('upload')
    await retryFailed()
  }, [retryFailed])

  const renderContent = () => {
    switch (step) {
      case 'select':
        return (
          <div className="batch-upload-content">
            <FolderDropZone
              onFilesSelected={handleFilesSelected}
              disabled={isLoadingCustomers || !storageInfo}
              analyzeProgress={analyzeProgress}
              onAnalyzeProgress={setAnalyzeProgress}
            />
            {(isLoadingCustomers || !storageInfo) && (
              <div className="batch-upload-loading">
                <span>{isLoadingCustomers ? '고객 목록을 불러오는 중...' : '스토리지 정보를 불러오는 중...'}</span>
              </div>
            )}
            {validationErrors.length > 0 && (
              <div className="batch-upload-errors">
                {validationErrors.map((error, index) => (
                  <div key={index} className="batch-upload-error">{error}</div>
                ))}
              </div>
            )}
          </div>
        )

      case 'preview':
        return (
          <div className="batch-upload-content">
            <MappingPreview
              mappings={folderMappings}
              customers={customers}
              onMappingChange={handleMappingChange}
              onBack={handleBack}
              onStartUpload={handleStartUpload}
              expandedPaths={expandedPaths}
              onExpandedPathsChange={setExpandedPaths}
            />
          </div>
        )

      case 'upload':
        return (
          <div className="batch-upload-content">
            <UploadProgress
              progress={progress}
              onPause={pauseUpload}
              onResume={resumeUpload}
              onCancel={handleCancel}
              onViewDocuments={onViewDocuments}
            />
          </div>
        )

      case 'complete':
        return (
          <div className="batch-upload-content">
            <UploadSummary
              progress={progress}
              onClose={handleComplete}
              onRetryFailed={progress.failedFiles > 0 ? handleRetryFailed : undefined}
              onViewDocuments={onViewDocuments}
              onContinueBatchUpload={handleComplete}
            />
          </div>
        )
    }
  }

  // DuplicateFileInfo를 DuplicateFile로 변환
  const currentDuplicate = progress.duplicateState?.currentDuplicate
  const duplicateDialogFile: DuplicateFile | null = currentDuplicate
    ? {
        fileName: currentDuplicate.existingFileName,
        folderName: currentDuplicate.folderName,
        customerName: currentDuplicate.customerName,
        existingFileDate: currentDuplicate.existingUploadedAt,
        newFileSize: currentDuplicate.newFileSize,
        existingFileSize: currentDuplicate.existingFileSize,
      }
    : null

  // 남은 중복 파일 수 (총 중복 - 이미 처리된 수)
  const remainingDuplicates = Math.max(
    0,
    progress.duplicateState.totalDuplicates - progress.duplicateState.resolvedCount - 1
  )

  // 중복 다이얼로그 취소 핸들러 (업로드 취소)
  const handleDuplicateCancel = useCallback(() => {
    cancelUpload()
  }, [cancelUpload])

  return (
    <CenterPaneView
      visible={visible}
      title="문서 일괄등록"
      titleIcon={
        <span className="menu-icon-cyan">
          <SFSymbol
            name="archivebox"
            size={SFSymbolSize.CALLOUT}
            weight={SFSymbolWeight.MEDIUM}
          />
        </span>
      }
      onClose={onClose}
      placeholderIcon="archivebox"
      placeholderMessage="폴더별로 정리된 문서를 고객에게 일괄 등록합니다."
      description="각 고객의 여러 문서를 폴더별로 구분하여 일괄 업로드할 수 있습니다."
    >
      {/* 🍎 도움말 버튼 */}
      <div className="batch-upload-header">
        <Tooltip content="도움말" placement="bottom">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setHelpModalVisible(true)}
            aria-label="도움말"
            leftIcon={
              <SFSymbol
                name="questionmark.circle"
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.MEDIUM}
                decorative={true}
              />
            }
          >
            <span className="visually-hidden">도움말</span>
          </Button>
        </Tooltip>
      </div>

      {renderContent()}

      {/* 중복 파일 다이얼로그 */}
      {duplicateDialogFile && (
        <DuplicateDialog
          file={duplicateDialogFile}
          onAction={handleDuplicateAction}
          onCancel={handleDuplicateCancel}
          remainingCount={remainingDuplicates}
        />
      )}

      {/* 스토리지 용량 초과 다이얼로그 */}
      {storageInfo && storageExceededInfo && (
        <StorageExceededDialog
          visible={showStorageExceededDialog}
          onClose={handleStorageDialogClose}
          usedBytes={storageInfo.used_bytes}
          maxBytes={storageInfo.quota_bytes}
          tierName={storageInfo.tierName}
          selectedFilesSize={storageExceededInfo.selectedFilesSize}
          selectedFilesCount={storageExceededInfo.selectedFilesCount}
          onCleanupFiles={handleCleanupFiles}
          onPartialUpload={handlePartialUpload}
          partialUploadInfo={storageExceededInfo.partialUploadInfo}
        />
      )}

      {/* 🍎 도움말 모달 */}
      <Modal
        visible={helpModalVisible}
        onClose={() => setHelpModalVisible(false)}
        title="📦 문서 일괄등록 사용법"
        size="md"
      >
        <div className="help-modal-content">
          <div className="help-modal-section">
            <p><strong>📂 1단계 — 폴더 선택</strong></p>
            <ul>
              <li>폴더를 드래그앤드롭하거나 선택 버튼으로 불러옵니다</li>
              <li>드롭 직후 모든 폴더는 <strong>미매핑 상태</strong>로 시작합니다 (자동 연결 없음)</li>
            </ul>
          </div>

          <div className="help-modal-section">
            <p><strong>👤 2단계 — 고객 명시적 지정</strong></p>
            <ul>
              <li>각 폴더의 <strong>[고객 지정]</strong> 버튼을 눌러 고객을 직접 지정합니다</li>
              <li>드롭다운에는 폴더명과 유사한 고객이 상단에 <strong>유사도 점수</strong>와 함께 추천됩니다</li>
            </ul>
          </div>

          <div className="help-modal-section">
            <p><strong>🔗 3단계 — 상속 규칙</strong></p>
            <ul>
              <li>상위 폴더에 고객을 지정하면 <strong>하위 폴더는 자동으로 같은 고객에 상속</strong>됩니다 (📎 표시)</li>
              <li><strong>하위 폴더가 먼저 지정되어 있으면 상위 폴더는 지정할 수 없습니다</strong> — 하위를 먼저 해제해야 합니다</li>
              <li><strong>[해제]</strong> 버튼으로 언제든 즉시 미매핑 상태로 되돌릴 수 있습니다</li>
            </ul>
          </div>

          <div className="help-modal-section">
            <p><strong>🚀 4단계 — 업로드</strong></p>
            <ul>
              <li>업로드 대상은 <strong>직접 지정된 폴더</strong>만 해당됩니다. 미매핑 폴더는 업로드되지 않습니다</li>
              <li>중복 파일은 <strong>덮어쓰기/건너뛰기</strong>를 선택할 수 있고, 업로드 중 <strong>일시정지/재개</strong>도 가능합니다</li>
            </ul>
          </div>
        </div>
      </Modal>
    </CenterPaneView>
  )
}
