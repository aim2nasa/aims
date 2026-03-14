/**
 * customers-routes.js - Customer CRUD, Document 관계, AR/CR, 주소 이력, 메모
 *
 * Phase 9: server.js 리팩토링
 * @since 2026-02-07
 */

const express = require('express');
const { ObjectId } = require('mongodb');
const axios = require('axios');
const fs = require('fs');
const { COLLECTIONS } = require('@aims/shared-schema');
const backendLogger = require('../lib/backendLogger');
const { utcNowISO, utcNowDate, normalizeTimestamp } = require('../lib/timeUtils');
const { sanitizeHtml, flattenObject, escapeRegex, CHOSUNG_RANGE_MAP, getInitialFromChar } = require('../lib/helpers');
const activityLogger = require('../lib/activityLogger');
const sseManager = require('../lib/sseManager');
const {
  sendSSE,
  notifyCustomerDocSubscribers,
  notifyDocumentStatusSubscribers,
  notifyDocumentListSubscribers,
  notifyPersonalFilesSubscribers,
  notifyARSubscribers,
  notifyCRSubscribers,
} = sseManager;
const { prepareDocumentResponse, analyzeDocumentStatus, isConvertibleFile } = require('../lib/documentStatusHelper');
const createPdfConversionTrigger = require('../lib/pdfConversionTrigger');

/**
 * 카카오 API로 주소 자동 검증
 * @param {string} address1 - 도로명주소
 * @returns {Promise<'verified'|'failed'>} 검증 결과
 */
async function verifyAddressViaKakao(address1) {
  if (!address1 || !address1.trim()) return 'failed';
  try {
    const kakaoApiKey = process.env.KAKAO_REST_API_KEY
      ? `KakaoAK ${process.env.KAKAO_REST_API_KEY}`
      : 'KakaoAK 0e0db455dcbf09ba1309daad71af4174';
    const response = await axios.get('https://dapi.kakao.com/v2/local/search/address.json', {
      params: { query: address1.trim(), page: 1, size: 10, analyze_type: 'similar' },
      headers: { 'Authorization': kakaoApiKey },
      timeout: 5000
    });
    if (!response.data?.documents?.length) return 'failed';
    const normalizedInput = address1.trim().replace(/\s+/g, ' ').toLowerCase();
    return response.data.documents.some(doc => {
      const roadAddr = (doc.road_address?.address_name || '').toLowerCase();
      return roadAddr.includes(normalizedInput) ||
             normalizedInput.includes(roadAddr.split(' ').slice(0, 3).join(' '));
    }) ? 'verified' : 'failed';
  } catch (error) {
    console.error('[verifyAddressViaKakao] 검증 실패:', error.message);
    return 'failed';
  }
}

module.exports = function(db, analyticsDb, authenticateJWT, authenticateJWTorAPIKey, authenticateJWTWithQuery, qdrantClient, qdrantCollection, upload) {
  const router = express.Router();
  const QDRANT_COLLECTION = qdrantCollection;
  const CUSTOMERS_COLLECTION = COLLECTIONS.CUSTOMERS;
  const COLLECTION_NAME = COLLECTIONS.FILES;

  // PDF 변환 오케스트레이션 (공유 모듈)
  const { convertDocumentInBackground, triggerPdfConversionIfNeeded } = createPdfConversionTrigger(db);

  // SSE channel aliases (sseManager.channels의 Map 직접 참조)
  const customerDocSSEClients = sseManager.channels.customerDoc;
  const customerCombinedSSEClients = sseManager.channels.customerCombined;
  const arSSEClients = sseManager.channels.ar;
  const crSSEClients = sseManager.channels.cr;
  const personalFilesSSEClients = sseManager.channels.personalFiles;
  const documentStatusSSEClients = sseManager.channels.documentStatus;
  const documentListSSEClients = sseManager.channels.documentList;
  const userAccountSSEClients = sseManager.channels.userAccount;

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
 * 주소 문자열을 AIMS 주소 체계로 정규화
 * metdo 등 외부 소스에서 "06189 서울 강남구 도곡로93길 12" 형태로 들어오는 경우
 * → postal_code: "06189", address1: "서울 강남구 도곡로93길 12" 로 분리
 */
function normalizeAddress(rawAddress) {
  if (!rawAddress || typeof rawAddress !== 'string') return null;
  const trimmed = rawAddress.trim();
  if (!trimmed) return null;

  // 5~6자리 숫자 + 공백 + 나머지 → 우편번호 분리
  const match = trimmed.match(/^(\d{5,6})\s+(.+)/);
  if (match) {
    return { postal_code: match[1], address1: match[2] };
  }
  return { address1: trimmed };
}

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
    const customers = [];
    for (const c of [...embeddedMatches, ...manualCustomers]) {
      const id = c._id.toString();
      if (!seen.has(id)) {
        seen.add(id);
        customers.push({
          _id: id,
          name: c.personal_info?.name || '',
        });
      }
    }

    res.json({ success: true, customers });
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


/**
 * Qdrant에서 문서의 모든 청크에 customer_id를 동기화합니다.
 * @param {string} documentId - 문서 ID (ObjectId 문자열)
 * @param {string|null} customerId - 고객 ID (ObjectId 문자열, null이면 제거)
 * @returns {Promise<{success: boolean, message: string, chunksUpdated?: number}>}
 */
async function syncQdrantCustomerRelation(documentId, customerId) {
  try {
    const qdrantCollectionName = 'docembed';

    // 1. Qdrant에서 해당 문서의 모든 청크 찾기 (doc_id로 필터링)
    const scrollResult = await qdrantClient.scroll(qdrantCollectionName, {
      filter: {
        must: [
          {
            key: 'doc_id',
            match: { value: documentId }
          }
        ]
      },
      limit: 1000, // 대용량 문서 대비 (최대 700개 예상)
      with_payload: true
    });

    const points = scrollResult.points; // Node.js 클라이언트는 {points: [], next_page_offset: ...} 형식으로 반환

    if (!points || points.length === 0) {
      console.log(`⚠️  [Qdrant 동기화] 문서 ${documentId}의 청크를 찾을 수 없습니다.`);
      return {
        success: true,
        message: 'Qdrant에 청크가 없음 (임베딩 전 문서)',
        chunksUpdated: 0
      };
    }

    console.log(`🔄 [Qdrant 동기화] 문서 ${documentId}의 ${points.length}개 청크 업데이트 시작`);

    // 2. 각 청크의 payload 업데이트
    const pointIds = points.map(point => point.id);

    if (customerId === null) {
      // customer_id 제거 (연결 해제)
      await qdrantClient.deletePayload(qdrantCollectionName, {
        keys: ['customer_id'],
        points: pointIds
      });
      console.log(`✅ [Qdrant 동기화] ${pointIds.length}개 청크에서 customer_id 제거 완료`);
    } else {
      // customer_id 추가/업데이트
      await qdrantClient.setPayload(qdrantCollectionName, {
        payload: { customer_id: customerId },
        points: pointIds
      });
      console.log(`✅ [Qdrant 동기화] ${pointIds.length}개 청크에 customer_id=${customerId} 설정 완료`);
    }

    return {
      success: true,
      message: 'Qdrant 동기화 성공',
      chunksUpdated: pointIds.length
    };

  } catch (error) {
    console.error(`❌ [Qdrant 동기화 오류] 문서 ${documentId}:`, error);
    backendLogger.error('Qdrant', `[Qdrant 동기화 오류] 문서 ${documentId}`, error);
    return {
      success: false,
      message: `Qdrant 동기화 실패: ${error.message}`
    };
  }
}

/**
 * 고객에 문서 연결 API
 * ⭐ 설계사별 고객 데이터 격리 적용
 * 🔑 JWT 또는 API Key 인증 지원 (n8n 웹훅용)
 */
router.post('/customers/:id/documents', authenticateJWTorAPIKey, async (req, res) => {
  // 🔑 활동 로그용 actor 정보 (try 블록 밖에서 정의하여 catch에서도 사용 가능)
  let actorInfo = {
    user_id: req.user?.id,
    name: req.user?.name,
    email: req.user?.email,
    role: req.user?.role
  };

  try {
    const { id } = req.params;
    const { document_id, notes } = req.body;

    // ⭐ 설계사별 고객 데이터 격리: userId 검증
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)

    // 🔑 API Key 인증 시 실제 사용자 정보 조회 (활동 로그용)
    if (req.user.authMethod === 'apiKey' && userId) {
      try {
        const actualUser = await db.collection(COLLECTIONS.USERS).findOne(
          { _id: new ObjectId(userId) },
          { projection: { name: 1, email: 1, role: 1 } }
        );
        if (actualUser) {
          actorInfo = {
            user_id: userId,
            name: actualUser.name,
            email: actualUser.email,
            role: actualUser.role || 'agent'
          };
        }
      } catch (e) {
        console.warn('[문서연결] 사용자 정보 조회 실패:', e.message);
      }
    }

    if (!ObjectId.isValid(id) || !ObjectId.isValid(document_id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 ID입니다.'
      });
    }

    // ⭐ 소유권 검증: 해당 설계사의 고객만 연결 가능
    const customer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({
        _id: new ObjectId(id),
        'meta.created_by': userId
      });

    if (!customer) {
      return res.status(403).json({
        success: false,
        error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
      });
    }

    // ⭐ 문서 소유권 검증: 해당 설계사의 문서만 연결 가능
    const document = await db.collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(document_id), ownerId: userId });

    if (!document) {
      return res.status(403).json({
        success: false,
        error: '문서를 찾을 수 없거나 접근 권한이 없습니다.'
      });
    }

    // 🔴 중복 파일 검사: 같은 고객에게 같은 해시의 파일이 이미 연결되어 있는지 확인
    const newFileHash = document.meta?.file_hash;
    if (newFileHash) {
      const existingDocs = customer.documents || [];
      if (existingDocs.length > 0) {
        const existingDocIds = existingDocs.map(d => d.document_id);
        const duplicateDoc = await db.collection(COLLECTION_NAME).findOne({
          _id: { $in: existingDocIds },
          'meta.file_hash': newFileHash
        }, { projection: { _id: 1, 'upload.originalName': 1 } });

        if (duplicateDoc) {
          const existingFileName = duplicateDoc.upload?.originalName || '알 수 없는 파일';
          return res.status(409).json({
            success: false,
            error: 'DUPLICATE_FILE',
            message: `이미 동일한 파일이 이 고객에게 연결되어 있습니다: ${existingFileName}`,
            existingDocumentId: duplicateDoc._id.toString()
          });
        }
      }
    }

    // 고객에 문서 연결 추가 (중복 체크 후)
    const docObjectId = new ObjectId(document_id);
    const alreadyLinked = await db.collection(CUSTOMERS_COLLECTION).findOne({
      _id: new ObjectId(id),
      'documents.document_id': docObjectId
    });

    if (!alreadyLinked) {
      const documentLink = {
        document_id: docObjectId,
        upload_date: utcNowDate(),
        notes: notes || ''
      };

      await db.collection(CUSTOMERS_COLLECTION).updateOne(
        { _id: new ObjectId(id) },
        {
          $push: { documents: documentLink },
          $set: { 'meta.updated_at': utcNowDate() }
        }
      );
    } else {
      // 이미 연결된 문서: 후속 처리(files.customerId 업데이트, Qdrant 동기화, AR 파싱 큐) 모두 스킵
      console.log(`ℹ️ [고객-문서 연결] 이미 연결됨, 중복 push 방지: customer=${id}, document=${document_id}`);
      return res.json({ success: true, message: '이미 연결된 문서입니다.' });
    }

    // 문서에도 고객 연결 정보 추가
    await db.collection(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(document_id) },
      {
        $set: {
          customerId: new ObjectId(id),
          customer_notes: notes || ''
        }
      }
    );

    // 🔥 Qdrant 동기화: 문서의 모든 청크에 customer_id 추가
    const qdrantResult = await syncQdrantCustomerRelation(document_id, id);
    console.log(`📊 [Qdrant 동기화 결과] ${qdrantResult.message}, 업데이트된 청크: ${qdrantResult.chunksUpdated || 0}개`);

    // 📄 PDF 변환 트리거 (Office 문서인 경우)
    let pdfConversionResult = 'not_triggered';
    try {
      pdfConversionResult = await triggerPdfConversionIfNeeded(document);
      console.log(`📄 [PDF변환] 문서 ${document_id}: ${pdfConversionResult}`);
    } catch (convError) {
      console.error(`📄 [PDF변환] 트리거 실패 (${document_id}): ${convError.message}`);
      backendLogger.error('Documents', `[PDF변환] 트리거 실패 (${document_id})`, convError);
      // PDF 변환 실패는 치명적이지 않으므로 계속 진행
    }

    // 📋 AR 문서인 경우 파싱 큐에 추가
    if (document.is_annual_report === true) {
      try {
        const queueDoc = {
          file_id: new ObjectId(document_id),
          customer_id: new ObjectId(id),
          status: 'pending',
          retry_count: 0,
          created_at: utcNowDate(),
          updated_at: utcNowDate(),
          processed_at: null,
          error_message: null,
          metadata: {
            filename: document.filename || 'unknown',
            mime_type: document.mimeType || 'unknown'
          }
        };

        // 중복 방지: file_id가 이미 존재하면 무시
        await db.collection('ar_parse_queue').updateOne(
          { file_id: new ObjectId(document_id) },
          { $setOnInsert: queueDoc },
          { upsert: true }
        );

        console.log(`✅ AR 파싱 큐에 작업 추가: file_id=${document_id}, customer_id=${id}`);
      } catch (queueError) {
        console.error(`❌ AR 파싱 큐 추가 실패: ${queueError.message}`);
        backendLogger.error('Documents', 'AR 파싱 큐 추가 실패', queueError);
        // 큐 추가 실패는 치명적이지 않으므로 계속 진행
      }
    }

    // 문서 업로드 성공 로그 (actorInfo 사용 - API Key 인증 시 실제 사용자 정보 포함)
    activityLogger.log({
      actor: {
        ...actorInfo,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'upload',
        category: 'document',
        description: '문서 업로드',
        target: {
          entity_type: 'document',
          entity_id: document_id,
          entity_name: document.upload?.originalName || document.meta?.filename || document.filename,
          parent_id: id,
          parent_name: customer.personal_info?.name
        }
      },
      result: {
        success: true,
        statusCode: 200
      },
      meta: {
        endpoint: `/api/customers/${id}/documents`,
        method: 'POST'
      }
    });

    // 🔔 SSE 알림: 고객 문서 변경
    notifyCustomerDocSubscribers(id, 'document-change', {
      type: 'linked',
      customerId: id,
      documentId: document_id,
      documentName: document.upload?.originalName || document.filename,
      timestamp: utcNowISO()
    });

    res.json({
      success: true,
      message: '문서가 고객에게 성공적으로 연결되었습니다.',
      qdrant_sync: qdrantResult,
      pdf_conversion: pdfConversionResult
    });
  } catch (error) {
    backendLogger.error('Documents', '문서 연결 오류', error);

    // 문서 업로드 실패 로그 (actorInfo 사용)
    activityLogger.log({
      actor: {
        ...actorInfo,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'upload',
        category: 'document',
        description: '문서 업로드 실패',
        target: {
          entity_type: 'document',
          entity_id: req.body?.document_id,
          parent_id: req.params?.id
        }
      },
      result: {
        success: false,
        statusCode: 500,
        error: { message: error.message }
      },
      meta: {
        endpoint: `/api/customers/${req.params?.id}/documents`,
        method: 'POST'
      }
    });

    res.status(500).json({
      success: false,
      error: '문서 연결에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 고객에서 문서 연결 해제 API
 * ⭐ 설계사별 고객 데이터 격리 적용
 */
router.delete('/customers/:id/documents/:document_id', authenticateJWT, async (req, res) => {
  try {
    const { id, document_id } = req.params;

    // ⭐ 설계사별 고객 데이터 격리: userId 검증
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!ObjectId.isValid(id) || !ObjectId.isValid(document_id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 ID입니다.'
      });
    }

    // ⭐ 소유권 검증: 해당 설계사의 고객만 연결 해제 가능
    const customer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({
        _id: new ObjectId(id),
        'meta.created_by': userId
      });

    if (!customer) {
      return res.status(403).json({
        success: false,
        error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
      });
    }

    // ⭐ 문서 소유권 검증: 해당 설계사의 문서만 연결 해제 가능
    const document = await db.collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(document_id), ownerId: userId });

    if (!document) {
      return res.status(403).json({
        success: false,
        error: '문서를 찾을 수 없거나 접근 권한이 없습니다.'
      });
    }

    // AR 문서인 경우 파싱 데이터도 삭제
    if (document.is_annual_report) {
      const issueDate = document.ar_metadata?.issue_date;
      if (issueDate) {
        console.log(`🗑️  [AR 삭제] issue_date=${issueDate} 파싱 데이터 삭제`);
        await db.collection(CUSTOMERS_COLLECTION).updateOne(
          { _id: new ObjectId(id) },
          {
            $pull: { annual_reports: { issue_date: new Date(issueDate) } },
            $set: { 'meta.updated_at': utcNowDate() }
          }
        );
        console.log(`✅ [AR 삭제] 파싱 데이터 삭제 완료`);
      }
    }

    // AR 파싱 큐에서도 제거 (pending 목록에서 사라지도록)
    try {
      const queueDeleteResult = await db.collection('ar_parse_queue').deleteMany({
        file_id: new ObjectId(document_id),
        customer_id: new ObjectId(id)
      });
      if (queueDeleteResult.deletedCount > 0) {
        console.log(`✅ AR 파싱 큐 정리: ${queueDeleteResult.deletedCount}개 레코드 삭제`);
      }
    } catch (queueError) {
      console.warn('⚠️ AR 파싱 큐 정리 실패:', queueError.message);
    }

    // 고객에서 문서 연결 제거
    await db.collection(CUSTOMERS_COLLECTION).updateOne(
      { _id: new ObjectId(id) },
      { 
        $pull: { documents: { document_id: new ObjectId(document_id) } },
        $set: { 'meta.updated_at': utcNowDate() }
      }
    );

    // 문서에서 고객 연결 정보 제거
    await db.collection(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(document_id) },
      {
        $unset: {
          customerId: "",
          customer_notes: ""
        }
      }
    );

    // 🔥 Qdrant 동기화: 문서의 모든 청크에서 customer_id 제거
    const qdrantResult = await syncQdrantCustomerRelation(document_id, null);
    console.log(`📊 [Qdrant 동기화 결과] ${qdrantResult.message}, 업데이트된 청크: ${qdrantResult.chunksUpdated || 0}개`);

    // 🔔 SSE 알림: 고객 문서 변경
    notifyCustomerDocSubscribers(id, 'document-change', {
      type: 'unlinked',
      customerId: id,
      documentId: document_id,
      documentName: document.upload?.originalName || document.filename,
      timestamp: utcNowISO()
    });

    res.json({
      success: true,
      message: '문서 연결이 성공적으로 해제되었습니다.',
      qdrant_sync: qdrantResult
    });
  } catch (error) {
    console.error('문서 연결 해제 오류:', error);
    backendLogger.error('Documents', '문서 연결 해제 오류', error);
    res.status(500).json({
      success: false,
      error: '문서 연결 해제에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 고객 문서 메모 수정 API
 * ⭐ 설계사별 고객 데이터 격리 적용
 */
router.patch('/customers/:id/documents/:document_id', authenticateJWT, async (req, res) => {
  try {
    const { id, document_id } = req.params;
    const { notes } = req.body;

    // ⭐ 설계사별 고객 데이터 격리: userId 검증
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!ObjectId.isValid(id) || !ObjectId.isValid(document_id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 ID입니다.'
      });
    }

    // notes 유효성 검사 (undefined일 수 있음 - 빈 문자열로 삭제 허용)
    if (notes !== undefined && typeof notes !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'notes는 문자열이어야 합니다.'
      });
    }

    // ⭐ 소유권 검증: 해당 설계사의 고객만 메모 수정 가능
    const customer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({
        _id: new ObjectId(id),
        'meta.created_by': userId
      });

    if (!customer) {
      return res.status(403).json({
        success: false,
        error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
      });
    }

    // 문서 존재 확인
    const document = await db.collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(document_id) });

    if (!document) {
      return res.status(404).json({
        success: false,
        error: '문서를 찾을 수 없습니다.'
      });
    }

    const newNotes = notes !== undefined ? notes : '';

    // 고객 컬렉션에서 해당 문서의 notes 업데이트
    await db.collection(CUSTOMERS_COLLECTION).updateOne(
      {
        _id: new ObjectId(id),
        'documents.document_id': new ObjectId(document_id)
      },
      {
        $set: {
          'documents.$.notes': newNotes,
          'meta.updated_at': utcNowDate()
        }
      }
    );

    // 문서 컬렉션에서도 customer_notes 업데이트
    await db.collection(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(document_id) },
      {
        $set: {
          customer_notes: newNotes
        }
      }
    );

    res.json({
      success: true,
      message: '메모가 성공적으로 수정되었습니다.',
      data: {
        notes: newNotes
      }
    });
  } catch (error) {
    console.error('메모 수정 오류:', error);
    backendLogger.error('Documents', '메모 수정 오류', error);
    res.status(500).json({
      success: false,
      error: '메모 수정에 실패했습니다.',
      details: error.message
    });
  }
});

