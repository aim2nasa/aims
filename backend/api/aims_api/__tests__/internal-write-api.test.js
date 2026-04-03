/**
 * internal-write-api.test.js
 * Phase 2 Internal Write API regression 테스트
 *
 * MongoDB mock + supertest로 엔드포인트 핸들러 검증
 * - 정상 요청 → 200/201 응답
 * - 필수값 누락 → 400
 * - 소유권 없음 → 403/404
 * - 중복 데이터 → 409
 *
 * @since 2026-04-03
 */

const request = require('supertest');
const express = require('express');
const { ObjectId } = require('mongodb');

// Windows에서 VERSION 파일(텍스트)과 version.js가 대소문자 무시로 충돌
jest.mock('../version', () => ({
  VERSION_INFO: { version: '0.0.0-test', gitHash: 'test', buildTime: 'test', fullVersion: 'v0.0.0-test' },
  APP_VERSION: '0.0.0-test',
  GIT_HASH: 'test',
  BUILD_TIME: 'test',
  FULL_VERSION: 'v0.0.0-test',
  logVersionInfo: jest.fn(),
}));

// OpenAI SDK mock
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn() } },
    audio: { transcriptions: { create: jest.fn() } },
  }));
});

// ==================== 테스트용 상수 ====================

const API_KEY = 'test-internal-api-key';
const MOCK_USER_ID = 'kakao_12345';
const MOCK_CUSTOMER_ID = new ObjectId();
const MOCK_CUSTOMER_ID2 = new ObjectId();
const MOCK_MEMO_ID = new ObjectId();
const MOCK_RELATIONSHIP_ID = new ObjectId();

// ==================== Mock DB 구성 ====================

/**
 * 컬렉션별 mock 메서드를 생성한다.
 * 매 테스트 전 resetAllMocks()로 초기화.
 */
const collectionMocks = {
  customers: {
    findOne: jest.fn(),
    insertOne: jest.fn(),
    updateOne: jest.fn(),
    find: jest.fn(),
  },
  customer_memos: {
    findOne: jest.fn(),
    insertOne: jest.fn(),
    updateOne: jest.fn(),
    deleteOne: jest.fn(),
  },
  customer_relationships: {
    findOne: jest.fn(),
    insertOne: jest.fn(),
    deleteOne: jest.fn(),
    deleteMany: jest.fn(),
  },
  // Read API에서 사용하는 컬렉션 (라우트 로딩 시 필요)
  files: {
    find: jest.fn().mockReturnValue({
      project: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      toArray: jest.fn().mockResolvedValue([]),
    }),
    countDocuments: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
  },
};

const mockDb = {
  collection: jest.fn((name) => {
    return collectionMocks[name] || {
      findOne: jest.fn(),
      find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
      insertOne: jest.fn(),
      updateOne: jest.fn(),
      deleteOne: jest.fn(),
      deleteMany: jest.fn(),
    };
  }),
};

// ==================== Express App 구성 ====================

let app;

beforeAll(() => {
  process.env.INTERNAL_API_KEY = API_KEY;

  // internal-routes를 require하기 전에 환경변수 설정 필요
  // (모듈 레벨에서 INTERNAL_API_KEY를 읽음)
  jest.resetModules();
  const internalRoutes = require('../routes/internal-routes');

  app = express();
  app.use(express.json());
  app.use('/api', internalRoutes(mockDb));
});

beforeEach(() => {
  // 모든 mock 초기화 (clearAllMocks는 queued return values를 초기화하지 않으므로 개별 reset)
  jest.clearAllMocks();

  // 컬렉션별 mock 반환값 큐 초기화
  Object.values(collectionMocks).forEach(col => {
    Object.values(col).forEach(fn => {
      if (typeof fn?.mockReset === 'function') {
        fn.mockReset();
      }
    });
  });
});

// ==================== 헬퍼 함수 ====================

/** 인증 헤더 포함 POST */
function postWithAuth(url, body) {
  return request(app)
    .post(url)
    .set('x-api-key', API_KEY)
    .send(body);
}

