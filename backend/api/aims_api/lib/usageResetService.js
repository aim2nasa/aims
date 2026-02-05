/**
 * usageResetService.js
 * AI/OCR 사용량 리셋 서비스
 *
 * @since 2026-02-06
 *
 * 기능:
 * - 사용량 리셋 실행 (스냅샷 생성 + 리셋 시점 기록)
 * - 리셋 이력 조회
 * - 마지막 리셋 시점 조회 (조회 쿼리 기준점)
 */

const { ObjectId } = require('mongodb');

// 컬렉션명 상수
const COLLECTION_NAME = 'usage_reset_history';

/**
 * 사용량 리셋 실행
 * - 현재 사용량을 스냅샷으로 저장
 * - 리셋 시점 기록 (이후 조회 시 기준점)
 *
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 * @param {Object} params - 리셋 파라미터
 * @param {string} params.resetType - 'all' | 'ai' | 'ocr'
 * @param {Object} params.resetBy - 리셋 실행자 정보
 * @param {string} params.resetBy.user_id - 관리자 ID
 * @param {string} params.resetBy.user_name - 관리자 이름
 * @param {string} params.resetBy.ip - IP 주소
 * @param {string} [params.reason] - 리셋 사유 (선택)
 * @param {Object} params.currentStats - 현재 통계 (스냅샷용)
 * @returns {Promise<Object>} 리셋 결과
 */
async function createUsageReset(analyticsDb, params) {
  const {
    resetType,
    resetBy,
    reason = null,
    currentStats
  } = params;

  // 이전 리셋 시점 조회 (스냅샷 기간 계산용)
  const lastReset = await getLastResetTime(analyticsDb, resetType);
  const periodStart = lastReset || new Date('2020-01-01');  // 리셋 없으면 시스템 시작일
  const periodEnd = new Date();

  // 스냅샷 문서 생성
  const resetDocument = {
    reset_type: resetType,
    reset_at: periodEnd,
    reset_by: {
      user_id: resetBy.user_id,
      user_name: resetBy.user_name,
      ip: resetBy.ip || 'unknown'
    },
    reason,
    snapshot: {
      ai: (resetType === 'all' || resetType === 'ai') ? {
        total_tokens: currentStats.ai?.total_tokens || 0,
        prompt_tokens: currentStats.ai?.prompt_tokens || 0,
        completion_tokens: currentStats.ai?.completion_tokens || 0,
        estimated_cost_usd: currentStats.ai?.estimated_cost_usd || 0,
        request_count: currentStats.ai?.request_count || 0,
        by_source: currentStats.ai?.by_source || {},
        period_start: periodStart,
        period_end: periodEnd
      } : null,
      ocr: (resetType === 'all' || resetType === 'ocr') ? {
        total_count: currentStats.ocr?.total_count || 0,
        success_count: currentStats.ocr?.success_count || 0,
        failed_count: currentStats.ocr?.failed_count || 0,
        page_count: currentStats.ocr?.page_count || 0,
        estimated_cost_usd: currentStats.ocr?.estimated_cost_usd || 0,
        period_start: periodStart,
        period_end: periodEnd
      } : null
    },
    user_snapshots: currentStats.user_snapshots || [],
    created_at: new Date()
  };

  const collection = analyticsDb.collection(COLLECTION_NAME);
  const result = await collection.insertOne(resetDocument);

  return {
    success: true,
    reset_id: result.insertedId.toString(),
    reset_at: periodEnd.toISOString(),
    reset_type: resetType,
    snapshot: resetDocument.snapshot,
    message: '사용량이 리셋되었습니다. 리셋 이전 데이터는 이력에서 확인할 수 있습니다.'
  };
}

/**
 * 리셋 이력 목록 조회
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 * @param {Object} options - 조회 옵션
 * @param {number} [options.limit=20] - 조회 개수
 * @param {number} [options.offset=0] - 시작 위치
 * @returns {Promise<Object>} 이력 목록
 */
async function getResetHistory(analyticsDb, options = {}) {
  const { limit = 20, offset = 0 } = options;
  const collection = analyticsDb.collection(COLLECTION_NAME);

  const [items, totalCount] = await Promise.all([
    collection.find({})
      .sort({ reset_at: -1 })
      .skip(offset)
      .limit(Math.min(limit, 100))
      .project({
        reset_type: 1,
        reset_at: 1,
        reset_by: 1,
        reason: 1,
        'snapshot.ai.total_tokens': 1,
        'snapshot.ai.estimated_cost_usd': 1,
        'snapshot.ocr.page_count': 1,
        'snapshot.ocr.estimated_cost_usd': 1
      })
      .toArray(),
    collection.countDocuments({})
  ]);

  return {
    total_count: totalCount,
    items: items.map(item => ({
      reset_id: item._id.toString(),
      reset_type: item.reset_type,
      reset_at: item.reset_at?.toISOString(),
      reset_by: {
        user_id: item.reset_by?.user_id,
        user_name: item.reset_by?.user_name
      },
      reason: item.reason,
      snapshot: {
        ai: item.snapshot?.ai ? {
          total_tokens: item.snapshot.ai.total_tokens,
          estimated_cost_usd: item.snapshot.ai.estimated_cost_usd
        } : null,
        ocr: item.snapshot?.ocr ? {
          page_count: item.snapshot.ocr.page_count,
          estimated_cost_usd: item.snapshot.ocr.estimated_cost_usd
        } : null
      }
    }))
  };
}

