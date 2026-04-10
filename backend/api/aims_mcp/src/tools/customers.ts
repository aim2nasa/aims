import { z, ZodError } from 'zod';
import { escapeRegex, formatZodError } from '../db.js';
import { getCurrentUserId } from '../auth.js';
import { sendErrorLog } from '../systemLogger.js';
import { countFiles, createCustomer, updateCustomer, queryCustomers, countCustomers, aggregateCustomers, queryRelationships } from '../internalApi.js';
import {
  normalizeContract, matchesSearch, calculatePaymentStatus,
  type ARContract, type AnnualReport, type NormalizedContract
} from './contracts.js';


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

// 고객명 + 계약 통합 검색 스키마
export const searchCustomerWithContractsSchema = z.object({
  query: z.string().describe('고객명 검색어 (필수). 부분 매칭 지원'),
  search: z.string().optional().describe('계약 내 검색어 (상품명, 증권번호)'),
  status: z.string().optional().describe('계약 상태 (정상, 실효 등)'),
  includeLapsed: z.boolean().optional().default(false).describe('실효/해지 계약 포함 여부 (기본: false)'),
  insurerName: z.string().optional().describe('보험사명 필터 (예: "메트라이프")'),
  paymentStatus: z.string().optional().describe('납입상태 필터 (납입중/납입완료/일시납/전기납)'),
  coverageAmountMin: z.number().optional().describe('보장금액 최소 (만원 단위)'),
  contractorNotInsured: z.boolean().optional().describe('계약자와 피보험자가 다른 계약만 (true)'),
  contractDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식은 YYYY-MM-DD').optional().describe('이 날짜 이후 계약만 (YYYY-MM-DD)'),
  contractDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식은 YYYY-MM-DD').optional().describe('이 날짜 이전 계약만 (YYYY-MM-DD)'),
  sortBy: z.enum(['contractDate', 'premium', 'coverageAmount', 'expiryDate']).optional().default('contractDate').describe('정렬 기준'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc').describe('정렬 순서'),
  limit: z.number().optional().default(50).describe('계약 결과 개수 (기본: 50, 최대: 50)')
});

// Tool 정의
export const customerToolDefinitions = [
  {
    name: 'search_customers',
    description: '고객을 이름, 전화번호, 지역 등으로 검색합니다. 검색 조건 없이 호출하면 전체 고객 목록을 반환합니다. 응답에는 birthDate(생년월일) 필드가 포함됩니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: '검색어 (이름의 일부, 전화번호, 이메일). 부분 매칭을 지원하므로 이름 일부만으로도 검색 가능 (예: "[법인명]" → "주식회사[법인명]" 검색됨)' },
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
  },
  {
    name: 'search_customer_with_contracts',
    description: `고객명으로 검색하여 고객 정보와 계약 목록을 한번에 조회합니다.

■ 이 도구를 사용하는 경우:
- [고객명] + 계약/보험/보험료/증권/만기/보장 관련 질문
- "[고객명] 계약 현황 알려줘"
- "[고객명] 보험료 얼마나 내고 있어?"
- "[고객명] 증권번호 목록 알려줘"
- "[고객명] 메트라이프 계약만 보여줘"
- "[고객명] 실효 계약 포함해서 전부 보여줘"
- "[고객명] 보장금액 1억 이상 계약"
- "[고객명] 정상 상태 계약 목록 보여줘"
- "[고객명] 계약 목록 보여줘"
- "[고객명] 보험 언제 끝나?"
- "[고객명] 만기일 알려줘"

■ search_customers 대신 이 도구를 사용하세요!
고객명이 언급되고 계약/보험 정보가 필요한 질문은 반드시 이 도구를 호출하세요.
search_customers는 고객 기본정보만 반환하고 계약 정보는 없습니다.

■ 이 도구를 사용하지 않는 경우:
- 고객명 없이 전체 계약 조회 → list_contracts 사용
- 고객 기본정보만 필요 (이름, 전화번호, 생년월일) → search_customers 사용
- 변액보험/CRS 관련 질의 → get_customer_reviews 또는 query_customer_reviews 사용`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: '고객명 검색어 (필수). 부분 매칭 지원 (예: "[법인명]" → "주식회사[법인명]")' },
        search: { type: 'string', description: '계약 내 검색어 (상품명, 증권번호)' },
        status: { type: 'string', description: '계약 상태 (정상, 실효 등)' },
        includeLapsed: { type: 'boolean', description: '실효/해지 계약 포함 여부 (기본: false)' },
        insurerName: { type: 'string', description: '보험사명 필터 (예: "메트라이프", "삼성생명")' },
        paymentStatus: { type: 'string', description: '납입상태 필터 (납입중/납입완료/일시납/전기납)' },
        coverageAmountMin: { type: 'number', description: '보장금액 최소 (만원 단위)' },
        contractorNotInsured: { type: 'boolean', description: '계약자와 피보험자가 다른 계약만 (true)' },
        contractDateFrom: { type: 'string', description: '이 날짜 이후 계약만 (YYYY-MM-DD)' },
        contractDateTo: { type: 'string', description: '이 날짜 이전 계약만 (YYYY-MM-DD)' },
        sortBy: { type: 'string', enum: ['contractDate', 'premium', 'coverageAmount', 'expiryDate'], description: '정렬 기준 (기본: contractDate)' },
        sortOrder: { type: 'string', enum: ['asc', 'desc'], description: '정렬 순서 (기본: desc)' },
        limit: { type: 'number', description: '계약 결과 개수 (기본: 50, 최대: 50)' }
      },
      required: ['query']
    }
  }
];

