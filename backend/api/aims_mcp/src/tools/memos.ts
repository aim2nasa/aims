import { z, ZodError } from 'zod';
import { escapeRegex, formatZodError } from '../db.js';
import { getCurrentUserId } from '../auth.js';
import { sendErrorLog } from '../systemLogger.js';
import { createMemo, updateMemo, deleteMemo, syncCustomerMemo, queryCustomers, queryMemos, countMemos, getMemo } from '../internalApi.js';


// ── 스키마 정의 ──

export const addMemoSchema = z.object({
  customerId: z.string().describe('고객 ID'),
  content: z.string().min(1).describe('메모 내용')
});

export const listMemoSchema = z.object({
  customerId: z.string().describe('고객 ID'),
  limit: z.number().optional().default(10).describe('조회할 메모 수 (기본 10건)')
});

export const deleteMemoSchema = z.object({
  customerId: z.string().describe('고객 ID'),
  memoId: z.string().describe('삭제할 메모 ID')
});

export const updateMemoSchema = z.object({
  customerId: z.string().describe('고객 ID'),
  memoId: z.string().describe('수정할 메모 ID'),
  content: z.string().min(1).describe('수정할 메모 내용')
});

export const searchMemoSchema = z.object({
  query: z.string().min(1).describe('검색 키워드'),
  limit: z.number().optional().default(20).describe('최대 결과 수 (기본 20건)')
});

// ── Tool 정의 ──

export const memoToolDefinitions = [
  {
    name: 'add_customer_memo',
    description: '고객에게 메모를 추가합니다. customer_memos 컬렉션에 개별 문서로 저장됩니다.',
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
    description: '고객의 메모를 구조화된 JSON으로 조회합니다. limit 파라미터로 최근 N건만 조회할 수 있습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '고객 ID' },
        limit: { type: 'number', description: '조회할 메모 수 (기본 10건)' }
      },
      required: ['customerId']
    }
  },
  {
    name: 'delete_customer_memo',
    description: '고객의 특정 메모를 삭제합니다. list_customer_memos로 메모 ID를 먼저 확인 후 삭제하세요.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '고객 ID' },
        memoId: { type: 'string', description: '삭제할 메모 ID (list_customer_memos에서 확인)' }
      },
      required: ['customerId', 'memoId']
    }
  },
  {
    name: 'update_customer_memo',
    description: '고객의 특정 메모를 수정합니다. list_customer_memos로 메모 ID를 먼저 확인 후 수정하세요.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '고객 ID' },
        memoId: { type: 'string', description: '수정할 메모 ID' },
        content: { type: 'string', description: '수정할 메모 내용' }
      },
      required: ['customerId', 'memoId', 'content']
    }
  },
  {
    name: 'search_customer_memos',
    description: '키워드로 고객 메모를 검색합니다. 현재 로그인한 설계사의 고객 메모만 검색됩니다 (소유권 격리).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: '검색 키워드' },
        limit: { type: 'number', description: '최대 결과 수 (기본 20건)' }
      },
      required: ['query']
    }
  }
];

// ── 유틸리티 ──

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
 * customer_memos → customers.memo 동기화
 * customer_memos를 읽어 텍스트를 조립한 뒤, Internal API로 customers.memo 업데이트
 */
async function syncCustomerMemoField(customerId: string, userId: string): Promise<boolean> {
  try {
    // Internal API 경유: customer_memos에서 해당 고객의 모든 메모 조회 (시간순)
    const memos = await queryMemos(
      { customer_id: customerId },
      null,
      { created_at: 1 }
    );

    // 타임스탬프 형식으로 변환
    const memoText = memos.map(m =>
      `[${formatDateTime(new Date(m.created_at))}] ${m.content}`
    ).join('\n');

    // Internal API로 customers.memo 필드 업데이트
    const result = await syncCustomerMemo(customerId, memoText, userId);
    return result.data !== null;
  } catch (error) {
    console.error(`[MCP] syncCustomerMemoField 실패 (고객 ${customerId}):`, error);
    return false;
  }
}

