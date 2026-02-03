/**
 * Annual Report API
 *
 * 메트라이프 Annual Review Report PDF 파싱 및 조회 API
 */

import type { Customer } from '@/entities/customer';
import { api, apiRequest, ApiError } from '@/shared/lib/api';
import { errorReporter } from '@/shared/lib/errorReporter';

// Node.js API (3010)를 프록시로 사용 (포트 8004는 외부 접속 불가)
const ANNUAL_REPORT_API_URL = '/api';

// ==================== 타입 정의 ====================

/**
 * 보험 계약 정보
 */
export interface InsuranceContract {
  insurance_company: string;      // 보험사명
  contract_number: string;         // 계약번호
  product_name: string;            // 상품명
  contractor_name?: string;        // 계약자
  insured_name?: string;           // 피보험자
  monthly_premium: number;         // 월 보험료
  coverage_amount: number;         // 보장금액
  contract_date: string;           // 계약일 (YYYY-MM-DD)
  maturity_date?: string;          // 만기일 (YYYY-MM-DD)
  premium_payment_period?: string; // 납입기간
  insurance_period?: string;       // 보험기간
  status?: string;                 // 계약상태
}

/**
 * Annual Report 전체 데이터
 */
export interface AnnualReport {
  report_id: string;               // Report ID (ObjectId)
  issue_date?: string;             // 발행일 (YYYY-MM-DD) - 실패 시 null 가능
  customer_name?: string;          // 고객명 - 실패 시 null 가능
  total_monthly_premium?: number | null;  // 총 월 보험료 - 실패 시 null
  total_coverage?: number;         // 총 보장금액
  contract_count?: number | null;  // 계약 건수 - 실패 시 null
  contracts: InsuranceContract[];  // 계약 목록
  lapsed_contracts?: InsuranceContract[];  // 부활가능 실효계약
  source_file_id?: string;         // 원본 파일 ID
  created_at?: string;             // 생성일시 (ISO 8601)
  parsed_at?: string | null;       // 파싱일시 (ISO 8601) - 실패/진행중 시 null
  status?: 'completed' | 'error' | 'processing' | 'pending';  // 파싱 상태
  error_message?: string;          // 에러 메시지 (실패 시)
  retry_count?: number;            // 재시도 횟수 (실패 시)
  registered_at?: string;          // 보험계약 탭 등록일시 (ISO 8601)
}

// ==================== 계약 이력 관리 타입 ====================

/**
 * 발행일 기준 계약 스냅샷
 * - AR이 발행될 때마다 해당 시점의 계약 정보가 스냅샷으로 기록
 */
export interface ContractSnapshot {
  arReportId: string;         // 원본 AR ID
  issueDate: string;          // AR 발행일 (YYYY-MM-DD)
  parsedAt: string;           // AR 파싱 시점 (ISO 8601)
  // 계약 기본 정보 (스냅샷별로 다를 수 있음)
  insurerName: string;        // 보험사명
  productName: string;        // 보험상품명
  holder: string;             // 계약자
  insured: string;            // 피보험자
  contractDate: string;       // 계약일 (YYYY-MM-DD)
  // 변경 추적 대상 필드
  status: string;             // 계약상태 (정상, 해지, 실효 등)
  premium: number;            // 보험료(원)
  coverageAmount: number;     // 가입금액(만원)
  insurancePeriod: string;    // 보험기간 (예: "종신", "80세 만기")
  paymentPeriod: string;      // 납입기간 (예: "20년납", "전기납")
}

/**
 * 계약 이력 (증권번호 기준)
 * - 증권번호를 유일 키로 사용하여 여러 AR에서 동일 계약의 이력을 추적
 */
export interface ContractHistory {
  policyNumber: string;       // 증권번호 (유일 키)
  insurerName: string;        // 보험사명
  productName: string;        // 보험상품명
  holder: string;             // 계약자
  insured: string;            // 피보험자
  contractDate: string;       // 계약일 (YYYY-MM-DD)
  snapshots: ContractSnapshot[];  // 발행일별 스냅샷 (시간순 정렬, 최신 우선)
  latestSnapshot: ContractSnapshot;  // 가장 최근 스냅샷 (요약 표시용)
}

