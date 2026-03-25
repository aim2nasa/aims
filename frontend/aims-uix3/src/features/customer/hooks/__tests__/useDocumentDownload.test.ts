/**
 * useDocumentDownload 회귀 테스트
 *
 * 2단계 다운로드 구조 (2026-03-25) 검증:
 * - Phase 1: POST → SSE 스트림 파싱 (진행률 + complete 이벤트)
 * - Phase 2: <a> 태그 생성 + href에 downloadId (JWT URL 미노출)
 * - 에러 처리 (서버 4xx/5xx, SSE 에러 이벤트)
 * - 사용자 취소 (AbortError, NotAllowedError)
 * - 중복 호출 방지
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDocumentDownload } from '../useDocumentDownload'

// === Mock 설정 ===

const MOCK_TOKEN = 'test-jwt-token-abc123'

vi.mock('@/shared/lib/api', () => ({
  getAuthHeaders: () => ({ Authorization: `Bearer ${MOCK_TOKEN}` }),
  API_CONFIG: { BASE_URL: '' },
}))

// <a> 태그 click 추적용
let capturedAnchor: HTMLAnchorElement | null = null
const originalCreateElement = document.createElement.bind(document)

/**
 * SSE 스트리밍 응답 생성 헬퍼
 * Phase 1 POST가 SSE(text/event-stream) 형식으로 응답
 */
function createSSEResponse(options: {
  ok?: boolean
  status?: number
  downloadId?: string
  filename?: string
  size?: number
  total?: number
  skippedFiles?: number
  error?: string
  includeProgress?: boolean
}) {
  const {
    ok = true,
    status = 200,
    downloadId = 'a'.repeat(48),
    filename = '고객.zip',
    size = 1024,
    total = 5,
    skippedFiles = 0,
    error,
    includeProgress = true,
  } = options

  // SSE 이벤트 조립
  let sseData = ''

  if (!ok) {
    // 서버 에러 시 JSON 응답
    return {
      ok,
      status,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: false, error: error || `다운로드 준비 실패 (${status})` }),
    } as unknown as Response
  }

  if (error) {
    sseData += `event: error\ndata: ${JSON.stringify({ error })}\n\n`
  } else {
    sseData += `event: start\ndata: ${JSON.stringify({ total })}\n\n`

    if (includeProgress) {
      sseData += `event: progress\ndata: ${JSON.stringify({ processed: total, total, skipped: skippedFiles })}\n\n`
    }

    sseData += `event: complete\ndata: ${JSON.stringify({ downloadId, filename, size, skippedFiles, expiresIn: 1800 })}\n\n`
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sseData))
      controller.close()
    },
  })

  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    body: stream,
  } as unknown as Response
}

