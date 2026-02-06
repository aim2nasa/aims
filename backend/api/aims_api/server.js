// server.js - 문서 상태 모니터링 API 서버
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const multer = require('multer');
const { QdrantClient } = require('@qdrant/js-client-rest');
const { utcNowISO } = require('./lib/timeUtils');
const passport = require('passport');
const cookieParser = require('cookie-parser');
const { generateToken, authenticateJWT, authenticateJWTorAPIKey, authenticateJWTWithQuery, requireRole } = require('./middleware/auth');
const { getTierDefinitions } = require('./lib/storageQuotaService');
const metricsCollector = require('./lib/metricsCollector');
const activityLogger = require('./lib/activityLogger');
const errorLogger = require('./lib/errorLogger');
const backendLogger = require('./lib/backendLogger');
const chatHistoryService = require('./lib/chatHistoryService');
const { VERSION_INFO, logVersionInfo } = require('./version');
const serviceHealthMonitor = require('./lib/serviceHealthMonitor');
const realtimeMetrics = require('./lib/realtimeMetrics');
// 공유 스키마에서 컬렉션명 상수 import
const { COLLECTIONS, CUSTOMER_FIELDS, CUSTOMER_STATUS } = require('@aims/shared-schema');

const app = express();

// CORS 허용 origin 목록
const ALLOWED_ORIGINS = [
  'https://aims.giize.com',
  'https://admin.aims.giize.com',
  'http://localhost:5177',
  'https://localhost:5177',
  'http://localhost:5178',
  'https://localhost:5178',
  'http://localhost:5179',
  'https://localhost:5179',
  'http://localhost:5173',
  'https://localhost:5173',
  // Expo 개발 환경 (모바일 앱)
  'http://localhost:8081',
  'http://localhost:19000',
  'http://localhost:19001',
  'http://localhost:19002',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // origin이 없는 경우 (same-origin 또는 curl 등) 허용
    if (!origin) return callback(null, true);
    // 허용된 origin인 경우 허용
    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`[CORS] Blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json({ charset: 'utf-8' }));
app.use(express.urlencoded({ extended: true, charset: 'utf-8' }));
app.use(cookieParser());

// Multer 설정 (메모리 저장 - 프록시용)
const upload = multer({ storage: multer.memoryStorage() });

// UTF-8 응답 헤더 설정
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// 백엔드 로거 미들웨어 (요청 컨텍스트 캡처)
app.use(backendLogger.middleware);

// 실시간 메트릭 추적 미들웨어
app.use(realtimeMetrics.trackingMiddleware);

// 🔍 포괄적인 요청 디버깅 미들웨어 (모든 요청 로깅)
app.use((req, res, next) => {
  const timestamp = utcNowISO();
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
  
  console.log(`\n======================================`);
  console.log(`📥 [${timestamp}] ${req.method} ${req.url}`);
  console.log(`🌍 클라이언트 IP:`, clientIP);
  console.log(`📋 쿼리 파라미터:`, JSON.stringify(req.query, null, 2));
  console.log(`📦 요청 헤더:`, JSON.stringify(req.headers, null, 2));
  
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`📄 요청 바디:`, JSON.stringify(req.body, null, 2));
  }
  
  console.log(`======================================\n`);
  next();
});

// 🔍 응답 디버깅 미들웨어
app.use((req, res, next) => {
  const originalSend = res.send;
  const originalJson = res.json;
  
  res.send = function(data) {
    console.log(`📤 [응답] ${req.method} ${req.url} - Status: ${res.statusCode}`);
    if (typeof data === 'string' && data.length < 500) {
      console.log(`📤 응답 데이터:`, data);
    } else if (typeof data === 'object') {
      console.log(`📤 응답 JSON:`, JSON.stringify(data, null, 2));
    }
    return originalSend.call(this, data);
  };
  
  res.json = function(data) {
    console.log(`📤 [JSON 응답] ${req.method} ${req.url} - Status: ${res.statusCode}`);
    console.log(`📤 응답 JSON:`, JSON.stringify(data, null, 2));
    return originalJson.call(this, data);
  };
  
  next();
});

// MongoDB 연결 설정
const MONGO_URI = 'mongodb://tars:27017/';
const DB_NAME = 'docupload';
const ANALYTICS_DB_NAME = 'aims_analytics';
// 컬렉션명은 @aims/shared-schema의 COLLECTIONS 사용
// 하위 호환성을 위한 별칭 (점진적으로 COLLECTIONS.XXX로 교체 예정)
const COLLECTION_NAME = COLLECTIONS.FILES;

// Qdrant 설정
const QDRANT_HOST = 'localhost';
const QDRANT_PORT = 6333;
const QDRANT_COLLECTION = 'docembed';

// 고객 관계 관리 라우트 import
const { setupCustomerRelationshipRoutes } = require('./customer-relationships-routes');
// 개인 파일 관리 라우트 import
const personalFilesRoutes = require('./routes/personal-files-routes');
let db;
let analyticsDb;
let fallbackHandlersRegistered = false;

// SSE 클라이언트 관리 (lib/sseManager.js)
const sseManager = require('./lib/sseManager');
const { notifyDocumentListSubscribers, notifyUserAccountSubscribers } = sseManager;

// PDF conversion functions and proxy - moved to routes/documents-routes.js


// Qdrant 클라이언트 인스턴스 (서버 1.9.0과 클라이언트 1.15.x 호환성 문제 해결)
const qdrantClient = new QdrantClient({
  host: QDRANT_HOST,
  port: QDRANT_PORT,
  checkCompatibility: false
});

const registerFallbackHandlers = () => {
  if (fallbackHandlersRegistered) {
    return;
  }
  fallbackHandlersRegistered = true;

  app.use((req, res, next) => {
    res.status(404).json({
      success: false,
      error: '요청한 엔드포인트를 찾을 수 없습니다.',
      requested_url: req.originalUrl,
      method: req.method,
      available_endpoints: [
        'GET /api/health',
        'GET /api/documents',
        'GET /api/documents/status',
        'GET /api/documents/:id/status',
        'GET /api/customers',
        'POST /api/customers',
        'GET /api/customers/:id',
        'PUT /api/customers/:id',
        'DELETE /api/customers/:id'
      ],
      timestamp: utcNowISO()
    });
  });

  app.use((error, req, res, next) => {
    // backendLogger로 에러 기록 (미들웨어가 컨텍스트 자동 캡처)
    backendLogger.error('Server', `${req.method} ${req.originalUrl} - ${error.message}`, error)
      .catch(err => {
        console.error('[Server] 에러 로깅 실패:', err.message);
      });

    res.status(500).json({
      success: false,
      error: '내부 서버 오류가 발생했습니다.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: utcNowISO()
    });
  });
};

// MongoDB 연결
MongoClient.connect(MONGO_URI)
  .then(client => {
    console.log('MongoDB 연결 성공');
    db = client.db(DB_NAME);
  })
  .catch(error => console.error('MongoDB 연결 실패:', error));

// ==================== Document Routes ====================
const documentsRoutes = require('./routes/documents-routes');
app.use('/api', documentsRoutes(db, analyticsDb, authenticateJWT, upload, qdrantClient, QDRANT_COLLECTION));


// Health/System 라우트 (routes/health-routes.js로 추출)
app.use('/api', require('./routes/health-routes')(db));


// User/Dev 라우트 (routes/users-routes.js로 추출)
app.use('/api', require('./routes/users-routes')(db, authenticateJWT, generateToken, qdrantClient, QDRANT_COLLECTION));

// ==================== Customer Routes ====================
const customersRoutes = require('./routes/customers-routes');
app.use('/api', customersRoutes(db, analyticsDb, authenticateJWT, authenticateJWTorAPIKey, authenticateJWTWithQuery, qdrantClient, QDRANT_COLLECTION));

// ==================== Admin Routes ====================
const adminRoutes = require('./routes/admin-routes');
app.use('/api', adminRoutes(db, analyticsDb, authenticateJWT, requireRole, qdrantClient, QDRANT_COLLECTION));

// ==================== Customer-Document, AR/CR, Address, Memos ====================
// (Included in routes/customers-routes.js)


// ==================== Insurance Products API ====================

// Insurance/Contracts 라우트 (routes/insurance-contracts-routes.js로 추출)
app.use('/api', require('./routes/insurance-contracts-routes')(db, authenticateJWTorAPIKey));


// ==================== MongoDB 연결 & 서버 시작 ====================

// 고객 관계 관리 라우트 설정
MongoClient.connect(MONGO_URI)
  .then(client => {
    console.log('MongoDB 연결 성공');
    db = client.db(DB_NAME);
    analyticsDb = client.db(ANALYTICS_DB_NAME);

    // ActivityLogger 초기화
    activityLogger.initialize(analyticsDb).catch(err => {
      console.error('[Server] ActivityLogger 초기화 실패:', err.message);
    });

    // ErrorLogger 초기화
    errorLogger.initialize(analyticsDb).catch(err => {
      console.error('[Server] ErrorLogger 초기화 실패:', err.message);
    });

    // ChatHistoryService 초기화
    chatHistoryService.initialize(analyticsDb).catch(err => {
      console.error('[Server] ChatHistoryService 초기화 실패:', err.message);
    });

    // AI 모델 설정 모듈 초기화
    const aiModelSettings = require('./lib/aiModelSettings');
    aiModelSettings.init(db);

    // Passport 초기화
    require('./config/passport')(db);
    app.use(passport.initialize());

    // 인증 라우트 등록
    const authRoutes = require('./routes/auth')(db);
    app.use('/api/auth', authRoutes);

    // 고객 관계 라우트 설정
    setupCustomerRelationshipRoutes(app, db);

    // 개인 파일 관리 라우트 설정
    app.use('/api/personal-files', personalFilesRoutes);

    // AI 토큰 사용량 라우트 설정 (가장 먼저 등록)
    console.log('[Server] fallbackHandlersRegistered BEFORE token routes:', fallbackHandlersRegistered);
    const tokenUsageRoutes = require('./routes/token-usage-routes')(db, analyticsDb, authenticateJWT, requireRole);
    console.log('[Server] tokenUsageRoutes type:', typeof tokenUsageRoutes, 'stack:', tokenUsageRoutes.stack?.length);
    app.use('/api', tokenUsageRoutes);
    console.log('[Server] tokenUsageRoutes 등록 완료');

    // OCR 사용량 라우트 설정
    const ocrUsageRoutes = require('./routes/ocr-usage-routes')(db, analyticsDb, authenticateJWT, requireRole);
    app.use('/api', ocrUsageRoutes);
    console.log('[Server] ocrUsageRoutes 등록 완료');

    // 사용량 리셋 라우트 설정
    const usageResetRoutes = require('./routes/usage-reset-routes')(db, analyticsDb, authenticateJWT, requireRole);
    app.use('/api', usageResetRoutes);
    console.log('[Server] usageResetRoutes 등록 완료');

    // 사용자 활동 라우트 설정
    const userActivityRoutes = require('./routes/user-activity-routes')(db, analyticsDb, authenticateJWT, requireRole);
    app.use('/api', userActivityRoutes);
    console.log('[Server] userActivityRoutes 등록 완료');

    // 스토리지 쿼터 라우트 설정 (크레딧 시스템 지원)
    const storageRoutes = require('./routes/storage-routes')(db, analyticsDb, authenticateJWT, requireRole, notifyUserAccountSubscribers);
    app.use('/api', storageRoutes);

    // 추가 크레딧 라우트 설정 (보너스 크레딧 관리)
    const bonusCreditsRoutes = require('./routes/bonus-credits-routes')(db, analyticsDb, authenticateJWT, requireRole);
    app.use('/api', bonusCreditsRoutes);
    console.log('[Server] bonusCreditsRoutes 등록 완료');

    // 테스트: storage routes 바로 다음에 직접 라우트 등록
    app.get('/api/storage-test', (req, res) => {
      res.json({ success: true, message: 'Direct route after storage works!' });
    });

    // 보안 라우트 설정 (바이러스 검사)
    const securityRoutes = require('./routes/security-routes')(db, authenticateJWT);
    app.use('/api', securityRoutes);

    // 시스템 설정 라우트 설정 (파일 검증 설정 등)
    const systemSettingsRoutes = require('./routes/system-settings-routes')(db, authenticateJWT, requireRole);
    app.use('/api', systemSettingsRoutes);

    // 1:1 문의 라우트 설정
    const inquiriesRoutes = require('./routes/inquiries-routes')(db, authenticateJWT, requireRole);
    app.use('/api', inquiriesRoutes);
    console.log('[Server] inquiriesRoutes 등록 완료');

    // 도움말 콘텐츠 라우트 설정 (공지사항, 사용 가이드, FAQ)
    const helpContentRoutes = require('./routes/help-content-routes')(db, authenticateJWT, requireRole);
    app.use('/api', helpContentRoutes);
    console.log('[Server] helpContentRoutes 등록 완료');

    // 에러 로그 라우트 설정 (에러 수집 및 관리자 조회)
    const errorLogsRoutes = require('./routes/error-logs-routes')(db, authenticateJWT, requireRole);
    app.use('/api', errorLogsRoutes);
    console.log('[Server] errorLogsRoutes 등록 완료');

    // 나만의 질문 저장소 라우트 설정
    const savedQuestionsRoutes = require('./routes/saved-questions-routes')(db, authenticateJWT);
    app.use('/api', savedQuestionsRoutes);
    console.log('[Server] savedQuestionsRoutes 등록 완료');

    // 문서 유형 라우트 설정
    const documentTypesRoutes = require('./routes/document-types-routes')(db, authenticateJWT, requireRole);
    app.use('/api', documentTypesRoutes);
    console.log('[Server] documentTypesRoutes 등록 완료');

    // 바이러스 스캔 라우트 설정 (관리자용)
    // notifyDocumentListSubscribers 전달하여 바이러스 감지 시 프론트엔드 실시간 업데이트
    const virusScanRoutes = require('./routes/virus-scan-routes')(db, authenticateJWT, requireRole, authenticateJWTWithQuery, notifyDocumentListSubscribers);
    app.use('/api', virusScanRoutes);
    console.log('[Server] virusScanRoutes 등록 완료');

    console.log('[Server] fallbackHandlersRegistered BEFORE registerFallbackHandlers():', fallbackHandlersRegistered);
    registerFallbackHandlers();
  })
  .catch(error => {
    console.error('MongoDB 연결 실패:', error);
    registerFallbackHandlers();
  });

// ==================== OCR 권한 백그라운드 체크 ====================
// 주기적으로 권한 없는 사용자의 문서를 확인하여 ocr.warn 설정
let ocrPermissionCheckInterval = null;

async function checkOcrPermissions() {
  try {
    const client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    try {
      // meta 완료 + full_text 없음 + ocr.warn 없음 + ocr.status 없음인 문서 조회
      const documents = await db.collection(COLLECTION_NAME).find({
        'meta.meta_status': 'ok',
        $or: [
          { 'meta.full_text': null },
          { 'meta.full_text': '' }
        ],
        'ocr.warn': { $exists: false },
        'ocr.status': { $exists: false }
      }).limit(100).toArray(); // 한 번에 최대 100개만 처리

      let processedCount = 0;
      let skippedCount = 0;

      for (const doc of documents) {
        if (!doc.ownerId) {
          console.log(`[OCR Permission Check] 문서 ${doc._id}: ownerId 없음, 스킵`);
          continue;
        }

        const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(doc.ownerId) });

        if (!user || !user.hasOcrPermission) {
          await db.collection(COLLECTION_NAME).updateOne(
            { _id: doc._id },
            {
              $set: {
                'ocr.warn': 'OCR 권한이 없습니다. 관리자에게 문의하세요.',
                'ocr.status': 'skipped'
              }
            }
          );
          skippedCount++;
          console.log(`[OCR Permission Check] 문서 ${doc._id}: OCR 권한 없음, ocr.warn 설정`);
        }

        processedCount++;
      }

      if (processedCount > 0) {
        console.log(`[OCR Permission Check] 처리 완료: ${processedCount}개 확인, ${skippedCount}개 스킵 설정`);
      }
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('[OCR Permission Check] 오류:', error);
    backendLogger.error('OCR', '[OCR Permission Check] 오류', error);
  }
}

// 5초마다 실행
ocrPermissionCheckInterval = setInterval(checkOcrPermissions, 5000);

// 서버 종료 시 interval 정리
process.on('SIGTERM', () => {
  if (ocrPermissionCheckInterval) {
    clearInterval(ocrPermissionCheckInterval);
    console.log('[OCR Permission Check] Interval 정리 완료');
  }
});

// 메트릭 수집 인터벌
let metricsCollectionInterval = null;

/**
 * 시스템 메트릭 수집 및 저장
 */
async function collectAndSaveMetrics() {
  try {
    const metrics = metricsCollector.collectMetrics();
    await db.collection('system_metrics').insertOne(metrics);
    console.log(`[Metrics] 시스템 메트릭 수집 완료 - CPU: ${metrics.cpu.usage}%, Mem: ${metrics.memory.usagePercent}%, Disk: ${metrics.disk.usagePercent}%`);
  } catch (error) {
    console.error('[Metrics] 메트릭 수집 실패:', error.message);
    backendLogger.error('Metrics', '메트릭 수집 실패', error);
  }
}

/**
 * 메트릭 컬렉션 TTL 인덱스 설정 (7일 후 자동 삭제)
 */
async function setupMetricsCollection() {
  try {
    const collections = await db.listCollections({ name: 'system_metrics' }).toArray();
    if (collections.length === 0) {
      await db.createCollection('system_metrics');
      console.log('[Metrics] system_metrics 컬렉션 생성됨');
    }

    // TTL 인덱스 설정 (이미 있으면 무시됨)
    await db.collection('system_metrics').createIndex(
      { timestamp: 1 },
      { expireAfterSeconds: 604800 } // 7일
    );
    console.log('[Metrics] TTL 인덱스 설정 완료 (7일 보관)');
  } catch (error) {
    // 인덱스가 이미 있으면 무시
    if (!error.message.includes('already exists')) {
      console.error('[Metrics] 인덱스 설정 실패:', error.message);
      backendLogger.error('Metrics', '인덱스 설정 실패', error);
    }
  }
}

process.on('SIGINT', () => {
  if (ocrPermissionCheckInterval) {
    clearInterval(ocrPermissionCheckInterval);
    console.log('[OCR Permission Check] Interval 정리 완료');
  }
  if (metricsCollectionInterval) {
    clearInterval(metricsCollectionInterval);
    console.log('[Metrics] Interval 정리 완료');
  }
});

// ==================== Webhooks, AR/CR Background, n8n Proxy ====================
const webhooksRoutes = require('./routes/webhooks-routes');
app.use('/api', webhooksRoutes(db, authenticateJWT));


// ==================== Backup Management Routes ====================
const adminBackupRoutes = require('./routes/admin-backup-routes');
app.use('/api', adminBackupRoutes(db, authenticateJWT, requireRole));


module.exports = app;
