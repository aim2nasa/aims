/**
 * useBatchUpload Hook
 * @since 2025-12-05
 * @version 1.1.0
 *
 * 고객 문서 일괄등록 상태 관리 Hook
 * - 업로드 큐 관리
 * - 진행률 추적
 * - 재시도 로직 (최대 3회)
 * - 취소 기능
 * - 중복 파일 감지 (SHA-256 해시 기반)
 */

import { useState, useCallback, useRef } from 'react'
import { BatchUploadApi, type FileUploadResult } from '../api/batchUploadApi'
import type { FolderMapping, DuplicateAction, DuplicateFileInfo } from '../types'
import {
  getCustomerFileHashes,
  checkDuplicateFile,
  type ExistingFileHash,
} from '@/shared/lib/fileValidation'

// ==================== 타입 정의 ====================

/**
 * 업로드 상태
 */
export type UploadState = 'idle' | 'uploading' | 'paused' | 'completed' | 'cancelled'

/**
 * 개별 파일 업로드 상태
 */
export interface FileUploadState {
  fileId: string
  fileName: string
  folderName: string
  customerId: string
  customerName: string
  status: 'pending' | 'checking' | 'uploading' | 'completed' | 'failed' | 'cancelled' | 'skipped'
  progress: number // 0-100
  error?: string
  retryCount: number
  fileHash?: string
  duplicateAction?: DuplicateAction
}

/**
 * 폴더 업로드 상태
 */
export interface FolderUploadState {
  folderName: string
  customerId: string
  customerName: string
  totalFiles: number
  completedFiles: number
  failedFiles: number
  status: 'pending' | 'uploading' | 'completed' | 'partial' | 'failed'
}

/**
 * 중복 검사 상태
 */
export interface DuplicateState {
  isChecking: boolean
  currentDuplicate: DuplicateFileInfo | null
  pendingDuplicates: DuplicateFileInfo[]
  resolvedCount: number
  totalDuplicates: number
  applyToAllAction: DuplicateAction | null
}

/**
 * 전체 업로드 진행 상태
 */
export interface BatchUploadProgress {
  state: UploadState
  totalFolders: number
  completedFolders: number
  totalFiles: number
  completedFiles: number
  failedFiles: number
  skippedFiles: number
  currentFolder?: string
  currentFile?: string
  overallProgress: number // 0-100
  folders: FolderUploadState[]
  files: FileUploadState[]
  startedAt?: Date
  completedAt?: Date
  duplicateState: DuplicateState
}

/**
 * Hook 반환 타입
 */
export interface UseBatchUploadReturn {
  progress: BatchUploadProgress
  startUpload: (mappings: FolderMapping[]) => Promise<void>
  pauseUpload: () => void
  resumeUpload: () => void
  cancelUpload: () => void
  retryFailed: () => Promise<void>
  reset: () => void
  handleDuplicateAction: (action: DuplicateAction, applyToAll: boolean) => void
}

// ==================== 상수 ====================

const MAX_RETRY_COUNT = 3
const MAX_CONCURRENT_UPLOADS = 3
const RETRY_DELAY_MS = 1000

// ==================== 유틸리티 ====================

