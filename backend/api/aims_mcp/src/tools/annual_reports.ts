import { z, ZodError } from 'zod';
import { ObjectId } from 'mongodb';
import { getDB, toSafeObjectId, COLLECTIONS, formatZodError, filterExistingFileIds } from '../db.js';
import { getCurrentUserId } from '../auth.js';
import { sendErrorLog } from '../systemLogger.js';

// 스키마 정의
export const getAnnualReportsSchema = z.object({
  customerId: z.string().describe('고객 ID'),
  limit: z.number().optional().default(10).describe('결과 개수 제한 (기본: 10)')
});

export const getArContractHistorySchema = z.object({
  customerId: z.string().describe('고객 ID'),
  policyNumber: z.string().optional().describe('증권번호 (선택) - 특정 계약만 조회')
});

// Tool 정의
export const annualReportToolDefinitions = [
  {
    name: 'get_annual_reports',
    description: '고객의 Annual Report(연차보고서) 목록을 조회합니다. 계약 정보, 보험료, 발행일 등을 확인할 수 있습니다.',
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
    name: 'get_ar_contract_history',
    description: '고객의 보험 계약 이력 변화를 조회합니다. 증권번호별로 여러 Annual Report에서 추출된 스냅샷을 시간순으로 집계하여 보험료, 계약상태, 가입금액 등의 변화를 추적합니다. "계약 이력 변화", "보험료 변화", "계약 상태 변화" 등을 물어볼 때 사용하세요. (단순 계약 목록은 list_contracts 사용)',
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
 * Annual Reports 조회 핸들러
 */
export async function handleGetAnnualReports(args: unknown) {
  try {
    const params = getAnnualReportsSchema.parse(args);
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

    // annual_reports 배열에서 조회 (최신순)
    const annualReports = customer.annual_reports || [];

    // 최신순 정렬 및 limit 적용
    const sortedReports = annualReports
      .sort((a: any, b: any) => {
        const dateA = new Date(a.parsed_at || a.issue_date || 0);
        const dateB = new Date(b.parsed_at || b.issue_date || 0);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, params.limit);

    // sourceFileId 존재 검증 (고아 참조 방지)
    const allSourceFileIds = sortedReports
      .map((r: any) => r.source_file_id?.toString())
      .filter(Boolean) as string[];
    const existingFileIds = await filterExistingFileIds(allSourceFileIds);

    // 요약 정보 생성
    const formattedReports = sortedReports.map((report: any, index: number) => {
      const sfId = report.source_file_id?.toString();
      return {
      index,
      issueDate: report.issue_date,
      parsedAt: report.parsed_at,
      customerName: report.customer_name || customerName,
      totalContracts: report.contracts?.length || 0,
      totalMonthlyPremium: report.total_monthly_premium || 0,
      sourceFileId: sfId && existingFileIds.has(sfId) ? sfId : undefined,
      contracts: (report.contracts || []).slice(0, 5).map((c: any) => ({
        순번: c['순번'],
        보험상품: c['보험상품'],
        보험사: c['보험사'],
        계약자: c['계약자'],      // 소유주
        피보험자: c['피보험자'],
        월보험료: c['보험료(원)'] || c['월보험료'],
        계약상태: c['계약상태']
      }))
    };
    });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          customerId: params.customerId,
          customerName,
          totalReports: annualReports.length,
          count: formattedReports.length,
          reports: formattedReports,
          message: annualReports.length > 0
            ? `${customerName}님의 Annual Report ${annualReports.length}건 중 ${formattedReports.length}건을 조회했습니다.`
            : `${customerName}님의 Annual Report가 없습니다.`
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] get_annual_reports 에러:', error);
    sendErrorLog('aims_mcp', 'get_annual_reports 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `Annual Report 조회 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * AR 계약 이력 조회 핸들러
 * 증권번호별로 여러 Annual Report에서 추출된 스냅샷을 시간순으로 집계
 */
export async function handleGetArContractHistory(args: unknown) {
  try {
    const params = getArContractHistorySchema.parse(args);
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
    const annualReports = customer.annual_reports || [];

    // sourceFileId 존재 검증 (고아 참조 방지)
    const allSourceFileIds = annualReports
      .map((r: any) => r.source_file_id?.toString())
      .filter(Boolean) as string[];
    const existingFileIds = await filterExistingFileIds(allSourceFileIds);

    // 발행일별 AR 문서 정보 수집 (중복 제거)
    const arDocumentsMap = new Map<string, {
      issueDate: string;
      sourceFileId: string;
      fileName?: string;
    }>();

    // 증권번호별로 스냅샷 집계
    const historyMap = new Map<string, {
      policyNumber: string;
      productName: string;
      insurerName: string;
      holder: string;
      insured: string;
      snapshots: any[];
    }>();

    for (const report of annualReports) {
      const issueDate = report.issue_date;
      const parsedAt = report.parsed_at;
      const rawFileId = report.source_file_id?.toString();
      const sourceFileId = rawFileId && existingFileIds.has(rawFileId) ? rawFileId : undefined;
      const contracts = report.contracts || [];

      // 발행일별 AR 문서 정보 저장
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

      if (issueDateStr && sourceFileId && !arDocumentsMap.has(issueDateStr)) {
        arDocumentsMap.set(issueDateStr, {
          issueDate: issueDateStr,
          sourceFileId,
          fileName: report.source_file_name || `AR_${customerName}_${issueDateStr.replace(/\./g, '')}.pdf`
        });
      }

      for (const contract of contracts) {
        // 증권번호 추출 (다양한 필드명 대응)
        const policyNumber = contract['증권번호'] || contract.policy_number || contract.policyNumber;
        if (!policyNumber) continue;

        // 특정 증권번호 필터링
        if (params.policyNumber && policyNumber !== params.policyNumber) continue;

        const snapshot = {
          issueDate,
          parsedAt,
          productName: contract['보험상품'] || contract.product_name || '-',
          insurerName: contract['보험사'] || contract.insurer_name || '-',
          holder: contract['계약자'] || contract.holder || '-',
          insured: contract['피보험자'] || contract.insured || '-',
          contractDate: contract['계약일'] || contract.contract_date || '-',
          status: contract['계약상태'] || contract.status || '-',
          premium: contract['보험료(원)'] || contract['월보험료'] || contract.premium || 0,
          coverageAmount: contract['가입금액'] || contract.coverage_amount || 0,
          insurancePeriod: contract['보험기간'] || contract.insurance_period || '-',
          paymentPeriod: contract['납입기간'] || contract.payment_period || '-',
          sourceFileId
        };

        if (!historyMap.has(policyNumber)) {
          historyMap.set(policyNumber, {
            policyNumber,
            productName: snapshot.productName,
            insurerName: snapshot.insurerName,
            holder: snapshot.holder,
            insured: snapshot.insured,
            snapshots: []
          });
        }

        historyMap.get(policyNumber)!.snapshots.push(snapshot);
      }
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

    // 발행일별 AR 문서 목록 (최신순 정렬)
    const arDocuments = Array.from(arDocumentsMap.values()).sort((a, b) => {
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
          // 발행일별 AR 문서 목록 (맨 위에 링크로 표시용)
          arDocuments,
          totalContracts: contractHistories.length,
          contractHistories,
          message: contractHistories.length > 0
            ? `${customerName}님의 보험 계약 이력 ${contractHistories.length}건을 조회했습니다.`
            : `${customerName}님의 보험 계약 이력이 없습니다.`
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] get_ar_contract_history 에러:', error);
    sendErrorLog('aims_mcp', 'get_ar_contract_history 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `AR 계약 이력 조회 실패: ${errorMessage}`
      }]
    };
  }
}
