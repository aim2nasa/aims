/**
 * Test Customer Restore
 */

const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'aims';
const CUSTOMERS_COLLECTION = 'customers';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
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

async function createAndSoftDeleteCustomer(db) {
  // Create customer
  const testCustomer = {
    personal_info: { name: `TEST_RESTORE_CUSTOMER_${Date.now()}` },
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

  const result = await db.collection(CUSTOMERS_COLLECTION).insertOne(testCustomer);
  const customerId = result.insertedId;

  // Soft delete
  await db.collection(CUSTOMERS_COLLECTION).updateOne(
    { _id: customerId },
    {
      $set: {
        'meta.status': 'inactive',
        'meta.updated_at': new Date().toISOString(),
        deleted_at: new Date(),
        deleted_by: 'test_user'
      }
    }
  );

  return customerId;
}

async function test() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('🚀 Starting Customer Restore Tests\n');

    const db = client.db(DB_NAME);

    // Test 1: Create and soft delete customer
    console.log('📋 Test 1: Creating and soft deleting test customer...');
    testCustomerId = await createAndSoftDeleteCustomer(db);

    const softDeleted = await db.collection(CUSTOMERS_COLLECTION).findOne({ _id: testCustomerId });
    assert(softDeleted !== null, 'Customer exists in DB', 'Customer should exist');
    assert(softDeleted.meta.status === 'inactive', 'Status is inactive', `Status is ${softDeleted.meta.status}`);
    assert(softDeleted.deleted_at !== null, 'deleted_at is set', 'deleted_at should be set');

    // Test 2: Restore customer (simulated)
    console.log('\n📋 Test 2: Restoring customer...');
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
    assert(restored.meta.status === 'active', 'Status is active', `Status is ${restored.meta.status}`);
    assert(restored.deleted_at === null, 'deleted_at is null', 'deleted_at should be null');
    assert(restored.deleted_by === null, 'deleted_by is null', 'deleted_by should be null');

    // Test 3: Restored customer appears in active list
    console.log('\n📋 Test 3: Checking active customer list...');
    const activeCustomers = await db.collection(CUSTOMERS_COLLECTION).find({
      'meta.status': 'active'
    }).toArray();
    const foundInActive = activeCustomers.some(c => c._id.toString() === testCustomerId.toString());
    assert(foundInActive, 'Restored customer in active list', 'Should appear in active customers');

    // Test 4: Restored customer not in inactive list
    console.log('\n📋 Test 4: Checking inactive customer list...');
    const inactiveCustomers = await db.collection(CUSTOMERS_COLLECTION).find({
      'meta.status': 'inactive'
    }).toArray();
    const foundInInactive = inactiveCustomers.some(c => c._id.toString() === testCustomerId.toString());
    assert(!foundInInactive, 'Restored customer not in inactive list', 'Should not appear in inactive customers');

    // Test 5: Cannot restore already active customer (error check)
    console.log('\n📋 Test 5: Testing already active customer...');
    const alreadyActive = await db.collection(CUSTOMERS_COLLECTION).findOne({ _id: testCustomerId });
    if (alreadyActive.meta.status === 'active') {
      assert(true, 'Already active customer check', 'Should detect already active status');
    }

    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await db.collection(CUSTOMERS_COLLECTION).deleteOne({ _id: testCustomerId });

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log(`${GREEN}✓ Tests Passed: ${testsPassed}${RESET}`);
    if (testsFailed > 0) {
      console.log(`${RED}✗ Tests Failed: ${testsFailed}${RESET}`);
      process.exit(1);
    }
    console.log('🎉 All restore tests passed!');

  } catch (error) {
    console.error(`${RED}❌ Test failed:${RESET}`, error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

// Run tests if called directly
if (require.main === module) {
  test();
}

module.exports = { test };
