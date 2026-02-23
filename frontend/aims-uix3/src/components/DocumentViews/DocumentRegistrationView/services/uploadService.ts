/**
 * Upload Service
 * @since 1.0.0
 *
 * 파일 업로드를 위한 백엔드 통신 서비스
 * 병렬 업로드, 진행률 추적, 에러 처리 지원
 * 바이러스 검사 통합 (ClamAV)
 */

import {
  UploadFile,
  UploadProgressEvent,
  UploadStatus,
  UploadResult,
  DocPrepResponse
} from '../types/uploadTypes'
import { UserContextService, uploadConfig } from './userContextService'
import { scanFile, isScanAvailable } from '@/shared/lib/fileValidation/virusScanApi'
import { errorReporter } from '@/shared/lib/errorReporter'
import { getAuthToken } from '@/shared/lib/api'

/**
 * 업로드 진행률 콜백 타입
 */
type ProgressCallback = (event: UploadProgressEvent) => void
type StatusCallback = (fileId: string, status: UploadStatus, error?: string, retryable?: boolean) => void

interface ErrorWithResponse extends Error {
  response?: DocPrepResponse
}

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
  private pendingResolvers = new Map<string, (result: UploadResult) => void>()
  private isProcessing = false
  private batchUploadActive = false

  // Map<owner, callback>: owner별로 하나의 콜백만 유지 (HMR/StrictMode 중복 등록 방지)
  private progressCallbacks = new Map<string, ProgressCallback>()
  private statusCallbacks = new Map<string, StatusCallback>()

  /**
   * 진행률 콜백 등록 (owner별 단일 콜백)
   * 동일 owner로 재등록 시 기존 콜백을 교체
   * @returns unsubscribe 함수
   */
  setProgressCallback(callback: ProgressCallback, owner: string = 'default'): () => void {
    // 기존 콜백이 있으면 교체 (중복 방지)
    const hadPrevious = this.progressCallbacks.has(owner)
    this.progressCallbacks.set(owner, callback)
    if (import.meta.env.DEV) {
      console.log(`✅ [UploadService] progressCallback ${hadPrevious ? '교체' : '등록'} (${owner}) - 총 ${this.progressCallbacks.size}개`)
    }
    // unsubscribe 함수 반환
    return () => {
      this.progressCallbacks.delete(owner)
      if (import.meta.env.DEV) {
        console.log(`❌ [UploadService] progressCallback 제거 (${owner}) - 남은 ${this.progressCallbacks.size}개`)
      }
    }
  }

  /**
   * 상태 변경 콜백 등록 (owner별 단일 콜백)
   * 동일 owner로 재등록 시 기존 콜백을 교체
   * @returns unsubscribe 함수
   */
  setStatusCallback(callback: StatusCallback, owner: string = 'default'): () => void {
    // 기존 콜백이 있으면 교체 (중복 방지)
    const hadPrevious = this.statusCallbacks.has(owner)
    this.statusCallbacks.set(owner, callback)
    if (import.meta.env.DEV) {
      console.log(`✅ [UploadService] statusCallback ${hadPrevious ? '교체' : '등록'} (${owner}) - 총 ${this.statusCallbacks.size}개`)
    }
    // unsubscribe 함수 반환
    return () => {
      this.statusCallbacks.delete(owner)
      if (import.meta.env.DEV) {
        console.log(`❌ [UploadService] statusCallback 제거 (${owner}) - 남은 ${this.statusCallbacks.size}개`)
      }
    }
  }

  /**
   * 파일들을 업로드 큐에 추가
   * @returns 모든 파일 업로드 완료 시 결과 배열 반환
   */
  async queueFiles(files: UploadFile[]): Promise<UploadResult[]> {
    if (files.length === 0) return []

    // 각 파일에 대한 Promise 생성 (업로드 완료 시 resolve)
    const promises = files.map(file => {
      return new Promise<UploadResult>((resolve) => {
        this.pendingResolvers.set(file.id, resolve)
      })
    })

    // 큐에 추가
    this.uploadQueue.push(...files)

    // 업로드 처리 시작
    if (!this.isProcessing) {
      this.processQueue()
    }

    // 모든 파일 업로드 완료까지 대기
    return Promise.all(promises)
  }

  /**
   * 특정 파일 업로드 취소
   */
  cancelUpload(fileId: string): void {
    const controller = this.activeUploads.get(fileId)
    if (controller) {
      controller.abort()
      this.activeUploads.delete(fileId)
      this.statusCallbacks.forEach(callback => callback(fileId, 'cancelled'))
    }

    // 큐에서 제거 + 대기 중 Promise resolve
    const queuedFile = this.uploadQueue.find(file => file.id === fileId)
    this.uploadQueue = this.uploadQueue.filter(file => file.id !== fileId)
    if (queuedFile) {
      this.resolveFile(fileId, {
        fileId,
        success: false,
        error: { fileId, fileName: queuedFile.file.name, message: '업로드가 취소되었습니다', retryable: false },
      })
    }
  }

  /**
   * 모든 업로드 취소
   */
  cancelAllUploads(): void {
    // 활성 업로드들 취소 (resolve는 uploadFile() catch에서 처리)
    this.activeUploads.forEach((controller, fileId) => {
      controller.abort()
      this.statusCallbacks.forEach(callback => callback(fileId, 'cancelled'))
    })
    this.activeUploads.clear()

    // 큐 비우기 + 대기 중 Promise resolve
    this.uploadQueue.forEach(file => {
      this.statusCallbacks.forEach(callback => callback(file.id, 'cancelled'))
      this.resolveFile(file.id, {
        fileId: file.id,
        success: false,
        error: { fileId: file.id, fileName: file.file.name, message: '업로드가 취소되었습니다', retryable: false },
      })
    })
    this.uploadQueue = []

    this.isProcessing = false
  }

  /**
   * 파일 업로드 완료 시 대기 중인 Promise resolve
   */
  private resolveFile(id: string, result: UploadResult): void {
    const resolver = this.pendingResolvers.get(id)
    if (resolver) {
      resolver(result)
      this.pendingResolvers.delete(id)
    }
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
   * 개별 파일 업로드 (바이러스 검사 + 자동 재시도 지원)
   */
  private async uploadFile(uploadFile: UploadFile): Promise<void> {
    const { id, file, customerId, folderId, batchId } = uploadFile
    const controller = new AbortController()

    try {
      // 활성 업로드 목록에 추가
      this.activeUploads.set(id, controller)

      // 상태를 업로딩으로 변경
      this.statusCallbacks.forEach(callback => callback(id, 'uploading'))

      // 🛡️ 바이러스 검사 (ClamAV 활성화된 경우만)
      const scanAvailable = await isScanAvailable()
      if (scanAvailable) {
        if (import.meta.env.DEV) {
          console.log(`[UploadService] 🔍 바이러스 검사 중: ${file.name}`)
        }
        const scanResult = await scanFile(file)

        if (scanResult.infected) {
          // 바이러스 감지됨 - 업로드 차단
          this.activeUploads.delete(id)
          const errorMessage = `🛡️ 바이러스 감지: ${scanResult.virusName || '알 수 없는 위협'}`
          console.warn(`[UploadService] ⚠️ ${errorMessage} - 파일: ${file.name}`)
          this.statusCallbacks.forEach(callback => callback(id, 'error', errorMessage, false))
          this.resolveFile(id, {
            fileId: id,
            success: false,
            error: { fileId: id, fileName: file.name, message: errorMessage, retryable: false },
          })
          return
        }

        if (scanResult.scanned) {
          if (import.meta.env.DEV) {
            console.log(`[UploadService] ✅ 바이러스 검사 통과: ${file.name}`)
          }
        }
      }

      // FormData 생성 (사용자 컨텍스트 포함)
      const formData = UserContextService.createFormData(file)

      // 🆕 "내 파일" 등록: customerId가 있으면 추가 (userId === customerId인 경우)
      if (customerId) {
        formData.append('customerId', customerId)
        console.log(`[UploadService] 내 파일 업로드 - customerId: ${customerId}`)
      }

      // 🆕 폴더 ID: folderId가 있으면 추가 (내 보관함에서 특정 폴더에 업로드 시)
      if (folderId) {
        formData.append('folderId', folderId)
        console.log(`[UploadService] 폴더 업로드 - folderId: ${folderId}`)
      }

      // 🔴 업로드 묶음 ID: 현재 세션 진행률 추적용
      if (batchId) {
        formData.append('batchId', batchId)
        if (import.meta.env.DEV) {
          console.log(`[UploadService] 배치 업로드 - batchId: ${batchId}`)
        }
      }

      // XMLHttpRequest로 업로드 (진행률 추적을 위해)
      const result = await this.uploadWithProgress(formData, id, controller.signal)

      // 응답 분석 및 상태 결정
      this.activeUploads.delete(id)

      // 경고 케이스: 지원하지 않는 파일 형식
      if (result.warn) {
        const errorMessage = result.userMessage || '지원하지 않는 파일 형식입니다'
        this.statusCallbacks.forEach(callback => callback(id, 'warning', errorMessage))
        if (import.meta.env.DEV) {
          console.log(`[UploadService] 파일 업로드 경고: ${file.name}`, result)
        }
      }
      // 성공 케이스: OCR 큐잉, 텍스트 완료, 기본 성공
      else {
        this.statusCallbacks.forEach(callback => callback(id, 'completed'))
        if (import.meta.env.DEV) {
          console.log(`[UploadService] 파일 업로드 성공: ${file.name}`, result)
        }

        // 🔔 SSE 알림 트리거 (실시간 갱신)
        if (customerId) {
          // userId 가져오기
          const currentUserId = localStorage.getItem('aims-current-user-id') || ''

          if (customerId === currentUserId) {
            // 내 보관함: folderId 설정 + Personal Files SSE 웹훅 호출
            this.notifyPersonalFilesUploaded(customerId, file.name, folderId)
          } else {
            // 고객 문서: Customer Documents SSE 알림 호출
            this.notifyDocumentUploaded(customerId, id, file.name)
          }
        }
      }

      // 업로드 완료 (성공/경고) — 대기 중 Promise resolve
      this.resolveFile(id, { fileId: id, success: true })

    } catch (error) {
      // 에러 처리
      this.activeUploads.delete(id)

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          if (import.meta.env.DEV) {
            console.log(`[UploadService] 업로드 취소됨: ${file.name}`)
          }
          this.statusCallbacks.forEach(callback => callback(id, 'cancelled'))
          this.resolveFile(id, {
            fileId: id,
            success: false,
            error: { fileId: id, fileName: file.name, message: '업로드가 취소되었습니다', retryable: false },
          })
        } else {
          const response = (error as ErrorWithResponse).response
          const errorMessage = this.getErrorMessage(error, response)
          // 영구 실패 판별: 재시도해도 결과가 같은 에러는 retryable: false
          const isPermanentFailure = error.message.includes('HTTP 413')
            || error.message.includes('HTTP 415')
            || error.message.includes('HTTP 422')
            || errorMessage.includes('용량')
          this.statusCallbacks.forEach(callback => callback(id, 'error', errorMessage, !isPermanentFailure))
          console.error(`[UploadService] 파일 업로드 실패: ${file.name}`, error)
          errorReporter.reportApiError(error, { component: 'UploadService.uploadFile', payload: { fileName: file.name, customerId } })
          this.resolveFile(id, {
            fileId: id,
            success: false,
            error: { fileId: id, fileName: file.name, message: errorMessage, retryable: !isPermanentFailure },
          })
        }
      } else {
        this.statusCallbacks.forEach(callback => callback(id, 'error', '알 수 없는 오류가 발생했습니다', false))
        console.error(`[UploadService] 알 수 없는 오류: ${file.name}`, error)
        errorReporter.reportApiError(new Error('Unknown upload error'), { component: 'UploadService.uploadFile', payload: { fileName: file.name, customerId } })
        this.resolveFile(id, {
          fileId: id,
          success: false,
          error: { fileId: id, fileName: file.name, message: '알 수 없는 오류가 발생했습니다', retryable: false },
        })
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
  ): Promise<DocPrepResponse> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()

      // 진행률 이벤트
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100)

          this.progressCallbacks.forEach(callback => callback({
            fileId,
            progress,
            loaded: event.loaded,
            total: event.total
          }))
        }
      })

      // 완료 이벤트
      xhr.addEventListener('load', () => {
        try {
          const response: DocPrepResponse = xhr.responseText ? JSON.parse(xhr.responseText) : {}

          // HTTP 2xx: 성공 응답 처리
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(response)
          }
          // HTTP 415: 지원하지 않는 파일 형식 (경고로 처리)
          else if (xhr.status === 415) {
            resolve(response) // 415도 성공으로 처리하되 warn 플래그로 구분
          }
          // 기타 HTTP 에러
          else {
            const error: ErrorWithResponse = Object.assign(
              new Error(`HTTP ${xhr.status}: ${xhr.statusText}`),
              { response }
            )
            reject(error)
          }
        } catch {
          // JSON 파싱 실패 시 기본 응답으로 처리
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({}) // 빈 성공 응답
          } else {
            const emptyResponse: DocPrepResponse = {}
            const error: ErrorWithResponse = Object.assign(
              new Error(`HTTP ${xhr.status}: ${xhr.statusText}`),
              { response: emptyResponse }
            )
            reject(error)
          }
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

      // 🔒 보안: getAuthToken()으로 토큰 통합 관리 (v1/v2 호환)
      const token = getAuthToken()
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      }

      // 업로드 시작
      xhr.send(formData)
    })
  }

  /**
   * 문서 업로드 알림 (SSE 실시간 갱신용)
   * 고객에게 연결된 문서가 업로드되면 aims_api에 알려서 SSE 이벤트 발생
   */
  private async notifyDocumentUploaded(
    customerId: string,
    documentId: string,
    documentName: string
  ): Promise<void> {
    try {
      // 🔒 보안: getAuthToken()으로 토큰 통합 관리 (v1/v2 호환)
      const token = getAuthToken()
      if (!token) return

      const API_BASE_URL = import.meta.env['VITE_API_BASE_URL'] || ''
      const response = await fetch(`${API_BASE_URL}/api/notify/document-uploaded`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ customerId, documentId, documentName })
      })

      if (import.meta.env.DEV) {
        const result = await response.json()
        console.log(`[UploadService] SSE 알림 전송 완료:`, result)
      }
    } catch (error) {
      // 알림 실패는 무시 (업로드 자체는 성공)
      console.warn('[UploadService] SSE 알림 전송 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'UploadService.notifyDocumentUploaded', payload: { customerId, documentId } })
    }
  }

  /**
   * Personal Files 업로드 알림 (SSE 실시간 갱신용)
   * 내 보관함에 문서가 업로드되면:
   * 1. folderId 설정 API 호출 (n8n이 folderId를 저장하지 않으므로)
   * 2. SSE 알림 발송
   */
  private async notifyPersonalFilesUploaded(
    userId: string,
    filename: string,
    folderId?: string | null
  ): Promise<void> {
    const API_BASE_URL = import.meta.env['VITE_API_BASE_URL'] || ''

    // 1. folderId 설정 API 호출
    // 🔒 보안: getAuthToken()으로 토큰 통합 관리 (v1/v2 호환)
    const token = getAuthToken()
    try {
      if (token) {
        const setFolderResponse = await fetch(`${API_BASE_URL}/api/documents/recent/set-folder`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ filename, folderId: folderId || null })
          })

        if (import.meta.env.DEV) {
          const result = await setFolderResponse.json()
          console.log(`[UploadService] folderId 설정 완료:`, result)
        }
      }
    } catch (error) {
      console.warn('[UploadService] folderId 설정 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'UploadService.notifyPersonalFilesUploaded.setFolder', payload: { userId, filename, folderId } })
    }

    // 2. SSE 알림 발송
    try {
      const response = await fetch(`${API_BASE_URL}/api/webhooks/personal-files-change`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId,
          changeType: 'created',
          itemId: 'uploaded',
          itemName: filename,
          itemType: 'document'
        })
      })

      if (import.meta.env.DEV) {
        const result = await response.json()
        console.log(`[UploadService] Personal Files SSE 알림 전송 완료:`, result)
      }
    } catch (error) {
      console.warn('[UploadService] Personal Files SSE 알림 전송 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'UploadService.notifyPersonalFilesUploaded.sseNotify', payload: { userId, filename } })
    }
  }

  /**
   * 에러 메시지 추출 (백엔드 userMessage 우선 처리)
   */
  private getErrorMessage(error: Error, response?: DocPrepResponse): string {
    // 백엔드 응답의 userMessage 우선 사용
    if (response?.userMessage) {
      return response.userMessage
    }

    // 백엔드 error 객체의 메시지 사용
    if (response?.error?.statusMessage) {
      return response.error.statusMessage
    }

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
   * 배치 업로드(AR/CRS 직접 업로드) 활성 상태 설정
   * BatchUploadApi를 직접 사용하는 경로에서 호출
   */
  setBatchUploadActive(active: boolean): void {
    this.batchUploadActive = active
  }

  /**
   * 업로드 진행 중 여부 확인
   * Phase 4: 페이지 이탈 차단에서 사용
   * - uploadService 큐 업로드 + 배치 직접 업로드 모두 포함
   */
  isUploading(): boolean {
    return this.activeUploads.size > 0 || this.uploadQueue.length > 0 || this.batchUploadActive
  }

  /**
   * 업로드 진행 상태 요약
   */
  getUploadCounts(): { active: number; queued: number; total: number } {
    const active = this.activeUploads.size
    const queued = this.uploadQueue.length
    return { active, queued, total: active + queued }
  }

  /**
   * 서비스 정리 - 진행 중인 업로드는 유지
   */
  cleanup(): void {
    if (import.meta.env.DEV) {
      console.log('[UploadService] cleanup 호출됨 - 모든 콜백 제거 (업로드는 계속)')
    }
    // 모든 콜백 제거 (진행 중인 업로드는 그대로 유지)
    this.progressCallbacks.clear()
    this.statusCallbacks.clear()
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
   * Phase 1: 개별 파일 크기 제한 없음 — 사용자별 저장 용량 쿼터로 관리
   */
  validateSize(_file: File): { valid: boolean; error?: string } {
    return { valid: true }
  },

  /**
   * 파일 형식 검증 - 모든 파일 허용
   */
  validateType(file: File): { valid: boolean; error?: string } {
    void file
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
