/**
 * E11000 에러 시뮬레이션 테스트
 *
 * 문제 시나리오 재현:
 * 1. 파일 업로드 → 문서 생성 (file_hash 있음)
 * 2. 같은 파일 다시 업로드 (중복 체크 없이) → 새 문서 생성 (file_hash 없음)
 * 3. Update Meta에서 file_hash 설정 시도 → E11000 에러!
 *
 * @since 2026-01-04
 */

const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'docupload';

const TEST_OWNER_ID = 'simulation_test_owner_' + Date.now();
const TEST_FILE_HASH = 'simulation_hash_' + Date.now();

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

async function runSimulation() {
  console.log(`${CYAN}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${CYAN}  E11000 에러 시뮬레이션${RESET}`);
  console.log(`${CYAN}═══════════════════════════════════════════════════════════════${RESET}\n`);

  const client = new MongoClient(MONGO_URI);
  const createdDocs = [];

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const files = db.collection('files');

    // ===== 1단계: 첫 번째 문서 생성 (정상 업로드 시뮬레이션) =====
    console.log(`${YELLOW}[1] 첫 번째 문서 생성 (정상 업로드)${RESET}`);
    const doc1 = await files.insertOne({
      ownerId: TEST_OWNER_ID,
      upload: { originalName: 'test.pdf' },
      meta: { file_hash: TEST_FILE_HASH, size_bytes: 1000 },
      createdAt: new Date()
    });
    createdDocs.push(doc1.insertedId);
    console.log(`  ${GREEN}✓ 문서 1 생성: ${doc1.insertedId}${RESET}`);
    console.log(`  → file_hash: ${TEST_FILE_HASH}\n`);

    // ===== 2단계: 같은 파일 재업로드 시뮬레이션 (중복 체크 없이) =====
    console.log(`${YELLOW}[2] 두 번째 문서 생성 (중복 체크 없이 업로드 - n8n Save OwnerId)${RESET}`);
    const doc2 = await files.insertOne({
      ownerId: TEST_OWNER_ID,
      upload: { originalName: 'test.pdf' },
      // file_hash 없음 - n8n에서 나중에 Update Meta로 설정
      createdAt: new Date()
    });
    createdDocs.push(doc2.insertedId);
    console.log(`  ${GREEN}✓ 문서 2 생성: ${doc2.insertedId}${RESET}`);
    console.log(`  → file_hash: (없음 - 나중에 설정 예정)\n`);

    // ===== 3단계: Update Meta 시뮬레이션 (E11000 발생!) =====
    console.log(`${YELLOW}[3] Update Meta 시뮬레이션 (file_hash 설정 시도)${RESET}`);
    try {
      await files.updateOne(
        { _id: doc2.insertedId },
        { $set: { 'meta.file_hash': TEST_FILE_HASH } }  // 동일 hash 설정 시도
      );
      console.log(`  ${RED}✗ Update 성공?! (E11000이 발생해야 하는데...)${RESET}\n`);
    } catch (error) {
      if (error.code === 11000) {
        console.log(`  ${GREEN}✓ E11000 에러 발생! (예상대로)${RESET}`);
        console.log(`  → 이것이 문제의 원인입니다!`);
        console.log(`  → 중복 체크 없이 업로드 → Update Meta에서 충돌\n`);
      } else {
        console.log(`  ${RED}✗ 예상치 못한 에러: ${error.message}${RESET}\n`);
      }
    }

    // ===== 4단계: 수정 후 시나리오 시뮬레이션 =====
    console.log(`${YELLOW}[4] 수정 후 시나리오: 업로드 전 중복 체크${RESET}`);

    // 중복 체크 시뮬레이션 (checkSystemDuplicate)
    const existingDoc = await files.findOne({
      ownerId: TEST_OWNER_ID,
      'meta.file_hash': TEST_FILE_HASH
    });

    if (existingDoc) {
      console.log(`  ${GREEN}✓ 중복 감지! 업로드 차단${RESET}`);
      console.log(`  → 기존 문서: ${existingDoc._id}`);
      console.log(`  → 프론트엔드에서 "이미 등록된 파일입니다" 에러 표시\n`);
    } else {
      console.log(`  → 중복 없음, 업로드 진행 가능\n`);
    }

    // ===== 결과 =====
    console.log(`${GREEN}═══════════════════════════════════════════════════════════════${RESET}`);
    console.log(`${GREEN}  시뮬레이션 완료!${RESET}`);
    console.log(`${GREEN}${RESET}`);
    console.log(`${GREEN}  문제 재현: 중복 체크 없이 업로드 → E11000 에러${RESET}`);
    console.log(`${GREEN}  해결 방법: 업로드 전 checkSystemDuplicate()로 중복 차단${RESET}`);
    console.log(`${GREEN}═══════════════════════════════════════════════════════════════${RESET}`);

  } catch (error) {
    console.error(`${RED}시뮬레이션 실패:${RESET}`, error);
  } finally {
    // 정리
    const db = client.db(DB_NAME);
    for (const docId of createdDocs) {
      await db.collection('files').deleteOne({ _id: docId });
    }
    console.log(`\n${CYAN}→ 테스트 문서 ${createdDocs.length}개 정리 완료${RESET}`);
    await client.close();
  }
}

runSimulation();
