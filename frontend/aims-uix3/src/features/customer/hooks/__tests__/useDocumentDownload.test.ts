/**
 * useDocumentDownload 회귀 테스트
 *
 * 대용량 문서함 다운로드 수정 (2026-03-25) 검증:
 * - 스트리밍 경로 (showSaveFilePicker + ReadableStream.pipeTo)
 * - 폴백 경로 (response.blob)
 * - 사용자 취소 (AbortError, NotAllowedError)
 * - 중복 호출 방지
 * - 서버 에러 처리
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDocumentDownload } from '../useDocumentDownload'

// === Mock 설정 ===

vi.mock('@/shared/lib/api', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token' }),
  API_CONFIG: { BASE_URL: '' },
}))

function createMockResponse(options: {
  ok?: boolean
  status?: number
  body?: ReadableStream<Uint8Array> | null
  headers?: Record<string, string>
  json?: () => Promise<unknown>
  blob?: () => Promise<Blob>
}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    body: options.body ?? null,
    headers: new Headers(options.headers ?? {
      'Content-Disposition': 'attachment; filename="test.zip"',
    }),
    json: options.json ?? (async () => ({})),
    blob: options.blob ?? (async () => new Blob(['test'], { type: 'application/zip' })),
  } as unknown as Response
}

function createMockReadableStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]))
      controller.close()
    },
  })
}

describe('useDocumentDownload', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.restoreAllMocks()
    fetchMock = vi.fn()
    global.fetch = fetchMock

    // showSaveFilePicker 미지원 기본 설정
    ;(window as Record<string, unknown>).showSaveFilePicker = undefined

    // triggerBrowserDownload에 필요한 DOM mock
    URL.createObjectURL = vi.fn(() => 'blob:test')
    URL.revokeObjectURL = vi.fn()
  })

  describe('스트리밍 경로 (File System Access API)', () => {
    it('showSaveFilePicker 지원 시 streamToFile 경로로 진입해야 함', async () => {
      const mockWritable = {
        abort: vi.fn(),
        close: vi.fn(),
      }
      const mockFileHandle = {
        createWritable: vi.fn().mockResolvedValue(mockWritable),
      }
      ;(window as Record<string, unknown>).showSaveFilePicker = vi.fn().mockResolvedValue(mockFileHandle)

      const mockBody = createMockReadableStream()
      const pipeTo = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(mockBody, 'pipeTo', { value: pipeTo })

      fetchMock.mockResolvedValue(createMockResponse({ body: mockBody }))

      const { result } = renderHook(() => useDocumentDownload())

      await act(async () => {
        await result.current.download(['customer-1'])
      })

      // showSaveFilePicker 호출됨
      expect(window.showSaveFilePicker).toHaveBeenCalled()
      // pipeTo 호출됨 (스트리밍)
      expect(pipeTo).toHaveBeenCalled()
    })

    it('사용자가 저장 대화상자 취소 시 (AbortError) 에러 미전파', async () => {
      ;(window as Record<string, unknown>).showSaveFilePicker = vi.fn().mockRejectedValue(
        new DOMException('The user aborted a request.', 'AbortError')
      )

      fetchMock.mockResolvedValue(createMockResponse({ body: createMockReadableStream() }))

      const { result } = renderHook(() => useDocumentDownload())

      // 에러 없이 완료되어야 함
      await act(async () => {
        await result.current.download(['customer-1'])
      })

      expect(result.current.isDownloading).toBe(false)
    })

    it('사용자가 저장 대화상자 취소 시 (NotAllowedError) 에러 미전파', async () => {
      ;(window as Record<string, unknown>).showSaveFilePicker = vi.fn().mockRejectedValue(
        new DOMException('The request is not allowed.', 'NotAllowedError')
      )

      fetchMock.mockResolvedValue(createMockResponse({ body: createMockReadableStream() }))

      const { result } = renderHook(() => useDocumentDownload())

      await act(async () => {
        await result.current.download(['customer-1'])
      })

      expect(result.current.isDownloading).toBe(false)
    })

    it('스트리밍 실패 시 writable.abort() 호출해야 함', async () => {
      const mockWritable = {
        abort: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
      }
      const mockFileHandle = {
        createWritable: vi.fn().mockResolvedValue(mockWritable),
      }
      ;(window as Record<string, unknown>).showSaveFilePicker = vi.fn().mockResolvedValue(mockFileHandle)

      const mockBody = createMockReadableStream()
      const pipeTo = vi.fn().mockRejectedValue(new Error('Network error'))
      Object.defineProperty(mockBody, 'pipeTo', { value: pipeTo })

      fetchMock.mockResolvedValue(createMockResponse({ body: mockBody }))

      const { result } = renderHook(() => useDocumentDownload())

      try {
        await act(async () => {
          await result.current.download(['customer-1'])
        })
      } catch {
        // 에러 전파 예상됨
      }

      // abort가 호출되어야 함 (close가 아닌)
      expect(mockWritable.abort).toHaveBeenCalled()
      expect(mockWritable.close).not.toHaveBeenCalled()
    })
  })

  describe('폴백 경로 (response.blob)', () => {
    it('showSaveFilePicker 미지원 시 blob 폴백 경로로 진입해야 함', async () => {
      const blobMock = vi.fn().mockResolvedValue(new Blob(['test'], { type: 'application/zip' }))
      fetchMock.mockResolvedValue(createMockResponse({ blob: blobMock }))

      const { result } = renderHook(() => useDocumentDownload())

      await act(async () => {
        await result.current.download(['customer-1'])
      })

      // blob() 호출됨 (폴백)
      expect(blobMock).toHaveBeenCalled()
    })

    it('response.body가 null이면 blob 폴백', async () => {
      ;(window as Record<string, unknown>).showSaveFilePicker = vi.fn()

      const blobMock = vi.fn().mockResolvedValue(new Blob(['test']))
      fetchMock.mockResolvedValue(createMockResponse({ body: null, blob: blobMock }))

      const { result } = renderHook(() => useDocumentDownload())

      await act(async () => {
        await result.current.download(['customer-1'])
      })

      expect(blobMock).toHaveBeenCalled()
    })
  })

  describe('중복 호출 방지', () => {
    it('isDownloading 중 재호출 시 무시해야 함', async () => {
      // 완료되지 않는 fetch로 isDownloading 유지
      fetchMock.mockReturnValue(new Promise(() => {}))

      const { result } = renderHook(() => useDocumentDownload())

      // 첫 번째 호출 (완료되지 않음)
      act(() => {
        result.current.download(['customer-1'])
      })

      expect(result.current.isDownloading).toBe(true)

      // 두 번째 호출 (무시됨)
      act(() => {
        result.current.download(['customer-2'])
      })

      // fetch는 1회만 호출
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('customerIds가 빈 배열이면 무시', async () => {
      const { result } = renderHook(() => useDocumentDownload())

      await act(async () => {
        await result.current.download([])
      })

      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('서버 에러 처리', () => {
    it('서버 4xx 응답 시 에러 메시지 추출 후 throw', async () => {
      fetchMock.mockResolvedValue(createMockResponse({
        ok: false,
        status: 403,
        json: async () => ({ error: '접근 권한이 없는 고객이 포함되어 있습니다.' }),
      }))

      const { result } = renderHook(() => useDocumentDownload())

      await expect(
        act(async () => {
          await result.current.download(['customer-1'])
        })
      ).rejects.toThrow('접근 권한이 없는 고객이 포함되어 있습니다.')
    })

    it('서버 에러 JSON 파싱 실패 시 기본 에러 메시지', async () => {
      fetchMock.mockResolvedValue(createMockResponse({
        ok: false,
        status: 500,
        json: async () => { throw new Error('not json') },
      }))

      const { result } = renderHook(() => useDocumentDownload())

      await expect(
        act(async () => {
          await result.current.download(['customer-1'])
        })
      ).rejects.toThrow('다운로드 실패 (500)')
    })
  })

  describe('취소 (cancel)', () => {
    it('cancel 호출 시 isDownloading false로 변경', async () => {
      fetchMock.mockReturnValue(new Promise(() => {}))

      const { result } = renderHook(() => useDocumentDownload())

      act(() => {
        result.current.download(['customer-1'])
      })

      expect(result.current.isDownloading).toBe(true)

      act(() => {
        result.current.cancel()
      })

      expect(result.current.isDownloading).toBe(false)
    })
  })
})
