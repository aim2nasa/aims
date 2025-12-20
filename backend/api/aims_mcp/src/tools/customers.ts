import { z } from 'zod';
import { getDB, escapeRegex, toSafeObjectId, COLLECTIONS } from '../db.js';
import { getCurrentUserId } from '../auth.js';

// 스키마 정의
export const searchCustomersSchema = z.object({
  query: z.string().optional().describe('검색어 (이름, 전화번호, 이메일)'),
  customerType: z.enum(['개인', '법인']).optional().describe('고객 유형'),
  status: z.enum(['active', 'inactive', 'all']).optional().default('active').describe('상태'),
  region: z.string().optional().describe('지역 (시/도)'),
  limit: z.number().optional().default(20).describe('결과 개수 제한')
});

export const getCustomerSchema = z.object({
  customerId: z.string().describe('고객 ID')
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

    // 검색어
    if (params.query) {
      const regex = { $regex: escapeRegex(params.query), $options: 'i' };
      filter.$or = [
        { 'personal_info.name': regex },
        { 'personal_info.phone': regex },
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

    // 지역
    if (params.region) {
      filter['personal_info.address.address1'] = { $regex: escapeRegex(params.region), $options: 'i' };
    }

    const customers = await db.collection(COLLECTIONS.CUSTOMERS)
      .find(filter)
      .sort({ 'meta.created_at': -1 })
      .limit(params.limit || 20)
      .project({
        _id: 1,
        'personal_info.name': 1,
        'personal_info.phone': 1,
        'personal_info.email': 1,
        'personal_info.address': 1,
        'insurance_info.customer_type': 1,
        'meta.status': 1,
        'meta.created_at': 1
      })
      .toArray();

    const totalCount = await db.collection(COLLECTIONS.CUSTOMERS).countDocuments(filter);

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          count: customers.length,
          totalCount,
          customers: customers.map(c => ({
            id: c._id.toString(),
            name: c.personal_info?.name,
            phone: c.personal_info?.phone,
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
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `고객 검색 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
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

    // 민감 정보 제외
    const safeCustomer = {
      id: customer._id.toString(),
      personalInfo: {
        name: customer.personal_info?.name,
        phone: customer.personal_info?.phone,
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
      documentCount: customer.documents?.length || 0
    };

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(safeCustomer, null, 2)
      }]
    };
  } catch (error) {
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `고객 조회 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
      }]
    };
  }
}
