/**
 * internal-phase3-api.test.js
 * Phase 3 Internal API regression 테스트 (엔드포인트 #18~#26)
 *
 * annual_report_api write 전환 엔드포인트 9건에 대한 검증
 * - 파싱 상태 업데이트 (files)
 * - AR/CRS push, 삭제, 중복정리, 등록, 배열교체 (customers)
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
const MOCK_FILE_ID = new ObjectId();
const MOCK_FILE_ID2 = new ObjectId();

// ==================== Mock DB 구성 ====================

const collectionMocks = {
  customers: {
    findOne: jest.fn(),
    insertOne: jest.fn(),
    updateOne: jest.fn(),
    find: jest.fn(),
  },
  files: {
    find: jest.fn().mockReturnValue({
      project: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      toArray: jest.fn().mockResolvedValue([]),
    }),
    findOne: jest.fn(),
    countDocuments: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
    updateOne: jest.fn(),
  },
  // Phase 2에서 사용하는 컬렉션 (라우트 로딩 시 필요)
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

  jest.resetModules();
  const internalRoutes = require('../routes/internal-routes');

  app = express();
  app.use(express.json());
  app.use('/api', internalRoutes(mockDb));
});

beforeEach(() => {
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

/** 인증 헤더 포함 PATCH */
function patchWithAuth(url, body) {
  return request(app)
    .patch(url)
    .set('x-api-key', API_KEY)
    .send(body);
}

// ==================== #18. PATCH /internal/files/:id/parsing-status ====================

