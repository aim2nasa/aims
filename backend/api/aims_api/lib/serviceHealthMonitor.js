/**
 * 서비스 상태 모니터링 모듈
 * - 주기적으로 서비스 상태 체크
 * - 상태 변경 시 DB에 이력 저장
 * - 장애 발생/복구 시점 기록
 */

const http = require('http');
const net = require('net');
const backendLogger = require('./backendLogger');
const { utcNowISO } = require('./timeUtils');

// 모니터링할 서비스 목록
const MONITORED_SERVICES = [
  // aims_api: deep health check 사용 (좀비 상태 감지)
  { port: 3010, service: 'aims_api', description: 'AIMS 메인 API', healthEndpoint: '/api/health/deep', timeout: 10000 },
  { port: 3011, service: 'aims_mcp', description: 'MCP 서버 (AI 도구)', healthEndpoint: '/health' },
  { port: 8000, service: 'aims_rag_api', description: 'RAG/문서 처리 API', healthEndpoint: '/health' },
  { port: 8002, service: 'pdf_proxy', description: 'PDF 프록시', healthEndpoint: '/health' },
  { port: 8004, service: 'annual_report_api', description: '연간보고서 API', healthEndpoint: '/health' },
  { port: 8005, service: 'pdf_converter', description: 'PDF 변환 서버', healthEndpoint: '/health' },
  { port: 8100, service: 'document_pipeline', description: 'Document Pipeline API', healthEndpoint: '/health/deep', timeout: 10000 },
  { port: 5678, service: 'n8n', description: '워크플로우 엔진', healthEndpoint: '/healthz' },
  { port: 6333, service: 'qdrant', description: '벡터 DB', healthEndpoint: null },
  { port: 27017, service: 'mongodb', description: '데이터베이스', healthEndpoint: null }
];

// 컬렉션명
const COLLECTION_NAME = 'service_health_logs';

// 이전 상태 캐시 (상태 변경 감지용)
let previousStatus = {};

// DB 참조 (외부에서 주입)
let db = null;

// 모니터링 간격 (ms)
const CHECK_INTERVAL = 60 * 1000; // 1분

// 타임아웃 (ms)
const HEALTH_TIMEOUT = 5000;

/**
 * DB 초기화
 * @param {Object} database - MongoDB database 인스턴스
 */
function init(database) {
  db = database;
  console.log('[ServiceHealthMonitor] 초기화 완료');
}

/**
 * HTTP 헬스 체크
 * @param {number} port 포트
 * @param {string} path 헬스 엔드포인트 경로
 * @param {number} timeout 타임아웃 (ms, 기본값: HEALTH_TIMEOUT)
 * @returns {Promise<{healthy: boolean, responseTime: number, error?: string}>}
 */
function checkHttpHealth(port, path, timeout = HEALTH_TIMEOUT) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const options = {
      hostname: 'localhost',
      port,
      path,
      method: 'GET',
      timeout: timeout
    };

    const req = http.request(options, (res) => {
      const responseTime = Date.now() - startTime;
      // 2xx 응답은 healthy
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve({ healthy: true, responseTime });
      } else {
        resolve({ healthy: false, responseTime, error: `HTTP ${res.statusCode}` });
      }
      // 응답 바디 drain
      res.resume();
    });

    req.on('error', (err) => {
      const responseTime = Date.now() - startTime;
      resolve({ healthy: false, responseTime, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      const responseTime = Date.now() - startTime;
      resolve({ healthy: false, responseTime, error: 'Timeout' });
    });

    req.end();
  });
}

/**
 * TCP 포트 체크 (MongoDB, Qdrant 등)
 * @param {number} port 포트
 * @returns {Promise<{healthy: boolean, responseTime: number, error?: string}>}
 */
function checkTcpHealth(port) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();

    socket.setTimeout(HEALTH_TIMEOUT);

    socket.on('connect', () => {
      const responseTime = Date.now() - startTime;
      socket.destroy();
      resolve({ healthy: true, responseTime });
    });

    socket.on('timeout', () => {
      const responseTime = Date.now() - startTime;
      socket.destroy();
      resolve({ healthy: false, responseTime, error: 'Timeout' });
    });

    socket.on('error', (err) => {
      const responseTime = Date.now() - startTime;
      socket.destroy();
      resolve({ healthy: false, responseTime, error: err.message });
    });

    socket.connect(port, 'localhost');
  });
}

/**
 * 단일 서비스 상태 체크
 * @param {Object} service 서비스 정보
 * @returns {Promise<Object>} 상태 결과
 */
async function checkService(service) {
  const { port, healthEndpoint, timeout } = service;

  let result;
  if (healthEndpoint) {
    result = await checkHttpHealth(port, healthEndpoint, timeout || HEALTH_TIMEOUT);
  } else {
    result = await checkTcpHealth(port);
  }

  return {
    ...service,
    status: result.healthy ? 'healthy' : 'unhealthy',
    healthy: result.healthy,
    responseTime: result.responseTime,
    error: result.error || null,
    checkedAt: utcNowISO()
  };
}

/**
 * 모든 서비스 상태 체크
 * @returns {Promise<Array>} 서비스 상태 배열
 */
async function checkAllServices() {
  const results = await Promise.all(
    MONITORED_SERVICES.map(service => checkService(service))
  );
  return results;
}

/**
 * 상태 변경 감지 및 로깅
 * @param {Array} currentResults 현재 상태
 */
