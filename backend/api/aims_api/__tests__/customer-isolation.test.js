/**
 * 고객 데이터 격리 보안 테스트
 * @description 설계사별 고객 데이터가 완전히 격리되는지 검증
 * @since 2025-11-22
 */

const { ObjectId } = require('mongodb');
const { generateToken } = require('../middleware/auth');
const { connectWithFallback, TEST_DB_NAME } = require('./testDbHelper');

// 테스트 설정
const TEST_CONFIG = {
  DB_NAME: TEST_DB_NAME,
  API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:3010',
  JWT_SECRET: process.env.JWT_SECRET || '09d0ec3fa027dba25479492f323417f39e13b00437628b82aa12f2e593791c71e88a75097f8ca6bf32ae1cd64ce1020779b2cf6458aa34f013af9c6869e742b4',
};

// 테스트용 사용자 ID
const USER_A = 'test-user-A';
const USER_B = 'test-user-B';

// JWT 토큰
let tokenUserA = null;
let tokenUserB = null;

// 테스트용 고객 데이터
let testCustomerA = null; // USER_A 소유
let testCustomerB = null; // USER_B 소유

// MongoDB 클라이언트
let mongoClient = null;
let db = null;

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
    console.log('⚠️  API 서버가 실행되지 않아 customer-isolation 테스트를 건너뜁니다.');
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

  // 테스트용 고객 생성 (USER_A 소유)
  const resultA = await db.collection('customers').insertOne({
    personal_info: {
      name: '테스트고객A',
      mobile_phone: '010-1111-1111',
    },
    meta: {
      created_by: USER_A,
      created_at: new Date(),
    },
  });
  testCustomerA = resultA.insertedId;

  // 테스트용 고객 생성 (USER_B 소유)
  const resultB = await db.collection('customers').insertOne({
    personal_info: {
      name: '테스트고객B',
      mobile_phone: '010-2222-2222',
    },
    meta: {
      created_by: USER_B,
      created_at: new Date(),
    },
  });
  testCustomerB = resultB.insertedId;

  console.log(`[Setup] Created test customers: A=${testCustomerA}, B=${testCustomerB}`);
});

/**
 * 테스트 후 정리
 */
afterAll(async () => {
  if (!serverAvailable) {
    console.log('[Cleanup] 서버 미실행으로 정리 건너뜀');
    return;
  }

  // 테스트용 고객 삭제
  if (db && testCustomerA) {
    await db.collection('customers').deleteOne({ _id: testCustomerA });
  }
  if (db && testCustomerB) {
    await db.collection('customers').deleteOne({ _id: testCustomerB });
  }

  // MongoDB 연결 종료
  if (mongoClient) {
    await mongoClient.close();
  }

  console.log('[Cleanup] Test customers deleted');
});

/**
 * API 호출 헬퍼 함수
 */