// 🔒 보안: crypto.randomUUID 사용 (Math.random은 예측 가능)
function generateFileId(): string {
  return `file_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
}

function createInitialDuplicateState(): DuplicateState {
  return {
    isChecking: false,
    currentDuplicate: null,
    pendingDuplicates: [],
    resolvedCount: 0,
    totalDuplicates: 0,
    applyToAllAction: null,
  }
}

function createInitialProgress(): BatchUploadProgress {
  return {
    state: 'idle',
    totalFolders: 0,
    completedFolders: 0,
    totalFiles: 0,
    completedFiles: 0,
    failedFiles: 0,
    skippedFiles: 0,
    overallProgress: 0,
    folders: [],
    files: [],
    duplicateState: createInitialDuplicateState(),
  }
}

// ==================== Hook ====================

export function useBatchUpload(): UseBatchUploadReturn {
  const [progress, setProgress] = useState<BatchUploadProgress>(createInitialProgress())

  // 내부 상태 (React 상태와 동기화 필요 없음)
  const uploadQueueRef = useRef<FileUploadState[]>([])
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())
  const isPausedRef = useRef(false)
  const isCancelledRef = useRef(false)

  // 좀비 worker 방지를 위한 세대 카운터
  // 새 업로드가 시작될 때마다 증가하여, 이전 세대의 worker가 자동 종료됨
  const generationRef = useRef(0)

  // 중복 검사 관련 상태
  const duplicateResolverRef = useRef<((action: DuplicateAction) => void) | null>(null)
  const customerHashCacheRef = useRef<Map<string, ExistingFileHash[]>>(new Map())
  const fileMapRef = useRef<Map<string, File>>(new Map())
  const applyToAllActionRef = useRef<DuplicateAction | null>(null)

  /**
   * 전체 진행률 계산
   */
  const calculateOverallProgress = useCallback((files: FileUploadState[]): number => {
    if (files.length === 0) return 0

    const totalProgress = files.reduce((sum, file) => {
      if (file.status === 'completed') return sum + 100
      if (file.status === 'failed' || file.status === 'cancelled') return sum + 0
      return sum + file.progress
    }, 0)

    return Math.round(totalProgress / files.length)
  }, [])

  /**
   * 폴더 상태 업데이트
   */
  const updateFolderStates = useCallback((files: FileUploadState[]): FolderUploadState[] => {
    const folderMap = new Map<string, FolderUploadState>()

    files.forEach((file) => {
      const existing = folderMap.get(file.folderName)
      if (existing) {
        existing.totalFiles++
        if (file.status === 'completed' || file.status === 'skipped') existing.completedFiles++
        if (file.status === 'failed') existing.failedFiles++
      } else {
        folderMap.set(file.folderName, {
          folderName: file.folderName,
          customerId: file.customerId,
          customerName: file.customerName,
          totalFiles: 1,
          completedFiles: (file.status === 'completed' || file.status === 'skipped') ? 1 : 0,
          failedFiles: file.status === 'failed' ? 1 : 0,
          status: 'pending',
        })
      }
    })

    // 각 폴더의 상태 결정
    folderMap.forEach((folder) => {
      if (folder.completedFiles === folder.totalFiles) {
        folder.status = 'completed'
      } else if (folder.failedFiles === folder.totalFiles) {
        folder.status = 'failed'
      } else if (folder.completedFiles > 0 || folder.failedFiles > 0) {
        if (folder.failedFiles > 0 && folder.completedFiles > 0) {
          folder.status = 'partial'
        } else {
          folder.status = 'uploading'
        }
      }
    })

    return Array.from(folderMap.values())
  }, [])

  /**
   * 단일 파일 업로드 (재시도 포함)
   */
  const uploadSingleFile = useCallback(
    async (
      fileState: FileUploadState,
      file: File
    ): Promise<FileUploadResult> => {
      const controller = new AbortController()
      abortControllersRef.current.set(fileState.fileId, controller)

      const result = await BatchUploadApi.uploadFile(
        file,
        fileState.customerId,
        (loaded, total, fileName) => {
          const fileProgress = Math.round((loaded / total) * 100)

          setProgress((prev) => {
            const updatedFiles = prev.files.map((f) =>
              f.fileId === fileState.fileId
                ? { ...f, progress: fileProgress, status: 'uploading' as const }
                : f
            )

            return {
              ...prev,
              currentFile: fileName,
              files: updatedFiles,
              overallProgress: calculateOverallProgress(updatedFiles),
            }
          })
        },
        controller.signal
      )

      abortControllersRef.current.delete(fileState.fileId)
      return result
    },
    [calculateOverallProgress]
  )

  /**
   * 중복 검사 및 사용자 결정 대기
   */
  const waitForDuplicateDecision = useCallback(
    (duplicateInfo: DuplicateFileInfo): Promise<DuplicateAction> => {
      return new Promise((resolve) => {
        duplicateResolverRef.current = resolve

        setProgress((prev) => ({
          ...prev,
          state: 'paused',
          duplicateState: {
            ...prev.duplicateState,
            currentDuplicate: duplicateInfo,
          },
        }))
      })
    },
    []
  )

  /**
   * 업로드 큐 처리 (중복 검사 포함)
   */
  const processQueue = useCallback(async (mappings: FolderMapping[]) => {
    // 새 세대 시작 — 이전 세대의 worker들은 자동 종료됨
    const currentGeneration = ++generationRef.current
    console.log(`[useBatchUpload] 새 세대 시작: gen=${currentGeneration}, 파일 수=${mappings.reduce((sum, m) => sum + (m.matched ? m.files.length : 0), 0)}`)

    // 파일 상태 초기화
    const initialFiles: FileUploadState[] = []
    fileMapRef.current.clear()
    customerHashCacheRef.current.clear()

    mappings.forEach((mapping) => {
      if (!mapping.matched || !mapping.customerId) return

      mapping.files.forEach((file) => {
        const fileId = generateFileId()
        initialFiles.push({
          fileId,
          fileName: file.name,
          folderName: mapping.folderName,
          customerId: mapping.customerId!,
          customerName: mapping.customerName || mapping.folderName,
          status: 'pending',
          progress: 0,
          retryCount: 0,
        })
        fileMapRef.current.set(fileId, file)
      })
    })

    uploadQueueRef.current = [...initialFiles]

    // 초기 상태 설정
    const matchedFolders = mappings.filter((m) => m.matched)
    setProgress({
      state: 'uploading',
      totalFolders: matchedFolders.length,
      completedFolders: 0,
      totalFiles: initialFiles.length,
      completedFiles: 0,
      failedFiles: 0,
      skippedFiles: 0,
      currentFolder: matchedFolders[0]?.folderName,
      overallProgress: 0,
      folders: updateFolderStates(initialFiles),
      files: initialFiles,
      startedAt: new Date(),
      duplicateState: createInitialDuplicateState(),
    })

    // 고객별 해시 캐시 미리 로드
    const customerIds = [...new Set(initialFiles.map((f) => f.customerId))]
    setProgress((prev) => ({
      ...prev,
      duplicateState: { ...prev.duplicateState, isChecking: true },
    }))

    await Promise.all(
      customerIds.map(async (customerId) => {
        const hashes = await getCustomerFileHashes(customerId)
        customerHashCacheRef.current.set(customerId, hashes)
      })
    )

    setProgress((prev) => ({
      ...prev,
      duplicateState: { ...prev.duplicateState, isChecking: false },
    }))

    // 동시 업로드 처리
    const activeUploads: Promise<void>[] = []

    const processNextFile = async () => {
      while (true) {
        // 세대 확인 — 새 업로드가 시작되면 이전 worker 즉시 종료
        if (generationRef.current !== currentGeneration) {
          console.warn(`[useBatchUpload] 좀비 worker 종료: gen=${currentGeneration}, current=${generationRef.current}`)
          return
        }

        // 취소 확인
        if (isCancelledRef.current) return

        // 일시정지 확인 (중복 다이얼로그 대기 포함)
        if (isPausedRef.current) {
          await new Promise((resolve) => setTimeout(resolve, 100))
          // 일시정지 대기 중에도 세대/취소 확인
          if (generationRef.current !== currentGeneration || isCancelledRef.current) return
          continue
        }

        // 다음 파일 가져오기 - 즉시 상태 변경으로 race condition 방지
        const nextFile = uploadQueueRef.current.find(
          (f) => f.status === 'pending' && f.retryCount < MAX_RETRY_COUNT
        )
        if (!nextFile) return

        // 즉시 상태 변경하여 다른 워커가 가져가지 못하게 함
        nextFile.status = 'checking'

        // 파일 가져오기
        const file = fileMapRef.current.get(nextFile.fileId)
        if (!file) {
          nextFile.status = 'failed'
          nextFile.error = '파일을 찾을 수 없습니다'
          continue
        }

        // 중복 검사
        const existingHashes = customerHashCacheRef.current.get(nextFile.customerId) || []
        const duplicateResult = await checkDuplicateFile(file, existingHashes)
        nextFile.fileHash = duplicateResult.newFileHash

        if (duplicateResult.isDuplicate && duplicateResult.existingDoc) {
          let action: DuplicateAction | undefined = undefined

          // 다른 다이얼로그가 표시 중이면 대기 (race condition 방지)
          // isPausedRef 또는 duplicateResolverRef가 설정되어 있으면 다른 워커가 다이얼로그를 처리 중
          while (isPausedRef.current || duplicateResolverRef.current !== null) {
            await new Promise((resolve) => setTimeout(resolve, 50))

            // 세대/취소 확인 — 새 업로드 시작 시 대기 루프 즉시 탈출
            if (generationRef.current !== currentGeneration || isCancelledRef.current) return

            // 대기 중 applyToAll이 설정되었는지 확인 (ref 사용 - 동기적)
            if (applyToAllActionRef.current) {
              action = applyToAllActionRef.current
              break
            }
          }

          // action이 이미 설정되지 않았으면 applyToAll 또는 다이얼로그로 결정
          if (!action) {
            // applyToAllActionRef 확인 (동기적)
            if (applyToAllActionRef.current) {
              action = applyToAllActionRef.current
            } else {
              // 사용자에게 결정 요청
              isPausedRef.current = true

              const duplicateInfo: DuplicateFileInfo = {
                file,
                fileId: nextFile.fileId,
                folderName: nextFile.folderName,
                customerId: nextFile.customerId,
                customerName: nextFile.customerName,
                newFileHash: duplicateResult.newFileHash,
                newFileSize: file.size,
                existingDocumentId: duplicateResult.existingDoc.documentId,
                existingFileName: duplicateResult.existingDoc.fileName,
                existingFileSize: duplicateResult.existingDoc.fileSize,
                existingUploadedAt: duplicateResult.existingDoc.uploadedAt,
              }

              action = await waitForDuplicateDecision(duplicateInfo)
              isPausedRef.current = false
            }
          }

          // 액션 처리
          nextFile.duplicateAction = action

          if (action === 'skip') {
            nextFile.status = 'skipped'
            nextFile.progress = 100

            // 상태 업데이트
            setProgress((prev) => {
              const updatedFiles = prev.files.map((f) =>
                f.fileId === nextFile.fileId ? { ...nextFile } : f
              )
              const skippedFiles = updatedFiles.filter((f) => f.status === 'skipped').length
              const completedFiles = updatedFiles.filter((f) => f.status === 'completed').length
              const folders = updateFolderStates(updatedFiles)

              return {
                ...prev,
                skippedFiles,
                completedFiles,
                files: updatedFiles,
                folders,
                overallProgress: calculateOverallProgress(updatedFiles),
                duplicateState: {
                  ...prev.duplicateState,
                  currentDuplicate: null,
                  resolvedCount: prev.duplicateState.resolvedCount + 1,
                },
              }
            })
            continue
          }

          // hash 기반 중복: skip만 가능 (동일 파일이므로 덮어쓰기/둘다유지 무의미)
          // skip이 아닌 경우는 이미 위에서 처리됨 (continue 또는 cancel)
        }

        // 상태 업데이트 - 업로드 시작
        // ⚠️ duplicateState를 건드리지 않음 — 다른 워커의 중복 다이얼로그를 언마운트시키는 버그 방지
        nextFile.status = 'uploading'
        setProgress((prev) => ({
          ...prev,
          state: 'uploading',
          currentFile: nextFile.fileName,
          currentFolder: nextFile.folderName,
          files: prev.files.map((f) =>
            f.fileId === nextFile.fileId ? { ...f, status: 'uploading' } : f
          ),
        }))

        // 파일 업로드
        const uploadFile = fileMapRef.current.get(nextFile.fileId)
        if (!uploadFile) {
          nextFile.status = 'failed'
          nextFile.error = '파일을 찾을 수 없습니다'
          continue
        }

        const result = await uploadSingleFile(nextFile, uploadFile)

        if (result.success) {
          nextFile.status = 'completed'
          nextFile.progress = 100

          // 해시 캐시 업데이트 (새로 업로드된 파일 추가)
          const hashes = customerHashCacheRef.current.get(nextFile.customerId) || []
          hashes.push({
            documentId: result.fileId || '',
            fileName: nextFile.fileName,
            fileHash: nextFile.fileHash || '',
            fileSize: uploadFile.size,
            uploadedAt: new Date().toISOString(),
          })
        } else {
          // 바이러스 감지 에러는 재시도 없이 즉시 실패 처리
          const isVirusError = result.error?.includes('바이러스 감지')
          if (isVirusError) {
            nextFile.status = 'failed'
            nextFile.error = result.error
            console.warn(`[useBatchUpload] 🛡️ 바이러스 감지로 즉시 실패: ${nextFile.fileName}`)
          } else {
            nextFile.retryCount++
            if (nextFile.retryCount < MAX_RETRY_COUNT) {
              nextFile.status = 'pending'
              await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
            } else {
              nextFile.status = 'failed'
              nextFile.error = result.error
            }
          }
        }

        // 상태 업데이트
        setProgress((prev) => {
          const updatedFiles = prev.files.map((f) =>
            f.fileId === nextFile.fileId ? { ...nextFile } : f
          )

          const completedFiles = updatedFiles.filter((f) => f.status === 'completed').length
          const failedFiles = updatedFiles.filter((f) => f.status === 'failed').length
          const skippedFiles = updatedFiles.filter((f) => f.status === 'skipped').length
          const folders = updateFolderStates(updatedFiles)
          const completedFolders = folders.filter(
            (f) => f.status === 'completed' || f.status === 'partial'
          ).length

          return {
            ...prev,
            completedFiles,
            failedFiles,
            skippedFiles,
            completedFolders,
            files: updatedFiles,
            folders,
            overallProgress: calculateOverallProgress(updatedFiles),
          }
        })
      }
    }

    // 동시 업로드 시작
    for (let i = 0; i < MAX_CONCURRENT_UPLOADS; i++) {
      activeUploads.push(processNextFile())
    }

    await Promise.all(activeUploads)

    // 완료 상태 설정 — 현재 세대인 경우만 (이전 세대 worker가 완료해도 무시)
    if (!isCancelledRef.current && generationRef.current === currentGeneration) {
      setProgress((prev) => ({
        ...prev,
        state: 'completed',
        currentFile: undefined,
        currentFolder: undefined,
        completedAt: new Date(),
        duplicateState: {
          ...prev.duplicateState,
          currentDuplicate: null,
        },
      }))
    }
  }, [calculateOverallProgress, updateFolderStates, uploadSingleFile, waitForDuplicateDecision])

  /**
   * 업로드 시작
   */
  const startUpload = useCallback(
    async (mappings: FolderMapping[]) => {
      // 이전 작업이 진행 중이면 완전 정리
      // (페이지 이탈 후 복귀 시 좀비 worker 방지)
      console.log(`[useBatchUpload] startUpload 호출: 이전 세대=${generationRef.current} 정리 시작`)
      isCancelledRef.current = true // 이전 worker들에게 종료 신호
      abortControllersRef.current.forEach((controller) => controller.abort())
      abortControllersRef.current.clear()
      duplicateResolverRef.current = null
      applyToAllActionRef.current = null

      // 이전 worker들이 취소 신호를 확인할 시간 확보
      await new Promise((resolve) => setTimeout(resolve, 50))

      // 새 작업 시작
      isPausedRef.current = false
      isCancelledRef.current = false
      await processQueue(mappings)
    },
    [processQueue]
  )

  /**
   * 업로드 일시정지
   */
  const pauseUpload = useCallback(() => {
    isPausedRef.current = true
    setProgress((prev) => ({ ...prev, state: 'paused' }))
  }, [])

  /**
   * 업로드 재개
   */
  const resumeUpload = useCallback(() => {
    isPausedRef.current = false
    setProgress((prev) => ({ ...prev, state: 'uploading' }))
  }, [])

  /**
   * 업로드 취소
   */
  const cancelUpload = useCallback(() => {
    // 세대 증가로 모든 worker 즉시 종료
    generationRef.current++
    isCancelledRef.current = true
    isPausedRef.current = false
    duplicateResolverRef.current = null

    // 모든 활성 업로드 취소
    abortControllersRef.current.forEach((controller) => {
      controller.abort()
    })
    abortControllersRef.current.clear()

    setProgress((prev) => ({
      ...prev,
      state: 'cancelled',
      files: prev.files.map((f) =>
        f.status === 'pending' || f.status === 'uploading'
          ? { ...f, status: 'cancelled' }
          : f
      ),
      duplicateState: {
        ...prev.duplicateState,
        currentDuplicate: null,
      },
    }))
  }, [])

  /**
   * 실패한 파일 재시도
   */
  const retryFailed = useCallback(async () => {
    setProgress((prev) => ({
      ...prev,
      state: 'uploading',
      files: prev.files.map((f) =>
        f.status === 'failed' ? { ...f, status: 'pending', retryCount: 0, error: undefined } : f
      ),
    }))

    isPausedRef.current = false
    isCancelledRef.current = false

    // TODO: 실패한 파일만 다시 업로드하는 로직 필요
    // 현재는 전체 재시작이 필요함
  }, [])

  /**
   * 상태 초기화
   */
  const reset = useCallback(() => {
    // 세대 증가로 진행 중인 worker 즉시 종료
    generationRef.current++
    isPausedRef.current = false
    isCancelledRef.current = true // 혹시 남아있는 worker 정리
    abortControllersRef.current.forEach((controller) => controller.abort())
    abortControllersRef.current.clear()
    uploadQueueRef.current = []
    fileMapRef.current.clear()
    customerHashCacheRef.current.clear()
    duplicateResolverRef.current = null
    applyToAllActionRef.current = null
    setProgress(createInitialProgress())
  }, [])

  /**
   * 중복 파일 처리 결정
   */
  const handleDuplicateAction = useCallback((action: DuplicateAction, applyToAll: boolean) => {
    // applyToAll 설정 - ref 먼저 설정 (동기적으로 다른 워커가 바로 확인 가능)
    if (applyToAll) {
      applyToAllActionRef.current = action
      setProgress((prev) => ({
        ...prev,
        duplicateState: {
          ...prev.duplicateState,
          applyToAllAction: action,
        },
      }))
    }

    // resolver 호출하여 대기 중인 Promise 해결
    if (duplicateResolverRef.current) {
      duplicateResolverRef.current(action)
      duplicateResolverRef.current = null
    }
  }, [])

  return {
    progress,
    startUpload,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    retryFailed,
    reset,
    handleDuplicateAction,
  }
}
