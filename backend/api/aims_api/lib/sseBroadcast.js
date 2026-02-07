/**
 * SSE 브로드캐스트 서비스
 * 시스템 로그와 활동 로그를 실시간으로 관리자에게 브로드캐스트
 * @since 2025-12-22
 */

const backendLogger = require('./backendLogger');

console.log('[SSE-Broadcast] 모듈 로드됨');

// SSE 클라이언트 Set
const sseClients = new Set();

// SSE 배치 전송 설정
const SSE_BATCH_INTERVAL = 1000;  // 1초
const SSE_BATCH_SIZE = 20;        // 최대 20개
let logBuffer = [];

/**
 * SSE 이벤트 전송 헬퍼
 */
function sendSSE(res, event, data) {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (e) {
    console.error('[SSE-Broadcast] 전송 실패:', e.message);
    backendLogger.error('SSE-Broadcast', 'SSE 이벤트 전송 실패', e);
  }
}

// logBuffer 최대 크기 (클라이언트 없을 때 무한 축적 방지)
const MAX_LOG_BUFFER = SSE_BATCH_SIZE * 3; // 60개

/**
 * 로그를 배치 버퍼에 추가
 * 클라이언트가 없으면 버퍼링하지 않음 (메모리 누수 방지)
 */
function queueLogForBroadcast(log) {
  if (sseClients.size === 0) return; // 클라이언트 없으면 버퍼링 중단
  if (logBuffer.length >= MAX_LOG_BUFFER) return; // 최대 크기 초과 시 드롭
  logBuffer.push(log);
}

/**
 * 배치 브로드캐스트 타이머 (1초마다)
 */
setInterval(() => {
  if (logBuffer.length === 0 || sseClients.size === 0) return;

  const batch = logBuffer.splice(0, SSE_BATCH_SIZE);
  console.log(`[SSE-Broadcast] 배치 전송: ${batch.length}개 로그 → ${sseClients.size}명`);

  sseClients.forEach(res => {
    sendSSE(res, 'logs-batch', batch);
  });

  // 버퍼 오버플로우 방지 (slice 대신 splice로 in-place 제거 → 배열 복사 방지)
  if (logBuffer.length > MAX_LOG_BUFFER) {
    const removeCount = logBuffer.length - SSE_BATCH_SIZE * 2;
    logBuffer.splice(0, removeCount);
  }
}, SSE_BATCH_INTERVAL);

/**
 * 새 로그 브로드캐스트
 * @param {Object} log - 로그 객체
 */
function broadcastNewLog(log) {
  if (sseClients.size === 0) return;

  // error/warn 레벨은 즉시 전송
  if (log.level === 'error' || log.level === 'warn') {
    sseClients.forEach(res => sendSSE(res, 'new-log', log));
  } else {
    // debug/info/activity는 배치로 전송
    queueLogForBroadcast(log);
  }
}

/**
 * Activity 로그 브로드캐스트 (변환된 형태로)
 * @param {Object} activityLog - activity_logs 형태의 로그
 */
function broadcastActivityLog(activityLog) {
  console.log(`[SSE-Broadcast] broadcastActivityLog 호출됨, 클라이언트 수: ${sseClients.size}`);
  if (sseClients.size === 0) {
    console.log('[SSE-Broadcast] 연결된 클라이언트 없음, 스킵');
    return;
  }

  // activity_log를 system_log 형식으로 변환
  const levelMap = {
    'create': 'info',
    'update': 'info',
    'delete': 'warn',
    'upload': 'info',
    'download': 'info',
    'bulk_create': 'info',
    'bulk_delete': 'warn',
    'login': 'info',
    'logout': 'info'
  };

  const level = activityLog.result?.success === false ? 'error' : (levelMap[activityLog.action?.type] || 'info');
  const actionDesc = activityLog.action?.description || `${activityLog.action?.category} ${activityLog.action?.type}`;
  const targetName = activityLog.action?.target?.entity_name;
  const message = targetName ? `${actionDesc}: ${targetName}` : actionDesc;

  const transformedLog = {
    _id: activityLog._id?.toString() || `act_${Date.now()}`,
    logType: 'activity',
    level,
    actor: activityLog.actor || {},
    timestamp: activityLog.timestamp || new Date().toISOString(),
    source: {
      type: 'backend',
      component: activityLog.action?.category || 'system',
      endpoint: activityLog.location?.endpoint,
      method: activityLog.location?.method
    },
    message,
    data: activityLog.action?.target ? {
      entity_type: activityLog.action.target.entity_type,
      entity_id: activityLog.action.target.entity_id,
      entity_name: activityLog.action.target.entity_name
    } : null,
    error: activityLog.result?.success === false ? {
      type: 'OperationError',
      message: activityLog.result?.error?.message || 'Operation failed',
      severity: 'medium',
      category: 'runtime'
    } : null,
    context: {
      request_id: activityLog.meta?.request_id
    },
    meta: {
      resolved: activityLog.result?.success !== false
    },
    activity: {
      action_type: activityLog.action?.type,
      category: activityLog.action?.category,
      success: activityLog.result?.success,
      affected_count: activityLog.result?.affected_count,
      duration_ms: activityLog.result?.duration_ms
    }
  };

  // info 레벨 활동 로그는 배치로 전송
  console.log(`[SSE-Broadcast] Activity 로그 큐에 추가: ${message}`);
  queueLogForBroadcast(transformedLog);
}

/**
 * SSE 클라이언트 추가
 */
function addClient(res) {
  sseClients.add(res);
  console.log(`[SSE-Broadcast] 클라이언트 연결 (총 ${sseClients.size}명)`);
}

/**
 * SSE 클라이언트 제거
 */
function removeClient(res) {
  sseClients.delete(res);
  console.log(`[SSE-Broadcast] 클라이언트 연결 해제 (총 ${sseClients.size}명)`);
}

/**
 * SSE 클라이언트 수 조회
 */
function getClientCount() {
  return sseClients.size;
}

/**
 * 모든 클라이언트에게 이벤트 전송
 */
function broadcast(event, data) {
  sseClients.forEach(res => sendSSE(res, event, data));
}

module.exports = {
  addClient,
  removeClient,
  getClientCount,
  broadcast,
  sendSSE,
  broadcastNewLog,
  broadcastActivityLog,
  sseClients
};
