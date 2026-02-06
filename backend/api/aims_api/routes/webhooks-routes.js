/**
 * webhooks-routes.js - n8n 프록시, AR/CR Background Parsing, Webhooks
 *
 * Phase 11: server.js 리팩토링
 * @since 2026-02-07
 */

const express = require('express');
const { ObjectId } = require('mongodb');
const axios = require('axios');
const { COLLECTIONS } = require('@aims/shared-schema');
const backendLogger = require('../lib/backendLogger');
const { utcNowISO } = require('../lib/timeUtils');
const sseManager = require('../lib/sseManager');
const {
  notifyARSubscribers,
  notifyCRSubscribers,
  notifyDocumentStatusSubscribers,
  notifyDocumentListSubscribers,
  notifyCustomerDocSubscribers,
} = sseManager;

module.exports = function(db, authenticateJWT) {
  const router = express.Router();

  const N8N_INTERNAL_URL = 'http://localhost:5678';
  const DOCUMENT_PIPELINE_URL = 'http://localhost:8100';

// =============================================================================
// n8n Webhook 프록시 엔드포인트 (보안: 내부망에서만 n8n 접근 가능)
// =============================================================================

const N8N_INTERNAL_URL = 'http://localhost:5678';
const DOCUMENT_PIPELINE_URL = 'http://localhost:8100';

/**
 * 스마트 검색 프록시 - Shadow Mode로 n8n과 FastAPI 동시 비교
 * 외부에서 직접 n8n에 접근하지 못하도록 aims_api를 통해 프록시
 */
router.post('/n8n/smartsearch', authenticateJWT, async (req, res) => {
  try {
    console.log(`[Shadow Proxy] smartsearch 요청 - userId: ${req.user.userId}`);

    // Shadow 엔드포인트로 프록시 (n8n과 FastAPI 동시 비교)
    const response = await axios.post(
      `${DOCUMENT_PIPELINE_URL}/shadow/smart-search`,
      {
        ...req.body,
        userId: req.user.userId  // 인증된 사용자 정보 주입
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000  // 60초 타임아웃 (AI 검색은 시간이 걸릴 수 있음)
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('[Shadow Proxy] smartsearch 오류:', error.message);
    backendLogger.error('shadowProxy', 'smartsearch 오류', error);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ error: 'Search service unavailable' });
    }
  }
});

/**
 * 문서 업로드 프록시 - n8n docprep-main webhook
 * 외부에서 직접 n8n에 접근하지 못하도록 aims_api를 통해 프록시
 */
router.post('/n8n/docprep', authenticateJWT, async (req, res) => {
  try {
    console.log(`[n8n Proxy] docprep 요청 - userId: ${req.user.userId}`);

    const response = await axios.post(
      `${N8N_INTERNAL_URL}/webhook/docprep-main`,
      {
        ...req.body,
        userId: req.user.userId  // 인증된 사용자 정보 주입
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 120000  // 120초 타임아웃 (파일 업로드는 시간이 걸릴 수 있음)
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('[n8n Proxy] docprep 오류:', error.message);
    backendLogger.error('n8nProxy', 'docprep 오류', error);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ error: 'Upload service unavailable' });
    }
  }
});

// ==================== AI Chat / Audio / Internal API ====================
const chatRoutes = require('./routes/chat-routes');
app.use('/api', chatRoutes(db, analyticsDb, authenticateJWT, upload));


