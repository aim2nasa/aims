/**
 * 실시간 시스템 메트릭 수집 모듈
 * 동시접속자 수, 요청 처리량, 시스템 부하 지수를 추적
 * @since 2026-01-05
 */

const metricsCollector = require('./metricsCollector');

// 실시간 요청 카운터
let activeRequests = 0;
let totalRequests = 0;
let totalErrors = 0;

// 응답시간 순환 버퍼 (Ring Buffer) - shift() O(n) 대신 O(1) 삽입
const MAX_RESPONSE_TIMES = 1000;
const responseTimes = new Array(MAX_RESPONSE_TIMES).fill(0);
let responseTimesIndex = 0;  // 다음 삽입 위치
let responseTimesCount = 0;  // 실제 저장된 개수

// 윈도우 기반 통계 (최근 60초)
const WINDOW_SIZE = 60; // 60초
const requestsPerSecond = new Array(WINDOW_SIZE).fill(0);
const errorsPerSecond = new Array(WINDOW_SIZE).fill(0);
let currentSecond = Math.floor(Date.now() / 1000);

// 동시접속 사용자 추적 (userId 기반)
const activeUsers = new Map(); // userId -> { lastActivity, requestCount }
const USER_TIMEOUT = 5 * 60 * 1000; // 5분 비활성시 제거

/**
 * 현재 초 인덱스 업데이트 (슬라이딩 윈도우)
 */
function updateCurrentSecond() {
  const now = Math.floor(Date.now() / 1000);
  while (currentSecond < now) {
    currentSecond++;
    const index = currentSecond % WINDOW_SIZE;
    requestsPerSecond[index] = 0;
    errorsPerSecond[index] = 0;
  }
}

/**
 * 요청 시작 시 호출
 * @param {string} userId - 사용자 ID (없으면 anonymous)
 * @returns {number} - 요청 시작 시간 (hrtime)
 */
function onRequestStart(userId = 'anonymous') {
  updateCurrentSecond();

  activeRequests++;
  totalRequests++;

  const index = currentSecond % WINDOW_SIZE;
  requestsPerSecond[index]++;

  // 사용자 활동 추적
  if (userId && userId !== 'anonymous') {
    const now = Date.now();
    const existing = activeUsers.get(userId);
    if (existing) {
      existing.lastActivity = now;
      existing.requestCount++;
    } else {
      activeUsers.set(userId, {
        lastActivity: now,
        requestCount: 1
      });
    }
  }

  return process.hrtime.bigint();
}

/**
 * 요청 종료 시 호출
 * @param {bigint} startTime - 요청 시작 시간
 * @param {boolean} isError - 에러 여부
 */
function onRequestEnd(startTime, isError = false) {
  activeRequests = Math.max(0, activeRequests - 1);

  if (isError) {
    totalErrors++;
    const index = currentSecond % WINDOW_SIZE;
    errorsPerSecond[index]++;
  }

  // 응답시간 기록 (밀리초)
  const endTime = process.hrtime.bigint();
  const durationMs = Number(endTime - startTime) / 1000000;

  // 순환 버퍼에 O(1)로 삽입 (배열 재할당 없음)
  responseTimes[responseTimesIndex] = durationMs;
  responseTimesIndex = (responseTimesIndex + 1) % MAX_RESPONSE_TIMES;
  if (responseTimesCount < MAX_RESPONSE_TIMES) responseTimesCount++;
}

/**
 * 비활성 사용자 정리 (5분 이상 비활성)
 */
function cleanupInactiveUsers() {
  const now = Date.now();
  for (const [userId, data] of activeUsers.entries()) {
    if (now - data.lastActivity > USER_TIMEOUT) {
      activeUsers.delete(userId);
    }
  }
}

// 30초마다 비활성 사용자 정리
setInterval(cleanupInactiveUsers, 30000);

/**
 * 순환 버퍼에서 유효한 데이터만 추출
 * @returns {number[]}
 */
function getResponseTimesSnapshot() {
  if (responseTimesCount === 0) return [];
  if (responseTimesCount < MAX_RESPONSE_TIMES) {
    return responseTimes.slice(0, responseTimesCount);
  }
  return [...responseTimes];
}

/**
 * 백분위수 계산
 * @param {number[]} arr - 배열
 * @param {number} p - 백분위수 (0-100)
 * @returns {number}
 */
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = arr.sort((a, b) => a - b); // in-place 정렬 (스냅샷이므로 안전)
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * 최근 N초 동안의 요청 수 합계
 * @param {number} seconds - 초
 * @returns {number}
 */
function getRequestsInLastSeconds(seconds) {
  updateCurrentSecond();
  let count = 0;
  for (let i = 0; i < Math.min(seconds, WINDOW_SIZE); i++) {
    const index = (currentSecond - i + WINDOW_SIZE) % WINDOW_SIZE;
    count += requestsPerSecond[index];
  }
  return count;
}

/**
 * 최근 N초 동안의 에러 수 합계
 */
function getErrorsInLastSeconds(seconds) {
  updateCurrentSecond();
  let count = 0;
  for (let i = 0; i < Math.min(seconds, WINDOW_SIZE); i++) {
    const index = (currentSecond - i + WINDOW_SIZE) % WINDOW_SIZE;
    count += errorsPerSecond[index];
  }
  return count;
}

