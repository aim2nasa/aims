/**
 * System Logs API Routes
 * 시스템 로그 수집 및 조회 API (SSE 실시간 스트림 지원)
 * @since 2025-12-22
 * @updated 2025-12-22 - 전체 로그 레벨 지원 (debug/info/warn/error)
 * @updated 2025-12-22 - activity_logs 통합 (시스템 동작 파악용)
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const systemLogger = require('../lib/errorLogger');
const activityLogger = require('../lib/activityLogger');
const sseBroadcast = require('../lib/sseBroadcast');

// ==================== SSE 클라이언트 관리 ====================
// 공유 SSE 모듈 사용
const { sendSSE, broadcastNewLog, addClient, removeClient } = sseBroadcast;

// ==================== 자동 정리 변수 ====================
let lastCleanupTime = 0;
const CLEANUP_INTERVAL = 60 * 1000; // 1분마다 정리 체크 (분 단위 retention 지원)

/**
 * 보존 기간 초과 로그 자동 정리 (백그라운드)
 * 5분 간격으로 실행, 설정된 보존 기간보다 오래된 로그 삭제
 */
async function autoCleanupLogs(db) {
  const now = Date.now();
  if (now - lastCleanupTime < CLEANUP_INTERVAL) {
    return; // 아직 정리 시간이 아님
  }
  lastCleanupTime = now;

  try {
    const settingsCollection = db.collection('settings');
    const setting = await settingsCollection.findOne({ key: 'log_retention' });

    if (!setting?.value?.enabled) {
      return; // 자동 정리 비활성화
    }

    const hours = setting.value.hours || 168;
    const cutoffDate = new Date(now - hours * 60 * 60 * 1000);

    // 백그라운드로 삭제 (await 없이)
    Promise.all([
      systemLogger.deleteByFilter({ endDate: cutoffDate.toISOString() }),
      activityLogger.deleteOlderThan ? activityLogger.deleteOlderThan(cutoffDate) : Promise.resolve(0)
    ]).then(([errorDeleted, activityDeleted]) => {
      if (errorDeleted > 0 || activityDeleted > 0) {
        console.log(`[ErrorLogs] 자동 정리: error_logs=${errorDeleted}, activity_logs=${activityDeleted} 삭제`);
      }
    }).catch(err => {
      console.warn('[ErrorLogs] 자동 정리 실패:', err.message);
    });
  } catch (err) {
    console.warn('[ErrorLogs] 자동 정리 설정 조회 실패:', err.message);
  }
}

// 기존 함수 별칭 (하위 호환성)
function broadcastNewErrorLog(errorLog) {
  broadcastNewLog({ ...errorLog, level: 'error' });
}

// ==================== Activity Log 변환 ====================

/**
 * activity_log를 system_log 형식으로 변환
 * @param {Object} actLog - activity_log 문서
 * @returns {Object} - system_log 형식
 */
function transformActivityLog(actLog) {
  // 액션 타입을 레벨로 매핑
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

  const level = actLog.result?.success === false ? 'error' : (levelMap[actLog.action?.type] || 'info');

  // 메시지 생성
  const actionDesc = actLog.action?.description || `${actLog.action?.category} ${actLog.action?.type}`;
  const targetName = actLog.action?.target?.entity_name;
  const message = targetName ? `${actionDesc}: ${targetName}` : actionDesc;

  return {
    _id: actLog._id,
    logType: 'activity',  // 로그 타입 구분
    level,
    actor: actLog.actor || {},
    timestamp: actLog.timestamp,
    source: {
      type: 'backend',
      component: actLog.action?.category || 'system',
      endpoint: actLog.location?.endpoint,
      method: actLog.location?.method
    },
    message,
    data: actLog.action?.target ? {
      entity_type: actLog.action.target.entity_type,
      entity_id: actLog.action.target.entity_id,
      entity_name: actLog.action.target.entity_name
    } : null,
    error: actLog.result?.success === false ? {
      type: 'OperationError',
      message: actLog.result?.error?.message || 'Operation failed',
      severity: 'medium',
      category: 'runtime'
    } : null,
    context: {
      request_id: actLog.meta?.request_id,
      session_id: actLog.meta?.session_id
    },
    meta: {
      resolved: actLog.result?.success !== false
    },
    // 원본 activity 정보 (상세 조회용)
    activity: {
      action_type: actLog.action?.type,
      category: actLog.action?.category,
      success: actLog.result?.success,
      affected_count: actLog.result?.affected_count,
      duration_ms: actLog.result?.duration_ms
    }
  };
}

