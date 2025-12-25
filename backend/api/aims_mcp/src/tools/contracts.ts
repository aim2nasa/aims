import { z, ZodError } from 'zod';
import { ObjectId } from 'mongodb';
import { getDB, escapeRegex, toSafeObjectId, COLLECTIONS, formatZodError } from '../db.js';
import { getCurrentUserId } from '../auth.js';
import { sendErrorLog } from '../systemLogger.js';

// 스키마 정의
export const listContractsSchema = z.object({
  customerId: z.string().optional().describe('특정 고객의 계약만 조회'),
  search: z.string().optional().describe('검색어 (고객명, 상품명, 증권번호)'),
  status: z.string().optional().describe('계약 상태'),
  limit: z.number().optional().default(10).describe('결과 개수 제한 (기본: 10, 최대: 50)'),
  offset: z.number().optional().default(0).describe('건너뛸 개수 (페이지네이션용)')
});

export const getContractDetailsSchema = z.object({
  policyNumber: z.string().describe('증권번호')
});

export const createContractSchema = z.object({
  customerId: z.string().describe('계약자(고객) ID'),
  policyNumber: z.string().describe('증권번호'),
  productName: z.string().optional().describe('상품명'),
  insurerName: z.string().optional().describe('보험사명'),
  premium: z.number().optional().describe('보험료'),
  contractDate: z.string().optional().describe('계약일 (YYYY-MM-DD)'),
  expiryDate: z.string().optional().describe('만기일 (YYYY-MM-DD)'),
  status: z.string().optional().describe('계약 상태'),
  memo: z.string().optional().describe('메모')
});

// Tool 정의
export const contractToolDefinitions = [
  {
    name: 'list_contracts',
    description: '계약 목록을 조회합니다. 고객별, 상품별로 필터링할 수 있습니다. 기본 10개씩 페이지네이션됩니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '특정 고객의 계약만 조회' },
        search: { type: 'string', description: '검색어 (고객명, 상품명, 증권번호)' },
        status: { type: 'string', description: '계약 상태' },
        limit: { type: 'number', description: '결과 개수 제한 (기본: 10, 최대: 50)' },
        offset: { type: 'number', description: '건너뛸 개수 (페이지네이션용, 기본: 0)' }
      }
    }
  },
  {
    name: 'get_contract_details',
    description: '계약의 상세 정보를 조회합니다. 증권번호로 검색합니다. 피보험자, 특약 등 모든 정보를 포함합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        policyNumber: { type: 'string', description: '증권번호' }
      },
      required: ['policyNumber']
    }
  },
  {
    name: 'create_contract',
    description: '새 계약을 생성합니다. 증권번호는 중복 불가합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '계약자(고객) ID' },
        policyNumber: { type: 'string', description: '증권번호' },
        productName: { type: 'string', description: '상품명' },
        insurerName: { type: 'string', description: '보험사명' },
        premium: { type: 'number', description: '보험료' },
        contractDate: { type: 'string', description: '계약일 (YYYY-MM-DD)' },
        expiryDate: { type: 'string', description: '만기일 (YYYY-MM-DD)' },
        status: { type: 'string', description: '계약 상태' },
        memo: { type: 'string', description: '메모' }
      },
      required: ['customerId', 'policyNumber']
    }
  }
];

/**
 * 계약 목록 조회 핸들러
 */
