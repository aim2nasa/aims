/**
 * eventBus.js - Redis Pub/Sub 기반 이벤트 버스
 *
 * 하위 서비스(document_pipeline, annual_report_api 등)가 Redis PUBLISH로
 * 발행한 이벤트를 구독하여, sseManager를 통해 프론트엔드에 실시간 전달합니다.
 *
 * 기존 HTTP webhook 방식과 병행 운영됩니다. (R1-3에서 webhook → eventBus 전환 예정)
 *
 * @since 2026-04-04
 *
 * ========================================
 * 채널 스키마 정의
 * ========================================
 *
 * @typedef {Object} DocProgressPayload
 * @property {string} document_id - 문서 ID
 * @property {number} progress - 진행률 (0~100)
 * @property {string} [stage] - 처리 단계 (기본: 'processing')
 * @property {string} [message] - 진행 메시지
 * @property {string} [owner_id] - 문서 소유자 ID
 *
 * @typedef {Object} DocCompletePayload
 * @property {string} document_id - 문서 ID
 * @property {string} [status] - 최종 상태 (기본: 'completed')
 * @property {string} [owner_id] - 문서 소유자 ID
 *
 * @typedef {Object} ARStatusPayload
 * @property {string} customer_id - 고객 ID
 * @property {string} [file_id] - 파일 ID
 * @property {string} status - 상태 ('completed', 'error', 기타)
 * @property {string} [error_message] - 에러 메시지
 *
 * @typedef {Object} CRStatusPayload
 * @property {string} customer_id - 고객 ID
 * @property {string} [file_id] - 파일 ID
 * @property {string} status - 상태 ('completed', 'error', 기타)
 * @property {string} [error_message] - 에러 메시지
 *
 * @typedef {Object} DocListPayload
 * @property {string} user_id - 사용자 ID
 * @property {string} [change_type] - 변경 유형 (기본: 'change')
 * @property {string} [document_id] - 문서 ID
 * @property {string} [document_name] - 문서 이름
 * @property {string} [status] - 문서 상태
 *
 * @typedef {Object} DocLinkPayload
 * @property {string} document_id - 문서 ID
 * @property {string} customer_id - 고객 ID
 * @property {string} user_id - 사용자(설계사) ID
 * @property {string} [notes] - 메모
 *
 * 채널 목록:
 * - aims:doc:progress  → DocProgressPayload
 * - aims:doc:complete  → DocCompletePayload
 * - aims:ar:status     → ARStatusPayload
 * - aims:cr:status     → CRStatusPayload
 * - aims:doc:list      → DocListPayload
 * - aims:doc:link      → DocLinkPayload
 */

const Redis = require('ioredis');
const sseManager = require('./sseManager');
const { utcNowISO } = require('./timeUtils');

// 이벤트 채널 상수
const CHANNELS = {
  DOC_PROGRESS: 'aims:doc:progress',
  DOC_COMPLETE: 'aims:doc:complete',
  AR_STATUS: 'aims:ar:status',
  CR_STATUS: 'aims:cr:status',
  DOC_LIST: 'aims:doc:list',
  DOC_LINK: 'aims:doc:link',
};

let subscriber = null;
let db = null;
let qdrantClient = null;

/**
 * EventBus 초기화
 * Redis Pub/Sub subscriber를 생성하고 채널을 구독합니다.
 *
 * @param {import('mongodb').Db} mongoDb - MongoDB 데이터베이스 인스턴스
 * @param {Object} [options] - 옵션
 * @param {Object} [options.qdrantClient] - Qdrant 클라이언트 인스턴스
 */
function initialize(mongoDb, options = {}) {
  db = mongoDb;
  qdrantClient = options.qdrantClient || null;

  subscriber = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    retryStrategy: (times) => Math.min(times * 200, 5000),
    // subscriber 전용 연결이므로 lazyConnect 사용하지 않음
  });

  subscriber.subscribe(...Object.values(CHANNELS), (err, count) => {
    if (err) {
      console.error('[EventBus] Redis subscribe 실패:', err.message);
      return;
    }
    console.log(`[EventBus] Redis ${count}개 채널 구독 완료`);
  });

  subscriber.on('message', (channel, message) => {
    try {
      const payload = JSON.parse(message);
      // async 핸들러의 에러를 캐치하여 로깅
      handleEvent(channel, payload).catch((e) => {
        console.error(`[EventBus] 이벤트 처리 오류 (channel: ${channel}):`, e.message);
      });
    } catch (e) {
      console.error(`[EventBus] 메시지 파싱 오류 (channel: ${channel}):`, e.message);
    }
  });

  subscriber.on('error', (err) => {
    console.error('[EventBus] Redis 연결 오류:', err.message);
  });

  subscriber.on('reconnecting', () => {
    console.log('[EventBus] Redis 재연결 시도 중...');
  });

  console.log('[EventBus] 초기화 완료');
}

