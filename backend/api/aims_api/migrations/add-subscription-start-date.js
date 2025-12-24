#!/usr/bin/env node

/**
 * OCR 사용량 정책 마이그레이션 스크립트
 *
 * 1. users.subscription_start_date = createdAt 복사
 * 2. settings.tier_definitions에 ocr_page_quota 추가
 *
 * 실행: node migrations/add-subscription-start-date.js
 */

const { MongoClient } = require('mongodb');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/docupload';

async function migrate() {
  console.log('[마이그레이션] OCR 정책 마이그레이션 시작');
  console.log('[마이그레이션] MongoDB URI:', MONGODB_URI.replace(/\/\/.*@/, '//*****@'));

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db('docupload');

    // 1. users.subscription_start_date 설정
    console.log('\n[1/3] users.subscription_start_date 마이그레이션...');
    const usersCollection = db.collection('users');

    const userResult = await usersCollection.updateMany(
      { subscription_start_date: { $exists: false } },
      [
        {
          $set: {
            subscription_start_date: { $ifNull: ['$createdAt', new Date()] }
          }
        }
      ]
    );
    console.log(`  - ${userResult.modifiedCount}명 업데이트 완료`);

    // 인덱스 생성
    try {
      await usersCollection.createIndex({ subscription_start_date: 1 });
      console.log('  - subscription_start_date 인덱스 생성 완료');
    } catch (e) {
      console.log('  - 인덱스 이미 존재함');
    }

    // 2. Tier 정의 업데이트 (ocr_quota -> ocr_page_quota)
    console.log('\n[2/3] Tier 정의 마이그레이션...');
    const settingsCollection = db.collection('settings');

    const tierSettings = await settingsCollection.findOne({ key: 'tier_definitions' });

    const newPageQuotas = {
      free_trial: 100,
      standard: 500,
      premium: 3000,
      vip: 10000,
      admin: -1
    };

    if (tierSettings?.tiers) {
      const newTiers = {};
      for (const [key, tier] of Object.entries(tierSettings.tiers)) {
        newTiers[key] = {
          ...tier,
          ocr_page_quota: newPageQuotas[key] ?? 500
        };
      }

      await settingsCollection.updateOne(
        { key: 'tier_definitions' },
        {
          $set: {
            tiers: newTiers,
            updatedAt: new Date(),
            migrated_at: new Date(),
            migration_version: 'ocr_page_quota_v1'
          }
        }
      );
      console.log('  - tier_definitions 업데이트 완료');
      console.log('  - 새 페이지 한도:', JSON.stringify(newPageQuotas));
    } else {
      console.log('  - tier_definitions가 없음, 기본값 사용됨');
    }

    // 3. files 컬렉션에 ocr.page_count 인덱스 추가
    console.log('\n[3/3] files 컬렉션 인덱스 확인...');
    const filesCollection = db.collection('files');

    try {
      await filesCollection.createIndex({ 'ocr.done_at': 1 });
      console.log('  - ocr.done_at 인덱스 생성 완료');
    } catch (e) {
      console.log('  - ocr.done_at 인덱스 이미 존재함');
    }

    console.log('\n[마이그레이션] 완료!');

  } catch (error) {
    console.error('[마이그레이션] 오류:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

// 실행
migrate().catch(console.error);
