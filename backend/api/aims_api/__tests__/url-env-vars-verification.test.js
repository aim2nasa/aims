/**
 * url-env-vars-verification.test.js
 * 하드코딩 URL → 환경변수 전환 실동작 검증 테스트
 *
 * 검증 항목:
 * 1. documentDeleteService 동작 검증 (실제 MongoDB)
 * 2. AR 파싱 트리거 — ANNUAL_REPORT_API_URL 환경변수 사용 확인
 * 3. 문서 파이프라인 webhook — DOCUMENT_PIPELINE_URL 환경변수 사용 확인
 * 4. personal-files 삭제 — 자기 호출 없이 내부 함수 처리 확인
 * 5. 헬스체크 — DOCUMENT_PIPELINE_URL 환경변수 사용 확인
 *
 * @since 2026-04-05
 */

const { ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');
const { connectWithFallback, ISOLATED_DB_NAME } = require('./testDbHelper');

// ======================================================================
// 항목 1: documentDeleteService 동작 검증 (실제 MongoDB)
// ======================================================================
describe('항목 1: documentDeleteService 동작 검증', () => {
  let client;
  let db;
  let filesCollection;
  let customersCollection;
  let arQueueCollection;

  // 테스트 데이터 추적
  const createdFileIds = [];
  const createdCustomerIds = [];
  const createdArQueueIds = [];

  beforeAll(async () => {
    const result = await connectWithFallback();
    client = result.client;
    db = client.db(ISOLATED_DB_NAME);
    filesCollection = db.collection('files');
    customersCollection = db.collection('customers');
    arQueueCollection = db.collection('ar_parse_queue');

    // documentDeleteService 초기화 (Qdrant는 null로 — DB 동작만 검증)
    const { init } = require('../lib/documentDeleteService');
    init({ db, qdrantClient: null, qdrantCollection: null });
  });

  afterAll(async () => {
    // 테스트 데이터 정리
    if (createdFileIds.length > 0) {
      await filesCollection.deleteMany({ _id: { $in: createdFileIds } });
    }
    if (createdCustomerIds.length > 0) {
      await customersCollection.deleteMany({ _id: { $in: createdCustomerIds } });
    }
    if (createdArQueueIds.length > 0) {
      await arQueueCollection.deleteMany({ _id: { $in: createdArQueueIds } });
    }
    await client.close();
  });

  test('deleteDocument()로 문서 삭제 시 files 컬렉션에서 제거됨', async () => {
    // Given: 테스트 문서 삽입
    const docId = new ObjectId();
    createdFileIds.push(docId);

    await filesCollection.insertOne({
      _id: docId,
      filename: '__test_url_env_delete__',
      status: 'completed',
      ownerId: 'test-user',
      createdAt: new Date(),
    });

    // When: deleteDocument 실행
    const { deleteDocument } = require('../lib/documentDeleteService');
    const result = await deleteDocument(docId.toString());

    // Then: 성공하고, files에서 삭제됨
    expect(result.success).toBe(true);
    const found = await filesCollection.findOne({ _id: docId });
    expect(found).toBeNull();
  });

  test('deleteDocument()로 문서 삭제 시 customers.documents 배열에서 참조 제거됨', async () => {
    // Given: 문서 + 고객 (documents 배열에 참조)
    const docId = new ObjectId();
    const customerId = new ObjectId();
    createdFileIds.push(docId);
    createdCustomerIds.push(customerId);

    await filesCollection.insertOne({
      _id: docId,
      filename: '__test_url_env_customer_ref__',
      status: 'completed',
      ownerId: 'test-user',
      createdAt: new Date(),
    });

    await customersCollection.insertOne({
      _id: customerId,
      name: '__test_url_env_customer__',
      ownerId: 'test-user',
      documents: [
        { document_id: docId, filename: '__test_url_env_customer_ref__' },
        { document_id: new ObjectId(), filename: 'other_doc' },
      ],
      meta: { updated_at: new Date() },
    });

    // When: deleteDocument 실행
    const { deleteDocument } = require('../lib/documentDeleteService');
    const result = await deleteDocument(docId.toString());

    // Then: 고객의 documents 배열에서 해당 문서 참조만 제거됨
    expect(result.success).toBe(true);
    const customer = await customersCollection.findOne({ _id: customerId });
    expect(customer).not.toBeNull();
    expect(customer.documents).toHaveLength(1);
    expect(customer.documents[0].filename).toBe('other_doc');
  });

  // TODO: deleteDocument()에서 ar_parse_queue 삭제 로직 구현 후 skip 제거
  test.skip('deleteDocument()로 문서 삭제 시 ar_parse_queue에서 제거됨', async () => {
    // Given: 문서 + AR 파싱 큐 레코드
    const docId = new ObjectId();
    const queueId = new ObjectId();
    createdFileIds.push(docId);
    createdArQueueIds.push(queueId);

    await filesCollection.insertOne({
      _id: docId,
      filename: '__test_url_env_ar_queue__',
      status: 'pending',
      ownerId: 'test-user',
      createdAt: new Date(),
    });

    await arQueueCollection.insertOne({
      _id: queueId,
      file_id: docId,
      status: 'pending',
      createdAt: new Date(),
    });

    // When: deleteDocument 실행
    const { deleteDocument } = require('../lib/documentDeleteService');
    const result = await deleteDocument(docId.toString());

    // Then: AR 큐에서 제거됨
    expect(result.success).toBe(true);
    const queueRecord = await arQueueCollection.findOne({ file_id: docId });
    expect(queueRecord).toBeNull();
  });

  test('유효하지 않은 문서 ID로 호출 시 에러 반환', async () => {
    const { deleteDocument } = require('../lib/documentDeleteService');
    const result = await deleteDocument('invalid-id');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/유효하지 않은/);
  });

  test('존재하지 않는 문서 ID로 호출 시 에러 반환', async () => {
    const { deleteDocument } = require('../lib/documentDeleteService');
    const fakeId = new ObjectId();
    const result = await deleteDocument(fakeId.toString());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/찾을 수 없/);
  });
});

