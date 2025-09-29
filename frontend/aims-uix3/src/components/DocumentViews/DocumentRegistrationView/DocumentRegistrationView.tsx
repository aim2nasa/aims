/**
 * DocumentRegistrationView Component
 * @since 1.0.0
 *
 * 문서 등록 View 컴포넌트
 * 애플 스타일의 파일 업로드 시스템 구현
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol'
import FileUploadArea from './FileUploadArea/FileUploadArea'
import FileList from './FileList/FileList'
import ProgressIndicator from './ProgressIndicator/ProgressIndicator'
import { UploadFile, UploadState, UploadStatus, UploadProgressEvent } from './types/uploadTypes'
import { uploadService, fileValidator } from './services/uploadService'
import { uploadConfig } from './services/userContextService'
import './DocumentRegistrationView.css'

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
  // SessionStorage 키
  const SESSION_KEY = 'document-upload-state'

  // 초기 상태 복원 또는 기본값
  const getInitialState = (): UploadState => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        // File 객체와 completedAt 복원
        const restoredFiles = parsed.files?.map((savedFile: any) => {
          // 더미 File 객체 생성 (실제 파일은 복원 불가)
          const dummyFile = new File(
            [''], // 빈 내용
            savedFile.fileInfo?.name || 'unknown',
            {
              type: savedFile.fileInfo?.type || 'application/octet-stream',
              lastModified: savedFile.fileInfo?.lastModified || Date.now()
            }
          )

          return {
            id: savedFile.id,
            file: dummyFile,
            fileSize: savedFile.fileSize || savedFile.fileInfo?.size || 0, // fileSize 복원
            status: savedFile.status,
            progress: savedFile.progress,
            error: savedFile.error,
            completedAt: savedFile.completedAt ? new Date(savedFile.completedAt) : undefined,
            relativePath: savedFile.relativePath
          }
        })

        return {
          ...parsed,
          files: restoredFiles || [],
          uploading: false // 새로고침 시 업로드 상태는 초기화
        }
      }
    } catch (error) {
      console.warn('[DocumentRegistrationView] Failed to restore state:', error)
    }

    return {
      files: [],
      uploading: false,
      totalProgress: 0,
      completedCount: 0,
      errors: [],
      context: {
        identifierType: 'userId',
        identifierValue: 'rossi.kwak@gmail.com'
      }
    }
  }

  // 업로드 상태 관리
  const [uploadState, setUploadState] = useState<UploadState>(getInitialState)

  // 자동 성공 메시지 숨김 타이머
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)

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
          relativePath: file.relativePath,
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
    }
  }, [uploadState, SESSION_KEY])

  /**
   * 고유 ID 생성
   */
  const generateFileId = useCallback((): string => {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }, [])

  /**
   * 파일 선택 핸들러
   */
  const handleFilesSelected = useCallback((files: File[]) => {
    const newUploadFiles: UploadFile[] = []

    files.forEach(file => {
      // 파일 검증
      const validation = fileValidator.validateFile(file)

      if (validation.valid) {
        newUploadFiles.push({
          id: generateFileId(),
          file,
          fileSize: file.size, // 파일 크기 보존
          status: 'pending',
          progress: 0,
          error: undefined,
          completedAt: undefined,
          relativePath: (file as any).webkitRelativePath || undefined
        })
      } else {
        // 검증 실패한 파일은 에러로 표시
        const errorFile: UploadFile = {
          id: generateFileId(),
          file,
          fileSize: file.size, // 파일 크기 보존
          status: 'error',
          progress: 0,
          error: validation.errors.join(', ')
        }
        newUploadFiles.push(errorFile)
      }
    })

    // 크기 초과 파일 개수 확인 및 팝업 표시
    const oversizedFiles = newUploadFiles.filter(f =>
      f.status === 'error' && f.error?.includes('MB 초과')
    )

    if (oversizedFiles.length > 0) {
      const oversizedCount = oversizedFiles.length

      // 애플 스타일 확인 팝업
      const confirmed = window.confirm(
        `총 ${newUploadFiles.length}개 파일들중 50MB를 초과하는 ${oversizedCount}개 파일들은 업로드에서 제외됩니다.`
      )

      if (!confirmed) {
        return // 사용자가 취소하면 아무것도 하지 않음
      }
    }

    // 상태 업데이트 - 새 파일을 맨 앞에 추가
    setUploadState(prev => ({
      ...prev,
      files: [...newUploadFiles, ...prev.files]
    }))

    // 유효한 파일들만 업로드 큐에 추가
    const validFiles = newUploadFiles.filter(f => f.status === 'pending')
    if (validFiles.length > 0) {
      uploadService.queueFiles(validFiles)
    }
  }, [generateFileId])

  /**
   * 파일 제거 핸들러
   */
  const handleRemoveFile = useCallback((fileId: string) => {
    // 업로드 취소
    uploadService.cancelUpload(fileId)

    // 상태에서 제거
    setUploadState(prev => ({
      ...prev,
      files: prev.files.filter(f => f.id !== fileId)
    }))
  }, [])

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
   * 상태 완전 초기화 (수동)
   */
  const handleClearAll = useCallback(() => {
    uploadService.cancelAllUploads()
    setUploadState({
      files: [],
      uploading: false,
      totalProgress: 0,
      completedCount: 0,
      errors: [],
      context: {
        identifierType: 'userId',
        identifierValue: 'rossi.kwak@gmail.com'
      }
    })
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch (error) {
      console.warn('[DocumentRegistrationView] Failed to clear state:', error)
    }
  }, [SESSION_KEY])

  /**
   * 업로드 진행률 콜백
   */
  const handleProgress = useCallback((event: UploadProgressEvent) => {
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
   * 업로드 상태 변경 콜백
   */
  const handleStatusChange = useCallback((fileId: string, status: UploadStatus, error?: string) => {
    setUploadState(prev => {
      const updatedFiles = prev.files.map(f => {
        if (f.id === fileId) {
          const updatedFile = { ...f, status, error }
          if (status === 'completed') {
            updatedFile.completedAt = new Date()
            updatedFile.progress = 100
          }
          return updatedFile
        }
        return f
      })

      const completedCount = updatedFiles.filter(f => f.status === 'completed').length
      const uploadingCount = updatedFiles.filter(f => f.status === 'uploading').length
      const totalProgress = updatedFiles.length > 0
        ? Math.round(updatedFiles.reduce((sum, f) => sum + (f.status === 'completed' ? 100 : f.progress), 0) / updatedFiles.length)
        : 0

      return {
        ...prev,
        files: updatedFiles,
        uploading: uploadingCount > 0,
        totalProgress,
        completedCount
      }
    })
  }, [])

  /**
   * 업로드 서비스 콜백 설정
   */
  useEffect(() => {
    uploadService.setProgressCallback(handleProgress)
    uploadService.setStatusCallback(handleStatusChange)

    return () => {
      uploadService.cleanup()
    }
  }, [handleProgress, handleStatusChange])

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
      uploadState.files.every(f => f.status === 'completed' || f.status === 'error')
    const hasSuccessfulUploads = uploadState.files.some(f => f.status === 'completed')

    // 모든 업로드 완료 후 5분 뒤 자동 정리 (사용자가 수동으로 정리하지 않은 경우)
    if (allCompleted && hasSuccessfulUploads && !uploadState.uploading) {
      const autoCleanupTimer = setTimeout(() => {
        try {
          sessionStorage.removeItem(SESSION_KEY)
          console.log('[DocumentRegistrationView] Auto-cleanup completed upload state')
        } catch (error) {
          console.warn('[DocumentRegistrationView] Failed to auto-clear state:', error)
        }
      }, 5 * 60 * 1000) // 5분

      return () => clearTimeout(autoCleanupTimer)
    }
    return undefined
  }, [uploadState, SESSION_KEY])

  /**
   * 성공 메시지 자동 숨김
   */
  useEffect(() => {
    const allCompleted = uploadState.files.length > 0 &&
      uploadState.files.every(f => f.status === 'completed' || f.status === 'error')
    const hasSuccessfulUploads = uploadState.files.some(f => f.status === 'completed')

    if (allCompleted && hasSuccessfulUploads && !uploadState.uploading) {
      setShowSuccessMessage(true)

      // 3초 후 성공 메시지 숨김
      const timer = setTimeout(() => {
        setShowSuccessMessage(false)
      }, 3000)

      return () => clearTimeout(timer)
    } else {
      setShowSuccessMessage(false)
    }

    return undefined
  }, [uploadState.files, uploadState.uploading])

  /**
   * 파일 선택 옵션
   */
  const fileSelectionOptions = useMemo(() => ({
    multiple: true,
    directory: true,
    maxFileSize: uploadConfig.limits.maxFileSize,
    maxFileCount: uploadConfig.limits.maxFileCount
  }), [])

  /**
   * 통계 계산
   */
  const stats = useMemo(() => {
    const total = uploadState.files.length
    const completed = uploadState.files.filter(f => f.status === 'completed').length
    const errors = uploadState.files.filter(f => f.status === 'error').length
    const uploading = uploadState.files.filter(f => f.status === 'uploading').length

    return { total, completed, errors, uploading }
  }, [uploadState.files])

  // 제목에 진행 상태 표시
  const getTitle = () => {
    if (uploadState.uploading) {
      return `문서 등록 (업로드 중... ${stats.completed}/${stats.total})`
    }
    if (stats.total > 0 && !uploadState.uploading) {
      return `문서 등록 (${stats.completed}/${stats.total} 완료)`
    }
    return "문서 등록"
  }

  return (
    <CenterPaneView
      visible={visible}
      title={getTitle()}
      onClose={onClose}
      marginTop={4}
      marginBottom={4}
      marginLeft={4}
      marginRight={4}
      className="document-registration-view"
      placeholderIcon="doc.badge.plus"
      placeholderMessage="문서를 업로드하여 시스템에 등록할 수 있습니다"
    >
      <div className="document-registration-content">
        {/* 파일 업로드 영역 */}
        <FileUploadArea
          onFilesSelected={handleFilesSelected}
          options={fileSelectionOptions}
          uploading={uploadState.uploading}
          disabled={false}
        />

        {/* 진행률 표시 (업로드 중이거나 성공 메시지 표시 중일 때) */}
        {(uploadState.uploading || showSuccessMessage) && (
          <ProgressIndicator
            uploadState={uploadState}
            onCancel={uploadState.uploading ? handleCancelAll : (() => {})}
          />
        )}

        {/* 파일 목록 */}
        {uploadState.files.length > 0 && (
          <FileList
            files={uploadState.files}
            onRemoveFile={handleRemoveFile}
            onRetryFile={handleRetryFile}
            onClearAll={handleClearAll}
            readonly={false}
          />
        )}

        {/* 🍎 SUCCESS MESSAGE: Ultra-minimal notification */}
        {showSuccessMessage && stats.completed > 0 && (
          <div className="upload-success">
            <div className="upload-success__content">
              <SFSymbol
                name="checkmark"
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.MEDIUM}
                className="upload-success__icon"
              />
              <span className="upload-success__text">
                {stats.errors > 0
                  ? `${stats.completed} uploaded, ${stats.errors} errors`
                  : `${stats.completed} files uploaded`
                }
              </span>
              {!uploadState.uploading && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="upload-success__button"
                  aria-label="Clear completed uploads"
                >
                  <SFSymbol
                    name="xmark"
                    size={SFSymbolSize.CAPTION_1}
                    weight={SFSymbolWeight.MEDIUM}
                  />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </CenterPaneView>
  )
}

export default DocumentRegistrationView