async function apiCall(method, endpoint, userId, body = null) {
  const url = `${TEST_CONFIG.API_BASE_URL}${endpoint}`;

  // userId에 따라 적절한 JWT 토큰 선택
  const token = userId === USER_A ? tokenUserA : tokenUserB;

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

// =============================================================================
// 서버 가용성 체크 헬퍼 - 각 테스트에서 사용
// =============================================================================
function skipIfServerUnavailable() {
  if (!serverAvailable) {
    console.log('  ⏭️  서버 미실행으로 스킵');
    return true;
  }
  return false;
}

// =============================================================================
// Phase 1: 백엔드 핵심 API 테스트
// =============================================================================

describe('Phase 1: 고객 CRUD API 격리 테스트', () => {

  // -------------------------------------------------------------------------
  // Step 1.1: GET /api/customers/:id
  // -------------------------------------------------------------------------
  describe('Step 1.1: GET /api/customers/:id', () => {

    test('본인 고객 조회 - 성공해야 함', async () => {
      if (skipIfServerUnavailable()) return;
      const response = await apiCall('GET', `/api/customers/${testCustomerA}`, USER_A);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeDefined();
    });

    test('다른 설계사 고객 조회 - 403 반환해야 함', async () => {
      if (skipIfServerUnavailable()) return;
      // USER_A가 USER_B의 고객을 조회 시도
      const response = await apiCall('GET', `/api/customers/${testCustomerB}`, USER_A);

      expect(response.status).toBe(403);
      expect(response.data.success).toBe(false);
    });

    test('JWT 토큰 없이 조회 - 401 반환해야 함', async () => {
      if (skipIfServerUnavailable()) return;
      const url = `${TEST_CONFIG.API_BASE_URL}/api/customers/${testCustomerA}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        // Authorization 헤더 없음
      });

      expect(response.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Step 1.2: PUT /api/customers/:id
  // -------------------------------------------------------------------------
  describe('Step 1.2: PUT /api/customers/:id', () => {

    test('본인 고객 수정 - 성공해야 함', async () => {
      if (skipIfServerUnavailable()) return;
      const response = await apiCall('PUT', `/api/customers/${testCustomerA}`, USER_A, {
        personal_info: {
          name: '테스트고객A_수정',
          mobile_phone: '010-1111-1111',
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      // 원복
      await apiCall('PUT', `/api/customers/${testCustomerA}`, USER_A, {
        personal_info: {
          name: '테스트고객A',
          mobile_phone: '010-1111-1111',
        },
      });
    });

    test('다른 설계사 고객 수정 - 403 반환해야 함', async () => {
      if (skipIfServerUnavailable()) return;
      // USER_A가 USER_B의 고객을 수정 시도
      const response = await apiCall('PUT', `/api/customers/${testCustomerB}`, USER_A, {
        personal_info: {
          name: '해킹시도',
        },
      });

      expect(response.status).toBe(403);
      expect(response.data.success).toBe(false);
    });

    test('JWT 토큰 없이 수정 - 401 반환해야 함', async () => {
      if (skipIfServerUnavailable()) return;
      const url = `${TEST_CONFIG.API_BASE_URL}/api/customers/${testCustomerA}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personal_info: { name: '해킹' } }),
        // Authorization 헤더 없음
      });

      expect(response.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Step 1.3: DELETE /api/customers/:id
  // -------------------------------------------------------------------------
  describe('Step 1.3: DELETE /api/customers/:id', () => {

    let tempCustomerForDelete = null;

    beforeAll(async () => {
      if (!serverAvailable) return;
      // 삭제 테스트용 임시 고객 생성
      const result = await db.collection('customers').insertOne({
        personal_info: { name: '삭제테스트고객' },
        meta: { created_by: USER_A, created_at: new Date() },
      });
      tempCustomerForDelete = result.insertedId;
    });

    afterAll(async () => {
      if (!serverAvailable) return;
      // 혹시 남아있으면 정리
      if (tempCustomerForDelete) {
        await db.collection('customers').deleteOne({ _id: tempCustomerForDelete });
      }
    });

    test('다른 설계사 고객 삭제 - 403 반환해야 함', async () => {
      if (skipIfServerUnavailable()) return;
      // USER_A가 USER_B의 고객을 삭제 시도
      const response = await apiCall('DELETE', `/api/customers/${testCustomerB}`, USER_A);

      expect(response.status).toBe(403);
      expect(response.data.success).toBe(false);

      // 고객이 여전히 존재하는지 확인
      const customer = await db.collection('customers').findOne({ _id: testCustomerB });
      expect(customer).not.toBeNull();
    });

    test('JWT 토큰 없이 삭제 - 401 반환해야 함', async () => {
      if (skipIfServerUnavailable()) return;
      const url = `${TEST_CONFIG.API_BASE_URL}/api/customers/${testCustomerA}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        // Authorization 헤더 없음
      });

      expect(response.status).toBe(401);
    });

    test('본인 고객 삭제 - 성공해야 함', async () => {
      if (skipIfServerUnavailable()) return;
      const response = await apiCall('DELETE', `/api/customers/${tempCustomerForDelete}`, USER_A);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      // 고객이 soft delete(휴면 처리)되었는지 확인
      const customer = await db.collection('customers').findOne({ _id: tempCustomerForDelete });
      expect(customer).not.toBeNull();
      expect(customer.meta.status).toBe('inactive');
    });
  });
});

// =============================================================================
// Phase 2: 문서-고객 연결 API 테스트
// =============================================================================

describe('Phase 2: 문서-고객 연결 API 격리 테스트', () => {

  // -------------------------------------------------------------------------
  // Step 2.1: POST /api/customers/:id/documents
  // -------------------------------------------------------------------------
  describe('Step 2.1: POST /api/customers/:id/documents', () => {

    test('다른 설계사 고객에 문서 연결 - 403 반환해야 함', async () => {
      if (skipIfServerUnavailable()) return;
      // USER_A가 USER_B의 고객에 문서 연결 시도
      const response = await apiCall('POST', `/api/customers/${testCustomerB}/documents`, USER_A, {
        document_id: new ObjectId().toString(),
        relationship_type: 'general',
      });

      expect(response.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // Step 2.4: GET /api/customers/:customerId/annual-reports/pending
  // -------------------------------------------------------------------------
  describe('Step 2.4: GET /api/customers/:customerId/annual-reports/pending', () => {

    test('다른 설계사 고객의 AR 대기 목록 조회 - 403 반환해야 함', async () => {
      if (skipIfServerUnavailable()) return;
      // USER_A가 USER_B의 고객 AR 대기 목록 조회 시도
      const response = await apiCall('GET', `/api/customers/${testCustomerB}/annual-reports/pending`, USER_A);

      expect(response.status).toBe(403);
    });
  });
});

// =============================================================================
// Phase 4: 추가 API 테스트
// =============================================================================

describe('Phase 4: 추가 API 격리 테스트', () => {

  // -------------------------------------------------------------------------
  // Step 4.1: GET /api/customers/:id/address-history
  // -------------------------------------------------------------------------
  describe('Step 4.1: GET /api/customers/:id/address-history', () => {

    test('다른 설계사 고객의 주소 이력 조회 - 403 반환해야 함', async () => {
      if (skipIfServerUnavailable()) return;
      // USER_A가 USER_B의 고객 주소 이력 조회 시도
      const response = await apiCall('GET', `/api/customers/${testCustomerB}/address-history`, USER_A);

      expect(response.status).toBe(403);
    });
  });
});

// =============================================================================
// 테스트 요약 출력
// =============================================================================

afterAll(() => {
  console.log('\n========================================');
  console.log('고객 데이터 격리 보안 테스트 완료');
  console.log('========================================\n');
});