/**
 * 고객 검색 핸들러
 */
export async function handleSearchCustomers(args: unknown) {
  try {
    const params = searchCustomersSchema.parse(args || {});
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

    // Internal API 경유: customers 쿼리
    const customers = await queryCustomers(
      filter,
      {
        _id: 1,
        'personal_info.name': 1,
        'personal_info.mobile_phone': 1,
        'personal_info.email': 1,
        'personal_info.address': 1,
        'personal_info.birth_date': 1,
        'insurance_info.customer_type': 1,
        'meta.status': 1,
        'meta.created_at': 1
      },
      { 'meta.created_at': -1 },
      limit,
      offset
    );

    const totalCount = await countCustomers(filter);
    const hasMore = offset + customers.length < totalCount;

    // 고객 유형별 카운트 (개인/법인) — Internal API aggregate 경유
    const typeCounts = await aggregateCustomers([
      { $match: filter },
      { $group: { _id: '$insurance_info.customer_type', count: { $sum: 1 } } }
    ]);

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
    const userId = getCurrentUserId();

    // Internal API 경유: 소유권 필터 포함 쿼리
    const results = await queryCustomers(
      { _id: params.customerId, 'meta.created_by': userId },
      null, null, 1
    );
    const customer = results[0] || null;

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

    // 관계 수: Internal API 경유 — relationships 쿼리
    const relFromCustomer = await queryRelationships({
      'relationship_info.from_customer_id': params.customerId,
      'relationship_info.status': 'active'
    });
    const relToCustomer = await queryRelationships({
      'relationship_info.to_customer_id': params.customerId,
      'relationship_info.status': 'active'
    });
    // 중복 제거 (양방향 관계)
    const relIds = new Set([
      ...relFromCustomer.map((r: any) => r._id?.toString()),
      ...relToCustomer.map((r: any) => r._id?.toString())
    ]);
    const relationshipCount = relIds.size;

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

/**
 * 고객명 + 계약 통합 검색 핸들러
 *
 * 고객명으로 검색 → customerId 획득 → 해당 고객의 계약 목록까지 한번에 반환
 * contracts.ts의 normalizeContract/필터 로직을 재사용
 */
export async function handleSearchCustomerWithContracts(args: unknown) {
  try {
    const params = searchCustomerWithContractsSchema.parse(args);
    const userId = getCurrentUserId();

    // 1단계: 고객명으로 검색 (부분 매칭)
    const regex = { $regex: escapeRegex(params.query), $options: 'i' };
    const customerFilter: Record<string, unknown> = {
      'meta.created_by': userId,
      'meta.status': 'active',
      'personal_info.name': regex
    };

    const customers = await queryCustomers(
      customerFilter,
      {
        _id: 1,
        'personal_info.name': 1,
        'personal_info.mobile_phone': 1,
        'personal_info.email': 1,
        'personal_info.birth_date': 1,
        'insurance_info.customer_type': 1,
        'annual_reports': 1,
        'customer_reviews': 1
      },
      { 'meta.created_at': -1 },
      1  // 첫 번째 매칭 고객만
    );

    if (customers.length === 0) {
      return {
        isError: true,
        content: [{
          type: 'text' as const,
          text: `"${params.query}"에 해당하는 고객을 찾을 수 없습니다.`
        }]
      };
    }

    const customer = customers[0];
    const customerId = customer._id.toString();
    const customerName = customer.personal_info?.name || '';

    // 2단계: 해당 고객의 계약 수집 (contracts.ts 로직 재사용)
    const annualReports: AnnualReport[] = customer.annual_reports || [];
    const allContracts: NormalizedContract[] = [];
    // 증권번호 기준 중복 제거 (AR 우선, CR 보조)
    const contractMap = new Map<string, NormalizedContract>();

    if (annualReports.length > 0) {
      // issue_date 기준 정렬 (최신 우선)
      const sortedReports = [...annualReports].sort((a, b) => {
        const dateA = new Date(a.issue_date || 0).getTime();
        const dateB = new Date(b.issue_date || 0).getTime();
        return dateB - dateA;
      });

      for (const ar of sortedReports) {
        // 정상 계약 수집
        const contracts: ARContract[] = ar.contracts || [];
        for (const contract of contracts) {
          const policyNumber = (contract as any).contract_number || contract['증권번호'] || '';
          if (policyNumber && contractMap.has(policyNumber)) continue;
          const normalized = normalizeContract(
            contract, customerId, customerName,
            ar.issue_date, ar.parsed_at, false
          );
          if (policyNumber) {
            contractMap.set(policyNumber, normalized);
          } else {
            allContracts.push(normalized);
          }
        }

        // 실효 계약 수집
        if (params.includeLapsed) {
          const lapsedContracts: ARContract[] = ar.lapsed_contracts || [];
          for (const contract of lapsedContracts) {
            const policyNumber = (contract as any).contract_number || contract['증권번호'] || '';
            if (policyNumber && contractMap.has(policyNumber)) continue;
            const normalized = normalizeContract(
              contract, customerId, customerName,
              ar.issue_date, ar.parsed_at, true
            );
            if (policyNumber) {
              contractMap.set(policyNumber, normalized);
            } else {
              allContracts.push(normalized);
            }
          }
        }
      }
    }

    // customer_reviews(CR)에서 추가 계약 수집 (AR에 없는 증권번호만)
    const customerReviews: any[] = customer.customer_reviews || [];
    for (const cr of customerReviews) {
      const contractInfo = cr.contract_info;
      if (!contractInfo) continue;

      const policyNumber = contractInfo.policy_number || '';
      if (policyNumber && contractMap.has(policyNumber)) continue;

      const monthlyPremium = contractInfo.monthly_premium || 0;
      const initialPremium = contractInfo.initial_premium || 0;
      const insuredAmount = contractInfo.insured_amount || 0;
      const contractDate = contractInfo.contract_date || '';

      // CRS 상품명에서 납입기간 추출 (예: "종신, 10년납" → "10년")
      const productName = cr.product_name || '';
      const paymentYearMatch = productName.match(/(\d+)\s*년\s*납/);
      let crsPaymentPeriod = '';
      if (paymentYearMatch) {
        crsPaymentPeriod = `${paymentYearMatch[1]}년`;
      } else if (monthlyPremium === 0) {
        // 상품명에 년납 패턴 없고 월보험료 0이면 일시납으로 분류
        crsPaymentPeriod = '일시납';
      }

      const normalized: NormalizedContract = {
        customerId,
        customerName,
        policyNumber,
        productName,
        insurerName: '',
        contractor: cr.contractor_name || '',
        insured: cr.insured_name || '',
        contractDate,
        status: '정상',
        coverageAmount: insuredAmount / 10000,
        insurancePeriod: '',
        paymentPeriod: crsPaymentPeriod,
        paymentStatus: crsPaymentPeriod === '일시납' ? '일시납' : calculatePaymentStatus(crsPaymentPeriod, contractDate),
        expiryDate: null,
        paymentEndDate: null,
        premium: monthlyPremium > 0 ? monthlyPremium : initialPremium,
        isLapsed: false,
        arIssueDate: cr.issue_date || '',
        arParsedAt: cr.parsed_at
      };

      if (policyNumber) {
        contractMap.set(policyNumber, normalized);
      } else {
        allContracts.push(normalized);
      }
    }

    // contractMap의 모든 계약을 allContracts로 flush
    for (const contract of contractMap.values()) {
      allContracts.push(contract);
    }

    // 3단계: 필터링
    let filteredContracts = allContracts;

    // 계약 내 검색어
    if (params.search) {
      filteredContracts = filteredContracts.filter(c => matchesSearch(c, params.search!));
    }

    // 계약 상태
    if (params.status) {
      const statusLower = params.status.toLowerCase();
      filteredContracts = filteredContracts.filter(c =>
        c.status.toLowerCase().includes(statusLower)
      );
    }

    // 보험사명
    if (params.insurerName) {
      filteredContracts = filteredContracts.filter(c =>
        c.insurerName.includes(params.insurerName!)
      );
    }

    // 납입상태
    if (params.paymentStatus) {
      filteredContracts = filteredContracts.filter(c =>
        c.paymentStatus === params.paymentStatus
      );
    }

    // 보장금액 최소
    if (params.coverageAmountMin !== undefined) {
      filteredContracts = filteredContracts.filter(c =>
        c.coverageAmount >= params.coverageAmountMin!
      );
    }

    // 계약자 ≠ 피보험자
    if (params.contractorNotInsured) {
      filteredContracts = filteredContracts.filter(c =>
        c.contractor !== c.insured
      );
    }

    // 계약일 범위
    if (params.contractDateFrom) {
      const fromTime = new Date(params.contractDateFrom).getTime();
      filteredContracts = filteredContracts.filter(c => {
        const t = new Date(c.contractDate).getTime();
        return !isNaN(t) && t >= fromTime;
      });
    }
    if (params.contractDateTo) {
      const toTime = new Date(params.contractDateTo).getTime() + 86400000 - 1;
      filteredContracts = filteredContracts.filter(c => {
        const t = new Date(c.contractDate).getTime();
        return !isNaN(t) && t <= toTime;
      });
    }

    // 4단계: 정렬
    const sortBy = params.sortBy || 'contractDate';
    const sortOrder = params.sortOrder || 'desc';
    const sortMultiplier = sortOrder === 'asc' ? 1 : -1;

    filteredContracts.sort((a, b) => {
      if (sortBy === 'premium') {
        return (a.premium - b.premium) * sortMultiplier;
      }
      if (sortBy === 'coverageAmount') {
        return (a.coverageAmount - b.coverageAmount) * sortMultiplier;
      }
      if (sortBy === 'expiryDate') {
        if (!a.expiryDate && !b.expiryDate) return 0;
        if (!a.expiryDate) return 1;
        if (!b.expiryDate) return -1;
        const dateA = new Date(a.expiryDate).getTime();
        const dateB = new Date(b.expiryDate).getTime();
        return (dateA - dateB) * sortMultiplier;
      }
      const dateA = new Date(a.contractDate || 0).getTime();
      const dateB = new Date(b.contractDate || 0).getTime();
      return (dateA - dateB) * sortMultiplier;
    });

    // 5단계: summary 집계
    const summary = filteredContracts.reduce(
      (acc, c) => {
        const premium = c.premium || 0;
        acc.totalPremium += premium;
        acc.totalContracts += 1;

        const isLumpSum = c.paymentPeriod.includes('일시납');
        const statusLower = c.status.toLowerCase();
        const isActive = statusLower.includes('정상') || statusLower.includes('유지');
        if (isLumpSum) {
          acc.lumpSumPremium += premium;
        } else if (isActive) {
          acc.monthlyPremium += premium;
        }

        if (isActive) {
          acc.activeContracts += 1;
        } else if (statusLower.includes('실효') || statusLower.includes('해지') || statusLower.includes('만기')) {
          acc.lapsedContracts += 1;
        }

        return acc;
      },
      { totalPremium: 0, monthlyPremium: 0, lumpSumPremium: 0, totalContracts: 0, activeContracts: 0, lapsedContracts: 0 }
    );

    // 6단계: limit 적용
    const limit = Math.min(params.limit || 50, 50);
    const paginatedContracts = filteredContracts.slice(0, limit);

    // 7단계: 응답 구성
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          _MUST_INCLUDE_IN_RESPONSE: `⚠️ 이 수치를 응답 첫 줄에 반드시 포함하세요: ${customerName}님 계약 총 ${summary.totalContracts}건 (정상 ${summary.activeContracts}건${summary.lapsedContracts > 0 ? `, 실효/해지 ${summary.lapsedContracts}건` : ''}), 월 보험료 합계 ${summary.monthlyPremium.toLocaleString()}원${summary.lumpSumPremium > 0 ? ` (일시납 ${summary.lumpSumPremium.toLocaleString()}원 별도)` : ''}`,
          customer: {
            id: customerId,
            name: customerName,
            birthDate: customer.personal_info?.birth_date || null,
            phone: customer.personal_info?.mobile_phone || null,
            email: customer.personal_info?.email || null,
            type: customer.insurance_info?.customer_type || null
          },
          contracts: paginatedContracts,
          summary,
          totalCount: filteredContracts.length
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] search_customer_with_contracts 에러:', error);
    sendErrorLog('aims_mcp', 'search_customer_with_contracts 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `고객+계약 검색 실패: ${errorMessage}`
      }]
    };
  }
}
