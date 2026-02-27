/**
 * 일괄등록 API 테스트
 * @description MongoDB null 필드 업데이트 시나리오 검증
 * @since 2025-12-04
 */

const { ObjectId } = require('mongodb');
const { connectWithFallback } = require('./testDbHelper');

// 테스트 설정
const TEST_CONFIG = {
  DB_NAME: 'aims_test',
};

// MongoDB 클라이언트
let mongoClient = null;
let db = null;
let customersCollection = null;
let contractsCollection = null;

// 테스트용 사용자 ID
const TEST_USER_ID = new ObjectId();

/**
 * 테스트 전 설정
 */
beforeAll(async () => {
  const result = await connectWithFallback();
  mongoClient = result.client;
  db = mongoClient.db(TEST_CONFIG.DB_NAME);
  customersCollection = db.collection('customers_bulk_test');
  contractsCollection = db.collection('contracts_bulk_test');
});

/**
 * 각 테스트 전 컬렉션 초기화
 */
beforeEach(async () => {
  await customersCollection.deleteMany({});
  await contractsCollection.deleteMany({});
});

/**
 * 테스트 후 정리
 */
afterAll(async () => {
  if (db) {
    await db.collection('customers_bulk_test').drop().catch(() => {});
    await db.collection('contracts_bulk_test').drop().catch(() => {});
  }
  if (mongoClient) {
    await mongoClient.close();
  }
});

/**
 * 고객 업데이트 로직 시뮬레이션 (server.js와 동일)
 */
function simulateCustomerUpdate(existingCustomer, customer) {
  const changes = [];
  const updateFields = {};

  const hasPersonalInfo = existingCustomer.personal_info !== null && existingCustomer.personal_info !== undefined;
  const hasInsuranceInfo = existingCustomer.insurance_info !== null && existingCustomer.insurance_info !== undefined;
  const hasMeta = existingCustomer.meta !== null && existingCustomer.meta !== undefined;

  // 연락처 비교/업데이트
  if (customer.mobile_phone && customer.mobile_phone !== existingCustomer.personal_info?.mobile_phone) {
    if (hasPersonalInfo) {
      updateFields['personal_info.mobile_phone'] = customer.mobile_phone;
    } else {
      updateFields['personal_info'] = { name: existingCustomer.personal_info?.name || customer.name, mobile_phone: customer.mobile_phone };
    }
    changes.push('연락처');
  }

  // 주소 비교/업데이트
  if (customer.address && customer.address !== existingCustomer.personal_info?.address?.address1) {
    if (!hasPersonalInfo) {
      updateFields['personal_info'] = { name: existingCustomer.personal_info?.name || customer.name, address: { address1: customer.address } };
    } else if (existingCustomer.personal_info?.address === null || existingCustomer.personal_info?.address === undefined) {
      updateFields['personal_info.address'] = { address1: customer.address };
    } else {
      updateFields['personal_info.address.address1'] = customer.address;
    }
    changes.push('주소');
  }
  // 주소 명시적 삭제: 엑셀에 주소 칼럼이 있지만 값이 비어있는 경우
  else if (customer.address === '' && existingCustomer.personal_info?.address) {
    if (hasPersonalInfo) {
      updateFields['personal_info.address'] = null;
      changes.push('주소 삭제');
    }
  }

  // 성별 비교/업데이트
  if (customer.gender) {
    const normalizedGender = customer.gender === '남' || customer.gender === 'M' ? 'M' :
                             customer.gender === '여' || customer.gender === 'F' ? 'F' : null;
    if (normalizedGender && normalizedGender !== existingCustomer.personal_info?.gender) {
      if (hasPersonalInfo) {
        updateFields['personal_info.gender'] = normalizedGender;
      } else {
        updateFields['personal_info'] = { name: existingCustomer.personal_info?.name || customer.name, gender: normalizedGender };
      }
      changes.push('성별');
    }
  }

  // 생년월일 비교/업데이트
  if (customer.birth_date && customer.birth_date !== existingCustomer.personal_info?.birth_date) {
    if (hasPersonalInfo) {
      updateFields['personal_info.birth_date'] = customer.birth_date;
    } else {
      updateFields['personal_info'] = { name: existingCustomer.personal_info?.name || customer.name, birth_date: customer.birth_date };
    }
    changes.push('생년월일');
  }

  // 고객 유형 비교/업데이트
  if (customer.customer_type && customer.customer_type !== existingCustomer.insurance_info?.customer_type) {
    if (hasInsuranceInfo) {
      updateFields['insurance_info.customer_type'] = customer.customer_type;
    } else {
      updateFields['insurance_info'] = { customer_type: customer.customer_type };
    }
    changes.push('고객유형');
  }

  if (changes.length > 0) {
    if (hasMeta) {
      updateFields['meta.updated_at'] = new Date();
      updateFields['meta.last_modified_by'] = TEST_USER_ID;
    } else {
      updateFields['meta'] = { updated_at: new Date(), last_modified_by: TEST_USER_ID };
    }
  }

  return { changes, updateFields };
}

