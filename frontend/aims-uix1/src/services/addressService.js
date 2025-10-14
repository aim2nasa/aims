import { message } from 'antd';

const ADDRESS_API_URL = 'http://tars.giize.com:3010/api/address';

class AddressService {
  // 주소 검색
  static async searchAddress(keyword, page = 1, size = 30) {
    if (!keyword.trim()) {
      message.warning('검색어를 입력해주세요.');
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
            isEnd: data.data.is_end || false
          }
        };
      }

      throw new Error(data.error || '주소 검색에 실패했습니다.');
    } catch (error) {
      console.error('AddressService.searchAddress:', error);
      message.error('주소 검색 중 오류가 발생했습니다.');
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 주소 데이터를 폼 필드용으로 변환
  static formatAddressForForm(addressData) {
    return {
      postal_code: addressData.zipNo || '',
      address1: addressData.roadAddrPart1 || addressData.roadAddr || '',
      address2: ''
    };
  }
}

export default AddressService;