/**
 * Migration: Add storage quota fields to users collection
 *
 * 목적: 기존 사용자에게 스토리지 할당량 필드 추가 및 사용량 계산
 * 실행: node migrations/add_storage_quota.js
 *
 * 티어별 할당량:
 * - free_trial: 5GB
 * - standard: 30GB (기본값)
 * - premium: 50GB
 * - vip: 100GB
 * - admin: 무제한 (-1)
 *
 * 작성일: 2025-12-10
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/docupload';
const DB_NAME = process.env.DB_NAME || 'docupload';

// 티어별 할당량 (bytes)
const TIER_QUOTAS = {
  free_trial: 5 * 1024 * 1024 * 1024,    // 5GB
  standard: 30 * 1024 * 1024 * 1024,     // 30GB
  premium: 50 * 1024 * 1024 * 1024,      // 50GB
  vip: 100 * 1024 * 1024 * 1024,         // 100GB
  admin: -1                               // 무제한
};

async function migrate() {
  const client = await MongoClient.connect(MONGO_URI);
  const db = client.db(DB_NAME);

  try {
    console.log('🚀 Starting migration: add_storage_quota');
    console.log(`📦 Database: ${DB_NAME}`);
    console.log('');

    // 1. 현재 storage 필드가 없는 사용자 수 확인
    const usersWithoutField = await db.collection('users').countDocuments({
      storage: { $exists: false }
    });

    console.log(`📊 Users without storage field: ${usersWithoutField}`);

    // 2. 관리자가 아닌 사용자에게 기본 할당량 설정
    const nonAdminResult = await db.collection('users').updateMany(
      { storage: { $exists: false }, role: { $ne: 'admin' } },
      {
        $set: {
          storage: {
            tier: 'standard',
            quota_bytes: TIER_QUOTAS.standard,
            used_bytes: 0,
            last_calculated: null
          }
        }
      }
    );

    console.log(`✅ Non-admin users updated: ${nonAdminResult.modifiedCount}`);

    // 3. 관리자에게 무제한 할당량 설정
    const adminResult = await db.collection('users').updateMany(
      { storage: { $exists: false }, role: 'admin' },
      {
        $set: {
          storage: {
            tier: 'admin',
            quota_bytes: TIER_QUOTAS.admin,
            used_bytes: 0,
            last_calculated: null
          }
        }
      }
    );

    console.log(`✅ Admin users updated: ${adminResult.modifiedCount}`);

    // 4. 각 사용자별 파일 사용량 계산 및 업데이트
    console.log('');
    console.log('📊 Calculating storage usage for each user...');

    const usageAgg = await db.collection('files').aggregate([
      {
        $group: {
          _id: '$ownerId',
          total_bytes: { $sum: { $toDouble: { $ifNull: ['$fileSize', '0'] } } }
        }
      }
    ]).toArray();

    console.log(`📊 Found ${usageAgg.length} users with files`);

    let updatedCount = 0;
    for (const usage of usageAgg) {
      const result = await db.collection('users').updateOne(
        { _id: usage._id },
        {
          $set: {
            'storage.used_bytes': usage.total_bytes,
            'storage.last_calculated': new Date()
          }
        }
      );
      if (result.modifiedCount > 0) {
        updatedCount++;
      }
    }

    // ObjectId로 저장된 경우도 처리
    const usageAggByObjectId = await db.collection('files').aggregate([
      { $match: { ownerId: { $type: 'string' } } },
      {
        $group: {
          _id: '$ownerId',
          total_bytes: { $sum: { $toDouble: { $ifNull: ['$fileSize', '0'] } } }
        }
      }
    ]).toArray();

    for (const usage of usageAggByObjectId) {
      // ownerId가 문자열인 경우
      const result = await db.collection('users').updateOne(
        { _id: { $eq: usage._id } },
        {
          $set: {
            'storage.used_bytes': usage.total_bytes,
            'storage.last_calculated': new Date()
          }
        }
      );
      if (result.modifiedCount > 0) {
        updatedCount++;
      }
    }

    console.log(`✅ Usage updated for ${updatedCount} users`);

    // 5. 통계 출력
    console.log('');
    console.log('📋 Summary:');

    const tierStats = await db.collection('users').aggregate([
      { $match: { storage: { $exists: true } } },
      { $group: { _id: '$storage.tier', count: { $sum: 1 } } }
    ]).toArray();

    for (const stat of tierStats) {
      console.log(`   - ${stat._id}: ${stat.count} users`);
    }

    const totalUsage = await db.collection('users').aggregate([
      { $match: { storage: { $exists: true } } },
      { $group: { _id: null, total: { $sum: '$storage.used_bytes' } } }
    ]).toArray();

    if (totalUsage.length > 0) {
      const totalGB = (totalUsage[0].total / (1024 * 1024 * 1024)).toFixed(2);
      console.log(`   - Total storage used: ${totalGB} GB`);
    }

    console.log('');
    console.log('✅ Migration completed successfully!');

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
