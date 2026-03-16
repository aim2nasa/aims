import { z, ZodError } from 'zod';
import { ObjectId } from 'mongodb';
import { getDB, escapeRegex, toSafeObjectId, COLLECTIONS, formatZodError } from '../db.js';
import { getCurrentUserId } from '../auth.js';
import { sendErrorLog } from '../systemLogger.js';


/**
 * 전화번호 포맷팅 함수
 * 모든 전화번호를 하이픈(-) 포함 형식으로 변환
 * @param phone - 원본 전화번호
 * @returns 포맷팅된 전화번호
 */
function formatPhoneNumber(phone: string | undefined | null): string {
  if (!phone) return '';

  // 숫자만 추출
  const digits = phone.replace(/\D/g, '');

  if (!digits) return '';

  // 휴대폰 (010, 011, 016, 017, 018, 019)
  if (/^01[0-9]/.test(digits)) {
    if (digits.length === 11) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    } else if (digits.length === 10) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
  }

  // 서울 (02)
  if (digits.startsWith('02')) {
    if (digits.length === 10) {
      return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 9) {
      return `02-${digits.slice(2, 5)}-${digits.slice(5)}`;
    }
  }

  // 지역번호 (031, 032, 033, 041, 042, 043, 044, 051, 052, 053, 054, 055, 061, 062, 063, 064)
  if (/^0[3-6][1-4]/.test(digits)) {
    if (digits.length === 11) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    } else if (digits.length === 10) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
  }

  // 대표번호 (1588, 1577, 1544 등)
  if (/^1[5-9][0-9]{2}/.test(digits) && digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  // 기타: 원본 그대로 반환 (이미 포맷팅된 경우)
  return phone;
}

// 스키마 정의
export const searchCustomersSchema = z.object({
  query: z.string().optional().describe('검색어 (이름, 전화번호, 이메일)'),
  lastName: z.string().optional().describe('성씨로 검색 (이름의 첫 글자, 예: "김", "이", "박", "정"). query 대신 사용'),
  customerType: z.enum(['개인', '법인']).optional().describe('고객 유형'),
  status: z.enum(['active', 'inactive', 'all']).optional().default('active').describe('상태'),
  region: z.string().optional().describe('지역 (시/도)'),
  limit: z.number().optional().default(10).describe('결과 개수 제한 (기본: 10, 최대: 50)'),
  offset: z.number().optional().default(0).describe('건너뛸 개수 (페이지네이션용)')
});

export const getCustomerSchema = z.object({
  customerId: z.string().describe('고객 ID')
});

export const createCustomerSchema = z.object({
  name: z.string().min(1).describe('고객명 (필수)'),
  customerType: z.enum(['개인', '법인']).default('개인').describe('고객 유형'),
  phone: z.string().optional().describe('전화번호'),
  email: z.string().email().optional().describe('이메일'),
  birthDate: z.string().optional().describe('생년월일 (YYYY-MM-DD)'),
  address: z.string().optional().describe('주소')
});

export const updateCustomerSchema = z.object({
  customerId: z.string().describe('고객 ID'),
  name: z.string().optional().describe('고객명'),
  phone: z.string().optional().describe('전화번호'),
  phoneType: z.enum(['mobile', 'home', 'work']).optional().describe('전화번호 종류: mobile(휴대폰), home(집전화), work(회사전화). 기본값: mobile'),
  email: z.string().email().optional().describe('이메일'),
  birthDate: z.string().optional().describe('생년월일 (YYYY-MM-DD)'),
  // 구조화된 주소 (search_address로 검색한 결과 사용)
  postal_code: z.string().optional().describe('우편번호 (search_address 결과의 zipNo)'),
  address1: z.string().optional().describe('기본 주소 (search_address 결과의 roadAddrPart1)'),
  address2: z.string().optional().describe('상세 주소 (동/호수 등 사용자 입력)')
});

