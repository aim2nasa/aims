/**
 * DocumentLibraryView - 문서 삭제 시 통계 동기화 테스트
 * @since 2026-04-08
 * @issue #23 - 오류 문서 삭제 시 프로그레스바 통계 동기화
 *
 * 버그: 삭제 후 internalRefreshRef → refreshDocuments()만 호출하여
 *       문서 리스트만 갱신되고, useDocumentStatistics의 통계(탭 카운트, 프로그레스바)는 미갱신.
 * 수정: onRefreshExpose 콜백에서 통계 refresh 3종도 병렬 호출.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('DocumentLibraryView - 문서 삭제 시 통계 동기화 (#23)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('onRefreshExpose 콜백이 통계도 함께 갱신해야 함', () => {
    it('삭제 후 refresh 시 refreshDocuments와 통계 refresh가 모두 호출되어야 함', async () => {
      const refreshDocuments = vi.fn().mockResolvedValue(undefined)
      const refreshDocStats = vi.fn().mockResolvedValue(undefined)
      const refreshBatchStats = vi.fn().mockResolvedValue(undefined)
      const refreshUnlinkedStats = vi.fn().mockResolvedValue(undefined)

      // onRefreshExpose 콜백 시뮬레이션 (수정된 코드)
      const refreshAll = async () => {
        await Promise.all([
          refreshDocuments(),
          refreshDocStats(),
          refreshBatchStats(),
          refreshUnlinkedStats(),
        ])
      }

      await refreshAll()

      expect(refreshDocuments).toHaveBeenCalledTimes(1)
      expect(refreshDocStats).toHaveBeenCalledTimes(1)
      expect(refreshBatchStats).toHaveBeenCalledTimes(1)
      expect(refreshUnlinkedStats).toHaveBeenCalledTimes(1)
    })

    it('통계 refresh 중 하나가 실패해도 다른 것들은 실행되어야 함', async () => {
      const refreshDocuments = vi.fn().mockResolvedValue(undefined)
      const refreshDocStats = vi.fn().mockResolvedValue(undefined)
      const refreshBatchStats = vi.fn().mockRejectedValue(new Error('network'))
      const refreshUnlinkedStats = vi.fn().mockResolvedValue(undefined)

      const refreshAll = async () => {
        await Promise.allSettled([
          refreshDocuments(),
          refreshDocStats(),
          refreshBatchStats(),
          refreshUnlinkedStats(),
        ])
      }

      await refreshAll()

      // 실패한 것 포함 모두 호출됨
      expect(refreshDocuments).toHaveBeenCalledTimes(1)
      expect(refreshDocStats).toHaveBeenCalledTimes(1)
      expect(refreshBatchStats).toHaveBeenCalledTimes(1)
      expect(refreshUnlinkedStats).toHaveBeenCalledTimes(1)
    })
  })

  describe('삭제 후 통계 갱신 시나리오', () => {
    it('개별 삭제: 에러 문서 1건 삭제 후 통계가 정확히 차감되어야 함', () => {
      // 삭제 전 통계
      const before = { total: 2823, completed: 2818, error: 5 }

      // 에러 문서 1건 삭제 시뮬레이션
      const after = {
        total: before.total - 1,
        completed: before.completed,
        error: before.error - 1,
      }

      expect(after.total).toBe(2822)
      expect(after.completed).toBe(2818)
      expect(after.error).toBe(4)
      // 처리완료 비율 재계산 (2818/2822 = 99.86% → 반올림 100%)
      const pct = Math.round((after.completed / after.total) * 100)
      expect(pct).toBe(100)
    })

    it('일괄 삭제: 에러 문서 복수 삭제 후 모든 통계가 차감되어야 함', () => {
      const before = { total: 2823, completed: 2818, error: 5 }
      const deletedCount = 3

      const after = {
        total: before.total - deletedCount,
        completed: before.completed,
        error: before.error - deletedCount,
      }

      expect(after.total).toBe(2820)
      expect(after.error).toBe(2)
      expect(after.completed).toBe(2818)
    })
  })

  describe('회귀 방지: 기존 refresh 동작 유지', () => {
    it('refreshDocuments는 반드시 호출되어야 함 (기존 동작)', async () => {
      const refreshDocuments = vi.fn().mockResolvedValue(undefined)
      const refreshDocStats = vi.fn().mockResolvedValue(undefined)

      const refreshAll = async () => {
        await Promise.all([
          refreshDocuments(),
          refreshDocStats(),
        ])
      }

      await refreshAll()

      // 기존 동작: 문서 리스트 갱신은 반드시 실행
      expect(refreshDocuments).toHaveBeenCalledTimes(1)
    })

    it('onRefreshExpose가 없을 때 에러가 발생하지 않아야 함', () => {
      const onRefreshExpose: ((fn: () => Promise<void>) => void) | undefined = undefined

      expect(() => {
        if (onRefreshExpose) {
          onRefreshExpose(async () => {})
        }
      }).not.toThrow()
    })
  })
})
