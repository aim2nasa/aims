/**
 * customer-documents.contract.test.js
 * 고객-문서 관계 API Contract 테스트
 */

const { checkServerAvailability, apiFetch } = require('../helpers/contractTestTemplate');
const { connectWithFallback, TEST_DB_NAME } = require('../testDbHelper');
const { TestDataFactory } = require('../helpers/testDataFactory');

const TEST_USER_ID = 'test-contract-custdocs-user';
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

describe('GET /api/customers/:id/documents', () => {
  it('고객 문서 목록 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch(`/api/customers/${testCustomer._id}/documents`, {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
    const docs = body.documents || body.data?.documents || body.data;
    expect(Array.isArray(docs)).toBe(true);
  });

  it('인증 없이 401', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch(`/api/customers/${testCustomer._id}/documents`, {}, null);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/customers/:id/document-hashes', () => {
  it('문서 해시 목록 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch(`/api/customers/${testCustomer._id}/document-hashes`, {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
  });
});
