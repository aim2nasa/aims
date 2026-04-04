/**
 * documentDeleteService.js - 문서 삭제 핵심 로직
 *
 * documents-routes.js의 DELETE /documents/:id 핸들러와
 * personal-files-routes.js의 폴더 삭제 시 연결 문서 삭제에서 공통으로 사용.
 *
 * 자기 호출(aims_api → aims_api HTTP) 안티패턴을 제거하기 위해 추출.
 * @since 2026-04-05
 */

const { ObjectId } = require('mongodb');
const fs = require('fs').promises;
const { COLLECTIONS } = require('@aims/shared-schema');
const { utcNowDate } = require('./timeUtils');

const COLLECTION_NAME = COLLECTIONS.FILES;
const CUSTOMERS_COLLECTION = COLLECTIONS.CUSTOMERS;

// 모듈 레벨 의존성 (init으로 주입)
let _db = null;
let _qdrantClient = null;
let _qdrantCollection = null;

/**
 * 서비스 초기화 - server.js에서 DB 연결 후 호출
 * @param {object} deps - { db, qdrantClient, qdrantCollection }
 */
function init({ db, qdrantClient, qdrantCollection }) {
  _db = db;
  _qdrantClient = qdrantClient;
  _qdrantCollection = qdrantCollection;
}

/**
 * 문서 삭제 핵심 로직 (DB + 파일 시스템 + 고객 참조 + AR 큐 + Qdrant)
 *
 * 소유권 검증은 호출자가 수행해야 합니다.
 * 이 함수는 문서가 존재한다고 가정하고 삭제만 수행합니다.
 *
 * @param {string} docId - 문서 ID (ObjectId 문자열)
 * @param {object} [options] - 추가 옵션
 * @param {object} [options.document] - 이미 조회한 문서 객체 (없으면 내부에서 조회)
 * @returns {Promise<{success: boolean, document: object|null, error?: string}>}
 */
async function deleteDocument(docId, options = {}) {
  if (!_db) {
    throw new Error('documentDeleteService가 초기화되지 않았습니다. init()을 먼저 호출하세요.');
  }

  if (!ObjectId.isValid(docId)) {
    return { success: false, document: null, error: '유효하지 않은 문서 ID입니다.' };
  }

  const objectId = new ObjectId(docId);

  // 문서 조회 (호출자가 이미 조회했으면 재사용)
  const document = options.document || await _db.collection(COLLECTION_NAME).findOne({ _id: objectId });
  if (!document) {
    return { success: false, document: null, error: '문서를 찾을 수 없습니다.' };
  }

  // 1. 고객 참조 정리
  try {
    const customersUpdateResult = await _db.collection(CUSTOMERS_COLLECTION).updateMany(
      { 'documents.document_id': objectId },
      {
        $pull: { documents: { document_id: objectId } },
        $set: { 'meta.updated_at': utcNowDate() }
      }
    );
    if (customersUpdateResult.modifiedCount > 0) {
      console.log(`✅ 고객 참조 정리: ${customersUpdateResult.modifiedCount}명의 고객에서 문서 참조 제거`);
    }
  } catch (customerError) {
    console.error(`❌ 고객 참조 정리 실패 (doc_id=${docId}):`, customerError.message);
  }

  // 2. AR 파싱 큐에서 제거
  try {
    const queueDeleteResult = await _db.collection(COLLECTIONS.AR_PARSE_QUEUE).deleteMany({
      file_id: objectId
    });
    if (queueDeleteResult.deletedCount > 0) {
      console.log(`✅ AR 파싱 큐 정리: ${queueDeleteResult.deletedCount}개 레코드 삭제`);
    }
  } catch (queueError) {
    console.warn('⚠️ AR 파싱 큐 정리 실패:', queueError.message);
  }

  // 3. 파일 시스템에서 파일 삭제
  if (document.upload?.destPath) {
    try {
      await fs.unlink(document.upload.destPath);
    } catch (fileError) {
      console.warn('파일 삭제 실패:', fileError.message);
    }
  }

  // 4. MongoDB에서 문서 삭제
  await _db.collection(COLLECTION_NAME).deleteOne({ _id: objectId });

  // 5. Qdrant에서 임베딩 삭제
  if (_qdrantClient && _qdrantCollection) {
    try {
      console.log(`🗑️  [Qdrant] 문서 임베딩 삭제 시도: doc_id=${docId}`);
      await _qdrantClient.delete(_qdrantCollection, {
        filter: {
          must: [{ key: 'doc_id', match: { value: docId } }]
        }
      });
      console.log(`✅ [Qdrant] 문서 임베딩 삭제 완료: doc_id=${docId}`);
    } catch (qdrantError) {
      console.warn(`⚠️  [Qdrant] 임베딩 삭제 실패:`, qdrantError.message);
    }
  }

  return { success: true, document };
}

module.exports = { init, deleteDocument };
