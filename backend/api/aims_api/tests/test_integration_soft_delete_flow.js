/**
 * Integration Test: End-to-End Soft Delete Flow
 * 전체 소프트 삭제 플로우 통합 테스트
 */

const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'docupload';
const CUSTOMERS_COLLECTION = 'customers';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

let testsPassed = 0;
let testsFailed = 0;
let testCustomerId = null;

function assert(condition, testName, errorMessage) {
  if (condition) {
    console.log(`${GREEN}✓${RESET} ${testName}`);
    testsPassed++;
  } else {
    console.log(`${RED}✗${RESET} ${testName}`);
    console.log(`  ${RED}${errorMessage}${RESET}`);
    testsFailed++;
  }
}

function stepHeader(stepNumber, stepName) {
  console.log(`\n${BLUE}${'='.repeat(60)}${RESET}`);
  console.log(`${BLUE}STEP ${stepNumber}: ${stepName}${RESET}`);
  console.log(`${BLUE}${'='.repeat(60)}${RESET}`);
}

async function test() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log(`${YELLOW}🚀 Starting End-to-End Soft Delete Integration Test${RESET}\n`);

    const db = client.db(DB_NAME);

    // ========== STEP 1: 고객 생성 ==========
    stepHeader(1, '고객 생성 (status=active, deleted_at=null)');

    const uniqueName = `TEST_E2E_CUSTOMER_${Date.now()}`;
    const testCustomer = {
      personal_info: { name: uniqueName },
      insurance_info: { customer_type: '개인' },
      meta: {
        status: 'active',
        created_by: 'test_user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      deleted_at: null,
      deleted_by: null
    };

    const createResult = await db.collection(CUSTOMERS_COLLECTION).insertOne(testCustomer);
    testCustomerId = createResult.insertedId;
    console.log(`${GREEN}Created customer:${RESET} ${testCustomerId}`);

    const created = await db.collection(CUSTOMERS_COLLECTION).findOne({ _id: testCustomerId });
    assert(created !== null, 'Customer exists', 'Customer should exist');
    assert(created.meta.status === 'active', 'Status is active', `Status is ${created.meta?.status}`);
    assert(created.deleted_at === null, 'deleted_at is null', 'deleted_at should be null');

    // ========== STEP 2: 소프트 삭제 ==========
    stepHeader(2, '소프트 삭제 (status=inactive, deleted_at 설정)');

    await db.collection(CUSTOMERS_COLLECTION).updateOne(
      { _id: testCustomerId },
      {
        $set: {
          'meta.status': 'inactive',
          'meta.updated_at': new Date().toISOString(),
          deleted_at: new Date(),
          deleted_by: 'test_user'
        }
      }
    );

    const softDeleted = await db.collection(CUSTOMERS_COLLECTION).findOne({ _id: testCustomerId });
    assert(softDeleted !== null, 'Customer still exists in DB', 'Customer should not be removed');
    assert(softDeleted.meta.status === 'inactive', 'Status changed to inactive', `Status is ${softDeleted.meta?.status}`);
    assert(softDeleted.deleted_at !== null, 'deleted_at is set', 'deleted_at should be set');
    assert(softDeleted.deleted_by === 'test_user', 'deleted_by is set', `deleted_by is ${softDeleted.deleted_by}`);

    // ========== STEP 3: 활성 목록에 없음 확인 ==========
    stepHeader(3, '소프트 삭제된 고객이 활성 목록에 없음 확인');

    const activeCustomers = await db.collection(CUSTOMERS_COLLECTION).find({
      'meta.status': 'active',
      'meta.created_by': 'test_user'
    }).toArray();
    const foundInActive = activeCustomers.some(c => c._id.toString() === testCustomerId.toString());
    assert(!foundInActive, 'Not in active list', 'Should not appear in active customers');

    const inactiveCustomers = await db.collection(CUSTOMERS_COLLECTION).find({
      'meta.status': 'inactive',
      'meta.created_by': 'test_user'
    }).toArray();
    const foundInInactive = inactiveCustomers.some(c => c._id.toString() === testCustomerId.toString());
    assert(foundInInactive, 'Found in inactive list', 'Should appear in inactive customers');

    // ========== STEP 4: 중복 고객명 생성 시도 ==========
    stepHeader(4, '중복 고객명 생성 시도 (유니크 제약 확인)');

    try {
      await db.collection(CUSTOMERS_COLLECTION).insertOne({
        personal_info: { name: uniqueName },
        insurance_info: { customer_type: '개인' },
        meta: {
          status: 'active',
          created_by: 'test_user',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        deleted_at: null,
        deleted_by: null
      });
      assert(false, 'Duplicate prevented', 'Should have thrown duplicate key error');
    } catch (error) {
      if (error.code === 11000) {
        assert(true, 'Unique constraint prevents duplicate (even for inactive)', '');
        console.log(`  ${YELLOW}→ Error message:${RESET} ${error.message}`);
        console.log(`  ${YELLOW}→ Solution:${RESET} Restore the existing customer or use a different name`);
      } else {
        assert(false, 'Correct error type', `Expected code 11000, got ${error.code}`);
      }
    }

    // ========== STEP 5: 고객 복원 ==========
    stepHeader(5, '고객 복원 (status=active, deleted_at=null)');

    await db.collection(CUSTOMERS_COLLECTION).updateOne(
      { _id: testCustomerId },
      {
        $set: {
          'meta.status': 'active',
          'meta.updated_at': new Date().toISOString(),
          deleted_at: null,
          deleted_by: null
        }
      }
    );

    const restored = await db.collection(CUSTOMERS_COLLECTION).findOne({ _id: testCustomerId });
    assert(restored !== null, 'Customer still exists', 'Customer should exist');
    assert(restored.meta.status === 'active', 'Status is active', `Status is ${restored.meta?.status}`);
    assert(restored.deleted_at === null, 'deleted_at is null', 'deleted_at should be null');
    assert(restored.deleted_by === null, 'deleted_by is null', 'deleted_by should be null');

    // ========== STEP 6: 활성 목록에 다시 표시 ==========
    stepHeader(6, '복원된 고객이 활성 목록에 다시 표시됨');

    const activeCustomersAfterRestore = await db.collection(CUSTOMERS_COLLECTION).find({
      'meta.status': 'active',
      'meta.created_by': 'test_user'
    }).toArray();
    const foundInActiveAfterRestore = activeCustomersAfterRestore.some(c => c._id.toString() === testCustomerId.toString());
    assert(foundInActiveAfterRestore, 'Restored customer in active list', 'Should appear in active customers');

    const inactiveCustomersAfterRestore = await db.collection(CUSTOMERS_COLLECTION).find({
      'meta.status': 'inactive',
      'meta.created_by': 'test_user'
    }).toArray();
    const foundInInactiveAfterRestore = inactiveCustomersAfterRestore.some(c => c._id.toString() === testCustomerId.toString());
    assert(!foundInInactiveAfterRestore, 'Not in inactive list', 'Should not appear in inactive customers');

    // ========== STEP 7: 영구 삭제 ==========
    stepHeader(7, '영구 삭제 (DB에서 완전 제거)');

    await db.collection(CUSTOMERS_COLLECTION).deleteOne({ _id: testCustomerId });

    const hardDeleted = await db.collection(CUSTOMERS_COLLECTION).findOne({ _id: testCustomerId });
    assert(hardDeleted === null, 'Customer completely removed', 'Customer should not exist in DB');

    const allCustomersAfterHardDelete = await db.collection(CUSTOMERS_COLLECTION).find({
      'meta.created_by': 'test_user'
    }).toArray();
    const foundInAnyList = allCustomersAfterHardDelete.some(c => c._id.toString() === testCustomerId.toString());
    assert(!foundInAnyList, 'Not in any list', 'Should not appear in any customer list');

    // ========== 최종 요약 ==========
    console.log('\n' + '='.repeat(60));
    console.log(`${GREEN}✓ Tests Passed: ${testsPassed}${RESET}`);
    if (testsFailed > 0) {
      console.log(`${RED}✗ Tests Failed: ${testsFailed}${RESET}`);
      process.exit(1);
    }
    console.log(`${YELLOW}🎉 All end-to-end integration tests passed!${RESET}`);
    console.log(`${YELLOW}📊 Total scenarios verified: 7${RESET}`);

  } catch (error) {
    console.error(`${RED}❌ Integration test failed:${RESET}`, error);
    process.exit(1);
  } finally {
    // Cleanup: Remove test customer if it still exists
    if (testCustomerId) {
      try {
        await client.db(DB_NAME).collection(CUSTOMERS_COLLECTION).deleteOne({ _id: testCustomerId });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    await client.close();
  }
}

// Run tests if called directly
if (require.main === module) {
  test();
}

module.exports = { test };
