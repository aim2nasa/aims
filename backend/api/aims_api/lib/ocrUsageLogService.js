/**
 * ocrUsageLogService.js
 * OCR 사용량 영구 로깅 서비스
 *
 * @since 2025-12-23
 * @issue 문서 삭제 시 OCR 사용량 기록이 손실되는 문제 해결
 *
 * OCR API 호출 기록을 별도 컬렉션(ocr_usage_log)에 저장하여
 * 문서 삭제와 관계없이 사용량 기록을 영구 보존합니다.
 */

const { ObjectId } = require('mongodb');

/**
 * OCR 사용량 로그 저장
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 * @param {Object} data - 로깅 데이터
 * @returns {Promise<Object>} 저장 결과
 */
async function logOcrUsage(analyticsDb, data) {
  const {
    file_id,
    owner_id,
    page_count = 1,
    status,  // 'done' | 'error'
    processed_at,
    error_code = null,
    error_message = null,
    metadata = {}
  } = data;

  const document = {
    file_id,
    owner_id,
    page_count,
    status,
    processed_at: processed_at ? new Date(processed_at) : new Date(),
    error_code,
    error_message,
    metadata,
    created_at: new Date()
  };

  const collection = analyticsDb.collection('ocr_usage_log');
  await collection.insertOne(document);

  return { success: true, logged: document };
}

/**
 * 기간별 OCR 사용량 통계 조회
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 * @param {Date} startDate - 시작일
 * @param {Date} endDate - 종료일
 * @returns {Promise<Object>} 통계
 */
async function getOcrUsageStats(analyticsDb, startDate, endDate) {
  const collection = analyticsDb.collection('ocr_usage_log');

  const [
    totalResult,
    successResult,
    failedResult,
    activeUsersResult
  ] = await Promise.all([
    // 전체 처리 건수 (성공+실패)
    collection.countDocuments({
      processed_at: { $gte: startDate, $lte: endDate }
    }),
    // 성공 건수 및 페이지 수
    collection.aggregate([
      {
        $match: {
          status: 'done',
          processed_at: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          total_pages: { $sum: '$page_count' }
        }
      }
    ]).toArray(),
    // 실패 건수
    collection.countDocuments({
      status: 'error',
      processed_at: { $gte: startDate, $lte: endDate }
    }),
    // 활성 사용자 수
    collection.aggregate([
      {
        $match: {
          status: 'done',
          processed_at: { $gte: startDate, $lte: endDate },
          owner_id: { $exists: true, $ne: null }
        }
      },
      { $group: { _id: '$owner_id' } },
      { $count: 'count' }
    ]).toArray()
  ]);

  const success = successResult[0] || { count: 0, total_pages: 0 };

  return {
    total_count: totalResult,
    success_count: success.count,
    failed_count: failedResult,
    page_count: success.total_pages,
    active_users: activeUsersResult[0]?.count || 0
  };
}

/**
 * 일별 OCR 사용량 조회
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 * @param {Date} startDate - 시작일
 * @param {Date} endDate - 종료일
 * @returns {Promise<Array>} 일별 데이터
 */
async function getDailyOcrUsage(analyticsDb, startDate, endDate) {
  const collection = analyticsDb.collection('ocr_usage_log');

  const pipeline = [
    {
      $match: {
        processed_at: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          date: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$processed_at',
              timezone: 'Asia/Seoul'
            }
          },
          status: '$status'
        },
        count: { $sum: 1 },
        page_count: { $sum: '$page_count' }
      }
    },
    { $sort: { '_id.date': 1 } }
  ];

  const results = await collection.aggregate(pipeline).toArray();

  // 날짜별로 정리
  const dateMap = new Map();
  for (const r of results) {
    const date = r._id.date;
    if (!dateMap.has(date)) {
      dateMap.set(date, { date, done: 0, error: 0, page_count: 0 });
    }
    const entry = dateMap.get(date);
    if (r._id.status === 'done') {
      entry.done = r.count;
      entry.page_count = r.page_count;
    } else if (r._id.status === 'error') {
      entry.error = r.count;
    }
  }

  // 빈 날짜 채우기
  const usageData = [];
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    usageData.push(dateMap.get(dateStr) || { date: dateStr, done: 0, error: 0, page_count: 0 });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return usageData;
}

/**
 * Top 사용자 조회
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 * @param {Date} startDate - 시작일
 * @param {Date} endDate - 종료일
 * @param {number} limit - 제한
 * @returns {Promise<Array>} Top 사용자 목록
 */
async function getTopOcrUsers(analyticsDb, startDate, endDate, limit = 10) {
  const collection = analyticsDb.collection('ocr_usage_log');

  const pipeline = [
    {
      $match: {
        status: 'done',
        processed_at: { $gte: startDate, $lte: endDate },
        owner_id: { $exists: true, $ne: null }
      }
    },
    {
      $group: {
        _id: '$owner_id',
        ocr_count: { $sum: 1 },
        page_count: { $sum: '$page_count' },
        last_ocr_at: { $max: '$processed_at' }
      }
    },
    { $sort: { ocr_count: -1 } },
    { $limit: limit }
  ];

  return await collection.aggregate(pipeline).toArray();
}

/**
 * 인덱스 생성
 * @param {Db} analyticsDb - MongoDB aims_analytics 인스턴스
 */
async function ensureIndexes(analyticsDb) {
  const collection = analyticsDb.collection('ocr_usage_log');

  await collection.createIndex({ processed_at: -1 });
  await collection.createIndex({ owner_id: 1, processed_at: -1 });
  await collection.createIndex({ file_id: 1 }, { unique: true, sparse: true });
  await collection.createIndex({ status: 1, processed_at: -1 });

  console.log('[OcrUsageLogService] 인덱스 생성 완료');
}

module.exports = {
  logOcrUsage,
  getOcrUsageStats,
  getDailyOcrUsage,
  getTopOcrUsers,
  ensureIndexes
};
