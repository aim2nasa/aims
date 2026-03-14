/**
 * OCR Usage API Routes
 * OCR 사용량 조회 API
 * @since 2025-12-14
 * @updated 2025-12-23 - OCR 사용량 영구 보존 (ocr_usage_log)
 */

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const Redis = require('ioredis');
const { calculateOCRCost } = require('../lib/ocrPricing');
const ocrUsageLogService = require('../lib/ocrUsageLogService');
const backendLogger = require('../lib/backendLogger');
const { getUserStorageInfo } = require('../lib/storageQuotaService');
const { checkCreditForDocumentProcessing } = require('../lib/creditService');
const { getLastResetTime } = require('../lib/usageResetService');

// Redis 클라이언트 (host network 모드이므로 localhost 사용)
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  lazyConnect: true,
  retryStrategy: (times) => {
    if (times > 3) return null; // 3회 초과 시 재시도 중지
    return Math.min(times * 200, 2000);
  }
});

/**
 * 라우트 설정 함수
 * @param {Db} db - MongoDB docupload 인스턴스
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스 (미사용)
 * @param {Function} authenticateJWT - JWT 인증 미들웨어
 * @param {Function} requireRole - 역할 검증 미들웨어
 */
module.exports = function(db, analyticsDb, authenticateJWT, requireRole) {

  // 초기화 시 인덱스 생성 (unique → non-unique 마이그레이션 포함)
  ocrUsageLogService.ensureIndexes(analyticsDb).catch(err => {
    console.error('[OcrUsageRoutes] 인덱스 생성 실패:', err);
  });

  /**
   * GET /api/admin/ocr-usage/overview
   * OCR 전체 통계
   *
   * Query:
   * - days: number (기본값: 30) - start/end가 없을 때 사용
   * - start: string (YYYY-MM-DD) - 기간 시작일
   * - end: string (YYYY-MM-DD) - 기간 종료일
   */
  // 날짜 문자열(ISO/KST offset)을 Date로 변환하는 헬퍼 - aggregation $addFields용
  const dateConversionFields = {
    done_at_date: {
      $cond: {
        if: { $and: [{ $ne: ['$ocr.done_at', null] }, { $ne: [{ $type: '$ocr.done_at' }, 'missing'] }] },
        then: {
          $cond: {
            if: { $eq: [{ $type: '$ocr.done_at' }, 'string'] },
            then: { $dateFromString: { dateString: '$ocr.done_at', onError: null } },
            else: '$ocr.done_at'
          }
        },
        else: null
      }
    },
    failed_at_date: {
      $cond: {
        if: { $and: [{ $ne: ['$ocr.failed_at', null] }, { $ne: [{ $type: '$ocr.failed_at' }, 'missing'] }] },
        then: {
          $cond: {
            if: { $eq: [{ $type: '$ocr.failed_at' }, 'string'] },
            then: { $dateFromString: { dateString: '$ocr.failed_at', onError: null } },
            else: '$ocr.failed_at'
          }
        },
        else: null
      }
    }
  };

  router.get('/admin/ocr-usage/overview', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const filesCollection = db.collection('files');

      // 기간 계산 (start/end 또는 days) - UTC 기준
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

      // 리셋 시점 반영: 리셋 이후 데이터만 집계
      const lastReset = await getLastResetTime(analyticsDb, 'ocr');
      const effectiveStartDate = lastReset && lastReset > startDate ? lastReset : startDate;

      // 영구 로그에서 OCR 통계 조회 (문서 삭제 후에도 유지)
      const [logStats, ocrPending, ocrProcessing, ocrFailed] = await Promise.all([
        // ocr_usage_log에서 통계 조회 (영구)
        ocrUsageLogService.getOcrUsageStats(analyticsDb, effectiveStartDate, endDate),
        // OCR 대기 (실시간 - files에서 조회)
        filesCollection.countDocuments({
          $or: [
            { 'stages.ocr.status': 'pending' },
            { 'overallStatus': 'processing', 'ocr.status': { $exists: false }, 'meta.full_text': { $exists: false } }
          ]
        }),
        // OCR 처리중 (실시간 - files에서 조회)
        filesCollection.countDocuments({
          $or: [
            { 'stages.ocr.status': 'processing' },
            { 'ocr.status': 'processing' },
            { 'ocr.status': 'running' }
          ]
        }),
        // OCR 실패 (실시간 - files에서 조회, 재시도 가능 문서용)
        filesCollection.countDocuments({
          $or: [
            { 'ocr.status': 'error' },
            { 'stages.ocr.status': 'error' }
          ]
        })
      ]);

      // 전체 기간 통계 (리셋 시점부터 지금까지)
      const allTimeStart = lastReset || new Date('2020-01-01');
      const allTimeStats = await ocrUsageLogService.getOcrUsageStats(analyticsDb, allTimeStart, endDate);

      // 페이지 수 및 예상 비용 계산
      const costInPeriod = calculateOCRCost(logStats.page_count);

      res.json({
        success: true,
        data: {
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          ocr_count: logStats.total_count,
          ocr_total: allTimeStats.total_count,
          active_users: logStats.active_users,
          ocr_pending: ocrPending,
          ocr_processing: ocrProcessing,
          ocr_failed: ocrFailed,
          page_count: logStats.page_count,
          pages_total: allTimeStats.page_count,
          estimated_cost_usd: costInPeriod.usd,
          estimated_cost_krw: costInPeriod.krw,
          // 하위 호환성을 위해 기존 필드 유지
          ocr_this_month: logStats.success_count,
          pages_this_month: logStats.page_count
        }
      });
    } catch (error) {
      console.error('[GET /api/admin/ocr-usage/overview] 오류:', error);
      backendLogger.error('OcrUsage', 'OCR 사용량 통계 조회 오류', error);
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

      // 시간별 OCR 성공 집계 - 먼저 날짜 변환 후 필터링
      const donePipeline = [
        { $match: { 'ocr.status': 'done', 'ocr.done_at': { $exists: true } } },
        { $addFields: dateConversionFields },
        { $match: { done_at_date: { $gte: since } } },
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

      // 시간별 OCR 실패 집계 - 먼저 날짜 변환 후 필터링
      const errorPipeline = [
        { $match: { 'ocr.status': 'error', 'ocr.failed_at': { $exists: true } } },
        { $addFields: dateConversionFields },
        { $match: { failed_at_date: { $gte: since } } },
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
      backendLogger.error('OcrUsage', '시간별 OCR 사용량 조회 오류', error);
      res.status(500).json({
        success: false,
        error: '시간별 OCR 사용량 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * GET /api/admin/ocr-usage/daily
   * 일별 OCR 처리 추이 (성공/실패 분리)
   *
   * Query:
   * - start: string (YYYY-MM-DD) - 기간 시작일
   * - end: string (YYYY-MM-DD) - 기간 종료일
   * - days: number (기본값: 30) - start/end가 없을 때 사용
   *
   * Response:
   * - date: YYYY-MM-DD
   * - done: 성공 건수
   * - error: 실패 건수
   * - page_count: 페이지 수
   */
  router.get('/admin/ocr-usage/daily', authenticateJWT, requireRole('admin'), async (req, res) => {
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

      // 리셋 시점 반영
      const lastReset = await getLastResetTime(analyticsDb, 'ocr');
      const effectiveStartDate = lastReset && lastReset > startDate ? lastReset : startDate;

      // 영구 로그에서 일별 통계 조회 (문서 삭제 후에도 유지)
      const usageData = await ocrUsageLogService.getDailyOcrUsage(analyticsDb, effectiveStartDate, endDate);

      res.json({
        success: true,
        data: usageData
      });
    } catch (error) {
      console.error('[GET /api/admin/ocr-usage/daily] 오류:', error);
      backendLogger.error('OcrUsage', '일별 OCR 사용량 조회 오류', error);
      res.status(500).json({
        success: false,
        error: '일별 OCR 사용량 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * GET /api/admin/ocr-usage/top-users
   * Top OCR 사용자 목록
   *
   * Query:
   * - days: number (기본값: 30) - start/end가 없을 때 사용
   * - start: string (YYYY-MM-DD) - 기간 시작일
   * - end: string (YYYY-MM-DD) - 기간 종료일
   * - limit: number (기본값: 10)
   */
  router.get('/admin/ocr-usage/top-users', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 10, 50);
      const usersCollection = db.collection('users');

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

      // 리셋 시점 반영
      const lastReset = await getLastResetTime(analyticsDb, 'ocr');
      const effectiveStartDate = lastReset && lastReset > startDate ? lastReset : startDate;

      // 영구 로그에서 Top 사용자 조회 (문서 삭제 후에도 유지)
      const topUsers = await ocrUsageLogService.getTopOcrUsers(analyticsDb, effectiveStartDate, endDate, limit);

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

      const enrichedList = topUsers.map((u, index) => {
        const pageCount = u.page_count || 0;
        const cost = calculateOCRCost(pageCount);
        return {
          rank: index + 1,
          user_id: u._id,
          user_name: userNameMap[u._id] || u._id,
          ocr_count: u.ocr_count,
          page_count: pageCount,
          estimated_cost_usd: cost.usd,
          error_count: 0, // 로그에서는 실패 건수 별도 추적 안함 (실시간 상태)
          last_ocr_at: u.last_ocr_at
        };
      });

      res.json({
        success: true,
        data: enrichedList
      });
    } catch (error) {
      console.error('[GET /api/admin/ocr-usage/top-users] 오류:', error);
      backendLogger.error('OcrUsage', 'Top OCR 사용자 조회 오류', error);
      res.status(500).json({
        success: false,
        error: 'Top 사용자 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * GET /api/admin/ocr-usage/failed-documents
   * OCR 실패 문서 목록
   *
   * Query:
   * - userId: string (선택, 특정 사용자 필터링)
   * - limit: number (기본값: 100)
   */
  router.get('/admin/ocr-usage/failed-documents', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const userId = req.query.userId;
      const limit = Math.min(parseInt(req.query.limit) || 100, 500);

      const filesCollection = db.collection('files');
      const usersCollection = db.collection('users');
      const customersCollection = db.collection('customers');

      // 쿼리 조건 - error 또는 quota_exceeded 상태
      const matchCondition = {
        $or: [
          { 'ocr.status': 'error' },
          { 'ocr.status': 'quota_exceeded' }
        ]
      };
      if (userId) {
        matchCondition.ownerId = userId;
      }

      // 실패 문서 조회
      const failedDocs = await filesCollection.find(matchCondition)
        .sort({ 'ocr.updated_at': -1, 'ocr.failed_at': -1 })
        .limit(limit)
        .project({
          _id: 1,
          'upload.originalName': 1,
          ownerId: 1,
          customerId: 1,
          'ocr.status': 1,
          'ocr.statusCode': 1,
          'ocr.statusMessage': 1,
          'ocr.errorBody': 1,
          'ocr.failed_at': 1,
          'ocr.updated_at': 1
        })
        .toArray();

      // 소유자/고객 ID 수집
      const ownerIds = [...new Set(failedDocs.map(d => d.ownerId).filter(Boolean))];
      const customerIds = [...new Set(failedDocs.map(d => d.customerId).filter(Boolean))];

      // 소유자 이름 조회
      const ownerObjectIds = ownerIds
        .map(id => {
          try {
            return ObjectId.isValid(id) ? new ObjectId(id) : null;
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      const owners = await usersCollection.find(
        { _id: { $in: ownerObjectIds } },
        { projection: { _id: 1, name: 1 } }
      ).toArray();

      const ownerNameMap = {};
      for (const owner of owners) {
        ownerNameMap[owner._id.toString()] = owner.name;
      }

      // 고객 이름 조회
      const customerObjectIds = customerIds
        .map(id => {
          try {
            return ObjectId.isValid(id) ? new ObjectId(id) : null;
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      const customers = await customersCollection.find(
        { _id: { $in: customerObjectIds } },
        { projection: { _id: 1, 'personal_info.name': 1 } }
      ).toArray();

      const customerNameMap = {};
      for (const customer of customers) {
        customerNameMap[customer._id.toString()] = customer.personal_info?.name;
      }

      // 응답 데이터 구성
      const documents = failedDocs.map(doc => {
        const ocrStatus = doc.ocr?.status;
        // quota_exceeded인 경우 명확한 메시지 제공
        const isQuotaExceeded = ocrStatus === 'quota_exceeded';
        return {
          _id: doc._id.toString(),
          originalName: doc.upload?.originalName || '(이름 없음)',
          ownerId: doc.ownerId || '',
          ownerName: ownerNameMap[doc.ownerId] || doc.ownerId || '(알 수 없음)',
          customerId: doc.customerId?.toString() || '',
          customerName: customerNameMap[doc.customerId?.toString()] || '(알 수 없음)',
          statusCode: isQuotaExceeded ? 'QUOTA' : (doc.ocr?.statusCode || ''),
          statusMessage: isQuotaExceeded ? 'OCR 한도 초과' : (doc.ocr?.statusMessage || ''),
          errorBody: doc.ocr?.errorBody || '',
          failed_at: doc.ocr?.failed_at || doc.ocr?.updated_at || ''
        };
      });

      // 전체 실패 문서 수 (필터 적용)
      const totalCount = await filesCollection.countDocuments(matchCondition);

      res.json({
        success: true,
        data: {
          total_count: totalCount,
          documents
        }
      });
    } catch (error) {
      console.error('[GET /api/admin/ocr-usage/failed-documents] 오류:', error);
      backendLogger.error('OcrUsage', 'OCR 실패 문서 조회 오류', error);
      res.status(500).json({
        success: false,
        error: 'OCR 실패 문서 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * GET /api/admin/embed/failed-documents
   * 임베딩 실패 문서 목록
   *
   * Query:
   * - userId: string (선택, 특정 사용자 필터링)
   * - limit: number (기본값: 100)
   */
  router.get('/admin/embed/failed-documents', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const userId = req.query.userId;
      const limit = Math.min(parseInt(req.query.limit) || 100, 500);

      const filesCollection = db.collection('files');
      const usersCollection = db.collection('users');
      const customersCollection = db.collection('customers');

      // 쿼리 조건 - docembed.status가 failed 또는 error
      const matchCondition = {
        $or: [
          { 'docembed.status': 'failed' },
          { 'docembed.status': 'error' }
        ]
      };
      if (userId) {
        matchCondition.ownerId = userId;
      }

      // 실패 문서 조회
      const failedDocs = await filesCollection.find(matchCondition)
        .sort({ 'docembed.updated_at': -1 })
        .limit(limit)
        .project({
          _id: 1,
          'upload.originalName': 1,
          ownerId: 1,
          customerId: 1,
          'docembed.status': 1,
          'docembed.error_code': 1,
          'docembed.error_message': 1,
          'docembed.retry_count': 1,
          'docembed.updated_at': 1,
          'docembed.failed_at': 1
        })
        .toArray();

      // 소유자/고객 ID 수집
      const ownerIds = [...new Set(failedDocs.map(d => d.ownerId).filter(Boolean))];
      const customerIds = [...new Set(failedDocs.map(d => d.customerId).filter(Boolean))];

      // 소유자 이름 조회
      const ownerObjectIds = ownerIds
        .map(id => {
          try {
            return ObjectId.isValid(id) ? new ObjectId(id) : null;
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      const owners = await usersCollection.find(
        { _id: { $in: ownerObjectIds } },
        { projection: { _id: 1, name: 1 } }
      ).toArray();

      const ownerNameMap = {};
      for (const owner of owners) {
        ownerNameMap[owner._id.toString()] = owner.name;
      }

      // 고객 이름 조회
      const customerObjectIds = customerIds
        .map(id => {
          try {
            return ObjectId.isValid(id) ? new ObjectId(id) : null;
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      const customers = await customersCollection.find(
        { _id: { $in: customerObjectIds } },
        { projection: { _id: 1, 'personal_info.name': 1 } }
      ).toArray();

      const customerNameMap = {};
      for (const customer of customers) {
        customerNameMap[customer._id.toString()] = customer.personal_info?.name;
      }

      // 응답 데이터 구성
      const documents = failedDocs.map(doc => ({
        _id: doc._id.toString(),
        originalName: doc.upload?.originalName || '(이름 없음)',
        ownerId: doc.ownerId || '',
        ownerName: ownerNameMap[doc.ownerId] || doc.ownerId || '(알 수 없음)',
        customerId: doc.customerId?.toString() || '',
        customerName: customerNameMap[doc.customerId?.toString()] || '(알 수 없음)',
        status: doc.docembed?.status || '',
        errorCode: doc.docembed?.error_code || '',
        errorMessage: doc.docembed?.error_message || '',
        retryCount: doc.docembed?.retry_count || 0,
        failed_at: doc.docembed?.failed_at || doc.docembed?.updated_at || ''
      }));

      // 전체 실패 문서 수 (필터 적용)
      const totalCount = await filesCollection.countDocuments(matchCondition);

      // 임베딩 상태별 카운트 (전체 현황 파악용)
      const hasText = { 'meta.full_text': { $exists: true, $ne: '' } };
      const [totalDocs, doneCount, pendingCount, failedCount, skippedCount] = await Promise.all([
        filesCollection.countDocuments(hasText),
        filesCollection.countDocuments({ ...hasText, 'docembed.status': 'done' }),
        filesCollection.countDocuments({ ...hasText, $or: [
          { 'docembed.status': 'pending' },
          { 'docembed.status': { $exists: false } },
          { 'docembed': { $exists: false } }
        ]}),
        filesCollection.countDocuments({ ...hasText, $or: [
          { 'docembed.status': 'failed' },
          { 'docembed.status': 'error' }
        ]}),
        filesCollection.countDocuments({ ...hasText, 'docembed.status': 'skipped' })
      ]);

      res.json({
        success: true,
        data: {
          total_count: totalCount,
          summary: {
            total: totalDocs,
            done: doneCount,
            pending: pendingCount,
            failed: failedCount,
            skipped: skippedCount
          },
          documents
        }
      });
    } catch (error) {
      console.error('[GET /api/admin/embed/failed-documents] 오류:', error);
      backendLogger.error('EmbedUsage', '임베딩 실패 문서 조회 오류', error);
      res.status(500).json({
        success: false,
        error: '임베딩 실패 문서 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * POST /api/admin/embed/reprocess
   * 임베딩 실패 문서 단건 재처리
   *
   * Body:
   * - document_id: string (필수)
   *
   * docembed.status를 'pending'으로 리셋하면 cron full_pipeline.py(매분)가 자동 픽업
   */
  router.post('/admin/embed/reprocess', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { document_id } = req.body;
      if (!document_id) {
        return res.status(400).json({ success: false, error: 'document_id가 필요합니다.' });
      }

      const filesCollection = db.collection('files');

      const doc = await filesCollection.findOne(
        { _id: new ObjectId(document_id) },
        { projection: { 'docembed': 1, 'upload.originalName': 1 } }
      );

      if (!doc) {
        return res.status(404).json({ success: false, error: '문서를 찾을 수 없습니다.' });
      }

      const currentStatus = doc.docembed?.status;
      if (currentStatus !== 'failed' && currentStatus !== 'error') {
        return res.status(400).json({
          success: false,
          error: `재처리 대상이 아닙니다. 현재 상태: ${currentStatus || '없음'}`
        });
      }

      const now = new Date().toISOString();

      // Admin 수동 재시도: retry_count를 0으로 리셋하여 자동 재시도 3회 기회 부여
      await filesCollection.updateOne(
        { _id: new ObjectId(document_id) },
        {
          $set: {
            'docembed.status': 'pending',
            'docembed.queued_at': now,
            'docembed.retry_count': 0,
            'docembed.last_retry_at': now
          },
          $unset: {
            'docembed.error_code': '',
            'docembed.error_message': '',
            'docembed.failed_at': ''
          }
        }
      );

      console.log(`[POST /api/admin/embed/reprocess] 재처리 요청: ${document_id} (retry_count 초기화)`);

      res.json({
        success: true,
        message: '임베딩 재처리가 요청되었습니다. 1분 내 자동 처리됩니다.',
        data: {
          document_id,
          originalName: doc.upload?.originalName || '',
          retry_count: 0,
          queued_at: now
        }
      });
    } catch (error) {
      console.error('[POST /api/admin/embed/reprocess] 오류:', error);
      backendLogger.error('EmbedUsage', '임베딩 단건 재처리 오류', error);
      res.status(500).json({ success: false, error: '임베딩 재처리에 실패했습니다.', details: error.message });
    }
  });

  /**
   * POST /api/admin/embed/reprocess-all
   * 임베딩 실패 문서 일괄 재처리
   *
   * Body:
   * - errorCode: string (선택, 특정 에러코드만 필터)
   * - maxRetry: number (기본값: 3, 재시도 최대 횟수)
   *
   * 모든 failed/error 문서의 status를 'pending'으로 리셋
   */
  router.post('/admin/embed/reprocess-all', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { errorCode } = req.body;

      const filesCollection = db.collection('files');

      // Admin 수동 재시도: retry_count 제한 없이 모든 failed/error 문서 대상
      const matchCondition = {
        $or: [
          { 'docembed.status': 'failed' },
          { 'docembed.status': 'error' }
        ]
      };

      if (errorCode) {
        matchCondition['docembed.error_code'] = errorCode;
      }

      const totalCount = await filesCollection.countDocuments(matchCondition);

      if (totalCount === 0) {
        return res.json({
          success: true,
          message: '재처리할 실패 문서가 없습니다.',
          data: { total_count: 0, reset_count: 0 }
        });
      }

      const now = new Date().toISOString();

      // Admin 수동 재시도: retry_count를 0으로 리셋하여 자동 재시도 3회 기회 부여
      const result = await filesCollection.updateMany(
        matchCondition,
        {
          $set: {
            'docembed.status': 'pending',
            'docembed.queued_at': now,
            'docembed.retry_count': 0,
            'docembed.last_retry_at': now
          },
          $unset: {
            'docembed.error_code': '',
            'docembed.error_message': '',
            'docembed.failed_at': ''
          }
        }
      );

      const resetCount = result.modifiedCount;

      console.log(`[POST /api/admin/embed/reprocess-all] 일괄 재처리: ${resetCount}건 리셋 (retry_count 초기화)`);

      res.json({
        success: true,
        message: `${resetCount}건의 문서가 재처리 대기열에 등록되었습니다. 1분 내 자동 처리됩니다.`,
        data: {
          total_count: totalCount,
          reset_count: resetCount
        }
      });
    } catch (error) {
      console.error('[POST /api/admin/embed/reprocess-all] 오류:', error);
      backendLogger.error('EmbedUsage', '임베딩 일괄 재처리 오류', error);
      res.status(500).json({ success: false, error: '임베딩 일괄 재처리에 실패했습니다.', details: error.message });
    }
  });

  /**
   * POST /api/admin/ocr/reprocess
   * OCR 실패 문서 재처리
   *
   * Body:
   * - document_id: string (필수)
   *
   * 처리 로직:
   * 1. files 컬렉션에서 해당 문서 조회
   * 2. ocr.status가 'error'인지 확인
   * 3. Redis XADD로 ocr_stream에 재등록
   * 4. ocr 상태 업데이트
   */
  router.post('/admin/ocr/reprocess', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { document_id } = req.body;

      if (!document_id || !ObjectId.isValid(document_id)) {
        return res.status(400).json({
          success: false,
          error: '유효한 document_id가 필요합니다.'
        });
      }

      const filesCollection = db.collection('files');

      // 문서 조회
      const document = await filesCollection.findOne({
        _id: new ObjectId(document_id)
      });

      if (!document) {
        return res.status(404).json({
          success: false,
          error: '문서를 찾을 수 없습니다.'
        });
      }

      // OCR 실패 상태 확인
      if (document.ocr?.status !== 'error') {
        return res.status(400).json({
          success: false,
          error: 'OCR 실패 상태인 문서만 재처리할 수 있습니다.',
          current_status: document.ocr?.status
        });
      }

      // 파일 경로 확인
      const filePath = document.upload?.destPath;
      if (!filePath) {
        return res.status(400).json({
          success: false,
          error: '문서의 파일 경로를 찾을 수 없습니다.'
        });
      }

      // Redis XADD 실행
      const now = new Date().toISOString();
      try {
        await redis.connect().catch(() => {}); // 이미 연결되어 있으면 무시
        const messageId = await redis.xadd(
          'ocr_stream',
          '*',
          'file_id', document_id,
          'file_path', filePath,
          'doc_id', document_id,
          'owner_id', document.ownerId || '',
          'queued_at', now
        );
        console.log('[OCR Reprocess] Redis XADD 성공:', messageId);
      } catch (redisError) {
        console.error('[OCR Reprocess] Redis XADD 오류:', redisError.message);
        throw new Error(`Redis XADD 실패: ${redisError.message}`);
      }

      // MongoDB 상태 업데이트
      const retryCount = (document.ocr?.retry_count || 0) + 1;
      await filesCollection.updateOne(
        { _id: new ObjectId(document_id) },
        {
          $set: {
            'ocr.status': 'queued',
            'ocr.queued_at': now,
            'ocr.retry_count': retryCount,
            'ocr.last_retry_at': now
          },
          $unset: {
            'ocr.failed_at': '',
            'ocr.statusCode': '',
            'ocr.statusMessage': '',
            'ocr.errorBody': ''
          }
        }
      );

      console.log(`[OCR Reprocess] 문서 ${document_id} 재처리 큐 등록 완료 (재시도 ${retryCount}회)`);

      res.json({
        success: true,
        message: 'OCR 재처리가 요청되었습니다.',
        data: {
          document_id,
          retry_count: retryCount,
          queued_at: now
        }
      });
    } catch (error) {
      console.error('[POST /api/admin/ocr/reprocess] 오류:', error);
      backendLogger.error('OcrUsage', 'OCR 재처리 요청 오류', error);
      res.status(500).json({
        success: false,
        error: 'OCR 재처리 요청에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * POST /api/admin/ocr/reprocess-all
   * 모든 OCR 실패 문서 일괄 재처리 (429 에러 등)
   *
   * Query:
   * - statusCode: string (선택, 특정 에러 코드만 필터링, 예: '429')
   * - interval: number (기본값: 5000, 문서 간 간격 ms, 429 방지용)
   * - maxRetry: number (기본값: 3, 최대 재시도 횟수 초과 시 제외)
   *
   * 처리 로직:
   * 1. OCR 실패 문서 전체 조회
   * 2. 순차적으로 interval 간격으로 Redis에 재등록
   * 3. 결과 반환
   */
  router.post('/admin/ocr/reprocess-all', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { statusCode, interval = 5000, maxRetry = 3 } = req.body;

      const filesCollection = db.collection('files');

      // 쿼리 조건
      const matchCondition = {
        'ocr.status': 'error',
        $or: [
          { 'ocr.retry_count': { $exists: false } },
          { 'ocr.retry_count': { $lt: maxRetry } }
        ]
      };
      if (statusCode) {
        matchCondition['ocr.statusCode'] = statusCode;
      }

      // 실패 문서 조회
      const failedDocs = await filesCollection.find(matchCondition)
        .sort({ 'ocr.failed_at': 1 }) // 오래된 것부터
        .project({
          _id: 1,
          'upload.originalName': 1,
          'upload.destPath': 1,
          ownerId: 1,
          'ocr.retry_count': 1
        })
        .toArray();

      if (failedDocs.length === 0) {
        return res.json({
          success: true,
          message: '재처리할 실패 문서가 없습니다.',
          data: { queued_count: 0 }
        });
      }

      const now = new Date().toISOString();
      const results = [];

      // Redis 연결
      try {
        await redis.connect().catch(() => {});
      } catch {
        // 이미 연결된 경우 무시
      }

      // 순차적으로 큐에 추가 (interval 간격)
      for (let i = 0; i < failedDocs.length; i++) {
        const doc = failedDocs[i];
        const documentId = doc._id.toString();
        const filePath = doc.upload?.destPath;

        if (!filePath) {
          results.push({ document_id: documentId, success: false, reason: 'no_file_path' });
          continue;
        }

        try {
          // Redis XADD
          const messageId = await redis.xadd(
            'ocr_stream',
            '*',
            'file_id', documentId,
            'file_path', filePath,
            'doc_id', documentId,
            'owner_id', doc.ownerId || '',
            'queued_at', now
          );

          // MongoDB 상태 업데이트
          const retryCount = (doc.ocr?.retry_count || 0) + 1;
          await filesCollection.updateOne(
            { _id: doc._id },
            {
              $set: {
                'ocr.status': 'queued',
                'ocr.queued_at': now,
                'ocr.retry_count': retryCount,
                'ocr.last_retry_at': now
              },
              $unset: {
                'ocr.failed_at': '',
                'ocr.statusCode': '',
                'ocr.statusMessage': '',
                'ocr.errorBody': ''
              }
            }
          );

          results.push({
            document_id: documentId,
            originalName: doc.upload?.originalName,
            success: true,
            retry_count: retryCount,
            message_id: messageId
          });

          console.log(`[OCR Reprocess All] ${i + 1}/${failedDocs.length} ${doc.upload?.originalName} 큐 등록 완료`);

          // 마지막 문서가 아니면 interval만큼 대기 (429 방지)
          if (i < failedDocs.length - 1 && interval > 0) {
            await new Promise(resolve => setTimeout(resolve, interval));
          }
        } catch (err) {
          results.push({
            document_id: documentId,
            originalName: doc.upload?.originalName,
            success: false,
            reason: err.message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      console.log(`[OCR Reprocess All] 완료: ${successCount}건 성공, ${failCount}건 실패`);

      res.json({
        success: true,
        message: `${successCount}건의 문서가 재처리 큐에 등록되었습니다.`,
        data: {
          total_count: failedDocs.length,
          queued_count: successCount,
          failed_count: failCount,
          interval_ms: interval,
          results
        }
      });
    } catch (error) {
      console.error('[POST /api/admin/ocr/reprocess-all] 오류:', error);
      backendLogger.error('OcrUsage', 'OCR 일괄 재처리 요청 오류', error);
      res.status(500).json({
        success: false,
        error: 'OCR 일괄 재처리 요청에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * POST /api/internal/ocr/log-usage
   * OCR 사용량 기록 (n8n 워크플로우에서 호출)
   *
   * 문서 삭제와 관계없이 OCR 사용량을 영구 보존하기 위해
   * 별도 컬렉션(ocr_usage_log)에 기록합니다.
   *
   * Body:
   * - file_id: string (필수) - 문서 ID
   * - owner_id: string (필수) - 소유자 ID
   * - page_count: number (기본값: 1) - 처리된 페이지 수
   * - status: 'done' | 'error' (필수) - 처리 결과
   * - processed_at: string (ISO 날짜) - 처리 완료 시각
   * - error_code: string (선택) - 에러 코드
   * - error_message: string (선택) - 에러 메시지
   * - metadata: object (선택) - 추가 메타데이터
   *
   * @internal 내부 API - n8n 전용
   */
  router.post('/internal/ocr/log-usage', async (req, res) => {
    try {
      const {
        file_id,
        owner_id,
        page_count = 1,
        status,
        processed_at,
        error_code,
        error_message,
        metadata = {}
      } = req.body;

      // 필수 파라미터 검증
      if (!file_id || !owner_id || !status) {
        return res.status(400).json({
          success: false,
          error: 'file_id, owner_id, status는 필수입니다.'
        });
      }

      if (!['done', 'error'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: "status는 'done' 또는 'error'만 허용됩니다."
        });
      }

      const result = await ocrUsageLogService.logOcrUsage(analyticsDb, {
        file_id,
        owner_id,
        page_count,
        status,
        processed_at,
        error_code,
        error_message,
        metadata
      });

      console.log(`[OCR Usage Log] 기록 완료: file_id=${file_id}, status=${status}, pages=${page_count}`);

      // 🔄 에러 상태인 경우 자동 재시도 처리 (최대 3회)
      let retryScheduled = false;
      if (status === 'error') {
        try {
          const filesCollection = db.collection('files');
          const { ObjectId } = require('mongodb');
          const docId = ObjectId.isValid(file_id) ? new ObjectId(file_id) : file_id;

          const file = await filesCollection.findOne({ _id: docId });
          const retryCount = file?.ocr?.retry_count || 0;
          const filePath = file?.upload?.destPath;

          // 429 에러(Rate Limit)이거나 5xx 서버 에러인 경우만 재시도
          const isRetryableError = error_code === '429' ||
                                   (error_code && parseInt(error_code) >= 500);

          if (isRetryableError && retryCount < 3 && filePath) {
            const newRetryCount = retryCount + 1;
            const retryDelay = 10000 * newRetryCount; // 10초, 20초, 30초 (점진적 증가)

            console.log(`[OCR Auto Retry] ${file?.upload?.originalName} 재시도 예약 (${newRetryCount}/3, ${retryDelay/1000}초 후)`);

            // 비동기로 재시도 스케줄링 (응답 지연 없이)
            setTimeout(async () => {
              try {
                // Redis 연결
                try {
                  await redis.connect().catch(() => {});
                } catch {
                  // 이미 연결된 경우 무시
                }

                const now = new Date().toISOString();

                // Redis XADD
                await redis.xadd(
                  'ocr_stream',
                  '*',
                  'file_id', file_id,
                  'file_path', filePath,
                  'doc_id', file_id,
                  'owner_id', owner_id,
                  'queued_at', now
                );

                // MongoDB 상태 업데이트
                await filesCollection.updateOne(
                  { _id: docId },
                  {
                    $set: {
                      'ocr.status': 'queued',
                      'ocr.queued_at': now,
                      'ocr.retry_count': newRetryCount,
                      'ocr.last_retry_at': now
                    },
                    $unset: {
                      'ocr.failed_at': '',
                      'ocr.statusCode': '',
                      'ocr.statusMessage': '',
                      'ocr.errorBody': ''
                    }
                  }
                );

                console.log(`[OCR Auto Retry] ${file?.upload?.originalName} 재시도 큐 등록 완료 (${newRetryCount}/3)`);
              } catch (retryErr) {
                console.error(`[OCR Auto Retry] 재시도 실패:`, retryErr.message);
              }
            }, retryDelay);

            retryScheduled = true;
          } else if (retryCount >= 3) {
            console.log(`[OCR Auto Retry] ${file?.upload?.originalName} 최대 재시도 횟수 초과 (${retryCount}/3)`);
          }
        } catch (retryCheckErr) {
          console.error('[OCR Auto Retry] 재시도 체크 오류:', retryCheckErr.message);
        }
      }

      res.json({ ...result, retry_scheduled: retryScheduled });
    } catch (error) {
      console.error('[POST /api/internal/ocr/log-usage] 오류:', error);
      backendLogger.error('OcrUsage', 'OCR 사용량 기록 오류', error);
      res.status(500).json({
        success: false,
        error: 'OCR 사용량 기록에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * POST /api/internal/ocr/check-quota
   * OCR 전 크레딧 체크 (OCR 워커에서 호출)
   * 🔴 2026-02-05: 페이지 기반 한도 → 통합 크레딧 시스템으로 변경
   *
   * Body: { owner_id: string, page_count: number }
   * Response: { allowed: boolean, current_usage: number, quota: number, remaining: number, ... }
   *
   * @see docs/EMBEDDING_CREDIT_POLICY.md
   */
  router.post('/internal/ocr/check-quota', async (req, res) => {
    try {
      const { owner_id, page_count } = req.body;

      if (!owner_id || typeof page_count !== 'number') {
        return res.status(400).json({
          success: false,
          error: 'owner_id와 page_count(number)가 필요합니다.'
        });
      }

      // 🔴 통합 크레딧 시스템으로 체크 (OCR 페이지 = estimated_pages)
      // checkCreditForDocumentProcessing()는 OCR + 임베딩 크레딧을 함께 계산
      // OCR만 처리하는 경우에도 동일한 함수 사용 (일관성 유지)
      const creditCheck = await checkCreditForDocumentProcessing(db, analyticsDb, owner_id, page_count);

      // 응답 형식 변환 (하위 호환성 유지)
      // 기존: { current_usage, quota, remaining } (페이지 기반)
      // 변경: { credits_used, credit_quota, credits_remaining } (크레딧 기반)
      res.json({
        success: true,
        allowed: creditCheck.allowed,
        reason: creditCheck.reason,
        // 🔴 크레딧 기반 응답 (신규)
        credits_used: creditCheck.credits_used,
        credits_remaining: creditCheck.credits_remaining,
        credit_quota: creditCheck.credit_quota,
        estimated_credits: creditCheck.estimated_credits,
        // 🔴 하위 호환성 (기존 OCR 워커용) - 크레딧을 페이지로 환산
        // OCR 1페이지 = 2 크레딧이므로, quota / 2 = 페이지 수
        current_usage: Math.floor((creditCheck.credits_used || 0) / 2),
        quota: creditCheck.credit_quota === -1 ? -1 : Math.floor((creditCheck.credit_quota || 0) / 2),
        remaining: creditCheck.credits_remaining === -1 ? -1 : Math.floor((creditCheck.credits_remaining || 0) / 2),
        requested: page_count,
        // 사이클 정보
        cycle_start: creditCheck.cycle_start,
        cycle_end: creditCheck.cycle_end,
        days_until_reset: creditCheck.days_until_reset,
        // 추가 정보
        is_first_month: creditCheck.is_first_month,
        pro_rata_ratio: creditCheck.pro_rata_ratio
      });
    } catch (error) {
      console.error('[POST /api/internal/ocr/check-quota] 오류:', error);
      backendLogger.error('OcrUsage', 'OCR 크레딧 체크 오류', error);
      // 오류 시 OCR 허용 (fail-open 정책)
      res.json({
        success: true,
        allowed: true,
        reason: 'error_fallback',
        message: '크레딧 체크 중 오류 발생, 기본 허용',
        error: error.message
      });
    }
  });

  return router;
};