/**
 * 채널별 이벤트 처리
 * 각 채널의 payload를 파싱하여 sseManager의 적절한 notify 함수를 호출합니다.
 *
 * @param {string} channel - Redis 채널명
 * @param {Object} payload - 이벤트 페이로드
 */
async function handleEvent(channel, payload) {
  const timestamp = utcNowISO();

  switch (channel) {
    case CHANNELS.DOC_PROGRESS: {
      const { document_id, progress, stage, message, owner_id } = payload;
      if (!document_id) return;

      const docIdStr = document_id.toString();
      sseManager.notifyDocumentStatusSubscribers(docIdStr, 'progress-update', {
        documentId: docIdStr,
        progress,
        stage: stage || 'processing',
        message: message || '',
        timestamp,
      });

      if (owner_id) {
        sseManager.notifyDocumentListSubscribers(owner_id.toString(), 'document-progress', {
          type: 'progress-update',
          documentId: docIdStr,
          progress,
          stage: stage || 'processing',
          timestamp,
        });
      }
      break;
    }

    case CHANNELS.DOC_COMPLETE: {
      const { document_id, status, owner_id } = payload;
      if (!document_id) return;

      const docIdStr = document_id.toString();
      sseManager.notifyDocumentStatusSubscribers(docIdStr, 'processing-complete', {
        documentId: docIdStr,
        status: status || 'completed',
        ownerId: owner_id || 'unknown',
        timestamp,
      });

      if (owner_id) {
        sseManager.notifyDocumentListSubscribers(owner_id.toString(), 'document-list-change', {
          type: 'status-changed',
          documentId: docIdStr,
          status: status || 'completed',
          timestamp,
        });
      }
      break;
    }

    case CHANNELS.AR_STATUS: {
      const { customer_id, file_id, status, error_message } = payload;
      if (!customer_id) return;

      const custIdStr = customer_id.toString();
      const eventType = status === 'completed' ? 'parsing-complete'
        : status === 'error' ? 'parsing-error'
        : 'status-change';

      sseManager.notifyARSubscribers(custIdStr, 'ar-change', {
        type: eventType,
        fileId: file_id,
        status,
        errorMessage: error_message,
        timestamp,
      });

      sseManager.notifyCustomerDocSubscribers(custIdStr, 'document-change', {
        type: 'linked',
        customerId: custIdStr,
        documentId: file_id || 'unknown',
        documentName: 'Annual Report',
        timestamp,
      });

      // owner_id를 DB에서 조회하여 document-list 알림
      await notifyDocumentListByFileId(file_id, 'ar-parsing-update', status, timestamp);
      break;
    }

    case CHANNELS.CR_STATUS: {
      const { customer_id, file_id, status, error_message } = payload;
      if (!customer_id) return;

      const custIdStr = customer_id.toString();
      const eventType = status === 'completed' ? 'parsing-complete'
        : status === 'error' ? 'parsing-error'
        : 'status-change';

      sseManager.notifyCRSubscribers(custIdStr, 'cr-change', {
        type: eventType,
        fileId: file_id,
        status,
        errorMessage: error_message,
        timestamp,
      });

      sseManager.notifyCustomerDocSubscribers(custIdStr, 'document-change', {
        type: 'linked',
        customerId: custIdStr,
        documentId: file_id || 'unknown',
        documentName: 'Customer Review',
        timestamp,
      });

      // owner_id를 DB에서 조회하여 document-list 알림
      await notifyDocumentListByFileId(file_id, 'cr-parsing-update', status, timestamp);
      break;
    }

    case CHANNELS.DOC_LIST: {
      const { user_id, change_type, document_id, document_name, status } = payload;
      if (!user_id) return;

      sseManager.notifyDocumentListSubscribers(user_id.toString(), 'document-list-change', {
        type: change_type || 'change',
        documentId: document_id,
        documentName: document_name,
        status,
        timestamp,
      });
      break;
    }

    case CHANNELS.DOC_LINK: {
      const { document_id, customer_id, user_id, notes } = payload;
      if (!document_id || !customer_id || !user_id) {
        console.warn('[EventBus] DOC_LINK: 필수 필드 누락', { document_id, customer_id, user_id });
        return;
      }
      await handleDocumentLink(document_id, customer_id, user_id, notes || '');
      break;
    }
  }
}

