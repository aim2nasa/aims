/**
 * Batch Upload API
 * @since 2025-12-05
 * @version 1.1.0
 *
 * 고객 문서 일괄등록을 위한 API 클라이언트
 * 바이러스 검사 통합 (ClamAV)
 */

import { api, ApiError, API_CONFIG, getAuthHeaders } from '../../../shared/lib/api'
import { errorReporter } from '../../../shared/lib/errorReporter'
import type { CustomerForMatching } from '../utils/customerMatcher'
import { scanFile, isScanAvailable } from '@/shared/lib/fileValidation/virusScanApi'

// Shadow Mode 경유 업로드 (n8n + FastAPI 병렬 비교, n8n 응답 반환)
// 상대 경로 사용: 개발환경에서는 Vite 프록시, 프로덕션에서는 직접 접근
const UPLOAD_ENDPOINT = '/shadow/docprep-main'

// ==================== 타입 정의 ====================

/**
 * 고객 검색 결과
 */
export interface CustomerSearchResult {
  success: boolean
  customers: CustomerForMatching[]
  error?: string
}

/**
 * 단일 파일 업로드 결과
 */
export interface FileUploadResult {
  success: boolean
  fileId?: string
  fileName: string
  customerId: string
  error?: string
}

/**
 * 배치 업로드 이력
 */
export interface BatchUploadHistory {
  batchId: string
  userId: string
  startedAt: string
  completedAt?: string
  totalFolders: number
  totalFiles: number
  successCount: number
  failureCount: number
  status: 'in_progress' | 'completed' | 'failed'
}

/**
 * 진행률 콜백 타입
 */
export type UploadProgressCallback = (
  loaded: number,
  total: number,
  fileName: string
) => void

// ==================== API 클래스 ====================

export class BatchUploadApi {
  /**
   * 설계사의 모든 고객 목록 조회
   * 폴더-고객 매칭을 위한 고객명 조회
   */
  static async getCustomersForMatching(): Promise<CustomerSearchResult> {
    try {
      const data = await api.get<{
        success?: boolean
        data?: { customers?: CustomerForMatching[] }
        error?: string
      }>('/api/customers?limit=1000')

      return {
        success: true,
        customers: data.data?.customers || [],
      }
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : '고객 목록 조회 중 오류가 발생했습니다'
      errorReporter.reportApiError(error as Error, { component: 'BatchUploadApi.getCustomersForMatching' })
      return { success: false, customers: [], error: message }
    }
  }

  /**
   * 단일 파일 업로드 (바이러스 검사 + 진행률 추적)
   * XMLHttpRequest를 사용하여 진행률을 추적합니다
   *
   * @param file - 업로드할 파일
   * @param customerId - 고객 ID
   * @param onProgress - 진행률 콜백
   * @param signal - 취소 신호
   * @param batchId - 업로드 묶음 ID (현재 세션 진행률 추적용)
   */
  static async uploadFile(
    file: File,
    customerId: string,
    onProgress?: UploadProgressCallback,
    signal?: AbortSignal,
    batchId?: string
  ): Promise<FileUploadResult> {
    // 🛡️ 바이러스 검사 (ClamAV 활성화된 경우만)
    const scanAvailable = await isScanAvailable()
    if (scanAvailable) {
      console.log(`[BatchUploadApi] 🔍 바이러스 검사 중: ${file.name}`)
      const scanResult = await scanFile(file)

      if (scanResult.infected) {
        // 바이러스 감지됨 - 업로드 차단
        const errorMessage = `🛡️ 바이러스 감지: ${scanResult.virusName || '알 수 없는 위협'}`
        console.warn(`[BatchUploadApi] ⚠️ ${errorMessage} - 파일: ${file.name}`)
        return {
          success: false,
          fileName: file.name,
          customerId,
          error: errorMessage,
        }
      }

      if (scanResult.scanned) {
        console.log(`[BatchUploadApi] ✅ 바이러스 검사 통과: ${file.name}`)
      }
    }

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest()

      // 진행률 이벤트
      if (onProgress) {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            onProgress(event.loaded, event.total, file.name)
          }
        })
      }

      // 완료 이벤트
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({
            success: true,
            fileName: file.name,
            customerId,
          })
        } else {
          resolve({
            success: false,
            fileName: file.name,
            customerId,
            error: `HTTP ${xhr.status}: ${xhr.statusText}`,
          })
        }
      })

      // 에러 이벤트
      xhr.addEventListener('error', () => {
        resolve({
          success: false,
          fileName: file.name,
          customerId,
          error: '네트워크 오류가 발생했습니다',
        })
      })

      // 타임아웃 이벤트
      xhr.addEventListener('timeout', () => {
        resolve({
          success: false,
          fileName: file.name,
          customerId,
          error: '업로드 시간이 초과되었습니다',
        })
      })

      // 취소 처리
      if (signal) {
        signal.addEventListener('abort', () => {
          xhr.abort()
          resolve({
            success: false,
            fileName: file.name,
            customerId,
            error: '업로드가 취소되었습니다',
          })
        })
      }

      // FormData 생성
      const formData = new FormData()
      formData.append('file', file)
      formData.append('customerId', customerId)

      // 현재 사용자 ID 추가
      const currentUserId = typeof window !== 'undefined'
        ? localStorage.getItem('aims-current-user-id') || ''
        : ''
      formData.append('userId', currentUserId)

      // 🔴 업로드 묶음 ID 추가 (현재 세션 진행률 추적용)
      const effectiveBatchId = batchId || sessionStorage.getItem('aims-current-batch-id')
      if (effectiveBatchId) {
        formData.append('batchId', effectiveBatchId)
      }

      // 요청 설정
      xhr.open('POST', UPLOAD_ENDPOINT)
      xhr.timeout = 5 * 60 * 1000 // 5분 타임아웃

      // JWT 인증 헤더 설정
      const authHeaders = getAuthHeaders()
      Object.entries(authHeaders).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value)
      })

      // 업로드 시작
      xhr.send(formData)
    })
  }

  /**
   * 배치 업로드 이력 저장 (선택적)
   * 업로드 완료 후 이력을 저장합니다
   */
  static async saveBatchHistory(history: Omit<BatchUploadHistory, 'batchId'>): Promise<{
    success: boolean
    batchId?: string
    error?: string
  }> {
    try {
      const data = await api.post<{
        success?: boolean
        data?: { batchId: string }
        error?: string
      }>('/api/batch-uploads/history', history)

      return {
        success: true,
        batchId: data.data?.batchId,
      }
    } catch (error) {
      // 이력 저장 실패는 업로드 성공에 영향을 주지 않음
      console.warn('[BatchUploadApi] 이력 저장 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'BatchUploadApi.saveBatchHistory' })
      return {
        success: false,
        error: error instanceof ApiError ? error.message : '이력 저장 실패',
      }
    }
  }

  /**
   * 배치 업로드 이력 조회
   */
  static async getBatchHistory(limit: number = 10): Promise<{
    success: boolean
    history: BatchUploadHistory[]
    error?: string
  }> {
    try {
      const data = await api.get<{
        success?: boolean
        data?: BatchUploadHistory[]
        error?: string
      }>(`/api/batch-uploads/history?limit=${limit}`)

      return {
        success: true,
        history: data.data || [],
      }
    } catch (error) {
      errorReporter.reportApiError(error as Error, { component: 'BatchUploadApi.getBatchHistory' })
      return {
        success: false,
        history: [],
        error: error instanceof ApiError ? error.message : '이력 조회 실패',
      }
    }
  }
}
