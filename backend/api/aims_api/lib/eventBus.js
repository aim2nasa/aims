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
 * 채널 목록:
 * - aims:doc:progress  → DocProgressPayload
 * - aims:doc:complete  → DocCompletePayload
 * - aims:ar:status     → ARStatusPayload
 * - aims:cr:status     → CRStatusPayload
 * - aims:doc:list      → DocListPayload
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
};

let subscriber = null;
let db = null;

/**
 * EventBus 초기화
 * Redis Pub/Sub subscriber를 생성하고 채널을 구독합니다.
 *
 * @param {import('mongodb').Db} mongoDb - MongoDB 데이터베이스 인스턴스
 */
function initialize(mongoDb) {
  db = mongoDb;

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

module.exports = { initialize, shutdown, CHANNELS };
