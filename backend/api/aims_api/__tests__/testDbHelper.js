/**
 * testDbHelper.js
 * 테스트용 MongoDB 연결 헬퍼
 *
 * localhost 연결 실패 시 Tailscale IP로 자동 fallback
 *
 * DB 분리 전략:
 * - TEST_DB_NAME ('docupload'): Contract/Integration 테스트용 (API 서버와 동일 DB)
 * - ISOLATED_DB_NAME ('docupload_test'): 단위 테스트용 (프로덕션 트래픽과 격리)
 */

const { MongoClient } = require('mongodb');

const MONGO_URIS = [
  process.env.MONGO_URI,                    // 1순위: 환경변수
  'mongodb://localhost:27017',              // 2순위: localhost (서버 환경)
  'mongodb://100.110.215.65:27017',         // 3순위: Tailscale (로컬 개발 환경)
].filter(Boolean);

const TEST_DB_NAME = 'docupload';
const ISOLATED_DB_NAME = 'docupload_test';

/**
 * MongoDB 연결 (자동 fallback)
 * @param {string} [dbName] - 연결할 DB 이름 (기본값: TEST_DB_NAME)
 * @returns {Promise<{client: MongoClient, uri: string}>}
 */
async function connectWithFallback(dbName) {
  const targetDb = dbName || TEST_DB_NAME;
  for (const uri of MONGO_URIS) {
    try {
      const client = await MongoClient.connect(uri, {
        serverSelectionTimeoutMS: 3000,  // 3초 타임아웃
      });
      // 연결 테스트
      await client.db(targetDb).command({ ping: 1 });
      return { client, uri };
    } catch (err) {
      // 다음 URI 시도
      continue;
    }
  }
  throw new Error(`MongoDB 연결 실패. 시도한 URI: ${MONGO_URIS.join(', ')}`);
}

module.exports = {
  connectWithFallback,
  TEST_DB_NAME,
  ISOLATED_DB_NAME,
  MONGO_URIS,
};