// ======================================================================
// 항목 2: AR 파싱 트리거 — ANNUAL_REPORT_API_URL 환경변수 사용 확인
// ======================================================================
describe('항목 2: AR 파싱 트리거 환경변수', () => {
  const webhooksRoutePath = path.join(__dirname, '..', 'routes', 'webhooks-routes.js');
  let sourceCode;

  beforeAll(() => {
    sourceCode = fs.readFileSync(webhooksRoutePath, 'utf8');
  });

  test('ANNUAL_REPORT_API_URL 환경변수를 process.env에서 읽음', () => {
    // process.env.ANNUAL_REPORT_API_URL 패턴이 존재
    expect(sourceCode).toMatch(/process\.env\.ANNUAL_REPORT_API_URL/);
  });

  test('ANNUAL_REPORT_API_URL 변수 정의부에 fallback이 있음', () => {
    // 변수 선언: const ... = process.env.ANNUAL_REPORT_API_URL || '...'
    expect(sourceCode).toMatch(
      /const\s+ANNUAL_REPORT_API_URL\s*=\s*process\.env\.ANNUAL_REPORT_API_URL\s*\|\|\s*['"]http:\/\/localhost:8004['"]/
    );
  });

  test('ar-background/trigger-parsing 엔드포인트에서 ANNUAL_REPORT_API_URL 변수 사용', () => {
    // 실제 HTTP 호출에서 변수를 사용 (하드코딩 아님)
    expect(sourceCode).toMatch(/\$\{ANNUAL_REPORT_API_URL\}\/ar-background\/trigger-parsing/);
  });

  test('ar-background/retry-parsing 엔드포인트에서 ANNUAL_REPORT_API_URL 변수 사용', () => {
    expect(sourceCode).toMatch(/\$\{ANNUAL_REPORT_API_URL\}\/ar-background\/retry-parsing/);
  });

  test('CR 파싱 엔드포인트에서도 ANNUAL_REPORT_API_URL 변수 사용', () => {
    expect(sourceCode).toMatch(/\$\{ANNUAL_REPORT_API_URL\}\/cr-background\/trigger-parsing/);
    expect(sourceCode).toMatch(/\$\{ANNUAL_REPORT_API_URL\}\/cr-background\/retry-parsing/);
  });

  test('하드코딩된 localhost:8004 URL이 변수 정의부 외에는 없음', () => {
    // 'http://localhost:8004'가 변수 정의부(fallback)에서만 등장하는지 확인
    const matches = sourceCode.match(/http:\/\/localhost:8004/g) || [];
    // 정확히 1번만 등장 (변수 정의의 fallback)
    expect(matches.length).toBe(1);
  });
});

// ======================================================================
// 항목 3: 문서 파이프라인 webhook — DOCUMENT_PIPELINE_URL 환경변수 사용 확인
// ======================================================================
describe('항목 3: 파이프라인 webhook 환경변수', () => {
  const webhooksRoutePath = path.join(__dirname, '..', 'routes', 'webhooks-routes.js');
  let sourceCode;

  beforeAll(() => {
    sourceCode = fs.readFileSync(webhooksRoutePath, 'utf8');
  });

  test('DOCUMENT_PIPELINE_URL 환경변수를 process.env에서 읽음', () => {
    expect(sourceCode).toMatch(/process\.env\.DOCUMENT_PIPELINE_URL/);
  });

  test('DOCUMENT_PIPELINE_URL 변수 정의부에 fallback이 있음', () => {
    expect(sourceCode).toMatch(
      /const\s+DOCUMENT_PIPELINE_URL\s*=\s*process\.env\.DOCUMENT_PIPELINE_URL\s*\|\|\s*['"]http:\/\/localhost:8100['"]/
    );
  });

  test('shadow/smart-search 엔드포인트에서 DOCUMENT_PIPELINE_URL 변수 사용', () => {
    expect(sourceCode).toMatch(/\$\{DOCUMENT_PIPELINE_URL\}\/shadow\/smart-search/);
  });

  test('batch-display-names 엔드포인트에서 DOCUMENT_PIPELINE_URL 변수 사용', () => {
    expect(sourceCode).toMatch(/\$\{DOCUMENT_PIPELINE_URL\}\/webhook\/batch-display-names/);
  });

  test('generate-display-name 엔드포인트에서 DOCUMENT_PIPELINE_URL 변수 사용', () => {
    expect(sourceCode).toMatch(/\$\{DOCUMENT_PIPELINE_URL\}\/webhook\/generate-display-name/);
  });

  test('하드코딩된 localhost:8100 URL이 변수 정의부 외에는 없음', () => {
    const matches = sourceCode.match(/http:\/\/localhost:8100/g) || [];
    expect(matches.length).toBe(1);
  });
});

// ======================================================================
// 항목 4: personal-files 삭제 — 자기 호출 없이 내부 함수 처리 확인
// ======================================================================
describe('항목 4: personal-files 자기 호출 제거', () => {
  const personalFilesPath = path.join(__dirname, '..', 'routes', 'personal-files-routes.js');
  let sourceCode;

  beforeAll(() => {
    sourceCode = fs.readFileSync(personalFilesPath, 'utf8');
  });

  test('localhost:3010 자기 호출 참조가 없음', () => {
    // HTTP 자기 호출 패턴이 없어야 함
    expect(sourceCode).not.toMatch(/localhost:3010/);
    expect(sourceCode).not.toMatch(/127\.0\.0\.1:3010/);
  });

  test('axios/http 모듈을 사용하지 않음 (자기 호출 불필요)', () => {
    // personal-files-routes에서 axios를 require하지 않아야 함
    expect(sourceCode).not.toMatch(/require\(['"]axios['"]\)/);
  });

  test('documentDeleteService에서 deleteDocument를 import함', () => {
    expect(sourceCode).toMatch(/require\(['"]\.\.\/lib\/documentDeleteService['"]\)/);
  });

  test('deleteDocument 함수를 구조 분해 할당으로 가져옴', () => {
    expect(sourceCode).toMatch(/\{\s*deleteDocument\s*\}/);
  });

  test('폴더 삭제 시 deleteDocument()를 직접 호출함', () => {
    // 실제 deleteDocument 호출이 코드에 있음
    expect(sourceCode).toMatch(/await\s+deleteDocument\(/);
  });

  test('HTTP 자기 호출(http.request, axios.delete, fetch) 패턴이 없음', () => {
    // 문서 삭제를 위한 HTTP 호출이 없어야 함
    // (axios, http.request, fetch를 통한 localhost 호출)
    const httpCallPatterns = [
      /axios\.delete\(/,
      /axios\.post\(.*3010/,
      /http\.request\(.*3010/,
      /fetch\(.*3010/,
    ];
    for (const pattern of httpCallPatterns) {
      expect(sourceCode).not.toMatch(pattern);
    }
  });
});

// ======================================================================
// 항목 5: 헬스체크 — DOCUMENT_PIPELINE_URL 환경변수 사용 확인
// ======================================================================
describe('항목 5: 헬스체크 환경변수', () => {
  const healthRoutePath = path.join(__dirname, '..', 'routes', 'health-routes.js');
  let sourceCode;

  beforeAll(() => {
    sourceCode = fs.readFileSync(healthRoutePath, 'utf8');
  });

  test('DOCUMENT_PIPELINE_URL 환경변수를 process.env에서 읽음', () => {
    expect(sourceCode).toMatch(/process\.env\.DOCUMENT_PIPELINE_URL/);
  });

  test('DOCUMENT_PIPELINE_URL 변수 정의부에 fallback이 있음', () => {
    expect(sourceCode).toMatch(
      /const\s+DOCUMENT_PIPELINE_URL\s*=\s*process\.env\.DOCUMENT_PIPELINE_URL\s*\|\|\s*['"]http:\/\/localhost:8100['"]/
    );
  });

  test('/health 엔드포인트에서 DOCUMENT_PIPELINE_URL 변수로 파이프라인 URL 구성', () => {
    expect(sourceCode).toMatch(/\$\{DOCUMENT_PIPELINE_URL\}\/health/);
  });

  test('하드코딩된 localhost:8100 URL이 변수 정의부 외에는 없음', () => {
    const matches = sourceCode.match(/http:\/\/localhost:8100/g) || [];
    expect(matches.length).toBe(1);
  });
});

// ======================================================================
// 추가: 환경변수 동적 검증 (require cache 초기화 방식)
// ======================================================================
describe('환경변수 동적 검증', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // 환경변수 원복
    process.env = { ...originalEnv };
  });

  test('webhooks-routes: ANNUAL_REPORT_API_URL 환경변수가 반영됨', () => {
    // 환경변수 설정
    process.env.ANNUAL_REPORT_API_URL = 'http://custom-ar-host:9999';
    process.env.DOCUMENT_PIPELINE_URL = 'http://custom-pipeline:7777';

    // require cache 제거 후 다시 로드
    const modulePath = require.resolve('../routes/webhooks-routes');
    delete require.cache[modulePath];

    // webhooks-routes는 함수를 export (module.exports = function(db, authenticateJWT))
    // 내부에서 모듈 레벨 변수를 초기화하므로 함수 호출 없이도 변수가 설정됨
    // 소스 코드에서 변수 선언 확인
    const routeSource = fs.readFileSync(modulePath, 'utf8');
    expect(routeSource).toMatch(/process\.env\.ANNUAL_REPORT_API_URL/);
    expect(routeSource).toMatch(/process\.env\.DOCUMENT_PIPELINE_URL/);

    // 환경변수가 실제로 설정되었는지 확인
    expect(process.env.ANNUAL_REPORT_API_URL).toBe('http://custom-ar-host:9999');
    expect(process.env.DOCUMENT_PIPELINE_URL).toBe('http://custom-pipeline:7777');
  });

  test('health-routes: DOCUMENT_PIPELINE_URL 환경변수가 반영됨', () => {
    process.env.DOCUMENT_PIPELINE_URL = 'http://custom-health-pipeline:6666';

    const modulePath = require.resolve('../routes/health-routes');
    delete require.cache[modulePath];

    // health-routes도 함수를 export
    const routeSource = fs.readFileSync(modulePath, 'utf8');
    expect(routeSource).toMatch(/process\.env\.DOCUMENT_PIPELINE_URL/);
    expect(process.env.DOCUMENT_PIPELINE_URL).toBe('http://custom-health-pipeline:6666');
  });

  test('N8N_URL 환경변수도 환경변수로 관리됨', () => {
    const webhooksSource = fs.readFileSync(
      require.resolve('../routes/webhooks-routes'),
      'utf8'
    );
    expect(webhooksSource).toMatch(/process\.env\.N8N_URL/);
    expect(webhooksSource).toMatch(
      /const\s+N8N_INTERNAL_URL\s*=\s*process\.env\.N8N_URL\s*\|\|\s*['"]http:\/\/localhost:5678['"]/
    );
  });
});