// Tool 정의
export const customerToolDefinitions = [
  {
    name: 'search_customers',
    description: '고객을 이름, 전화번호, 지역 등으로 검색합니다. 검색 조건 없이 호출하면 전체 고객 목록을 반환합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: '검색어 (이름, 전화번호, 이메일)' },
        lastName: { type: 'string', description: '성씨로 검색 (이름의 첫 글자, 예: "김", "이", "박", "정"). query 대신 사용' },
        customerType: { type: 'string', enum: ['개인', '법인'], description: '고객 유형' },
        status: { type: 'string', enum: ['active', 'inactive', 'all'], description: '상태 (기본: active)' },
        region: { type: 'string', description: '지역 (시/도)' },
        limit: { type: 'number', description: '결과 개수 제한 (기본: 20)' }
      }
    }
  },
  {
    name: 'get_customer',
    description: '특정 고객의 상세 정보를 조회합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '고객 ID' }
      },
      required: ['customerId']
    }
  },
  {
    name: 'create_customer',
    description: '새 고객을 등록합니다. 같은 설계사 내에서 고객명은 중복될 수 없습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: '고객명 (필수)' },
        customerType: { type: 'string', enum: ['개인', '법인'], description: '고객 유형 (기본: 개인)' },
        phone: { type: 'string', description: '전화번호' },
        email: { type: 'string', description: '이메일' },
        birthDate: { type: 'string', description: '생년월일 (YYYY-MM-DD)' },
        address: { type: 'string', description: '주소' }
      },
      required: ['name']
    }
  },
  {
    name: 'update_customer',
    description: '고객 정보를 수정합니다. 전화번호 수정 시 반드시 phoneType을 지정하세요. 주소 수정 시 반드시 search_address로 먼저 검색한 후 검증된 주소를 사용하세요.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '고객 ID' },
        name: { type: 'string', description: '고객명' },
        phone: { type: 'string', description: '전화번호' },
        phoneType: { type: 'string', enum: ['mobile', 'home', 'work'], description: '전화번호 종류: mobile(휴대폰), home(집전화), work(회사전화). 반드시 지정하세요!' },
        email: { type: 'string', description: '이메일' },
        birthDate: { type: 'string', description: '생년월일 (YYYY-MM-DD)' },
        postal_code: { type: 'string', description: '우편번호 (search_address 결과의 zipNo 사용)' },
        address1: { type: 'string', description: '기본 주소 (search_address 결과의 roadAddrPart1 사용)' },
        address2: { type: 'string', description: '상세 주소 (동/호수 등 사용자가 직접 입력)' }
      },
      required: ['customerId']
    }
  }
];

/**
 * 고객 검색 핸들러
 */
