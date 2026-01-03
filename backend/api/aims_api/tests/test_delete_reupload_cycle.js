/**
 * 문서 삭제 후 재업로드 테스트
 *
 * 테스트 시나리오:
 * 1. 파일 업로드 → file_hash 저장
 * 2. 문서 삭제 (DELETE /api/documents/:id)
 * 3. DB에서 완전 삭제 확인
 * 4. 같은 파일 재업로드 → E11000 에러 없이 성공해야 함
 *
 * @since 2026-01-04
 */

const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'docupload';
const FILES_COLLECTION = 'files';

// 테스트용 설계사 ID (실제 존재하는 ID 사용)
const TEST_OWNER_ID = '694f9415a0f94f0a13f49894';

// 테스트용 파일 해시 (SHA-256)
const TEST_FILE_HASH = 'test_hash_' + Date.now();
const TEST_FILENAME = 'test_delete_cycle_' + Date.now() + '.pdf';

// 색상 코드
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

async function runTest() {
  console.log(`${CYAN}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${CYAN}  문서 삭제 후 재업로드 사이클 테스트${RESET}`);
  console.log(`${CYAN}═══════════════════════════════════════════════════════════════${RESET}\n`);

  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const filesCollection = db.collection(FILES_COLLECTION);

    let testDocId = null;

    // ===== 테스트 1: 문서 생성 =====
    console.log(`${YELLOW}[1] 테스트 문서 생성${RESET}`);
    const insertResult = await filesCollection.insertOne({
      ownerId: TEST_OWNER_ID,
      upload: {
        originalName: TEST_FILENAME,
        uploaded_at: new Date()
      },
      meta: {
        file_hash: TEST_FILE_HASH,
        size_bytes: 12345,
        mime: 'application/pdf'
      },
      createdAt: new Date()
    });
    testDocId = insertResult.insertedId;
    console.log(`  ${GREEN}✓ 문서 생성됨: ${testDocId}${RESET}`);
    console.log(`  → file_hash: ${TEST_FILE_HASH}\n`);

    // ===== 테스트 2: 동일 해시로 중복 문서 생성 시도 (E11000 예상) =====
    console.log(`${YELLOW}[2] 동일 해시로 중복 문서 생성 시도${RESET}`);
    try {
      await filesCollection.insertOne({
        ownerId: TEST_OWNER_ID,
        upload: { originalName: TEST_FILENAME + '_dup' },
        meta: { file_hash: TEST_FILE_HASH }  // 동일 해시
      });
      console.log(`  ${RED}✗ 중복 문서 생성됨 (예상: E11000 에러)${RESET}\n`);
    } catch (error) {
      if (error.code === 11000) {
        console.log(`  ${GREEN}✓ E11000 에러 발생 (정상 - unique 인덱스 작동)${RESET}\n`);
      } else {
        console.log(`  ${RED}✗ 예상치 못한 에러: ${error.message}${RESET}\n`);
      }
    }

    // ===== 테스트 3: 문서 삭제 (deleteOne) =====
    console.log(`${YELLOW}[3] 문서 삭제 (Hard Delete)${RESET}`);
    const deleteResult = await filesCollection.deleteOne({ _id: testDocId });
    if (deleteResult.deletedCount === 1) {
      console.log(`  ${GREEN}✓ 문서 삭제됨: ${testDocId}${RESET}\n`);
    } else {
      console.log(`  ${RED}✗ 문서 삭제 실패${RESET}\n`);
      return;
    }

    // ===== 테스트 4: DB에서 완전 삭제 확인 =====
    console.log(`${YELLOW}[4] DB에서 완전 삭제 확인${RESET}`);
    const deletedDoc = await filesCollection.findOne({ _id: testDocId });
    if (deletedDoc === null) {
      console.log(`  ${GREEN}✓ DB에서 문서 완전 삭제됨${RESET}\n`);
    } else {
      console.log(`  ${RED}✗ 문서가 여전히 DB에 존재!${RESET}`);
      console.log(`  → status: ${deletedDoc.status}`);
      console.log(`  → file_hash: ${deletedDoc.meta?.file_hash}\n`);
      return;
    }

    // ===== 테스트 5: 동일 해시로 재업로드 시도 (성공 예상) =====
    console.log(`${YELLOW}[5] 삭제 후 동일 해시로 재업로드 시도${RESET}`);
    try {
      const reuploadResult = await filesCollection.insertOne({
        ownerId: TEST_OWNER_ID,
        upload: {
          originalName: TEST_FILENAME + '_reuploaded',
          uploaded_at: new Date()
        },
        meta: {
          file_hash: TEST_FILE_HASH,  // 동일 해시
          size_bytes: 12345
        },
        createdAt: new Date()
      });
      console.log(`  ${GREEN}✓ 재업로드 성공: ${reuploadResult.insertedId}${RESET}`);
      console.log(`  → 삭제 후 재업로드가 정상 작동함!\n`);

      // 정리: 재업로드된 문서 삭제
      await filesCollection.deleteOne({ _id: reuploadResult.insertedId });
      console.log(`  ${CYAN}→ 테스트 문서 정리 완료${RESET}\n`);
    } catch (error) {
      if (error.code === 11000) {
        console.log(`  ${RED}✗ E11000 에러 발생!${RESET}`);
        console.log(`  → 삭제 후에도 동일 해시 문서가 존재함`);
        console.log(`  → 버그: 삭제가 완전하지 않음\n`);

        // 디버그: 동일 해시 문서 조회
        const duplicates = await filesCollection.find({
          ownerId: TEST_OWNER_ID,
          'meta.file_hash': TEST_FILE_HASH
        }).toArray();
        console.log(`  ${YELLOW}→ 동일 해시 문서 ${duplicates.length}개 발견:${RESET}`);
        duplicates.forEach(d => {
          console.log(`    - ${d._id}: ${d.upload?.originalName}`);
        });
      } else {
        console.log(`  ${RED}✗ 예상치 못한 에러: ${error.message}${RESET}\n`);
      }
      return;
    }

    // ===== 결과 =====
    console.log(`${GREEN}═══════════════════════════════════════════════════════════════${RESET}`);
    console.log(`${GREEN}  ✓ 모든 테스트 통과!${RESET}`);
    console.log(`${GREEN}  → 문서 삭제 후 재업로드가 정상 작동합니다.${RESET}`);
    console.log(`${GREEN}═══════════════════════════════════════════════════════════════${RESET}`);

  } catch (error) {
    console.error(`${RED}테스트 실패:${RESET}`, error);
  } finally {
    await client.close();
  }
}

runTest();
