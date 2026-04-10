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
let mockExpectedTotal = 0

vi.mock('@/hooks/useBatchId', () => ({
  getBatchId: () => mockBatchId,
  clearBatchId: vi.fn(() => { mockBatchId = null; mockExpectedTotal = 0 }),
  getLastBatchSetTime: () => mockLastSetTime,
  getBatchExpectedTotal: () => mockExpectedTotal,
  addBatchExpectedTotal: vi.fn((count: number) => { mockExpectedTotal += count }),
  setBatchId: vi.fn((id: string) => {
    mockBatchId = id
    mockLastSetTime = Date.now()
  }),
}))

// CSS import mock
vi.mock('../DocumentProcessingStatusBar.css', () => ({}))

// 모듈 import (mock 설정 후)
import { DocumentProcessingStatusBar, type CurrentProcessingFile } from '../DocumentProcessingStatusBar'
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
    mockExpectedTotal = 0
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

  describe('에러로 미완료된 배치 — 프로그레스바 표시 유지', () => {
    it('processing=0, pending=0, error > 0, batchPct < 100이면 프로그레스바가 표시되어야 함', () => {
      mockBatchId = 'batch-with-errors'
      mockLastSetTime = Date.now() - 10000

      // 10건 중 7건 완료, 3건 에러 → batchPct = 70% < 100 → batchIsActive = true
      const batchStats = makeBatchStats({
        total: 10,
        completed: 7,
        processing: 0,
        pending: 0,
        error: 3,
        credit_pending: 0,
      })

      const { container } = render(createElement(DocumentProcessingStatusBar, {
        statistics: makeStats({ total: 10 }),
        batchStatistics: batchStats,
        isLoading: false,
      }))

      // 배치 섹션이 표시되어야 함 (에러로 미완료)
      expect(container.querySelector('.psb-batch')).not.toBeNull()

      // 5초 경과해도 clearBatchId가 호출되지 않아야 함 (shouldCleanup = false)
      act(() => { vi.advanceTimersByTime(5000) })
      expect(clearBatchId).not.toHaveBeenCalled()

      // batchId가 유지됨
      expect(mockBatchId).toBe('batch-with-errors')
    })
  })

  describe('Guard 4: expectedTotal 미달 → cleanup 지연 (조기 프로그레스바 사라짐 방지)', () => {
    it('🔴 핵심 시나리오: 100개 업로드 중 10개만 서버 도착 → 10/10 완료 → 프로그레스바 사라지지 않음', () => {
      // 사용자가 100개 파일을 일괄 업로드 시작
      mockBatchId = 'batch-100-files'
      mockLastSetTime = Date.now() - 5000
      mockExpectedTotal = 100 // addBatchExpectedTotal(100) 호출됨

      // 서버에는 아직 10개만 도착, 모두 완료 → total=10, completed=10
      const batchStats = makeBatchStats({
        total: 10,
        completed: 10,
        processing: 0,
        pending: 0,
        credit_pending: 0,
      })

      render(createElement(DocumentProcessingStatusBar, {
        statistics: makeStats(),
        batchStatistics: batchStats,
        isLoading: false,
      }))

      // shouldCleanup = true (batchPct=100%, processing=0, pending=0)
      // 그러나 Guard 4: total(10) < expectedTotal(100) → cleanupDelay = 15초

      // 2초 경과 — 기존 로직이었다면 여기서 사라짐
      act(() => { vi.advanceTimersByTime(2000) })
      expect(clearBatchId).not.toHaveBeenCalled() // ✅ 사라지지 않음!
      expect(mockBatchId).toBe('batch-100-files')

      // 10초 경과해도 여전히 유지 (15초 미만)
      act(() => { vi.advanceTimersByTime(8000) })
      expect(clearBatchId).not.toHaveBeenCalled()
    })

    it('100개 업로드 중 50개 도착 → 50/50 완료 → 타이머 갱신 → 계속 유지', () => {
      mockBatchId = 'batch-100-slow'
      mockLastSetTime = Date.now() - 5000
      mockExpectedTotal = 100

      // 처음: 10개만 도착 완료
      const batch10 = makeBatchStats({
        total: 10, completed: 10, processing: 0, pending: 0, credit_pending: 0,
      })

      const { rerender } = render(createElement(DocumentProcessingStatusBar, {
        statistics: makeStats(),
        batchStatistics: batch10,
        isLoading: false,
      }))

      // 5초 경과 — Guard 4로 인해 아직 정리 안 됨
      act(() => { vi.advanceTimersByTime(5000) })
      expect(clearBatchId).not.toHaveBeenCalled()

      // 50개 도착, 일부 처리 중 → shouldCleanup = false → 타이머 취소
      const batch50 = makeBatchStats({
        total: 50, completed: 30, processing: 10, pending: 10, credit_pending: 0,
      })

      act(() => {
        rerender(createElement(DocumentProcessingStatusBar, {
          statistics: makeStats(),
          batchStatistics: batch50,
          isLoading: false,
        }))
      })

      // shouldCleanup = false이므로 타이머 취소됨
      act(() => { vi.advanceTimersByTime(15000) })
      expect(clearBatchId).not.toHaveBeenCalled()
      expect(mockBatchId).toBe('batch-100-slow')
    })

    it('100개 모두 도착 + 모두 완료 → expectedTotal 충족 → 2초 후 정상 cleanup', () => {
      mockBatchId = 'batch-100-done'
      mockLastSetTime = Date.now() - 30000
      mockExpectedTotal = 100

      // 100개 모두 도착, 모두 완료
      const batchAll = makeBatchStats({
        total: 100, completed: 100, processing: 0, pending: 0, credit_pending: 0,
      })

      render(createElement(DocumentProcessingStatusBar, {
        statistics: makeStats(),
        batchStatistics: batchAll,
        isLoading: false,
      }))

      // total(100) >= expectedTotal(100) → cleanupDelay = 2초
      act(() => { vi.advanceTimersByTime(2000) })
      expect(clearBatchId).toHaveBeenCalledTimes(1) // ✅ 정상 cleanup
    })

    it('expectedTotal 미달 + 15초 stale guard → 강제 cleanup (skip/에러로 도달 불가)', () => {
      mockBatchId = 'batch-stale-expected'
      mockLastSetTime = Date.now() - 30000
      mockExpectedTotal = 100

      // 80개만 도착하고 업로드 멈춤 (나머지 20개는 skip/네트워크 에러)
      const batch80 = makeBatchStats({
        total: 80, completed: 80, processing: 0, pending: 0, credit_pending: 0,
      })

      render(createElement(DocumentProcessingStatusBar, {
        statistics: makeStats(),
        batchStatistics: batch80,
        isLoading: false,
      }))

      // 2초 — 아직 안 됨 (expectedTotal 미달)
      act(() => { vi.advanceTimersByTime(2000) })
      expect(clearBatchId).not.toHaveBeenCalled()

      // 15초 — stale guard 발동으로 강제 cleanup
      act(() => { vi.advanceTimersByTime(13000) })
      expect(clearBatchId).toHaveBeenCalledTimes(1) // ✅ 영구 차단 방지
    })

    it('expectedTotal이 0이면 (기존 동작 호환) → 2초 후 정상 cleanup', () => {
      mockBatchId = 'batch-no-expected'
      mockLastSetTime = Date.now() - 30000
      mockExpectedTotal = 0 // addBatchExpectedTotal 미호출 (기존 코드 경로)

      const batchDone = makeBatchStats({
        total: 5, completed: 5, processing: 0, pending: 0, credit_pending: 0,
      })

      render(createElement(DocumentProcessingStatusBar, {
        statistics: makeStats(),
        batchStatistics: batchDone,
        isLoading: false,
      }))

      act(() => { vi.advanceTimersByTime(2000) })
      expect(clearBatchId).toHaveBeenCalledTimes(1) // ✅ 기존 동작 유지
    })
  })

  describe('🔴 #53: 현재 처리 중인 파일 1건 표시', () => {
    function makeCandidate(overrides: Partial<CurrentProcessingFile> = {}): CurrentProcessingFile {
      return {
        id: 'doc-1',
        displayName: '테스트파일.pdf',
        progressMessage: 'OCR 처리 중',
        progress: 50,
        ...overrides,
      }
    }

    it('processing 파일이 여러 개여도 1개만 표시된다', () => {
      mockBatchId = 'batch-53'
      mockLastSetTime = Date.now() - 5000

      const batchStats = makeBatchStats({
        total: 10, completed: 3, processing: 7, pending: 0, credit_pending: 0,
      })

      const candidates: CurrentProcessingFile[] = [
        makeCandidate({ id: 'a', displayName: 'alpha.pdf', progress: 90 }),
        makeCandidate({ id: 'b', displayName: 'beta.pdf', progress: 70 }),
        makeCandidate({ id: 'c', displayName: 'gamma.pdf', progress: 30 }),
      ]

      const { container } = render(createElement(DocumentProcessingStatusBar, {
        statistics: makeStats(),
        batchStatistics: batchStats,
        isLoading: false,
        processingCandidates: candidates,
      }))

      const currentFileEls = container.querySelectorAll('.psb-current-file')
      expect(currentFileEls.length).toBe(1)

      const nameEl = container.querySelector('.psb-current-file-name')
      expect(nameEl).not.toBeNull()
      // 첫 번째 후보(alpha.pdf)가 표시됨
      expect(nameEl?.textContent).toBe('alpha.pdf')
    })

    it('30자 초과 파일명은 말줄임(…)된다', () => {
      mockBatchId = 'batch-long'
      mockLastSetTime = Date.now() - 5000

      const batchStats = makeBatchStats({
        total: 2, completed: 0, processing: 2, pending: 0, credit_pending: 0,
      })

      const longName = '매우매우매우매우매우매우매우매우매우긴파일이름입니다_길다.pdf' // 33+ chars
      const candidates: CurrentProcessingFile[] = [
        makeCandidate({ id: 'long', displayName: longName, progress: 40 }),
      ]

      const { container } = render(createElement(DocumentProcessingStatusBar, {
        statistics: makeStats(),
        batchStatistics: batchStats,
        isLoading: false,
        processingCandidates: candidates,
      }))

      const nameEl = container.querySelector('.psb-current-file-name')
      expect(nameEl).not.toBeNull()
      const text = nameEl?.textContent ?? ''
      expect(text.length).toBeLessThanOrEqual(30)
      expect(text.endsWith('…')).toBe(true)
      // title 속성에는 원본 전체 파일명 유지
      expect(nameEl?.getAttribute('title')).toBe(longName)
    })

    it('processingCandidates가 빈 배열이면 현재 파일 줄이 표시되지 않는다', () => {
      mockBatchId = 'batch-empty'
      mockLastSetTime = Date.now() - 5000

      const batchStats = makeBatchStats({
        total: 5, completed: 2, processing: 3, pending: 0, credit_pending: 0,
      })

      const { container } = render(createElement(DocumentProcessingStatusBar, {
        statistics: makeStats(),
        batchStatistics: batchStats,
        isLoading: false,
        processingCandidates: [],
      }))

      expect(container.querySelector('.psb-current-file')).toBeNull()
    })

    it('processingCandidates 미전달 시에도 graceful fallback (줄 표시 안 함)', () => {
      mockBatchId = 'batch-undef'
      mockLastSetTime = Date.now() - 5000

      const batchStats = makeBatchStats({
        total: 5, completed: 2, processing: 3, pending: 0, credit_pending: 0,
      })

      const { container } = render(createElement(DocumentProcessingStatusBar, {
        statistics: makeStats(),
        batchStatistics: batchStats,
        isLoading: false,
      }))

      expect(container.querySelector('.psb-current-file')).toBeNull()
    })

    it('processing이 0이면 StatusBar 전체가 숨겨져 현재 파일 줄도 보이지 않음 (기존 동작 유지)', () => {
      mockBatchId = null

      const candidates: CurrentProcessingFile[] = [
        makeCandidate({ id: 'stale', displayName: 'stale.pdf', progress: 50 }),
      ]

      const { container } = render(createElement(DocumentProcessingStatusBar, {
        statistics: makeStats({ total: 10, completed: 10, processing: 0 }),
        batchStatistics: null,
        isLoading: false,
        processingCandidates: candidates,
      }))

      // 전체 StatusBar 숨김 → 현재 파일 줄도 없음
      expect(container.querySelector('.psb-current-file')).toBeNull()
    })

    it('2초 경과 시 다음 후보로 교체된다', () => {
      mockBatchId = 'batch-rotate'
      mockLastSetTime = Date.now() - 5000

      const batchStats = makeBatchStats({
        total: 10, completed: 3, processing: 7, pending: 0, credit_pending: 0,
      })

      const candidates: CurrentProcessingFile[] = [
        makeCandidate({ id: 'a', displayName: 'alpha.pdf', progress: 90 }),
        makeCandidate({ id: 'b', displayName: 'beta.pdf', progress: 70 }),
      ]

      const { container } = render(createElement(DocumentProcessingStatusBar, {
        statistics: makeStats(),
        batchStatistics: batchStats,
        isLoading: false,
        processingCandidates: candidates,
      }))

      // 초기: alpha.pdf
      expect(container.querySelector('.psb-current-file-name')?.textContent).toBe('alpha.pdf')

      // 2초 경과 → beta.pdf
      act(() => { vi.advanceTimersByTime(2000) })
      expect(container.querySelector('.psb-current-file-name')?.textContent).toBe('beta.pdf')

      // 추가 2초 → 다시 alpha.pdf (순환)
      act(() => { vi.advanceTimersByTime(2000) })
      expect(container.querySelector('.psb-current-file-name')?.textContent).toBe('alpha.pdf')
    })

    it('progressMessage와 progress가 형식대로 표시된다', () => {
      mockBatchId = 'batch-format'
      mockLastSetTime = Date.now() - 5000

      const batchStats = makeBatchStats({
        total: 1, completed: 0, processing: 1, pending: 0, credit_pending: 0,
      })

      const candidates: CurrentProcessingFile[] = [
        makeCandidate({
          id: 'x',
          displayName: '주_마리치_증권-DB.pdf',
          progressMessage: 'OCR 처리 중',
          progress: 70,
        }),
      ]

      const { container } = render(createElement(DocumentProcessingStatusBar, {
        statistics: makeStats(),
        batchStatistics: batchStats,
        isLoading: false,
        processingCandidates: candidates,
      }))

      expect(container.querySelector('.psb-current-file-name')?.textContent).toBe('주_마리치_증권-DB.pdf')
      expect(container.querySelector('.psb-current-file-message')?.textContent).toBe('OCR 처리 중')
      expect(container.querySelector('.psb-current-file-progress')?.textContent).toBe('(70%)')
    })
  })

  describe('batchStatistics=null 시 배치 섹션 미표시 (stale data 방지)', () => {
    it('batchStatistics가 null이면 "이번 업로드" 섹션이 렌더되지 않음', () => {
      mockBatchId = null // clearBatchId 호출 후 상태

      const { container } = render(createElement(DocumentProcessingStatusBar, {
        statistics: makeStats({ processing: 1 }), // 라이브러리에 처리 중 있음 → isVisible=true
        batchStatistics: null,
        isLoading: false,
      }))

      // 배치 섹션이 없어야 함
      expect(container.querySelector('.psb-batch')).toBeNull()
      expect(container.querySelector('.psb-batch-label')).toBeNull()
    })

    it('라이브러리에 활성 파싱이 있어도, batchStatistics가 null이면 배치 섹션만 숨김', () => {
      mockBatchId = null

      const libraryStats = makeStats({
        processing: 2,
        arParsing: { total: 100, completed: 90, processing: 5, pending: 5, failed: 0 },
      })

      const { container } = render(createElement(DocumentProcessingStatusBar, {
        statistics: libraryStats,
        batchStatistics: null,
        isLoading: false,
      }))

      // 배치 섹션은 없어야 함
      expect(container.querySelector('.psb-batch')).toBeNull()
      // 전체 라이브러리 섹션은 있어야 함 (AR 파싱 활성)
      expect(container.querySelector('.psb-library')).not.toBeNull()
    })

    it('clearBatchId 후 batchStatistics=null → 배치 섹션 즉시 제거 (stale data 문제 재현)', () => {
      mockBatchId = 'batch-stale'
      mockLastSetTime = Date.now() - 10000

      // 1단계: 배치 완료 상태로 렌더
      const completeBatchStats = makeBatchStats({
        total: 20,
        completed: 20,
        processing: 0,
        pending: 0,
        credit_pending: 0,
      })

      const libraryStats = makeStats({
        processing: 1, // 라이브러리에 처리 중 있음 → isVisible=true
        crsParsing: { total: 704, completed: 703, processing: 1, pending: 0, failed: 0 },
      })

      const { container, rerender } = render(createElement(DocumentProcessingStatusBar, {
        statistics: libraryStats,
        batchStatistics: completeBatchStats,
        isLoading: false,
      }))

      // 배치 섹션이 있어야 함
      expect(container.querySelector('.psb-batch')).not.toBeNull()

      // 2단계: clearBatchId 호출 후 → batchStatistics=null로 rerender
      act(() => { vi.advanceTimersByTime(2000) })

      act(() => {
        rerender(createElement(DocumentProcessingStatusBar, {
          statistics: libraryStats,
          batchStatistics: null, // DocumentLibraryView에서 currentBatchId ? batchStats : null
          isLoading: false,
        }))
      })

      // 배치 섹션 즉시 제거됨
      expect(container.querySelector('.psb-batch')).toBeNull()
      // 라이브러리 섹션은 유지 (CRS 파싱 활성)
      expect(container.querySelector('.psb-library')).not.toBeNull()
    })
  })
})
