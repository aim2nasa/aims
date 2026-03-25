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
 * Blob을 브라우저 다운로드로 트리거 (폴백 경로)
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

/**
 * File System Access API (showSaveFilePicker) 지원 여부 확인
 */
function isFileSystemAccessSupported(): boolean {
  return typeof window.showSaveFilePicker === 'function'
}

/**
 * ReadableStream을 File System Access API로 디스크에 직접 스트리밍 저장
 * - 브라우저 메모리에 전체 파일을 로드하지 않음 (OOM 방지)
 * - 사용자가 저장 경로를 직접 선택
 */
async function streamToFile(
  body: ReadableStream<Uint8Array>,
  filename: string,
  abortSignal?: AbortSignal,
): Promise<void> {
  // isFileSystemAccessSupported()로 사전 검증 후 호출됨
  const fileHandle = await window.showSaveFilePicker!({
    suggestedName: filename,
    types: [
      {
        description: 'ZIP 파일',
        accept: { 'application/zip': ['.zip'] },
      },
    ],
  })

  const writable = await fileHandle.createWritable()

  try {
    // pipeTo는 signal abort 시 writable을 자동으로 닫고 AbortError를 던짐
    await body.pipeTo(writable, { signal: abortSignal })
  } catch (err) {
    // 스트리밍 실패 시 불완전한 쓰기를 명시적으로 취소 (abort > close)
    try { await writable.abort() } catch { /* 이미 닫힘 */ }
    throw err
  }
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

      const filename = filenameOverride || parseContentDisposition(response.headers.get('Content-Disposition'))

      // 스트리밍 다운로드: File System Access API 지원 + response.body 존재 시
      if (isFileSystemAccessSupported() && response.body) {
        await streamToFile(response.body, filename, abortRef.current.signal)
      } else {
        // 폴백: 메모리에 전체 로드 후 다운로드 (미지원 브라우저, response.body null)
        const blob = await response.blob()
        triggerBrowserDownload(blob, filename)
      }

      return // 성공
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
        return // 사용자 취소 (fetch abort, 파일 저장 대화상자 취소, 권한 거부)
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