// ========================================
// SSE 스트림: 고객 문서 실시간 업데이트
// ========================================

/**
 * 고객 문서 SSE 스트림 엔드포인트
 * GET /api/customers/:id/documents/stream
 *
 * 인증: ?token=xxx 쿼리 파라미터 (EventSource는 헤더 설정 불가)
 * 이벤트:
 * - connected: 연결 성공
 * - document-change: 문서 변경 (추가/삭제/수정)
 * - ping: Keep-alive (30초)
 */
router.get('/customers/:id/documents/stream', authenticateJWTWithQuery, (req, res) => {
  const { id: customerId } = req.params;
  const userId = req.user.id;

  if (!ObjectId.isValid(customerId)) {
    return res.status(400).json({
      success: false,
      error: '유효하지 않은 고객 ID입니다.'
    });
  }

  console.log(`[SSE] 고객 문서 스트림 연결 - customerId: ${customerId}, userId: ${userId}`);

  // SSE 헤더 설정
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx 버퍼링 비활성화
  res.flushHeaders();

  // 클라이언트 등록
  if (!customerDocSSEClients.has(customerId)) {
    customerDocSSEClients.set(customerId, new Set());
  }
  customerDocSSEClients.get(customerId).add(res);

  // 연결 확인 이벤트
  sendSSE(res, 'connected', {
    customerId,
    userId,
    timestamp: utcNowISO()
  });

  // 30초마다 keep-alive 전송
  const keepAliveInterval = setInterval(() => {
    sendSSE(res, 'ping', { timestamp: utcNowISO() });
  }, 30000);

  // 연결 종료 처리
  req.on('close', () => {
    console.log(`[SSE] 고객 문서 스트림 연결 종료 - customerId: ${customerId}`);
    clearInterval(keepAliveInterval);
    customerDocSSEClients.get(customerId)?.delete(res);
    if (customerDocSSEClients.get(customerId)?.size === 0) {
      customerDocSSEClients.delete(customerId);
    }
  });
});

// ========================================
// SSE 스트림: 고객 통합 실시간 업데이트 (문서+AR+CR)
// HTTP/1.1 동시 연결 제한 문제 해결을 위해 3개 SSE를 1개로 통합
// ========================================

/**
 * 고객 통합 SSE 스트림 엔드포인트
 * GET /api/customers/:customerId/stream
 *
 * 인증: ?token=xxx 쿼리 파라미터 (EventSource는 헤더 설정 불가)
 * 이벤트:
 * - connected: 연결 성공
 * - document-change: 문서 변경 (추가/삭제/수정)
 * - document-status-change: 문서 상태 변경 (처리 완료 등)
 * - ar-change: Annual Report 변경
 * - cr-change: Customer Review 변경
 * - ping: Keep-alive (30초)
 *
 * 통합 이유: 기존 개별 SSE 3개(documents, AR, CR)가 HTTP/1.1 동시 연결 제한(6개)을
 * 대부분 점유하여 API 요청이 타임아웃되는 문제 해결
 */
