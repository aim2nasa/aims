/**
 * internal-routes.js - 내부 서비스 간 통신용 API
 *
 * aims_rag_api 등 내부 서비스가 MongoDB에 직접 접근하지 않고
 * aims_api를 경유하여 데이터를 조회하기 위한 엔드포인트.
 *
 * 인증: x-api-key 헤더로 INTERNAL_API_KEY 검증
 * 모든 엔드포인트는 Read-only (조회 전용)
 *
 * @since 2026-04-03
 */

const express = require('express');
const { ObjectId } = require('mongodb');
const { COLLECTIONS } = require('@aims/shared-schema');
const { utcNowISO } = require('../lib/timeUtils');
const backendLogger = require('../lib/backendLogger');

// 내부 API 키 (환경변수)
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

/**
 * 내부 API 키 검증 미들웨어
 */
function verifyInternalApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || !INTERNAL_API_KEY || apiKey !== INTERNAL_API_KEY) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or missing API key',
      timestamp: utcNowISO()
    });
  }
  next();
}

/**
 * ObjectId 변환이 필요한 필드명 목록
 * filter 내에서 이 필드명을 가진 값을 ObjectId로 변환한다.
 */
const OBJECTID_FIELDS = new Set(['_id', 'customerId']);

/**
 * 위험한 MongoDB 연산자 블랙리스트
 * 내부 API라도 임의 코드 실행 가능한 연산자는 차단
 */
const DANGEROUS_OPERATORS = new Set(['$where', '$expr', '$function', '$accumulator']);

/**
 * filter 내 위험한 연산자 존재 여부 재귀 검사
 * @param {object} obj - 검사 대상
 * @returns {string|null} 발견된 위험 연산자 이름 (없으면 null)
 */
function findDangerousOperator(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findDangerousOperator(item);
      if (found) return found;
    }
    return null;
  }
  for (const key of Object.keys(obj)) {
    if (DANGEROUS_OPERATORS.has(key)) return key;
    const found = findDangerousOperator(obj[key]);
    if (found) return found;
  }
  return null;
}

/**
 * MongoDB filter 객체 내의 ObjectId 필드를 재귀적으로 변환
 *
 * - OBJECTID_FIELDS에 해당하는 키의 값이 문자열이면 ObjectId로 변환
 * - $in 연산자 내 문자열 배열도 ObjectId로 변환
 * - $or, $and 등 논리 연산자 내부도 재귀 처리
 *
 * @param {object} filter - MongoDB 쿼리 filter
 * @returns {object} ObjectId가 변환된 filter
 */
function convertObjectIdFields(filter) {
  if (!filter || typeof filter !== 'object') return filter;

  // 배열인 경우 (예: $or, $and의 값)
  if (Array.isArray(filter)) {
    return filter.map(item => convertObjectIdFields(item));
  }

  const converted = {};
  for (const [key, value] of Object.entries(filter)) {
    // $or, $and 등 논리 연산자 → 재귀 처리
    if (key === '$or' || key === '$and' || key === '$nor') {
      converted[key] = convertObjectIdFields(value);
      continue;
    }

    // ObjectId 필드 처리
    if (OBJECTID_FIELDS.has(key)) {
      if (typeof value === 'string' && ObjectId.isValid(value)) {
        converted[key] = new ObjectId(value);
      } else if (value && typeof value === 'object') {
        // $in 연산자 처리
        if (value.$in && Array.isArray(value.$in)) {
          converted[key] = {
            ...value,
            $in: value.$in.map(v =>
              typeof v === 'string' && ObjectId.isValid(v) ? new ObjectId(v) : v
            )
          };
        } else {
          converted[key] = value;
        }
      } else {
        converted[key] = value;
      }
      continue;
    }

    // 중첩 객체 재귀 (단, $regex 등 연산자 값은 그대로 유지)
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof ObjectId)) {
      // MongoDB 연산자($로 시작)가 포함된 객체는 그대로 유지
      const hasOperator = Object.keys(value).some(k => k.startsWith('$'));
      if (hasOperator) {
        converted[key] = value;
      } else {
        converted[key] = convertObjectIdFields(value);
      }
    } else {
      converted[key] = value;
    }
  }
  return converted;
}

