/**
 * 에러 로거 서비스
 * 프론트엔드/백엔드 에러를 체계적으로 수집하여 관리자 대시보드에서 조회
 *
 * 기록 원칙:
 * - WHO: 누가 (에러 발생 사용자)
 * - WHEN: 언제 (타임스탬프)
 * - WHERE: 어디서 (소스 위치)
 * - WHAT: 무엇이 (에러 상세)
 * - CONTEXT: 맥락 (요청 정보)
 *
 * @since 2025-12-22
 */

const crypto = require('crypto');
const { ObjectId } = require('mongodb');

// 민감 정보 필드 목록
const SENSITIVE_FIELDS = [
  'password',
  'ssn',
  'resident_number',
  'phone',
  'mobile',
  'token',
  'secret',
  'apiKey',
  'api_key',
  'credit_card',
  'card_number',
  'authorization'
];

// 30일 = 30 * 24 * 60 * 60 초
const TTL_SECONDS = 2592000;

class ErrorLogger {
  constructor() {
    this.collection = null;
    this.initialized = false;
  }

  /**
   * ErrorLogger 초기화
   * @param {Db} analyticsDb - MongoDB analytics 데이터베이스
   */
  async initialize(analyticsDb) {
    if (this.initialized) {
      console.log('[ErrorLogger] 이미 초기화됨');
      return;
    }

    try {
      this.collection = analyticsDb.collection('error_logs');
      await this._createIndexes();
      this.initialized = true;
      console.log('[ErrorLogger] 초기화 완료');
    } catch (error) {
      console.error('[ErrorLogger] 초기화 실패:', error.message);
      throw error;
    }
  }

  /**
   * 인덱스 생성
   */
  async _createIndexes() {
    try {
      // 시간순 조회 (기본)
      await this.collection.createIndex({ timestamp: -1 });

      // 사용자별 에러 조회
      await this.collection.createIndex({ 'actor.user_id': 1, timestamp: -1 });

      // 심각도별 조회
      await this.collection.createIndex({ 'error.severity': 1, timestamp: -1 });

      // 소스 타입별 조회 (frontend/backend)
      await this.collection.createIndex({ 'source.type': 1, timestamp: -1 });

      // 에러 카테고리별 조회
      await this.collection.createIndex({ 'error.category': 1, timestamp: -1 });

      // 에러 타입별 조회
      await this.collection.createIndex({ 'error.type': 1, timestamp: -1 });

      // 30일 TTL (자동 삭제)
      await this.collection.createIndex(
        { timestamp: 1 },
        { expireAfterSeconds: TTL_SECONDS }
      );

      console.log('[ErrorLogger] 인덱스 생성 완료 (30일 TTL)');
    } catch (error) {
      console.error('[ErrorLogger] 인덱스 생성 실패:', error.message);
    }
  }

  /**
   * 에러 로그 기록
   * @param {Object} params - 로그 파라미터
   * @param {Object} params.actor - 사용자 정보
   * @param {Object} params.source - 에러 발생 위치
   * @param {Object} params.error - 에러 상세
   * @param {Object} params.context - 요청 컨텍스트
   * @param {Object} params.meta - 메타 정보 (선택)
   */
  async log({ actor = {}, source = {}, error = {}, context = {}, meta = {} }) {
    if (!this.collection) {
      console.warn('[ErrorLogger] 초기화되지 않음, 로그 스킵');
      return null;
    }

    const logEntry = {
      // WHO
      actor: {
        user_id: actor.user_id || actor.userId || null,
        name: actor.name || null,
        email: actor.email || null,
        role: actor.role || 'anonymous',
        ip_address: actor.ip || actor.ip_address || null,
        user_agent: actor.userAgent || actor.user_agent || null
      },

      // WHEN
      timestamp: new Date(),

      // WHERE
      source: {
        type: source.type || 'unknown', // 'frontend' | 'backend'
        endpoint: source.endpoint || null,
        method: source.method || null,
        component: source.component || null,
        url: source.url || null,
        file: source.file || null,
        line: source.line || null,
        column: source.column || null
      },

      // WHAT
      error: {
        type: error.type || 'Error',
        code: error.code || null,
        message: error.message || 'Unknown error',
        stack: error.stack || null,
        severity: this._normalizeSeverity(error.severity),
        category: this._normalizeCategory(error.category)
      },

      // CONTEXT
      context: {
        request_id: context.request_id || context.requestId || this._generateId(),
        session_id: context.session_id || context.sessionId || null,
        browser: context.browser || null,
        os: context.os || null,
        version: context.version || null,
        payload: this._maskSensitiveFields(context.payload),
        response_status: context.response_status || context.responseStatus || null,
        component_stack: context.componentStack || context.component_stack || null
      },

      // META (관리자용)
      meta: {
        resolved: meta.resolved || false,
        resolved_by: meta.resolved_by || meta.resolvedBy || null,
        resolved_at: meta.resolved_at || meta.resolvedAt || null,
        notes: meta.notes || null
      }
    };

    try {
      const result = await this.collection.insertOne(logEntry);
      return result.insertedId;
    } catch (err) {
      // 로깅 실패가 메인 로직을 방해하지 않도록 콘솔만 출력
      console.error('[ErrorLogger] 저장 실패:', err.message);
      return null;
    }
  }

