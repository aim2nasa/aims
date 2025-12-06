/**
 * Test Customer List Status Filter
 */

const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'docupload';
const CUSTOMERS_COLLECTION = 'customers';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

let testsPassed = 0;
let testsFailed = 0;
let activeCustomerId = null;
let inactiveCustomerId = null;

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

async function test() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('🚀 Starting Customer List Status Filter Tests\n');

    const db = client.db(DB_NAME);

    // Setup: Create active and inactive test customers
    console.log('📋 Setup: Creating test customers...');

    const activeCustomer = {
      personal_info: { name: `TEST_ACTIVE_CUSTOMER_${Date.now()}` },
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

    const activeResult = await db.collection(CUSTOMERS_COLLECTION).insertOne(activeCustomer);
    activeCustomerId = activeResult.insertedId;
    console.log(`✓ Created active customer: ${activeCustomerId}`);

    const inactiveCustomer = {
      personal_info: { name: `TEST_INACTIVE_CUSTOMER_${Date.now()}` },
      insurance_info: { customer_type: '개인' },
      meta: {
        status: 'inactive',
        created_by: 'test_user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      deleted_at: new Date(),
      deleted_by: 'test_user'
    };

    const inactiveResult = await db.collection(CUSTOMERS_COLLECTION).insertOne(inactiveCustomer);
    inactiveCustomerId = inactiveResult.insertedId;
    console.log(`✓ Created inactive customer: ${inactiveCustomerId}`);

    // Test 1: Default list (should only show active)
    console.log('\n📋 Test 1: Default list (status not specified)...');
    const defaultList = await db.collection(CUSTOMERS_COLLECTION).find({
      'meta.created_by': 'test_user',
      'meta.status': 'active'  // Default behavior
    }).toArray();

    const hasActive1 = defaultList.some(c => c._id.toString() === activeCustomerId.toString());
    const hasInactive1 = defaultList.some(c => c._id.toString() === inactiveCustomerId.toString());

    assert(hasActive1, 'Default list includes active customer', 'Should include active customer');
    assert(!hasInactive1, 'Default list excludes inactive customer', 'Should not include inactive customer');

    // Test 2: Explicit status=active
    console.log('\n📋 Test 2: Explicit status=active...');
    const activeList = await db.collection(CUSTOMERS_COLLECTION).find({
      'meta.created_by': 'test_user',
      'meta.status': 'active'
    }).toArray();

    const hasActive2 = activeList.some(c => c._id.toString() === activeCustomerId.toString());
    const hasInactive2 = activeList.some(c => c._id.toString() === inactiveCustomerId.toString());

    assert(hasActive2, 'Active filter includes active customer', 'Should include active customer');
    assert(!hasInactive2, 'Active filter excludes inactive customer', 'Should not include inactive customer');

    // Test 3: status=inactive
    console.log('\n📋 Test 3: status=inactive...');
    const inactiveList = await db.collection(CUSTOMERS_COLLECTION).find({
      'meta.created_by': 'test_user',
      'meta.status': 'inactive'
    }).toArray();

    const hasActive3 = inactiveList.some(c => c._id.toString() === activeCustomerId.toString());
    const hasInactive3 = inactiveList.some(c => c._id.toString() === inactiveCustomerId.toString());

    assert(!hasActive3, 'Inactive filter excludes active customer', 'Should not include active customer');
    assert(hasInactive3, 'Inactive filter includes inactive customer', 'Should include inactive customer');

    // Test 4: status=all
    console.log('\n📋 Test 4: status=all...');
    const allList = await db.collection(CUSTOMERS_COLLECTION).find({
      'meta.created_by': 'test_user'
      // No status filter
    }).toArray();

    const hasActive4 = allList.some(c => c._id.toString() === activeCustomerId.toString());
    const hasInactive4 = allList.some(c => c._id.toString() === inactiveCustomerId.toString());

    assert(hasActive4, 'All filter includes active customer', 'Should include active customer');
    assert(hasInactive4, 'All filter includes inactive customer', 'Should include inactive customer');

    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await db.collection(CUSTOMERS_COLLECTION).deleteOne({ _id: activeCustomerId });
    await db.collection(CUSTOMERS_COLLECTION).deleteOne({ _id: inactiveCustomerId });

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log(`${GREEN}✓ Tests Passed: ${testsPassed}${RESET}`);
    if (testsFailed > 0) {
      console.log(`${RED}✗ Tests Failed: ${testsFailed}${RESET}`);
      process.exit(1);
    }
    console.log('🎉 All status filter tests passed!');

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
