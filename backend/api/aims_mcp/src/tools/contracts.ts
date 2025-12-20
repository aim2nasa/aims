import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { getDB, escapeRegex, toSafeObjectId, COLLECTIONS } from '../db.js';
import { getCurrentUserId } from '../auth.js';

// 스키마 정의
export const listContractsSchema = z.object({
  customerId: z.string().optional().describe('특정 고객의 계약만 조회'),
  search: z.string().optional().describe('검색어 (고객명, 상품명, 증권번호)'),
  status: z.string().optional().describe('계약 상태'),
  limit: z.number().optional().default(50).describe('결과 개수 제한')
});

// Tool 정의
export const contractToolDefinitions = [
  {
    name: 'list_contracts',
    description: '계약 목록을 조회합니다. 고객별, 상품별로 필터링할 수 있습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '특정 고객의 계약만 조회' },
        search: { type: 'string', description: '검색어 (고객명, 상품명, 증권번호)' },
        status: { type: 'string', description: '계약 상태' },
        limit: { type: 'number', description: '결과 개수 제한 (기본: 50)' }
      }
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

    // 기본 필터: 해당 설계사의 계약만
    const filter: Record<string, unknown> = {};

    // agent_id 필터 (ObjectId 또는 string)
    const agentObjectId = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;
    filter.$or = [
      { agent_id: agentObjectId },
      { agent_id: userId }
    ];

    // 고객 ID
    if (params.customerId) {
      const customerObjectId = toSafeObjectId(params.customerId);
      if (customerObjectId) {
        filter.customer_id = customerObjectId;
      }
    }

    // 검색어
    if (params.search) {
      const regex = { $regex: escapeRegex(params.search), $options: 'i' };
      filter.$and = filter.$and || [];
      (filter.$and as unknown[]).push({
        $or: [
          { customer_name: regex },
          { product_name: regex },
          { policy_number: regex }
        ]
      });
    }

    // 상태
    if (params.status) {
      filter.status = params.status;
    }

    const contracts = await db.collection(COLLECTIONS.CONTRACTS)
      .find(filter)
      .sort({ 'meta.created_at': -1 })
      .limit(params.limit || 50)
      .toArray();

    const totalCount = await db.collection(COLLECTIONS.CONTRACTS).countDocuments(filter);

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          count: contracts.length,
          totalCount,
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
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `계약 조회 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
      }]
    };
  }
}
