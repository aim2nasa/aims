#!/usr/bin/env node
/**
 * apply_json_schema_validators.js — MongoDB JSON Schema validator 적용 (#55)
 *
 * 목적:
 *   files.createdAt 등 핵심 timestamp 필드가 BSON Date가 아닐 때 DB 레벨에서
 *   거부하여, 게이트웨이를 우회한 string 저장이 다시 발생하지 않도록 합니다.
 *
 * 적용 컬렉션:
 *   - files     : createdAt(date), overallStatusUpdatedAt(date|null)
 *   - customers : meta.updated_at(date), meta.created_at(date)
 *
 * 안전 정책:
 *   - validationLevel: "moderate"  → 새 insert/update만 검증, 기존 문서는 영향 없음
 *   - validationAction: "error"    → 위반 시 에러 반환 (warn 아님)
 *   - **dev 환경에서만 실행** — prd는 별도 점검 후 수동 실행
 *   - dry-run 지원: --dry-run 으로 적용될 validator만 출력
 *
 * 실행 순서:
 *   1) 마이그레이션 (migrate_date_fields_v1.js)을 먼저 실행
 *   2) dry-run으로 검토:  node scripts/apply_json_schema_validators.js --dry-run
 *   3) 적용:             node scripts/apply_json_schema_validators.js
 *
 * 환경변수:
 *   MONGO_URI   - 기본 mongodb://localhost:27017
 *   MONGO_DB    - 기본 docupload
 *   AIMS_ENV    - 'dev' | 'prd' (prd면 --force 없이 실행 거부)
 */

let MongoClient;
try {
  ({ MongoClient } = require('mongodb'));
} catch (e) {
  ({ MongoClient } = require('../api/aims_api/node_modules/mongodb'));
}

// ============================================================================
// Validator 정의
// ============================================================================

const FILES_VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    properties: {
      createdAt: {
        bsonType: 'date',
        description: 'createdAt은 반드시 BSON Date여야 합니다 (#55)',
      },
      overallStatusUpdatedAt: {
        bsonType: ['date', 'null'],
        description: 'overallStatusUpdatedAt은 BSON Date 또는 null이어야 합니다 (#55)',
      },
    },
  },
};

const CUSTOMERS_VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    properties: {
      meta: {
        bsonType: 'object',
        properties: {
          updated_at: {
            bsonType: 'date',
            description: 'meta.updated_at은 반드시 BSON Date여야 합니다 (#55)',
          },
          created_at: {
            bsonType: 'date',
            description: 'meta.created_at은 반드시 BSON Date여야 합니다 (#55)',
          },
        },
      },
    },
  },
};

const COLLECTION_VALIDATORS = [
  { name: 'files', validator: FILES_VALIDATOR },
  { name: 'customers', validator: CUSTOMERS_VALIDATOR },
];

// ============================================================================
// 적용 로직
// ============================================================================

async function applyValidator(db, { name, validator }, { dryRun }) {
  console.log(`\n[${name}] validator 적용`);
  console.log(JSON.stringify(validator, null, 2));

  if (dryRun) {
    console.log('  [DRY-RUN] 실제 적용 생략');
    return;
  }

  const result = await db.command({
    collMod: name,
    validator,
    validationLevel: 'moderate', // 새 변경만 검증, 기존 데이터 영향 없음
    validationAction: 'error',
  });
  console.log(`  적용 결과: ok=${result.ok}`);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
  const MONGO_DB = process.env.MONGO_DB || 'docupload';
  const AIMS_ENV = process.env.AIMS_ENV || 'dev';

  console.log('========================================');
  console.log('JSON Schema validator 적용 (#55)');
  console.log('========================================');
  console.log(`MONGO_URI : ${MONGO_URI}`);
  console.log(`MONGO_DB  : ${MONGO_DB}`);
  console.log(`AIMS_ENV  : ${AIMS_ENV}`);
  console.log(`MODE      : ${dryRun ? 'DRY-RUN' : 'EXECUTE'}`);

  if (AIMS_ENV === 'prd' && !force) {
    console.error('\n[STOP] prd 환경에서는 --force 플래그가 필요합니다.');
    console.error('       먼저 dev 환경에서 검증한 후 실행하세요.');
    process.exit(2);
  }

  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db(MONGO_DB);

    for (const entry of COLLECTION_VALIDATORS) {
      await applyValidator(db, entry, { dryRun });
    }

    console.log('\n========================================');
    console.log('완료');
    console.log('========================================');
    if (dryRun) {
      console.log('[DRY-RUN] 실제 변경 없음. --dry-run 없이 다시 실행하세요.');
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
  FILES_VALIDATOR,
  CUSTOMERS_VALIDATOR,
  COLLECTION_VALIDATORS,
  applyValidator,
};
