import { z, ZodError } from 'zod';
import { getDB, escapeRegex, toSafeObjectId, COLLECTIONS, formatZodError } from '../db.js';
import { getCurrentUserId } from '../auth.js';

// 스키마 정의
export const searchProductsSchema = z.object({
  query: z.string().optional().describe('검색어 (상품명, 보험사명)'),
  insurerName: z.string().optional().describe('보험사명'),
  category: z.string().optional().describe('상품 카테고리'),
  limit: z.number().optional().default(20).describe('결과 개수 제한')
});

export const getProductDetailsSchema = z.object({
  productId: z.string().describe('상품 ID')
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
  },
  {
    name: 'get_product_details',
    description: '보험상품의 상세 정보를 조회합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        productId: { type: 'string', description: '상품 ID' }
      },
      required: ['productId']
    }
  }
];

/**
 * 보험상품 검색 핸들러
 */
export async function handleSearchProducts(args: unknown) {
  try {
    const params = searchProductsSchema.parse(args || {});
    const db = getDB();

    const filter: Record<string, unknown> = {};

    // 검색어
    if (params.query) {
      const regex = { $regex: escapeRegex(params.query), $options: 'i' };
      filter.$or = [
        { product_name: regex },
        { insurer_name: regex }
      ];
    }

    // 보험사
    if (params.insurerName) {
      filter.insurer_name = { $regex: escapeRegex(params.insurerName), $options: 'i' };
    }

    // 카테고리
    if (params.category) {
      filter.category = params.category;
    }

    const products = await db.collection(COLLECTIONS.INSURANCE_PRODUCTS)
      .find(filter)
      .sort({ insurer_name: 1, product_name: 1 })
      .limit(params.limit || 20)
      .project({
        _id: 1,
        product_name: 1,
        insurer_name: 1,
        category: 1,
        product_type: 1,
        survey_date: 1
      })
      .toArray();

    const totalCount = await db.collection(COLLECTIONS.INSURANCE_PRODUCTS).countDocuments(filter);

    // 보험사별 그룹화 (선택적)
    const insurerCounts: Record<string, number> = {};
    products.forEach(p => {
      const insurer = p.insurer_name || '기타';
      insurerCounts[insurer] = (insurerCounts[insurer] || 0) + 1;
    });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          count: products.length,
          totalCount,
          insurerBreakdown: insurerCounts,
          products: products.map(p => ({
            id: p._id.toString(),
            productName: p.product_name,
            insurerName: p.insurer_name,
            category: p.category,
            productType: p.product_type,
            surveyDate: p.survey_date
          }))
        }, null, 2)
      }]
    };
  } catch (error) {
    // 에러 로깅 (디버깅용)
    console.error('[MCP] search_products 에러:', error);
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

/**
 * 보험상품 상세 조회 핸들러
 */
export async function handleGetProductDetails(args: unknown) {
  try {
    const params = getProductDetailsSchema.parse(args);
    const db = getDB();

    const objectId = toSafeObjectId(params.productId);
    if (!objectId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '유효하지 않은 상품 ID입니다.' }]
      };
    }

    const product = await db.collection(COLLECTIONS.INSURANCE_PRODUCTS).findOne({
      _id: objectId
    });

    if (!product) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '상품을 찾을 수 없습니다.' }]
      };
    }

    // 이 상품으로 체결된 계약 수 조회
    const contractCount = await db.collection(COLLECTIONS.CONTRACTS).countDocuments({
      product_id: objectId
    });

    const productDetails = {
      id: product._id.toString(),
      productName: product.product_name,
      insurerName: product.insurer_name,
      category: product.category,
      productType: product.product_type,
      surveyDate: product.survey_date,
      description: product.description,
      features: product.features || [],
      coverages: product.coverages || [],
      premiumRange: product.premium_range,
      ageRange: product.age_range,
      contractCount,
      meta: {
        createdAt: product.meta?.created_at,
        updatedAt: product.meta?.updated_at
      }
    };

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(productDetails, null, 2)
      }]
    };
  } catch (error) {
    // 에러 로깅 (디버깅용)
    console.error('[MCP] get_product_details 에러:', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `보험상품 조회 실패: ${errorMessage}`
      }]
    };
  }
}
