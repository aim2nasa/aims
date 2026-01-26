/**
 * cascadingDelete.test.js
 * 엔티티 삭제 시 참조 자동 정리 (Cascading Delete) 유닛 테스트
 *
 * 테스트 시나리오:
 * 1. 고객 삭제 시 계약, 관계, 문서 참조 정리
 * 2. 계약 삭제 시 고객 역참조 정리
 * 3. 계약 벌크 삭제 시 고객 역참조 정리
 */

const { MongoClient, ObjectId } = require('mongodb');

// 테스트용 MongoDB 연결 설정
const TEST_MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const TEST_DB_NAME = 'docupload';

describe('Cascading Delete 테스트', () => {
  let client;
  let db;
  let customersCollection;
  let contractsCollection;
  let filesCollection;
  let relationshipsCollection;

  // 테스트에서 생성한 ID 추적
  let createdCustomerIds = [];
  let createdContractIds = [];
  let createdFileIds = [];
  let createdRelationshipIds = [];

  beforeAll(async () => {
    client = await MongoClient.connect(TEST_MONGO_URI);
    db = client.db(TEST_DB_NAME);
    customersCollection = db.collection('customers');
    contractsCollection = db.collection('contracts');
    filesCollection = db.collection('files');
    relationshipsCollection = db.collection('customer_relationships');
  });

  beforeEach(() => {
    createdCustomerIds = [];
    createdContractIds = [];
    createdFileIds = [];
    createdRelationshipIds = [];
  });

  afterEach(async () => {
    // 테스트 데이터 정리 (ID 기반으로만 삭제 - regex 삭제는 afterAll로 이동)
    if (createdCustomerIds.length > 0) {
      await customersCollection.deleteMany({ _id: { $in: createdCustomerIds } });
    }
    if (createdContractIds.length > 0) {
      await contractsCollection.deleteMany({ _id: { $in: createdContractIds } });
    }
    if (createdFileIds.length > 0) {
      await filesCollection.deleteMany({ _id: { $in: createdFileIds } });
    }
    if (createdRelationshipIds.length > 0) {
      await relationshipsCollection.deleteMany({ _id: { $in: createdRelationshipIds } });
    }
  });

  afterAll(async () => {
    // ID 기반 정리는 afterEach에서 처리됨
    // regex 삭제는 다른 테스트 파일과 충돌할 수 있어 제거
    await client.close();
  });

  describe('고객 삭제 시 Cascading Delete', () => {

    test('고객 삭제 시 해당 고객의 계약이 모두 삭제됨', async () => {
      // Given: 고객 1명과 계약 3개
      const customerId = new ObjectId();
      const contract1Id = new ObjectId();
      const contract2Id = new ObjectId();
      const contract3Id = new ObjectId();

      createdCustomerIds.push(customerId);
      createdContractIds.push(contract1Id, contract2Id, contract3Id);

      await customersCollection.insertOne({
        _id: customerId,
        personal_info: { name: '테스트고객_캐스케이드1' },
        contracts: [],
        documents: [],
        meta: { created_at: new Date(), updated_at: new Date(), created_by: 'test-user' }
      });

      await contractsCollection.insertMany([
        { _id: contract1Id, customer_id: customerId.toString(), product_name: '상품1' },
        { _id: contract2Id, customer_id: customerId.toString(), product_name: '상품2' },
        { _id: contract3Id, customer_id: customerId.toString(), product_name: '상품3' }
      ]);

      // When: 고객 삭제 로직 실행 (계약 삭제 포함)
      const contractsDeleteResult = await contractsCollection.deleteMany({
        customer_id: customerId.toString()
      });

      await customersCollection.deleteOne({ _id: customerId });

      // Then: 검증
      // 1. 3개의 계약이 삭제됨
      expect(contractsDeleteResult.deletedCount).toBe(3);

      // 2. 해당 고객의 계약이 없음
      const remainingContracts = await contractsCollection.find({
        customer_id: customerId.toString()
      }).toArray();
      expect(remainingContracts).toEqual([]);

      // 3. 고객도 삭제됨
      const customer = await customersCollection.findOne({ _id: customerId });
      expect(customer).toBeNull();
    });

    test('고객 삭제 시 문서의 customer_relation.customer_id가 정리됨', async () => {
      // Given: 고객 1명과 해당 고객을 참조하는 문서 2개
      const customerId = new ObjectId();
      const file1Id = new ObjectId();
      const file2Id = new ObjectId();

      createdCustomerIds.push(customerId);
      createdFileIds.push(file1Id, file2Id);

      await customersCollection.insertOne({
        _id: customerId,
        personal_info: { name: '테스트고객_캐스케이드2' },
        documents: [
          { document_id: file1Id, relationship: 'annual_report' },
          { document_id: file2Id, relationship: 'contract' }
        ],
        meta: { created_at: new Date(), updated_at: new Date(), created_by: 'test-user' }
      });

      await filesCollection.insertMany([
        {
          _id: file1Id,
          upload: { destPath: '/tmp/test1.pdf' },
          customer_relation: { customer_id: customerId }
        },
        {
          _id: file2Id,
          upload: { destPath: '/tmp/test2.pdf' },
          customer_relation: { customer_id: customerId }
        }
      ]);

      // When: 고객 삭제 로직 실행 (문서 참조 정리 포함)
      const filesUpdateResult = await filesCollection.updateMany(
        { 'customer_relation.customer_id': customerId },
        {
          $unset: { 'customer_relation.customer_id': '' },
          $set: { 'meta.updated_at': new Date() }
        }
      );

      await customersCollection.deleteOne({ _id: customerId });

      // Then: 검증
      // 1. 2개의 문서가 업데이트됨
      expect(filesUpdateResult.modifiedCount).toBe(2);

      // 2. 문서의 customer_relation.customer_id가 제거됨
      const file1 = await filesCollection.findOne({ _id: file1Id });
      const file2 = await filesCollection.findOne({ _id: file2Id });

      expect(file1.customer_relation.customer_id).toBeUndefined();
      expect(file2.customer_relation.customer_id).toBeUndefined();

      // 3. 문서 자체는 삭제되지 않음 (참조만 제거)
      expect(file1).not.toBeNull();
      expect(file2).not.toBeNull();
    });

    test('고객 삭제 시 customer_relationships가 모두 삭제됨', async () => {
      // Given: 고객 2명과 관계 레코드
      const customer1Id = new ObjectId();
      const customer2Id = new ObjectId();
      const relationship1Id = new ObjectId();
      const relationship2Id = new ObjectId();

      createdCustomerIds.push(customer1Id, customer2Id);
      createdRelationshipIds.push(relationship1Id, relationship2Id);

      await customersCollection.insertMany([
        {
          _id: customer1Id,
          personal_info: { name: '테스트고객_캐스케이드3A' },
          meta: { created_at: new Date(), updated_at: new Date(), created_by: 'test-user' }
        },
        {
          _id: customer2Id,
          personal_info: { name: '테스트고객_캐스케이드3B' },
          meta: { created_at: new Date(), updated_at: new Date(), created_by: 'test-user' }
        }
      ]);

      await relationshipsCollection.insertMany([
        {
          _id: relationship1Id,
          from_customer: customer1Id,
          related_customer: customer2Id,
          relationship_type: 'spouse'
        },
        {
          _id: relationship2Id,
          from_customer: customer2Id,
          related_customer: customer1Id,
          relationship_type: 'spouse'
        }
      ]);

      // When: customer1 삭제 로직 실행 (관계 삭제 포함)
      const relationshipsDeleteResult = await relationshipsCollection.deleteMany({
        $or: [
          { from_customer: customer1Id },
          { related_customer: customer1Id }
        ]
      });

      await customersCollection.deleteOne({ _id: customer1Id });

      // Then: 검증
      // 1. 2개의 관계가 모두 삭제됨 (양방향)
      expect(relationshipsDeleteResult.deletedCount).toBe(2);

      // 2. customer1과 관련된 관계가 없음
      const remainingRelationships = await relationshipsCollection.find({
        $or: [
          { from_customer: customer1Id },
          { related_customer: customer1Id }
        ]
      }).toArray();
      expect(remainingRelationships).toEqual([]);
    });
  });

  describe('계약 삭제 시 Cascading Delete', () => {

    test('계약 삭제 시 고객의 contracts 배열에서 참조 제거', async () => {
      // Given: 고객 1명과 계약 2개 (contracts 배열에 참조 있음)
      const customerId = new ObjectId();
      const contract1Id = new ObjectId();
      const contract2Id = new ObjectId();

      // 테스트 격리를 위한 고유 접미사
      const testSuffix = `_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      createdCustomerIds.push(customerId);
      createdContractIds.push(contract1Id, contract2Id);

      const insertResult = await customersCollection.insertOne({
        _id: customerId,
        personal_info: { name: `테스트고객_캐스케이드4${testSuffix}` },
        contracts: [
          { contract_id: contract1Id, policy_number: '10001' },
          { contract_id: contract2Id, policy_number: '10002' }
        ],
        meta: { created_at: new Date(), updated_at: new Date() }
      });

      // 삽입 확인
      expect(insertResult.acknowledged).toBe(true);

      await contractsCollection.insertMany([
        { _id: contract1Id, customer_id: customerId.toString(), product_name: '상품1' },
        { _id: contract2Id, customer_id: customerId.toString(), product_name: '상품2' }
      ]);

      // 삽입 직후 검증
      const verifyCustomer = await customersCollection.findOne({ _id: customerId });
      expect(verifyCustomer).not.toBeNull();

      // When: contract1 삭제 로직 실행 (고객 역참조 정리 포함)
      await customersCollection.updateOne(
        { _id: customerId },
        {
          $pull: { contracts: { contract_id: contract1Id } },
          $set: { 'meta.updated_at': new Date() }
        }
      );

      await contractsCollection.deleteOne({ _id: contract1Id });

      // Then: 검증
      const customer = await customersCollection.findOne({ _id: customerId });

      // 고객이 존재하는지 확인
      expect(customer).not.toBeNull();

      // 1. contracts 배열에 contract2만 남음
      expect(customer.contracts).toHaveLength(1);
      expect(customer.contracts[0].contract_id.toString()).toBe(contract2Id.toString());

      // 2. contract1은 삭제됨
      const contract1 = await contractsCollection.findOne({ _id: contract1Id });
      expect(contract1).toBeNull();

      // 3. contract2는 남아있음
      const contract2 = await contractsCollection.findOne({ _id: contract2Id });
      expect(contract2).not.toBeNull();
    });

    test('계약 벌크 삭제 시 모든 고객의 contracts 배열에서 참조 제거', async () => {
      // Given: 고객 2명, 각각 계약 2개씩
      const customer1Id = new ObjectId();
      const customer2Id = new ObjectId();
      const contract1Id = new ObjectId();
      const contract2Id = new ObjectId();
      const contract3Id = new ObjectId();
      const contract4Id = new ObjectId();

      // 테스트 격리를 위한 고유 접미사 (timestamp + random)
      const testSuffix = `_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      createdCustomerIds.push(customer1Id, customer2Id);
      createdContractIds.push(contract1Id, contract2Id, contract3Id, contract4Id);

      const customersInsertResult = await customersCollection.insertMany([
        {
          _id: customer1Id,
          personal_info: { name: `테스트고객_캐스케이드5A${testSuffix}` },
          contracts: [
            { contract_id: contract1Id, policy_number: '20001' },
            { contract_id: contract2Id, policy_number: '20002' }
          ],
          meta: { created_at: new Date(), updated_at: new Date() }
        },
        {
          _id: customer2Id,
          personal_info: { name: `테스트고객_캐스케이드5B${testSuffix}` },
          contracts: [
            { contract_id: contract3Id, policy_number: '20003' },
            { contract_id: contract4Id, policy_number: '20004' }
          ],
          meta: { created_at: new Date(), updated_at: new Date() }
        }
      ]);

      // 고객 삽입 성공 확인
      expect(customersInsertResult.insertedCount).toBe(2);

      // 삽입 직후 검증 - 데이터가 실제로 저장되었는지 확인
      const verifyCustomer1 = await customersCollection.findOne({ _id: customer1Id });
      const verifyCustomer2 = await customersCollection.findOne({ _id: customer2Id });
      expect(verifyCustomer1).not.toBeNull();
      expect(verifyCustomer2).not.toBeNull();

      const contractsInsertResult = await contractsCollection.insertMany([
        { _id: contract1Id, customer_id: customer1Id.toString(), product_name: '상품1' },
        { _id: contract2Id, customer_id: customer1Id.toString(), product_name: '상품2' },
        { _id: contract3Id, customer_id: customer2Id.toString(), product_name: '상품3' },
        { _id: contract4Id, customer_id: customer2Id.toString(), product_name: '상품4' }
      ]);

      // 계약 삽입 성공 확인
      expect(contractsInsertResult.insertedCount).toBe(4);

      // When: contract1, contract3 벌크 삭제 (고객 역참조 정리 포함)
      const deleteIds = [contract1Id, contract3Id];

      // 삭제할 계약들의 customer_id 조회
      const contracts = await contractsCollection.find({
        _id: { $in: deleteIds }
      }, { projection: { customer_id: 1 } }).toArray();

      const customerIds = contracts.map(c => new ObjectId(c.customer_id));

      // 고객의 contracts 배열에서 참조 제거
      await customersCollection.updateMany(
        { _id: { $in: customerIds } },
        {
          $pull: { contracts: { contract_id: { $in: deleteIds } } },
          $set: { 'meta.updated_at': new Date() }
        }
      );

      // 계약 삭제
      await contractsCollection.deleteMany({ _id: { $in: deleteIds } });

      // Then: 검증
      const customer1 = await customersCollection.findOne({ _id: customer1Id });
      const customer2 = await customersCollection.findOne({ _id: customer2Id });

      // 고객이 존재하는지 확인 (디버깅용)
      expect(customer1).not.toBeNull();
      expect(customer2).not.toBeNull();

      // 1. customer1의 contracts 배열에 contract2만 남음
      expect(customer1.contracts).toHaveLength(1);
      expect(customer1.contracts[0].contract_id.toString()).toBe(contract2Id.toString());

      // 2. customer2의 contracts 배열에 contract4만 남음
      expect(customer2.contracts).toHaveLength(1);
      expect(customer2.contracts[0].contract_id.toString()).toBe(contract4Id.toString());

      // 3. 삭제된 계약들 확인
      const deletedContracts = await contractsCollection.find({
        _id: { $in: deleteIds }
      }).toArray();
      expect(deletedContracts).toEqual([]);
    });
  });
});
