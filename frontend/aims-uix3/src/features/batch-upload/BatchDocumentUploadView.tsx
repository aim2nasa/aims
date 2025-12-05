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
import FolderDropZone from './components/FolderDropZone'
import MappingPreview from './components/MappingPreview'
import UploadProgress from './components/UploadProgress'
import UploadSummary from './components/UploadSummary'
import { useBatchUpload } from './hooks/useBatchUpload'
import { BatchUploadApi } from './api/batchUploadApi'
import { groupFilesByFolder, createFolderMappings, type CustomerForMatching } from './utils/customerMatcher'
import { validateBatch } from './utils/fileValidation'
import type { FolderMapping } from './types'
import { TIER_LIMITS } from './types'
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
}

export default function BatchDocumentUploadView({
  visible,
  onClose
}: BatchDocumentUploadViewProps) {
  const [step, setStep] = useState<'select' | 'preview' | 'upload' | 'complete'>('select')
  const [folderMappings, setFolderMappings] = useState<FolderMapping[]>([])
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [customers, setCustomers] = useState<CustomerForMatching[]>([])
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false)
  const [restoredMetadata, setRestoredMetadata] = useState<SerializedState['folderMappingsMetadata'] | null>(null)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const isInitializedRef = useRef(false)

  // 업로드 훅
  const {
    progress,
    startUpload,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    retryFailed,
    reset: resetUpload,
  } = useBatchUpload()

  // 현재 사용자의 등급별 배치 업로드 한도 (임시: 일반 등급)
  const tierLimit = TIER_LIMITS.STANDARD.maxBatchUpload

  // sessionStorage에서 상태 복원 (최초 1회)
  useEffect(() => {
    if (isInitializedRef.current) return
    isInitializedRef.current = true

    const saved = loadFromSessionStorage()
    if (saved) {
      // 고객 목록 복원
      if (saved.customers.length > 0) {
        setCustomers(saved.customers)
      }

      // preview 단계였다면 메타데이터만 복원
      if (saved.step === 'preview' && saved.folderMappingsMetadata.length > 0) {
        setRestoredMetadata(saved.folderMappingsMetadata)
        // Mock File 객체 생성 (트리 구조 표시용, 실제 업로드 불가)
        const restoredMappings: FolderMapping[] = saved.folderMappingsMetadata.map(meta => {
          // serializedFiles가 있으면 사용, 없으면 빈 배열
          const serializedFiles = meta.serializedFiles || []

          return {
            folderName: meta.folderName,
            customerId: meta.customerId,
            customerName: meta.customerName,
            matched: meta.matched,
            fileCount: meta.fileCount,
            totalSize: meta.totalSize,
            // Mock File 객체 생성 (webkitRelativePath 포함)
            files: serializedFiles.map(sf => {
              // File-like 객체 생성 (실제 File이 아니지만 트리 표시에 필요한 속성 포함)
              const mockFile = new File([], sf.name, { type: 'application/octet-stream' })
              Object.defineProperty(mockFile, 'size', { value: sf.size, writable: false })
              Object.defineProperty(mockFile, 'webkitRelativePath', { value: sf.webkitRelativePath, writable: false })
              return mockFile
            })
          }
        })
        setFolderMappings(restoredMappings)

        // 펼쳐진 폴더 상태 복원
        if (saved.expandedPaths && saved.expandedPaths.length > 0) {
          setExpandedPaths(new Set(saved.expandedPaths))
        }

        setStep('preview')
      }
    }
  }, [])

  // 상태 변경 시 sessionStorage에 저장
  useEffect(() => {
    if (!isInitializedRef.current) return
    if (step === 'upload') return // 업로드 중에는 저장하지 않음

    saveToSessionStorage(step, customers, folderMappings, Array.from(expandedPaths))
  }, [step, customers, folderMappings, expandedPaths])

  // 고객 목록 로드
  useEffect(() => {
    if (visible && customers.length === 0) {
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
  }, [visible, customers.length])

  // 업로드 완료 감지
  useEffect(() => {
    if (progress.state === 'completed' || progress.state === 'cancelled') {
      setStep('complete')
    }
  }, [progress.state])

  const handleFilesSelected = useCallback((files: File[]) => {
    // 복원된 메타데이터 초기화 (새 파일 선택됨)
    setRestoredMetadata(null)

    // 1. 파일을 폴더별로 그룹화
    const fileGroups = groupFilesByFolder(files)

    if (fileGroups.size === 0) {
      setValidationErrors(['폴더 구조가 없는 파일입니다. 폴더를 선택해주세요.'])
      return
    }

    // 2. 파일 검증
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
    setFolderMappings(mappings)

    // 4. 기본 펼침 상태 설정 (루트 폴더들만)
    setExpandedPaths(new Set(mappings.map(m => m.folderName)))

    // 5. 미리보기 단계로 이동
    if (mappings.length > 0) {
      setStep('preview')
    }
  }, [tierLimit, customers])

  const handleBack = useCallback(() => {
    setStep('select')
    setFolderMappings([])
    setValidationErrors([])
    setRestoredMetadata(null)
    setExpandedPaths(new Set())
  }, [])

  const handleStartUpload = useCallback(async () => {
    setStep('upload')
    await startUpload(folderMappings)
  }, [folderMappings, startUpload])

  const handleCancel = useCallback(() => {
    cancelUpload()
  }, [cancelUpload])

  const handleComplete = useCallback(() => {
    // 모든 상태 초기화
    resetUpload()
    setStep('select')
    setFolderMappings([])
    setValidationErrors([])
    setRestoredMetadata(null)
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
              disabled={isLoadingCustomers}
            />
            {isLoadingCustomers && (
              <div className="batch-upload-loading">
                <span>고객 목록을 불러오는 중...</span>
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
              isRestored={restoredMetadata !== null}
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
            />
          </div>
        )
    }
  }

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
    >
      {renderContent()}
    </CenterPaneView>
  )
}
