/**
 * Upload Service
 * @since 1.0.0
 *
 * 파일 업로드를 위한 백엔드 통신 서비스
 * 병렬 업로드, 진행률 추적, 에러 처리 지원
 */

import {
  UploadFile,
  UploadProgressEvent,
  UploadStatus
} from '../types/uploadTypes'
import { UserContextService, uploadConfig } from './userContextService'

/**
 * 업로드 진행률 콜백 타입
 */
type ProgressCallback = (event: UploadProgressEvent) => void
type StatusCallback = (fileId: string, status: UploadStatus, error?: string) => void

/**
 * 업로드 서비스 클래스
 *
 * 특징:
 * - 병렬 업로드 지원 (최대 3개 동시)
 * - 실시간 진행률 추적
 * - 에러 처리 및 재시도
 * - 업로드 취소 지원
 * - 확장 가능한 사용자 컨텍스트
 */
export class UploadService {
  private activeUploads = new Map<string, AbortController>()
  private uploadQueue: UploadFile[] = []
  private isProcessing = false

  private progressCallback?: ProgressCallback | undefined
  private statusCallback?: StatusCallback | undefined

  /**
   * 진행률 콜백 설정
   */
  setProgressCallback(callback: ProgressCallback): void {
    this.progressCallback = callback
  }

  /**
   * 상태 변경 콜백 설정
   */
  setStatusCallback(callback: StatusCallback): void {
    this.statusCallback = callback
  }

  /**
   * 파일들을 업로드 큐에 추가
   */
  async queueFiles(files: UploadFile[]): Promise<void> {
    // 큐에 추가
    this.uploadQueue.push(...files)

    // 업로드 처리 시작
    if (!this.isProcessing) {
      this.processQueue()
    }
  }

  /**
   * 특정 파일 업로드 취소
   */
  cancelUpload(fileId: string): void {
    const controller = this.activeUploads.get(fileId)
    if (controller) {
      controller.abort()
      this.activeUploads.delete(fileId)
      this.statusCallback?.(fileId, 'cancelled')
    }

    // 큐에서도 제거
    this.uploadQueue = this.uploadQueue.filter(file => file.id !== fileId)
  }

  /**
   * 모든 업로드 취소
   */
  cancelAllUploads(): void {
    // 활성 업로드들 취소
    this.activeUploads.forEach((controller, fileId) => {
      controller.abort()
      this.statusCallback?.(fileId, 'cancelled')
    })
    this.activeUploads.clear()

    // 큐 비우기
    this.uploadQueue.forEach(file => {
      this.statusCallback?.(file.id, 'cancelled')
    })
    this.uploadQueue = []

    this.isProcessing = false
  }

