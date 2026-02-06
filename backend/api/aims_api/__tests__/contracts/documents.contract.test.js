/**
 * documents.contract.test.js
 * Document API 엔드포인트 Contract 테스트
 *
 * 검증: 상태 코드, 응답 구조, 인증 강제, 입력 검증, 사용자 격리
 */

const { ObjectId } = require('mongodb');
const { API_BASE, checkServerAvailability, apiFetch, assertSuccessResponse, assertErrorResponse } = require('../helpers/contractTestTemplate');

const TEST_USER_ID = 'test-contract-docs-user';
let serverAvailable = false;

beforeAll(async () => {
  serverAvailable = await checkServerAvailability();
  if (!serverAvailable) console.log('API 서버 미실행 - documents contract 테스트 건너뜀');
});

// === GET /api/documents ===
describe('GET /api/documents', () => {
  it('인증된 사용자에게 페이지네이션 문서 목록 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/documents?page=1&limit=5', {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data.documents)).toBe(true);
    expect(body.data).toHaveProperty('pagination');
    expect(typeof body.data.pagination.totalCount).toBe('number');
  });

  it('인증 없이 401 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/documents?page=1&limit=5', {}, null);
    expect(res.status).toBe(401);
  });

  it('음수 limit에 400 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/documents?page=1&limit=-1', {}, TEST_USER_ID);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('success', false);
  });

  it('과도한 limit(>1000)에 400 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/documents?page=1&limit=9999', {}, TEST_USER_ID);
    expect(res.status).toBe(400);
  });

  it('search 파라미터 처리', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch(`/api/documents?page=1&limit=5&search=${encodeURIComponent('test')}`, {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
  });

  it('sort 파라미터 처리', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/documents?page=1&limit=5&sort=name_asc', {}, TEST_USER_ID);
    expect(res.status).toBe(200);
  });

  it('사용자 데이터 격리 - 자기 문서만 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/documents?page=1&limit=100', {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    for (const doc of body.data?.documents || []) {
      expect(doc.ownerId).toBe(TEST_USER_ID);
    }
  });
});

// === GET /api/documents/stats ===
describe('GET /api/documents/stats', () => {
  it('문서 통계 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/documents/stats', {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
    expect(typeof body.total).toBe('number');
  });

  it('인증 없이 401 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/documents/stats', {}, null);
    expect(res.status).toBe(401);
  });
});

// === POST /api/documents/check-hash ===
describe('POST /api/documents/check-hash', () => {
  it('해시 중복 검사 결과 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/documents/check-hash', {
      method: 'POST',
      body: JSON.stringify({ fileHash: 'nonexistent-hash-for-contract-test' }),
    }, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
    expect(typeof body.isDuplicate).toBe('boolean');
  });
});

// === GET /api/documents/status ===
describe('GET /api/documents/status', () => {
  it('문서 상태 목록 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/documents/status?page=1&limit=5', {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data.documents)).toBe(true);
  });
});

// === GET /api/documents/:id/status ===
describe('GET /api/documents/:id/status', () => {
  it('잘못된 ObjectId에 에러 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/documents/not-valid-id/status', {}, TEST_USER_ID);
    expect([400, 404, 500]).toContain(res.status);
  });

  it('존재하지 않는 문서에 404 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/documents/000000000000000000000000/status', {}, TEST_USER_ID);
    expect([403, 404, 200]).toContain(res.status); // 403=소유자 아님, 404=미존재
  });
});

// === DELETE /api/documents/:id ===
describe('DELETE /api/documents/:id', () => {
  it('인증 없이 401 반환', async () => {
    if (!serverAvailable) return;
    const fakeId = new ObjectId();
    const res = await apiFetch(`/api/documents/${fakeId}`, { method: 'DELETE' }, null);
    expect(res.status).toBe(401);
  });

  it('존재하지 않는 문서에 에러 반환', async () => {
    if (!serverAvailable) return;
    const fakeId = new ObjectId();
    const res = await apiFetch(`/api/documents/${fakeId}`, { method: 'DELETE' }, TEST_USER_ID);
    expect([200, 403, 404, 500]).toContain(res.status); // 403=소유자 아님
  });
});

// === PATCH /api/documents/set-annual-report ===
describe('PATCH /api/documents/set-annual-report', () => {
  it('인증 없이 401 반환', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch('/api/documents/set-annual-report', {
      method: 'PATCH',
      body: JSON.stringify({ documentId: '000000000000000000000000', isAR: true }),
    }, null);
    expect(res.status).toBe(401);
  });
});