async function detectAndLogChanges(currentResults) {
  if (!db) {
    console.warn('[ServiceHealthMonitor] DB 미초기화, 로깅 건너뜀');
    return;
  }

  const collection = db.collection(COLLECTION_NAME);
  const now = new Date();
  const logsToInsert = [];

  for (const result of currentResults) {
    const prevStatus = previousStatus[result.service];
    const currentStatus = result.status;

    // 상태 변경 감지
    if (prevStatus !== undefined && prevStatus !== currentStatus) {
      const eventType = currentStatus === 'healthy' ? 'recovered' : 'down';

      const logEntry = {
        service: result.service,
        port: result.port,
        description: result.description,
        eventType,
        previousStatus: prevStatus,
        currentStatus,
        error: result.error,
        responseTime: result.responseTime,
        timestamp: now,
        timestampISO: utcNowISO()
      };

      logsToInsert.push(logEntry);

      // 콘솔 로그
      if (eventType === 'down') {
        console.error(`[ServiceHealthMonitor] ❌ ${result.service} DOWN - ${result.error}`);
      } else {
        console.log(`[ServiceHealthMonitor] ✅ ${result.service} RECOVERED`);
      }
    }

    // 상태 캐시 업데이트
    previousStatus[result.service] = currentStatus;
  }

  // 변경사항 DB 저장
  if (logsToInsert.length > 0) {
    try {
      await collection.insertMany(logsToInsert);
      console.log(`[ServiceHealthMonitor] ${logsToInsert.length}건 상태 변경 기록됨`);
    } catch (err) {
      console.error('[ServiceHealthMonitor] DB 저장 실패:', err.message);
      backendLogger.error('ServiceHealthMonitor', 'DB 저장 실패', err);
    }
  }
}

/**
 * 헬스 체크 실행 (1회)
 */
async function runHealthCheck() {
  try {
    const results = await checkAllServices();
    await detectAndLogChanges(results);
    return results;
  } catch (err) {
    console.error('[ServiceHealthMonitor] 헬스 체크 실패:', err.message);
    backendLogger.error('ServiceHealthMonitor', '헬스 체크 실패', err);
    return [];
  }
}

/**
 * 주기적 모니터링 시작
 * @returns {NodeJS.Timer} interval ID
 */
function startMonitoring() {
  console.log(`[ServiceHealthMonitor] 모니터링 시작 (${CHECK_INTERVAL / 1000}초 간격)`);

  // 초기 상태 로드 (첫 체크 시 상태 변경으로 인식하지 않도록)
  runHealthCheck().then(() => {
    console.log('[ServiceHealthMonitor] 초기 상태 캐시됨');
  });

  // 주기적 체크
  return setInterval(runHealthCheck, CHECK_INTERVAL);
}

/**
 * 헬스 이력 조회
 * @param {Object} options 조회 옵션
 * @returns {Promise<Array>} 이력 목록
 */
async function getHealthHistory(options = {}) {
  if (!db) {
    throw new Error('DB 미초기화');
  }

  const {
    service = null,
    eventType = null,
    startDate = null,
    endDate = null,
    limit = 100,
    skip = 0
  } = options;

  const query = {};

  if (service) {
    query.service = service;
  }

  if (eventType) {
    query.eventType = eventType;
  }

  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) {
      query.timestamp.$gte = new Date(startDate);
    }
    if (endDate) {
      query.timestamp.$lte = new Date(endDate);
    }
  }

  const collection = db.collection(COLLECTION_NAME);

  const [logs, totalCount] = await Promise.all([
    collection.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    collection.countDocuments(query)
  ]);

  return { logs, totalCount };
}

/**
 * 서비스별 다운타임 통계
 * @param {number} days 조회 기간 (일)
 * @returns {Promise<Array>} 통계
 */
async function getDowntimeStats(days = 30) {
  if (!db) {
    throw new Error('DB 미초기화');
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const collection = db.collection(COLLECTION_NAME);

  const stats = await collection.aggregate([
    {
      $match: {
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$service',
        downCount: {
          $sum: { $cond: [{ $eq: ['$eventType', 'down'] }, 1, 0] }
        },
        recoveryCount: {
          $sum: { $cond: [{ $eq: ['$eventType', 'recovered'] }, 1, 0] }
        },
        lastEvent: { $max: '$timestamp' },
        events: { $push: { eventType: '$eventType', timestamp: '$timestamp' } }
      }
    },
    {
      $sort: { downCount: -1 }
    }
  ]).toArray();

  return stats;
}

/**
 * 현재 상태 조회 (캐시된 상태)
 * @returns {Object} 서비스별 현재 상태
 */
function getCurrentStatus() {
  return { ...previousStatus };
}

/**
 * 서비스 상태 이력 삭제
 * @returns {Promise<{deletedCount: number}>} 삭제 결과
 */
async function clearHistory() {
  if (!db) {
    throw new Error('DB 미초기화');
  }

  const collection = db.collection(COLLECTION_NAME);
  const result = await collection.deleteMany({});

  console.log(`[ServiceHealthMonitor] ${result.deletedCount}건 이력 삭제됨`);

  return { deletedCount: result.deletedCount };
}

module.exports = {
  init,
  startMonitoring,
  runHealthCheck,
  checkAllServices,
  getHealthHistory,
  getDowntimeStats,
  getCurrentStatus,
  clearHistory,
  MONITORED_SERVICES
};