/**
 * 리셋 이력 상세 조회
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 * @param {string} resetId - 리셋 ID
 * @returns {Promise<Object|null>} 리셋 상세 정보
 */
async function getResetDetail(analyticsDb, resetId) {
  if (!ObjectId.isValid(resetId)) {
    return null;
  }

  const collection = analyticsDb.collection(COLLECTION_NAME);
  const item = await collection.findOne({ _id: new ObjectId(resetId) });

  if (!item) {
    return null;
  }

  return {
    reset_id: item._id.toString(),
    reset_type: item.reset_type,
    reset_at: item.reset_at?.toISOString(),
    reset_by: item.reset_by,
    reason: item.reason,
    snapshot: {
      ai: item.snapshot?.ai ? {
        total_tokens: item.snapshot.ai.total_tokens,
        prompt_tokens: item.snapshot.ai.prompt_tokens,
        completion_tokens: item.snapshot.ai.completion_tokens,
        estimated_cost_usd: item.snapshot.ai.estimated_cost_usd,
        request_count: item.snapshot.ai.request_count,
        by_source: item.snapshot.ai.by_source,
        period_start: item.snapshot.ai.period_start?.toISOString(),
        period_end: item.snapshot.ai.period_end?.toISOString()
      } : null,
      ocr: item.snapshot?.ocr ? {
        total_count: item.snapshot.ocr.total_count,
        success_count: item.snapshot.ocr.success_count,
        failed_count: item.snapshot.ocr.failed_count,
        page_count: item.snapshot.ocr.page_count,
        estimated_cost_usd: item.snapshot.ocr.estimated_cost_usd,
        period_start: item.snapshot.ocr.period_start?.toISOString(),
        period_end: item.snapshot.ocr.period_end?.toISOString()
      } : null
    },
    user_snapshots: item.user_snapshots || [],
    created_at: item.created_at?.toISOString()
  };
}

/**
 * 마지막 리셋 시점 조회
 * - 조회 쿼리에서 이 시점 이후 데이터만 집계하도록 사용
 *
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 * @param {string} type - 'ai' | 'ocr' | 'all'
 * @returns {Promise<Date|null>} 마지막 리셋 시점 또는 null
 */
async function getLastResetTime(analyticsDb, type = 'all') {
  const collection = analyticsDb.collection(COLLECTION_NAME);

  // type에 따른 쿼리 조건
  // 'all' 리셋은 ai와 ocr 모두에 적용
  const query = type === 'all'
    ? { reset_type: 'all' }
    : { reset_type: { $in: [type, 'all'] } };

  const lastReset = await collection.findOne(
    query,
    { sort: { reset_at: -1 }, projection: { reset_at: 1 } }
  );

  return lastReset?.reset_at || null;
}

/**
 * AI와 OCR 각각의 마지막 리셋 시점 조회
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 * @returns {Promise<Object>} { ai_last_reset, ocr_last_reset }
 */
async function getLastResetTimes(analyticsDb) {
  const [aiLastReset, ocrLastReset] = await Promise.all([
    getLastResetTime(analyticsDb, 'ai'),
    getLastResetTime(analyticsDb, 'ocr')
  ]);

  return {
    ai_last_reset: aiLastReset?.toISOString() || null,
    ocr_last_reset: ocrLastReset?.toISOString() || null
  };
}

/**
 * 인덱스 생성 (초기화 시 호출)
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 */
async function ensureIndexes(analyticsDb) {
  const collection = analyticsDb.collection(COLLECTION_NAME);

  await collection.createIndex({ reset_type: 1, reset_at: -1 });
  await collection.createIndex({ 'reset_by.user_id': 1, reset_at: -1 });
  await collection.createIndex({ reset_at: -1 });

  console.log('[UsageResetService] 인덱스 생성 완료');
}

module.exports = {
  createUsageReset,
  getResetHistory,
  getResetDetail,
  getLastResetTime,
  getLastResetTimes,
  ensureIndexes,
  COLLECTION_NAME
};
