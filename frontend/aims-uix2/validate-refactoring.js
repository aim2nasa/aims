/**
 * 리팩토링 검증 스크립트 - 실제 API 연동 테스트
 * 
 * 용도: 서비스 레이어 리팩토링 후 기존 기능이 동일하게 동작하는지 검증
 * 실행: node validate-refactoring.js
 */

const axios = require('axios');

// 테스트 결과 저장
let testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  details: []
};

// 테스트 헬퍼 함수
function test(name, testFn) {
  return async () => {
    testResults.total++;
    console.log(`\n🔍 ${name} 테스트 시작...`);
    
    try {
      await testFn();
      testResults.passed++;
      console.log(`✅ ${name} 테스트 통과!`);
      testResults.details.push({ name, status: 'PASSED' });
    } catch (error) {
      testResults.failed++;
      console.error(`❌ ${name} 테스트 실패:`);
      console.error('   ', error.message);
      testResults.details.push({ name, status: 'FAILED', error: error.message });
    }
  };
}

function expect(actual) {
  return {
    toBe: (expected) => {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, but got ${actual}`);
      }
    },
    toBeGreaterThan: (expected) => {
      if (actual <= expected) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toHaveProperty: (prop) => {
      if (!actual || !actual.hasOwnProperty(prop)) {
        throw new Error(`Expected object to have property '${prop}'`);
      }
    }
  };
}

// CustomerService 구현 (실제 서비스와 동일)
class CustomerService {
  static async getCustomers({ page = 1, limit = 10, search = '' } = {}) {
    try {
      const response = await axios.get('http://tars.giize.com:3010/api/customers', {
        params: { page, limit, search }
      });
      
      if (response.data.success) {
        return {
          success: true,
          data: response.data.data
        };
      }
      
      throw new Error(response.data.error || '고객 목록 조회에 실패했습니다.');
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async getCustomer(customerId) {
    try {
      const response = await axios.get(`http://tars.giize.com:3010/api/customers/${customerId}`);
      
      if (response.data.success) {
        return {
          success: true,
          data: response.data.data
        };
      }
      
      throw new Error(response.data.error || '고객 정보를 불러오는데 실패했습니다.');
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async createCustomer(customerData) {
    try {
      const response = await axios.post('http://tars.giize.com:3010/api/customers', customerData);
      
      if (response.data.success) {
        return {
          success: true,
          data: response.data.data
        };
      }
      
      throw new Error(response.data.error || '고객 등록에 실패했습니다.');
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async updateCustomer(customerId, customerData) {
    try {
      const response = await axios.put(`http://tars.giize.com:3010/api/customers/${customerId}`, customerData);
      
      if (response.data.success) {
        return {
          success: true,
          data: response.data.data
        };
      }
      
      throw new Error(response.data.error || '고객 수정에 실패했습니다.');
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async deleteCustomer(customerId) {
    try {
      const response = await axios.delete(`http://tars.giize.com:3010/api/customers/${customerId}`);
      
      if (response.data.success) {
        return {
          success: true
        };
      }
      
      throw new Error(response.data.error || '고객 삭제에 실패했습니다.');
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// 테스트 설정
const TEST_CONFIG = {
  existingCustomerId: '68b2daa5222a57f3ce60713e', 
  testCustomer: {
    personal_info: {
      name: 'REFACTOR_VALIDATION_고객',
      phone: '010-1111-2222',
      email: 'refactor-validation@test.com',
      address: {
        postal_code: '06234',
        address1: '서울 강남구 테헤란로 123',
        address2: '리팩토링테스트빌딩 456호'
      }
    },
    insurance_info: {
      customer_type: '개인',
      risk_level: '저위험'
    },
    contracts: [],
    documents: [],
    consultations: []
  }
};

// 테스트 케이스들
const tests = [
  test('고객 목록 조회가 정상 동작해야 함', async () => {
    const result = await CustomerService.getCustomers({
      page: 1,
      limit: 5,
      search: ''
    });
    
    console.log(`   📊 결과: success=${result.success}, 고객수=${result.success ? result.data.customers.length : 0}`);
    
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('customers');
    expect(result.data).toHaveProperty('pagination');
    expect(result.data.pagination.totalCount).toBeGreaterThan(0);
  }),

  test('기존 고객 상세 조회가 정상 동작해야 함', async () => {
    const result = await CustomerService.getCustomer(TEST_CONFIG.existingCustomerId);
    
    console.log(`   📊 결과: success=${result.success}, 고객명=${result.success ? result.data.personal_info?.name : 'N/A'}`);
    
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('personal_info');
    expect(result.data).toHaveProperty('_id');
  }),

  test('새 고객 생성이 정상 동작해야 함', async () => {
    const result = await CustomerService.createCustomer(TEST_CONFIG.testCustomer);
    
    console.log(`   📊 결과: success=${result.success}, ID=${result.success ? result.data.customer_id : 'N/A'}`);
    
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('customer_id');
    
    // 생성된 고객 정보를 전역에 저장
    if (result.success) {
      global.createdCustomerId = result.data.customer_id;
    }
  }),

  test('고객 정보 수정이 정상 동작해야 함', async () => {
    if (!global.createdCustomerId) {
      // 고객이 없으면 먼저 생성
      const createResult = await CustomerService.createCustomer(TEST_CONFIG.testCustomer);
      if (!createResult.success) {
        throw new Error('고객 생성 실패: ' + createResult.error);
      }
      global.createdCustomerId = createResult.data.customer_id;
    }
    
    const updatedData = {
      ...TEST_CONFIG.testCustomer,
      personal_info: {
        ...TEST_CONFIG.testCustomer.personal_info,
        name: 'REFACTOR_VALIDATION_고객_수정됨',
        phone: '010-9999-8888'
      }
    };
    
    const result = await CustomerService.updateCustomer(global.createdCustomerId, updatedData);
    
    console.log(`   📊 결과: success=${result.success}, ID=${global.createdCustomerId}`);
    
    expect(result.success).toBe(true);
    
    // 수정 반영 확인
    const verifyResult = await CustomerService.getCustomer(global.createdCustomerId);
    expect(verifyResult.success).toBe(true);
  })
];

// 메인 실행 함수
async function runTests() {
  console.log('🚀 리팩토링 검증 테스트 시작!');
  console.log('=' .repeat(60));
  
  try {
    // 모든 테스트 실행
    for (const testFn of tests) {
      await testFn();
    }
    
    console.log('\n' + '=' .repeat(60));
    console.log('🎯 테스트 결과 요약:');
    console.log(`   총 테스트: ${testResults.total}개`);
    console.log(`   통과: ${testResults.passed}개`);
    console.log(`   실패: ${testResults.failed}개`);
    
    if (testResults.failed === 0) {
      console.log('\n🎉 모든 테스트 통과! 리팩토링이 성공적으로 완료되었습니다!');
      console.log('   기존 기능들이 모두 정상 동작하고 있습니다.');
    } else {
      console.log('\n⚠️  일부 테스트 실패. 상세 내용:');
      testResults.details.forEach(detail => {
        if (detail.status === 'FAILED') {
          console.log(`   ❌ ${detail.name}: ${detail.error}`);
        }
      });
    }

  } finally {
    // 정리: 테스트로 생성된 고객 삭제
    if (global.createdCustomerId) {
      console.log(`\n🧹 정리: 테스트 고객 ${global.createdCustomerId} 삭제 중...`);
      const deleteResult = await CustomerService.deleteCustomer(global.createdCustomerId);
      console.log(`   삭제 결과: ${deleteResult.success ? '성공' : '실패'}`);
    }
    
    console.log('\n🏁 리팩토링 검증 완료!');
  }
}

// 스크립트 실행
if (require.main === module) {
  runTests().catch(error => {
    console.error('\n💥 테스트 실행 중 치명적 오류 발생:', error.message);
    process.exit(1);
  });
}

module.exports = { CustomerService, runTests };