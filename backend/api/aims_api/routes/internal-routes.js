/**
 * internal-routes.js - 내부 서비스 간 통신용 API
 *
 * aims_rag_api 등 내부 서비스가 MongoDB에 직접 접근하지 않고
 * aims_api를 경유하여 데이터를 조회하기 위한 엔드포인트.
 *
 * 인증: x-api-key 헤더로 INTERNAL_API_KEY 검증
 * Phase 1: Read-only (조회 전용) 엔드포인트 9건
 * Phase 2: Write (생성/수정/삭제) 엔드포인트 8건
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
 * 관계 유형 정의 (aims_mcp relationships.ts와 동일)
 */
const RELATIONSHIP_TYPES = {
  family: {
    spouse: { reverse: 'spouse', bidirectional: true, label: '배우자' },
    parent: { reverse: 'child', bidirectional: false, label: '부모' },
    child: { reverse: 'parent', bidirectional: false, label: '자녀' }
  },
  relative: {
    uncle_aunt: { reverse: 'nephew_niece', bidirectional: false, label: '삼촌/이모' },
    nephew_niece: { reverse: 'uncle_aunt', bidirectional: false, label: '조카' },
    cousin: { reverse: 'cousin', bidirectional: true, label: '사촌' },
    in_law: { reverse: 'in_law', bidirectional: true, label: '처가/시가' }
  },
  social: {
    friend: { reverse: 'friend', bidirectional: true, label: '친구' },
    acquaintance: { reverse: 'acquaintance', bidirectional: true, label: '지인' },
    neighbor: { reverse: 'neighbor', bidirectional: true, label: '이웃' }
  },
  professional: {
    supervisor: { reverse: 'subordinate', bidirectional: false, label: '상사' },
    subordinate: { reverse: 'supervisor', bidirectional: false, label: '부하' },
    colleague: { reverse: 'colleague', bidirectional: true, label: '동료' },
    business_partner: { reverse: 'business_partner', bidirectional: true, label: '사업파트너' },
    client: { reverse: 'service_provider', bidirectional: false, label: '클라이언트' },
    service_provider: { reverse: 'client', bidirectional: false, label: '서비스제공자' }
  },
  corporate: {
    ceo: { reverse: 'company', bidirectional: false, label: '대표이사' },
    executive: { reverse: 'company', bidirectional: false, label: '임원' },
    employee: { reverse: 'employer', bidirectional: false, label: '직원' },
    shareholder: { reverse: 'company', bidirectional: false, label: '주주' },
    director: { reverse: 'company', bidirectional: false, label: '이사' },
    company: { reverse: 'employee', bidirectional: false, label: '회사' },
    employer: { reverse: 'employee', bidirectional: false, label: '고용주' }
  }
};

/**
 * 모든 관계 유형을 평면화하여 반환
 * @returns {Object} { type: { reverse, bidirectional, label, category } }
 */
function getAllRelationshipTypes() {
  const allTypes = {};
  Object.entries(RELATIONSHIP_TYPES).forEach(([category, types]) => {
    Object.entries(types).forEach(([type, config]) => {
      allTypes[type] = { ...config, category };
    });
  });
  return allTypes;
}

