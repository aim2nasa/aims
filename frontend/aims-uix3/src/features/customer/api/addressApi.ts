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
  /** 주소 API로 검증된 주소 여부 */
  is_verified?: boolean;
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
      is_verified: true  // 주소 API에서 선택한 주소 = 검증됨
    };
  }
}
