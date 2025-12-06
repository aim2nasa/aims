/**
 * Test Customer Soft Delete
 */

const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'docupload';
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

async function createTestCustomer(db, suffix = '') {
  const testCustomer = {
    personal_info: { name: `TEST_SOFT_DELETE_CUSTOMER${suffix}_${Date.now()}` },
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
  return result.insertedId;
}

async function test() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('🚀 Starting Customer Soft Delete Tests\n');

    const db = client.db(DB_NAME);

    // Test 1: Create test customer
    console.log('📋 Test 1: Creating test customer...');
    testCustomerId = await createTestCustomer(db);
    const createdCustomer = await db.collection(CUSTOMERS_COLLECTION).findOne({ _id: testCustomerId });
    assert(createdCustomer !== null, 'Test customer created', 'Failed to create test customer');
    assert(createdCustomer.meta.status === 'active', 'Initial status is active', `Status is ${createdCustomer.meta.status}`);
    assert(createdCustomer.deleted_at === null, 'Initial deleted_at is null', 'deleted_at should be null');

    // Test 2: Soft delete (simulated)
    console.log('\n📋 Test 2: Performing soft delete...');
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
    assert(softDeleted.meta.status === 'inactive', 'Status changed to inactive', `Status is ${softDeleted.meta.status}`);
    assert(softDeleted.deleted_at !== null, 'deleted_at is set', 'deleted_at should be set');
    assert(softDeleted.deleted_by === 'test_user', 'deleted_by is set', `deleted_by is ${softDeleted.deleted_by}`);

    // Test 3: Soft deleted customer not in active list
    console.log('\n📋 Test 3: Checking active customer list...');
    const activeCustomers = await db.collection(CUSTOMERS_COLLECTION).find({
      'meta.status': 'active'
    }).toArray();
    const foundInActive = activeCustomers.some(c => c._id.toString() === testCustomerId.toString());
    assert(!foundInActive, 'Soft deleted customer not in active list', 'Should not appear in active customers');

    // Test 4: Soft deleted customer in inactive list
    console.log('\n📋 Test 4: Checking inactive customer list...');
    const inactiveCustomers = await db.collection(CUSTOMERS_COLLECTION).find({
      'meta.status': 'inactive'
    }).toArray();
    const foundInInactive = inactiveCustomers.some(c => c._id.toString() === testCustomerId.toString());
    assert(foundInInactive, 'Soft deleted customer in inactive list', 'Should appear in inactive customers');

    // Test 5: Hard delete (simulated)
    console.log('\n📋 Test 5: Performing hard delete...');
    const createAnother = await createTestCustomer(db, '_HARD');
    await db.collection(CUSTOMERS_COLLECTION).deleteOne({ _id: createAnother });

    const hardDeleted = await db.collection(CUSTOMERS_COLLECTION).findOne({ _id: createAnother });
    assert(hardDeleted === null, 'Hard deleted customer removed from DB', 'Customer should be completely removed');

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
    console.log('🎉 All soft delete tests passed!');

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
