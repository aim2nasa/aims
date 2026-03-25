/**
 * useDocumentDownload - 고객별 문서함 ZIP 다운로드 훅
 *
 * 2단계 다운로드: POST로 ZIP 준비 → GET으로 브라우저 다운로드 (이어받기 지원)
 * - 1명: [고객명].zip
 * - 여러 명: AIMS_문서함_YYYYMMDD.zip
 * - AbortController 취소, isDownloading 중복 방지
 */
import { useState, useRef, useCallback } from 'react'
import { getAuthHeaders, getAuthToken, API_CONFIG } from '@/shared/lib/api'

interface DownloadPrepareResponse {
  success: boolean
  data?: {
    downloadId: string
    filename: string
    size: number
    skippedFiles: number
    expiresIn: number
  }
  error?: string
}

interface UseDocumentDownloadReturn {
  /** ZIP 다운로드 실행 (filenameOverride: 프론트엔드에서 파일명 지정) */
  download: (customerIds: string[], filenameOverride?: string) => Promise<void>
  /** 진행 중인 다운로드 취소 */
  cancel: () => void
  /** 다운로드 진행 중 여부 */
  isDownloading: boolean
}

export function useDocumentDownload(): UseDocumentDownloadReturn {
  const [isDownloading, setIsDownloading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const download = useCallback(async (customerIds: string[], filenameOverride?: string) => {
    if (isDownloading || customerIds.length === 0) return

    setIsDownloading(true)
    abortRef.current = new AbortController()

    try {
      // Phase 1: ZIP 준비 요청
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

      const result: DownloadPrepareResponse = await response.json()
      if (!result.success || !result.data) {
        throw new Error(result.error || 'ZIP 준비 실패')
      }

      const { downloadId, filename } = result.data
      const finalFilename = filenameOverride || filename

      // Phase 2: 브라우저 기본 다운로드 트리거 (이어받기 지원)
      // <a> 태그는 Authorization 헤더 전송 불가 → ?token=JWT 쿼리 파라미터로 인증
      const token = getAuthToken()
      const downloadUrl = `${API_CONFIG.BASE_URL}/api/documents/download/${downloadId}${token ? `?token=${encodeURIComponent(token)}` : ''}`

      // <a> 태그로 브라우저 기본 다운로드 매니저 활용
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = finalFilename
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      // 정리
      setTimeout(() => {
        document.body.removeChild(a)
      }, 100)

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
  }, [isDownloading])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setIsDownloading(false)
  }, [])

  return { download, cancel, isDownloading }
}
