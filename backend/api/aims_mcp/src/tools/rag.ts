import { z, ZodError } from 'zod';
import { getCurrentUserId } from '../auth.js';
import { sendErrorLog } from '../systemLogger.js';

// ============================================================
// RAG API 설정
// ============================================================

const RAG_API_URL = process.env.RAG_API_URL || 'http://localhost:3013';

// ============================================================
// 스키마 정의
// ============================================================

export const searchDocumentsSemanticSchema = z.object({
  query: z.string().min(1).describe('검색 쿼리'),
  mode: z.enum(['keyword', 'semantic']).optional().default('semantic').describe('검색 모드 (keyword: 키워드 검색, semantic: 의미 검색)'),
  limit: z.number().min(1).max(50).optional().default(10).describe('결과 개수 (기본 10, 최대 50)')
});

export const getSearchAnalyticsSchema = z.object({
  days: z.number().min(1).max(90).optional().default(30).describe('분석 기간 (일, 기본 30일)')
});

export const getFailedQueriesSchema = z.object({
  limit: z.number().min(1).max(50).optional().default(10).describe('조회할 실패 쿼리 수 (기본 10)')
});

export const submitSearchFeedbackSchema = z.object({
  queryId: z.string().describe('검색 쿼리 ID'),
  rating: z.number().min(1).max(5).describe('평점 (1-5)'),
  comment: z.string().optional().describe('피드백 코멘트')
});

// ============================================================
// 타입 정의
// ============================================================

interface SearchResult {
  file_id: string;
  file_name: string;
  score: number;
  summary?: string;
  tags?: string[];
  customer_name?: string;
}

interface SearchResponse {
  results?: SearchResult[];
  search_time_ms?: number;
}

interface AnalyticsResponse {
  total_searches?: number;
  success_rate?: number;
  avg_response_time_ms?: number;
  query_type_distribution?: Record<string, number>;
  rerank_impact?: Record<string, unknown>;
  top_queries?: string[];
}

interface FailedQuery {
  query: string;
  count: number;
  last_failed_at: string;
  failure_reason?: string;
}

interface FailedQueriesResponse {
  failed_queries?: FailedQuery[];
}

// ============================================================
// Tool 정의
// ============================================================

export const ragToolDefinitions = [
  {
    name: 'search_documents_semantic',
    description: '문서를 의미 기반으로 검색합니다. 하이브리드 엔진(메타데이터+벡터)과 리랭킹을 사용하여 정확한 결과를 제공합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: '검색 쿼리' },
        mode: { type: 'string', enum: ['keyword', 'semantic'], description: '검색 모드 (keyword: 키워드 검색, semantic: 의미 검색, 기본: semantic)' },
        limit: { type: 'number', description: '결과 개수 (기본 10, 최대 50)' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_search_analytics',
    description: '검색 품질 통계를 조회합니다. 검색 성공률, 평균 응답 시간, 쿼리 유형 분포 등을 확인할 수 있습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        days: { type: 'number', description: '분석 기간 (일, 기본 30일)' }
      },
      required: []
    }
  },
  {
    name: 'get_failed_queries',
    description: '실패한 검색 쿼리 목록을 조회합니다. 검색 개선에 활용할 수 있습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: '조회할 실패 쿼리 수 (기본 10)' }
      },
      required: []
    }
  },
  {
    name: 'submit_search_feedback',
    description: '검색 결과에 대한 피드백을 제출합니다. 검색 품질 개선에 활용됩니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        queryId: { type: 'string', description: '검색 쿼리 ID' },
        rating: { type: 'number', description: '평점 (1-5)' },
        comment: { type: 'string', description: '피드백 코멘트' }
      },
      required: ['queryId', 'rating']
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
// 핸들러 구현
// ============================================================

/**
 * 시맨틱 문서 검색
 * aims_rag_api의 하이브리드 검색 엔진 활용
 */
export async function handleSearchDocumentsSemantic(args: unknown) {
  try {
    const params = searchDocumentsSemanticSchema.parse(args);
    const userId = getCurrentUserId();

    const response = await ragFetch('/search', {
      method: 'POST',
      body: JSON.stringify({
        query: params.query,
        user_id: userId,
        mode: params.mode,
        top_k: params.limit
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        isError: true,
        content: [{
          type: 'text' as const,
          text: `검색 API 오류: ${response.status} - ${errorText}`
        }]
      };
    }

    const result = await response.json() as SearchResponse;

    // 결과 포맷팅
    const formattedResults = (result.results || []).map((r) => ({
      fileId: r.file_id,
      fileName: r.file_name,
      relevanceScore: Math.round((r.score || 0) * 100) / 100,
      summary: r.summary || '',
      tags: r.tags || [],
      customerName: r.customer_name
    }));

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          query: params.query,
          mode: params.mode,
          totalResults: formattedResults.length,
          searchTime: result.search_time_ms,
          results: formattedResults
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] search_documents_semantic 에러:', error);
    sendErrorLog('aims_mcp', 'search_documents_semantic 에러', error);

    if (error instanceof ZodError) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `입력 오류: ${error.errors.map(e => e.message).join(', ')}` }]
      };
    }

    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return {
      isError: true,
      content: [{ type: 'text' as const, text: `검색 실패: ${errorMessage}` }]
    };
  }
}

