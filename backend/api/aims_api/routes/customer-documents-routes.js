/**
 * customer-documents-routes.js - 고객-문서 관계 관리 라우트
 *
 * customers-routes.js에서 분리된 문서 관리 도메인 라우트 (8개)
 * @since 2026-04-04
 */

const express = require('express');
const { ObjectId } = require('mongodb');
const { COLLECTIONS, AR_QUEUE_STATUS, AR_QUEUE_FIELDS } = require('@aims/shared-schema');
const backendLogger = require('../lib/backendLogger');
const { utcNowISO, utcNowDate, normalizeTimestamp } = require('../lib/timeUtils');
const activityLogger = require('../lib/activityLogger');
const sseManager = require('../lib/sseManager');
const { sendSSE, notifyCustomerDocSubscribers, notifyARSubscribers } = sseManager;
const { prepareDocumentResponse, analyzeDocumentStatus, isConvertibleFile } = require('../lib/documentStatusHelper');
const createPdfConversionTrigger = require('../lib/pdfConversionTrigger');
const sseChannels = require('../config/sse-channels');
const createQdrantSync = require('../services/qdrant-sync');

module.exports = function(db, analyticsDb, authenticateJWT, authenticateJWTorAPIKey, authenticateJWTWithQuery, qdrantClient, qdrantCollection, upload) {
  const router = express.Router();
  const CUSTOMERS_COLLECTION = COLLECTIONS.CUSTOMERS;
  const COLLECTION_NAME = COLLECTIONS.FILES;

  // Qdrant 동기화 서비스
  const { syncQdrantCustomerRelation } = createQdrantSync(qdrantClient);

  // PDF 변환 오케스트레이션 (공유 모듈)
  const { convertDocumentInBackground, triggerPdfConversionIfNeeded } = createPdfConversionTrigger(db);

  // SSE channel aliases
  const customerDocSSEClients = sseChannels.customerDoc;
  const customerCombinedSSEClients = sseChannels.customerCombined;

  /**
   * 고객에 문서 연결 API
   * ⭐ 설계사별 고객 데이터 격리 적용
   * 🔑 JWT 또는 API Key 인증 지원 (n8n 웹훅용)
   */
  router.post('/customers/:id/documents', authenticateJWTorAPIKey, async (req, res) => {
    // 🔑 활동 로그용 actor 정보 (try 블록 밖에서 정의하여 catch에서도 사용 가능)
    let actorInfo = {
      user_id: req.user?.id,
      name: req.user?.name,
      email: req.user?.email,
      role: req.user?.role
    };

    try {
      const { id } = req.params;
      const { document_id, notes } = req.body;

      // ⭐ 설계사별 고객 데이터 격리: userId 검증
      const userId = req.user.id;  // JWT 토큰에서 추출 (보안)

      // 🔑 API Key 인증 시 실제 사용자 정보 조회 (활동 로그용)
      if (req.user.authMethod === 'apiKey' && userId) {
        try {
          const actualUser = await db.collection(COLLECTIONS.USERS).findOne(
            { _id: new ObjectId(userId) },
            { projection: { name: 1, email: 1, role: 1 } }
          );
          if (actualUser) {
            actorInfo = {
              user_id: userId,
              name: actualUser.name,
              email: actualUser.email,
              role: actualUser.role || 'agent'
            };
          }
        } catch (e) {
          console.warn('[문서연결] 사용자 정보 조회 실패:', e.message);
        }
      }

      if (!ObjectId.isValid(id) || !ObjectId.isValid(document_id)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 ID입니다.'
        });
      }

      // ⭐ 소유권 검증: 해당 설계사의 고객만 연결 가능
      const customer = await db.collection(CUSTOMERS_COLLECTION)
        .findOne({
          _id: new ObjectId(id),
          'meta.created_by': userId
        });

      if (!customer) {
        return res.status(403).json({
          success: false,
          error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
        });
      }

      // ⭐ 문서 소유권 검증: 해당 설계사의 문서만 연결 가능
      const document = await db.collection(COLLECTION_NAME)
        .findOne({ _id: new ObjectId(document_id), ownerId: userId });

      if (!document) {
        return res.status(403).json({
          success: false,
          error: '문서를 찾을 수 없거나 접근 권한이 없습니다.'
        });
      }

      // 🔴 중복 파일 검사: 같은 고객에게 같은 해시의 파일이 이미 연결되어 있는지 확인
      const newFileHash = document.meta?.file_hash;
      if (newFileHash) {
        const existingDocs = customer.documents || [];
        if (existingDocs.length > 0) {
          const existingDocIds = existingDocs.map(d => d.document_id);
          const duplicateDoc = await db.collection(COLLECTION_NAME).findOne({
            _id: { $in: existingDocIds },
            'meta.file_hash': newFileHash
          }, { projection: { _id: 1, 'upload.originalName': 1 } });

          if (duplicateDoc) {
            const existingFileName = duplicateDoc.upload?.originalName || '알 수 없는 파일';
            return res.status(409).json({
              success: false,
              error: 'DUPLICATE_FILE',
              message: `이미 동일한 파일이 이 고객에게 연결되어 있습니다: ${existingFileName}`,
              existingDocumentId: duplicateDoc._id.toString()
            });
          }
        }
      }

      // 고객에 문서 연결 추가 (중복 체크 후)
      const docObjectId = new ObjectId(document_id);
      const alreadyLinked = await db.collection(CUSTOMERS_COLLECTION).findOne({
        _id: new ObjectId(id),
        'documents.document_id': docObjectId
      });

      if (!alreadyLinked) {
        const documentLink = {
          document_id: docObjectId,
          upload_date: utcNowDate(),
          notes: notes || ''
        };

        await db.collection(CUSTOMERS_COLLECTION).updateOne(
          { _id: new ObjectId(id) },
          {
            $push: { documents: documentLink },
            $set: { 'meta.updated_at': utcNowDate() }
          }
        );
      } else {
        // 이미 연결된 문서: 후속 처리(files.customerId 업데이트, Qdrant 동기화, AR 파싱 큐) 모두 스킵
        console.log(`ℹ️ [고객-문서 연결] 이미 연결됨, 중복 push 방지: customer=${id}, document=${document_id}`);
        return res.json({ success: true, message: '이미 연결된 문서입니다.' });
      }

      // 문서에도 고객 연결 정보 추가
      await db.collection(COLLECTION_NAME).updateOne(
        { _id: new ObjectId(document_id) },
        {
          $set: {
            customerId: new ObjectId(id),
            customer_notes: notes || ''
          }
        }
      );

      // 🔥 Qdrant 동기화: 문서의 모든 청크에 customer_id 추가
      const qdrantResult = await syncQdrantCustomerRelation(document_id, id);
      console.log(`📊 [Qdrant 동기화 결과] ${qdrantResult.message}, 업데이트된 청크: ${qdrantResult.chunksUpdated || 0}개`);

      // 📄 PDF 변환 트리거 (Office 문서인 경우)
      let pdfConversionResult = 'not_triggered';
      try {
        pdfConversionResult = await triggerPdfConversionIfNeeded(document);
        console.log(`📄 [PDF변환] 문서 ${document_id}: ${pdfConversionResult}`);
      } catch (convError) {
        console.error(`📄 [PDF변환] 트리거 실패 (${document_id}): ${convError.message}`);
        backendLogger.error('Documents', `[PDF변환] 트리거 실패 (${document_id})`, convError);
        // PDF 변환 실패는 치명적이지 않으므로 계속 진행
      }

      // 📋 AR 문서인 경우 파싱 큐에 추가
      if (document.is_annual_report === true) {
        try {
          const queueDoc = {
            [AR_QUEUE_FIELDS.FILE_ID]: new ObjectId(document_id),
            [AR_QUEUE_FIELDS.CUSTOMER_ID]: new ObjectId(id),
            [AR_QUEUE_FIELDS.STATUS]: AR_QUEUE_STATUS.PENDING,
            [AR_QUEUE_FIELDS.RETRY_COUNT]: 0,
            [AR_QUEUE_FIELDS.CREATED_AT]: utcNowDate(),
            [AR_QUEUE_FIELDS.UPDATED_AT]: utcNowDate(),
            [AR_QUEUE_FIELDS.PROCESSED_AT]: null,
            [AR_QUEUE_FIELDS.ERROR_MESSAGE]: null,
            [AR_QUEUE_FIELDS.METADATA]: {
              filename: document.filename || 'unknown',
              mime_type: document.mimeType || 'unknown'
            }
          };

          // 중복 방지: file_id가 이미 존재하면 무시
          await db.collection(COLLECTIONS.AR_PARSE_QUEUE).updateOne(
            { file_id: new ObjectId(document_id) },
            { $setOnInsert: queueDoc },
            { upsert: true }
          );

          console.log(`✅ AR 파싱 큐에 작업 추가: file_id=${document_id}, customer_id=${id}`);
        } catch (queueError) {
          console.error(`❌ AR 파싱 큐 추가 실패: ${queueError.message}`);
          backendLogger.error('Documents', 'AR 파싱 큐 추가 실패', queueError);
          // 큐 추가 실패는 치명적이지 않으므로 계속 진행
        }
      }

      // 문서 업로드 성공 로그 (actorInfo 사용 - API Key 인증 시 실제 사용자 정보 포함)
      activityLogger.log({
        actor: {
          ...actorInfo,
          ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
          userAgent: req.headers['user-agent']
        },
        action: {
          type: 'upload',
          category: 'document',
          description: '문서 업로드',
          target: {
            entity_type: 'document',
            entity_id: document_id,
            entity_name: document.upload?.originalName || document.meta?.filename || document.filename,
            parent_id: id,
            parent_name: customer.personal_info?.name
          }
        },
        result: {
          success: true,
          statusCode: 200
        },
        meta: {
          endpoint: `/api/customers/${id}/documents`,
          method: 'POST'
        }
      });

      // 🔔 SSE 알림: 고객 문서 변경
      notifyCustomerDocSubscribers(id, 'document-change', {
        type: 'linked',
        customerId: id,
        documentId: document_id,
        documentName: document.upload?.originalName || document.filename,
        timestamp: utcNowISO()
      });

      res.json({
        success: true,
        message: '문서가 고객에게 성공적으로 연결되었습니다.',
        qdrant_sync: qdrantResult,
        pdf_conversion: pdfConversionResult
      });
    } catch (error) {
      backendLogger.error('Documents', '문서 연결 오류', error);

      // 문서 업로드 실패 로그 (actorInfo 사용)
      activityLogger.log({
        actor: {
          ...actorInfo,
          ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
          userAgent: req.headers['user-agent']
        },
        action: {
          type: 'upload',
          category: 'document',
          description: '문서 업로드 실패',
          target: {
            entity_type: 'document',
            entity_id: req.body?.document_id,
            parent_id: req.params?.id
          }
        },
        result: {
          success: false,
          statusCode: 500,
          error: { message: error.message }
        },
        meta: {
          endpoint: `/api/customers/${req.params?.id}/documents`,
          method: 'POST'
        }
      });

      res.status(500).json({
        success: false,
        error: '문서 연결에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * 고객에서 문서 연결 해제 API
   * ⭐ 설계사별 고객 데이터 격리 적용
   */
  router.delete('/customers/:id/documents/:document_id', authenticateJWT, async (req, res) => {
    try {
      const { id, document_id } = req.params;

      // ⭐ 설계사별 고객 데이터 격리: userId 검증
      const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
      if (!ObjectId.isValid(id) || !ObjectId.isValid(document_id)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 ID입니다.'
        });
      }

      // ⭐ 소유권 검증: 해당 설계사의 고객만 연결 해제 가능
      const customer = await db.collection(CUSTOMERS_COLLECTION)
        .findOne({
          _id: new ObjectId(id),
          'meta.created_by': userId
        });

      if (!customer) {
        return res.status(403).json({
          success: false,
          error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
        });
      }

      // ⭐ 문서 소유권 검증: 해당 설계사의 문서만 연결 해제 가능
      const document = await db.collection(COLLECTION_NAME)
        .findOne({ _id: new ObjectId(document_id), ownerId: userId });

      if (!document) {
        return res.status(403).json({
          success: false,
          error: '문서를 찾을 수 없거나 접근 권한이 없습니다.'
        });
      }

      // AR 문서인 경우 파싱 데이터도 삭제
      if (document.is_annual_report) {
        const issueDate = document.ar_metadata?.issue_date;
        if (issueDate) {
          console.log(`🗑️  [AR 삭제] issue_date=${issueDate} 파싱 데이터 삭제`);
          await db.collection(CUSTOMERS_COLLECTION).updateOne(
            { _id: new ObjectId(id) },
            {
              $pull: { annual_reports: { issue_date: new Date(issueDate) } },
              $set: { 'meta.updated_at': utcNowDate() }
            }
          );
          console.log(`✅ [AR 삭제] 파싱 데이터 삭제 완료`);
        }
      }

      // AR 파싱 큐에서도 제거 (pending 목록에서 사라지도록)
      try {
        const queueDeleteResult = await db.collection(COLLECTIONS.AR_PARSE_QUEUE).deleteMany({
          file_id: new ObjectId(document_id),
          customer_id: new ObjectId(id)
        });
        if (queueDeleteResult.deletedCount > 0) {
          console.log(`✅ AR 파싱 큐 정리: ${queueDeleteResult.deletedCount}개 레코드 삭제`);
        }
      } catch (queueError) {
        console.warn('⚠️ AR 파싱 큐 정리 실패:', queueError.message);
      }

      // 고객에서 문서 연결 제거
      await db.collection(CUSTOMERS_COLLECTION).updateOne(
        { _id: new ObjectId(id) },
        {
          $pull: { documents: { document_id: new ObjectId(document_id) } },
          $set: { 'meta.updated_at': utcNowDate() }
        }
      );

      // 문서에서 고객 연결 정보 제거
      await db.collection(COLLECTION_NAME).updateOne(
        { _id: new ObjectId(document_id) },
        {
          $unset: {
            customerId: "",
            customer_notes: ""
          }
        }
      );

      // 🔥 Qdrant 동기화: 문서의 모든 청크에서 customer_id 제거
      const qdrantResult = await syncQdrantCustomerRelation(document_id, null);
      console.log(`📊 [Qdrant 동기화 결과] ${qdrantResult.message}, 업데이트된 청크: ${qdrantResult.chunksUpdated || 0}개`);

      // 🔔 SSE 알림: 고객 문서 변경
      notifyCustomerDocSubscribers(id, 'document-change', {
        type: 'unlinked',
        customerId: id,
        documentId: document_id,
        documentName: document.upload?.originalName || document.filename,
        timestamp: utcNowISO()
      });

      res.json({
        success: true,
        message: '문서 연결이 성공적으로 해제되었습니다.',
        qdrant_sync: qdrantResult
      });
    } catch (error) {
      console.error('문서 연결 해제 오류:', error);
      backendLogger.error('Documents', '문서 연결 해제 오류', error);
      res.status(500).json({
        success: false,
        error: '문서 연결 해제에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * 고객 문서 메모 수정 API
   * ⭐ 설계사별 고객 데이터 격리 적용
   */
  router.patch('/customers/:id/documents/:document_id', authenticateJWT, async (req, res) => {
    try {
      const { id, document_id } = req.params;
      const { notes } = req.body;

      // ⭐ 설계사별 고객 데이터 격리: userId 검증
      const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
      if (!ObjectId.isValid(id) || !ObjectId.isValid(document_id)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 ID입니다.'
        });
      }

      // notes 유효성 검사 (undefined일 수 있음 - 빈 문자열로 삭제 허용)
      if (notes !== undefined && typeof notes !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'notes는 문자열이어야 합니다.'
        });
      }

      // ⭐ 소유권 검증: 해당 설계사의 고객만 메모 수정 가능
      const customer = await db.collection(CUSTOMERS_COLLECTION)
        .findOne({
          _id: new ObjectId(id),
          'meta.created_by': userId
        });

      if (!customer) {
        return res.status(403).json({
          success: false,
          error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
        });
      }

      // 문서 존재 확인
      const document = await db.collection(COLLECTION_NAME)
        .findOne({ _id: new ObjectId(document_id) });

      if (!document) {
        return res.status(404).json({
          success: false,
          error: '문서를 찾을 수 없습니다.'
        });
      }

      const newNotes = notes !== undefined ? notes : '';

      // 고객 컬렉션에서 해당 문서의 notes 업데이트
      await db.collection(CUSTOMERS_COLLECTION).updateOne(
        {
          _id: new ObjectId(id),
          'documents.document_id': new ObjectId(document_id)
        },
        {
          $set: {
            'documents.$.notes': newNotes,
            'meta.updated_at': utcNowDate()
          }
        }
      );

      // 문서 컬렉션에서도 customer_notes 업데이트
      await db.collection(COLLECTION_NAME).updateOne(
        { _id: new ObjectId(document_id) },
        {
          $set: {
            customer_notes: newNotes
          }
        }
      );

      res.json({
        success: true,
        message: '메모가 성공적으로 수정되었습니다.',
        data: {
          notes: newNotes
        }
      });
    } catch (error) {
      console.error('메모 수정 오류:', error);
      backendLogger.error('Documents', '메모 수정 오류', error);
      res.status(500).json({
        success: false,
        error: '메모 수정에 실패했습니다.',
        details: error.message
      });
    }
  });

  // ========================================
  // SSE 스트림: 고객 문서 실시간 업데이트
  // ========================================

  /**
   * 고객 문서 SSE 스트림 엔드포인트
   * GET /api/customers/:id/documents/stream
   *
   * 인증: ?token=xxx 쿼리 파라미터 (EventSource는 헤더 설정 불가)
   * 이벤트:
   * - connected: 연결 성공
   * - document-change: 문서 변경 (추가/삭제/수정)
   * - ping: Keep-alive (30초)
   */
  router.get('/customers/:id/documents/stream', authenticateJWTWithQuery, (req, res) => {
    const { id: customerId } = req.params;
    const userId = req.user.id;

    if (!ObjectId.isValid(customerId)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 고객 ID입니다.'
      });
    }

    console.log(`[SSE] 고객 문서 스트림 연결 - customerId: ${customerId}, userId: ${userId}`);

    // SSE 헤더 설정
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no'); // nginx 버퍼링 비활성화
    res.flushHeaders();

    // 클라이언트 등록
    if (!customerDocSSEClients.has(customerId)) {
      customerDocSSEClients.set(customerId, new Set());
    }
    customerDocSSEClients.get(customerId).add(res);

    // 연결 확인 이벤트
    sendSSE(res, 'connected', {
      customerId,
      userId,
      timestamp: utcNowISO()
    });

    // 30초마다 keep-alive 전송
    const keepAliveInterval = setInterval(() => {
      sendSSE(res, 'ping', { timestamp: utcNowISO() });
    }, 30000);

    // 연결 종료 처리
    req.on('close', () => {
      console.log(`[SSE] 고객 문서 스트림 연결 종료 - customerId: ${customerId}`);
      clearInterval(keepAliveInterval);
      customerDocSSEClients.get(customerId)?.delete(res);
      if (customerDocSSEClients.get(customerId)?.size === 0) {
        customerDocSSEClients.delete(customerId);
      }
    });
  });

  // ========================================
  // SSE 스트림: 고객 통합 실시간 업데이트 (문서+AR+CR)
  // HTTP/1.1 동시 연결 제한 문제 해결을 위해 3개 SSE를 1개로 통합
  // ========================================

  /**
   * 고객 통합 SSE 스트림 엔드포인트
   * GET /api/customers/:customerId/stream
   *
   * 인증: ?token=xxx 쿼리 파라미터 (EventSource는 헤더 설정 불가)
   * 이벤트:
   * - connected: 연결 성공
   * - document-change: 문서 변경 (추가/삭제/수정)
   * - document-status-change: 문서 상태 변경 (처리 완료 등)
   * - ar-change: Annual Report 변경
   * - cr-change: Customer Review 변경
   * - ping: Keep-alive (30초)
   *
   * 통합 이유: 기존 개별 SSE 3개(documents, AR, CR)가 HTTP/1.1 동시 연결 제한(6개)을
   * 대부분 점유하여 API 요청이 타임아웃되는 문제 해결
   */
  router.get('/customers/:customerId/stream', authenticateJWTWithQuery, (req, res) => {
    const { customerId } = req.params;
    const userId = req.user.id;

    if (!ObjectId.isValid(customerId)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 고객 ID입니다.'
      });
    }

    console.log(`[SSE-Combined] 고객 통합 스트림 연결 - customerId: ${customerId}, userId: ${userId}`);

    // SSE 헤더 설정
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no'); // nginx 버퍼링 비활성화
    res.flushHeaders();

    // 클라이언트 등록
    if (!customerCombinedSSEClients.has(customerId)) {
      customerCombinedSSEClients.set(customerId, new Set());
    }
    customerCombinedSSEClients.get(customerId).add(res);

    // 연결 확인 이벤트
    sendSSE(res, 'connected', {
      customerId,
      userId,
      timestamp: utcNowISO(),
      type: 'combined'  // 통합 SSE임을 표시
    });

    // 30초마다 keep-alive 전송
    const keepAliveInterval = setInterval(() => {
      sendSSE(res, 'ping', { timestamp: utcNowISO() });
    }, 30000);

    // 연결 종료 처리
    req.on('close', () => {
      console.log(`[SSE-Combined] 고객 통합 스트림 연결 종료 - customerId: ${customerId}`);
      clearInterval(keepAliveInterval);
      customerCombinedSSEClients.get(customerId)?.delete(res);
      if (customerCombinedSSEClients.get(customerId)?.size === 0) {
        customerCombinedSSEClients.delete(customerId);
      }
    });
  });

  /**
   * 고객 관련 문서 목록 조회 API
   */
  router.get('/customers/:id/documents', authenticateJWT, async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 고객 ID입니다.'
        });
      }

      // ⭐ userId 추출 (보안 강화)
      const userId = req.user.id;  // JWT 토큰에서 추출 (보안)

      // 고객 정보 조회
      const customer = await db.collection(CUSTOMERS_COLLECTION)
        .findOne({ _id: new ObjectId(id) });

      if (!customer) {
        return res.status(404).json({
          success: false,
          error: '고객을 찾을 수 없습니다.'
        });
      }

      // 🔥 Single Source of Truth: files.customerId로 직접 조회 (customers.documents[] 의존성 제거)
      // includeRelated=true: relatedCustomerId로 연결된 문서도 함께 조회 (관계자 문서 탭용)
      const includeRelated = req.query.includeRelated === 'true';
      const customerOid = new ObjectId(id);
      let query;
      if (includeRelated && userId) {
        // $or + ownerId를 $and로 명시적 결합 (소유자 격리 보장)
        query = {
          $and: [
            { $or: [{ customerId: customerOid }, { relatedCustomerId: customerOid }] },
            { ownerId: userId }
          ]
        };
      } else {
        query = { customerId: customerOid };
        if (userId) {
          query.ownerId = userId;
        }
      }

      // 🔧 Date/String 혼합 타입 대응을 위해 $toDate 사용
      const documents = await db.collection(COLLECTION_NAME).aggregate([
        { $match: query },
        {
          $addFields: {
            uploaded_at_normalized: { $toDate: '$upload.uploaded_at' }
          }
        },
        { $sort: { uploaded_at_normalized: -1 } },
        { $project: { uploaded_at_normalized: 0 } }
      ]).toArray();

      // 문서에 상태 정보 추가
      const documentsWithStatus = documents.map(doc => {
        const statusInfo = analyzeDocumentStatus(doc);
        const docIdStr = doc._id.toString();

        // 🔥 Single Source of Truth: files 컬렉션 데이터 우선 사용
        // 기존 customers.documents[] 데이터는 fallback으로만 사용 (점진적 마이그레이션)
        const customerDoc = customer.documents?.find(d => d.document_id?.toString() === docIdStr);

        // AR 문서 여부 판단: doc.is_annual_report 또는 customer.annual_reports에 source_file_id로 존재하는지 확인
        const isAR = doc.is_annual_report === true ||
          (customer.annual_reports || []).some(ar => ar.source_file_id?.toString() === docIdStr);

        return {
          _id: doc._id,
          originalName: doc.upload?.originalName || 'Unknown File',
          displayName: doc.displayName || null,  // CR 등 파싱 후 생성된 사용자 친화적 이름
          uploadedAt: normalizeTimestamp(doc.upload?.uploaded_at),
          fileSize: doc.meta?.size_bytes,
          mimeType: doc.meta?.mime,
          // 🔥 files 데이터 우선, customers.documents fallback
          relationship: isAR ? 'annual_report' : (doc.customer_relationship || customerDoc?.relationship || null),
          notes: doc.customer_notes ?? customerDoc?.notes ?? null,
          linkedAt: normalizeTimestamp(doc.customer_linked_at || customerDoc?.upload_date || doc.upload?.uploaded_at),
          ar_metadata: doc.ar_metadata,
          // 프론트엔드 DocumentUtils.getDocumentType() SSoT용 원본 필드
          ocr: doc.ocr ? { status: doc.ocr.status || null, confidence: doc.ocr.confidence || null } : null,
          meta: { full_text: doc.meta?.full_text ? '1' : null },  // full_text 존재 여부만 전달 (본문 전송 방지)
          docembed: doc.docembed ? { text_source: doc.docembed.text_source || null } : null,
          conversionStatus: doc.upload?.conversion_status || null,
          isConvertible: isConvertibleFile(doc.upload?.destPath || doc.upload?.originalName),
          // 🍎 문서 유형 필드 추가 (CustomerFullDetailView 문서 카드에서 사용)
          document_type: doc.document_type || null,  // SSoT: top-level만 참조
          document_type_auto: doc.document_type_auto || false,  // SSoT: top-level만 참조
          document_type_confidence: doc.document_type_confidence || null,  // SSoT: top-level만 참조
          // 문서 소유 고객 ID (원본/링크 구분용 — 관계자 문서 탭에서 사용)
          customerId: doc.customerId?.toString() || null,
          // 관계자 연결 고객 ID (AR/CRS에서 피보험자로 감지된 고객)
          relatedCustomerId: doc.relatedCustomerId?.toString() || null,
          ...statusInfo
        };
      });

      res.json({
        success: true,
        data: {
          customer_id: id,
          customer_name: customer.personal_info?.name,
          documents: documentsWithStatus,
          total: documentsWithStatus.length
        }
      });
    } catch (error) {
      console.error('고객 문서 조회 오류:', error);
      backendLogger.error('Customers', '고객 문서 조회 오류', error);
      res.status(500).json({
        success: false,
        error: '고객 문서 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * 고객 문서 해시 일괄 조회 API
   * AR 배치 등록 시 중복 검사를 위해 고객의 모든 문서 해시를 한 번에 반환
   * 기존: 문서 N개 → N번 /api/documents/:id/status 호출 (순차)
   * 개선: 1번 호출로 모든 해시 반환 → 프론트엔드에서 로컬 비교
   */
  router.get('/customers/:id/document-hashes', authenticateJWT, async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 고객 ID입니다.'
        });
      }

      const userId = req.user.id;

      // 해당 고객의 모든 문서에서 file_hash만 추출
      const docs = await db.collection(COLLECTION_NAME).find(
        {
          customerId: new ObjectId(id),
          ownerId: userId,
          'meta.file_hash': { $exists: true, $ne: null }
        },
        { projection: { 'meta.file_hash': 1 } }
      ).toArray();

      const hashes = docs.map(doc => doc.meta.file_hash);

      res.json({
        success: true,
        hashes,
        total: hashes.length
      });
    } catch (error) {
      console.error('고객 문서 해시 조회 오류:', error);
      backendLogger.error('Customers', '고객 문서 해시 조회 오류', error);
      res.status(500).json({
        success: false,
        error: '고객 문서 해시 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * 내 보관함: 최근 업로드된 문서의 folderId 설정
   * n8n webhook이 folderId를 저장하지 않으므로 업로드 후 별도로 설정
   * @route PATCH /api/documents/recent/set-folder
   */
  router.patch('/documents/recent/set-folder', authenticateJWT, async (req, res) => {
    try {
      const { filename, folderId } = req.body;
      const userId = req.user.id;

      if (!filename) {
        return res.status(400).json({ success: false, error: 'filename이 필요합니다.' });
      }

      // 최근 5분 이내에 업로드된, 해당 사용자의 문서 중 파일명이 일치하는 것 찾기
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      const document = await db.collection(COLLECTIONS.FILES).findOne({
        ownerId: userId,
        'upload.originalName': filename,
        'meta.created_at': { $gte: fiveMinutesAgo.toISOString() }
      }, {
        sort: { 'meta.created_at': -1 }  // 가장 최근 것
      });

      if (!document) {
        console.log(`[SetFolder] 문서를 찾을 수 없음 - filename: ${filename}, userId: ${userId}`);
        return res.status(404).json({ success: false, error: '최근 업로드된 문서를 찾을 수 없습니다.' });
      }

      // folderId 업데이트 (null이면 루트 폴더)
      await db.collection(COLLECTIONS.FILES).updateOne(
        { _id: document._id },
        { $set: { folderId: folderId || null } }
      );

      console.log(`[SetFolder] 문서 folderId 설정 - docId: ${document._id}, folderId: ${folderId || 'null (root)'}`);

      res.json({
        success: true,
        documentId: document._id.toString(),
        folderId: folderId || null
      });
    } catch (error) {
      console.error('[SetFolder] 오류:', error);
      backendLogger.error('Documents', '[SetFolder] 오류', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};
