/**
 * useDocumentDownload 회귀 테스트
 *
 * 2단계 다운로드 구조 (2026-03-25) 검증:
 * - Phase 1: POST → JSON 응답 파싱 + downloadId 추출
 * - Phase 2: <a> 태그 생성 + href에 downloadId + ?token=JWT 검증
 * - 에러 처리 (서버 4xx/5xx, JSON 파싱 실패)
 * - 사용자 취소 (AbortError)
 * - 중복 호출 방지
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDocumentDownload } from '../useDocumentDownload'

// === Mock 설정 ===

const MOCK_TOKEN = 'test-jwt-token-abc123'

vi.mock('@/shared/lib/api', () => ({
  getAuthHeaders: () => ({ Authorization: `Bearer ${MOCK_TOKEN}` }),
  getAuthToken: () => MOCK_TOKEN,
  API_CONFIG: { BASE_URL: '' },
}))

// <a> 태그 click 추적용
let capturedAnchor: HTMLAnchorElement | null = null
const originalCreateElement = document.createElement.bind(document)

function createPhase1Response(options: {
  ok?: boolean
  status?: number
  downloadId?: string
  filename?: string
  size?: number
  skippedFiles?: number
  error?: string
  jsonError?: boolean
  success?: boolean
}) {
  const {
    ok = true,
    status = 200,
    downloadId = 'a'.repeat(48),
    filename = '고객.zip',
    size = 1024,
    skippedFiles = 0,
    error,
    jsonError = false,
    success = true,
  } = options

  return {
    ok,
    status,
    json: jsonError
      ? async () => { throw new Error('not json') }
      : async () => ok
        ? { success, data: success ? { downloadId, filename, size, skippedFiles, expiresIn: 1800 } : undefined, error }
        : { success: false, error: error || `다운로드 준비 실패 (${status})` },
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
        // click mock (실제 네비게이션 방지)
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

  describe('Phase 1: ZIP 준비 요청 (POST)', () => {
    it('POST /api/documents/download에 customerIds를 전송해야 함', async () => {
      fetchMock.mockResolvedValue(createPhase1Response({}))

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

    it('서버 응답에서 downloadId를 추출해야 함', async () => {
      const testDownloadId = 'b'.repeat(48)
      fetchMock.mockResolvedValue(createPhase1Response({ downloadId: testDownloadId }))

      const { result } = renderHook(() => useDocumentDownload())

      await act(async () => {
        await result.current.download(['customer-1'])
      })

      // Phase 2에서 downloadId가 URL에 포함되어야 함
      expect(capturedAnchor).not.toBeNull()
      expect(capturedAnchor!.href).toContain(`/api/documents/download/${testDownloadId}`)
    })
  })

  describe('Phase 2: <a> 태그 브라우저 다운로드', () => {
    it('<a> 태그의 href에 downloadId + ?token=JWT가 포함되어야 함', async () => {
      const testDownloadId = 'c'.repeat(48)
      fetchMock.mockResolvedValue(createPhase1Response({ downloadId: testDownloadId }))

      const { result } = renderHook(() => useDocumentDownload())

      await act(async () => {
        await result.current.download(['customer-1'])
      })

      expect(capturedAnchor).not.toBeNull()
      expect(capturedAnchor!.href).toContain(`/api/documents/download/${testDownloadId}`)
      expect(capturedAnchor!.href).toContain(`?token=${encodeURIComponent(MOCK_TOKEN)}`)
    })

    it('<a> 태그의 download 속성에 서버 제공 filename이 설정되어야 함', async () => {
      fetchMock.mockResolvedValue(createPhase1Response({ filename: '홍길동.zip' }))

      const { result } = renderHook(() => useDocumentDownload())

      await act(async () => {
        await result.current.download(['customer-1'])
      })

      expect(capturedAnchor).not.toBeNull()
      expect(capturedAnchor!.download).toBe('홍길동.zip')
    })

    it('filenameOverride 지정 시 서버 filename 대신 사용', async () => {
      fetchMock.mockResolvedValue(createPhase1Response({ filename: '서버파일명.zip' }))

      const { result } = renderHook(() => useDocumentDownload())

      await act(async () => {
        await result.current.download(['customer-1'], '커스텀파일명.zip')
      })

      expect(capturedAnchor).not.toBeNull()
      expect(capturedAnchor!.download).toBe('커스텀파일명.zip')
    })

    it('<a> 태그 click()이 호출되어야 함', async () => {
      fetchMock.mockResolvedValue(createPhase1Response({}))

      const { result } = renderHook(() => useDocumentDownload())

      await act(async () => {
        await result.current.download(['customer-1'])
      })

      expect(capturedAnchor).not.toBeNull()
      expect(capturedAnchor!.click).toHaveBeenCalled()
    })

    it('Phase 1 완료 후 isDownloading이 false로 변경 (브라우저 다운로드는 추적 불가)', async () => {
      fetchMock.mockResolvedValue(createPhase1Response({}))

      const { result } = renderHook(() => useDocumentDownload())

      await act(async () => {
        await result.current.download(['customer-1'])
      })

      expect(result.current.isDownloading).toBe(false)
    })
  })

  describe('에러 처리', () => {
    it('서버 4xx 응답 시 에러 메시지 추출 후 throw', async () => {
      fetchMock.mockResolvedValue(createPhase1Response({
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

    it('서버 에러 JSON 파싱 실패 시 기본 에러 메시지', async () => {
      fetchMock.mockResolvedValue(createPhase1Response({
        ok: false,
        status: 500,
        jsonError: true,
      }))

      const { result } = renderHook(() => useDocumentDownload())

      await expect(
        act(async () => {
          await result.current.download(['customer-1'])
        })
      ).rejects.toThrow('다운로드 준비 실패 (500)')
    })

    it('success=false + error 메시지 시 throw', async () => {
      fetchMock.mockResolvedValue(createPhase1Response({
        ok: true,
        success: false,
        error: 'ZIP 준비 실패',
      }))

      const { result } = renderHook(() => useDocumentDownload())

      await expect(
        act(async () => {
          await result.current.download(['customer-1'])
        })
      ).rejects.toThrow('ZIP 준비 실패')
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

      // 에러 없이 완료되어야 함
      await act(async () => {
        await result.current.download(['customer-1'])
      })

      expect(result.current.isDownloading).toBe(false)
    })
  })
})
