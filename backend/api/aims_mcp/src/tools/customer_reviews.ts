import { z, ZodError } from 'zod';
import { getDB, toSafeObjectId, COLLECTIONS, formatZodError } from '../db.js';
import { getCurrentUserId } from '../auth.js';
import { sendErrorLog } from '../systemLogger.js';

// ============================================================
// 스키마 정의
// ============================================================

export const getCustomerReviewsSchema = z.object({
  customerId: z.string().describe('고객 ID'),
  limit: z.number().optional().default(10).describe('결과 개수 제한 (기본: 10)')
});

export const getCrContractHistorySchema = z.object({
  customerId: z.string().describe('고객 ID'),
  policyNumber: z.string().optional().describe('증권번호 (선택) - 특정 계약만 조회'),
  fundName: z.string().optional().describe('특정 펀드 이력만 필터 (부분 매칭)'),
  field: z.enum(['accumulatedAmount', 'returnRate', 'surrenderValue']).optional().describe('추적 대상 필드만 표시 (응답 간소화)')
});

export const queryCustomerReviewsSchema = z.object({
  customerId: z.string().optional().describe('특정 고객 CRS만 조회'),
  returnRateMin: z.number().optional().describe('투자수익률 최소 (%)'),
  returnRateMax: z.number().optional().describe('투자수익률 최대 (%)'),
  accumulatedAmountMin: z.number().optional().describe('적립금 최소 (원)'),
  accumulatedAmountMax: z.number().optional().describe('적립금 최대 (원)'),
  surrenderRateMin: z.number().optional().describe('해지환급률 최소 (%)'),
  surrenderRateMax: z.number().optional().describe('해지환급률 최대 (%)'),
  hasPolicyLoan: z.boolean().optional().describe('약관대출 있는 건만 (true)'),
  hasWithdrawal: z.boolean().optional().describe('중도인출 있는 건만 (true)'),
  hasAdditionalPremium: z.boolean().optional().describe('추가납입 있는 건만 (true)'),
  fundName: z.string().optional().describe('특정 펀드 포함 건만 (부분 매칭)'),
  sortBy: z.enum(['accumulatedAmount', 'returnRate', 'surrenderValue']).optional().describe('정렬 기준'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc').describe('정렬 순서'),
});

// ============================================================
// Tool 정의
// ============================================================

export const customerReviewToolDefinitions = [
  {
    name: 'get_customer_reviews',
    description: '고객의 Customer Review(변액리포트/CRS) 목록을 조회합니다. 증권번호, 상품명, 적립금, 펀드 정보, 사망수익자, 담당 설계사, 적립율, 초회보험료, 월납보험료, 납입보험료 총액(순보험료), 보험계약대출, 중도인출, 추가납입, 펀드별 납입원금 등 변액보험 상세 정보를 확인할 수 있습니다. "납입보험료 총액", "순보험료", "보험계약대출" 등은 이 도구에서만 조회 가능합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '고객 ID' },
        limit: { type: 'number', description: '결과 개수 제한 (기본: 10)' }
      },
      required: ['customerId']
    }
  },
  {
    name: 'get_cr_contract_history',
    description: '고객의 변액보험 계약 이력 변화를 조회합니다. 증권번호별로 여러 CRS(변액리포트)에서 추출된 스냅샷을 시간순으로 집계하여 적립금, 투자수익률, 해지환급금 등의 변화를 추적합니다. "변액 이력 변화", "적립금 변화", "수익률 변화" 등을 물어볼 때 사용하세요. 특정 펀드 이력만 필터링하거나 특정 필드만 추적할 수 있습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '고객 ID' },
        policyNumber: { type: 'string', description: '증권번호 (선택) - 특정 계약만 조회' },
        fundName: { type: 'string', description: '특정 펀드 이력만 필터 (부분 매칭)' },
        field: { type: 'string', enum: ['accumulatedAmount', 'returnRate', 'surrenderValue'], description: '추적 대상 필드만 표시 (응답 간소화)' }
      },
      required: ['customerId']
    }
  },
  {
    name: 'query_customer_reviews',
    description: `변액보험(CRS) 데이터를 조건부로 필터링/정렬/집계합니다.

⚠️ customerId는 선택사항! 생략하면 전체 고객 대상으로 조회합니다.
- "약관대출 있는 고객 있어?" → customerId 없이 hasPolicyLoan=true
- "수익률 100% 이상 변액보험" → returnRateMin=100
- "적립금 가장 많은 변액보험" → sortBy="accumulatedAmount", sortOrder="desc"
- "수익률 마이너스 변액보험" → returnRateMax=0
- "중도인출한 변액보험" → hasWithdrawal=true
- "전체 적립금 합계" → 파라미터 없이 호출, summary.totalAccumulated 확인

응답 summary: totalAccumulated(적립금 합계), avgReturnRate(평균 수익률), totalPolicyLoan(총 약관대출), bestReturnRate, worstReturnRate
단순 현황 조회는 get_customer_reviews를 사용하세요.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '특정 고객 CRS만 조회' },
        returnRateMin: { type: 'number', description: '투자수익률 최소 (%)' },
        returnRateMax: { type: 'number', description: '투자수익률 최대 (%)' },
        accumulatedAmountMin: { type: 'number', description: '적립금 최소 (원)' },
        accumulatedAmountMax: { type: 'number', description: '적립금 최대 (원)' },
        surrenderRateMin: { type: 'number', description: '해지환급률 최소 (%)' },
        surrenderRateMax: { type: 'number', description: '해지환급률 최대 (%)' },
        hasPolicyLoan: { type: 'boolean', description: '약관대출 있는 건만 (true)' },
        hasWithdrawal: { type: 'boolean', description: '중도인출 있는 건만 (true)' },
        hasAdditionalPremium: { type: 'boolean', description: '추가납입 있는 건만 (true)' },
        fundName: { type: 'string', description: '특정 펀드 포함 건만 (부분 매칭)' },
        sortBy: { type: 'string', enum: ['accumulatedAmount', 'returnRate', 'surrenderValue'], description: '정렬 기준' },
        sortOrder: { type: 'string', enum: ['asc', 'desc'], description: '정렬 순서 (기본: desc)' }
      },
      required: []
    }
  }
];

/**
 * Customer Reviews 조회 핸들러
 */
export async function handleGetCustomerReviews(args: unknown) {
  try {
    const params = getCustomerReviewsSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    const objectId = toSafeObjectId(params.customerId);
    if (!objectId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '유효하지 않은 고객 ID입니다.' }]
      };
    }

    // 고객이 해당 설계사의 고객인지 확인
    const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
      _id: objectId,
      'meta.created_by': userId
    });

    if (!customer) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '고객을 찾을 수 없습니다.' }]
      };
    }

    const customerName = customer.personal_info?.name || '알 수 없음';

    // customer_reviews 배열에서 조회 (최신순)
    const customerReviews = customer.customer_reviews || [];

    // 최신순 정렬 및 limit 적용
    const sortedReviews = customerReviews
      .sort((a: any, b: any) => {
        const dateA = new Date(a.parsed_at || a.issue_date || 0);
        const dateB = new Date(b.parsed_at || b.issue_date || 0);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, params.limit);

    // 요약 정보 생성
    const formattedReviews = sortedReviews.map((review: any, index: number) => {
      const contractInfo = review.contract_info || {};
      const premiumInfo = review.premium_info || {};
      const fundAllocations = review.fund_allocations || [];

      return {
        index,
        // 메타 정보
        productName: review.product_name || '-',
        contractorName: review.contractor_name || '-',  // 계약자
        insuredName: review.insured_name || '-',        // 피보험자
        deathBeneficiary: review.death_beneficiary || '-', // 사망수익자
        fsrName: review.fsr_name || '-',                   // 담당 설계사
        issueDate: review.issue_date,
        parsedAt: review.parsed_at,
        status: review.status || 'completed',

        // 계약 정보
        policyNumber: contractInfo.policy_number || '-',
        contractDate: contractInfo.contract_date,
        insuredAmount: contractInfo.insured_amount || 0,
        accumulatedAmount: contractInfo.accumulated_amount || 0,
        investmentReturnRate: contractInfo.investment_return_rate || 0,
        surrenderValue: contractInfo.surrender_value || 0,
        surrenderRate: contractInfo.surrender_rate || 0,
        accumulationRate: contractInfo.accumulation_rate || 0,   // 적립율
        initialPremium: contractInfo.initial_premium || 0,       // 초회보험료
        monthlyPremium: contractInfo.monthly_premium || 0,       // 월납보험료

        // 납입원금 정보
        basicPremium: premiumInfo.basic_premium || 0,
        additionalPremium: premiumInfo.additional_premium || 0,
        netPremium: premiumInfo.net_premium || 0,
        policyLoan: premiumInfo.policy_loan || 0,

        // 펀드 정보 요약
        fundCount: fundAllocations.length,
        totalAccumulated: review.total_accumulated_amount || 0,
        funds: fundAllocations.slice(0, 5).map((f: any) => ({
          fundName: f.fund_name,
          basicAccumulated: f.basic_accumulated || 0,
          allocationRatio: f.allocation_ratio || 0,
          returnRate: f.return_rate || 0,
          investedPrincipal: f.invested_principal || 0  // 납입원금
        })),

        sourceFileId: review.source_file_id?.toString()
      };
    });

    // 총 적립금 합계
    const totalAccumulatedSum = formattedReviews.reduce(
      (sum: number, r: any) => sum + (r.accumulatedAmount || 0), 0
    );

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          customerId: params.customerId,
          customerName,
          totalReviews: customerReviews.length,
          count: formattedReviews.length,
          totalAccumulatedSum,
          reviews: formattedReviews,
          message: customerReviews.length > 0
            ? `${customerName}님의 고객리뷰 ${customerReviews.length}건 중 ${formattedReviews.length}건을 조회했습니다. (총 적립금: ${totalAccumulatedSum.toLocaleString()}원)`
            : `${customerName}님의 고객리뷰가 없습니다.`
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] get_customer_reviews 에러:', error);
    sendErrorLog('aims_mcp', 'get_customer_reviews 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `고객리뷰 조회 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * CRS 계약 이력 조회 핸들러
 * 증권번호별로 여러 CRS에서 추출된 스냅샷을 시간순으로 집계
 */
export async function handleGetCrContractHistory(args: unknown) {
  try {
    const params = getCrContractHistorySchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    const objectId = toSafeObjectId(params.customerId);
    if (!objectId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '유효하지 않은 고객 ID입니다.' }]
      };
    }

    // 고객이 해당 설계사의 고객인지 확인
    const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
      _id: objectId,
      'meta.created_by': userId
    });

    if (!customer) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '고객을 찾을 수 없습니다.' }]
      };
    }

    const customerName = customer.personal_info?.name || '알 수 없음';
    const customerReviews = customer.customer_reviews || [];

    // 발행일별 CRS 문서 정보 수집 (중복 제거)
    const crsDocumentsMap = new Map<string, {
      issueDate: string;
      sourceFileId: string;
      fileName?: string;
    }>();

    // 증권번호별로 스냅샷 집계
    const historyMap = new Map<string, {
      policyNumber: string;
      productName: string;
      contractorName: string;
      contractDate: string;
      snapshots: any[];
    }>();

    for (const review of customerReviews) {
      const contractInfo = review.contract_info || {};
      const policyNumber = contractInfo.policy_number;
      const issueDate = review.issue_date;
      const sourceFileId = review.source_file_id?.toString();

      // 발행일별 CRS 문서 정보 저장
      // Date 객체인 경우 YYYY.MM.DD 형식으로 변환
      let issueDateStr: string;
      if (typeof issueDate === 'string') {
        issueDateStr = issueDate;
      } else if (issueDate instanceof Date) {
        const y = issueDate.getFullYear();
        const m = String(issueDate.getMonth() + 1).padStart(2, '0');
        const d = String(issueDate.getDate()).padStart(2, '0');
        issueDateStr = `${y}.${m}.${d}`;
      } else if (issueDate) {
        // Date-like object (MongoDB Date 등)
        const dateObj = new Date(issueDate);
        if (!isNaN(dateObj.getTime())) {
          const y = dateObj.getFullYear();
          const m = String(dateObj.getMonth() + 1).padStart(2, '0');
          const d = String(dateObj.getDate()).padStart(2, '0');
          issueDateStr = `${y}.${m}.${d}`;
        } else {
          issueDateStr = '';
        }
      } else {
        issueDateStr = '';
      }

      if (issueDateStr && sourceFileId && !crsDocumentsMap.has(issueDateStr)) {
        crsDocumentsMap.set(issueDateStr, {
          issueDate: issueDateStr,
          sourceFileId,
          fileName: review.source_file_name || `CRS_${customerName}_${issueDateStr.replace(/\./g, '')}.pdf`
        });
      }

      if (!policyNumber) continue;

      // 특정 증권번호 필터링
      if (params.policyNumber && policyNumber !== params.policyNumber) continue;

      // fundName 필터: 해당 펀드를 포함하는 CRS만 표시
      const fundAllocations = review.fund_allocations || [];
      if (params.fundName) {
        const matchedFunds = fundAllocations.filter((f: any) =>
          f.fund_name && f.fund_name.includes(params.fundName!)
        );
        if (matchedFunds.length === 0) continue;
      }

      // 기본 스냅샷 생성
      const fullSnapshot: Record<string, any> = {
        issueDate,
        parsedAt: review.parsed_at,
        insuredAmount: contractInfo.insured_amount || 0,
        accumulatedAmount: contractInfo.accumulated_amount || 0,
        investmentReturnRate: contractInfo.investment_return_rate || 0,
        surrenderValue: contractInfo.surrender_value || 0,
        surrenderRate: contractInfo.surrender_rate || 0,
        sourceFileId
      };

      // fundName이 지정된 경우 해당 펀드 정보 추가
      if (params.fundName) {
        const matchedFunds = fundAllocations.filter((f: any) =>
          f.fund_name && f.fund_name.includes(params.fundName!)
        );
        fullSnapshot.filteredFunds = matchedFunds.map((f: any) => ({
          fundName: f.fund_name,
          basicAccumulated: f.basic_accumulated || 0,
          allocationRatio: f.allocation_ratio || 0,
          returnRate: f.return_rate || 0,
          investedPrincipal: f.invested_principal || 0
        }));
      }

      // field가 지정된 경우 해당 필드만 선택 반환
      const fieldMap: Record<string, string> = {
        accumulatedAmount: 'accumulatedAmount',
        returnRate: 'investmentReturnRate',
        surrenderValue: 'surrenderValue'
      };

      let snapshot: Record<string, any>;
      if (params.field) {
        const targetField = fieldMap[params.field];
        snapshot = {
          issueDate: fullSnapshot.issueDate,
          [params.field]: fullSnapshot[targetField],
          sourceFileId: fullSnapshot.sourceFileId
        };
        if (fullSnapshot.filteredFunds) {
          snapshot.filteredFunds = fullSnapshot.filteredFunds;
        }
      } else {
        snapshot = fullSnapshot;
      }

      if (!historyMap.has(policyNumber)) {
        historyMap.set(policyNumber, {
          policyNumber,
          productName: review.product_name || '-',
          contractorName: review.contractor_name || '-',
          contractDate: contractInfo.contract_date || '-',
          snapshots: []
        });
      }

      historyMap.get(policyNumber)!.snapshots.push(snapshot);
    }

    // 스냅샷을 발행일 기준 정렬
    const contractHistories = Array.from(historyMap.values()).map(history => {
      const sortedSnapshots = history.snapshots.sort((a, b) => {
        const dateA = new Date(a.issueDate || 0);
        const dateB = new Date(b.issueDate || 0);
        return dateA.getTime() - dateB.getTime();
      });

      return {
        ...history,
        snapshotCount: sortedSnapshots.length,
        snapshots: sortedSnapshots,
        latestSnapshot: sortedSnapshots[sortedSnapshots.length - 1] || null
      };
    });

    // 최신 스냅샷 기준으로 정렬
    contractHistories.sort((a, b) => {
      const dateA = new Date(a.latestSnapshot?.issueDate || 0);
      const dateB = new Date(b.latestSnapshot?.issueDate || 0);
      return dateB.getTime() - dateA.getTime();
    });

    // 발행일별 CRS 문서 목록 (최신순 정렬)
    const crsDocuments = Array.from(crsDocumentsMap.values()).sort((a, b) => {
      const dateA = new Date(a.issueDate || 0);
      const dateB = new Date(b.issueDate || 0);
      return dateB.getTime() - dateA.getTime();
    });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          customerId: params.customerId,
          customerName,
          // 발행일별 CRS 문서 목록 (맨 위에 링크로 표시용)
          crsDocuments,
          totalContracts: contractHistories.length,
          crContractHistories: contractHistories,
          message: contractHistories.length > 0
            ? `${customerName}님의 변액보험 계약 이력 ${contractHistories.length}건을 조회했습니다.`
            : `${customerName}님의 변액보험 계약 이력이 없습니다.`
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] get_cr_contract_history 에러:', error);
    sendErrorLog('aims_mcp', 'get_cr_contract_history 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `CRS 계약 이력 조회 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * CRS 조건부 필터링/정렬/집계 핸들러
 * 설계사의 전체 또는 특정 고객의 CRS 데이터를 조건부로 조회합니다.
 */
export async function handleQueryCustomerReviews(args: unknown) {
  try {
    const params = queryCustomerReviewsSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    // 고객 목록 조회: customerId가 있으면 해당 고객만, 없으면 전체 고객
    const query: any = { 'meta.created_by': userId, 'customer_reviews.0': { $exists: true } };
    if (params.customerId) {
      const objectId = toSafeObjectId(params.customerId);
      if (!objectId) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '유효하지 않은 고객 ID입니다.' }]
        };
      }
      query._id = objectId;
    }

    const customers = await db.collection(COLLECTIONS.CUSTOMERS)
      .find(query, { projection: { 'personal_info.name': 1, customer_reviews: 1 } })
      .toArray();

    // 각 고객의 최신 CRS에서 증권번호별 최신 리뷰 추출
    interface ReviewEntry {
      customerId: string;
      customerName: string;
      productName: string;
      policyNumber: string;
      contractorName: string;
      insuredName: string;
      deathBeneficiary: string;
      issueDate: any;
      accumulatedAmount: number;
      returnRate: number;
      surrenderValue: number;
      surrenderRate: number;
      netPremium: number;
      basicPremium: number;
      additionalPremium: number;
      policyLoan: number;
      funds: any[];
    }

    const allReviews: ReviewEntry[] = [];

    for (const customer of customers) {
      const customerName = customer.personal_info?.name || '알 수 없음';
      const reviews = customer.customer_reviews || [];

      // 증권번호별 최신 CRS만 사용 (issue_date 기준)
      const latestByPolicy = new Map<string, any>();
      for (const review of reviews) {
        const policyNumber = review.contract_info?.policy_number;
        if (!policyNumber) continue;

        const existing = latestByPolicy.get(policyNumber);
        if (!existing) {
          latestByPolicy.set(policyNumber, review);
        } else {
          const existingDate = new Date(existing.issue_date || 0).getTime();
          const newDate = new Date(review.issue_date || 0).getTime();
          if (newDate > existingDate) {
            latestByPolicy.set(policyNumber, review);
          }
        }
      }

      for (const [policyNumber, review] of latestByPolicy) {
        const contractInfo = review.contract_info || {};
        const premiumInfo = review.premium_info || {};
        const fundAllocations = review.fund_allocations || [];

        allReviews.push({
          customerId: customer._id.toString(),
          customerName,
          productName: review.product_name || '-',
          policyNumber,
          contractorName: review.contractor_name || '-',
          insuredName: review.insured_name || '-',
          deathBeneficiary: review.death_beneficiary || '-',
          issueDate: review.issue_date,
          accumulatedAmount: contractInfo.accumulated_amount || 0,
          returnRate: contractInfo.investment_return_rate || 0,
          surrenderValue: contractInfo.surrender_value || 0,
          surrenderRate: contractInfo.surrender_rate || 0,
          netPremium: premiumInfo.net_premium || 0,
          basicPremium: premiumInfo.basic_premium || 0,
          additionalPremium: premiumInfo.additional_premium || 0,
          policyLoan: premiumInfo.policy_loan || 0,
          funds: fundAllocations.map((f: any) => ({
            fundName: f.fund_name,
            basicAccumulated: f.basic_accumulated || 0,
            allocationRatio: f.allocation_ratio || 0,
            returnRate: f.return_rate || 0,
            investedPrincipal: f.invested_principal || 0
          }))
        });
      }
    }

    const totalCount = allReviews.length;

    // 필터링 적용
    let filtered = allReviews;

    if (params.returnRateMin !== undefined) {
      filtered = filtered.filter(r => r.returnRate >= params.returnRateMin!);
    }
    if (params.returnRateMax !== undefined) {
      filtered = filtered.filter(r => r.returnRate <= params.returnRateMax!);
    }
    if (params.accumulatedAmountMin !== undefined) {
      filtered = filtered.filter(r => r.accumulatedAmount >= params.accumulatedAmountMin!);
    }
    if (params.accumulatedAmountMax !== undefined) {
      filtered = filtered.filter(r => r.accumulatedAmount <= params.accumulatedAmountMax!);
    }
    if (params.surrenderRateMin !== undefined) {
      filtered = filtered.filter(r => r.surrenderRate >= params.surrenderRateMin!);
    }
    if (params.surrenderRateMax !== undefined) {
      filtered = filtered.filter(r => r.surrenderRate <= params.surrenderRateMax!);
    }
    if (params.hasPolicyLoan === true) {
      filtered = filtered.filter(r => r.policyLoan > 0);
    }
    if (params.hasWithdrawal === true) {
      // 중도인출: 기본납입보험료보다 순보험료가 적은 경우 (인출이 있었음을 의미)
      filtered = filtered.filter(r => r.basicPremium > 0 && r.netPremium < r.basicPremium);
    }
    if (params.hasAdditionalPremium === true) {
      filtered = filtered.filter(r => r.additionalPremium > 0);
    }
    if (params.fundName) {
      const fundNameFilter = params.fundName;
      filtered = filtered.filter(r =>
        r.funds.some((f: any) => f.fundName && f.fundName.includes(fundNameFilter))
      );
    }

    // 정렬
    if (params.sortBy) {
      const sortKey = params.sortBy as keyof ReviewEntry;
      const order = params.sortOrder === 'asc' ? 1 : -1;
      filtered.sort((a, b) => {
        const valA = (a[sortKey] as number) || 0;
        const valB = (b[sortKey] as number) || 0;
        return (valA - valB) * order;
      });
    } else {
      // 기본 정렬: 적립금 내림차순
      filtered.sort((a, b) => b.accumulatedAmount - a.accumulatedAmount);
    }

    // summary 계산
    const totalAccumulated = filtered.reduce((sum, r) => sum + r.accumulatedAmount, 0);
    const avgReturnRate = filtered.length > 0
      ? filtered.reduce((sum, r) => sum + r.returnRate, 0) / filtered.length
      : 0;
    const totalPolicyLoan = filtered.reduce((sum, r) => sum + r.policyLoan, 0);
    const totalNetPremium = filtered.reduce((sum, r) => sum + r.netPremium, 0);

    // 최고/최저 수익률
    let bestReturnRate: { productName: string; returnRate: number } | null = null;
    let worstReturnRate: { productName: string; returnRate: number } | null = null;
    if (filtered.length > 0) {
      const sorted = [...filtered].sort((a, b) => b.returnRate - a.returnRate);
      bestReturnRate = { productName: sorted[0].productName, returnRate: sorted[0].returnRate };
      worstReturnRate = { productName: sorted[sorted.length - 1].productName, returnRate: sorted[sorted.length - 1].returnRate };
    }

    // 원금 대비 적립금 비율
    const principalVsAccumulated = totalNetPremium > 0
      ? Math.round((totalAccumulated / totalNetPremium) * 10000) / 100
      : 0;

    const summary = {
      totalAccumulated,
      avgReturnRate: Math.round(avgReturnRate * 100) / 100,
      totalPolicyLoan,
      bestReturnRate,
      worstReturnRate,
      principalVsAccumulated
    };

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          count: filtered.length,
          totalCount,
          summary,
          reviews: filtered,
          message: `총 ${totalCount}건 중 ${filtered.length}건이 조건에 부합합니다. (총 적립금: ${totalAccumulated.toLocaleString()}원, 평균 수익률: ${summary.avgReturnRate}%)`
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] query_customer_reviews 에러:', error);
    sendErrorLog('aims_mcp', 'query_customer_reviews 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `CRS 조건부 조회 실패: ${errorMessage}`
      }]
    };
  }
}
