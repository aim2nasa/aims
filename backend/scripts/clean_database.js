/**
 * AIMS 데이터베이스 정리 스크립트
 *
 * 목적: 사용자 계정 기능 도입을 위해 기존 데이터를 깨끗하게 삭제
 *
 * 실행 방법:
 *   node clean_database.js
 *
 * 주의: 이 스크립트는 files와 customers 컬렉션을 완전히 삭제합니다!
 */

const { MongoClient } = require('mongodb');

const MONGO_URL = 'mongodb://tars:27017';
const DB_NAME = 'docupload';

async function cleanDatabase() {
  console.log('========================================');
  console.log('AIMS 데이터베이스 정리 시작');
  console.log('========================================\n');

  const client = await MongoClient.connect(MONGO_URL);
  const db = client.db(DB_NAME);

  try {
    // 1. files 컬렉션 삭제 전 문서 수 확인
    const filesCountBefore = await db.collection('files').countDocuments();
    console.log(`[1/5] files 컬렉션 현재 문서 수: ${filesCountBefore}`);

    // 2. customers 컬렉션 삭제 전 문서 수 확인
    const customersCountBefore = await db.collection('customers').countDocuments();
    console.log(`[2/5] customers 컬렉션 현재 문서 수: ${customersCountBefore}`);

    console.log('\n⚠️  경고: 3초 후 컬렉션을 삭제합니다...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 3. files 컬렉션 드롭
    try {
      await db.collection('files').drop();
      console.log('[3/5] ✅ files 컬렉션 삭제 완료');
    } catch (error) {
      if (error.message.includes('ns not found')) {
        console.log('[3/5] ℹ️  files 컬렉션이 이미 존재하지 않습니다');
      } else {
        throw error;
      }
    }

    // 4. customers 컬렉션 드롭
    try {
      await db.collection('customers').drop();
      console.log('[4/5] ✅ customers 컬렉션 삭제 완료');
    } catch (error) {
      if (error.message.includes('ns not found')) {
        console.log('[4/5] ℹ️  customers 컬렉션이 이미 존재하지 않습니다');
      } else {
        throw error;
      }
    }

    // 5. 인덱스 재생성
    console.log('[5/5] 인덱스 생성 중...');

    await db.collection('files').createIndex({ owner_id: 1 });
    console.log('  ✅ files.owner_id 인덱스 생성 완료');

    await db.collection('customers').createIndex({ "meta.created_by": 1 });
    console.log('  ✅ customers.meta.created_by 인덱스 생성 완료');

    console.log('\n========================================');
    console.log('데이터베이스 정리 완료! ✨');
    console.log('========================================');
    console.log(`삭제된 files 문서: ${filesCountBefore}개`);
    console.log(`삭제된 customers 문서: ${customersCountBefore}개`);
    console.log('생성된 인덱스: 2개');
    console.log('========================================\n');

  } catch (error) {
    console.error('\n❌ 오류 발생:', error.message);
    throw error;
  } finally {
    await client.close();
  }
}

// 스크립트 실행
cleanDatabase()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('치명적 오류:', error);
    process.exit(1);
  });
