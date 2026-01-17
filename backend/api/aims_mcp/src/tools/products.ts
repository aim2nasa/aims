import { z, ZodError } from 'zod';
import { getDB, escapeRegex, COLLECTIONS, formatZodError } from '../db.js';
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
 */
export async function handleSearchProducts(args: unknown) {
  try {
    const params = searchProductsSchema.parse(args || {});
    const db = getDB();

    // insurers 컬렉션에서 보험사명으로 검색하여 insurer_id 목록 가져오기
    let insurerIds: string[] = [];
    if (params.query || params.insurerName) {
      const insurerQuery = params.insurerName || params.query;
      const insurerRegex = { $regex: escapeRegex(insurerQuery!), $options: 'i' };
      const matchingInsurers = await db.collection('insurers')
        .find({
          $or: [
            { name: insurerRegex },
            { shortName: insurerRegex }
          ]
        })
        .project({ _id: 1 })
        .toArray();
      insurerIds = matchingInsurers.map(i => i._id.toString());
    }

    // 상품 검색 필터 구성
    const filter: Record<string, unknown> = {};

    if (params.query) {
      const regex = { $regex: escapeRegex(params.query), $options: 'i' };
      const orConditions: Record<string, unknown>[] = [
        { productName: regex }
      ];
      // 보험사명 검색 결과가 있으면 해당 insurer_id도 포함
      if (insurerIds.length > 0) {
        const { ObjectId } = await import('mongodb');
        orConditions.push({ insurer_id: { $in: insurerIds.map(id => new ObjectId(id)) } });
      }
      filter.$or = orConditions;
    }

    // 보험사명으로만 필터링하는 경우
    if (params.insurerName && !params.query) {
      if (insurerIds.length > 0) {
        const { ObjectId } = await import('mongodb');
        filter.insurer_id = { $in: insurerIds.map(id => new ObjectId(id)) };
      } else {
        // 매칭되는 보험사가 없으면 빈 결과
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              count: 0,
              totalCount: 0,
              insurerBreakdown: {},
              products: [],
              message: `"${params.insurerName}" 보험사를 찾을 수 없습니다.`
            }, null, 2)
          }]
        };
      }
    }

    // 카테고리
    if (params.category) {
      filter.category = params.category;
    }

    // 상품 조회 (insurers 컬렉션과 JOIN)
    const products = await db.collection(COLLECTIONS.INSURANCE_PRODUCTS)
      .aggregate([
        { $match: filter },
        {
          $lookup: {
            from: 'insurers',
            localField: 'insurer_id',
            foreignField: '_id',
            as: 'insurer'
          }
        },
        { $unwind: { path: '$insurer', preserveNullAndEmptyArrays: true } },
        { $sort: { 'insurer.name': 1, productName: 1 } },
        { $limit: params.limit || 20 },
        {
          $project: {
            _id: 1,
            productName: 1,
            insurerName: '$insurer.name',
            insurerShortName: '$insurer.shortName',
            category: 1,
            status: 1,
            surveyDate: 1,
            saleStartDate: 1
          }
        }
      ])
      .toArray();

    const totalCount = await db.collection(COLLECTIONS.INSURANCE_PRODUCTS).countDocuments(filter);

    // 보험사별 그룹화
    const insurerCounts: Record<string, number> = {};
    products.forEach(p => {
      const insurer = p.insurerName || p.insurerShortName || '기타';
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
            productName: p.productName,
            insurerName: p.insurerName || p.insurerShortName,
            category: p.category,
            status: p.status,
            surveyDate: p.surveyDate,
            saleStartDate: p.saleStartDate
          }))
        }, null, 2)
      }]
    };
  } catch (error) {
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
