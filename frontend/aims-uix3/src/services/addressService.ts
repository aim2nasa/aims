/**
 * AIMS UIX-3 Address Service
 * @since 2025-10-11
 * @version 1.0.0
 *
 * 🍎 주소 관련 API 서비스
 * - Document-Controller-View 패턴 준수 (Layer 1: Service)
 * - 주소 이력 조회 API
 * - 주소 변경 API
 */

import type { AddressHistoryItem } from '@/entities/customer/model';
import { formatDateTime } from '@/shared/lib/timeUtils';
import { api } from '@/shared/lib/api';

/**
 * AddressService 클래스
 *
 * 주소 관련 API 호출을 중앙화하여 관리합니다.
 * 모든 API 호출 로직, 에러 핸들링, 재시도 로직이 여기에 집중됩니다.
 */
export class AddressService {
  /**
   * 고객의 주소 변경 이력 조회
   *
   * @param customerId - 고객 ID
   * @returns 주소 이력 배열 (최신순)
   * @throws {Error} API 호출 실패 시
   *
   * @example
   * ```typescript
   * const history = await AddressService.getAddressHistory('customer123');
   * console.log(`총 ${history.length}건의 주소 이력`);
   * ```
   */
  static async getAddressHistory(customerId: string): Promise<AddressHistoryItem[]> {
    if (!customerId) {
      throw new Error('고객 ID가 필요합니다');
    }

    try {
      // ⭐ 공유 api 클라이언트 사용 (JWT 토큰 자동 포함)
      const data = await api.get<{ success: boolean; data: AddressHistoryItem[]; message?: string }>(
        `/api/customers/${customerId}/address-history`
      );

      if (!data.success) {
        throw new Error(data.message || '주소 이력 조회에 실패했습니다');
      }

      return data.data || [];
    } catch (error) {
      console.error('[AddressService] 주소 이력 조회 실패:', error);

      if (error instanceof Error) {
        throw error;
      }

      throw new Error('주소 이력을 불러오는 중 오류가 발생했습니다');
    }
  }

  /**
   * 주소 포맷팅 유틸리티
   *
   * @param address - 주소 객체
   * @returns 포맷팅된 주소 문자열
   */
  static formatAddress(address: AddressHistoryItem['address']): string {
    if (!address) return '주소 없음';

    const parts = [];
    if (address.postal_code) parts.push(`[${address.postal_code}]`);
    if (address.address1) parts.push(address.address1);
    if (address.address2) parts.push(address.address2);

    return parts.join(' ') || '주소 없음';
  }

  /**
   * 날짜 포맷팅 유틸리티
   *
   * @param dateString - ISO 날짜 문자열
   * @returns 포맷팅된 날짜 문자열
   */
  static formatDate(dateString: string): string {
    try {
      return formatDateTime(dateString);
    } catch (error) {
      console.error('[AddressService] 날짜 포맷팅 실패:', error);
      return dateString;
    }
  }
}

export default AddressService;