/**
 * 고객 존재 및 소유권 확인 — Internal API 경유
 */
async function verifyCustomerOwnership(customerId: string, userId: string) {
  const results = await queryCustomers(
    { _id: customerId, 'meta.created_by': userId },
    null, null, 1
  );
  return results[0] || null;
}

// ── 핸들러 ──

/**
 * 메모 추가: customer_memos INSERT + customers.memo 동기화
 */
export async function handleAddMemo(args: unknown) {
  try {
    const params = addMemoSchema.parse(args);
    const userId = getCurrentUserId();

    // 소유권 확인 — Internal API(POST /memos)는 소유권 체크를 하지 않으므로 MCP에서 유지
    const customer = await verifyCustomerOwnership(params.customerId, userId);
    if (!customer) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '고객을 찾을 수 없습니다.' }]
      };
    }

    // Internal API로 메모 생성
    const result = await createMemo({
      customerId: params.customerId,
      content: params.content.trim(),
      userId
    });

    if (!result.data) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: result.error || '메모 생성에 실패했습니다.' }]
      };
    }

    // customers.memo 동기화
    const syncOk = await syncCustomerMemoField(params.customerId, userId);

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          customerId: params.customerId,
          customerName: customer.personal_info?.name,
          memoId: result.data.memoId,
          addedContent: params.content,
          timestamp: formatDateTime(new Date()),
          message: '메모가 추가되었습니다.',
          ...(syncOk ? {} : { syncWarning: true })
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] add_customer_memo 에러:', error);
    sendErrorLog('aims_mcp', 'add_customer_memo 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{ type: 'text' as const, text: `메모 추가 실패: ${errorMessage}` }]
    };
  }
}

/**
 * 메모 조회: customer_memos 컬렉션에서 구조화된 JSON 반환
 */
export async function handleListMemos(args: unknown) {
  try {
    const params = listMemoSchema.parse(args);
    const userId = getCurrentUserId();

    const customer = await verifyCustomerOwnership(params.customerId, userId);
    if (!customer) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '고객을 찾을 수 없습니다.' }]
      };
    }

    const limit = params.limit ?? 10;

    // Internal API 경유: 최신순으로 limit건 조회
    const memos = await queryMemos(
      { customer_id: params.customerId },
      null,
      { created_at: -1 },
      limit
    );

    // Internal API 경유: 전체 메모 수
    const total = await countMemos({ customer_id: params.customerId });

    // 구조화된 응답
    const formattedMemos = memos.map(m => ({
      id: (m._id?.toString?.() || m._id) as string,
      content: m.content,
      created_at: formatDateTime(new Date(m.created_at)),
      updated_at: m.updated_at && new Date(m.updated_at).getTime() !== new Date(m.created_at).getTime()
        ? formatDateTime(new Date(m.updated_at))
        : null,
    }));

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          customerId: params.customerId,
          customerName: customer.personal_info?.name,
          memos: formattedMemos,
          total,
          limit,
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] list_customer_memos 에러:', error);
    sendErrorLog('aims_mcp', 'list_customer_memos 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{ type: 'text' as const, text: `메모 조회 실패: ${errorMessage}` }]
    };
  }
}

/**
 * 메모 삭제: memoId 기반 삭제 + customers.memo 동기화
 */
export async function handleDeleteMemo(args: unknown) {
  try {
    const params = deleteMemoSchema.parse(args);
    const userId = getCurrentUserId();

    // 소유권 확인 — 삭제된 메모 내용을 응답에 포함하기 위해 사전 조회 유지
    const customer = await verifyCustomerOwnership(params.customerId, userId);
    if (!customer) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '고객을 찾을 수 없습니다.' }]
      };
    }

    // 삭제 전 메모 내용 조회 (응답용) — Internal API 경유
    const memo = await getMemo(params.memoId);

    // Internal API로 메모 삭제 (존재 확인 포함 — 404 반환)
    const result = await deleteMemo(params.memoId, params.customerId, userId);

    if (!result.data) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: result.error || '메모 삭제에 실패했습니다.' }]
      };
    }

    // customers.memo 동기화
    const syncOk = await syncCustomerMemoField(params.customerId, userId);

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          customerId: params.customerId,
          customerName: customer.personal_info?.name,
          deletedMemo: memo?.content || '(내용 조회 불가)',
          message: '메모가 삭제되었습니다.',
          ...(syncOk ? {} : { syncWarning: true })
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
      content: [{ type: 'text' as const, text: `메모 삭제 실패: ${errorMessage}` }]
    };
  }
}