router.get('/customers/:customerId/stream', authenticateJWTWithQuery, (req, res) => {
  const { customerId } = req.params;
  const userId = req.user.id;

  if (!ObjectId.isValid(customerId)) {
    return res.status(400).json({
      success: false,
      error: '유효하지 않은 고객 ID입니다.'
    });
  }

  console.log(`[SSE-Combined] 고객 통합 스트림 연결 - customerId: ${customerId}, userId: ${userId}`);

  // SSE 헤더 설정
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx 버퍼링 비활성화
  res.flushHeaders();

  // 클라이언트 등록
  if (!customerCombinedSSEClients.has(customerId)) {
    customerCombinedSSEClients.set(customerId, new Set());
  }
  customerCombinedSSEClients.get(customerId).add(res);

  // 연결 확인 이벤트
  sendSSE(res, 'connected', {
    customerId,
    userId,
    timestamp: utcNowISO(),
    type: 'combined'  // 통합 SSE임을 표시
  });

  // 30초마다 keep-alive 전송
  const keepAliveInterval = setInterval(() => {
    sendSSE(res, 'ping', { timestamp: utcNowISO() });
  }, 30000);

  // 연결 종료 처리
  req.on('close', () => {
    console.log(`[SSE-Combined] 고객 통합 스트림 연결 종료 - customerId: ${customerId}`);
    clearInterval(keepAliveInterval);
    customerCombinedSSEClients.get(customerId)?.delete(res);
    if (customerCombinedSSEClients.get(customerId)?.size === 0) {
      customerCombinedSSEClients.delete(customerId);
    }
  });
});

/**
 * 고객 관련 문서 목록 조회 API
 */
router.get('/customers/:id/documents', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 고객 ID입니다.'
      });
    }

    // ⭐ userId 추출 (보안 강화)
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)

    // 고객 정보 조회
    const customer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({ _id: new ObjectId(id) });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: '고객을 찾을 수 없습니다.'
      });
    }

    // 🔥 Single Source of Truth: files.customerId로 직접 조회 (customers.documents[] 의존성 제거)
    // includeRelated=true: relatedCustomerId로 연결된 문서도 함께 조회 (관계자 문서 탭용)
    const includeRelated = req.query.includeRelated === 'true';
    const customerOid = new ObjectId(id);
    let query;
    if (includeRelated && userId) {
      // $or + ownerId를 $and로 명시적 결합 (소유자 격리 보장)
      query = {
        $and: [
          { $or: [{ customerId: customerOid }, { relatedCustomerId: customerOid }] },
          { ownerId: userId }
        ]
      };
    } else {
      query = { customerId: customerOid };
      if (userId) {
        query.ownerId = userId;
      }
    }

    // 🔧 Date/String 혼합 타입 대응을 위해 $toDate 사용
    const documents = await db.collection(COLLECTION_NAME).aggregate([
      { $match: query },
      {
        $addFields: {
          uploaded_at_normalized: { $toDate: '$upload.uploaded_at' }
        }
      },
      { $sort: { uploaded_at_normalized: -1 } },
      { $project: { uploaded_at_normalized: 0 } }
    ]).toArray();

    // 문서에 상태 정보 추가
    const documentsWithStatus = documents.map(doc => {
      const statusInfo = analyzeDocumentStatus(doc);

      // 🔥 Single Source of Truth: files 컬렉션 데이터 우선 사용
      // 기존 customers.documents[] 데이터는 fallback으로만 사용 (점진적 마이그레이션)
      const customerDoc = customer.documents?.find(d => d.document_id?.equals(doc._id));

      // badgeType 계산 (FILE_BADGE_SYSTEM.md 기준)
      let badgeType = 'BIN';
      if (doc.meta?.full_text && doc.meta.full_text.trim().length > 0) {
        badgeType = 'TXT';
      } else if (doc.ocr?.full_text) {
        badgeType = 'OCR';
      }

      // AR 문서 여부 판단: doc.is_annual_report 또는 customer.annual_reports에 source_file_id로 존재하는지 확인
      const isAR = doc.is_annual_report === true ||
        (customer.annual_reports || []).some(ar => ar.source_file_id?.equals(doc._id));

      return {
        _id: doc._id,
        originalName: doc.upload?.originalName || 'Unknown File',
        displayName: doc.displayName || null,  // CR 등 파싱 후 생성된 사용자 친화적 이름
        uploadedAt: normalizeTimestamp(doc.upload?.uploaded_at),
        fileSize: doc.meta?.size_bytes,
        mimeType: doc.meta?.mime,
        // 🔥 files 데이터 우선, customers.documents fallback
        relationship: isAR ? 'annual_report' : (doc.customer_relationship || customerDoc?.relationship || null),
        notes: doc.customer_notes ?? customerDoc?.notes ?? null,
        linkedAt: normalizeTimestamp(doc.customer_linked_at || customerDoc?.upload_date || doc.upload?.uploaded_at),
        ar_metadata: doc.ar_metadata,
        badgeType: badgeType,
        conversionStatus: doc.upload?.conversion_status || null,
        isConvertible: isConvertibleFile(doc.upload?.destPath || doc.upload?.originalName),
        // 🍎 문서 유형 필드 추가 (CustomerFullDetailView 문서 카드에서 사용)
        document_type: doc.document_type || (doc.meta && doc.meta.document_type) || null,
        document_type_auto: doc.document_type_auto || (doc.meta && doc.meta.document_type_auto) || false,
        document_type_confidence: doc.document_type_confidence || (doc.meta && doc.meta.document_type_confidence) || null,
        // 문서 소유 고객 ID (원본/링크 구분용 — 관계자 문서 탭에서 사용)
        customerId: doc.customerId?.toString() || null,
        // 관계자 연결 고객 ID (AR/CRS에서 피보험자로 감지된 고객)
        relatedCustomerId: doc.relatedCustomerId?.toString() || null,
        ...statusInfo
      };
    });

    res.json({
      success: true,
      data: {
        customer_id: id,
        customer_name: customer.personal_info?.name,
        documents: documentsWithStatus,
        total: documentsWithStatus.length
      }
    });
  } catch (error) {
    console.error('고객 문서 조회 오류:', error);
    backendLogger.error('Customers', '고객 문서 조회 오류', error);
    res.status(500).json({
      success: false,
      error: '고객 문서 조회에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 고객 문서 해시 일괄 조회 API
 * AR 배치 등록 시 중복 검사를 위해 고객의 모든 문서 해시를 한 번에 반환
 * 기존: 문서 N개 → N번 /api/documents/:id/status 호출 (순차)
 * 개선: 1번 호출로 모든 해시 반환 → 프론트엔드에서 로컬 비교
 */
router.get('/customers/:id/document-hashes', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 고객 ID입니다.'
      });
    }

    const userId = req.user.id;

    // 해당 고객의 모든 문서에서 file_hash만 추출
    const docs = await db.collection(COLLECTION_NAME).find(
      {
        customerId: new ObjectId(id),
        ownerId: userId,
        'meta.file_hash': { $exists: true, $ne: null }
      },
      { projection: { 'meta.file_hash': 1 } }
    ).toArray();

    const hashes = docs.map(doc => doc.meta.file_hash);

    res.json({
      success: true,
      hashes,
      total: hashes.length
    });
  } catch (error) {
    console.error('고객 문서 해시 조회 오류:', error);
    backendLogger.error('Customers', '고객 문서 해시 조회 오류', error);
    res.status(500).json({
      success: false,
      error: '고객 문서 해시 조회에 실패했습니다.',
      details: error.message
    });
  }
});

// Address/Geocoding 라우트 (routes/address-routes.js로 추출)
router.use('/', require('./address-routes')());

// ==================== Annual Report API (Phase 2 프록시) ====================

/**
 * Annual Report 체크 프록시 (Phase 2 - 파일 업로드 시 자동 감지)
 * 프론트엔드 → Node.js (3010) → Python (8004)
 */
router.post('/annual-report/check', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        is_annual_report: false,
        confidence: 0,
        metadata: null,
        error: 'No file uploaded'
      });
    }

    console.log(`📄 [Annual Report Check] 파일: ${req.file.originalname}, 크기: ${req.file.size} bytes`);

    // Python API로 전달할 FormData 생성
    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });

    const pythonApiUrl = 'http://localhost:8004/annual-report/check';
    console.log(`🐍 Python API 호출: ${pythonApiUrl}`);

    const response = await axios.post(pythonApiUrl, formData, {
      headers: formData.getHeaders(),
      timeout: 10000 // 10초 타임아웃
    });

    console.log(`✅ [Annual Report Check] 결과:`, response.data);
    res.json(response.data);

  } catch (error) {
    console.error('❌ [Annual Report Check] 오류:', error.message);
    backendLogger.error('AnnualReport', '[Annual Report Check] 오류', error);

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        is_annual_report: false,
        confidence: 0,
        metadata: null,
        error: 'Python API 서버에 연결할 수 없습니다. (포트 8004)'
      });
    }

    // 에러 시에도 조용히 실패 (모달이 나타나지 않도록)
    res.json({
      is_annual_report: false,
      confidence: 0,
      metadata: null
    });
  }
});

/**
 * Customer Review 체크 프록시 (파일 업로드 시 자동 감지)
 * 프론트엔드 → Node.js (3010) → Python (8004)
 */
router.post('/customer-review/check', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        is_customer_review: false,
        confidence: 0,
        metadata: null,
        error: 'No file uploaded'
      });
    }

    console.log(`📄 [Customer Review Check] 파일: ${req.file.originalname}, 크기: ${req.file.size} bytes`);

    // Python API로 전달할 FormData 생성
    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });

    const pythonApiUrl = 'http://localhost:8004/customer-review/check';
    console.log(`🐍 Python API 호출: ${pythonApiUrl}`);

    const response = await axios.post(pythonApiUrl, formData, {
      headers: formData.getHeaders(),
      timeout: 10000 // 10초 타임아웃
    });

    console.log(`✅ [Customer Review Check] 결과:`, response.data);
    res.json(response.data);

  } catch (error) {
    console.error('❌ [Customer Review Check] 오류:', error.message);
    backendLogger.error('CustomerReview', '[Customer Review Check] 오류', error);

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        is_customer_review: false,
        confidence: 0,
        metadata: null,
        error: 'Python API 서버에 연결할 수 없습니다. (포트 8004)'
      });
    }

    // 에러 시에도 조용히 실패
    res.json({
      is_customer_review: false,
      confidence: 0,
      metadata: null
    });
  }
});

/**
 * Annual Report 파싱 프록시 (Phase 2 - 고객 선택 후 파싱)
 * 프론트엔드 → Node.js (3010) → Python (8004)
 */
router.post('/annual-report/parse-file', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    if (!req.body.customer_id) {
      return res.status(400).json({
        success: false,
        message: 'customer_id is required'
      });
    }

    console.log(`📄 [Annual Report Parse] 파일: ${req.file.originalname}, 고객: ${req.body.customer_id}`);

    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });
    formData.append('customer_id', req.body.customer_id);

    const pythonApiUrl = 'http://localhost:8004/annual-report/parse';
    console.log(`🐍 Python API 호출: ${pythonApiUrl}`);

    const response = await axios.post(pythonApiUrl, formData, {
      headers: formData.getHeaders(),
      timeout: 10000
    });

    console.log(`✅ [Annual Report Parse] 결과:`, response.data);
    res.json(response.data);

  } catch (error) {
    console.error('❌ [Annual Report Parse] 오류:', error.message);
    backendLogger.error('AnnualReport', '[Annual Report Parse] 오류', error);

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        message: 'Python API 서버에 연결할 수 없습니다.'
      });
    }

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ==================== Annual Report API (기존 - MongoDB 기반) ====================

/**
 * Annual Report 파싱 요청 프록시 (Python FastAPI로 전달)
 */