const PORT = process.env.PORT || 3010;
app.listen(PORT, '0.0.0.0', async () => {
  // 버전 정보 출력
  logVersionInfo();

  console.log('🚀🚀🚀 ================================');
  console.log(`🚀 문서 상태 API 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`🚀 서버 시간: ${utcNowISO()}`);
  console.log(`🚀 바인딩: 0.0.0.0:${PORT} (모든 네트워크 인터페이스)`);
  console.log('🚀🚀🚀 ================================\n');

  // MongoDB 연결 대기 (최대 30초)
  let dbWaitCount = 0;
  while (!db && dbWaitCount < 30) {
    console.log('[Metrics] MongoDB 연결 대기 중...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    dbWaitCount++;
  }

  if (!db) {
    console.error('[Metrics] MongoDB 연결 실패 - 메트릭 수집 비활성화');
  } else {
    // 메트릭 수집 설정
    await setupMetricsCollection();

    // 즉시 1회 수집 후, 1분마다 수집
    await collectAndSaveMetrics();
    metricsCollectionInterval = setInterval(collectAndSaveMetrics, 60 * 1000);
    console.log('[Metrics] 시스템 메트릭 수집 시작 (1분 간격)');

    // 서비스 상태 모니터링 시작
    serviceHealthMonitor.init(db);
    serviceHealthMonitor.startMonitoring();

    // 바이러스 스캔 자동 모니터링 시작
    virusScanService.init(db);
    virusScanService.startAutoScan();
  }

  console.log(`📋 API 엔드포인트:`);
  console.log(`  GET  /api/documents - 모든 문서 목록 조회 (검색, 정렬, 페이징)`);
  console.log(`  GET  /api/documents/status - 문서 목록 및 상태 조회`);
  console.log(`  GET  /api/documents/:id/status - 특정 문서 상세 상태`);
  console.log(`  GET  /webhook/get-status/:document_id - 간단한 문서 상태 조회`);
  console.log(`  GET  /api/documents/statistics - 처리 상태 통계`);
  console.log(`  POST /api/documents/:id/retry - 문서 재처리`);
  console.log(`  GET  /api/documents/status/live - 실시간 상태 (폴링용)`);
  console.log(`  DELETE /api/documents/:id - 문서 삭제`);
  console.log(`  GET  /api/health - 헬스체크`);

  console.log(`\n👥 Customer Management APIs:`);
  console.log(`  GET  /api/customers - 고객 목록 조회`);
  console.log(`  POST /api/customers - 새 고객 등록`);
  console.log(`  GET  /api/customers/:id - 고객 상세 정보`);
  console.log(`  PUT  /api/customers/:id - 고객 정보 수정`);
  console.log(`  DELETE /api/customers/:id - 고객 삭제`);
  console.log(`  GET /api/admin/orphaned-relationships - Orphaned relationships 조회`);
  console.log(`  DELETE /api/admin/orphaned-relationships - Orphaned relationships 정리`);
  console.log(`  POST /api/customers/:id/documents - 고객에 문서 연결`);
  console.log(`  GET  /api/customers/:id/documents - 고객 관련 문서 목록`);

  console.log(`\n🏠 Address Search API:`);
  console.log(`  GET  /api/address/search - 한국 주소 검색 (정부 API 프록시)`);
  console.log(`  POST /api/geocode - 주소 → 좌표 변환 (네이버 Geocoding API)`);

  console.log(`\n📊 Annual Report APIs:`);
  console.log(`  POST /api/annual-report/parse - Annual Report 파싱 요청`);
  console.log(`  GET  /api/annual-report/status/:file_id - 파싱 상태 조회`);
  console.log(`  GET  /api/customers/:customerId/annual-reports - 고객 Annual Reports 목록`);
  console.log(`  GET  /api/customers/:customerId/annual-reports/latest - 최신 Annual Report 조회`);

  console.log(`
📁 Personal Files APIs:`);
  console.log(`  GET  /api/personal-files/folders/:folderId? - 폴더 내용 조회`);
  console.log(`  POST /api/personal-files/folders - 폴더 생성`);
  console.log(`  POST /api/personal-files/upload - 파일 업로드`);
  console.log(`  PUT  /api/personal-files/:itemId/rename - 항목 이름 변경`);
  console.log(`  DELETE /api/personal-files/:itemId - 항목 삭제`);
  console.log(`  GET  /api/personal-files/:fileId/download - 파일 다운로드`);
  console.log(`  GET  /api/customers/:customerId/annual-reports - 고객 Annual Reports 목록`);
  console.log(`  GET  /api/customers/:customerId/annual-reports/latest - 최신 Annual Report 조회`);

  console.log(`\n🔍 디버깅 활성화: 모든 HTTP 요청/응답 로깅 중...`);
  console.log(`=============================================\n`);
});

// ==================== AR Background Parsing Proxy ====================
/**
 * AR 백그라운드 파싱 프록시 엔드포인트
 * 포트 8004 방화벽 문제 우회용
 */
router.post("/ar-background/trigger-parsing", authenticateJWT, async (req, res) => {
  try {
    // ⭐ userId 추출 및 검증 (사용자 계정 기능)
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId required'
      });
    }

    console.log("🚀 [AR 백그라운드 파싱 프록시] 요청 수신, userId:", userId);

    // localhost:8004로 요청 전달
    const response = await axios.post(
      "http://localhost:8004/ar-background/trigger-parsing",
      req.body,
      {
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId
        },
        timeout: 5000
      }
    );

    console.log("✅ [AR 백그라운드 파싱 프록시] 성공:", response.data);
    res.json(response.data);
  } catch (error) {
    console.error("❌ [AR 백그라운드 파싱 프록시] 실패:", error.message);
    backendLogger.error('AnnualReport', 'AR 백그라운드 파싱 프록시 실패', error);
    res.status(500).json({
      success: false,
      error: "백그라운드 파싱 트리거 실패",
      details: error.message
    });
  }
});

/**
 * AR 파싱 재시도 프록시 엔드포인트
 * 파싱 실패한 AR 문서를 다시 파싱 요청
 */
router.post("/ar-background/retry-parsing", authenticateJWT, async (req, res) => {
  try {
    // ⭐ userId 추출 및 검증 (사용자 계정 기능)
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId required'
      });
    }

    const { file_id } = req.body;
    if (!file_id) {
      return res.status(400).json({
        success: false,
        message: 'file_id required'
      });
    }

    console.log("🔄 [AR 파싱 재시도 프록시] 요청 수신, file_id:", file_id, "userId:", userId);

    // customerId 조회 (SSE 알림용)
    let customerId = null;
    try {
      const file = await db.collection(COLLECTION_NAME).findOne(
        { _id: new ObjectId(file_id) },
        { projection: { customerId: 1 } }
      );
      customerId = file?.customerId?.toString();
    } catch (e) {
      console.warn("[AR 파싱 재시도] customerId 조회 실패:", e.message);
    }

    // localhost:8004로 요청 전달
    const response = await axios.post(
      "http://localhost:8004/ar-background/retry-parsing",
      req.body,
      {
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId
        },
        timeout: 5000
      }
    );

    console.log("✅ [AR 파싱 재시도 프록시] 성공:", response.data);

    // SSE 알림 전송
    if (customerId) {
      notifyARSubscribers(customerId, 'ar-change', {
        type: 'retry-started',
        fileId: file_id,
        timestamp: utcNowISO()
      });
    }

    res.json(response.data);
  } catch (error) {
    console.error("❌ [AR 파싱 재시도 프록시] 실패:", error.message);
    backendLogger.error('AnnualReport', 'AR 파싱 재시도 프록시 실패', error);
    res.status(500).json({
      success: false,
      error: "파싱 재시도 트리거 실패",
      details: error.message
    });
  }
});

// ==================== CR Background Parsing Proxy ====================
/**
 * CR 백그라운드 파싱 프록시 엔드포인트
 * Customer Review Service 파싱 트리거
 */
router.post("/cr-background/trigger-parsing", authenticateJWT, async (req, res) => {
  try {
    // userId 추출 및 검증
    const userId = req.user.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId required'
      });
    }

    console.log("🚀 [CR 백그라운드 파싱 프록시] 요청 수신, userId:", userId);

    // localhost:8004로 요청 전달
    const response = await axios.post(
      "http://localhost:8004/cr-background/trigger-parsing",
      req.body,
      {
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId
        },
        timeout: 60000  // CR 파싱은 pdfplumber 사용하므로 빠름
      }
    );

    console.log("✅ [CR 백그라운드 파싱 프록시] 성공:", response.data);

    // SSE 알림 전송 (customer_id가 있는 경우)
    const customerId = req.body.customer_id;
    if (customerId && response.data.success) {
      notifyCRSubscribers(customerId, 'cr-change', {
        type: 'parsing-complete',
        fileId: req.body.file_id,
        processingCount: response.data.processing_count,
        timestamp: utcNowISO()
      });
    }

    res.json(response.data);
  } catch (error) {
    console.error("❌ [CR 백그라운드 파싱 프록시] 실패:", error.message);
    backendLogger.error('CustomerReview', 'CR 백그라운드 파싱 프록시 실패', error);
    res.status(500).json({
      success: false,
      error: "CR 파싱 트리거 실패",
      details: error.message
    });
  }
});

/**
 * CR 파싱 재시도 프록시 엔드포인트
 * 파싱 실패한 CR 문서를 다시 파싱 요청
 */
router.post("/cr-background/retry-parsing", authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId required'
      });
    }

    const { file_id } = req.body;
    if (!file_id) {
      return res.status(400).json({
        success: false,
        message: 'file_id required'
      });
    }

    console.log("🔄 [CR 파싱 재시도 프록시] 요청 수신, file_id:", file_id, "userId:", userId);

    // localhost:8004로 요청 전달
    const response = await axios.post(
      "http://localhost:8004/cr-background/retry-parsing",
      req.body,
      {
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId
        },
        timeout: 60000
      }
    );

    console.log("✅ [CR 파싱 재시도 프록시] 성공:", response.data);

    // SSE 알림 전송 (file_id로 customerId 조회)
    if (response.data.success && file_id) {
      try {
        const fileDoc = await db.collection(FILES_COLLECTION).findOne({ _id: new ObjectId(file_id) });
        if (fileDoc && fileDoc.customerId) {
          notifyCRSubscribers(fileDoc.customerId.toString(), 'cr-change', {
            type: 'retry-complete',
            fileId: file_id,
            timestamp: utcNowISO()
          });
        }
      } catch (lookupError) {
        console.warn('[CR 파싱 재시도] customerId 조회 실패:', lookupError.message);
      }
    }

    res.json(response.data);
  } catch (error) {
    console.error("❌ [CR 파싱 재시도 프록시] 실패:", error.message);
    backendLogger.error('CustomerReview', 'CR 파싱 재시도 프록시 실패', error);
    res.status(500).json({
      success: false,
      error: "CR 파싱 재시도 트리거 실패",
      details: error.message
    });
  }
});

/**
 * AR 파싱 상태 변경 웹훅 (Python API에서 호출)
 * @route POST /api/webhooks/ar-status-change
 * @description AR 파싱 완료/실패 시 SSE 알림 트리거
 */
router.post("/webhooks/ar-status-change", async (req, res) => {
  try {
    const { customer_id, file_id, status, error_message } = req.body;

    if (!customer_id) {
      return res.status(400).json({ success: false, error: 'customer_id required' });
    }

    // 🔍 DEBUG: 웹훅 수신 상세 로깅
    console.log(`[AR 웹훅] 📥 상태 변경 수신 - customer_id: "${customer_id}" (type: ${typeof customer_id}), file_id: ${file_id}, status: ${status}`);
    console.log(`[AR 웹훅] 🔍 현재 arSSEClients 키 목록: [${Array.from(arSSEClients.keys()).join(', ')}]`);

    // SSE 알림 전송: AR 탭용
    notifyARSubscribers(customer_id, 'ar-change', {
      type: status === 'completed' ? 'parsing-complete' : status === 'error' ? 'parsing-error' : 'status-change',
      fileId: file_id,
      status,
      errorMessage: error_message,
      timestamp: utcNowISO()
    });

    // SSE 알림 전송: 문서 탭용 (AR도 문서이므로 문서 탭도 갱신)
    notifyCustomerDocSubscribers(customer_id, 'document-change', {
      type: 'linked',
      customerId: customer_id,
      documentId: file_id || 'unknown',
      documentName: 'Annual Report',
      timestamp: utcNowISO()
    });

    // SSE 알림 전송: 전체 문서 보기 Status Bar용 (파싱 진행률 실시간 반영)
    if (file_id) {
      try {
        const fileDoc = await db.collection(COLLECTIONS.FILES).findOne(
          { _id: new ObjectId(file_id) },
          { projection: { ownerId: 1 } }
        );
        if (fileDoc?.ownerId) {
          notifyDocumentListSubscribers(fileDoc.ownerId, 'document-list-change', {
            type: 'ar-parsing-update',
            documentId: file_id,
            status,
            timestamp: utcNowISO()
          });
        }
      } catch (e) {
        console.warn(`[AR 웹훅] document-list-change 알림 실패 (무시):`, e.message);
      }
    }

    res.json({ success: true, message: 'SSE notification sent' });
  } catch (error) {
    console.error("❌ [AR 웹훅] 실패:", error.message);
    backendLogger.error('AnnualReport', 'AR 웹훅 실패', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * CR 파싱 상태 변경 웹훅 (Python API에서 호출)
 * @route POST /api/webhooks/cr-status-change
 * @description CR 파싱 완료/실패 시 SSE 알림 트리거
 */
router.post("/webhooks/cr-status-change", async (req, res) => {
  try {
    const { customer_id, file_id, status, error_message } = req.body;

    if (!customer_id) {
      return res.status(400).json({ success: false, error: 'customer_id required' });
    }

    console.log(`[CR 웹훅] 상태 변경 - customer_id: ${customer_id}, file_id: ${file_id}, status: ${status}`);

    // SSE 알림 전송: CR 탭용
    notifyCRSubscribers(customer_id, 'cr-change', {
      type: status === 'completed' ? 'parsing-complete' : status === 'error' ? 'parsing-error' : 'status-change',
      fileId: file_id,
      status,
      errorMessage: error_message,
      timestamp: utcNowISO()
    });

    // SSE 알림 전송: 문서 탭용 (CR도 문서이므로 문서 탭도 갱신)
    notifyCustomerDocSubscribers(customer_id, 'document-change', {
      type: 'linked',
      customerId: customer_id,
      documentId: file_id || 'unknown',
      documentName: 'Customer Review',
      timestamp: utcNowISO()
    });

    // SSE 알림 전송: 전체 문서 보기 Status Bar용 (파싱 진행률 실시간 반영)
    if (file_id) {
      try {
        const fileDoc = await db.collection(COLLECTIONS.FILES).findOne(
          { _id: new ObjectId(file_id) },
          { projection: { ownerId: 1 } }
        );
        if (fileDoc?.ownerId) {
          notifyDocumentListSubscribers(fileDoc.ownerId, 'document-list-change', {
            type: 'cr-parsing-update',
            documentId: file_id,
            status,
            timestamp: utcNowISO()
          });
        }
      } catch (e) {
        console.warn(`[CR 웹훅] document-list-change 알림 실패 (무시):`, e.message);
      }
    }

    res.json({ success: true, message: 'SSE notification sent' });
  } catch (error) {
    console.error("❌ [CR 웹훅] 실패:", error.message);
    backendLogger.error('CustomerReview', 'CR 웹훅 실패', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


  return router;
};
