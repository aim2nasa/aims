/**
 * arDeletion.test.js
 * Annual Report 문서 삭제 시 파싱 데이터 자동 삭제 유닛 테스트
 *
 * 테스트 시나리오:
 * 1. AR 문서 삭제 시 동일 발행일의 모든 AR 파싱 데이터 삭제
 * 2. AR 문서에 ar_metadata가 없는 경우 처리
 * 3. 여러 발행일의 AR 파싱 중 특정 발행일만 삭제
 * 4. 일반 문서 삭제 시 AR 파싱 데이터에 영향 없음
 */

const { ObjectId } = require('mongodb');
const { connectWithFallback, TEST_DB_NAME } = require('./testDbHelper');

const FILES_COLLECTION = 'files';
const CUSTOMERS_COLLECTION = 'customers';

describe('Annual Report 문서 삭제 시 파싱 데이터 자동 삭제', () => {
  let client;
  let db;
  let filesCollection;
  let customersCollection;

  // 테스트에서 생성한 ID 추적
  let createdDocumentIds = [];
  let createdCustomerIds = [];

  // 각 테스트 전에 MongoDB 연결
  beforeAll(async () => {
    const result = await connectWithFallback();
    client = result.client;
    db = client.db(TEST_DB_NAME);
    filesCollection = db.collection(FILES_COLLECTION);
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

    // 테스트 이름 패턴으로 남은 데이터 정리
    await customersCollection.deleteMany({ 'personal_info.name': { $regex: /^테스트AR고객/ } });
  });

  // 모든 테스트 후 연결 해제
  afterAll(async () => {
    await client.close();
  });

  describe('AR 문서 삭제 시 발행일 기반 파싱 데이터 삭제', () => {

    test('AR 문서 삭제 시 동일 발행일의 모든 AR 파싱 데이터 삭제', async () => {
      // Given: AR 문서와 해당 고객의 AR 파싱 데이터 생성
      const documentId = new ObjectId();
      const customerId = new ObjectId();
      const issueDate = '2025-08-29';

      createdDocumentIds.push(documentId);
      createdCustomerIds.push(customerId);

      // AR 문서 생성
      await filesCollection.insertOne({
        _id: documentId,
        upload: {
          originalName: '테스트AR고객보유계약현황202508.pdf',
          destPath: '/tmp/test-ar.pdf',
          uploaded_at: new Date()
        },
        ar_metadata: {
          issue_date: issueDate,
          customer_name: '테스트AR고객',
          report_title: 'Annual Review Report'
        },
        is_annual_report: true,
        customer_relation: {
          customer_id: customerId,
          relationship_type: 'annual_report'
        }
      });

      // 고객 및 AR 파싱 데이터 생성 (동일 발행일로 3개)
      await customersCollection.insertOne({
        _id: customerId,
        personal_info: { name: '테스트AR고객' },
        annual_reports: [
          {
            customer_name: '테스트AR고객',
            issue_date: new Date(issueDate),
            source_file_id: documentId,
            total_contracts: 6,
            total_monthly_premium: 1809150,
            uploaded_at: new Date(),
            parsed_at: new Date()
          },
          {
            customer_name: '테스트AR고객',
            issue_date: new Date(issueDate),
            source_file_id: new ObjectId(), // 이전 테스트로 남은 데이터 시뮬레이션
            total_contracts: 6,
            total_monthly_premium: 1809150,
            uploaded_at: new Date('2025-10-31'),
            parsed_at: new Date('2025-10-31')
          },
          {
            customer_name: '테스트AR고객',
            issue_date: new Date(issueDate),
            source_file_id: new ObjectId(), // 이전 테스트로 남은 데이터 시뮬레이션
            total_contracts: 6,
            total_monthly_premium: 1809150,
            uploaded_at: new Date('2025-10-30'),
            parsed_at: new Date('2025-10-30')
          }
        ],
        meta: {
          created_at: new Date(),
          updated_at: new Date()
        }
      });

      // When: AR 문서 삭제 로직 실행 (발행일 기반 AR 파싱 삭제)
      const arDeleteResult = await customersCollection.updateOne(
        { '_id': customerId },
        {
          $pull: { annual_reports: { issue_date: new Date(issueDate) } },
          $set: { 'meta.updated_at': new Date() }
        }
      );

      await filesCollection.deleteOne({ _id: documentId });

      // Then: 검증
      // 1. AR 파싱 데이터가 삭제되었는지 확인
      expect(arDeleteResult.modifiedCount).toBe(1);

      const customer = await customersCollection.findOne({ _id: customerId });

      // 2. 동일 발행일의 모든 AR 파싱이 삭제되었는지 확인
      expect(customer.annual_reports).toEqual([]);

      // 3. 문서가 삭제되었는지 확인
      const document = await filesCollection.findOne({ _id: documentId });
      expect(document).toBeNull();
    });

    test('여러 발행일의 AR 파싱 중 특정 발행일만 삭제', async () => {
      // Given: 서로 다른 발행일을 가진 AR 파싱 데이터
      const document1Id = new ObjectId();
      const customerId = new ObjectId();
      const issueDate1 = '2025-08-29';
      const issueDate2 = '2024-08-29';

      createdDocumentIds.push(document1Id);
      createdCustomerIds.push(customerId);

      // AR 문서 1 생성
      await filesCollection.insertOne({
        _id: document1Id,
        upload: {
          originalName: '테스트AR고객보유계약현황202508.pdf',
          destPath: '/tmp/test-ar1.pdf',
          uploaded_at: new Date()
        },
        ar_metadata: {
          issue_date: issueDate1,
          customer_name: '테스트AR고객',
          report_title: 'Annual Review Report'
        },
        is_annual_report: true,
        customer_relation: {
          customer_id: customerId,
          relationship_type: 'annual_report'
        }
      });

      // 고객 및 다른 발행일의 AR 파싱 데이터
      await customersCollection.insertOne({
        _id: customerId,
        personal_info: { name: '테스트AR고객' },
        annual_reports: [
          {
            customer_name: '테스트AR고객',
            issue_date: new Date(issueDate1),
            source_file_id: document1Id,
            total_contracts: 6,
            total_monthly_premium: 1809150,
            uploaded_at: new Date(),
            parsed_at: new Date()
          },
          {
            customer_name: '테스트AR고객',
            issue_date: new Date(issueDate2),
            source_file_id: new ObjectId(),
            total_contracts: 5,
            total_monthly_premium: 1500000,
            uploaded_at: new Date('2024-09-01'),
            parsed_at: new Date('2024-09-01')
          }
        ],
        meta: {
          created_at: new Date(),
          updated_at: new Date()
        }
      });

      // When: issueDate1의 AR 문서만 삭제
      await customersCollection.updateOne(
        { '_id': customerId },
        {
          $pull: { annual_reports: { issue_date: new Date(issueDate1) } },
          $set: { 'meta.updated_at': new Date() }
        }
      );

      await filesCollection.deleteOne({ _id: document1Id });

      // Then: 검증
      const customer = await customersCollection.findOne({ _id: customerId });

      // 1. issueDate1의 AR 파싱만 삭제되고 issueDate2는 남아있어야 함
      expect(customer.annual_reports).toHaveLength(1);
      expect(customer.annual_reports[0].issue_date.toISOString()).toContain('2024-08-29');
      expect(customer.annual_reports[0].total_monthly_premium).toBe(1500000);

      // 2. document1만 삭제되었는지 확인
      const doc1 = await filesCollection.findOne({ _id: document1Id });
      expect(doc1).toBeNull();
    });

    test('AR 문서에 ar_metadata가 없는 경우 AR 파싱 삭제 건너뜀', async () => {
      // Given: ar_metadata가 없는 AR 문서
      const documentId = new ObjectId();
      const customerId = new ObjectId();

      createdDocumentIds.push(documentId);
      createdCustomerIds.push(customerId);

      // ar_metadata 없는 AR 문서 생성
      await filesCollection.insertOne({
        _id: documentId,
        upload: {
          originalName: '테스트AR문서.pdf',
          destPath: '/tmp/test-ar-no-metadata.pdf',
          uploaded_at: new Date()
        },
        is_annual_report: true,
        customer_relation: {
          customer_id: customerId,
          relationship_type: 'annual_report'
        }
        // ar_metadata 없음
      });

      // 고객 및 AR 파싱 데이터 생성
      await customersCollection.insertOne({
        _id: customerId,
        personal_info: { name: '테스트AR고객' },
        annual_reports: [
          {
            customer_name: '테스트AR고객',
            issue_date: new Date('2025-08-29'),
            source_file_id: documentId,
            total_contracts: 6,
            total_monthly_premium: 1809150,
            uploaded_at: new Date(),
            parsed_at: new Date()
          }
        ],
        meta: {
          created_at: new Date(),
          updated_at: new Date()
        }
      });

      // When: AR 문서 삭제 (ar_metadata 없으므로 AR 파싱 삭제 건너뜀)
      const document = await filesCollection.findOne({ _id: documentId });
      const issueDate = document.ar_metadata?.issue_date; // undefined

      if (issueDate) {
        await customersCollection.updateOne(
          { '_id': customerId },
          {
            $pull: { annual_reports: { issue_date: new Date(issueDate) } },
            $set: { 'meta.updated_at': new Date() }
          }
        );
      }

      await filesCollection.deleteOne({ _id: documentId });

      // Then: 검증
      const customer = await customersCollection.findOne({ _id: customerId });

      // 1. AR 파싱 데이터가 삭제되지 않았어야 함 (issue_date 정보가 없어서)
      expect(customer.annual_reports).toHaveLength(1);

      // 2. 문서는 삭제되었는지 확인
      const deletedDoc = await filesCollection.findOne({ _id: documentId });
      expect(deletedDoc).toBeNull();
    });

    test('일반 문서 삭제 시 AR 파싱 데이터에 영향 없음', async () => {
      // Given: 일반 문서와 AR 파싱 데이터
      const normalDocId = new ObjectId();
      const customerId = new ObjectId();

      createdDocumentIds.push(normalDocId);
      createdCustomerIds.push(customerId);

      // 일반 문서 생성 (is_annual_report: false)
      await filesCollection.insertOne({
        _id: normalDocId,
        upload: {
          originalName: '일반문서.pdf',
          destPath: '/tmp/normal-doc.pdf',
          uploaded_at: new Date()
        },
        is_annual_report: false,
        customer_relation: {
          customer_id: customerId,
          relationship_type: 'contract'
        }
      });

      // 고객 및 AR 파싱 데이터 (유지되어야 함)
      await customersCollection.insertOne({
        _id: customerId,
        personal_info: { name: '테스트AR고객' },
        annual_reports: [
          {
            customer_name: '테스트AR고객',
            issue_date: new Date('2025-08-29'),
            source_file_id: new ObjectId(),
            total_contracts: 6,
            total_monthly_premium: 1809150,
            uploaded_at: new Date(),
            parsed_at: new Date()
          }
        ],
        meta: {
          created_at: new Date(),
          updated_at: new Date()
        }
      });

      // When: 일반 문서 삭제 (AR 파싱 삭제 로직은 실행 안됨)
      const document = await filesCollection.findOne({ _id: normalDocId });

      if (document.is_annual_report && document.ar_metadata?.issue_date) {
        // AR 문서가 아니므로 이 블록은 실행되지 않음
        await customersCollection.updateOne(
          { '_id': customerId },
          {
            $pull: { annual_reports: { issue_date: new Date(document.ar_metadata.issue_date) } },
            $set: { 'meta.updated_at': new Date() }
          }
        );
      }

      await filesCollection.deleteOne({ _id: normalDocId });

      // Then: 검증
      const customer = await customersCollection.findOne({ _id: customerId });

      // 1. AR 파싱 데이터가 그대로 유지되어야 함
      expect(customer.annual_reports).toHaveLength(1);
      expect(customer.annual_reports[0].total_monthly_premium).toBe(1809150);

      // 2. 일반 문서는 삭제되었는지 확인
      const deletedDoc = await filesCollection.findOne({ _id: normalDocId });
      expect(deletedDoc).toBeNull();
    });

    test('AR 문서 삭제 시 meta.updated_at 갱신 확인', async () => {
      // Given: AR 문서와 고객 생성 (초기 updated_at 설정)
      const documentId = new ObjectId();
      const customerId = new ObjectId();
      const issueDate = '2025-08-29';
      const initialUpdateTime = new Date('2025-01-01T00:00:00Z');

      createdDocumentIds.push(documentId);
      createdCustomerIds.push(customerId);

      await filesCollection.insertOne({
        _id: documentId,
        upload: {
          originalName: '테스트AR문서.pdf',
          destPath: '/tmp/test-ar.pdf',
          uploaded_at: new Date()
        },
        ar_metadata: {
          issue_date: issueDate,
          customer_name: '테스트AR고객',
          report_title: 'Annual Review Report'
        },
        is_annual_report: true,
        customer_relation: {
          customer_id: customerId,
          relationship_type: 'annual_report'
        }
      });

      await customersCollection.insertOne({
        _id: customerId,
        personal_info: { name: '테스트AR고객' },
        annual_reports: [
          {
            customer_name: '테스트AR고객',
            issue_date: new Date(issueDate),
            source_file_id: documentId,
            total_contracts: 6,
            total_monthly_premium: 1809150,
            uploaded_at: new Date(),
            parsed_at: new Date()
          }
        ],
        meta: {
          created_at: initialUpdateTime,
          updated_at: initialUpdateTime
        }
      });

      // 약간의 시간 대기
      await new Promise(resolve => setTimeout(resolve, 10));

      // When: AR 문서 삭제 로직 실행
      await customersCollection.updateOne(
        { '_id': customerId },
        {
          $pull: { annual_reports: { issue_date: new Date(issueDate) } },
          $set: { 'meta.updated_at': new Date() }
        }
      );

      await filesCollection.deleteOne({ _id: documentId });

      // Then: 검증
      const customer = await customersCollection.findOne({ _id: customerId });

      // meta.updated_at이 갱신되었는지 확인
      expect(customer.meta.updated_at.getTime()).toBeGreaterThan(initialUpdateTime.getTime());

      // AR 파싱 데이터가 삭제되었는지 확인
      expect(customer.annual_reports).toEqual([]);
    });
  });

  describe('AR 삭제 에러 처리', () => {

    test('고객 ID가 없는 AR 문서 삭제 시 오류 없이 진행', async () => {
      // Given: customer_relation이 없는 AR 문서
      const documentId = new ObjectId();

      createdDocumentIds.push(documentId);

      await filesCollection.insertOne({
        _id: documentId,
        upload: {
          originalName: '고아AR문서.pdf',
          destPath: '/tmp/orphan-ar.pdf',
          uploaded_at: new Date()
        },
        ar_metadata: {
          issue_date: '2025-08-29',
          customer_name: '알수없음',
          report_title: 'Annual Review Report'
        },
        is_annual_report: true
        // customer_relation 없음
      });

      // When: AR 문서 삭제 (customer_id 없어서 AR 파싱 삭제 건너뜀)
      const document = await filesCollection.findOne({ _id: documentId });
      const customerId = document.customer_relation?.customer_id; // undefined

      if (customerId && document.ar_metadata?.issue_date) {
        // customerId가 없으므로 이 블록은 실행 안됨
        await customersCollection.updateOne(
          { '_id': customerId },
          {
            $pull: { annual_reports: { issue_date: new Date(document.ar_metadata.issue_date) } },
            $set: { 'meta.updated_at': new Date() }
          }
        );
      }

      await filesCollection.deleteOne({ _id: documentId });

      // Then: 검증
      // 문서가 정상적으로 삭제되었는지 확인 (오류 없이)
      const deletedDoc = await filesCollection.findOne({ _id: documentId });
      expect(deletedDoc).toBeNull();
    });
  });
});