describe('useDocumentDownload', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.restoreAllMocks()
    fetchMock = vi.fn()
    global.fetch = fetchMock
    capturedAnchor = null

    // <a> 태그 생성 가로채기
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag)
      if (tag === 'a') {
        capturedAnchor = el as HTMLAnchorElement
        vi.spyOn(el, 'click').mockImplementation(() => {})
      }
      return el
    })

    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node)
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Phase 1: SSE 스트림 ZIP 준비', () => {
    it('POST /api/documents/download에 customerIds를 전송해야 함', async () => {
      fetchMock.mockResolvedValue(createSSEResponse({}))

      const { result } = renderHook(() => useDocumentDownload())

      await act(async () => {
        await result.current.download(['customer-1', 'customer-2'])
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, options] = fetchMock.mock.calls[0]
      expect(url).toBe('/api/documents/download')
      expect(options.method).toBe('POST')
      expect(JSON.parse(options.body)).toEqual({ customerIds: ['customer-1', 'customer-2'] })
      expect(options.headers.Authorization).toBe(`Bearer ${MOCK_TOKEN}`)
    })

    it('SSE complete 이벤트에서 downloadId를 추출해야 함', async () => {
      const testDownloadId = 'b'.repeat(48)
      fetchMock.mockResolvedValue(createSSEResponse({ downloadId: testDownloadId }))

      const { result } = renderHook(() => useDocumentDownload())

      await act(async () => {
        await result.current.download(['customer-1'])
      })

      expect(capturedAnchor).not.toBeNull()
      expect(capturedAnchor!.href).toContain(`/api/documents/download/${testDownloadId}`)
    })
  })

  describe('Phase 2: <a> 태그 브라우저 다운로드', () => {
    it('<a> 태그의 href에 downloadId만 포함 (JWT URL 미노출)', async () => {
      const testDownloadId = 'c'.repeat(48)
      fetchMock.mockResolvedValue(createSSEResponse({ downloadId: testDownloadId }))

      const { result } = renderHook(() => useDocumentDownload())

      await act(async () => {
        await result.current.download(['customer-1'])
      })

      expect(capturedAnchor).not.toBeNull()
      expect(capturedAnchor!.href).toContain(`/api/documents/download/${testDownloadId}`)
      // JWT가 URL에 포함되지 않아야 함 (보안)
      expect(capturedAnchor!.href).not.toContain('token=')
    })

    it('<a> 태그의 download 속성에 서버 제공 filename이 설정되어야 함', async () => {
      fetchMock.mockResolvedValue(createSSEResponse({ filename: '홍길동.zip' }))

      const { result } = renderHook(() => useDocumentDownload())

      await act(async () => {
        await result.current.download(['customer-1'])
      })

      expect(capturedAnchor).not.toBeNull()
      expect(capturedAnchor!.download).toBe('홍길동.zip')
    })

    it('filenameOverride 지정 시 서버 filename 대신 사용', async () => {
      fetchMock.mockResolvedValue(createSSEResponse({ filename: '서버파일명.zip' }))

      const { result } = renderHook(() => useDocumentDownload())

      await act(async () => {
        await result.current.download(['customer-1'], '커스텀파일명.zip')
      })

      expect(capturedAnchor).not.toBeNull()
      expect(capturedAnchor!.download).toBe('커스텀파일명.zip')
    })

    it('<a> 태그 click()이 호출되어야 함', async () => {
      fetchMock.mockResolvedValue(createSSEResponse({}))

      const { result } = renderHook(() => useDocumentDownload())

      await act(async () => {
        await result.current.download(['customer-1'])
      })

      expect(capturedAnchor).not.toBeNull()
      expect(capturedAnchor!.click).toHaveBeenCalled()
    })

    it('Phase 1 완료 후 isDownloading이 false로 변경', async () => {
      fetchMock.mockResolvedValue(createSSEResponse({}))

      const { result } = renderHook(() => useDocumentDownload())

      await act(async () => {
        await result.current.download(['customer-1'])
      })

      expect(result.current.isDownloading).toBe(false)
    })
  })

  describe('에러 처리', () => {
    it('서버 4xx 응답 시 에러 메시지 추출 후 throw', async () => {
      fetchMock.mockResolvedValue(createSSEResponse({
        ok: false,
        status: 403,
        error: '접근 권한이 없는 고객이 포함되어 있습니다.',
      }))

      const { result } = renderHook(() => useDocumentDownload())

      await expect(
        act(async () => {
          await result.current.download(['customer-1'])
        })
      ).rejects.toThrow('접근 권한이 없는 고객이 포함되어 있습니다.')
    })

    it('SSE error 이벤트 시 throw', async () => {
      fetchMock.mockResolvedValue(createSSEResponse({
        error: 'ZIP 생성 실패',
      }))

      const { result } = renderHook(() => useDocumentDownload())

      await expect(
        act(async () => {
          await result.current.download(['customer-1'])
        })
      ).rejects.toThrow('ZIP 생성 실패')
    })
  })

  describe('중복 호출 방지', () => {
    it('isDownloading 중 재호출 시 무시해야 함', async () => {
      fetchMock.mockReturnValue(new Promise(() => {}))

      const { result } = renderHook(() => useDocumentDownload())

      act(() => {
        result.current.download(['customer-1'])
      })

      expect(result.current.isDownloading).toBe(true)

      act(() => {
        result.current.download(['customer-2'])
      })

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

    it('AbortError 발생 시 에러 미전파', async () => {
      fetchMock.mockRejectedValue(new DOMException('The user aborted a request.', 'AbortError'))

      const { result } = renderHook(() => useDocumentDownload())

      await act(async () => {
        await result.current.download(['customer-1'])
      })

      expect(result.current.isDownloading).toBe(false)
    })

    it('NotAllowedError 발생 시 에러 미전파', async () => {
      fetchMock.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'))

      const { result } = renderHook(() => useDocumentDownload())

      await act(async () => {
        await result.current.download(['customer-1'])
      })

      expect(result.current.isDownloading).toBe(false)
    })
  })

  describe('진행률 점진적 전송 (regression: 즉시 100% 버그 수정)', () => {
    it('onProgress가 점진적으로 호출되어야 함 (한 번에 100% 아님)', async () => {
      // 5개 파일을 1개씩 점진적으로 progress 이벤트 전송하는 SSE 응답
      const total = 5
      let sseData = `event: start\ndata: ${JSON.stringify({ totalFiles: total })}\n\n`
      for (let i = 1; i <= total; i++) {
        sseData += `event: progress\ndata: ${JSON.stringify({ processed: i, total, skipped: 0 })}\n\n`
      }
      sseData += `event: complete\ndata: ${JSON.stringify({ downloadId: 'd'.repeat(48), filename: '테스트.zip', size: 2048, skippedFiles: 0, expiresIn: 1800 })}\n\n`

      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseData))
          controller.close()
        },
      })

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        body: stream,
      } as unknown as Response)

      const progressCalls: Array<{ processed: number; total: number; skipped: number }> = []
      const onProgress = (p: { processed: number; total: number; skipped: number }) => {
        progressCalls.push({ ...p })
      }

      const { result } = renderHook(() => useDocumentDownload({ onProgress }))

      await act(async () => {
        await result.current.download(['customer-1'])
      })

      // 5번 호출되어야 함 (1/5, 2/5, 3/5, 4/5, 5/5)
      expect(progressCalls.length).toBe(total)

      // 첫 번째 progress는 100% 미만이어야 함 (즉시 100% 버그 방지)
      expect(progressCalls[0].processed).toBeLessThan(progressCalls[0].total)

      // 마지막 progress만 100%
      expect(progressCalls[progressCalls.length - 1].processed).toBe(total)

      // 점진적 증가 확인
      for (let i = 1; i < progressCalls.length; i++) {
        expect(progressCalls[i].processed).toBeGreaterThan(progressCalls[i - 1].processed)
      }
    })

    it('skip 파일과 정상 파일이 혼재 시 processed = 압축건 + skip건', async () => {
      // 3개 파일: 1개 skip(즉시) → 2개 정상(entry 이벤트)
      const total = 3
      const skipped = 1
      let sseData = `event: start\ndata: ${JSON.stringify({ totalFiles: total })}\n\n`
      // skip 1건 (processed=1은 skippedFiles 1건)
      sseData += `event: progress\ndata: ${JSON.stringify({ processed: 1, total, skipped: 1 })}\n\n`
      // entry 이벤트 2건 (processed=2, processed=3)
      sseData += `event: progress\ndata: ${JSON.stringify({ processed: 2, total, skipped: 1 })}\n\n`
      sseData += `event: progress\ndata: ${JSON.stringify({ processed: 3, total, skipped: 1 })}\n\n`
      sseData += `event: complete\ndata: ${JSON.stringify({ downloadId: 'e'.repeat(48), filename: '혼합.zip', size: 1024, skippedFiles: skipped, expiresIn: 1800 })}\n\n`

      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseData))
          controller.close()
        },
      })

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        body: stream,
      } as unknown as Response)

      const progressCalls: Array<{ processed: number; total: number; skipped: number }> = []
      const onProgress = (p: { processed: number; total: number; skipped: number }) => {
        progressCalls.push({ ...p })
      }

      const { result } = renderHook(() => useDocumentDownload({ onProgress }))

      await act(async () => {
        await result.current.download(['customer-1'])
      })

      // 3번 호출 (skip 1 + entry 2)
      expect(progressCalls.length).toBe(3)

      // 마지막 progress에서 processed = total (skip + 압축 합산)
      const last = progressCalls[progressCalls.length - 1]
      expect(last.processed).toBe(total)
      expect(last.skipped).toBe(skipped)
    })
  })
})
