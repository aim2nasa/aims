/**
 * Customer Review Service API
 *
 * 메트라이프 Customer Review Service PDF 파싱 및 조회 API
 */

import { api, apiRequest, ApiError } from '@/shared/lib/api';
import { errorReporter } from '@/shared/lib/errorReporter';

// Node.js API (3010)를 프록시로 사용
const CR_API_URL = '/api';

// ==================== 타입 정의 ====================

/**
 * 계약 정보
 */
export interface ContractInfo {
  policy_number: string;           // 증권번호
  contract_date: string;           // 계약일자 (YYYY-MM-DD)
  insured_amount: number;          // 보험가입금액 (원)
  accumulated_amount: number;      // 적립금 (원)
  investment_return_rate: number;  // 투자수익률 (%)
  surrender_value: number;         // 해지환급금 (원)
  surrender_rate: number;          // 해지환급율 (%)
  accumulation_rate?: number;      // 적립금비율(납입원금대비) (%)
  initial_premium?: number;        // 초회 납입 보험료 (원)
}

/**
 * 납입 원금 정보
 */
export interface PremiumInfo {
  basic_premium: number;           // 기본보험료(A) (원)
  additional_premium: number;      // 수시추가납(B) (원)
  regular_additional: number;      // 정기추가납(C) (원)
  withdrawal: number;              // 중도출금(D) (원)
  net_premium: number;             // 계(A+B+C-D) (원)
  policy_loan: number;             // 약관대출 (원)
}

/**
 * 펀드 구성 정보
 */
export interface FundAllocation {
  fund_name: string;               // 펀드명
  basic_accumulated: number;       // 기본적립금 (원)
  additional_accumulated?: number; // 추가적립금 (원, optional)
  allocation_ratio: number;        // 기본 구성비율 (%)
  additional_allocation_ratio?: number | null; // 추가 구성비율 (%, optional)
  return_rate: number;             // 기본수익률 (%)
  additional_return_rate?: number | null; // 추가수익률 (%, optional)
  invested_principal: number;      // 기본 투입원금 (원)
  additional_invested_principal?: number | null; // 추가 투입원금 (원, optional)
}

/**
 * Customer Review 전체 데이터
 */
export interface CustomerReview {
  // 1페이지 메타데이터
  product_name?: string;           // 상품명
  issue_date?: string;             // 발행일 (ISO 8601)
  contractor_name?: string;        // 계약자
  insured_name?: string;           // 피보험자
  death_beneficiary?: string;      // 사망 수익자
  fsr_name?: string;               // FSR 이름

  // 2~4페이지 파싱 데이터
  contract_info: ContractInfo;     // 계약 정보
  premium_info: PremiumInfo;       // 납입 원금
  fund_allocations: FundAllocation[]; // 펀드 구성 현황

  // 요약 정보
  total_accumulated_amount?: number | null; // 총 적립금 (원)
  fund_count?: number | null;      // 펀드 수

  // 메타데이터
  source_file_id?: string;         // 원본 파일 ID
  uploaded_at?: string;            // 업로드일시 (ISO 8601)
  parsed_at?: string | null;       // 파싱일시 (ISO 8601)
  status?: 'completed' | 'error' | 'processing' | 'pending';  // 파싱 상태
  error_message?: string;          // 에러 메시지 (실패 시)
  retry_count?: number;            // 재시도 횟수 (실패 시)
  file_hash?: string;              // 파일 해시 (SHA-256)
}

/**
 * Customer Review 목록 조회 응답
 */
export interface CustomerReviewsListResponse {
  success: boolean;
  data?: {
    customer_id: string;
    reviews: CustomerReview[];
    total_count: number;
  };
  error?: string;
}

/**
 * Customer Review 삭제 응답
 */
export interface DeleteCustomerReviewsResponse {
  success: boolean;
  message: string;
  deleted_count?: number;
}

// ==================== API 클래스 ====================

