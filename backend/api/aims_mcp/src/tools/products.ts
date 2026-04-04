import { z, ZodError } from 'zod';
import { formatZodError } from '../db.js';
import { searchProducts } from '../internalApi.js';
import { sendErrorLog } from '../systemLogger.js';

// 스키마 정의
export const searchProductsSchema = z.object({
  query: z.string().optional().describe('검색어 (상품명, 보험사명)'),
  insurerName: z.string().optional().describe('보험사명'),
  category: z.string().optional().describe('상품 카테고리'),
  limit: z.number().optional().default(20).describe('결과 개수 제한')
});

// Tool 정의
export const productToolDefinitions = [
  {
    name: 'search_products',
    description: '보험상품을 검색합니다. 상품명, 보험사, 카테고리로 필터링할 수 있습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: '검색어 (상품명, 보험사명)' },
        insurerName: { type: 'string', description: '보험사명' },
        category: { type: 'string', description: '상품 카테고리' },
        limit: { type: 'number', description: '결과 개수 제한 (기본: 20)' }
      }
    }
  }
];

/**
 * 보험상품 검색 핸들러
 *
 * aims_api Internal API를 경유하여 insurance_products/insurers를 조회.
 */
export async function handleSearchProducts(args: unknown) {
  try {
    const params = searchProductsSchema.parse(args || {});

    const result = await searchProducts({
      query: params.query,
      insurerName: params.insurerName,
      category: params.category,
      limit: params.limit
    });

    if (!result) {
      return {
        isError: true,
        content: [{
          type: 'text' as const,
          text: '보험상품 검색 실패: Internal API 응답 없음'
        }]
      };
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(result, null, 2)
      }]
    };
  } catch (error) {
    // 에러 로깅
    console.error('[MCP] search_products 에러:', error);
    sendErrorLog('aims_mcp', 'search_products 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `보험상품 검색 실패: ${errorMessage}`
      }]
    };
  }
}
