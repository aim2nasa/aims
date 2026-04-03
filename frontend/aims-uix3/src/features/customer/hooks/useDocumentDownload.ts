/**
 * useDocumentDownload - 고객별 문서함 ZIP 다운로드 훅
 *
 * 2단계 다운로드: POST(SSE)로 ZIP 준비 + 실시간 진행률 → GET으로 브라우저 다운로드 (이어받기 지원)
 * - 1명: [고객명].zip
 * - 여러 명: AIMS_문서함_YYYYMMDD.zip
 * - AbortController 취소, isDownloading 중복 방지
 * - onProgress 콜백으로 ZIP 생성 진행률 실시간 전달
 */
import { useState, useRef, useCallback } from 'react'
import { getAuthHeaders, API_CONFIG } from '@/shared/lib/api'

/** Phase 1 SSE complete 이벤트 데이터 */
interface DownloadCompleteData {
  downloadId: string
  filename: string
  size: number
  skippedFiles: number
  expiresIn: number
}

/** ZIP 생성 진행률 콜백 파라미터 */
export interface DownloadProgress {
  /** 처리된 파일 수 */
  processed: number
  /** 전체 파일 수 */
  total: number
  /** 건너뛴 파일 수 */
  skipped: number
}

interface UseDocumentDownloadOptions {
  /** ZIP 생성 진행률 콜백 (각 파일 처리 시 호출) */
  onProgress?: (progress: DownloadProgress) => void
}

interface UseDocumentDownloadReturn {
  /** ZIP 다운로드 실행 (filenameOverride: 프론트엔드에서 파일명 지정) */
  download: (customerIds: string[], filenameOverride?: string) => Promise<void>
  /** 진행 중인 다운로드 취소 */
  cancel: () => void
  /** 다운로드 진행 중 여부 */
  isDownloading: boolean
}

/**
 * SSE 스트림에서 이벤트를 파싱하여 콜백 호출
 * text/event-stream 형식: "event: <type>\ndata: <json>\n\n"
 */
async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  handlers: {
    onStart?: (data: { totalFiles: number }) => void
    onProgress?: (data: DownloadProgress) => void
    onComplete: (data: DownloadCompleteData) => void
    onError: (error: string) => void
  },
  signal: AbortSignal
): Promise<void> {
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    if (signal.aborted) {
      await reader.cancel()
      return
    }

    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // SSE 이벤트 파싱: 더블 줄바꿈으로 분리
    const events = buffer.split('\n\n')
    // 마지막 조각은 아직 불완전할 수 있으므로 버퍼에 유지
    buffer = events.pop() || ''

    for (const eventBlock of events) {
      if (!eventBlock.trim()) continue

      let eventType = ''
      let eventData = ''

      for (const line of eventBlock.split('\n')) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7)
        } else if (line.startsWith('data: ')) {
          eventData = line.slice(6)
        }
      }

      if (!eventType || !eventData) continue

      try {
        const parsed = JSON.parse(eventData)

        switch (eventType) {
          case 'start':
            handlers.onStart?.(parsed)
            break
          case 'progress':
            handlers.onProgress?.(parsed)
            break
          case 'complete':
            handlers.onComplete(parsed)
            return
          case 'error':
            handlers.onError(parsed.error || 'ZIP 준비 실패')
            return
        }
      } catch {
        // JSON 파싱 실패 — 해당 이벤트 무시
      }
    }
  }
}

export function useDocumentDownload(options?: UseDocumentDownloadOptions): UseDocumentDownloadReturn {
  const [isDownloading, setIsDownloading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const download = useCallback(async (customerIds: string[], filenameOverride?: string) => {
    if (isDownloading || customerIds.length === 0) return

    setIsDownloading(true)
    abortRef.current = new AbortController()

    try {
      // Phase 1: ZIP 준비 요청 (SSE 스트리밍)
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/documents/download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ customerIds }),
        signal: abortRef.current.signal,
      })

      if (!response.ok) {
        let errorMsg = `다운로드 준비 실패 (${response.status})`
        try {
          const errData = await response.json()
          if (errData.error) errorMsg = errData.error
        } catch {
          // JSON 파싱 실패 — 기본 에러 메시지 사용
        }
        throw new Error(errorMsg)
      }

      // SSE 스트림 파싱
      const body = response.body
      if (!body) {
        throw new Error('서버 응답에 스트림이 없습니다.')
      }

      const reader = body.getReader()
      let completeData: DownloadCompleteData | null = null
      let sseError: string | null = null

      await parseSSEStream(reader, {
        onProgress: options?.onProgress,
        onComplete: (data) => { completeData = data },
        onError: (error) => { sseError = error },
      }, abortRef.current.signal)

      if (sseError) {
        throw new Error(sseError)
      }

      if (!completeData) {
        throw new Error('ZIP 준비가 완료되지 않았습니다.')
      }

      const { downloadId, filename } = completeData
      const finalFilename = filenameOverride || filename

      // Phase 2: 브라우저 기본 다운로드 트리거 (이어받기 지원)
      // downloadId 자체가 192비트 랜덤 일회용 토큰 (JWT URL 노출 방지)
      const downloadUrl = `${API_CONFIG.BASE_URL}/api/documents/download/${downloadId}`

      // <a> 태그로 브라우저 기본 다운로드 매니저 활용
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = finalFilename
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      // 정리 (동기적으로 즉시 제거 — setTimeout 사용 시 테스트 환경에서 document 해제 후 실행됨)
      document.body.removeChild(a)

      return // 성공
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
        return // 사용자 취소
      }
      throw err // 호출자에게 에러 전파
    } finally {
      setIsDownloading(false)
      abortRef.current = null
    }
  }, [isDownloading, options?.onProgress])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setIsDownloading(false)
  }, [])

  return { download, cancel, isDownloading }
}
