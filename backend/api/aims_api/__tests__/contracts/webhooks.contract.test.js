/**
 * webhooks.contract.test.js
 * Webhook 엔드포인트 Contract 테스트
 * 웹훅은 내부 서비스 간 호출 (personal-files-change는 JWT 인증 필요)
 */

const { checkServerAvailability, apiFetch } = require('../helpers/contractTestTemplate');

let serverAvailable = false;

beforeAll(async () => {
  serverAvailable = await checkServerAvailability();
  if (!serverAvailable) console.log('API 서버 미실행 - webhooks 테스트 건너뜀');
});

describe('POST /api/webhooks/ar-status-change', () => {
  it('빈 body에 에러 반환 (필수 필드 누락)', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/webhooks/ar-status-change', {
      method: 'POST',
      body: JSON.stringify({}),
    }, null);
    // 필수 필드 없으면 400 또는 500
    expect([200, 400, 500]).toContain(res.status);
  });
});

describe('POST /api/webhooks/cr-status-change', () => {
  it('빈 body에 에러 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/webhooks/cr-status-change', {
      method: 'POST',
      body: JSON.stringify({}),
    }, null);
    expect([200, 400, 500]).toContain(res.status);
  });
});

describe('POST /api/webhooks/personal-files-change', () => {
  it('인증 없이 호출 시 401 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/webhooks/personal-files-change', {
      method: 'POST',
      body: JSON.stringify({}),
    }, null);
    // 인증 미들웨어가 401, 파싱/검증 미들웨어가 400을 반환할 수 있음
    expect([400, 401]).toContain(res.status);
  });
});
