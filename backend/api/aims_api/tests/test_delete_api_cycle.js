/**
 * 문서 삭제 API 테스트
 *
 * 실제 DELETE /api/documents/:id API를 호출하여 삭제 후 재업로드 테스트
 *
 * @since 2026-01-04
 */

const http = require('http');
const { MongoClient, ObjectId } = require('mongodb');

const API_HOST = 'localhost';
const API_PORT = 3010;
const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'docupload';

// 테스트용 설계사 ID
const TEST_OWNER_ID = '694f9415a0f94f0a13f49894';
const TEST_FILE_HASH = 'api_test_hash_' + Date.now();
const TEST_FILENAME = 'api_test_delete_' + Date.now() + '.pdf';

// JWT 토큰 (테스트용 - 실제 유효한 토큰 필요)
// 이 토큰은 TEST_OWNER_ID 사용자의 토큰이어야 함
const JWT_TOKEN = process.env.TEST_JWT_TOKEN || '';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function makeRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: data ? JSON.parse(data) : null
          });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTest() {
  console.log(`${CYAN}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${CYAN}  문서 삭제 API 사이클 테스트${RESET}`);
  console.log(`${CYAN}═══════════════════════════════════════════════════════════════${RESET}\n`);

  if (!JWT_TOKEN) {
    console.log(`${RED}테스트 JWT 토큰이 필요합니다.${RESET}`);
    console.log(`환경변수 TEST_JWT_TOKEN을 설정하세요.\n`);
    console.log(`사용법:`);
    console.log(`  TEST_JWT_TOKEN="eyJ..." node tests/test_delete_api_cycle.js\n`);
    return;
  }

  const client = new MongoClient(MONGO_URI);
  let testDocId = null;

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const filesCollection = db.collection('files');

    // ===== 테스트 1: DB에 직접 테스트 문서 생성 =====
    console.log(`${YELLOW}[1] 테스트 문서 직접 생성 (DB)${RESET}`);
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

    // ===== 테스트 2: DELETE API 호출 =====
    console.log(`${YELLOW}[2] DELETE /api/documents/${testDocId} 호출${RESET}`);
    const deleteResponse = await makeRequest(
      'DELETE',
      `/api/documents/${testDocId}`,
      null,
      JWT_TOKEN
    );

    console.log(`  → Status: ${deleteResponse.status}`);
    console.log(`  → Response: ${JSON.stringify(deleteResponse.data)}`);

    if (deleteResponse.status === 200 && deleteResponse.data?.success) {
      console.log(`  ${GREEN}✓ API 삭제 성공${RESET}\n`);
    } else {
      console.log(`  ${RED}✗ API 삭제 실패${RESET}\n`);

      // 정리: 직접 삭제
      await filesCollection.deleteOne({ _id: testDocId });
      return;
    }

    // ===== 테스트 3: DB에서 삭제 확인 =====
    console.log(`${YELLOW}[3] DB에서 삭제 확인${RESET}`);
    const deletedDoc = await filesCollection.findOne({ _id: testDocId });
    if (deletedDoc === null) {
      console.log(`  ${GREEN}✓ DB에서 완전 삭제됨${RESET}\n`);
    } else {
      console.log(`  ${RED}✗ 문서가 DB에 남아있음!${RESET}`);
      console.log(`  → status: ${deletedDoc.status || '없음'}`);
      console.log(`  → file_hash: ${deletedDoc.meta?.file_hash}\n`);

      // 버그 발견!
      console.log(`  ${RED}버그: API 삭제는 성공했지만 DB에서 삭제되지 않음${RESET}\n`);

      // 정리
      await filesCollection.deleteOne({ _id: testDocId });
      return;
    }

    // ===== 테스트 4: 동일 해시로 재업로드 (DB 직접) =====
    console.log(`${YELLOW}[4] 동일 해시로 재업로드 시도${RESET}`);
    try {
      const reuploadResult = await filesCollection.insertOne({
        ownerId: TEST_OWNER_ID,
        upload: { originalName: TEST_FILENAME + '_reuploaded' },
        meta: { file_hash: TEST_FILE_HASH }
      });
      console.log(`  ${GREEN}✓ 재업로드 성공: ${reuploadResult.insertedId}${RESET}\n`);

      // 정리
      await filesCollection.deleteOne({ _id: reuploadResult.insertedId });
    } catch (error) {
      if (error.code === 11000) {
        console.log(`  ${RED}✗ E11000 에러! 동일 해시 문서가 존재${RESET}`);

        const duplicates = await filesCollection.find({
          ownerId: TEST_OWNER_ID,
          'meta.file_hash': TEST_FILE_HASH
        }).toArray();
        console.log(`  → 중복 문서 ${duplicates.length}개:`);
        duplicates.forEach(d => console.log(`    - ${d._id}`));
      } else {
        throw error;
      }
      return;
    }

    // ===== 결과 =====
    console.log(`${GREEN}═══════════════════════════════════════════════════════════════${RESET}`);
    console.log(`${GREEN}  ✓ 모든 테스트 통과!${RESET}`);
    console.log(`${GREEN}  → DELETE API가 정상 작동합니다.${RESET}`);
    console.log(`${GREEN}═══════════════════════════════════════════════════════════════${RESET}`);

  } catch (error) {
    console.error(`${RED}테스트 실패:${RESET}`, error);

    // 정리
    if (testDocId) {
      const db = client.db(DB_NAME);
      await db.collection('files').deleteOne({ _id: testDocId });
    }
  } finally {
    await client.close();
  }
}

runTest();
