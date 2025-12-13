/**
 * tokenUsageService.js
 * AI 토큰 사용량 추적 서비스
 * @since 1.0.0
 */

const { ObjectId } = require('mongodb');

// 토큰 비용 (USD per 1K tokens)
const TOKEN_COSTS = {
  'text-embedding-3-small': { input: 0.00002, output: 0 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'gpt-4.1-mini': { input: 0.0004, output: 0.0016 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'default': { input: 0.001, output: 0.002 }
};

/**
 * 토큰 비용 계산
 * @param {string} model - 모델명
 * @param {number} promptTokens - 입력 토큰 수
 * @param {number} completionTokens - 출력 토큰 수
 * @returns {number} 예상 비용 (USD)
 */
function calculateCost(model, promptTokens, completionTokens) {
  const costs = TOKEN_COSTS[model] || TOKEN_COSTS['default'];
  const inputCost = (promptTokens / 1000) * costs.input;
  const outputCost = (completionTokens / 1000) * costs.output;
  return Math.round((inputCost + outputCost) * 1000000) / 1000000; // 소수점 6자리까지
}

/**
 * 토큰 사용량 로깅
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 * @param {Object} data - 로깅 데이터
 */
async function logTokenUsage(analyticsDb, data) {
  const {
    user_id,
    source,
    request_id,
    model,
    prompt_tokens = 0,
    completion_tokens = 0,
    total_tokens,
    metadata = {}
  } = data;

  const totalTokens = total_tokens || (prompt_tokens + completion_tokens);
  const estimatedCost = calculateCost(model, prompt_tokens, completion_tokens);

  const document = {
    user_id,
    source,
    request_id: request_id || new ObjectId().toString(),
    timestamp: new Date(),
    model,
    prompt_tokens,
    completion_tokens,
    total_tokens: totalTokens,
    estimated_cost_usd: estimatedCost,
    metadata
  };

  const collection = analyticsDb.collection('ai_token_usage');
  await collection.insertOne(document);

  return {
    success: true,
    logged: {
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCost
    }
  };
}

/**
 * 사용자의 AI 토큰 사용량 조회
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 * @param {string} userId - 사용자 ID
 * @param {number} days - 조회 기간 (일)
 * @returns {Promise<Object>} 사용량 통계
 */
async function getUserTokenUsage(analyticsDb, userId, days = 30) {
  const collection = analyticsDb.collection('ai_token_usage');
  const since = new Date();
  since.setDate(since.getDate() - days);

  const pipeline = [
    {
      $match: {
        user_id: userId,
        timestamp: { $gte: since }
      }
    },
    {
      $group: {
        _id: '$source',
        total_tokens: { $sum: '$total_tokens' },
        prompt_tokens: { $sum: '$prompt_tokens' },
        completion_tokens: { $sum: '$completion_tokens' },
        estimated_cost_usd: { $sum: '$estimated_cost_usd' },
        request_count: { $sum: 1 }
      }
    }
  ];

  const results = await collection.aggregate(pipeline).toArray();

  // 소스별 데이터 정리
  const bySource = {};
  let totalTokens = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let estimatedCostUsd = 0;
  let requestCount = 0;

  for (const result of results) {
    bySource[result._id] = result.total_tokens;
    totalTokens += result.total_tokens;
    promptTokens += result.prompt_tokens;
    completionTokens += result.completion_tokens;
    estimatedCostUsd += result.estimated_cost_usd;
    requestCount += result.request_count;
  }

  return {
    period_days: days,
    total_tokens: totalTokens,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    estimated_cost_usd: Math.round(estimatedCostUsd * 1000000) / 1000000,
    request_count: requestCount,
    by_source: bySource
  };
}

/**
 * 사용자의 일별 AI 토큰 사용량 조회 (그래프용)
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 * @param {string} userId - 사용자 ID
 * @param {number} days - 조회 기간 (일)
 * @returns {Promise<Array>} 일별 사용량
 */
async function getDailyUsage(analyticsDb, userId, days = 30) {
  const collection = analyticsDb.collection('ai_token_usage');
  const since = new Date();
  since.setDate(since.getDate() - days);

  const matchStage = userId
    ? { user_id: userId, timestamp: { $gte: since } }
    : { timestamp: { $gte: since } };

  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$timestamp', timezone: 'Asia/Seoul' }
        },
        total_tokens: { $sum: '$total_tokens' },
        estimated_cost_usd: { $sum: '$estimated_cost_usd' },
        request_count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ];

  const results = await collection.aggregate(pipeline).toArray();

  // 결과를 date 형식으로 변환
  return results.map(r => ({
    date: r._id,
    total_tokens: r.total_tokens,
    estimated_cost_usd: Math.round(r.estimated_cost_usd * 1000000) / 1000000,
    request_count: r.request_count
  }));
}

