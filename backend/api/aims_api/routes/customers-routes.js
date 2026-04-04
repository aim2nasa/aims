/**
 * customers-routes.js - Customer CRUD (고객 관리 핵심 라우트)
 *
 * Phase 9: server.js 리팩토링
 * Phase 10: 라우트 모듈화 — AR/CRS, 문서관계, 알림, 메모, 주소이력 분리
 * @since 2026-02-07
 */

const express = require('express');
const { ObjectId } = require('mongodb');
const { COLLECTIONS } = require('@aims/shared-schema');
const backendLogger = require('../lib/backendLogger');
const { utcNowISO, utcNowDate } = require('../lib/timeUtils');
const { sanitizeHtml, flattenObject, escapeRegex, CHOSUNG_RANGE_MAP, getInitialFromChar } = require('../lib/helpers');
const activityLogger = require('../lib/activityLogger');
const { verifyAddressViaKakao, normalizeAddress } = require('../utils/address-helper');

module.exports = function(db, authenticateJWT, authenticateJWTorAPIKey, qdrantClient, qdrantCollection) {
  const router = express.Router();
  const QDRANT_COLLECTION = qdrantCollection;
  const CUSTOMERS_COLLECTION = COLLECTIONS.CUSTOMERS;
  const COLLECTION_NAME = COLLECTIONS.FILES;

// ==================== 고객 관리 API ====================

/**
 * 고객 통계 조회 API
 * GET /api/customers/stats
 */
router.get('/customers/stats', authenticateJWTorAPIKey, async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }

    // 🔴 삭제된 고객은 통계에서 제외
    const baseFilter = { 'meta.created_by': userId, deleted_at: null };

    // 병렬로 통계 조회
    const [total, active, inactive, newThisMonth] = await Promise.all([
      // 전체 고객 수 (삭제되지 않은 것만)
      db.collection(CUSTOMERS_COLLECTION).countDocuments(baseFilter),
      // 활성 고객 수
      db.collection(CUSTOMERS_COLLECTION).countDocuments({
        ...baseFilter,
        'meta.status': { $ne: 'inactive' }
      }),
      // 휴면 고객 수
      db.collection(CUSTOMERS_COLLECTION).countDocuments({
        ...baseFilter,
        'meta.status': 'inactive'
      }),
      // 이번 달 신규 고객 수
      db.collection(CUSTOMERS_COLLECTION).countDocuments({
        ...baseFilter,
        'meta.created_at': {
          $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        }
      })
    ]);

    res.json({
      success: true,
      total,
      active,
      inactive,
      newThisMonth,
      totalTags: 0,
      mostUsedTags: []
    });
  } catch (error) {
    console.error('[Customers Stats] Error:', error);
    backendLogger.error('Customers', '고객 통계 조회 오류', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 고객 초성별 카운트 조회 API
 * GET /api/customers/initials
 * 인증된 사용자의 고객을 이름 초성별로 집계하여 반환
 */
router.get('/customers/initials', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }

    // 삭제된 고객 제외
    const baseFilter = { 'meta.created_by': userId, deleted_at: null };

    // 고객 이름만 조회
    const customers = await db.collection(CUSTOMERS_COLLECTION)
      .find(baseFilter)
      .project({ 'personal_info.name': 1 })
      .toArray();

    // 초성별 카운트 집계
    const initials = {};
    customers.forEach(c => {
      const name = c.personal_info?.name;
      if (!name) return;
      const initial = getInitialFromChar(name.charAt(0));
      if (initial) {
        initials[initial] = (initials[initial] || 0) + 1;
      }
    });

    res.json({ success: true, data: { initials } });
  } catch (error) {
    backendLogger.error('Customers', '고객 초성 카운트 조회 오류', error);
    res.status(500).json({
      success: false,
      error: '고객 초성 카운트 조회에 실패했습니다.'
    });
  }
});

/**
 * 고객 목록 조회 API
 */
