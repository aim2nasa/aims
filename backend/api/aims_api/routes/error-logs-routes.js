/**
 * Error Logs API Routes
 * 에러 로그 수집 및 조회 API (SSE 실시간 스트림 지원)
 * @since 2025-12-22
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const errorLogger = require('../lib/errorLogger');

// ==================== SSE 클라이언트 관리 ====================

// 관리자 SSE 클라이언트 Set
const errorLogSSEClients = new Set();

/**
 * SSE 이벤트 전송 헬퍼
 */
function sendSSE(res, event, data) {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (e) {
    console.error('[ErrorLogs-SSE] 전송 실패:', e.message);
  }
}

/**
 * 모든 관리자에게 새 에러 로그 브로드캐스트
 */
function broadcastNewErrorLog(errorLog) {
  console.log(`[ErrorLogs-SSE] 새 에러 브로드캐스트 - 연결된 클라이언트: ${errorLogSSEClients.size}`);
  errorLogSSEClients.forEach(res => sendSSE(res, 'new-error', errorLog));
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
    errorLogSSEClients.add(res);
    console.log(`[ErrorLogs-SSE] 클라이언트 연결됨 (총 ${errorLogSSEClients.size}개)`);

    // 연결 확인 이벤트
    sendSSE(res, 'connected', { message: 'Error logs stream connected' });

    // 초기 통계 전송
    try {
      const stats = await errorLogger.getStats(7);
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
      errorLogSSEClients.delete(res);
      console.log(`[ErrorLogs-SSE] 클라이언트 연결 해제 (남은 ${errorLogSSEClients.size}개)`);
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
      const logId = await errorLogger.log(errorLogData);

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

  // ==================== Admin 조회 API ====================

  /**
   * GET /api/admin/error-logs
   * 에러 로그 목록 조회 (관리자 전용)
   *
   * Query:
   * - page: number (기본값: 1)
   * - limit: number (기본값: 50)
   * - userId: string (사용자 ID 필터)
   * - type: 'frontend' | 'backend' | 'all'
   * - severity: 'low' | 'medium' | 'high' | 'critical' | 'all'
   * - category: 'api' | 'network' | 'timeout' | 'validation' | 'runtime' | 'unhandled' | 'all'
   * - startDate: ISO date string
   * - endDate: ISO date string
   * - search: string (메시지/타입 검색)
   * - resolved: 'true' | 'false' | 'all'
   */
  router.get('/admin/error-logs', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const {
        page = 1,
        limit = 50,
        userId,
        type,
        severity,
        category,
        errorType,
        startDate,
        endDate,
        search,
        resolved
      } = req.query;

      const result = await errorLogger.getLogs({
        userId,
        type,
        severity,
        category,
        errorType,
        startDate,
        endDate,
        search,
        resolved,
        page: parseInt(page),
        limit: Math.min(100, parseInt(limit))
      });

      res.json({
        success: true,
        ...result
      });
    } catch (err) {
      console.error('[ErrorLogs] 조회 실패:', err.message);
      res.status(500).json({
        success: false,
        message: '에러 로그 조회에 실패했습니다'
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

      const stats = await errorLogger.getStats(days);

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

      const log = await errorLogger.getLog(id);

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

      const deleted = await errorLogger.deleteLog(id);

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
   */
  router.delete('/admin/error-logs', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { ids, filter } = req.body;

      let deletedCount = 0;

      if (ids && Array.isArray(ids) && ids.length > 0) {
        // ID 배열로 삭제
        deletedCount = await errorLogger.deleteLogs(ids);
      } else if (filter && Object.keys(filter).length > 0) {
        // 필터 조건으로 삭제
        deletedCount = await errorLogger.deleteByFilter(filter);
      } else {
        return res.status(400).json({
          success: false,
          message: 'ids 또는 filter 중 하나가 필요합니다'
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

      const resolved = await errorLogger.markResolved(id, adminId, notes);

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

  return router;
};