describe('PATCH /api/internal/files/:id/parsing-status — 파싱 상태 업데이트', () => {
  const url = `/api/internal/files/${MOCK_FILE_ID}/parsing-status`;

  test('정상: AR completed 상태 업데이트', async () => {
    collectionMocks.files.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await patchWithAuth(url, {
      type: 'ar',
      status: 'completed',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.modifiedCount).toBe(1);
    expect(collectionMocks.files.updateOne).toHaveBeenCalledWith(
      { _id: new ObjectId(MOCK_FILE_ID) },
      expect.objectContaining({
        $set: expect.objectContaining({ ar_parsing_status: 'completed' }),
      })
    );
  });

  test('정상: CR error 상태 + error 메시지', async () => {
    collectionMocks.files.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await patchWithAuth(url, {
      type: 'cr',
      status: 'error',
      error: 'OCR 실패',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(collectionMocks.files.updateOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({
          cr_parsing_status: 'error',
          cr_parsing_error: 'OCR 실패',
        }),
      })
    );
  });

  test('정상: status 미제공 (retry_count만 업데이트)', async () => {
    collectionMocks.files.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await patchWithAuth(url, {
      type: 'ar',
      retry_count: 3,
    });

    expect(res.status).toBe(200);
    // $set에 ar_parsing_status가 포함되지 않아야 함
    const updateCall = collectionMocks.files.updateOne.mock.calls[0];
    const $set = updateCall[1].$set;
    expect($set).not.toHaveProperty('ar_parsing_status');
    expect($set).toHaveProperty('ar_retry_count', 3);
  });

  test('정상: started_at_current_date=true → $currentDate 사용', async () => {
    collectionMocks.files.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await patchWithAuth(url, {
      type: 'ar',
      status: 'processing',
      started_at_current_date: true,
    });

    expect(res.status).toBe(200);
    const updateCall = collectionMocks.files.updateOne.mock.calls[0];
    expect(updateCall[1].$currentDate).toEqual({ ar_parsing_started_at: true });
  });

  test('정상: extra_fields 전달 → 블랙리스트 필드 제외', async () => {
    collectionMocks.files.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await patchWithAuth(url, {
      type: 'ar',
      status: 'completed',
      extra_fields: {
        customField1: 'value1',
        _id: 'should_be_ignored',
        status: 'should_be_ignored',
        overallStatus: 'should_be_ignored',
      },
    });

    expect(res.status).toBe(200);
    const updateCall = collectionMocks.files.updateOne.mock.calls[0];
    const $set = updateCall[1].$set;
    expect($set).toHaveProperty('customField1', 'value1');
    expect($set).not.toHaveProperty('_id');
    // 'status' 키가 있지만 그것은 블랙리스트로 extra_fields의 것은 제외됨
    // ar_parsing_status는 있되, extra_fields의 status는 무시됨
  });

  test('오류: type 없음 → 400', async () => {
    const res = await patchWithAuth(url, {
      status: 'completed',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/type/);
  });

  test('오류: 잘못된 type → 400', async () => {
    const res = await patchWithAuth(url, {
      type: 'invalid',
      status: 'completed',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/type/);
  });

  test('오류: 잘못된 status → 400', async () => {
    const res = await patchWithAuth(url, {
      type: 'ar',
      status: 'invalid_status',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status/);
  });

  test('오류: 유효하지 않은 file ID → 400', async () => {
    const res = await patchWithAuth('/api/internal/files/invalid-id/parsing-status', {
      type: 'ar',
      status: 'completed',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/유효하지 않은/);
  });

  test('보안: extra_fields의 _id, status, overallStatus는 무시됨', async () => {
    collectionMocks.files.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await patchWithAuth(url, {
      type: 'cr',
      status: 'completed',
      extra_fields: {
        _id: 'hacked_id',
        status: 'hacked_status',
        overallStatus: 'hacked',
        meta: 'hacked_meta',
        upload: 'hacked_upload',
        safeField: 'allowed',
      },
    });

    expect(res.status).toBe(200);
    const updateCall = collectionMocks.files.updateOne.mock.calls[0];
    const $set = updateCall[1].$set;
    expect($set).not.toHaveProperty('_id');
    expect($set).not.toHaveProperty('overallStatus');
    expect($set).not.toHaveProperty('meta');
    expect($set).not.toHaveProperty('upload');
    expect($set).toHaveProperty('safeField', 'allowed');
  });
});

// ==================== #19. POST /internal/customers/:id/annual-reports ====================

describe('POST /api/internal/customers/:id/annual-reports — AR 결과 추가', () => {
  const url = `/api/internal/customers/${MOCK_CUSTOMER_ID}/annual-reports`;

  test('정상: annual_report push', async () => {
    collectionMocks.customers.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await postWithAuth(url, {
      annual_report: { issue_date: '2026-01-01', customer_name: '홍길동' },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.modifiedCount).toBe(1);
    expect(collectionMocks.customers.updateOne).toHaveBeenCalledWith(
      { _id: new ObjectId(MOCK_CUSTOMER_ID) },
      { $push: { annual_reports: { issue_date: '2026-01-01', customer_name: '홍길동' } } }
    );
  });

  test('오류: annual_report 누락 → 400', async () => {
    const res = await postWithAuth(url, {});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/annual_report/);
  });

  test('오류: 유효하지 않은 ID → 400', async () => {
    const res = await postWithAuth('/api/internal/customers/invalid-id/annual-reports', {
      annual_report: { issue_date: '2026-01-01' },
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/유효하지 않은/);
  });
});

// ==================== #20. DELETE /internal/customers/:id/annual-reports ====================

describe('DELETE /api/internal/customers/:id/annual-reports — AR 삭제', () => {
  const url = `/api/internal/customers/${MOCK_CUSTOMER_ID}/annual-reports`;

  test('정상: report_indices로 삭제', async () => {
    collectionMocks.customers.findOne.mockResolvedValueOnce({
      _id: MOCK_CUSTOMER_ID,
      annual_reports: [
        { issue_date: '2026-01-01', customer_name: '홍길동', source_file_id: MOCK_FILE_ID.toString() },
        { issue_date: '2026-02-01', customer_name: '김철수', source_file_id: MOCK_FILE_ID2.toString() },
      ],
    });
    collectionMocks.customers.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await deleteWithAuth(url, {
      report_indices: [0],
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deletedCount).toBe(1);
  });

  test('정상: source_file_ids로 삭제', async () => {
    collectionMocks.customers.findOne.mockResolvedValueOnce({
      _id: MOCK_CUSTOMER_ID,
      annual_reports: [
        { issue_date: '2026-01-01', customer_name: '홍길동', source_file_id: MOCK_FILE_ID.toString() },
        { issue_date: '2026-02-01', customer_name: '김철수', source_file_id: MOCK_FILE_ID2.toString() },
      ],
    });
    collectionMocks.customers.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await deleteWithAuth(url, {
      source_file_ids: [MOCK_FILE_ID.toString()],
    });

    expect(res.status).toBe(200);
    expect(res.body.data.deletedCount).toBe(1);
  });

  test('오류: 둘 다 없음 → 400', async () => {
    const res = await deleteWithAuth(url, {});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/report_indices.*source_file_ids|source_file_ids.*report_indices/);
  });

  test('오류: 고객 없음 → 404', async () => {
    collectionMocks.customers.findOne.mockResolvedValueOnce(null);

    const res = await deleteWithAuth(url, {
      report_indices: [0],
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/찾을 수 없/);
  });

  test('오류: 유효하지 않은 ID → 400', async () => {
    const res = await deleteWithAuth('/api/internal/customers/invalid-id/annual-reports', {
      report_indices: [0],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/유효하지 않은/);
  });
});

// ==================== #21. POST /internal/customers/:id/annual-reports/cleanup-duplicates ====================

describe('POST /api/internal/customers/:id/annual-reports/cleanup-duplicates — AR 중복 정리', () => {
  const url = `/api/internal/customers/${MOCK_CUSTOMER_ID}/annual-reports/cleanup-duplicates`;

  test('정상: 중복 2건 → 1건 삭제', async () => {
    collectionMocks.customers.findOne.mockResolvedValueOnce({
      _id: MOCK_CUSTOMER_ID,
      annual_reports: [
        { issue_date: '2026-01-01', customer_name: '홍길동', parsed_at: '2026-01-01T10:00:00Z' },
        { issue_date: '2026-01-01', customer_name: '홍길동', parsed_at: '2026-01-02T10:00:00Z' },
        { issue_date: '2026-03-01', customer_name: '기타' },
      ],
    });
    collectionMocks.customers.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await postWithAuth(url, { issue_date: '2026-01-01' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deletedCount).toBe(1);
  });

  test('정상: 중복 없음 (1건만) → deletedCount=0', async () => {
    collectionMocks.customers.findOne.mockResolvedValueOnce({
      _id: MOCK_CUSTOMER_ID,
      annual_reports: [
        { issue_date: '2026-01-01', customer_name: '홍길동' },
      ],
    });

    const res = await postWithAuth(url, { issue_date: '2026-01-01' });

    expect(res.status).toBe(200);
    expect(res.body.data.deletedCount).toBe(0);
  });

  test('오류: issue_date 누락 → 400', async () => {
    const res = await postWithAuth(url, {});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/issue_date/);
  });

  test('오류: 고객 없음 → 404', async () => {
    collectionMocks.customers.findOne.mockResolvedValueOnce(null);

    const res = await postWithAuth(url, { issue_date: '2026-01-01' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/찾을 수 없/);
  });
});

// ==================== #22. PATCH /internal/customers/:id/annual-reports/register ====================

describe('PATCH /api/internal/customers/:id/annual-reports/register — AR 보험계약 등록', () => {
  const url = `/api/internal/customers/${MOCK_CUSTOMER_ID}/annual-reports/register`;

  test('정상: 등록 → 200, registered_at 반환', async () => {
    collectionMocks.customers.findOne.mockResolvedValueOnce({
      _id: MOCK_CUSTOMER_ID,
      annual_reports: [
        { issue_date: '2026-01-01', customer_name: '홍길동' },
      ],
    });
    collectionMocks.customers.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await patchWithAuth(url, { issue_date: '2026-01-01' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.duplicate).toBe(false);
    expect(res.body.data.registered_at).toBeDefined();
  });

  test('정상: 이미 등록 → 200, duplicate=true', async () => {
    const existingDate = '2026-01-01T12:00:00Z';
    collectionMocks.customers.findOne.mockResolvedValueOnce({
      _id: MOCK_CUSTOMER_ID,
      annual_reports: [
        { issue_date: '2026-01-01', customer_name: '홍길동', registered_at: existingDate },
      ],
    });

    const res = await patchWithAuth(url, { issue_date: '2026-01-01' });

    expect(res.status).toBe(200);
    expect(res.body.data.duplicate).toBe(true);
    expect(res.body.data.registered_at).toBe(existingDate);
  });

  test('오류: issue_date 매칭 없음 → 404', async () => {
    collectionMocks.customers.findOne.mockResolvedValueOnce({
      _id: MOCK_CUSTOMER_ID,
      annual_reports: [
        { issue_date: '2026-01-01', customer_name: '홍길동' },
      ],
    });

    const res = await patchWithAuth(url, { issue_date: '2099-12-31' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/찾을 수 없/);
  });

  test('오류: 고객 없음 → 404', async () => {
    collectionMocks.customers.findOne.mockResolvedValueOnce(null);

    const res = await patchWithAuth(url, { issue_date: '2026-01-01' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/찾을 수 없/);
  });

  test('오류: issue_date 누락 → 400', async () => {
    const res = await patchWithAuth(url, {});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/issue_date/);
  });
});

// ==================== #23. POST /internal/customers/:id/customer-reviews ====================

describe('POST /api/internal/customers/:id/customer-reviews — CRS 결과 추가', () => {
  const url = `/api/internal/customers/${MOCK_CUSTOMER_ID}/customer-reviews`;

  test('정상: customer_review push', async () => {
    collectionMocks.customers.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await postWithAuth(url, {
      customer_review: { review_date: '2026-01-15', reviewer: '김설계사' },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.modifiedCount).toBe(1);
    expect(collectionMocks.customers.updateOne).toHaveBeenCalledWith(
      { _id: new ObjectId(MOCK_CUSTOMER_ID) },
      { $push: { customer_reviews: { review_date: '2026-01-15', reviewer: '김설계사' } } }
    );
  });

  test('오류: customer_review 누락 → 400', async () => {
    const res = await postWithAuth(url, {});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/customer_review/);
  });
});

// ==================== #24. DELETE /internal/customers/:id/customer-reviews ====================

describe('DELETE /api/internal/customers/:id/customer-reviews — CRS 삭제', () => {
  const url = `/api/internal/customers/${MOCK_CUSTOMER_ID}/customer-reviews`;

  test('정상: review_indices로 삭제', async () => {
    collectionMocks.customers.findOne.mockResolvedValueOnce({
      _id: MOCK_CUSTOMER_ID,
      customer_reviews: [
        { review_date: '2026-01-15', source_file_id: MOCK_FILE_ID.toString() },
        { review_date: '2026-02-15', source_file_id: MOCK_FILE_ID2.toString() },
      ],
    });
    collectionMocks.customers.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await deleteWithAuth(url, { review_indices: [1] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deletedCount).toBe(1);
  });

  test('정상: source_file_ids로 삭제', async () => {
    collectionMocks.customers.findOne.mockResolvedValueOnce({
      _id: MOCK_CUSTOMER_ID,
      customer_reviews: [
        { review_date: '2026-01-15', source_file_id: MOCK_FILE_ID.toString() },
        { review_date: '2026-02-15', source_file_id: MOCK_FILE_ID2.toString() },
      ],
    });
    collectionMocks.customers.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await deleteWithAuth(url, {
      source_file_ids: [MOCK_FILE_ID2.toString()],
    });

    expect(res.status).toBe(200);
    expect(res.body.data.deletedCount).toBe(1);
  });

  test('오류: 둘 다 없음 → 400', async () => {
    const res = await deleteWithAuth(url, {});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/review_indices.*source_file_ids|source_file_ids.*review_indices/);
  });

  test('오류: 고객 없음 → 404', async () => {
    collectionMocks.customers.findOne.mockResolvedValueOnce(null);

    const res = await deleteWithAuth(url, { review_indices: [0] });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/찾을 수 없/);
  });
});

// ==================== #25. PUT /internal/customers/:id/annual-reports ====================

describe('PUT /api/internal/customers/:id/annual-reports — AR 배열 교체', () => {
  const url = `/api/internal/customers/${MOCK_CUSTOMER_ID}/annual-reports`;

  test('정상: 배열 교체', async () => {
    collectionMocks.customers.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const newReports = [
      { issue_date: '2026-03-01', customer_name: '새로운AR' },
    ];

    const res = await putWithAuth(url, { annual_reports: newReports });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.modifiedCount).toBe(1);
    expect(collectionMocks.customers.updateOne).toHaveBeenCalledWith(
      { _id: new ObjectId(MOCK_CUSTOMER_ID) },
      { $set: { annual_reports: newReports } }
    );
  });

  test('오류: annual_reports 미배열 → 400', async () => {
    const res = await putWithAuth(url, { annual_reports: 'not-an-array' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/annual_reports/);
  });

  test('오류: 유효하지 않은 ID → 400', async () => {
    const res = await putWithAuth('/api/internal/customers/invalid-id/annual-reports', {
      annual_reports: [],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/유효하지 않은/);
  });
});

// ==================== #26. PUT /internal/customers/:id/customer-reviews ====================

describe('PUT /api/internal/customers/:id/customer-reviews — CRS 배열 교체', () => {
  const url = `/api/internal/customers/${MOCK_CUSTOMER_ID}/customer-reviews`;

  test('정상: 배열 교체', async () => {
    collectionMocks.customers.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const newReviews = [
      { review_date: '2026-03-15', reviewer: '새리뷰' },
    ];

    const res = await putWithAuth(url, { customer_reviews: newReviews });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.modifiedCount).toBe(1);
    expect(collectionMocks.customers.updateOne).toHaveBeenCalledWith(
      { _id: new ObjectId(MOCK_CUSTOMER_ID) },
      { $set: { customer_reviews: newReviews } }
    );
  });

  test('오류: customer_reviews 미배열 → 400', async () => {
    const res = await putWithAuth(url, { customer_reviews: 'not-an-array' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/customer_reviews/);
  });
});
