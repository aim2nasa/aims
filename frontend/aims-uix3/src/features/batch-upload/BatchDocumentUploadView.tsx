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

import { useState, useCallback, useEffect, useRef } from 'react'
import CenterPaneView from '../../components/CenterPaneView/CenterPaneView'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../components/SFSymbol'
import { Modal, Tooltip } from '@/shared/ui'
import FolderDropZone from './components/FolderDropZone'
import MappingPreview from './components/MappingPreview'
import UploadProgress from './components/UploadProgress'
import UploadSummary from './components/UploadSummary'
import DuplicateDialog, { type DuplicateFile } from './components/DuplicateDialog'
import StorageExceededDialog from './components/StorageExceededDialog'
import { useBatchUpload } from './hooks/useBatchUpload'
import { BatchUploadApi } from './api/batchUploadApi'
import { groupFilesByFolder, createFolderMappings, type CustomerForMatching } from './utils/customerMatcher'
import { validateBatch } from './utils/fileValidation'
import { getMyStorageInfo, type StorageInfo } from '@/services/userService'
import { checkStorageWithInfo } from '@/shared/lib/fileValidation'
import type { FolderMapping, DuplicateAction } from './types'
import './BatchDocumentUploadView.css'

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
 */
interface SerializedState {
  step: 'select' | 'preview' | 'upload' | 'complete'
  customers: CustomerForMatching[]
  folderMappingsMetadata: Array<Omit<FolderMapping, 'files'> & { serializedFiles: SerializedFileInfo[] }>
  expandedPaths: string[]  // 펼쳐진 폴더 경로들
  savedAt: string
}

/**
 * 상태를 sessionStorage에 저장
 */