/**
 * 정규식 특수문자 이스케이프
 * @param {string} str - 이스케이프할 문자열
 * @returns {string} 이스케이프된 문자열
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

  // =========================================================================
  // 8. GET /internal/customers/:id/ownership — 고객 소유권 확인
  // =========================================================================
  /**
   * 고객 소유권 확인 (최소 데이터 반환)
   *
   * Params: id (ObjectId 문자열)
   * Query: userId (설계사 ID)
   * Response: { exists: true/false }
   */
  router.get('/internal/customers/:id/ownership', async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.query;

      if (!id || !ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 고객 ID입니다.',
          timestamp: utcNowISO()
        });
      }

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'userId는 필수입니다.',
          timestamp: utcNowISO()
        });
      }

      const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne(
        { _id: new ObjectId(id), 'meta.created_by': userId },
        { projection: { _id: 1, 'meta.created_by': 1 } }
      );

      res.json({
        success: true,
        data: { exists: !!customer },
        timestamp: utcNowISO()
      });
    } catch (error) {
      console.error('[Internal] customers/:id/ownership 오류:', error.message);
      backendLogger.error('Internal', 'customers/:id/ownership 오류', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: utcNowISO()
      });
    }
  });

  // =========================================================================
  // 9. POST /internal/customers/:id/has-report — 중복 파싱 체크
  // =========================================================================
  /**
   * 고객에게 특정 파일의 AR/CRS 파싱 결과가 이미 있는지 확인
   *
   * Params: id (고객 ObjectId)
   * Body: { sourceFileId, reportType: "ar"|"cr" }
   * Response: { exists: true/false }
   */
  router.post('/internal/customers/:id/has-report', async (req, res) => {
    try {
      const { id } = req.params;
      const { sourceFileId, reportType } = req.body;

      if (!id || !ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 고객 ID입니다.',
          timestamp: utcNowISO()
        });
      }

      if (!sourceFileId || !ObjectId.isValid(sourceFileId)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 sourceFileId입니다.',
          timestamp: utcNowISO()
        });
      }

      if (!reportType || !['ar', 'cr'].includes(reportType)) {
        return res.status(400).json({
          success: false,
          error: 'reportType은 "ar" 또는 "cr"이어야 합니다.',
          timestamp: utcNowISO()
        });
      }

      const arrayField = reportType === 'ar'
        ? 'annual_reports.source_file_id'
        : 'customer_reviews.source_file_id';

      const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne(
        { _id: new ObjectId(id), [arrayField]: new ObjectId(sourceFileId) },
        { projection: { _id: 1 } }
      );

      res.json({
        success: true,
        data: { exists: !!customer },
        timestamp: utcNowISO()
      });
    } catch (error) {
      console.error('[Internal] customers/:id/has-report 오류:', error.message);
      backendLogger.error('Internal', 'customers/:id/has-report 오류', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: utcNowISO()
      });
    }
  });

  // =========================================================================
  // Phase 2: Write API (생성/수정/삭제)
  // =========================================================================

  // =========================================================================
  // 10. POST /internal/customers — 고객 생성
  // =========================================================================
  /**
   * 고객 신규 생성
   * @body {string} name - 고객명 (필수)
   * @body {string} phone - 전화번호 (필수, 포매팅 없이 전달)
   * @body {string} [email] - 이메일
   * @body {string} [birthDate] - 생년월일
   * @body {string} [address] - 주소
   * @body {string} [customerType] - 고객 유형 (기본: '개인')
   * @body {string} userId - 설계사 ID (필수)
   */
  router.post('/internal/customers', async (req, res) => {
    try {
      const { name, phone, email, birthDate, address, customerType, userId } = req.body;

      if (!name || !phone || !userId) {
        return res.status(400).json({
          success: false,
          error: 'name, phone, userId는 필수입니다.',
          timestamp: utcNowISO()
        });
      }

      // 이름 중복 체크 (동일 userId 내, 대소문자 무관)
      const existing = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
        'personal_info.name': { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
        'meta.created_by': userId,
        deleted_at: { $exists: false }
      });

      if (existing) {
        return res.status(409).json({
          success: false,
          error: `같은 이름의 고객이 이미 존재합니다: ${name}`,
          timestamp: utcNowISO()
        });
      }

      const now = new Date();
      const newCustomer = {
        personal_info: {
          name,
          mobile_phone: phone,
          email: email || '',
          birth_date: birthDate || '',
          address: address ? { address1: address } : {}
        },
        insurance_info: {
          customer_type: customerType || '개인'
        },
        meta: {
          status: 'active',
          created_by: userId,
          created_at: now,
          updated_at: now
        }
      };

      const result = await db.collection(COLLECTIONS.CUSTOMERS).insertOne(newCustomer);

      res.json({
        success: true,
        data: {
          customerId: result.insertedId.toString(),
          name,
          customerType: customerType || '개인',
          createdAt: now.toISOString()
        },
        timestamp: utcNowISO()
      });
    } catch (error) {
      console.error('[Internal] POST /customers 오류:', error.message);
      backendLogger.error('Internal', 'POST /customers 오류', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: utcNowISO()
      });
    }
  });

  // =========================================================================
  // 11. PUT /internal/customers/:id — 고객 수정
  // =========================================================================
  /**
   * 고객 정보 수정
   * @param {string} id - 고객 ObjectId
   * @body {string} userId - 설계사 ID (필수)
   * @body {string} [name] - 고객명
   * @body {string} [phone] - 전화번호
   * @body {string} [phoneType] - 전화 유형 (mobile/home/work, 기본: mobile)
   * @body {string} [email] - 이메일
   * @body {string} [birthDate] - 생년월일
   * @body {string} [postal_code] - 우편번호
   * @body {string} [address1] - 주소1
   * @body {string} [address2] - 주소2
   */
  router.put('/internal/customers/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { userId, name, phone, phoneType, email, birthDate, postal_code, address1, address2 } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 고객 ID입니다.',
          timestamp: utcNowISO()
        });
      }

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'userId는 필수입니다.',
          timestamp: utcNowISO()
        });
      }


      const objectId = new ObjectId(id);

      // 고객 존재 + 소유권 확인
      const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
        _id: objectId,
        'meta.created_by': userId
      });

      if (!customer) {
        return res.status(404).json({
          success: false,
          error: '고객을 찾을 수 없습니다.',
          timestamp: utcNowISO()
        });
      }

      // 이름 변경 시 중복 체크
      if (name && name !== customer.personal_info?.name) {
        const existing = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
          'personal_info.name': { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
          'meta.created_by': userId,
          _id: { $ne: objectId },
          deleted_at: { $exists: false }
        });

        if (existing) {
          return res.status(409).json({
            success: false,
            error: `같은 이름의 고객이 이미 존재합니다: ${name}`,
            timestamp: utcNowISO()
          });
        }
      }

      // 업데이트 필드 구성
      const updateFields = {
        'meta.updated_at': new Date()
      };

      if (name) updateFields['personal_info.name'] = name;

      // 전화번호: phoneType에 따라 다른 필드에 저장
      if (phone) {
        const pt = phoneType || 'mobile';
        switch (pt) {
          case 'home':
            updateFields['personal_info.home_phone'] = phone;
            break;
          case 'work':
            updateFields['personal_info.work_phone'] = phone;
            break;
          case 'mobile':
          default:
            updateFields['personal_info.mobile_phone'] = phone;
            break;
        }
      }

      if (email) updateFields['personal_info.email'] = email;
      if (birthDate) updateFields['personal_info.birth_date'] = birthDate;
      if (postal_code) updateFields['personal_info.address.postal_code'] = postal_code;
      if (address1) updateFields['personal_info.address.address1'] = address1;
      if (address2 !== undefined) updateFields['personal_info.address.address2'] = address2;

      await db.collection(COLLECTIONS.CUSTOMERS).updateOne(
        { _id: objectId },
        { $set: updateFields }
      );

      res.json({
        success: true,
        data: {
          customerId: id,
          updatedFields: Object.keys(updateFields).filter(k => k !== 'meta.updated_at'),
          message: '고객 정보가 수정되었습니다.'
        },
        timestamp: utcNowISO()
      });
    } catch (error) {
      console.error('[Internal] PUT /customers/:id 오류:', error.message);
      backendLogger.error('Internal', 'PUT /customers/:id 오류', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: utcNowISO()
      });
    }
  });

  // =========================================================================
  // 12. PUT /internal/customers/:id/memo-sync — 메모 동기화
  // =========================================================================
  /**
   * 고객의 memo 필드를 직접 업데이트 (customer_memos → customers.memo 동기화용)
   * @param {string} id - 고객 ObjectId
   * @body {string} memoText - 동기화할 메모 텍스트
   * @body {string} userId - 설계사 ID (소유권 검증용)
   */
  router.put('/internal/customers/:id/memo-sync', async (req, res) => {
    try {
      const { id } = req.params;
      const { memoText, userId } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 고객 ID입니다.',
          timestamp: utcNowISO()
        });
      }

      if (memoText === undefined || memoText === null) {
        return res.status(400).json({
          success: false,
          error: 'memoText는 필수입니다.',
          timestamp: utcNowISO()
        });
      }

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'userId는 필수입니다.',
          timestamp: utcNowISO()
        });
      }

      // 소유권 확인
      const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
        _id: new ObjectId(id),
        'meta.created_by': userId
      });
      if (!customer) {
        return res.status(403).json({
          success: false,
          error: '해당 고객의 메모를 수정할 권한이 없습니다.',
          timestamp: utcNowISO()
        });
      }

      await db.collection(COLLECTIONS.CUSTOMERS).updateOne(
        { _id: new ObjectId(id) },
        { $set: { memo: memoText, 'meta.updated_at': new Date() } }
      );

      res.json({
        success: true,
        data: { success: true },
        timestamp: utcNowISO()
      });
    } catch (error) {
      console.error('[Internal] PUT /customers/:id/memo-sync 오류:', error.message);
      backendLogger.error('Internal', 'PUT /customers/:id/memo-sync 오류', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: utcNowISO()
      });
    }
  });

  // =========================================================================
  // 13. POST /internal/memos — 메모 생성
  // =========================================================================
  /**
   * 고객 메모 신규 생성 (customer_memos 컬렉션)
   * @body {string} customerId - 고객 ObjectId (필수)
   * @body {string} content - 메모 내용 (필수)
   * @body {string} userId - 설계사 ID (필수)
   */
  router.post('/internal/memos', async (req, res) => {
    try {
      const { customerId, content, userId } = req.body;

      if (!customerId || !content || !userId) {
        return res.status(400).json({
          success: false,
          error: 'customerId, content, userId는 필수입니다.',
          timestamp: utcNowISO()
        });
      }

      if (!ObjectId.isValid(customerId)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 고객 ID입니다.',
          timestamp: utcNowISO()
        });
      }


      const now = new Date();

      const newMemo = {
        customer_id: new ObjectId(customerId),
        content: content.trim(),
        created_by: userId,
        created_at: now,
        updated_at: now
      };

      const result = await db.collection(COLLECTIONS.CUSTOMER_MEMOS).insertOne(newMemo);

      res.json({
        success: true,
        data: { memoId: result.insertedId.toString() },
        timestamp: utcNowISO()
      });
    } catch (error) {
      console.error('[Internal] POST /memos 오류:', error.message);
      backendLogger.error('Internal', 'POST /memos 오류', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: utcNowISO()
      });
    }
  });

  // =========================================================================
  // 14. PUT /internal/memos/:id — 메모 수정
  // =========================================================================
  /**
   * 메모 내용 수정
   * @param {string} id - 메모 ObjectId
   * @body {string} customerId - 고객 ObjectId (필수)
   * @body {string} content - 수정할 메모 내용 (필수)
   * @body {string} userId - 설계사 ID (필수)
   */
  router.put('/internal/memos/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { customerId, content, userId } = req.body;

      if (!customerId || !content || !userId) {
        return res.status(400).json({
          success: false,
          error: 'customerId, content, userId는 필수입니다.',
          timestamp: utcNowISO()
        });
      }

      if (!ObjectId.isValid(id) || !ObjectId.isValid(customerId)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 ID입니다.',
          timestamp: utcNowISO()
        });
      }

      // 고객 소유권 확인
      const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
        _id: new ObjectId(customerId),
        'meta.created_by': userId
      });
      if (!customer) {
        return res.status(403).json({
          success: false,
          error: '해당 고객의 메모를 수정할 권한이 없습니다.',
          timestamp: utcNowISO()
        });
      }

      // 메모 존재 확인: _id + customer_id 매칭
      const memo = await db.collection(COLLECTIONS.CUSTOMER_MEMOS).findOne({
        _id: new ObjectId(id),
        customer_id: new ObjectId(customerId)
      });

      if (!memo) {
        return res.status(404).json({
          success: false,
          error: '메모를 찾을 수 없습니다.',
          timestamp: utcNowISO()
        });
      }

      const now = new Date();
      await db.collection(COLLECTIONS.CUSTOMER_MEMOS).updateOne(
        { _id: new ObjectId(id) },
        { $set: { content: content.trim(), updated_at: now, updated_by: userId } }
      );

      res.json({
        success: true,
        data: { success: true },
        timestamp: utcNowISO()
      });
    } catch (error) {
      console.error('[Internal] PUT /memos/:id 오류:', error.message);
      backendLogger.error('Internal', 'PUT /memos/:id 오류', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: utcNowISO()
      });
    }
  });

  // =========================================================================
  // 15. DELETE /internal/memos/:id — 메모 삭제
  // =========================================================================
  /**
   * 메모 삭제
   * @param {string} id - 메모 ObjectId
   * @query {string} customerId - 고객 ObjectId (필수)
   */
  router.delete('/internal/memos/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { customerId } = req.query;

      if (!customerId) {
        return res.status(400).json({
          success: false,
          error: 'customerId 쿼리 파라미터는 필수입니다.',
          timestamp: utcNowISO()
        });
      }

      if (!ObjectId.isValid(id) || !ObjectId.isValid(customerId)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 ID입니다.',
          timestamp: utcNowISO()
        });
      }



      // 메모 존재 확인: _id + customer_id 매칭
      const memo = await db.collection(COLLECTIONS.CUSTOMER_MEMOS).findOne({
        _id: new ObjectId(id),
        customer_id: new ObjectId(customerId)
      });

      if (!memo) {
        return res.status(404).json({
          success: false,
          error: '메모를 찾을 수 없습니다.',
          timestamp: utcNowISO()
        });
      }

      await db.collection(COLLECTIONS.CUSTOMER_MEMOS).deleteOne({ _id: new ObjectId(id) });

      res.json({
        success: true,
        data: { success: true },
        timestamp: utcNowISO()
      });
    } catch (error) {
      console.error('[Internal] DELETE /memos/:id 오류:', error.message);
      backendLogger.error('Internal', 'DELETE /memos/:id 오류', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: utcNowISO()
      });
    }
  });

  // =========================================================================
  // 16. POST /internal/relationships — 관계 생성
  // =========================================================================
  /**
   * 고객 간 관계 생성 (양방향/가족 관계 시 역방향도 자동 생성)
   * @body {string} fromCustomerId - 기준 고객 ID (필수)
   * @body {string} toCustomerId - 대상 고객 ID (필수)
   * @body {string} relationshipType - 관계 유형 (필수)
   * @body {string} [relationshipCategory] - 관계 카테고리
   * @body {string} [notes] - 메모
   * @body {string} userId - 설계사 ID (필수)
   */
  router.post('/internal/relationships', async (req, res) => {
    try {
      const { fromCustomerId, toCustomerId, relationshipType, relationshipCategory, notes, userId } = req.body;

      if (!fromCustomerId || !toCustomerId || !relationshipType || !userId) {
        return res.status(400).json({
          success: false,
          error: 'fromCustomerId, toCustomerId, relationshipType, userId는 필수입니다.',
          timestamp: utcNowISO()
        });
      }

      if (!ObjectId.isValid(fromCustomerId) || !ObjectId.isValid(toCustomerId)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 고객 ID입니다.',
          timestamp: utcNowISO()
        });
      }

      // 자기 참조 체크
      if (fromCustomerId === toCustomerId) {
        return res.status(400).json({
          success: false,
          error: '자기 자신과는 관계를 설정할 수 없습니다.',
          timestamp: utcNowISO()
        });
      }

      // 관계 유형 검증
      const allTypes = getAllRelationshipTypes();
      let typeConfig = allTypes[relationshipType];
      let isCustomType = false;

      if (!typeConfig) {
        // corporate 카테고리만 사용자 정의 타입 허용
        if (relationshipCategory === 'corporate') {
          isCustomType = true;
          typeConfig = {
            reverse: relationshipType,
            bidirectional: false,
            category: 'corporate',
            label: relationshipType
          };
        } else {
          return res.status(400).json({
            success: false,
            error: `유효하지 않은 관계 유형입니다. 사용 가능한 유형: ${Object.keys(allTypes).join(', ')}`,
            timestamp: utcNowISO()
          });
        }
      }


      const fromObjectId = new ObjectId(fromCustomerId);
      const toObjectId = new ObjectId(toCustomerId);

      // 두 고객 소유권 확인
      const [fromCustomer, toCustomer] = await Promise.all([
        db.collection(COLLECTIONS.CUSTOMERS).findOne({ _id: fromObjectId, 'meta.created_by': userId }),
        db.collection(COLLECTIONS.CUSTOMERS).findOne({ _id: toObjectId, 'meta.created_by': userId })
      ]);

      if (!fromCustomer) {
        return res.status(404).json({
          success: false,
          error: '기준 고객을 찾을 수 없습니다.',
          timestamp: utcNowISO()
        });
      }

      if (!toCustomer) {
        return res.status(404).json({
          success: false,
          error: '대상 고객을 찾을 수 없습니다.',
          timestamp: utcNowISO()
        });
      }

      // 기존 관계 중복 체크
      const existingRelation = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS).findOne({
        'relationship_info.from_customer_id': fromObjectId,
        'relationship_info.to_customer_id': toObjectId,
        'relationship_info.status': 'active'
      });

      if (existingRelation) {
        return res.status(409).json({
          success: false,
          error: `이미 등록된 관계입니다: ${existingRelation.relationship_info.relationship_type}`,
          timestamp: utcNowISO()
        });
      }

      const now = new Date();
      const relationshipData = {
        from_customer: fromObjectId,
        related_customer: toObjectId,
        family_representative: fromObjectId,
        relationship_info: {
          from_customer_id: fromObjectId,
          to_customer_id: toObjectId,
          relationship_type: relationshipType,
          relationship_category: typeConfig.category,
          is_bidirectional: typeConfig.bidirectional,
          strength: 'medium',
          status: 'active'
        },
        relationship_details: {
          description: '',
          established_date: null,
          notes: notes || '',
          contact_frequency: 'unknown',
          influence_level: 'medium'
        },
        insurance_relevance: {
          is_beneficiary: false,
          is_insured: false,
          shared_policies: [],
          referral_potential: 'medium',
          cross_selling_opportunity: false
        },
        meta: {
          created_at: now,
          updated_at: now,
          created_by: fromCustomer.meta?.created_by || userId,
          last_modified_by: fromCustomer.meta?.created_by || userId,
          verified: false,
          verification_date: null,
          verified_by: null
        }
      };

      const result = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS).insertOne(relationshipData);

      // 양방향 관계이거나 family 관계인 경우 역방향 관계도 생성
      let reverseCreated = false;
      if (typeConfig.bidirectional || typeConfig.category === 'family') {
        const existingReverseRelation = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS).findOne({
          'relationship_info.from_customer_id': toObjectId,
          'relationship_info.to_customer_id': fromObjectId,
          'relationship_info.status': 'active'
        });

        if (!existingReverseRelation) {
          const reverseRelationshipData = {
            ...relationshipData,
            from_customer: toObjectId,
            related_customer: fromObjectId,
            family_representative: fromObjectId,
            relationship_info: {
              ...relationshipData.relationship_info,
              from_customer_id: toObjectId,
              to_customer_id: fromObjectId,
              relationship_type: typeConfig.reverse
            },
            meta: {
              ...relationshipData.meta
            }
          };

          await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS).insertOne(reverseRelationshipData);
          reverseCreated = true;
        }
      }

      res.json({
        success: true,
        data: {
          relationshipId: result.insertedId.toString(),
          reverseCreated
        },
        timestamp: utcNowISO()
      });
    } catch (error) {
      console.error('[Internal] POST /relationships 오류:', error.message);
      backendLogger.error('Internal', 'POST /relationships 오류', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: utcNowISO()
      });
    }
  });

  // =========================================================================
  // 17. DELETE /internal/relationships/:id — 관계 삭제
  // =========================================================================
  /**
   * 관계 삭제 (양방향/가족 관계 시 역방향도 자동 삭제)
   * @param {string} id - 관계 ObjectId
   * @body {string} userId - 설계사 ID (필수)
   */
  router.delete('/internal/relationships/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: '유효하지 않은 관계 ID입니다.',
          timestamp: utcNowISO()
        });
      }

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'userId는 필수입니다.',
          timestamp: utcNowISO()
        });
      }


      const relationshipObjectId = new ObjectId(id);

      // 관계 조회
      const relationship = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS).findOne({
        _id: relationshipObjectId
      });

      if (!relationship) {
        return res.status(404).json({
          success: false,
          error: '관계를 찾을 수 없습니다.',
          timestamp: utcNowISO()
        });
      }

      // 고객 소유권 확인 (from_customer가 userId의 고객인지)
      const fromCustomer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
        _id: relationship.relationship_info.from_customer_id,
        'meta.created_by': userId
      });

      if (!fromCustomer) {
        return res.status(403).json({
          success: false,
          error: '해당 관계를 삭제할 권한이 없습니다.',
          timestamp: utcNowISO()
        });
      }

      // 정방향 삭제
      await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS).deleteOne({
        _id: relationshipObjectId
      });

      // 양방향 or family일 때 역방향 삭제
      let reverseDeleted = false;
      if (relationship.relationship_info.is_bidirectional || relationship.relationship_info.relationship_category === 'family') {
        const deleteResult = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS).deleteMany({
          'relationship_info.from_customer_id': relationship.relationship_info.to_customer_id,
          'relationship_info.to_customer_id': relationship.relationship_info.from_customer_id,
          'relationship_info.status': 'active'
        });
        reverseDeleted = deleteResult.deletedCount > 0;
      }

      res.json({
        success: true,
        data: {
          success: true,
          reverseDeleted
        },
        timestamp: utcNowISO()
      });
    } catch (error) {
      console.error('[Internal] DELETE /relationships/:id 오류:', error.message);
      backendLogger.error('Internal', 'DELETE /relationships/:id 오류', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: utcNowISO()
      });
    }
  });

  return router;
};
