/**
 * Test: API Endpoint - Duplicate Customer Name Rejection
 * POST /api/customers에서 중복 고객명 등록 시도 시 409 Conflict 반환 확인
 */

const axios = require('axios');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3010';
const TEST_USER_EMAIL = 'test@example.com';
const TEST_USER_PASSWORD = 'password';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

let testsPassed = 0;
let testsFailed = 0;
let authToken = null;
let createdCustomerId = null;

function assert(condition, testName, errorMessage) {
  if (condition) {
    console.log(`${GREEN}✓${RESET} ${testName}`);
    testsPassed++;
  } else {
    console.log(`${RED}✗${RESET} ${testName}`);
    console.log(`  ${RED}${errorMessage}${RESET}`);
    testsFailed++;
  }
}

function stepHeader(stepNumber, stepName) {
  console.log(`\n${BLUE}${'='.repeat(60)}${RESET}`);
  console.log(`${BLUE}STEP ${stepNumber}: ${stepName}${RESET}`);
  console.log(`${BLUE}${'='.repeat(60)}${RESET}`);
}

async function login() {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/login`, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD
    });
    return response.data.token;
  } catch (error) {
    console.error('Login failed:', error.response?.data || error.message);
    throw new Error('Login failed');
  }
}

async function test() {
  try {
    console.log(`${YELLOW}🚀 Starting API Duplicate Customer Rejection Test${RESET}\n`);

    // ========== STEP 0: 로그인 ==========
    stepHeader(0, '테스트 사용자 로그인');
    authToken = await login();
    assert(authToken !== null, 'Login successful', 'Failed to get auth token');
    console.log(`  ${YELLOW}→ Token:${RESET} ${authToken.substring(0, 20)}...`);

    const uniqueName = `API_TEST_DUPLICATE_${Date.now()}`;

    // ========== STEP 1: 고객 생성 (201 Created) ==========
    stepHeader(1, '고객 생성 (POST /api/customers)');

    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/customers`,
        {
          personal_info: { name: uniqueName },
          insurance_info: { customer_type: '개인' }
        },
        {
          headers: { Authorization: `Bearer ${authToken}` }
        }
      );

      assert(response.status === 200, 'Status code is 200', `Status is ${response.status}`);
      assert(response.data.success === true, 'Response success is true', 'success should be true');
      assert(response.data.data._id !== undefined, 'Customer ID returned', 'Missing customer _id');

      createdCustomerId = response.data.data._id;
      console.log(`  ${YELLOW}→ Created customer ID:${RESET} ${createdCustomerId}`);
      console.log(`  ${YELLOW}→ Customer name:${RESET} ${response.data.data.personal_info.name}`);
    } catch (error) {
      assert(false, 'Customer creation should succeed', error.response?.data?.error || error.message);
    }

    // ========== STEP 2: 중복 이름으로 등록 시도 (409 Conflict 기대) ==========
    stepHeader(2, '중복 고객명으로 등록 시도 (409 Conflict 기대)');

    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/customers`,
        {
          personal_info: { name: uniqueName },
          insurance_info: { customer_type: '개인' }
        },
        {
          headers: { Authorization: `Bearer ${authToken}` }
        }
      );

      // 성공하면 안 됨!
      assert(false, 'Duplicate should be rejected', `Expected 409, got ${response.status}`);
    } catch (error) {
      if (error.response) {
        const { status, data } = error.response;

        assert(status === 409, 'Status code is 409 Conflict', `Status is ${status}`);
        console.log(`  ${YELLOW}→ HTTP Status:${RESET} ${status}`);

        assert(data.success === false, 'Response success is false', 'success should be false');
        console.log(`  ${YELLOW}→ success:${RESET} ${data.success}`);

        assert(
          data.error === '이미 동일한 이름과 고객 유형을 가진 고객이 존재합니다.',
          'Correct error message',
          `Error message is: ${data.error}`
        );
        console.log(`  ${YELLOW}→ error:${RESET} ${data.error}`);

        if (data.details) {
          console.log(`  ${YELLOW}→ field:${RESET} ${data.details.field}`);
          console.log(`  ${YELLOW}→ value:${RESET} ${data.details.value}`);
          console.log(`  ${YELLOW}→ customerType:${RESET} ${data.details.customerType}`);
        }
      } else {
        assert(false, 'Should get HTTP error response', error.message);
      }
    }

    // ========== STEP 3: 고객 소프트 삭제 ==========
    stepHeader(3, '고객 소프트 삭제 (DELETE /api/customers/:id)');

    try {
      const response = await axios.delete(
        `${API_BASE_URL}/api/customers/${createdCustomerId}`,
        {
          headers: { Authorization: `Bearer ${authToken}` }
        }
      );

      assert(response.status === 200, 'Status code is 200', `Status is ${response.status}`);
      assert(response.data.success === true, 'Response success is true', 'success should be true');
      assert(response.data.soft_delete === true, 'Soft delete confirmed', 'soft_delete should be true');

      console.log(`  ${YELLOW}→ Soft delete:${RESET} ${response.data.soft_delete}`);
      console.log(`  ${YELLOW}→ Message:${RESET} ${response.data.message}`);
    } catch (error) {
      assert(false, 'Soft delete should succeed', error.response?.data?.error || error.message);
    }

    // ========== STEP 4: 비활성 고객과 중복 이름으로 등록 시도 (409 Conflict 기대) ==========
    stepHeader(4, '비활성 고객과 중복 이름으로 등록 시도 (409 Conflict 기대)');

    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/customers`,
        {
          personal_info: { name: uniqueName },
          insurance_info: { customer_type: '개인' }
        },
        {
          headers: { Authorization: `Bearer ${authToken}` }
        }
      );

      // 성공하면 안 됨!
      assert(false, 'Duplicate should be rejected (even inactive)', `Expected 409, got ${response.status}`);
    } catch (error) {
      if (error.response) {
        const { status, data } = error.response;

        assert(status === 409, 'Status code is 409 Conflict', `Status is ${status}`);
        assert(data.success === false, 'Response success is false', 'success should be false');
        assert(
          data.error === '이미 동일한 이름과 고객 유형을 가진 고객이 존재합니다.',
          'Correct error message',
          `Error message is: ${data.error}`
        );

        console.log(`  ${YELLOW}→ HTTP Status:${RESET} ${status}`);
        console.log(`  ${YELLOW}→ error:${RESET} ${data.error}`);
        console.log(`  ${YELLOW}→ IMPORTANT:${RESET} Unique constraint applies to ALL customers (active + inactive)`);
      } else {
        assert(false, 'Should get HTTP error response', error.message);
      }
    }

    // ========== STEP 5: 영구 삭제 (Cleanup) ==========
    stepHeader(5, '영구 삭제 (Cleanup)');

    try {
      const response = await axios.delete(
        `${API_BASE_URL}/api/customers/${createdCustomerId}?permanent=true`,
        {
          headers: { Authorization: `Bearer ${authToken}` }
        }
      );

      assert(response.status === 200, 'Status code is 200', `Status is ${response.status}`);
      assert(response.data.permanent === true, 'Permanent delete confirmed', 'permanent should be true');

      console.log(`  ${YELLOW}→ Permanent delete:${RESET} ${response.data.permanent}`);
      console.log(`  ${YELLOW}→ Cleanup complete${RESET}`);
    } catch (error) {
      console.log(`  ${YELLOW}⚠ Cleanup failed (non-critical):${RESET}`, error.message);
    }

    // ========== 최종 요약 ==========
    console.log('\n' + '='.repeat(60));
    console.log(`${GREEN}✓ Tests Passed: ${testsPassed}${RESET}`);
    if (testsFailed > 0) {
      console.log(`${RED}✗ Tests Failed: ${testsFailed}${RESET}`);
      process.exit(1);
    }
    console.log(`${YELLOW}🎉 All API duplicate rejection tests passed!${RESET}`);
    console.log(`${YELLOW}📊 Total scenarios verified: 6${RESET}`);

  } catch (error) {
    console.error(`${RED}❌ Test failed:${RESET}`, error.message);
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  test();
}

module.exports = { test };
