#!/usr/bin/env node

/**
 * 추가 크레딧 기능 마이그레이션 스크립트
 *
 * 1. users.bonus_credits 필드 추가 (잔액, 누적량)
 * 2. credit_transactions 컬렉션 생성 (충전/사용 이력)
 * 3. credit_packages 컬렉션 생성 (패키지 정의)
 *
 * 실행: node migrations/add-bonus-credits.js
 *
 * @see docs/BONUS_CREDIT_IMPLEMENTATION.md
 */

const { MongoClient } = require('mongodb');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/docupload';

// 초기 크레딧 패키지 정의 (TIER_PRICING_POLICY.md 기준)
const INITIAL_PACKAGES = [
  {
    code: 'small',
    name: '소량',
    credits: 300,
    price_krw: 1900,
    price_per_credit: 6.33,
    sort_order: 1,
    is_active: true,
    description: '소량 충전 패키지',
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    code: 'basic',
    name: '기본',
    credits: 1000,
    price_krw: 4900,
    price_per_credit: 4.9,
    sort_order: 2,
    is_active: true,
    description: '가장 인기 있는 패키지',
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    code: 'bulk',
    name: '대량',
    credits: 5000,
    price_krw: 19900,
    price_per_credit: 3.98,
    sort_order: 3,
    is_active: true,
    description: '대량 충전 시 할인',
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    code: 'mega',
    name: '벌크',
    credits: 20000,
    price_krw: 59000,
    price_per_credit: 2.95,
    sort_order: 4,
    is_active: true,
    description: '최대 할인 패키지',
    created_at: new Date(),
    updated_at: new Date()
  }
];

async function migrate() {
  console.log('='.repeat(60));
  console.log('[마이그레이션] 추가 크레딧 기능 마이그레이션 시작');
  console.log('='.repeat(60));
  console.log('[마이그레이션] MongoDB URI:', MONGODB_URI.replace(/\/\/.*@/, '//*****@'));

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db('docupload');

    // ========================================
    // 1. users.bonus_credits 필드 추가
    // ========================================
    console.log('\n[1/4] users.bonus_credits 필드 마이그레이션...');
    const usersCollection = db.collection('users');

    const userResult = await usersCollection.updateMany(
      { bonus_credits: { $exists: false } },
      {
        $set: {
          bonus_credits: {
            balance: 0,
            total_purchased: 0,
            total_used: 0,
            last_purchase_at: null,
            updated_at: new Date()
          }
        }
      }
    );
    console.log(`  ✅ ${userResult.modifiedCount}명 사용자에 bonus_credits 필드 추가`);

    // ========================================
    // 2. credit_transactions 컬렉션 생성
    // ========================================
    console.log('\n[2/4] credit_transactions 컬렉션 설정...');

    // 컬렉션이 없으면 생성
    const collections = await db.listCollections({ name: 'credit_transactions' }).toArray();
    if (collections.length === 0) {
      await db.createCollection('credit_transactions');
      console.log('  ✅ credit_transactions 컬렉션 생성');
    } else {
      console.log('  - credit_transactions 컬렉션 이미 존재함');
    }

    const transactionsCollection = db.collection('credit_transactions');

    // 인덱스 생성
    try {
      await transactionsCollection.createIndex({ user_id: 1, created_at: -1 });
      console.log('  ✅ 인덱스 생성: { user_id: 1, created_at: -1 }');
    } catch (e) {
      console.log('  - user_id 인덱스 이미 존재함');
    }

    try {
      await transactionsCollection.createIndex({ type: 1, created_at: -1 });
      console.log('  ✅ 인덱스 생성: { type: 1, created_at: -1 }');
    } catch (e) {
      console.log('  - type 인덱스 이미 존재함');
    }

    try {
      await transactionsCollection.createIndex({ created_at: -1 });
      console.log('  ✅ 인덱스 생성: { created_at: -1 }');
    } catch (e) {
      console.log('  - created_at 인덱스 이미 존재함');
    }

    // ========================================
    // 3. credit_packages 컬렉션 생성
    // ========================================
    console.log('\n[3/4] credit_packages 컬렉션 설정...');

    const packageCollections = await db.listCollections({ name: 'credit_packages' }).toArray();
    if (packageCollections.length === 0) {
      await db.createCollection('credit_packages');
      console.log('  ✅ credit_packages 컬렉션 생성');
    } else {
      console.log('  - credit_packages 컬렉션 이미 존재함');
    }

    const packagesCollection = db.collection('credit_packages');

    // 인덱스 생성
    try {
      await packagesCollection.createIndex({ code: 1 }, { unique: true });
      console.log('  ✅ 인덱스 생성: { code: 1 } (unique)');
    } catch (e) {
      console.log('  - code 인덱스 이미 존재함');
    }

    try {
      await packagesCollection.createIndex({ sort_order: 1 });
      console.log('  ✅ 인덱스 생성: { sort_order: 1 }');
    } catch (e) {
      console.log('  - sort_order 인덱스 이미 존재함');
    }

    // 초기 패키지 데이터 삽입 (upsert)
    console.log('\n[4/4] 초기 크레딧 패키지 삽입...');
    for (const pkg of INITIAL_PACKAGES) {
      const result = await packagesCollection.updateOne(
        { code: pkg.code },
        { $setOnInsert: pkg },
        { upsert: true }
      );
      if (result.upsertedCount > 0) {
        console.log(`  ✅ 패키지 추가: ${pkg.name} (${pkg.code}) - ${pkg.credits}C / ${pkg.price_krw}원`);
      } else {
        console.log(`  - 패키지 존재: ${pkg.name} (${pkg.code})`);
      }
    }

    // ========================================
    // 완료 요약
    // ========================================
    console.log('\n' + '='.repeat(60));
    console.log('[마이그레이션] 완료!');
    console.log('='.repeat(60));

    // 현황 출력
    const userCount = await usersCollection.countDocuments({ 'bonus_credits.balance': { $gte: 0 } });
    const packageCount = await packagesCollection.countDocuments({});
    const txCount = await transactionsCollection.countDocuments({});

    console.log('\n📊 현황:');
    console.log(`  - 사용자 (bonus_credits 보유): ${userCount}명`);
    console.log(`  - 크레딧 패키지: ${packageCount}개`);
    console.log(`  - 크레딧 트랜잭션: ${txCount}건`);

  } catch (error) {
    console.error('\n[마이그레이션] 오류:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

// 실행
migrate().catch(console.error);