router.post('/annual-report/parse', async (req, res) => {
  try {
    const { file_path, file_id, customer_id } = req.body;

    console.log(`📄 [Annual Report] 파싱 요청 받음:`, {
      file_path,
      file_id,
      customer_id
    });

    if (!file_path || !file_id) {
      return res.status(400).json({
        success: false,
        error: 'file_path와 file_id는 필수 파라미터입니다.'
      });
    }

    // Python FastAPI (포트 8004)로 프록시
    // Linux Docker: 172.17.0.1 (Docker 브리지 게이트웨이) 사용
    const pythonApiUrl = 'http://172.17.0.1:8004/annual-report/parse';

    console.log(`🐍 Python FastAPI 호출: ${pythonApiUrl}`);

    const response = await axios.post(pythonApiUrl, {
      file_path,
      file_id,
      customer_id
    }, {
      timeout: 5000 // 백그라운드 처리이므로 5초 타임아웃
    });

    console.log(`✅ [Annual Report] Python API 응답:`, response.data);

    res.json(response.data);
  } catch (error) {
    console.error('❌ [Annual Report] 파싱 요청 오류:', error.message);
    backendLogger.error('AnnualReport', '[Annual Report] 파싱 요청 오류', error);

    // Python API 서버가 다운되었거나 응답 없음
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        message: 'Annual Report API 서버에 연결할 수 없습니다.',
        error: 'Python FastAPI 서버가 실행 중이 아닙니다. (포트 8004)',
        hint: 'cd backend/api/annual_report_api && python main.py'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Annual Report 파싱 요청 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

/**
 * Annual Report 파싱 상태 조회 프록시
 */
/**
 * ⭐ 설계사별 문서 데이터 격리 적용
 */
router.get('/annual-report/status/:file_id', async (req, res) => {
  try {
    const { file_id } = req.params;

    // ⭐ 설계사별 데이터 격리: userId 검증
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    // ⭐ 소유권 검증: 해당 설계사의 문서만 조회 가능
    if (ObjectId.isValid(file_id)) {
      const document = await db.collection(COLLECTION_NAME)
        .findOne({ _id: new ObjectId(file_id), ownerId: userId });
      if (!document) {
        return res.status(403).json({
          success: false,
          error: '문서를 찾을 수 없거나 접근 권한이 없습니다.'
        });
      }
    }

    console.log(`🔍 [Annual Report] 상태 조회 요청: ${file_id}, userId: ${userId}`);

    const pythonApiUrl = `http://172.17.0.1:8004/annual-report/status/${file_id}`;

    const response = await axios.get(pythonApiUrl, {
      timeout: 3000
    });

    res.json(response.data);
  } catch (error) {
    console.error('❌ [Annual Report] 상태 조회 오류:', error.message);
    backendLogger.error('AnnualReport', '[Annual Report] 상태 조회 오류', error);

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        message: 'Annual Report API 서버에 연결할 수 없습니다.',
        error: 'Python FastAPI 서버가 실행 중이 아닙니다.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Annual Report 상태 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

/**
 * 전체 Annual Reports 목록 조회 (고객별 그룹화)
 * ⭐ 설계사별 데이터 격리 적용
 *
 * 응답: 고객별 최신 AR 요약 목록
 */
router.get('/annual-reports/all', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId required'
      });
    }

    console.log(`📋 [Annual Report] 전체 AR 목록 조회, userId: ${userId}`);

    // MongoDB Aggregation: 고객별 AR 그룹화 + 최신 AR 정보
    const results = await db.collection(CUSTOMERS_COLLECTION).aggregate([
      // 1. 해당 설계사의 고객 중 AR이 있는 고객만 필터
      {
        $match: {
          'meta.created_by': userId,
          'annual_reports.0': { $exists: true }
        }
      },
      // 2. annual_reports 배열 unwind
      {
        $unwind: '$annual_reports'
      },
      // 3. 파싱 완료된 AR만 필터 (parsed_at이 있는 것)
      {
        $match: {
          'annual_reports.parsed_at': { $exists: true, $ne: null }
        }
      },
      // 4. 파싱일 기준 정렬
      {
        $sort: { 'annual_reports.parsed_at': -1 }
      },
      // 5. 고객별 그룹화: 최신 AR + AR 개수
      {
        $group: {
          _id: '$_id',
          customer_name: { $first: '$personal_info.name' },
          customer_type: { $first: '$insurance_info.customer_type' },
          registered_at: { $first: '$meta.created_at' },
          latest_ar: { $first: '$annual_reports' },
          ar_count: { $sum: 1 }
        }
      },
      // 6. 최신 파싱일 기준 정렬
      {
        $sort: { 'latest_ar.parsed_at': -1 }
      },
      // 7. 결과 형식 변환
      {
        $project: {
          _id: 0,
          customer_id: '$_id',
          customer_name: 1,
          customer_type: 1,
          registered_at: 1,
          latest_issue_date: '$latest_ar.issue_date',
          latest_parsed_at: '$latest_ar.parsed_at',
          total_monthly_premium: '$latest_ar.total_monthly_premium',
          contract_count: '$latest_ar.total_contracts',
          ar_count: 1
        }
      }
    ]).toArray();

    console.log(`📋 [Annual Report] 조회 완료: ${results.length}명의 고객`);

    res.json({
      success: true,
      data: {
        reports: results,
        total_count: results.length
      }
    });
  } catch (error) {
    console.error('❌ [Annual Report] 전체 조회 오류:', error.message);
    backendLogger.error('AnnualReport', '[Annual Report] 전체 조회 오류', error);

    res.status(500).json({
      success: false,
      message: 'Annual Report 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

/**
 * 고객의 Annual Reports 목록 조회 프록시
 */
/**
 * ⭐ 설계사별 고객 데이터 격리 적용
 */
router.get('/customers/:customerId/annual-reports', authenticateJWT, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { limit } = req.query;

    // ⭐ userId 추출 및 검증 (사용자 계정 기능)
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId required'
      });
    }

    // ⭐ 고객 소유권 검증: 해당 설계사의 고객만 조회 가능
    if (ObjectId.isValid(customerId)) {
      const customer = await db.collection(CUSTOMERS_COLLECTION)
        .findOne({ _id: new ObjectId(customerId), 'meta.created_by': userId });
      if (!customer) {
        return res.status(403).json({
          success: false,
          error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
        });
      }
    }

    console.log(`📋 [Annual Report] 고객 Annual Reports 조회: ${customerId}, userId: ${userId}`);

    const pythonApiUrl = `http://172.17.0.1:8004/customers/${customerId}/annual-reports`;

    const response = await axios.get(pythonApiUrl, {
      params: { limit },
      headers: {
        'x-user-id': userId
      },
      timeout: 3000
    });

    res.json(response.data);
  } catch (error) {
    console.error('❌ [Annual Report] 조회 오류:', error.message);
    backendLogger.error('AnnualReport', '[Annual Report] 조회 오류', error);

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        message: 'Annual Report API 서버에 연결할 수 없습니다.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Annual Report 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

/**
 * 고객의 AR 파싱 대기/진행 중인 문서 목록 조회
 * ⭐ 설계사별 고객 데이터 격리 적용
 */
router.get('/customers/:customerId/annual-reports/pending', authenticateJWT, async (req, res) => {
  try {
    const { customerId } = req.params;

    // ⭐ 설계사별 고객 데이터 격리: userId 검증
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    // ⭐ 소유권 검증: 해당 설계사의 고객만 조회 가능
    const customer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({
        _id: new ObjectId(customerId),
        'meta.created_by': userId
      });

    if (!customer) {
      return res.status(403).json({
        success: false,
        error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
      });
    }

    console.log(`📋 [Annual Report] AR 파싱 대기 문서 조회: ${customerId}`);

    // ⭐ 새로운 큐 시스템: ar_parse_queue 컬렉션에서 조회
    const pendingQueue = await db.collection('ar_parse_queue').find({
      customer_id: new ObjectId(customerId),
      status: { $in: ['pending', 'processing'] }
    }).toArray();

    // 파일 정보 가져오기 (ar_parsing_status 포함)
    const fileIds = pendingQueue.map(q => q.file_id);
    const files = await db.collection(COLLECTION_NAME).find({
      _id: { $in: fileIds }
    }).project({
      _id: 1,
      'upload.originalName': 1,
      'upload.uploaded_at': 1,
      ar_parsing_status: 1  // 🔧 파싱 상태 확인용
    }).toArray();

    // 파일 정보와 큐 정보 매핑
    const fileMap = new Map(files.map(f => [f._id.toString(), f]));

    // 🔧 불일치 데이터 필터링: files.ar_parsing_status=completed인데 큐에 남아있는 경우 제외 + 삭제
    const validQueue = [];
    for (const queue of pendingQueue) {
      const file = fileMap.get(queue.file_id.toString());
      if (file && file.ar_parsing_status === 'completed') {
        // 불일치 발견 → 큐에서 삭제 (비동기로 처리, 에러 무시)
        db.collection('ar_parse_queue').deleteOne({ _id: queue._id }).catch(() => {});
        console.log(`🔧 [Annual Report] 불일치 큐 레코드 삭제: file_id=${queue.file_id} (이미 완료됨)`);
      } else {
        validQueue.push(queue);
      }
    }

    const pendingDocs = validQueue.map(queue => {
      const file = fileMap.get(queue.file_id.toString());
      return {
        file_id: queue.file_id.toString(),
        filename: file?.upload?.originalName || queue.metadata?.filename || 'Unknown',
        uploaded_at: normalizeTimestamp(file?.upload?.uploaded_at),
        status: queue.status,
        created_at: normalizeTimestamp(queue.created_at),
        retry_count: queue.retry_count || 0
      };
    });

    res.json({
      success: true,
      data: {
        pending_count: pendingDocs.length,
        documents: pendingDocs
      }
    });
  } catch (error) {
    console.error('❌ [Annual Report] 대기 문서 조회 오류:', error.message);
    backendLogger.error('AnnualReport', '[Annual Report] 대기 문서 조회 오류', error);

    res.status(500).json({
      success: false,
      message: 'AR 파싱 대기 문서 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

/**
 * 고객의 Annual Report 실시간 업데이트 SSE 스트림
 * @route GET /api/customers/:customerId/annual-reports/stream
 * @description 고객의 AR 상태 변경을 실시간으로 전달
 */
router.get('/customers/:customerId/annual-reports/stream', authenticateJWTWithQuery, (req, res) => {
  const { customerId } = req.params;
  const userId = req.user.id;

  if (!ObjectId.isValid(customerId)) {
    return res.status(400).json({ success: false, error: '유효하지 않은 고객 ID입니다.' });
  }

  // 🔍 DEBUG: SSE 연결 상세 로깅
  console.log(`[SSE-AR] 📡 AR 스트림 연결 요청 - customerId: "${customerId}" (type: ${typeof customerId}), userId: ${userId}`);
  console.log(`[SSE-AR] 🔍 연결 전 arSSEClients 키 목록: [${Array.from(arSSEClients.keys()).join(', ')}]`);

  // SSE 헤더 설정
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // 클라이언트 등록
  if (!arSSEClients.has(customerId)) {
    arSSEClients.set(customerId, new Set());
  }
  arSSEClients.get(customerId).add(res);

  // 🔍 DEBUG: 등록 후 상태 로깅
  console.log(`[SSE-AR] ✅ 클라이언트 등록 완료 - customerId: "${customerId}"`);
  console.log(`[SSE-AR] 🔍 등록 후 arSSEClients 키 목록: [${Array.from(arSSEClients.keys()).join(', ')}]`);
  console.log(`[SSE-AR] 🔍 해당 고객 연결 수: ${arSSEClients.get(customerId).size}`);

  // 연결 확인 이벤트
  sendSSE(res, 'connected', {
    customerId,
    userId,
    timestamp: utcNowISO()
  });

  // 30초마다 keep-alive 전송
  const keepAliveInterval = setInterval(() => {
    sendSSE(res, 'ping', { timestamp: utcNowISO() });
  }, 30000);

  // 연결 종료 처리
  req.on('close', () => {
    console.log(`[SSE-AR] ❌ AR 스트림 연결 종료 - customerId: "${customerId}"`);
    clearInterval(keepAliveInterval);
    arSSEClients.get(customerId)?.delete(res);
    if (arSSEClients.get(customerId)?.size === 0) {
      arSSEClients.delete(customerId);
      console.log(`[SSE-AR] 🗑️ 고객 ${customerId}의 모든 연결 종료, 키 삭제됨`);
    }
    console.log(`[SSE-AR] 🔍 연결 종료 후 arSSEClients 키 목록: [${Array.from(arSSEClients.keys()).join(', ')}]`);
  });
});

/**
 * 고객의 Customer Review 실시간 업데이트 SSE 스트림
 * @route GET /api/customers/:customerId/customer-reviews/stream
 * @description 고객의 CR 상태 변경을 실시간으로 전달
 */
router.get('/customers/:customerId/customer-reviews/stream', authenticateJWTWithQuery, (req, res) => {
  const { customerId } = req.params;
  const userId = req.user.id;

  if (!ObjectId.isValid(customerId)) {
    return res.status(400).json({ success: false, error: '유효하지 않은 고객 ID입니다.' });
  }

  console.log(`[SSE-CR] CR 스트림 연결 - customerId: ${customerId}, userId: ${userId}`);

  // SSE 헤더 설정
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // 클라이언트 등록
  if (!crSSEClients.has(customerId)) {
    crSSEClients.set(customerId, new Set());
  }
  crSSEClients.get(customerId).add(res);

  // 연결 확인 이벤트
  sendSSE(res, 'connected', {
    customerId,
    userId,
    timestamp: utcNowISO()
  });

  // 30초마다 keep-alive 전송
  const keepAliveInterval = setInterval(() => {
    sendSSE(res, 'ping', { timestamp: utcNowISO() });
  }, 30000);

  // 연결 종료 처리
  req.on('close', () => {
    console.log(`[SSE-CR] CR 스트림 연결 종료 - customerId: ${customerId}`);
    clearInterval(keepAliveInterval);
    crSSEClients.get(customerId)?.delete(res);
    if (crSSEClients.get(customerId)?.size === 0) {
      crSSEClients.delete(customerId);
    }
  });
});

/**
 * Personal Files 실시간 업데이트 SSE 스트림
 * @route GET /api/personal-files/stream
 * @description 사용자의 개인 파일 변경을 실시간으로 전달
 */
router.get('/personal-files/stream', (req, res) => {
  // x-user-id 헤더 또는 쿼리 파라미터에서 userId 추출
  const userId = req.headers['x-user-id'] || req.query.userId;

  if (!userId) {
    return res.status(401).json({ success: false, error: '사용자 ID가 필요합니다.' });
  }

  console.log(`[SSE-PF] Personal Files 스트림 연결 - userId: ${userId}`);

  // SSE 헤더 설정
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // 클라이언트 등록
  if (!personalFilesSSEClients.has(userId)) {
    personalFilesSSEClients.set(userId, new Set());
  }
  personalFilesSSEClients.get(userId).add(res);

  // 연결 확인 이벤트
  sendSSE(res, 'connected', {
    userId,
    timestamp: utcNowISO()
  });

  // 30초마다 keep-alive 전송
  const keepAliveInterval = setInterval(() => {
    sendSSE(res, 'ping', { timestamp: utcNowISO() });
  }, 30000);

  // 연결 종료 처리
  req.on('close', () => {
    console.log(`[SSE-PF] Personal Files 스트림 연결 종료 - userId: ${userId}`);
    clearInterval(keepAliveInterval);
    personalFilesSSEClients.get(userId)?.delete(res);
    if (personalFilesSSEClients.get(userId)?.size === 0) {
      personalFilesSSEClients.delete(userId);
    }
  });
});

/**
 * Personal Files 변경 알림 Webhook (내부용)
 * @route POST /api/webhooks/personal-files-change
 * @description Personal Files routes에서 파일 변경 시 호출하여 SSE 알림 발생
 */
router.post('/webhooks/personal-files-change', (req, res) => {
  try {
    const { userId, changeType, itemId, itemName, itemType } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId가 필요합니다.' });
    }

    // SSE 알림 전송: 파일 변경
    notifyPersonalFilesSubscribers(userId, 'file-change', {
      type: changeType || 'updated',
      itemId: itemId || 'unknown',
      itemName: itemName || 'Unknown',
      itemType: itemType || 'file',
      timestamp: utcNowISO()
    });

    console.log(`[SSE-PF] Personal Files 변경 알림 전송 - userId: ${userId}, type: ${changeType}`);

    res.json({ success: true, message: '알림이 전송되었습니다.' });
  } catch (error) {
    console.error('[SSE-PF] Personal Files 변경 알림 오류:', error);
    backendLogger.error('SSE', 'Personal Files 변경 알림 오류', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 사용자 계정 실시간 업데이트 SSE 스트림
 * @route GET /api/user/account/stream
 * @description 사용자의 계정 정보(티어, 스토리지 등) 변경을 실시간으로 전달
 */
router.get('/user/account/stream', (req, res) => {
  // x-user-id 헤더 또는 쿼리 파라미터에서 userId 추출
  const userId = req.headers['x-user-id'] || req.query.userId;

  if (!userId) {
    return res.status(401).json({ success: false, error: '사용자 ID가 필요합니다.' });
  }

  console.log(`[SSE-UserAccount] 계정 정보 스트림 연결 - userId: ${userId}`);

  // SSE 헤더 설정
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // 클라이언트 등록
  if (!userAccountSSEClients.has(userId)) {
    userAccountSSEClients.set(userId, new Set());
  }
  userAccountSSEClients.get(userId).add(res);

  // 연결 확인 이벤트
  sendSSE(res, 'connected', {
    userId,
    timestamp: utcNowISO()
  });

  // 30초마다 keep-alive 전송
  const keepAliveInterval = setInterval(() => {
    sendSSE(res, 'ping', { timestamp: utcNowISO() });
  }, 30000);

  // 연결 종료 처리
  req.on('close', () => {
    console.log(`[SSE-UserAccount] 계정 정보 스트림 연결 종료 - userId: ${userId}`);
    clearInterval(keepAliveInterval);
    userAccountSSEClients.get(userId)?.delete(res);
    if (userAccountSSEClients.get(userId)?.size === 0) {
      userAccountSSEClients.delete(userId);
    }
  });
});

/**
 * 문서 처리 상태 실시간 업데이트 SSE 스트림
 * @route GET /api/documents/:documentId/status/stream
 * @description 특정 문서의 처리 완료를 실시간으로 전달 (1회성)
 */
router.get('/documents/:documentId/status/stream', authenticateJWTWithQuery, (req, res) => {
  const { documentId } = req.params;
  const userId = req.user.id;

  if (!ObjectId.isValid(documentId)) {
    return res.status(400).json({ success: false, error: '유효하지 않은 문서 ID입니다.' });
  }

  console.log(`[SSE-DocStatus] 문서 상태 스트림 연결 - documentId: ${documentId}, userId: ${userId}`);

  // SSE 헤더 설정
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // 클라이언트 등록
  if (!documentStatusSSEClients.has(documentId)) {
    documentStatusSSEClients.set(documentId, new Set());
  }
  documentStatusSSEClients.get(documentId).add(res);

  // 연결 확인 이벤트
  sendSSE(res, 'connected', {
    documentId,
    userId,
    timestamp: utcNowISO()
  });

  // 30초마다 keep-alive 전송
  const keepAliveInterval = setInterval(() => {
    sendSSE(res, 'ping', { timestamp: utcNowISO() });
  }, 30000);

  // 180초 타임아웃 (자동 연결 해제)
  const timeoutId = setTimeout(() => {
    console.log(`[SSE-DocStatus] 문서 상태 스트림 타임아웃 - documentId: ${documentId}`);
    sendSSE(res, 'timeout', { documentId, timestamp: utcNowISO() });
    res.end();
  }, 180000);

  // 연결 종료 처리
  req.on('close', () => {
    console.log(`[SSE-DocStatus] 문서 상태 스트림 연결 종료 - documentId: ${documentId}`);
    clearInterval(keepAliveInterval);
    clearTimeout(timeoutId);
    documentStatusSSEClients.get(documentId)?.delete(res);
    if (documentStatusSSEClients.get(documentId)?.size === 0) {
      documentStatusSSEClients.delete(documentId);
    }
  });
});

/**
 * 문서 처리 완료 알림 Webhook (n8n OCRWorker에서 호출)
 * @route POST /api/webhooks/document-processing-complete
 * @description OCR 처리 완료 시 호출하여 SSE 알림 발생
 */
router.post('/webhooks/document-processing-complete', async (req, res) => {
  try {
    const { document_id, status, owner_id } = req.body;

    // API Key 인증 (n8n에서 호출 시 사용)
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== (process.env.INTERNAL_WEBHOOK_API_KEY || process.env.N8N_WEBHOOK_API_KEY) && apiKey !== process.env.N8N_API_KEY) {
      console.warn('[SSE-DocStatus] 잘못된 API Key로 webhook 호출 시도');
      return res.status(401).json({ success: false, error: '인증 실패' });
    }

    if (!document_id) {
      return res.status(400).json({ success: false, error: 'document_id가 필요합니다.' });
    }

    console.log(`[SSE-DocStatus] 문서 처리 완료 알림 수신 - document_id: ${document_id}, type: ${typeof document_id}, status: ${status}`);
    console.log(`[SSE-DocStatus] 현재 SSE 클라이언트 목록: [${Array.from(documentStatusSSEClients.keys()).join(', ')}]`);

    // SSE 알림 전송 (클라이언트가 없으면 재시도)
    const eventData = {
      documentId: document_id,
      status: status || 'completed',
      ownerId: owner_id || 'unknown',
      timestamp: utcNowISO()
    };

    // n8n에서 따옴표가 포함된 문자열로 올 수 있음 - 제거
    const documentIdStr = document_id.toString().replace(/^"|"$/g, '');
    console.log(`[SSE-DocStatus] 검색할 키: "${documentIdStr}" (length: ${documentIdStr.length})`);

    // 🔄 overallStatus 업데이트 - 임베딩까지 완료되어야 'completed'
    // OCR 완료만으로는 completed가 아님! docembed.status === 'done'이어야 함
    try {
      const doc = await db.collection(COLLECTIONS.FILES).findOne({ _id: new ObjectId(documentIdStr) });
      if (doc) {
        let newOverallStatus = 'processing';

        // 에러 상태 처리 (quota_exceeded도 에러로 처리)
        if (status === 'error' || status === 'failed' || status === 'quota_exceeded') {
          newOverallStatus = 'error';
        }
        // 임베딩까지 완료된 경우에만 completed (skipped도 완료로 처리)
        else if (doc.docembed && (doc.docembed.status === 'done' || doc.docembed.status === 'skipped')) {
          newOverallStatus = 'completed';
        }
        // OCR만 완료된 상태는 processing 유지
        else if (status === 'completed' || status === 'done') {
          newOverallStatus = 'processing';
        }

        // OCR이 아직 진행 중이면 completed 처리 보류
        if ((status === 'completed' || status === 'done') &&
            doc.ocr && (doc.ocr.status === 'queued' || doc.ocr.status === 'running')) {
          console.log(`[SSE-DocStatus] OCR 진행 중(${doc.ocr.status}), overallStatus 업데이트 보류: ${documentIdStr}`);
          newOverallStatus = 'processing';
        }

        // 🔥 빈 텍스트 체크: OCR 완료 + 텍스트 없음 → 임베딩 스킵하고 바로 완료 처리
        const hasText = (doc.meta?.full_text && doc.meta.full_text.trim() !== '') ||
                        (doc.ocr?.full_text && doc.ocr.full_text.trim() !== '') ||
                        (doc.text?.full_text && doc.text.full_text.trim() !== '');

        if ((status === 'completed' || status === 'done') && !hasText &&
            (!doc.docembed || (doc.docembed.status !== 'done' && doc.docembed.status !== 'skipped')) &&
            !(doc.ocr && (doc.ocr.status === 'queued' || doc.ocr.status === 'running'))) {
          console.log(`[SSE-DocStatus] 빈 텍스트 감지 → 임베딩 스킵 처리: ${documentIdStr}`);
          newOverallStatus = 'completed';
          // docembed도 바로 skip 처리
          await db.collection(COLLECTIONS.FILES).updateOne(
            { _id: new ObjectId(documentIdStr) },
            { $set: {
              'docembed.status': 'skipped',
              'docembed.skip_reason': 'no_text',
              'docembed.chunks': 0,
              'docembed.updated_at': new Date().toISOString()
            }}
          );
        }

        // 업데이트할 필드 구성
        const updateFields = {
          overallStatus: newOverallStatus,
          overallStatusUpdatedAt: new Date()
        };

        // quota_exceeded인 경우 stages.ocr도 업데이트
        if (status === 'quota_exceeded') {
          updateFields['stages.ocr.status'] = 'error';
          updateFields['stages.ocr.message'] = 'OCR 한도 초과';
          updateFields['stages.ocr.timestamp'] = new Date().toISOString();
        }

        await db.collection(COLLECTIONS.FILES).updateOne(
          { _id: new ObjectId(documentIdStr) },
          { $set: updateFields }
        );
        console.log(`[SSE-DocStatus] overallStatus 업데이트: ${documentIdStr} → ${newOverallStatus} (docembed: ${doc.docembed?.status || 'none'})`);
      }
    } catch (updateError) {
      console.error(`[SSE-DocStatus] overallStatus 업데이트 실패:`, updateError);
      backendLogger.error('SSE', 'overallStatus 업데이트 실패', updateError);
      // 업데이트 실패해도 SSE 알림은 계속 진행
    }

    const maxRetries = 10;  // 최대 10회 재시도
    const retryDelay = 500; // 500ms 간격
    let sent = false;

    for (let i = 0; i < maxRetries; i++) {
      const clients = documentStatusSSEClients.get(documentIdStr);
      console.log(`[SSE-DocStatus] 시도 ${i + 1}: 키 "${documentIdStr}" → clients=${clients ? clients.size : 'null'}, 전체 키: [${Array.from(documentStatusSSEClients.keys()).join(', ')}]`);
      if (clients && clients.size > 0) {
        notifyDocumentStatusSubscribers(documentIdStr, 'processing-complete', eventData);
        sent = true;
        console.log(`[SSE-DocStatus] 이벤트 전송 성공 (시도 ${i + 1}/${maxRetries})`);
        break;
      }
      console.log(`[SSE-DocStatus] 클라이언트 없음, 대기 중... (시도 ${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }

    if (!sent) {
      console.log(`[SSE-DocStatus] 최대 재시도 초과 - 클라이언트 연결 없음`);
    }

    // 🔄 문서 목록 SSE 알림도 함께 발송 (owner_id가 있는 경우)
    if (owner_id) {
      const ownerIdStr = owner_id.toString().replace(/^"|"$/g, '');
      notifyDocumentListSubscribers(ownerIdStr, 'document-list-change', {
        type: 'status-changed',
        documentId: documentIdStr,
        status: status || 'completed',
        timestamp: utcNowISO()
      });
      console.log(`[SSE-DocList] 문서 처리 완료 → 목록 변경 알림 전송 - userId: ${ownerIdStr}`);
    }

    // 🔄 고객 문서 SSE 알림도 함께 발송 (customerId가 있는 경우)
    try {
      const docForCustomer = await db.collection(COLLECTIONS.FILES).findOne({ _id: new ObjectId(documentIdStr) });
      if (docForCustomer && docForCustomer.customerId) {
        const customerIdStr = docForCustomer.customerId.toString();
        notifyCustomerDocSubscribers(customerIdStr, 'document-status-change', {
          type: 'processing',
          status: status || 'completed',
          customerId: customerIdStr,
          documentId: documentIdStr,
          documentName: docForCustomer.upload?.originalName || 'Unknown',
          timestamp: utcNowISO()
        });
        console.log(`[SSE-CustomerDoc] 문서 처리 완료 → 고객 문서 알림 전송 - customerId: ${customerIdStr}`);
      }
    } catch (customerNotifyError) {
      console.error('[SSE-CustomerDoc] 고객 문서 알림 실패:', customerNotifyError.message);
    }

    // 🔒 바이러스 스캔 트리거 (임베딩 완료 시점)
    // 실시간 스캔 ON: 즉시 yuri에 스캔 요청
    // 실시간 스캔 OFF: pending 상태로 누적 (수동 스캔 대기)
    try {
      await virusScanService.scanAfterUpload(db, documentIdStr, 'files');
    } catch (scanError) {
      console.error('[VirusScan] 스캔 트리거 오류:', scanError.message);
      // 스캔 오류는 무시하고 계속 진행
    }

    // 📄 PDF 변환 트리거 (Office 문서 + customerId가 있는 경우)
    try {
      const docForPdf = await db.collection(COLLECTION_NAME).findOne({ _id: new ObjectId(documentIdStr) });
      if (docForPdf && docForPdf.customerId) {
        const pdfResult = await triggerPdfConversionIfNeeded(docForPdf);
        console.log(`[PDF변환] 문서 처리 완료 후 트리거: ${documentIdStr} → ${pdfResult}`);
      }
    } catch (pdfError) {
      console.error('[PDF변환] 트리거 오류:', pdfError.message);
      // PDF 변환 오류는 무시하고 계속 진행
    }

    res.json({ success: true, message: 'SSE 알림이 전송되었습니다.', sent });
  } catch (error) {
    console.error('[SSE-DocStatus] 문서 처리 완료 알림 오류:', error);
    backendLogger.error('SSE', '문서 처리 완료 알림 오류', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 문서 처리 진행률 업데이트 Webhook (document_pipeline에서 호출)
 * @route POST /api/webhooks/document-progress
 * @description 문서 처리 각 단계에서 진행률 업데이트 SSE 알림 발생
 */
router.post('/webhooks/document-progress', async (req, res) => {
  try {
    const { document_id, progress, stage, message, owner_id } = req.body;

    // API Key 인증
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== (process.env.INTERNAL_WEBHOOK_API_KEY || process.env.N8N_WEBHOOK_API_KEY) && apiKey !== process.env.N8N_API_KEY) {
      console.warn('[SSE-Progress] 잘못된 API Key로 webhook 호출 시도');
      return res.status(401).json({ success: false, error: '인증 실패' });
    }

    if (!document_id || progress === undefined) {
      return res.status(400).json({ success: false, error: 'document_id와 progress가 필요합니다.' });
    }

    const documentIdStr = document_id.toString().replace(/^"|"$/g, '');
    console.log(`[SSE-Progress] 진행률 업데이트 - document_id: ${documentIdStr}, progress: ${progress}%, stage: ${stage}`);

    // SSE 이벤트 데이터
    const eventData = {
      documentId: documentIdStr,
      progress: progress,
      stage: stage || 'processing',
      message: message || '',
      timestamp: utcNowISO()
    };

    // 개별 문서 구독자에게 진행률 업데이트 알림
    const clients = documentStatusSSEClients.get(documentIdStr);
    if (clients && clients.size > 0) {
      notifyDocumentStatusSubscribers(documentIdStr, 'progress-update', eventData);
      console.log(`[SSE-Progress] 개별 문서 구독자에게 알림 전송 - clients: ${clients.size}`);
    }

    // 문서 목록 구독자에게도 알림 (테이블 업데이트)
    if (owner_id) {
      const ownerIdStr = owner_id.toString().replace(/^"|"$/g, '');
      notifyDocumentListSubscribers(ownerIdStr, 'document-progress', {
        type: 'progress-update',
        documentId: documentIdStr,
        progress: progress,
        stage: stage || 'processing',
        timestamp: utcNowISO()
      });
      console.log(`[SSE-Progress] 문서 목록 구독자에게 알림 전송 - userId: ${ownerIdStr}`);
    }

    res.json({ success: true, message: '진행률 업데이트 알림 전송됨', progress });
  } catch (error) {
    console.error('[SSE-Progress] 진행률 업데이트 오류:', error);
    backendLogger.error('SSE', '진행률 업데이트 오류', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 문서 목록 실시간 업데이트 SSE 스트림 (DocumentStatusProvider용)
 * @route GET /api/documents/status-list/stream
 * @description 사용자의 문서 목록 변경을 실시간으로 전달
 * 인증: ?token=xxx 쿼리 파라미터 (EventSource는 헤더 설정 불가)
 */
router.get('/documents/status-list/stream', authenticateJWTWithQuery, (req, res) => {
  const userId = req.user.id;

  console.log(`[SSE-DocList] 문서 목록 스트림 연결 - userId: ${userId}`);

  // SSE 헤더 설정
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // 클라이언트 등록
  if (!documentListSSEClients.has(userId)) {
    documentListSSEClients.set(userId, new Set());
  }
  documentListSSEClients.get(userId).add(res);

  // 연결 확인 이벤트
  sendSSE(res, 'connected', {
    userId,
    timestamp: utcNowISO()
  });

  // 30초마다 keep-alive 전송
  const keepAliveInterval = setInterval(() => {
    sendSSE(res, 'ping', { timestamp: utcNowISO() });
  }, 30000);

  // 연결 종료 처리
  req.on('close', () => {
    console.log(`[SSE-DocList] 문서 목록 스트림 연결 종료 - userId: ${userId}`);
    clearInterval(keepAliveInterval);
    documentListSSEClients.get(userId)?.delete(res);
    if (documentListSSEClients.get(userId)?.size === 0) {
      documentListSSEClients.delete(userId);
    }
  });
});

/**
 * 문서 목록 변경 알림 Webhook (내부용)
 * @route POST /api/webhooks/document-list-change
 * @description 문서 업로드/삭제/상태변경 시 호출하여 SSE 알림 발생
 */
router.post('/webhooks/document-list-change', (req, res) => {
  try {
    const { userId, changeType, documentId, documentName, status } = req.body;

    // API Key 인증 (내부 호출용)
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== (process.env.INTERNAL_WEBHOOK_API_KEY || process.env.N8N_WEBHOOK_API_KEY) && apiKey !== process.env.N8N_API_KEY) {
      console.warn('[SSE-DocList] 잘못된 API Key로 webhook 호출 시도');
      return res.status(401).json({ success: false, error: '인증 실패' });
    }

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId가 필요합니다.' });
    }

    // SSE 알림 전송: 문서 목록 변경
    notifyDocumentListSubscribers(userId, 'document-list-change', {
      type: changeType || 'updated',
      documentId: documentId || 'unknown',
      documentName: documentName || 'Unknown',
      status: status || 'unknown',
      timestamp: utcNowISO()
    });

    console.log(`[SSE-DocList] 문서 목록 변경 알림 전송 - userId: ${userId}, type: ${changeType}`);

    res.json({ success: true, message: '알림이 전송되었습니다.' });
  } catch (error) {
    console.error('[SSE-DocList] 문서 목록 변경 알림 오류:', error);
    backendLogger.error('SSE', '문서 목록 변경 알림 오류', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 문서 업로드 알림 endpoint
 * n8n webhook에서 직접 업로드 후 프론트엔드가 호출하여 SSE 알림 발생
 * @route POST /api/notify/document-uploaded
 */
router.post('/notify/document-uploaded', authenticateJWT, async (req, res) => {
  try {
    const { customerId, documentId, documentName } = req.body;
    const userId = req.user.id;

    if (!customerId) {
      return res.status(400).json({ success: false, error: 'customerId가 필요합니다.' });
    }

    // 고객 소유권 확인
    const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
      _id: new ObjectId(customerId),
      'meta.created_by': userId
    });

    if (!customer) {
      return res.status(404).json({ success: false, error: '고객을 찾을 수 없습니다.' });
    }

    // SSE 알림 전송: 문서 변경
    notifyCustomerDocSubscribers(customerId, 'document-change', {
      type: 'linked',
      customerId,
      documentId: documentId || 'unknown',
      documentName: documentName || 'Unknown',
      timestamp: utcNowISO()
    });

    console.log(`[SSE] 문서 업로드 알림 전송 - customerId: ${customerId}, userId: ${userId}`);

    // 🔒 바이러스 스캔 트리거 (파일 업로드 직후)
    // 이미지 등 임베딩 스킵되는 파일도 즉시 스캔되도록 함
    if (documentId) {
      try {
        await virusScanService.scanAfterUpload(db, documentId, 'files');
        console.log(`[VirusScan] 파일 업로드 직후 스캔 트리거: ${documentId}`);
      } catch (scanError) {
        console.error('[VirusScan] 업로드 후 스캔 트리거 오류:', scanError.message);
        // 스캔 오류는 무시하고 계속 진행
      }

      // 📄 PDF 변환 트리거 (Office 문서인 경우)
      // customerId가 있는 문서는 프리뷰를 위해 PDF 변환 필요
      try {
        const document = await db.collection(COLLECTION_NAME).findOne({
          _id: new ObjectId(documentId)
        });
        if (document && document.customerId) {
          const pdfResult = await triggerPdfConversionIfNeeded(document);
          console.log(`[PDF변환] 업로드 후 트리거: ${documentId} → ${pdfResult}`);
        }
      } catch (pdfError) {
        console.error('[PDF변환] 업로드 후 트리거 오류:', pdfError.message);
        // PDF 변환 오류는 무시하고 계속 진행
      }
    }

    res.json({ success: true, message: '알림이 전송되었습니다.' });
  } catch (error) {
    console.error('문서 업로드 알림 오류:', error);
    backendLogger.error('SSE', '문서 업로드 알림 오류', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 내 보관함: 최근 업로드된 문서의 folderId 설정
 * n8n webhook이 folderId를 저장하지 않으므로 업로드 후 별도로 설정
 * @route PATCH /api/documents/recent/set-folder
 */
router.patch('/documents/recent/set-folder', authenticateJWT, async (req, res) => {
  try {
    const { filename, folderId } = req.body;
    const userId = req.user.id;

    if (!filename) {
      return res.status(400).json({ success: false, error: 'filename이 필요합니다.' });
    }

    // 최근 5분 이내에 업로드된, 해당 사용자의 문서 중 파일명이 일치하는 것 찾기
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const document = await db.collection(COLLECTIONS.FILES).findOne({
      ownerId: userId,
      'upload.originalName': filename,
      'meta.created_at': { $gte: fiveMinutesAgo.toISOString() }
    }, {
      sort: { 'meta.created_at': -1 }  // 가장 최근 것
    });

    if (!document) {
      console.log(`[SetFolder] 문서를 찾을 수 없음 - filename: ${filename}, userId: ${userId}`);
      return res.status(404).json({ success: false, error: '최근 업로드된 문서를 찾을 수 없습니다.' });
    }

    // folderId 업데이트 (null이면 루트 폴더)
    await db.collection(COLLECTIONS.FILES).updateOne(
      { _id: document._id },
      { $set: { folderId: folderId || null } }
    );

    console.log(`[SetFolder] 문서 folderId 설정 - docId: ${document._id}, folderId: ${folderId || 'null (root)'}`);

    res.json({
      success: true,
      documentId: document._id.toString(),
      folderId: folderId || null
    });
  } catch (error) {
    console.error('[SetFolder] 오류:', error);
    backendLogger.error('Documents', '[SetFolder] 오류', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 고객의 최신 Annual Report 조회 프록시
 */
/**
 * ⭐ 설계사별 고객 데이터 격리 적용
 */
router.get('/customers/:customerId/annual-reports/latest', authenticateJWT, async (req, res) => {
  const { customerId } = req.params; // catch 블록에서도 접근 가능하도록 밖으로 이동

  try {
    // ⭐ userId 추출 및 검증 (사용자 계정 기능)
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId required'
      });
    }

    // ⭐ 고객 소유권 검증: 해당 설계사의 고객만 조회 가능
    if (ObjectId.isValid(customerId)) {
      const customer = await db.collection(CUSTOMERS_COLLECTION)
        .findOne({ _id: new ObjectId(customerId), 'meta.created_by': userId });
      if (!customer) {
        return res.status(403).json({
          success: false,
          error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
        });
      }
    }

    console.log(`📋 [Annual Report] 최신 Annual Report 조회: ${customerId}, userId: ${userId}`);

    const pythonApiUrl = `http://172.17.0.1:8004/customers/${customerId}/annual-reports/latest`;

    const response = await axios.get(pythonApiUrl, {
      headers: {
        'x-user-id': userId
      },
      timeout: 3000
    });

    res.json(response.data);
  } catch (error) {
    console.error('❌ [Annual Report] 최신 조회 오류:', error.message);
    backendLogger.error('AnnualReport', '[Annual Report] 최신 조회 오류', error);

    // 404는 정상 케이스 (데이터 없음) - 프론트엔드에 빈 데이터로 전달
    if (error.response?.status === 404) {
      return res.json({
        success: true,
        data: {
          customer_id: customerId,
          report: null
        }
      });
    }

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        message: 'Annual Report API 서버에 연결할 수 없습니다.'
      });
    }

    res.status(500).json({
      success: false,
      message: '최신 Annual Report 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

/**
 * 고객의 Annual Reports 삭제 프록시
 */
/**
 * ⭐ 설계사별 고객 데이터 격리 적용
 */
router.delete('/customers/:customerId/annual-reports', authenticateJWT, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { indices } = req.body;

    // ⭐ userId 추출 및 검증 (사용자 계정 기능)
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId required'
      });
    }

    // ⭐ 고객 소유권 검증: 해당 설계사의 고객만 삭제 가능
    if (ObjectId.isValid(customerId)) {
      const customer = await db.collection(CUSTOMERS_COLLECTION)
        .findOne({ _id: new ObjectId(customerId), 'meta.created_by': userId });
      if (!customer) {
        return res.status(403).json({
          success: false,
          error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
        });
      }
    }

    console.log(`🗑️  [Annual Report] 삭제 요청: customer=${customerId}, userId=${userId}, indices=${JSON.stringify(indices)}`);

    if (!indices || !Array.isArray(indices) || indices.length === 0) {
      return res.status(400).json({
        success: false,
        message: '삭제할 항목을 선택해주세요'
      });
    }

    const pythonApiUrl = `http://172.17.0.1:8004/customers/${customerId}/annual-reports`;

    const response = await axios.delete(pythonApiUrl, {
      data: { indices },
      headers: {
        'x-user-id': userId
      },
      timeout: 5000
    });

    console.log(`✅ [Annual Report] 삭제 완료:`, response.data);
    res.json(response.data);

  } catch (error) {
    console.error('❌ [Annual Report] 삭제 오류:', error.message);
    backendLogger.error('AnnualReport', '[Annual Report] 삭제 오류', error);

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        message: 'Annual Report API 서버에 연결할 수 없습니다.'
      });
    }

    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        message: error.response.data?.message || '고객을 찾을 수 없습니다.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Annual Report 삭제 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

// ==================== Customer Review API Proxy ====================
/**
 * 고객의 Customer Reviews 목록 조회 프록시
 * ⭐ 설계사별 고객 데이터 격리 적용
 */
router.get('/customers/:customerId/customer-reviews', authenticateJWT, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { limit } = req.query;

    // ⭐ userId 추출 및 검증 (사용자 계정 기능)
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId required'
      });
    }

    // ⭐ 고객 소유권 검증: 해당 설계사의 고객만 조회 가능
    if (ObjectId.isValid(customerId)) {
      const customer = await db.collection(CUSTOMERS_COLLECTION)
        .findOne({ _id: new ObjectId(customerId), 'meta.created_by': userId });
      if (!customer) {
        return res.status(403).json({
          success: false,
          error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
        });
      }
    }

    console.log(`📋 [Customer Review] 고객 Customer Reviews 조회: ${customerId}, userId: ${userId}`);

    const pythonApiUrl = `http://172.17.0.1:8004/customers/${customerId}/customer-reviews`;

    const response = await axios.get(pythonApiUrl, {
      params: { limit },
      headers: {
        'x-user-id': userId
      },
      timeout: 3000
    });

    res.json(response.data);
  } catch (error) {
    console.error('❌ [Customer Review] 조회 오류:', error.message);
    backendLogger.error('CustomerReview', '[Customer Review] 조회 오류', error);

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        message: 'Customer Review API 서버에 연결할 수 없습니다.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Customer Review 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

/**
 * 고객의 Customer Reviews 삭제 프록시
 * ⭐ 설계사별 고객 데이터 격리 적용
 */
router.delete('/customers/:customerId/customer-reviews', authenticateJWT, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { indices } = req.body;

    // ⭐ userId 추출 및 검증 (사용자 계정 기능)
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId required'
      });
    }

    // ⭐ 고객 소유권 검증: 해당 설계사의 고객만 삭제 가능
    if (ObjectId.isValid(customerId)) {
      const customer = await db.collection(CUSTOMERS_COLLECTION)
        .findOne({ _id: new ObjectId(customerId), 'meta.created_by': userId });
      if (!customer) {
        return res.status(403).json({
          success: false,
          error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
        });
      }
    }

    console.log(`🗑️  [Customer Review] 삭제 요청: customer=${customerId}, userId=${userId}, indices=${JSON.stringify(indices)}`);

    if (!indices || !Array.isArray(indices) || indices.length === 0) {
      return res.status(400).json({
        success: false,
        message: '삭제할 리뷰 인덱스가 필요합니다.'
      });
    }

    const pythonApiUrl = `http://172.17.0.1:8004/customers/${customerId}/customer-reviews`;

    const response = await axios.delete(pythonApiUrl, {
      data: { indices },
      headers: {
        'x-user-id': userId
      },
      timeout: 5000
    });

    console.log(`✅ [Customer Review] 삭제 완료:`, response.data);
    res.json(response.data);

  } catch (error) {
    console.error('❌ [Customer Review] 삭제 오류:', error.message);
    backendLogger.error('CustomerReview', '[Customer Review] 삭제 오류', error);

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        message: 'Customer Review API 서버에 연결할 수 없습니다.'
      });
    }

    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        message: error.response.data?.message || '고객을 찾을 수 없습니다.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Customer Review 삭제 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

/**
 * 고객의 중복 Annual Reports 정리 프록시
 */
/**
 * ⭐ 설계사별 고객 데이터 격리 적용
 */
router.post('/customers/:customerId/annual-reports/cleanup-duplicates', authenticateJWT, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { issue_date, reference_linked_at } = req.body;

    // ⭐ userId 추출 및 검증 (사용자 계정 기능)
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId required'
      });
    }

    console.log(`🧹 [Annual Report] 중복 정리 요청: customer=${customerId}, userId=${userId}, issue_date=${issue_date}, reference=${reference_linked_at}`);

    if (!issue_date || !reference_linked_at) {
      return res.status(400).json({
        success: false,
        message: 'issue_date와 reference_linked_at가 필요합니다'
      });
    }

    const pythonApiUrl = `http://172.17.0.1:8004/customers/${customerId}/annual-reports/cleanup-duplicates`;

    const response = await axios.post(pythonApiUrl, {
      issue_date,
      reference_linked_at
    }, {
      headers: {
        'x-user-id': userId
      },
      timeout: 5000
    });

    console.log(`✅ [Annual Report] 중복 정리 완료:`, response.data);
    res.json(response.data);

  } catch (error) {
    console.error('❌ [Annual Report] 중복 정리 오류:', error.message);
    backendLogger.error('AnnualReport', '[Annual Report] 중복 정리 오류', error);

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        message: 'Annual Report API 서버에 연결할 수 없습니다.'
      });
    }

    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        message: error.response.data?.message || '고객을 찾을 수 없습니다.'
      });
    }

    res.status(500).json({
      success: false,
      message: '중복 Annual Report 정리 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

/**
 * AR 보험계약 등록 API (수동)
 * 프론트엔드 → Node.js (3010) → Python (8004)
 * ⭐ 설계사별 고객 데이터 격리 적용
 */
router.post('/customers/:customerId/ar-contracts', authenticateJWT, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { issue_date, customer_name } = req.body;

    // ⭐ userId 추출 및 검증 (사용자 계정 기능)
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId required'
      });
    }

    console.log(`📋 [AR Contracts] 보험계약 등록 요청: customer=${customerId}, userId=${userId}, issue_date=${issue_date}`);

    if (!issue_date) {
      return res.status(400).json({
        success: false,
        message: 'issue_date가 필요합니다'
      });
    }

    const pythonApiUrl = `http://172.17.0.1:8004/customers/${customerId}/ar-contracts`;

    const response = await axios.post(pythonApiUrl, {
      issue_date,
      customer_name
    }, {
      headers: {
        'x-user-id': userId
      },
      timeout: 5000
    });

    console.log(`✅ [AR Contracts] 보험계약 등록 완료:`, response.data);
    res.json(response.data);

  } catch (error) {
    console.error('❌ [AR Contracts] 보험계약 등록 오류:', error.message);
    backendLogger.error('ARContracts', '[AR Contracts] 보험계약 등록 오류', error);

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        message: 'Annual Report API 서버에 연결할 수 없습니다.'
      });
    }

    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        message: error.response.data?.detail || '고객 또는 AR을 찾을 수 없습니다.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'AR 보험계약 등록 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

