import { z, ZodError } from 'zod';
import { ObjectId } from 'mongodb';
import { getDB, escapeRegex, toSafeObjectId, COLLECTIONS, formatZodError } from '../db.js';
import { getCurrentUserId } from '../auth.js';
import { sendErrorLog } from '../systemLogger.js';

// ============================================================
// 스키마 정의
// ============================================================

export const getStorageInfoSchema = z.object({});

export const checkCustomerNameSchema = z.object({
  name: z.string().min(1).describe('확인할 고객명')
});

export const listNoticesSchema = z.object({
  category: z.enum(['system', 'product', 'policy', 'event']).optional().describe('공지 카테고리'),
  limit: z.number().optional().default(10).describe('결과 개수 제한')
});

export const listFaqsSchema = z.object({
  category: z.string().optional().describe('FAQ 카테고리'),
  search: z.string().optional().describe('검색어 (질문/답변에서 검색)'),
  limit: z.number().optional().default(20).describe('결과 개수 제한')
});

export const listUsageGuidesSchema = z.object({
  category: z.string().optional().describe('가이드 카테고리'),
  search: z.string().optional().describe('검색어')
});

// ============================================================
// Tool 정의
// ============================================================

export const utilityToolDefinitions = [
  {
    name: 'get_storage_info',
    description: '현재 사용자의 저장소 사용량을 조회합니다. 할당량, 사용량, 남은 용량을 확인할 수 있습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    }
  },
  {
    name: 'check_customer_name',
    description: '고객명이 이미 존재하는지 확인합니다. 고객 등록 전 중복 체크에 사용합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: '확인할 고객명' }
      },
      required: ['name']
    }
  },
  {
    name: 'list_notices',
    description: '공지사항 목록을 조회합니다. 시스템, 상품, 정책, 이벤트 카테고리별로 필터링할 수 있습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        category: { type: 'string', enum: ['system', 'product', 'policy', 'event'], description: '공지 카테고리' },
        limit: { type: 'number', description: '결과 개수 제한 (기본: 10)' }
      }
    }
  },
  {
    name: 'list_faqs',
    description: 'FAQ 목록을 조회합니다. 카테고리별 필터링과 검색이 가능합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        category: { type: 'string', description: 'FAQ 카테고리 (general, customer, document, contract, account 등)' },
        search: { type: 'string', description: '검색어 (질문/답변에서 검색)' },
        limit: { type: 'number', description: '결과 개수 제한 (기본: 20)' }
      }
    }
  },
  {
    name: 'list_usage_guides',
    description: '사용 가이드를 조회합니다. 시스템 사용법, 기능 설명 등을 확인할 수 있습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        category: { type: 'string', description: '가이드 카테고리 (getting-started, customer, contract, document 등)' },
        search: { type: 'string', description: '검색어' }
      }
    }
  }
];

// ============================================================
// 상수 정의
// ============================================================

// 기본 저장소 티어 (aims_api의 storageQuotaService.js와 동일하게 유지)
const GB = 1024 * 1024 * 1024;
const DEFAULT_TIER_DEFINITIONS: Record<string, { name: string; quota_bytes: number }> = {
  free_trial: { name: '무료체험', quota_bytes: 5 * GB },
  standard: { name: '일반', quota_bytes: 30 * GB },
  premium: { name: '프리미엄', quota_bytes: 50 * GB },
  vip: { name: 'VIP', quota_bytes: 100 * GB },
  admin: { name: '관리자', quota_bytes: -1 }
};
const DEFAULT_TIER = 'standard';

// FAQ 카테고리 라벨
const FAQ_CATEGORY_LABELS: Record<string, string> = {
  general: '일반',
  'import-data': '고객계약 등록',
  'import-file': '문서 등록',
  customer: '고객',
  document: '문서',
  contract: '계약',
  account: '계정'
};

// ============================================================
// 헬퍼 함수
// ============================================================