/**
 * 시스템 전체 AI 토큰 사용량 통계 (관리자용)
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 * @param {number} days - 조회 기간 (일)
 * @returns {Promise<Object>} 시스템 통계
 */
async function getSystemOverview(analyticsDb, days = 30) {
  const collection = analyticsDb.collection('ai_token_usage');
  const since = new Date();
  since.setDate(since.getDate() - days);

  // 전체 통계
  const totalPipeline = [
    { $match: { timestamp: { $gte: since } } },
    {
      $group: {
        _id: null,
        total_tokens: { $sum: '$total_tokens' },
        prompt_tokens: { $sum: '$prompt_tokens' },
        completion_tokens: { $sum: '$completion_tokens' },
        estimated_cost_usd: { $sum: '$estimated_cost_usd' },
        request_count: { $sum: 1 }
      }
    }
  ];

  // 소스별 통계
  const bySourcePipeline = [
    { $match: { timestamp: { $gte: since } } },
    {
      $group: {
        _id: '$source',
        total_tokens: { $sum: '$total_tokens' },
        estimated_cost_usd: { $sum: '$estimated_cost_usd' },
        request_count: { $sum: 1 }
      }
    }
  ];

  // 사용자 수
  const userCountPipeline = [
    { $match: { timestamp: { $gte: since } } },
    { $group: { _id: '$user_id' } },
    { $count: 'count' }
  ];

  // Top 사용자
  const topUsersPipeline = [
    { $match: { timestamp: { $gte: since } } },
    {
      $group: {
        _id: '$user_id',
        total_tokens: { $sum: '$total_tokens' },
        estimated_cost_usd: { $sum: '$estimated_cost_usd' },
        request_count: { $sum: 1 }
      }
    },
    { $sort: { total_tokens: -1 } },
    { $limit: 10 }
  ];

  const [totalResult, bySourceResult, userCountResult, topUsersResult] = await Promise.all([
    collection.aggregate(totalPipeline).toArray(),
    collection.aggregate(bySourcePipeline).toArray(),
    collection.aggregate(userCountPipeline).toArray(),
    collection.aggregate(topUsersPipeline).toArray()
  ]);

  const total = totalResult[0] || {
    total_tokens: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    estimated_cost_usd: 0,
    request_count: 0
  };

  // by_source는 토큰 수만 반환 (프론트엔드 호환)
  const bySource = {};
  for (const result of bySourceResult) {
    bySource[result._id] = result.total_tokens;
  }

  return {
    period_days: days,
    total_tokens: total.total_tokens,
    prompt_tokens: total.prompt_tokens,
    completion_tokens: total.completion_tokens,
    estimated_cost_usd: Math.round(total.estimated_cost_usd * 1000000) / 1000000,
    request_count: total.request_count,
    unique_users: userCountResult[0]?.count || 0,
    by_source: bySource,
    top_users: topUsersResult.map(u => ({
      user_id: u._id,
      total_tokens: u.total_tokens,
      estimated_cost_usd: Math.round(u.estimated_cost_usd * 1000000) / 1000000,
      request_count: u.request_count
    }))
  };
}