/**
 * 검색 품질 통계 조회
 */
export async function handleGetSearchAnalytics(args: unknown) {
  try {
    const params = getSearchAnalyticsSchema.parse(args);

    const response = await ragFetch(`/analytics/overall?days=${params.days}`);

    if (!response.ok) {
      const errorText = await response.text();
      return {
        isError: true,
        content: [{
          type: 'text' as const,
          text: `통계 API 오류: ${response.status} - ${errorText}`
        }]
      };
    }

    const result = await response.json() as AnalyticsResponse;

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          period: `최근 ${params.days}일`,
          totalSearches: result.total_searches ?? 0,
          successRate: result.success_rate != null ? `${Math.round(result.success_rate * 100)}%` : 'N/A',
          avgResponseTime: result.avg_response_time_ms != null ? `${Math.round(result.avg_response_time_ms)}ms` : 'N/A',
          queryTypeDistribution: result.query_type_distribution ?? {},
          rerankImpact: result.rerank_impact ?? {},
          topQueries: result.top_queries ?? []
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] get_search_analytics 에러:', error);
    sendErrorLog('aims_mcp', 'get_search_analytics 에러', error);

    if (error instanceof ZodError) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `입력 오류: ${error.errors.map(e => e.message).join(', ')}` }]
      };
    }

    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return {
      isError: true,
      content: [{ type: 'text' as const, text: `통계 조회 실패: ${errorMessage}` }]
    };
  }
}

/**
 * 실패한 검색 쿼리 조회
 */
export async function handleGetFailedQueries(args: unknown) {
  try {
    const params = getFailedQueriesSchema.parse(args);

    const response = await ragFetch(`/analytics/failed_queries?limit=${params.limit}`);

    if (!response.ok) {
      const errorText = await response.text();
      return {
        isError: true,
        content: [{
          type: 'text' as const,
          text: `실패 쿼리 API 오류: ${response.status} - ${errorText}`
        }]
      };
    }

    const result = await response.json() as FailedQueriesResponse;

    const formattedQueries = (result.failed_queries ?? []).map((q) => ({
      query: q.query,
      failCount: q.count,
      lastFailedAt: q.last_failed_at,
      reason: q.failure_reason || '결과 없음'
    }));

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          totalFailedQueries: formattedQueries.length,
          queries: formattedQueries,
          suggestion: formattedQueries.length > 0
            ? '이 쿼리들에 대한 문서 태그나 요약 개선을 고려해보세요.'
            : '실패한 검색이 없습니다.'
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] get_failed_queries 에러:', error);
    sendErrorLog('aims_mcp', 'get_failed_queries 에러', error);

    if (error instanceof ZodError) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `입력 오류: ${error.errors.map(e => e.message).join(', ')}` }]
      };
    }

    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return {
      isError: true,
      content: [{ type: 'text' as const, text: `실패 쿼리 조회 실패: ${errorMessage}` }]
    };
  }
}

/**
 * 검색 피드백 제출
 */
export async function handleSubmitSearchFeedback(args: unknown) {
  try {
    const params = submitSearchFeedbackSchema.parse(args);
    const userId = getCurrentUserId();

    const response = await ragFetch('/feedback', {
      method: 'POST',
      body: JSON.stringify({
        query_id: params.queryId,
        user_id: userId,
        rating: params.rating,
        comment: params.comment || ''
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        isError: true,
        content: [{
          type: 'text' as const,
          text: `피드백 API 오류: ${response.status} - ${errorText}`
        }]
      };
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          queryId: params.queryId,
          rating: params.rating,
          message: '피드백이 성공적으로 제출되었습니다. 검색 품질 개선에 활용됩니다.'
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] submit_search_feedback 에러:', error);
    sendErrorLog('aims_mcp', 'submit_search_feedback 에러', error);

    if (error instanceof ZodError) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `입력 오류: ${error.errors.map(e => e.message).join(', ')}` }]
      };
    }

    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return {
      isError: true,
      content: [{ type: 'text' as const, text: `피드백 제출 실패: ${errorMessage}` }]
    };
  }
}