export async function handleListContracts(args: unknown) {
  try {
    const params = listContractsSchema.parse(args || {});
    const db = getDB();
    const userId = getCurrentUserId();

    // 쿼리 조건들을 배열로 수집 (명확한 $and 구조)
    const conditions: object[] = [];

    // agent_id 필터 (ObjectId 또는 string 모두 지원)
    const agentObjectId = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;
    conditions.push({
      $or: [
        { agent_id: agentObjectId },
        { agent_id: userId }
      ]
    });

    // 고객 ID
    if (params.customerId) {
      const customerObjectId = toSafeObjectId(params.customerId);
      if (customerObjectId) {
        conditions.push({ customer_id: customerObjectId });
      }
    }

    // 검색어
    if (params.search) {
      const searchRegex = { $regex: escapeRegex(params.search), $options: 'i' };

      // 1. 보험사명으로 검색 시도
      const insurer = await db.collection(COLLECTIONS.INSURERS).findOne({
        $or: [
          { name: searchRegex },
          { shortName: searchRegex },
          { code: { $regex: `^${escapeRegex(params.search)}$`, $options: 'i' } }
        ]
      });

      if (insurer) {
        // 해당 보험사의 모든 상품 ID 가져오기
        const insurerObjectId = toSafeObjectId(insurer._id.toString());
        const products = await db.collection(COLLECTIONS.INSURANCE_PRODUCTS)
          .find({ insurer_id: insurerObjectId })
          .project({ _id: 1 })
          .toArray();

        // product_id가 string 또는 ObjectId일 수 있으므로 둘 다 매칭
        const productIdStrings = products.map(p => p._id.toString());
        const productIdObjects = products.map(p => p._id);

        if (products.length > 0) {
          conditions.push({
            $or: [
              { product_id: { $in: productIdStrings } },
              { product_id: { $in: productIdObjects } }
            ]
          });
        }
      } else {
        // 보험사 매칭 없으면 기존 검색 (고객명, 상품명, 증권번호)
        conditions.push({
          $or: [
            { customer_name: searchRegex },
            { product_name: searchRegex },
            { policy_number: searchRegex }
          ]
        });
      }
    }

    // 상태
    if (params.status) {
      conditions.push({ status: params.status });
    }

    // 최종 필터: 모든 조건을 $and로 결합
    const filter = conditions.length > 1 ? { $and: conditions } : conditions[0];

    // limit 최대 50 제한, offset 적용
    const limit = Math.min(params.limit || 10, 50);
    const offset = params.offset || 0;

    const contracts = await db.collection(COLLECTIONS.CONTRACTS)
      .find(filter)
      .sort({ 'meta.created_at': -1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    const totalCount = await db.collection(COLLECTIONS.CONTRACTS).countDocuments(filter);
    const hasMore = offset + contracts.length < totalCount;

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          count: contracts.length,
          totalCount,
          offset,
          limit,
          hasMore,
          contracts: contracts.map(c => ({
            id: c._id.toString(),
            customerId: c.customer_id?.toString(),
            customerName: c.customer_name,
            policyNumber: c.policy_number,
            productName: c.product_name,
            insurerName: c.insurer_name,
            status: c.status,
            premium: c.premium,
            contractDate: c.contract_date,
            expiryDate: c.expiry_date,
            createdAt: c.meta?.created_at
          }))
        }, null, 2)
      }]
    };
  } catch (error) {
    // 에러 로깅 (디버깅용)
    console.error('[MCP] list_contracts 에러:', error);
    sendErrorLog('aims_mcp', 'list_contracts 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `계약 조회 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * 계약 상세 조회 핸들러
 */
export async function handleGetContractDetails(args: unknown) {
  try {
    const params = getContractDetailsSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    // agent_id 필터 (ObjectId 또는 string)
    const agentObjectId = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;

    // 증권번호로 검색 (정확히 일치 또는 포함)
    const policyNumber = params.policyNumber.trim();

    // 먼저 정확히 일치하는 계약 검색
    let contract = await db.collection(COLLECTIONS.CONTRACTS).findOne({
      policy_number: policyNumber,
      $or: [
        { agent_id: agentObjectId },
        { agent_id: userId }
      ]
    });

    // 정확히 일치하지 않으면 포함 검색
    if (!contract) {
      contract = await db.collection(COLLECTIONS.CONTRACTS).findOne({
        policy_number: { $regex: escapeRegex(policyNumber), $options: 'i' },
        $or: [
          { agent_id: agentObjectId },
          { agent_id: userId }
        ]
      });
    }

    if (!contract) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `증권번호 "${policyNumber}"에 해당하는 계약을 찾을 수 없습니다.` }]
      };
    }

    // 보험상품 정보 조회
    let productInfo = null;
    if (contract.product_id) {
      const productObjectId = toSafeObjectId(contract.product_id);
      if (productObjectId) {
        const product = await db.collection(COLLECTIONS.INSURANCE_PRODUCTS).findOne({
          _id: productObjectId
        });
        if (product) {
          productInfo = {
            id: product._id.toString(),
            name: product.product_name,
            insurerName: product.insurer_name,
            category: product.category,
            type: product.product_type
          };
        }
      }
    }

    const contractDetails = {
      id: contract._id.toString(),
      // 기본 정보
      policyNumber: contract.policy_number,
      productName: contract.product_name,
      insurerName: contract.insurer_name,
      status: contract.status,
      // 계약자 정보
      contractor: {
        customerId: contract.customer_id?.toString(),
        customerName: contract.customer_name
      },
      // 피보험자 정보
      insuredPerson: contract.insured_person || null,
      // 보험료 및 금액
      premium: contract.premium,
      paymentFrequency: contract.payment_frequency,
      sumInsured: contract.sum_insured,
      // 날짜
      contractDate: contract.contract_date,
      expiryDate: contract.expiry_date,
      paymentStartDate: contract.payment_start_date,
      paymentEndDate: contract.payment_end_date,
      // 특약
      riders: contract.riders || [],
      // 상품 정보
      product: productInfo,
      // 메타
      memo: contract.memo,
      createdAt: contract.meta?.created_at,
      updatedAt: contract.meta?.updated_at
    };

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(contractDetails, null, 2)
      }]
    };
  } catch (error) {
    // 에러 로깅 (디버깅용)
    console.error('[MCP] get_contract_details 에러:', error);
    sendErrorLog('aims_mcp', 'get_contract_details 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `계약 상세 조회 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * 계약 생성 핸들러
 */
export async function handleCreateContract(args: unknown) {
  try {
    const params = createContractSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    // 고객 ID 검증
    const customerObjectId = toSafeObjectId(params.customerId);
    if (!customerObjectId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '유효하지 않은 고객 ID입니다.' }]
      };
    }

    // 고객이 해당 설계사의 고객인지 확인
    const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
      _id: customerObjectId,
      'meta.created_by': userId
    });

    if (!customer) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '고객을 찾을 수 없습니다.' }]
      };
    }

    // 증권번호 중복 체크
    const existing = await db.collection(COLLECTIONS.CONTRACTS).findOne({
      policy_number: params.policyNumber
    });

    if (existing) {
      return {
        isError: true,
        content: [{
          type: 'text' as const,
          text: `이미 존재하는 증권번호입니다: ${params.policyNumber}`
        }]
      };
    }

    const now = new Date();
    const agentObjectId = ObjectId.isValid(userId) ? new ObjectId(userId) : null;

    const newContract = {
      agent_id: agentObjectId,
      customer_id: customerObjectId,
      customer_name: customer.personal_info?.name || '',
      policy_number: params.policyNumber,
      product_name: params.productName || '',
      insurer_name: params.insurerName || '',
      premium: params.premium || 0,
      contract_date: params.contractDate || null,
      expiry_date: params.expiryDate || null,
      status: params.status || 'active',
      memo: params.memo || '',
      meta: {
        created_at: now,
        updated_at: now,
        created_by: userId
      }
    };

    const result = await db.collection(COLLECTIONS.CONTRACTS).insertOne(newContract);

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          contractId: result.insertedId.toString(),
          policyNumber: params.policyNumber,
          customerName: customer.personal_info?.name,
          message: `계약이 성공적으로 생성되었습니다: ${params.policyNumber}`
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] create_contract 에러:', error);
    sendErrorLog('aims_mcp', 'create_contract 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `계약 생성 실패: ${errorMessage}`
      }]
    };
  }
}
