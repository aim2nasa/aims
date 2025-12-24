import { z, ZodError } from 'zod';
import { ObjectId } from 'mongodb';
import { getDB, escapeRegex, toSafeObjectId, COLLECTIONS, formatZodError } from '../db.js';
import { getCurrentUserId } from '../auth.js';
import { sendErrorLog } from '../systemLogger.js';


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
  email: z.string().email().optional().describe('이메일'),
  birthDate: z.string().optional().describe('생년월일 (YYYY-MM-DD)'),
  address: z.string().optional().describe('주소')
});

export const restoreCustomerSchema = z.object({
  customerId: z.string().describe('복구할 고객 ID')
});

export const listDeletedCustomersSchema = z.object({
  limit: z.number().optional().default(20).describe('결과 개수 제한')
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
    description: '고객 정보를 수정합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '고객 ID' },
        name: { type: 'string', description: '고객명' },
        phone: { type: 'string', description: '전화번호' },
        email: { type: 'string', description: '이메일' },
        birthDate: { type: 'string', description: '생년월일 (YYYY-MM-DD)' },
        address: { type: 'string', description: '주소' }
      },
      required: ['customerId']
    }
  },
  {
    name: 'restore_customer',
    description: '삭제된(휴면) 고객을 복구합니다. 삭제된 고객만 복구할 수 있습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '복구할 고객 ID' }
      },
      required: ['customerId']
    }
  },
  {
    name: 'list_deleted_customers',
    description: '삭제된(휴면) 고객 목록을 조회합니다. 복구 가능한 고객을 확인할 수 있습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: '결과 개수 제한 (기본: 20)' }
      }
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

    const customers = await db.collection(COLLECTIONS.CUSTOMERS)
      .find(filter)
      .sort({ 'meta.created_at': -1 })
      .limit(params.limit || 20)
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

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          count: customers.length,
          totalCount,
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

    // 민감 정보 제외
    const safeCustomer = {
      id: customer._id.toString(),
      personalInfo: {
        name: customer.personal_info?.name,
        phone: customer.personal_info?.mobile_phone,
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
        mobile_phone: params.phone || '',
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
    if (params.phone) updateFields['personal_info.mobile_phone'] = params.phone;
    if (params.email) updateFields['personal_info.email'] = params.email;
    if (params.birthDate) updateFields['personal_info.birth_date'] = params.birthDate;
    if (params.address) updateFields['personal_info.address.address1'] = params.address;

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

/**
 * 삭제된 고객 복구 핸들러
 */
export async function handleRestoreCustomer(args: unknown) {
  try {
    const params = restoreCustomerSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    const objectId = toSafeObjectId(params.customerId);
    if (!objectId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '유효하지 않은 고객 ID입니다.' }]
      };
    }

    // 삭제된 고객 확인 (deleted_at 필드가 있는 경우)
    const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
      _id: objectId,
      'meta.created_by': userId,
      deleted_at: { $exists: true }
    });

    if (!customer) {
      // 삭제되지 않은 고객이거나 권한 없음
      const activeCustomer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
        _id: objectId,
        'meta.created_by': userId
      });

      if (activeCustomer) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '이 고객은 삭제되지 않은 활성 고객입니다.' }]
        };
      }

      return {
        isError: true,
        content: [{ type: 'text' as const, text: '고객을 찾을 수 없습니다.' }]
      };
    }

    const customerName = customer.personal_info?.name || '알 수 없음';

    // 이름 중복 체크 (복구 시에도 동일 이름 체크)
    const duplicateName = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
      'personal_info.name': { $regex: `^${escapeRegex(customerName)}$`, $options: 'i' },
      'meta.created_by': userId,
      _id: { $ne: objectId },
      deleted_at: { $exists: false }
    });

    if (duplicateName) {
      return {
        isError: true,
        content: [{
          type: 'text' as const,
          text: `같은 이름의 활성 고객이 이미 존재합니다: ${customerName}. 먼저 기존 고객을 삭제하거나 이름을 변경해주세요.`
        }]
      };
    }

    // 고객 복구 (deleted_at 필드 제거, 상태 active로 변경)
    const result = await db.collection(COLLECTIONS.CUSTOMERS).findOneAndUpdate(
      { _id: objectId },
      {
        $unset: { deleted_at: '' },
        $set: {
          'meta.status': 'active',
          'meta.updated_at': new Date()
        }
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '고객 복구에 실패했습니다.' }]
      };
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          customerId: params.customerId,
          customerName,
          customerType: customer.insurance_info?.customer_type,
          message: `고객이 성공적으로 복구되었습니다: ${customerName}`
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] restore_customer 에러:', error);
    sendErrorLog('aims_mcp', 'restore_customer 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `고객 복구 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * 삭제된 고객 목록 조회 핸들러
 */
export async function handleListDeletedCustomers(args: unknown) {
  try {
    const params = listDeletedCustomersSchema.parse(args || {});
    const db = getDB();
    const userId = getCurrentUserId();

    const customers = await db.collection(COLLECTIONS.CUSTOMERS)
      .find({
        'meta.created_by': userId,
        deleted_at: { $exists: true }
      })
      .sort({ deleted_at: -1 })
      .limit(params.limit || 20)
      .project({
        _id: 1,
        'personal_info.name': 1,
        'personal_info.mobile_phone': 1,
        'insurance_info.customer_type': 1,
        'meta.status': 1,
        deleted_at: 1
      })
      .toArray();

    const totalCount = await db.collection(COLLECTIONS.CUSTOMERS).countDocuments({
      'meta.created_by': userId,
      deleted_at: { $exists: true }
    });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          count: customers.length,
          totalCount,
          customers: customers.map(c => ({
            id: c._id.toString(),
            name: c.personal_info?.name,
            phone: c.personal_info?.mobile_phone,
            type: c.insurance_info?.customer_type,
            deletedAt: c.deleted_at
          })),
          message: totalCount > 0
            ? `${totalCount}명의 삭제된 고객이 있습니다. restore_customer 도구로 복구할 수 있습니다.`
            : '삭제된 고객이 없습니다.'
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] list_deleted_customers 에러:', error);
    sendErrorLog('aims_mcp', 'list_deleted_customers 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `삭제된 고객 목록 조회 실패: ${errorMessage}`
      }]
    };
  }
}
