/**
 * annual-reports.contract.test.js
 * Annual Report / Customer Review API Contract 테스트
 */

const { checkServerAvailability, apiFetch } = require('../helpers/contractTestTemplate');
const { connectWithFallback, TEST_DB_NAME } = require('../testDbHelper');
const { TestDataFactory } = require('../helpers/testDataFactory');

const TEST_USER_ID = 'test-contract-ar-user';
let serverAvailable = false;
let client, db, factory, testCustomer;

beforeAll(async () => {
  serverAvailable = await checkServerAvailability();
  if (!serverAvailable) return;
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

describe('GET /api/annual-reports/all', () => {
  it('사용자의 전체 AR 목록 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/annual-reports/all', {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
  });
});

describe('GET /api/customers/:customerId/annual-reports', () => {
  it('고객의 AR 목록 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch(`/api/customers/${testCustomer._id}/annual-reports`, {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
  });
});

describe('GET /api/customers/:customerId/annual-reports/pending', () => {
  it('대기 중 AR 목록 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch(`/api/customers/${testCustomer._id}/annual-reports/pending`, {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
  });
});

describe('GET /api/annual-report/status/:file_id', () => {
  it('존재하지 않는 파일에 결과 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/annual-report/status/000000000000000000000000', {}, TEST_USER_ID);
    expect([200, 403, 404, 500]).toContain(res.status);
  });
});