/**
 * 메모 수정: memoId + content 수정 + customers.memo 동기화
 */
export async function handleUpdateMemo(args: unknown) {
  try {
    const params = updateMemoSchema.parse(args);
    const userId = getCurrentUserId();

    // 소유권 확인 — Internal API(PUT /memos/:id)가 소유권 체크하지만, customerName 응답용으로 유지
    const customer = await verifyCustomerOwnership(params.customerId, userId);
    if (!customer) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '고객을 찾을 수 없습니다.' }]
      };
    }

    // 수정 전 메모 내용 조회 (응답용 previousContent) — Internal API 경유
    const memo = await getMemo(params.memoId);

    // Internal API로 메모 수정 (존재 확인 + 소유권 확인 포함)
    const result = await updateMemo(params.memoId, {
      customerId: params.customerId,
      content: params.content.trim(),
      userId
    });

    if (!result.data) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: result.error || '메모 수정에 실패했습니다.' }]
      };
    }

    // customers.memo 동기화
    const syncOk = await syncCustomerMemoField(params.customerId, userId);

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          customerId: params.customerId,
          customerName: customer.personal_info?.name,
          memoId: params.memoId,
          previousContent: memo?.content || '(내용 조회 불가)',
          newContent: params.content.trim(),
          message: '메모가 수정되었습니다.',
          ...(syncOk ? {} : { syncWarning: true })
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] update_customer_memo 에러:', error);
    sendErrorLog('aims_mcp', 'update_customer_memo 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{ type: 'text' as const, text: `메모 수정 실패: ${errorMessage}` }]
    };
  }
}

/**
 * 메모 검색: 2-step 소유권 격리 + $regex 검색
 */
export async function handleSearchMemos(args: unknown) {
  try {
    const params = searchMemoSchema.parse(args);
    const userId = getCurrentUserId();
    const limit = params.limit ?? 20;

    // Step 1: 현재 사용자의 고객 ID 목록 조회 — Internal API 경유
    const myCustomers = await queryCustomers(
      { 'meta.created_by': userId },
      { _id: 1, 'personal_info.name': 1 }
    );

    if (myCustomers.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            results: [],
            total: 0,
            message: '등록된 고객이 없습니다.'
          }, null, 2)
        }]
      };
    }

    const customerIds = myCustomers.map((c: any) => c._id?.toString()).filter(Boolean);
    const customerNameMap = new Map(
      myCustomers.map((c: any) => [c._id?.toString(), c.personal_info?.name || '(이름 없음)'])
    );

    // Step 2: 해당 고객 ID 목록 + 키워드 $regex 검색 — Internal API 경유
    const escapedQuery = escapeRegex(params.query);
    const memos = await queryMemos(
      {
        customer_id: { $in: customerIds },
        content: { $regex: escapedQuery, $options: 'i' }
      },
      null,
      { created_at: -1 },
      limit
    );

    const results = memos.map((m: any) => ({
      memoId: (m._id?.toString?.() || m._id) as string,
      customerId: (m.customer_id?.toString?.() || m.customer_id) as string,
      customerName: customerNameMap.get(m.customer_id?.toString?.() || m.customer_id) || '(이름 없음)',
      content: m.content,
      created_at: formatDateTime(new Date(m.created_at)),
    }));

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          query: params.query,
          results,
          total: results.length,
          limit,
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] search_customer_memos 에러:', error);
    sendErrorLog('aims_mcp', 'search_customer_memos 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{ type: 'text' as const, text: `메모 검색 실패: ${errorMessage}` }]
    };
  }
}