/** 인증 헤더 포함 PUT */
function putWithAuth(url, body) {
  return request(app)
    .put(url)
    .set('x-api-key', API_KEY)
    .send(body);
}

/** 인증 헤더 포함 DELETE (body 전송) */
function deleteWithAuth(url, body) {
  return request(app)
    .delete(url)
    .set('x-api-key', API_KEY)
    .send(body);
}

// ==================== 인증 테스트 ====================

describe('Internal Write API - 인증', () => {
  test('API 키 없이 요청 시 401 반환', async () => {
    const res = await request(app)
      .post('/api/internal/customers')
      .send({ name: '테스트', phone: '010-1234-5678', userId: MOCK_USER_ID });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/API key/i);
  });
});

// ==================== #10. POST /internal/customers ====================

describe('POST /api/internal/customers — 고객 생성', () => {
  const url = '/api/internal/customers';

  test('정상 생성 (name, phone, userId 제공)', async () => {
    // 이름 중복 없음
    collectionMocks.customers.findOne.mockResolvedValueOnce(null);
    // insertOne 성공
    collectionMocks.customers.insertOne.mockResolvedValueOnce({
      insertedId: MOCK_CUSTOMER_ID,
    });

    const res = await postWithAuth(url, {
      name: '홍길동',
      phone: '010-1234-5678',
      userId: MOCK_USER_ID,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.customerId).toBe(MOCK_CUSTOMER_ID.toString());
    expect(res.body.data.name).toBe('홍길동');
    expect(res.body.data.customerType).toBe('개인');
  });

  test('필수값 누락 (name 없음) → 400', async () => {
    const res = await postWithAuth(url, {
      phone: '010-1234-5678',
      userId: MOCK_USER_ID,
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/name/);
  });

  test('필수값 누락 (userId 없음) → 400', async () => {
    const res = await postWithAuth(url, {
      name: '홍길동',
      phone: '010-1234-5678',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('이름 중복 → 409', async () => {
    // 중복 고객 존재
    collectionMocks.customers.findOne.mockResolvedValueOnce({
      _id: new ObjectId(),
      personal_info: { name: '홍길동' },
    });

    const res = await postWithAuth(url, {
      name: '홍길동',
      phone: '010-1234-5678',
      userId: MOCK_USER_ID,
    });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/이미 존재/);
  });

  test('customerType 지정 시 반영', async () => {
    collectionMocks.customers.findOne.mockResolvedValueOnce(null);
    collectionMocks.customers.insertOne.mockResolvedValueOnce({
      insertedId: MOCK_CUSTOMER_ID,
    });

    const res = await postWithAuth(url, {
      name: '테스트법인',
      phone: '02-1234-5678',
      userId: MOCK_USER_ID,
      customerType: '법인',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.customerType).toBe('법인');
  });
});

// ==================== #11. PUT /internal/customers/:id ====================

describe('PUT /api/internal/customers/:id — 고객 수정', () => {
  const url = `/api/internal/customers/${MOCK_CUSTOMER_ID}`;

  test('정상 수정', async () => {
    // 고객 존재 + 소유권 확인
    collectionMocks.customers.findOne.mockResolvedValueOnce({
      _id: MOCK_CUSTOMER_ID,
      personal_info: { name: '홍길동', mobile_phone: '010-1234-5678' },
      meta: { created_by: MOCK_USER_ID },
    });
    // updateOne 성공
    collectionMocks.customers.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await putWithAuth(url, {
      userId: MOCK_USER_ID,
      phone: '010-9999-8888',
      email: 'test@example.com',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.customerId).toBe(MOCK_CUSTOMER_ID.toString());
    expect(res.body.data.updatedFields).toContain('personal_info.mobile_phone');
    expect(res.body.data.updatedFields).toContain('personal_info.email');
  });

  test('고객 없음 → 404', async () => {
    collectionMocks.customers.findOne.mockResolvedValueOnce(null);

    const res = await putWithAuth(url, {
      userId: MOCK_USER_ID,
      name: '변경이름',
    });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/찾을 수 없/);
  });

  test('이름 변경 시 중복 → 409', async () => {
    // 고객 존재
    collectionMocks.customers.findOne
      .mockResolvedValueOnce({
        _id: MOCK_CUSTOMER_ID,
        personal_info: { name: '홍길동' },
        meta: { created_by: MOCK_USER_ID },
      })
      // 이름 중복 체크 - 중복 존재
      .mockResolvedValueOnce({
        _id: new ObjectId(),
        personal_info: { name: '김철수' },
      });

    const res = await putWithAuth(url, {
      userId: MOCK_USER_ID,
      name: '김철수',
    });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/이미 존재/);
  });

  test('userId 누락 → 400', async () => {
    const res = await putWithAuth(url, {
      name: '변경이름',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/userId/);
  });

  test('유효하지 않은 ID → 400', async () => {
    const res = await putWithAuth('/api/internal/customers/invalid-id', {
      userId: MOCK_USER_ID,
      name: '변경이름',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/유효하지 않은/);
  });
});

// ==================== #12. PUT /internal/customers/:id/memo-sync ====================

describe('PUT /api/internal/customers/:id/memo-sync — 메모 동기화', () => {
  const url = `/api/internal/customers/${MOCK_CUSTOMER_ID}/memo-sync`;

  test('정상 동기화', async () => {
    // 소유권 확인
    collectionMocks.customers.findOne.mockResolvedValueOnce({
      _id: MOCK_CUSTOMER_ID,
      meta: { created_by: MOCK_USER_ID },
    });
    // updateOne 성공
    collectionMocks.customers.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await putWithAuth(url, {
      memoText: '메모 내용 테스트',
      userId: MOCK_USER_ID,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('memoText 누락 → 400', async () => {
    const res = await putWithAuth(url, {
      userId: MOCK_USER_ID,
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/memoText/);
  });

  test('소유권 없음 → 403', async () => {
    // 소유권 확인 실패
    collectionMocks.customers.findOne.mockResolvedValueOnce(null);

    const res = await putWithAuth(url, {
      memoText: '메모 내용',
      userId: 'other_user',
    });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/권한/);
  });

  test('userId 미전달 → 400', async () => {
    const res = await putWithAuth(url, {
      memoText: '메모 내용',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/userId/);
  });

  test('빈 문자열 memoText 허용 (동기화 해제)', async () => {
    collectionMocks.customers.findOne.mockResolvedValueOnce({
      _id: MOCK_CUSTOMER_ID,
      meta: { created_by: MOCK_USER_ID },
    });
    collectionMocks.customers.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await putWithAuth(url, {
      memoText: '',
      userId: MOCK_USER_ID,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ==================== #13. POST /internal/memos ====================

describe('POST /api/internal/memos — 메모 생성', () => {
  const url = '/api/internal/memos';

  test('정상 생성', async () => {
    collectionMocks.customer_memos.insertOne.mockResolvedValueOnce({
      insertedId: MOCK_MEMO_ID,
    });

    const res = await postWithAuth(url, {
      customerId: MOCK_CUSTOMER_ID.toString(),
      content: '새 메모 내용',
      userId: MOCK_USER_ID,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.memoId).toBe(MOCK_MEMO_ID.toString());
  });

  test('필수값 누락 (content 없음) → 400', async () => {
    const res = await postWithAuth(url, {
      customerId: MOCK_CUSTOMER_ID.toString(),
      userId: MOCK_USER_ID,
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('필수값 누락 (customerId 없음) → 400', async () => {
    const res = await postWithAuth(url, {
      content: '메모 내용',
      userId: MOCK_USER_ID,
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('유효하지 않은 customerId → 400', async () => {
    const res = await postWithAuth(url, {
      customerId: 'invalid-id',
      content: '메모 내용',
      userId: MOCK_USER_ID,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/유효하지 않은/);
  });
});

// ==================== #14. PUT /internal/memos/:id ====================

describe('PUT /api/internal/memos/:id — 메모 수정', () => {
  const url = `/api/internal/memos/${MOCK_MEMO_ID}`;

  test('정상 수정', async () => {
    // 고객 소유권 확인
    collectionMocks.customers.findOne.mockResolvedValueOnce({
      _id: MOCK_CUSTOMER_ID,
      meta: { created_by: MOCK_USER_ID },
    });
    // 메모 존재 확인
    collectionMocks.customer_memos.findOne.mockResolvedValueOnce({
      _id: MOCK_MEMO_ID,
      customer_id: MOCK_CUSTOMER_ID,
      content: '이전 내용',
    });
    // updateOne 성공
    collectionMocks.customer_memos.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await putWithAuth(url, {
      customerId: MOCK_CUSTOMER_ID.toString(),
      content: '수정된 내용',
      userId: MOCK_USER_ID,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('소유권 없음 → 403', async () => {
    // 고객 소유권 확인 실패
    collectionMocks.customers.findOne.mockResolvedValueOnce(null);

    const res = await putWithAuth(url, {
      customerId: MOCK_CUSTOMER_ID.toString(),
      content: '수정할 내용',
      userId: 'other_user',
    });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/권한/);
  });

  test('메모 없음 → 404', async () => {
    // 고객 소유권 확인 통과
    collectionMocks.customers.findOne.mockResolvedValueOnce({
      _id: MOCK_CUSTOMER_ID,
      meta: { created_by: MOCK_USER_ID },
    });
    // 메모 존재 확인 실패
    collectionMocks.customer_memos.findOne.mockResolvedValueOnce(null);

    const res = await putWithAuth(url, {
      customerId: MOCK_CUSTOMER_ID.toString(),
      content: '수정할 내용',
      userId: MOCK_USER_ID,
    });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/찾을 수 없/);
  });

  test('필수값 누락 (content 없음) → 400', async () => {
    const res = await putWithAuth(url, {
      customerId: MOCK_CUSTOMER_ID.toString(),
      userId: MOCK_USER_ID,
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ==================== #15. DELETE /internal/memos/:id ====================

describe('DELETE /api/internal/memos/:id — 메모 삭제', () => {
  test('정상 삭제', async () => {
    // 메모 존재 확인
    collectionMocks.customer_memos.findOne.mockResolvedValueOnce({
      _id: MOCK_MEMO_ID,
      customer_id: MOCK_CUSTOMER_ID,
    });
    // deleteOne 성공
    collectionMocks.customer_memos.deleteOne.mockResolvedValueOnce({ deletedCount: 1 });

    const res = await request(app)
      .delete(`/api/internal/memos/${MOCK_MEMO_ID}`)
      .query({ customerId: MOCK_CUSTOMER_ID.toString() })
      .set('x-api-key', API_KEY);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('메모 없음 → 404', async () => {
    collectionMocks.customer_memos.findOne.mockResolvedValueOnce(null);

    const res = await request(app)
      .delete(`/api/internal/memos/${MOCK_MEMO_ID}`)
      .query({ customerId: MOCK_CUSTOMER_ID.toString() })
      .set('x-api-key', API_KEY);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/찾을 수 없/);
  });

  test('customerId 누락 → 400', async () => {
    const res = await request(app)
      .delete(`/api/internal/memos/${MOCK_MEMO_ID}`)
      .set('x-api-key', API_KEY);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/customerId/);
  });

  test('유효하지 않은 ID → 400', async () => {
    const res = await request(app)
      .delete('/api/internal/memos/invalid-id')
      .query({ customerId: MOCK_CUSTOMER_ID.toString() })
      .set('x-api-key', API_KEY);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/유효하지 않은/);
  });
});

// ==================== #16. POST /internal/relationships ====================

describe('POST /api/internal/relationships — 관계 생성', () => {
  const url = '/api/internal/relationships';

  test('정상 생성 (양방향 포함)', async () => {
    // 두 고객 소유권 확인
    collectionMocks.customers.findOne
      .mockResolvedValueOnce({ _id: MOCK_CUSTOMER_ID, meta: { created_by: MOCK_USER_ID } }) // from
      .mockResolvedValueOnce({ _id: MOCK_CUSTOMER_ID2, meta: { created_by: MOCK_USER_ID } }); // to

    // 기존 관계 중복 체크 (없음)
    collectionMocks.customer_relationships.findOne
      .mockResolvedValueOnce(null) // 정방향 중복 체크
      .mockResolvedValueOnce(null); // 역방향 중복 체크

    // insertOne 2회 (정방향 + 역방향)
    collectionMocks.customer_relationships.insertOne
      .mockResolvedValueOnce({ insertedId: MOCK_RELATIONSHIP_ID })
      .mockResolvedValueOnce({ insertedId: new ObjectId() });

    const res = await postWithAuth(url, {
      fromCustomerId: MOCK_CUSTOMER_ID.toString(),
      toCustomerId: MOCK_CUSTOMER_ID2.toString(),
      relationshipType: 'spouse',
      userId: MOCK_USER_ID,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.relationshipId).toBe(MOCK_RELATIONSHIP_ID.toString());
    expect(res.body.data.reverseCreated).toBe(true);
    // insertOne이 2번 호출됨 (정방향 + 역방향)
    expect(collectionMocks.customer_relationships.insertOne).toHaveBeenCalledTimes(2);
  });

  test('자기 참조 → 400', async () => {
    const res = await postWithAuth(url, {
      fromCustomerId: MOCK_CUSTOMER_ID.toString(),
      toCustomerId: MOCK_CUSTOMER_ID.toString(),
      relationshipType: 'friend',
      userId: MOCK_USER_ID,
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/자기 자신/);
  });

  test('중복 관계 → 409', async () => {
    // 두 고객 소유권 확인
    collectionMocks.customers.findOne
      .mockResolvedValueOnce({ _id: MOCK_CUSTOMER_ID, meta: { created_by: MOCK_USER_ID } })
      .mockResolvedValueOnce({ _id: MOCK_CUSTOMER_ID2, meta: { created_by: MOCK_USER_ID } });

    // 기존 관계 존재
    collectionMocks.customer_relationships.findOne.mockResolvedValueOnce({
      _id: MOCK_RELATIONSHIP_ID,
      relationship_info: {
        from_customer_id: MOCK_CUSTOMER_ID,
        to_customer_id: MOCK_CUSTOMER_ID2,
        relationship_type: 'friend',
        status: 'active',
      },
    });

    const res = await postWithAuth(url, {
      fromCustomerId: MOCK_CUSTOMER_ID.toString(),
      toCustomerId: MOCK_CUSTOMER_ID2.toString(),
      relationshipType: 'friend',
      userId: MOCK_USER_ID,
    });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/이미 등록/);
  });

  test('필수값 누락 (relationshipType 없음) → 400', async () => {
    const res = await postWithAuth(url, {
      fromCustomerId: MOCK_CUSTOMER_ID.toString(),
      toCustomerId: MOCK_CUSTOMER_ID2.toString(),
      userId: MOCK_USER_ID,
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('유효하지 않은 관계 유형 → 400', async () => {
    const res = await postWithAuth(url, {
      fromCustomerId: MOCK_CUSTOMER_ID.toString(),
      toCustomerId: MOCK_CUSTOMER_ID2.toString(),
      relationshipType: 'invalid_type',
      userId: MOCK_USER_ID,
    });

    // 유효하지 않은 유형 + corporate 카테고리 아님 → 400
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/유효하지 않은 관계 유형/);
  });

  test('기준 고객 없음 → 404', async () => {
    // from 고객 없음
    collectionMocks.customers.findOne
      .mockResolvedValueOnce(null) // from 조회 실패
      .mockResolvedValueOnce({ _id: MOCK_CUSTOMER_ID2, meta: { created_by: MOCK_USER_ID } });

    // 중복 체크 없음
    collectionMocks.customer_relationships.findOne.mockResolvedValueOnce(null);

    const res = await postWithAuth(url, {
      fromCustomerId: MOCK_CUSTOMER_ID.toString(),
      toCustomerId: MOCK_CUSTOMER_ID2.toString(),
      relationshipType: 'friend',
      userId: MOCK_USER_ID,
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/기준 고객/);
  });

  test('비방향 관계 시 역방향 미생성', async () => {
    // 두 고객 소유권 확인
    collectionMocks.customers.findOne
      .mockResolvedValueOnce({ _id: MOCK_CUSTOMER_ID, meta: { created_by: MOCK_USER_ID } })
      .mockResolvedValueOnce({ _id: MOCK_CUSTOMER_ID2, meta: { created_by: MOCK_USER_ID } });

    // 중복 없음
    collectionMocks.customer_relationships.findOne.mockResolvedValueOnce(null);

    // insertOne 1회 (정방향만)
    collectionMocks.customer_relationships.insertOne
      .mockResolvedValueOnce({ insertedId: MOCK_RELATIONSHIP_ID });

    const res = await postWithAuth(url, {
      fromCustomerId: MOCK_CUSTOMER_ID.toString(),
      toCustomerId: MOCK_CUSTOMER_ID2.toString(),
      relationshipType: 'supervisor', // professional, bidirectional: false, 비-family
      userId: MOCK_USER_ID,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.reverseCreated).toBe(false);
    // insertOne 1번만 호출
    expect(collectionMocks.customer_relationships.insertOne).toHaveBeenCalledTimes(1);
  });
});

// ==================== #17. DELETE /internal/relationships/:id ====================

describe('DELETE /api/internal/relationships/:id — 관계 삭제', () => {
  test('정상 삭제', async () => {
    // 관계 조회
    collectionMocks.customer_relationships.findOne.mockResolvedValueOnce({
      _id: MOCK_RELATIONSHIP_ID,
      relationship_info: {
        from_customer_id: MOCK_CUSTOMER_ID,
        to_customer_id: MOCK_CUSTOMER_ID2,
        relationship_type: 'friend',
        is_bidirectional: true,
        relationship_category: 'social',
        status: 'active',
      },
    });
    // 고객 소유권 확인
    collectionMocks.customers.findOne.mockResolvedValueOnce({
      _id: MOCK_CUSTOMER_ID,
      meta: { created_by: MOCK_USER_ID },
    });
    // 정방향 삭제
    collectionMocks.customer_relationships.deleteOne.mockResolvedValueOnce({ deletedCount: 1 });
    // 역방향 삭제 (양방향이므로)
    collectionMocks.customer_relationships.deleteMany.mockResolvedValueOnce({ deletedCount: 1 });

    const res = await deleteWithAuth(`/api/internal/relationships/${MOCK_RELATIONSHIP_ID}`, {
      userId: MOCK_USER_ID,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.reverseDeleted).toBe(true);
  });

  test('관계 없음 → 404', async () => {
    collectionMocks.customer_relationships.findOne.mockResolvedValueOnce(null);

    const res = await deleteWithAuth(`/api/internal/relationships/${MOCK_RELATIONSHIP_ID}`, {
      userId: MOCK_USER_ID,
    });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/찾을 수 없/);
  });

  test('소유권 없음 → 403', async () => {
    // 관계 조회
    collectionMocks.customer_relationships.findOne.mockResolvedValueOnce({
      _id: MOCK_RELATIONSHIP_ID,
      relationship_info: {
        from_customer_id: MOCK_CUSTOMER_ID,
        to_customer_id: MOCK_CUSTOMER_ID2,
        relationship_type: 'friend',
        status: 'active',
      },
    });
    // 고객 소유권 확인 실패
    collectionMocks.customers.findOne.mockResolvedValueOnce(null);

    const res = await deleteWithAuth(`/api/internal/relationships/${MOCK_RELATIONSHIP_ID}`, {
      userId: 'other_user',
    });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/권한/);
  });

  test('userId 누락 → 400', async () => {
    const res = await deleteWithAuth(`/api/internal/relationships/${MOCK_RELATIONSHIP_ID}`, {});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/userId/);
  });

  test('유효하지 않은 관계 ID → 400', async () => {
    const res = await deleteWithAuth('/api/internal/relationships/invalid-id', {
      userId: MOCK_USER_ID,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/유효하지 않은/);
  });
});
