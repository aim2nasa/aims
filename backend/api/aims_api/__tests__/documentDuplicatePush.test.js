/**
 * documentDuplicatePush.test.js
 * BUG-4: customers.documents 중복 $push 방지 테스트
 *
 * 검증 방식: 실제 MongoDB 연결 기반 동적 테스트
 * - 신규 연결: documents 배열에 $push 실행 → 배열 크기 증가
 * - 중복 연결: findOne으로 감지 → $push 미실행 → 배열 크기 불변
 * - 얼리 리턴: 중복 시 files.customerId 업데이트 스킵
 *
 * 핵심 로직 (customers-routes.js에서 추출):
 *   alreadyLinked = findOne({ _id, 'documents.document_id': docObjectId })
 *   if (!alreadyLinked) → $push + files.customerId 업데이트
 *   else → 얼리 리턴 (후속 처리 스킵)
 */

const { ObjectId } = require('mongodb');
const { connectWithFallback, ISOLATED_DB_NAME } = require('./testDbHelper');

const CUSTOMERS_COLLECTION = 'customers';
const FILES_COLLECTION = 'files';

describe('BUG-4: customers.documents 중복 $push 방지', () => {
  let client;
  let db;
  let customersCollection;
  let filesCollection;

  // 테스트에서 생성한 ID 추적
  let createdCustomerIds = [];
  let createdFileIds = [];

  beforeAll(async () => {
    const result = await connectWithFallback();
    client = result.client;
    db = client.db(ISOLATED_DB_NAME);
    customersCollection = db.collection(CUSTOMERS_COLLECTION);
    filesCollection = db.collection(FILES_COLLECTION);
    console.log(`[Setup] MongoDB connected: ${result.uri}`);
  });

  beforeEach(() => {
    createdCustomerIds = [];
    createdFileIds = [];
  });

  afterEach(async () => {
    if (createdCustomerIds.length > 0) {
      await customersCollection.deleteMany({ _id: { $in: createdCustomerIds } });
    }
    if (createdFileIds.length > 0) {
      await filesCollection.deleteMany({ _id: { $in: createdFileIds } });
    }
  });

  afterAll(async () => {
    if (client) {
      await client.close();
    }
  });

  /**
   * customers-routes.js의 문서 연결 핵심 로직을 재현하는 헬퍼
   * 실제 라우트 핸들러의 alreadyLinked + 조건부 $push 로직을 동일하게 수행
   *
   * @returns {{ linked: boolean, alreadyLinked: boolean }}
   */
  async function simulateLinkDocument(customerId, documentId, notes = '') {
    const docObjectId = new ObjectId(documentId);

    // Step 1: 중복 체크 (findOne)
    const alreadyLinked = await customersCollection.findOne({
      _id: new ObjectId(customerId),
      'documents.document_id': docObjectId,
    });

    if (!alreadyLinked) {
      // Step 2a: 신규 연결 - $push
      const documentLink = {
        document_id: docObjectId,
        upload_date: new Date(),
        notes: notes || '',
      };

      await customersCollection.updateOne(
        { _id: new ObjectId(customerId) },
        {
          $push: { documents: documentLink },
          $set: { 'meta.updated_at': new Date() },
        }
      );

      // Step 3: files.customerId 업데이트 (신규 연결에서만 실행)
      await filesCollection.updateOne(
        { _id: new ObjectId(documentId) },
        {
          $set: {
            customerId: new ObjectId(customerId),
            customer_notes: notes || '',
          },
        }
      );

      return { linked: true, alreadyLinked: false };
    } else {
      // Step 2b: 중복 → 얼리 리턴 (후속 처리 스킵)
      return { linked: false, alreadyLinked: true };
    }
  }

  // ===========================================================================
  // 시나리오 1: 신규 연결
  // ===========================================================================
  describe('신규 연결: documents 배열에 $push 실행', () => {

    test('documents 배열이 비어있는 고객에 문서를 처음 연결하면 배열에 추가됨', async () => {
      // Given: 고객과 문서 생성
      const customerId = new ObjectId();
      const documentId = new ObjectId();
      createdCustomerIds.push(customerId);
      createdFileIds.push(documentId);

      await customersCollection.insertOne({
        _id: customerId,
        personal_info: { name: '중복테스트_신규고객' },
        documents: [],
        meta: { created_at: new Date(), updated_at: new Date() },
      });

      await filesCollection.insertOne({
        _id: documentId,
        upload: { destPath: '/tmp/test-dup-new.pdf', uploaded_at: new Date() },
        meta: { mime: 'application/pdf' },
      });

      // When: 신규 연결 실행
      const result = await simulateLinkDocument(customerId, documentId);

      // Then: 연결 성공
      expect(result.linked).toBe(true);
      expect(result.alreadyLinked).toBe(false);

      // documents 배열에 1건 추가됨
      const customer = await customersCollection.findOne({ _id: customerId });
      expect(customer.documents).toHaveLength(1);
      expect(customer.documents[0].document_id.toString()).toBe(documentId.toString());

      // files.customerId가 설정됨
      const file = await filesCollection.findOne({ _id: documentId });
      expect(file.customerId.toString()).toBe(customerId.toString());
    });

    test('이미 다른 문서가 있는 고객에 새 문서를 연결하면 배열에 추가됨', async () => {
      // Given: 기존 문서 1건이 연결된 고객
      const customerId = new ObjectId();
      const existingDocId = new ObjectId();
      const newDocId = new ObjectId();
      createdCustomerIds.push(customerId);
      createdFileIds.push(existingDocId, newDocId);

      await customersCollection.insertOne({
        _id: customerId,
        personal_info: { name: '중복테스트_기존문서있음' },
        documents: [{
          document_id: existingDocId,
          upload_date: new Date(),
          notes: '',
        }],
        meta: { created_at: new Date(), updated_at: new Date() },
      });

      await filesCollection.insertOne({
        _id: newDocId,
        upload: { destPath: '/tmp/test-dup-new2.pdf', uploaded_at: new Date() },
      });

      // When: 새 문서 연결
      const result = await simulateLinkDocument(customerId, newDocId);

      // Then: 연결 성공, 배열 크기 2
      expect(result.linked).toBe(true);
      const customer = await customersCollection.findOne({ _id: customerId });
      expect(customer.documents).toHaveLength(2);
    });
  });

  // ===========================================================================
  // 시나리오 2: 중복 연결 방지
  // ===========================================================================
  describe('중복 연결: $push 미실행 + 배열 크기 불변', () => {

    test('이미 연결된 문서를 다시 연결하면 배열 크기가 변하지 않음', async () => {
      // Given: 문서가 이미 연결된 고객
      const customerId = new ObjectId();
      const documentId = new ObjectId();
      createdCustomerIds.push(customerId);
      createdFileIds.push(documentId);

      await filesCollection.insertOne({
        _id: documentId,
        upload: { destPath: '/tmp/test-dup-existing.pdf', uploaded_at: new Date() },
      });

      await customersCollection.insertOne({
        _id: customerId,
        personal_info: { name: '중복테스트_이미연결' },
        documents: [{
          document_id: documentId,
          upload_date: new Date(),
          notes: '최초 연결',
        }],
        meta: { created_at: new Date(), updated_at: new Date() },
      });

      // When: 같은 문서를 다시 연결 시도
      const result = await simulateLinkDocument(customerId, documentId, '두번째 연결');

      // Then: 중복 감지, 연결 미실행
      expect(result.linked).toBe(false);
      expect(result.alreadyLinked).toBe(true);

      // 배열 크기 불변 (1건 유지)
      const customer = await customersCollection.findOne({ _id: customerId });
      expect(customer.documents).toHaveLength(1);
      // notes도 원래 값 유지 (덮어쓰기 안 됨)
      expect(customer.documents[0].notes).toBe('최초 연결');
    });

    test('3회 연속 중복 연결 시도해도 배열 크기가 1로 유지됨', async () => {
      // Given: 고객과 문서 생성 후 최초 연결
      const customerId = new ObjectId();
      const documentId = new ObjectId();
      createdCustomerIds.push(customerId);
      createdFileIds.push(documentId);

      await filesCollection.insertOne({
        _id: documentId,
        upload: { destPath: '/tmp/test-dup-multi.pdf', uploaded_at: new Date() },
      });

      await customersCollection.insertOne({
        _id: customerId,
        personal_info: { name: '중복테스트_다회시도' },
        documents: [],
        meta: { created_at: new Date(), updated_at: new Date() },
      });

      // 최초 연결 (성공해야 함)
      const first = await simulateLinkDocument(customerId, documentId);
      expect(first.linked).toBe(true);

      // When: 3회 중복 시도
      const second = await simulateLinkDocument(customerId, documentId);
      const third = await simulateLinkDocument(customerId, documentId);
      const fourth = await simulateLinkDocument(customerId, documentId);

      // Then: 모두 중복 감지
      expect(second.alreadyLinked).toBe(true);
      expect(third.alreadyLinked).toBe(true);
      expect(fourth.alreadyLinked).toBe(true);

      // 배열 크기 1 유지
      const customer = await customersCollection.findOne({ _id: customerId });
      expect(customer.documents).toHaveLength(1);
    });
  });

  // ===========================================================================
  // 시나리오 3: 얼리 리턴 시 files.customerId 업데이트 스킵
  // ===========================================================================
  describe('얼리 리턴 시 후속 처리 스킵 확인', () => {

    test('중복 연결 시 files.customerId가 업데이트되지 않음', async () => {
      // Given: 고객A에 문서가 연결된 상태
      const customerAId = new ObjectId();
      const customerBId = new ObjectId();
      const documentId = new ObjectId();
      createdCustomerIds.push(customerAId, customerBId);
      createdFileIds.push(documentId);

      await filesCollection.insertOne({
        _id: documentId,
        upload: { destPath: '/tmp/test-dup-skip.pdf', uploaded_at: new Date() },
        customerId: customerAId, // 이미 고객A에 연결됨
        customer_notes: '고객A 연결',
      });

      await customersCollection.insertOne({
        _id: customerAId,
        personal_info: { name: '중복테스트_고객A' },
        documents: [{
          document_id: documentId,
          upload_date: new Date(),
          notes: '',
        }],
        meta: { created_at: new Date(), updated_at: new Date() },
      });

      await customersCollection.insertOne({
        _id: customerBId,
        personal_info: { name: '중복테스트_고객B' },
        documents: [],
        meta: { created_at: new Date(), updated_at: new Date() },
      });

      // When: 고객A에 같은 문서를 다시 연결 시도
      const result = await simulateLinkDocument(customerAId, documentId, '덮어쓰기 시도');

      // Then: 얼리 리턴으로 files.customerId 업데이트 스킵
      expect(result.alreadyLinked).toBe(true);

      const file = await filesCollection.findOne({ _id: documentId });
      // customerId는 여전히 고객A (변경 안 됨)
      expect(file.customerId.toString()).toBe(customerAId.toString());
      // customer_notes도 원래 값 유지
      expect(file.customer_notes).toBe('고객A 연결');
    });
  });

  // ===========================================================================
  // 보조: 정적 분석 (코드 존재 확인)
  // ===========================================================================
  describe('보조: 소스 코드 정적 분석', () => {
    const fs = require('fs');
    const path = require('path');
    const sourceCode = fs.readFileSync(
      path.join(__dirname, '..', 'routes', 'customer-documents-routes.js'),
      'utf-8'
    );

    test('alreadyLinked findOne 체크가 소스에 존재함', () => {
      expect(sourceCode).toMatch(/alreadyLinked\s*=\s*await\s+db\.collection\([^)]+\)\.findOne\(/);
    });

    test('중복 시 얼리 리턴이 files.customerId 업데이트보다 앞에 위치함', () => {
      const earlyReturnIndex = sourceCode.indexOf("return res.json({ success: true, message: '이미 연결된 문서입니다.'");
      const customerIdUpdateIndex = sourceCode.indexOf("customerId: new ObjectId(id),");

      expect(earlyReturnIndex).toBeGreaterThan(-1);
      expect(customerIdUpdateIndex).toBeGreaterThan(-1);
      expect(earlyReturnIndex).toBeLessThan(customerIdUpdateIndex);
    });
  });
});
