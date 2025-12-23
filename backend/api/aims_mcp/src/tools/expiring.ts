import { z, ZodError } from 'zod';
import { ObjectId } from 'mongodb';
import { getDB, COLLECTIONS, formatZodError } from '../db.js';
import { getCurrentUserId } from '../auth.js';
import { sendErrorLog } from '../systemLogger.js';

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
 * payment_period에서 연수 추출 ('10년' -> 10, '종신' -> null)
 */
function parsePaymentPeriodYears(period: string | null | undefined): number | null {
  if (!period) return null;
  if (period === '종신') return null; // 종신보험은 만기 없음

  const match = period.match(/(\d+)년/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * 만기 예정 계약 조회 핸들러
 *
 * DB에 expiry_date 필드가 없으므로 contract_date + payment_period로 만기일 계산
 * payment_period: '10년', '15년', '20년', '종신' 등
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

    // 1단계: 해당 설계사의 모든 계약 조회 (종신 제외)
    const contracts = await db.collection(COLLECTIONS.CONTRACTS)
      .find({
        $or: [
          { agent_id: agentObjectId },
          { agent_id: userId }
        ],
        contract_date: { $exists: true, $ne: null },
        payment_period: { $exists: true, $nin: [null, '', '종신'] }
      })
      .project({
        _id: 1,
        customer_id: 1,
        customer_name: 1,
        policy_number: 1,
        product_name: 1,
        insurer_name: 1,
        contract_date: 1,
        payment_period: 1,
        premium: 1,
        payment_status: 1
      })
      .toArray();

    // 2단계: 만기일 계산 및 필터링
    const expiringContracts = contracts
      .map(c => {
        const years = parsePaymentPeriodYears(c.payment_period);
        if (!years) return null;

        // contract_date 파싱
        const contractDate = new Date(c.contract_date);
        if (isNaN(contractDate.getTime())) return null;

        // 만기일 계산: contract_date + payment_period 연수
        const expiryDate = new Date(contractDate);
        expiryDate.setFullYear(expiryDate.getFullYear() + years);

        // 만기일이 범위 내인지 확인
        if (expiryDate < now || expiryDate > futureDate) return null;

        const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        return {
          id: c._id.toString(),
          customerId: c.customer_id?.toString(),
          customerName: c.customer_name,
          policyNumber: c.policy_number,
          productName: c.product_name,
          insurerName: c.insurer_name,
          contractDate: c.contract_date,
          paymentPeriod: c.payment_period,
          expiryDate: expiryDate.toISOString().split('T')[0],
          daysLeft,
          premium: c.premium,
          status: c.payment_status
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          description: `${params.daysWithin || 30}일 이내 만기 예정 계약`,
          count: expiringContracts.length,
          note: '종신보험은 만기가 없어 제외됩니다.',
          contracts: expiringContracts
        }, null, 2)
      }]
    };
  } catch (error) {
    // 에러 로깅
    console.error('[MCP] find_expiring_contracts 에러:', error);
    sendErrorLog('aims_mcp', 'find_expiring_contracts 에러', error);
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
