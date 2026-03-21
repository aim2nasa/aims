import { z, ZodError } from 'zod';
import { getDB, toSafeObjectId, COLLECTIONS, formatZodError } from '../db.js';
import { getCurrentUserId } from '../auth.js';
import { sendErrorLog } from '../systemLogger.js';

// ============================================================================
// 스키마 정의
// ============================================================================

export const listContractsSchema = z.object({
  customerId: z.string().optional().describe('특정 고객의 계약만 조회'),
  search: z.string().optional().describe('검색어 (고객명, 상품명, 증권번호)'),
  status: z.string().optional().describe('계약 상태 (정상, 실효 등)'),
  contractDateFrom: z.string().optional().describe('이 날짜 이후 계약만 조회 (YYYY-MM-DD)'),
  contractDateTo: z.string().optional().describe('이 날짜 이전 계약만 조회 (YYYY-MM-DD)'),
  sortBy: z.enum(['contractDate', 'premium']).optional().default('contractDate').describe('정렬 기준 (기본: contractDate)'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc').describe('정렬 순서 (기본: desc)'),
  limit: z.number().optional().default(10).describe('결과 개수 제한 (기본: 10, 최대: 50)'),
  offset: z.number().optional().default(0).describe('건너뛸 개수 (페이지네이션용)')
});

export const getContractDetailsSchema = z.object({
  policyNumber: z.string().describe('증권번호')
});

// ============================================================================
// Tool 정의
// ============================================================================

export const contractToolDefinitions = [
  {
    name: 'list_contracts',
    description: '계약 목록을 조회합니다. 계약 상태, 보험료, 보장 내용, 증권번호, 계약일, 상품명 등 계약 세부 정보가 필요할 때 사용합니다. Annual Report에서 파싱된 계약 정보를 반환합니다. 고객별, 상품별, 상태별, 계약일 범위로 필터링할 수 있고, 계약일 또는 보험료 기준 정렬이 가능합니다. 응답에 summary(총 보험료 합계, 전체/정상/실효 계약 수)가 포함됩니다. 이 도구는 구조화된 계약 데이터만 다루며, 문서/서류/파일을 찾거나 검색하는 용도에는 적합하지 않습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '특정 고객의 계약만 조회' },
        search: { type: 'string', description: '검색어 (고객명, 상품명, 증권번호)' },
        status: { type: 'string', description: '계약 상태 (정상, 실효 등)' },
        contractDateFrom: { type: 'string', description: '이 날짜 이후 계약만 조회 (YYYY-MM-DD)' },
        contractDateTo: { type: 'string', description: '이 날짜 이전 계약만 조회 (YYYY-MM-DD)' },
        sortBy: { type: 'string', enum: ['contractDate', 'premium'], description: '정렬 기준 (기본: contractDate)' },
        sortOrder: { type: 'string', enum: ['asc', 'desc'], description: '정렬 순서 (기본: desc)' },
        limit: { type: 'number', description: '결과 개수 제한 (기본: 10, 최대: 50)' },
        offset: { type: 'number', description: '건너뛸 개수 (페이지네이션용, 기본: 0)' }
      }
    }
  },
  {
    name: 'get_contract_details',
    description: '계약의 상세 정보를 조회합니다. 증권번호로 검색합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        policyNumber: { type: 'string', description: '증권번호' }
      },
      required: ['policyNumber']
    }
  }
  // Note: create_contract 제거 - 계약은 Annual Report 파싱으로만 생성됨
];

// ============================================================================
// 타입 정의
// ============================================================================

interface ARContract {
  '순번': number;
  '증권번호': string;
  '보험상품': string;
  '계약자': string;
  '피보험자': string;
  '계약일': string;
  '계약상태': string;
  '가입금액(만원)': number;
  '보험기간': string;
  '납입기간': string;
  '보험료(원)': number;
}

interface AnnualReport {
  customer_name: string;
  issue_date: string;
  contracts: ARContract[];
  lapsed_contracts?: ARContract[];
  total_monthly_premium?: number;
  total_contracts?: number;
  uploaded_at?: string;
  parsed_at?: string;
  source_file_id?: string;
}

interface NormalizedContract {
  customerId: string;
  customerName: string;
  policyNumber: string;
  productName: string;
  contractor: string;
  insured: string;
  contractDate: string;
  status: string;
  coverageAmount: number;
  insurancePeriod: string;
  paymentPeriod: string;
  premium: number;
  arIssueDate: string;
  arParsedAt?: string;
}

// ============================================================================
// 헬퍼 함수
// ============================================================================

/**
 * AR 계약 데이터를 정규화된 형식으로 변환
 */
function normalizeContract(
  contract: ARContract,
  customerId: string,
  customerName: string,
  arIssueDate: string,
  arParsedAt?: string
): NormalizedContract {
  return {
    customerId,
    customerName,
    policyNumber: contract['증권번호'] || '',
    productName: contract['보험상품'] || '',
    contractor: contract['계약자'] || '',
    insured: contract['피보험자'] || '',
    contractDate: contract['계약일'] || '',
    status: contract['계약상태'] || '',
    coverageAmount: contract['가입금액(만원)'] || 0,
    insurancePeriod: contract['보험기간'] || '',
    paymentPeriod: contract['납입기간'] || '',
    premium: contract['보험료(원)'] || 0,
    arIssueDate,
    arParsedAt
  };
}

