/**
 * 마이그레이션 스크립트 단위 테스트 (#55)
 *
 * 검증 대상: backend/scripts/migrate_date_fields_v1.js
 *
 * AC 매핑:
 *   - AC#5: 마이그레이션 후 string 0건
 *
 * 테스트 전략:
 *   - 격리된 테스트 컬렉션 사용 (`files_test_55`, `customers_test_55`)
 *   - 샘플 string 날짜 데이터 삽입
 *   - 마이그레이션 함수 호출
 *   - 모든 string이 Date로 변환됐는지 확인
 *   - 의도적 string 필드 (upload.uploaded_at, docembed.updated_at)는 그대로인지 확인
 */

const { MongoClient } = require('mongodb');
const { migrateFileDates, migrateCustomerDates } = require('../../../../scripts/migrate_date_fields_v1');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const TEST_DB = 'docupload_test_55';

let client;
let db;

beforeAll(async () => {
  client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(TEST_DB);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  await db.collection('files').deleteMany({});
  await db.collection('customers').deleteMany({});
});

describe('migrateFileDates', () => {
  test('files.createdAt string → ISODate 변환', async () => {
    await db.collection('files').insertMany([
      { _id: 'f1', createdAt: '2026-04-07T01:23:10.919750', ownerId: 'u1' },
      { _id: 'f2', createdAt: '2026-04-08T02:00:00.000000', ownerId: 'u1' },
      { _id: 'f3', createdAt: new Date('2026-03-31T09:20:51.137Z'), ownerId: 'u1' }, // 정상
    ]);

    const result = await migrateFileDates(db);

    expect(result.createdAt.converted).toBe(2);
    expect(result.createdAt.skipped).toBe(1);

    const f1 = await db.collection('files').findOne({ _id: 'f1' });
    const f2 = await db.collection('files').findOne({ _id: 'f2' });
    const f3 = await db.collection('files').findOne({ _id: 'f3' });

    expect(f1.createdAt).toBeInstanceOf(Date);
    expect(f2.createdAt).toBeInstanceOf(Date);
    expect(f3.createdAt).toBeInstanceOf(Date);

    // string 0건 검증
    const remaining = await db.collection('files').countDocuments({ createdAt: { $type: 'string' } });
    expect(remaining).toBe(0);
  });

  test('files.overallStatusUpdatedAt string → ISODate 변환', async () => {
    await db.collection('files').insertMany([
      { _id: 'f1', overallStatusUpdatedAt: '2026-04-07T01:23:10.919750' },
      { _id: 'f2', overallStatusUpdatedAt: '2026-04-08T02:00:00.000000' },
    ]);

    await migrateFileDates(db);

    const remaining = await db.collection('files').countDocuments({
      overallStatusUpdatedAt: { $type: 'string' },
    });
    expect(remaining).toBe(0);
  });

  test('files.upload.converted_at string → ISODate 변환 (중첩 필드)', async () => {
    await db.collection('files').insertMany([
      { _id: 'f1', upload: { converted_at: '2026-04-07T01:23:10.919750', originalName: 'a.pdf' } },
    ]);

    await migrateFileDates(db);

    const f1 = await db.collection('files').findOne({ _id: 'f1' });
    expect(f1.upload.converted_at).toBeInstanceOf(Date);
    expect(f1.upload.originalName).toBe('a.pdf');
  });

  test('upload.uploaded_at은 변환 안 함 (의도적 string)', async () => {
    await db.collection('files').insertOne({
      _id: 'f1',
      upload: { uploaded_at: '2026-04-07T01:23:10.919750', originalName: 'a.pdf' },
    });

    await migrateFileDates(db);

    const f1 = await db.collection('files').findOne({ _id: 'f1' });
    expect(typeof f1.upload.uploaded_at).toBe('string');
  });

  test('docembed.updated_at은 변환 안 함 (의도적 string)', async () => {
    await db.collection('files').insertOne({
      _id: 'f1',
      docembed: { updated_at: '2026-04-07T01:23:10.919750', status: 'done' },
    });

    await migrateFileDates(db);

    const f1 = await db.collection('files').findOne({ _id: 'f1' });
    expect(typeof f1.docembed.updated_at).toBe('string');
  });

  test('Python isoformat 마이크로초 정확히 파싱', async () => {
    await db.collection('files').insertOne({
      _id: 'f1',
      createdAt: '2026-04-07T01:23:10.919750',
    });

    await migrateFileDates(db);

    const f1 = await db.collection('files').findOne({ _id: 'f1' });
    // Date는 밀리초까지만 → 919750 → 919
    expect(f1.createdAt.toISOString()).toBe('2026-04-07T01:23:10.919Z');
  });
});

describe('migrateCustomerDates', () => {
  test('customers.meta.updated_at string → ISODate 변환', async () => {
    await db.collection('customers').insertMany([
      {
        _id: 'c1',
        meta: { updated_at: '2026-04-07T01:23:10.919Z', created_at: new Date() },
      },
      {
        _id: 'c2',
        meta: { updated_at: new Date(), created_at: new Date() }, // 정상
      },
    ]);

    const result = await migrateCustomerDates(db);

    expect(result['meta.updated_at'].converted).toBe(1);

    const c1 = await db.collection('customers').findOne({ _id: 'c1' });
    expect(c1.meta.updated_at).toBeInstanceOf(Date);

    const remaining = await db.collection('customers').countDocuments({
      'meta.updated_at': { $type: 'string' },
    });
    expect(remaining).toBe(0);
  });
});

describe('idempotency (재실행 안전)', () => {
  test('마이그레이션 2회 실행해도 데이터 동일', async () => {
    await db.collection('files').insertOne({
      _id: 'f1',
      createdAt: '2026-04-07T01:23:10.919750',
    });

    await migrateFileDates(db);
    const f1AfterFirst = await db.collection('files').findOne({ _id: 'f1' });

    // 2회차 — 이미 Date인 데이터에 영향 없어야
    const result = await migrateFileDates(db);
    expect(result.createdAt.converted).toBe(0);

    const f1AfterSecond = await db.collection('files').findOne({ _id: 'f1' });
    expect(f1AfterSecond.createdAt.toISOString()).toBe(f1AfterFirst.createdAt.toISOString());
  });
});
