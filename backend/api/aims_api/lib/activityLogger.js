/**
 * 사용자 활동 로거 서비스
 * 사용자의 모든 활동을 체계적으로 기록하여 장애 추적 및 운영 모니터링에 활용
 *
 * 기록 원칙:
 * - WHO: 누가 (사용자)
 * - WHEN: 언제 (타임스탬프)
 * - WHERE: 어디서 (메뉴/기능)
 * - WHAT: 무엇을 (액션)
 * - RESULT: 결과 (성공/오류)
 *
 * @since 2025-12-14
 */

const crypto = require('crypto');
const sseBroadcast = require('./sseBroadcast');

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
  'card_number'
];

class ActivityLogger {
  constructor() {
    this.collection = null;
    this.initialized = false;
  }

  /**
   * ActivityLogger 초기화
   * @param {Db} analyticsDb - MongoDB analytics 데이터베이스
   */
  async initialize(analyticsDb) {
    if (this.initialized) {
      console.log('[ActivityLogger] 이미 초기화됨');
      return;
    }

    try {
      this.collection = analyticsDb.collection('activity_logs');
      await this._createIndexes();
      this.initialized = true;
      console.log('[ActivityLogger] 초기화 완료');
    } catch (error) {
      console.error('[ActivityLogger] 초기화 실패:', error.message);
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

      // 사용자별 활동 조회
      await this.collection.createIndex({ 'actor.user_id': 1, timestamp: -1 });

      // 카테고리별 조회
      await this.collection.createIndex({ 'action.category': 1, timestamp: -1 });

      // 성공/실패별 조회
      await this.collection.createIndex({ 'result.success': 1, timestamp: -1 });

      // 90일 TTL (자동 삭제)
      await this.collection.createIndex(
        { timestamp: 1 },
        { expireAfterSeconds: 7776000 } // 90일 = 90 * 24 * 60 * 60
      );

      console.log('[ActivityLogger] 인덱스 생성 완료');
    } catch (error) {
      console.error('[ActivityLogger] 인덱스 생성 실패:', error.message);
    }
  }

  /**
   * 활동 로그 기록
   * @param {Object} params - 로그 파라미터
   * @param {Object} params.actor - 수행자 정보
   * @param {Object} params.action - 액션 정보
   * @param {Object} params.result - 결과 정보
   * @param {Object} params.meta - 메타 정보 (선택)
   */
  async log({ actor, action, result, meta = {} }) {
    console.log('[ActivityLogger] log() 호출됨:', action?.type, action?.category);
    if (!this.collection) {
      console.warn('[ActivityLogger] 초기화되지 않음, 로그 스킵');
      return;
    }

    const logEntry = {
      // WHO
      actor: {
        user_id: actor.user_id || actor.userId || null,
        name: actor.name || null,
        email: actor.email || null,
        role: actor.role || 'user',
        ip_address: actor.ip || actor.ip_address || null,
        user_agent: actor.userAgent || actor.user_agent || null
      },

      // WHEN
      timestamp: new Date(),

      // WHERE
      location: {
        endpoint: meta.endpoint || null,
        method: meta.method || null,
        feature: action.category || null,
        menu_path: meta.menuPath || null
      },

      // WHAT
      action: {
        type: action.type,
        category: action.category,
        description: action.description || this._generateDescription(action),
        target: action.target ? {
          entity_type: action.target.entity_type || action.target.entityType || null,
          entity_id: action.target.entity_id || action.target.entityId || null,
          entity_name: action.target.entity_name || action.target.entityName || null,
          parent_id: action.target.parent_id || action.target.parentId || null,
          parent_name: action.target.parent_name || action.target.parentName || null
        } : null,
        changes: this._sanitizeChanges(action.changes),
        bulk_count: action.bulkCount || action.bulk_count || null
      },

      // RESULT
      result: {
        success: result.success,
        status_code: result.statusCode || result.status_code || null,
        error: result.error ? {
          code: result.error.code || null,
          message: result.error.message || null
        } : null,
        affected_count: result.affectedCount || result.affected_count || null,
        duration_ms: result.durationMs || result.duration_ms || null
      },

      // META
      meta: {
        request_id: meta.requestId || meta.request_id || this._generateId(),
        session_id: meta.sessionId || meta.session_id || null,
        correlation_id: meta.correlationId || meta.correlation_id || null
      }
    };

    try {
      const insertResult = await this.collection.insertOne(logEntry);
      console.log('[ActivityLogger] 로그 저장 완료, SSE 브로드캐스트 호출');

      // SSE를 통해 실시간 브로드캐스트
      sseBroadcast.broadcastActivityLog({
        ...logEntry,
        _id: insertResult.insertedId
      });
    } catch (error) {
      // 로깅 실패가 메인 로직을 방해하지 않도록 콘솔만 출력
      console.error('[ActivityLogger] 저장 실패:', error.message);
    }
  }

