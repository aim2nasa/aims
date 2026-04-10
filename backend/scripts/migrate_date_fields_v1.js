#!/usr/bin/env node
/**
 * migrate_date_fields_v1.js — files/customers 날짜 필드 string→Date 마이그레이션 (#55)
 *
 * 배경:
 *   파이프라인이 Python isoformat string으로 timestamp를 저장한 데이터 1,758건이 발견됨.
 *   - files.createdAt:               1,384건
 *   - files.overallStatusUpdatedAt:     60건
 *   - files.upload.converted_at:       209건
 *   - customers.meta.updated_at:       105건
 *
 *   본 스크립트는 이 데이터를 BSON Date로 변환합니다.
 *
 * 안전성:
 *   - **idempotent**: 재실행해도 0건 처리 (string 타입만 대상으로 검색)
 *   - **변환 제외**: upload.uploaded_at, docembed.updated_at은 절대 건드리지 않음
 *   - **dry-run 지원**: --dry-run 플래그로 미리보기 가능
 *   - 100건 단위 배치 처리, 진행률 로그
 *
 * 사용법:
 *   node scripts/migrate_date_fields_v1.js [--dry-run]
 *
 * 환경변수:
 *   MONGO_URI - 기본값: mongodb://localhost:27017
 *   MONGO_DB  - 기본값: docupload
 */

// mongodb 모듈은 backend/api/aims_api 에서만 설치되어 있음.
// scripts/ 디렉터리에 자체 node_modules가 없으므로 명시적 경로로 require.
let MongoClient;
try {
  ({ MongoClient } = require('mongodb'));
} catch (e) {
  ({ MongoClient } = require('../api/aims_api/node_modules/mongodb'));
}

const BATCH_SIZE = 100;

// ============================================================================
// 공통 변환 헬퍼
// ============================================================================

const HAS_TZ_RE = /(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Python isoformat 등 타임존 미지정 문자열을 UTC 명시 형식으로 정규화.
 * dateCoerce.js의 normalizeIsoForUtc와 동일 로직.
 */
function normalizeIsoForUtc(s) {
  if (typeof s !== 'string') return s;
  if (HAS_TZ_RE.test(s)) return s;
  const m = s.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?$/);
  if (m) {
    const base = m[1];
    const frac = m[2];
    if (frac && frac.length > 0) {
      return `${base}.${frac.slice(0, 3).padEnd(3, '0')}Z`;
    }
    return `${base}Z`;
  }
  return s;
}

/**
 * string → Date 변환. 실패 시 null 반환.
 */
function toDate(value) {
  if (typeof value !== 'string') return null;
  const normalized = normalizeIsoForUtc(value);
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return null;
  return d;
}

/**
 * 단일 필드(top-level 또는 dot-path)에 대해 string인 문서를 찾아 Date로 변환합니다.
 *
 * @param {object} db - MongoDB Db 객체
 * @param {string} collectionName
 * @param {string} fieldPath - "createdAt" 또는 "upload.converted_at" 등
 * @param {object} options
 * @param {boolean} options.dryRun
 * @returns {Promise<{converted: number, skipped: number}>}
 *   converted: string→Date 변환에 성공한 문서 수
 *   skipped:   이미 Date 타입이거나 parse 실패로 건너뛴 문서 수
 */
async function migrateField(db, collectionName, fieldPath, { dryRun = false } = {}) {
  const collection = db.collection(collectionName);
  const stringFilter = { [fieldPath]: { $type: 'string' } };
  const dateFilter = { [fieldPath]: { $type: 'date' } };

  const stringCount = await collection.countDocuments(stringFilter);
  const dateCount = await collection.countDocuments(dateFilter);

  if (stringCount === 0 && dateCount === 0) {
    return { converted: 0, skipped: 0 };
  }

  if (stringCount > 0) {
    console.log(`  [${collectionName}.${fieldPath}] string 타입 ${stringCount}건 발견 (이미 Date: ${dateCount}건)`);
  }

  let converted = 0;
  let parseFailed = 0;
  let processed = 0;

  if (stringCount > 0) {
    // batch 단위 cursor (필드만 projection)
    const cursor = collection.find(stringFilter, {
      projection: { _id: 1, [fieldPath]: 1 },
    });

    let batch = [];
    for await (const doc of cursor) {
      // dot-path 값 추출
      const value = fieldPath.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);
      const dateValue = toDate(value);

      if (dateValue === null) {
        parseFailed++;
        console.warn(`    SKIP _id=${doc._id} value="${value}" (parse 실패)`);
      } else {
        batch.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: { [fieldPath]: dateValue } },
          },
        });
        converted++;
      }

      if (batch.length >= BATCH_SIZE) {
        if (!dryRun) await collection.bulkWrite(batch, { ordered: false });
        processed += batch.length;
        console.log(`    진행 ${processed}/${stringCount} (${Math.round((processed / stringCount) * 100)}%)`);
        batch = [];
      }
    }

    if (batch.length > 0) {
      if (!dryRun) await collection.bulkWrite(batch, { ordered: false });
      processed += batch.length;
      console.log(`    진행 ${processed}/${stringCount} (100%)`);
    }
  }

  // skipped = 이미 Date인 문서 + parse 실패한 문서
  const skipped = dateCount + parseFailed;
  return { converted, skipped };
}

