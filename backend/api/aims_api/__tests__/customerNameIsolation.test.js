/**
 * 고객명 중복 체크 사용자별 격리 테스트
 * @description 같은 고객명이 다른 사용자 간에는 허용되고, 같은 사용자 내에서는 차단되는지 검증
 * @since 2025-12-14
 *
 * 버그 수정 배경:
 * - MongoDB 유니크 인덱스에 meta.created_by가 누락되어 있어서
 * - 다른 사용자가 동일한 고객명을 등록하면 "이미 등록된 고객명" 오류 발생
 * - 수정: 인덱스에 meta.created_by 추가 → 사용자별 격리
 */

const { generateToken } = require('../middleware/auth');
const { connectWithFallback, TEST_DB_NAME } = require('./testDbHelper');

// 테스트 설정
const TEST_CONFIG = {
  DB_NAME: TEST_DB_NAME,
  API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:3010',
  JWT_SECRET: process.env.JWT_SECRET || '09d0ec3fa027dba25479492f323417f39e13b00437628b82aa12f2e593791c71e88a75097f8ca6bf32ae1cd64ce1020779b2cf6458aa34f013af9c6869e742b4',
};

// 테스트용 사용자 ID (랜덤하게 생성하여 다른 테스트와 충돌 방지)
const TEST_RUN_ID = Date.now();
const USER_A = `test-user-name-iso-A-${TEST_RUN_ID}`;
const USER_B = `test-user-name-iso-B-${TEST_RUN_ID}`;

// JWT 토큰
let tokenUserA = null;
let tokenUserB = null;

// MongoDB 클라이언트
let mongoClient = null;
let db = null;

// 생성된 고객 ID (cleanup용)
const createdCustomerIds = [];

// API 서버 가용성 체크 플래그
let serverAvailable = false;

/**
 * API 서버 연결 가능 여부 확인
 */
async function checkServerAvailability() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    await fetch(`${TEST_CONFIG.API_BASE_URL}/api/health`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return true;
  } catch {
    return false;
  }
}

/**
 * 테스트 전 설정
 */
beforeAll(async () => {
  // API 서버 연결 가능 여부 확인
  serverAvailable = await checkServerAvailability();
  if (!serverAvailable) {
    console.log('⚠️  API 서버가 실행되지 않아 customerNameIsolation 테스트를 건너뜁니다.');
    return;
  }

  // JWT_SECRET 설정 (테스트용)
  process.env.JWT_SECRET = TEST_CONFIG.JWT_SECRET;

  // MongoDB 연결 (자동 fallback)
  const result = await connectWithFallback();
  mongoClient = result.client;
  db = mongoClient.db(TEST_CONFIG.DB_NAME);
  console.log(`[Setup] MongoDB connected: ${result.uri}`);

  // JWT 토큰 생성
  tokenUserA = generateToken({ id: USER_A, name: 'Test User A', role: 'user' });
  tokenUserB = generateToken({ id: USER_B, name: 'Test User B', role: 'user' });

  console.log(`[Setup] Test users: A=${USER_A}, B=${USER_B}`);
});

/**
 * 테스트 후 정리
 */
afterAll(async () => {
  if (!serverAvailable) {
    console.log('[Cleanup] 서버 미실행으로 정리 건너뜀');
    return;
  }

  // 테스트용 고객 삭제 (영구 삭제)
  if (db && createdCustomerIds.length > 0) {
    for (const id of createdCustomerIds) {
      try {
        await db.collection('customers').deleteOne({ _id: id });
      } catch (e) {
        // 이미 삭제되었을 수 있음
      }
    }
    console.log(`[Cleanup] Deleted ${createdCustomerIds.length} test customers`);
  }

  // MongoDB 연결 종료
  if (mongoClient) {
    await mongoClient.close();
  }
});

/**
 * API 호출 헬퍼 함수
 */
async function apiCall(method, endpoint, token, body = null) {
  const url = `${TEST_CONFIG.API_BASE_URL}${endpoint}`;

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json().catch(() => null);

  return {
    status: response.status,
    ok: response.ok,
    data,
  };
}

/**
 * 고객 생성 헬퍼 함수
 */
async function createCustomer(token, name, customerType = '개인') {
  return apiCall('POST', '/api/customers', token, {
    personal_info: { name },
    insurance_info: { customer_type: customerType },
  });
}

/**
 * 서버 가용성 체크 헬퍼
 */
function skipIfServerUnavailable() {
  if (!serverAvailable) {
    console.log('  ⏭️  서버 미실행으로 스킵');
    return true;
  }
  return false;
}

// =============================================================================
// 고객명 중복 체크 사용자별 격리 테스트
// =============================================================================

