/**
 * customers.contract.test.js
 * Customer API 엔드포인트 Contract 테스트
 *
 * 검증: 상태 코드, 응답 구조, 인증, 중복 이름 검증, 사용자 격리
 */

const { ObjectId } = require('mongodb');
const { API_BASE, checkServerAvailability, apiFetch } = require('../helpers/contractTestTemplate');
const { connectWithFallback, TEST_DB_NAME } = require('../testDbHelper');
const { TestDataFactory, TEST_PREFIX } = require('../helpers/testDataFactory');

const TEST_USER_ID = 'test-contract-custs-user';
const OTHER_USER_ID = 'test-contract-custs-other';

let serverAvailable = false;
let client, db, factory;
let testCustomer, otherCustomer;

beforeAll(async () => {
  serverAvailable = await checkServerAvailability();
  if (!serverAvailable) {
    console.log('API 서버 미실행 - customers contract 테스트 건너뜀');
    return;
  }
  const result = await connectWithFallback();
  client = result.client;
  db = client.db(TEST_DB_NAME);
  factory = new TestDataFactory(db);
  testCustomer = await factory.createCustomer(TEST_USER_ID);
  otherCustomer = await factory.createCustomer(OTHER_USER_ID);
});

afterAll(async () => {
  if (factory) await factory.cleanup();
  if (client) await client.close();
});

// === GET /api/customers/stats ===
describe('GET /api/customers/stats', () => {
  it('고객 통계 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/customers/stats', {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
    expect(typeof body.total).toBe('number');
    expect(typeof body.active).toBe('number');
    expect(typeof body.inactive).toBe('number');
  });
});

// === GET /api/customers ===
describe('GET /api/customers', () => {
  it('페이지네이션 고객 목록 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/customers?page=1&limit=5', {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data.customers)).toBe(true);
    expect(body.data).toHaveProperty('pagination');
    expect(typeof body.data.pagination.totalCount).toBe('number');
  });

  it('status=active 필터링', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/customers?page=1&limit=5&status=active', {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    for (const cust of body.data?.customers || []) {
      expect(cust.meta?.status).not.toBe('inactive');
    }
  });

  it('status=inactive 필터링', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/customers?page=1&limit=5&status=inactive', {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    for (const cust of body.data?.customers || []) {
      expect(cust.meta?.status).toBe('inactive');
    }
  });

  it('status=all 필터링', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/customers?page=1&limit=5&status=all', {}, TEST_USER_ID);
    expect(res.status).toBe(200);
  });

  it('search 파라미터 처리', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch(`/api/customers?page=1&limit=5&search=${encodeURIComponent(TEST_PREFIX)}`, {}, TEST_USER_ID);
    expect(res.status).toBe(200);
  });

  it('사용자 데이터 격리', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/customers?page=1&limit=100', {}, TEST_USER_ID);
    const body = await res.json();
    for (const cust of body.data?.customers || []) {
      expect(cust.meta?.created_by).toBe(TEST_USER_ID);
    }
  });

  it('인증 없이 401 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/customers?page=1&limit=5', {}, null);
    expect(res.status).toBe(401);
  });
});

// === POST /api/customers ===
describe('POST /api/customers', () => {
  let createdId;

  afterAll(async () => {
    if (createdId && db) {
      await db.collection('customers').deleteOne({ _id: new ObjectId(createdId) });
    }
  });

  it('유효한 데이터로 고객 생성 (200)', async () => {
    if (!serverAvailable) return;
    const uniqueName = `${TEST_PREFIX}create_${Date.now()}`;
    const res = await apiFetch('/api/customers', {
      method: 'POST',
      body: JSON.stringify({
        personal_info: { name: uniqueName },
        insurance_info: { customer_type: '개인' },
      }),
    }, TEST_USER_ID);
    const body = await res.json();
    expect([200, 201]).toContain(res.status);
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('data');
    expect(body.data).toHaveProperty('_id');
    createdId = body.data._id;
  });

  it('중복 이름 거부 (409)', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/customers', {
      method: 'POST',
      body: JSON.stringify({
        personal_info: { name: testCustomer.personal_info.name },
        insurance_info: { customer_type: '개인' },
      }),
    }, TEST_USER_ID);
    expect(res.status).toBe(409);
  });

  it('인증 없이 401', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/customers', {
      method: 'POST',
      body: JSON.stringify({ personal_info: { name: 'test' } }),
    }, null);
    expect(res.status).toBe(401);
  });
});

// === GET /api/customers/:id ===
describe('GET /api/customers/:id', () => {
  it('고객 상세 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch(`/api/customers/${testCustomer._id}`, {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('data');
    expect(body.data).toHaveProperty('personal_info');
  });

  it('다른 사용자 고객 접근 시 403', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch(`/api/customers/${otherCustomer._id}`, {}, TEST_USER_ID);
    expect(res.status).toBe(403);
  });

  it('잘못된 ObjectId에 에러', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/customers/invalid-id', {}, TEST_USER_ID);
    expect([400, 404, 500]).toContain(res.status);
  });
});

// === PUT /api/customers/:id ===
describe('PUT /api/customers/:id', () => {
  it('유효한 데이터로 업데이트 (200)', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch(`/api/customers/${testCustomer._id}`, {
      method: 'PUT',
      body: JSON.stringify({
        personal_info: {
          name: testCustomer.personal_info.name,
          mobile_phone: '010-9999-8888',
        },
      }),
    }, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
  });

  it('다른 사용자 고객 수정 시 403', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch(`/api/customers/${otherCustomer._id}`, {
      method: 'PUT',
      body: JSON.stringify({ personal_info: { name: 'hacked' } }),
    }, TEST_USER_ID);
    expect(res.status).toBe(403);
  });
});

// === GET /api/customers/check-name ===
describe('GET /api/customers/check-name', () => {
  it('기존 이름 - exists: true', async () => {
    if (!serverAvailable) return;
    const name = encodeURIComponent(testCustomer.personal_info.name);
    const res = await apiFetch(`/api/customers/check-name?name=${name}`, {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('exists', true);
  });

  it('없는 이름 - exists: false', async () => {
    if (!serverAvailable) return;
    const name = encodeURIComponent('absolutely-nonexistent-name-xyz-123');
    const res = await apiFetch(`/api/customers/check-name?name=${name}`, {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('exists', false);
  });
});
