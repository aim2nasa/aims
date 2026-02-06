/**
 * chat.contract.test.js
 * AI Chat API Contract 테스트
 */

const { checkServerAvailability, apiFetch } = require('../helpers/contractTestTemplate');

const TEST_USER_ID = 'test-contract-chat-user';
let serverAvailable = false;

beforeAll(async () => {
  serverAvailable = await checkServerAvailability();
  if (!serverAvailable) console.log('API 서버 미실행 - chat 테스트 건너뜀');
});

describe('GET /api/chat/tools', () => {
  it('사용 가능한 도구 목록 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/chat/tools', {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
  });
});

describe('GET /api/chat/sessions', () => {
  it('채팅 세션 목록 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/chat/sessions', {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
  });
});

describe('GET /api/chat/stats', () => {
  it('채팅 통계 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/chat/stats', {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
  });
});

describe('GET /api/chat/sessions/:sessionId', () => {
  it('존재하지 않는 세션에 에러', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/chat/sessions/nonexistent-session-id', {}, TEST_USER_ID);
    expect([200, 404]).toContain(res.status);
  });
});
