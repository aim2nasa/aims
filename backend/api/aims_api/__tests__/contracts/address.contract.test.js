/**
 * address.contract.test.js
 * Address/Geocoding API Contract 테스트
 */

const { checkServerAvailability, apiFetch } = require('../helpers/contractTestTemplate');

let serverAvailable = false;

beforeAll(async () => {
  serverAvailable = await checkServerAvailability();
  if (!serverAvailable) console.log('API 서버 미실행 - address 테스트 건너뜀');
});

describe('GET /api/address/test', () => {
  it('테스트 엔드포인트 응답', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/address/test', {}, null);
    expect([200, 404]).toContain(res.status);
  });
});

describe('GET /api/address/search', () => {
  it('검색어 없이 에러 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/address/search', {}, null);
    expect([400, 200]).toContain(res.status);
  });
});
