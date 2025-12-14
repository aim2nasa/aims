/**
 * OCR Usage API Routes
 * OCR 사용량 조회 API
 * @since 2025-12-14
 */

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

/**
 * 라우트 설정 함수
 * @param {Db} db - MongoDB docupload 인스턴스
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스 (미사용)
 * @param {Function} authenticateJWT - JWT 인증 미들웨어
 * @param {Function} requireRole - 역할 검증 미들웨어
 */
module.exports = function(db, analyticsDb, authenticateJWT, requireRole) {

  /**
   * GET /api/admin/ocr-usage/overview
   * OCR 전체 통계
   *
   * Query:
   * - days: number (기본값: 30)
   */
  router.get('/admin/ocr-usage/overview', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const days = parseInt(req.query.days) || 30;
      const filesCollection = db.collection('files');

      // 기간 계산
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const startOfMonthISO = startOfMonth.toISOString();

      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);

      const [ocrThisMonth, ocrTotal, ocrPending, ocrProcessing, ocrFailed, activeUsersResult] = await Promise.all([
        // 이번 달 OCR 처리 수 (성공+실패)
        filesCollection.countDocuments({
          $and: [
            { 'ocr.status': { $in: ['done', 'error'] } },
            {
              $or: [
                { 'ocr.done_at': { $gte: startOfMonth } },
                { 'ocr.done_at': { $gte: startOfMonthISO } },
                { 'ocr.failed_at': { $gte: startOfMonth } },
                { 'ocr.failed_at': { $gte: startOfMonthISO } }
              ]
            }
          ]
        }),
        // 전체 OCR 처리 수 (성공+실패)
        filesCollection.countDocuments({
          'ocr.status': { $in: ['done', 'error'] }
        }),
        // OCR 대기
        filesCollection.countDocuments({
          $or: [
            { 'stages.ocr.status': 'pending' },
            { 'overallStatus': 'processing', 'ocr.status': { $exists: false }, 'meta.full_text': { $exists: false } }
          ]
        }),
        // OCR 처리중
        filesCollection.countDocuments({
          $or: [
            { 'stages.ocr.status': 'processing' },
            { 'ocr.status': 'processing' },
            { 'ocr.status': 'running' }
          ]
        }),
        // OCR 실패
        filesCollection.countDocuments({
          $or: [
            { 'ocr.status': 'error' },
            { 'stages.ocr.status': 'error' }
          ]
        }),
        // 활성 사용자 (최근 N일 내 OCR 처리한 사용자)
        filesCollection.aggregate([
          {
            $match: {
              $or: [
                { 'ocr.done_at': { $gte: daysAgo } },
                { 'ocr.done_at': { $gte: daysAgo.toISOString() } }
              ],
              ownerId: { $exists: true, $ne: null }
            }
          },
          { $group: { _id: '$ownerId' } },
          { $count: 'count' }
        ]).toArray()
      ]);

      res.json({
        success: true,
        data: {
          period_days: days,
          ocr_this_month: ocrThisMonth,
          ocr_total: ocrTotal,
          active_users: activeUsersResult[0]?.count || 0,
          ocr_pending: ocrPending,
          ocr_processing: ocrProcessing,
          ocr_failed: ocrFailed
        }
      });
    } catch (error) {
      console.error('[GET /api/admin/ocr-usage/overview] 오류:', error);
      res.status(500).json({
        success: false,
        error: 'OCR 사용량 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * GET /api/admin/ocr-usage/hourly
   * 시간별 OCR 처리 추이 (성공/실패 분리)
   *
   * Query:
   * - hours: number (기본값: 24, 최대: 168)
   *
   * Response:
   * - timestamp: ISO 문자열 (KST 기준 시간대)
   * - done: 성공 건수
   * - error: 실패 건수
   */
  router.get('/admin/ocr-usage/hourly', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      let hours = parseInt(req.query.hours) || 24;
      hours = Math.min(hours, 168); // 최대 7일

      const filesCollection = db.collection('files');
      const since = new Date();
      since.setHours(since.getHours() - hours);

      // KST 포맷 헬퍼
      const formatKST = (date) => {
        const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
        const year = kst.getUTCFullYear();
        const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
        const day = String(kst.getUTCDate()).padStart(2, '0');
        const hour = String(kst.getUTCHours()).padStart(2, '0');
        return `${year}-${month}-${day}T${hour}:00:00`;
      };

      // 시간별 OCR 성공 집계
      const donePipeline = [
        {
          $match: {
            $or: [
              { 'ocr.done_at': { $gte: since } },
              { 'ocr.done_at': { $gte: since.toISOString() } }
            ],
            'ocr.status': 'done'
          }
        },
        {
          $addFields: {
            done_at_date: {
              $cond: {
                if: { $eq: [{ $type: '$ocr.done_at' }, 'string'] },
                then: { $dateFromString: { dateString: '$ocr.done_at' } },
                else: '$ocr.done_at'
              }
            }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%dT%H:00:00',
                date: '$done_at_date',
                timezone: 'Asia/Seoul'
              }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ];

      // 시간별 OCR 실패 집계
      const errorPipeline = [
        {
          $match: {
            $or: [
              { 'ocr.failed_at': { $gte: since } },
              { 'ocr.failed_at': { $gte: since.toISOString() } }
            ],
            'ocr.status': 'error'
          }
        },
        {
          $addFields: {
            failed_at_date: {
              $cond: {
                if: { $eq: [{ $type: '$ocr.failed_at' }, 'string'] },
                then: { $dateFromString: { dateString: '$ocr.failed_at' } },
                else: '$ocr.failed_at'
              }
            }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%dT%H:00:00',
                date: '$failed_at_date',
                timezone: 'Asia/Seoul'
              }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ];

      const [doneResults, errorResults] = await Promise.all([
        filesCollection.aggregate(donePipeline).toArray(),
        filesCollection.aggregate(errorPipeline).toArray()
      ]);

      // 결과를 Map으로 변환
      const doneMap = new Map();
      for (const r of doneResults) {
        doneMap.set(r._id, r.count);
      }

      const errorMap = new Map();
      for (const r of errorResults) {
        errorMap.set(r._id, r.count);
      }

      // 모든 시간 슬롯 생성 (빈 슬롯도 포함)
      const usageData = [];
      const now = new Date();

      for (let i = hours; i >= 0; i--) {
        const slotTime = new Date(now.getTime() - i * 60 * 60 * 1000);
        const ts = formatKST(slotTime);

        usageData.push({
          timestamp: ts,
          done: doneMap.get(ts) || 0,
          error: errorMap.get(ts) || 0
        });
      }

      res.json({
        success: true,
        data: usageData
      });
    } catch (error) {
      console.error('[GET /api/admin/ocr-usage/hourly] 오류:', error);
      res.status(500).json({
        success: false,
        error: '시간별 OCR 사용량 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * GET /api/admin/ocr-usage/top-users
   * Top OCR 사용자 목록
   *
   * Query:
   * - days: number (기본값: 30)
   * - limit: number (기본값: 10)
   */
  router.get('/admin/ocr-usage/top-users', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const days = parseInt(req.query.days) || 30;
      const limit = Math.min(parseInt(req.query.limit) || 10, 50);

      const filesCollection = db.collection('files');
      const usersCollection = db.collection('users');

      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);

      // 사용자별 OCR 집계
      const pipeline = [
        {
          $match: {
            $or: [
              { 'ocr.done_at': { $gte: daysAgo } },
              { 'ocr.done_at': { $gte: daysAgo.toISOString() } }
            ],
            ownerId: { $exists: true, $ne: null }
          }
        },
        {
          $group: {
            _id: '$ownerId',
            ocr_count: { $sum: 1 },
            last_ocr_at: { $max: '$ocr.done_at' }
          }
        },
        { $sort: { ocr_count: -1 } },
        { $limit: limit }
      ];

      const topUsers = await filesCollection.aggregate(pipeline).toArray();

      // 사용자 이름 조회
      const userIds = topUsers
        .map(u => {
          try {
            return ObjectId.isValid(u._id) ? new ObjectId(u._id) : null;
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      const users = await usersCollection.find(
        { _id: { $in: userIds } },
        { projection: { _id: 1, name: 1 } }
      ).toArray();

      const userNameMap = {};
      for (const user of users) {
        userNameMap[user._id.toString()] = user.name;
      }

      const enrichedList = topUsers.map((u, index) => ({
        rank: index + 1,
        user_id: u._id,
        user_name: userNameMap[u._id] || u._id,
        ocr_count: u.ocr_count,
        last_ocr_at: u.last_ocr_at
      }));

      res.json({
        success: true,
        data: enrichedList
      });
    } catch (error) {
      console.error('[GET /api/admin/ocr-usage/top-users] 오류:', error);
      res.status(500).json({
        success: false,
        error: 'Top 사용자 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  return router;
};
