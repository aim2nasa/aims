/**
 * migrateOcrUsageLog.js
 * 기존 OCR 기록을 ocr_usage_log 컬렉션으로 마이그레이션
 *
 * @since 2025-12-23
 *
 * 사용법:
 *   node scripts/migrateOcrUsageLog.js
 *
 * 동작:
 * 1. files 컬렉션에서 OCR 처리된 문서 조회
 * 2. ocr_usage_log 컬렉션에 기록 복사
 * 3. 중복 방지 (file_id unique index)
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DOCUPLOAD_DB = 'docupload';
const ANALYTICS_DB = 'aims_analytics';

async function migrate() {
  console.log('='.repeat(60));
  console.log('OCR 사용량 로그 마이그레이션 시작');
  console.log('='.repeat(60));
  console.log(`MongoDB URI: ${MONGODB_URI.replace(/\/\/[^@]+@/, '//***@')}`);

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('[1/5] MongoDB 연결 성공');

    const docuploadDb = client.db(DOCUPLOAD_DB);
    const analyticsDb = client.db(ANALYTICS_DB);

    const filesCollection = docuploadDb.collection('files');
    const ocrUsageLogCollection = analyticsDb.collection('ocr_usage_log');

    // 인덱스 생성
    console.log('[2/5] 인덱스 생성 중...');
    await ocrUsageLogCollection.createIndex({ processed_at: -1 });
    await ocrUsageLogCollection.createIndex({ owner_id: 1, processed_at: -1 });
    await ocrUsageLogCollection.createIndex({ file_id: 1 });
    await ocrUsageLogCollection.createIndex({ status: 1, processed_at: -1 });
    console.log('   인덱스 생성 완료');

    // OCR 처리된 문서 조회
    console.log('[3/5] OCR 처리된 문서 조회 중...');
    const ocrDocs = await filesCollection.find({
      'ocr.status': { $in: ['done', 'error'] }
    }).project({
      _id: 1,
      ownerId: 1,
      'ocr.status': 1,
      'ocr.page_count': 1,
      'ocr.done_at': 1,
      'ocr.failed_at': 1,
      'ocr.statusCode': 1,
      'ocr.statusMessage': 1
    }).toArray();

    console.log(`   발견된 OCR 처리 문서: ${ocrDocs.length}건`);

    // 마이그레이션 시작
    console.log('[4/5] 마이그레이션 시작...');
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const doc of ocrDocs) {
      try {
        const fileId = doc._id.toString();
        const ocrStatus = doc.ocr?.status;
        const pageCount = doc.ocr?.page_count || 1;

        // 처리 시간 결정
        let processedAt;
        if (ocrStatus === 'done' && doc.ocr?.done_at) {
          processedAt = new Date(doc.ocr.done_at);
        } else if (ocrStatus === 'error' && doc.ocr?.failed_at) {
          processedAt = new Date(doc.ocr.failed_at);
        } else {
          // 날짜 정보 없으면 현재 시간 사용
          processedAt = new Date();
        }

        const logEntry = {
          file_id: fileId,
          owner_id: doc.ownerId || null,
          page_count: ocrStatus === 'done' ? pageCount : 0,
          status: ocrStatus,
          processed_at: processedAt,
          error_code: ocrStatus === 'error' ? (doc.ocr?.statusCode || null) : null,
          error_message: ocrStatus === 'error' ? (doc.ocr?.statusMessage || null) : null,
          metadata: { migrated: true, migrated_at: new Date() },
          created_at: new Date()
        };

        // upsert로 중복 방지
        const result = await ocrUsageLogCollection.updateOne(
          { file_id: fileId },
          { $setOnInsert: logEntry },
          { upsert: true }
        );

        if (result.upsertedCount > 0) {
          successCount++;
        } else {
          skipCount++;
        }
      } catch (err) {
        if (err.code === 11000) {
          // 중복 키 에러 - 이미 존재하는 레코드
          skipCount++;
        } else {
          console.error(`   오류: ${doc._id}: ${err.message}`);
          errorCount++;
        }
      }
    }

    // 결과 출력
    console.log('[5/5] 마이그레이션 완료');
    console.log('='.repeat(60));
    console.log('결과 요약:');
    console.log(`  - 성공 (새로 추가): ${successCount}건`);
    console.log(`  - 스킵 (이미 존재): ${skipCount}건`);
    console.log(`  - 오류: ${errorCount}건`);
    console.log('='.repeat(60));

    // 통계 확인
    const totalLogs = await ocrUsageLogCollection.countDocuments();
    const doneLogs = await ocrUsageLogCollection.countDocuments({ status: 'done' });
    const errorLogs = await ocrUsageLogCollection.countDocuments({ status: 'error' });

    console.log('ocr_usage_log 컬렉션 현재 상태:');
    console.log(`  - 전체: ${totalLogs}건`);
    console.log(`  - 성공(done): ${doneLogs}건`);
    console.log(`  - 실패(error): ${errorLogs}건`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('마이그레이션 실패:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('MongoDB 연결 종료');
  }
}

migrate();
