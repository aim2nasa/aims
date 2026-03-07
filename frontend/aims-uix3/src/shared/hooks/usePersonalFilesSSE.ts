/**
 * Personal Files SSE 실시간 업데이트 훅
 * SharedWorker 기반으로 리팩토링 - 멀티탭 연결 공유
 * @since 2025-01-04
 */

import { useEffect, useRef, useCallback } from 'react'
import { useSSESubscription } from './useSSESubscription'
import { errorReporter } from '@/shared/lib/errorReporter'

interface FileChangeEvent {
  type: 'created' | 'deleted' | 'renamed' | 'moved' | 'updated'
  itemId: string
  itemName: string
  itemType: 'file' | 'folder' | 'document'
  timestamp: string
}

interface UsePersonalFilesSSEOptions {
  /** SSE 활성화 여부 (기본: true) */
  enabled?: boolean
  /** 파일 변경 시 호출할 콜백 */
  onFileChange?: (event: FileChangeEvent) => void
}

/**
 * Personal Files SSE 훅
 * SharedWorker를 통해 연결을 공유하여 멀티탭 HTTP 연결 제한 문제 해결
 * @param userId 사용자 ID
 * @param onRefresh 파일 목록 새로고침 함수
 * @param options 옵션
 */
export function usePersonalFilesSSE(
  userId: string | null | undefined,
  onRefresh: () => void,
  options: UsePersonalFilesSSEOptions = {}
) {
  const { enabled = true, onFileChange } = options

  // 콜백을 ref로 저장하여 의존성 문제 해결
  const onRefreshRef = useRef(onRefresh)
  const onFileChangeRef = useRef(onFileChange)

  // 최신 콜백 참조 유지
  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    onFileChangeRef.current = onFileChange
  }, [onFileChange])

  // 이벤트 핸들러
  const handleEvent = useCallback((eventType: string, data: unknown) => {
    if (eventType === 'file-change') {
      try {
        const eventData = data as FileChangeEvent
        if (import.meta.env.DEV) {
          console.log('[PersonalFilesSSE] 파일 변경:', eventData)
        }

        // ref를 통해 최신 콜백 호출
        onFileChangeRef.current?.(eventData)
        onRefreshRef.current()
      } catch (error) {
        console.error('[PersonalFilesSSE] file-change 이벤트 처리 실패:', error)
        errorReporter.reportApiError(error as Error, { component: 'usePersonalFilesSSE.fileChange', payload: { userId } })
      }
    }
  }, [userId])

  // 연결 성공 핸들러 — 재연결 시 놓친 이벤트 복구를 위해 자동 재조회
  const handleConnect = useCallback((data: unknown) => {
    if (import.meta.env.DEV) {
      console.log('[PersonalFilesSSE] 연결됨:', data)
    }
    onRefreshRef.current()
  }, [])

  // 오류 핸들러
  const handleError = useCallback((error: Error) => {
    console.error('[PersonalFilesSSE] 연결 오류:', error)
    errorReporter.reportApiError(error, { component: 'usePersonalFilesSSE.onerror', payload: { userId } })
  }, [userId])

  // SharedWorker 기반 SSE 구독
  const { isConnected, disconnect, reconnect } = useSSESubscription<FileChangeEvent>({
    streamKey: userId ? `personal-files:${userId}` : '',
    endpoint: '/api/personal-files/stream',
    params: userId ? { userId } : {},
    enabled: enabled && !!userId,
    onEvent: handleEvent,
    onConnect: handleConnect,
    onError: handleError
  })

  return {
    isConnected,
    disconnect,
    reconnect,
  }
}

export default usePersonalFilesSSE
