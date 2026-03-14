/**
 * 역방향 메모 마이그레이션 스크립트
 *
 * customers.memo 텍스트 필드 → customer_memos 컬렉션으로 파싱/INSERT
 * 이미 customer_memos에 존재하는 메모는 건너뜀 (중복 방지)
 *
 * 사용법:
 *   node scripts/migrate-memos-reverse.js              # dry-run (기본)
 *   node scripts/migrate-memos-reverse.js --execute     # 실제 실행
 *   node scripts/migrate-memos-reverse.js --check       # 데이터 검증만
 */

require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://tars:27017/';
const DB_NAME = process.env.DB_NAME || 'docupload';

const args = process.argv.slice(2);
const isDryRun = !args.includes('--execute');
const isCheckOnly = args.includes('--check');

/**
 * [YYYY.MM.DD HH:mm] 패턴으로 메모 텍스트 파싱
 * 타임스탬프가 없는 줄은 이전 메모의 continuation 또는 단독 메모로 처리
 */
function parseMemoText(memoText) {
  if (!memoText || memoText.trim().length === 0) return [];

  const lines = memoText.split('\n');
  const memos = [];
  let currentMemo = null;

  // 타임스탬프 패턴: [YYYY.MM.DD HH:mm]
  const timestampPattern = /^\[(\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2})\]\s*(.*)$/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(timestampPattern);

    if (match) {
      // 이전 메모가 있으면 저장
      if (currentMemo) {
        memos.push(currentMemo);
      }

      // 타임스탬프 파싱: "2026.03.14 14:30" → Date 객체
      const dateStr = match[1]; // "2026.03.14 14:30"
      const content = match[2].trim();

      // KST → UTC 변환 (AIMS 표준: 백엔드는 UTC 저장)
      const [datePart, timePart] = dateStr.split(/\s+/);
      const [year, month, day] = datePart.split('.');
      const [hour, minute] = timePart.split(':');
      const kstDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+09:00`);

      currentMemo = {
        content: content,
        created_at: kstDate,
      };
    } else {
      // 타임스탬프 없는 줄
      if (currentMemo) {
        // 이전 메모의 continuation (멀티라인)
        currentMemo.content += '\n' + trimmed;
      } else {
        // 타임스탬프 없는 단독 메모 → 마이그레이션 시점으로 처리
        currentMemo = {
          content: trimmed,
          created_at: new Date(), // 마이그레이션 시점
        };
      }
    }
  }

  // 마지막 메모 저장
  if (currentMemo) {
    memos.push(currentMemo);
  }

  return memos;
}

/**
 * 데이터 검증: customers.memo에만 있고 customer_memos에 없는 데이터 확인
 */
async function checkData(db) {
  const customersCollection = db.collection('customers');
  const memosCollection = db.collection('customer_memos');

  // memo 필드가 있는 고객 수
  const customersWithMemo = await customersCollection.countDocuments({
    memo: { $exists: true, $ne: null, $ne: '' }
  });

  // customer_memos에 메모가 있는 고객 수
  const customersWithMemoCollection = await memosCollection.aggregate([
    { $group: { _id: '$customer_id' } },
    { $count: 'total' }
  ]).toArray();
  const memoCollectionCustomerCount = customersWithMemoCollection[0]?.total || 0;

  // customer_memos 총 문서 수
  const totalMemoDocuments = await memosCollection.countDocuments({});

  console.log('\n========== 데이터 검증 결과 ==========');
  console.log(`customers.memo 필드가 있는 고객: ${customersWithMemo}명`);
  console.log(`customer_memos 컬렉션에 메모가 있는 고객: ${memoCollectionCustomerCount}명`);
  console.log(`customer_memos 총 문서 수: ${totalMemoDocuments}건`);

  // customers.memo는 있지만 customer_memos에는 없는 고객 목록
  const customersOnlyInMemoField = await customersCollection.aggregate([
    { $match: { memo: { $exists: true, $ne: null, $ne: '' } } },
    {
      $lookup: {
        from: 'customer_memos',
        localField: '_id',
        foreignField: 'customer_id',
        as: 'existing_memos'
      }
    },
    { $match: { existing_memos: { $size: 0 } } },
    { $project: { 'personal_info.name': 1, memo: 1 } }
  ]).toArray();

  console.log(`\ncustomers.memo에만 있는 고객 (customer_memos 없음): ${customersOnlyInMemoField.length}명`);

  if (customersOnlyInMemoField.length > 0) {
    console.log('\n대상 고객 목록:');
    customersOnlyInMemoField.forEach(c => {
      const name = c.personal_info?.name || '(이름 없음)';
      const lines = (c.memo || '').split('\n').length;
      console.log(`  - ${name} (${c._id}): ${lines}줄`);
    });
  }

  return customersOnlyInMemoField;
}

async function migrate() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('MongoDB 연결 성공');
    console.log(`모드: ${isCheckOnly ? '검증만' : isDryRun ? 'DRY-RUN (실제 변경 없음)' : '실행'}`);

    const db = client.db(DB_NAME);

    // 1. 인덱스 확인/생성
    const memosCollection = db.collection('customer_memos');
    const indexes = await memosCollection.indexes();
    const hasCustomerIdIndex = indexes.some(idx =>
      idx.key && idx.key.customer_id !== undefined
    );

    if (!hasCustomerIdIndex) {
      if (!isDryRun && !isCheckOnly) {
        await memosCollection.createIndex({ customer_id: 1 });
        console.log('customer_memos.customer_id 인덱스 생성 완료');
      } else {
        console.log('[DRY-RUN] customer_memos.customer_id 인덱스 생성 필요');
      }
    } else {
      console.log('customer_memos.customer_id 인덱스 이미 존재');
    }

    // 2. 데이터 검증
    const targetCustomers = await checkData(db);

    if (isCheckOnly) {
      console.log('\n검증 완료.');
      return;
    }

    if (targetCustomers.length === 0) {
      console.log('\n마이그레이션 대상이 없습니다. (이미 동기화됨)');
      return;
    }

    // 3. 마이그레이션 실행
    console.log(`\n========== 마이그레이션 ${isDryRun ? '시뮬레이션' : '실행'} ==========`);

    let totalInserted = 0;
    let totalSkipped = 0;
    let errorCount = 0;

    for (const customer of targetCustomers) {
      try {
        const parsedMemos = parseMemoText(customer.memo);

        if (parsedMemos.length === 0) {
          console.log(`  건너뜀: ${customer.personal_info?.name || customer._id} (파싱 결과 없음)`);
          totalSkipped++;
          continue;
        }

        // created_by: 해당 고객의 meta.created_by (설계사 ID)
        const fullCustomer = await db.collection('customers').findOne(
          { _id: customer._id },
          { projection: { 'meta.created_by': 1 } }
        );
        const createdBy = fullCustomer?.meta?.created_by || 'migration';

        const memoDocuments = parsedMemos.map(memo => ({
          customer_id: customer._id,
          content: memo.content,
          created_by: createdBy,
          created_at: memo.created_at,
          updated_at: memo.created_at,
        }));

        if (isDryRun) {
          console.log(`  [DRY-RUN] ${customer.personal_info?.name || customer._id}: ${memoDocuments.length}건 INSERT 예정`);
          memoDocuments.forEach((doc, i) => {
            const preview = doc.content.substring(0, 60).replace(/\n/g, ' ');
            console.log(`    ${i + 1}. [${doc.created_at.toISOString()}] ${preview}...`);
          });
        } else {
          const result = await memosCollection.insertMany(memoDocuments);
          console.log(`  ${customer.personal_info?.name || customer._id}: ${result.insertedCount}건 INSERT 완료`);
        }

        totalInserted += memoDocuments.length;
      } catch (error) {
        errorCount++;
        console.error(`  오류: ${customer.personal_info?.name || customer._id}: ${error.message}`);
      }
    }

    // 4. 결과 요약
    console.log('\n========== 마이그레이션 결과 ==========');
    console.log(`${isDryRun ? '[DRY-RUN] ' : ''}INSERT: ${totalInserted}건`);
    console.log(`건너뜀: ${totalSkipped}건`);
    console.log(`오류: ${errorCount}건`);

  } catch (error) {
    console.error('마이그레이션 오류:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\nMongoDB 연결 종료');
  }
}

// 실행
migrate();
