/**
 * Timestamp Utility Functions
 *
 * AIMS 전체 시스템의 timestamp 표준 유틸리티
 *
 * 표준 형식: ISO 8601 UTC (YYYY-MM-DDTHH:mm:ss.sssZ)
 * - 백엔드는 모든 timestamp를 UTC로 저장
 * - 프론트엔드는 한국 시간(KST)으로 표시
 * - 밀리초 3자리 정밀도
 *
 * 참고: docs/TIMESTAMP_STANDARD.md
 */

/**
 * ISO 8601 timestamp를 한국 시간으로 포맷팅 (날짜 + 시간)
 *
 * @param timestamp - ISO 8601 문자열 (UTC)
 * @returns 포맷된 문자열 (예: "2025. 11. 1. 오후 4:17")
 *
 * @example
 * formatDateTime("2025-11-01T07:17:21.143Z")
 * // "2025. 11. 1. 오후 4:17"
 */
export function formatDateTime(timestamp: string | undefined | null): string {
  if (!timestamp) return '-';

  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '잘못된 시간';

    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Seoul'
    }).format(date);
  } catch (e) {
    return '잘못된 시간';
  }
}

/**
 * ISO 8601 timestamp를 한국 날짜만 포맷팅
 *
 * @param timestamp - ISO 8601 문자열 (UTC)
 * @returns 포맷된 문자열 (예: "2025. 11. 1.")
 *
 * @example
 * formatDate("2025-11-01T07:17:21.143Z")
 * // "2025. 11. 1."
 */
export function formatDate(timestamp: string | undefined | null): string {
  if (!timestamp) return '-';

  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '잘못된 날짜';

    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Asia/Seoul'
    }).format(date);
  } catch (e) {
    return '잘못된 날짜';
  }
}

/**
 * ISO 8601 timestamp를 한국 시간만 포맷팅
 *
 * @param timestamp - ISO 8601 문자열 (UTC)
 * @returns 포맷된 문자열 (예: "오후 4:17")
 *
 * @example
 * formatTime("2025-11-01T07:17:21.143Z")
 * // "오후 4:17"
 */
export function formatTime(timestamp: string | undefined | null): string {
  if (!timestamp) return '-';

  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '잘못된 시간';

    return new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Seoul'
    }).format(date);
  } catch (e) {
    return '잘못된 시간';
  }
}

/**
 * ISO 8601 timestamp를 상대 시간으로 포맷팅
 *
 * @param timestamp - ISO 8601 문자열 (UTC)
 * @returns 포맷된 문자열 (예: "3분 전", "2시간 전", "어제", "2일 전")
 *
 * @example
 * formatRelativeTime("2025-11-01T07:14:21.143Z") // 현재 시간이 07:17:21인 경우
 * // "3분 전"
 */
export function formatRelativeTime(timestamp: string | undefined | null): string {
  if (!timestamp) return '-';

  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '잘못된 시간';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return '방금 전';
    if (diffMin < 60) return `${diffMin}분 전`;
    if (diffHour < 24) return `${diffHour}시간 전`;
    if (diffDay === 1) return '어제';
    if (diffDay < 7) return `${diffDay}일 전`;

    // 7일 이상이면 날짜 표시
    return formatDate(timestamp);
  } catch (e) {
    return '잘못된 시간';
  }
}

/**
 * 현재 UTC 시간을 ISO 8601 형식으로 반환
 *
 * @returns ISO 8601 문자열 (예: "2025-11-01T07:17:21.143Z")
 *
 * @example
 * const timestamp = utcNowISO();
 * console.log(timestamp); // "2025-11-01T07:17:21.143Z"
 */
export function utcNowISO(): string {
  return new Date().toISOString();
}

/**
 * Date 객체를 ISO 8601 UTC 문자열로 변환
 *
 * @param date - Date 객체
 * @returns ISO 8601 문자열 (예: "2025-11-01T07:17:21.143Z")
 *
 * @example
 * const date = new Date();
 * const timestamp = toUTCISO(date);
 * console.log(timestamp); // "2025-11-01T07:17:21.143Z"
 */
export function toUTCISO(date: Date): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid Date object');
  }
  return date.toISOString();
}

/**
 * ISO 8601 문자열을 Date 객체로 파싱
 *
 * @param timestamp - ISO 8601 문자열
 * @returns Date 객체 (파싱 실패 시 null)
 *
 * @example
 * const date = parseISOTimestamp("2025-11-01T07:17:21.143Z");
 * console.log(date); // Date 객체
 */
export function parseISOTimestamp(timestamp: string | undefined | null): Date | null {
  if (!timestamp) return null;

  try {
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? null : date;
  } catch (e) {
    return null;
  }
}

/**
 * 두 timestamp 간의 차이를 밀리초로 반환
 *
 * @param start - 시작 시간 (ISO 문자열 또는 Date 객체)
 * @param end - 종료 시간 (ISO 문자열 또는 Date 객체)
 * @returns 밀리초 단위 차이 (파싱 실패 시 null)
 *
 * @example
 * const diff = getTimeDiff(
 *   "2025-11-01T07:17:21.143Z",
 *   "2025-11-01T07:17:28.617Z"
 * );
 * console.log(diff); // 7474 (약 7.5초)
 */
export function getTimeDiff(
  start: string | Date | undefined | null,
  end: string | Date | undefined | null
): number | null {
  const startDate = start instanceof Date ? start : parseISOTimestamp(start);
  const endDate = end instanceof Date ? end : parseISOTimestamp(end);

  if (!startDate || !endDate) return null;

  return endDate.getTime() - startDate.getTime();
}

/**
 * 밀리초를 사람이 읽기 쉬운 형식으로 변환
 *
 * @param ms - 밀리초
 * @returns 포맷된 문자열 (예: "7.5초", "2분 30초")
 *
 * @example
 * formatDuration(7474)
 * // "7.5초"
 *
 * formatDuration(150000)
 * // "2분 30초"
 */
export function formatDuration(ms: number | undefined | null): string {
  if (ms == null || ms < 0) return '-';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}시간 ${remainingMinutes}분` : `${hours}시간`;
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}분 ${remainingSeconds}초` : `${minutes}분`;
  }

  if (seconds > 0) {
    const remainingMs = ms % 1000;
    return remainingMs > 0 ? `${(ms / 1000).toFixed(1)}초` : `${seconds}초`;
  }

  return `${ms}ms`;
}

/**
 * ISO 8601 timestamp를 YYYY-MM-DD HH:mm:ss 형식으로 포맷팅
 * Annual Report API와 동일한 포맷
 *
 * @param timestamp - ISO 8601 문자열 (UTC)
 * @returns 포맷된 문자열 (예: "2025-11-03 15:25:30")
 *
 * @example
 * formatDateTimeCompact("2025-11-03T06:25:30.000Z")
 * // "2025-11-03 15:25:30" (KST)
 */
export function formatDateTimeCompact(timestamp: string | undefined | null): string {
  if (!timestamp) return '-';

  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '잘못된 시간';

    // KST로 변환하여 각 부분 추출
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year')?.value || '';
    const month = parts.find(p => p.type === 'month')?.value || '';
    const day = parts.find(p => p.type === 'day')?.value || '';
    let hours = parts.find(p => p.type === 'hour')?.value || '';
    const minutes = parts.find(p => p.type === 'minute')?.value || '';
    const seconds = parts.find(p => p.type === 'second')?.value || '';

    // 자정을 24:00:00이 아닌 00:00:00으로 표시
    if (hours === '24') {
      hours = '00';
    }

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (e) {
    return '잘못된 시간';
  }
}
