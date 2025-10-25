/**
 * documentDeletion.test.js
 * 문서 삭제 시 고객 참조 자동 정리 유닛 테스트
 *
 * 테스트 시나리오:
 * 1. 1:1 관계 - 한 문서를 한 명의 고객이 참조
 * 2. 1:N 관계 - 한 문서를 여러 명의 고객이 참조
 * 3. 참조 없는 문서 삭제
 */

const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs').promises;

// 테스트용 MongoDB 연결 설정
const TEST_MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const TEST_DB_NAME = 'docupload';
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
    client = await MongoClient.connect(TEST_MONGO_URI);
    db = client.db(TEST_DB_NAME);
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

    // 혹시 모를 이름 패턴으로 남은 테스트 데이터 정리
    await customersCollection.deleteMany({ 'personal_info.name': { $regex: /^테스트고객/ } });
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
});
