/**
 * health.contract.test.js
 * Health/System 엔드포인트 Contract 테스트
 * 인증 불필요한 공개 API
 */

const { API_BASE, checkServerAvailability, apiFetch } = require('../helpers/contractTestTemplate');

let serverAvailable = false;

beforeAll(async () => {
  serverAvailable = await checkServerAvailability();
  if (!serverAvailable) console.log('API 서버 미실행 - health contract 테스트 건너뜀');
});

describe('GET /api/health', () => {
  it('200 + success: true 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/health', {}, null);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('database', 'connected');
  });
});

describe('GET /api/health/deep', () => {
  it('200 + 상세 헬스 정보 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/health/deep', {}, null);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('checks');
    expect(body.checks).toHaveProperty('mongodb');
    expect(typeof body.totalLatency).toBe('number');
  });
});

describe('GET /api/system/versions', () => {
  it('200 + 서비스 버전 정보 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/system/versions', {}, null);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
  });
});
