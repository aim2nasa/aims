/**
 * Annual Report API
 *
 * 메트라이프 Annual Review Report PDF 파싱 및 조회 API
 */

const ANNUAL_REPORT_API_URL = 'http://tars.giize.com:3010/api';

// ==================== 타입 정의 ====================

/**
 * 보험 계약 정보
 */
export interface InsuranceContract {
  insurance_company: string;      // 보험사명
  contract_number: string;         // 계약번호
  product_name: string;            // 상품명
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
  issue_date: string;              // 발행일 (YYYY-MM-DD)
  customer_name: string;           // 고객명
  total_monthly_premium: number;   // 총 월 보험료
  total_coverage: number;          // 총 보장금액
  contract_count: number;          // 계약 건수
  contracts: InsuranceContract[];  // 계약 목록
  source_file_id?: string;         // 원본 파일 ID
  created_at: string;              // 생성일시 (ISO 8601)
}

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

// ==================== API 클래스 ====================

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
      const response = await fetch(`${ANNUAL_REPORT_API_URL}/annual-report/parse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      const data = await response.json();

      if (response.ok && data.success !== false) {
        return {
          success: true,
          message: data.message,
          file_id: data.file_id,
          status_url: data.status_url,
        };
      }

      throw new Error(data.message || data.error || 'Annual Report 파싱 요청에 실패했습니다.');
    } catch (error) {
      console.error('AnnualReportApi.parseAnnualReport:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Annual Report 파싱 중 오류가 발생했습니다.',
      };
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
      const response = await fetch(
        `${ANNUAL_REPORT_API_URL}/annual-report/status/${fileId}`
      );

      const data = await response.json();

      if (response.ok && data.success !== false) {
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
      console.error('AnnualReportApi.getParseStatus:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '상태 조회 중 오류가 발생했습니다.',
      };
    }
  }

  /**
   * 고객의 Annual Reports 목록 조회
   *
   * @param customerId 고객 ID
   * @param limit 조회 개수 (기본: 10)
   * @returns Annual Reports 목록
   */
  static async getAnnualReports(
    customerId: string,
    limit: number = 10
  ): Promise<AnnualReportsListResponse> {
    try {
      const response = await fetch(
        `${ANNUAL_REPORT_API_URL}/customers/${customerId}/annual-reports?limit=${limit}`
      );

      const data = await response.json();

      if (response.ok && data.success !== false) {
        return {
          success: true,
          data: {
            customer_id: data.customer_id || customerId,
            reports: data.reports || [],
            total_count: data.total_count || 0,
          },
        };
      }

      throw new Error(data.message || data.error || 'Annual Reports 조회에 실패했습니다.');
    } catch (error) {
      console.error('AnnualReportApi.getAnnualReports:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Annual Reports 조회 중 오류가 발생했습니다.',
      };
    }
  }

  /**
   * 고객의 최신 Annual Report 조회
   *
   * @param customerId 고객 ID
   * @returns 최신 Annual Report
   */
  static async getLatestAnnualReport(
    customerId: string
  ): Promise<LatestAnnualReportResponse> {
    try {
      const response = await fetch(
        `${ANNUAL_REPORT_API_URL}/customers/${customerId}/annual-reports/latest`
      );

      const data = await response.json();

      if (response.ok && data.success !== false) {
        return {
          success: true,
          data: {
            customer_id: data.customer_id || customerId,
            report: data.report || null,
          },
        };
      }

      throw new Error(data.message || data.error || '최신 Annual Report 조회에 실패했습니다.');
    } catch (error) {
      console.error('AnnualReportApi.getLatestAnnualReport:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : '최신 Annual Report 조회 중 오류가 발생했습니다.',
      };
    }
  }

  /**
   * 금액 포맷 (원화)
   *
   * @param amount 금액
   * @returns 포맷된 문자열 (예: "1,234,567원")
   */
  static formatCurrency(amount: number): string {
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
  static formatContractCount(count: number): string {
    return `${count}건`;
  }
}
