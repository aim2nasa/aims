/**
 * contracts-insurance.contract.test.js
 * 계약/보험상품 API Contract 테스트
 */

const { ObjectId } = require('mongodb');
const { checkServerAvailability, apiFetch } = require('../helpers/contractTestTemplate');

let serverAvailable = false;

beforeAll(async () => {
  serverAvailable = await checkServerAvailability();
  if (!serverAvailable) console.log('API 서버 미실행 - contracts/insurance 테스트 건너뜀');
});

// === GET /api/insurance-products ===
describe('GET /api/insurance-products', () => {
  it('보험상품 목록 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/insurance-products');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

describe('GET /api/insurance-products/statistics', () => {
  it('보험상품 통계 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/insurance-products/statistics');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
  });
});

// === GET /api/contracts ===
describe('GET /api/contracts', () => {
  it('계약 목록 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/contracts?page=1&limit=5');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
  });

  it('존재하지 않는 계약 조회', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/contracts/000000000000000000000000');
    const body = await res.json();
    expect([200, 404]).toContain(res.status);
  });
});
