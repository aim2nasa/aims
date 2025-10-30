/**
 * AIMS 데이터베이스 정리 검증 스크립트
 *
 * 목적: clean_database.js 실행 후 데이터가 올바르게 삭제되었는지 확인
 *
 * 실행 방법:
 *   node verify_clean.js
 */

const { MongoClient } = require('mongodb');

const MONGO_URL = 'mongodb://tars:27017';
const DB_NAME = 'docupload';

async function verify() {
  console.log('========================================');
  console.log('AIMS 데이터베이스 정리 검증');
  console.log('========================================\n');

  const client = await MongoClient.connect(MONGO_URL);
  const db = client.db(DB_NAME);

  try {
    // 1. files 컬렉션 문서 수 확인
    const filesCount = await db.collection('files').countDocuments();
    console.log(`[1/4] files 컬렉션 문서 수: ${filesCount}`);

    // 2. customers 컬렉션 문서 수 확인
    const customersCount = await db.collection('customers').countDocuments();
    console.log(`[2/4] customers 컬렉션 문서 수: ${customersCount}`);

    // 3. files 인덱스 확인
    console.log('\n[3/4] files 컬렉션 인덱스:');
    const filesIndexes = await db.collection('files').indexes();
    filesIndexes.forEach(idx => {
      const keys = Object.keys(idx.key).join(', ');
      console.log(`  - ${idx.name}: { ${keys} }`);
    });

    // owner_id 인덱스 존재 확인
    const hasOwnerIdIndex = filesIndexes.some(idx => idx.key.owner_id);
    if (hasOwnerIdIndex) {
      console.log('  ✅ owner_id 인덱스 확인됨');
    } else {
      console.log('  ❌ owner_id 인덱스 없음!');
    }

    // 4. customers 인덱스 확인
    console.log('\n[4/4] customers 컬렉션 인덱스:');
    const customersIndexes = await db.collection('customers').indexes();
    customersIndexes.forEach(idx => {
      const keys = Object.keys(idx.key).join(', ');
      console.log(`  - ${idx.name}: { ${keys} }`);
    });

    // meta.created_by 인덱스 존재 확인
    const hasCreatedByIndex = customersIndexes.some(idx => idx.key['meta.created_by']);
    if (hasCreatedByIndex) {
      console.log('  ✅ meta.created_by 인덱스 확인됨');
    } else {
      console.log('  ❌ meta.created_by 인덱스 없음!');
    }

    // 최종 결과
    console.log('\n========================================');
    console.log('검증 결과');
    console.log('========================================');

    const allClear =
      filesCount === 0 &&
      customersCount === 0 &&
      hasOwnerIdIndex &&
      hasCreatedByIndex;

    if (allClear) {
      console.log('✅ 데이터베이스 정리 완료!');
      console.log('✅ 모든 컬렉션이 비어있습니다.');
      console.log('✅ 필수 인덱스가 생성되었습니다.');
      console.log('\n다음 단계: 백엔드 API 수정 진행');
    } else {
      console.log('❌ 정리가 완전히 완료되지 않았습니다:');
      if (filesCount > 0) console.log(`  - files 문서 ${filesCount}개 남아있음`);
      if (customersCount > 0) console.log(`  - customers 문서 ${customersCount}개 남아있음`);
      if (!hasOwnerIdIndex) console.log('  - owner_id 인덱스 없음');
      if (!hasCreatedByIndex) console.log('  - meta.created_by 인덱스 없음');
    }

    console.log('========================================\n');

    return allClear ? 0 : 1;

  } catch (error) {
    console.error('\n❌ 오류 발생:', error.message);
    return 1;
  } finally {
    await client.close();
  }
}

// 스크립트 실행
verify()
  .then(exitCode => process.exit(exitCode))
  .catch(error => {
    console.error('치명적 오류:', error);
    process.exit(1);
  });