export class CustomerReviewApi {
  /**
   * 고객의 Customer Reviews 목록 조회
   *
   * @param customerId 고객 ID
   * @param limit 조회 개수 (기본: 10)
   * @returns Customer Reviews 목록
   */
  static async getCustomerReviews(
    customerId: string,
    limit: number = 10
  ): Promise<CustomerReviewsListResponse> {
    try {
      const data = await api.get<{
        success?: boolean;
        data?: CustomerReview[];
        count?: number;
        total?: number;
        message?: string;
        error?: string;
      }>(`${CR_API_URL}/customers/${customerId}/customer-reviews?limit=${limit}`);

      if (data.success !== false) {
        return {
          success: true,
          data: {
            customer_id: customerId,
            reviews: Array.isArray(data.data) ? data.data : [],
            total_count: data.total || data.count || 0,
          },
        };
      }

      throw new Error(data.message || data.error || 'Customer Reviews 조회에 실패했습니다.');
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : (error instanceof Error ? error.message : 'Customer Reviews 조회 중 오류가 발생했습니다.');
      errorReporter.reportApiError(error as Error, { component: 'CustomerReviewApi.getCustomerReviews', payload: { customerId } });
      return { success: false, error: message };
    }
  }

  /**
   * Customer Reviews 삭제 (복수 선택 가능)
   *
   * @param customerId 고객 ID
   * @param indices 삭제할 리뷰 인덱스 배열 (최신순 기준)
   * @returns 삭제 결과
   */
  static async deleteCustomerReviews(
    customerId: string,
    indices: number[]
  ): Promise<DeleteCustomerReviewsResponse> {
    try {
      const data = await apiRequest<{
        success?: boolean;
        message?: string;
        deleted_count?: number;
      }>(
        `${CR_API_URL}/customers/${customerId}/customer-reviews`,
        { method: 'DELETE', body: { indices } }
      );

      if (data.success) {
        return {
          success: true,
          message: data.message || 'Customer Reviews가 삭제되었습니다',
          deleted_count: data.deleted_count,
        };
      }

      throw new Error(data.message || 'Customer Reviews 삭제에 실패했습니다');
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : (error instanceof Error ? error.message : 'Customer Reviews 삭제 중 오류가 발생했습니다');
      errorReporter.reportApiError(error as Error, { component: 'CustomerReviewApi.deleteCustomerReviews', payload: { customerId, indices } });
      return { success: false, message };
    }
  }

  // ==================== 유틸리티 함수 ====================

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
   * 날짜 포맷 (ISO → YYYY.MM.DD)
   *
   * @param dateString 날짜 문자열 (ISO 8601 또는 YYYY-MM-DD)
   * @returns 포맷된 문자열 (예: "2025.09.09")
   */
  static formatDate(dateString: string | undefined | null): string {
    if (!dateString) return '-';

    try {
      // ISO 형식이면 날짜 부분만 추출
      const datePart = dateString.split('T')[0];
      const [year, month, day] = datePart.split('-');
      return `${year}.${month}.${day}`;
    } catch {
      return dateString;
    }
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
   * 퍼센트 포맷
   *
   * @param value 퍼센트 값
   * @returns 포맷된 문자열 (예: "64.15%")
   */
  static formatPercent(value: number | undefined | null): string {
    if (value === undefined || value === null) return '-';
    return `${value.toFixed(2)}%`;
  }

  /**
   * 펀드 개수 텍스트
   *
   * @param count 펀드 개수
   * @returns 포맷된 문자열 (예: "3개")
   */
  static formatFundCount(count: number | undefined | null): string {
    if (count === undefined || count === null) return '-';
    return `${count}개`;
  }

  /**
   * 파싱 상태 텍스트
   *
   * @param status 파싱 상태
   * @returns 한글 상태 텍스트
   */
  static getStatusText(status: CustomerReview['status']): string {
    switch (status) {
      case 'completed': return '완료';
      case 'processing': return '처리 중';
      case 'pending': return '대기 중';
      case 'error': return '실패';
      default: return '-';
    }
  }

  /**
   * 파싱 상태 CSS 클래스
   *
   * @param status 파싱 상태
   * @returns CSS 클래스명
   */
  static getStatusClass(status: CustomerReview['status']): string {
    switch (status) {
      case 'completed': return 'status--completed';
      case 'processing': return 'status--processing';
      case 'pending': return 'status--pending';
      case 'error': return 'status--error';
      default: return '';
    }
  }
}