  /**
   * 에러 로그 조회 (Admin용)
   * @param {Object} params - 조회 파라미터
   */
  async getLogs({
    userId,
    type,         // 'frontend' | 'backend'
    severity,     // 'low' | 'medium' | 'high' | 'critical'
    category,     // 'api' | 'network' | 'timeout' | 'validation' | 'runtime' | 'unhandled'
    errorType,    // 에러 클래스명 (ApiError, TypeError 등)
    startDate,
    endDate,
    search,
    resolved,
    sortBy = 'timestamp',  // 정렬 필드
    sortOrder = 'desc',    // 정렬 방향 ('asc' | 'desc')
    page = 1,
    limit = 50
  } = {}) {
    if (!this.collection) {
      throw new Error('ErrorLogger가 초기화되지 않았습니다');
    }

    const query = {};

    if (userId) {
      query['actor.user_id'] = userId;
    }
    if (type && type !== 'all') {
      query['source.type'] = type;
    }
    if (severity && severity !== 'all') {
      query['error.severity'] = severity;
    }
    if (category && category !== 'all') {
      query['error.category'] = category;
    }
    if (errorType) {
      query['error.type'] = errorType;
    }
    if (resolved !== undefined && resolved !== 'all') {
      query['meta.resolved'] = resolved === 'true' || resolved === true;
    }
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        query.timestamp.$lte = new Date(endDate);
      }
    }
    if (search) {
      query.$or = [
        { 'error.message': { $regex: search, $options: 'i' } },
        { 'error.type': { $regex: search, $options: 'i' } },
        { 'source.url': { $regex: search, $options: 'i' } },
        { 'source.endpoint': { $regex: search, $options: 'i' } },
        { 'actor.name': { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    // 정렬 필드 매핑 및 정렬 객체 생성
    const sortFieldMap = {
      timestamp: 'timestamp',
      source: 'source.type',
      severity: 'error.severity',
      type: 'error.type',
      message: 'error.message',
      user: 'actor.name'
    };
    const sortField = sortFieldMap[sortBy] || 'timestamp';
    const sortDirection = sortOrder === 'asc' ? 1 : -1;

    const [logs, total] = await Promise.all([
      this.collection
        .find(query)
        .sort({ [sortField]: sortDirection })
        .skip(skip)
        .limit(limit)
        .toArray(),
      this.collection.countDocuments(query)
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * 에러 통계 조회
   * @param {number} days - 조회 일수 (기본 7일)
   */
  async getStats(days = 7) {
    if (!this.collection) {
      throw new Error('ErrorLogger가 초기화되지 않았습니다');
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // 전체 통계
    const [
      totalCount,
      bySource,
      bySeverity,
      byCategory,
      byDay,
      topErrors
    ] = await Promise.all([
      // 전체 개수
      this.collection.countDocuments({ timestamp: { $gte: startDate } }),

      // 소스별 (frontend/backend)
      this.collection.aggregate([
        { $match: { timestamp: { $gte: startDate } } },
        { $group: { _id: '$source.type', count: { $sum: 1 } } }
      ]).toArray(),

      // 심각도별
      this.collection.aggregate([
        { $match: { timestamp: { $gte: startDate } } },
        { $group: { _id: '$error.severity', count: { $sum: 1 } } }
      ]).toArray(),

      // 카테고리별
      this.collection.aggregate([
        { $match: { timestamp: { $gte: startDate } } },
        { $group: { _id: '$error.category', count: { $sum: 1 } } }
      ]).toArray(),

      // 일별 추이
      this.collection.aggregate([
        { $match: { timestamp: { $gte: startDate } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]).toArray(),

      // 자주 발생하는 에러 Top 10
      this.collection.aggregate([
        { $match: { timestamp: { $gte: startDate } } },
        {
          $group: {
            _id: { type: '$error.type', message: '$error.message' },
            count: { $sum: 1 },
            lastOccurred: { $max: '$timestamp' }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]).toArray()
    ]);

    return {
      period: { days, startDate, endDate: new Date() },
      total: totalCount,
      bySource: this._arrayToObject(bySource),
      bySeverity: this._arrayToObject(bySeverity),
      byCategory: this._arrayToObject(byCategory),
      byDay,
      topErrors: topErrors.map(e => ({
        type: e._id.type,
        message: e._id.message?.substring(0, 100), // 메시지 길이 제한
        count: e.count,
        lastOccurred: e.lastOccurred
      }))
    };
  }

  /**
   * 에러 해결 표시
   * @param {string} errorId - 에러 로그 ID
   * @param {string} adminId - 관리자 ID
   * @param {string} notes - 해결 메모
   */
  async markResolved(errorId, adminId, notes = null) {
    if (!this.collection) {
      throw new Error('ErrorLogger가 초기화되지 않았습니다');
    }

    try {
      const result = await this.collection.updateOne(
        { _id: new ObjectId(errorId) },
        {
          $set: {
            'meta.resolved': true,
            'meta.resolved_by': adminId,
            'meta.resolved_at': new Date(),
            'meta.notes': notes
          }
        }
      );

      return result.modifiedCount > 0;
    } catch (error) {
      console.error('[ErrorLogger] 해결 표시 실패:', error.message);
      return false;
    }
  }

  /**
   * 개별 에러 로그 삭제
   * @param {string} errorId - 에러 로그 ID
   */
  async deleteLog(errorId) {
    if (!this.collection) {
      throw new Error('ErrorLogger가 초기화되지 않았습니다');
    }

    try {
      const result = await this.collection.deleteOne({ _id: new ObjectId(errorId) });
      return result.deletedCount > 0;
    } catch (error) {
      console.error('[ErrorLogger] 삭제 실패:', error.message);
      return false;
    }
  }

  /**
   * 일괄 에러 로그 삭제
   * @param {string[]} errorIds - 에러 로그 ID 배열
   */
  async deleteLogs(errorIds) {
    if (!this.collection) {
      throw new Error('ErrorLogger가 초기화되지 않았습니다');
    }

    try {
      const objectIds = errorIds
        .filter(id => ObjectId.isValid(id))
        .map(id => new ObjectId(id));

      if (objectIds.length === 0) {
        return 0;
      }

      const result = await this.collection.deleteMany({ _id: { $in: objectIds } });
      return result.deletedCount;
    } catch (error) {
      console.error('[ErrorLogger] 일괄 삭제 실패:', error.message);
      return 0;
    }
  }

  /**
   * 필터 조건으로 일괄 삭제
   * @param {Object} filter - 삭제 필터
   */
  async deleteByFilter(filter) {
    if (!this.collection) {
      throw new Error('ErrorLogger가 초기화되지 않았습니다');
    }

    const query = {};

    if (filter.type && filter.type !== 'all') {
      query['source.type'] = filter.type;
    }
    if (filter.severity && filter.severity !== 'all') {
      query['error.severity'] = filter.severity;
    }
    if (filter.startDate || filter.endDate) {
      query.timestamp = {};
      if (filter.startDate) {
        query.timestamp.$gte = new Date(filter.startDate);
      }
      if (filter.endDate) {
        query.timestamp.$lte = new Date(filter.endDate);
      }
    }

    // 빈 쿼리로 전체 삭제 방지
    if (Object.keys(query).length === 0) {
      console.warn('[ErrorLogger] 필터 없이 전체 삭제 시도 차단');
      return 0;
    }

    try {
      const result = await this.collection.deleteMany(query);
      return result.deletedCount;
    } catch (error) {
      console.error('[ErrorLogger] 필터 삭제 실패:', error.message);
      return 0;
    }
  }

  /**
   * 개별 에러 로그 조회
   * @param {string} errorId - 에러 로그 ID
   */
  async getLog(errorId) {
    if (!this.collection) {
      throw new Error('ErrorLogger가 초기화되지 않았습니다');
    }

    try {
      return await this.collection.findOne({ _id: new ObjectId(errorId) });
    } catch (error) {
      console.error('[ErrorLogger] 조회 실패:', error.message);
      return null;
    }
  }

  // ==================== Helper Methods ====================

  /**
   * 랜덤 ID 생성
   */
  _generateId() {
    return crypto.randomBytes(12).toString('hex');
  }

  /**
   * 심각도 정규화
   */
  _normalizeSeverity(severity) {
    const valid = ['low', 'medium', 'high', 'critical'];
    if (valid.includes(severity)) {
      return severity;
    }
    return 'medium'; // 기본값
  }

  /**
   * 카테고리 정규화
   */
  _normalizeCategory(category) {
    const valid = ['api', 'network', 'timeout', 'validation', 'runtime', 'unhandled'];
    if (valid.includes(category)) {
      return category;
    }
    return 'unhandled'; // 기본값
  }

  /**
   * 민감 정보 필드 마스킹
   */
  _maskSensitiveFields(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    const masked = { ...obj };

    for (const field of SENSITIVE_FIELDS) {
      if (masked[field] !== undefined) {
        masked[field] = '***MASKED***';
      }
    }

    // 중첩 객체도 처리
    for (const key of Object.keys(masked)) {
      if (masked[key] && typeof masked[key] === 'object' && !Array.isArray(masked[key])) {
        masked[key] = this._maskSensitiveFields(masked[key]);
      }
    }

    return masked;
  }

  /**
   * 집계 결과 배열을 객체로 변환
   */
  _arrayToObject(arr) {
    const obj = {};
    for (const item of arr) {
      obj[item._id || 'unknown'] = item.count;
    }
    return obj;
  }
}

// 싱글톤 인스턴스 export
module.exports = new ErrorLogger();
