/**
 * User Activity API Routes
 * 사용자 활동 현황 조회 API
 * @since 2025-12-14
 */

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const backendLogger = require('../lib/backendLogger');
const { DEFAULT_TIER, getTierDefinitions } = require('../lib/storageQuotaService');
const { OCR_PRICE_PER_PAGE_USD } = require('../lib/ocrPricing');

// 크레딧 환산율 (TIER_PRICING_POLICY.md 기준)
const OCR_CREDIT_PER_PAGE = 2;      // OCR 1페이지 = 2 크레딧
const AI_CREDIT_PER_1K_TOKENS = 0.5; // AI 1K 토큰 = 0.5 크레딧

/**
 * 라우트 설정 함수
 * @param {Db} db - MongoDB docupload 인스턴스
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 * @param {Function} authenticateJWT - JWT 인증 미들웨어
 * @param {Function} requireRole - 역할 검증 미들웨어
 */
module.exports = function(db, analyticsDb, authenticateJWT, requireRole) {

  /**
   * GET /api/admin/user-activity/list
   * 전체 사용자 활동 요약 목록
   *
   * Query:
   * - page: number (기본값: 1)
   * - limit: number (기본값: 50)
   * - search: string (이름/이메일 검색)
   * - tier: string (티어 필터)
   * - sortBy: string (정렬 기준)
   * - sortOrder: 'asc' | 'desc'
   */
  router.get('/admin/user-activity/list', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
      const skip = (page - 1) * limit;
      const search = req.query.search || '';
      const tierFilter = req.query.tier || '';
      const roleFilter = req.query.role || '';
      const sortBy = req.query.sortBy || 'last_activity_at';
      const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

      const usersCollection = db.collection('users');
      const filesCollection = db.collection('files');
      const customersCollection = db.collection('customers');

      // 기간 계산
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // 사용자 필터 쿼리
      const userQuery = { role: { $ne: 'system' } };
      if (roleFilter) {
        userQuery.role = roleFilter;  // 특정 역할만 조회
      }
      if (search) {
        userQuery.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }
      if (tierFilter) {
        userQuery['storage.tier'] = tierFilter;
      }

      // 전체 사용자 수
      const totalUsers = await usersCollection.countDocuments(userQuery);

      // 사용자 목록 조회
      const users = await usersCollection.find(userQuery)
        .project({
          _id: 1,
          name: 1,
          email: 1,
          role: 1,
          storage: 1,
          lastLogin: 1,
          createdAt: 1
        })
        .skip(skip)
        .limit(limit)
        .toArray();

      // 사용자별 활동 데이터 집계
      const userIds = users.map(u => u._id.toString());

      // 문서 수 집계
      const documentCounts = await filesCollection.aggregate([
        { $match: { ownerId: { $in: userIds } } },
        { $group: { _id: '$ownerId', count: { $sum: 1 } } }
      ]).toArray();
      const docCountMap = new Map(documentCounts.map(d => [d._id, d.count]));

      // 고객 수 집계 (meta.created_by 필드 사용)
      const customerCounts = await customersCollection.aggregate([
        { $match: { 'meta.created_by': { $in: userIds } } },
        { $group: { _id: '$meta.created_by', count: { $sum: 1 } } }
      ]).toArray();
      const customerCountMap = new Map(customerCounts.map(c => [c._id, c.count]));

      // 30일 OCR 처리 건수 집계
      const ocrCounts = await filesCollection.aggregate([
        {
          $match: {
            ownerId: { $in: userIds },
            $or: [
              { 'ocr.done_at': { $gte: thirtyDaysAgo } },
              { 'ocr.done_at': { $gte: thirtyDaysAgo.toISOString() } }
            ]
          }
        },
        { $group: { _id: '$ownerId', count: { $sum: 1 } } }
      ]).toArray();
      const ocrCountMap = new Map(ocrCounts.map(o => [o._id, o.count]));

      // 7일 오류 건수 집계 (OCR 실패 + 임베딩 실패)
      const errorCounts = await filesCollection.aggregate([
        {
          $match: {
            ownerId: { $in: userIds },
            $or: [
              { 'ocr.status': 'error' },
              { 'stages.embed.status': 'error' },
              { overallStatus: 'error' }
            ],
            updatedAt: { $gte: sevenDaysAgo }
          }
        },
        { $group: { _id: '$ownerId', count: { $sum: 1 } } }
      ]).toArray();
      const errorCountMap = new Map(errorCounts.map(e => [e._id, e.count]));

      // AI 토큰 사용량 및 비용 집계 (30일) - ai_token_usage 컬렉션 사용
      // 소스별 상세 정보도 함께 집계
      let aiTokenMap = new Map();
      let aiCostMap = new Map();
      let aiBySourceMap = new Map(); // 소스별 상세 정보
      if (analyticsDb) {
        try {
          const tokenUsageCollection = analyticsDb.collection('ai_token_usage');

          // 전체 토큰/비용 집계
          const aiTokenCounts = await tokenUsageCollection.aggregate([
            {
              $match: {
                user_id: { $in: userIds },
                timestamp: { $gte: thirtyDaysAgo }
              }
            },
            {
              $group: {
                _id: '$user_id',
                total_tokens: { $sum: '$total_tokens' },
                total_cost: { $sum: '$estimated_cost_usd' }
              }
            }
          ]).toArray();
          aiTokenMap = new Map(aiTokenCounts.map(a => [a._id, a.total_tokens]));
          aiCostMap = new Map(aiTokenCounts.map(a => [a._id, a.total_cost]));

          // 소스별 집계 (chat, embed, rag, summary)
          const aiBySource = await tokenUsageCollection.aggregate([
            {
              $match: {
                user_id: { $in: userIds },
                timestamp: { $gte: thirtyDaysAgo }
              }
            },
            {
              $group: {
                _id: { user_id: '$user_id', source: '$source' },
                tokens: { $sum: '$total_tokens' },
                cost: { $sum: '$estimated_cost_usd' }
              }
            }
          ]).toArray();

          // 사용자별 소스 데이터 맵핑
          for (const item of aiBySource) {
            const userId = item._id.user_id;
            const source = item._id.source || 'unknown';
            if (!aiBySourceMap.has(userId)) {
              aiBySourceMap.set(userId, {});
            }
            aiBySourceMap.get(userId)[source] = {
              tokens: item.tokens,
              cost: Math.round(item.cost * 10000) / 10000
            };
          }
        } catch (err) {
          console.warn('[user-activity] AI 토큰 집계 실패:', err.message);
        }
      }

      // 30일 OCR 페이지 수 집계
      const ocrPageCounts = await filesCollection.aggregate([
        {
          $match: {
            ownerId: { $in: userIds },
            'ocr.status': 'done',
            $or: [
              { 'ocr.done_at': { $gte: thirtyDaysAgo } },
              { 'ocr.done_at': { $gte: thirtyDaysAgo.toISOString() } }
            ]
          }
        },
        {
          $group: {
            _id: '$ownerId',
            page_count: { $sum: { $ifNull: ['$ocr.page_count', 1] } }
          }
        }
      ]).toArray();
      const ocrPageMap = new Map(ocrPageCounts.map(o => [o._id, o.page_count]));

      // 마지막 활동 시간 집계
      const lastActivityList = await filesCollection.aggregate([
        { $match: { ownerId: { $in: userIds } } },
        { $group: { _id: '$ownerId', lastActivity: { $max: '$updatedAt' } } }
      ]).toArray();
      const lastActivityMap = new Map(lastActivityList.map(l => [l._id, l.lastActivity]));

      // 스토리지 사용량 계산 (meta.size_bytes 합계)
      const storageSums = await filesCollection.aggregate([
        { $match: { ownerId: { $in: userIds } } },
        {
          $group: {
            _id: '$ownerId',
            totalSize: {
              $sum: { $toInt: { $ifNull: ['$meta.size_bytes', '0'] } }
            }
          }
        }
      ]).toArray();
      const storageMap = new Map(storageSums.map(s => [s._id, s.totalSize]));

      // 티어 정의 로드 (한도 정보용)
      const tierDefinitions = await getTierDefinitions(db);

      // 결과 조합
      const enrichedUsers = users.map(user => {
        const odlId = user._id.toString();
        const ocrPages = ocrPageMap.get(odlId) || 0;
        const aiTokens = aiTokenMap.get(odlId) || 0;
        const tier = user.storage?.tier || DEFAULT_TIER;
        const tierDef = tierDefinitions[tier] || tierDefinitions[DEFAULT_TIER];
        const aiBySource = aiBySourceMap.get(odlId) || {};

        // 크레딧 계산: OCR 페이지 * 2 + AI 토큰(K) * 0.5
        const ocrCredits = ocrPages * OCR_CREDIT_PER_PAGE;
        const aiCredits = (aiTokens / 1000) * AI_CREDIT_PER_1K_TOKENS;
        const totalCredits = Math.round((ocrCredits + aiCredits) * 100) / 100;

        // 티어 한도
        const creditQuota = tierDef.credit_quota || 0;
        const ocrPageQuota = tierDef.ocr_page_quota || 0;

        // 한도 초과 여부
        const creditExceeded = creditQuota > 0 && totalCredits > creditQuota;
        const ocrExceeded = ocrPageQuota > 0 && ocrPages > ocrPageQuota;
        const storageQuota = user.storage?.quota_bytes || tierDef.quota_bytes || 0;
        const storageUsed = storageMap.get(odlId) || 0;
        const storageExceeded = storageQuota > 0 && storageUsed > storageQuota;

        return {
          user_id: odlId,
          name: user.name || '-',
          email: user.email || '-',
          role: user.role,
          tier,
          document_count: docCountMap.get(odlId) || 0,
          customer_count: customerCountMap.get(odlId) || 0,
          // AI 사용량
          ai_tokens_30d: aiTokens,
          ai_cost_30d: Math.round((aiCostMap.get(odlId) || 0) * 10000) / 10000,
          ai_by_source: aiBySource, // 소스별 상세 (chat, embed, rag, summary)
          // OCR 사용량
          ocr_count_30d: ocrCountMap.get(odlId) || 0,
          ocr_pages_30d: ocrPages,
          ocr_cost_30d: Math.round(ocrPages * OCR_PRICE_PER_PAGE_USD * 10000) / 10000,
          // 크레딧
          credits_used: totalCredits,
          credits_ocr: Math.round(ocrCredits * 100) / 100,
          credits_ai: Math.round(aiCredits * 100) / 100,
          // 티어 한도
          credit_quota: creditQuota,
          ocr_page_quota: ocrPageQuota,
          // 한도 초과 여부
          credit_exceeded: creditExceeded,
          ocr_exceeded: ocrExceeded,
          storage_exceeded: storageExceeded,
          any_limit_exceeded: creditExceeded || ocrExceeded || storageExceeded,
          // 사용률 (%)
          credit_usage_percent: creditQuota > 0 ? Math.round((totalCredits / creditQuota) * 100) : 0,
          ocr_usage_percent: ocrPageQuota > 0 ? Math.round((ocrPages / ocrPageQuota) * 100) : 0,
          // 스토리지
          storage_used_bytes: storageUsed,
          storage_quota_bytes: storageQuota,
          error_count_7d: errorCountMap.get(odlId) || 0,
          last_activity_at: lastActivityMap.get(odlId) || user.lastLogin || null,
          created_at: user.createdAt
        };
      });

      // 정렬
      const sortKeyMap = {
        'name': 'name',
        'tier': 'tier',
        'document_count': 'document_count',
        'customer_count': 'customer_count',
        'ai_tokens_30d': 'ai_tokens_30d',
        'ai_cost_30d': 'ai_cost_30d',
        'ocr_count_30d': 'ocr_count_30d',
        'ocr_pages_30d': 'ocr_pages_30d',
        'ocr_cost_30d': 'ocr_cost_30d',
        'storage_used_bytes': 'storage_used_bytes',
        'error_count_7d': 'error_count_7d',
        'last_activity_at': 'last_activity_at',
        'credits_used': 'credits_used',
        'credit_usage_percent': 'credit_usage_percent',
        'ocr_usage_percent': 'ocr_usage_percent'
      };
      const sortKey = sortKeyMap[sortBy] || 'last_activity_at';

      enrichedUsers.sort((a, b) => {
        const aVal = a[sortKey] || '';
        const bVal = b[sortKey] || '';
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortOrder === 1 ? aVal - bVal : bVal - aVal;
        }
        return sortOrder === 1
          ? String(aVal).localeCompare(String(bVal))
          : String(bVal).localeCompare(String(aVal));
      });

      res.json({
        success: true,
        data: {
          users: enrichedUsers,
          pagination: {
            total: totalUsers,
            page,
            limit,
            totalPages: Math.ceil(totalUsers / limit)
          }
        }
      });
    } catch (error) {
      console.error('[GET /api/admin/user-activity/list] 오류:', error);
      backendLogger.error('UserActivity', '사용자 활동 목록 조회 오류', error);
      res.status(500).json({
        success: false,
        error: '사용자 활동 목록 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * GET /api/admin/user-activity/:userId/detail
   * 특정 사용자 상세 활동 정보
   */
  router.get('/admin/user-activity/:userId/detail', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { userId } = req.params;

      if (!ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 사용자 ID입니다.'
        });
      }

      const usersCollection = db.collection('users');
      const filesCollection = db.collection('files');
      const customersCollection = db.collection('customers');

      // 사용자 정보
      const user = await usersCollection.findOne(
        { _id: new ObjectId(userId) },
        { projection: { password: 0 } }
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          error: '사용자를 찾을 수 없습니다.'
        });
      }

      // 기간 계산
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // 문서 통계
      const [
        totalDocs,
        thisMonthDocs,
        docsByStatus,
        totalCustomers,
        activeCustomers,
        dormantCustomers,
        ocrTotal,
        ocrThisMonth,
        ocrPagesTotal,
        ocrPagesThisMonth
      ] = await Promise.all([
        filesCollection.countDocuments({ ownerId: userId }),
        filesCollection.countDocuments({
          ownerId: userId,
          createdAt: { $gte: startOfMonth }
        }),
        filesCollection.aggregate([
          { $match: { ownerId: userId } },
          { $group: { _id: '$overallStatus', count: { $sum: 1 } } }
        ]).toArray(),
        customersCollection.countDocuments({ 'meta.created_by': userId }),
        customersCollection.countDocuments({ 'meta.created_by': userId, 'meta.status': 'active' }),
        customersCollection.countDocuments({ 'meta.created_by': userId, 'meta.status': 'dormant' }),
        filesCollection.countDocuments({
          ownerId: userId,
          'ocr.status': 'done'
        }),
        filesCollection.countDocuments({
          ownerId: userId,
          'ocr.status': 'done',
          $or: [
            { 'ocr.done_at': { $gte: startOfMonth } },
            { 'ocr.done_at': { $gte: startOfMonth.toISOString() } }
          ]
        }),
        // OCR 전체 페이지 수
        filesCollection.aggregate([
          { $match: { ownerId: userId, 'ocr.status': 'done' } },
          { $group: { _id: null, total: { $sum: { $ifNull: ['$ocr.page_count', 1] } } } }
        ]).toArray().then(r => r[0]?.total || 0),
        // OCR 이번달 페이지 수
        filesCollection.aggregate([
          {
            $match: {
              ownerId: userId,
              'ocr.status': 'done',
              $or: [
                { 'ocr.done_at': { $gte: startOfMonth } },
                { 'ocr.done_at': { $gte: startOfMonth.toISOString() } }
              ]
            }
          },
          { $group: { _id: null, total: { $sum: { $ifNull: ['$ocr.page_count', 1] } } } }
        ]).toArray().then(r => r[0]?.total || 0)
      ]);

      // 문서 상태별 맵
      const statusMap = {};
      for (const s of docsByStatus) {
        statusMap[s._id || 'unknown'] = s.count;
      }

      // AI 사용량 (30일) - ai_token_usage 컬렉션 사용
      // 소스별 tokens, cost 모두 반환 (실제 기록된 비용)
      let aiUsage = { total_tokens: 0, total_cost: 0, by_source: {} };
      if (analyticsDb) {
        try {
          const tokenUsageCollection = analyticsDb.collection('ai_token_usage');
          const aiData = await tokenUsageCollection.aggregate([
            {
              $match: {
                user_id: userId,
                timestamp: { $gte: thirtyDaysAgo }
              }
            },
            {
              $group: {
                _id: '$source',
                total_tokens: { $sum: '$total_tokens' },
                total_cost: { $sum: '$estimated_cost_usd' }
              }
            }
          ]).toArray();

          let totalTokens = 0;
          let totalCost = 0;
          const bySource = {};
          for (const a of aiData) {
            const source = a._id || 'unknown';
            bySource[source] = {
              tokens: a.total_tokens,
              cost: Math.round(a.total_cost * 10000) / 10000
            };
            totalTokens += a.total_tokens;
            totalCost += a.total_cost;
          }
          aiUsage = {
            total_tokens: totalTokens,
            total_cost: Math.round(totalCost * 10000) / 10000,
            by_source: bySource
          };
        } catch (err) {
          console.warn('[user-activity detail] AI 사용량 조회 실패:', err.message);
        }
      }

      // 최근 활동 (최근 50개 문서)
      const recentDocs = await filesCollection.find({ ownerId: userId })
        .sort({ updatedAt: -1 })
        .limit(50)
        .project({
          _id: 1,
          'upload.originalName': 1,
          'meta.filename': 1,
          overallStatus: 1,
          'ocr.status': 1,
          'ocr.updated_at': 1,
          'stages.embed.status': 1,
          'docembed.status': 1,
          'docembed.updated_at': 1,
          createdAt: 1,
          updatedAt: 1
        })
        .toArray();

      const recentActivity = recentDocs.map(doc => ({
        document_id: doc._id.toString(),
        document_name: doc.upload?.originalName || doc.meta?.filename || null,
        status: doc.overallStatus,
        ocr_status: doc.ocr?.status,
        embed_status: doc.stages?.embed?.status || doc.docembed?.status,
        ocr_completed_at: doc.ocr?.updated_at || null,
        embed_completed_at: doc.docembed?.updated_at || null,
        created_at: doc.createdAt,
        updated_at: doc.updatedAt
      }));

      // 스토리지 사용량 계산 (meta.size_bytes 합계)
      const storageAgg = await filesCollection.aggregate([
        { $match: { ownerId: userId } },
        {
          $group: {
            _id: null,
            totalSize: {
              $sum: { $toInt: { $ifNull: ['$meta.size_bytes', '0'] } }
            }
          }
        }
      ]).toArray();
      const calculatedUsedBytes = storageAgg[0]?.totalSize || 0;

      res.json({
        success: true,
        data: {
          user: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
            tier: user.storage?.tier,
            storage: {
              used_bytes: calculatedUsedBytes,
              quota_bytes: user.storage?.quota_bytes || 0,
              usage_percent: user.storage?.quota_bytes > 0
                ? Math.round((calculatedUsedBytes / user.storage.quota_bytes) * 100)
                : 0
            },
            created_at: user.createdAt,
            last_login: user.lastLogin
          },
          activity_summary: {
            documents: {
              total: totalDocs,
              this_month: thisMonthDocs,
              by_status: statusMap
            },
            customers: {
              total: totalCustomers,
              active: activeCustomers,
              dormant: dormantCustomers
            },
            ai_usage: aiUsage,
            ocr_usage: {
              total: ocrTotal,
              this_month: ocrThisMonth,
              total_pages: ocrPagesTotal,
              this_month_pages: ocrPagesThisMonth
            }
          },
          recent_activity: recentActivity
        }
      });
    } catch (error) {
      console.error('[GET /api/admin/user-activity/:userId/detail] 오류:', error);
      backendLogger.error('UserActivity', '사용자 상세 활동 조회 오류', error);
      res.status(500).json({
        success: false,
        error: '사용자 상세 활동 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * GET /api/admin/user-activity/:userId/errors
   * 특정 사용자의 오류 목록
   *
   * Query:
   * - days: number (기본값: 7)
   * - limit: number (기본값: 50)
   */
  router.get('/admin/user-activity/:userId/errors', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { userId } = req.params;
      const days = Math.min(30, Math.max(1, parseInt(req.query.days) || 7));
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));

      if (!ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 사용자 ID입니다.'
        });
      }

      const filesCollection = db.collection('files');
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);

      // 오류가 있는 문서 조회
      const errorDocs = await filesCollection.find({
        ownerId: userId,
        $or: [
          { 'ocr.status': 'error' },
          { 'stages.embed.status': 'error' },
          { overallStatus: 'error' }
        ],
        updatedAt: { $gte: daysAgo }
      })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .project({
          _id: 1,
          originalName: 1,
          overallStatus: 1,
          'ocr.status': 1,
          'ocr.error': 1,
          'ocr.error_msg': 1,
          'stages.embed.status': 1,
          'stages.embed.error': 1,
          updatedAt: 1
        })
        .toArray();

      const errors = errorDocs.map(doc => {
        let errorType = 'unknown';
        let errorMessage = '';

        if (doc.ocr?.status === 'error') {
          errorType = 'ocr_failed';
          errorMessage = doc.ocr.error_msg || doc.ocr.error || 'OCR 처리 실패';
        } else if (doc.stages?.embed?.status === 'error') {
          errorType = 'embed_failed';
          errorMessage = doc.stages.embed.error || '임베딩 처리 실패';
        } else if (doc.overallStatus === 'error') {
          errorType = 'processing_failed';
          errorMessage = '문서 처리 실패';
        }

        return {
          type: errorType,
          document_id: doc._id.toString(),
          document_name: doc.originalName,
          error_message: errorMessage,
          occurred_at: doc.updatedAt
        };
      });

      res.json({
        success: true,
        data: {
          user_id: userId,
          period_days: days,
          error_count: errors.length,
          errors
        }
      });
    } catch (error) {
      console.error('[GET /api/admin/user-activity/:userId/errors] 오류:', error);
      backendLogger.error('UserActivity', '사용자 오류 목록 조회 오류', error);
      res.status(500).json({
        success: false,
        error: '사용자 오류 목록 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * GET /api/admin/activity-logs
   * 전체 활동 로그 조회
   *
   * Query:
   * - page: number (기본값: 1)
   * - limit: number (기본값: 50)
   * - userId: string (특정 사용자 필터)
   * - category: string (카테고리 필터: auth, customer, document, contract)
   * - success: boolean (성공/실패 필터)
   * - startDate: ISO string (시작일)
   * - endDate: ISO string (종료일)
   */
  router.get('/admin/activity-logs', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
      const skip = (page - 1) * limit;

      const query = {};

      // 필터 적용
      if (req.query.userId) {
        query['actor.user_id'] = req.query.userId;
      }
      if (req.query.category) {
        query['action.category'] = req.query.category;
      }
      if (req.query.success !== undefined) {
        query['result.success'] = req.query.success === 'true';
      }
      if (req.query.startDate || req.query.endDate) {
        query.timestamp = {};
        if (req.query.startDate) {
          query.timestamp.$gte = new Date(req.query.startDate);
        }
        if (req.query.endDate) {
          query.timestamp.$lte = new Date(req.query.endDate);
        }
      }

      const activityLogsCollection = analyticsDb.collection('activity_logs');

      const [logs, total] = await Promise.all([
        activityLogsCollection
          .find(query)
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit)
          .toArray(),
        activityLogsCollection.countDocuments(query)
      ]);

      res.json({
        success: true,
        data: {
          logs,
          pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('[GET /api/admin/activity-logs] 오류:', error);
      backendLogger.error('UserActivity', '활동 로그 조회 오류', error);
      res.status(500).json({
        success: false,
        error: '활동 로그 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * GET /api/admin/activity-logs/:userId
   * 특정 사용자의 활동 로그 조회
   *
   * Query:
   * - page: number (기본값: 1)
   * - limit: number (기본값: 50)
   * - category: string (카테고리 필터)
   * - success: boolean (성공/실패 필터)
   * - days: number (최근 N일, 기본값: 30)
   */
  router.get('/admin/activity-logs/:userId', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { userId } = req.params;
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
      const skip = (page - 1) * limit;
      const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 30));

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const query = {
        'actor.user_id': userId,
        timestamp: { $gte: startDate }
      };

      if (req.query.category) {
        query['action.category'] = req.query.category;
      }
      if (req.query.success !== undefined) {
        query['result.success'] = req.query.success === 'true';
      }

      const activityLogsCollection = analyticsDb.collection('activity_logs');

      const [logs, total] = await Promise.all([
        activityLogsCollection
          .find(query)
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit)
          .toArray(),
        activityLogsCollection.countDocuments(query)
      ]);

      // 문서 로그의 경우 실제 문서명 조회
      const documentIds = logs
        .filter(log => log.action?.category === 'document' && log.action?.target?.entity_id)
        .map(log => {
          try {
            return new ObjectId(log.action.target.entity_id);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      let documentNames = {};
      if (documentIds.length > 0) {
        const filesCollection = db.collection('files');
        const docs = await filesCollection.find(
          { _id: { $in: documentIds } },
          { projection: { _id: 1, 'upload.originalName': 1, 'meta.filename': 1 } }
        ).toArray();

        docs.forEach(doc => {
          documentNames[doc._id.toString()] = doc.upload?.originalName || doc.meta?.filename || null;
        });
      }

      // 로그에 실제 문서명 추가
      const enrichedLogs = logs.map(log => {
        if (log.action?.category === 'document' && log.action?.target?.entity_id) {
          const docName = documentNames[log.action.target.entity_id];
          if (docName && log.action.target) {
            return {
              ...log,
              action: {
                ...log.action,
                target: {
                  ...log.action.target,
                  entity_name: docName
                }
              }
            };
          }
        }
        return log;
      });

      // 통계 계산
      const stats = await activityLogsCollection.aggregate([
        { $match: { 'actor.user_id': userId, timestamp: { $gte: startDate } } },
        {
          $group: {
            _id: {
              category: '$action.category',
              success: '$result.success'
            },
            count: { $sum: 1 }
          }
        }
      ]).toArray();

      // 통계 정리
      const summary = {
        total: 0,
        success: 0,
        failure: 0,
        by_category: {}
      };

      for (const stat of stats) {
        const category = stat._id.category || 'unknown';
        const count = stat.count;

        summary.total += count;
        if (stat._id.success) {
          summary.success += count;
        } else {
          summary.failure += count;
        }

        if (!summary.by_category[category]) {
          summary.by_category[category] = { success: 0, failure: 0 };
        }
        if (stat._id.success) {
          summary.by_category[category].success += count;
        } else {
          summary.by_category[category].failure += count;
        }
      }

      res.json({
        success: true,
        data: {
          user_id: userId,
          period_days: days,
          summary,
          logs: enrichedLogs,
          pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('[GET /api/admin/activity-logs/:userId] 오류:', error);
      backendLogger.error('UserActivity', '사용자 활동 로그 조회 오류', error);
      res.status(500).json({
        success: false,
        error: '사용자 활동 로그 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  return router;
};
