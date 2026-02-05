/**
 * useBatchId Hook
 * @description sessionStorage의 batchId를 실시간으로 추적
 *
 * 핵심 UX 원칙:
 * - "이번 업로드"는 현재 진행 중인 배치만 표시
 * - 배치 100% 완료 → 자동 정리 (DocumentProcessingStatusBar에서 처리)
 * - 새 업로드 시작 → 새 배치로 즉시 전환
 */

import { useSyncExternalStore } from 'react'

const BATCH_ID_KEY = 'aims-current-batch-id'

// sessionStorage 변경 구독자 관리
const subscribers = new Set<() => void>()

function subscribe(callback: () => void): () => void {
  subscribers.add(callback)
  return () => subscribers.delete(callback)
}

function getSnapshot(): string | null {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem(BATCH_ID_KEY)
}

function getServerSnapshot(): string | null {
  return null
}

// 외부에서 batchId 변경 시 모든 구독자에게 알림
function notifyBatchIdChange(): void {
  subscribers.forEach(callback => callback())
}

// storage 이벤트 리스너 (다른 탭에서 변경 시)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === BATCH_ID_KEY) {
      notifyBatchIdChange()
    }
  })
}

/**
 * batchId 설정 (업로드 시작 시 호출)
 */
export function setBatchId(batchId: string): void {
  sessionStorage.setItem(BATCH_ID_KEY, batchId)
  notifyBatchIdChange()
}

/**
 * batchId 삭제 (배치 완료 시 호출)
 */
export function clearBatchId(): void {
  sessionStorage.removeItem(BATCH_ID_KEY)
  notifyBatchIdChange()
}

/**
 * 현재 batchId 가져오기 (React 외부에서 사용)
 */
export function getBatchId(): string | null {
  return getSnapshot()
}

/**
 * batchId를 실시간으로 추적하는 훅
 * sessionStorage 변경 시 자동으로 리렌더링
 */
export function useBatchId(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
