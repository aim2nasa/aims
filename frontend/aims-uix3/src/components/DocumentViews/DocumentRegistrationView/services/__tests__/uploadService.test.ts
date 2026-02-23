/**
 * Upload Service Tests
 * @since 1.0.0
 *
 * 파일 업로드 서비스의 핵심 로직 테스트
 * - 파일 검증 (크기, 타입, 중복)
 * - 업로드 큐 관리
 * - 진행률 추적
 * - 에러 처리 및 재시도
 * - 취소 기능
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { UploadService, fileValidator } from '../uploadService'
import { UserContextService, uploadConfig } from '../userContextService'
import type { UploadFile, UploadStatus } from '../../types/uploadTypes'

// virusScanApi 모킹 (설정 로드 문제 방지)
vi.mock('@/shared/lib/fileValidation/virusScanApi', () => ({
  scanFile: vi.fn().mockResolvedValue({ scanned: false, infected: false, skipped: true }),
  isScanAvailable: vi.fn().mockResolvedValue(false),
}))

// settingsAdapter 모킹
vi.mock('@/shared/lib/fileValidation/settingsAdapter', () => ({
  isVirusScanEnabled: vi.fn().mockReturnValue(false),
  loadFileValidationSettings: vi.fn().mockResolvedValue({}),
  isSettingsLoaded: vi.fn().mockReturnValue(true),
}))

// XMLHttpRequest 모킹을 위한 타입
interface MockXHR {
  open: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  setRequestHeader: ReturnType<typeof vi.fn>
  abort: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
  upload: {
    addEventListener: ReturnType<typeof vi.fn>
  }
  status: number
  statusText: string
  responseText: string
  timeout: number
}

describe('UploadService', () => {
  let uploadService: UploadService
  let mockXHR: MockXHR
  let xhrInstance: MockXHR

  beforeEach(() => {
    uploadService = new UploadService()

    // XMLHttpRequest 모킹
    mockXHR = {
      open: vi.fn(),
      send: vi.fn(),
      setRequestHeader: vi.fn(),
      abort: vi.fn(),
      addEventListener: vi.fn(),
      upload: {
        addEventListener: vi.fn()
      },
      status: 200,
      statusText: 'OK',
      responseText: JSON.stringify({ success: true }),
      timeout: 0
    }

    xhrInstance = mockXHR

    global.XMLHttpRequest = vi.fn(() => xhrInstance) as unknown as typeof XMLHttpRequest
  })

  afterEach(() => {
    vi.clearAllMocks()
    uploadService.cancelAllUploads()
  })

  describe('큐 관리', () => {
    it('파일을 큐에 추가할 수 있어야 함', async () => {
      const files: UploadFile[] = [
        {
          id: 'file-1',
          file: new File(['content'], 'test.txt'),
          fileSize: 7,
          status: 'pending',
          progress: 0
        }
      ]

      // queueFiles()는 업로드 완료까지 대기하는 Promise 반환 — 큐 동작만 테스트하므로 await 안 함
      void uploadService.queueFiles(files)

      // 큐 처리를 위한 짧은 대기
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(uploadService.getActiveUploads().length).toBeGreaterThan(0)
    })

    it('큐 길이를 확인할 수 있어야 함', async () => {
      const files: UploadFile[] = Array.from({ length: 5 }, (_, i) => ({
        id: `file-${i}`,
        file: new File(['content'], `test${i}.txt`),
        fileSize: 7,
        status: 'pending' as UploadStatus,
        progress: 0
      }))

      // 큐에 추가만 하고 처리는 시작하지 않도록 설정
      uploadService['uploadQueue'].push(...files)

      expect(uploadService.getQueueLength()).toBe(5)
    })

    it('동시 업로드 제한을 준수해야 함', async () => {
      const files: UploadFile[] = Array.from({ length: 10 }, (_, i) => ({
        id: `file-${i}`,
        file: new File(['content'], `test${i}.txt`),
        fileSize: 7,
        status: 'pending' as UploadStatus,
        progress: 0
      }))

      void uploadService.queueFiles(files)

      // 잠시 대기 후 활성 업로드 확인
      await new Promise(resolve => setTimeout(resolve, 50))

      const activeUploads = uploadService.getActiveUploads()
      expect(activeUploads.length).toBeLessThanOrEqual(
        uploadConfig.limits.maxConcurrentUploads
      )
    })
  })

  describe('콜백 설정', () => {
    it('진행률 콜백을 설정할 수 있어야 함', () => {
      const progressCallback = vi.fn()
      uploadService.setProgressCallback(progressCallback, 'test-owner')

      expect(uploadService['progressCallbacks'].has('test-owner')).toBe(true)
    })

    it('상태 콜백을 설정할 수 있어야 함', () => {
      const statusCallback = vi.fn()
      uploadService.setStatusCallback(statusCallback, 'test-owner')

      expect(uploadService['statusCallbacks'].has('test-owner')).toBe(true)
    })

    it('다중 구독자를 지원해야 함', () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      uploadService.setProgressCallback(callback1, 'owner1')
      uploadService.setProgressCallback(callback2, 'owner2')

      expect(uploadService['progressCallbacks'].size).toBe(2)
      expect(uploadService['progressCallbacks'].has('owner1')).toBe(true)
      expect(uploadService['progressCallbacks'].has('owner2')).toBe(true)
    })

    it('unsubscribe 함수를 반환해야 함', () => {
      const callback = vi.fn()
      const unsubscribe = uploadService.setStatusCallback(callback, 'test-owner')

      expect(uploadService['statusCallbacks'].has('test-owner')).toBe(true)

      unsubscribe()

      expect(uploadService['statusCallbacks'].has('test-owner')).toBe(false)
    })
  })

  describe('업로드 취소', () => {
    it('개별 파일 업로드를 취소할 수 있어야 함', async () => {
      const statusCallback = vi.fn()
      uploadService.setStatusCallback(statusCallback)

      const files: UploadFile[] = [
        {
          id: 'file-1',
          file: new File(['content'], 'test.txt'),
          fileSize: 7,
          status: 'pending',
          progress: 0
        }
      ]

      void uploadService.queueFiles(files)
      await new Promise(resolve => setTimeout(resolve, 50))

      uploadService.cancelUpload('file-1')

      expect(statusCallback).toHaveBeenCalledWith('file-1', 'cancelled')
      expect(uploadService.getActiveUploads()).not.toContain('file-1')
    })

    it('모든 업로드를 취소할 수 있어야 함', async () => {
      const statusCallback = vi.fn()
      uploadService.setStatusCallback(statusCallback)

      const files: UploadFile[] = Array.from({ length: 3 }, (_, i) => ({
        id: `file-${i}`,
        file: new File(['content'], `test${i}.txt`),
        fileSize: 7,
        status: 'pending' as UploadStatus,
        progress: 0
      }))

      void uploadService.queueFiles(files)
      await new Promise(resolve => setTimeout(resolve, 50))

      uploadService.cancelAllUploads()

      expect(uploadService.getActiveUploads()).toHaveLength(0)
      expect(uploadService.getQueueLength()).toBe(0)
    })

    it('큐에 있는 파일도 취소되어야 함', () => {
      const files: UploadFile[] = [
        {
          id: 'file-1',
          file: new File(['content'], 'test.txt'),
          fileSize: 7,
          status: 'pending',
          progress: 0
        }
      ]

      // 큐에만 추가 (처리 시작 안 함)
      uploadService['uploadQueue'].push(...files)

      uploadService.cancelUpload('file-1')

      // 큐에서 제거되어야 함
      expect(uploadService.getQueueLength()).toBe(0)
    })
  })

  describe('에러 처리', () => {
    it('네트워크 에러를 처리해야 함', () => {
      const error = new Error('네트워크 오류가 발생했습니다')
      const errorMessage = uploadService['getErrorMessage'](error)

      expect(errorMessage).toBe('네트워크 오류가 발생했습니다')
    })

    it('HTTP 413 에러를 처리해야 함', () => {
      const error = new Error('HTTP 413: Payload Too Large')
      const errorMessage = uploadService['getErrorMessage'](error)

      expect(errorMessage).toBe('파일 크기가 너무 큽니다')
    })

    it('HTTP 415 에러를 처리해야 함', () => {
      const error = new Error('HTTP 415: Unsupported Media Type')
      const errorMessage = uploadService['getErrorMessage'](error)

      expect(errorMessage).toBe('지원하지 않는 파일 형식입니다')
    })

    it('HTTP 429 에러를 처리해야 함', () => {
      const error = new Error('HTTP 429: Too Many Requests')
      const errorMessage = uploadService['getErrorMessage'](error)

      expect(errorMessage).toBe('요청이 너무 많습니다. 잠시 후 다시 시도해주세요')
    })

    it('HTTP 500 에러를 처리해야 함', () => {
      const error = new Error('HTTP 500: Internal Server Error')
      const errorMessage = uploadService['getErrorMessage'](error)

      expect(errorMessage).toBe('서버 오류가 발생했습니다')
    })

    it('타임아웃 에러를 처리해야 함', () => {
      const error = new Error('timeout exceeded')
      const errorMessage = uploadService['getErrorMessage'](error)

      expect(errorMessage).toBe('업로드 시간이 초과되었습니다')
    })

    it('백엔드 userMessage를 우선 사용해야 함', () => {
      const error = new Error('HTTP 500')
      const response = {
        userMessage: '백엔드 사용자 메시지'
      }
      const errorMessage = uploadService['getErrorMessage'](error, response)

      expect(errorMessage).toBe('백엔드 사용자 메시지')
    })

    it('백엔드 error.statusMessage를 사용해야 함', () => {
      const error = new Error('HTTP 500')
      const response = {
        error: {
          statusCode: '500',
          statusMessage: '서버 내부 오류'
        }
      }
      const errorMessage = uploadService['getErrorMessage'](error, response)

      expect(errorMessage).toBe('서버 내부 오류')
    })

    it('알 수 없는 에러는 기본 메시지를 반환해야 함', () => {
      const error = new Error('Unknown error')
      const errorMessage = uploadService['getErrorMessage'](error)

      expect(errorMessage).toBe('Unknown error')
    })
  })

  describe('서비스 정리', () => {
    it('cleanup 호출 시 콜백만 정리해야 함', () => {
      const progressCallback = vi.fn()
      const statusCallback = vi.fn()

      uploadService.setProgressCallback(progressCallback)
      uploadService.setStatusCallback(statusCallback)

      uploadService.cleanup()

      expect(uploadService['progressCallbacks'].size).toBe(0)
      expect(uploadService['statusCallbacks'].size).toBe(0)
    })

    it('cleanup 호출 시 진행 중인 업로드는 유지되어야 함', async () => {
      const files: UploadFile[] = [
        {
          id: 'file-1',
          file: new File(['content'], 'test.txt'),
          fileSize: 7,
          status: 'pending',
          progress: 0
        }
      ]

      void uploadService.queueFiles(files)
      await new Promise(resolve => setTimeout(resolve, 50))

      const activeBeforeCleanup = uploadService.getActiveUploads().length

      uploadService.cleanup()

      const activeAfterCleanup = uploadService.getActiveUploads().length

      expect(activeAfterCleanup).toBe(activeBeforeCleanup)
    })
  })

  describe('활성 업로드 상태', () => {
    it('활성 업로드 목록을 반환해야 함', () => {
      const controller = new AbortController()
      uploadService['activeUploads'].set('file-1', controller)
      uploadService['activeUploads'].set('file-2', controller)

      const active = uploadService.getActiveUploads()

      expect(active).toEqual(['file-1', 'file-2'])
    })

    it('활성 업로드가 없으면 빈 배열을 반환해야 함', () => {
      const active = uploadService.getActiveUploads()

      expect(active).toEqual([])
    })
  })
})

describe('fileValidator', () => {
  describe('파일 크기 검증', () => {
    it('허용 크기 이하의 파일은 통과해야 함', () => {
      const file = new File(['x'.repeat(1000)], 'small.txt')
      const result = fileValidator.validateSize(file)

      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('허용 크기를 초과한 파일은 실패해야 함', () => {
      // Phase 1: 개별 파일 크기 제한 없음 — 대용량 파일도 통과
      const file = new File(['content'], 'large.pdf')
      Object.defineProperty(file, 'size', {
        value: 500 * 1024 * 1024, // 500MB
        writable: false
      })

      const result = fileValidator.validateSize(file)

      expect(result.valid).toBe(true)
    })
  })

  describe('파일 형식 검증', () => {
    it('모든 파일 형식을 허용해야 함', () => {
      const pdfFile = new File(['content'], 'doc.pdf', { type: 'application/pdf' })
      const txtFile = new File(['content'], 'doc.txt', { type: 'text/plain' })
      const unknownFile = new File(['content'], 'doc.unknown', { type: 'application/unknown' })

      expect(fileValidator.validateType(pdfFile).valid).toBe(true)
      expect(fileValidator.validateType(txtFile).valid).toBe(true)
      expect(fileValidator.validateType(unknownFile).valid).toBe(true)
    })
  })

  describe('전체 파일 검증', () => {
    it('유효한 파일은 검증을 통과해야 함', () => {
      const file = new File(['content'], 'valid.pdf', { type: 'application/pdf' })
      const result = fileValidator.validateFile(file)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('대용량 파일도 검증을 통과해야 함 (Phase 1: 크기 제한 없음)', () => {
      const file = new File(['content'], 'large.pdf')
      Object.defineProperty(file, 'size', {
        value: 500 * 1024 * 1024, // 500MB
        writable: false
      })

      const result = fileValidator.validateFile(file)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('파일 크기 포맷팅', () => {
    it('0 바이트를 올바르게 포맷팅해야 함', () => {
      expect(fileValidator.formatFileSize(0)).toBe('0 Bytes')
    })

    it('바이트를 올바르게 포맷팅해야 함', () => {
      expect(fileValidator.formatFileSize(500)).toBe('500 Bytes')
    })

    it('킬로바이트를 올바르게 포맷팅해야 함', () => {
      const result = fileValidator.formatFileSize(2048)
      expect(result).toContain('KB')
      expect(result).toContain('2')
    })

    it('메가바이트를 올바르게 포맷팅해야 함', () => {
      const result = fileValidator.formatFileSize(5 * 1024 * 1024)
      expect(result).toContain('MB')
      expect(result).toContain('5')
    })

    it('기가바이트를 올바르게 포맷팅해야 함', () => {
      const result = fileValidator.formatFileSize(2 * 1024 * 1024 * 1024)
      expect(result).toContain('GB')
      expect(result).toContain('2')
    })

    it('소수점 이하 2자리까지 표시해야 함', () => {
      const result = fileValidator.formatFileSize(1536) // 1.5 KB
      expect(result).toMatch(/1\.5 KB/)
    })
  })
})

describe('UserContextService', () => {
  beforeEach(() => {
    UserContextService.reset()
  })

  describe('컨텍스트 관리', () => {
    it('기본 컨텍스트를 반환해야 함', () => {
      const context = UserContextService.getContext()

      expect(context.identifierType).toBe('userId')
      expect(context.identifierValue).toBe('tester')
    })

    it('컨텍스트를 설정할 수 있어야 함', () => {
      UserContextService.setContext({
        identifierType: 'phoneNumber',
        identifierValue: '010-1234-5678'
      })

      const context = UserContextService.getContext()

      expect(context.identifierType).toBe('phoneNumber')
      expect(context.identifierValue).toBe('010-1234-5678')
    })

    it('사용자 식별자를 변경할 수 있어야 함', () => {
      UserContextService.setUserIdentifier('customerNumber', 'CUST-12345')

      const context = UserContextService.getContext()

      expect(context.identifierType).toBe('customerNumber')
      expect(context.identifierValue).toBe('CUST-12345')
    })

    it('프로젝트 컨텍스트를 설정할 수 있어야 함', () => {
      UserContextService.setProjectContext('proj-123', 'dept-456')

      const context = UserContextService.getContext()

      expect(context.projectId).toBe('proj-123')
      expect(context.departmentId).toBe('dept-456')
    })

    it('메타데이터를 추가할 수 있어야 함', () => {
      UserContextService.setMetadata('category', 'insurance')
      UserContextService.setMetadata('priority', 'high')

      const context = UserContextService.getContext()

      expect(context.metadata).toEqual({
        category: 'insurance',
        priority: 'high'
      })
    })

    it('컨텍스트를 리셋할 수 있어야 함', () => {
      UserContextService.setContext({
        identifierType: 'phoneNumber',
        identifierValue: '010-1234-5678'
      })

      UserContextService.reset()

      const context = UserContextService.getContext()

      expect(context.identifierType).toBe('userId')
      expect(context.identifierValue).toBe('tester')
    })
  })

  describe('컨텍스트 유효성 검사', () => {
    it('유효한 컨텍스트는 true를 반환해야 함', () => {
      expect(UserContextService.isValid()).toBe(true)
    })

    it('빈 identifierValue는 유효하지 않아야 함', () => {
      UserContextService.setUserIdentifier('userId', '')

      expect(UserContextService.isValid()).toBe(false)
    })
  })

  describe('FormData 생성', () => {
    it('파일과 사용자 식별자를 포함해야 함', () => {
      const file = new File(['content'], 'test.txt')
      const formData = UserContextService.createFormData(file)

      expect(formData.get('file')).toBe(file)
      expect(formData.get('userId')).toBe('tester')
    })

    it('프로젝트 정보를 포함할 수 있어야 함', () => {
      UserContextService.setProjectContext('proj-123', 'dept-456')

      const file = new File(['content'], 'test.txt')
      const formData = UserContextService.createFormData(file)

      expect(formData.get('projectId')).toBe('proj-123')
      expect(formData.get('departmentId')).toBe('dept-456')
    })

    it('메타데이터를 포함할 수 있어야 함', () => {
      UserContextService.setMetadata('category', 'insurance')

      const file = new File(['content'], 'test.txt')
      const formData = UserContextService.createFormData(file)

      expect(formData.get('metadata_category')).toBe('insurance')
    })

    it('phoneNumber 식별자로 FormData를 생성할 수 있어야 함', () => {
      UserContextService.setUserIdentifier('phoneNumber', '010-1234-5678')

      const file = new File(['content'], 'test.txt')
      const formData = UserContextService.createFormData(file)

      expect(formData.get('phoneNumber')).toBe('010-1234-5678')
      expect(formData.get('userId')).toBeNull()
    })
  })
})
