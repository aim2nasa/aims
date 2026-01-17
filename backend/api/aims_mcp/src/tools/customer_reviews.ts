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

export const getCrParsingStatusSchema = z.object({
  fileId: z.string().optional().describe('특정 문서 ID (선택)'),
  customerId: z.string().optional().describe('고객 ID (선택) - 해당 고객의 모든 CRS 상태')
});

export const triggerCrParsingSchema = z.object({
  fileId: z.string().optional().describe('파싱할 문서 ID (선택)'),
  customerId: z.string().optional().describe('고객 ID (선택) - 해당 고객의 모든 pending CRS 파싱')
});

export const getCrQueueStatusSchema = z.object({
  limit: z.number().optional().default(20).describe('결과 개수 제한')
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
    name: 'get_cr_parsing_status',
    description: 'Customer Review(변액리포트) 파싱 상태를 조회합니다. 특정 문서나 고객의 CRS 파싱 진행 상황을 확인합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        fileId: { type: 'string', description: '특정 문서 ID (선택)' },
        customerId: { type: 'string', description: '고객 ID (선택)' }
      }
    }
  },
  {
    name: 'trigger_cr_parsing',
    description: 'Customer Review(변액리포트) 파싱을 요청합니다. 문서가 파싱 대기 상태로 변경되며, 백그라운드에서 처리됩니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        fileId: { type: 'string', description: '파싱할 문서 ID (선택)' },
        customerId: { type: 'string', description: '고객 ID (선택) - 해당 고객의 모든 pending CRS 파싱' }
      }
    }
  },
  {
    name: 'get_cr_queue_status',
    description: 'Customer Review(변액리포트) 파싱 대기 상태를 조회합니다. 대기 중, 처리 중, 실패한 작업을 확인합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: '결과 개수 제한 (기본: 20)' }
      }
    }
  },
  {
    name: 'get_cr_contract_history',
    description: '고객의 변액보험 계약 이력을 조회합니다. 증권번호별로 여러 CRS에서 추출된 스냅샷을 시간순으로 집계하여 적립금, 투자수익률 변화를 추적합니다.',
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
 * CRS 파싱 상태 조회 핸들러
 */
export async function handleGetCrParsingStatus(args: unknown) {
  try {
    const params = getCrParsingStatusSchema.parse(args || {});
    const db = getDB();
    const userId = getCurrentUserId();

    if (!params.fileId && !params.customerId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: 'fileId 또는 customerId 중 하나를 지정해주세요.' }]
      };
    }

    const results: any[] = [];

    if (params.fileId) {
      // 특정 파일의 상태 조회
      const fileObjectId = toSafeObjectId(params.fileId);
      if (!fileObjectId) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '유효하지 않은 문서 ID입니다.' }]
        };
      }

      const file = await db.collection(COLLECTIONS.FILES).findOne({
        _id: fileObjectId,
        ownerId: userId
      });

      if (!file) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '문서를 찾을 수 없습니다.' }]
        };
      }

      results.push({
        fileId: params.fileId,
        filename: file.upload?.originalName,
        isCustomerReview: file.is_customer_review || false,
        parsingStatus: file.cr_parsing_status || 'not_started',
        parsingError: file.cr_parsing_error,
        retryCount: file.cr_retry_count || 0,
        uploadedAt: file.upload?.uploaded_at
      });
    }

    if (params.customerId) {
      // 고객의 모든 CRS 문서 상태 조회
      const customerObjectId = toSafeObjectId(params.customerId);
      if (!customerObjectId) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '유효하지 않은 고객 ID입니다.' }]
        };
      }

      // 고객 소유권 확인
      const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
        _id: customerObjectId,
        'meta.created_by': userId
      });

      if (!customer) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '고객을 찾을 수 없습니다.' }]
        };
      }

      // 해당 고객의 CRS 문서들 조회
      const crFiles = await db.collection(COLLECTIONS.FILES)
        .find({
          customerId: customerObjectId,
          is_customer_review: true,
          ownerId: userId
        })
        .sort({ 'upload.uploaded_at': -1 })
        .limit(20)
        .toArray();

      for (const file of crFiles) {
        results.push({
          fileId: file._id.toString(),
          filename: file.upload?.originalName,
          parsingStatus: file.cr_parsing_status || 'not_started',
          parsingError: file.cr_parsing_error,
          retryCount: file.cr_retry_count || 0,
          uploadedAt: file.upload?.uploaded_at
        });
      }
    }

    // 상태별 통계
    const stats = {
      total: results.length,
      completed: results.filter(r => r.parsingStatus === 'completed').length,
      pending: results.filter(r => r.parsingStatus === 'pending' || r.parsingStatus === 'not_started').length,
      processing: results.filter(r => r.parsingStatus === 'processing').length,
      error: results.filter(r => r.parsingStatus === 'error').length
    };

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          stats,
          documents: results,
          message: `CRS 파싱 상태: 완료 ${stats.completed}건, 대기 ${stats.pending}건, 처리중 ${stats.processing}건, 오류 ${stats.error}건`
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] get_cr_parsing_status 에러:', error);
    sendErrorLog('aims_mcp', 'get_cr_parsing_status 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `CRS 파싱 상태 조회 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * CRS 파싱 트리거 핸들러
 */
export async function handleTriggerCrParsing(args: unknown) {
  try {
    const params = triggerCrParsingSchema.parse(args || {});
    const db = getDB();
    const userId = getCurrentUserId();

    if (!params.fileId && !params.customerId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: 'fileId 또는 customerId 중 하나를 지정해주세요.' }]
      };
    }

    let triggeredCount = 0;
    let skippedCount = 0;
    const triggeredFiles: string[] = [];

    if (params.fileId) {
      // 특정 파일 파싱 요청
      const fileObjectId = toSafeObjectId(params.fileId);
      if (!fileObjectId) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '유효하지 않은 문서 ID입니다.' }]
        };
      }

      const file = await db.collection(COLLECTIONS.FILES).findOne({
        _id: fileObjectId,
        ownerId: userId
      });

      if (!file) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '문서를 찾을 수 없습니다.' }]
        };
      }

      if (!file.is_customer_review) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '이 문서는 Customer Review가 아닙니다.' }]
        };
      }

      // 이미 완료된 경우 스킵
      if (file.cr_parsing_status === 'completed') {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: '이 문서는 이미 파싱이 완료되었습니다.',
              triggeredCount: 0
            }, null, 2)
          }]
        };
      }

      // 이미 처리중인 경우
      if (file.cr_parsing_status === 'processing') {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: '이 문서는 현재 파싱 처리 중입니다.',
              triggeredCount: 0
            }, null, 2)
          }]
        };
      }

      // 파일 상태를 pending으로 업데이트
      await db.collection(COLLECTIONS.FILES).updateOne(
        { _id: fileObjectId },
        { $set: { cr_parsing_status: 'pending' } }
      );

      triggeredCount = 1;
      triggeredFiles.push(file.upload?.originalName || params.fileId);
    }

    if (params.customerId) {
      // 고객의 모든 pending/error CRS 파싱 요청
      const customerObjectId = toSafeObjectId(params.customerId);
      if (!customerObjectId) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '유효하지 않은 고객 ID입니다.' }]
        };
      }

      // 고객 소유권 확인
      const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
        _id: customerObjectId,
        'meta.created_by': userId
      });

      if (!customer) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '고객을 찾을 수 없습니다.' }]
        };
      }

      // pending/error 상태의 CRS 문서들 조회
      const pendingFiles = await db.collection(COLLECTIONS.FILES)
        .find({
          customerId: customerObjectId,
          is_customer_review: true,
          ownerId: userId,
          cr_parsing_status: { $in: ['pending', null, 'error', 'not_started'] }
        })
        .limit(20)
        .toArray();

      for (const file of pendingFiles) {
        // 이미 처리중이면 스킵
        if (file.cr_parsing_status === 'processing') {
          skippedCount++;
          continue;
        }

        // 파일 상태를 pending으로 업데이트
        await db.collection(COLLECTIONS.FILES).updateOne(
          { _id: file._id },
          { $set: { cr_parsing_status: 'pending' } }
        );

        triggeredCount++;
        triggeredFiles.push(file.upload?.originalName || file._id.toString());
      }
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          triggeredCount,
          skippedCount,
          triggeredFiles: triggeredFiles.slice(0, 10),
          message: triggeredCount > 0
            ? `${triggeredCount}건의 CRS 파싱이 요청되었습니다.`
            : '파싱 요청할 문서가 없습니다.'
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] trigger_cr_parsing 에러:', error);
    sendErrorLog('aims_mcp', 'trigger_cr_parsing 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `CRS 파싱 트리거 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * CRS 파싱 큐(파일) 상태 조회 핸들러
 */
export async function handleGetCrQueueStatus(args: unknown) {
  try {
    const params = getCrQueueStatusSchema.parse(args || {});
    const db = getDB();
    const userId = getCurrentUserId();

    // 전체 CRS 파일 통계 (해당 사용자의 파일만)
    const stats = {
      pending: await db.collection(COLLECTIONS.FILES).countDocuments({
        is_customer_review: true,
        ownerId: userId,
        cr_parsing_status: { $in: ['pending', 'not_started', null] }
      }),
      processing: await db.collection(COLLECTIONS.FILES).countDocuments({
        is_customer_review: true,
        ownerId: userId,
        cr_parsing_status: 'processing'
      }),
      completed: await db.collection(COLLECTIONS.FILES).countDocuments({
        is_customer_review: true,
        ownerId: userId,
        cr_parsing_status: 'completed'
      }),
      error: await db.collection(COLLECTIONS.FILES).countDocuments({
        is_customer_review: true,
        ownerId: userId,
        cr_parsing_status: 'error'
      })
    };

    // 해당 사용자의 CRS 파일들 (최근 업로드순)
    const crFiles = await db.collection(COLLECTIONS.FILES)
      .find({
        is_customer_review: true,
        ownerId: userId
      })
      .sort({ 'upload.uploaded_at': -1 })
      .limit(params.limit)
      .toArray();

    const formattedItems = crFiles.map((file: any) => ({
      fileId: file._id.toString(),
      filename: file.upload?.originalName,
      status: file.cr_parsing_status || 'not_started',
      retryCount: file.cr_retry_count || 0,
      error: file.cr_parsing_error,
      uploadedAt: file.upload?.uploaded_at
    }));

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          stats,
          files: formattedItems,
          count: formattedItems.length,
          message: `CRS 파일 상태: 대기 ${stats.pending}건, 처리중 ${stats.processing}건, 완료 ${stats.completed}건, 오류 ${stats.error}건`
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] get_cr_queue_status 에러:', error);
    sendErrorLog('aims_mcp', 'get_cr_queue_status 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `CRS 큐 상태 조회 실패: ${errorMessage}`
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

      if (!policyNumber) continue;

      // 특정 증권번호 필터링
      if (params.policyNumber && policyNumber !== params.policyNumber) continue;

      const snapshot = {
        issueDate: review.issue_date,
        parsedAt: review.parsed_at,
        insuredAmount: contractInfo.insured_amount || 0,
        accumulatedAmount: contractInfo.accumulated_amount || 0,
        investmentReturnRate: contractInfo.investment_return_rate || 0,
        surrenderValue: contractInfo.surrender_value || 0,
        surrenderRate: contractInfo.surrender_rate || 0,
        sourceFileId: review.source_file_id?.toString()
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

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          customerId: params.customerId,
          customerName,
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
