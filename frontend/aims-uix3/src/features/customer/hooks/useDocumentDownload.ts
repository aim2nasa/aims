/**
 * useDocumentDownload - 고객별 문서함 ZIP 다운로드 훅
 *
 * POST /api/documents/download 호출
 * - 1명: [고객명].zip
 * - 여러 명: AIMS_문서함_YYYYMMDD.zip
 * - AbortController 취소, isDownloading 중복 방지
 */
import { useState, useRef, useCallback } from 'react'
import { getAuthHeaders, API_CONFIG } from '@/shared/lib/api'

interface UseDocumentDownloadReturn {
  /** ZIP 다운로드 실행 (filenameOverride: 프론트엔드에서 파일명 지정) */
  download: (customerIds: string[], filenameOverride?: string) => Promise<void>
  /** 진행 중인 다운로드 취소 */
  cancel: () => void
  /** 다운로드 진행 중 여부 */
  isDownloading: boolean
}

/**
 * Content-Disposition 헤더에서 파일명 추출
 * RFC 6266: filename*=UTF-8''encoded_name 우선, filename= 폴백
 */
function parseContentDisposition(header: string | null): string {
  if (!header) return 'download.zip'

  // filename*=UTF-8'' 형식 (RFC 5987)
  const starMatch = header.match(/filename\*=UTF-8''(.+?)(?:;|$)/i)
  if (starMatch) {
    try {
      return decodeURIComponent(starMatch[1].trim())
    } catch {
      // 디코딩 실패 시 폴백
    }
  }

  // filename="..." 형식
  const quotedMatch = header.match(/filename="(.+?)"/)
  if (quotedMatch) return quotedMatch[1]

  // filename=... 형식 (따옴표 없음)
  const plainMatch = header.match(/filename=([^\s;]+)/)
  if (plainMatch) return plainMatch[1]

  return 'download.zip'
}

/**
 * Blob을 브라우저 다운로드로 트리거
 */
function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  // 정리
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 100)
}

export function useDocumentDownload(): UseDocumentDownloadReturn {
  const [isDownloading, setIsDownloading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const download = useCallback(async (customerIds: string[], filenameOverride?: string) => {
    if (isDownloading || customerIds.length === 0) return

    setIsDownloading(true)
    abortRef.current = new AbortController()

    try {
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
        // 서버 에러 메시지 추출 시도
        let errorMsg = `다운로드 실패 (${response.status})`
        try {
          const errData = await response.json()
          if (errData.error) errorMsg = errData.error
        } catch {
          // JSON 파싱 실패 — 기본 에러 메시지 사용
        }
        throw new Error(errorMsg)
      }

      const blob = await response.blob()
      const filename = filenameOverride || parseContentDisposition(response.headers.get('Content-Disposition'))
      triggerBrowserDownload(blob, filename)

      return // 성공
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return // 사용자 취소 — 에러 아님
      }
      throw err // 호출자에게 에러 전파
    } finally {
      setIsDownloading(false)
      abortRef.current = null
    }
  }, [isDownloading])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setIsDownloading(false)
  }, [])

  return { download, cancel, isDownloading }
}