/**
 * 계약 업데이트 로직 시뮬레이션
 */
function simulateContractUpdate(existingContract, contract) {
  const changes = [];
  const updateFields = {};

  const newPremium = Number(contract.premium) || 0;
  if (newPremium && newPremium !== existingContract.premium) {
    updateFields.premium = newPremium;
    changes.push('보험료');
  }

  if (contract.payment_day !== undefined && contract.payment_day !== existingContract.payment_day) {
    updateFields.payment_day = contract.payment_day;
    changes.push('이체일');
  }

  if (changes.length > 0) {
    if (existingContract.meta !== null && existingContract.meta !== undefined) {
      updateFields['meta.updated_at'] = new Date();
    } else {
      updateFields['meta'] = { updated_at: new Date() };
    }
  }

  return { changes, updateFields };
}

// =============================================================================
// 고객 일괄등록 - null 필드 업데이트 테스트
// =============================================================================

describe('고객 일괄등록 - MongoDB null 필드 업데이트', () => {

  test('시나리오 1: personal_info가 null인 고객 업데이트', async () => {
    // Given: personal_info가 null인 고객
    const insertResult = await customersCollection.insertOne({
      personal_info: null,
      insurance_info: { customer_type: '개인' },
      meta: { created_at: new Date(), status: 'active' }
    });

    const existingDoc = await customersCollection.findOne({ _id: insertResult.insertedId });
    expect(existingDoc.personal_info).toBeNull();

    // When: 업데이트 시도
    const updateData = {
      name: '테스트고객1',
      mobile_phone: '010-1234-5678',
      address: '서울시 강남구'
    };

    const { changes, updateFields } = simulateCustomerUpdate(existingDoc, updateData);

    // Then: personal_info 전체를 설정해야 함 (중첩 필드가 아닌)
    expect(changes.length).toBeGreaterThan(0);
    expect(updateFields['personal_info']).toBeDefined();
    expect(updateFields['personal_info.mobile_phone']).toBeUndefined();

    // 실제 업데이트 수행
    await customersCollection.updateOne(
      { _id: insertResult.insertedId },
      { $set: updateFields }
    );

    const updatedDoc = await customersCollection.findOne({ _id: insertResult.insertedId });
    expect(updatedDoc.personal_info).not.toBeNull();
  });

  test('시나리오 2: personal_info.address가 null인 고객 업데이트', async () => {
    // Given: address가 null인 고객
    const insertResult = await customersCollection.insertOne({
      personal_info: { name: '테스트고객2', address: null },
      insurance_info: { customer_type: '개인' },
      meta: { created_at: new Date(), status: 'active' }
    });

    const existingDoc = await customersCollection.findOne({ _id: insertResult.insertedId });
    expect(existingDoc.personal_info.address).toBeNull();

    // When: 주소 업데이트
    const updateData = {
      name: '테스트고객2',
      address: '서울시 서초구'
    };

    const { changes, updateFields } = simulateCustomerUpdate(existingDoc, updateData);

    // Then: personal_info.address 전체를 설정해야 함
    expect(changes).toContain('주소');
    expect(updateFields['personal_info.address']).toBeDefined();
    expect(updateFields['personal_info.address.address1']).toBeUndefined();

    // 실제 업데이트 수행
    await customersCollection.updateOne(
      { _id: insertResult.insertedId },
      { $set: updateFields }
    );

    const updatedDoc = await customersCollection.findOne({ _id: insertResult.insertedId });
    expect(updatedDoc.personal_info.address).not.toBeNull();
    expect(updatedDoc.personal_info.address.address1).toBe('서울시 서초구');
  });

  test('시나리오 3: insurance_info가 null인 고객 업데이트', async () => {
    // Given: insurance_info가 null인 고객
    const insertResult = await customersCollection.insertOne({
      personal_info: { name: '테스트고객3' },
      insurance_info: null,
      meta: { created_at: new Date(), status: 'active' }
    });

    const existingDoc = await customersCollection.findOne({ _id: insertResult.insertedId });
    expect(existingDoc.insurance_info).toBeNull();

    // When: 고객유형 업데이트
    const updateData = {
      name: '테스트고객3',
      customer_type: '법인'
    };

    const { changes, updateFields } = simulateCustomerUpdate(existingDoc, updateData);

    // Then: insurance_info 전체를 설정해야 함
    expect(changes).toContain('고객유형');
    expect(updateFields['insurance_info']).toBeDefined();
    expect(updateFields['insurance_info.customer_type']).toBeUndefined();

    // 실제 업데이트 수행
    await customersCollection.updateOne(
      { _id: insertResult.insertedId },
      { $set: updateFields }
    );

    const updatedDoc = await customersCollection.findOne({ _id: insertResult.insertedId });
    expect(updatedDoc.insurance_info).not.toBeNull();
    expect(updatedDoc.insurance_info.customer_type).toBe('법인');
  });

  test('시나리오 4: meta가 null인 고객 업데이트', async () => {
    // Given: meta가 null인 고객
    const insertResult = await customersCollection.insertOne({
      personal_info: { name: '테스트고객4' },
      insurance_info: { customer_type: '개인' },
      meta: null
    });

    const existingDoc = await customersCollection.findOne({ _id: insertResult.insertedId });
    expect(existingDoc.meta).toBeNull();

    // When: 연락처 업데이트 (meta도 함께 업데이트됨)
    const updateData = {
      name: '테스트고객4',
      mobile_phone: '010-9999-8888'
    };

    const { changes, updateFields } = simulateCustomerUpdate(existingDoc, updateData);

    // Then: meta 전체를 설정해야 함
    expect(changes).toContain('연락처');
    expect(updateFields['meta']).toBeDefined();
    expect(updateFields['meta.updated_at']).toBeUndefined();

    // 실제 업데이트 수행
    await customersCollection.updateOne(
      { _id: insertResult.insertedId },
      { $set: updateFields }
    );

    const updatedDoc = await customersCollection.findOne({ _id: insertResult.insertedId });
    expect(updatedDoc.meta).not.toBeNull();
    expect(updatedDoc.meta.updated_at).toBeDefined();
  });

  test('시나리오 5: 모든 필드가 null인 고객 업데이트', async () => {
    // Given: 모든 필드가 null인 고객
    const insertResult = await customersCollection.insertOne({
      personal_info: null,
      insurance_info: null,
      meta: null
    });

    const existingDoc = await customersCollection.findOne({ _id: insertResult.insertedId });

    // When: 전체 업데이트
    const updateData = {
      name: '테스트고객5',
      mobile_phone: '010-1111-2222',
      address: '부산시 해운대구',
      gender: '여',
      birth_date: '1985-05-15',
      customer_type: '개인'
    };

    const { changes, updateFields } = simulateCustomerUpdate(existingDoc, updateData);

    // Then: 모든 부모 필드를 전체로 설정해야 함
    expect(changes.length).toBeGreaterThan(0);
    expect(updateFields['personal_info']).toBeDefined();
    expect(updateFields['insurance_info']).toBeDefined();
    expect(updateFields['meta']).toBeDefined();

    // 실제 업데이트 수행
    await customersCollection.updateOne(
      { _id: insertResult.insertedId },
      { $set: updateFields }
    );

    const updatedDoc = await customersCollection.findOne({ _id: insertResult.insertedId });
    expect(updatedDoc.personal_info).not.toBeNull();
    expect(updatedDoc.insurance_info).not.toBeNull();
    expect(updatedDoc.meta).not.toBeNull();
  });

  test('시나리오 6: 정상적인 고객 (null 필드 없음) 업데이트', async () => {
    // Given: 모든 필드가 정상인 고객
    const insertResult = await customersCollection.insertOne({
      personal_info: { name: '테스트고객6', address: { address1: '기존주소' } },
      insurance_info: { customer_type: '개인' },
      meta: { created_at: new Date() }
    });

    const existingDoc = await customersCollection.findOne({ _id: insertResult.insertedId });

    // When: 업데이트
    const updateData = {
      name: '테스트고객6',
      mobile_phone: '010-3333-4444',
      address: '대전시 유성구'
    };

    const { changes, updateFields } = simulateCustomerUpdate(existingDoc, updateData);

    // Then: 중첩 필드로 설정해야 함 (부모가 존재하므로)
    expect(changes).toContain('연락처');
    expect(changes).toContain('주소');
    expect(updateFields['personal_info.mobile_phone']).toBeDefined();
    expect(updateFields['personal_info.address.address1']).toBeDefined();
    expect(updateFields['meta.updated_at']).toBeDefined();

    // 실제 업데이트 수행
    await customersCollection.updateOne(
      { _id: insertResult.insertedId },
      { $set: updateFields }
    );

    const updatedDoc = await customersCollection.findOne({ _id: insertResult.insertedId });
    expect(updatedDoc.personal_info.mobile_phone).toBe('010-3333-4444');
    expect(updatedDoc.personal_info.address.address1).toBe('대전시 유성구');
  });

  test('시나리오 7: 법인고객 (주소만 업데이트)', async () => {
    // Given: 주소가 null인 법인고객
    const insertResult = await customersCollection.insertOne({
      personal_info: { name: '(주)테스트기업', address: null },
      insurance_info: { customer_type: '법인' },
      meta: { created_at: new Date() }
    });

    const existingDoc = await customersCollection.findOne({ _id: insertResult.insertedId });

    // When: 주소만 업데이트
    const updateData = {
      name: '(주)테스트기업',
      address: '서울시 영등포구 여의도동 123'
    };

    const { changes, updateFields } = simulateCustomerUpdate(existingDoc, updateData);

    // Then: personal_info.address 전체를 설정
    expect(changes).toContain('주소');
    expect(updateFields['personal_info.address']).toBeDefined();

    // 실제 업데이트 수행
    await customersCollection.updateOne(
      { _id: insertResult.insertedId },
      { $set: updateFields }
    );

    const updatedDoc = await customersCollection.findOne({ _id: insertResult.insertedId });
    expect(updatedDoc.personal_info.address.address1).toBe('서울시 영등포구 여의도동 123');
  });
});