// ==================== 주소 보관소 관리 API ====================

/**
 * 고객 주소 이력 조회 API
 * ⭐ 설계사별 고객 데이터 격리 적용
 */
router.get('/customers/:id/address-history', authenticateJWT, async (req, res) => {
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

    // ⭐ 소유권 검증: 해당 설계사의 고객만 조회 가능
    const customer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({
        _id: new ObjectId(id),
        'meta.created_by': userId
      });

    if (!customer) {
      return res.status(403).json({
        success: false,
        error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
      });
    }

    // 주소 이력 조회 (현재 주소 + 이력)
    const addressHistory = [];
    
    // 1. 현재 주소 추가
    if (customer.personal_info?.address) {
      addressHistory.push({
        _id: 'current',
        address: customer.personal_info.address,
        changed_at: normalizeTimestamp(customer.meta?.updated_at || customer.meta?.created_at),
        reason: '현재 주소',
        changed_by: '시스템',
        is_current: true
      });
    }

    // 2. 이력 주소들 추가 (address_history 컬렉션에서 조회)
    const historyRecords = await db.collection('address_history')
      .find({ customer_id: new ObjectId(id) })
      .sort({ changed_at: -1 })
      .toArray();

    historyRecords.forEach(record => {
      addressHistory.push({
        _id: record._id,
        address: record.address,
        changed_at: normalizeTimestamp(record.changed_at),
        reason: record.reason || '주소 변경',
        changed_by: record.changed_by || '시스템',
        notes: record.notes,
        is_current: false
      });
    });

    res.json({
      success: true,
      data: addressHistory
    });

  } catch (error) {
    console.error('주소 이력 조회 오류:', error);
    backendLogger.error('Address', '주소 이력 조회 오류', error);
    res.status(500).json({
      success: false,
      error: '주소 이력 조회에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 주소 이력 저장 API (내부 사용)
 */
router.post('/customers/:id/address-history', async (req, res) => {
  try {
    const { id } = req.params;
    const { previous_address, reason, changed_by, notes } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 고객 ID입니다.'
      });
    }

    if (!previous_address) {
      return res.status(400).json({
        success: false,
        error: '이전 주소 정보가 필요합니다.'
      });
    }

    // 주소 이력 저장
    const historyRecord = {
      customer_id: new ObjectId(id),
      address: previous_address,
      changed_at: utcNowDate(),
      reason: reason || '주소 변경',
      changed_by: changed_by || '시스템',
      notes: notes || ''
    };

    await db.collection('address_history').insertOne(historyRecord);

    res.json({
      success: true,
      message: '주소 이력이 저장되었습니다.',
      history_id: historyRecord._id
    });

  } catch (error) {
    console.error('주소 이력 저장 오류:', error);
    backendLogger.error('Address', '주소 이력 저장 오류', error);
    res.status(500).json({
      success: false,
      error: '주소 이력 저장에 실패했습니다.',
      details: error.message
    });
  }
});

// ==================== Customer Memos API ====================

const CUSTOMER_MEMOS_COLLECTION = 'customer_memos';

/**
 * 날짜를 YYYY.MM.DD HH:mm 형식으로 변환
 */
function formatMemoDateTime(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${day} ${h}:${min}`;
}

/**
 * customer_memos 컬렉션의 데이터를 customers.memo 필드로 동기화
 * MCP와 aims_api 간 데이터 일관성 유지
 */
async function syncCustomerMemoField(customerId) {
  try {
    const customerObjectId = new ObjectId(customerId);

    // customer_memos에서 해당 고객의 모든 메모 조회 (시간순)
    const memos = await db.collection(CUSTOMER_MEMOS_COLLECTION)
      .find({ customer_id: customerObjectId })
      .sort({ created_at: 1 })
      .toArray();

    // 타임스탬프 형식으로 변환
    const memoText = memos.map(m =>
      `[${formatMemoDateTime(m.created_at)}] ${m.content}`
    ).join('\n');

    // customers.memo 필드 업데이트
    await db.collection(CUSTOMERS_COLLECTION).updateOne(
      { _id: customerObjectId },
      { $set: { memo: memoText, 'meta.updated_at': new Date() } }
    );

    console.log(`[Memo Sync] 고객 ${customerId}: ${memos.length}개 메모 동기화 완료`);
  } catch (error) {
    console.error(`[Memo Sync] 동기화 실패 (고객 ${customerId}):`, error);
    backendLogger.error('Memos', `메모 동기화 실패 (고객 ${customerId})`, error);
  }
}

/**
 * GET /api/customers/:id/memos
 * 고객 메모 목록 조회
 */
router.get('/customers/:id/memos', authenticateJWTorAPIKey, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // 고객 존재 및 소유권 확인
    const customer = await db.collection(CUSTOMERS_COLLECTION).findOne({
      _id: new ObjectId(id),
      'meta.created_by': userId
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: '고객을 찾을 수 없습니다.'
      });
    }

    // 메모 목록 조회 (최신순)
    const memos = await db.collection(CUSTOMER_MEMOS_COLLECTION)
      .find({ customer_id: new ObjectId(id) })
      .sort({ created_at: -1 })
      .toArray();

    // is_mine 필드 추가 (본인 메모 여부)
    const memosWithMine = memos.map(memo => ({
      ...memo,
      is_mine: memo.created_by === userId
    }));

    res.json({
      success: true,
      data: memosWithMine,
      total: memos.length
    });

  } catch (error) {
    console.error('메모 목록 조회 오류:', error);
    backendLogger.error('Memos', '메모 목록 조회 오류', error);
    res.status(500).json({
      success: false,
      error: '메모 목록 조회에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * POST /api/customers/:id/memos
 * 고객 메모 생성
 */
router.post('/customers/:id/memos', authenticateJWTorAPIKey, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: '메모 내용을 입력해주세요.'
      });
    }

    // 고객 존재 및 소유권 확인
    const customer = await db.collection(CUSTOMERS_COLLECTION).findOne({
      _id: new ObjectId(id),
      'meta.created_by': userId
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: '고객을 찾을 수 없습니다.'
      });
    }

    const now = utcNowDate();
    const newMemo = {
      customer_id: new ObjectId(id),
      content: content.trim(),
      created_by: userId,
      created_at: now,
      updated_at: now
    };

    const result = await db.collection(CUSTOMER_MEMOS_COLLECTION).insertOne(newMemo);

    // customers.memo 필드 동기화 (MCP 호환)
    await syncCustomerMemoField(id);

    res.json({
      success: true,
      data: {
        _id: result.insertedId,
        ...newMemo,
        is_mine: true
      },
      message: '메모가 저장되었습니다.'
    });

  } catch (error) {
    console.error('메모 생성 오류:', error);
    backendLogger.error('Memos', '메모 생성 오류', error);
    res.status(500).json({
      success: false,
      error: '메모 저장에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * PUT /api/customers/:id/memos/:memoId
 * 고객 메모 수정 (본인만 가능)
 */
router.put('/customers/:id/memos/:memoId', authenticateJWT, async (req, res) => {
  try {
    const { id, memoId } = req.params;
    const userId = req.user.id;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: '메모 내용을 입력해주세요.'
      });
    }

    // 메모 존재 확인
    const memo = await db.collection(CUSTOMER_MEMOS_COLLECTION).findOne({
      _id: new ObjectId(memoId),
      customer_id: new ObjectId(id)
    });

    if (!memo) {
      return res.status(404).json({
        success: false,
        error: '메모를 찾을 수 없습니다.'
      });
    }

    // 본인 메모인지 확인
    if (memo.created_by !== userId) {
      return res.status(403).json({
        success: false,
        error: '본인이 작성한 메모만 수정할 수 있습니다.'
      });
    }

    const now = utcNowDate();
    await db.collection(CUSTOMER_MEMOS_COLLECTION).updateOne(
      { _id: new ObjectId(memoId) },
      {
        $set: {
          content: content.trim(),
          updated_at: now,
          updated_by: userId
        }
      }
    );

    // customers.memo 필드 동기화 (MCP 호환)
    await syncCustomerMemoField(id);

    res.json({
      success: true,
      data: {
        _id: memoId,
        content: content.trim(),
        updated_at: now,
        is_mine: true
      },
      message: '메모가 수정되었습니다.'
    });

  } catch (error) {
    console.error('메모 수정 오류:', error);
    backendLogger.error('Memos', '메모 수정 오류', error);
    res.status(500).json({
      success: false,
      error: '메모 수정에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * DELETE /api/customers/:id/memos/:memoId
 * 고객 메모 삭제 (본인만 가능)
 */
router.delete('/customers/:id/memos/:memoId', authenticateJWT, async (req, res) => {
  try {
    const { id, memoId } = req.params;
    const userId = req.user.id;

    // 메모 존재 확인
    const memo = await db.collection(CUSTOMER_MEMOS_COLLECTION).findOne({
      _id: new ObjectId(memoId),
      customer_id: new ObjectId(id)
    });

    if (!memo) {
      return res.status(404).json({
        success: false,
        error: '메모를 찾을 수 없습니다.'
      });
    }

    // 본인 메모인지 확인
    if (memo.created_by !== userId) {
      return res.status(403).json({
        success: false,
        error: '본인이 작성한 메모만 삭제할 수 있습니다.'
      });
    }

    await db.collection(CUSTOMER_MEMOS_COLLECTION).deleteOne({
      _id: new ObjectId(memoId)
    });

    // customers.memo 필드 동기화 (MCP 호환)
    await syncCustomerMemoField(id);

    res.json({
      success: true,
      message: '메모가 삭제되었습니다.'
    });

  } catch (error) {
    console.error('메모 삭제 오류:', error);
    backendLogger.error('Memos', '메모 삭제 오류', error);
    res.status(500).json({
      success: false,
      error: '메모 삭제에 실패했습니다.',
      details: error.message
    });
  }
});


  // ============================================
  // 주소 일괄 검증 API (기존 pending 데이터 마이그레이션용)
  // ============================================
  router.post('/customers/verify-addresses', authenticateJWT, async (req, res) => {
    try {
      // verification_status가 없거나 pending인 고객 중 주소가 있는 고객 조회
      const customers = await db.collection(CUSTOMERS_COLLECTION).find({
        'personal_info.address.address1': { $exists: true, $ne: null, $ne: '' },
        $or: [
          { 'personal_info.address.verification_status': { $exists: false } },
          { 'personal_info.address.verification_status': 'pending' },
          { 'personal_info.address.verification_status': null }
        ]
      }).project({
        _id: 1,
        'personal_info.address': 1,
        'personal_info.name': 1
      }).toArray();

      console.log(`🔍 주소 일괄 검증 시작: ${customers.length}건`);

      let verified = 0;
      let failed = 0;
      let errors = 0;

      for (const customer of customers) {
        try {
          const address1 = customer.personal_info?.address?.address1;
          if (!address1) continue;

          const result = await verifyAddressViaKakao(address1);

          await db.collection(CUSTOMERS_COLLECTION).updateOne(
            { _id: customer._id },
            { $set: { 'personal_info.address.verification_status': result } }
          );

          if (result === 'verified') verified++;
          else failed++;

          // 카카오 API rate limit 방지 (100ms 간격)
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
          errors++;
          console.error(`❌ 고객 ${customer._id} 검증 실패:`, err.message);
        }
      }

      console.log(`✅ 주소 일괄 검증 완료: verified=${verified}, failed=${failed}, errors=${errors}`);

      res.json({
        success: true,
        data: {
          total: customers.length,
          verified,
          failed,
          errors
        }
      });
    } catch (error) {
      console.error('🚨 주소 일괄 검증 오류:', error);
      res.status(500).json({
        success: false,
        error: '주소 일괄 검증에 실패했습니다.',
        details: error.message
      });
    }
  });

  return router;
};
