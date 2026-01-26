/**
 * testDbHelper.js
 * 테스트용 MongoDB 연결 헬퍼
 *
 * localhost 연결 실패 시 Tailscale IP로 자동 fallback
 */

const { MongoClient } = require('mongodb');

const MONGO_URIS = [
  process.env.MONGO_URI,                    // 1순위: 환경변수
  'mongodb://localhost:27017',              // 2순위: localhost (서버 환경)
  'mongodb://100.110.215.65:27017',         // 3순위: Tailscale (로컬 개발 환경)
].filter(Boolean);

const TEST_DB_NAME = 'docupload';

/**
 * MongoDB 연결 (자동 fallback)
 * @returns {Promise<{client: MongoClient, uri: string}>}
 */
async function connectWithFallback() {
  for (const uri of MONGO_URIS) {
    try {
      const client = await MongoClient.connect(uri, {
        serverSelectionTimeoutMS: 3000,  // 3초 타임아웃
      });
      // 연결 테스트
      await client.db(TEST_DB_NAME).command({ ping: 1 });
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
  MONGO_URIS,
};
