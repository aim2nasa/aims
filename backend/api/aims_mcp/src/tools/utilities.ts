import { z, ZodError } from 'zod';
import { ObjectId } from 'mongodb';
import { getDB, escapeRegex, toSafeObjectId, formatZodError } from '../db.js';
import { getCurrentUserId } from '../auth.js';
import { sendErrorLog } from '../systemLogger.js';
import { aggregateFiles, queryCustomers } from '../internalApi.js';

// ============================================================
// 스키마 정의
// ============================================================

export const getStorageInfoSchema = z.object({});

export const getCreditInfoSchema = z.object({});

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
    name: 'get_credit_info',
    description: '현재 사용자의 크레딧 사용량을 조회합니다. AI/OCR 크레딧 사용량, 남은 크레딧, 사용률(%), 리셋 기한을 확인할 수 있습니다.',
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

    // 1. 사용자의 파일 총 용량 계산 (Internal API 경유)
    const usageResult = await aggregateFiles([
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
    ]);

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
 * 크레딧 정보 조회 핸들러
 * AI/OCR 크레딧 사용량, 남은 크레딧, 사용률, 리셋 기한 조회
 */
export async function handleGetCreditInfo(args: unknown) {
  try {
    getCreditInfoSchema.parse(args || {});
    const db = getDB();
    const userId = getCurrentUserId();

    // 1. 사용자 정보 조회
    const userObjectId = toSafeObjectId(userId);
    const user = userObjectId
      ? await db.collection('users').findOne({ _id: userObjectId })
      : await db.collection('users').findOne({ _id: userId as unknown as ObjectId });

    if (!user) {
      return {
        isError: true,
        content: [{
          type: 'text' as const,
          text: '사용자 정보를 찾을 수 없습니다.'
        }]
      };
    }

    // 2. 티어 정의 조회
    const settingsCollection = db.collection('settings');
    const tierSettings = await settingsCollection.findOne({ key: 'tier_definitions' });
    const tierDefinitions = tierSettings?.tiers || DEFAULT_TIER_DEFINITIONS;

    // 3. 사용자 티어 정보
    const tierName = user?.tier?.tier_id || user?.storage?.tier || DEFAULT_TIER;
    const tierDef = tierDefinitions[tierName] || tierDefinitions[DEFAULT_TIER];
    const creditQuota = tierDef.credit_quota ?? 2000;
    const isUnlimited = creditQuota === -1;

    // 4. 사이클 계산 (가입일 기반 월간 사이클)
    const subscriptionStartDate = user?.tier?.start_date || user?.createdAt || new Date();
    const cycle = calculateCreditCycle(new Date(subscriptionStartDate));

    // 5. OCR 크레딧 사용량 계산
    const ocrUsage = await calculateOcrCredits(db, userId, cycle.cycleStart, cycle.cycleEnd);

    // 6. AI 크레딧 사용량 계산 (aims_analytics DB에서 조회)
    const aiUsage = await calculateAiCredits(db, userId, cycle.cycleStart, cycle.cycleEnd);

    // 7. 총 크레딧 계산
    const totalCreditsUsed = Math.round((ocrUsage.credits + aiUsage.credits) * 100) / 100;
    const creditsRemaining = isUnlimited ? -1 : Math.max(0, creditQuota - totalCreditsUsed);
    const usagePercent = isUnlimited ? 0 : Math.round((totalCreditsUsed / creditQuota) * 100 * 100) / 100;

    // 8. 날짜 포맷팅 (MM/DD 형식)
    const formatDateShort = (date: Date) => {
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${month}/${day}`;
    };

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          tier: tierName,
          tierName: tierDef.name,
          creditQuota: isUnlimited ? '무제한' : creditQuota,
          creditsUsed: totalCreditsUsed,
          creditsRemaining: isUnlimited ? '무제한' : creditsRemaining,
          usagePercent: isUnlimited ? 0 : usagePercent,
          usagePercentDisplay: isUnlimited ? '무제한' : `${usagePercent}%`,
          breakdown: {
            ocr: {
              pages: ocrUsage.pages,
              credits: ocrUsage.credits,
              description: `OCR ${ocrUsage.pages}페이지 = ${ocrUsage.credits}C`
            },
            ai: {
              tokens: aiUsage.tokens,
              credits: aiUsage.credits,
              description: `AI ${Math.round(aiUsage.tokens / 1000)}K토큰 = ${aiUsage.credits}C`
            }
          },
          cycle: {
            start: formatDateShort(cycle.cycleStart),
            end: formatDateShort(cycle.cycleEnd),
            daysUntilReset: cycle.daysUntilReset
          },
          summary: isUnlimited
            ? `무제한 크레딧 (${tierDef.name})`
            : `크레딧: ${totalCreditsUsed.toFixed(2)} / ${creditQuota} (${usagePercent}%) ~${formatDateShort(cycle.cycleEnd)}`,
          message: isUnlimited
            ? '무제한 크레딧입니다.'
            : usagePercent >= 90
              ? `⚠️ 크레딧 사용량이 ${usagePercent}%입니다. ${cycle.daysUntilReset}일 후 리셋됩니다.`
              : `크레딧 ${usagePercent}% 사용 중. ${cycle.daysUntilReset}일 후 리셋됩니다.`
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] get_credit_info 에러:', error);
    sendErrorLog('aims_mcp', 'get_credit_info 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `크레딧 정보 조회 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * 크레딧 사이클 계산 (가입일 기준 월간 사이클)
 */
function calculateCreditCycle(subscriptionStartDate: Date): { cycleStart: Date; cycleEnd: Date; daysUntilReset: number } {
  const now = new Date();
  const KST_OFFSET = 9 * 60 * 60 * 1000;

  // KST 기준으로 변환
  const nowKST = new Date(now.getTime() + KST_OFFSET);
  const startKST = new Date(subscriptionStartDate.getTime() + KST_OFFSET);

  // 가입일의 일(day) 추출
  const subscriptionDay = startKST.getUTCDate();

  // 현재 날짜 기준 사이클 시작/종료 계산
  let cycleStartYear = nowKST.getUTCFullYear();
  let cycleStartMonth = nowKST.getUTCMonth();

  // 현재 일이 가입일보다 작으면 이전 달이 사이클 시작
  if (nowKST.getUTCDate() < subscriptionDay) {
    cycleStartMonth--;
    if (cycleStartMonth < 0) {
      cycleStartMonth = 11;
      cycleStartYear--;
    }
  }

  // 사이클 시작일 (해당 월의 가입일 또는 말일)
  const lastDayOfMonth = new Date(Date.UTC(cycleStartYear, cycleStartMonth + 1, 0)).getUTCDate();
  const actualStartDay = Math.min(subscriptionDay, lastDayOfMonth);
  const cycleStart = new Date(Date.UTC(cycleStartYear, cycleStartMonth, actualStartDay, 0, 0, 0, 0) - KST_OFFSET);

  // 사이클 종료일 (다음 달 가입일 전날)
  let cycleEndYear = cycleStartYear;
  let cycleEndMonth = cycleStartMonth + 1;
  if (cycleEndMonth > 11) {
    cycleEndMonth = 0;
    cycleEndYear++;
  }
  const lastDayOfEndMonth = new Date(Date.UTC(cycleEndYear, cycleEndMonth + 1, 0)).getUTCDate();
  const actualEndDay = Math.min(subscriptionDay, lastDayOfEndMonth) - 1;
  const cycleEnd = new Date(Date.UTC(cycleEndYear, cycleEndMonth, actualEndDay, 23, 59, 59, 999) - KST_OFFSET);

  // 리셋까지 남은 일수
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntilReset = Math.ceil((cycleEnd.getTime() - now.getTime()) / msPerDay);

  return {
    cycleStart,
    cycleEnd,
    daysUntilReset: Math.max(0, daysUntilReset)
  };
}

/**
 * OCR 크레딧 사용량 계산
 */
async function calculateOcrCredits(_db: ReturnType<typeof getDB>, userId: string, cycleStart: Date, cycleEnd: Date): Promise<{ pages: number; credits: number }> {
  const cycleStartISO = cycleStart.toISOString();
  const cycleEndISO = cycleEnd.toISOString();

  // Internal API 경유: Date는 JSON 직렬화 시 ISO 문자열로 변환됨
  const result = await aggregateFiles([
    {
      $match: {
        ownerId: userId,
        'ocr.status': 'done',
        $or: [
          { 'ocr.done_at': { $gte: cycleStartISO, $lte: cycleEndISO } }
        ]
      }
    },
    {
      $group: {
        _id: null,
        total_pages: { $sum: { $ifNull: ['$ocr.page_count', 1] } }
      }
    }
  ]);

  const pages = result.length > 0 ? (result[0] as { total_pages: number }).total_pages : 0;
  return {
    pages,
    credits: pages * 2  // OCR 1페이지 = 2 크레딧
  };
}

/**
 * AI 크레딧 사용량 계산
 */
async function calculateAiCredits(db: ReturnType<typeof getDB>, userId: string, cycleStart: Date, cycleEnd: Date): Promise<{ tokens: number; credits: number }> {
  // aims_analytics DB의 ai_token_usage 컬렉션 조회
  // MCP에서는 docupload DB만 접근 가능하므로,
  // ai_token_usage는 별도의 컬렉션이 아닌 files 내 메타데이터로 추적하거나
  // aims_api의 internal API를 호출해야 함
  // 여기서는 간단히 0으로 반환하고, 추후 API 연동 시 수정

  // TODO: aims_analytics DB 연동 또는 internal API 호출로 대체
  // 임시로 docupload의 chat_sessions에서 토큰 사용량 추정
  try {
    const chatSessions = db.collection('chat_sessions');
    const result = await chatSessions.aggregate([
      {
        $match: {
          userId: userId,
          updatedAt: { $gte: cycleStart, $lte: cycleEnd }
        }
      },
      {
        $project: {
          totalTokens: {
            $sum: {
              $map: {
                input: { $ifNull: ['$messages', []] },
                as: 'msg',
                in: { $ifNull: ['$$msg.tokenCount', 0] }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          tokens: { $sum: '$totalTokens' }
        }
      }
    ]).toArray();

    const tokens = result.length > 0 ? (result[0] as { tokens: number }).tokens : 0;
    return {
      tokens,
      credits: Math.round((tokens / 1000) * 0.5 * 100) / 100  // AI 1K 토큰 = 0.5 크레딧
    };
  } catch {
    // chat_sessions 컬렉션이 없거나 오류 시 0 반환
    return { tokens: 0, credits: 0 };
  }
}

/**
 * 고객명 중복 체크 핸들러
 */
export async function handleCheckCustomerName(args: unknown) {
  try {
    const params = checkCustomerNameSchema.parse(args);
    const userId = getCurrentUserId();

    const trimmedName = params.name.trim();

    // Internal API 경유: 대소문자 무시하여 중복 체크
    const results = await queryCustomers(
      {
        'meta.created_by': userId,
        'personal_info.name': { $regex: `^${escapeRegex(trimmedName)}$`, $options: 'i' }
      },
      { 'personal_info.name': 1, 'insurance_info.customer_type': 1, 'meta.status': 1 },
      null, 1
    );
    const existing = results[0] || null;

    if (existing) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            exists: true,
            name: trimmedName,
            existingCustomer: {
              id: (existing._id?.toString?.() || existing._id) as string,
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
