/**
 * helpers.js - server.js에서 추출한 공통 헬퍼 함수
 *
 * Phase 1: server.js 리팩토링 (헬퍼 함수 추출)
 * @since 2026-02-07
 */

const { ObjectId } = require('mongodb');

/**
 * 정규식 특수문자 이스케이프 함수
 * 정규식에서 특별한 의미를 가진 문자들을 리터럴로 처리
 * @param {string} str - 이스케이프할 문자열
 * @returns {string} - 이스케이프된 문자열
 */
function escapeRegex(str) {
  if (typeof str !== 'string') return '';
  // 정규식 특수문자: . * + ? ^ $ { } ( ) | [ ] \ -
  return str.replace(/[.*+?^${}()|[\]\\\-]/g, '\\$&');
}

/**
 * HTML 태그 제거 및 XSS 방지용 새니타이징 함수
 * 사용자 입력에서 HTML 태그를 제거하여 Stored XSS 공격 방지
 * @param {string} str - 새니타이즈할 문자열
 * @returns {string} - HTML 태그가 제거된 문자열
 */
function sanitizeHtml(str) {
  if (typeof str !== 'string') return str;
  // HTML 태그 제거
  return str
    .replace(/<[^>]*>/g, '')  // HTML 태그 제거
    .replace(/&lt;/g, '<')     // 이미 이스케이프된 것 복원 후
    .replace(/&gt;/g, '>')
    .replace(/<[^>]*>/g, '')  // 다시 태그 제거 (이중 인코딩 방지)
    .trim();
}

/**
 * customerId를 안전하게 ObjectId로 변환
 * 문자열이면 ObjectId로 변환, 이미 ObjectId면 그대로 반환
 * @param {string|ObjectId|null} id - 변환할 ID
 * @returns {ObjectId|null} - ObjectId 또는 null
 */
function toSafeObjectId(id) {
  if (!id) return null;
  if (typeof id === 'string') {
    try {
      return new ObjectId(id);
    } catch (err) {
      console.error(`❌ Invalid ObjectId string: ${id}`);
      return null;
    }
  }
  if (id instanceof ObjectId) return id;
  console.error(`❌ Unexpected customerId type: ${typeof id}`);
  return null;
}

/**
 * 중첩 객체를 dot notation으로 평탄화
 * MongoDB $set에서 중첩 객체의 특정 필드만 업데이트할 때 사용
 *
 * 예: { personal_info: { mobile_phone: '010-1234' } }
 * → { 'personal_info.mobile_phone': '010-1234' }
 *
 * @param {Object} obj - 평탄화할 객체
 * @param {string} prefix - 현재 키 프리픽스
 * @returns {Object} - dot notation으로 평탄화된 객체
 */
function flattenObject(obj, prefix = '') {
  const result = {};

  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;

    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;

    // 평탄화하지 않을 타입: null, 배열, Date, ObjectId
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      !(value instanceof ObjectId)
    ) {
      // 중첩 객체는 재귀적으로 평탄화
      Object.assign(result, flattenObject(value, newKey));
    } else {
      // 기본값, 배열, Date, ObjectId는 그대로 유지
      result[newKey] = value;
    }
  }

  return result;
}

/**
 * 명백한 BIN 타입 체크 (OCR 비용 절감)
 * FILE_BADGE_SYSTEM.md 참조
 * @param {string} mimeType - MIME 타입
 * @returns {boolean} - BIN 타입 여부
 */
function isBinaryMimeType(mimeType) {
  if (!mimeType) return false;

  const BIN_MIME_TYPES = [
    // 압축
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/x-tar',
    'application/gzip',
    'application/x-bzip2',

    // 오디오
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/flac',
    'audio/aac',
    'audio/ogg',

    // 비디오
    'video/mp4',
    'video/mpeg',
    'video/x-msvideo',
    'video/quicktime',
    'video/x-matroska',
    'video/x-ms-wmv',

    // 실행 파일
    'application/x-msdownload',
    'application/x-executable',
    'application/x-sharedlib',
  ];

  return BIN_MIME_TYPES.includes(mimeType.toLowerCase());
}

/**
 * 한글/영문/숫자 초성 추출 헬퍼
 * @param {string} char - 첫 번째 문자
 * @returns {string|null} 초성 문자 또는 null
 */
function getInitialFromChar(char) {
  if (!char) return null;
  const code = char.charCodeAt(0);
  // 한글 완성형 (가~힣)
  if (code >= 0xAC00 && code <= 0xD7A3) {
    const INITIALS = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
    return INITIALS[Math.floor((code - 0xAC00) / 588)] || null;
  }
  // 한글 자모 (ㄱ~ㅎ)
  if (code >= 0x3131 && code <= 0x314E) return char;
  // 영문 (A-Z, a-z)
  if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) return char.toUpperCase();
  // 숫자 (0-9)
  if (code >= 48 && code <= 57) return char;
  return null;
}

/**
 * 초성 필터용 고객 이름 범위 맵
 * 한글 초성 → [시작 음절, 끝 음절) 범위
 */
const CHOSUNG_RANGE_MAP = {
  'ㄱ': ['가', '나'], 'ㄲ': ['까', '나'], 'ㄴ': ['나', '다'],
  'ㄷ': ['다', '라'], 'ㄸ': ['따', '라'], 'ㄹ': ['라', '마'],
  'ㅁ': ['마', '바'], 'ㅂ': ['바', '사'], 'ㅃ': ['빠', '사'],
  'ㅅ': ['사', '아'], 'ㅆ': ['싸', '아'], 'ㅇ': ['아', '자'],
  'ㅈ': ['자', '차'], 'ㅉ': ['짜', '차'], 'ㅊ': ['차', '카'],
  'ㅋ': ['카', '타'], 'ㅌ': ['타', '파'], 'ㅍ': ['파', '하'],
  'ㅎ': ['하', '\uD7A4'],
};

module.exports = {
  escapeRegex,
  sanitizeHtml,
  toSafeObjectId,
  flattenObject,
  isBinaryMimeType,
  getInitialFromChar,
  CHOSUNG_RANGE_MAP,
};
