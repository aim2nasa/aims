import { z, ZodError } from 'zod';
import { ObjectId } from 'mongodb';
import { getDB, escapeRegex, toSafeObjectId, COLLECTIONS, formatZodError } from '../db.js';
import { getCurrentUserId } from '../auth.js';
import { sendErrorLog } from '../systemLogger.js';
import { countFiles, createCustomer, updateCustomer } from '../internalApi.js';


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
  query: z.string().optional().describe('검색어 (이름의 일부, 전화번호, 이메일). 부분 매칭 지원'),
  lastName: z.string().optional().describe('성씨(한 글자)로만 검색 (예: "김", "이", "박"). 2글자 이상은 query 사용'),
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
    description: '고객을 이름, 전화번호, 지역 등으로 검색합니다. 검색 조건 없이 호출하면 전체 고객 목록을 반환합니다. 응답에는 birthDate(생년월일) 필드가 포함됩니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: '검색어 (이름의 일부, 전화번호, 이메일). 부분 매칭을 지원하므로 이름 일부만으로도 검색 가능 (예: "마리치" → "주식회사마리치" 검색됨)' },
        lastName: { type: 'string', description: '성씨(한 글자)로만 검색할 때 사용 (예: "김", "이", "박"). 이름의 첫 글자 기준 prefix 매칭. 2글자 이상의 이름 부분 검색은 query를 사용하세요' },
        customerType: { type: 'string', enum: ['개인', '법인'], description: '고객 유형' },
        status: { type: 'string', enum: ['active', 'inactive', 'all'], description: '상태 (기본: active)' },
        region: { type: 'string', description: '지역 (시/도)' },
        limit: { type: 'number', description: '결과 개수 제한 (기본: 20)' }
      }
    }
  },
  {
    name: 'get_customer',
    description: '특정 고객의 상세 정보를 조회합니다. personalInfo에 birthDate(생년월일) 필드가 포함됩니다.',
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
        'personal_info.birth_date': 1,
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
            birthDate: c.personal_info?.birth_date || null,
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

    // 문서 수는 Internal API 경유 조회 (Single Source of Truth: files.customerId)
    const documentCount = await countFiles({
      customerId: params.customerId
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
        birthDate: customer.personal_info?.birth_date || null,
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
    const userId = getCurrentUserId();

    // Internal API 호출 (중복 체크 포함)
    const result = await createCustomer({
      name: params.name,
      phone: formatPhoneNumber(params.phone),
      userId,
      email: params.email,
      birthDate: params.birthDate,
      address: params.address,
      customerType: params.customerType
    });

    // API 에러 처리 (409: 중복, 400: 필수값 누락 등)
    if (!result.data) {
      return {
        isError: true,
        content: [{
          type: 'text' as const,
          text: result.error || '고객 등록에 실패했습니다.'
        }]
      };
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          customerId: result.data.customerId,
          name: result.data.name,
          customerType: result.data.customerType,
          createdAt: result.data.createdAt
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
    const userId = getCurrentUserId();

    // Internal API 호출 (존재 확인, 소유권 확인, 이름 중복 체크 포함)
    const result = await updateCustomer(params.customerId, {
      userId,
      name: params.name,
      phone: params.phone ? formatPhoneNumber(params.phone) : undefined,
      phoneType: params.phoneType,
      email: params.email,
      birthDate: params.birthDate,
      postal_code: params.postal_code,
      address1: params.address1,
      address2: params.address2
    });

    // API 에러 처리 (404: 미존재, 409: 이름 중복, 400: 유효하지 않은 ID 등)
    if (!result.data) {
      return {
        isError: true,
        content: [{
          type: 'text' as const,
          text: result.error || '고객 정보 수정에 실패했습니다.'
        }]
      };
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          customerId: result.data.customerId,
          updatedFields: result.data.updatedFields,
          message: result.data.message
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
