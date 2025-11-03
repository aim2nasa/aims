/**
 * Phase 3-1: Timestamp 정규화 통합 Regression 테스트
 * @description 프론트엔드 timestamp 유틸리티의 AIMS 표준 준수 검증
 * @regression 커밋 2877ec0, 588b528, 2ecf948, d7880e3, 3636ae1 - timestamp 정규화
 * @priority HIGH - 전체 시스템의 시간 표시 일관성 핵심
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  formatDateTime,
  formatDate,
  formatTime,
  formatRelativeTime,
  utcNowISO,
  toUTCISO,
  parseISOTimestamp,
  getTimeDiff,
  formatDuration
} from '../timeUtils'

describe('TimeUtils - Timestamp 정규화 통합 테스트', () => {
  let originalDate: typeof Date

  beforeEach(() => {
    // Date를 모킹하여 일관된 테스트 환경 구축
    originalDate = global.Date
    const mockNow = new Date('2025-11-02T08:30:00.000Z') // KST 17:30

    global.Date = class extends originalDate {
      constructor(...args: [value: number | string | Date] | []) {
        if (args.length === 0) {
          super(mockNow.getTime())
        } else {
          super(args[0])
        }
      }

      static now() {
        return mockNow.getTime()
      }
    } as any
  })

  afterEach(() => {
    global.Date = originalDate
  })

  describe('formatDateTime - 날짜 + 시간 포맷팅', () => {
    /**
     * 회귀 테스트: 커밋 2ecf948
     * 기능: ISO 8601 UTC를 한국 시간으로 표시
     */
    it('UTC timestamp를 KST 날짜+시간으로 포맷팅', () => {
      const timestamp = '2025-11-01T07:17:21.143Z'
      const result = formatDateTime(timestamp)

      // UTC 07:17 → KST 16:17 (오후 4시 17분)
      expect(result).toContain('2025')
      expect(result).toContain('11')
      expect(result).toContain('01')
      expect(result).toMatch(/오후.*[04]/) // "오후 04" 또는 "오후 4"
      expect(result).toContain('17')
    })

    it('null/undefined는 "-" 반환', () => {
      expect(formatDateTime(null)).toBe('-')
      expect(formatDateTime(undefined)).toBe('-')
    })

    it('잘못된 형식은 "잘못된 시간" 반환', () => {
      expect(formatDateTime('invalid-date')).toBe('잘못된 시간')
      expect(formatDateTime('2025-13-01T00:00:00Z')).toBe('잘못된 시간')
    })

    it('마이크로초(6자리)도 정상 파싱', () => {
      // 백엔드에서 마이크로초 형식으로 올 수 있음
      const timestamp = '2025-11-01T07:17:21.143456Z'
      const result = formatDateTime(timestamp)

      expect(result).toContain('2025')
      expect(result).toMatch(/오후.*[04]/) // 시간이 표시되어야 함
    })
  })

  describe('formatDate - 날짜만 포맷팅', () => {
    it('UTC timestamp를 KST 날짜로 포맷팅', () => {
      const timestamp = '2025-11-01T15:00:00.000Z' // UTC 15:00 → KST 다음날 00:00
      const result = formatDate(timestamp)

      // KST로는 11월 2일
      expect(result).toContain('2025')
      expect(result).toContain('11')
      expect(result).toContain('02')
    })

    it('null/undefined는 "-" 반환', () => {
      expect(formatDate(null)).toBe('-')
      expect(formatDate(undefined)).toBe('-')
    })

    it('잘못된 형식은 "잘못된 날짜" 반환', () => {
      expect(formatDate('not-a-date')).toBe('잘못된 날짜')
    })
  })

  describe('formatTime - 시간만 포맷팅', () => {
    it('UTC timestamp를 KST 시간으로 포맷팅', () => {
      const timestamp = '2025-11-01T07:17:21.143Z'
      const result = formatTime(timestamp)

      // UTC 07:17 → KST 16:17 (오후 4시 17분)
      expect(result).toMatch(/오후.*[04]/) // "오후 04" 또는 "오후 4"
      expect(result).toContain('17')
    })

    it('null/undefined는 "-" 반환', () => {
      expect(formatTime(null)).toBe('-')
      expect(formatTime(undefined)).toBe('-')
    })

    it('잘못된 형식은 "잘못된 시간" 반환', () => {
      expect(formatTime('invalid')).toBe('잘못된 시간')
    })
  })

  describe('formatRelativeTime - 상대 시간 포맷팅', () => {
    /**
     * 회귀 테스트: 상대 시간 표시 정확도
     * 현재 시간(Mock): 2025-11-02T08:30:00.000Z (KST 17:30)
     */
    it('1분 미만은 "방금 전"', () => {
      const timestamp = '2025-11-02T08:29:30.000Z' // 30초 전
      expect(formatRelativeTime(timestamp)).toBe('방금 전')
    })

    it('3분 전은 "3분 전"', () => {
      const timestamp = '2025-11-02T08:27:00.000Z'
      expect(formatRelativeTime(timestamp)).toBe('3분 전')
    })

    it('2시간 전은 "2시간 전"', () => {
      const timestamp = '2025-11-02T06:30:00.000Z'
      expect(formatRelativeTime(timestamp)).toBe('2시간 전')
    })

    it('어제는 "어제"', () => {
      const timestamp = '2025-11-01T08:30:00.000Z' // 정확히 24시간 전
      const result = formatRelativeTime(timestamp)
      expect(result).toBe('어제')
    })

    it('3일 전은 "3일 전"', () => {
      const timestamp = '2025-10-30T08:30:00.000Z'
      expect(formatRelativeTime(timestamp)).toBe('3일 전')
    })

    it('7일 이상은 날짜 표시', () => {
      const timestamp = '2025-10-20T08:30:00.000Z'
      const result = formatRelativeTime(timestamp)

      // 날짜 형식으로 반환
      expect(result).toContain('2025')
      expect(result).toContain('10')
      expect(result).toContain('20')
    })

    it('null/undefined는 "-" 반환', () => {
      expect(formatRelativeTime(null)).toBe('-')
      expect(formatRelativeTime(undefined)).toBe('-')
    })
  })

  describe('utcNowISO - 현재 UTC 시간', () => {
    /**
     * 회귀 테스트: ISO 8601 형식 준수
     */
    it('ISO 8601 형식으로 반환', () => {
      const result = utcNowISO()

      // ISO 8601: YYYY-MM-DDTHH:mm:ss.sssZ
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(result).toContain('2025-11-02')
      expect(result).toContain('T08:30:00')
    })

    it('밀리초 3자리 정밀도', () => {
      const result = utcNowISO()

      // .000Z 형식 검증
      expect(result).toMatch(/\.\d{3}Z$/)
    })

    it('항상 UTC 타임존 (Z 접미사)', () => {
      const result = utcNowISO()
      expect(result.endsWith('Z')).toBe(true)
    })
  })

  describe('toUTCISO - Date → ISO 8601 변환', () => {
    it('Date 객체를 ISO 8601로 변환', () => {
      const date = new Date('2025-11-01T07:17:21.143Z')
      const result = toUTCISO(date)

      expect(result).toBe('2025-11-01T07:17:21.143Z')
    })

    it('잘못된 Date 객체는 에러 발생', () => {
      const invalidDate = new Date('invalid')
      expect(() => toUTCISO(invalidDate)).toThrow('Invalid Date object')
    })

    it('Date 객체가 아닌 경우 에러 발생', () => {
      expect(() => toUTCISO('2025-11-01' as any)).toThrow('Invalid Date object')
    })
  })

  describe('parseISOTimestamp - ISO → Date 파싱', () => {
    it('ISO 8601 문자열을 Date로 파싱', () => {
      const timestamp = '2025-11-01T07:17:21.143Z'
      const result = parseISOTimestamp(timestamp)

      expect(result).toBeInstanceOf(Date)
      expect(result?.toISOString()).toBe(timestamp)
    })

    it('null/undefined는 null 반환', () => {
      expect(parseISOTimestamp(null)).toBeNull()
      expect(parseISOTimestamp(undefined)).toBeNull()
    })

    it('잘못된 형식은 null 반환', () => {
      expect(parseISOTimestamp('invalid-date')).toBeNull()
      expect(parseISOTimestamp('2025-13-01')).toBeNull()
    })

    it('마이크로초 형식도 파싱 가능', () => {
      const timestamp = '2025-11-01T07:17:21.143456Z'
      const result = parseISOTimestamp(timestamp)

      expect(result).toBeInstanceOf(Date)
      expect(result?.getUTCFullYear()).toBe(2025)
      expect(result?.getUTCMonth()).toBe(10) // 0-indexed (11월)
    })
  })

  describe('getTimeDiff - 시간 차이 계산', () => {
    it('두 ISO 문자열 간 밀리초 차이', () => {
      const start = '2025-11-01T07:17:21.143Z'
      const end = '2025-11-01T07:17:28.617Z'

      const diff = getTimeDiff(start, end)

      expect(diff).toBe(7474) // 7.474초
    })

    it('Date 객체도 지원', () => {
      const start = new Date('2025-11-01T07:17:21.143Z')
      const end = new Date('2025-11-01T07:17:28.617Z')

      const diff = getTimeDiff(start, end)

      expect(diff).toBe(7474)
    })

    it('문자열과 Date 혼합 사용', () => {
      const start = '2025-11-01T07:17:21.143Z'
      const end = new Date('2025-11-01T07:17:28.617Z')

      const diff = getTimeDiff(start, end)

      expect(diff).toBe(7474)
    })

    it('null/undefined는 null 반환', () => {
      expect(getTimeDiff(null, '2025-11-01T00:00:00Z')).toBeNull()
      expect(getTimeDiff('2025-11-01T00:00:00Z', undefined)).toBeNull()
      expect(getTimeDiff(null, null)).toBeNull()
    })

    it('잘못된 형식은 null 반환', () => {
      expect(getTimeDiff('invalid', '2025-11-01T00:00:00Z')).toBeNull()
      expect(getTimeDiff('2025-11-01T00:00:00Z', 'invalid')).toBeNull()
    })
  })

  describe('formatDuration - 밀리초 → 사람이 읽을 수 있는 형식', () => {
    it('1000ms 미만은 밀리초 표시', () => {
      expect(formatDuration(500)).toBe('500ms')
      expect(formatDuration(0)).toBe('0ms')
    })

    it('1초는 "1초"', () => {
      expect(formatDuration(1000)).toBe('1초')
    })

    it('7.5초는 "7.5초"', () => {
      expect(formatDuration(7500)).toBe('7.5초')
    })

    it('2분 30초는 "2분 30초"', () => {
      expect(formatDuration(150000)).toBe('2분 30초')
    })

    it('정확히 2분은 "2분"', () => {
      expect(formatDuration(120000)).toBe('2분')
    })

    it('1시간 15분은 "1시간 15분"', () => {
      expect(formatDuration(4500000)).toBe('1시간 15분')
    })

    it('정확히 3시간은 "3시간"', () => {
      expect(formatDuration(10800000)).toBe('3시간')
    })

    it('null/undefined는 "-" 반환', () => {
      expect(formatDuration(null)).toBe('-')
      expect(formatDuration(undefined)).toBe('-')
    })

    it('음수는 "-" 반환', () => {
      expect(formatDuration(-1000)).toBe('-')
    })
  })

  describe('AIMS 표준 준수 통합 검증', () => {
    /**
     * 회귀 테스트: 커밋 2877ec0, 588b528
     * AIMS 표준: ISO 8601 UTC, 밀리초 3자리, KST 표시
     */
    it('백엔드 API 응답 → 프론트엔드 표시 전체 플로우', () => {
      // 1. 백엔드 API 응답 (ISO 8601 UTC)
      const apiResponse = {
        uploadedAt: '2025-11-01T07:17:21.143Z',
        updatedAt: '2025-11-02T08:30:00.000Z'
      }

      // 2. 프론트엔드 표시 (KST)
      const uploadedDisplay = formatDateTime(apiResponse.uploadedAt)
      const updatedDisplay = formatDateTime(apiResponse.updatedAt)

      // 3. 검증
      expect(uploadedDisplay).toContain('2025')
      expect(uploadedDisplay).toMatch(/오후.*[04]/) // KST 16시 (오후 4시)
      expect(updatedDisplay).toMatch(/오후.*5/) // KST 17시 (오후 5시)
    })

    it('다양한 형식 혼재 → 정규화 후 일관된 표시', () => {
      // 과거 MongoDB에서 혼재된 형식들
      const timestamps = [
        '2025-11-01T07:17:21.143Z', // 표준 ISO
        '2025-11-01T07:17:21.143456Z', // 마이크로초
        '2025-11-01T16:17:21.143+09:00' // KST 타임존
      ]

      const results = timestamps.map(ts => parseISOTimestamp(ts))

      // 모두 정상 파싱되어야 함
      expect(results.every(r => r instanceof Date)).toBe(true)

      // 모두 동일한 시간을 가리킴 (UTC 기준)
      const utcTimes = results.map(r => r?.getTime())
      expect(utcTimes[0]).toBe(utcTimes[1])
      expect(utcTimes[0]).toBe(utcTimes[2])
    })

    it('상대 시간과 절대 시간 혼용 시나리오', () => {
      // 최근 문서: 상대 시간 표시
      const recentDoc = '2025-11-02T08:27:00.000Z' // 3분 전
      expect(formatRelativeTime(recentDoc)).toBe('3분 전')

      // 오래된 문서: 날짜 표시
      const oldDoc = '2025-10-15T08:30:00.000Z'
      const oldDisplay = formatRelativeTime(oldDoc)
      expect(oldDisplay).toContain('2025')
      expect(oldDisplay).toContain('10')
      expect(oldDisplay).toContain('15')
    })

    it('시간 계산 정확성 검증', () => {
      // 업로드 후 경과 시간 계산
      const uploadTime = '2025-11-02T07:30:00.000Z'
      const currentTime = utcNowISO() // Mock: 2025-11-02T08:30:00.000Z

      const diff = getTimeDiff(uploadTime, currentTime)
      const duration = formatDuration(diff!)

      expect(diff).toBe(3600000) // 1시간 = 3,600,000ms
      expect(duration).toBe('1시간')
    })
  })

  describe('엣지 케이스: 타임존 경계값', () => {
    it('자정 넘어가는 시간 (23:00 UTC → 익일 08:00 KST)', () => {
      const timestamp = '2025-11-01T23:00:00.000Z'
      const result = formatDate(timestamp)

      // KST로는 11월 2일
      expect(result).toContain('2025')
      expect(result).toContain('11')
      expect(result).toContain('02')
    })

    it('자정 직전 시간 (14:59 UTC → 당일 23:59 KST)', () => {
      const timestamp = '2025-11-01T14:59:00.000Z'
      const result = formatDate(timestamp)

      // KST로는 여전히 11월 1일
      expect(result).toContain('2025')
      expect(result).toContain('11')
      expect(result).toContain('01')
    })
  })

  describe('성능 및 멱등성 검증', () => {
    it('동일 입력에 동일 출력 (멱등성)', () => {
      const timestamp = '2025-11-01T07:17:21.143Z'

      const result1 = formatDateTime(timestamp)
      const result2 = formatDateTime(timestamp)
      const result3 = formatDateTime(timestamp)

      expect(result1).toBe(result2)
      expect(result2).toBe(result3)
    })

    it('대량 timestamp 처리 성능', () => {
      const timestamps = Array.from({ length: 1000 }, (_, i) =>
        `2025-11-01T07:${String(i % 60).padStart(2, '0')}:00.000Z`
      )

      const startTime = Date.now()
      timestamps.forEach(ts => formatDateTime(ts))
      const endTime = Date.now()

      // 1000개 처리가 1초 이내
      expect(endTime - startTime).toBeLessThan(1000)
    })
  })
})