/**
 * 검색어와 계약이 매칭되는지 확인
 */
function matchesSearch(contract: NormalizedContract, search: string): boolean {
  const searchLower = search.toLowerCase();
  return (
    contract.customerName.toLowerCase().includes(searchLower) ||
    contract.contractor.toLowerCase().includes(searchLower) ||
    contract.insured.toLowerCase().includes(searchLower) ||
    contract.productName.toLowerCase().includes(searchLower) ||
    contract.policyNumber.toLowerCase().includes(searchLower)
  );
}

// ============================================================================
// 핸들러 함수
// ============================================================================

/**
 * 계약 목록 조회 핸들러
 *
 * 데이터 소스: customers.annual_reports[].contracts
 * - Annual Report PDF 파싱 결과에서 계약 정보 조회
 * - 고객별, 검색어, 상태별 필터링 지원
 */
export async function handleListContracts(args: unknown) {
  try {
    const params = listContractsSchema.parse(args || {});
    const db = getDB();
    const userId = getCurrentUserId();

    // 쿼리 조건: 현재 설계사의 고객만 조회
    const customerQuery: Record<string, unknown> = {
      'meta.created_by': userId,
      'annual_reports': { $exists: true, $ne: [] }
    };

    // 특정 고객만 조회
    if (params.customerId) {
      const customerObjectId = toSafeObjectId(params.customerId);
      if (customerObjectId) {
        customerQuery['_id'] = customerObjectId;
      }
    }

    // 고객 목록 조회 (annual_reports 배열 포함)
    const customers = await db.collection(COLLECTIONS.CUSTOMERS)
      .find(customerQuery)
      .project({
        _id: 1,
        'personal_info.name': 1,
        'annual_reports': 1
      })
      .toArray();

    // 모든 계약 수집 및 정규화
    const allContracts: NormalizedContract[] = [];

    for (const customer of customers) {
      const customerId = customer._id.toString();
      const customerName = customer.personal_info?.name || '';
      const annualReports: AnnualReport[] = customer.annual_reports || [];

      // 각 AR의 계약 수집 (최신 AR만 사용 - 중복 방지)
      // AR은 issue_date 기준 최신 것 사용
      if (annualReports.length > 0) {
        // issue_date 기준 정렬 (최신 우선)
        const sortedReports = [...annualReports].sort((a, b) => {
          const dateA = new Date(a.issue_date || 0).getTime();
          const dateB = new Date(b.issue_date || 0).getTime();
          return dateB - dateA;
        });

        const latestAR = sortedReports[0];
        const contracts = latestAR.contracts || [];

        for (const contract of contracts) {
          allContracts.push(normalizeContract(
            contract,
            customerId,
            customerName,
            latestAR.issue_date,
            latestAR.parsed_at
          ));
        }
      }
    }

    // 필터링: 검색어
    let filteredContracts = allContracts;
    if (params.search) {
      filteredContracts = filteredContracts.filter(c => matchesSearch(c, params.search!));
    }

    // 필터링: 상태
    if (params.status) {
      const statusLower = params.status.toLowerCase();
      filteredContracts = filteredContracts.filter(c =>
        c.status.toLowerCase().includes(statusLower)
      );
    }

    // 필터링: 계약일 범위
    if (params.contractDateFrom) {
      const fromTime = new Date(params.contractDateFrom).getTime();
      filteredContracts = filteredContracts.filter(c => {
        const t = new Date(c.contractDate).getTime();
        return !isNaN(t) && t >= fromTime;
      });
    }
    if (params.contractDateTo) {
      // To 날짜의 하루 끝까지 포함 (해당 날짜 23:59:59)
      const toTime = new Date(params.contractDateTo).getTime() + 86400000 - 1;
      filteredContracts = filteredContracts.filter(c => {
        const t = new Date(c.contractDate).getTime();
        return !isNaN(t) && t <= toTime;
      });
    }

    // 정렬
    const sortBy = params.sortBy || 'contractDate';
    const sortOrder = params.sortOrder || 'desc';
    const sortMultiplier = sortOrder === 'asc' ? 1 : -1;

    filteredContracts.sort((a, b) => {
      if (sortBy === 'premium') {
        return (a.premium - b.premium) * sortMultiplier;
      }
      // 기본: contractDate
      const dateA = new Date(a.contractDate || 0).getTime();
      const dateB = new Date(b.contractDate || 0).getTime();
      return (dateA - dateB) * sortMultiplier;
    });

    // summary 집계 (필터 적용 후, 페이지네이션 전)
    const summary = filteredContracts.reduce(
      (acc, c) => {
        acc.totalPremium += c.premium || 0;
        acc.totalContracts += 1;
        const statusLower = c.status.toLowerCase();
        if (statusLower.includes('정상') || statusLower.includes('유지')) {
          acc.activeContracts += 1;
        } else if (statusLower.includes('실효') || statusLower.includes('해지') || statusLower.includes('만기')) {
          acc.lapsedContracts += 1;
        }
        return acc;
      },
      { totalPremium: 0, totalContracts: 0, activeContracts: 0, lapsedContracts: 0 }
    );

    // 페이지네이션
    const totalCount = filteredContracts.length;
    const limit = Math.min(params.limit || 10, 50);
    const offset = params.offset || 0;
    const paginatedContracts = filteredContracts.slice(offset, offset + limit);
    const hasMore = offset + paginatedContracts.length < totalCount;

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          count: paginatedContracts.length,
          totalCount,
          offset,
          limit,
          hasMore,
          summary,
          contracts: paginatedContracts
        }, null, 2)
      }]
    };
  } catch (error) {
    // 에러 로깅
    console.error('[MCP] list_contracts 에러:', error);
    sendErrorLog('aims_mcp', 'list_contracts 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `계약 조회 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * 계약 상세 조회 핸들러
 *
 * 데이터 소스: customers.annual_reports[].contracts
 * - 증권번호로 특정 계약 검색
 */
export async function handleGetContractDetails(args: unknown) {
  try {
    const params = getContractDetailsSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    const policyNumber = params.policyNumber.trim();

    // 현재 설계사의 모든 고객에서 해당 증권번호 검색
    const customers = await db.collection(COLLECTIONS.CUSTOMERS)
      .find({
        'meta.created_by': userId,
        'annual_reports.contracts.증권번호': policyNumber
      })
      .project({
        _id: 1,
        'personal_info.name': 1,
        'annual_reports': 1
      })
      .toArray();

    if (customers.length === 0) {
      // 부분 일치 검색 시도
      const allCustomers = await db.collection(COLLECTIONS.CUSTOMERS)
        .find({
          'meta.created_by': userId,
          'annual_reports': { $exists: true, $ne: [] }
        })
        .project({
          _id: 1,
          'personal_info.name': 1,
          'annual_reports': 1
        })
        .toArray();

      // 부분 일치 검색
      for (const customer of allCustomers) {
        const annualReports: AnnualReport[] = customer.annual_reports || [];
        for (const ar of annualReports) {
          const contracts = ar.contracts || [];
          const found = contracts.find(c =>
            c['증권번호']?.toLowerCase().includes(policyNumber.toLowerCase())
          );
          if (found) {
            const normalized = normalizeContract(
              found,
              customer._id.toString(),
              customer.personal_info?.name || '',
              ar.issue_date,
              ar.parsed_at
            );
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify(normalized, null, 2)
              }]
            };
          }
        }
      }

      return {
        isError: true,
        content: [{
          type: 'text' as const,
          text: `증권번호 "${policyNumber}"에 해당하는 계약을 찾을 수 없습니다.`
        }]
      };
    }

    // 정확히 일치하는 계약 찾기
    const customer = customers[0];
    const annualReports: AnnualReport[] = customer.annual_reports || [];

    for (const ar of annualReports) {
      const contracts = ar.contracts || [];
      const found = contracts.find(c => c['증권번호'] === policyNumber);
      if (found) {
        const normalized = normalizeContract(
          found,
          customer._id.toString(),
          customer.personal_info?.name || '',
          ar.issue_date,
          ar.parsed_at
        );
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(normalized, null, 2)
          }]
        };
      }
    }

    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `증권번호 "${policyNumber}"에 해당하는 계약을 찾을 수 없습니다.`
      }]
    };
  } catch (error) {
    // 에러 로깅
    console.error('[MCP] get_contract_details 에러:', error);
    sendErrorLog('aims_mcp', 'get_contract_details 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `계약 상세 조회 실패: ${errorMessage}`
      }]
    };
  }
}

// ============================================================================
// Deprecated: create_contract
// ============================================================================

// 기존 스키마는 호환성을 위해 유지하되, 핸들러는 비활성화
export const createContractSchema = z.object({
  customerId: z.string().describe('계약자(고객) ID'),
  policyNumber: z.string().describe('증권번호'),
  productName: z.string().optional().describe('상품명'),
  insurerName: z.string().optional().describe('보험사명'),
  premium: z.number().optional().describe('보험료'),
  contractDate: z.string().optional().describe('계약일 (YYYY-MM-DD)'),
  expiryDate: z.string().optional().describe('만기일 (YYYY-MM-DD)'),
  status: z.string().optional().describe('계약 상태'),
  memo: z.string().optional().describe('메모')
});

/**
 * @deprecated 계약 생성은 Annual Report 파싱으로만 가능합니다.
 */
export async function handleCreateContract(_args: unknown) {
  return {
    isError: true,
    content: [{
      type: 'text' as const,
      text: '계약은 Annual Report PDF 업로드 및 파싱을 통해서만 등록할 수 있습니다. 고객의 Annual Report를 업로드해 주세요.'
    }]
  };
}