module.exports = function(db) {
  const router = express.Router();

  // 모든 내부 API 엔드포인트에 API 키 검증 적용
  router.use('/internal', verifyInternalApiKey);

  // =========================================================================
  // 1. POST /internal/files/query — 범용 파일 쿼리
  // =========================================================================
  /**
   * files 컬렉션 범용 쿼리
   *
   * Body: { filter, projection, sort, limit, skip }
   * - filter 내 customerId, _id 필드는 자동으로 ObjectId 변환
   * - limit 기본값: 100, 최대: 1000
   * - skip 기본값: 0 (페이지네이션용)
   */
  router.post('/internal/files/query', async (req, res) => {
    try {
      const { filter = {}, projection, sort, limit = 100, skip = 0 } = req.body;

      // 위험한 MongoDB 연산자 차단
      const dangerousOp = findDangerousOperator(filter);
      if (dangerousOp) {
        return res.status(400).json({
          success: false,
          error: `허용되지 않는 연산자: ${dangerousOp}`,
          timestamp: utcNowISO()
        });
      }

      // ObjectId 필드 변환
      const convertedFilter = convertObjectIdFields(filter);

      // limit 제한 (최대 1000)
      const safeLimit = Math.min(Math.max(1, limit), 1000);
      // skip 제한 (음수 방지)
      const safeSkip = Math.max(0, skip);

      let cursor = db.collection(COLLECTIONS.FILES).find(convertedFilter);

      if (projection) {
        cursor = cursor.project(projection);
      }
      if (sort) {
        cursor = cursor.sort(sort);
      }
      if (safeSkip > 0) {
        cursor = cursor.skip(safeSkip);
      }
      cursor = cursor.limit(safeLimit);

      const results = await cursor.toArray();

      // _id를 문자열로 변환 (JSON 직렬화 호환)
      const serialized = results.map(doc => ({
        ...doc,
        _id: doc._id ? doc._id.toString() : doc._id,
        customerId: doc.customerId ? doc.customerId.toString() : doc.customerId
      }));

      res.json({
        success: true,
        data: serialized,
        timestamp: utcNowISO()
      });
    } catch (error) {
      console.error('[Internal] files/query 오류:', error.message);
      backendLogger.error('Internal', 'files/query 오류', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: utcNowISO()
      });
    }
  });

  // =========================================================================
  // 2. POST /internal/files/count — 파일 수 조회
  // =========================================================================
  /**
   * files 컬렉션 문서 수 조회
   *
   * Body: { filter }
   * - filter 내 customerId, _id 필드는 자동으로 ObjectId 변환
   */
  router.post('/internal/files/count', async (req, res) => {
    try {
      const { filter = {} } = req.body;

      // 위험한 MongoDB 연산자 차단
      const dangerousOp = findDangerousOperator(filter);
      if (dangerousOp) {
        return res.status(400).json({
          success: false,
          error: `허용되지 않는 연산자: ${dangerousOp}`,
          timestamp: utcNowISO()
        });
      }

      // ObjectId 필드 변환
      const convertedFilter = convertObjectIdFields(filter);

      const count = await db.collection(COLLECTIONS.FILES).countDocuments(convertedFilter);

      res.json({
        success: true,
        data: { count },
        timestamp: utcNowISO()
      });
    } catch (error) {
      console.error('[Internal] files/count 오류:', error.message);
      backendLogger.error('Internal', 'files/count 오류', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: utcNowISO()
      });
    }
  });

  // =========================================================================
  // 3. POST /internal/files/aggregate — 파일 집계 쿼리
  // =========================================================================
  /**
   * files 컬렉션 aggregate 파이프라인 실행
   *
   * Body: { pipeline }
   * - pipeline 최대 10 스테이지
   * - $out, $merge 차단 (Write 방지)
   * - 위험 연산자 차단
   */
  router.post('/internal/files/aggregate', async (req, res) => {
    try {
      const { pipeline } = req.body;

      if (!pipeline || !Array.isArray(pipeline)) {
        return res.status(400).json({
          success: false,
          error: 'pipeline은 배열이어야 합니다.',
          timestamp: utcNowISO()
        });
      }

      // 스테이지 수 제한 (최대 10)
      if (pipeline.length > 10) {
        return res.status(400).json({
          success: false,
          error: `pipeline 스테이지가 너무 많습니다 (${pipeline.length}/10).`,
          timestamp: utcNowISO()
        });
      }

      // Write 연산자 차단 ($out, $merge)
      for (const stage of pipeline) {
        if (stage.$out || stage.$merge) {
          return res.status(400).json({
            success: false,
            error: '쓰기 연산자($out, $merge)는 허용되지 않습니다.',
            timestamp: utcNowISO()
          });
        }
      }

      // 위험한 MongoDB 연산자 차단
      const dangerousOp = findDangerousOperator(pipeline);
      if (dangerousOp) {
        return res.status(400).json({
          success: false,
          error: `허용되지 않는 연산자: ${dangerousOp}`,
          timestamp: utcNowISO()
        });
      }

      // pipeline 내 $match 스테이지의 ObjectId 필드 변환
      const convertedPipeline = pipeline.map(stage => {
        if (stage.$match) {
          return { ...stage, $match: convertObjectIdFields(stage.$match) };
        }
        return stage;
      });

      const results = await db.collection(COLLECTIONS.FILES).aggregate(convertedPipeline).toArray();

      res.json({
        success: true,
        data: results,
        timestamp: utcNowISO()
      });
    } catch (error) {
      console.error('[Internal] files/aggregate 오류:', error.message);
      backendLogger.error('Internal', 'files/aggregate 오류', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: utcNowISO()
      });
    }
  });

  // =========================================================================
  // 4. POST /internal/customers/resolve-by-name — 고객명으로 고객 ID 해석
  //    (기존 2번에서 번호 변경)
  // =========================================================================
  /**
   * 고객명으로 고객 매칭 (정확 매칭 / 부분 매칭)
   *
   * Body: { name, userId, mode: "exact"|"partial" }
   * - exact: 정확히 일치하는 고객 1건 반환
   * - partial: regex 부분 매칭, 최대 2건 반환 (1건일 때만 확정)
   */
  router.post('/internal/customers/resolve-by-name', async (req, res) => {
    try {
      const { name, userId, mode } = req.body;

      if (!name || !userId) {
        return res.status(400).json({
          success: false,
          error: 'name과 userId는 필수입니다.',
          timestamp: utcNowISO()
        });
      }

      const baseFilter = {
        'meta.created_by': userId,
        'meta.status': 'active'
      };

      if (mode === 'exact') {
        const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
          ...baseFilter,
          'personal_info.name': name
        });

        if (customer) {
          res.json({
            success: true,
            data: {
              customerId: customer._id.toString(),
              customerName: (customer.personal_info || {}).name || ''
            },
            timestamp: utcNowISO()
          });
        } else {
          res.json({
            success: true,
            data: null,
            timestamp: utcNowISO()
          });
        }
      } else if (mode === 'partial') {
        // 특수문자 이스케이프
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const candidates = await db.collection(COLLECTIONS.CUSTOMERS).find(
          { ...baseFilter, 'personal_info.name': { $regex: escaped, $options: 'i' } },
          { projection: { _id: 1, 'personal_info.name': 1 } }
        ).limit(2).toArray();

        res.json({
          success: true,
          data: {
            candidates: candidates.map(c => ({
              customerId: c._id.toString(),
              customerName: (c.personal_info || {}).name || ''
            }))
          },
          timestamp: utcNowISO()
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'mode는 "exact" 또는 "partial"이어야 합니다.',
          timestamp: utcNowISO()
        });
      }
    } catch (error) {
      console.error('[Internal] customers/resolve-by-name 오류:', error.message);
      backendLogger.error('Internal', 'customers/resolve-by-name 오류', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: utcNowISO()
      });
    }
  });

  // =========================================================================
  // 5. POST /internal/customers/batch-names — 고객 ID 배치 → 이름 조회
  // =========================================================================
  /**
   * 고객 ID 목록으로 이름 배치 조회
   *
   * Body: { ids: ["id1", "id2", ...] }
   * Response: { names: { "id1": "이름1", "id2": "이름2" } }
   */
  router.post('/internal/customers/batch-names', async (req, res) => {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.json({
          success: true,
          data: { names: {} },
          timestamp: utcNowISO()
        });
      }

      // 문자열 ID → ObjectId 변환
      const objectIds = ids
        .filter(id => id && ObjectId.isValid(id))
        .map(id => new ObjectId(id));

      const customers = await db.collection(COLLECTIONS.CUSTOMERS).find(
        { _id: { $in: objectIds } },
        { projection: { 'personal_info.name': 1, 'insurance_info.customer_type': 1 } }
      ).toArray();

      const names = {};
      const types = {};
      for (const cust of customers) {
        const id = cust._id.toString();
        names[id] = (cust.personal_info || {}).name || '알 수 없음';
        types[id] = (cust.insurance_info || {}).customer_type || null;
      }

      res.json({
        success: true,
        data: { names, types },
        timestamp: utcNowISO()
      });
    } catch (error) {
      console.error('[Internal] customers/batch-names 오류:', error.message);
      backendLogger.error('Internal', 'customers/batch-names 오류', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: utcNowISO()
      });
    }
  });

  // =========================================================================
  // 6. POST /internal/relationships/by-customer — 고객 관계 조회
  // =========================================================================
  /**
   * 특정 고객의 양방향 관계 조회
   *
   * Body: { customerId, userId }
   * Response: { relationships: [...] }
   */
  router.post('/internal/relationships/by-customer', async (req, res) => {
    try {
      const { customerId, userId } = req.body;

      if (!customerId || !userId) {
        return res.status(400).json({
          success: false,
          error: 'customerId와 userId는 필수입니다.',
          timestamp: utcNowISO()
        });
      }

      const custObjId = new ObjectId(customerId);

      const relationships = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS).find({
        $or: [
          { 'relationship_info.from_customer_id': custObjId },
          { 'relationship_info.to_customer_id': custObjId }
        ],
        'relationship_info.status': 'active',
        'meta.created_by': userId
      }).toArray();

      // ObjectId 필드를 문자열로 변환 (JSON 직렬화 호환)
      const serialized = relationships.map(rel => {
        const info = rel.relationship_info || {};
        return {
          _id: rel._id.toString(),
          relationship_info: {
            ...info,
            from_customer_id: info.from_customer_id ? info.from_customer_id.toString() : null,
            to_customer_id: info.to_customer_id ? info.to_customer_id.toString() : null
          },
          meta: {
            created_by: (rel.meta || {}).created_by || null,
            created_at: (rel.meta || {}).created_at || null,
            updated_at: (rel.meta || {}).updated_at || null
          }
        };
      });

      res.json({
        success: true,
        data: serialized,
        timestamp: utcNowISO()
      });
    } catch (error) {
      console.error('[Internal] relationships/by-customer 오류:', error.message);
      backendLogger.error('Internal', 'relationships/by-customer 오류', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: utcNowISO()
      });
    }
  });

  // =========================================================================
  // 7. GET /internal/customers/:id/name — 단건 고객명+타입 조회
  // =========================================================================
  /**
   * 고객 ID로 이름과 고객 타입 조회 (단건)
   *
   * Params: id (ObjectId 문자열)
   * Response: { name: "...", customerType: "..." }
   */
  router.get('/internal/customers/:id/name', async (req, res) => {
    try {
      const { id } = req.params;

      // ObjectId 유효성 검사
      if (!id || !ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 고객 ID입니다.',
          timestamp: utcNowISO()
        });
      }

      const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne(
        { _id: new ObjectId(id) },
        { projection: { 'personal_info.name': 1, 'insurance_info.customer_type': 1 } }
      );

      if (!customer) {
        return res.json({
          success: true,
          data: null,
          timestamp: utcNowISO()
        });
      }

      res.json({
        success: true,
        data: {
          name: (customer.personal_info || {}).name || null,
          customerType: (customer.insurance_info || {}).customer_type || null
        },
        timestamp: utcNowISO()
      });
    } catch (error) {
      console.error('[Internal] customers/:id/name 오류:', error.message);
      backendLogger.error('Internal', 'customers/:id/name 오류', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: utcNowISO()
      });
    }
  });

  return router;
};
