/**
 * useBatchId Hook
 * @description sessionStorage의 batchId를 실시간으로 추적
 *
 * 핵심 UX 원칙:
 * - "이번 업로드"는 현재 진행 중인 배치만 표시
 * - 배치 100% 완료 → 2초 후 자동 정리 (DocumentProcessingStatusBar에서 처리)
 * - 진행 중 새 업로드 시작 → 기존 배치에 누적 (동일 batchId 재사용)
 * - 완료 후 새 업로드 시작 → 새 배치로 전환
 * - expectedTotal: 업로드 예정 총 파일 수 — 서버 total이 이 수에 도달하기 전까지 cleanup 차단
 */

import { useSyncExternalStore } from 'react'

const BATCH_ID_KEY = 'aims-current-batch-id'

// setBatchId 마지막 호출 시각 (경쟁 조건 감지용)
let lastSetTime = 0

// 업로드 예정 총 파일 수 (서버 total이 이 수에 도달하기 전까지 cleanup 차단)
// 메모리 변수 — 같은 탭 내에서만 유효 (sessionStorage 불필요)
let expectedTotal = 0

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
  lastSetTime = Date.now()
  notifyBatchIdChange()
}

/**
 * 마지막 setBatchId 호출 시각 (cleanup 타이머 경쟁 조건 감지용)
 */
export function getLastBatchSetTime(): number {
  return lastSetTime
}

/**
 * 업로드 예정 총 파일 수 설정 (누적 방식)
 * 기존 배치에 파일을 추가할 때는 누적됨 (AR 처리중 CRS 추가 등)
 * 새 배치 시작 시(setBatchId에서 자동 초기화) 0부터 다시 시작
 */
export function addBatchExpectedTotal(count: number): void {
  expectedTotal += count
}

/**
 * 업로드 예정 총 파일 수 조회
 */
export function getBatchExpectedTotal(): number {
  return expectedTotal
}

/**
 * batchId 삭제 (배치 완료 시 호출)
 */
export function clearBatchId(): void {
  sessionStorage.removeItem(BATCH_ID_KEY)
  expectedTotal = 0
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
