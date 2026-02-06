/**
 * testDataFactory.js
 * Contract 테스트용 데이터 생성/정리 팩토리
 *
 * 각 테스트 스위트가 독립된 TestDataFactory 인스턴스를 사용하여
 * 테스트 간 데이터 충돌을 방지.
 *
 * @since 2026-02-07
 */

const { ObjectId } = require('mongodb');

const TEST_PREFIX = '__refactor_test__';

class TestDataFactory {
  constructor(db) {
    this.db = db;
    this.created = {
      customers: [],
      files: [],
      contracts: [],
    };
  }

  /**
   * 테스트용 고객 생성
   */
  async createCustomer(userId, overrides = {}) {
    const id = new ObjectId();
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const customer = {
      _id: id,
      personal_info: {
        name: `${TEST_PREFIX}${uniqueSuffix}`,
        mobile_phone: '010-0000-0000',
        ...(overrides.personal_info || {}),
      },
      insurance_info: {
        customer_type: '개인',
        ...(overrides.insurance_info || {}),
      },
      meta: {
        created_by: userId,
        created_at: new Date(),
        updated_at: new Date(),
        status: 'active',
        ...(overrides.meta || {}),
      },
      documents: [],
      contracts: [],
      deleted_at: null,
    };

    await this.db.collection('customers').insertOne(customer);
    this.created.customers.push(id);
    return customer;
  }

  /**
   * 테스트용 문서 생성
   */
  async createDocument(userId, customerId = null, overrides = {}) {
    const id = new ObjectId();
    const doc = {
      _id: id,
      ownerId: userId,
      customerId: customerId,
      upload: {
        originalName: `${TEST_PREFIX}test-doc.pdf`,
        mimeType: 'application/pdf',
        size: 1024,
        uploaded_at: new Date(),
        destPath: '/tmp/test.pdf',
        ...(overrides.upload || {}),
      },
      meta: {
        status: 'completed',
        ...(overrides.meta || {}),
      },
      embed: {
        status: 'completed',
        ...(overrides.embed || {}),
      },
    };

    await this.db.collection('files').insertOne(doc);
    this.created.files.push(id);
    return doc;
  }

  /**
   * 테스트용 계약 생성
   */
  async createContract(userId, customerId, overrides = {}) {
    const id = new ObjectId();
    const contract = {
      _id: id,
      userId: userId,
      customer_id: customerId.toString(),
      policy_number: `${TEST_PREFIX}POL-${Date.now()}`,
      product_name: 'Test Insurance',
      insurer_name: 'Test Insurer',
      contract_status: 'active',
      ...overrides,
    };

    await this.db.collection('contracts').insertOne(contract);
    this.created.contracts.push(id);
    return contract;
  }

  /**
   * 이 팩토리가 생성한 모든 테스트 데이터 정리
   */
  async cleanup() {
    const { customers, files, contracts } = this.created;

    if (files.length > 0) {
      await this.db.collection('files').deleteMany({ _id: { $in: files } });
    }
    if (contracts.length > 0) {
      await this.db.collection('contracts').deleteMany({ _id: { $in: contracts } });
    }
    if (customers.length > 0) {
      await this.db.collection('customers').deleteMany({ _id: { $in: customers } });
    }
  }
}

module.exports = { TestDataFactory, TEST_PREFIX };
