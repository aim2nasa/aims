/**
 * Time Utilities
 * @since 1.0.0
 *
 * 시간 관련 유틸리티 함수들
 */

/**
 * 상대 시간 표시 (한국어)
 * @param date - Date 객체 또는 ISO 문자열
 * @returns "방금 전", "2분 전", "1시간 전", "3일 전" 등
 *
 * @example
 * ```ts
 * getRelativeTimeString(new Date()) // "방금 전"
 * getRelativeTimeString('2025-01-01T10:00:00Z') // "2시간 전"
 * ```
 */
export function getRelativeTimeString(date: Date | string): string {
  const now = new Date();
  const targetDate = typeof date === 'string' ? new Date(date) : date;
  const diffInMs = now.getTime() - targetDate.getTime();
  const diffInSeconds = Math.floor(diffInMs / 1000);
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);
  const diffInMonths = Math.floor(diffInDays / 30);
  const diffInYears = Math.floor(diffInDays / 365);

  // 미래 시간인 경우
  if (diffInMs < 0) {
    return '방금 전';
  }

  // 1분 미만
  if (diffInSeconds < 60) {
    return '방금 전';
  }

  // 1시간 미만
  if (diffInMinutes < 60) {
    return `${diffInMinutes}분 전`;
  }

  // 24시간 미만
  if (diffInHours < 24) {
    return `${diffInHours}시간 전`;
  }

  // 30일 미만
  if (diffInDays < 30) {
    return `${diffInDays}일 전`;
  }

  // 1년 미만
  if (diffInMonths < 12) {
    return `${diffInMonths}개월 전`;
  }

  // 1년 이상
  return `${diffInYears}년 전`;
}

/**
 * 절대 시간 표시 (한국어 로케일)
 * @param date - Date 객체 또는 ISO 문자열
 * @returns "2025년 1월 1일 오후 3:30"
 */
export function getAbsoluteTimeString(date: Date | string): string {
  const targetDate = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(targetDate);
}

/**
 * 날짜가 오늘인지 확인
 */
export function isToday(date: Date | string): boolean {
  const targetDate = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();

  return (
    targetDate.getDate() === now.getDate() &&
    targetDate.getMonth() === now.getMonth() &&
    targetDate.getFullYear() === now.getFullYear()
  );
}

/**
 * 날짜가 어제인지 확인
 */
export function isYesterday(date: Date | string): boolean {
  const targetDate = typeof date === 'string' ? new Date(date) : date;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  return (
    targetDate.getDate() === yesterday.getDate() &&
    targetDate.getMonth() === yesterday.getMonth() &&
    targetDate.getFullYear() === yesterday.getFullYear()
  );
}