  /**
   * 업로드 큐 처리
   */
  private async processQueue(): Promise<void> {
    this.isProcessing = true

    while (this.uploadQueue.length > 0 || this.activeUploads.size > 0) {
      // 동시 업로드 제한 확인
      while (
        this.activeUploads.size < uploadConfig.limits.maxConcurrentUploads &&
        this.uploadQueue.length > 0
      ) {
        const file = this.uploadQueue.shift()!
        this.uploadFile(file)
      }

      // 잠시 대기 (CPU 사용률 조절)
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    this.isProcessing = false
  }

  /**
   * 개별 파일 업로드
   */
  private async uploadFile(uploadFile: UploadFile): Promise<void> {
    const { id, file } = uploadFile
    const controller = new AbortController()

    try {
      // 활성 업로드 목록에 추가
      this.activeUploads.set(id, controller)

      // 상태를 업로딩으로 변경
      this.statusCallback?.(id, 'uploading')

      // FormData 생성 (사용자 컨텍스트 포함)
      const formData = UserContextService.createFormData(file)

      // XMLHttpRequest로 업로드 (진행률 추적을 위해)
      const result = await this.uploadWithProgress(formData, id, controller.signal)

      // 성공 처리
      this.activeUploads.delete(id)
      this.statusCallback?.(id, 'completed')

      console.log(`[UploadService] 파일 업로드 성공: ${file.name}`, result)

    } catch (error) {
      // 에러 처리
      this.activeUploads.delete(id)

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          this.statusCallback?.(id, 'cancelled')
          console.log(`[UploadService] 파일 업로드 취소: ${file.name}`)
        } else {
          const errorMessage = this.getErrorMessage(error)
          this.statusCallback?.(id, 'error', errorMessage)
          console.error(`[UploadService] 파일 업로드 실패: ${file.name}`, error)
        }
      } else {
        this.statusCallback?.(id, 'error', '알 수 없는 오류가 발생했습니다')
        console.error(`[UploadService] 알 수 없는 오류: ${file.name}`, error)
      }
    }
  }

  /**
   * 진행률을 추적하면서 파일 업로드
   */
  private uploadWithProgress(
    formData: FormData,
    fileId: string,
    signal: AbortSignal
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()

      // 진행률 이벤트
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100)

          this.progressCallback?.({
            fileId,
            progress,
            loaded: event.loaded,
            total: event.total
          })
        }
      })

      // 완료 이벤트
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = xhr.responseText ? JSON.parse(xhr.responseText) : {}
            resolve(response)
          } catch (error) {
            resolve({ success: true })
          }
        } else {
          reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`))
        }
      })

      // 에러 이벤트
      xhr.addEventListener('error', () => {
        reject(new Error('네트워크 오류가 발생했습니다'))
      })

      // 타임아웃 이벤트
      xhr.addEventListener('timeout', () => {
        reject(new Error('업로드 시간이 초과되었습니다'))
      })

      // 취소 처리
      signal.addEventListener('abort', () => {
        xhr.abort()
        const abortError = new Error('업로드가 취소되었습니다')
        abortError.name = 'AbortError'
        reject(abortError)
      })

      // 요청 설정
      xhr.open('POST', uploadConfig.endpoints.upload)
      xhr.timeout = 5 * 60 * 1000 // 5분 타임아웃

      // 업로드 시작
      xhr.send(formData)
    })
  }

  /**
   * 에러 메시지 추출
   */
  private getErrorMessage(error: Error): string {
    // 네트워크 에러
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return '네트워크 연결을 확인해주세요'
    }

    // HTTP 에러
    if (error.message.includes('HTTP 413')) {
      return '파일 크기가 너무 큽니다'
    }

    if (error.message.includes('HTTP 415')) {
      return '지원하지 않는 파일 형식입니다'
    }

    if (error.message.includes('HTTP 429')) {
      return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요'
    }

    if (error.message.includes('HTTP 500')) {
      return '서버 오류가 발생했습니다'
    }

    // 타임아웃 에러
    if (error.message.includes('timeout')) {
      return '업로드 시간이 초과되었습니다'
    }

    // 기본 에러 메시지
    return error.message || '파일 업로드 중 오류가 발생했습니다'
  }

  /**
   * 활성 업로드 상태 확인
   */
  getActiveUploads(): string[] {
    return Array.from(this.activeUploads.keys())
  }

  /**
   * 업로드 큐 상태 확인
   */
  getQueueLength(): number {
    return this.uploadQueue.length
  }

  /**
   * 서비스 정리
   */
  cleanup(): void {
    this.cancelAllUploads()
    this.progressCallback = undefined
    this.statusCallback = undefined
  }
}

/**
 * 전역 업로드 서비스 인스턴스
 */
export const uploadService = new UploadService()

/**
 * 파일 검증 유틸리티
 */
export const fileValidator = {
  /**
   * 파일 크기 검증
   */
  validateSize(file: File): { valid: boolean; error?: string } {
    const maxSize = uploadConfig.limits.maxFileSize

    if (file.size > maxSize) {
      return {
        valid: false,
        error: `${Math.round(maxSize / (1024 * 1024))}MB 초과`
      }
    }

    return { valid: true }
  },

  /**
   * 파일 형식 검증 - 모든 파일 허용
   */
  validateType(_file: File): { valid: boolean; error?: string } { // 매개변수명 변경으로 미사용 표시
    return { valid: true }  // 모든 파일 형식 허용
  },

  /**
   * 전체 파일 검증
   */
  validateFile(file: File): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    const sizeValidation = this.validateSize(file)
    if (!sizeValidation.valid && sizeValidation.error) {
      errors.push(sizeValidation.error)
    }

    const typeValidation = this.validateType(file)
    if (!typeValidation.valid && typeValidation.error) {
      errors.push(typeValidation.error)
    }

    return {
      valid: errors.length === 0,
      errors
    }
  },

  /**
   * 파일 크기를 사람이 읽기 쉬운 형태로 변환
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes'

    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}