import { errorReporter } from '@/shared/lib/errorReporter';

const ADDRESS_API_URL = '/api/address';

export interface AddressSearchResult {
  roadAddr: string;
  roadAddrPart1: string;
  jibunAddr: string;
  zipNo: string;
  building_name?: string;
  siNm?: string;
}

export interface AddressSearchResponse {
  success: boolean;
  data?: {
    results: AddressSearchResult[];
    total: number;
    page: number;
    size: number;
    totalPages: number;
    is_end: boolean;
  };
  error?: string;
}

export interface FormattedAddress {
  postal_code: string;
  address1: string;
  address2: string;
  /** 주소 검증 상태: verified(검증됨), pending(미검증), failed(검증실패) */
  verification_status?: 'verified' | 'pending' | 'failed';
}

export class AddressApi {
  static async searchAddress(
    keyword: string,
    page: number = 1,
    size: number = 30
  ): Promise<AddressSearchResponse> {
    if (!keyword.trim()) {
      return {
        success: false,
        error: 'No search keyword provided'
      };
    }

    try {
      const response = await fetch(
        `${ADDRESS_API_URL}/search?keyword=${encodeURIComponent(keyword)}&page=${page}&size=${size}`
      );
      const data = await response.json();

      if (data.success) {
        return {
          success: true,
          data: {
            results: data.data.results || [],
            total: data.data.total || 0,
            page: data.data.page || page,
            size: data.data.size || size,
            totalPages: data.data.totalPages || 1,
            is_end: data.data.is_end || false
          }
        };
      }

      throw new Error(data.error || '주소 검색에 실패했습니다.');
    } catch (error) {
      console.error('AddressApi.searchAddress:', error);
      errorReporter.reportApiError(error as Error, { component: 'AddressApi.searchAddress', payload: { keyword } });
      return {
        success: false,
        error: error instanceof Error ? error.message : '주소 검색 중 오류가 발생했습니다.'
      };
    }
  }

  static formatAddressForForm(addressData: AddressSearchResult): FormattedAddress {
    return {
      postal_code: addressData.zipNo || '',
      address1: addressData.roadAddrPart1 || addressData.roadAddr || '',
      address2: '',
      verification_status: 'verified'  // 주소 API에서 선택한 주소 = 검증됨
    };
  }

  /**
   * 주소 자동 검증
   * 현재 주소를 API로 검색하여 존재하는 주소인지 확인
   * @param address1 검증할 도로명주소
   * @returns 'verified' (존재함) 또는 'failed' (존재하지 않음)
   */
  static async verifyAddress(address1: string): Promise<'verified' | 'failed'> {
    if (!address1 || !address1.trim()) {
      return 'failed';
    }

    try {
      // 주소 검색 수행
      const result = await this.searchAddress(address1.trim(), 1, 10);

      if (!result.success || !result.data?.results?.length) {
        return 'failed';
      }

      // 검색 결과 중 도로명주소가 입력값을 포함하거나 일치하는지 확인
      const normalizedInput = address1.trim().replace(/\s+/g, ' ').toLowerCase();
      const hasMatch = result.data.results.some(item => {
        const roadAddr = (item.roadAddrPart1 || item.roadAddr || '').toLowerCase();
        // 입력값이 검색 결과에 포함되거나, 검색 결과가 입력값을 포함하면 검증 성공
        return roadAddr.includes(normalizedInput) || normalizedInput.includes(roadAddr.split(' ').slice(0, 3).join(' '));
      });

      return hasMatch ? 'verified' : 'failed';
    } catch (error) {
      console.error('AddressApi.verifyAddress:', error);
      errorReporter.reportApiError(error as Error, { component: 'AddressApi.verifyAddress', payload: { address1 } });
      return 'failed';
    }
  }
}
