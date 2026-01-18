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
  policyNumber: z.string().optional().describe('증권번호 (선택) - 특정 계약만 조회')
});

// ============================================================
// Tool 정의
// ============================================================

export const customerReviewToolDefinitions = [
  {
    name: 'get_customer_reviews',
    description: '고객의 Customer Review(변액리포트/CRS) 목록을 조회합니다. 증권번호, 상품명, 적립금, 펀드 정보 등 변액보험 상세 정보를 확인할 수 있습니다.',
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
    description: '고객의 변액보험 계약 이력 변화를 조회합니다. 증권번호별로 여러 CRS(변액리포트)에서 추출된 스냅샷을 시간순으로 집계하여 적립금, 투자수익률, 해지환급금 등의 변화를 추적합니다. "변액 이력 변화", "적립금 변화", "수익률 변화" 등을 물어볼 때 사용하세요.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '고객 ID' },
        policyNumber: { type: 'string', description: '증권번호 (선택) - 특정 계약만 조회' }
      },
      required: ['customerId']
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
          returnRate: f.return_rate || 0
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

      const snapshot = {
        issueDate,
        parsedAt: review.parsed_at,
        insuredAmount: contractInfo.insured_amount || 0,
        accumulatedAmount: contractInfo.accumulated_amount || 0,
        investmentReturnRate: contractInfo.investment_return_rate || 0,
        surrenderValue: contractInfo.surrender_value || 0,
        surrenderRate: contractInfo.surrender_rate || 0,
        sourceFileId
      };

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