// =============================================================================
// 고객 일괄등록 - 주소 삭제 테스트
// =============================================================================

describe('고객 일괄등록 - 빈 주소로 기존 주소 삭제', () => {

  test('빈 주소(\'\')로 기존 주소 삭제', async () => {
    // Given: 주소가 있는 고객
    const insertResult = await customersCollection.insertOne({
      personal_info: { name: '주소삭제테스트', address: { address1: '서울시 강남구 역삼동' } },
      insurance_info: { customer_type: '개인' },
      meta: { created_at: new Date(), status: 'active' }
    });

    const existingDoc = await customersCollection.findOne({ _id: insertResult.insertedId });
    expect(existingDoc.personal_info.address.address1).toBe('서울시 강남구 역삼동');

    // When: 빈 주소로 업데이트 (엑셀에 주소 칼럼은 있지만 값이 비어있음)
    const updateData = { name: '주소삭제테스트', address: '' };
    const { changes, updateFields } = simulateCustomerUpdate(existingDoc, updateData);

    // Then: 주소 삭제 변경사항 감지
    expect(changes).toContain('주소 삭제');
    expect(updateFields['personal_info.address']).toBeNull();

    // 실제 업데이트 수행
    await customersCollection.updateOne(
      { _id: insertResult.insertedId },
      { $set: updateFields }
    );

    const updatedDoc = await customersCollection.findOne({ _id: insertResult.insertedId });
    expect(updatedDoc.personal_info.address).toBeNull();
  });

  test('undefined 주소(칼럼 없음)는 기존 주소 유지', async () => {
    // Given: 주소가 있는 고객
    const insertResult = await customersCollection.insertOne({
      personal_info: { name: '주소유지테스트', address: { address1: '부산시 해운대구' } },
      insurance_info: { customer_type: '개인' },
      meta: { created_at: new Date(), status: 'active' }
    });

    const existingDoc = await customersCollection.findOne({ _id: insertResult.insertedId });

    // When: address 속성 자체가 없음 (엑셀에 주소 칼럼 없음)
    const updateData = { name: '주소유지테스트' };
    const { changes, updateFields } = simulateCustomerUpdate(existingDoc, updateData);

    // Then: 주소 관련 변경 없음
    expect(changes).not.toContain('주소');
    expect(changes).not.toContain('주소 삭제');
    expect(updateFields['personal_info.address']).toBeUndefined();
    expect(updateFields['personal_info.address.address1']).toBeUndefined();
  });

  test('이미 주소가 null인 고객에 빈 주소 전송 → 변경 없음', async () => {
    // Given: 주소가 이미 null인 고객
    const insertResult = await customersCollection.insertOne({
      personal_info: { name: '주소없음테스트', address: null },
      insurance_info: { customer_type: '개인' },
      meta: { created_at: new Date(), status: 'active' }
    });

    const existingDoc = await customersCollection.findOne({ _id: insertResult.insertedId });
    expect(existingDoc.personal_info.address).toBeNull();

    // When: 빈 주소 전송 (이미 null이므로 변경 불필요)
    const updateData = { name: '주소없음테스트', address: '' };
    const { changes, updateFields } = simulateCustomerUpdate(existingDoc, updateData);

    // Then: 변경 없음 (이미 null이므로 불필요한 업데이트 방지)
    expect(changes).not.toContain('주소 삭제');
    expect(updateFields['personal_info.address']).toBeUndefined();
  });
});

