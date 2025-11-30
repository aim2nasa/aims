/**
 * Timestamp Utility Functions Unit Tests
 * @since 2025-11-01
 * @updated 2025-11-30
 *
 * 테스트 범위:
 * 1. formatDateTime - ISO 8601 → 한국 시간 (날짜 + 시간) - 형식: YYYY.MM.DD HH:mm:ss
 * 2. formatDate - ISO 8601 → 한국 날짜 - 형식: YYYY.MM.DD
 * 3. formatTime - ISO 8601 → 한국 시간 - 형식: HH:mm:ss (24시간제)
 * 4. formatRelativeTime - 상대 시간 표시
 * 5. utcNowISO - 현재 UTC 시간
 * 6. toUTCISO - Date → ISO 8601
 * 7. parseISOTimestamp - ISO 8601 → Date
 * 8. getTimeDiff - 두 timestamp 차이
 * 9. formatDuration - 밀리초를 읽기 쉽게
 * 10. formatDateTimeCompact - formatDateTime과 동일 (별칭)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  formatDateTime,
  formatDate,
  formatTime,
  formatRelativeTime,
  utcNowISO,
  toUTCISO,
  parseISOTimestamp,
  getTimeDiff,
  formatDuration,
  formatDateTimeCompact
} from '../timeUtils';

describe('timeUtils', () => {
  // 고정된 테스트 시간 (KST 2025-11-01 16:17:21)
  const TEST_UTC_TIME = '2025-11-01T07:17:21.143Z';
  const TEST_UTC_TIME_2 = '2025-11-01T07:17:28.617Z';

  describe('formatDateTime', () => {
    it('ISO 8601 UTC timestamp를 한국 시간으로 변환해야 한다', () => {
      const result = formatDateTime(TEST_UTC_TIME);
      // 2025-11-01T07:17:21.143Z (UTC) → KST 16:17:21
      expect(result).toBe('2025.11.01 16:17:21');
    });

    it('null이나 undefined를 "-"로 변환해야 한다', () => {
      expect(formatDateTime(null)).toBe('-');
      expect(formatDateTime(undefined)).toBe('-');
      expect(formatDateTime('')).toBe('-');
    });

    it('잘못된 형식의 timestamp는 "잘못된 시간"을 반환해야 한다', () => {
      expect(formatDateTime('not-a-date')).toBe('잘못된 시간');
      expect(formatDateTime('2025-99-99')).toBe('잘못된 시간');
    });

    it('다양한 시간대를 올바르게 KST로 변환해야 한다', () => {
      // 자정 UTC → 오전 9시 KST
      const midnight = formatDateTime('2025-11-01T00:00:00.000Z');
      expect(midnight).toBe('2025.11.01 09:00:00');

      // 정오 UTC → 오후 9시 KST
      const noon = formatDateTime('2025-11-01T12:00:00.000Z');
      expect(noon).toBe('2025.11.01 21:00:00');
    });
  });

  describe('formatDate', () => {
    it('ISO 8601 UTC timestamp를 한국 날짜만 변환해야 한다', () => {
      const result = formatDate(TEST_UTC_TIME);
      expect(result).toBe('2025.11.01');
    });

    it('null이나 undefined를 "-"로 변환해야 한다', () => {
      expect(formatDate(null)).toBe('-');
      expect(formatDate(undefined)).toBe('-');
      expect(formatDate('')).toBe('-');
    });

    it('잘못된 형식의 timestamp는 "잘못된 날짜"를 반환해야 한다', () => {
      expect(formatDate('not-a-date')).toBe('잘못된 날짜');
      expect(formatDate('2025-99-99')).toBe('잘못된 날짜');
    });

    it('날짜 경계를 넘는 경우 KST 날짜로 변환해야 한다', () => {
      // 2025-11-01 23:00:00 UTC → 2025-11-02 08:00 KST
      const result = formatDate('2025-11-01T23:00:00.000Z');
      expect(result).toBe('2025.11.02');
    });
  });

  describe('formatTime', () => {
    it('ISO 8601 UTC timestamp를 한국 시간만 변환해야 한다', () => {
      const result = formatTime(TEST_UTC_TIME);
      expect(result).toBe('16:17:21');
    });

    it('null이나 undefined를 "-"로 변환해야 한다', () => {
      expect(formatTime(null)).toBe('-');
      expect(formatTime(undefined)).toBe('-');
      expect(formatTime('')).toBe('-');
    });

    it('잘못된 형식의 timestamp는 "잘못된 시간"을 반환해야 한다', () => {
      expect(formatTime('not-a-date')).toBe('잘못된 시간');
      expect(formatTime('2025-99-99')).toBe('잘못된 시간');
    });

    it('24시간제로 올바르게 표시해야 한다', () => {
      // 오전
      const morning = formatTime('2025-11-01T01:30:00.000Z'); // KST 10:30
      expect(morning).toBe('10:30:00');

      // 오후
      const afternoon = formatTime('2025-11-01T07:30:00.000Z'); // KST 16:30
      expect(afternoon).toBe('16:30:00');
    });
  });

  describe('formatRelativeTime', () => {
    beforeEach(() => {
      // 현재 시간을 고정 (2025-11-01T07:17:21.143Z)
      vi.useFakeTimers();
      vi.setSystemTime(new Date(TEST_UTC_TIME));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('60초 미만이면 "방금 전"을 반환해야 한다', () => {
      const thirtySecondsAgo = '2025-11-01T07:16:51.143Z'; // 30초 전
      expect(formatRelativeTime(thirtySecondsAgo)).toBe('방금 전');
    });

    it('1-59분 전이면 "N분 전"을 반환해야 한다', () => {
      const threeMinutesAgo = '2025-11-01T07:14:21.143Z'; // 3분 전
      expect(formatRelativeTime(threeMinutesAgo)).toBe('3분 전');

      const thirtyMinutesAgo = '2025-11-01T06:47:21.143Z'; // 30분 전
      expect(formatRelativeTime(thirtyMinutesAgo)).toBe('30분 전');
    });

    it('1-23시간 전이면 "N시간 전"을 반환해야 한다', () => {
      const twoHoursAgo = '2025-11-01T05:17:21.143Z'; // 2시간 전
      expect(formatRelativeTime(twoHoursAgo)).toBe('2시간 전');

      const twelveHoursAgo = '2025-10-31T19:17:21.143Z'; // 12시간 전
      expect(formatRelativeTime(twelveHoursAgo)).toBe('12시간 전');
    });

    it('1일 전이면 "어제"를 반환해야 한다', () => {
      const oneDayAgo = '2025-10-31T07:17:21.143Z'; // 1일 전
      expect(formatRelativeTime(oneDayAgo)).toBe('어제');
    });

    it('2-6일 전이면 "N일 전"을 반환해야 한다', () => {
      const twoDaysAgo = '2025-10-30T07:17:21.143Z'; // 2일 전
      expect(formatRelativeTime(twoDaysAgo)).toBe('2일 전');

      const fiveDaysAgo = '2025-10-27T07:17:21.143Z'; // 5일 전
      expect(formatRelativeTime(fiveDaysAgo)).toBe('5일 전');
    });

    it('7일 이상이면 날짜를 반환해야 한다', () => {
      const sevenDaysAgo = '2025-10-25T07:17:21.143Z'; // 7일 전
      const result = formatRelativeTime(sevenDaysAgo);
      expect(result).toBe('2025.10.25');
    });

    it('null이나 undefined를 "-"로 변환해야 한다', () => {
      expect(formatRelativeTime(null)).toBe('-');
      expect(formatRelativeTime(undefined)).toBe('-');
      expect(formatRelativeTime('')).toBe('-');
    });

    it('잘못된 형식의 timestamp는 "잘못된 시간"을 반환해야 한다', () => {
      expect(formatRelativeTime('not-a-date')).toBe('잘못된 시간');
    });
  });

  describe('utcNowISO', () => {
    it('현재 시간을 ISO 8601 UTC 형식으로 반환해야 한다', () => {
      const result = utcNowISO();

      // ISO 8601 형식 검증: YYYY-MM-DDTHH:mm:ss.sssZ
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      // Date로 파싱 가능한지 확인
      const date = new Date(result);
      expect(date).toBeInstanceOf(Date);
      expect(isNaN(date.getTime())).toBe(false);
    });

    it('연속 호출 시 시간이 증가해야 한다', () => {
      const time1 = utcNowISO();

      // 약간의 지연
      for (let i = 0; i < 1000000; i++) {
        // busy wait
      }

      const time2 = utcNowISO();

      const date1 = new Date(time1);
      const date2 = new Date(time2);

      expect(date2.getTime()).toBeGreaterThanOrEqual(date1.getTime());
    });
  });

  describe('toUTCISO', () => {
    it('Date 객체를 ISO 8601 UTC 문자열로 변환해야 한다', () => {
      const date = new Date('2025-11-01T07:17:21.143Z');
      const result = toUTCISO(date);

      expect(result).toBe('2025-11-01T07:17:21.143Z');
    });

    it('KST Date를 UTC로 올바르게 변환해야 한다', () => {
      // KST 2025-11-01 16:17:21 → UTC 2025-11-01 07:17:21
      const date = new Date(2025, 10, 1, 16, 17, 21, 143); // 로컬 시간
      const result = toUTCISO(date);

      expect(result).toMatch(/^2025-11-01T\d{2}:17:21\.143Z$/);
    });

    it('잘못된 Date 객체는 에러를 던져야 한다', () => {
      const invalidDate = new Date('invalid');

      expect(() => toUTCISO(invalidDate)).toThrow('Invalid Date object');
    });

    it('Date가 아닌 값은 에러를 던져야 한다', () => {
      expect(() => toUTCISO('not-a-date' as any)).toThrow('Invalid Date object');
      expect(() => toUTCISO(null as any)).toThrow('Invalid Date object');
      expect(() => toUTCISO(undefined as any)).toThrow('Invalid Date object');
    });
  });

  describe('parseISOTimestamp', () => {
    it('ISO 8601 문자열을 Date 객체로 파싱해야 한다', () => {
      const result = parseISOTimestamp(TEST_UTC_TIME);

      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString()).toBe(TEST_UTC_TIME);
    });

    it('null이나 undefined를 null로 반환해야 한다', () => {
      expect(parseISOTimestamp(null)).toBeNull();
      expect(parseISOTimestamp(undefined)).toBeNull();
      expect(parseISOTimestamp('')).toBeNull();
    });

    it('잘못된 형식의 timestamp는 null을 반환해야 한다', () => {
      expect(parseISOTimestamp('not-a-date')).toBeNull();
      expect(parseISOTimestamp('2025-99-99')).toBeNull();
    });

    it('다양한 ISO 8601 형식을 파싱해야 한다', () => {
      // 밀리초 없는 형식
      const withoutMs = parseISOTimestamp('2025-11-01T07:17:21Z');
      expect(withoutMs).toBeInstanceOf(Date);

      // 타임존 오프셋 형식
      const withOffset = parseISOTimestamp('2025-11-01T16:17:21+09:00');
      expect(withOffset).toBeInstanceOf(Date);
    });
  });

  describe('getTimeDiff', () => {
    it('두 ISO 8601 문자열의 차이를 밀리초로 반환해야 한다', () => {
      const diff = getTimeDiff(TEST_UTC_TIME, TEST_UTC_TIME_2);

      // 7.474초 차이
      expect(diff).toBe(7474);
    });

    it('Date 객체도 처리할 수 있어야 한다', () => {
      const date1 = new Date('2025-11-01T07:17:21.143Z');
      const date2 = new Date('2025-11-01T07:17:28.617Z');

      const diff = getTimeDiff(date1, date2);
      expect(diff).toBe(7474);
    });

    it('ISO 문자열과 Date 객체를 혼합해서 사용할 수 있어야 한다', () => {
      const date2 = new Date('2025-11-01T07:17:28.617Z');

      const diff = getTimeDiff(TEST_UTC_TIME, date2);
      expect(diff).toBe(7474);
    });

    it('null이나 undefined가 포함되면 null을 반환해야 한다', () => {
      expect(getTimeDiff(null, TEST_UTC_TIME)).toBeNull();
      expect(getTimeDiff(TEST_UTC_TIME, null)).toBeNull();
      expect(getTimeDiff(null, null)).toBeNull();
      expect(getTimeDiff(undefined, undefined)).toBeNull();
    });

    it('잘못된 형식의 timestamp는 null을 반환해야 한다', () => {
      expect(getTimeDiff('not-a-date', TEST_UTC_TIME)).toBeNull();
      expect(getTimeDiff(TEST_UTC_TIME, 'not-a-date')).toBeNull();
    });

    it('종료 시간이 시작 시간보다 이전이면 음수를 반환해야 한다', () => {
      const diff = getTimeDiff(TEST_UTC_TIME_2, TEST_UTC_TIME);
      expect(diff).toBe(-7474);
    });
  });

  describe('formatDuration', () => {
    it('밀리초를 "Nms" 형식으로 변환해야 한다', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('1초 미만이지만 밀리초가 있으면 소수점 형식으로 변환해야 한다', () => {
      expect(formatDuration(1500)).toBe('1.5초');
      expect(formatDuration(7474)).toBe('7.5초');
    });

    it('정확한 초는 "N초" 형식으로 변환해야 한다', () => {
      expect(formatDuration(1000)).toBe('1초');
      expect(formatDuration(5000)).toBe('5초');
    });

    it('분 단위를 "N분" 또는 "N분 N초" 형식으로 변환해야 한다', () => {
      expect(formatDuration(60000)).toBe('1분'); // 정확히 1분
      expect(formatDuration(90000)).toBe('1분 30초'); // 1분 30초
      expect(formatDuration(150000)).toBe('2분 30초'); // 2분 30초
    });

    it('시간 단위를 "N시간" 또는 "N시간 N분" 형식으로 변환해야 한다', () => {
      expect(formatDuration(3600000)).toBe('1시간'); // 정확히 1시간
      expect(formatDuration(5400000)).toBe('1시간 30분'); // 1시간 30분
      expect(formatDuration(7200000)).toBe('2시간'); // 정확히 2시간
    });

    it('null이나 undefined를 "-"로 변환해야 한다', () => {
      expect(formatDuration(null)).toBe('-');
      expect(formatDuration(undefined)).toBe('-');
    });

    it('음수는 "-"로 변환해야 한다', () => {
      expect(formatDuration(-1000)).toBe('-');
    });

    it('0은 "0ms"로 변환해야 한다', () => {
      expect(formatDuration(0)).toBe('0ms');
    });
  });

  describe('타임존 독립성', () => {
    it('UTC 기준으로 동작하여 타임존에 독립적이어야 한다', () => {
      // 같은 UTC 시간은 어떤 타임존에서든 같은 결과를 반환
      const utcTime = '2025-11-01T12:00:00.000Z';

      const date = parseISOTimestamp(utcTime);
      expect(date).toBeInstanceOf(Date);

      const isoString = toUTCISO(date!);
      expect(isoString).toBe(utcTime);
    });

    it('한국 시간 표시는 Asia/Seoul 타임존을 사용해야 한다', () => {
      // UTC 00:00 → KST 09:00
      const midnightUTC = '2025-11-01T00:00:00.000Z';
      const result = formatTime(midnightUTC);

      expect(result).toBe('09:00:00');
    });
  });

  describe('formatDateTimeCompact', () => {
    it('ISO 8601 UTC timestamp를 "YYYY.MM.DD HH:mm:ss" 형식으로 변환해야 한다', () => {
      // 2025-11-03T06:25:30.000Z (UTC) → 2025.11.03 15:25:30 (KST)
      const result = formatDateTimeCompact('2025-11-03T06:25:30.000Z');
      expect(result).toBe('2025.11.03 15:25:30');
    });

    it('null이나 undefined를 "-"로 변환해야 한다', () => {
      expect(formatDateTimeCompact(null)).toBe('-');
      expect(formatDateTimeCompact(undefined)).toBe('-');
      expect(formatDateTimeCompact('')).toBe('-');
    });

    it('잘못된 형식의 timestamp는 "잘못된 시간"을 반환해야 한다', () => {
      expect(formatDateTimeCompact('not-a-date')).toBe('잘못된 시간');
      expect(formatDateTimeCompact('2025-99-99')).toBe('잘못된 시간');
    });

    it('자정(00:00:00)을 올바르게 처리해야 한다', () => {
      // 2025-11-02T15:00:00.000Z (UTC) → 2025.11.03 00:00:00 (KST)
      const result = formatDateTimeCompact('2025-11-02T15:00:00.000Z');
      expect(result).toBe('2025.11.03 00:00:00');
    });

    it('정오(12:00:00)를 올바르게 처리해야 한다', () => {
      // 2025-11-03T03:00:00.000Z (UTC) → 2025.11.03 12:00:00 (KST)
      const result = formatDateTimeCompact('2025-11-03T03:00:00.000Z');
      expect(result).toBe('2025.11.03 12:00:00');
    });

    it('날짜 경계를 넘는 경우 KST 날짜로 변환해야 한다', () => {
      // 2025-11-02T16:00:00.000Z (UTC) → 2025.11.03 01:00:00 (KST)
      const result = formatDateTimeCompact('2025-11-02T16:00:00.000Z');
      expect(result).toBe('2025.11.03 01:00:00');
    });

    it('밀리초를 올바르게 버려야 한다', () => {
      // 밀리초가 999ms여도 초 단위만 표시
      const result = formatDateTimeCompact('2025-11-03T06:25:30.999Z');
      expect(result).toBe('2025.11.03 15:25:30');
    });

    it('한 자리 숫자를 두 자리로 패딩해야 한다', () => {
      // 2025-01-05T00:05:05.000Z (UTC) → 2025.01.05 09:05:05 (KST)
      const result = formatDateTimeCompact('2025-01-05T00:05:05.000Z');
      expect(result).toBe('2025.01.05 09:05:05');
    });

    it('연말연시 경계를 올바르게 처리해야 한다', () => {
      // 2024-12-31T16:00:00.000Z (UTC) → 2025.01.01 01:00:00 (KST)
      const result = formatDateTimeCompact('2024-12-31T16:00:00.000Z');
      expect(result).toBe('2025.01.01 01:00:00');
    });

    it('문서 연결일 형식과 일치해야 한다 (DocumentsTab에서 사용)', () => {
      // DocumentsTab에서 표시되는 형식과 동일해야 함
      const linkedAt = '2025-11-03T06:24:00.000Z';
      const result = formatDateTimeCompact(linkedAt);

      expect(result).toMatch(/^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(result).toBe('2025.11.03 15:24:00');
    });

    it('Annual Report 파싱일시 형식과 일치해야 한다', () => {
      // AnnualReportTab에서 표시되는 형식과 동일해야 함
      const parsedAt = '2025-11-03T06:25:30.000Z';
      const result = formatDateTimeCompact(parsedAt);

      expect(result).toBe('2025.11.03 15:25:30');
    });
  });

  describe('Edge Cases', () => {
    it('윤년의 2월 29일을 올바르게 처리해야 한다', () => {
      const leapDay = '2024-02-29T12:00:00.000Z';
      const date = parseISOTimestamp(leapDay);

      expect(date).toBeInstanceOf(Date);
      expect(formatDate(leapDay)).toBe('2024.02.29');
    });

    it('연도 경계를 넘는 경우를 올바르게 처리해야 한다', () => {
      // 2024-12-31 23:00:00 UTC → 2025-01-01 08:00 KST
      const yearEnd = '2024-12-31T23:00:00.000Z';
      const result = formatDate(yearEnd);

      expect(result).toBe('2025.01.01');
    });

    it('매우 큰 timestamp 차이를 올바르게 처리해야 한다', () => {
      const start = '2025-01-01T00:00:00.000Z';
      const end = '2025-12-31T23:59:59.999Z';

      const diff = getTimeDiff(start, end);
      expect(diff).toBeGreaterThan(0);

      // 약 365일
      const duration = formatDuration(diff!);
      expect(duration).toMatch(/시간/);
    });
  });
});
