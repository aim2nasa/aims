import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { getDB, COLLECTIONS } from '../db.js';
import { getCurrentUserId } from '../auth.js';

// 스키마 정의
export const getStatisticsSchema = z.object({
  type: z.enum(['summary', 'customer_count', 'contract_count', 'monthly_new']).default('summary')
    .describe('통계 유형: summary(전체요약), customer_count(고객수), contract_count(계약수), monthly_new(월별신규)')
});

// Tool 정의
export const statisticsToolDefinitions = [
  {
    name: 'get_statistics',
    description: '고객 및 계약 관련 통계를 조회합니다. 전체 요약, 고객 수, 계약 수, 월별 신규 현황 등을 볼 수 있습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['summary', 'customer_count', 'contract_count', 'monthly_new'],
          description: '통계 유형 (기본: summary)'
        }
      }
    }
  }
];

/**
 * 통계 조회 핸들러
 */
export async function handleGetStatistics(args: unknown) {
  try {
    const params = getStatisticsSchema.parse(args || {});
    const db = getDB();
    const userId = getCurrentUserId();

    const agentObjectId = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;

    if (params.type === 'summary' || !params.type) {
      // 전체 요약 통계
      const [customerStats, contractStats] = await Promise.all([
        // 고객 통계
        db.collection(COLLECTIONS.CUSTOMERS).aggregate([
          { $match: { 'meta.created_by': userId } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              active: { $sum: { $cond: [{ $eq: ['$meta.status', 'active'] }, 1, 0] } },
              inactive: { $sum: { $cond: [{ $eq: ['$meta.status', 'inactive'] }, 1, 0] } },
              individual: { $sum: { $cond: [{ $eq: ['$insurance_info.customer_type', '개인'] }, 1, 0] } },
              corporate: { $sum: { $cond: [{ $eq: ['$insurance_info.customer_type', '법인'] }, 1, 0] } }
            }
          }
        ]).toArray(),

        // 계약 통계
        db.collection(COLLECTIONS.CONTRACTS).aggregate([
          { $match: { $or: [{ agent_id: agentObjectId }, { agent_id: userId }] } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              totalPremium: { $sum: { $toDouble: { $ifNull: ['$premium', 0] } } }
            }
          }
        ]).toArray()
      ]);

      const customerStat = customerStats[0] || { total: 0, active: 0, inactive: 0, individual: 0, corporate: 0 };
      const contractStat = contractStats[0] || { total: 0, totalPremium: 0 };

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            type: 'summary',
            customers: {
              total: customerStat.total,
              active: customerStat.active,
              inactive: customerStat.inactive,
              individual: customerStat.individual,
              corporate: customerStat.corporate
            },
            contracts: {
              total: contractStat.total,
              totalPremium: contractStat.totalPremium
            }
          }, null, 2)
        }]
      };
    }

    if (params.type === 'customer_count') {
      const stats = await db.collection(COLLECTIONS.CUSTOMERS).aggregate([
        { $match: { 'meta.created_by': userId } },
        {
          $group: {
            _id: {
              type: '$insurance_info.customer_type',
              status: '$meta.status'
            },
            count: { $sum: 1 }
          }
        }
      ]).toArray();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            type: 'customer_count',
            breakdown: stats.map(s => ({
              customerType: s._id.type || '미분류',
              status: s._id.status || '미분류',
              count: s.count
            }))
          }, null, 2)
        }]
      };
    }

    if (params.type === 'contract_count') {
      const stats = await db.collection(COLLECTIONS.CONTRACTS).aggregate([
        { $match: { $or: [{ agent_id: agentObjectId }, { agent_id: userId }] } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalPremium: { $sum: { $toDouble: { $ifNull: ['$premium', 0] } } }
          }
        }
      ]).toArray();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            type: 'contract_count',
            breakdown: stats.map(s => ({
              status: s._id || '미분류',
              count: s.count,
              totalPremium: s.totalPremium
            }))
          }, null, 2)
        }]
      };
    }

    if (params.type === 'monthly_new') {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const [customerMonthly, contractMonthly] = await Promise.all([
        db.collection(COLLECTIONS.CUSTOMERS).aggregate([
          {
            $match: {
              'meta.created_by': userId,
              'meta.created_at': { $gte: sixMonthsAgo }
            }
          },
          {
            $group: {
              _id: {
                year: { $year: '$meta.created_at' },
                month: { $month: '$meta.created_at' }
              },
              count: { $sum: 1 }
            }
          },
          { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]).toArray(),

        db.collection(COLLECTIONS.CONTRACTS).aggregate([
          {
            $match: {
              $or: [{ agent_id: agentObjectId }, { agent_id: userId }],
              'meta.created_at': { $gte: sixMonthsAgo }
            }
          },
          {
            $group: {
              _id: {
                year: { $year: '$meta.created_at' },
                month: { $month: '$meta.created_at' }
              },
              count: { $sum: 1 }
            }
          },
          { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]).toArray()
      ]);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            type: 'monthly_new',
            period: '최근 6개월',
            customers: customerMonthly.map(m => ({
              yearMonth: `${m._id.year}-${String(m._id.month).padStart(2, '0')}`,
              count: m.count
            })),
            contracts: contractMonthly.map(m => ({
              yearMonth: `${m._id.year}-${String(m._id.month).padStart(2, '0')}`,
              count: m.count
            }))
          }, null, 2)
        }]
      };
    }

    return {
      isError: true,
      content: [{ type: 'text' as const, text: '알 수 없는 통계 유형입니다.' }]
    };
  } catch (error) {
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `통계 조회 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
      }]
    };
  }
}
