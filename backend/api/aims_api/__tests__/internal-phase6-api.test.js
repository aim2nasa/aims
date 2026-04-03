/**
 * internal-phase6-api.test.js
 * Phase 6 Internal API regression 테스트 (엔드포인트 #32~#40)
 *
 * customers/memos/relationships read 전환 엔드포인트 9건에 대한 검증
 * - 고객 단건 조회, 범용 검색, 건수, 집계
 * - 메모 단건 조회, 검색, 건수
 * - 관계 단건 조회, 검색
 * - convertObjectIdFields: $nin/$ne 변환 + 신규 OBJECTID_FIELDS 검증
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
const MOCK_CUSTOMER_ID = new ObjectId();
const MOCK_MEMO_ID = new ObjectId();
const MOCK_RELATIONSHIP_ID = new ObjectId();

// ==================== Mock DB 구성 ====================

/** find 체이닝 mock 생성 헬퍼 */
function makeFindChain(toArrayResult = []) {
  return {
    project: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    toArray: jest.fn().mockResolvedValue(toArrayResult),
  };
}

const collectionMocks = {
  customers: {
    findOne: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
    insertOne: jest.fn(),
    updateOne: jest.fn(),
  },
  files: {
    find: jest.fn(),
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
    updateOne: jest.fn(),
  },
  customer_memos: {
    findOne: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    insertOne: jest.fn(),
    updateOne: jest.fn(),
    deleteOne: jest.fn(),
  },
  customer_relationships: {
    findOne: jest.fn(),
    find: jest.fn(),
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

  // 컬렉션별 mock 반환값 초기화
  Object.values(collectionMocks).forEach(col => {
    Object.values(col).forEach(fn => {
      if (typeof fn?.mockReset === 'function') {
        fn.mockReset();
      }
    });
  });
});

// ==================== 헬퍼 함수 ====================

/** 인증 헤더 포함 GET */
function getWithAuth(url) {
  return request(app)
    .get(url)
    .set('x-api-key', API_KEY);
}

/** 인증 헤더 포함 POST */
function postWithAuth(url, body) {
  return request(app)
    .post(url)
    .set('x-api-key', API_KEY)
    .send(body);
}

// ==================== #32. GET /internal/customers/:id ====================

describe('GET /api/internal/customers/:id -- 고객 단건 조회', () => {
  test('정상: 고객 조회 성공', async () => {
    const mockCustomer = {
      _id: MOCK_CUSTOMER_ID,
      name: '홍길동',
      user_id: 'kakao_12345',
    };
    collectionMocks.customers.findOne.mockResolvedValueOnce(mockCustomer);

    const res = await getWithAuth(`/api/internal/customers/${MOCK_CUSTOMER_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBe(MOCK_CUSTOMER_ID.toString());
    expect(res.body.data.name).toBe('홍길동');
  });

  test('오류: 고객 없음 -> 404', async () => {
    collectionMocks.customers.findOne.mockResolvedValueOnce(null);

    const res = await getWithAuth(`/api/internal/customers/${new ObjectId()}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/찾을 수 없/);
  });

  test('오류: 잘못된 ID -> 400', async () => {
    const res = await getWithAuth('/api/internal/customers/invalid-id');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/유효하지 않은/);
  });
});

// ==================== #33. POST /internal/customers/query ====================

