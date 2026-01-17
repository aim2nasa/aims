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
  'gpt-4o': { input: 0.0025, output: 0.01 },  // GPT-4o (채팅용)
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
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
 * @param {Date} startDate - 시작일
 * @param {Date} endDate - 종료일
 * @returns {Promise<Object>} 시스템 통계
 */
async function getSystemOverview(analyticsDb, startDate, endDate) {
  const collection = analyticsDb.collection('ai_token_usage');

  // 전체 통계
  const totalPipeline = [
    { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
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
    { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
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
    { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
    { $group: { _id: '$user_id' } },
    { $count: 'count' }
  ];

  // Top 사용자
  const topUsersPipeline = [
    { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
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

  // 기간 일수 계산
  const periodDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

  return {
    period_days: periodDays,
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
 * 10분 단위로 집계하여 더 세밀한 추이 표시
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 * @param {number} hours - 조회 기간 (시간)
 * @returns {Promise<Array>} 시간별 사용량 (소스별)
 */
async function getHourlyUsageBySource(analyticsDb, hours = 24) {
  const collection = analyticsDb.collection('ai_token_usage');
  const now = new Date();
  const since = new Date(now);
  since.setHours(since.getHours() - hours);

  // 10분 단위로 집계 (HH:M0 형식 - 분의 십의 자리만)
  const pipeline = [
    { $match: { timestamp: { $gte: since } } },
    {
      $group: {
        _id: {
          timestamp: {
            $dateToString: {
              format: '%Y-%m-%dT%H:%M',
              date: {
                $dateFromParts: {
                  year: { $year: { date: '$timestamp', timezone: 'Asia/Seoul' } },
                  month: { $month: { date: '$timestamp', timezone: 'Asia/Seoul' } },
                  day: { $dayOfMonth: { date: '$timestamp', timezone: 'Asia/Seoul' } },
                  hour: { $hour: { date: '$timestamp', timezone: 'Asia/Seoul' } },
                  minute: {
                    $multiply: [
                      { $floor: { $divide: [{ $minute: { date: '$timestamp', timezone: 'Asia/Seoul' } }, 10] } },
                      10
                    ]
                  }
                }
              }
              // timezone 제거: $dateFromParts가 이미 KST 구성요소로 생성했으므로 추가 변환 불필요
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

  // 실제 데이터를 맵에 저장
  const dataMap = new Map();
  for (const r of results) {
    const ts = r._id.timestamp + ':00'; // HH:MM:00 형식으로
    const source = r._id.source;

    if (!dataMap.has(ts)) {
      dataMap.set(ts, { chat: 0, rag_api: 0, n8n_docsummary: 0, doc_embedding: 0, doc_summary: 0 });
    }

    const entry = dataMap.get(ts);
    if (source === 'chat') {
      entry.chat = r.total_tokens;
    } else if (source === 'rag_api') {
      entry.rag_api = r.total_tokens;
    } else if (source === 'n8n_docsummary' || source === 'doc_summary') {
      // n8n_docsummary (레거시)와 doc_summary (FastAPI) 합산
      entry.n8n_docsummary += r.total_tokens;
      entry.doc_summary += r.total_tokens;
    } else if (source === 'doc_embedding') {
      entry.doc_embedding = r.total_tokens;
    }
  }

  // 모든 10분 단위 슬롯 생성 (KST 기준)
  const intervalMinutes = 10;
  const totalSlots = Math.ceil(hours * 60 / intervalMinutes);
  const usageData = [];

  // KST 타임스탬프 포맷팅 함수
  const formatKSTTimestamp = (date) => {
    const kstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    const year = kstDate.getUTCFullYear();
    const month = String(kstDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(kstDate.getUTCDate()).padStart(2, '0');
    const hour = String(kstDate.getUTCHours()).padStart(2, '0');
    const minute = String(Math.floor(kstDate.getUTCMinutes() / 10) * 10).padStart(2, '0');
    return `${year}-${month}-${day}T${hour}:${minute}:00`;
  };

  for (let i = totalSlots; i >= 0; i--) {
    const slotTime = new Date(now.getTime() - i * intervalMinutes * 60 * 1000);
    const ts = formatKSTTimestamp(slotTime);

    const data = dataMap.get(ts) || { chat: 0, rag_api: 0, n8n_docsummary: 0, doc_embedding: 0, doc_summary: 0 };

    usageData.push({
      timestamp: ts,
      chat: data.chat,
      rag_api: data.rag_api,
      n8n_docsummary: data.n8n_docsummary,
      doc_summary: data.doc_summary,
      doc_embedding: data.doc_embedding,
      total: data.chat + data.rag_api + data.n8n_docsummary + data.doc_embedding
    });
  }

  // 중복 제거
  const uniqueMap = new Map();
  for (const item of usageData) {
    if (!uniqueMap.has(item.timestamp)) {
      uniqueMap.set(item.timestamp, item);
    }
  }

  return Array.from(uniqueMap.values()).sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp)
  );
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
 * Top 사용자 목록 조회 - 날짜 범위 버전 (관리자용)
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 * @param {Date} startDate - 시작일
 * @param {Date} endDate - 종료일
 * @param {number} limit - 사용자 수 제한
 * @returns {Promise<Array>} Top 사용자 목록
 */
async function getTopUsersWithRange(analyticsDb, startDate, endDate, limit = 10) {
  const collection = analyticsDb.collection('ai_token_usage');

  const pipeline = [
    { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
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
 * 일별 AI 토큰 사용량 조회 - 날짜 범위 버전 (관리자용)
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 * @param {Date} startDate - 시작일
 * @param {Date} endDate - 종료일
 * @returns {Promise<Array>} 일별 사용량
 */
async function getDailyUsageByRange(analyticsDb, startDate, endDate) {
  const collection = analyticsDb.collection('ai_token_usage');

  const pipeline = [
    { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp', timezone: 'Asia/Seoul' } },
          source: '$source'
        },
        total_tokens: { $sum: '$total_tokens' },
        estimated_cost_usd: { $sum: '$estimated_cost_usd' },
        request_count: { $sum: 1 }
      }
    },
    { $sort: { '_id.date': 1 } }
  ];

  const results = await collection.aggregate(pipeline).toArray();

  // 날짜별로 소스별 데이터 집계
  const dateMap = new Map();
  for (const r of results) {
    const date = r._id.date;
    const source = r._id.source;

    if (!dateMap.has(date)) {
      dateMap.set(date, {
        date,
        chat: 0,
        rag_api: 0,
        n8n_docsummary: 0,
        doc_summary: 0,
        doc_embedding: 0,
        total_tokens: 0,
        estimated_cost_usd: 0,
        request_count: 0
      });
    }

    const entry = dateMap.get(date);
    if (source === 'chat') {
      entry.chat = r.total_tokens;
    } else if (source === 'rag_api') {
      entry.rag_api = r.total_tokens;
    } else if (source === 'n8n_docsummary' || source === 'doc_summary') {
      // n8n_docsummary (레거시)와 doc_summary (FastAPI) 합산
      entry.n8n_docsummary += r.total_tokens;
      entry.doc_summary += r.total_tokens;
    } else if (source === 'doc_embedding') {
      entry.doc_embedding = r.total_tokens;
    }
    entry.total_tokens += r.total_tokens;
    entry.estimated_cost_usd += r.estimated_cost_usd;
    entry.request_count += r.request_count;
  }

  return Array.from(dateMap.values()).map(d => ({
    ...d,
    estimated_cost_usd: Math.round(d.estimated_cost_usd * 1000000) / 1000000
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
  getDailyUsageByRange,
  getSystemOverview,
  getTopUsers,
  getTopUsersWithRange,
  getHourlyUsageBySource,
  formatCost,
  formatTokens,
  ensureIndexes,
  calculateCost,
  TOKEN_COSTS
};
