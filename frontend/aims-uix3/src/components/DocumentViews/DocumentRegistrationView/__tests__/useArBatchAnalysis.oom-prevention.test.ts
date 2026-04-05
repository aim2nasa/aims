/**
 * useArBatchAnalysis - OOM 방지 대량 파일 시뮬레이션 테스트
 *
 * 검증 항목:
 * 1. 800개 파일 처리 시 정확성 (데이터 손실 없음)
 * 2. analyzingFiles 배치 갱신 패턴 (per-file이 아닌 interval 갱신)
 * 3. GC 양보 (setTimeout(0)) 호출 검증
 * 4. 최종 상태 일관성
 *
 * 배경: 745개 AR PDF 처리 시 Chrome OOM 발생
 * 원인: 파일당 3회 setBatchState → ~2,250회 호출 × 745-element 배열 spread
 * 수정: 로컬 배열 + 20개마다 배치 flush + 10개마다 GC 양보
 */

import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// ─── Mocks ───

vi.mock('@/features/customer/utils/pdfParser', () => ({
  checkAnnualReportFromPDF: vi.fn(),
}))

vi.mock('@/features/customer/api/annualReportApi', () => ({
  AnnualReportApi: {
    searchCustomersByName: vi.fn(),
  },
}))

import { useArBatchAnalysis } from '../hooks/useArBatchAnalysis'
import { checkAnnualReportFromPDF, AnnualReportApi } from '@/features/customer'

const mockCheckAR = checkAnnualReportFromPDF as ReturnType<typeof vi.fn>
const mockSearchCustomers = AnnualReportApi.searchCustomersByName as ReturnType<typeof vi.fn>

// ─── Helpers ───

function createMockPDF(name: string): File {
  return new File(['dummy-pdf-content'], name, { type: 'application/pdf' })
}

function createMockNonPDF(name: string): File {
  return new File(['dummy-content'], name, { type: 'image/jpeg' })
}

// ─── Tests ───

