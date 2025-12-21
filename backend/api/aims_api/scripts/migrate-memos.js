/**
 * 메모 마이그레이션 스크립트
 *
 * customer_memos 컬렉션의 데이터를 customers.memo 필드로 동기화
 * MCP와 aims_api 간 데이터 일관성 확보
 *
 * 사용법:
 *   node scripts/migrate-memos.js
 */

require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://tars:27017/';
const DB_NAME = process.env.DB_NAME || 'docupload';

/**
 * 날짜를 YYYY.MM.DD HH:mm 형식으로 변환
 */
function formatMemoDateTime(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${day} ${h}:${min}`;
}

async function migrateMemos() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('MongoDB 연결 성공');

    const db = client.db(DB_NAME);
    const customersCollection = db.collection('customers');
    const memosCollection = db.collection('customer_memos');

    // 1. 모든 메모를 customer_id로 그룹화
    console.log('\n메모 데이터 집계 중...');

    const memoAggregation = await memosCollection.aggregate([
      { $sort: { created_at: 1 } },
      {
        $group: {
          _id: '$customer_id',
          memos: { $push: '$$ROOT' },
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    console.log(`${memoAggregation.length}개 고객의 메모 발견`);

    // 2. 각 고객의 memo 필드 업데이트
    let successCount = 0;
    let errorCount = 0;

    for (const doc of memoAggregation) {
      try {
        // 타임스탬프 형식으로 변환
        const memoText = doc.memos.map(m =>
          `[${formatMemoDateTime(m.created_at)}] ${m.content}`
        ).join('\n');

        // customers.memo 필드 업데이트
        const result = await customersCollection.updateOne(
          { _id: doc._id },
          {
            $set: {
              memo: memoText,
              'meta.updated_at': new Date()
            }
          }
        );

        if (result.matchedCount > 0) {
          successCount++;
          console.log(`  ✓ 고객 ${doc._id}: ${doc.count}개 메모 마이그레이션`);
        } else {
          console.log(`  ⚠ 고객 ${doc._id}: 고객 문서 없음 (삭제된 고객?)`);
        }
      } catch (error) {
        errorCount++;
        console.error(`  ✗ 고객 ${doc._id}: 오류 - ${error.message}`);
      }
    }

    // 3. 결과 요약
    console.log('\n========== 마이그레이션 완료 ==========');
    console.log(`성공: ${successCount}개 고객`);
    console.log(`실패: ${errorCount}개 고객`);
    console.log(`총 처리: ${memoAggregation.length}개 고객`);

    // 4. 검증 (샘플)
    console.log('\n========== 검증 (샘플 5개) ==========');
    const sample = await customersCollection.find(
      { memo: { $exists: true, $ne: '' } },
      { projection: { 'personal_info.name': 1, memo: 1 } }
    ).limit(5).toArray();

    sample.forEach(c => {
      const memoPreview = c.memo?.substring(0, 80).replace(/\n/g, ' ') || '(없음)';
      console.log(`  ${c.personal_info?.name || c._id}: ${memoPreview}...`);
    });

  } catch (error) {
    console.error('마이그레이션 오류:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\nMongoDB 연결 종료');
  }
}

// 실행
migrateMemos();