// ============================================================================
// files 컬렉션
// ============================================================================

/**
 * files 컬렉션의 string 날짜 필드를 BSON Date로 마이그레이션.
 *
 * 처리 대상:
 *   - createdAt
 *   - overallStatusUpdatedAt
 *   - upload.converted_at
 *
 * **절대 변환 안 함** (의도적 string):
 *   - upload.uploaded_at
 *   - docembed.updated_at
 *
 * @param {object} db
 * @param {object} [options]
 * @param {boolean} [options.dryRun]
 * @returns {Promise<{[fieldPath]: {converted, skipped}}>}
 */
async function migrateFileDates(db, options = {}) {
  console.log('\n[files] 날짜 필드 마이그레이션 시작');
  const result = {};
  result.createdAt = await migrateField(db, 'files', 'createdAt', options);
  result.overallStatusUpdatedAt = await migrateField(db, 'files', 'overallStatusUpdatedAt', options);
  result['upload.converted_at'] = await migrateField(db, 'files', 'upload.converted_at', options);
  return result;
}

// ============================================================================
// customers 컬렉션
// ============================================================================

/**
 * customers 컬렉션의 string 날짜 필드를 BSON Date로 마이그레이션.
 * 처리 대상: meta.updated_at, meta.created_at
 */
async function migrateCustomerDates(db, options = {}) {
  console.log('\n[customers] 날짜 필드 마이그레이션 시작');
  const result = {};
  result['meta.updated_at'] = await migrateField(db, 'customers', 'meta.updated_at', options);
  result['meta.created_at'] = await migrateField(db, 'customers', 'meta.created_at', options);
  return result;
}

// ============================================================================
// CLI 진입점
// ============================================================================

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
  const MONGO_DB = process.env.MONGO_DB || 'docupload';

  console.log('========================================');
  console.log('AIMS 날짜 필드 마이그레이션 v1 (#55)');
  console.log('========================================');
  console.log(`MONGO_URI : ${MONGO_URI}`);
  console.log(`MONGO_DB  : ${MONGO_DB}`);
  console.log(`MODE      : ${dryRun ? 'DRY-RUN (변경 없음)' : 'EXECUTE'}`);

  const client = new MongoClient(MONGO_URI);
  const startedAt = Date.now();
  try {
    await client.connect();
    const db = client.db(MONGO_DB);

    const filesResult = await migrateFileDates(db, { dryRun });
    const customersResult = await migrateCustomerDates(db, { dryRun });

    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(2);
    console.log('\n========================================');
    console.log('완료 (소요 시간 ' + elapsedSec + 's)');
    console.log('========================================');
    console.log('files:');
    for (const [k, v] of Object.entries(filesResult)) {
      console.log(`  ${k.padEnd(28)} converted=${v.converted}  skipped=${v.skipped}`);
    }
    console.log('customers:');
    for (const [k, v] of Object.entries(customersResult)) {
      console.log(`  ${k.padEnd(28)} converted=${v.converted}  skipped=${v.skipped}`);
    }
    if (dryRun) {
      console.log('\n[DRY-RUN] 실제 변경은 일어나지 않았습니다. --dry-run 없이 다시 실행하세요.');
    }
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}

module.exports = {
  migrateFileDates,
  migrateCustomerDates,
  migrateField,
  toDate,
  normalizeIsoForUtc,
};
