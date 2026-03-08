/**
 * documentDeletion.test.js
 * 문서 삭제 시 고객 참조 자동 정리 유닛 테스트
 *
 * 테스트 시나리오:
 * 1. 1:1 관계 - 한 문서를 한 명의 고객이 참조
 * 2. 1:N 관계 - 한 문서를 여러 명의 고객이 참조
 * 3. 참조 없는 문서 삭제
 */

const { ObjectId } = require('mongodb');
const fs = require('fs').promises;
const { connectWithFallback, ISOLATED_DB_NAME } = require('./testDbHelper');
const COLLECTION_NAME = 'files';
const CUSTOMERS_COLLECTION = 'customers';

describe('문서 삭제 시 고객 참조 자동 정리', () => {
  let client;
  let db;
  let filesCollection;
  let customersCollection;

  // 테스트에서 생성한 ID 추적
  let createdDocumentIds = [];
  let createdCustomerIds = [];

  // 각 테스트 전에 MongoDB 연결 및 테스트 데이터 준비
  beforeAll(async () => {
    const result = await connectWithFallback();
    client = result.client;
    db = client.db(ISOLATED_DB_NAME);
    console.log(`[Setup] MongoDB connected: ${result.uri}`);
    filesCollection = db.collection(COLLECTION_NAME);
    customersCollection = db.collection(CUSTOMERS_COLLECTION);
  });

  // 각 테스트 전에 ID 추적 배열 초기화
  beforeEach(() => {
    createdDocumentIds = [];
    createdCustomerIds = [];
  });

  // 각 테스트 후 테스트 데이터 정리
  afterEach(async () => {
    // 생성된 문서 삭제
    if (createdDocumentIds.length > 0) {
      await filesCollection.deleteMany({ _id: { $in: createdDocumentIds } });
    }

    // 생성된 고객 삭제
    if (createdCustomerIds.length > 0) {
      await customersCollection.deleteMany({ _id: { $in: createdCustomerIds } });
    }

  });

  // 모든 테스트 후 연결 해제
  afterAll(async () => {
    await client.close();
  });

  describe('1:1 관계 - 한 문서를 한 명의 고객이 참조', () => {

    test('문서 삭제 시 해당 고객의 documents 배열에서 참조 제거', async () => {
      // Given: 문서와 고객 생성
      const documentId = new ObjectId();
      const customerId = new ObjectId();

      // ID 추적
      createdDocumentIds.push(documentId);
      createdCustomerIds.push(customerId);

      await filesCollection.insertOne({
        _id: documentId,
        upload: {
          destPath: '/tmp/test-file.pdf',
          uploaded_at: new Date()
        },
        meta: {
          mime: 'application/pdf',
          size_bytes: 1024
        }
      });

      await customersCollection.insertOne({
        _id: customerId,
        personal_info: {
          name: '테스트고객1'
        },
        documents: [
          {
            document_id: documentId,
            relationship: 'annual_report',
            upload_date: new Date(),
            notes: ''
          }
        ],
        meta: {
          created_at: new Date(),
          updated_at: new Date()
        }
      });

      // When: 문서 삭제 로직 실행 (고객 참조 정리 포함)
      // 1. 고객 참조 정리
      const customersUpdateResult = await customersCollection.updateMany(
        { 'documents.document_id': documentId },
        {
          $pull: { documents: { document_id: documentId } },
          $set: { 'meta.updated_at': new Date() }
        }
      );

      // 2. 문서 삭제
      await filesCollection.deleteOne({ _id: documentId });

      // Then: 검증
      // 1. 고객 참조가 업데이트되었는지 확인
      expect(customersUpdateResult.modifiedCount).toBe(1);

      // 2. 고객의 documents 배열이 비어있는지 확인
      const customer = await customersCollection.findOne({ _id: customerId });
      expect(customer.documents).toEqual([]);

      // 3. 문서가 삭제되었는지 확인
      const document = await filesCollection.findOne({ _id: documentId });
      expect(document).toBeNull();
    });

    test('참조가 없는 문서 삭제 시 오류 없이 정상 처리', async () => {
      // Given: 고객 참조가 없는 문서
      const documentId = new ObjectId();

      // ID 추적
      createdDocumentIds.push(documentId);

      await filesCollection.insertOne({
        _id: documentId,
        upload: {
          destPath: '/tmp/test-file-no-ref.pdf',
          uploaded_at: new Date()
        }
      });

      // When: 문서 삭제 로직 실행
      const customersUpdateResult = await customersCollection.updateMany(
        { 'documents.document_id': documentId },
        {
          $pull: { documents: { document_id: documentId } },
          $set: { 'meta.updated_at': new Date() }
        }
      );

      await filesCollection.deleteOne({ _id: documentId });

      // Then: 검증
      // 1. 업데이트된 고객이 없음 (0명)
      expect(customersUpdateResult.modifiedCount).toBe(0);

      // 2. 문서는 정상적으로 삭제됨
      const document = await filesCollection.findOne({ _id: documentId });
      expect(document).toBeNull();
    });
  });

  describe('1:N 관계 - 한 문서를 여러 명의 고객이 참조', () => {

    test('문서 삭제 시 모든 고객의 documents 배열에서 참조 제거', async () => {
      // Given: 하나의 문서를 3명의 고객이 참조
      const documentId = new ObjectId();
      const customer1Id = new ObjectId();
      const customer2Id = new ObjectId();
      const customer3Id = new ObjectId();

      // ID 추적
      createdDocumentIds.push(documentId);
      createdCustomerIds.push(customer1Id, customer2Id, customer3Id);

      await filesCollection.insertOne({
        _id: documentId,
        upload: {
          destPath: '/tmp/test-shared-file.pdf',
          uploaded_at: new Date()
        }
      });

      const uploadDate = new Date();

      await customersCollection.insertMany([
        {
          _id: customer1Id,
          personal_info: { name: '테스트고객A' },
          documents: [
            {
              document_id: documentId,
              relationship: 'annual_report',
              upload_date: uploadDate,
              notes: ''
            }
          ],
          meta: {
            created_at: new Date(),
            updated_at: new Date()
          }
        },
        {
          _id: customer2Id,
          personal_info: { name: '테스트고객B' },
          documents: [
            {
              document_id: documentId,
              relationship: 'contract',
              upload_date: uploadDate,
              notes: ''
            }
          ],
          meta: {
            created_at: new Date(),
            updated_at: new Date()
          }
        },
        {
          _id: customer3Id,
          personal_info: { name: '테스트고객C' },
          documents: [
            {
              document_id: documentId,
              relationship: 'claim',
              upload_date: uploadDate,
              notes: ''
            }
          ],
          meta: {
            created_at: new Date(),
            updated_at: new Date()
          }
        }
      ]);

      // When: 문서 삭제 로직 실행
      const customersUpdateResult = await customersCollection.updateMany(
        { 'documents.document_id': documentId },
        {
          $pull: { documents: { document_id: documentId } },
          $set: { 'meta.updated_at': new Date() }
        }
      );

      await filesCollection.deleteOne({ _id: documentId });

      // Then: 검증
      // 1. 3명의 고객이 모두 업데이트되었는지 확인
      expect(customersUpdateResult.modifiedCount).toBe(3);

      // 2. 각 고객의 documents 배열이 비어있는지 확인
      const customer1 = await customersCollection.findOne({ _id: customer1Id });
      const customer2 = await customersCollection.findOne({ _id: customer2Id });
      const customer3 = await customersCollection.findOne({ _id: customer3Id });

      expect(customer1.documents).toEqual([]);
      expect(customer2.documents).toEqual([]);
      expect(customer3.documents).toEqual([]);

      // 3. 문서가 삭제되었는지 확인
      const document = await filesCollection.findOne({ _id: documentId });
      expect(document).toBeNull();
    });

    test('여러 문서를 참조하는 고객에서 특정 문서만 제거', async () => {
      // Given: 한 고객이 2개의 문서를 참조, 그 중 1개만 삭제
      const document1Id = new ObjectId();
      const document2Id = new ObjectId();
      const customerId = new ObjectId();

      // ID 추적
      createdDocumentIds.push(document1Id, document2Id);
      createdCustomerIds.push(customerId);

      await filesCollection.insertMany([
        {
          _id: document1Id,
          upload: { destPath: '/tmp/test-doc1.pdf', uploaded_at: new Date() }
        },
        {
          _id: document2Id,
          upload: { destPath: '/tmp/test-doc2.pdf', uploaded_at: new Date() }
        }
      ]);

      await customersCollection.insertOne({
        _id: customerId,
        personal_info: { name: '테스트고객' },
        documents: [
          {
            document_id: document1Id,
            relationship: 'annual_report',
            upload_date: new Date(),
            notes: ''
          },
          {
            document_id: document2Id,
            relationship: 'contract',
            upload_date: new Date(),
            notes: ''
          }
        ],
        meta: {
          created_at: new Date(),
          updated_at: new Date()
        }
      });

      // When: document1만 삭제
      await customersCollection.updateMany(
        { 'documents.document_id': document1Id },
        {
          $pull: { documents: { document_id: document1Id } },
          $set: { 'meta.updated_at': new Date() }
        }
      );

      await filesCollection.deleteOne({ _id: document1Id });

      // Then: 검증
      const customer = await customersCollection.findOne({ _id: customerId });

      // 1. documents 배열에 document2만 남아있는지 확인
      expect(customer.documents).toHaveLength(1);
      expect(customer.documents[0].document_id.toString()).toBe(document2Id.toString());
      expect(customer.documents[0].relationship).toBe('contract');

      // 2. document1은 삭제되고 document2는 남아있는지 확인
      const doc1 = await filesCollection.findOne({ _id: document1Id });
      const doc2 = await filesCollection.findOne({ _id: document2Id });
      expect(doc1).toBeNull();
      expect(doc2).not.toBeNull();
    });

    test('10명 이상의 고객이 참조하는 문서 삭제 (대량 처리)', async () => {
      // Given: 하나의 문서를 10명의 고객이 참조
      const documentId = new ObjectId();
      const customerCount = 10;
      const customers = [];

      // ID 추적
      createdDocumentIds.push(documentId);

      await filesCollection.insertOne({
        _id: documentId,
        upload: {
          destPath: '/tmp/test-large-ref.pdf',
          uploaded_at: new Date()
        }
      });

      for (let i = 0; i < customerCount; i++) {
        const customerId = new ObjectId();
        createdCustomerIds.push(customerId);  // ID 추적

        customers.push({
          _id: customerId,
          personal_info: { name: `테스트고객${i + 1}` },
          documents: [
            {
              document_id: documentId,
              relationship: 'annual_report',
              upload_date: new Date(),
              notes: ''
            }
          ],
          meta: {
            created_at: new Date(),
            updated_at: new Date()
          }
        });
      }

      await customersCollection.insertMany(customers);

      // When: 문서 삭제 로직 실행
      const customersUpdateResult = await customersCollection.updateMany(
        { 'documents.document_id': documentId },
        {
          $pull: { documents: { document_id: documentId } },
          $set: { 'meta.updated_at': new Date() }
        }
      );

      await filesCollection.deleteOne({ _id: documentId });

      // Then: 검증
      // 1. 10명의 고객이 모두 업데이트되었는지 확인
      expect(customersUpdateResult.modifiedCount).toBe(customerCount);

      // 2. 모든 고객의 documents 배열이 비어있는지 확인
      const updatedCustomers = await customersCollection.find({
        _id: { $in: customers.map(c => c._id) }
      }).toArray();

      updatedCustomers.forEach(customer => {
        expect(customer.documents).toEqual([]);
      });

      // 3. 문서가 삭제되었는지 확인
      const document = await filesCollection.findOne({ _id: documentId });
      expect(document).toBeNull();
    });
  });

  describe('meta.updated_at 갱신 확인', () => {

    test('고객 참조 정리 시 meta.updated_at이 갱신되는지 확인', async () => {
      // Given: 문서와 고객 생성 (초기 updated_at 설정)
      const documentId = new ObjectId();
      const customerId = new ObjectId();
      const initialUpdateTime = new Date('2025-01-01T00:00:00Z');

      // ID 추적
      createdDocumentIds.push(documentId);
      createdCustomerIds.push(customerId);

      await filesCollection.insertOne({
        _id: documentId,
        upload: { destPath: '/tmp/test-file.pdf', uploaded_at: new Date() }
      });

      await customersCollection.insertOne({
        _id: customerId,
        personal_info: { name: '테스트고객' },
        documents: [
          {
            document_id: documentId,
            relationship: 'annual_report',
            upload_date: new Date(),
            notes: ''
          }
        ],
        meta: {
          created_at: initialUpdateTime,
          updated_at: initialUpdateTime
        }
      });

      // 약간의 시간 대기 (updated_at 변경을 확실히 감지하기 위해)
      await new Promise(resolve => setTimeout(resolve, 10));

      // When: 문서 삭제 로직 실행
      await customersCollection.updateMany(
        { 'documents.document_id': documentId },
        {
          $pull: { documents: { document_id: documentId } },
          $set: { 'meta.updated_at': new Date() }
        }
      );

      await filesCollection.deleteOne({ _id: documentId });

      // Then: 검증
      const customer = await customersCollection.findOne({ _id: customerId });

      // meta.updated_at이 갱신되었는지 확인
      expect(customer.meta.updated_at.getTime()).toBeGreaterThan(initialUpdateTime.getTime());
    });
  });

  describe('Regression: CUSTOMERS_COLLECTION 상수 정의 검증', () => {
    /**
     * 이번 버그의 근본 원인: documents-routes.js에서 CUSTOMERS_COLLECTION 상수가
     * 미정의 상태로 배포되어 ReferenceError 발생 → catch에서 침묵 → 고아 참조 누적
     *
     * 이 테스트는 라우트 소스 코드를 정적 분석하여
     * 삭제 로직에서 사용하는 CUSTOMERS_COLLECTION이 정의되어 있는지 확인합니다.
     */
    test('documents-routes.js에서 CUSTOMERS_COLLECTION 상수가 정의되어 있어야 함', () => {
      const fs = require('fs');
      const path = require('path');
      const routeContent = fs.readFileSync(
        path.join(__dirname, '..', 'routes', 'documents-routes.js'),
        'utf-8'
      );

      // CUSTOMERS_COLLECTION이 const로 정의되어 있는지 확인
      expect(routeContent).toMatch(/const\s+CUSTOMERS_COLLECTION\s*=/);
    });

    test('고객 참조 정리 실패 시 console.error로 로깅해야 함 (warn 아님)', () => {
      const fs = require('fs');
      const path = require('path');
      const routeContent = fs.readFileSync(
        path.join(__dirname, '..', 'routes', 'documents-routes.js'),
        'utf-8'
      );

      // 고객 참조 정리 catch 블록에서 console.error 사용 확인
      expect(routeContent).toMatch(/console\.error\(.*고객 참조 정리 실패/);
      // console.warn이 아닌지 확인
      expect(routeContent).not.toMatch(/console\.warn\(.*고객 참조 정리 실패/);
    });
  });

  describe('복수 문서 삭제 (DELETE /api/documents)', () => {

    test('복수 문서 삭제 시 모든 고객의 documents 배열에서 참조 제거', async () => {
      // Given: 3개의 문서를 2명의 고객이 참조
      const document1Id = new ObjectId();
      const document2Id = new ObjectId();
      const document3Id = new ObjectId();
      const customer1Id = new ObjectId();
      const customer2Id = new ObjectId();

      // ID 추적
      createdDocumentIds.push(document1Id, document2Id, document3Id);
      createdCustomerIds.push(customer1Id, customer2Id);

      await filesCollection.insertMany([
        { _id: document1Id, upload: { destPath: '/tmp/test-bulk1.pdf', uploaded_at: new Date() } },
        { _id: document2Id, upload: { destPath: '/tmp/test-bulk2.pdf', uploaded_at: new Date() } },
        { _id: document3Id, upload: { destPath: '/tmp/test-bulk3.pdf', uploaded_at: new Date() } }
      ]);

      await customersCollection.insertMany([
        {
          _id: customer1Id,
          personal_info: { name: '테스트고객복수1' },
          documents: [
            { document_id: document1Id, relationship: 'annual_report', upload_date: new Date(), notes: '' },
            { document_id: document2Id, relationship: 'contract', upload_date: new Date(), notes: '' }
          ],
          meta: { created_at: new Date(), updated_at: new Date() }
        },
        {
          _id: customer2Id,
          personal_info: { name: '테스트고객복수2' },
          documents: [
            { document_id: document2Id, relationship: 'annual_report', upload_date: new Date(), notes: '' },
            { document_id: document3Id, relationship: 'claim', upload_date: new Date(), notes: '' }
          ],
          meta: { created_at: new Date(), updated_at: new Date() }
        }
      ]);

      // When: 복수 문서 삭제 로직 실행 (document1, document2 삭제)
      const deleteDocIds = [document1Id, document2Id];

      // 고객 참조 정리 (복수 삭제 API 로직)
      const customersUpdateResult = await customersCollection.updateMany(
        { 'documents.document_id': { $in: deleteDocIds } },
        {
          $pull: { documents: { document_id: { $in: deleteDocIds } } },
          $set: { 'meta.updated_at': new Date() }
        }
      );

      // 문서 삭제
      await filesCollection.deleteMany({ _id: { $in: deleteDocIds } });

      // Then: 검증
      // 1. 2명의 고객이 업데이트되었는지 확인
      expect(customersUpdateResult.modifiedCount).toBe(2);

      // 2. customer1: documents 배열이 비어있음 (document1, document2 모두 삭제됨)
      const customer1 = await customersCollection.findOne({ _id: customer1Id });
      expect(customer1.documents).toEqual([]);

      // 3. customer2: document3만 남아있음 (document2만 삭제됨)
      const customer2 = await customersCollection.findOne({ _id: customer2Id });
      expect(customer2.documents).toHaveLength(1);
      expect(customer2.documents[0].document_id.toString()).toBe(document3Id.toString());

      // 4. document1, document2는 삭제되고 document3은 남아있음
      const doc1 = await filesCollection.findOne({ _id: document1Id });
      const doc2 = await filesCollection.findOne({ _id: document2Id });
      const doc3 = await filesCollection.findOne({ _id: document3Id });
      expect(doc1).toBeNull();
      expect(doc2).toBeNull();
      expect(doc3).not.toBeNull();
    });

    test('복수 문서 삭제 시 참조가 없는 문서도 정상 처리', async () => {
      // Given: 2개의 문서 중 1개만 고객이 참조
      const document1Id = new ObjectId();
      const document2Id = new ObjectId();
      const customerId = new ObjectId();

      // ID 추적
      createdDocumentIds.push(document1Id, document2Id);
      createdCustomerIds.push(customerId);

      await filesCollection.insertMany([
        { _id: document1Id, upload: { destPath: '/tmp/test-partial1.pdf', uploaded_at: new Date() } },
        { _id: document2Id, upload: { destPath: '/tmp/test-partial2.pdf', uploaded_at: new Date() } }
      ]);

      await customersCollection.insertOne({
        _id: customerId,
        personal_info: { name: '테스트고객부분참조' },
        documents: [
          { document_id: document1Id, relationship: 'annual_report', upload_date: new Date(), notes: '' }
        ],
        meta: { created_at: new Date(), updated_at: new Date() }
      });

      // When: 복수 문서 삭제 (document1, document2 모두 삭제)
      const deleteDocIds = [document1Id, document2Id];

      const customersUpdateResult = await customersCollection.updateMany(
        { 'documents.document_id': { $in: deleteDocIds } },
        {
          $pull: { documents: { document_id: { $in: deleteDocIds } } },
          $set: { 'meta.updated_at': new Date() }
        }
      );

      await filesCollection.deleteMany({ _id: { $in: deleteDocIds } });

      // Then: 검증
      // 1. 1명의 고객만 업데이트됨 (document2는 참조가 없었음)
      expect(customersUpdateResult.modifiedCount).toBe(1);

      // 2. 고객의 documents 배열이 비어있음
      const customer = await customersCollection.findOne({ _id: customerId });
      expect(customer.documents).toEqual([]);

      // 3. 두 문서 모두 삭제됨
      const doc1 = await filesCollection.findOne({ _id: document1Id });
      const doc2 = await filesCollection.findOne({ _id: document2Id });
      expect(doc1).toBeNull();
      expect(doc2).toBeNull();
    });

    test('20개 문서 대량 삭제 시 모든 참조 정리', async () => {
      // Given: 20개 문서, 5명의 고객이 각각 4개씩 참조
      const documentIds = Array.from({ length: 20 }, () => new ObjectId());
      const customerIds = Array.from({ length: 5 }, () => new ObjectId());

      // ID 추적
      createdDocumentIds.push(...documentIds);
      createdCustomerIds.push(...customerIds);

      await filesCollection.insertMany(
        documentIds.map((id, i) => ({
          _id: id,
          upload: { destPath: `/tmp/test-bulk-${i}.pdf`, uploaded_at: new Date() }
        }))
      );

      await customersCollection.insertMany(
        customerIds.map((id, i) => ({
          _id: id,
          personal_info: { name: `테스트고객대량${i}` },
          documents: documentIds.slice(i * 4, (i + 1) * 4).map(docId => ({
            document_id: docId,
            relationship: 'annual_report',
            upload_date: new Date(),
            notes: ''
          })),
          meta: { created_at: new Date(), updated_at: new Date() }
        }))
      );

      // When: 모든 20개 문서 삭제
      const customersUpdateResult = await customersCollection.updateMany(
        { 'documents.document_id': { $in: documentIds } },
        {
          $pull: { documents: { document_id: { $in: documentIds } } },
          $set: { 'meta.updated_at': new Date() }
        }
      );

      await filesCollection.deleteMany({ _id: { $in: documentIds } });

      // Then: 검증
      // 1. 5명의 고객 모두 업데이트됨
      expect(customersUpdateResult.modifiedCount).toBe(5);

      // 2. 모든 고객의 documents 배열이 비어있음
      const customers = await customersCollection.find({ _id: { $in: customerIds } }).toArray();
      customers.forEach(customer => {
        expect(customer.documents).toEqual([]);
      });

      // 3. 모든 문서가 삭제됨
      const remainingDocs = await filesCollection.find({ _id: { $in: documentIds } }).toArray();
      expect(remainingDocs).toEqual([]);
    });
  });
});
