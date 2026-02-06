/**
 * contractTestTemplate.js
 * API Contract 테스트를 위한 재사용 가능한 검증 유틸리티
 *
 * server.js 리팩토링 전후의 100% 동작 동일성을 검증하기 위해 사용.
 * 모든 contract 테스트에서 import하여 일관된 검증 패턴 적용.
 *
 * @since 2026-02-07
 */

const API_BASE = process.env.API_BASE_URL || 'http://100.110.215.65:3010';
const TEST_USER_ID = 'test-contract-user-001';

/**
 * API 서버 가용성 확인
 * @returns {Promise<boolean>}
 */
async function checkServerAvailability() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${API_BASE}/api/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 인증 헤더가 포함된 fetch 요청
 * @param {string} urlPath - API 경로 (e.g., '/api/documents')
 * @param {object} options - fetch 옵션
 * @param {string|null} userId - 사용자 ID (null이면 인증 없이)
 * @returns {Promise<Response>}
 */
async function apiFetch(urlPath, options = {}, userId = TEST_USER_ID) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (userId) {
    headers['x-user-id'] = userId;
  }

  return fetch(`${API_BASE}${urlPath}`, {
    ...options,
    headers,
  });
}

/**
 * 표준 성공 응답 형식 검증
 * { success: true, ... }
 */
function assertSuccessResponse(body, statusCode = 200) {
  expect(body).toHaveProperty('success', true);
}

/**
 * 표준 에러 응답 형식 검증
 * { success: false, message|error: "..." }
 */
function assertErrorResponse(body) {
  expect(body).toHaveProperty('success', false);
  const hasMessage = body.message !== undefined || body.error !== undefined;
  expect(hasMessage).toBe(true);
}

/**
 * 페이지네이션 응답 형식 검증
 * 다양한 형식 지원 (total, totalCount, totalDocuments 등)
 */
function assertPaginatedResponse(body) {
  assertSuccessResponse(body);
  // 배열 데이터 필드 확인 (다양한 키 허용)
  const arrayField = body.data || body.documents || body.customers || body.contracts || body.items;
  expect(Array.isArray(arrayField)).toBe(true);
}

/**
 * JSON 값의 "shape"을 추출 (키와 타입만, 값은 제외)
 * Golden Master 비교에 사용
 * @param {*} value - JSON 값
 * @param {number} depth - 재귀 깊이 제한
 * @returns {*} shape 표현
 */
function extractShape(value, depth = 0) {
  if (depth > 5) return typeof value;
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return [extractShape(value[0], depth + 1)];
  }
  if (typeof value === 'object') {
    const shape = {};
    for (const key of Object.keys(value).sort()) {
      shape[key] = extractShape(value[key], depth + 1);
    }
    return shape;
  }
  return typeof value;
}

/**
 * 두 shape을 비교하여 차이점 목록 반환
 * @param {*} expected - 기대 shape (Golden Master)
 * @param {*} actual - 실제 shape
 * @param {string} path - 현재 경로 (디버깅용)
 * @returns {string[]} 차이점 목록
 */
function compareShapes(expected, actual, path = '$') {
  const diffs = [];

  if (typeof expected !== typeof actual) {
    diffs.push(`${path}: type mismatch (expected ${typeof expected}, got ${typeof actual})`);
    return diffs;
  }

  if (expected === null || typeof expected !== 'object') {
    if (expected !== actual) {
      diffs.push(`${path}: value mismatch (expected "${expected}", got "${actual}")`);
    }
    return diffs;
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      diffs.push(`${path}: expected array, got non-array`);
      return diffs;
    }
    if (expected.length > 0 && actual.length > 0) {
      diffs.push(...compareShapes(expected[0], actual[0], `${path}[0]`));
    }
    return diffs;
  }

  // Object 비교: 기존 키가 사라지면 에러, 새 키 추가는 경고
  const expectedKeys = new Set(Object.keys(expected));
  const actualKeys = new Set(Object.keys(actual));

  for (const key of expectedKeys) {
    if (!actualKeys.has(key)) {
      diffs.push(`${path}.${key}: MISSING key (was present in golden master)`);
    } else {
      diffs.push(...compareShapes(expected[key], actual[key], `${path}.${key}`));
    }
  }

  for (const key of actualKeys) {
    if (!expectedKeys.has(key)) {
      diffs.push(`${path}.${key}: NEW key added (warning only)`);
    }
  }

  return diffs;
}

module.exports = {
  API_BASE,
  TEST_USER_ID,
  checkServerAvailability,
  apiFetch,
  assertSuccessResponse,
  assertErrorResponse,
  assertPaginatedResponse,
  extractShape,
  compareShapes,
};
