/**
 * 주소 서비스 검증 스크립트
 */

const fetch = require('node-fetch');

// AddressService 구현
class AddressService {
  static async searchAddress(keyword, page = 1, size = 30) {
    if (!keyword.trim()) {
      return {
        success: false,
        error: 'No search keyword provided'
      };
    }

    try {
      const response = await fetch(
        `http://tars.giize.com:3010/api/address/search?keyword=${encodeURIComponent(keyword)}&page=${page}&size=${size}`
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
      return {
        success: false,
        error: error.message
      };
    }
  }

  static formatAddressForForm(addressData) {
    return {
      postal_code: addressData.zipNo || '',
      address1: addressData.roadAddrPart1 || addressData.roadAddr || '',
      address2: ''
    };
  }
}

async function testAddressService() {
  console.log('🚀 주소 서비스 검증 테스트 시작!');
  
  // 1. 정상 주소 검색
  console.log('\n🔍 테헤란로 주소 검색 테스트...');
  const result1 = await AddressService.searchAddress('테헤란로', 1, 5);
  console.log(`   결과: success=${result1.success}, 결과수=${result1.success ? result1.data.results.length : 0}`);
  
  if (result1.success && result1.data.results.length > 0) {
    console.log('✅ 주소 검색 성공!');
    
    // 2. 주소 포맷 변환 테스트
    console.log('\n🔍 주소 포맷 변환 테스트...');
    const formatted = AddressService.formatAddressForForm(result1.data.results[0]);
    console.log('   변환 결과:', formatted);
    console.log('✅ 주소 포맷 변환 성공!');
  } else {
    console.log('❌ 주소 검색 실패!');
  }
  
  // 3. 빈 검색어 처리 테스트
  console.log('\n🔍 빈 검색어 처리 테스트...');
  const result2 = await AddressService.searchAddress('');
  console.log(`   결과: success=${result2.success}, error=${result2.error}`);
  
  if (!result2.success && result2.error === 'No search keyword provided') {
    console.log('✅ 빈 검색어 처리 성공!');
  } else {
    console.log('❌ 빈 검색어 처리 실패!');
  }
  
  console.log('\n🏁 주소 서비스 검증 완료!');
}

if (require.main === module) {
  testAddressService().catch(console.error);
}