function formatBytes(bytes: number): string {
  if (bytes === -1) return '무제한';
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

// ============================================================
// 핸들러
// ============================================================

/**
 * 저장소 정보 조회 핸들러
 */
export async function handleGetStorageInfo(args: unknown) {
  try {
    getStorageInfoSchema.parse(args || {});
    const db = getDB();
    const userId = getCurrentUserId();

    // 1. 사용자의 파일 총 용량 계산 (ownerId 필드, meta.size_bytes 사용)
    const usageResult = await db.collection(COLLECTIONS.FILES).aggregate([
      {
        $match: {
          ownerId: userId,
          deleted_at: { $exists: false }
        }
      },
      {
        $group: {
          _id: null,
          totalSize: {
            $sum: {
              $toInt: { $ifNull: ['$meta.size_bytes', '0'] }
            }
          },
          fileCount: { $sum: 1 }
        }
      }
    ]).toArray();

    const usage = usageResult[0] || { totalSize: 0, fileCount: 0 };

    // 2. 사용자 정보 조회
    const userObjectId = toSafeObjectId(userId);
    const user = userObjectId
      ? await db.collection('users').findOne({ _id: userObjectId })
      : await db.collection('users').findOne({ _id: userId as unknown as ObjectId });

    // 3. 사용자의 저장소 정보 (storage.quota_bytes) 또는 기본값 사용
    const tierName = user?.storage?.tier || user?.tier?.tier_id || DEFAULT_TIER;
    const tierDef = DEFAULT_TIER_DEFINITIONS[tierName] || DEFAULT_TIER_DEFINITIONS[DEFAULT_TIER];
    const quotaBytes = user?.storage?.quota_bytes || tierDef.quota_bytes;

    const usedBytes = usage.totalSize;
    const remainingBytes = quotaBytes === -1 ? -1 : Math.max(0, quotaBytes - usedBytes);
    // 소수점 2자리까지 계산, 불필요한 소수점은 제거
    const usagePercentRaw = quotaBytes === -1 ? 0 : (usedBytes / quotaBytes) * 100;
    const usagePercent = Math.round(usagePercentRaw * 100) / 100; // 소수점 2자리
    // 0.05% → "0.05", 45.00% → "45", 12.50% → "12.5"
    const usagePercentDisplay = usagePercent < 0.01 && usagePercent > 0
      ? '<0.01'
      : usagePercent % 1 === 0
        ? String(usagePercent)
        : usagePercent.toFixed(2).replace(/\.?0+$/, '');

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          tier: tierName,
          tierName: tierDef.name,
          quota: {
            bytes: quotaBytes,
            formatted: formatBytes(quotaBytes)
          },
          used: {
            bytes: usedBytes,
            formatted: formatBytes(usedBytes)
          },
          remaining: {
            bytes: remainingBytes,
            formatted: formatBytes(remainingBytes)
          },
          usagePercent,
          usagePercentDisplay: `${usagePercentDisplay}%`,
          fileCount: usage.fileCount,
          message: quotaBytes === -1
            ? '무제한 저장소입니다.'
            : usagePercent >= 90
              ? `⚠️ 저장소 사용량이 ${usagePercentDisplay}%입니다. 정리가 필요합니다.`
              : `저장소 ${usagePercentDisplay}% 사용 중입니다.`
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] get_storage_info 에러:', error);
    sendErrorLog('aims_mcp', 'get_storage_info 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `저장소 정보 조회 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * 고객명 중복 체크 핸들러
 */
export async function handleCheckCustomerName(args: unknown) {
  try {
    const params = checkCustomerNameSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    const trimmedName = params.name.trim();

    // 대소문자 무시하여 중복 체크
    const existing = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
      'meta.created_by': userId,
      'personal_info.name': { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i') }
    });

    if (existing) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            exists: true,
            name: trimmedName,
            existingCustomer: {
              id: existing._id.toString(),
              name: existing.personal_info?.name,
              customerType: existing.insurance_info?.customer_type,
              status: existing.meta?.status || 'active'
            },
            message: `"${trimmedName}" 이름의 고객이 이미 존재합니다.`
          }, null, 2)
        }]
      };
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          exists: false,
          name: trimmedName,
          existingCustomer: null,
          message: `"${trimmedName}" 이름은 사용 가능합니다.`
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] check_customer_name 에러:', error);
    sendErrorLog('aims_mcp', 'check_customer_name 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `고객명 확인 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * 공지사항 목록 조회 핸들러
 */
export async function handleListNotices(args: unknown) {
  try {
    const params = listNoticesSchema.parse(args || {});
    const db = getDB();

    // 공개된 공지사항만 조회
    const query: Record<string, unknown> = { isPublished: true };
    if (params.category) {
      query.category = params.category;
    }

    const notices = await db.collection('notices')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(params.limit || 10)
      .toArray();

    const totalCount = await db.collection('notices').countDocuments(query);

    // 카테고리 라벨 매핑
    const categoryLabels: Record<string, string> = {
      system: '시스템',
      product: '상품',
      policy: '정책',
      event: '이벤트'
    };

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          count: notices.length,
          totalCount,
          notices: notices.map(n => ({
            id: n._id.toString(),
            title: n.title,
            category: n.category,
            categoryLabel: categoryLabels[n.category] || n.category,
            isNew: n.isNew || false,
            createdAt: n.createdAt,
            content: n.content?.substring(0, 200) + (n.content?.length > 200 ? '...' : '')
          })),
          message: notices.length > 0
            ? `${notices.length}개의 공지사항이 있습니다.`
            : '공지사항이 없습니다.'
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] list_notices 에러:', error);
    sendErrorLog('aims_mcp', 'list_notices 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `공지사항 조회 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * FAQ 목록 조회 핸들러
 */
export async function handleListFaqs(args: unknown) {
  try {
    const params = listFaqsSchema.parse(args || {});
    const db = getDB();

    // 공개된 FAQ만 조회
    const query: Record<string, unknown> = { isPublished: true };
    if (params.category) {
      query.category = params.category;
    }
    if (params.search) {
      const regex = { $regex: escapeRegex(params.search), $options: 'i' };
      query.$or = [
        { question: regex },
        { answer: regex }
      ];
    }

    const faqs = await db.collection('faqs')
      .find(query)
      .sort({ order: 1 })
      .limit(params.limit || 20)
      .toArray();

    const totalCount = await db.collection('faqs').countDocuments(query);

    // 카테고리별 그룹화
    const byCategory: Record<string, typeof faqs> = {};
    faqs.forEach(faq => {
      const cat = faq.category || 'general';
      if (!byCategory[cat]) {
        byCategory[cat] = [];
      }
      byCategory[cat].push(faq);
    });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          count: faqs.length,
          totalCount,
          byCategory: Object.entries(byCategory).map(([category, items]) => ({
            category,
            categoryLabel: FAQ_CATEGORY_LABELS[category] || category,
            count: items.length,
            faqs: items.map(f => ({
              id: f._id.toString(),
              question: f.question,
              answer: f.answer
            }))
          })),
          message: faqs.length > 0
            ? `${faqs.length}개의 FAQ가 있습니다.`
            : '해당 조건의 FAQ가 없습니다.'
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] list_faqs 에러:', error);
    sendErrorLog('aims_mcp', 'list_faqs 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `FAQ 조회 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * 사용 가이드 목록 조회 핸들러
 */
export async function handleListUsageGuides(args: unknown) {
  try {
    const params = listUsageGuidesSchema.parse(args || {});
    const db = getDB();

    // 공개된 가이드만 조회
    const query: Record<string, unknown> = { isPublished: true };
    if (params.category) {
      query.categoryId = params.category;
    }

    let guides = await db.collection('usage_guides')
      .find(query)
      .sort({ order: 1 })
      .toArray();

    // 검색어가 있으면 필터링
    if (params.search && params.search.trim()) {
      const searchLower = params.search.toLowerCase().trim();
      guides = guides.map(guide => {
        // 아이템 필터링: 제목, 설명, 단계에서 검색
        const filteredItems = (guide.items || []).filter((item: { title?: string; description?: string; steps?: string[] }) => {
          const titleMatch = item.title?.toLowerCase().includes(searchLower);
          const descMatch = item.description?.toLowerCase().includes(searchLower);
          const stepsMatch = (item.steps || []).some((step: string) =>
            step.toLowerCase().includes(searchLower)
          );
          return titleMatch || descMatch || stepsMatch;
        });

        return {
          ...guide,
          items: filteredItems
        };
      }).filter(guide => guide.items.length > 0);
    }

    // 카테고리 라벨 매핑
    const categoryLabels: Record<string, string> = {
      'getting-started': '시작하기',
      customer: '고객 관리',
      contract: '계약 관리',
      document: '문서 관리',
      'batch-import': '일괄 등록',
      advanced: '고급 기능',
      account: '계정 설정',
      tips: '팁 & 트릭',
      terminology: '용어 설명'
    };

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          count: guides.length,
          guides: guides.map(g => ({
            categoryId: g.categoryId,
            categoryTitle: g.categoryTitle,
            categoryLabel: categoryLabels[g.categoryId] || g.categoryTitle,
            itemCount: (g.items || []).length,
            items: (g.items || []).map((item: { id?: string; title?: string; description?: string; steps?: string[] }) => ({
              id: item.id,
              title: item.title,
              description: item.description,
              stepCount: (item.steps || []).length
            }))
          })),
          message: guides.length > 0
            ? `${guides.length}개의 가이드 카테고리가 있습니다.`
            : '해당 조건의 가이드가 없습니다.'
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] list_usage_guides 에러:', error);
    sendErrorLog('aims_mcp', 'list_usage_guides 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `사용 가이드 조회 실패: ${errorMessage}`
      }]
    };
  }
}
