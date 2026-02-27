/**
 * DocumentProcessingStatusBar — 배치 완료 cleanup 3-guard 회귀 테스트
 * @since 2026-02-27
 *
 * 커밋 50781b1e: 이번 업로드 프로그레스바 누적 표시 (AR+CRS 합산)
 *
 * 검증 대상:
 * - 배치 100% 완료 → 2초 후 clearBatchId() 정상 호출 (정상 경로)
 * - Guard 1: 타이머 대기 중 batchId 변경 → clearBatchId 차단
 * - Guard 2: 타이머 대기 중 batchTotal 증가 → clearBatchId 차단
 * - Guard 3: 타이머 대기 중 setBatchId 재호출 → clearBatchId 차단
 * - 시나리오: AR 처리중 CRS 업로드 → 기존 batchId 재사용 → 프로그레스바 누적 표시
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { createElement } from 'react'
import type { DocumentStatistics, ParsingStats } from '@/types/documentStatistics'

// --- useBatchId 모듈 mock ---
let mockBatchId: string | null = null
let mockLastSetTime = 0

vi.mock('@/hooks/useBatchId', () => ({
  getBatchId: () => mockBatchId,
  clearBatchId: vi.fn(() => { mockBatchId = null }),
  getLastBatchSetTime: () => mockLastSetTime,
  setBatchId: vi.fn((id: string) => {
    mockBatchId = id
    mockLastSetTime = Date.now()
  }),
}))

// CSS import mock
vi.mock('../DocumentProcessingStatusBar.css', () => ({}))

// 모듈 import (mock 설정 후)
import { DocumentProcessingStatusBar } from '../DocumentProcessingStatusBar'
import { clearBatchId } from '@/hooks/useBatchId'

// --- 헬퍼 ---

const EMPTY_PARSING: ParsingStats = { total: 0, completed: 0, processing: 0, pending: 0, failed: 0 }

/** 전체 라이브러리 통계 (최소한의 값) */
function makeStats(overrides: Partial<DocumentStatistics> = {}): DocumentStatistics {
  return {
    total: 10,
    completed: 5,
    processing: 0,
    error: 0,
    pending: 0,
    completed_with_skip: 0,
    credit_pending: 0,
    stages: { upload: 0, meta: 0, ocr_prep: 0, ocr: 0, docembed: 0 },
    badgeTypes: { TXT: 0, OCR: 0, BIN: 0 },
    arParsing: EMPTY_PARSING,
    crsParsing: EMPTY_PARSING,
    ...overrides,
  }
}

/** 배치 통계 생성 */
function makeBatchStats(overrides: Partial<DocumentStatistics> = {}): DocumentStatistics {
  return makeStats(overrides)
}

