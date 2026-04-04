/**
 * notification-routes.js - Webhook/SSE 알림 라우트
 *
 * customers-routes.js에서 분리된 알림/웹훅 도메인 라우트 (9개)
 * @since 2026-04-04
 */

const express = require('express');
const { ObjectId } = require('mongodb');
const { COLLECTIONS } = require('@aims/shared-schema');
const backendLogger = require('../lib/backendLogger');
const { utcNowISO } = require('../lib/timeUtils');
const sseManager = require('../lib/sseManager');
const {
  sendSSE,
  notifyPersonalFilesSubscribers,
  notifyDocumentStatusSubscribers,
  notifyDocumentListSubscribers,
  notifyCustomerDocSubscribers
} = sseManager;
const sseChannels = require('../config/sse-channels');
const virusScanService = require('../lib/virusScanService');
const createPdfConversionTrigger = require('../lib/pdfConversionTrigger');

module.exports = function(db, authenticateJWT, authenticateJWTWithQuery) {
  const router = express.Router();
  const COLLECTION_NAME = COLLECTIONS.FILES;

  // PDF 변환 오케스트레이션 (공유 모듈)
  const { convertDocumentInBackground, triggerPdfConversionIfNeeded } = createPdfConversionTrigger(db);

  // SSE channel aliases
  const personalFilesSSEClients = sseChannels.personalFiles;
  const userAccountSSEClients = sseChannels.userAccount;
  const documentStatusSSEClients = sseChannels.documentStatus;
  const documentListSSEClients = sseChannels.documentList;

  /**
   * Personal Files 실시간 업데이트 SSE 스트림
   * @route GET /api/personal-files/stream
   * @description 사용자의 개인 파일 변경을 실시간으로 전달
   */
  router.get('/personal-files/stream', authenticateJWTWithQuery, (req, res) => {
    const userId = req.user.id;

    console.log(`[SSE-PF] Personal Files 스트림 연결 - userId: ${userId}`);

    // SSE 헤더 설정
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // 클라이언트 등록
    if (!personalFilesSSEClients.has(userId)) {
      personalFilesSSEClients.set(userId, new Set());
    }
    personalFilesSSEClients.get(userId).add(res);

    // 연결 확인 이벤트
    sendSSE(res, 'connected', {
      userId,
      timestamp: utcNowISO()
    });

    // 30초마다 keep-alive 전송
    const keepAliveInterval = setInterval(() => {
      sendSSE(res, 'ping', { timestamp: utcNowISO() });
    }, 30000);

    // 연결 종료 처리
    req.on('close', () => {
      console.log(`[SSE-PF] Personal Files 스트림 연결 종료 - userId: ${userId}`);
      clearInterval(keepAliveInterval);
      personalFilesSSEClients.get(userId)?.delete(res);
      if (personalFilesSSEClients.get(userId)?.size === 0) {
        personalFilesSSEClients.delete(userId);
      }
    });
  });

  /**
   * Personal Files 변경 알림 Webhook (내부용)
   * @route POST /api/webhooks/personal-files-change
   * @description Personal Files routes에서 파일 변경 시 호출하여 SSE 알림 발생
   */
  router.post('/webhooks/personal-files-change', (req, res) => {
    try {
      const { userId, changeType, itemId, itemName, itemType } = req.body;

      if (!userId) {
        return res.status(400).json({ success: false, error: 'userId가 필요합니다.' });
      }

      // SSE 알림 전송: 파일 변경
      notifyPersonalFilesSubscribers(userId, 'file-change', {
        type: changeType || 'updated',
        itemId: itemId || 'unknown',
        itemName: itemName || 'Unknown',
        itemType: itemType || 'file',
        timestamp: utcNowISO()
      });

      console.log(`[SSE-PF] Personal Files 변경 알림 전송 - userId: ${userId}, type: ${changeType}`);

      res.json({ success: true, message: '알림이 전송되었습니다.' });
    } catch (error) {
      console.error('[SSE-PF] Personal Files 변경 알림 오류:', error);
      backendLogger.error('SSE', 'Personal Files 변경 알림 오류', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 사용자 계정 실시간 업데이트 SSE 스트림
   * @route GET /api/user/account/stream
   * @description 사용자의 계정 정보(티어, 스토리지 등) 변경을 실시간으로 전달
   */
  router.get('/user/account/stream', authenticateJWTWithQuery, (req, res) => {
    const userId = req.user.id;

    console.log(`[SSE-UserAccount] 계정 정보 스트림 연결 - userId: ${userId}`);

    // SSE 헤더 설정
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // 클라이언트 등록
    if (!userAccountSSEClients.has(userId)) {
      userAccountSSEClients.set(userId, new Set());
    }
    userAccountSSEClients.get(userId).add(res);

    // 연결 확인 이벤트
    sendSSE(res, 'connected', {
      userId,
      timestamp: utcNowISO()
    });

    // 30초마다 keep-alive 전송
    const keepAliveInterval = setInterval(() => {
      sendSSE(res, 'ping', { timestamp: utcNowISO() });
    }, 30000);

    // 연결 종료 처리
    req.on('close', () => {
      console.log(`[SSE-UserAccount] 계정 정보 스트림 연결 종료 - userId: ${userId}`);
      clearInterval(keepAliveInterval);
      userAccountSSEClients.get(userId)?.delete(res);
      if (userAccountSSEClients.get(userId)?.size === 0) {
        userAccountSSEClients.delete(userId);
      }
    });
  });

  /**
   * 문서 처리 상태 실시간 업데이트 SSE 스트림
   * @route GET /api/documents/:documentId/status/stream
   * @description 특정 문서의 처리 완료를 실시간으로 전달 (1회성)
   */
  router.get('/documents/:documentId/status/stream', authenticateJWTWithQuery, (req, res) => {
    const { documentId } = req.params;
    const userId = req.user.id;

    if (!ObjectId.isValid(documentId)) {
      return res.status(400).json({ success: false, error: '유효하지 않은 문서 ID입니다.' });
    }

    console.log(`[SSE-DocStatus] 문서 상태 스트림 연결 - documentId: ${documentId}, userId: ${userId}`);

    // SSE 헤더 설정
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // 클라이언트 등록
    if (!documentStatusSSEClients.has(documentId)) {
      documentStatusSSEClients.set(documentId, new Set());
    }
    documentStatusSSEClients.get(documentId).add(res);

    // 연결 확인 이벤트
    sendSSE(res, 'connected', {
      documentId,
      userId,
      timestamp: utcNowISO()
    });

    // 30초마다 keep-alive 전송
    const keepAliveInterval = setInterval(() => {
      sendSSE(res, 'ping', { timestamp: utcNowISO() });
    }, 30000);

    // 180초 타임아웃 (자동 연결 해제)
    const timeoutId = setTimeout(() => {
      console.log(`[SSE-DocStatus] 문서 상태 스트림 타임아웃 - documentId: ${documentId}`);
      sendSSE(res, 'timeout', { documentId, timestamp: utcNowISO() });
      res.end();
    }, 180000);

    // 연결 종료 처리
    req.on('close', () => {
      console.log(`[SSE-DocStatus] 문서 상태 스트림 연결 종료 - documentId: ${documentId}`);
      clearInterval(keepAliveInterval);
      clearTimeout(timeoutId);
      documentStatusSSEClients.get(documentId)?.delete(res);
      if (documentStatusSSEClients.get(documentId)?.size === 0) {
        documentStatusSSEClients.delete(documentId);
      }
    });
  });

  /**
   * 문서 처리 완료 알림 Webhook (n8n OCRWorker에서 호출)
   * @route POST /api/webhooks/document-processing-complete
   * @description OCR 처리 완료 시 호출하여 SSE 알림 발생
   */
  router.post('/webhooks/document-processing-complete', async (req, res) => {
    try {
      const { document_id, status, owner_id } = req.body;

      // API Key 인증 (n8n에서 호출 시 사용)
      const apiKey = req.headers['x-api-key'];
      if (apiKey !== (process.env.INTERNAL_WEBHOOK_API_KEY || process.env.N8N_WEBHOOK_API_KEY) && apiKey !== process.env.N8N_API_KEY) {
        console.warn('[SSE-DocStatus] 잘못된 API Key로 webhook 호출 시도');
        return res.status(401).json({ success: false, error: '인증 실패' });
      }

      if (!document_id) {
        return res.status(400).json({ success: false, error: 'document_id가 필요합니다.' });
      }

      console.log(`[SSE-DocStatus] 문서 처리 완료 알림 수신 - document_id: ${document_id}, type: ${typeof document_id}, status: ${status}`);
      console.log(`[SSE-DocStatus] 현재 SSE 클라이언트 목록: [${Array.from(documentStatusSSEClients.keys()).join(', ')}]`);

      // SSE 알림 전송 (클라이언트가 없으면 재시도)
      const eventData = {
        documentId: document_id,
        status: status || 'completed',
        ownerId: owner_id || 'unknown',
        timestamp: utcNowISO()
      };

      // n8n에서 따옴표가 포함된 문자열로 올 수 있음 - 제거
      const documentIdStr = document_id.toString().replace(/^"|"$/g, '');
      console.log(`[SSE-DocStatus] 검색할 키: "${documentIdStr}" (length: ${documentIdStr.length})`);

      // 🔄 overallStatus 업데이트 - 임베딩까지 완료되어야 'completed'
      // OCR 완료만으로는 completed가 아님! docembed.status === 'done'이어야 함
      try {
        const doc = await db.collection(COLLECTIONS.FILES).findOne({ _id: new ObjectId(documentIdStr) });
        if (doc) {
          let newOverallStatus = 'processing';

          // 에러 상태 처리 (quota_exceeded도 에러로 처리)
          if (status === 'error' || status === 'failed' || status === 'quota_exceeded') {
            newOverallStatus = 'error';
          }
          // 임베딩까지 완료된 경우에만 completed (skipped도 완료로 처리)
          else if (doc.docembed && (doc.docembed.status === 'done' || doc.docembed.status === 'skipped')) {
            newOverallStatus = 'completed';
          }
          // OCR만 완료된 상태는 processing 유지
          else if (status === 'completed' || status === 'done') {
            newOverallStatus = 'processing';
          }

          // OCR이 아직 진행 중이면 completed 처리 보류
          if ((status === 'completed' || status === 'done') &&
              doc.ocr && (doc.ocr.status === 'queued' || doc.ocr.status === 'running')) {
            console.log(`[SSE-DocStatus] OCR 진행 중(${doc.ocr.status}), overallStatus 업데이트 보류: ${documentIdStr}`);
            newOverallStatus = 'processing';
          }

          // 🔥 빈 텍스트 체크: OCR 완료 + 텍스트 없음 → 임베딩 스킵하고 바로 완료 처리
          const hasText = (doc.meta?.full_text && doc.meta.full_text.trim() !== '') ||
                          (doc.ocr?.full_text && doc.ocr.full_text.trim() !== '') ||
                          (doc.text?.full_text && doc.text.full_text.trim() !== '');

          if ((status === 'completed' || status === 'done') && !hasText &&
              (!doc.docembed || (doc.docembed.status !== 'done' && doc.docembed.status !== 'skipped')) &&
              !(doc.ocr && (doc.ocr.status === 'queued' || doc.ocr.status === 'running'))) {
            console.log(`[SSE-DocStatus] 빈 텍스트 감지 → 임베딩 스킵 처리: ${documentIdStr}`);
            newOverallStatus = 'completed';
            // docembed도 바로 skip 처리
            await db.collection(COLLECTIONS.FILES).updateOne(
              { _id: new ObjectId(documentIdStr) },
              { $set: {
                'docembed.status': 'skipped',
                'docembed.skip_reason': 'no_text',
                'docembed.chunks': 0,
                'docembed.updated_at': new Date().toISOString()
              }}
            );
          }

          // 업데이트할 필드 구성
          const updateFields = {
            overallStatus: newOverallStatus,
            overallStatusUpdatedAt: new Date()
          };

          // quota_exceeded인 경우 stages.ocr도 업데이트
          if (status === 'quota_exceeded') {
            updateFields['stages.ocr.status'] = 'error';
            updateFields['stages.ocr.message'] = 'OCR 한도 초과';
            updateFields['stages.ocr.timestamp'] = new Date().toISOString();
          }

          await db.collection(COLLECTIONS.FILES).updateOne(
            { _id: new ObjectId(documentIdStr) },
            { $set: updateFields }
          );
          console.log(`[SSE-DocStatus] overallStatus 업데이트: ${documentIdStr} → ${newOverallStatus} (docembed: ${doc.docembed?.status || 'none'})`);
        }
      } catch (updateError) {
        console.error(`[SSE-DocStatus] overallStatus 업데이트 실패:`, updateError);
        backendLogger.error('SSE', 'overallStatus 업데이트 실패', updateError);
        // 업데이트 실패해도 SSE 알림은 계속 진행
      }

      const maxRetries = 10;  // 최대 10회 재시도
      const retryDelay = 500; // 500ms 간격
      let sent = false;

      for (let i = 0; i < maxRetries; i++) {
        const clients = documentStatusSSEClients.get(documentIdStr);
        console.log(`[SSE-DocStatus] 시도 ${i + 1}: 키 "${documentIdStr}" → clients=${clients ? clients.size : 'null'}, 전체 키: [${Array.from(documentStatusSSEClients.keys()).join(', ')}]`);
        if (clients && clients.size > 0) {
          notifyDocumentStatusSubscribers(documentIdStr, 'processing-complete', eventData);
          sent = true;
          console.log(`[SSE-DocStatus] 이벤트 전송 성공 (시도 ${i + 1}/${maxRetries})`);
          break;
        }
        console.log(`[SSE-DocStatus] 클라이언트 없음, 대기 중... (시도 ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }

      if (!sent) {
        console.log(`[SSE-DocStatus] 최대 재시도 초과 - 클라이언트 연결 없음`);
      }

      // 🔄 문서 목록 SSE 알림도 함께 발송 (owner_id가 있는 경우)
      if (owner_id) {
        const ownerIdStr = owner_id.toString().replace(/^"|"$/g, '');
        notifyDocumentListSubscribers(ownerIdStr, 'document-list-change', {
          type: 'status-changed',
          documentId: documentIdStr,
          status: status || 'completed',
          timestamp: utcNowISO()
        });
        console.log(`[SSE-DocList] 문서 처리 완료 → 목록 변경 알림 전송 - userId: ${ownerIdStr}`);
      }

      // 🔄 고객 문서 SSE 알림도 함께 발송 (customerId가 있는 경우)
      try {
        const docForCustomer = await db.collection(COLLECTIONS.FILES).findOne({ _id: new ObjectId(documentIdStr) });
        if (docForCustomer && docForCustomer.customerId) {
          const customerIdStr = docForCustomer.customerId.toString();
          notifyCustomerDocSubscribers(customerIdStr, 'document-status-change', {
            type: 'processing',
            status: status || 'completed',
            customerId: customerIdStr,
            documentId: documentIdStr,
            documentName: docForCustomer.upload?.originalName || 'Unknown',
            timestamp: utcNowISO()
          });
          console.log(`[SSE-CustomerDoc] 문서 처리 완료 → 고객 문서 알림 전송 - customerId: ${customerIdStr}`);
        }
      } catch (customerNotifyError) {
        console.error('[SSE-CustomerDoc] 고객 문서 알림 실패:', customerNotifyError.message);
      }

      // 🔒 바이러스 스캔 트리거 (임베딩 완료 시점)
      // 실시간 스캔 ON: 즉시 yuri에 스캔 요청
      // 실시간 스캔 OFF: pending 상태로 누적 (수동 스캔 대기)
      try {
        await virusScanService.scanAfterUpload(db, documentIdStr, 'files');
      } catch (scanError) {
        console.error('[VirusScan] 스캔 트리거 오류:', scanError.message);
        // 스캔 오류는 무시하고 계속 진행
      }

      // 📄 PDF 변환 트리거 (Office 문서 + customerId가 있는 경우)
      try {
        const docForPdf = await db.collection(COLLECTION_NAME).findOne({ _id: new ObjectId(documentIdStr) });
        if (docForPdf && docForPdf.customerId) {
          const pdfResult = await triggerPdfConversionIfNeeded(docForPdf);
          console.log(`[PDF변환] 문서 처리 완료 후 트리거: ${documentIdStr} → ${pdfResult}`);
        }
      } catch (pdfError) {
        console.error('[PDF변환] 트리거 오류:', pdfError.message);
        // PDF 변환 오류는 무시하고 계속 진행
      }

      res.json({ success: true, message: 'SSE 알림이 전송되었습니다.', sent });
    } catch (error) {
      console.error('[SSE-DocStatus] 문서 처리 완료 알림 오류:', error);
      backendLogger.error('SSE', '문서 처리 완료 알림 오류', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 문서 처리 진행률 업데이트 Webhook (document_pipeline에서 호출)
   * @route POST /api/webhooks/document-progress
   * @description 문서 처리 각 단계에서 진행률 업데이트 SSE 알림 발생
   */
  router.post('/webhooks/document-progress', async (req, res) => {
    try {
      const { document_id, progress, stage, message, owner_id } = req.body;

      // API Key 인증
      const apiKey = req.headers['x-api-key'];
      if (apiKey !== (process.env.INTERNAL_WEBHOOK_API_KEY || process.env.N8N_WEBHOOK_API_KEY) && apiKey !== process.env.N8N_API_KEY) {
        console.warn('[SSE-Progress] 잘못된 API Key로 webhook 호출 시도');
        return res.status(401).json({ success: false, error: '인증 실패' });
      }

      if (!document_id || progress === undefined) {
        return res.status(400).json({ success: false, error: 'document_id와 progress가 필요합니다.' });
      }

      const documentIdStr = document_id.toString().replace(/^"|"$/g, '');
      console.log(`[SSE-Progress] 진행률 업데이트 - document_id: ${documentIdStr}, progress: ${progress}%, stage: ${stage}`);

      // SSE 이벤트 데이터
      const eventData = {
        documentId: documentIdStr,
        progress: progress,
        stage: stage || 'processing',
        message: message || '',
        timestamp: utcNowISO()
      };

      // 개별 문서 구독자에게 진행률 업데이트 알림
      const clients = documentStatusSSEClients.get(documentIdStr);
      if (clients && clients.size > 0) {
        notifyDocumentStatusSubscribers(documentIdStr, 'progress-update', eventData);
        console.log(`[SSE-Progress] 개별 문서 구독자에게 알림 전송 - clients: ${clients.size}`);
      }

      // 문서 목록 구독자에게도 알림 (테이블 업데이트)
      if (owner_id) {
        const ownerIdStr = owner_id.toString().replace(/^"|"$/g, '');
        notifyDocumentListSubscribers(ownerIdStr, 'document-progress', {
          type: 'progress-update',
          documentId: documentIdStr,
          progress: progress,
          stage: stage || 'processing',
          timestamp: utcNowISO()
        });
        console.log(`[SSE-Progress] 문서 목록 구독자에게 알림 전송 - userId: ${ownerIdStr}`);
      }

      res.json({ success: true, message: '진행률 업데이트 알림 전송됨', progress });
    } catch (error) {
      console.error('[SSE-Progress] 진행률 업데이트 오류:', error);
      backendLogger.error('SSE', '진행률 업데이트 오류', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 문서 목록 실시간 업데이트 SSE 스트림 (DocumentStatusProvider용)
   * @route GET /api/documents/status-list/stream
   * @description 사용자의 문서 목록 변경을 실시간으로 전달
   * 인증: ?token=xxx 쿼리 파라미터 (EventSource는 헤더 설정 불가)
   */
  router.get('/documents/status-list/stream', authenticateJWTWithQuery, (req, res) => {
    const userId = req.user.id;

    console.log(`[SSE-DocList] 문서 목록 스트림 연결 - userId: ${userId}`);

    // SSE 헤더 설정
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // 클라이언트 등록
    if (!documentListSSEClients.has(userId)) {
      documentListSSEClients.set(userId, new Set());
    }
    documentListSSEClients.get(userId).add(res);

    // 연결 확인 이벤트
    sendSSE(res, 'connected', {
      userId,
      timestamp: utcNowISO()
    });

    // 30초마다 keep-alive 전송
    const keepAliveInterval = setInterval(() => {
      sendSSE(res, 'ping', { timestamp: utcNowISO() });
    }, 30000);

    // 연결 종료 처리
    req.on('close', () => {
      console.log(`[SSE-DocList] 문서 목록 스트림 연결 종료 - userId: ${userId}`);
      clearInterval(keepAliveInterval);
      documentListSSEClients.get(userId)?.delete(res);
      if (documentListSSEClients.get(userId)?.size === 0) {
        documentListSSEClients.delete(userId);
      }
    });
  });

  /**
   * 문서 목록 변경 알림 Webhook (내부용)
   * @route POST /api/webhooks/document-list-change
   * @description 문서 업로드/삭제/상태변경 시 호출하여 SSE 알림 발생
   */
  router.post('/webhooks/document-list-change', (req, res) => {
    try {
      const { userId, changeType, documentId, documentName, status } = req.body;

      // API Key 인증 (내부 호출용)
      const apiKey = req.headers['x-api-key'];
      if (apiKey !== (process.env.INTERNAL_WEBHOOK_API_KEY || process.env.N8N_WEBHOOK_API_KEY) && apiKey !== process.env.N8N_API_KEY) {
        console.warn('[SSE-DocList] 잘못된 API Key로 webhook 호출 시도');
        return res.status(401).json({ success: false, error: '인증 실패' });
      }

      if (!userId) {
        return res.status(400).json({ success: false, error: 'userId가 필요합니다.' });
      }

      // SSE 알림 전송: 문서 목록 변경
      notifyDocumentListSubscribers(userId, 'document-list-change', {
        type: changeType || 'updated',
        documentId: documentId || 'unknown',
        documentName: documentName || 'Unknown',
        status: status || 'unknown',
        timestamp: utcNowISO()
      });

      console.log(`[SSE-DocList] 문서 목록 변경 알림 전송 - userId: ${userId}, type: ${changeType}`);

      res.json({ success: true, message: '알림이 전송되었습니다.' });
    } catch (error) {
      console.error('[SSE-DocList] 문서 목록 변경 알림 오류:', error);
      backendLogger.error('SSE', '문서 목록 변경 알림 오류', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 문서 업로드 알림 endpoint
   * n8n webhook에서 직접 업로드 후 프론트엔드가 호출하여 SSE 알림 발생
   * @route POST /api/notify/document-uploaded
   */
  router.post('/notify/document-uploaded', authenticateJWT, async (req, res) => {
    try {
      const { customerId, documentId, documentName } = req.body;
      const userId = req.user.id;

      if (!customerId) {
        return res.status(400).json({ success: false, error: 'customerId가 필요합니다.' });
      }

      // 고객 소유권 확인
      const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
        _id: new ObjectId(customerId),
        'meta.created_by': userId
      });

      if (!customer) {
        return res.status(404).json({ success: false, error: '고객을 찾을 수 없습니다.' });
      }

      // SSE 알림 전송: 문서 변경
      notifyCustomerDocSubscribers(customerId, 'document-change', {
        type: 'linked',
        customerId,
        documentId: documentId || 'unknown',
        documentName: documentName || 'Unknown',
        timestamp: utcNowISO()
      });

      console.log(`[SSE] 문서 업로드 알림 전송 - customerId: ${customerId}, userId: ${userId}`);

      // 바이러스 스캔 + PDF 변환은 파이프라인 완료 webhook(document-processing-complete)에서 트리거됨
      // 이 엔드포인트는 SSE 알림 전송만 담당

      res.json({ success: true, message: '알림이 전송되었습니다.' });
    } catch (error) {
      console.error('문서 업로드 알림 오류:', error);
      backendLogger.error('SSE', '문서 업로드 알림 오류', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};