// =============================================================================
// 계약 일괄등록 - null 필드 업데이트 테스트
// =============================================================================

describe('계약 일괄등록 - MongoDB null 필드 업데이트', () => {

  test('시나리오 8: 계약 - meta가 null인 경우', async () => {
    // Given: meta가 null인 계약
    const insertResult = await contractsCollection.insertOne({
      policy_number: 'TEST-001',
      customer_name: '테스트고객',
      product_name: '테스트보험',
      premium: 100000,
      meta: null
    });

    const existingDoc = await contractsCollection.findOne({ _id: insertResult.insertedId });
    expect(existingDoc.meta).toBeNull();

    // When: 보험료 업데이트
    const updateData = {
      policy_number: 'TEST-001',
      premium: 150000
    };

    const { changes, updateFields } = simulateContractUpdate(existingDoc, updateData);

    // Then: meta 전체를 설정해야 함
    expect(changes).toContain('보험료');
    expect(updateFields['meta']).toBeDefined();
    expect(updateFields['meta.updated_at']).toBeUndefined();

    // 실제 업데이트 수행
    await contractsCollection.updateOne(
      { _id: insertResult.insertedId },
      { $set: updateFields }
    );

    const updatedDoc = await contractsCollection.findOne({ _id: insertResult.insertedId });
    expect(updatedDoc.premium).toBe(150000);
    expect(updatedDoc.meta).not.toBeNull();
  });

  test('시나리오 9: 계약 - meta가 있는 경우', async () => {
    // Given: meta가 있는 계약
    const insertResult = await contractsCollection.insertOne({
      policy_number: 'TEST-002',
      customer_name: '테스트고객2',
      product_name: '테스트보험2',
      premium: 200000,
      meta: { created_at: new Date() }
    });

    const existingDoc = await contractsCollection.findOne({ _id: insertResult.insertedId });
    expect(existingDoc.meta).not.toBeNull();

    // When: 보험료 및 이체일 업데이트
    const updateData = {
      policy_number: 'TEST-002',
      premium: 250000,
      payment_day: 15
    };

    const { changes, updateFields } = simulateContractUpdate(existingDoc, updateData);

    // Then: meta.updated_at만 설정 (meta가 존재하므로)
    expect(changes).toContain('보험료');
    expect(changes).toContain('이체일');
    expect(updateFields['meta.updated_at']).toBeDefined();
    expect(updateFields['meta']).toBeUndefined();

    // 실제 업데이트 수행
    await contractsCollection.updateOne(
      { _id: insertResult.insertedId },
      { $set: updateFields }
    );

    const updatedDoc = await contractsCollection.findOne({ _id: insertResult.insertedId });
    expect(updatedDoc.premium).toBe(250000);
    expect(updatedDoc.payment_day).toBe(15);
  });
});