describe('POST /api/internal/customers/query -- 고객 범용 검색', () => {
  test('정상: 기본 검색', async () => {
    const chain = makeFindChain([
      { _id: MOCK_CUSTOMER_ID, name: '홍길동' },
    ]);
    collectionMocks.customers.find.mockReturnValueOnce(chain);

    const res = await postWithAuth('/api/internal/customers/query', {
      filter: { user_id: 'kakao_12345' },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]._id).toBe(MOCK_CUSTOMER_ID.toString());
  });

  test('ObjectId 변환: customer_id 문자열 -> ObjectId', async () => {
    const chain = makeFindChain([]);
    collectionMocks.customers.find.mockReturnValueOnce(chain);

    await postWithAuth('/api/internal/customers/query', {
      filter: { customer_id: MOCK_CUSTOMER_ID.toString() },
    });

    // 문자열이 ObjectId로 변환되었는지 확인 (모듈 인스턴스 차이로 toBeInstanceOf 불가)
    const findCall = collectionMocks.customers.find.mock.calls[0][0];
    expect(typeof findCall.customer_id).not.toBe('string');
    expect(findCall.customer_id.toString()).toBe(MOCK_CUSTOMER_ID.toString());
  });

  test('ObjectId 변환: $nin 내 문자열 -> ObjectId', async () => {
    const id1 = new ObjectId();
    const id2 = new ObjectId();
    const chain = makeFindChain([]);
    collectionMocks.customers.find.mockReturnValueOnce(chain);

    await postWithAuth('/api/internal/customers/query', {
      filter: { _id: { $nin: [id1.toString(), id2.toString()] } },
    });

    const findCall = collectionMocks.customers.find.mock.calls[0][0];
    expect(typeof findCall._id.$nin[0]).not.toBe('string');
    expect(typeof findCall._id.$nin[1]).not.toBe('string');
    expect(findCall._id.$nin[0].toString()).toBe(id1.toString());
    expect(findCall._id.$nin[1].toString()).toBe(id2.toString());
  });

  test('ObjectId 변환: $ne 문자열 -> ObjectId', async () => {
    const excludeId = new ObjectId();
    const chain = makeFindChain([]);
    collectionMocks.customers.find.mockReturnValueOnce(chain);

    await postWithAuth('/api/internal/customers/query', {
      filter: { _id: { $ne: excludeId.toString() } },
    });

    const findCall = collectionMocks.customers.find.mock.calls[0][0];
    expect(typeof findCall._id.$ne).not.toBe('string');
    expect(findCall._id.$ne.toString()).toBe(excludeId.toString());
  });

  test('projection, sort, skip, limit 전달 확인', async () => {
    const chain = makeFindChain([]);
    collectionMocks.customers.find.mockReturnValueOnce(chain);

    await postWithAuth('/api/internal/customers/query', {
      filter: {},
      projection: { name: 1 },
      sort: { name: 1 },
      skip: 10,
      limit: 50,
    });

    expect(chain.project).toHaveBeenCalledWith({ name: 1 });
    expect(chain.sort).toHaveBeenCalledWith({ name: 1 });
    expect(chain.skip).toHaveBeenCalledWith(10);
    expect(chain.limit).toHaveBeenCalledWith(50);
  });

  test('보안: 위험한 연산자 차단', async () => {
    const res = await postWithAuth('/api/internal/customers/query', {
      filter: { $where: 'this.name === "test"' },
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/허용되지 않는 연산자/);
  });
});

// ==================== #34. POST /internal/customers/count ====================

describe('POST /api/internal/customers/count -- 고객 건수 조회', () => {
  test('정상: 건수 반환', async () => {
    collectionMocks.customers.countDocuments.mockResolvedValueOnce(42);

    const res = await postWithAuth('/api/internal/customers/count', {
      filter: { user_id: 'kakao_12345' },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.count).toBe(42);
  });

  test('빈 필터: 전체 건수', async () => {
    collectionMocks.customers.countDocuments.mockResolvedValueOnce(100);

    const res = await postWithAuth('/api/internal/customers/count', {});

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(100);
  });
});

// ==================== #35. POST /internal/customers/aggregate ====================

describe('POST /api/internal/customers/aggregate -- 고객 집계', () => {
  test('정상: 집계 파이프라인 실행', async () => {
    const aggResult = [{ _id: 'kakao_12345', count: 5 }];
    collectionMocks.customers.aggregate.mockReturnValueOnce({
      toArray: jest.fn().mockResolvedValue(aggResult),
    });

    const res = await postWithAuth('/api/internal/customers/aggregate', {
      pipeline: [
        { $group: { _id: '$user_id', count: { $sum: 1 } } },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(aggResult);
  });

  test('오류: pipeline 누락 -> 400', async () => {
    const res = await postWithAuth('/api/internal/customers/aggregate', {});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pipeline/);
  });

  test('오류: pipeline이 배열 아님 -> 400', async () => {
    const res = await postWithAuth('/api/internal/customers/aggregate', {
      pipeline: 'not-an-array',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pipeline/);
  });

  test('오류: 스테이지 10개 초과 -> 400', async () => {
    const pipeline = Array(11).fill({ $match: {} });

    const res = await postWithAuth('/api/internal/customers/aggregate', { pipeline });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/스테이지/);
  });

  test('보안: $out 차단', async () => {
    const res = await postWithAuth('/api/internal/customers/aggregate', {
      pipeline: [{ $out: 'hacked_collection' }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/쓰기 연산자/);
  });

  test('보안: $merge 차단', async () => {
    const res = await postWithAuth('/api/internal/customers/aggregate', {
      pipeline: [{ $merge: { into: 'target' } }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/쓰기 연산자/);
  });

  test('$match 내 ObjectId 변환', async () => {
    collectionMocks.customers.aggregate.mockReturnValueOnce({
      toArray: jest.fn().mockResolvedValue([]),
    });

    await postWithAuth('/api/internal/customers/aggregate', {
      pipeline: [
        { $match: { _id: MOCK_CUSTOMER_ID.toString() } },
      ],
    });

    const aggCall = collectionMocks.customers.aggregate.mock.calls[0][0];
    expect(typeof aggCall[0].$match._id).not.toBe('string');
    expect(aggCall[0].$match._id.toString()).toBe(MOCK_CUSTOMER_ID.toString());
  });
});

// ==================== #36. GET /internal/memos/:id ====================

describe('GET /api/internal/memos/:id -- 메모 단건 조회', () => {
  test('정상: 메모 조회 성공', async () => {
    const mockMemo = {
      _id: MOCK_MEMO_ID,
      customer_id: MOCK_CUSTOMER_ID,
      content: '테스트 메모',
    };
    collectionMocks.customer_memos.findOne.mockResolvedValueOnce(mockMemo);

    const res = await getWithAuth(`/api/internal/memos/${MOCK_MEMO_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBe(MOCK_MEMO_ID.toString());
    expect(res.body.data.customer_id).toBe(MOCK_CUSTOMER_ID.toString());
    expect(res.body.data.content).toBe('테스트 메모');
  });

  test('오류: 메모 없음 -> 404', async () => {
    collectionMocks.customer_memos.findOne.mockResolvedValueOnce(null);

    const res = await getWithAuth(`/api/internal/memos/${new ObjectId()}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/찾을 수 없/);
  });

  test('오류: 잘못된 ID -> 400', async () => {
    const res = await getWithAuth('/api/internal/memos/invalid-id');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/유효하지 않은/);
  });
});

// ==================== #37. POST /internal/memos/query ====================

describe('POST /api/internal/memos/query -- 메모 검색', () => {
  test('정상: 기본 검색', async () => {
    const chain = makeFindChain([
      { _id: MOCK_MEMO_ID, customer_id: MOCK_CUSTOMER_ID, content: '메모1' },
    ]);
    collectionMocks.customer_memos.find.mockReturnValueOnce(chain);

    const res = await postWithAuth('/api/internal/memos/query', {
      filter: { customer_id: MOCK_CUSTOMER_ID.toString() },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    // _id, customer_id가 문자열로 직렬화됨
    expect(res.body.data[0]._id).toBe(MOCK_MEMO_ID.toString());
    expect(res.body.data[0].customer_id).toBe(MOCK_CUSTOMER_ID.toString());
  });

  test('ObjectId 변환: customer_id 문자열 -> ObjectId', async () => {
    const chain = makeFindChain([]);
    collectionMocks.customer_memos.find.mockReturnValueOnce(chain);

    await postWithAuth('/api/internal/memos/query', {
      filter: { customer_id: MOCK_CUSTOMER_ID.toString() },
    });

    const findCall = collectionMocks.customer_memos.find.mock.calls[0][0];
    expect(typeof findCall.customer_id).not.toBe('string');
    expect(findCall.customer_id.toString()).toBe(MOCK_CUSTOMER_ID.toString());
  });

  test('ObjectId 변환: _id $in 배열 -> ObjectId 배열', async () => {
    const id1 = new ObjectId();
    const id2 = new ObjectId();
    const chain = makeFindChain([]);
    collectionMocks.customer_memos.find.mockReturnValueOnce(chain);

    await postWithAuth('/api/internal/memos/query', {
      filter: { _id: { $in: [id1.toString(), id2.toString()] } },
    });

    const findCall = collectionMocks.customer_memos.find.mock.calls[0][0];
    expect(typeof findCall._id.$in[0]).not.toBe('string');
    expect(typeof findCall._id.$in[1]).not.toBe('string');
  });
});

// ==================== #38. POST /internal/memos/count ====================

describe('POST /api/internal/memos/count -- 메모 건수 조회', () => {
  test('정상: 건수 반환', async () => {
    collectionMocks.customer_memos.countDocuments.mockResolvedValueOnce(7);

    const res = await postWithAuth('/api/internal/memos/count', {
      filter: { customer_id: MOCK_CUSTOMER_ID.toString() },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.count).toBe(7);
  });

  test('ObjectId 변환 적용 확인', async () => {
    collectionMocks.customer_memos.countDocuments.mockResolvedValueOnce(0);

    await postWithAuth('/api/internal/memos/count', {
      filter: { customer_id: MOCK_CUSTOMER_ID.toString() },
    });

    const filterArg = collectionMocks.customer_memos.countDocuments.mock.calls[0][0];
    expect(typeof filterArg.customer_id).not.toBe('string');
    expect(filterArg.customer_id.toString()).toBe(MOCK_CUSTOMER_ID.toString());
  });
});

// ==================== #39. GET /internal/relationships/:id ====================

describe('GET /api/internal/relationships/:id -- 관계 단건 조회', () => {
  test('정상: 관계 조회 성공 (relationship_info 직렬화 포함)', async () => {
    const fromId = new ObjectId();
    const toId = new ObjectId();
    const mockRel = {
      _id: MOCK_RELATIONSHIP_ID,
      relationship_info: {
        from_customer_id: fromId,
        to_customer_id: toId,
        type: 'spouse',
      },
    };
    collectionMocks.customer_relationships.findOne.mockResolvedValueOnce(mockRel);

    const res = await getWithAuth(`/api/internal/relationships/${MOCK_RELATIONSHIP_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBe(MOCK_RELATIONSHIP_ID.toString());
    expect(res.body.data.relationship_info.from_customer_id).toBe(fromId.toString());
    expect(res.body.data.relationship_info.to_customer_id).toBe(toId.toString());
    expect(res.body.data.relationship_info.type).toBe('spouse');
  });

  test('오류: 관계 없음 -> 404', async () => {
    collectionMocks.customer_relationships.findOne.mockResolvedValueOnce(null);

    const res = await getWithAuth(`/api/internal/relationships/${new ObjectId()}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/찾을 수 없/);
  });

  test('오류: 잘못된 ID -> 400', async () => {
    const res = await getWithAuth('/api/internal/relationships/invalid-id');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/유효하지 않은/);
  });
});

// ==================== #40. POST /internal/relationships/query ====================

describe('POST /api/internal/relationships/query -- 관계 검색', () => {
  test('정상: 기본 검색 (relationship_info 직렬화)', async () => {
    const fromId = new ObjectId();
    const toId = new ObjectId();
    const chain = makeFindChain([
      {
        _id: MOCK_RELATIONSHIP_ID,
        relationship_info: {
          from_customer_id: fromId,
          to_customer_id: toId,
          type: 'friend',
        },
      },
    ]);
    collectionMocks.customer_relationships.find.mockReturnValueOnce(chain);

    const res = await postWithAuth('/api/internal/relationships/query', {
      filter: { 'relationship_info.from_customer_id': fromId.toString() },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]._id).toBe(MOCK_RELATIONSHIP_ID.toString());
    expect(res.body.data[0].relationship_info.from_customer_id).toBe(fromId.toString());
    expect(res.body.data[0].relationship_info.to_customer_id).toBe(toId.toString());
  });

  test('ObjectId 변환: relationship_info.from_customer_id -> ObjectId', async () => {
    const chain = makeFindChain([]);
    collectionMocks.customer_relationships.find.mockReturnValueOnce(chain);

    await postWithAuth('/api/internal/relationships/query', {
      filter: { 'relationship_info.from_customer_id': MOCK_CUSTOMER_ID.toString() },
    });

    const findCall = collectionMocks.customer_relationships.find.mock.calls[0][0];
    expect(typeof findCall['relationship_info.from_customer_id']).not.toBe('string');
    expect(findCall['relationship_info.from_customer_id'].toString()).toBe(MOCK_CUSTOMER_ID.toString());
  });

  test('ObjectId 변환: relationship_info.to_customer_id -> ObjectId', async () => {
    const chain = makeFindChain([]);
    collectionMocks.customer_relationships.find.mockReturnValueOnce(chain);

    await postWithAuth('/api/internal/relationships/query', {
      filter: { 'relationship_info.to_customer_id': MOCK_CUSTOMER_ID.toString() },
    });

    const findCall = collectionMocks.customer_relationships.find.mock.calls[0][0];
    expect(typeof findCall['relationship_info.to_customer_id']).not.toBe('string');
    expect(findCall['relationship_info.to_customer_id'].toString()).toBe(MOCK_CUSTOMER_ID.toString());
  });

  test('보안: 위험한 연산자 차단', async () => {
    const res = await postWithAuth('/api/internal/relationships/query', {
      filter: { $where: 'true' },
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/허용되지 않는 연산자/);
  });
});

// ==================== convertObjectIdFields: $nin/$ne 변환 (files/query 경유) ====================

describe('convertObjectIdFields -- $nin/$ne 변환 (files/query 경유)', () => {
  test('$nin 내 문자열이 ObjectId로 변환됨', async () => {
    const id1 = new ObjectId();
    const id2 = new ObjectId();
    const chain = makeFindChain([]);
    collectionMocks.files.find.mockReturnValueOnce(chain);

    await postWithAuth('/api/internal/files/query', {
      filter: { _id: { $nin: [id1.toString(), id2.toString()] } },
    });

    const findCall = collectionMocks.files.find.mock.calls[0][0];
    expect(typeof findCall._id.$nin[0]).not.toBe('string');
    expect(typeof findCall._id.$nin[1]).not.toBe('string');
    expect(findCall._id.$nin[0].toString()).toBe(id1.toString());
    expect(findCall._id.$nin[1].toString()).toBe(id2.toString());
  });

  test('$ne 문자열이 ObjectId로 변환됨', async () => {
    const excludeId = new ObjectId();
    const chain = makeFindChain([]);
    collectionMocks.files.find.mockReturnValueOnce(chain);

    await postWithAuth('/api/internal/files/query', {
      filter: { _id: { $ne: excludeId.toString() } },
    });

    const findCall = collectionMocks.files.find.mock.calls[0][0];
    expect(typeof findCall._id.$ne).not.toBe('string');
    expect(findCall._id.$ne.toString()).toBe(excludeId.toString());
  });

  test('$or 내부 ObjectId 변환', async () => {
    const id1 = new ObjectId();
    const id2 = new ObjectId();
    const chain = makeFindChain([]);
    collectionMocks.files.find.mockReturnValueOnce(chain);

    await postWithAuth('/api/internal/files/query', {
      filter: {
        $or: [
          { _id: id1.toString() },
          { _id: id2.toString() },
        ],
      },
    });

    const findCall = collectionMocks.files.find.mock.calls[0][0];
    expect(typeof findCall.$or[0]._id).not.toBe('string');
    expect(typeof findCall.$or[1]._id).not.toBe('string');
    expect(findCall.$or[0]._id.toString()).toBe(id1.toString());
    expect(findCall.$or[1]._id.toString()).toBe(id2.toString());
  });
});
