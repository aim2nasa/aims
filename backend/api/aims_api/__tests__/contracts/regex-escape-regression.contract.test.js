/**
 * regex-escape-regression.contract.test.js
 * BUG-01 $regex escapeRegex 수정 Regression 테스트
 *
 * 검증: 특수문자 검색 시 500 에러 미발생, 리터럴 매칭 정확성, 공격 패턴 방어
 * @since 2026-03-02
 */

const { ObjectId } = require('mongodb');
const { API_BASE, checkServerAvailability, apiFetch } = require('../helpers/contractTestTemplate');
const { connectWithFallback, TEST_DB_NAME } = require('../testDbHelper');
const { TestDataFactory, TEST_PREFIX } = require('../helpers/testDataFactory');

const TEST_USER_ID = 'test-regex-regression-user';
const UNIQUE = `${Date.now()}`;

let serverAvailable = false;
let client, db, factory;
let corpCustomer, bracketCustomer, testDocument;

beforeAll(async () => {
  serverAvailable = await checkServerAvailability();
  if (!serverAvailable) {
    console.log('API 서버 미실행 - regex regression 테스트 건너뜀');
    return;
  }
  const result = await connectWithFallback();
  client = result.client;
  db = client.db(TEST_DB_NAME);
  factory = new TestDataFactory(db);

  // 특수문자가 포함된 테스트 고객 생성
  corpCustomer = await factory.createCustomer(TEST_USER_ID, {
    personal_info: {
      name: `${TEST_PREFIX}(주)테스트법인_${UNIQUE}`,
      mobile_phone: '010-9999-0001',
      email: `corp_${UNIQUE}@test.com`,
    },
  });

  bracketCustomer = await factory.createCustomer(TEST_USER_ID, {
    personal_info: {
      name: `${TEST_PREFIX}[특수]고객_${UNIQUE}`,
      mobile_phone: '010-9999-0002',
    },
  });

  // 특수문자가 포함된 테스트 문서 생성
  testDocument = await factory.createDocument(TEST_USER_ID, corpCustomer._id, {
    upload: {
      originalName: `${TEST_PREFIX}(주)보고서_${UNIQUE}.pdf`,
      mimeType: 'application/pdf',
      size: 2048,
      uploaded_at: new Date(),
      destPath: '/tmp/test-regex.pdf',
    },
  });
});

afterAll(async () => {
  if (factory) await factory.cleanup();
  if (client) await client.close();
});

