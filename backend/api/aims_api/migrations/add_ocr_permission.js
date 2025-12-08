/**
 * Migration: Add hasOcrPermission field to users collection
 *
 * 목적: 모든 사용자에게 OCR 권한 필드 추가 (기본값: false)
 * 실행: node migrations/add_ocr_permission.js
 *
 * 작성일: 2025-12-08
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/docupload';
const DB_NAME = process.env.DB_NAME || 'docupload';

async function migrate() {
  const client = await MongoClient.connect(MONGO_URI);
  const db = client.db(DB_NAME);

  try {
    console.log('🚀 Starting migration: add_ocr_permission');
    console.log(`📦 Database: ${DB_NAME}`);
    console.log('');

    // 1. 현재 hasOcrPermission 필드가 없는 사용자 수 확인
    const usersWithoutField = await db.collection('users').countDocuments({
      hasOcrPermission: { $exists: false }
    });

    console.log(`📊 Users without hasOcrPermission field: ${usersWithoutField}`);

    if (usersWithoutField === 0) {
      console.log('✅ All users already have hasOcrPermission field. Migration skipped.');
      return;
    }

    // 2. hasOcrPermission: false 설정
    const result = await db.collection('users').updateMany(
      { hasOcrPermission: { $exists: false } },
      { $set: { hasOcrPermission: false } }
    );

    console.log('');
    console.log('✅ Migration completed successfully!');
    console.log(`   - Matched: ${result.matchedCount}`);
    console.log(`   - Modified: ${result.modifiedCount}`);
    console.log('');
    console.log('📋 Summary:');
    console.log('   - All users now have hasOcrPermission: false');
    console.log('   - Admin can enable OCR for specific users via API');
    console.log('   - Endpoint: PUT /api/admin/users/:id/ocr-permission');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await client.close();
    console.log('');
    console.log('🔌 Database connection closed');
  }
}

// 실행
migrate()
  .then(() => {
    console.log('');
    console.log('✅ Migration script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error('❌ Migration script failed:', error);
    process.exit(1);
  });