/**
 * 문서-고객 연결 오케스트레이션 (이벤트 기반)
 * R3: document_pipeline이 Redis PUBLISH → eventBus가 구독하여 실행
 *
 * 원래 customers-routes.js POST /customers/:id/documents의 비즈니스 로직
 *
 * @param {string} documentId - 문서 ID
 * @param {string} customerId - 고객 ID
 * @param {string} userId - 사용자(설계사) ID
 * @param {string} notes - 메모
 */
async function handleDocumentLink(documentId, customerId, userId, notes) {
  const { ObjectId } = require('mongodb');
  const { COLLECTIONS } = require('@aims/shared-schema');
  const { utcNowDate } = require('./timeUtils');
  const backendLogger = require('./backendLogger');

  const logPrefix = `[DocLink] doc=${documentId}, customer=${customerId}`;

  try {
    if (!ObjectId.isValid(customerId) || !ObjectId.isValid(documentId)) {
      console.warn(`${logPrefix} 유효하지 않은 ObjectId`);
      return;
    }

    const custOid = new ObjectId(customerId);
    const docOid = new ObjectId(documentId);

    // 1. 고객 소유권 검증
    const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
      _id: custOid,
      'meta.created_by': userId,
    });
    if (!customer) {
      console.warn(`${logPrefix} 고객 미발견 또는 소유권 불일치 (userId=${userId})`);
      return;
    }

    // 2. 문서 소유권 검증
    const document = await db.collection(COLLECTIONS.FILES).findOne({
      _id: docOid,
      ownerId: userId,
    });
    if (!document) {
      console.warn(`${logPrefix} 문서 미발견 또는 소유권 불일치`);
      return;
    }

    // 3. 중복 파일 해시 검사
    const newFileHash = document.meta?.file_hash;
    if (newFileHash) {
      const existingDocs = customer.documents || [];
      if (existingDocs.length > 0) {
        const existingDocIds = existingDocs.map(d => d.document_id);
        const duplicateDoc = await db.collection(COLLECTIONS.FILES).findOne({
          _id: { $in: existingDocIds },
          'meta.file_hash': newFileHash,
        });
        if (duplicateDoc) {
          console.log(`${logPrefix} 중복 파일 해시 발견, 연결 스킵`);
          return;
        }
      }
    }

    // 4. 이미 연결 여부 확인
    const alreadyLinked = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
      _id: custOid,
      'documents.document_id': docOid,
    });
    if (alreadyLinked) {
      console.log(`${logPrefix} 이미 연결됨, 스킵`);
      return;
    }

    // 5. customers.documents[]에 push
    await db.collection(COLLECTIONS.CUSTOMERS).updateOne(
      { _id: custOid },
      {
        $push: {
          documents: {
            document_id: docOid,
            upload_date: utcNowDate(),
            notes: notes || '',
          },
        },
        $set: { 'meta.updated_at': utcNowDate() },
      }
    );

    // 6. files.customerId 설정
    await db.collection(COLLECTIONS.FILES).updateOne(
      { _id: docOid },
      { $set: { customerId: custOid, customer_notes: notes || '' } }
    );

    // 7. Qdrant 동기화 (문서의 모든 청크에 customer_id 설정)
    if (qdrantClient) {
      try {
        const qdrantCollectionName = 'docembed';
        const scrollResult = await qdrantClient.scroll(qdrantCollectionName, {
          filter: { must: [{ key: 'doc_id', match: { value: documentId } }] },
          limit: 1000,
          with_payload: false,
        });
        const points = scrollResult.points || [];
        if (points.length > 0) {
          const pointIds = points.map(p => p.id);
          await qdrantClient.setPayload(qdrantCollectionName, {
            payload: { customer_id: customerId },
            points: pointIds,
          });
          console.log(`${logPrefix} Qdrant ${pointIds.length}개 청크 동기화 완료`);
        }
      } catch (e) {
        console.warn(`${logPrefix} Qdrant 동기화 실패 (비치명적):`, e.message);
      }
    }

    // 8. PDF 변환 트리거 (Office 문서인 경우)
    try {
      const createPdfConversionTrigger = require('./pdfConversionTrigger');
      const { triggerPdfConversionIfNeeded } = createPdfConversionTrigger(db);
      const pdfResult = await triggerPdfConversionIfNeeded(document);
      if (pdfResult !== 'not_triggered') {
        console.log(`${logPrefix} PDF 변환 트리거: ${pdfResult}`);
      }
    } catch (e) {
      console.warn(`${logPrefix} PDF 변환 트리거 실패 (비치명적):`, e.message);
    }

    // 9. AR 문서면 파싱 큐에 추가
    if (document.is_annual_report === true) {
      try {
        const arQueueCollection = COLLECTIONS.AR_PARSE_QUEUE || 'ar_parse_queue';
        await db.collection(arQueueCollection).updateOne(
          { file_id: docOid },
          {
            $setOnInsert: {
              file_id: docOid,
              customer_id: custOid,
              status: 'pending',
              retry_count: 0,
              created_at: utcNowDate(),
              updated_at: utcNowDate(),
              processed_at: null,
              error_message: null,
              metadata: {
                filename: document.filename || 'unknown',
                mime_type: document.mimeType || 'unknown',
              },
            },
          },
          { upsert: true }
        );
        console.log(`${logPrefix} AR 파싱 큐 추가 완료`);
      } catch (e) {
        console.error(`${logPrefix} AR 파싱 큐 추가 실패:`, e.message);
      }
    }

    // 10. SSE 알림
    const custIdStr = customerId.toString();
    sseManager.notifyCustomerDocSubscribers(custIdStr, 'document-change', {
      type: 'linked',
      customerId: custIdStr,
      documentId: documentId.toString(),
      documentName: document.upload?.originalName || document.filename || 'unknown',
      timestamp: utcNowISO(),
    });

    sseManager.notifyDocumentListSubscribers(userId, 'document-list-change', {
      type: 'linked',
      documentId: documentId.toString(),
      status: 'linked',
      timestamp: utcNowISO(),
    });

    console.log(`${logPrefix} ✅ 문서-고객 연결 완료 (이벤트 기반)`);

  } catch (error) {
    console.error(`${logPrefix} 오케스트레이션 오류:`, error.message);
    backendLogger.error('EventBus', `DocLink 오류: ${error.message}`, error);
  }
}

