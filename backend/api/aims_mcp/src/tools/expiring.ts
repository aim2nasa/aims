import { z, ZodError } from 'zod';
import { ObjectId } from 'mongodb';
import { getDB, COLLECTIONS, formatZodError } from '../db.js';
import { getCurrentUserId } from '../auth.js';

// 스키마 정의
export const findExpiringContractsSchema = z.object({
  daysWithin: z.number().min(1).max(365).default(30).describe('며칠 이내 만기 (기본: 30일)')
});

// Tool 정의
export const expiringToolDefinitions = [
  {
    name: 'find_expiring_contracts',
    description: '곧 만기가 도래하는 계약을 찾습니다. 갱신 안내 등에 활용할 수 있습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        daysWithin: { type: 'number', description: '며칠 이내 만기 (기본: 30일, 최대: 365일)' }
      }
    }
  }
];

/**
 * 만기 예정 계약 조회 핸들러
 */
export async function handleFindExpiringContracts(args: unknown) {
  try {
    const params = findExpiringContractsSchema.parse(args || {});
    const db = getDB();
    const userId = getCurrentUserId();

    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + (params.daysWithin || 30));

    // agent_id 필터
    const agentObjectId = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;

    const pipeline: object[] = [
      {
        $match: {
          $or: [
            { agent_id: agentObjectId },
            { agent_id: userId }
          ]
        }
      },
      {
        $addFields: {
          expiryDateParsed: {
            $cond: {
              if: { $ne: ['$expiry_date', null] },
              then: { $toDate: '$expiry_date' },
              else: null
            }
          }
        }
      },
      {
        $match: {
          expiryDateParsed: {
            $gte: now,
            $lte: futureDate
          }
        }
      },
      {
        $sort: { expiryDateParsed: 1 }
      },
      {
        $project: {
          _id: 1,
          customer_id: 1,
          customer_name: 1,
          policy_number: 1,
          product_name: 1,
          insurer_name: 1,
          expiry_date: 1,
          expiryDateParsed: 1,
          premium: 1,
          status: 1
        }
      }
    ];

    const contracts = await db.collection(COLLECTIONS.CONTRACTS)
      .aggregate(pipeline)
      .toArray();

    // 남은 일수 계산 (안전한 날짜 처리)
    const contractsWithDaysLeft = contracts.map(c => {
      let expiryDate: Date | null = c.expiryDateParsed || null;

      // expiryDateParsed가 없으면 expiry_date에서 파싱 시도
      if (!expiryDate && c.expiry_date) {
        const parsed = new Date(c.expiry_date);
        // Invalid Date 체크
        expiryDate = isNaN(parsed.getTime()) ? null : parsed;
      }

      // 유효한 날짜가 있을 때만 daysLeft 계산
      const daysLeft = expiryDate
        ? Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return {
        id: c._id.toString(),
        customerId: c.customer_id?.toString(),
        customerName: c.customer_name,
        policyNumber: c.policy_number,
        productName: c.product_name,
        insurerName: c.insurer_name,
        expiryDate: c.expiry_date,
        daysLeft,
        premium: c.premium,
        status: c.status
      };
    });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          description: `${params.daysWithin || 30}일 이내 만기 예정 계약`,
          count: contractsWithDaysLeft.length,
          contracts: contractsWithDaysLeft
        }, null, 2)
      }]
    };
  } catch (error) {
    // 에러 로깅 (디버깅용)
    console.error('[MCP] find_expiring_contracts 에러:', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `만기 계약 조회 실패: ${errorMessage}`
      }]
    };
  }
}