// ==========================================
// 1. 고객 검색 — 특수문자 이름 매칭
// ==========================================
describe('GET /api/customers — 특수문자 검색 regression', () => {
  it('법인명 괄호 "(주)" 검색 시 200 + 해당 고객 반환', async () => {
    if (!serverAvailable) return;
    const search = encodeURIComponent(`(주)테스트법인_${UNIQUE}`);
    const res = await apiFetch(`/api/customers?page=1&limit=10&search=${search}`, {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const names = (body.data?.customers || []).map(c => c.personal_info?.name);
    expect(names).toContain(corpCustomer.personal_info.name);
  });

  it('대괄호 "[특수]" 검색 시 200 + 해당 고객 반환', async () => {
    if (!serverAvailable) return;
    const search = encodeURIComponent(`[특수]고객_${UNIQUE}`);
    const res = await apiFetch(`/api/customers?page=1&limit=10&search=${search}`, {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const names = (body.data?.customers || []).map(c => c.personal_info?.name);
    expect(names).toContain(bracketCustomer.personal_info.name);
  });

  it('".*" 와일드카드 공격 시 200 + 전체 반환되지 않음', async () => {
    if (!serverAvailable) return;
    const search = encodeURIComponent('.*');
    const res = await apiFetch(`/api/customers?page=1&limit=100&search=${search}`, {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    // ".*" 리터럴을 포함하는 고객만 반환되어야 함 (없으면 0건)
    const total = body.data?.pagination?.totalCount || 0;
    // 와일드카드로 동작했다면 테스트 고객 2명 이상 반환될 것
    const customers = body.data?.customers || [];
    for (const c of customers) {
      expect(c.personal_info?.name).toContain('.*');
    }
  });

  it('"[" 불완전 정규식 검색 시 500이 아닌 200 반환', async () => {
    if (!serverAvailable) return;
    const search = encodeURIComponent('[');
    const res = await apiFetch(`/api/customers?page=1&limit=5&search=${search}`, {}, TEST_USER_ID);
    expect(res.status).toBe(200);
  });

  it('"(" 불완전 그룹 검색 시 500이 아닌 200 반환', async () => {
    if (!serverAvailable) return;
    const search = encodeURIComponent('(');
    const res = await apiFetch(`/api/customers?page=1&limit=5&search=${search}`, {}, TEST_USER_ID);
    expect(res.status).toBe(200);
  });

  it('"a|b" OR 주입 시 200 + 필터 우회 아님', async () => {
    if (!serverAvailable) return;
    const search = encodeURIComponent('a|b');
    const res = await apiFetch(`/api/customers?page=1&limit=100&search=${search}`, {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    // OR 주입이 아닌 리터럴 "a|b"로 검색되어야 함
    for (const c of body.data?.customers || []) {
      const name = c.personal_info?.name || '';
      const phone = c.personal_info?.mobile_phone || '';
      const email = c.personal_info?.email || '';
      const combined = `${name}${phone}${email}`;
      expect(combined).toContain('a|b');
    }
  });

  it('"(a+)+" ReDoS 패턴 검색 시 5초 내 200 응답', async () => {
    if (!serverAvailable) return;
    const search = encodeURIComponent('(a+)+');
    const start = Date.now();
    const res = await apiFetch(`/api/customers?page=1&limit=5&search=${search}`, {}, TEST_USER_ID);
    const elapsed = Date.now() - start;
    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(5000);
  });
});

// ==========================================
// 2. 고객명 중복 체크 — 특수문자
// ==========================================
describe('GET /api/customers/check-name — 특수문자 regression', () => {
  it('존재하는 법인명 "(주)" 포함 → exists: true', async () => {
    if (!serverAvailable) return;
    const name = encodeURIComponent(corpCustomer.personal_info.name);
    const res = await apiFetch(`/api/customers/check-name?name=${name}`, {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.exists).toBe(true);
  });

  it('".*" 와일드카드로 중복 우회 불가 → exists: false', async () => {
    if (!serverAvailable) return;
    const name = encodeURIComponent('.*');
    const res = await apiFetch(`/api/customers/check-name?name=${name}`, {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.exists).toBe(false);
  });

  it('"(" 불완전 정규식 → 500이 아닌 200', async () => {
    if (!serverAvailable) return;
    const name = encodeURIComponent('(');
    const res = await apiFetch(`/api/customers/check-name?name=${name}`, {}, TEST_USER_ID);
    expect(res.status).toBe(200);
  });

  it('"[" 불완전 character class → 500이 아닌 200', async () => {
    if (!serverAvailable) return;
    const name = encodeURIComponent('[');
    const res = await apiFetch(`/api/customers/check-name?name=${name}`, {}, TEST_USER_ID);
    expect(res.status).toBe(200);
  });

  it('"\\" 단독 백슬래시 → 500이 아닌 200', async () => {
    if (!serverAvailable) return;
    const name = encodeURIComponent('\\');
    const res = await apiFetch(`/api/customers/check-name?name=${name}`, {}, TEST_USER_ID);
    expect(res.status).toBe(200);
  });
});

// ==========================================
// 3. 문서 검색 — 특수문자 파일명
// ==========================================
describe('GET /api/documents — 특수문자 검색 regression', () => {
  it('괄호 포함 파일명 "(주)보고서" 검색 시 200', async () => {
    if (!serverAvailable) return;
    const search = encodeURIComponent(`(주)보고서_${UNIQUE}`);
    const res = await apiFetch(`/api/documents?page=1&limit=10&search=${search}`, {}, TEST_USER_ID);
    expect(res.status).toBe(200);
  });

  it('".*" 와일드카드 공격 시 200 + 전체 문서 반환 아님', async () => {
    if (!serverAvailable) return;
    const search = encodeURIComponent('.*');
    const res = await apiFetch(`/api/documents?page=1&limit=100&search=${search}`, {}, TEST_USER_ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    // ".*" 리터럴을 포함하는 문서만 반환
    for (const doc of body.data?.documents || []) {
      expect(doc.upload?.originalName || '').toContain('.*');
    }
  });

  it('"[" 불완전 정규식 검색 시 500이 아닌 200', async () => {
    if (!serverAvailable) return;
    const search = encodeURIComponent('[');
    const res = await apiFetch(`/api/documents?page=1&limit=5&search=${search}`, {}, TEST_USER_ID);
    expect(res.status).toBe(200);
  });

  it('"(a+)+" ReDoS 패턴 검색 시 5초 내 200 응답', async () => {
    if (!serverAvailable) return;
    const search = encodeURIComponent('(a+)+');
    const start = Date.now();
    const res = await apiFetch(`/api/documents?page=1&limit=5&search=${search}`, {}, TEST_USER_ID);
    const elapsed = Date.now() - start;
    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(5000);
  });
});

// ==========================================
// 4. 지역 필터 — region 파라미터
// ==========================================
describe('GET /api/customers?region= — 특수문자 regression', () => {
  it('정상 지역 "서울" 필터 시 200', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch(
      `/api/customers?page=1&limit=5&region=${encodeURIComponent('서울')}`,
      {}, TEST_USER_ID
    );
    expect(res.status).toBe(200);
  });

  it('".*" 와일드카드 공격 시 200 + 전체 반환 아님', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch(
      `/api/customers?page=1&limit=100&region=${encodeURIComponent('.*')}`,
      {}, TEST_USER_ID
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    // region=.* 가 와일드카드로 동작했다면 모든 지역의 고객이 반환됨
    // 리터럴 ".*"로 시작하는 주소는 없으므로 0건이어야 함
    const total = body.data?.pagination?.totalCount || 0;
    expect(total).toBe(0);
  });

  it('"서울|.*" OR 주입 시 200 + 필터 우회 아님', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch(
      `/api/customers?page=1&limit=100&region=${encodeURIComponent('서울|.*')}`,
      {}, TEST_USER_ID
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    // OR 주입이 성공했다면 서울이 아닌 지역도 반환됨
    // 리터럴 "서울|.*"로 시작하는 주소는 없으므로 0건이어야 함
    const total = body.data?.pagination?.totalCount || 0;
    expect(total).toBe(0);
  });

  it('"[" 불완전 정규식 region 시 500이 아닌 200', async () => {
    if (!serverAvailable) return;
    const res = await apiFetch(
      `/api/customers?page=1&limit=5&region=${encodeURIComponent('[')}`,
      {}, TEST_USER_ID
    );
    expect(res.status).toBe(200);
  });
});
