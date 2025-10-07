/**
 * AIMS - 고객 삭제 스크립트
 * @description 특정 고객 또는 전체 고객 삭제
 * @usage
 *   node scripts/delete_customers.js --all                    # 전체 삭제
 *   node scripts/delete_customers.js --id 고객ID              # 특정 고객 삭제
 *   node scripts/delete_customers.js --type 개인              # 개인고객만 삭제
 *   node scripts/delete_customers.js --type 법인              # 법인고객만 삭제
 *   node scripts/delete_customers.js --confirm               # 확인 없이 즉시 삭제
 */

const axios = require('axios');
const readline = require('readline');

// API 엔드포인트 설정
const API_BASE_URL = 'http://tars.giize.com:3010/api';
const CUSTOMERS_ENDPOINT = `${API_BASE_URL}/customers`;

// 명령줄 인자 파싱
const args = process.argv.slice(2);
const options = {
  all: args.includes('--all'),
  id: args.includes('--id') ? args[args.indexOf('--id') + 1] : null,
  type: args.includes('--type') ? args[args.indexOf('--type') + 1] : null,
  confirm: args.includes('--confirm'),
};

/**
 * 사용자 확인 프롬프트
 */
function askConfirmation(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * 전체 고객 조회
 */
async function getAllCustomers() {
  try {
    const response = await axios.get(`${CUSTOMERS_ENDPOINT}?limit=1000`);
    // API 응답 구조: { success: true, data: { customers: [...], pagination: {...} } }
    return response.data?.data?.customers || response.data?.customers || [];
  } catch (error) {
    console.error('❌ 고객 목록 조회 실패:', error.response?.data?.message || error.message);
    return [];
  }
}

/**
 * 특정 고객 조회
 */
async function getCustomer(id) {
  try {
    const response = await axios.get(`${CUSTOMERS_ENDPOINT}/${id}`);
    return response.data.data || response.data;
  } catch (error) {
    console.error(`❌ 고객 조회 실패 (ID: ${id}):`, error.response?.data?.message || error.message);
    return null;
  }
}

/**
 * 고객 삭제
 */
async function deleteCustomer(id) {
  try {
    await axios.delete(`${CUSTOMERS_ENDPOINT}/${id}`);
    return { success: true, id };
  } catch (error) {
    return {
      success: false,
      id,
      error: error.response?.data?.message || error.message,
    };
  }
}

/**
 * 특정 고객 삭제 실행
 */
async function deleteSingleCustomer(id) {
  console.log(`\n🔍 고객 정보 조회 중... (ID: ${id})`);

  const customer = await getCustomer(id);
  if (!customer) {
    console.log('❌ 고객을 찾을 수 없습니다.');
    return;
  }

  console.log('\n📋 삭제할 고객 정보:');
  console.log(`  - ID: ${customer._id}`);
  console.log(`  - 이름: ${customer.personal_info?.name || '없음'}`);
  console.log(`  - 유형: ${customer.insurance_info?.customer_type || '개인'}`);
  console.log(`  - 연락처: ${customer.personal_info?.mobile_phone || '없음'}`);

  if (!options.confirm) {
    const confirmed = await askConfirmation('\n정말로 이 고객을 삭제하시겠습니까?');
    if (!confirmed) {
      console.log('❌ 삭제가 취소되었습니다.');
      return;
    }
  }

  console.log('\n🗑️  고객 삭제 중...');
  const result = await deleteCustomer(id);

  if (result.success) {
    console.log(`✅ 고객 삭제 완료: ${customer.personal_info?.name}`);
  } else {
    console.log(`❌ 고객 삭제 실패: ${result.error}`);
  }
}

/**
 * 유형별 고객 삭제 실행
 */
async function deleteByType(customerType) {
  console.log(`\n🔍 ${customerType} 고객 목록 조회 중...`);

  const allCustomers = await getAllCustomers();
  const targetCustomers = allCustomers.filter(
    customer => customer.insurance_info?.customer_type === customerType
  );

  if (targetCustomers.length === 0) {
    console.log(`❌ ${customerType} 고객이 없습니다.`);
    return;
  }

  console.log(`\n📋 삭제할 ${customerType} 고객: ${targetCustomers.length}명`);
  targetCustomers.slice(0, 5).forEach((customer, index) => {
    console.log(`  ${index + 1}. ${customer.personal_info?.name} (${customer._id})`);
  });
  if (targetCustomers.length > 5) {
    console.log(`  ... 외 ${targetCustomers.length - 5}명`);
  }

  if (!options.confirm) {
    const confirmed = await askConfirmation(
      `\n정말로 ${customerType} 고객 ${targetCustomers.length}명을 모두 삭제하시겠습니까?`
    );
    if (!confirmed) {
      console.log('❌ 삭제가 취소되었습니다.');
      return;
    }
  }

  console.log(`\n🗑️  ${customerType} 고객 삭제 중...`);
  await deleteMultipleCustomers(targetCustomers);
}

/**
 * 전체 고객 삭제 실행
 */
async function deleteAllCustomers() {
  console.log('\n🔍 전체 고객 목록 조회 중...');

  const customers = await getAllCustomers();

  if (customers.length === 0) {
    console.log('❌ 삭제할 고객이 없습니다.');
    return;
  }

  const individualCount = customers.filter(c => c.insurance_info?.customer_type === '개인').length;
  const corporateCount = customers.filter(c => c.insurance_info?.customer_type === '법인').length;

  console.log('\n📋 삭제할 고객 통계:');
  console.log(`  - 전체: ${customers.length}명`);
  console.log(`  - 개인: ${individualCount}명`);
  console.log(`  - 법인: ${corporateCount}명`);

  console.log('\n최근 등록된 고객 5명:');
  customers.slice(0, 5).forEach((customer, index) => {
    console.log(`  ${index + 1}. ${customer.personal_info?.name} (${customer.insurance_info?.customer_type || '개인'})`);
  });

  if (!options.confirm) {
    const confirmed = await askConfirmation(
      `\n⚠️  정말로 전체 고객 ${customers.length}명을 모두 삭제하시겠습니까?`
    );
    if (!confirmed) {
      console.log('❌ 삭제가 취소되었습니다.');
      return;
    }
  }

  console.log('\n🗑️  전체 고객 삭제 중...');
  await deleteMultipleCustomers(customers);
}

/**
 * 여러 고객 삭제 (병렬 처리)
 */
async function deleteMultipleCustomers(customers) {
  const results = {
    success: 0,
    failed: 0,
    errors: [],
  };

  // 배치로 나눠서 처리 (한 번에 10개씩)
  const batchSize = 10;
  for (let i = 0; i < customers.length; i += batchSize) {
    const batch = customers.slice(i, i + batchSize);
    const deletePromises = batch.map(customer => deleteCustomer(customer._id));
    const batchResults = await Promise.all(deletePromises);

    batchResults.forEach((result, index) => {
      const customer = batch[index];
      if (result.success) {
        results.success++;
        console.log(`✅ [${results.success}/${customers.length}] 삭제 완료: ${customer.personal_info?.name}`);
      } else {
        results.failed++;
        results.errors.push({
          name: customer.personal_info?.name,
          id: customer._id,
          error: result.error,
        });
        console.log(`❌ [${results.failed}] 삭제 실패: ${customer.personal_info?.name} - ${result.error}`);
      }
    });

    // API 과부하 방지를 위한 딜레이
    if (i + batchSize < customers.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // 결과 요약
  console.log('\n' + '='.repeat(60));
  console.log('📊 고객 삭제 완료 결과');
  console.log('='.repeat(60));
  console.log(`✅ 성공: ${results.success}명`);
  console.log(`❌ 실패: ${results.failed}명`);
  console.log(`📈 성공률: ${((results.success / customers.length) * 100).toFixed(2)}%`);

  if (results.errors.length > 0) {
    console.log('\n🚨 실패 상세 내역:');
    results.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error.name} (${error.id}): ${error.error}`);
    });
  }

  console.log('='.repeat(60));
}

/**
 * 사용법 출력
 */
function printUsage() {
  console.log('📖 사용법:');
  console.log('');
  console.log('  전체 고객 삭제:');
  console.log('    node scripts/delete_customers.js --all');
  console.log('');
  console.log('  특정 고객 삭제 (ID로):');
  console.log('    node scripts/delete_customers.js --id 고객ID');
  console.log('');
  console.log('  유형별 삭제:');
  console.log('    node scripts/delete_customers.js --type 개인');
  console.log('    node scripts/delete_customers.js --type 법인');
  console.log('');
  console.log('  확인 없이 즉시 삭제:');
  console.log('    node scripts/delete_customers.js --all --confirm');
  console.log('');
  console.log('  예시:');
  console.log('    node scripts/delete_customers.js --all');
  console.log('    node scripts/delete_customers.js --id 507f1f77bcf86cd799439011');
  console.log('    node scripts/delete_customers.js --type 개인 --confirm');
}

/**
 * 메인 실행 함수
 */
async function main() {
  console.log('🗑️  AIMS 고객 삭제 스크립트\n');

  // 옵션 검증
  if (!options.all && !options.id && !options.type) {
    printUsage();
    return;
  }

  if (options.id) {
    // 특정 고객 삭제
    await deleteSingleCustomer(options.id);
  } else if (options.type) {
    // 유형별 삭제
    if (options.type !== '개인' && options.type !== '법인') {
      console.log('❌ 유형은 "개인" 또는 "법인"만 가능합니다.');
      return;
    }
    await deleteByType(options.type);
  } else if (options.all) {
    // 전체 삭제
    await deleteAllCustomers();
  }

  console.log('\n✅ 작업 완료!\n');
}

// 스크립트 실행
main().catch(error => {
  console.error('❌ 스크립트 실행 중 오류 발생:', error);
  process.exit(1);
});
