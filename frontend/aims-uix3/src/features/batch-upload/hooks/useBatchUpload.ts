/**
 * useBatchUpload Hook
 * @since 2025-12-05
 * @version 1.0.0
 *
 * 고객 문서 일괄등록 상태 관리 Hook
 * - 업로드 큐 관리
 * - 진행률 추적
 * - 재시도 로직 (최대 3회)
 * - 취소 기능
 */

import { useState, useCallback, useRef } from 'react'
import { BatchUploadApi, type FileUploadResult } from '../api/batchUploadApi'
import type { FolderMapping } from '../types'

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
  status: 'pending' | 'uploading' | 'completed' | 'failed' | 'cancelled'
  progress: number // 0-100
  error?: string
  retryCount: number
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
 * 전체 업로드 진행 상태
 */
export interface BatchUploadProgress {
  state: UploadState
  totalFolders: number
  completedFolders: number
  totalFiles: number
  completedFiles: number
  failedFiles: number
  currentFolder?: string
  currentFile?: string
  overallProgress: number // 0-100
  folders: FolderUploadState[]
  files: FileUploadState[]
  startedAt?: Date
  completedAt?: Date
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
}

// ==================== 상수 ====================

const MAX_RETRY_COUNT = 3
const MAX_CONCURRENT_UPLOADS = 3
const RETRY_DELAY_MS = 1000

// ==================== 유틸리티 ====================

function generateFileId(): string {
  return `file_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function createInitialProgress(): BatchUploadProgress {
  return {
    state: 'idle',
    totalFolders: 0,
    completedFolders: 0,
    totalFiles: 0,
    completedFiles: 0,
    failedFiles: 0,
    overallProgress: 0,
    folders: [],
    files: [],
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
        if (file.status === 'completed') existing.completedFiles++
        if (file.status === 'failed') existing.failedFiles++
      } else {
        folderMap.set(file.folderName, {
          folderName: file.folderName,
          customerId: file.customerId,
          customerName: file.folderName, // 매칭된 경우 같음
          totalFiles: 1,
          completedFiles: file.status === 'completed' ? 1 : 0,
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
    async (fileState: FileUploadState, file: File): Promise<FileUploadResult> => {
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
   * 업로드 큐 처리
   */
  const processQueue = useCallback(async (mappings: FolderMapping[]) => {
    // 파일 상태 초기화
    const initialFiles: FileUploadState[] = []
    const fileMap = new Map<string, File>()

    mappings.forEach((mapping) => {
      if (!mapping.matched || !mapping.customerId) return

      mapping.files.forEach((file) => {
        const fileId = generateFileId()
        initialFiles.push({
          fileId,
          fileName: file.name,
          folderName: mapping.folderName,
          customerId: mapping.customerId!,
          status: 'pending',
          progress: 0,
          retryCount: 0,
        })
        fileMap.set(fileId, file)
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
      currentFolder: matchedFolders[0]?.folderName,
      overallProgress: 0,
      folders: updateFolderStates(initialFiles),
      files: initialFiles,
      startedAt: new Date(),
    })

    // 동시 업로드 처리
    const activeUploads: Promise<void>[] = []

    const processNextFile = async () => {
      while (true) {
        // 취소 또는 일시정지 확인
        if (isCancelledRef.current) return
        if (isPausedRef.current) {
          await new Promise((resolve) => setTimeout(resolve, 100))
          continue
        }

        // 다음 파일 가져오기
        const nextFile = uploadQueueRef.current.find(
          (f) => f.status === 'pending' && f.retryCount < MAX_RETRY_COUNT
        )
        if (!nextFile) return

        // 상태 업데이트
        nextFile.status = 'uploading'
        setProgress((prev) => ({
          ...prev,
          currentFile: nextFile.fileName,
          currentFolder: nextFile.folderName,
          files: prev.files.map((f) =>
            f.fileId === nextFile.fileId ? { ...f, status: 'uploading' } : f
          ),
        }))

        // 파일 업로드
        const file = fileMap.get(nextFile.fileId)
        if (!file) {
          nextFile.status = 'failed'
          nextFile.error = '파일을 찾을 수 없습니다'
          continue
        }

        const result = await uploadSingleFile(nextFile, file)

        if (result.success) {
          nextFile.status = 'completed'
          nextFile.progress = 100
        } else {
          nextFile.retryCount++
          if (nextFile.retryCount < MAX_RETRY_COUNT) {
            // 재시도
            nextFile.status = 'pending'
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
          } else {
            nextFile.status = 'failed'
            nextFile.error = result.error
          }
        }

        // 상태 업데이트
        setProgress((prev) => {
          const updatedFiles = prev.files.map((f) =>
            f.fileId === nextFile.fileId ? { ...nextFile } : f
          )

          const completedFiles = updatedFiles.filter((f) => f.status === 'completed').length
          const failedFiles = updatedFiles.filter((f) => f.status === 'failed').length
          const folders = updateFolderStates(updatedFiles)
          const completedFolders = folders.filter(
            (f) => f.status === 'completed' || f.status === 'partial'
          ).length

          return {
            ...prev,
            completedFiles,
            failedFiles,
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

    // 완료 상태 설정
    if (!isCancelledRef.current) {
      setProgress((prev) => ({
        ...prev,
        state: 'completed',
        currentFile: undefined,
        currentFolder: undefined,
        completedAt: new Date(),
      }))
    }
  }, [calculateOverallProgress, updateFolderStates, uploadSingleFile])

  /**
   * 업로드 시작
   */
  const startUpload = useCallback(
    async (mappings: FolderMapping[]) => {
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
    isCancelledRef.current = true
    isPausedRef.current = false

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
    isPausedRef.current = false
    isCancelledRef.current = false
    abortControllersRef.current.clear()
    uploadQueueRef.current = []
    setProgress(createInitialProgress())
  }, [])

  return {
    progress,
    startUpload,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    retryFailed,
    reset,
  }
}
