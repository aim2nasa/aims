import { z, ZodError } from 'zod';
import { getDB, toSafeObjectId, COLLECTIONS, formatZodError } from '../db.js';
import { getCurrentUserId } from '../auth.js';


// 스키마 정의
export const addMemoSchema = z.object({
  customerId: z.string().describe('고객 ID'),
  content: z.string().min(1).describe('메모 내용')
});

export const getMemoSchema = z.object({
  customerId: z.string().describe('고객 ID')
});

// Tool 정의 (단일 memo 필드 기반)
export const memoToolDefinitions = [
  {
    name: 'add_customer_memo',
    description: '고객에게 메모를 추가합니다. 기존 메모가 있으면 새 줄에 추가됩니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '고객 ID' },
        content: { type: 'string', description: '메모 내용' }
      },
      required: ['customerId', 'content']
    }
  },
  {
    name: 'list_customer_memos',
    description: '고객의 메모를 조회합니다.',
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
 * 날짜 포맷 (YYYY.MM.DD HH:mm)
 */
function formatDateTime(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${d} ${h}:${min}`;
}

/**
 * 메모 추가 핸들러
 * customers.memo 필드에 append
 */
export async function handleAddMemo(args: unknown) {
  try {
    const params = addMemoSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    const customerObjectId = toSafeObjectId(params.customerId);
    if (!customerObjectId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '유효하지 않은 고객 ID입니다.' }]
      };
    }

    // 해당 고객이 현재 사용자의 고객인지 확인
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

    const now = new Date();
    const timestamp = formatDateTime(now);
    const newMemoLine = `[${timestamp}] ${params.content}`;

    // 기존 메모가 있으면 append, 없으면 새로 생성
    const existingMemo = customer.memo || '';
    const updatedMemo = existingMemo
      ? `${existingMemo}\n${newMemoLine}`
      : newMemoLine;

    // customers.memo 필드 업데이트
    await db.collection(COLLECTIONS.CUSTOMERS).updateOne(
      { _id: customerObjectId },
      {
        $set: {
          memo: updatedMemo,
          'meta.updated_at': now
        }
      }
    );

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          customerId: params.customerId,
          customerName: customer.personal_info?.name,
          addedContent: params.content,
          timestamp: timestamp,
          message: '메모가 추가되었습니다.'
        }, null, 2)
      }]
    };
  } catch (error) {
    // 에러 로깅 (디버깅용)
    console.error('[MCP] add_customer_memo 에러:', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `메모 추가 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * 메모 조회 핸들러
 * customers.memo 필드 조회
 */
export async function handleListMemos(args: unknown) {
  try {
    const params = getMemoSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    const customerObjectId = toSafeObjectId(params.customerId);
    if (!customerObjectId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '유효하지 않은 고객 ID입니다.' }]
      };
    }

    // 해당 고객이 현재 사용자의 고객인지 확인
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

    const memo = customer.memo || '';

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          customerId: params.customerId,
          customerName: customer.personal_info?.name,
          memo: memo,
          hasContent: memo.length > 0
        }, null, 2)
      }]
    };
  } catch (error) {
    // 에러 로깅 (디버깅용)
    console.error('[MCP] list_customer_memos 에러:', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `메모 조회 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * 메모 삭제 핸들러 (더 이상 사용하지 않음 - 호환성 유지)
 * 단일 memo 필드에서는 삭제 대신 전체 초기화만 가능
 */
export async function handleDeleteMemo(args: unknown) {
  return {
    isError: true,
    content: [{
      type: 'text' as const,
      text: '메모 삭제 기능은 더 이상 지원되지 않습니다. 메모를 수정하려면 고객 정보 수정을 이용해주세요.'
    }]
  };
}
