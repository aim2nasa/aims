/**
 * Test Migration 001: Soft Delete Fields
 */

const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'aims';
const CUSTOMERS_COLLECTION = 'customers';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

let testsPassed = 0;
let testsFailed = 0;

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
    console.log('🚀 Starting Migration 001 Tests\n');

    const db = client.db(DB_NAME);
    const customersCollection = db.collection(CUSTOMERS_COLLECTION);

    // Test 1: All customers have deleted_at and deleted_by fields
    console.log('📋 Test 1: Checking soft delete fields...');
    const withoutFields = await customersCollection.countDocuments({
      $or: [
        { deleted_at: { $exists: false } },
        { deleted_by: { $exists: false } }
      ]
    });
    assert(withoutFields === 0, 'All customers have soft delete fields', `Found ${withoutFields} customers without fields`);

    // Test 2: All customers have meta.status field
    console.log('\n📋 Test 2: Checking meta.status field...');
    const withoutStatus = await customersCollection.countDocuments({
      'meta.status': { $exists: false }
    });
    assert(withoutStatus === 0, 'All customers have status field', `Found ${withoutStatus} customers without status field`);

    // Test 3: Unique index exists
    console.log('\n📋 Test 3: Checking unique index...');
    const indexes = await customersCollection.indexes();
    const uniqueIndex = indexes.find(idx => idx.name === 'unique_customer_name_type');
    assert(uniqueIndex !== undefined, 'Unique index exists', 'Index "unique_customer_name_type" not found');
    assert(uniqueIndex?.unique === true, 'Index is unique', 'Index should have unique: true');

    // Test 4: Cannot insert duplicate customer name
    console.log('\n📋 Test 4: Testing duplicate prevention...');
    const testCustomer = {
      personal_info: { name: 'TEST_DUPLICATE_NAME_12345' },
      insurance_info: { customer_type: '개인' },
      meta: {
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      deleted_at: null,
      deleted_by: null
    };

    // Insert first customer
    await customersCollection.insertOne(testCustomer);

    // Try to insert duplicate
    try {
      await customersCollection.insertOne({
        ...testCustomer,
        _id: undefined // Generate new ID
      });
      assert(false, 'Duplicate prevented', 'Should have thrown duplicate key error');
    } catch (error) {
      if (error.code === 11000) {
        assert(true, 'Unique constraint prevents duplicate names', '');
      } else {
        assert(false, 'Correct error type', `Expected code 11000, got ${error.code}`);
      }
    }

    // Cleanup
    await customersCollection.deleteOne({ 'personal_info.name': 'TEST_DUPLICATE_NAME_12345' });

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log(`${GREEN}✓ Tests Passed: ${testsPassed}${RESET}`);
    if (testsFailed > 0) {
      console.log(`${RED}✗ Tests Failed: ${testsFailed}${RESET}`);
      process.exit(1);
    }
    console.log('🎉 All migration tests passed!');

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