/**
 * AR 목록 → 증권번호별 계약 이력으로 변환
 *
 * @param arReports 완료된 AR 목록
 * @returns 증권번호별 계약 이력 배열
 */
export function groupContractsByPolicyNumber(arReports: AnnualReport[]): ContractHistory[] {
  const historyMap = new Map<string, ContractHistory>();

  // 모든 AR의 계약을 순회
  for (const ar of arReports) {
    if (!ar.contracts || ar.contracts.length === 0) continue;

    for (const contract of ar.contracts) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contractData = contract as any;
      const policyNumber = contractData['증권번호'] || contractData.contract_number;
      if (!policyNumber) continue;

      // 스냅샷 생성 (모든 계약 정보 포함)
      const snapshot: ContractSnapshot = {
        arReportId: ar.report_id,
        issueDate: ar.issue_date || '',
        parsedAt: ar.parsed_at || '',
        // 계약 기본 정보
        insurerName: contractData['보험사'] || contractData.insurance_company || '',
        productName: contractData['보험상품'] || contractData.product_name || '',
        holder: contractData['계약자'] || contractData.contractor_name || '',
        insured: contractData['피보험자'] || contractData.insured_name || '',
        contractDate: contractData['계약일'] || contractData.contract_date || '',
        // 변경 추적 대상 필드
        status: contractData['계약상태'] || contractData.status || '',
        premium: contractData['보험료(원)'] || contractData.monthly_premium || 0,
        coverageAmount: contractData['가입금액(만원)'] || contractData.coverage_amount || 0,
        insurancePeriod: contractData['보험기간'] || contractData.insurance_period || '',
        paymentPeriod: contractData['납입기간'] || contractData.premium_payment_period || '',
      };

      if (historyMap.has(policyNumber)) {
        // 기존 이력에 스냅샷 추가
        historyMap.get(policyNumber)!.snapshots.push(snapshot);
      } else {
        // 새 이력 생성
        historyMap.set(policyNumber, {
          policyNumber,
          insurerName: contractData['보험사'] || contractData.insurance_company || '',
          productName: contractData['보험상품'] || contractData.product_name || '',
          holder: contractData['계약자'] || contractData.contractor_name || '',
          insured: contractData['피보험자'] || contractData.insured_name || '',
          contractDate: contractData['계약일'] || contractData.contract_date || '',
          snapshots: [snapshot],
          latestSnapshot: snapshot,  // 임시
        });
      }
    }
  }

  // 스냅샷 정렬 (최신순) 및 latestSnapshot 설정
  // 최신 스냅샷의 데이터로 history 객체 필드 업데이트
  for (const history of historyMap.values()) {
    history.snapshots.sort((a, b) =>
      new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime()
    );
    history.latestSnapshot = history.snapshots[0];
    // 최신 스냅샷의 데이터로 계약 기본 정보 업데이트
    const latest = history.latestSnapshot;
    history.insurerName = latest.insurerName;
    history.productName = latest.productName;
    history.holder = latest.holder;
    history.insured = latest.insured;
    history.contractDate = latest.contractDate;
  }

  // 증권번호 순 정렬하여 반환
  return Array.from(historyMap.values()).sort((a, b) =>
    a.policyNumber.localeCompare(b.policyNumber)
  );
}

/**
 * 두 스냅샷 간 변경된 필드 목록 반환
 *
 * @param current 현재 스냅샷
 * @param previous 이전 스냅샷
 * @returns 변경된 필드명 배열
 */
export function getChangedFields(
  current: ContractSnapshot,
  previous: ContractSnapshot | undefined
): string[] {
  if (!previous) return [];

  const changedFields: string[] = [];
  if (current.status !== previous.status) changedFields.push('status');
  if (current.premium !== previous.premium) changedFields.push('premium');
  if (current.coverageAmount !== previous.coverageAmount) changedFields.push('coverageAmount');
  if (current.insurancePeriod !== previous.insurancePeriod) changedFields.push('insurancePeriod');
  if (current.paymentPeriod !== previous.paymentPeriod) changedFields.push('paymentPeriod');

  return changedFields;
}

// ==================== AR 요약 타입 ====================

