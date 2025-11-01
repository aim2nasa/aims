/**
 * Timestamp Utility Functions
 *
 * AIMS 전체 시스템의 timestamp 표준 유틸리티
 *
 * 표준 형식: ISO 8601 UTC (YYYY-MM-DDTHH:mm:ss.sssZ)
 * - 모든 timestamp는 UTC로 저장
 * - 밀리초 3자리 정밀도
 * - 표시는 프론트엔드에서 로컬 타임존으로 변환
 *
 * 참고: docs/TIMESTAMP_STANDARD.md
 */

/**
 * 현재 UTC 시간을 ISO 8601 형식으로 반환
 *
 * @returns {string} ISO 8601 UTC 형식 (예: "2025-11-01T07:17:21.143Z")
 *
 * @example
 * const timestamp = utcNowISO();
 * console.log(timestamp); // "2025-11-01T07:17:21.143Z"
 */
function utcNowISO() {
  return new Date().toISOString();
}

/**
 * Date 객체를 UTC ISO 8601 문자열로 변환
 *
 * @param {Date} date - Date 객체
 * @returns {string} ISO 8601 UTC 형식 (예: "2025-11-01T07:17:21.143Z")
 * @throws {Error} 유효하지 않은 Date 객체인 경우
 *
 * @example
 * const date = new Date();
 * const timestamp = toUTCISO(date);
 * console.log(timestamp); // "2025-11-01T07:17:21.143Z"
 */
function toUTCISO(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid Date object');
  }
  return date.toISOString();
}

/**
 * MongoDB BSON Date를 위한 UTC Date 객체 생성
 *
 * MongoDB에 저장할 때만 사용합니다.
 * 일반적인 경우에는 utcNowISO()를 사용하여 ISO 문자열로 저장하는 것을 권장합니다.
 *
 * @returns {Date} UTC Date 객체
 *
 * @example
 * // MongoDB 저장용
 * await collection.updateOne(
 *   { _id: docId },
 *   { $set: { updatedAt: utcNowDate() } }
 * );
 */
function utcNowDate() {
  return new Date();
}

/**
 * ISO 8601 문자열을 Date 객체로 파싱
 *
 * 다양한 형식을 지원합니다:
 * - "2025-11-01T07:17:21.143Z" (UTC)
 * - "2025-11-01T16:17:21.143+09:00" (KST)
 * - "2025-11-01T07:17:21Z" (밀리초 없음)
 *
 * @param {string} timestamp - ISO 8601 형식의 문자열
 * @returns {Date|null} Date 객체 (파싱 실패 시 null)
 *
 * @example
 * const date = parseISOTimestamp("2025-11-01T07:17:21.143Z");
 * console.log(date); // Date 객체
 *
 * const invalid = parseISOTimestamp("invalid");
 * console.log(invalid); // null
 */
function parseISOTimestamp(timestamp) {
  if (!timestamp || typeof timestamp !== 'string') {
    return null;
  }

  try {
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? null : date;
  } catch (error) {
    return null;
  }
}

/**
 * 두 timestamp 간의 차이를 밀리초로 반환
 *
 * @param {string|Date} start - 시작 시간 (ISO 문자열 또는 Date 객체)
 * @param {string|Date} end - 종료 시간 (ISO 문자열 또는 Date 객체)
 * @returns {number|null} 밀리초 단위 차이 (파싱 실패 시 null)
 *
 * @example
 * const diff = getTimeDiff(
 *   "2025-11-01T07:17:21.143Z",
 *   "2025-11-01T07:17:28.617Z"
 * );
 * console.log(diff); // 7474 (약 7.5초)
 */
function getTimeDiff(start, end) {
  const startDate = start instanceof Date ? start : parseISOTimestamp(start);
  const endDate = end instanceof Date ? end : parseISOTimestamp(end);

  if (!startDate || !endDate) {
    return null;
  }

  return endDate.getTime() - startDate.getTime();
}

/**
 * 레거시 코드 호환성을 위한 별칭
 *
 * @deprecated utcNowISO() 사용을 권장합니다.
 * @returns {string} ISO 8601 UTC 형식
 */
function getUTCNow() {
  return utcNowISO();
}

module.exports = {
  utcNowISO,
  toUTCISO,
  utcNowDate,
  parseISOTimestamp,
  getTimeDiff,
  // 레거시 호환성
  getUTCNow
};
