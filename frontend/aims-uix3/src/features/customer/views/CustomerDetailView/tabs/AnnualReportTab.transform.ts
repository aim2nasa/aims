/**
 * AnnualReportTab 의 원시 API 응답 → AnnualReport 타입 변환 헬퍼.
 *
 * 이슈 #65: 백엔드가 영문 키(contract_number, product_name, ...)로 통일된 이후에도
 * 이 변환부가 한글 키만 읽고 있어 AR 모달이 비어 보이던 버그를 고정한다.
 * 영문 키 우선, 한글 키 fallback.
 *
 * 분리 이유: 유닛 테스트 가능하도록 컴포넌트 본체에서 분리.
 */
import type { AnnualReport, InsuranceContract } from '@/features/customer/api/annualReportApi';

// 백엔드 원시 응답 타입
export interface RawAnnualReportContract {
  seq?: number;
  contract_number?: string;
  product_name?: string;
  insurance_company?: string;
  contractor_name?: string;
  insured_name?: string;
  contract_date?: string;
  status?: string;
  coverage_amount?: number;
  insurance_period?: string;
  premium_payment_period?: string;
  monthly_premium?: number;
  // 레거시 한글 키 fallback
  [key: string]: unknown;
}

export interface RawAnnualReportData {
  report_id?: string;
  issue_date?: string;
  customer_name?: string;
  insurer_name?: string;
  total_monthly_premium?: number | null;
  total_coverage?: number;
  contract_count?: number | null;
  total_contracts?: number | null;
  created_at?: string;
  uploaded_at?: string;
  parsed_at?: string | null;
  file_hash?: string;
  file_id?: string;
  source_file_id?: string;
  status?: 'completed' | 'error' | 'processing' | 'pending';
  error_message?: string;
  retry_count?: number;
  fsr_name?: string;
  report_title?: string;
  registered_at?: string;
  contracts?: RawAnnualReportContract[];
  lapsed_contracts?: RawAnnualReportContract[];
}

/**
 * 단일 계약 dict 변환.
 * 단위 주의:
 * - coverage_amount 는 백엔드 저장 단위(만원)를 그대로 유지 — AnnualReportModal 이
 *   '가입금액(만원)' 라벨로 렌더링하므로 변환 불필요.
 * - monthly_premium 은 백엔드 저장 단위(원) 유지.
 */
export function mapRawContract(
  contract: RawAnnualReportContract,
  fallbackInsurer: string,
): InsuranceContract {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = contract as any;
  return {
    insurance_company:
      (c.insurance_company as string | undefined) ||
      (c['보험사'] as string | undefined) ||
      fallbackInsurer,
    contract_number:
      (c.contract_number as string | undefined) ||
      (c['증권번호'] as string | undefined) ||
      '',
    product_name:
      (c.product_name as string | undefined) ||
      (c['보험상품'] as string | undefined) ||
      '',
    contractor_name:
      (c.contractor_name as string | undefined) ||
      (c['계약자'] as string | undefined) ||
      '',
    insured_name:
      (c.insured_name as string | undefined) ||
      (c['피보험자'] as string | undefined) ||
      '',
    monthly_premium:
      (c.monthly_premium as number | undefined) ??
      (c['보험료(원)'] as number | undefined) ??
      0,
    coverage_amount:
      (c.coverage_amount as number | undefined) ??
      (c['가입금액(만원)'] as number | undefined) ??
      0,
    contract_date:
      (c.contract_date as string | undefined) ||
      (c['계약일'] as string | undefined) ||
      '',
    maturity_date: '',
    premium_payment_period:
      (c.premium_payment_period as string | undefined) ||
      (c['납입기간'] as string | undefined) ||
      '',
    insurance_period:
      (c.insurance_period as string | undefined) ||
      (c['보험기간'] as string | undefined) ||
      '',
    status:
      (c.status as string | undefined) ||
      (c['계약상태'] as string | undefined) ||
      '',
  };
}

/**
 * 전체 AR raw 응답 → AnnualReport 변환.
 */
export function transformRawAnnualReport(rawData: RawAnnualReportData): AnnualReport {
  const reportInsurer = rawData.insurer_name || '메트라이프';
  const transformedContracts = (rawData.contracts || []).map((c) =>
    mapRawContract(c, reportInsurer),
  );
  const transformedLapsedContracts = (rawData.lapsed_contracts || []).map((c) =>
    mapRawContract(c, reportInsurer),
  );

  // status 필드 처리: error/processing 상태는 null 값 유지
  const status = rawData.status || 'completed';
  const isFailedOrProcessing = status === 'error' || status === 'processing';

  return {
    report_id: rawData.file_id || rawData.source_file_id || `report_${rawData.parsed_at}`,
    issue_date: rawData.issue_date || '',
    // ⚠️ customer_name이 없으면 고객명으로 fallback하지 않음
    customer_name: rawData.customer_name || '',
    total_monthly_premium: isFailedOrProcessing
      ? rawData.total_monthly_premium
      : rawData.total_monthly_premium || 0,
    total_coverage: rawData.total_coverage || 0,
    contract_count: isFailedOrProcessing
      ? (rawData.total_contracts ?? rawData.contract_count ?? null)
      : rawData.total_contracts || rawData.contract_count || 0,
    contracts: transformedContracts,
    lapsed_contracts: transformedLapsedContracts,
    source_file_id: rawData.source_file_id || rawData.file_id || '',
    created_at: rawData.uploaded_at || '',
    parsed_at: isFailedOrProcessing ? rawData.parsed_at ?? null : rawData.parsed_at || '',
    status,
    error_message: rawData.error_message,
    retry_count: rawData.retry_count,
    fsr_name: rawData.fsr_name,
    registered_at: rawData.registered_at,
  };
}
