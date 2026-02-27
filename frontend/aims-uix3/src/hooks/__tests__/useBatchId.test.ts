/**
 * useBatchId Hook Tests
 * @since 2026-02-05
 *
 * sessionStorage의 batchId를 실시간으로 추적하는 훅 테스트
 * - sessionStorage 읽기/쓰기
 * - 구독자 알림
 * - 교차 탭 이벤트 처리
 * - SSR 호환성
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBatchId, setBatchId, clearBatchId, getBatchId, getLastBatchSetTime } from '../useBatchId'

describe('useBatchId', () => {
  const BATCH_ID_KEY = 'aims-current-batch-id'

  beforeEach(() => {
    // sessionStorage 초기화
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  describe('useBatchId 훅', () => {
    it('초기값이 sessionStorage에 없으면 null을 반환해야 함', () => {
      const { result } = renderHook(() => useBatchId())

      expect(result.current).toBeNull()
    })

    it('sessionStorage에 값이 있으면 그 값을 반환해야 함', () => {
      sessionStorage.setItem(BATCH_ID_KEY, 'batch-123')

      const { result } = renderHook(() => useBatchId())

      expect(result.current).toBe('batch-123')
    })

    it('setBatchId 호출 시 값이 업데이트되어야 함', () => {
      const { result } = renderHook(() => useBatchId())

      expect(result.current).toBeNull()

      act(() => {
        setBatchId('new-batch-456')
      })

      expect(result.current).toBe('new-batch-456')
      expect(sessionStorage.getItem(BATCH_ID_KEY)).toBe('new-batch-456')
    })

    it('clearBatchId 호출 시 값이 null이 되어야 함', () => {
      sessionStorage.setItem(BATCH_ID_KEY, 'batch-to-clear')

      const { result } = renderHook(() => useBatchId())

      expect(result.current).toBe('batch-to-clear')

      act(() => {
        clearBatchId()
      })

      expect(result.current).toBeNull()
      expect(sessionStorage.getItem(BATCH_ID_KEY)).toBeNull()
    })

    it('여러 훅 인스턴스가 동기화되어야 함', () => {
      const { result: result1 } = renderHook(() => useBatchId())
      const { result: result2 } = renderHook(() => useBatchId())

      expect(result1.current).toBeNull()
      expect(result2.current).toBeNull()

      act(() => {
        setBatchId('shared-batch')
      })

      expect(result1.current).toBe('shared-batch')
      expect(result2.current).toBe('shared-batch')
    })
  })

  describe('setBatchId', () => {
    it('sessionStorage에 값을 저장해야 함', () => {
      setBatchId('test-batch')

      expect(sessionStorage.getItem(BATCH_ID_KEY)).toBe('test-batch')
    })

    it('기존 값을 덮어써야 함', () => {
      sessionStorage.setItem(BATCH_ID_KEY, 'old-batch')

      setBatchId('new-batch')

      expect(sessionStorage.getItem(BATCH_ID_KEY)).toBe('new-batch')
    })

    it('구독자들에게 알림을 보내야 함', () => {
      const { result } = renderHook(() => useBatchId())

      act(() => {
        setBatchId('notified-batch')
      })

      expect(result.current).toBe('notified-batch')
    })
  })

  describe('clearBatchId', () => {
    it('sessionStorage에서 값을 삭제해야 함', () => {
      sessionStorage.setItem(BATCH_ID_KEY, 'batch-to-remove')

      clearBatchId()

      expect(sessionStorage.getItem(BATCH_ID_KEY)).toBeNull()
    })

    it('값이 없어도 에러가 발생하지 않아야 함', () => {
      expect(() => clearBatchId()).not.toThrow()
    })

    it('구독자들에게 알림을 보내야 함', () => {
      sessionStorage.setItem(BATCH_ID_KEY, 'batch-to-clear')

      const { result } = renderHook(() => useBatchId())

      expect(result.current).toBe('batch-to-clear')

      act(() => {
        clearBatchId()
      })

      expect(result.current).toBeNull()
    })
  })

  describe('getBatchId', () => {
    it('sessionStorage의 현재 값을 반환해야 함', () => {
      sessionStorage.setItem(BATCH_ID_KEY, 'current-batch')

      const value = getBatchId()

      expect(value).toBe('current-batch')
    })

    it('값이 없으면 null을 반환해야 함', () => {
      const value = getBatchId()

      expect(value).toBeNull()
    })

    it('React 외부에서도 사용 가능해야 함', () => {
      sessionStorage.setItem(BATCH_ID_KEY, 'external-batch')

      // 훅 없이 직접 호출
      expect(getBatchId()).toBe('external-batch')
    })
  })

  describe('교차 탭 동기화 (storage 이벤트)', () => {
    it('다른 탭에서 storage 이벤트가 발생하면 업데이트되어야 함', () => {
      const { result } = renderHook(() => useBatchId())

      expect(result.current).toBeNull()

      // 다른 탭에서 변경 시뮬레이션
      act(() => {
        // sessionStorage 직접 변경 (다른 탭처럼)
        sessionStorage.setItem(BATCH_ID_KEY, 'other-tab-batch')

        // storage 이벤트 발생
        window.dispatchEvent(new StorageEvent('storage', {
          key: BATCH_ID_KEY,
          newValue: 'other-tab-batch'
        }))
      })

      expect(result.current).toBe('other-tab-batch')
    })

    it('다른 키의 storage 이벤트는 무시해야 함', () => {
      const { result } = renderHook(() => useBatchId())

      act(() => {
        sessionStorage.setItem('other-key', 'other-value')

        window.dispatchEvent(new StorageEvent('storage', {
          key: 'other-key',
          newValue: 'other-value'
        }))
      })

      expect(result.current).toBeNull()
    })
  })

  describe('언마운트 정리', () => {
    it('언마운트 시 구독이 해제되어야 함', () => {
      const { result, unmount } = renderHook(() => useBatchId())

      // 초기 상태 확인
      expect(result.current).toBeNull()

      unmount()

      // 언마운트 후 setBatchId는 에러 없이 동작해야 함
      expect(() => setBatchId('after-unmount')).not.toThrow()
    })

    it('여러 훅 중 하나가 언마운트되어도 다른 훅은 계속 동작해야 함', () => {
      const { result: result1, unmount: unmount1 } = renderHook(() => useBatchId())
      const { result: result2 } = renderHook(() => useBatchId())

      unmount1()

      act(() => {
        setBatchId('still-working')
      })

      expect(result2.current).toBe('still-working')
    })
  })

  describe('타입 안정성', () => {
    it('반환 타입이 string | null이어야 함', () => {
      const { result } = renderHook(() => useBatchId())

      // null 케이스
      expect(result.current).toBeNull()

      act(() => {
        setBatchId('typed-batch')
      })

      // string 케이스
      expect(typeof result.current).toBe('string')
    })
  })

  describe('UX 시나리오', () => {
    it('업로드 시작 → 배치 ID 설정 → 완료 → 정리 시나리오', () => {
      const { result } = renderHook(() => useBatchId())

      // 1. 초기: 배치 없음
      expect(result.current).toBeNull()

      // 2. 업로드 시작: 배치 ID 설정
      act(() => {
        setBatchId('upload-batch-2024')
      })
      expect(result.current).toBe('upload-batch-2024')

      // 3. 업로드 진행 중: 배치 ID 유지
      expect(getBatchId()).toBe('upload-batch-2024')

      // 4. 업로드 완료: 배치 정리
      act(() => {
        clearBatchId()
      })
      expect(result.current).toBeNull()
    })

    it('새 업로드로 배치 전환 시나리오', () => {
      const { result } = renderHook(() => useBatchId())

      // 첫 번째 배치
      act(() => {
        setBatchId('first-batch')
      })
      expect(result.current).toBe('first-batch')

      // 새 업로드 시작 (새 배치로 즉시 전환)
      act(() => {
        setBatchId('second-batch')
      })
      expect(result.current).toBe('second-batch')
    })

    it('진행 중 새 업로드 시 기존 배치 재사용 시나리오', () => {
      // AR 업로드 시작
      act(() => {
        setBatchId('batch-ar')
      })
      expect(getBatchId()).toBe('batch-ar')
      const timeAfterAr = getLastBatchSetTime()

      // CRS 업로드 시작 (기존 배치 재사용)
      const existingBatchId = getBatchId()
      expect(existingBatchId).toBe('batch-ar')

      act(() => {
        setBatchId(existingBatchId!)
      })
      // batchId 동일하게 유지
      expect(getBatchId()).toBe('batch-ar')
      // lastSetTime은 갱신됨
      expect(getLastBatchSetTime()).toBeGreaterThanOrEqual(timeAfterAr)
    })
  })

  describe('getLastBatchSetTime', () => {
    it('setBatchId 호출 전에는 이전 호출 시각 또는 0을 반환', () => {
      // 모듈 레벨 변수이므로 다른 테스트에서 이미 설정되었을 수 있음
      expect(typeof getLastBatchSetTime()).toBe('number')
    })

    it('setBatchId 호출 후 현재 시각 이상의 값을 반환해야 함', () => {
      const before = Date.now()
      setBatchId('timing-test')
      const after = Date.now()

      const lastSetTime = getLastBatchSetTime()
      expect(lastSetTime).toBeGreaterThanOrEqual(before)
      expect(lastSetTime).toBeLessThanOrEqual(after)
    })

    it('연속 setBatchId 호출 시 마지막 호출 시각을 반환해야 함', () => {
      setBatchId('first')
      const firstTime = getLastBatchSetTime()

      setBatchId('second')
      const secondTime = getLastBatchSetTime()

      expect(secondTime).toBeGreaterThanOrEqual(firstTime)
    })

    it('clearBatchId는 lastSetTime에 영향을 주지 않아야 함', () => {
      setBatchId('before-clear')
      const timeBeforeClear = getLastBatchSetTime()

      clearBatchId()

      expect(getLastBatchSetTime()).toBe(timeBeforeClear)
    })

    it('cleanup 타이머 경쟁 조건 가드: 타이머 시작 후 setBatchId → snapshotTime 비교로 감지', () => {
      // 시나리오: 배치 100% 완료 → 타이머 시작 → 새 업로드 시작(기존 batchId 재사용)
      setBatchId('batch-complete')
      const snapshotTime = Date.now() // 타이머 시작 시각

      // 새 업로드 시작 (기존 batchId 재사용 — setBatchId 다시 호출)
      setBatchId('batch-complete')
      const lastSetAfterReuse = getLastBatchSetTime()

      // 가드 조건: getLastBatchSetTime() > snapshotTime
      // → lastSetTime이 snapshotTime 이후이므로 clearBatchId 차단
      expect(lastSetAfterReuse).toBeGreaterThanOrEqual(snapshotTime)
    })
  })
})
