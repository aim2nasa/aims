/**
 * Migration: Add Soft Delete fields to customers collection
 * Run: node migrations/001_add_soft_delete_fields.js
 */

const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'docupload';
const CUSTOMERS_COLLECTION = 'customers';

async function migrate() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(DB_NAME);
    const customersCollection = db.collection(CUSTOMERS_COLLECTION);

    // Step 1: Add soft delete fields to existing customers
    console.log('🔄 Adding soft delete fields to existing customers...');
    const updateResult = await customersCollection.updateMany(
      { deleted_at: { $exists: false } },
      {
        $set: {
          deleted_at: null,
          deleted_by: null
        }
      }
    );
    console.log(`✅ Updated ${updateResult.modifiedCount} customers`);

    // Step 2: Ensure all customers have meta.status field
    console.log('🔄 Ensuring all customers have meta.status field...');
    const statusResult = await customersCollection.updateMany(
      { 'meta.status': { $exists: false } },
      {
        $set: {
          'meta.status': 'active'
        }
      }
    );
    console.log(`✅ Updated ${statusResult.modifiedCount} customers with status field`);

    // Step 3: Create unique index on (name, customer_type)
    console.log('🔄 Creating unique index on (name, customer_type)...');

    // First, check for duplicates that would violate the unique constraint
    const duplicates = await customersCollection.aggregate([
      {
        $group: {
          _id: {
            name: { $trim: { input: '$personal_info.name' } },
            customer_type: '$insurance_info.customer_type'
          },
          count: { $sum: 1 },
          ids: { $push: '$_id' }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    if (duplicates.length > 0) {
      console.warn('⚠️  Found duplicate customer names:');
      duplicates.forEach(dup => {
        console.warn(`  - "${dup._id.name}" (${dup._id.customer_type}): ${dup.count} records`);
        console.warn(`    IDs: ${dup.ids.join(', ')}`);
      });
      console.error('❌ Cannot create unique index with duplicates. Please resolve manually.');
      process.exit(1);
    }

    // Create the unique index
    const indexResult = await customersCollection.createIndex(
      {
        'personal_info.name': 1,
        'insurance_info.customer_type': 1
      },
      {
        unique: true,
        name: 'unique_customer_name_type',
        collation: { locale: 'ko', strength: 2 } // Case-insensitive Korean
      }
    );
    console.log(`✅ Created unique index: ${indexResult}`);

    console.log('🎉 Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate };
