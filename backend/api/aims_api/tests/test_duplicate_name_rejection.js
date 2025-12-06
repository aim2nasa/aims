/**
 * Test: Duplicate Customer Name Rejection
 * 활성 또는 비활성 상태 고객과 중복된 이름으로 새 고객 등록 시도 시 오류 발생 확인
 */

const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'aims';
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
    console.log(`${YELLOW}🚀 Starting Duplicate Customer Name Rejection Test${RESET}\n`);

    const db = client.db(DB_NAME);

    // ========== STEP 1: 고객 생성 (활성 상태) ==========
    stepHeader(1, '고객 생성 (status=active)');

    const uniqueName = `TEST_DUPLICATE_${Date.now()}`;
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

    // ========== STEP 2: 활성 고객과 중복된 이름으로 등록 시도 ==========
    stepHeader(2, '활성 고객과 중복된 이름으로 등록 시도 (유니크 제약 확인)');

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
        assert(true, 'Unique constraint prevents duplicate (active customer)', '');
        console.log(`  ${YELLOW}→ Error code:${RESET} ${error.code}`);
        console.log(`  ${YELLOW}→ Expected behavior:${RESET} MongoDB unique index prevents duplicate`);
      } else {
        assert(false, 'Correct error type', `Expected code 11000, got ${error.code}`);
      }
    }

    // ========== STEP 3: 고객 소프트 삭제 ==========
    stepHeader(3, '고객 소프트 삭제 (status=inactive)');

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

    // ========== STEP 4: 비활성 고객과 중복된 이름으로 등록 시도 ==========
    stepHeader(4, '비활성 고객과 중복된 이름으로 등록 시도 (유니크 제약 확인)');

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
        console.log(`  ${YELLOW}→ Error code:${RESET} ${error.code}`);
        console.log(`  ${YELLOW}→ Expected behavior:${RESET} Unique index applies to ALL customers (active + inactive)`);
        console.log(`  ${YELLOW}→ User action required:${RESET} Restore existing customer or use different name`);
      } else {
        assert(false, 'Correct error type', `Expected code 11000, got ${error.code}`);
      }
    }

    // ========== STEP 5: 다른 고객 유형으로 등록 시도 ==========
    stepHeader(5, '같은 이름, 다른 고객 유형으로 등록 시도 (허용되어야 함)');

    const differentTypeCustomer = {
      personal_info: { name: uniqueName },
      insurance_info: { customer_type: '법인' },  // 다른 유형
      meta: {
        status: 'active',
        created_by: 'test_user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      deleted_at: null,
      deleted_by: null
    };

    try {
      const result = await db.collection(CUSTOMERS_COLLECTION).insertOne(differentTypeCustomer);
      const differentTypeId = result.insertedId;

      assert(true, 'Different customer_type allows same name', '');
      console.log(`  ${YELLOW}→ Created customer with different type:${RESET} ${differentTypeId}`);
      console.log(`  ${YELLOW}→ Unique constraint:${RESET} (name + customer_type) combination`);

      // Cleanup
      await db.collection(CUSTOMERS_COLLECTION).deleteOne({ _id: differentTypeId });
    } catch (error) {
      if (error.code === 11000) {
        assert(false, 'Different customer_type should be allowed', 'Unique constraint should be on (name + type)');
      } else {
        throw error;
      }
    }

    // ========== 최종 요약 ==========
    console.log('\n' + '='.repeat(60));
    console.log(`${GREEN}✓ Tests Passed: ${testsPassed}${RESET}`);
    if (testsFailed > 0) {
      console.log(`${RED}✗ Tests Failed: ${testsFailed}${RESET}`);
      process.exit(1);
    }
    console.log(`${YELLOW}🎉 All duplicate name rejection tests passed!${RESET}`);
    console.log(`${YELLOW}📊 Total scenarios verified: 5${RESET}`);

  } catch (error) {
    console.error(`${RED}❌ Test failed:${RESET}`, error);
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