/**
 * 라우트 설정 함수
 * @param {Db} db - MongoDB docupload 인스턴스
 * @param {Function} authenticateJWT - JWT 인증 미들웨어
 * @param {Function} requireRole - 역할 검증 미들웨어
 */
module.exports = function(db, authenticateJWT, requireRole) {

  /**
   * 선택적 JWT 인증 미들웨어
   * 인증 실패해도 요청을 계속 진행 (익명 사용자 에러도 수집)
   */
  const optionalAuthJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      req.user = null;
      return next();
    }

    // JWT 검증 시도
    authenticateJWT(req, res, (err) => {
      if (err) {
        req.user = null;
      }
      next();
    });
  };

  // ==================== SSE 스트림 엔드포인트 ====================

  /**
   * GET /api/admin/error-logs/stream
   * 에러 로그 실시간 스트림 (관리자 전용)
   * SSE로 새 에러 로그를 실시간으로 수신
   */
  router.get('/admin/error-logs/stream', async (req, res) => {
    // 쿼리 파라미터에서 토큰 추출 (EventSource는 헤더 설정 불가)
    const token = req.query.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: '인증 토큰이 필요합니다'
      });
    }

    // JWT 검증
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      if (decoded.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: '관리자 권한이 필요합니다'
        });
      }
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: '유효하지 않은 토큰입니다'
      });
    }

    // SSE 헤더 설정
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // nginx 버퍼링 비활성화
    res.flushHeaders();

    // 클라이언트 등록
    addClient(res);

    // 연결 확인 이벤트
    sendSSE(res, 'connected', { message: 'System logs stream connected' });

    // 초기 통계 전송 (activity 통계 포함)
    try {
      const stats = await systemLogger.getStats(7);

      // 활동 로그 통계 추가 (API stats와 동일한 로직)
      try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);

        const activityResult = await activityLogger.getLogs({
          startDate: startDate.toISOString(),
          page: 1,
          limit: 1  // 총 개수만 필요
        });

        // 활동 로그 개수를 통계에 추가
        stats.activity = {
          total: activityResult.pagination?.total || 0
        };

        // byLevel에 activity 추가
        stats.byLevel = stats.byLevel || {};
        stats.byLevel.activity = activityResult.pagination?.total || 0;

        // total에 activity 추가
        stats.total = (stats.total || 0) + (activityResult.pagination?.total || 0);

        // bySource에 activity 추가
        stats.bySource = stats.bySource || {};
        stats.bySource.activity = activityResult.pagination?.total || 0;
      } catch (actErr) {
        console.warn('[ErrorLogs-SSE] activity 통계 조회 실패:', actErr.message);
        stats.activity = { total: 0 };
      }

      sendSSE(res, 'init', { stats });
    } catch (err) {
      console.error('[ErrorLogs-SSE] 초기 통계 전송 실패:', err.message);
    }

    // Keep-alive ping (30초마다)
    const pingInterval = setInterval(() => {
      sendSSE(res, 'ping', { time: new Date().toISOString() });
    }, 30000);

    // 연결 종료 처리
    req.on('close', () => {
      clearInterval(pingInterval);
      removeClient(res);
    });
  });

  // ==================== 에러 수집 API ====================

  /**
   * POST /api/error-logs
   * 프론트엔드 에러 수집
   * 인증 선택적 - 로그인하지 않은 사용자의 에러도 수집
   */
  router.post('/error-logs', optionalAuthJWT, async (req, res) => {
    try {
      const { error, source, context } = req.body;

      // 필수 필드 검증
      if (!error || !error.message) {
        return res.status(400).json({
          success: false,
          message: 'error.message는 필수입니다'
        });
      }

      if (!source || !source.type) {
        return res.status(400).json({
          success: false,
          message: 'source.type은 필수입니다'
        });
      }

      // 에러 로그 데이터 구성
      const errorLogData = {
        actor: {
          user_id: req.user?.id || null,
          name: req.user?.name || null,
          role: req.user?.role || 'anonymous',
          ip_address: req.ip,
          user_agent: req.headers['user-agent']
        },
        source: {
          type: source.type,
          endpoint: source.endpoint || null,
          method: source.method || null,
          component: source.component || null,
          url: source.url || null,
          file: source.file || null,
          line: source.line || null,
          column: source.column || null
        },
        error: {
          type: error.type || 'Error',
          code: error.code || null,
          message: error.message,
          stack: error.stack || null,
          severity: error.severity || 'medium',
          category: error.category || 'unhandled'
        },
        context: {
          request_id: context?.request_id || context?.requestId || null,
          session_id: context?.session_id || context?.sessionId || null,
          browser: context?.browser || null,
          os: context?.os || null,
          version: context?.version || null,
          payload: context?.payload || null,
          response_status: context?.response_status || context?.responseStatus || null,
          component_stack: context?.componentStack || context?.component_stack || null
        },
        meta: {
          resolved: false
        }
      };

      // 에러 로그 저장
      const logId = await systemLogger.log(errorLogData);

      // SSE로 관리자에게 실시간 브로드캐스트
      broadcastNewErrorLog({
        _id: logId,
        ...errorLogData,
        timestamp: new Date().toISOString()
      });

      res.json({
        success: true,
        logId
      });
    } catch (err) {
      console.error('[ErrorLogs] 에러 수집 실패:', err.message);
      res.status(500).json({
        success: false,
        message: '에러 로그 저장에 실패했습니다'
      });
    }
  });

  // ==================== 시스템 로그 수집 API ====================

  /**
   * POST /api/system-logs
   * 프론트엔드 일반 로그 수집 (모든 레벨)
   * 인증 선택적 - 로그인하지 않은 사용자의 로그도 수집
   */
  router.post('/system-logs', optionalAuthJWT, async (req, res) => {
    try {
      const { level, source, message, data, context } = req.body;

      // 필수 필드 검증
      if (!level || !['debug', 'info', 'warn', 'error'].includes(level)) {
        return res.status(400).json({
          success: false,
          message: 'level은 debug, info, warn, error 중 하나여야 합니다'
        });
      }

      if (!source || !source.type) {
        return res.status(400).json({
          success: false,
          message: 'source.type은 필수입니다'
        });
      }

      if (!message) {
        return res.status(400).json({
          success: false,
          message: 'message는 필수입니다'
        });
      }

      // 로그 저장 (샘플링 적용됨)
      const logId = await systemLogger.logWithLevel(level, {
        actor: {
          user_id: req.user?.id || null,
          name: req.user?.name || null,
          role: req.user?.role || 'anonymous',
          ip_address: req.ip,
          user_agent: req.headers['user-agent']
        },
        source: {
          type: source.type,
          component: source.component || null,
          url: source.url || null,
          file: source.file || null,
          line: source.line || null
        },
        message,
        data: data || null,
        context: {
          request_id: context?.request_id || context?.requestId || null,
          session_id: context?.session_id || context?.sessionId || null,
          browser: context?.browser || null,
          os: context?.os || null,
          version: context?.version || null
        }
      });

      // 샘플링으로 저장되지 않은 경우 logId는 null
      if (logId) {
        // SSE 브로드캐스트
        broadcastNewLog({
          _id: logId,
          level,
          source,
          message,
          timestamp: new Date().toISOString()
        });
      }

      res.json({
        success: true,
        logId,
        sampled: !!logId
      });
    } catch (err) {
      console.error('[SystemLogs] 로그 수집 실패:', err.message);
      res.status(500).json({
        success: false,
        message: '로그 저장에 실패했습니다'
      });
    }
  });

  /**
   * POST /api/system-logs/batch
   * 프론트엔드 로그 배치 수집
   * 인증 선택적
   */
  router.post('/system-logs/batch', optionalAuthJWT, async (req, res) => {
    try {
      const { logs } = req.body;

      if (!Array.isArray(logs) || logs.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'logs 배열이 필요합니다'
        });
      }

      // 최대 50개로 제한
      const logsToProcess = logs.slice(0, 50);
      const results = [];

      for (const log of logsToProcess) {
        const { level, source, message, data, context } = log;

        // 유효성 검사
        if (!level || !['debug', 'info', 'warn', 'error'].includes(level)) continue;
        if (!source || !source.type) continue;
        if (!message) continue;

        const logId = await systemLogger.logWithLevel(level, {
          actor: {
            user_id: req.user?.id || null,
            name: req.user?.name || null,
            role: req.user?.role || 'anonymous',
            ip_address: req.ip,
            user_agent: req.headers['user-agent']
          },
          source: {
            type: source.type,
            component: source.component || null,
            url: source.url || null,
            file: source.file || null,
            line: source.line || null
          },
          message,
          data: data || null,
          context: {
            request_id: context?.request_id || context?.requestId || null,
            session_id: context?.session_id || context?.sessionId || null,
            browser: context?.browser || null,
            os: context?.os || null,
            version: context?.version || null
          }
        });

        if (logId) {
          results.push({ logId, level, sampled: true });
          broadcastNewLog({
            _id: logId,
            level,
            source,
            message,
            timestamp: new Date().toISOString()
          });
        }
      }

      res.json({
        success: true,
        processed: logsToProcess.length,
        saved: results.length
      });
    } catch (err) {
      console.error('[SystemLogs] 배치 로그 수집 실패:', err.message);
      res.status(500).json({
        success: false,
        message: '로그 저장에 실패했습니다'
      });
    }
  });

  // ==================== Admin 조회 API ====================

  /**
   * GET /api/admin/error-logs
   * 시스템 로그 목록 조회 (관리자 전용)
   *
   * Query:
   * - page: number (기본값: 1)
   * - limit: number (기본값: 50)
   * - userId: string (사용자 ID 필터)
   * - level: 'debug' | 'info' | 'warn' | 'error' 또는 콤마로 구분된 복수 레벨 (예: 'warn,error')
   * - type: 'frontend' | 'backend' | 'all'
   * - severity: 'low' | 'medium' | 'high' | 'critical' | 'all'
   * - category: 'api' | 'network' | 'timeout' | 'validation' | 'runtime' | 'unhandled' | 'all'
   * - startDate: ISO date string
   * - endDate: ISO date string
   * - search: string (메시지/타입 검색)
   * - resolved: 'true' | 'false' | 'all'
   * - sortBy: 'timestamp' | 'source' | 'severity' | 'type' | 'message' | 'user' | 'level'
   * - sortOrder: 'asc' | 'desc'
   * - logType: 'system' | 'activity' | 'all' (기본값: 'all')
   */
  router.get('/admin/error-logs', authenticateJWT, requireRole('admin'), async (req, res) => {
    // 백그라운드로 오래된 로그 자동 정리 (5분마다)
    autoCleanupLogs(db);

    try {
      const {
        page = 1,
        limit = 50,
        userId,
        level,
        type,
        severity,
        category,
        errorType,
        startDate,
        endDate,
        search,
        resolved,
        sortBy = 'timestamp',
        sortOrder = 'desc',
        logType = 'all'  // 'system' | 'activity' | 'all'
      } = req.query;

      const pageNum = parseInt(page);
      const limitNum = Math.min(100, parseInt(limit));
      const sortDir = sortOrder === 'asc' ? 1 : -1;

      let allLogs = [];
      let systemTotal = 0;
      let activityTotal = 0;

      // 시스템 로그 조회 (error_logs)
      if (logType === 'all' || logType === 'system') {
        const systemResult = await systemLogger.getLogs({
          userId,
          level,
          type,
          severity,
          category,
          errorType,
          startDate,
          endDate,
          search,
          resolved,
          sortBy,
          sortOrder,
          page: 1,
          limit: 500  // 병합용으로 더 많이 가져옴
        });

        // logType 표시 추가
        const systemLogs = (systemResult.logs || []).map(log => ({
          ...log,
          logType: 'system'
        }));

        allLogs = allLogs.concat(systemLogs);
        systemTotal = systemResult.pagination?.total || 0;
      }

      // 활동 로그 조회 (activity_logs)
      if (logType === 'all' || logType === 'activity') {
        // activity_logs 필터 구성
        const activityQuery = {};

        if (userId) {
          activityQuery['actor.user_id'] = userId;
        }
        if (startDate || endDate) {
          activityQuery.timestamp = {};
          if (startDate) activityQuery.timestamp.$gte = new Date(startDate);
          if (endDate) activityQuery.timestamp.$lte = new Date(endDate);
        }
        if (search) {
          activityQuery.$or = [
            { 'action.description': { $regex: search, $options: 'i' } },
            { 'action.target.entity_name': { $regex: search, $options: 'i' } },
            { 'action.category': { $regex: search, $options: 'i' } }
          ];
        }
        // type이 backend이면 activity 포함, frontend면 activity 제외
        if (type === 'frontend') {
          // activity는 모두 backend이므로 스킵
          activityTotal = 0;
        } else {
          try {
            const activityResult = await activityLogger.getLogs({
              userId,
              startDate,
              endDate,
              page: 1,
              limit: 500
            });

            // 변환하여 추가
            const activityLogs = (activityResult.logs || [])
              .map(transformActivityLog)
              .filter(log => {
                // level 필터 적용
                if (level && level !== 'all') {
                  const levels = level.split(',').map(l => l.trim());
                  if (!levels.includes(log.level)) return false;
                }
                // search 필터 적용
                if (search) {
                  const searchLower = search.toLowerCase();
                  const messageMatch = log.message?.toLowerCase().includes(searchLower);
                  const componentMatch = log.source?.component?.toLowerCase().includes(searchLower);
                  if (!messageMatch && !componentMatch) return false;
                }
                return true;
              });

            allLogs = allLogs.concat(activityLogs);
            activityTotal = activityResult.pagination?.total || 0;
          } catch (actErr) {
            console.warn('[ErrorLogs] activity_logs 조회 실패:', actErr.message);
          }
        }
      }

      // 시간순 정렬
      allLogs.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return sortDir * (timeB - timeA);
      });

      // 페이지네이션 적용
      const totalCount = allLogs.length;
      const startIdx = (pageNum - 1) * limitNum;
      const paginatedLogs = allLogs.slice(startIdx, startIdx + limitNum);

      // 🔧 사용자 이름 조회 (user_id → name 매핑)
      const userIds = [...new Set(paginatedLogs
        .map(log => log.actor?.user_id)
        .filter(id => id && typeof id === 'string')
      )];

      if (userIds.length > 0) {
        try {
          const { ObjectId } = require('mongodb');
          const usersCollection = db.collection('users');
          const validObjectIds = userIds.filter(id => {
            try { new ObjectId(id); return true; } catch { return false; }
          });

          if (validObjectIds.length > 0) {
            const users = await usersCollection.find(
              { _id: { $in: validObjectIds.map(id => new ObjectId(id)) } },
              { projection: { _id: 1, name: 1 } }
            ).toArray();

            const userMap = new Map(users.map(u => [u._id.toString(), u.name]));

            // 로그에 사용자 이름 주입
            paginatedLogs.forEach(log => {
              if (log.actor?.user_id && userMap.has(log.actor.user_id)) {
                log.actor.name = userMap.get(log.actor.user_id);
              }
            });
          }
        } catch (userErr) {
          console.warn('[ErrorLogs] 사용자 이름 조회 실패:', userErr.message);
        }
      }

      res.json({
        success: true,
        logs: paginatedLogs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: systemTotal + activityTotal,
          totalPages: Math.ceil((systemTotal + activityTotal) / limitNum)
        },
        counts: {
          system: systemTotal,
          activity: activityTotal
        }
      });
    } catch (err) {
      console.error('[ErrorLogs] 조회 실패:', err.message);
      res.status(500).json({
        success: false,
        message: '에러 로그 조회에 실패했습니다'
      });
    }
  });

  // ==================== Retention 설정 API ====================

  /**
   * GET /api/admin/error-logs/retention
   * 로그 보존 기간 설정 조회 (관리자 전용)
   */
  router.get('/admin/error-logs/retention', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const settingsCollection = db.collection('settings');
      const setting = await settingsCollection.findOne({ key: 'log_retention' });

      // 기본값: 7일 (168시간)
      const defaultRetention = { hours: 168, enabled: true };

      res.json({
        success: true,
        retention: setting?.value || defaultRetention
      });
    } catch (err) {
      console.error('[ErrorLogs] Retention 조회 실패:', err.message);
      res.status(500).json({
        success: false,
        message: '보존 기간 설정 조회에 실패했습니다'
      });
    }
  });

  /**
   * PUT /api/admin/error-logs/retention
   * 로그 보존 기간 설정 (관리자 전용)
   *
   * Body:
   * - hours: number (보존 기간, 시간 단위, 최소 1분=0.0167시간, 최대 2160시간=90일)
   * - enabled: boolean (자동 삭제 활성화 여부)
   */
  router.put('/admin/error-logs/retention', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { hours, enabled = true } = req.body;

      // 유효성 검사: 최소 1분(1/60시간), 최대 90일(2160시간)
      // parseFloat로 소수점 지원 (1분=0.0167, 5분=0.083, 15분=0.25, 30분=0.5)
      const validHours = Math.max(1/60, Math.min(2160, parseFloat(hours) || 168));

      const settingsCollection = db.collection('settings');
      await settingsCollection.updateOne(
        { key: 'log_retention' },
        {
          $set: {
            key: 'log_retention',
            value: { hours: validHours, enabled: !!enabled },
            updatedAt: new Date(),
            updatedBy: req.user.id
          }
        },
        { upsert: true }
      );

      // 설정 변경 시 즉시 오래된 로그 삭제
      if (enabled) {
        const cutoffDate = new Date(Date.now() - validHours * 60 * 60 * 1000);
        const [errorDeleted, activityDeleted] = await Promise.all([
          systemLogger.deleteByFilter({ endDate: cutoffDate.toISOString() }),
          activityLogger.deleteOlderThan ? activityLogger.deleteOlderThan(cutoffDate) : Promise.resolve(0)
        ]);
        console.log(`[ErrorLogs] Retention 적용: error_logs=${errorDeleted}, activity_logs=${activityDeleted} 삭제 (기준: ${validHours}시간)`);
      }

      // 시간/분 포맷팅
      const formatDuration = (h) => {
        if (h < 1) return `${Math.round(h * 60)}분`;
        if (h < 24) return `${h}시간`;
        return `${Math.round(h / 24)}일`;
      };

      res.json({
        success: true,
        retention: { hours: validHours, enabled: !!enabled },
        message: `보존 기간이 ${formatDuration(validHours)}으로 설정되었습니다`
      });
    } catch (err) {
      console.error('[ErrorLogs] Retention 설정 실패:', err.message);
      res.status(500).json({
        success: false,
        message: '보존 기간 설정에 실패했습니다'
      });
    }
  });

  /**
   * POST /api/admin/error-logs/cleanup
   * 보존 기간 초과 로그 수동 정리 (관리자 전용)
   */
  router.post('/admin/error-logs/cleanup', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const settingsCollection = db.collection('settings');
      const setting = await settingsCollection.findOne({ key: 'log_retention' });
      const hours = setting?.value?.hours || 168; // 기본 7일

      const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);

      const [errorDeleted, activityDeleted] = await Promise.all([
        systemLogger.deleteByFilter({ endDate: cutoffDate.toISOString() }),
        activityLogger.deleteOlderThan ? activityLogger.deleteOlderThan(cutoffDate) : Promise.resolve(0)
      ]);

      res.json({
        success: true,
        deleted: {
          errorLogs: errorDeleted,
          activityLogs: activityDeleted,
          total: errorDeleted + activityDeleted
        },
        cutoffDate: cutoffDate.toISOString(),
        message: `${errorDeleted + activityDeleted}개 로그가 정리되었습니다`
      });
    } catch (err) {
      console.error('[ErrorLogs] Cleanup 실패:', err.message);
      res.status(500).json({
        success: false,
        message: '로그 정리에 실패했습니다'
      });
    }
  });

  /**
   * GET /api/admin/error-logs/stats
   * 에러 통계 조회 (관리자 전용)
   *
   * Query:
   * - days: number (기본값: 7)
   */
  router.get('/admin/error-logs/stats', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 7));

      // 시스템 로그 통계
      const stats = await systemLogger.getStats(days);

      // 활동 로그 통계 추가
      try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const activityResult = await activityLogger.getLogs({
          startDate: startDate.toISOString(),
          page: 1,
          limit: 1  // 총 개수만 필요
        });

        // 활동 로그 개수를 통계에 추가
        stats.activity = {
          total: activityResult.pagination?.total || 0
        };

        // byLevel에 activity를 info로 추가
        stats.byLevel = stats.byLevel || {};
        stats.byLevel.activity = activityResult.pagination?.total || 0;

        // total에 activity 추가
        stats.total = (stats.total || 0) + (activityResult.pagination?.total || 0);

        // bySource에 backend activity 추가
        stats.bySource = stats.bySource || {};
        stats.bySource.activity = activityResult.pagination?.total || 0;
      } catch (actErr) {
        console.warn('[ErrorLogs] activity 통계 조회 실패:', actErr.message);
        stats.activity = { total: 0 };
      }

      res.json({
        success: true,
        stats
      });
    } catch (err) {
      console.error('[ErrorLogs] 통계 조회 실패:', err.message);
      res.status(500).json({
        success: false,
        message: '에러 통계 조회에 실패했습니다'
      });
    }
  });

  /**
   * GET /api/admin/error-logs/:id
   * 개별 에러 로그 상세 조회 (관리자 전용)
   */
  router.get('/admin/error-logs/:id', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;

      const log = await systemLogger.getLog(id);

      if (!log) {
        return res.status(404).json({
          success: false,
          message: '에러 로그를 찾을 수 없습니다'
        });
      }

      res.json({
        success: true,
        log
      });
    } catch (err) {
      console.error('[ErrorLogs] 상세 조회 실패:', err.message);
      res.status(500).json({
        success: false,
        message: '에러 로그 조회에 실패했습니다'
      });
    }
  });

  // ==================== Admin 삭제 API ====================

  /**
   * DELETE /api/admin/error-logs/:id
   * 개별 에러 로그 삭제 (관리자 전용)
   */
  router.delete('/admin/error-logs/:id', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;

      const deleted = await systemLogger.deleteLog(id);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: '에러 로그를 찾을 수 없습니다'
        });
      }

      res.json({
        success: true,
        message: '에러 로그가 삭제되었습니다'
      });
    } catch (err) {
      console.error('[ErrorLogs] 삭제 실패:', err.message);
      res.status(500).json({
        success: false,
        message: '에러 로그 삭제에 실패했습니다'
      });
    }
  });

  /**
   * DELETE /api/admin/error-logs
   * 에러 로그 일괄 삭제 (관리자 전용)
   *
   * Body:
   * - ids: string[] (삭제할 에러 로그 ID 배열)
   * - filter: { type?, severity?, startDate?, endDate? } (조건부 삭제)
   * - deleteAll: boolean (전체 삭제, confirmText와 함께 사용)
   * - confirmText: string (전체 삭제 시 "DELETE ALL" 입력 필수)
   */
  router.delete('/admin/error-logs', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { ids, filter, deleteAll, confirmText } = req.body;

      let deletedCount = 0;
      let activityDeletedCount = 0;

      if (deleteAll === true) {
        // 전체 삭제 - 안전을 위해 confirmText 검증
        if (confirmText !== 'DELETE ALL') {
          return res.status(400).json({
            success: false,
            message: '전체 삭제를 확인하려면 confirmText에 "DELETE ALL"을 입력하세요'
          });
        }

        // error_logs 전체 삭제
        deletedCount = await systemLogger.deleteAll();

        // activity_logs도 전체 삭제
        try {
          activityDeletedCount = await activityLogger.deleteAll();
        } catch (actErr) {
          console.warn('[ErrorLogs] activity_logs 전체 삭제 실패:', actErr.message);
        }

        console.log(`[ErrorLogs] 전체 삭제 완료: error_logs=${deletedCount}, activity_logs=${activityDeletedCount}`);

        return res.json({
          success: true,
          deletedCount: deletedCount + activityDeletedCount,
          details: {
            errorLogs: deletedCount,
            activityLogs: activityDeletedCount
          },
          message: `전체 로그가 삭제되었습니다 (시스템: ${deletedCount}개, 활동: ${activityDeletedCount}개)`
        });
      } else if (ids && Array.isArray(ids) && ids.length > 0) {
        // ID 배열로 삭제
        deletedCount = await systemLogger.deleteLogs(ids);
      } else if (filter && Object.keys(filter).length > 0) {
        // 필터 조건으로 삭제
        deletedCount = await systemLogger.deleteByFilter(filter);
      } else {
        return res.status(400).json({
          success: false,
          message: 'ids, filter, 또는 deleteAll 중 하나가 필요합니다'
        });
      }

      res.json({
        success: true,
        deletedCount,
        message: `${deletedCount}개의 에러 로그가 삭제되었습니다`
      });
    } catch (err) {
      console.error('[ErrorLogs] 일괄 삭제 실패:', err.message);
      res.status(500).json({
        success: false,
        message: '에러 로그 삭제에 실패했습니다'
      });
    }
  });

  // ==================== Admin 해결 표시 API ====================

  /**
   * PATCH /api/admin/error-logs/:id/resolve
   * 에러 해결 표시 (관리자 전용)
   *
   * Body:
   * - notes: string (해결 메모, 선택)
   */
  router.patch('/admin/error-logs/:id/resolve', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const adminId = req.user.id;

      const resolved = await systemLogger.markResolved(id, adminId, notes);

      if (!resolved) {
        return res.status(404).json({
          success: false,
          message: '에러 로그를 찾을 수 없습니다'
        });
      }

      res.json({
        success: true,
        message: '에러가 해결됨으로 표시되었습니다'
      });
    } catch (err) {
      console.error('[ErrorLogs] 해결 표시 실패:', err.message);
      res.status(500).json({
        success: false,
        message: '해결 표시에 실패했습니다'
      });
    }
  });

  // ==================== 자동 정리 스케줄러 ====================
  // 1분마다 보존 기간 초과 로그 자동 삭제 (API 호출 없이도 동작)
  const cleanupScheduler = setInterval(async () => {
    try {
      const settingsCollection = db.collection('settings');
      const setting = await settingsCollection.findOne({ key: 'log_retention' });

      if (!setting?.value?.enabled) {
        return; // 자동 정리 비활성화
      }

      const hours = setting.value.hours || 168;
      const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);

      const [errorDeleted, activityDeleted] = await Promise.all([
        systemLogger.deleteByFilter({ endDate: cutoffDate.toISOString() }),
        activityLogger.deleteOlderThan ? activityLogger.deleteOlderThan(cutoffDate) : Promise.resolve(0)
      ]);

      if (errorDeleted > 0 || activityDeleted > 0) {
        console.log(`[ErrorLogs] 스케줄러 정리: error_logs=${errorDeleted}, activity_logs=${activityDeleted} 삭제 (보존: ${hours < 1 ? Math.round(hours * 60) + '분' : hours + '시간'})`);
        // SSE로 클라이언트에 삭제 알림 브로드캐스트
        sseBroadcast.broadcast('logs-cleanup', {
          cutoffTime: cutoffDate.toISOString(),
          deletedCount: errorDeleted + activityDeleted
        });
      }
    } catch (err) {
      // 조용히 실패 (로그 스팸 방지)
    }
  }, CLEANUP_INTERVAL);

  // 프로세스 종료 시 스케줄러 정리
  process.on('SIGTERM', () => clearInterval(cleanupScheduler));
  process.on('SIGINT', () => clearInterval(cleanupScheduler));

  console.log('[ErrorLogs] 자동 정리 스케줄러 시작 (1분 간격)');

  return router;
};