describe('DocumentProcessingStatusBar — batch cleanup 3-guard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockBatchId = null
    mockLastSetTime = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('정상 경로: 배치 100% 완료 → 2초 후 clearBatchId 호출', () => {
    it('배치가 100% 완료되고 processing/pending/credit_pending 모두 0이면 2초 후 clearBatchId 호출', () => {
      mockBatchId = 'batch-done'
      mockLastSetTime = Date.now() - 10000 // 10초 전에 설정됨

      const batchStats = makeBatchStats({
        total: 5,
        completed: 5,
        processing: 0,
        pending: 0,
        credit_pending: 0,
      })

      render(createElement(DocumentProcessingStatusBar, {
        statistics: makeStats(),
        batchStatistics: batchStats,
        isLoading: false,
      }))

      // 아직 clearBatchId 호출되지 않아야 함
      expect(clearBatchId).not.toHaveBeenCalled()

      // 2초 경과
      act(() => { vi.advanceTimersByTime(2000) })

      // clearBatchId 호출됨
      expect(clearBatchId).toHaveBeenCalledTimes(1)
    })

    it('배치가 아직 진행 중이면 clearBatchId 호출하지 않음', () => {
      mockBatchId = 'batch-in-progress'
      mockLastSetTime = Date.now() - 5000

      const batchStats = makeBatchStats({
        total: 10,
        completed: 7,
        processing: 2,
        pending: 1,
        credit_pending: 0,
      })

      render(createElement(DocumentProcessingStatusBar, {
        statistics: makeStats(),
        batchStatistics: batchStats,
        isLoading: false,
      }))

      act(() => { vi.advanceTimersByTime(5000) })

      expect(clearBatchId).not.toHaveBeenCalled()
    })

    it('credit_pending이 있으면 100% 완료되어도 clearBatchId 호출하지 않음', () => {
      mockBatchId = 'batch-credit-wait'
      mockLastSetTime = Date.now() - 5000

      const batchStats = makeBatchStats({
        total: 5,
        completed: 5,
        processing: 0,
        pending: 0,
        credit_pending: 2,
      })

      render(createElement(DocumentProcessingStatusBar, {
        statistics: makeStats(),
        batchStatistics: batchStats,
        isLoading: false,
      }))

      act(() => { vi.advanceTimersByTime(5000) })

      expect(clearBatchId).not.toHaveBeenCalled()
    })
  })

  describe('Guard 1: batchId 변경 → clearBatchId 차단', () => {
    it('타이머 대기 중 batchId가 변경되면 clearBatchId를 호출하지 않음', () => {
      mockBatchId = 'batch-original'
      mockLastSetTime = Date.now() - 10000

      const batchStats = makeBatchStats({
        total: 5,
        completed: 5,
        processing: 0,
        pending: 0,
        credit_pending: 0,
      })

      render(createElement(DocumentProcessingStatusBar, {
        statistics: makeStats(),
        batchStatistics: batchStats,
        isLoading: false,
      }))

      // 1초 후 batchId 변경 (완전히 새로운 배치)
      act(() => { vi.advanceTimersByTime(1000) })
      mockBatchId = 'batch-new-upload'

      // 나머지 1초 경과
      act(() => { vi.advanceTimersByTime(1000) })

      // batchId가 변경되었으므로 clearBatchId 차단
      expect(clearBatchId).not.toHaveBeenCalled()
    })
  })

  describe('Guard 2: batchTotal 증가 → clearBatchId 차단', () => {
    it('타이머 대기 중 batchTotal이 증가하면 clearBatchId를 호출하지 않음', () => {
      mockBatchId = 'batch-growing'
      mockLastSetTime = Date.now() - 10000

      const initialBatchStats = makeBatchStats({
        total: 5,
        completed: 5,
        processing: 0,
        pending: 0,
        credit_pending: 0,
      })

      const { rerender } = render(createElement(DocumentProcessingStatusBar, {
        statistics: makeStats(),
        batchStatistics: initialBatchStats,
        isLoading: false,
      }))

      // 1초 후 새 파일 추가 (batchTotal 증가)
      act(() => { vi.advanceTimersByTime(1000) })

      const grownBatchStats = makeBatchStats({
        total: 10,  // 5 → 10 증가
        completed: 5,
        processing: 3,
        pending: 2,
        credit_pending: 0,
      })

      act(() => {
        rerender(createElement(DocumentProcessingStatusBar, {
          statistics: makeStats(),
          batchStatistics: grownBatchStats,
          isLoading: false,
        }))
      })

      // 나머지 1초 경과
      act(() => { vi.advanceTimersByTime(1000) })

      // batchTotal이 증가했으므로 clearBatchId 차단
      expect(clearBatchId).not.toHaveBeenCalled()
    })
  })

  describe('Guard 3: setBatchId 재호출 → clearBatchId 차단', () => {
    it('타이머 대기 중 setBatchId가 재호출되면 clearBatchId를 호출하지 않음', () => {
      mockBatchId = 'batch-reused'
      mockLastSetTime = Date.now() - 10000

      const batchStats = makeBatchStats({
        total: 5,
        completed: 5,
        processing: 0,
        pending: 0,
        credit_pending: 0,
      })

      render(createElement(DocumentProcessingStatusBar, {
        statistics: makeStats(),
        batchStatistics: batchStats,
        isLoading: false,
      }))

      // 1초 후 setBatchId 재호출 (같은 batchId지만 lastSetTime 갱신)
      act(() => { vi.advanceTimersByTime(1000) })
      mockLastSetTime = Date.now() // setBatchId 재호출 시뮬레이션

      // 나머지 1초 경과
      act(() => { vi.advanceTimersByTime(1000) })

      // lastSetTime이 snapshotTime 이후이므로 clearBatchId 차단
      expect(clearBatchId).not.toHaveBeenCalled()
    })
  })

  describe('시나리오: AR 처리중 CRS 업로드 → 누적 표시', () => {
    it('AR 배치 100% → 타이머 시작 → CRS 업로드(setBatchId 재호출) → clearBatchId 차단 → 누적 진행률', () => {
      // 1단계: AR 배치 완료 (100%)
      mockBatchId = 'batch-ar-crs'
      mockLastSetTime = Date.now() - 10000

      const arCompleteBatch = makeBatchStats({
        total: 5,
        completed: 5,
        processing: 0,
        pending: 0,
        credit_pending: 0,
      })

      const { rerender } = render(createElement(DocumentProcessingStatusBar, {
        statistics: makeStats(),
        batchStatistics: arCompleteBatch,
        isLoading: false,
      }))

      // 타이머 시작됨 (shouldCleanup = true)
      expect(clearBatchId).not.toHaveBeenCalled()

      // 2단계: 1초 후 CRS 업로드 시작 (같은 batchId 재사용 + setBatchId 재호출)
      act(() => { vi.advanceTimersByTime(1000) })
      mockLastSetTime = Date.now() // CRS 업로드 시 setBatchId(existingBatchId) 호출

      // 3단계: 서버에서 CRS 파일 포함된 통계 반환 (total 증가)
      const arPlusCrsBatch = makeBatchStats({
        total: 15,  // AR 5 + CRS 10
        completed: 5,
        processing: 5,
        pending: 5,
        credit_pending: 0,
      })

      act(() => {
        rerender(createElement(DocumentProcessingStatusBar, {
          statistics: makeStats(),
          batchStatistics: arPlusCrsBatch,
          isLoading: false,
        }))
      })

      // 4단계: 원래 타이머 만료 (2초)
      act(() => { vi.advanceTimersByTime(1000) })

      // Guard 3 (lastSetTime > snapshotTime) + Guard 2 (total 증가) 모두 작동
      expect(clearBatchId).not.toHaveBeenCalled()

      // 5단계: 누적 배치가 계속 표시됨 (batchId 유지)
      expect(mockBatchId).toBe('batch-ar-crs')
    })

    it('AR 배치 완료 → 2초 경과 → clearBatchId → CRS 업로드 시 새 배치 생성', () => {
      // 1단계: AR 배치 완료
      mockBatchId = 'batch-ar-only'
      mockLastSetTime = Date.now() - 10000

      const arCompleteBatch = makeBatchStats({
        total: 5,
        completed: 5,
        processing: 0,
        pending: 0,
        credit_pending: 0,
      })

      render(createElement(DocumentProcessingStatusBar, {
        statistics: makeStats(),
        batchStatistics: arCompleteBatch,
        isLoading: false,
      }))

      // 2단계: 2초 경과 → clearBatchId 정상 호출
      act(() => { vi.advanceTimersByTime(2000) })
      expect(clearBatchId).toHaveBeenCalledTimes(1)

      // 3단계: CRS 업로드 시 getBatchId() === null → 새 배치 생성
      expect(mockBatchId).toBeNull()
    })
  })

  describe('타이머 중복 방지', () => {
    it('shouldCleanup 상태가 유지되어도 타이머가 중복 생성되지 않음', () => {
      mockBatchId = 'batch-no-dup'
      mockLastSetTime = Date.now() - 10000

      const batchStats = makeBatchStats({
        total: 5,
        completed: 5,
        processing: 0,
        pending: 0,
        credit_pending: 0,
      })

      const { rerender } = render(createElement(DocumentProcessingStatusBar, {
        statistics: makeStats(),
        batchStatistics: batchStats,
        isLoading: false,
      }))

      // 같은 props로 rerender (shouldCleanup 여전히 true)
      act(() => {
        rerender(createElement(DocumentProcessingStatusBar, {
          statistics: makeStats(),
          batchStatistics: batchStats,
          isLoading: false,
        }))
      })

      // 2초 경과
      act(() => { vi.advanceTimersByTime(2000) })

      // clearBatchId는 정확히 1번만 호출 (중복 타이머 없음)
      expect(clearBatchId).toHaveBeenCalledTimes(1)
    })
  })

  describe('언마운트 시 타이머 정리', () => {
    it('컴포넌트 언마운트 시 cleanup 타이머가 취소됨', () => {
      mockBatchId = 'batch-unmount'
      mockLastSetTime = Date.now() - 10000

      const batchStats = makeBatchStats({
        total: 5,
        completed: 5,
        processing: 0,
        pending: 0,
        credit_pending: 0,
      })

      const { unmount } = render(createElement(DocumentProcessingStatusBar, {
        statistics: makeStats(),
        batchStatistics: batchStats,
        isLoading: false,
      }))

      // 1초 후 언마운트
      act(() => { vi.advanceTimersByTime(1000) })
      unmount()

      // 나머지 1초 경과
      act(() => { vi.advanceTimersByTime(1000) })

      // 언마운트되었으므로 clearBatchId 호출되지 않아야 함
      expect(clearBatchId).not.toHaveBeenCalled()
    })
  })
})
