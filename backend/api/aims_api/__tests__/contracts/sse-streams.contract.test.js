/**
 * sse-streams.contract.test.js
 * SSE 스트림 엔드포인트 Contract 테스트
 *
 * SSE 연결의 핸드셰이크와 초기 이벤트만 검증.
 * (long-lived 연결이므로 전체 스트림 테스트는 불가)
 */

const { connectSSE } = require('../helpers/sseTestHelper');
const { API_BASE, checkServerAvailability } = require('../helpers/contractTestTemplate');
const { connectWithFallback, TEST_DB_NAME } = require('../testDbHelper');
const { TestDataFactory } = require('../helpers/testDataFactory');
const { generateToken } = require('../../middleware/auth');

const TEST_USER_ID = 'test-sse-contract-user';
const JWT_SECRET = process.env.JWT_SECRET || '09d0ec3fa027dba25479492f323417f39e13b00437628b82aa12f2e593791c71e88a75097f8ca6bf32ae1cd64ce1020779b2cf6458aa34f013af9c6869e742b4';

let serverAvailable = false;
let client, db, factory, testCustomer, testToken;

beforeAll(async () => {
  serverAvailable = await checkServerAvailability();
  if (!serverAvailable) return;

  process.env.JWT_SECRET = JWT_SECRET;
  testToken = generateToken({ id: TEST_USER_ID, name: 'SSE Test', role: 'user' });

  const result = await connectWithFallback();
  client = result.client;
  db = client.db(TEST_DB_NAME);
  factory = new TestDataFactory(db);
  testCustomer = await factory.createCustomer(TEST_USER_ID);
});

afterAll(async () => {
  if (factory) await factory.cleanup();
  if (client) await client.close();
});

describe('Customer Documents Stream', () => {
  it('GET /api/customers/:id/documents/stream - SSE 연결 + connected 이벤트', async () => {
    if (!serverAvailable) return;
    const url = `${API_BASE}/api/customers/${testCustomer._id}/documents/stream?token=${testToken}`;
    const { events, statusCode, headers } = await connectSSE(url, { timeoutMs: 3000 });

    expect(statusCode).toBe(200);
    expect(headers['content-type']).toMatch(/text\/event-stream/);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].event).toBe('connected');
  });
});

describe('Customer Combined Stream', () => {
  it('GET /api/customers/:customerId/stream - SSE 연결', async () => {
    if (!serverAvailable) return;
    const url = `${API_BASE}/api/customers/${testCustomer._id}/stream?token=${testToken}`;
    const { events, statusCode } = await connectSSE(url, { timeoutMs: 3000 });

    expect(statusCode).toBe(200);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].event).toBe('connected');
  });
});

describe('Annual Reports Stream', () => {
  it('GET /api/customers/:customerId/annual-reports/stream - SSE 연결', async () => {
    if (!serverAvailable) return;
    const url = `${API_BASE}/api/customers/${testCustomer._id}/annual-reports/stream?token=${testToken}`;
    const { events, statusCode } = await connectSSE(url, { timeoutMs: 3000 });

    expect(statusCode).toBe(200);
    expect(events[0]?.event).toBe('connected');
  });
});

describe('Customer Reviews Stream', () => {
  it('GET /api/customers/:customerId/customer-reviews/stream - SSE 연결', async () => {
    if (!serverAvailable) return;
    const url = `${API_BASE}/api/customers/${testCustomer._id}/customer-reviews/stream?token=${testToken}`;
    const { events, statusCode } = await connectSSE(url, { timeoutMs: 3000 });

    expect(statusCode).toBe(200);
    expect(events[0]?.event).toBe('connected');
  });
});

describe('SSE 인증 검증', () => {
  it('토큰 없이 401 반환', async () => {
    if (!serverAvailable) return;
    const url = `${API_BASE}/api/customers/${testCustomer._id}/documents/stream`;
    const { statusCode } = await connectSSE(url, { timeoutMs: 2000 });
    expect(statusCode).toBe(401);
  });
});