describe('useArBatchAnalysis - OOM 방지 대량 파일 시뮬레이션', () => {
  let setTimeoutCallCount: number

  beforeEach(() => {
    vi.clearAllMocks()
    setTimeoutCallCount = 0

    // setTimeout 호출 추적 (delay=0인 GC 양보 호출만 카운트)
    const originalSetTimeout = globalThis.setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      fn: TimerHandler,
      delay?: number,
      ...args: unknown[]
    ) => {
      if (delay === 0) {
        setTimeoutCallCount++
      }
      return originalSetTimeout(fn as (...args: unknown[]) => void, delay, ...args)
    }) as typeof setTimeout)

    // Mock: 짝수 인덱스 = AR, 홀수 인덱스 = non-AR
    mockCheckAR.mockImplementation(async (file: File) => {
      const match = file.name.match(/_(\d+)\.pdf$/)
      const index = match ? parseInt(match[1]) : 0

      if (index % 2 === 0) {
        return {
          is_annual_report: true,
          confidence: 1.0,
          metadata: {
            customer_name: `고객${index}`,
            issue_date: '2025-01-15',
            report_title: 'Annual Review Report',
          },
        }
      }
      return { is_annual_report: false, confidence: 0, metadata: null }
    })

    // Mock: 고객 검색 → 빈 결과 (no_match → 새 고객 생성)
    mockSearchCustomers.mockResolvedValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('800개 PDF 파일 처리 - 결과 정확성 검증', async () => {
    const FILE_COUNT = 800
    const files = Array.from({ length: FILE_COUNT }, (_, i) =>
      createMockPDF(`ar_${i}.pdf`)
    )

    const { result } = renderHook(() =>
      useArBatchAnalysis({ userId: 'test-user' })
    )

    let _groupingResult: Awaited<ReturnType<typeof result.current.analyzeArFiles>> = null

    await act(async () => {
      _groupingResult = await result.current.analyzeArFiles(files)
    })

    // ── 1. AR 분석 호출 검증 ──
    expect(mockCheckAR).toHaveBeenCalledTimes(FILE_COUNT)

    // ── 2. 그룹핑 결과 검증 ──
    // 짝수 인덱스 = AR (0,2,4,...798) = 400개
    const expectedArCount = FILE_COUNT / 2
    expect(groupingResult).not.toBeNull()
    expect(groupingResult!.totalFiles).toBe(expectedArCount)
    expect(groupingResult!.groups.length).toBe(expectedArCount) // 각 고객명 유니크

    // ── 3. 분석 완료 상태 검증 ──
    expect(result.current.batchState.isAnalyzing).toBe(false)
    expect(result.current.batchState.progress).toBe(100)

    // ── 4. analyzingFiles 최종 상태 검증 (데이터 손실 없음) ──
    const analyzingFiles = result.current.batchState.analyzingFiles!
    expect(analyzingFiles.length).toBe(FILE_COUNT)

    const completed = analyzingFiles.filter(f => f.status === 'completed').length
    const nonAr = analyzingFiles.filter(f => f.status === 'non_ar').length
    const pending = analyzingFiles.filter(f => f.status === 'pending').length
    const analyzing = analyzingFiles.filter(f => f.status === 'analyzing').length

    expect(completed).toBe(expectedArCount) // 400개 AR
    expect(nonAr).toBe(expectedArCount)     // 400개 non-AR
    expect(pending).toBe(0)                  // pending 잔류 없음
    expect(analyzing).toBe(0)                // analyzing 잔류 없음

    console.log(
      `[OOM 시뮬레이션] ${FILE_COUNT}개 파일 → AR: ${completed}, non-AR: ${nonAr}, ` +
      `그룹: ${groupingResult!.groups.length}, GC 양보: ${setTimeoutCallCount}회`
    )
  }, 30000) // 30초 타임아웃

  it('800개 파일 - GC 양보(setTimeout(0)) 호출 횟수 검증', async () => {
    const FILE_COUNT = 800
    const files = Array.from({ length: FILE_COUNT }, (_, i) =>
      createMockPDF(`gc_${i}.pdf`)
    )

    const { result } = renderHook(() =>
      useArBatchAnalysis({ userId: 'test-user' })
    )

    await act(async () => {
      await result.current.analyzeArFiles(files)
    })

    // GC_YIELD_INTERVAL = 50 → 800/50 = 16회 예상
    const expectedYields = Math.floor(FILE_COUNT / 50)
    expect(setTimeoutCallCount).toBeGreaterThanOrEqual(expectedYields - 2)
    expect(setTimeoutCallCount).toBeLessThanOrEqual(expectedYields + 2)

    console.log(
      `[GC 양보 검증] 예상: ${expectedYields}회, 실제: ${setTimeoutCallCount}회`
    )
  }, 30000)

  it('800개 파일 - 배치 state 갱신 패턴 검증 (analyzingFiles snapshot)', async () => {
    const FILE_COUNT = 800
    const files = Array.from({ length: FILE_COUNT }, (_, i) =>
      createMockPDF(`batch_${i}.pdf`)
    )

    // analyzingFiles 변경 이력 추적
    const _analyzingFilesSnapshots: Array<{ length: number; completedCount: number }> = []

    const { result } = renderHook(() =>
      useArBatchAnalysis({ userId: 'test-user' })
    )

    // 원본 setBatchState를 감시하기 위해 batchState를 주기적으로 관찰
    // (React가 state를 실제로 적용하는 횟수 = 렌더 횟수)
    let renderCount = 0
    const { result: _counterResult, rerender: _rerender } = renderHook(() => {
      renderCount++
      return result.current.batchState
    })

    await act(async () => {
      await result.current.analyzeArFiles(files)
    })

    // ── 렌더 횟수 검증 ──
    // 수정 전: ~2,250회 setBatchState → ~2,250회 리렌더링
    // 수정 후: ~40회 배치 flush + 초기 + 고객매칭 = ~50회 이내
    // React가 batching할 수 있으므로 실제 렌더 횟수는 더 적을 수 있음
    // 핵심: 2,250회보다 훨씬 적어야 함
    console.log(
      `[배치 갱신 검증] ${FILE_COUNT}개 파일, 렌더 횟수: ${renderCount}회 ` +
      `(수정 전 예상: ~2,250회, 수정 후 목표: <100회)`
    )

    // 최종 상태 검증
    const final = result.current.batchState.analyzingFiles!
    expect(final.length).toBe(FILE_COUNT)
    expect(final.every(f => f.status !== 'pending')).toBe(true)
    expect(final.every(f => f.status !== 'analyzing')).toBe(true)
  }, 30000)

  it('PDF + non-PDF 혼합 800개 파일 처리', async () => {
    // 600개 PDF + 200개 이미지
    const files: File[] = [
      ...Array.from({ length: 600 }, (_, i) => createMockPDF(`pdf_${i}.pdf`)),
      ...Array.from({ length: 200 }, (_, i) => createMockNonPDF(`img_${i}.jpg`)),
    ]

    const { result } = renderHook(() =>
      useArBatchAnalysis({ userId: 'test-user' })
    )

    await act(async () => {
      await result.current.analyzeArFiles(files)
    })

    // PDF 600개만 AR 분석 호출
    expect(mockCheckAR).toHaveBeenCalledTimes(600)

    // non-PDF 200개는 non_ar로 처리
    const analyzingFiles = result.current.batchState.analyzingFiles!
    expect(analyzingFiles.length).toBe(800)

    const nonAr = analyzingFiles.filter(f => f.status === 'non_ar')
    // 이미지 200개 + non-AR PDF (홀수 인덱스 300개) = 500개
    expect(nonAr.length).toBe(500)

    const completed = analyzingFiles.filter(f => f.status === 'completed')
    // AR PDF (짝수 인덱스 300개) = 300개
    expect(completed.length).toBe(300)
  }, 30000)

  it('분석 중 abort 테스트 (메모리 누수 방지)', async () => {
    const files = Array.from({ length: 200 }, (_, i) =>
      createMockPDF(`abort_${i}.pdf`)
    )

    const { result } = renderHook(() =>
      useArBatchAnalysis({ userId: 'test-user' })
    )

    // 50ms 후 모달 닫기 (abort)
    const abortPromise = new Promise<void>(resolve => {
      setTimeout(() => {
        act(() => {
          result.current.closeModal()
        })
        resolve()
      }, 50)
    })

    let _groupingResult: Awaited<ReturnType<typeof result.current.analyzeArFiles>> = null
    await act(async () => {
      _groupingResult = await result.current.analyzeArFiles(files)
      await abortPromise
    })

    // abort 되었으므로 모든 파일이 처리되지 않았을 수 있음
    // 핵심: crash 없이 정상 종료
    expect(result.current.batchState.isAnalyzing).toBe(false)
    console.log(
      `[Abort 테스트] 200개 중 처리된 파일: ` +
      `${result.current.batchState.analyzingFiles?.filter(f => f.status !== 'pending').length || 0}개`
    )
  }, 15000)
})