router.get('/customers', authenticateJWTorAPIKey, async (req, res) => {
  try {
    // ⭐ userId 추출 및 검증 (사용자 계정 기능)
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId required'
      });
    }

    const {
      page = 1,
      limit = 10,
      search,
      status = 'active',  // ⭐ 기본값: active (활성 고객만)
      customerType,
      region,
      startDate,
      endDate,
      hasDocuments,
      sort,
      initial,
    } = req.query;
    const skip = (page - 1) * limit;

    // Sort criteria mapping
    const sortMap = {
      'name_asc': { 'personal_info.name': 1 },
      'name_desc': { 'personal_info.name': -1 },
      'birth_asc': { 'personal_info.birth_date': 1 },
      'birth_desc': { 'personal_info.birth_date': -1 },
      'gender_asc': { 'personal_info.gender': 1 },
      'gender_desc': { 'personal_info.gender': -1 },
      'phone_asc': { 'personal_info.mobile_phone': 1 },
      'phone_desc': { 'personal_info.mobile_phone': -1 },
      'email_asc': { 'personal_info.email': 1 },
      'email_desc': { 'personal_info.email': -1 },
      'address_asc': { 'personal_info.address.address1': 1 },
      'address_desc': { 'personal_info.address.address1': -1 },
      'type_asc': { 'insurance_info.customer_type': 1 },
      'type_desc': { 'insurance_info.customer_type': -1 },
      'status_asc': { 'meta.status': 1 },
      'status_desc': { 'meta.status': -1 },
      'created_asc': { 'meta.created_at': 1 },
      'created_desc': { 'meta.created_at': -1 },
    };
    const sortCriteria = (sort && sortMap[sort]) || { 'meta.created_at': -1 };

    // ⭐ created_by 필터 추가 (사용자 계정 기능)
    let filter = {
      'meta.created_by': userId
    };

    // 기본 검색 (이름, 전화번호, 이메일)
    if (search) {
      // URL 디코딩 처리 (이미 디코딩된 경우 그대로 사용)
      let decodedSearch;
      try {
        decodedSearch = decodeURIComponent(search);
      } catch (e) {
        decodedSearch = search; // 디코딩 실패 시 원본 사용
      }

      // regex 특수문자 이스케이프 — (주), [주] 등이 정상 검색되도록
      const escapedSearch = escapeRegex(decodedSearch);
      filter.$or = [
        { 'personal_info.name': { $regex: escapedSearch, $options: 'i' } },
        { 'personal_info.mobile_phone': { $regex: escapedSearch, $options: 'i' } },
        { 'personal_info.email': { $regex: escapedSearch, $options: 'i' } }
      ];
    }

    // ⭐ Status filter (soft delete 지원)
    // 🔴 삭제된 고객은 항상 제외 (deleted_at이 null인 것만)
    filter['deleted_at'] = null;

    if (status === 'all') {
      // No status filter - show all customers (but still exclude deleted)
    } else if (status === 'inactive') {
      filter['meta.status'] = 'inactive';
    } else {
      // Default: only active customers
      filter['meta.status'] = 'active';
    }

    // 고급 검색 필터들
    if (customerType) {
      filter['insurance_info.customer_type'] = customerType;
    }

    if (region) {
      if (region === '기타') {
        // 17개 시도가 아닌 모든 경우
        const koreanRegions = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
                              '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
        filter['personal_info.address.address1'] = {
          $not: { $regex: `^(${koreanRegions.join('|')})`, $options: 'i' }
        };
      } else {
        filter['personal_info.address.address1'] = { $regex: `^${escapeRegex(region)}`, $options: 'i' };
      }
    }

    // 날짜 범위 필터 (등록일 기준)
    if (startDate || endDate) {
      const dateFilter = {};
      if (startDate) {
        // "YYYY-MM-DD" 형식을 UTC 자정으로 변환
        dateFilter.$gte = new Date(startDate + 'T00:00:00.000Z');
      }
      if (endDate) {
        // "YYYY-MM-DD" 형식을 UTC 23:59:59.999로 변환
        dateFilter.$lte = new Date(endDate + 'T23:59:59.999Z');
      }
      filter['meta.created_at'] = dateFilter;
    }

    // 문서 보유 여부 필터
    if (hasDocuments === 'true') {
      filter['documents'] = { $exists: true, $not: { $size: 0 } };
    } else if (hasDocuments === 'false') {
      // 기존 $or가 있으면 $and로 감싸서 조건 추가
      if (filter.$or) {
        filter = {
          $and: [
            filter,
            {
              $or: [
                { 'documents': { $exists: false } },
                { 'documents': { $size: 0 } }
              ]
            }
          ]
        };
      } else {
        filter.$or = [
          { 'documents': { $exists: false } },
          { 'documents': { $size: 0 } }
        ];
      }
    }

    // Initial consonant filter (초성/알파벳/숫자)
    if (initial && typeof initial === 'string' && initial.length === 1) {
      let nameFilter = null;
      const code = initial.charCodeAt(0);

      // Korean consonant (ㄱ-ㅎ: U+3131-U+314E)
      if (code >= 0x3131 && code <= 0x314E) {
        const range = CHOSUNG_RANGE_MAP[initial];
        if (range) {
          nameFilter = { $gte: range[0], $lt: range[1] };
        }
      }
      // Alphabet (A-Z, a-z)
      else if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
        const upper = initial.toUpperCase();
        const lower = initial.toLowerCase();
        nameFilter = { $regex: `^[${escapeRegex(upper)}${escapeRegex(lower)}]` };
      }
      // Number (0-9)
      else if (code >= 48 && code <= 57) {
        nameFilter = { $regex: `^${escapeRegex(initial)}` };
      }

      if (nameFilter) {
        if (filter.$and) {
          filter.$and.push({ 'personal_info.name': nameFilter });
        } else if (filter.$or) {
          filter = { $and: [filter, { 'personal_info.name': nameFilter }] };
        } else {
          filter['personal_info.name'] = nameFilter;
        }
      }
    }

    // Parallel query: customers + count + stats
    const [customers, totalCount, statsResult] = await Promise.all([
      db.collection(CUSTOMERS_COLLECTION)
        .find(filter)
        .sort(sortCriteria)
        .skip(skip)
        .limit(parseInt(limit))
        .toArray(),
      db.collection(CUSTOMERS_COLLECTION).countDocuments(filter),
      // Stats: type/status breakdown (unfiltered, base filter only)
      db.collection(CUSTOMERS_COLLECTION).aggregate([
        { $match: { 'meta.created_by': userId, deleted_at: null } },
        { $group: {
          _id: { status: '$meta.status', type: '$insurance_info.customer_type' },
          count: { $sum: 1 }
        }}
      ]).toArray()
    ]);

    // Process stats into structured object
    const stats = { activePersonal: 0, activeCorporate: 0, inactivePersonal: 0, inactiveCorporate: 0 };
    for (const s of statsResult) {
      const st = s._id.status || 'active';
      const tp = s._id.type || '개인';
      if (st === 'active' && tp === '개인') stats.activePersonal = s.count;
      else if (st === 'active' && tp === '법인') stats.activeCorporate = s.count;
      else if (st === 'inactive' && tp === '개인') stats.inactivePersonal = s.count;
      else if (st === 'inactive' && tp === '법인') stats.inactiveCorporate = s.count;
    }

    res.json({
      success: true,
      data: {
        customers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalCount,
          limit: parseInt(limit)
        },
        stats
      }
    });
  } catch (error) {
    backendLogger.error('Customers', '고객 목록 조회 오류', error);
    res.status(500).json({
      success: false,
      error: '고객 목록 조회에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 새 고객 등록 API
 */
router.post('/customers', authenticateJWTorAPIKey, async (req, res) => {
  console.log('[DEBUG] POST /api/customers 요청 수신:', req.body?.personal_info?.name);
  try {
    const customerData = req.body;

    // ⭐ userId 추출 (사용자 계정 기능)
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId required'
      });
    }

    // 고객명 필수 체크 및 XSS 방지 새니타이징
    const rawName = customerData.personal_info?.name;
    if (!rawName) {
      return res.status(400).json({
        success: false,
        error: '고객명은 필수 입력 항목입니다.'
      });
    }
    const originalName = sanitizeHtml(rawName);  // XSS 방지: HTML 태그 제거
    if (!originalName) {
      return res.status(400).json({
        success: false,
        error: '유효한 고객명을 입력해주세요. (HTML 태그는 허용되지 않습니다)'
      });
    }

    // 🔴 중복 체크 (철칙: 고객명은 userId 내에서 개인/법인/활성/휴면 모두 통틀어 유일해야 함)
    // - customer_type 조건 없음: 개인 "홍길동"이 있으면 법인 "홍길동" 등록 불가
    // - status 조건 없음: 휴면 고객도 포함하여 중복 체크
    const existingCustomer = await db.collection(CUSTOMERS_COLLECTION).findOne(
      {
        'personal_info.name': originalName,
        'meta.created_by': userId  // 같은 설계사 내에서만 중복 체크
      },
      {
        collation: {
          locale: 'ko',
          strength: 2  // 대소문자 무시
        }
      }
    );

    if (existingCustomer) {
      const statusText = existingCustomer.meta?.status === 'inactive' ? ' (휴면)' : '';
      const typeText = existingCustomer.insurance_info?.customer_type || '';
      return res.status(409).json({
        success: false,
        error: `이미 등록된 고객명입니다. [${typeText}${statusText}]`,
        details: {
          field: 'personal_info.name',
          value: originalName,
          existingCustomerType: existingCustomer.insurance_info?.customer_type,
          existingCustomerId: existingCustomer._id.toString(),
          existingStatus: existingCustomer.meta?.status
        }
      });
    }

    const newCustomer = {
      ...customerData,
      personal_info: {
        ...customerData.personal_info,
        name: originalName
      },
      meta: {
        created_at: utcNowDate(),
        updated_at: utcNowDate(),
        created_by: userId,
        last_modified_by: userId,
        status: 'active'
      },
      deleted_at: null,
      deleted_by: null
    };

    const result = await db.collection(CUSTOMERS_COLLECTION).insertOne(newCustomer);

    // 생성된 고객 전체 데이터 반환 (프론트엔드 Zod 검증과 호환)
    const createdCustomer = {
      _id: result.insertedId.toString(),
      ...newCustomer
    };

    // 고객 등록 성공 로그
    activityLogger.log({
      actor: {
        user_id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'create',
        category: 'customer',
        description: '고객 등록',
        target: {
          entity_type: 'customer',
          entity_id: result.insertedId.toString(),
          entity_name: originalName
        }
      },
      result: {
        success: true,
        statusCode: 200
      },
      meta: {
        endpoint: '/api/customers',
        method: 'POST'
      }
    });

    res.json({
      success: true,
      data: createdCustomer
    });
  } catch (error) {
    backendLogger.error('Customers', '고객 등록 오류', error);

    // 고객 등록 실패 로그
    activityLogger.log({
      actor: {
        user_id: req.user?.id,
        name: req.user?.name,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'create',
        category: 'customer',
        description: '고객 등록 실패',
        target: {
          entity_type: 'customer',
          entity_name: req.body?.personal_info?.name
        }
      },
      result: {
        success: false,
        statusCode: 500,
        error: { message: error.message }
      },
      meta: {
        endpoint: '/api/customers',
        method: 'POST'
      }
    });

    res.status(500).json({
      success: false,
      error: '고객 등록에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * POST /api/customers/bulk
 * 고객 일괄 등록/업데이트 (Excel Import용)
 * - 고객명 기준 upsert: 존재하면 업데이트, 없으면 생성
 * - 변경사항 없으면 건너뜀
 */
router.post('/customers/bulk', authenticateJWT, async (req, res) => {
  try {
    const { customers } = req.body;
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId required'
      });
    }

    if (!Array.isArray(customers) || customers.length === 0) {
      return res.status(400).json({
        success: false,
        error: '고객 데이터가 비어있습니다.'
      });
    }

    const now = utcNowDate();

    // 해당 설계사의 기존 고객 목록 조회 (이름으로 매칭)
    const existingCustomers = await db.collection(CUSTOMERS_COLLECTION)
      .find({ 'meta.created_by': userId })
      .toArray();

    const customerMap = new Map();
    existingCustomers.forEach(c => {
      const name = c.personal_info?.name?.trim();
      if (name) customerMap.set(name, c);
    });

    const created = [];
    const updated = [];
    const skipped = [];
    const errors = [];

    // 개인/법인 카운트 추적
    const typeCount = { personal: { created: 0, updated: 0 }, corporate: { created: 0, updated: 0 } };

    for (const customer of customers) {
      try {
        // XSS 방지: HTML 태그 제거
        const rawName = customer.name?.trim();
        const name = rawName ? sanitizeHtml(rawName) : null;
        if (!name) {
          errors.push({ name: customer.name || '(이름없음)', reason: '고객명 누락 또는 유효하지 않은 형식' });
          continue;
        }

        const existingCustomer = customerMap.get(name);

        if (existingCustomer) {
          // 기존 고객 존재 - 업데이트 필요 여부 확인
          const changes = [];
          const updateFields = {};

          // MongoDB 제약: 부모 필드가 null이면 중첩 필드 설정 불가
          // 부모 필드가 null인 경우 전체 객체로 설정해야 함
          const hasPersonalInfo = existingCustomer.personal_info !== null && existingCustomer.personal_info !== undefined;
          const hasInsuranceInfo = existingCustomer.insurance_info !== null && existingCustomer.insurance_info !== undefined;
          const hasMeta = existingCustomer.meta !== null && existingCustomer.meta !== undefined;

          // 연락처 비교/업데이트
          if (customer.mobile_phone && customer.mobile_phone !== existingCustomer.personal_info?.mobile_phone) {
            if (hasPersonalInfo) {
              updateFields['personal_info.mobile_phone'] = customer.mobile_phone;
            } else {
              updateFields['personal_info'] = { name: existingCustomer.personal_info?.name || customer.name, mobile_phone: customer.mobile_phone };
            }
            changes.push('연락처');
          }

          // 주소 비교/업데이트
          if (customer.address) {
            const normalized = normalizeAddress(customer.address);
            const existingAddr = existingCustomer.personal_info?.address;
            if (normalized && normalized.address1 !== existingAddr?.address1) {
              // 주소 자동 검증
              normalized.verification_status = await verifyAddressViaKakao(normalized.address1);
              if (!hasPersonalInfo) {
                updateFields['personal_info'] = { name: existingCustomer.personal_info?.name || customer.name, address: normalized };
              } else if (existingAddr === null || existingAddr === undefined) {
                updateFields['personal_info.address'] = normalized;
              } else {
                updateFields['personal_info.address.address1'] = normalized.address1;
                if (normalized.postal_code) {
                  updateFields['personal_info.address.postal_code'] = normalized.postal_code;
                }
              }
              changes.push('주소');
            }
          }
          // 주소 명시적 삭제: 엑셀에 주소 칼럼이 있지만 값이 비어있는 경우
          else if (customer.address === '' && existingCustomer.personal_info?.address) {
            if (hasPersonalInfo) {
              updateFields['personal_info.address'] = null;
              changes.push('주소 삭제');
            }
          }

          // 성별 비교/업데이트 (개인 고객만)
          if (customer.gender) {
            const normalizedGender = customer.gender === '남' || customer.gender === 'M' ? 'M' :
                                     customer.gender === '여' || customer.gender === 'F' ? 'F' : null;
            if (normalizedGender && normalizedGender !== existingCustomer.personal_info?.gender) {
              if (hasPersonalInfo) {
                updateFields['personal_info.gender'] = normalizedGender;
              } else {
                updateFields['personal_info'] = { name: existingCustomer.personal_info?.name || customer.name, gender: normalizedGender };
              }
              changes.push('성별');
            }
          }

          // 생년월일 비교/업데이트 (개인 고객만)
          if (customer.birth_date && customer.birth_date !== existingCustomer.personal_info?.birth_date) {
            if (hasPersonalInfo) {
              updateFields['personal_info.birth_date'] = customer.birth_date;
            } else {
              updateFields['personal_info'] = { name: existingCustomer.personal_info?.name || customer.name, birth_date: customer.birth_date };
            }
            changes.push('생년월일');
          }

          // 이메일 비교/업데이트
          if (customer.email && customer.email !== existingCustomer.personal_info?.email) {
            if (hasPersonalInfo) {
              updateFields['personal_info.email'] = customer.email;
            } else {
              updateFields['personal_info'] = { name: existingCustomer.personal_info?.name || customer.name, email: customer.email };
            }
            changes.push('이메일');
          }

          // 고객 유형 비교/업데이트
          if (customer.customer_type && customer.customer_type !== existingCustomer.insurance_info?.customer_type) {
            if (hasInsuranceInfo) {
              updateFields['insurance_info.customer_type'] = customer.customer_type;
            } else {
              updateFields['insurance_info'] = { customer_type: customer.customer_type };
            }
            changes.push('고객유형');
          }

          if (changes.length > 0) {
            // 변경사항 있음 - 업데이트
            if (hasMeta) {
              updateFields['meta.updated_at'] = now;
              updateFields['meta.last_modified_by'] = userId;
            } else {
              updateFields['meta'] = { updated_at: now, last_modified_by: userId };
            }

            await db.collection(CUSTOMERS_COLLECTION).updateOne(
              { _id: existingCustomer._id },
              { $set: updateFields }
            );

            const custType = existingCustomer.insurance_info?.customer_type || '개인';
            updated.push({ name, _id: existingCustomer._id.toString(), changes, customer_type: custType });
            if (custType === '법인') typeCount.corporate.updated++;
            else typeCount.personal.updated++;
          } else {
            // 변경사항 없음 - 건너뜀
            const custType = existingCustomer.insurance_info?.customer_type || '개인';
            skipped.push({ name, reason: '변경사항 없음', customer_type: custType });
          }
        } else {
          // 신규 고객 생성
          const normalizedGender = customer.gender === '남' || customer.gender === 'M' ? 'M' :
                                   customer.gender === '여' || customer.gender === 'F' ? 'F' : undefined;

          const newCustomer = {
            personal_info: {
              name: name,
              mobile_phone: customer.mobile_phone || undefined,
              email: customer.email || undefined,
              gender: normalizedGender,
              birth_date: customer.birth_date || undefined,
              address: customer.address ? normalizeAddress(customer.address) : undefined
            },
            insurance_info: {
              customer_type: customer.customer_type || '개인'
            },
            contracts: [],
            documents: [],
            consultations: [],
            meta: {
              created_at: now,
              updated_at: now,
              created_by: userId,
              last_modified_by: userId,
              status: 'active',
              source: 'excel_import'
            }
          };

          const result = await db.collection(CUSTOMERS_COLLECTION).insertOne(newCustomer);
          const custType = customer.customer_type || '개인';
          created.push({ name, _id: result.insertedId.toString(), customer_type: custType });
          if (custType === '법인') typeCount.corporate.created++;
          else typeCount.personal.created++;

          // 현재 배치 내 중복 방지를 위해 맵에 추가
          customerMap.set(name, { ...newCustomer, _id: result.insertedId });
        }
      } catch (itemError) {
        errors.push({ name: customer.name || '(이름없음)', reason: itemError.message });
        backendLogger.error('Customers', `고객 일괄 등록 개별 항목 오류: ${customer.name || '(이름없음)'}`, itemError);
      }
    }

    // 고객 일괄등록 성공 로그 - 상세 description 생성
    const descParts = [];
    if (typeCount.personal.created > 0) descParts.push(`개인 ${typeCount.personal.created}건 등록`);
    if (typeCount.corporate.created > 0) descParts.push(`법인 ${typeCount.corporate.created}건 등록`);
    if (typeCount.personal.updated > 0) descParts.push(`개인 ${typeCount.personal.updated}건 업데이트`);
    if (typeCount.corporate.updated > 0) descParts.push(`법인 ${typeCount.corporate.updated}건 업데이트`);
    if (skipped.length > 0) descParts.push(`${skipped.length}건 건너뜀`);
    if (errors.length > 0) descParts.push(`${errors.length}건 오류`);
    const detailedDesc = descParts.length > 0 ? descParts.join(', ') : '처리 완료';

    activityLogger.log({
      actor: {
        user_id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'bulk_create',
        category: 'customer',
        description: `고객 일괄 등록: ${detailedDesc}`,
        bulkCount: created.length + updated.length,
        details: {
          personal: typeCount.personal,
          corporate: typeCount.corporate,
          skipped: skipped.length,
          errors: errors.length
        }
      },
      result: {
        success: true,
        statusCode: 200,
        affectedCount: created.length + updated.length
      },
      meta: {
        endpoint: '/api/customers/bulk',
        method: 'POST'
      }
    });

    res.json({
      success: true,
      message: `${created.length}건 등록, ${updated.length}건 업데이트, ${skipped.length}건 건너뜀`,
      data: {
        createdCount: created.length,
        updatedCount: updated.length,
        skippedCount: skipped.length,
        errorCount: errors.length,
        created: created.slice(0, 50),
        updated: updated.slice(0, 50),
        skipped: skipped.slice(0, 50),
        errors: errors.slice(0, 50)
      }
    });

  } catch (error) {
    console.error('고객 일괄 등록 오류:', error);
    backendLogger.error('Customer', '고객 일괄 등록 오류', error);

    // 고객 일괄등록 실패 로그
    activityLogger.log({
      actor: {
        user_id: req.user?.id,
        name: req.user?.name,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'bulk_create',
        category: 'customer',
        description: '고객 일괄 등록 실패'
      },
      result: {
        success: false,
        statusCode: 500,
        error: { message: error.message }
      },
      meta: {
        endpoint: '/api/customers/bulk',
        method: 'POST'
      }
    });

    res.status(500).json({
      success: false,
      error: '고객 일괄 등록에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * POST /api/customers/validate-names
 * 고객명 DB 중복 검사 (Excel Import 검증용)
 * - 엑셀 고객명과 DB 기존 고객 비교
 * - 동일 타입: UPDATE 대상 (허용)
 * - 다른 타입: 고유성 위반 (에러)
 */
router.post('/customers/validate-names', authenticateJWT, async (req, res) => {
  try {
    const { customers } = req.body; // [{ name: string, customerType: '개인' | '법인' }]
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId required'
      });
    }

    if (!Array.isArray(customers) || customers.length === 0) {
      return res.status(400).json({
        success: false,
        error: '고객 데이터가 비어있습니다.'
      });
    }

    // 해당 설계사의 기존 고객 목록 조회
    const existingCustomers = await db.collection(CUSTOMERS_COLLECTION)
      .find({ 'meta.created_by': userId })
      .toArray();

    // 이름 → 기존 고객 맵
    const customerMap = new Map();
    existingCustomers.forEach(c => {
      const name = c.personal_info?.name?.trim();
      if (name) {
        customerMap.set(name, {
          _id: c._id.toString(),
          name: name,
          customerType: c.insurance_info?.customer_type || '개인',
          email: c.personal_info?.email,
          phone: c.personal_info?.mobile_phone,
          address: c.personal_info?.address?.address1,
          birthDate: c.personal_info?.birth_date,
          businessNumber: c.insurance_info?.business_number,
          representativeName: c.insurance_info?.representative_name
        });
      }
    });

    // 검증 결과
    const results = [];

    for (const customer of customers) {
      const name = customer.name?.trim();
      const requestedType = customer.customerType || '개인';

      if (!name) {
        results.push({
          name: customer.name || '',
          status: 'empty',
          message: '고객명 누락'
        });
        continue;
      }

      const existing = customerMap.get(name);

      if (!existing) {
        // DB에 없음 → 신규 생성
        results.push({
          name: name,
          status: 'new',
          message: '신규 고객'
        });
      } else if (existing.customerType === requestedType) {
        // 동일 타입 → UPDATE 대상
        results.push({
          name: name,
          status: 'update',
          message: '기존 고객 정보 업데이트',
          existingCustomer: existing
        });
      } else {
        // 다른 타입 → 고유성 위반
        results.push({
          name: name,
          status: 'type_conflict',
          message: `이미 ${existing.customerType}고객으로 등록됨`,
          existingType: existing.customerType,
          requestedType: requestedType
        });
      }
    }

    // 통계
    const stats = {
      total: results.length,
      new: results.filter(r => r.status === 'new').length,
      update: results.filter(r => r.status === 'update').length,
      typeConflict: results.filter(r => r.status === 'type_conflict').length,
      empty: results.filter(r => r.status === 'empty').length
    };

    res.json({
      success: true,
      data: results,
      stats: stats
    });

  } catch (error) {
    console.error('고객명 검증 오류:', error);
    backendLogger.error('Customers', '고객명 검증 오류', error);
    res.status(500).json({
      success: false,
      error: '고객명 검증에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 고객명 중복 체크 API (실시간 검사용)
 * @since 2025-12-11
 *
 * GET /api/customers/check-name?name=홍길동
 *
 * Response:
 * - exists: true/false
 * - customer: 기존 고객 정보 (exists인 경우)
 */
router.get('/customers/check-name', authenticateJWT, async (req, res) => {
  try {
    const { name } = req.query;
    const userId = req.user.id;

    if (!name || !name.trim()) {
      return res.json({
        success: true,
        exists: false,
        customer: null
      });
    }

    const trimmedName = name.trim();

    // 대소문자 무시하여 중복 체크 (CLAUDE.md 규칙)
    const existing = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({
        'meta.created_by': userId,
        'personal_info.name': { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i') }
      });

    res.json({
      success: true,
      exists: !!existing,
      customer: existing ? {
        _id: existing._id.toString(),
        name: existing.personal_info?.name,
        customer_type: existing.insurance_info?.customer_type,
        status: existing.meta?.status || 'active'
      } : null
    });

  } catch (error) {
    console.error('고객명 중복 체크 오류:', error);
    backendLogger.error('Customers', '고객명 중복 체크 오류', error);
    res.status(500).json({
      success: false,
      error: '고객명 중복 체크에 실패했습니다.'
    });
  }
});

/**
 * 계약 당사자(계약자/피보험자) 이름으로 관련 고객 검색 API
 * @since 2026-02-14
 *
 * GET /api/customers/by-contract-party?name=캐치업코리아
 *
 * AR/CRS/수동계약에서 계약자 또는 피보험자로 등장하는 고객 목록 반환
 * → 법인 고객이 관련 개인 고객을 찾을 때 사용
 */
router.get('/customers/by-contract-party', authenticateJWT, async (req, res) => {
  try {
    const { name } = req.query;
    const userId = req.user.id;

    if (!name || !name.trim()) {
      return res.json({ success: true, customers: [] });
    }

    const partyName = name.trim();

    // 1) AR/CRS 임베디드 데이터에서 계약자/피보험자 검색
    const embeddedMatches = await db.collection(CUSTOMERS_COLLECTION).find({
      'meta.created_by': userId,
      deleted_at: null,
      $or: [
        { 'annual_reports.contracts.계약자': partyName },
        { 'annual_reports.contracts.피보험자': partyName },
        { 'annual_reports.lapsed_contracts.계약자': partyName },
        { 'annual_reports.lapsed_contracts.피보험자': partyName },
        { 'customer_reviews.contractor_name': partyName },
        { 'customer_reviews.insured_name': partyName },
      ]
    }, { projection: { _id: 1, 'personal_info.name': 1 } }).toArray();

    // 2) 수동 계약(contracts 컬렉션)에서 검색
    const contractMatches = await db.collection(COLLECTIONS.CONTRACTS).distinct('customer_id', {
      agent_id: new ObjectId(userId),
      $or: [
        { customer_name: partyName },
        { insured_person: partyName },
      ]
    });

    // 수동 계약에서 찾은 customer_id로 고객 정보 조회
    let manualCustomers = [];
    if (contractMatches.length > 0) {
      const validIds = contractMatches.filter(id => id && ObjectId.isValid(id)).map(id => new ObjectId(id));
      if (validIds.length > 0) {
        manualCustomers = await db.collection(CUSTOMERS_COLLECTION).find({
          _id: { $in: validIds },
          'meta.created_by': userId,
          deleted_at: null,
        }, { projection: { _id: 1, 'personal_info.name': 1 } }).toArray();
      }
    }

    // 3) 결과 병합 및 중복 제거
    const seen = new Set();
    const customersResult = [];
    for (const c of [...embeddedMatches, ...manualCustomers]) {
      const id = c._id.toString();
      if (!seen.has(id)) {
        seen.add(id);
        customersResult.push({
          _id: id,
          name: c.personal_info?.name || '',
        });
      }
    }

    res.json({ success: true, customers: customersResult });
  } catch (error) {
    console.error('계약 당사자 검색 오류:', error);
    backendLogger.error('Customers', '계약 당사자 검색 오류', error);
    res.status(500).json({
      success: false,
      error: '계약 당사자 검색에 실패했습니다.'
    });
  }
});

/**
 * 고객 상세 정보 조회 API
 * ⭐ 설계사별 고객 데이터 격리 적용
 */
router.get('/customers/:id', authenticateJWTorAPIKey, async (req, res) => {
  try {
    const { id } = req.params;

    // ⭐ 설계사별 고객 데이터 격리: userId 검증
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 고객 ID입니다.'
      });
    }

    // ⭐ 1단계: 고객 존재 여부 확인 (소유권 무관)
    const customerExists = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({ _id: new ObjectId(id) });

    if (!customerExists) {
      // Issue #1 수정: 존재하지 않는 고객에 대한 정확한 오류 메시지
      return res.status(404).json({
        success: false,
        error: '고객을 찾을 수 없습니다.'
      });
    }

    // ⭐ 2단계: 소유권 검증 (해당 설계사의 고객인지)
    if (customerExists.meta?.created_by !== userId) {
      return res.status(403).json({
        success: false,
        error: '접근 권한이 없습니다.'
      });
    }

    res.json({
      success: true,
      data: customerExists
    });
  } catch (error) {
    console.error('고객 조회 오류:', error);
    backendLogger.error('Customers', '고객 조회 오류', error);
    res.status(500).json({
      success: false,
      error: '고객 조회에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 고객 정보 수정 API
 * ⭐ 설계사별 고객 데이터 격리 적용
 */
router.put('/customers/:id', authenticateJWTorAPIKey, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // ⭐ 설계사별 고객 데이터 격리: userId 검증
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 고객 ID입니다.'
      });
    }

    // ⭐ 소유권 검증: 해당 설계사의 고객만 수정 가능
    const existingCustomer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({
        _id: new ObjectId(id),
        'meta.created_by': userId
      });

    if (!existingCustomer) {
      return res.status(403).json({
        success: false,
        error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
      });
    }

    // XSS 방지: 고객명에 HTML 태그가 있으면 제거
    if (updateData.personal_info?.name) {
      updateData.personal_info.name = sanitizeHtml(updateData.personal_info.name);
      if (!updateData.personal_info.name) {
        return res.status(400).json({
          success: false,
          error: '유효한 고객명을 입력해주세요. (HTML 태그는 허용되지 않습니다)'
        });
      }
    }

    // 주소 변경 여부 확인 및 이력 저장
    const newAddress = updateData.personal_info?.address;
    const oldAddress = existingCustomer.personal_info?.address;

    let addressChanged = false;
    if (newAddress && oldAddress) {
      // 주소 변경 여부 체크
      addressChanged = (
        newAddress.postal_code !== oldAddress.postal_code ||
        newAddress.address1 !== oldAddress.address1 ||
        newAddress.address2 !== oldAddress.address2
      );

      // 주소가 변경된 경우 이전 주소를 이력에 저장
      if (addressChanged && oldAddress) {
        const historyRecord = {
          customer_id: new ObjectId(id),
          address: oldAddress,
          changed_at: utcNowDate(),
          reason: updateData.address_change_reason || '고객 요청',
          changed_by: updateData.modified_by || '시스템',
          notes: updateData.address_change_notes || ''
        };

        await db.collection('address_history').insertOne(historyRecord);
        console.log(`✅ 고객 ${id}의 이전 주소가 보관소에 저장됨`);
      }
    }

    // 주소 자동 검증: 주소가 변경되었고 verification_status가 명시적으로 전달되지 않은 경우
    if (newAddress && newAddress.address1) {
      const needsVerification = addressChanged ||
        !oldAddress ||
        (!newAddress.verification_status || newAddress.verification_status === 'pending');
      if (needsVerification && newAddress.verification_status !== 'verified' && newAddress.verification_status !== 'failed') {
        newAddress.verification_status = await verifyAddressViaKakao(newAddress.address1);
        console.log(`🔍 고객 ${id} 주소 자동 검증: ${newAddress.verification_status}`);
      }
    }

    // 기존 고객 정보 업데이트 로직
    // ⭐ 기존 고객의 address가 null인 경우 처리
    // MongoDB는 null 내부에 필드를 생성할 수 없으므로 전체 객체를 한번에 설정해야 함
    if (updateData.personal_info?.address && existingCustomer.personal_info?.address === null) {
      // address 전체를 덮어쓰기 위해 flattenObject 대신 직접 설정
      await db.collection(CUSTOMERS_COLLECTION).updateOne(
        { _id: new ObjectId(id) },
        { $set: { 'personal_info.address': updateData.personal_info.address } }
      );
      console.log(`✅ 고객 ${id}의 주소가 신규 설정됨 (기존 null → 새 주소)`);
      // 이미 처리했으므로 updateData에서 제거
      delete updateData.personal_info.address;
    }

    // ⭐ flattenObject로 중첩 객체를 dot notation으로 변환
    // 예: { personal_info: { mobile_phone: '010-1234' } }
    //  → { 'personal_info.mobile_phone': '010-1234' }
    // 이렇게 하면 기존 personal_info.name 등이 유지됨
    const flattenedData = flattenObject(updateData);
    const updateFields = {
      ...flattenedData,
      'meta.updated_at': utcNowDate(),
      'meta.last_modified_by': userId  // Issue #2 수정: JWT에서 추출한 사용자 ID 사용
    };

    // 주소 변경 관련 임시 필드 제거 (DB에 저장하지 않음)
    delete updateFields.address_change_reason;
    delete updateFields.address_change_notes;

    const result = await db.collection(CUSTOMERS_COLLECTION)
      .updateOne({ _id: new ObjectId(id) }, { $set: updateFields });

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: '고객을 찾을 수 없습니다.'
      });
    }

    // 고객 수정 성공 로그
    activityLogger.log({
      actor: {
        user_id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'update',
        category: 'customer',
        description: '고객 정보 수정',
        target: {
          entity_type: 'customer',
          entity_id: id,
          entity_name: existingCustomer.personal_info?.name
        }
      },
      result: {
        success: true,
        statusCode: 200
      },
      meta: {
        endpoint: `/api/customers/${id}`,
        method: 'PUT'
      }
    });

    res.json({
      success: true,
      message: '고객 정보가 성공적으로 수정되었습니다.',
      address_archived: addressChanged
    });
  } catch (error) {
    backendLogger.error('Customers', '고객 수정 오류', error);

    // 고객 수정 실패 로그
    activityLogger.log({
      actor: {
        user_id: req.user?.id,
        name: req.user?.name,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'update',
        category: 'customer',
        description: '고객 정보 수정 실패',
        target: {
          entity_type: 'customer',
          entity_id: req.params?.id
        }
      },
      result: {
        success: false,
        statusCode: 500,
        error: { message: error.message }
      },
      meta: {
        endpoint: `/api/customers/${req.params?.id}`,
        method: 'PUT'
      }
    });

    res.status(500).json({
      success: false,
      error: '고객 정보 수정에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 고객 삭제 API
 * ⭐ 설계사별 고객 데이터 격리 적용
 * ⭐ 트랜잭션으로 원자적 삭제 (좀비 참조 방지)
 */
router.delete('/customers/:id', authenticateJWTorAPIKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { permanent } = req.query; // ?permanent=true for hard delete

    // ⭐ 설계사별 고객 데이터 격리: userId 검증
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 고객 ID입니다.'
      });
    }

    // ⭐ 소유권 검증: 해당 설계사의 고객만 삭제 가능
    const existingCustomer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({
        _id: new ObjectId(id),
        'meta.created_by': userId
      });

    if (!existingCustomer) {
      return res.status(403).json({
        success: false,
        error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
      });
    }

    // ⭐ Soft Delete (Default)
    if (permanent !== 'true') {
      const result = await db.collection(CUSTOMERS_COLLECTION).findOneAndUpdate(
        { _id: new ObjectId(id) },
        {
          $set: {
            'meta.status': 'inactive',
            'meta.updated_at': utcNowISO()
          }
        },
        { returnDocument: 'after' }  // 업데이트 후 문서 반환
      );

      // 🔍 디버그: result 구조 확인
      console.log('🔍 [DEBUG] findOneAndUpdate result:', JSON.stringify({
        hasValue: !!result.value,
        hasOk: !!result.ok,
        resultKeys: Object.keys(result || {}),
        resultType: typeof result
      }));

      if (!result.value && !result) {
        return res.status(404).json({
          success: false,
          error: '고객을 찾을 수 없습니다.'
        });
      }

      const updatedCustomer = result.value || result;
      console.log(`🗂️ [Soft Delete] 고객 ${id} 휴면 처리 완료 (by ${userId})`);

      // 고객 삭제(휴면) 성공 로그
      activityLogger.log({
        actor: {
          user_id: req.user.id,
          name: req.user.name,
          email: req.user.email,
          role: req.user.role,
          ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
          userAgent: req.headers['user-agent']
        },
        action: {
          type: 'delete',
          category: 'customer',
          description: '고객 휴면 처리',
          target: {
            entity_type: 'customer',
            entity_id: id,
            entity_name: existingCustomer.personal_info?.name
          }
        },
        result: {
          success: true,
          statusCode: 200
        },
        meta: {
          endpoint: `/api/customers/${id}`,
          method: 'DELETE'
        }
      });

      return res.json({
        success: true,
        message: '고객이 휴면 처리되었습니다.',
        soft_delete: true,
        customer: updatedCustomer  // 업데이트된 고객 데이터 반환
      });
    }

    // ⭐ Hard Delete (Permanent) - 기존 로직 유지
    console.log(`🗑️ [Hard Delete] 고객 ${id} 영구 삭제 시작...`);

    // ⭐ Cascading Delete: 순차적으로 관련 데이터 삭제
    // 참고: MongoDB Standalone은 트랜잭션 미지원 → 순차 삭제 + 정리 API로 대응
    const customerId = new ObjectId(id);
    let relationshipsDeleteCount = 0;
    let contractsDeleteCount = 0;
    let filesUpdateCount = 0;

    // 1. 해당 고객과 관련된 모든 관계 레코드 삭제
    const relationshipsDeleteResult = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS).deleteMany({
      $or: [
        { from_customer: customerId },
        { related_customer: customerId },
        { family_representative: customerId }
      ]
    });
    relationshipsDeleteCount = relationshipsDeleteResult.deletedCount;

    // 2. 해당 고객의 계약 삭제
    const contractsDeleteResult = await db.collection(COLLECTIONS.CONTRACTS).deleteMany({
      customer_id: customerId
    });
    contractsDeleteCount = contractsDeleteResult.deletedCount;

    // 3. 고객과 연결된 모든 문서 삭제 (파일 + DB + Qdrant)
    const fs = require('fs').promises;
    let deletedDocumentsCount = 0;

    // 고객과 연결된 모든 문서 조회
    // ⚠️ customerId가 ObjectId 또는 문자열로 저장될 수 있으므로 둘 다 검색
    const customerDocuments = await db.collection(COLLECTION_NAME).find({
      $or: [
        { customerId: new ObjectId(id) },
        { customerId: id }  // 문자열 형태 대응 (document_pipeline 호환)
      ]
    }).toArray();

    console.log(`🗑️ [Hard Delete] 고객 ${id}와 연결된 문서 ${customerDocuments.length}개 삭제 시작`);

    // 각 문서 삭제
    for (const document of customerDocuments) {
      try {
        const docId = document._id.toString();

        // AR 파싱 데이터 삭제
        if (document.is_annual_report) {
          try {
            const arCustomerId = document.customerId;
            const issueDate = document.ar_metadata?.issue_date;

            if (arCustomerId && issueDate) {
              await db.collection(CUSTOMERS_COLLECTION).updateOne(
                { '_id': arCustomerId },
                {
                  $pull: { annual_reports: { issue_date: new Date(issueDate) } },
                  $set: { 'meta.updated_at': utcNowDate() }
                }
              );
            }
          } catch (arError) {
            console.warn(`⚠️ [AR 삭제] 실패: ${arError.message}`);
          }
        }

        // 파일 시스템에서 파일 삭제
        if (document.upload?.destPath) {
          try {
            await fs.unlink(document.upload.destPath);
            console.log(`✅ 파일 삭제: ${document.upload.destPath}`);
          } catch (fileError) {
            console.warn(`⚠️ 파일 삭제 실패: ${fileError.message}`);
          }
        }

        // MongoDB에서 문서 삭제
        await db.collection(COLLECTION_NAME).deleteOne({ _id: document._id });

        // Qdrant에서 임베딩 삭제
        try {
          await qdrantClient.delete(QDRANT_COLLECTION, {
            filter: {
              must: [{ key: 'doc_id', match: { value: docId } }]
            }
          });
        } catch (qdrantError) {
          console.warn(`⚠️ [Qdrant] 임베딩 삭제 실패: ${qdrantError.message}`);
        }

        deletedDocumentsCount++;
        console.log(`✅ 문서 삭제 완료: ${docId}`);

      } catch (docError) {
        console.error(`❌ 문서 삭제 중 오류: ${docError.message}`);
        backendLogger.error('Documents', '고객 삭제 시 문서 삭제 오류', docError);
      }
    }

    filesUpdateCount = deletedDocumentsCount;

    // 4. 고객 삭제
    await db.collection(CUSTOMERS_COLLECTION).deleteOne({ _id: customerId });

    console.log(`🗑️ [Hard Delete] 고객 ${id} 영구 삭제 완료: 관계=${relationshipsDeleteCount}, 계약=${contractsDeleteCount}, 문서=${filesUpdateCount}`);

    // 고객 영구 삭제 성공 로그
    activityLogger.log({
      actor: {
        user_id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'delete',
        category: 'customer',
        description: '고객 영구 삭제',
        target: {
          entity_type: 'customer',
          entity_id: id,
          entity_name: existingCustomer.personal_info?.name
        }
      },
      result: {
        success: true,
        statusCode: 200,
        affectedCount: 1 + relationshipsDeleteCount + contractsDeleteCount + filesUpdateCount
      },
      meta: {
        endpoint: `/api/customers/${id}?permanent=true`,
        method: 'DELETE'
      }
    });

    res.json({
      success: true,
      message: '고객이 영구적으로 삭제되었습니다.',
      deletedRelationships: relationshipsDeleteCount,
      deletedContracts: contractsDeleteCount,
      deletedDocuments: filesUpdateCount,
      cascading: true,  // Cascading Delete 사용 여부 표시
      permanent: true
    });
  } catch (error) {
    backendLogger.error('Customers', '고객 삭제 오류', error);

    // 고객 삭제 실패 로그
    activityLogger.log({
      actor: {
        user_id: req.user?.id,
        name: req.user?.name,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'delete',
        category: 'customer',
        description: '고객 삭제 실패',
        target: {
          entity_type: 'customer',
          entity_id: req.params?.id
        }
      },
      result: {
        success: false,
        statusCode: 500,
        error: { message: error.message }
      },
      meta: {
        endpoint: `/api/customers/${req.params?.id}`,
        method: 'DELETE'
      }
    });

    res.status(500).json({
      success: false,
      error: '고객 삭제에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 고객 복원 API
 * POST /api/customers/:id/restore
 */
router.post('/customers/:id/restore', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 고객 ID입니다.'
      });
    }

    // ⭐ 소유권 검증: 해당 설계사의 고객만 복원 가능
    const existingCustomer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({
        _id: new ObjectId(id),
        'meta.created_by': userId
      });

    if (!existingCustomer) {
      return res.status(403).json({
        success: false,
        error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
      });
    }

    // 이미 활성 상태인지 확인
    if (existingCustomer.meta?.status === 'active') {
      return res.status(400).json({
        success: false,
        error: '이미 활성 상태인 고객입니다.'
      });
    }

    // ⭐ 복원 처리
    const result = await db.collection(CUSTOMERS_COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(id) },
      {
        $set: {
          'meta.status': 'active',
          'meta.updated_at': utcNowISO(),
          deleted_at: null,
          deleted_by: null
        }
      },
      { returnDocument: 'after' }  // 업데이트 후 문서 반환
    );

    // 🔍 디버그: result 구조 확인
    console.log('🔍 [DEBUG] findOneAndUpdate result:', JSON.stringify({
      hasValue: !!result.value,
      hasOk: !!result.ok,
      resultKeys: Object.keys(result || {}),
      resultType: typeof result
    }));

    const restoredCustomer = result.value || result;

    if (!restoredCustomer) {
      return res.status(404).json({
        success: false,
        error: '복원할 수 없는 고객입니다.'
      });
    }

    console.log(`♻️ [Restore] 고객 ${id} 복원 완료 (by ${userId})`);

    res.json({
      success: true,
      message: '고객이 복원되었습니다.',
      data: restoredCustomer  // 복원된 고객 데이터 반환
    });
  } catch (error) {
    console.error('고객 복원 오류:', error);
    backendLogger.error('Customers', '고객 복원 오류', error);
    res.status(500).json({
      success: false,
      error: '고객 복원에 실패했습니다.',
      details: error.message
    });
  }
});

// Address/Geocoding 라우트 (routes/address-routes.js로 추출)
router.use('/', require('./address-routes')());

  return router;
};