/**
 * Annual Report 요약 정보 (목록 조회용)
 */
export interface AnnualReportSummary {
  report_id: string;
  issue_date: string;
  customer_name: string;
  total_monthly_premium: number;
  total_coverage: number;
  contract_count: number;
  created_at: string;
  parsed_at?: string;
  file_hash?: string;  // 파일 해시 (SHA-256)
}

/**
 * 파싱 요청 파라미터
 */
export interface ParseAnnualReportRequest {
  file_path: string;    // 파일 경로
  file_id: string;      // 파일 ID
  customer_id?: string; // 고객 ID (선택)
}

/**
 * 파싱 요청 응답
 */
export interface ParseAnnualReportResponse {
  success: boolean;
  message?: string;
  file_id?: string;
  status_url?: string;
  error?: string;
}

/**
 * 파싱 상태 조회 응답
 */
export interface ParseStatusResponse {
  success: boolean;
  status?: 'processing' | 'completed' | 'failed' | 'not_annual_report';
  file_id?: string;
  progress?: string;
  result?: AnnualReport;
  error?: string;
}

/**
 * Annual Reports 목록 조회 응답
 */
export interface AnnualReportsListResponse {
  success: boolean;
  data?: {
    customer_id: string;
    reports: AnnualReportSummary[];
    total_count: number;
  };
  error?: string;
}

/**
 * 최신 Annual Report 조회 응답
 */
export interface LatestAnnualReportResponse {
  success: boolean;
  data?: {
    customer_id: string;
    report: AnnualReport | null;
  };
  error?: string;
}

/**
 * 전체 AR 목록 조회 응답 (고객별 그룹화)
 */
export interface AllAnnualReportsResponse {
  success: boolean;
  data?: {
    reports: ARSummaryByCustomer[];
    total_count: number;
  };
  error?: string;
}

/**
 * 고객별 AR 요약 정보
 */
export interface ARSummaryByCustomer {
  customer_id: string;
  customer_name: string;
  customer_type?: '개인' | '법인';
  registered_at?: string;
  latest_issue_date: string;
  latest_parsed_at: string;
  total_monthly_premium: number;
  contract_count: number;
  ar_count: number;  // 해당 고객의 총 AR 개수
}

/**
 * Annual Report 체크 응답 (백엔드 /check API)
 */
export interface CheckAnnualReportResponse {
  is_annual_report: boolean;
  confidence: number;
  metadata: {
    customer_name: string;
    report_title: string;
    issue_date: string; // YYYY-MM-DD
    fsr_name: string;
  } | null;
}

/**
 * Annual Report 파싱 요청 (백엔드 /parse API)
 * Note: 기존 ParseAnnualReportRequest와 충돌 방지를 위해 별도 타입 사용
 */
export interface ParseAnnualReportFileRequest {
  file: File;
  customer_id: string;
}

/**
 * Annual Report 파싱 응답 (백엔드 /parse API)
 */
export interface ParseAnnualReportApiResponse {
  success: boolean;
  message: string;
  job_id?: string;
  file_id?: string;
}

/**
 * 고객 식별 결과
 */
export interface CustomerIdentificationResult {
  scenario: 'single' | 'multiple' | 'none';
  customers: Customer[];
  metadata: CheckAnnualReportResponse['metadata'];
}

// ==================== API 클래스 ====================

/**
 * AR 파싱 재시도 응답
 */
export interface RetryParsingResponse {
  success: boolean;
  message: string;
}

export class AnnualReportApi {
  /**
   * Annual Report 파싱 요청
   *
   * @param request 파싱 요청 파라미터
   * @returns 파싱 요청 응답 (즉시 반환, 백그라운드 처리)
   */
  static async parseAnnualReport(
    request: ParseAnnualReportRequest
  ): Promise<ParseAnnualReportResponse> {
    try {
      const data = await api.post<{
        success?: boolean;
        message?: string;
        file_id?: string;
        status_url?: string;
        error?: string;
      }>(`${ANNUAL_REPORT_API_URL}/annual-report/parse`, request);

      if (data.success !== false) {
        return {
          success: true,
          message: data.message,
          file_id: data.file_id,
          status_url: data.status_url,
        };
      }

      throw new Error(data.message || data.error || 'Annual Report 파싱 요청에 실패했습니다.');
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : (error instanceof Error ? error.message : 'Annual Report 파싱 중 오류가 발생했습니다.');
      errorReporter.reportApiError(error as Error, { component: 'AnnualReportApi.parseAnnualReport' });
      return { success: false, error: message };
    }
  }