function saveToSessionStorage(
  step: SerializedState['step'],
  customers: CustomerForMatching[],
  folderMappings: FolderMapping[],
  expandedPaths: string[]
): void {
  try {
    const state: SerializedState = {
      step,
      customers,
      folderMappingsMetadata: folderMappings.map(m => ({
        folderName: m.folderName,
        customerId: m.customerId,
        customerName: m.customerName,
        matched: m.matched,
        fileCount: m.fileCount,
        totalSize: m.totalSize,
        serializedFiles: m.files.map(f => ({
          name: f.name,
          size: f.size,
          webkitRelativePath: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
        }))
      })),
      expandedPaths,
      savedAt: new Date().toISOString()
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
  const [folderMappings, setFolderMappings] = useState<FolderMapping[]>([])
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [customers, setCustomers] = useState<CustomerForMatching[]>([])
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const isInitializedRef = useRef(false)

  // 🍎 도움말 모달 상태
  const [helpModalVisible, setHelpModalVisible] = useState(false)

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
  const [pendingMappings, setPendingMappings] = useState<FolderMapping[]>([])

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
    if (saved && saved.step === 'preview') {
      // 미리보기 상태 복원
      setStep(saved.step)
      setCustomers(saved.customers)
      setExpandedPaths(new Set(saved.expandedPaths))

      // 메타데이터로 FolderMapping 복원 (가짜 File 객체 사용)
      // isPlaceholder: true - 실제 파일 내용이 없어 업로드 불가, 재선택 필요
      const restoredMappings: FolderMapping[] = saved.folderMappingsMetadata.map(meta => ({
        folderName: meta.folderName,
        customerId: meta.customerId,
        customerName: meta.customerName,
        matched: meta.matched,
        fileCount: meta.fileCount,
        totalSize: meta.totalSize,
        files: meta.serializedFiles.map(createPlaceholderFile),
        isPlaceholder: true
      }))
      setFolderMappings(restoredMappings)
    }
  }, [])

  // 상태 변경 시 sessionStorage에 저장
  useEffect(() => {
    if (!isInitializedRef.current) return
    if (step === 'upload') return // 업로드 중에는 저장하지 않음

    saveToSessionStorage(step, customers, folderMappings, Array.from(expandedPaths))
  }, [step, customers, folderMappings, expandedPaths])

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
      return
    }

    // 1. 파일을 폴더별로 그룹화 (고객명 확인을 위해 customers 전달)
    const fileGroups = groupFilesByFolder(files, customers)

    if (fileGroups.size === 0) {
      setValidationErrors(['폴더 구조가 없는 파일입니다. 폴더를 선택해주세요.'])
      return
    }

    // 2. 파일 검증 (tierLimit: -1이면 무제한)
    const allFiles = Array.from(fileGroups.values()).flat()
    const validation = validateBatch(allFiles, tierLimit)

    const errors: string[] = []
    if (validation.invalidFiles.length > 0) {
      errors.push(`${validation.invalidFiles.length}개 파일이 제외되었습니다 (크기 초과 또는 차단된 확장자)`)
    }
    if (validation.isBatchSizeExceeded) {
      errors.push('배치 총 크기가 등급 한도를 초과했습니다')
    }
    setValidationErrors(errors)

    // 3. 폴더-고객 매핑 생성
    const mappings = createFolderMappings(fileGroups, customers)

    // 4. 스토리지 용량 체크 (공통 모듈 사용)
    // storageInfo는 이미 로드됨
    const storageCheck = checkStorageWithInfo(allFiles, storageInfo)

    // 용량 초과 시 다이얼로그 표시
    if (!storageCheck.canUpload) {
      console.log('[BatchUpload] Storage exceeded, showing dialog')

      // 상태 저장 (나중에 일부만 업로드 시 사용)
      setPendingFiles(allFiles)
      setPendingMappings(mappings)

      setStorageExceededInfo({
        selectedFilesSize: storageCheck.requestedBytes,
        selectedFilesCount: allFiles.length,
        partialUploadInfo: storageCheck.partialUploadInfo
          ? { fileCount: storageCheck.partialUploadInfo.fileCount, totalSize: storageCheck.partialUploadInfo.totalSize }
          : null
      })
      setShowStorageExceededDialog(true)
      return // preview 단계로 이동하지 않음
    }

    // 5. 정상 진행
    setFolderMappings(mappings)

    // 6. 기본 펼침 상태 설정 (모두 닫힘 - 고객명만 표시)
    setExpandedPaths(new Set())

    // 7. 미리보기 단계로 이동
    if (mappings.length > 0) {
      setStep('preview')
    }
  }, [tierLimit, customers, storageInfo])

  const handleBack = useCallback(() => {
    setStep('select')
    setFolderMappings([])
    setValidationErrors([])
    setExpandedPaths(new Set())
  }, [])

  // 스토리지 초과 다이얼로그: "기존 파일 정리" 클릭
  const handleCleanupFiles = useCallback(() => {
    setShowStorageExceededDialog(false)
    setPendingFiles([])
    setPendingMappings([])
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

    // 용량 내 파일만 필터링
    const filteredFiles = filterMappingsToFitStorage(pendingFiles, storageInfo.remaining_bytes)

    if (filteredFiles.length === 0) {
      setShowStorageExceededDialog(false)
      setPendingFiles([])
      setPendingMappings([])
      return
    }

    // 필터링된 파일로 새 mappings 생성 (고객명 확인을 위해 customers 전달)
    const fileGroups = groupFilesByFolder(filteredFiles, customers)
    const mappings = createFolderMappings(fileGroups, customers)

    setFolderMappings(mappings)
    setExpandedPaths(new Set(mappings.map(m => m.folderName)))
    setShowStorageExceededDialog(false)
    setPendingFiles([])
    setPendingMappings([])

    if (mappings.length > 0) {
      setStep('preview')
    }
  }, [storageInfo, pendingFiles, customers, filterMappingsToFitStorage])

  // 스토리지 초과 다이얼로그 닫기
  const handleStorageDialogClose = useCallback(() => {
    setShowStorageExceededDialog(false)
    setPendingFiles([])
    setPendingMappings([])
  }, [])

  const handleStartUpload = useCallback(async (selectedMappings: FolderMapping[]) => {
    setStep('upload')
    await startUpload(selectedMappings)
  }, [startUpload])

  const handleCancel = useCallback(() => {
    cancelUpload()
  }, [cancelUpload])

  const handleComplete = useCallback(() => {
    // 모든 상태 초기화
    resetUpload()
    setStep('select')
    setFolderMappings([])
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
          <button
            type="button"
            className="help-icon-button"
            onClick={() => setHelpModalVisible(true)}
            aria-label="도움말"
          >
            <SFSymbol
              name="questionmark.circle"
              size={SFSymbolSize.CAPTION_1}
              weight={SFSymbolWeight.MEDIUM}
              decorative={true}
            />
          </button>
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
            <p><strong>📂 폴더 준비</strong></p>
            <ul>
              <li>폴더명 = <strong>고객 이름</strong>으로 설정</li>
              <li>예: "홍길동" 폴더 → 홍길동 고객에게 <strong>자동 연결</strong></li>
            </ul>
          </div>

          <div className="help-modal-section">
            <p><strong>🔄 업로드 순서</strong></p>
            <ul>
              <li><strong>1</strong>: 폴더 드래그 또는 선택</li>
              <li><strong>2</strong>: 폴더명-고객명 매칭 확인</li>
              <li><strong>3</strong>: "업로드 시작" 클릭</li>
            </ul>
          </div>

          <div className="help-modal-section">
            <p><strong>⚠️ 매칭 실패 시</strong></p>
            <ul>
              <li><strong>✗ 표시</strong> 폴더: 드롭다운에서 고객 수동 선택</li>
              <li>또는 폴더명을 고객명과 일치하게 수정</li>
            </ul>
          </div>

          <div className="help-modal-section">
            <p><strong>💡 팁</strong></p>
            <ul>
              <li>중복 파일: <strong>덮어쓰기/건너뛰기</strong> 선택</li>
              <li>업로드 중 <strong>일시정지/재개</strong> 가능</li>
            </ul>
          </div>
        </div>
      </Modal>
    </CenterPaneView>
  )
}
