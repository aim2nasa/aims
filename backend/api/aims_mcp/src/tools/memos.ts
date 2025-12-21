import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { getDB, toSafeObjectId, COLLECTIONS } from '../db.js';
import { getCurrentUserId } from '../auth.js';


// 스키마 정의
export const addMemoSchema = z.object({
  customerId: z.string().describe('고객 ID'),
  content: z.string().min(1).describe('메모 내용')
});

export const listMemosSchema = z.object({
  customerId: z.string().describe('고객 ID'),
  limit: z.number().optional().default(20).describe('결과 개수 제한')
});

export const deleteMemoSchema = z.object({
  memoId: z.string().describe('메모 ID')
});

// Tool 정의
export const memoToolDefinitions = [
  {
    name: 'add_customer_memo',
    description: '고객에게 메모를 추가합니다. 상담 내용, 특이사항 등을 기록할 수 있습니다.',
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
    description: '고객의 메모 목록을 조회합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '고객 ID' },
        limit: { type: 'number', description: '결과 개수 제한 (기본: 20)' }
      },
      required: ['customerId']
    }
  },
  {
    name: 'delete_customer_memo',
    description: '메모를 삭제합니다. 본인이 작성한 메모만 삭제할 수 있습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        memoId: { type: 'string', description: '메모 ID' }
      },
      required: ['memoId']
    }
  }
];

/**
 * 메모 추가 핸들러
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
    const memo = {
      customer_id: customerObjectId,
      content: params.content,
      created_by: userId,
      created_at: now,
      updated_at: now
    };

    const result = await db.collection(COLLECTIONS.MEMOS).insertOne(memo);

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          memoId: result.insertedId.toString(),
          customerId: params.customerId,
          customerName: customer.personal_info?.name,
          content: params.content,
          createdAt: now.toISOString()
        }, null, 2)
      }]
    };
  } catch (error) {
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `메모 추가 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
      }]
    };
  }
}

/**
 * 메모 목록 조회 핸들러
 */
export async function handleListMemos(args: unknown) {
  try {
    const params = listMemosSchema.parse(args);
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

    const memos = await db.collection(COLLECTIONS.MEMOS)
      .find({ customer_id: customerObjectId })
      .sort({ created_at: -1 })
      .limit(params.limit || 20)
      .toArray();

    const totalCount = await db.collection(COLLECTIONS.MEMOS).countDocuments({
      customer_id: customerObjectId
    });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          customerId: params.customerId,
          customerName: customer.personal_info?.name,
          count: memos.length,
          totalCount,
          memos: memos.map(memo => ({
            id: memo._id.toString(),
            content: memo.content,
            createdBy: memo.created_by,
            createdAt: memo.created_at,
            updatedAt: memo.updated_at,
            isOwner: memo.created_by === userId
          }))
        }, null, 2)
      }]
    };
  } catch (error) {
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `메모 목록 조회 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
      }]
    };
  }
}

/**
 * 메모 삭제 핸들러
 */
export async function handleDeleteMemo(args: unknown) {
  try {
    const params = deleteMemoSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    const memoObjectId = toSafeObjectId(params.memoId);
    if (!memoObjectId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '유효하지 않은 메모 ID입니다.' }]
      };
    }

    // 메모 존재 및 소유권 확인
    const memo = await db.collection(COLLECTIONS.MEMOS).findOne({
      _id: memoObjectId
    });

    if (!memo) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '메모를 찾을 수 없습니다.' }]
      };
    }

    if (memo.created_by !== userId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '본인이 작성한 메모만 삭제할 수 있습니다.' }]
      };
    }

    await db.collection(COLLECTIONS.MEMOS).deleteOne({ _id: memoObjectId });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          deletedMemoId: params.memoId,
          message: '메모가 삭제되었습니다.'
        }, null, 2)
      }]
    };
  } catch (error) {
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `메모 삭제 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
      }]
    };
  }
}