  /**
   * Annual Report 파싱 상태 조회
   *
   * @param fileId 파일 ID
   * @returns 파싱 상태 응답
   */
  static async getParseStatus(fileId: string): Promise<ParseStatusResponse> {
    try {
      const data = await api.get<{
        success?: boolean;
        status?: 'processing' | 'completed' | 'failed' | 'not_annual_report';
        file_id?: string;
        progress?: string;
        result?: AnnualReport;
        message?: string;
        error?: string;
      }>(`${ANNUAL_REPORT_API_URL}/annual-report/status/${fileId}`);

      if (data.success !== false) {
        return {
          success: true,
          status: data.status,
          file_id: data.file_id,
          progress: data.progress,
          result: data.result,
        };
      }

      throw new Error(data.message || data.error || '상태 조회에 실패했습니다.');
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : (error instanceof Error ? error.message : '상태 조회 중 오류가 발생했습니다.');
      errorReporter.reportApiError(error as Error, { component: 'AnnualReportApi.getParseStatus', payload: { fileId } });
      return { success: false, error: message };
    }
  }

  /**
   * 고객의 Annual Reports 목록 조회
   *
   * @param customerId 고객 ID
   * @param userId 사용자 ID (설계사 계정)
   * @param limit 조회 개수 (기본: 10)
   * @returns Annual Reports 목록
   */
  static async getAnnualReports(
    customerId: string,
    _userId: string,
    limit: number = 10
  ): Promise<AnnualReportsListResponse> {
    try {
      const data = await api.get<{
        success?: boolean;
        data?: AnnualReportSummary[];
        count?: number;
        total?: number;
        message?: string;
        error?: string;
      }>(`${ANNUAL_REPORT_API_URL}/customers/${customerId}/annual-reports?limit=${limit}`);

      if (data.success !== false) {
        // 백엔드 응답: { success: true, data: [...], count: 1, total: 1 }
        return {
          success: true,
          data: {
            customer_id: customerId,
            reports: Array.isArray(data.data) ? data.data : [],
            total_count: data.total || data.count || 0,
          },
        };
      }

      throw new Error(data.message || data.error || 'Annual Reports 조회에 실패했습니다.');
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : (error instanceof Error ? error.message : 'Annual Reports 조회 중 오류가 발생했습니다.');
      errorReporter.reportApiError(error as Error, { component: 'AnnualReportApi.getAnnualReports', payload: { customerId } });
      return { success: false, error: message };
    }
  }

  /**
   * 고객의 최신 Annual Report 조회
   *
   * @param customerId 고객 ID
   * @param userId 사용자 ID (설계사 계정)
   * @returns 최신 Annual Report
   */
  static async getLatestAnnualReport(
    customerId: string,
    _userId: string
  ): Promise<LatestAnnualReportResponse> {
    try {
      const data = await api.get<{
        success?: boolean;
        data?: unknown;
        message?: string;
        error?: string;
      }>(`${ANNUAL_REPORT_API_URL}/customers/${customerId}/annual-reports/latest`);

      if (data.success) {
        // 백엔드 응답: { success: true, data: { report_date, parsed_data: {...} } }
        return {
          success: true,
          data: (data.data || undefined) as { customer_id: string; report: AnnualReport | null; } | undefined,
        };
      }

      throw new Error(data.message || data.error || '최신 Annual Report 조회에 실패했습니다.');
    } catch (error) {
      // 404는 데이터 없음 (정상 케이스)
      if (error instanceof ApiError && error.status === 404) {
        return {
          success: true,
          data: { customer_id: customerId, report: null },
        };
      }
      const message = error instanceof ApiError
        ? error.message
        : (error instanceof Error ? error.message : '최신 Annual Report 조회 중 오류가 발생했습니다.');
      errorReporter.reportApiError(error as Error, { component: 'AnnualReportApi.getLatestAnnualReport', payload: { customerId } });
      return { success: false, error: message };
    }
  }

