/**
 * admin.contract.test.js
 * Admin/Backup API Contract 테스트
 */

const { checkServerAvailability, apiFetch } = require('../helpers/contractTestTemplate');

const TEST_USER_ID = 'test-contract-admin-user';
let serverAvailable = false;

beforeAll(async () => {
  serverAvailable = await checkServerAvailability();
  if (!serverAvailable) console.log('API 서버 미실행 - admin 테스트 건너뜀');
});

describe('GET /api/admin/backups/settings', () => {
  it('백업 설정 조회 (인증 필요)', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/admin/backups/settings', {}, TEST_USER_ID);
    // admin role 필요하므로 403 가능
    expect([200, 403]).toContain(res.status);
  });
});

describe('GET /api/admin/backups', () => {
  it('백업 목록 조회 (인증 필요)', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/admin/backups', {}, TEST_USER_ID);
    expect([200, 403]).toContain(res.status);
  });
});
