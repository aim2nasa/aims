import { z, ZodError } from 'zod';
import { getDB, toSafeObjectId, COLLECTIONS, formatZodError } from '../db.js';
import { getCurrentUserId } from '../auth.js';
import { sendErrorLog } from '../systemLogger.js';


// 스키마 정의
export const addMemoSchema = z.object({
  customerId: z.string().describe('고객 ID'),
  content: z.string().min(1).describe('메모 내용')
});

export const getMemoSchema = z.object({
  customerId: z.string().describe('고객 ID')
});

export const deleteMemoSchema = z.object({
  customerId: z.string().describe('고객 ID'),
  lineNumber: z.number().optional().describe('삭제할 메모 줄 번호 (1부터 시작)'),
  contentPattern: z.string().optional().describe('삭제할 메모 내용 (포함된 텍스트)')
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
  },
  {
    name: 'delete_customer_memo',
    description: '고객의 특정 메모를 삭제합니다. lineNumber(줄 번호) 또는 contentPattern(내용 일부)으로 삭제할 메모를 지정합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '고객 ID' },
        lineNumber: { type: 'number', description: '삭제할 메모 줄 번호 (1부터 시작)' },
        contentPattern: { type: 'string', description: '삭제할 메모에 포함된 텍스트' }
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
 *
 * ⭐ Atomic Update 사용:
 * findOneAndUpdate + aggregation pipeline으로 동시 추가 시에도 모든 메모 보존
 * (Read-Modify-Write 패턴의 race condition 방지)
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

    const now = new Date();
    const timestamp = formatDateTime(now);
    const newMemoLine = `[${timestamp}] ${params.content}`;

    // ⭐ 메모 추가: Read-Modify-Write with optimistic concurrency control
    // MongoDB Node.js driver에서 aggregation pipeline update 이슈로
    // 기본 패턴 사용 + retry 로직

    const maxRetries = 5;
    let result = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // 1. 현재 고객 정보 조회
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

      // 2. 새 메모 내용 생성
      const currentMemo = customer.memo || '';
      const updatedMemo = currentMemo ? `${currentMemo}\n${newMemoLine}` : newMemoLine;
      const currentUpdatedAt = customer.meta?.updated_at;

      // 3. 조건부 업데이트 (updated_at이 동일할 때만 - optimistic lock)
      const updateResult = await db.collection(COLLECTIONS.CUSTOMERS).updateOne(
        {
          _id: customerObjectId,
          'meta.created_by': userId,
          'meta.updated_at': currentUpdatedAt
        },
        {
          $set: {
            memo: updatedMemo,
            'meta.updated_at': now
          }
        }
      );

      if (updateResult.modifiedCount > 0) {
        result = customer;
        break; // 성공
      }

      // Race condition 발생 - 재시도
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 10));
      }
    }

    if (!result) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '메모 추가에 실패했습니다. 다시 시도해주세요.' }]
      };
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          customerId: params.customerId,
          customerName: result.personal_info?.name,
          addedContent: params.content,
          timestamp: timestamp,
          message: '메모가 추가되었습니다.'
        }, null, 2)
      }]
    };
  } catch (error) {
    // 에러 로깅
    console.error('[MCP] add_customer_memo 에러:', error);
    sendErrorLog('aims_mcp', 'add_customer_memo 에러', error);
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
    // 에러 로깅
    console.error('[MCP] list_customer_memos 에러:', error);
    sendErrorLog('aims_mcp', 'list_customer_memos 에러', error);
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
 * 메모 삭제 핸들러
 * lineNumber 또는 contentPattern으로 특정 메모 줄 삭제
 */
export async function handleDeleteMemo(args: unknown) {
  try {
    const params = deleteMemoSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    // lineNumber와 contentPattern 둘 다 없으면 에러
    if (params.lineNumber === undefined && !params.contentPattern) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: 'lineNumber 또는 contentPattern 중 하나를 지정해야 합니다.' }]
      };
    }

    const customerObjectId = toSafeObjectId(params.customerId);
    if (!customerObjectId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '유효하지 않은 고객 ID입니다.' }]
      };
    }

    // 고객 조회
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

    const currentMemo = customer.memo || '';
    if (!currentMemo) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '삭제할 메모가 없습니다.' }]
      };
    }

    // 메모를 줄 단위로 분리
    const lines = currentMemo.split('\n');
    let deletedLine = '';
    let newLines: string[];

    if (params.lineNumber !== undefined) {
      // 줄 번호로 삭제 (1부터 시작)
      const idx = params.lineNumber - 1;
      if (idx < 0 || idx >= lines.length) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `유효하지 않은 줄 번호입니다. (1~${lines.length})` }]
        };
      }
      deletedLine = lines[idx];
      newLines = lines.filter((_: string, i: number) => i !== idx);
    } else {
      // contentPattern으로 삭제
      const pattern = params.contentPattern!.toLowerCase();
      const matchIdx = lines.findIndex((line: string) => line.toLowerCase().includes(pattern));
      if (matchIdx === -1) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `"${params.contentPattern}" 내용이 포함된 메모를 찾을 수 없습니다.` }]
        };
      }
      deletedLine = lines[matchIdx];
      newLines = lines.filter((_: string, i: number) => i !== matchIdx);
    }

    const updatedMemo = newLines.join('\n');
    const now = new Date();

    // 업데이트 실행
    await db.collection(COLLECTIONS.CUSTOMERS).updateOne(
      { _id: customerObjectId, 'meta.created_by': userId },
      { $set: { memo: updatedMemo, 'meta.updated_at': now } }
    );

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          customerId: params.customerId,
          customerName: customer.personal_info?.name,
          deletedMemo: deletedLine,
          remainingLines: newLines.length,
          message: '메모가 삭제되었습니다.'
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] delete_customer_memo 에러:', error);
    sendErrorLog('aims_mcp', 'delete_customer_memo 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `메모 삭제 실패: ${errorMessage}`
      }]
    };
  }
}
