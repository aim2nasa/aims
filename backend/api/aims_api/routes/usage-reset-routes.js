/**
 * Usage Reset API Routes
 * 사용량 리셋 및 이력 조회 API
 * @since 2026-02-06
 */

const express = require('express');
const router = express.Router();
const backendLogger = require('../lib/backendLogger');
const {
  createUsageReset,
  getResetHistory,
  getResetDetail,
  getLastResetTimes,
  ensureIndexes
} = require('../lib/usageResetService');
const { getSystemOverview, getTopUsersWithRange } = require('../lib/tokenUsageService');
const { getOcrUsageStats, getTopOcrUsers } = require('../lib/ocrUsageLogService');

// OCR 비용 상수 (ocrUsageRoutes.js와 동일)
const OCR_COST_PER_PAGE = 0.0015;

/**
 * 라우트 설정 함수
 * @param {Db} db - MongoDB docupload 인스턴스
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 * @param {Function} authenticateJWT - JWT 인증 미들웨어
 * @param {Function} requireRole - 역할 검증 미들웨어
 */
module.exports = function(db, analyticsDb, authenticateJWT, requireRole) {

  console.log('[UsageResetRoutes] 라우터 초기화 시작');

  // 초기화 시 인덱스 생성
  ensureIndexes(analyticsDb).catch(err => {
    console.error('[UsageResetRoutes] 인덱스 생성 실패:', err);
  });

  /**
   * POST /api/admin/usage/reset
   * 사용량 리셋 실행
   *
   * Body:
   * - reset_type: 'all' | 'ai' | 'ocr' (필수)
   * - reason: string (선택, 최대 500자)
   */
  router.post('/admin/usage/reset', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { reset_type, reason } = req.body;

      // reset_type 검증
      if (!reset_type || !['all', 'ai', 'ocr'].includes(reset_type)) {
        return res.status(400).json({
          success: false,
          error: 'reset_type은 "all", "ai", "ocr" 중 하나여야 합니다.'
        });
      }

      // 사유 길이 검증
      if (reason && reason.length > 500) {
        return res.status(400).json({
          success: false,
          error: '사유는 500자를 초과할 수 없습니다.'
        });
      }

      // 현재 사용량 스냅샷 수집
      const now = new Date();
      const epochStart = new Date('2020-01-01');

      let aiStats = null;
      let ocrStats = null;
      let userSnapshots = [];

      // AI 사용량 수집
      if (reset_type === 'all' || reset_type === 'ai') {
        const aiOverview = await getSystemOverview(analyticsDb, epochStart, now);
        aiStats = {
          total_tokens: aiOverview.total_tokens,
          prompt_tokens: aiOverview.prompt_tokens,
          completion_tokens: aiOverview.completion_tokens,
          estimated_cost_usd: aiOverview.estimated_cost_usd,
          request_count: aiOverview.request_count,
          by_source: aiOverview.by_source
        };

        // Top AI 사용자 수집
        const topAiUsers = await getTopUsersWithRange(analyticsDb, epochStart, now, 10);

        // 사용자 이름 조회
        const { ObjectId } = require('mongodb');
        const userIds = topAiUsers
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

        const userNameMap = {};
        for (const user of users) {
          userNameMap[user._id.toString()] = user.name;
        }

        userSnapshots = topAiUsers.map(u => ({
          user_id: u.user_id,
          user_name: userNameMap[u.user_id] || u.user_id,
          ai_tokens: u.total_tokens,
          ai_cost: u.estimated_cost_usd,
          ocr_pages: 0,
          ocr_cost: 0
        }));
      }

      // OCR 사용량 수집
      if (reset_type === 'all' || reset_type === 'ocr') {
        const ocrOverview = await getOcrUsageStats(analyticsDb, epochStart, now);
        ocrStats = {
          total_count: ocrOverview.total_count,
          success_count: ocrOverview.success_count,
          failed_count: ocrOverview.failed_count,
          page_count: ocrOverview.page_count,
          estimated_cost_usd: ocrOverview.page_count * OCR_COST_PER_PAGE
        };

        // OCR Top 사용자도 수집 (별도 처리)
        if (reset_type === 'ocr') {
          const topOcrUsers = await getTopOcrUsers(analyticsDb, epochStart, now, 10);

          // 사용자 이름 조회
          const { ObjectId } = require('mongodb');
          const userIds = topOcrUsers
            .map(u => {
              try {
                return ObjectId.isValid(u._id) ? new ObjectId(u._id) : null;
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

          const userNameMap = {};
          for (const user of users) {
            userNameMap[user._id.toString()] = user.name;
          }

          userSnapshots = topOcrUsers.map(u => ({
            user_id: u._id,
            user_name: userNameMap[u._id] || u._id,
            ai_tokens: 0,
            ai_cost: 0,
            ocr_pages: u.page_count,
            ocr_cost: u.page_count * OCR_COST_PER_PAGE
          }));
        } else if (reset_type === 'all') {
          // 전체 리셋 시 OCR Top 사용자 정보도 합쳐야 함
          const topOcrUsers = await getTopOcrUsers(analyticsDb, epochStart, now, 10);

          const { ObjectId } = require('mongodb');
          const ocrUserIds = topOcrUsers
            .map(u => {
              try {
                return ObjectId.isValid(u._id) ? new ObjectId(u._id) : null;
              } catch {
                return null;
              }
            })
            .filter(Boolean);

          const usersCollection = db.collection('users');
          const ocrUsers = await usersCollection.find(
            { _id: { $in: ocrUserIds } },
            { projection: { _id: 1, name: 1 } }
          ).toArray();

          const ocrUserNameMap = {};
          for (const user of ocrUsers) {
            ocrUserNameMap[user._id.toString()] = user.name;
          }

          // 기존 AI 사용자 스냅샷에 OCR 정보 추가
          const userSnapshotMap = new Map();
          for (const snapshot of userSnapshots) {
            userSnapshotMap.set(snapshot.user_id, snapshot);
          }

          for (const u of topOcrUsers) {
            if (userSnapshotMap.has(u._id)) {
              // 기존 AI 사용자에 OCR 정보 추가
              const existing = userSnapshotMap.get(u._id);
              existing.ocr_pages = u.page_count;
              existing.ocr_cost = u.page_count * OCR_COST_PER_PAGE;
            } else {
              // 새 사용자 추가
              userSnapshots.push({
                user_id: u._id,
                user_name: ocrUserNameMap[u._id] || u._id,
                ai_tokens: 0,
                ai_cost: 0,
                ocr_pages: u.page_count,
                ocr_cost: u.page_count * OCR_COST_PER_PAGE
              });
            }
          }
        }
      }

      // 리셋 실행자 정보
      const resetBy = {
        user_id: req.user.id,
        user_name: req.user.name || req.user.email || 'Unknown',
        ip: req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown'
      };

      // 리셋 실행
      const result = await createUsageReset(analyticsDb, {
        resetType: reset_type,
        resetBy,
        reason: reason || null,
        currentStats: {
          ai: aiStats,
          ocr: ocrStats,
          user_snapshots: userSnapshots
        }
      });

      // 로그 기록
      backendLogger.info('UsageReset', `사용량 리셋 실행`, {
        reset_type,
        reset_by: resetBy.user_name,
        ai_tokens: aiStats?.total_tokens || 0,
        ocr_pages: ocrStats?.page_count || 0
      });

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('[POST /api/admin/usage/reset] 오류:', error);
      backendLogger.error('UsageReset', '사용량 리셋 오류', error);
      res.status(500).json({
        success: false,
        error: '사용량 리셋에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * GET /api/admin/usage/reset-history
   * 리셋 이력 목록 조회
   *
   * Query:
   * - limit: number (기본값: 20, 최대: 100)
   * - offset: number (기본값: 0)
   */
  router.get('/admin/usage/reset-history', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const offset = parseInt(req.query.offset) || 0;

      const history = await getResetHistory(analyticsDb, { limit, offset });

      res.json({
        success: true,
        data: history
      });

    } catch (error) {
      console.error('[GET /api/admin/usage/reset-history] 오류:', error);
      backendLogger.error('UsageReset', '리셋 이력 조회 오류', error);
      res.status(500).json({
        success: false,
        error: '리셋 이력 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * GET /api/admin/usage/reset-history/:id
   * 리셋 이력 상세 조회
   *
   * Params:
   * - id: 리셋 ID
   */
  router.get('/admin/usage/reset-history/:id', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;

      const detail = await getResetDetail(analyticsDb, id);

      if (!detail) {
        return res.status(404).json({
          success: false,
          error: '리셋 이력을 찾을 수 없습니다.'
        });
      }

      res.json({
        success: true,
        data: detail
      });

    } catch (error) {
      console.error('[GET /api/admin/usage/reset-history/:id] 오류:', error);
      backendLogger.error('UsageReset', '리셋 이력 상세 조회 오류', error);
      res.status(500).json({
        success: false,
        error: '리셋 이력 상세 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * GET /api/admin/usage/last-reset
   * 최신 리셋 시점 조회
   * - AI와 OCR 각각의 마지막 리셋 시점 반환
   */
  router.get('/admin/usage/last-reset', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const lastResets = await getLastResetTimes(analyticsDb);

      res.json({
        success: true,
        data: lastResets
      });

    } catch (error) {
      console.error('[GET /api/admin/usage/last-reset] 오류:', error);
      backendLogger.error('UsageReset', '최신 리셋 시점 조회 오류', error);
      res.status(500).json({
        success: false,
        error: '최신 리셋 시점 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  console.log('[UsageResetRoutes] 라우터 초기화 완료');
  return router;
};