export async function handleSearchCustomers(args: unknown) {
  try {
    const params = searchCustomersSchema.parse(args || {});
    const db = getDB();
    const userId = getCurrentUserId();

    // 기본 필터: 해당 설계사의 고객만
    const filter: Record<string, unknown> = {
      'meta.created_by': userId
    };

    // 성씨 검색 (이름 첫 글자 기준)
    if (params.lastName) {
      filter['personal_info.name'] = { $regex: `^${escapeRegex(params.lastName)}`, $options: 'i' };
    }
    // 검색어
    else if (params.query) {
      const regex = { $regex: escapeRegex(params.query), $options: 'i' };
      filter.$or = [
        { 'personal_info.name': regex },
        { 'personal_info.mobile_phone': regex },
        { 'personal_info.email': regex }
      ];
    }

    // 고객 유형
    if (params.customerType) {
      filter['insurance_info.customer_type'] = params.customerType;
    }

    // 상태
    if (params.status !== 'all') {
      filter['meta.status'] = params.status || 'active';
    }

    // 지역 (유연한 검색: "경기도" → "경기", "서울시" → "서울" 등)
    if (params.region) {
      // 시/도 접미사 제거하여 유연하게 검색
      const normalizedRegion = params.region
        .replace(/특별시$|광역시$|특별자치시$|특별자치도$|도$|시$/, '')
        .trim();
      filter['personal_info.address.address1'] = { $regex: escapeRegex(normalizedRegion), $options: 'i' };
    }

    // limit 최대 50 제한, offset 적용
    const limit = Math.min(params.limit || 10, 50);
    const offset = params.offset || 0;

    const customers = await db.collection(COLLECTIONS.CUSTOMERS)
      .find(filter)
      .sort({ 'meta.created_at': -1 })
      .skip(offset)
      .limit(limit)
      .project({
        _id: 1,
        'personal_info.name': 1,
        'personal_info.mobile_phone': 1,
        'personal_info.email': 1,
        'personal_info.address': 1,
        'insurance_info.customer_type': 1,
        'meta.status': 1,
        'meta.created_at': 1
      })
      .toArray();

    const totalCount = await db.collection(COLLECTIONS.CUSTOMERS).countDocuments(filter);
    const hasMore = offset + customers.length < totalCount;

    // 고객 유형별 카운트 (개인/법인)
    const typeCounts = await db.collection(COLLECTIONS.CUSTOMERS).aggregate([
      { $match: filter },
      { $group: { _id: '$insurance_info.customer_type', count: { $sum: 1 } } }
    ]).toArray();

    const personalCount = typeCounts.find(t => t._id === '개인')?.count || 0;
    const corporateCount = typeCounts.find(t => t._id === '법인')?.count || 0;

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          count: customers.length,
          totalCount,
          personalCount,
          corporateCount,
          offset,
          limit,
          hasMore,
          customers: customers.map(c => ({
            id: c._id.toString(),
            name: c.personal_info?.name,
            phone: c.personal_info?.mobile_phone,
            email: c.personal_info?.email,
            address: c.personal_info?.address?.address1,
            type: c.insurance_info?.customer_type,
            status: c.meta?.status,
            createdAt: c.meta?.created_at
          }))
        }, null, 2)
      }]
    };
  } catch (error) {
    // 에러 로깅
    console.error('[MCP] search_customers 에러:', error);
    sendErrorLog('aims_mcp', 'search_customers 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `고객 검색 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * 고객 상세 조회 핸들러
 */
export async function handleGetCustomer(args: unknown) {
  try {
    const params = getCustomerSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    const objectId = toSafeObjectId(params.customerId);
    if (!objectId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '유효하지 않은 고객 ID입니다.' }]
      };
    }

    const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
      _id: objectId,
      'meta.created_by': userId
    });

    if (!customer) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '고객을 찾을 수 없습니다.' }]
      };
    }

    // 문서 수는 files 컬렉션에서 조회 (Single Source of Truth: files.customerId)
    const documentCount = await db.collection(COLLECTIONS.FILES).countDocuments({
      customerId: objectId
    });

    // 계약 수: 가장 최신 annual_report의 contracts 배열에서 조회
    const latestAr = customer.annual_reports?.sort((a: { issue_date?: Date }, b: { issue_date?: Date }) =>
      new Date(b.issue_date || 0).getTime() - new Date(a.issue_date || 0).getTime()
    )[0];
    const contractCount = latestAr?.contracts?.length || 0;

    // 관계 수: customer_relationships 컬렉션에서 조회 (from_customer 또는 related_customer로 연결)
    const relationshipCount = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS).countDocuments({
      $or: [
        { from_customer: objectId },
        { related_customer: objectId }
      ]
    });

    // 민감 정보 제외
    const safeCustomer = {
      id: customer._id.toString(),
      personalInfo: {
        name: customer.personal_info?.name,
        mobilePhone: customer.personal_info?.mobile_phone || null,
        homePhone: customer.personal_info?.home_phone || null,
        workPhone: customer.personal_info?.work_phone || null,
        email: customer.personal_info?.email,
        address: customer.personal_info?.address
      },
      insuranceInfo: {
        customerType: customer.insurance_info?.customer_type,
        businessNumber: customer.insurance_info?.business_number,
        representative: customer.insurance_info?.representative
      },
      meta: {
        status: customer.meta?.status,
        createdAt: customer.meta?.created_at,
        updatedAt: customer.meta?.updated_at
      },
      documentCount,
      contractCount,
      relationshipCount
    };

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(safeCustomer, null, 2)
      }]
    };
  } catch (error) {
    // 에러 로깅
    console.error('[MCP] get_customer 에러:', error);
    sendErrorLog('aims_mcp', 'get_customer 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `고객 조회 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * 고객 등록 핸들러
 * CLAUDE.md 규칙 #8: 같은 설계사 내에서 고객명 중복 불가
 */
export async function handleCreateCustomer(args: unknown) {
  try {
    const params = createCustomerSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    // 이름 중복 체크 (동일 userId 내)
    const existing = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
      'personal_info.name': { $regex: `^${escapeRegex(params.name)}$`, $options: 'i' },
      'meta.created_by': userId,
      deleted_at: { $exists: false }
    });

    if (existing) {
      return {
        isError: true,
        content: [{
          type: 'text' as const,
          text: `같은 이름의 고객이 이미 존재합니다: ${params.name}`
        }]
      };
    }

    const now = new Date();
    const newCustomer = {
      personal_info: {
        name: params.name,
        mobile_phone: formatPhoneNumber(params.phone),
        email: params.email || '',
        birth_date: params.birthDate || '',
        address: params.address ? { address1: params.address } : {}
      },
      insurance_info: {
        customer_type: params.customerType || '개인'
      },
      meta: {
        status: 'active',
        created_by: userId,
        created_at: now,
        updated_at: now
      }
    };

    const result = await db.collection(COLLECTIONS.CUSTOMERS).insertOne(newCustomer);

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          customerId: result.insertedId.toString(),
          name: params.name,
          customerType: params.customerType || '개인',
          createdAt: now.toISOString()
        }, null, 2)
      }]
    };
  } catch (error) {
    // 에러 로깅
    console.error('[MCP] create_customer 에러:', error);
    sendErrorLog('aims_mcp', 'create_customer 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `고객 등록 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * 고객 정보 수정 핸들러
 */
export async function handleUpdateCustomer(args: unknown) {
  try {
    const params = updateCustomerSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    const objectId = toSafeObjectId(params.customerId);
    if (!objectId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '유효하지 않은 고객 ID입니다.' }]
      };
    }

    // 고객 존재 확인
    const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
      _id: objectId,
      'meta.created_by': userId
    });

    if (!customer) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '고객을 찾을 수 없습니다.' }]
      };
    }

    // 이름 변경 시 중복 체크
    if (params.name && params.name !== customer.personal_info?.name) {
      const existing = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
        'personal_info.name': { $regex: `^${escapeRegex(params.name)}$`, $options: 'i' },
        'meta.created_by': userId,
        _id: { $ne: objectId },
        deleted_at: { $exists: false }
      });

      if (existing) {
        return {
          isError: true,
          content: [{
            type: 'text' as const,
            text: `같은 이름의 고객이 이미 존재합니다: ${params.name}`
          }]
        };
      }
    }

    // 업데이트할 필드 구성
    const updateFields: Record<string, unknown> = {
      'meta.updated_at': new Date()
    };

    if (params.name) updateFields['personal_info.name'] = params.name;

    // 전화번호: phoneType에 따라 다른 필드에 저장
    if (params.phone) {
      const formattedPhone = formatPhoneNumber(params.phone);
      const phoneType = params.phoneType || 'mobile'; // 기본값: 휴대폰

      switch (phoneType) {
        case 'home':
          updateFields['personal_info.home_phone'] = formattedPhone;
          break;
        case 'work':
          updateFields['personal_info.work_phone'] = formattedPhone;
          break;
        case 'mobile':
        default:
          updateFields['personal_info.mobile_phone'] = formattedPhone;
          break;
      }
    }

    if (params.email) updateFields['personal_info.email'] = params.email;
    if (params.birthDate) updateFields['personal_info.birth_date'] = params.birthDate;

    // 구조화된 주소 처리
    if (params.postal_code) updateFields['personal_info.address.postal_code'] = params.postal_code;
    if (params.address1) updateFields['personal_info.address.address1'] = params.address1;
    if (params.address2 !== undefined) updateFields['personal_info.address.address2'] = params.address2;

    await db.collection(COLLECTIONS.CUSTOMERS).updateOne(
      { _id: objectId },
      { $set: updateFields }
    );

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          customerId: params.customerId,
          updatedFields: Object.keys(updateFields).filter(k => k !== 'meta.updated_at'),
          message: '고객 정보가 수정되었습니다.'
        }, null, 2)
      }]
    };
  } catch (error) {
    // 에러 로깅
    console.error('[MCP] update_customer 에러:', error);
    sendErrorLog('aims_mcp', 'update_customer 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `고객 정보 수정 실패: ${errorMessage}`
      }]
    };
  }
}
