import { z, ZodError } from 'zod';
import { getDB, COLLECTIONS, formatZodError } from '../db.js';
import { getCurrentUserId } from '../auth.js';
import { sendErrorLog } from '../systemLogger.js';

// 스키마 정의
export const findBirthdayCustomersSchema = z.object({
  month: z.number().min(1).max(12).describe('월 (1-12)'),
  day: z.number().min(1).max(31).optional().describe('일 (선택사항)')
});

// Tool 정의
export const birthdayToolDefinitions = [
  {
    name: 'find_birthday_customers',
    description: '특정 월 또는 날짜에 생일인 고객을 찾습니다. 생일 축하 메시지 발송 등에 활용할 수 있습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        month: { type: 'number', description: '월 (1-12)' },
        day: { type: 'number', description: '일 (선택사항, 지정하지 않으면 해당 월 전체)' }
      },
      required: ['month']
    }
  }
];

/**
 * 생일 고객 조회 핸들러
 */
export async function handleFindBirthdayCustomers(args: unknown) {
  try {
    const params = findBirthdayCustomersSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    // MongoDB aggregation으로 생일 필터링
    // personal_info.birth_date 또는 personal_info.birthdate 필드 사용
    // 생일 정보가 없는 고객은 제외 (null safety)
    const pipeline: object[] = [
      {
        $match: {
          'meta.created_by': userId,
          'meta.status': 'active',
          $or: [
            { 'personal_info.birth_date': { $exists: true, $nin: [null, ''] } },
            { 'personal_info.birthdate': { $exists: true, $nin: [null, ''] } }
          ]
        }
      },
      {
        $addFields: {
          birthMonth: {
            $month: {
              $cond: {
                if: { $ne: ['$personal_info.birth_date', null] },
                then: { $toDate: '$personal_info.birth_date' },
                else: { $toDate: '$personal_info.birthdate' }
              }
            }
          },
          birthDay: {
            $dayOfMonth: {
              $cond: {
                if: { $ne: ['$personal_info.birth_date', null] },
                then: { $toDate: '$personal_info.birth_date' },
                else: { $toDate: '$personal_info.birthdate' }
              }
            }
          }
        }
      },
      {
        $match: {
          birthMonth: params.month,
          ...(params.day ? { birthDay: params.day } : {})
        }
      },
      {
        $project: {
          _id: 1,
          'personal_info.name': 1,
          'personal_info.mobile_phone': 1,
          'personal_info.email': 1,
          'personal_info.birth_date': 1,
          'personal_info.birthdate': 1,
          birthMonth: 1,
          birthDay: 1
        }
      },
      {
        $sort: { birthDay: 1 }
      }
    ];

    const customers = await db.collection(COLLECTIONS.CUSTOMERS)
      .aggregate(pipeline)
      .toArray();

    const monthName = ['', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'][params.month];
    const dateDesc = params.day ? `${monthName} ${params.day}일` : monthName;

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          description: `${dateDesc} 생일 고객`,
          count: customers.length,
          customers: customers.map(c => ({
            id: c._id.toString(),
            name: c.personal_info?.name,
            phone: c.personal_info?.mobile_phone,
            email: c.personal_info?.email,
            birthDate: c.personal_info?.birth_date || c.personal_info?.birthdate,
            birthDay: c.birthDay
          }))
        }, null, 2)
      }]
    };
  } catch (error) {
    // 에러 로깅
    console.error('[MCP] find_birthday_customers 에러:', error);
    sendErrorLog('aims_mcp', 'find_birthday_customers 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `생일 고객 조회 실패: ${errorMessage}`
      }]
    };
  }
}