/**
 * file_id로 소유자를 조회하여 document-list-change 알림을 전송합니다.
 * AR/CR 상태 변경 시 사용됩니다.
 *
 * @param {string} fileId - 파일 ID
 * @param {string} changeType - 변경 유형
 * @param {string} status - 상태
 * @param {string} timestamp - 타임스탬프
 */
async function notifyDocumentListByFileId(fileId, changeType, status, timestamp) {
  if (!fileId || !db) return;

  try {
    const { COLLECTIONS } = require('@aims/shared-schema');
    const { ObjectId } = require('mongodb');
    const fileDoc = await db.collection(COLLECTIONS.FILES).findOne(
      { _id: new ObjectId(fileId) },
      { projection: { ownerId: 1 } }
    );
    if (fileDoc?.ownerId) {
      sseManager.notifyDocumentListSubscribers(fileDoc.ownerId, 'document-list-change', {
        type: changeType,
        documentId: fileId,
        status,
        timestamp,
      });
    }
  } catch (e) {
    console.warn(`[EventBus] ${changeType} document-list-change 알림 실패:`, e.message);
  }
}

/**
 * EventBus 종료
 * Redis subscriber 연결을 정리합니다.
 */
function shutdown() {
  if (subscriber) {
    subscriber.unsubscribe();
    subscriber.quit();
    subscriber = null;
    console.log('[EventBus] 종료');
  }
}

module.exports = { initialize, shutdown, CHANNELS, _handleDocumentLink: handleDocumentLink };
