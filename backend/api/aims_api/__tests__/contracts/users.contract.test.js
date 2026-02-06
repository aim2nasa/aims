/**
 * users.contract.test.js
 * User/Dev API Contract 테스트
 */

const { checkServerAvailability, apiFetch } = require('../helpers/contractTestTemplate');

let serverAvailable = false;

beforeAll(async () => {
  serverAvailable = await checkServerAvailability();
  if (!serverAvailable) console.log('API 서버 미실행 - users 테스트 건너뜀');
});

describe('GET /api/users', () => {
  it('사용자 목록 반환 (공개 API)', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/users', {}, null);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
    expect(Array.isArray(body.data)).toBe(true);
    // 패스워드 노출 금지 검증
    for (const user of body.data) {
      expect(user).not.toHaveProperty('password');
    }
  });
});