describe('고객명 중복 체크 사용자별 격리 테스트', () => {
  const SHARED_CUSTOMER_NAME = `격리테스트고객_${TEST_RUN_ID}`;

  // -------------------------------------------------------------------------
  // 핵심 시나리오: 다른 사용자 간 동일한 고객명 허용
  // -------------------------------------------------------------------------
  describe('다른 사용자 간 동일한 고객명 허용', () => {

    test('USER_A가 고객 등록 - 성공해야 함', async () => {
      if (skipIfServerUnavailable()) return;

      const response = await createCustomer(tokenUserA, SHARED_CUSTOMER_NAME, '개인');

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data._id).toBeDefined();

      // cleanup용 저장
      const { ObjectId } = require('mongodb');
      createdCustomerIds.push(new ObjectId(response.data.data._id));

      console.log(`  ✅ USER_A created: ${SHARED_CUSTOMER_NAME}`);
    });

    test('USER_B가 동일한 이름으로 등록 - 성공해야 함 (다른 사용자이므로)', async () => {
      if (skipIfServerUnavailable()) return;

      const response = await createCustomer(tokenUserB, SHARED_CUSTOMER_NAME, '개인');

      // 핵심 검증: 다른 사용자는 같은 이름을 사용할 수 있어야 함
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data._id).toBeDefined();

      // cleanup용 저장
      const { ObjectId } = require('mongodb');
      createdCustomerIds.push(new ObjectId(response.data.data._id));

      console.log(`  ✅ USER_B created: ${SHARED_CUSTOMER_NAME} (same name, different user - OK)`);
    });

    test('USER_A가 동일한 이름으로 다시 등록 - 409 Conflict (같은 사용자)', async () => {
      if (skipIfServerUnavailable()) return;

      const response = await createCustomer(tokenUserA, SHARED_CUSTOMER_NAME, '개인');

      // 같은 사용자는 같은 이름을 등록할 수 없음
      expect(response.status).toBe(409);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toContain('이미');

      console.log(`  ✅ USER_A duplicate rejected: ${response.data.error}`);
    });
  });

  // -------------------------------------------------------------------------
  // 추가 시나리오: 대소문자 무시
  // -------------------------------------------------------------------------
  describe('대소문자 무시 중복 체크', () => {
    const CASE_TEST_NAME = `CaseTest_${TEST_RUN_ID}`;

    test('USER_A가 "CaseTest" 등록 후 "casetest"로 등록 시도 - 409 Conflict', async () => {
      if (skipIfServerUnavailable()) return;

      // 첫 번째 등록
      const response1 = await createCustomer(tokenUserA, CASE_TEST_NAME, '법인');
      expect(response1.status).toBe(200);

      const { ObjectId } = require('mongodb');
      createdCustomerIds.push(new ObjectId(response1.data.data._id));

      // 대소문자 다르게 등록 시도
      const response2 = await createCustomer(tokenUserA, CASE_TEST_NAME.toLowerCase(), '법인');
      expect(response2.status).toBe(409);

      console.log(`  ✅ Case-insensitive duplicate rejected`);
    });
  });

  // -------------------------------------------------------------------------
  // 추가 시나리오: 개인/법인 구분
  // -------------------------------------------------------------------------
  describe('개인/법인 고객 유형 구분', () => {
    const TYPE_TEST_NAME = `TypeTest_${TEST_RUN_ID}`;

    test('같은 사용자가 같은 이름으로 개인 등록 후 법인 등록 시도 - 409 Conflict', async () => {
      if (skipIfServerUnavailable()) return;

      // 개인으로 먼저 등록
      const response1 = await createCustomer(tokenUserA, TYPE_TEST_NAME, '개인');
      expect(response1.status).toBe(200);

      const { ObjectId } = require('mongodb');
      createdCustomerIds.push(new ObjectId(response1.data.data._id));

      // 법인으로 등록 시도 - CLAUDE.md 규칙: 개인/법인 통틀어 유일해야 함
      const response2 = await createCustomer(tokenUserA, TYPE_TEST_NAME, '법인');

      // 반드시 409 Conflict여야 함 (비즈니스 규칙)
      expect(response2.status).toBe(409);
      expect(response2.data.success).toBe(false);
      expect(response2.data.error).toContain('이미');

      console.log(`  ✅ 개인/법인 통틀어 중복 차단: ${response2.data.error}`);
    });
  });
});

// =============================================================================
// 테스트 요약 출력
// =============================================================================

afterAll(() => {
  if (serverAvailable) {
    console.log('\n========================================');
    console.log('고객명 중복 체크 사용자별 격리 테스트 완료');
    console.log('========================================\n');
  }
});
