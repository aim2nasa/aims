import { z, ZodError } from 'zod';
import { getDB, escapeRegex, COLLECTIONS } from '../db.js';
import { getCurrentUserId } from '../auth.js';
import { sendErrorLog } from '../systemLogger.js';

// ============================================================
// RAG API 설정
// ============================================================

const RAG_API_URL = process.env.RAG_API_URL || 'http://localhost:8000';

// ============================================================
// 스키마 정의
// ============================================================

export const unifiedSearchSchema = z.object({
  query: z.string().min(1).describe('검색어'),
  limit: z.number().min(1).max(20).optional().default(5).describe('카테고리별 결과 개수 (기본 5)'),
  documentsOnly: z.boolean().optional().default(false).describe('true: 문서만 검색 (고객/계약 제외)')
});

// ============================================================
// 타입 정의
// ============================================================

interface DocumentResult {
  fileId: string;
  fileName: string;
  summary: string;
  customerName?: string;
  relevanceScore?: number;
}

interface CustomerResult {
  customerId: string;
  name: string;
  customerType: string;
  phone?: string;
}

interface ContractResult {
  contractId: string;
  customerName: string;
  productName: string;
  policyNumber: string;
  status: string;
}

interface UnifiedSearchResult {
  query: string;
  documents: {
    keyword: { count: number; results: DocumentResult[] };
    ai: { count: number; results: DocumentResult[] };
  };
  customers: { count: number; results: CustomerResult[] };
  contracts: { count: number; results: ContractResult[] };
  summary: string;
}

// ============================================================
// Tool 정의
// ============================================================

export const unifiedSearchToolDefinitions = [
  {
    name: 'unified_search',
    description: `통합 검색: 문서, 고객, 계약을 검색합니다.

**문서 검색 결과:**
- 🔤 키워드 일치: 정확히 해당 단어가 포함된 문서
- 🤖 AI 검색: 의미적으로 관련된 문서

**documentsOnly 옵션:**
- false (기본): 문서 + 고객 + 계약 모두 검색
- true: 문서만 검색 (고객/계약 제외) - "문서", "서류", "파일" 관련 요청 시 사용`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: '검색어' },
        limit: { type: 'number', description: '카테고리별 결과 개수 (기본 5, 최대 20)' },
        documentsOnly: { type: 'boolean', description: 'true: 문서만 검색 (고객/계약 제외)' }
      },
      required: ['query']
    }
  }
];

// ============================================================
// HTTP 헬퍼
// ============================================================

