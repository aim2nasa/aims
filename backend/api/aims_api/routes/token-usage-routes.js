/**
 * Token Usage API Routes
 * AI 토큰 사용량 조회 및 로깅 API
 * @since 1.0.0
 */

const express = require('express');
const router = express.Router();
const backendLogger = require('../lib/backendLogger');
const {
  logTokenUsage,
  getUserTokenUsage,
  getDailyUsage,
  getDailyUsageByRange,
  getSystemOverview,
  getTopUsers,
  getTopUsersWithRange,
  getHourlyUsageBySource,
  formatCost,
  formatTokens,
  ensureIndexes
} = require('../lib/tokenUsageService');

// 내부 API 키 (환경변수 또는 기본값)
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'aims-internal-token-logging-key-2024';

/**
 * 내부 API 키 검증 미들웨어
 */
function verifyInternalApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.headers['x-internal-api-key'];

  if (!apiKey || apiKey !== INTERNAL_API_KEY) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or missing API key'
    });
  }

  next();
}

/**
 * 라우트 설정 함수
 * @param {Db} db - MongoDB docupload 인스턴스
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 * @param {Function} authenticateJWT - JWT 인증 미들웨어
 * @param {Function} requireRole - 역할 검증 미들웨어
 */
module.exports = function(db, analyticsDb, authenticateJWT, requireRole) {

  console.log('[TokenUsageRoutes] 라우터 초기화 시작, router type:', typeof router, 'stack before:', router.stack?.length);

  // 디버그용 미들웨어 - 모든 요청 로깅
  router.use((req, res, next) => {
    console.log('[TokenUsageRoutes] 요청 수신:', req.method, req.path);
    next();
  });

  // 디버그용 테스트 엔드포인트 (인증 없음)
  router.get('/ai-usage/health', (req, res) => {
    console.log('[TokenUsageRoutes] health 엔드포인트 도달');
    res.json({ success: true, message: 'Token usage routes are active!' });
  });

  console.log('[TokenUsageRoutes] health route 추가 후, stack:', router.stack?.length);

  // 초기화 시 인덱스 생성
  ensureIndexes(analyticsDb).catch(err => {
    console.error('[TokenUsageRoutes] 인덱스 생성 실패:', err);
  });

  /**
   * POST /api/ai-usage/log
   * AI 토큰 사용량 로깅 (내부 서비스용)
   *
   * Body:
   * - user_id: string (필수)
   * - source: string (필수) - "rag_api" | "n8n_docsummary"
   * - model: string (필수)
   * - prompt_tokens: number
   * - completion_tokens: number
   * - total_tokens: number
   * - metadata: object (선택)
   */
  router.post('/ai-usage/log', verifyInternalApiKey, async (req, res) => {
    try {
      const {
        user_id,
        source,
        model,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        request_id,
        metadata
      } = req.body;

      // 필수 필드 검증
      if (!user_id) {
        return res.status(400).json({
          success: false,
          error: 'user_id is required'
        });
      }

      if (!source) {
        return res.status(400).json({
          success: false,
          error: 'source is required'
        });
      }

      if (!model) {
        return res.status(400).json({
          success: false,
          error: 'model is required'
        });
      }

      const result = await logTokenUsage(analyticsDb, {
        user_id,
        source,
        model,
        prompt_tokens: prompt_tokens || 0,
        completion_tokens: completion_tokens || 0,
        total_tokens,
        request_id,
        metadata
      });

      res.json(result);

    } catch (error) {
      console.error('[POST /api/ai-usage/log] 오류:', error);
      backendLogger.error('TokenUsage', 'AI 사용량 로깅 오류', error);
      res.status(500).json({
        success: false,
        error: 'Failed to log token usage',
        details: error.message
      });
    }
  });

  /**
   * GET /api/users/me/ai-usage
   * 내 AI 토큰 사용량 조회
   *
   * Query:
   * - days: number (기본값: 30)
   */
  router.get('/users/me/ai-usage', authenticateJWT, async (req, res) => {
    try {
      const userId = req.user.id;
      const days = parseInt(req.query.days) || 30;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: '사용자 ID가 필요합니다.'
        });
      }

      const usage = await getUserTokenUsage(analyticsDb, userId, days);

      res.json({
        success: true,
        data: {
          ...usage,
          formatted: {
            total_tokens: formatTokens(usage.total_tokens),
            estimated_cost: formatCost(usage.estimated_cost_usd)
          }
        }
      });

    } catch (error) {
      console.error('[GET /api/users/me/ai-usage] 오류:', error);
      backendLogger.error('TokenUsage', 'AI 사용량 조회 오류', error);
      res.status(500).json({
        success: false,
        error: 'AI 사용량 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * GET /api/users/me/ai-usage/daily
   * 내 일별 AI 토큰 사용량 조회 (그래프용)
   *
   * Query:
   * - days: number (기본값: 30)
   */
  router.get('/users/me/ai-usage/daily', authenticateJWT, async (req, res) => {
    try {
      const userId = req.user.id;
      const days = parseInt(req.query.days) || 30;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: '사용자 ID가 필요합니다.'
        });
      }

      const dailyUsage = await getDailyUsage(analyticsDb, userId, days);

      res.json({
        success: true,
        data: dailyUsage
      });

    } catch (error) {
      console.error('[GET /api/users/me/ai-usage/daily] 오류:', error);
      backendLogger.error('TokenUsage', '일별 AI 사용량 조회 오류', error);
      res.status(500).json({
        success: false,
        error: '일별 AI 사용량 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * GET /api/admin/ai-usage/overview
   * 시스템 전체 AI 토큰 사용량 통계 (관리자용)
   *
   * Query:
   * - days: number (기본값: 30) - start/end가 없을 때 사용
   * - start: string (YYYY-MM-DD) - 기간 시작일
   * - end: string (YYYY-MM-DD) - 기간 종료일
   */
  router.get('/admin/ai-usage/overview', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      // 기간 계산 (UTC 기준)
      let startDate, endDate;
      if (req.query.start && req.query.end) {
        // UTC 기준으로 날짜 설정 (타임존 문제 방지)
        startDate = new Date(req.query.start + 'T00:00:00.000Z');
        endDate = new Date(req.query.end + 'T23:59:59.999Z');
      } else {
        const days = parseInt(req.query.days) || 30;
        endDate = new Date();
        startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
      }

      const overview = await getSystemOverview(analyticsDb, startDate, endDate);

      res.json({
        success: true,
        data: {
          ...overview,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          formatted: {
            total_tokens: formatTokens(overview.total_tokens),
            estimated_cost: formatCost(overview.estimated_cost_usd)
          }
        }
      });

    } catch (error) {
      console.error('[GET /api/admin/ai-usage/overview] 오류:', error);
      backendLogger.error('TokenUsage', '시스템 AI 사용량 조회 오류', error);
      res.status(500).json({
        success: false,
        error: '시스템 AI 사용량 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * GET /api/admin/ai-usage/daily
   * 시스템 전체 일별 AI 토큰 사용량 (관리자용)
   *
   * Query:
   * - days: number (기본값: 30) - start/end가 없을 때 사용
   * - start: string (YYYY-MM-DD) - 기간 시작일
   * - end: string (YYYY-MM-DD) - 기간 종료일
   */
  router.get('/admin/ai-usage/daily', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      let dailyUsage;

      if (req.query.start && req.query.end) {
        // start/end 범위로 조회 (UTC 기준)
        const startDate = new Date(req.query.start + 'T00:00:00.000Z');
        const endDate = new Date(req.query.end + 'T23:59:59.999Z');

        dailyUsage = await getDailyUsageByRange(analyticsDb, startDate, endDate);
      } else {
        // 기존 days 파라미터로 조회
        const days = parseInt(req.query.days) || 30;
        dailyUsage = await getDailyUsage(analyticsDb, null, days);
      }

      res.json({
        success: true,
        data: dailyUsage
      });

    } catch (error) {
      console.error('[GET /api/admin/ai-usage/daily] 오류:', error);
      backendLogger.error('TokenUsage', '시스템 일별 AI 사용량 조회 오류', error);
      res.status(500).json({
        success: false,
        error: '시스템 일별 AI 사용량 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * GET /api/admin/ai-usage/top-users
   * Top 10 AI 사용자 목록 (관리자용)
   *
   * Query:
   * - days: number (기본값: 30) - start/end가 없을 때 사용
   * - start: string (YYYY-MM-DD) - 기간 시작일
   * - end: string (YYYY-MM-DD) - 기간 종료일
   */
  router.get('/admin/ai-usage/top-users', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      // 기간 계산 (UTC 기준)
      let startDate, endDate;
      if (req.query.start && req.query.end) {
        // UTC 기준으로 날짜 설정 (타임존 문제 방지)
        startDate = new Date(req.query.start + 'T00:00:00.000Z');
        endDate = new Date(req.query.end + 'T23:59:59.999Z');
      } else {
        const days = parseInt(req.query.days) || 30;
        endDate = new Date();
        startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
      }

      const topUsersList = await getTopUsersWithRange(analyticsDb, startDate, endDate, 10);

      // 사용자 이름 조회
      const { ObjectId } = require('mongodb');
      const userIds = topUsersList
        .map(u => {
          try {
            return ObjectId.isValid(u.user_id) ? new ObjectId(u.user_id) : null;
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      const usersCollection = db.collection('users');
      const users = await usersCollection.find(
        { _id: { $in: userIds } },
        { projection: { _id: 1, name: 1 } }
      ).toArray();

      // user_id → name 맵 생성
      const userNameMap = {};
      for (const user of users) {
        userNameMap[user._id.toString()] = user.name;
      }

      // 이름 추가
      const enrichedList = topUsersList.map(u => ({
        ...u,
        user_name: userNameMap[u.user_id] || u.user_id
      }));

      console.log('[top-users] userIds:', userIds.map(id => id.toString()));
      console.log('[top-users] users found:', users.length, users.map(u => ({ id: u._id.toString(), name: u.name })));
      console.log('[top-users] enrichedList:', enrichedList.map(u => ({ user_id: u.user_id, user_name: u.user_name })));

      res.json({
        success: true,
        data: enrichedList
      });

    } catch (error) {
      console.error('[GET /api/admin/ai-usage/top-users] 오류:', error);
      backendLogger.error('TokenUsage', 'Top 사용자 조회 오류', error);
      res.status(500).json({
        success: false,
        error: 'Top 사용자 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * GET /api/admin/ai-usage/hourly
   * 시간별 AI 토큰 사용량 (소스별 분리, 라인 차트용)
   *
   * Query:
   * - hours: number (기본값: 24, 최대: 168 = 7일)
   */
  router.get('/admin/ai-usage/hourly', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      let hours = parseInt(req.query.hours) || 24;
      hours = Math.min(hours, 168); // 최대 7일

      const hourlyData = await getHourlyUsageBySource(analyticsDb, hours);

      res.json({
        success: true,
        data: hourlyData
      });

    } catch (error) {
      console.error('[GET /api/admin/ai-usage/hourly] 오류:', error);
      backendLogger.error('TokenUsage', '시간별 AI 사용량 조회 오류', error);
      res.status(500).json({
        success: false,
        error: '시간별 AI 사용량 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * GET /api/admin/users/:id/ai-usage
   * 특정 사용자의 AI 토큰 사용량 조회 (관리자용)
   *
   * Params:
   * - id: 사용자 ID
   *
   * Query:
   * - days: number (기본값: 30)
   */
  router.get('/admin/users/:id/ai-usage', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const days = parseInt(req.query.days) || 30;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: '사용자 ID가 필요합니다.'
        });
      }

      const usage = await getUserTokenUsage(analyticsDb, id, days);

      res.json({
        success: true,
        data: {
          user_id: id,
          ...usage,
          formatted: {
            total_tokens: formatTokens(usage.total_tokens),
            estimated_cost: formatCost(usage.estimated_cost_usd)
          }
        }
      });

    } catch (error) {
      console.error('[GET /api/admin/users/:id/ai-usage] 오류:', error);
      backendLogger.error('TokenUsage', '사용자 AI 사용량 조회 오류', error);
      res.status(500).json({
        success: false,
        error: '사용자 AI 사용량 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  const routePaths = router.stack?.map(l => l.route?.path).filter(Boolean);
  console.log('[TokenUsageRoutes] 반환 전 router stack:', router.stack?.length, 'routes:', JSON.stringify(routePaths));
  return router;
};
