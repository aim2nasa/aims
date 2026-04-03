/**
 * internal-phase4-api.test.js
 * Phase 4 Internal API regression 테스트 (엔드포인트 #27~#31)
 *
 * 파일 CRUD + 고객 문서 연결 제거 엔드포인트 5건에 대한 검증
 * - 파일 생성 (POST /internal/files)
 * - 범용 파일 업데이트 (PATCH /internal/files/:id)
 * - 필터 기반 파일 삭제 (DELETE /internal/files/by-filter)
 * - 파일 삭제 (DELETE /internal/files/:id)
 * - 고객 문서 연결 제거 (PATCH /internal/customers/:id/pull-document)
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
const MOCK_FILE_ID = new ObjectId();
const MOCK_CUSTOMER_ID = new ObjectId();

// ==================== Mock DB 구성 ====================

const collectionMocks = {
  files: {
    find: jest.fn().mockReturnValue({
      project: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      toArray: jest.fn().mockResolvedValue([]),
    }),
    findOne: jest.fn(),
    insertOne: jest.fn(),
    updateOne: jest.fn(),
    deleteOne: jest.fn(),
    countDocuments: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
  },
  customers: {
    findOne: jest.fn(),
    insertOne: jest.fn(),
    updateOne: jest.fn(),
    find: jest.fn(),
  },
  // 라우트 로딩 시 필요한 다른 컬렉션
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

// ==================== #27. POST /internal/files — 파일 생성 ====================

describe('POST /api/internal/files — 파일 생성', () => {
  const url = '/api/internal/files';

  test('정상: document 전달 → 200, insertedId 반환', async () => {
    const insertedId = new ObjectId();
    collectionMocks.files.insertOne.mockResolvedValueOnce({ insertedId });

    const res = await postWithAuth(url, {
      document: { originalName: 'test.pdf', status: 'pending' },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.insertedId).toBe(insertedId.toString());
    expect(collectionMocks.files.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ originalName: 'test.pdf', status: 'pending' })
    );
  });

  test('정상: document 내 customerId 문자열 → ObjectId로 자동 변환', async () => {
    const insertedId = new ObjectId();
    collectionMocks.files.insertOne.mockResolvedValueOnce({ insertedId });
    const customerIdStr = MOCK_CUSTOMER_ID.toString();

    const res = await postWithAuth(url, {
      document: { originalName: 'test.pdf', customerId: customerIdStr },
    });

    expect(res.status).toBe(200);
    // insertOne에 전달된 document의 customerId가 ObjectId로 변환되었는지 확인
    const passedDoc = collectionMocks.files.insertOne.mock.calls[0][0];
    expect(typeof passedDoc.customerId).not.toBe('string');
    expect(passedDoc.customerId.toString()).toBe(customerIdStr);
  });

  test('오류: document 누락 → 400', async () => {
    const res = await postWithAuth(url, {});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/document/);
  });

  test('오류: document가 객체가 아님 → 400', async () => {
    const res = await postWithAuth(url, { document: 'not-an-object' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/document/);
  });
});

// ==================== #28. PATCH /internal/files/:id — 범용 파일 업데이트 ====================

describe('PATCH /api/internal/files/:id — 범용 파일 업데이트', () => {
  const url = `/api/internal/files/${MOCK_FILE_ID}`;

  test('정상: $set만 → 200, modifiedCount=1', async () => {
    collectionMocks.files.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await patchWithAuth(url, {
      $set: { status: 'completed', originalName: 'updated.pdf' },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.modifiedCount).toBe(1);
    expect(collectionMocks.files.updateOne).toHaveBeenCalledWith(
      { _id: new ObjectId(MOCK_FILE_ID) },
      { $set: { status: 'completed', originalName: 'updated.pdf' } }
    );
  });

  test('정상: $set + $unset → 200', async () => {
    collectionMocks.files.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await patchWithAuth(url, {
      $set: { status: 'completed' },
      $unset: { tempField: '' },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(collectionMocks.files.updateOne).toHaveBeenCalledWith(
      { _id: new ObjectId(MOCK_FILE_ID) },
      {
        $set: { status: 'completed' },
        $unset: { tempField: '' },
      }
    );
  });

  test('정상: $addToSet tags → 200', async () => {
    collectionMocks.files.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await patchWithAuth(url, {
      $addToSet: { tags: 'important' },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(collectionMocks.files.updateOne).toHaveBeenCalledWith(
      { _id: new ObjectId(MOCK_FILE_ID) },
      { $addToSet: { tags: 'important' } }
    );
  });

  test('정상: $currentDate → 200', async () => {
    collectionMocks.files.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await patchWithAuth(url, {
      $currentDate: { updatedAt: true },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(collectionMocks.files.updateOne).toHaveBeenCalledWith(
      { _id: new ObjectId(MOCK_FILE_ID) },
      { $currentDate: { updatedAt: true } }
    );
  });

  test('보안: $set 내 _id 필드가 제거됨 확인', async () => {
    collectionMocks.files.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await patchWithAuth(url, {
      $set: { _id: 'hacked_id', status: 'completed' },
    });

    expect(res.status).toBe(200);
    const updateCall = collectionMocks.files.updateOne.mock.calls[0];
    const $set = updateCall[1].$set;
    expect($set).not.toHaveProperty('_id');
    expect($set).toHaveProperty('status', 'completed');
  });

  test('보안: $set 내 customerId 문자열 → ObjectId 변환 확인', async () => {
    collectionMocks.files.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });
    const customerIdStr = MOCK_CUSTOMER_ID.toString();

    const res = await patchWithAuth(url, {
      $set: { customerId: customerIdStr },
    });

    expect(res.status).toBe(200);
    const updateCall = collectionMocks.files.updateOne.mock.calls[0];
    const $set = updateCall[1].$set;
    expect(typeof $set.customerId).not.toBe('string');
    expect($set.customerId.toString()).toBe(customerIdStr);
  });

  test('보안: 허용되지 않은 연산자($rename 등)가 무시됨 확인', async () => {
    collectionMocks.files.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await patchWithAuth(url, {
      $set: { status: 'completed' },
      $rename: { oldField: 'newField' },
    });

    expect(res.status).toBe(200);
    const updateCall = collectionMocks.files.updateOne.mock.calls[0];
    const updateOp = updateCall[1];
    expect(updateOp).toHaveProperty('$set');
    expect(updateOp).not.toHaveProperty('$rename');
  });

  test('오류: 빈 body → 400', async () => {
    const res = await patchWithAuth(url, {});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/업데이트/);
  });

  test('오류: 유효하지 않은 file ID → 400', async () => {
    const res = await patchWithAuth('/api/internal/files/invalid-id', {
      $set: { status: 'completed' },
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/유효하지 않은/);
  });
});

// ==================== #29. DELETE /internal/files/by-filter — 필터 기반 삭제 ====================

describe('DELETE /api/internal/files/by-filter — 필터 기반 파일 삭제', () => {
  const url = '/api/internal/files/by-filter';

  test('정상: 필수 필드 모두 전달 → 200, deletedCount', async () => {
    collectionMocks.files.deleteOne.mockResolvedValueOnce({ deletedCount: 1 });
    const excludeId = new ObjectId();

    const res = await deleteWithAuth(url, {
      ownerId: 'kakao_12345',
      file_hash: 'abc123hash',
      excludeId: excludeId.toString(),
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deletedCount).toBe(1);
    expect(collectionMocks.files.deleteOne).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'kakao_12345',
        customerId: null,
        'meta.file_hash': 'abc123hash',
        _id: { $ne: new ObjectId(excludeId) },
      })
    );
  });

  test('정상: maxStatus 전달 → filter에 status.$ne 포함 확인', async () => {
    collectionMocks.files.deleteOne.mockResolvedValueOnce({ deletedCount: 1 });
    const excludeId = new ObjectId();

    const res = await deleteWithAuth(url, {
      ownerId: 'kakao_12345',
      file_hash: 'abc123hash',
      excludeId: excludeId.toString(),
      maxStatus: 'completed',
    });

    expect(res.status).toBe(200);
    const filterArg = collectionMocks.files.deleteOne.mock.calls[0][0];
    expect(filterArg.status).toEqual({ $ne: 'completed' });
  });

  test('정상: createdBefore 전달 → filter에 createdAt.$lt 포함 확인', async () => {
    collectionMocks.files.deleteOne.mockResolvedValueOnce({ deletedCount: 1 });
    const excludeId = new ObjectId();
    const beforeDate = '2026-01-01T00:00:00Z';

    const res = await deleteWithAuth(url, {
      ownerId: 'kakao_12345',
      file_hash: 'abc123hash',
      excludeId: excludeId.toString(),
      createdBefore: beforeDate,
    });

    expect(res.status).toBe(200);
    const filterArg = collectionMocks.files.deleteOne.mock.calls[0][0];
    expect(filterArg.createdAt).toEqual({ $lt: new Date(beforeDate) });
  });

  test('오류: ownerId 누락 → 400', async () => {
    const res = await deleteWithAuth(url, {
      file_hash: 'abc123hash',
      excludeId: new ObjectId().toString(),
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/ownerId/);
  });

  test('오류: file_hash 누락 → 400', async () => {
    const res = await deleteWithAuth(url, {
      ownerId: 'kakao_12345',
      excludeId: new ObjectId().toString(),
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/file_hash/);
  });

  test('오류: excludeId 누락 → 400', async () => {
    const res = await deleteWithAuth(url, {
      ownerId: 'kakao_12345',
      file_hash: 'abc123hash',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/excludeId/);
  });
});

// ==================== #30. DELETE /internal/files/:id — 파일 삭제 ====================

describe('DELETE /api/internal/files/:id — 파일 삭제', () => {
  test('정상: 삭제 → 200, deletedCount=1', async () => {
    collectionMocks.files.deleteOne.mockResolvedValueOnce({ deletedCount: 1 });

    const res = await deleteWithAuth(`/api/internal/files/${MOCK_FILE_ID}`, {});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deletedCount).toBe(1);
    expect(collectionMocks.files.deleteOne).toHaveBeenCalledWith(
      { _id: new ObjectId(MOCK_FILE_ID) }
    );
  });

  test('오류: 유효하지 않은 ID → 400', async () => {
    const res = await deleteWithAuth('/api/internal/files/invalid-id', {});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/유효하지 않은/);
  });
});

// ==================== #31. PATCH /internal/customers/:id/pull-document — 고객 문서 연결 제거 ====================

describe('PATCH /api/internal/customers/:id/pull-document — 고객 문서 연결 제거', () => {
  const url = `/api/internal/customers/${MOCK_CUSTOMER_ID}/pull-document`;

  test('정상: document_id 전달 → 200, modifiedCount=1, $pull 호출 확인', async () => {
    collectionMocks.customers.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });
    const docId = new ObjectId();

    const res = await patchWithAuth(url, {
      document_id: docId.toString(),
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.modifiedCount).toBe(1);
    expect(collectionMocks.customers.updateOne).toHaveBeenCalledWith(
      { _id: new ObjectId(MOCK_CUSTOMER_ID) },
      { $pull: { documents: { document_id: new ObjectId(docId) } } }
    );
  });

  test('오류: document_id 누락 → 400', async () => {
    const res = await patchWithAuth(url, {});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/document_id/);
  });

  test('오류: 유효하지 않은 customer ID → 400', async () => {
    const res = await patchWithAuth('/api/internal/customers/invalid-id/pull-document', {
      document_id: new ObjectId().toString(),
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/유효하지 않은/);
  });

  test('오류: 유효하지 않은 document_id → 400', async () => {
    const res = await patchWithAuth(url, {
      document_id: 'invalid-doc-id',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/document_id/);
  });
});