async function ragFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = `${RAG_API_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  return response;
}

// ============================================================
// 개별 검색 함수
// ============================================================

/**
 * 문서 키워드 검색
 */
async function searchDocumentsKeyword(query: string, userId: string, limit: number): Promise<{ count: number; results: DocumentResult[] }> {
  try {
    const response = await ragFetch('/search', {
      method: 'POST',
      body: JSON.stringify({
        query,
        user_id: userId,
        search_mode: 'keyword',
        top_k: limit
      })
    });

    if (!response.ok) {
      return { count: 0, results: [] };
    }

    const data = await response.json() as { search_results?: Record<string, unknown>[]; total_count?: number };
    const results = (data.search_results || []).map((r: Record<string, unknown>) => {
      const upload = r.upload as Record<string, unknown> | undefined;
      const meta = r.meta as Record<string, unknown> | undefined;
      const ocr = r.ocr as Record<string, unknown> | undefined;
      return {
        fileId: r._id as string,
        fileName: upload?.originalName as string || '',
        summary: (meta?.summary as string) || (ocr?.summary as string) || '',
        customerName: undefined
      };
    });

    return { count: data.total_count || results.length, results };
  } catch (error) {
    console.error('[unified_search] 키워드 검색 오류:', error);
    return { count: 0, results: [] };
  }
}

/**
 * 문서 AI(시맨틱) 검색
 */
async function searchDocumentsAI(query: string, userId: string, limit: number): Promise<{ count: number; results: DocumentResult[] }> {
  try {
    const response = await ragFetch('/search', {
      method: 'POST',
      body: JSON.stringify({
        query,
        user_id: userId,
        search_mode: 'semantic',
        top_k: limit
      })
    });

    if (!response.ok) {
      return { count: 0, results: [] };
    }

    const data = await response.json() as { search_results?: Record<string, unknown>[]; total_count?: number };
    const results = (data.search_results || []).map((r: Record<string, unknown>) => {
      const payload = r.payload as Record<string, unknown> | undefined;
      return {
        fileId: (r.doc_id || payload?.doc_id) as string,
        fileName: payload?.original_name as string || '',
        summary: payload?.preview as string || '',
        customerName: payload?.customer_name as string | undefined,
        relevanceScore: Math.round(((r.final_score as number) || (r.score as number) || 0) * 100) / 100
      };
    });

    return { count: data.total_count || results.length, results };
  } catch (error) {
    console.error('[unified_search] AI 검색 오류:', error);
    return { count: 0, results: [] };
  }
}

/**
 * 고객 검색
 */
async function searchCustomers(query: string, userId: string, limit: number): Promise<{ count: number; results: CustomerResult[] }> {
  try {
    const db = await getDB();
    const searchRegex = { $regex: escapeRegex(query), $options: 'i' };

    const filter = {
      $and: [
        { 'meta.created_by': userId },
        { deleted_at: null },
        {
          $or: [
            { 'personal_info.name': searchRegex },
            { 'personal_info.mobile_phone': searchRegex },
            { 'personal_info.email': searchRegex }
          ]
        }
      ]
    };

    const [customers, totalCount] = await Promise.all([
      db.collection(COLLECTIONS.CUSTOMERS)
        .find(filter)
        .limit(limit)
        .toArray(),
      db.collection(COLLECTIONS.CUSTOMERS).countDocuments(filter)
    ]);

    const results = customers.map(c => ({
      customerId: c._id.toString(),
      name: c.personal_info?.name || '',
      customerType: c.insurance_info?.customer_type || '개인',
      phone: c.personal_info?.mobile_phone
    }));

    return { count: totalCount, results };
  } catch (error) {
    console.error('[unified_search] 고객 검색 오류:', error);
    return { count: 0, results: [] };
  }
}

/**
 * 계약 검색 (customers.annual_reports[].contracts에서 검색)
 */
async function searchContracts(query: string, userId: string, limit: number): Promise<{ count: number; results: ContractResult[] }> {
  try {
    const db = await getDB();
    const searchRegex = new RegExp(escapeRegex(query), 'i');

    // customers 컬렉션에서 annual_reports.contracts 검색
    const customers = await db.collection(COLLECTIONS.CUSTOMERS)
      .find({
        'meta.created_by': userId,
        deleted_at: null,
        'annual_reports.contracts': { $exists: true, $ne: [] }
      })
      .project({
        _id: 1,
        'personal_info.name': 1,
        annual_reports: 1
      })
      .toArray();

    const results: ContractResult[] = [];

    for (const customer of customers) {
      const customerName = customer.personal_info?.name || '';
      const annualReports = customer.annual_reports || [];

      for (const ar of annualReports) {
        const contracts = ar.contracts || [];
        for (const contract of contracts) {
          // 검색어 매칭: 고객명, 상품명, 증권번호
          const productName = contract.productName || contract.product_name || '';
          const policyNumber = contract.policyNumber || contract.policy_number || '';
          const status = contract.status || contract.contractStatus || '';

          if (
            searchRegex.test(customerName) ||
            searchRegex.test(productName) ||
            searchRegex.test(policyNumber)
          ) {
            results.push({
              contractId: `${customer._id}-${policyNumber}`,
              customerName,
              productName,
              policyNumber,
              status
            });

            if (results.length >= limit) break;
          }
        }
        if (results.length >= limit) break;
      }
      if (results.length >= limit) break;
    }

    return { count: results.length, results };
  } catch (error) {
    console.error('[unified_search] 계약 검색 오류:', error);
    return { count: 0, results: [] };
  }
}

// ============================================================
// 핸들러 구현
// ============================================================

export async function handleUnifiedSearch(args: unknown) {
  try {
    const params = unifiedSearchSchema.parse(args);
    const userId = getCurrentUserId();
    const limit = params.limit || 5;
    const documentsOnly = params.documentsOnly || false;

    // 문서만 검색 모드
    if (documentsOnly) {
      const [keywordDocs, aiDocs] = await Promise.all([
        searchDocumentsKeyword(params.query, userId, limit),
        searchDocumentsAI(params.query, userId, limit)
      ]);

      // AI 검색 결과에서 키워드 검색과 중복되는 항목 제거
      const keywordFileIds = new Set(keywordDocs.results.map(d => d.fileId));
      const uniqueAiDocs = {
        count: aiDocs.count,
        results: aiDocs.results.filter(d => !keywordFileIds.has(d.fileId))
      };

      const totalDocs = keywordDocs.count + uniqueAiDocs.count;
      const summary = totalDocs > 0
        ? `"${params.query}" 문서 검색 결과: 📄 ${totalDocs}건 (키워드 ${keywordDocs.count}, AI ${uniqueAiDocs.count})`
        : `"${params.query}"에 대한 문서가 없습니다.`;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            query: params.query,
            documentsOnly: true,
            documents: {
              keyword: keywordDocs,
              ai: uniqueAiDocs
            },
            summary
          }, null, 2)
        }]
      };
    }

    // 전체 검색 모드 (문서 + 고객 + 계약)
    const [keywordDocs, aiDocs, customers, contracts] = await Promise.all([
      searchDocumentsKeyword(params.query, userId, limit),
      searchDocumentsAI(params.query, userId, limit),
      searchCustomers(params.query, userId, limit),
      searchContracts(params.query, userId, limit)
    ]);

    // AI 검색 결과에서 키워드 검색과 중복되는 항목 제거
    const keywordFileIds = new Set(keywordDocs.results.map(d => d.fileId));
    const uniqueAiDocs = {
      count: aiDocs.count,
      results: aiDocs.results.filter(d => !keywordFileIds.has(d.fileId))
    };

    // 결과 요약 생성
    const totalDocs = keywordDocs.count + uniqueAiDocs.count;
    const summaryParts: string[] = [];

    if (totalDocs > 0) {
      summaryParts.push(`📄 문서 ${totalDocs}건 (키워드 ${keywordDocs.count}, AI ${uniqueAiDocs.count})`);
    }
    if (customers.count > 0) {
      summaryParts.push(`👤 고객 ${customers.count}건`);
    }
    if (contracts.count > 0) {
      summaryParts.push(`📋 계약 ${contracts.count}건`);
    }

    const summary = summaryParts.length > 0
      ? `"${params.query}" 검색 결과: ${summaryParts.join(', ')}`
      : `"${params.query}"에 대한 검색 결과가 없습니다.`;

    const result: UnifiedSearchResult = {
      query: params.query,
      documents: {
        keyword: keywordDocs,
        ai: uniqueAiDocs
      },
      customers,
      contracts,
      summary
    };

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(result, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] unified_search 에러:', error);
    sendErrorLog('aims_mcp', 'unified_search 에러', error);

    if (error instanceof ZodError) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `입력 오류: ${error.errors.map(e => e.message).join(', ')}` }]
      };
    }

    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return {
      isError: true,
      content: [{ type: 'text' as const, text: `통합 검색 실패: ${errorMessage}` }]
    };
  }
}