/**
 * 시간별 AI 토큰 사용량 조회 (소스별 분리, 라인 차트용)
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 * @param {number} hours - 조회 기간 (시간)
 * @returns {Promise<Array>} 시간별 사용량 (소스별)
 */
async function getHourlyUsageBySource(analyticsDb, hours = 24) {
  const collection = analyticsDb.collection('ai_token_usage');
  const since = new Date();
  since.setHours(since.getHours() - hours);

  const pipeline = [
    { $match: { timestamp: { $gte: since } } },
    {
      $group: {
        _id: {
          timestamp: {
            $dateToString: {
              format: '%Y-%m-%dT%H:00:00',
              date: '$timestamp',
              timezone: 'Asia/Seoul'
            }
          },
          source: '$source'
        },
        total_tokens: { $sum: '$total_tokens' },
        request_count: { $sum: 1 }
      }
    },
    { $sort: { '_id.timestamp': 1 } }
  ];

  const results = await collection.aggregate(pipeline).toArray();

  // 시간별로 그룹화하여 소스별 데이터 포함
  const hourlyMap = new Map();

  for (const r of results) {
    const ts = r._id.timestamp;
    const source = r._id.source;

    if (!hourlyMap.has(ts)) {
      hourlyMap.set(ts, {
        timestamp: ts,
        rag_api: 0,
        n8n_docsummary: 0,
        total: 0
      });
    }

    const entry = hourlyMap.get(ts);
    if (source === 'rag_api') {
      entry.rag_api = r.total_tokens;
    } else if (source === 'n8n_docsummary') {
      entry.n8n_docsummary = r.total_tokens;
    }
    entry.total += r.total_tokens;
  }

  return Array.from(hourlyMap.values());
}

/**
 * Top 사용자 목록 조회 (관리자용)
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 * @param {number} days - 조회 기간 (일)
 * @param {number} limit - 사용자 수 제한
 * @returns {Promise<Array>} Top 사용자 목록
 */
async function getTopUsers(analyticsDb, days = 30, limit = 10) {
  const collection = analyticsDb.collection('ai_token_usage');
  const since = new Date();
  since.setDate(since.getDate() - days);

  const pipeline = [
    { $match: { timestamp: { $gte: since } } },
    {
      $group: {
        _id: '$user_id',
        total_tokens: { $sum: '$total_tokens' },
        estimated_cost_usd: { $sum: '$estimated_cost_usd' },
        request_count: { $sum: 1 }
      }
    },
    { $sort: { total_tokens: -1 } },
    { $limit: limit }
  ];

  const results = await collection.aggregate(pipeline).toArray();

  return results.map(u => ({
    user_id: u._id,
    total_tokens: u.total_tokens,
    estimated_cost_usd: Math.round(u.estimated_cost_usd * 1000000) / 1000000,
    request_count: u.request_count
  }));
}

/**
 * 비용 포맷팅
 * @param {number} costUsd - 비용 (USD)
 * @returns {string} 포맷된 비용
 */
function formatCost(costUsd) {
  if (costUsd < 0.01) {
    return `$${costUsd.toFixed(6)}`;
  }
  return `$${costUsd.toFixed(4)}`;
}

/**
 * 토큰 수 포맷팅
 * @param {number} tokens - 토큰 수
 * @returns {string} 포맷된 토큰 수
 */
function formatTokens(tokens) {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(2)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * 인덱스 생성 (초기화 시 호출)
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 */
async function ensureIndexes(analyticsDb) {
  const collection = analyticsDb.collection('ai_token_usage');

  await collection.createIndex({ user_id: 1, timestamp: -1 });
  await collection.createIndex({ timestamp: -1 });
  await collection.createIndex({ source: 1, timestamp: -1 });

  console.log('[TokenUsageService] 인덱스 생성 완료');
}

module.exports = {
  logTokenUsage,
  getUserTokenUsage,
  getDailyUsage,
  getSystemOverview,
  getTopUsers,
  getHourlyUsageBySource,
  formatCost,
  formatTokens,
  ensureIndexes,
  calculateCost,
  TOKEN_COSTS
};
