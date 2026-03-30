/**
 * DocumentExplorerTree KST 날짜 표시 Regression 테스트
 *
 * DocumentExplorerTree.tsx의 로컬 formatDateTime 함수 로직 검증:
 *   formatDateTimeKST(dateStr) → full.slice(5) → "MM.DD HH:mm:ss"
 *
 * timeUtils.formatDateTime은 "YYYY.MM.DD HH:mm:ss" (KST) 형식을 반환하므로,
 * slice(5)로 연도 부분("YYYY.")을 제거한 결과를 검증한다.
 */

import { describe, it, expect } from 'vitest'
import { formatDateTime as formatDateTimeKST } from '@/shared/lib/timeUtils'

// DocumentExplorerTree.tsx line 110-116과 동일한 로직 재현
const formatDateTime = (dateStr: string | null | undefined): string => {
  if (!dateStr) return ''
  const full = formatDateTimeKST(dateStr)
  if (!full || full === '-' || full === '잘못된 시간') return ''
  return full.slice(5)
}

describe('DocumentExplorerTree formatDateTime (KST, 연도 제거)', () => {
  describe('UTC → KST 변환', () => {
    it('UTC 자정 → KST 09:00 변환', () => {
      // UTC 2026-01-01 00:00:00 → KST 2026-01-01 09:00:00
      const result = formatDateTime('2026-01-01T00:00:00.000Z')
      expect(result).toBe('01.01 09:00:00')
    })

    it('UTC 오후 → KST 다음날 새벽 변환', () => {
      // UTC 2026-01-01 18:30:00 → KST 2026-01-02 03:30:00
      const result = formatDateTime('2026-01-01T18:30:00.000Z')
      expect(result).toBe('01.02 03:30:00')
    })

    it('UTC 15:00 → KST 자정(00:00) 날짜 경계 넘김', () => {
      // UTC 2026-03-30 15:00:00 → KST 2026-03-31 00:00:00
      const result = formatDateTime('2026-03-30T15:00:00.000Z')
      expect(result).toBe('03.31 00:00:00')
    })

    it('UTC 14:59:59 → KST 23:59:59 같은 날 유지', () => {
      // UTC 2026-03-30 14:59:59 → KST 2026-03-30 23:59:59
      const result = formatDateTime('2026-03-30T14:59:59.000Z')
      expect(result).toBe('03.30 23:59:59')
    })
  })

  describe('출력 형식 검증 (MM.DD HH:mm:ss)', () => {
    it('slice(5) 결과가 "MM.DD HH:mm:ss" 형식 (15자)', () => {
      const result = formatDateTime('2026-07-15T12:34:56.000Z')
      // KST: 2026-07-15 21:34:56 → "07.15 21:34:56"
      expect(result).toBe('07.15 21:34:56')
      expect(result).toMatch(/^\d{2}\.\d{2} \d{2}:\d{2}:\d{2}$/)
    })

    it('월/일/시/분/초가 모두 2자리 zero-padded', () => {
      // UTC 2026-01-02 00:01:02 → KST 2026-01-02 09:01:02
      const result = formatDateTime('2026-01-02T00:01:02.000Z')
      expect(result).toBe('01.02 09:01:02')
    })
  })

  describe('날짜 경계 및 월말/연말', () => {
    it('연도 경계 넘김: UTC 12월 31일 → KST 1월 1일', () => {
      // UTC 2025-12-31 15:00:00 → KST 2026-01-01 00:00:00
      const result = formatDateTime('2025-12-31T15:00:00.000Z')
      expect(result).toBe('01.01 00:00:00')
    })

    it('월말 경계 넘김: UTC 2월 28일 → KST 3월 1일', () => {
      // UTC 2026-02-28 15:00:00 → KST 2026-03-01 00:00:00
      const result = formatDateTime('2026-02-28T15:00:00.000Z')
      expect(result).toBe('03.01 00:00:00')
    })
  })

  describe('null/undefined/잘못된 값 안전 처리', () => {
    it('null → 빈 문자열', () => {
      expect(formatDateTime(null)).toBe('')
    })

    it('undefined → 빈 문자열', () => {
      expect(formatDateTime(undefined)).toBe('')
    })

    it('빈 문자열 → 빈 문자열', () => {
      expect(formatDateTime('')).toBe('')
    })

    it('잘못된 날짜 문자열 → 빈 문자열', () => {
      expect(formatDateTime('not-a-date')).toBe('')
    })

    it('잘못된 ISO 형식 → 빈 문자열', () => {
      expect(formatDateTime('2026-99-99T99:99:99.000Z')).toBe('')
    })
  })

  describe('Z 없는 백엔드 UTC 문자열 호환', () => {
    it('Z 없는 ISO 문자열도 UTC로 인식하여 KST 변환', () => {
      // 백엔드 datetime.utcnow().isoformat() 형식: Z 없음
      // timeUtils가 자동으로 Z를 추가하여 UTC로 처리
      const result = formatDateTime('2026-03-15T06:30:00.123456')
      expect(result).toBe('03.15 15:30:00')
    })
  })
})