  /**
   * 랜덤 ID 생성
   */
  _generateId() {
    return crypto.randomBytes(12).toString('hex');
  }

  /**
   * 액션 설명 자동 생성
   */
  _generateDescription(action) {
    const typeLabels = {
      create: '등록',
      update: '수정',
      delete: '삭제',
      upload: '업로드',
      download: '다운로드',
      search: '검색',
      login: '로그인',
      logout: '로그아웃',
      bulk_create: '일괄 등록',
      bulk_delete: '일괄 삭제',
      restore: '복원',
      retry: '재처리',
      parse: '파싱'
    };

    const categoryLabels = {
      customer: '고객',
      document: '문서',
      contract: '계약',
      auth: '인증',
      ai: 'AI',
      annual_report: '연결보고서',
      relationship: '관계',
      file: '파일'
    };

    const typeLabel = typeLabels[action.type] || action.type;
    const categoryLabel = categoryLabels[action.category] || action.category;

    return `${categoryLabel} ${typeLabel}`;
  }

  /**
   * 변경 사항에서 민감 정보 마스킹
   */
  _sanitizeChanges(changes) {
    if (!changes) return null;

    const sanitized = {};

    if (changes.before) {
      sanitized.before = this._maskSensitiveFields(changes.before);
    }
    if (changes.after) {
      sanitized.after = this._maskSensitiveFields(changes.after);
    }
    if (changes.changed_fields || changes.changedFields) {
      sanitized.changed_fields = changes.changed_fields || changes.changedFields;
    }

    return Object.keys(sanitized).length > 0 ? sanitized : null;
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

    return masked;
  }

  /**
   * 사용자 활동 로그 조회
   * @param {Object} params - 조회 파라미터
   */
  async getLogs({
    userId,
    category,
    type,
    success,
    startDate,
    endDate,
    page = 1,
    limit = 50
  } = {}) {
    if (!this.collection) {
      throw new Error('ActivityLogger가 초기화되지 않았습니다');
    }

    const query = {};

    if (userId) {
      query['actor.user_id'] = userId;
    }
    if (category) {
      query['action.category'] = category;
    }
    if (type) {
      query['action.type'] = type;
    }
    if (success !== undefined) {
      query['result.success'] = success;
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

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.collection
        .find(query)
        .sort({ timestamp: -1 })
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
   * 사용자별 활동 통계 조회
   * @param {string} userId - 사용자 ID
   * @param {number} days - 조회 일수 (기본 30일)
   */
  async getUserStats(userId, days = 30) {
    if (!this.collection) {
      throw new Error('ActivityLogger가 초기화되지 않았습니다');
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const pipeline = [
      {
        $match: {
          'actor.user_id': userId,
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            category: '$action.category',
            success: '$result.success'
          },
          count: { $sum: 1 }
        }
      }
    ];

    const results = await this.collection.aggregate(pipeline).toArray();

    // 결과를 보기 좋게 정리
    const stats = {
      total: 0,
      success: 0,
      failure: 0,
      byCategory: {}
    };

    for (const item of results) {
      const category = item._id.category || 'unknown';
      const count = item.count;

      stats.total += count;

      if (item._id.success) {
        stats.success += count;
      } else {
        stats.failure += count;
      }

      if (!stats.byCategory[category]) {
        stats.byCategory[category] = { success: 0, failure: 0 };
      }

      if (item._id.success) {
        stats.byCategory[category].success += count;
      } else {
        stats.byCategory[category].failure += count;
      }
    }

    return stats;
  }

  /**
   * 전체 활동 로그 삭제
   * @returns {number} 삭제된 로그 수
   */
  async deleteAll() {
    if (!this.collection) {
      throw new Error('ActivityLogger가 초기화되지 않았습니다');
    }

    try {
      const result = await this.collection.deleteMany({});
      console.log(`[ActivityLogger] 전체 삭제 완료: ${result.deletedCount}개`);
      return result.deletedCount;
    } catch (error) {
      console.error('[ActivityLogger] 전체 삭제 실패:', error.message);
      return 0;
    }
  }

  /**
   * 특정 날짜 이전 로그 삭제 (보존 기간 초과 로그 정리)
   * @param {Date} cutoffDate - 이 날짜 이전 로그 삭제
   * @returns {number} 삭제된 로그 수
   */
  async deleteOlderThan(cutoffDate) {
    if (!this.collection) {
      throw new Error('ActivityLogger가 초기화되지 않았습니다');
    }

    try {
      const result = await this.collection.deleteMany({
        timestamp: { $lt: cutoffDate }
      });
      return result.deletedCount;
    } catch (error) {
      console.error('[ActivityLogger] 기간 초과 로그 삭제 실패:', error.message);
      return 0;
    }
  }
}

// 싱글톤 인스턴스 export
module.exports = new ActivityLogger();