/**
 * 시스템 부하 지수 계산 (0-100)
 * CPU × 0.4 + Memory × 0.3 + LoadAvg × 0.2 + ActiveRequests × 0.1
 */
function calculateLoadIndex() {
  const cpu = metricsCollector.getCpuUsage();
  const memory = metricsCollector.getMemoryUsage();

  // Load Average 정규화 (코어 수 대비)
  const loadAvg1m = cpu.loadAvg[0] || 0;
  const normalizedLoad = Math.min(100, (loadAvg1m / cpu.cores) * 100);

  // Active Requests 정규화 (100개 기준)
  const normalizedRequests = Math.min(100, (activeRequests / 100) * 100);

  const loadIndex = (
    cpu.usage * 0.4 +
    memory.usagePercent * 0.3 +
    normalizedLoad * 0.2 +
    normalizedRequests * 0.1
  );

  return Math.round(loadIndex * 10) / 10;
}

/**
 * 부하 상태 판정
 * @param {number} loadIndex
 * @returns {'normal' | 'warning' | 'critical'}
 */
function getLoadStatus(loadIndex) {
  if (loadIndex < 50) return 'normal';
  if (loadIndex < 80) return 'warning';
  return 'critical';
}

/**
 * 실시간 메트릭 조회
 * @returns {Object}
 */
function getRealtimeMetrics() {
  updateCurrentSecond();
  cleanupInactiveUsers();

  const cpu = metricsCollector.getCpuUsage();
  const memory = metricsCollector.getMemoryUsage();
  const loadIndex = calculateLoadIndex();

  // 응답시간 통계 (순환 버퍼 스냅샷 1회 생성, 재사용)
  const snapshot = getResponseTimesSnapshot();
  const avgResponseTime = snapshot.length > 0
    ? snapshot.reduce((a, b) => a + b, 0) / snapshot.length
    : 0;
  const p50 = percentile(snapshot, 50);
  const p95 = percentile(snapshot, 95);
  const p99 = percentile(snapshot, 99);

  // 처리량 (requests per second)
  const requestsLast60s = getRequestsInLastSeconds(60);
  const requestsLast10s = getRequestsInLastSeconds(10);
  const throughput = requestsLast10s / 10; // 최근 10초 평균

  // 에러율
  const errorsLast60s = getErrorsInLastSeconds(60);
  const errorRate = requestsLast60s > 0
    ? (errorsLast60s / requestsLast60s) * 100
    : 0;

  return {
    timestamp: new Date().toISOString(),

    // 동시접속
    concurrency: {
      activeRequests,
      activeUsers: activeUsers.size,
      peakRequests: Math.max(...requestsPerSecond)
    },

    // 처리량
    throughput: {
      requestsPerSecond: Math.round(throughput * 100) / 100,
      requestsLast60s,
      totalRequests,
      totalErrors,
      errorRate: Math.round(errorRate * 100) / 100
    },

    // 응답시간
    responseTime: {
      avg: Math.round(avgResponseTime * 100) / 100,
      p50: Math.round(p50 * 100) / 100,
      p95: Math.round(p95 * 100) / 100,
      p99: Math.round(p99 * 100) / 100,
      sampleCount: responseTimesCount
    },

    // 시스템 부하
    loadIndex: {
      value: loadIndex,
      status: getLoadStatus(loadIndex),
      components: {
        cpu: cpu.usage,
        memory: memory.usagePercent,
        loadAvg: cpu.loadAvg[0] || 0,
        activeRequests
      }
    },

    // 시스템 리소스 (요약)
    system: {
      cpu: cpu.usage,
      memory: memory.usagePercent,
      loadAvg: cpu.loadAvg
    }
  };
}

/**
 * Express 미들웨어 - 요청 추적
 */
function trackingMiddleware(req, res, next) {
  // 헬스체크, 정적 파일 등 제외
  if (req.path === '/health' || req.path.startsWith('/static')) {
    return next();
  }

  const userId = req.userId || req.headers['x-user-id'] || 'anonymous';
  const startTime = onRequestStart(userId);

  // 응답 완료 시 추적
  res.on('finish', () => {
    const isError = res.statusCode >= 400;
    onRequestEnd(startTime, isError);
  });

  // 연결 종료 시 (클라이언트 끊김)
  res.on('close', () => {
    if (!res.writableFinished) {
      onRequestEnd(startTime, true);
    }
  });

  next();
}

/**
 * 통계 리셋 (테스트용)
 */
function resetStats() {
  activeRequests = 0;
  totalRequests = 0;
  totalErrors = 0;
  responseTimes.fill(0);
  responseTimesIndex = 0;
  responseTimesCount = 0;
  requestsPerSecond.fill(0);
  errorsPerSecond.fill(0);
  activeUsers.clear();
}

module.exports = {
  onRequestStart,
  onRequestEnd,
  getRealtimeMetrics,
  trackingMiddleware,
  resetStats,
  // 개별 조회용
  getActiveRequests: () => activeRequests,
  getActiveUsers: () => activeUsers.size,
  getThroughput: () => getRequestsInLastSeconds(10) / 10,
  getLoadIndex: calculateLoadIndex
};