  /**
   * 금액 포맷 (원화)
   *
   * @param amount 금액
   * @returns 포맷된 문자열 (예: "1,234,567원")
   */
  static formatCurrency(amount: number | undefined | null): string {
    if (amount === undefined || amount === null) return '-';
    return `${amount.toLocaleString('ko-KR')}원`;
  }

  /**
   * 날짜 포맷 (YYYY-MM-DD → YYYY년 MM월 DD일)
   *
   * @param dateString 날짜 문자열 (YYYY-MM-DD)
   * @returns 포맷된 문자열
   */
  static formatDate(dateString: string): string {
    if (!dateString) return '-';

    try {
      const [year, month, day] = dateString.split('-');
      return `${year}년 ${month}월 ${day}일`;
    } catch {
      return dateString;
    }
  }

  /**
   * 계약 건수 텍스트
   *
   * @param count 계약 건수
   * @returns 포맷된 문자열 (예: "3건")
   */
  static formatContractCount(count: number | undefined | null): string {
    if (count === undefined || count === null) return '-';
    return `${count}건`;
  }

  /**
   * 일시 포맷 (ISO 8601 → YYYY.MM.DD HH:mm:ss)
   *
   * @param dateTimeString ISO 8601 날짜 문자열
   * @returns 포맷된 문자열 (예: "2025.10.16 21:30:08")
   */
  static formatDateTime(dateTimeString: string | undefined | null): string {
    if (!dateTimeString) return '-';

    try {
      const date = new Date(dateTimeString);
      if (isNaN(date.getTime())) return dateTimeString;

      // KST로 변환하여 각 부분 추출
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      const parts = formatter.formatToParts(date);
      const year = parts.find(p => p.type === 'year')?.value || '';
      const month = parts.find(p => p.type === 'month')?.value || '';
      const day = parts.find(p => p.type === 'day')?.value || '';
      let hours = parts.find(p => p.type === 'hour')?.value || '';
      const minutes = parts.find(p => p.type === 'minute')?.value || '';
      const seconds = parts.find(p => p.type === 'second')?.value || '';

      // 자정을 24:00:00이 아닌 00:00:00으로 표시
      if (hours === '24') {
        hours = '00';
      }

      return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`;
    } catch {
      return dateTimeString;
    }
  }

  /**
   * Annual Report 체크 API (백엔드 Python /check)
   * - PDF가 Annual Report인지 판단
   * - 1페이지 메타데이터 추출 (AI 불사용)
   *
   * @param file PDF 파일
   * @returns Annual Report 체크 결과
   */
  static async checkAnnualReport(file: File): Promise<CheckAnnualReportResponse> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const data = await api.post<CheckAnnualReportResponse>(
        `${ANNUAL_REPORT_API_URL}/annual-report/check`,
        formData
      );
      return data;
    } catch (error) {
      // 에러 시에도 is_annual_report: false로 반환 (조용히 실패)
      errorReporter.reportApiError(error as Error, { component: 'AnnualReportApi.checkAnnualReport' });
      return { is_annual_report: false, confidence: 0, metadata: null };
    }
  }

  /**
   * Annual Report 파싱 API (백엔드 Python /parse)
   * - 2~N페이지 AI 파싱 (백그라운드 처리)
   * - customer_id 필수
   *
   * @param file PDF 파일
   * @param customerId 고객 ID
   * @returns 파싱 요청 응답 (즉시 반환)
   */
  static async parseAnnualReportFile(
    file: File,
    customerId: string
  ): Promise<ParseAnnualReportApiResponse> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('customer_id', customerId);

      const data = await api.post<ParseAnnualReportApiResponse>(
        `${ANNUAL_REPORT_API_URL}/annual-report/parse-file`,
        formData
      );
      return data;
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : (error instanceof Error ? error.message : 'Annual Report 파싱 요청에 실패했습니다.');
      errorReporter.reportApiError(error as Error, { component: 'AnnualReportApi.parseAnnualReportFile', payload: { customerId } });
      return { success: false, message };
    }
  }

  /**
   * 고객명으로 고객 검색
   *
   * @param name 고객명
   * @param userId 사용자 ID (설계사 계정)
   * @returns 고객 목록
   */
  static async searchCustomersByName(name: string, _userId: string): Promise<Customer[]> {
    try {
      // 고객 검색은 Node.js API (3010)를 사용
      // ⭐ status=all로 활성+휴면 고객 모두 검색 (동명이인 표시용)
      const data = await api.get<{
        success?: boolean;
        data?: { customers?: Customer[] };
      }>(`/api/customers?search=${encodeURIComponent(name)}&status=all`);

      // 백엔드 응답 구조: { success: true, data: { customers: [...] } }
      return data.data?.customers || [];
    } catch (error) {
      // 에러 시 빈 배열 반환 (조용히 실패)
      errorReporter.reportApiError(error as Error, { component: 'AnnualReportApi.searchCustomersByName', payload: { name } });
      return [];
    }
  }

  /**
   * Annual Reports 삭제 (복수 선택 가능)
   *
   * @param customerId 고객 ID
   * @param userId 사용자 ID (설계사 계정)
   * @param indices 삭제할 리포트 인덱스 배열 (최신순 기준)
   * @returns 삭제 결과
   */
  static async deleteAnnualReports(
    customerId: string,
    userId: string,
    indices: number[]
  ): Promise<{ success: boolean; message: string; deleted_count?: number }> {
    try {
      const data = await apiRequest<{
        success?: boolean;
        message?: string;
        deleted_count?: number;
      }>(
        `${ANNUAL_REPORT_API_URL}/customers/${customerId}/annual-reports?userId=${encodeURIComponent(userId)}`,
        { method: 'DELETE', body: { indices } }
      );

      if (data.success) {
        return {
          success: true,
          message: data.message || 'Annual Reports가 삭제되었습니다',
          deleted_count: data.deleted_count,
        };
      }

      throw new Error(data.message || 'Annual Reports 삭제에 실패했습니다');
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : (error instanceof Error ? error.message : 'Annual Reports 삭제 중 오류가 발생했습니다');
      errorReporter.reportApiError(error as Error, { component: 'AnnualReportApi.deleteAnnualReports', payload: { customerId, indices } });
      return { success: false, message };
    }
  }

  /**
   * 중복 Annual Reports 정리
   *
   * 동일 발행일(issue_date) + 동일 고객명(customerName)의 AR 중
   * 문서 연결일(linked_at)과 가장 가까운 파싱일시(parsed_at)를 가진 AR만 남기고 나머지 삭제
   *
   * 중복 판단 기준:
   * - issue_date AND customer_name 둘 다 같아야 중복
   * - 날짜만 같고 고객명이 다르면 중복이 아님
   *
   * @param customerId 고객 ID
   * @param userId 사용자 ID (설계사 계정)
   * @param issueDate 발행일 (YYYY-MM-DD 또는 ISO 형식)
   * @param referenceLinkedAt 기준 연결일 (ISO 8601 형식)
   * @param customerName AR의 고객명 (중복 판단에 사용)
   * @returns 정리 결과
   */
  static async cleanupDuplicates(
    customerId: string,
    userId: string,
    issueDate: string,
    referenceLinkedAt: string,
    customerName?: string
  ): Promise<{
    success: boolean;
    message: string;
    deleted_count?: number;
    kept_report?: {
      issue_date?: string;
      parsed_at?: string;
      customer_name?: string;
    };
  }> {
    try {
      const data = await api.post<{
        success?: boolean;
        message?: string;
        deleted_count?: number;
        kept_report?: {
          issue_date?: string;
          parsed_at?: string;
          customer_name?: string;
        };
      }>(
        `${ANNUAL_REPORT_API_URL}/customers/${customerId}/annual-reports/cleanup-duplicates?userId=${encodeURIComponent(userId)}`,
        {
          issue_date: issueDate,
          reference_linked_at: referenceLinkedAt,
          customer_name: customerName,
        }
      );

      if (data.success !== false) {
        return {
          success: true,
          message: data.message || '중복 Annual Reports가 정리되었습니다',
          deleted_count: data.deleted_count,
          kept_report: data.kept_report,
        };
      }

      throw new Error(data.message || '중복 Annual Reports 정리에 실패했습니다');
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : (error instanceof Error ? error.message : '중복 Annual Reports 정리 중 오류가 발생했습니다');
      errorReporter.reportApiError(error as Error, { component: 'AnnualReportApi.cleanupDuplicates', payload: { customerId, issueDate } });
      return { success: false, message };
    }
  }

  /**
   * AR 보험계약 등록 (수동)
   *
   * Annual Report의 계약 정보를 보험계약 탭에 등록합니다.
   * registered_at 필드를 설정하여 등록 여부를 표시합니다.
   *
   * @param customerId 고객 ID
   * @param issueDate 등록할 AR의 발행일 (YYYY-MM-DD)
   * @param customerName AR의 고객명 (선택, 식별용)
   * @returns 등록 결과
   */
  static async registerARContracts(
    customerId: string,
    issueDate: string,
    customerName?: string
  ): Promise<{
    success: boolean;
    message: string;
    registered_at?: string;
    duplicate?: boolean;
  }> {
    try {
      const data = await api.post<{
        success?: boolean;
        message?: string;
        registered_at?: string;
        duplicate?: boolean;
      }>(
        `${ANNUAL_REPORT_API_URL}/customers/${customerId}/ar-contracts`,
        {
          issue_date: issueDate,
          customer_name: customerName,
        }
      );

      if (data.success !== false) {
        return {
          success: true,
          message: data.message || '보험계약이 등록되었습니다',
          registered_at: data.registered_at,
          duplicate: data.duplicate,
        };
      }

      throw new Error(data.message || 'AR 보험계약 등록에 실패했습니다');
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : (error instanceof Error ? error.message : 'AR 보험계약 등록 중 오류가 발생했습니다');
      errorReporter.reportApiError(error as Error, { component: 'AnnualReportApi.registerARContracts', payload: { customerId, issueDate } });
      return { success: false, message };
    }
  }

  /**
   * AR 파싱 재시도 요청
   *
   * @param fileId 재시도할 파일 ID
   * @returns 재시도 요청 응답
   */
  static async retryParsing(fileId: string): Promise<RetryParsingResponse> {
    try {
      const data = await api.post<{
        success?: boolean;
        message?: string;
        error?: string;
      }>(
        `${ANNUAL_REPORT_API_URL}/ar-background/retry-parsing`,
        { file_id: fileId }
      );

      if (data.success !== false) {
        return {
          success: true,
          message: data.message || 'AR 파싱 재시도가 시작되었습니다',
        };
      }

      throw new Error(data.message || data.error || 'AR 파싱 재시도에 실패했습니다');
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : (error instanceof Error ? error.message : 'AR 파싱 재시도 중 오류가 발생했습니다');
      errorReporter.reportApiError(error as Error, { component: 'AnnualReportApi.retryParsing', payload: { fileId } });
      return { success: false, message };
    }
  }

  /**
   * 전체 Annual Reports 목록 조회 (고객별 그룹화)
   *
   * 모든 고객의 AR을 조회하여 고객별로 그룹화하고 최신 AR 정보를 반환
   * ⭐ 설계사별 데이터 격리 적용 (JWT 토큰 기반)
   *
   * @returns 고객별 최신 AR 요약 목록
   */
  static async getAllAnnualReports(): Promise<AllAnnualReportsResponse> {
    try {
      const data = await api.get<{
        success?: boolean;
        data?: {
          reports: ARSummaryByCustomer[];
          total_count: number;
        };
        message?: string;
        error?: string;
      }>(`${ANNUAL_REPORT_API_URL}/annual-reports/all`);

      if (data.success !== false) {
        return {
          success: true,
          data: data.data,
        };
      }

      throw new Error(data.message || data.error || '전체 Annual Reports 조회에 실패했습니다.');
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : (error instanceof Error ? error.message : '전체 Annual Reports 조회 중 오류가 발생했습니다.');
      errorReporter.reportApiError(error as Error, { component: 'AnnualReportApi.getAllAnnualReports' });
      return { success: false, error: message };
    }
  }
}
