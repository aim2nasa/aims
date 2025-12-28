/**
 * OCR 자동 재시도 로직 테스트
 *
 * 테스트 시나리오:
 * 1. 429 에러 시 자동 재시도가 스케줄링되는지 확인
 * 2. 5xx 에러 시 자동 재시도가 스케줄링되는지 확인
 * 3. 4xx 에러 (429 제외) 시 재시도가 스케줄링되지 않는지 확인
 * 4. retry_count >= 3 이면 재시도가 스케줄링되지 않는지 확인
 */

const assert = require('assert');

// 테스트용 mock 데이터
const testCases = [
  {
    name: '429 에러 - 재시도 O (1회차)',
    input: {
      status: 'error',
      error_code: '429',
      file_id: 'test_doc_1',
      owner_id: 'test_owner',
      retry_count: 0
    },
    expected: {
      retry_scheduled: true,
      new_retry_count: 1,
      delay: 10000
    }
  },
  {
    name: '429 에러 - 재시도 O (2회차)',
    input: {
      status: 'error',
      error_code: '429',
      file_id: 'test_doc_2',
      owner_id: 'test_owner',
      retry_count: 1
    },
    expected: {
      retry_scheduled: true,
      new_retry_count: 2,
      delay: 20000
    }
  },
  {
    name: '429 에러 - 재시도 O (3회차)',
    input: {
      status: 'error',
      error_code: '429',
      file_id: 'test_doc_3',
      owner_id: 'test_owner',
      retry_count: 2
    },
    expected: {
      retry_scheduled: true,
      new_retry_count: 3,
      delay: 30000
    }
  },
  {
    name: '429 에러 - 재시도 X (3회 초과)',
    input: {
      status: 'error',
      error_code: '429',
      file_id: 'test_doc_4',
      owner_id: 'test_owner',
      retry_count: 3
    },
    expected: {
      retry_scheduled: false,
      reason: 'max_retry_exceeded'
    }
  },
  {
    name: '500 에러 - 재시도 O',
    input: {
      status: 'error',
      error_code: '500',
      file_id: 'test_doc_5',
      owner_id: 'test_owner',
      retry_count: 0
    },
    expected: {
      retry_scheduled: true,
      new_retry_count: 1,
      delay: 10000
    }
  },
  {
    name: '502 에러 - 재시도 O',
    input: {
      status: 'error',
      error_code: '502',
      file_id: 'test_doc_6',
      owner_id: 'test_owner',
      retry_count: 0
    },
    expected: {
      retry_scheduled: true,
      new_retry_count: 1,
      delay: 10000
    }
  },
  {
    name: '400 에러 - 재시도 X (클라이언트 에러)',
    input: {
      status: 'error',
      error_code: '400',
      file_id: 'test_doc_7',
      owner_id: 'test_owner',
      retry_count: 0
    },
    expected: {
      retry_scheduled: false,
      reason: 'not_retryable_error'
    }
  },
  {
    name: '404 에러 - 재시도 X (클라이언트 에러)',
    input: {
      status: 'error',
      error_code: '404',
      file_id: 'test_doc_8',
      owner_id: 'test_owner',
      retry_count: 0
    },
    expected: {
      retry_scheduled: false,
      reason: 'not_retryable_error'
    }
  },
  {
    name: 'done 상태 - 재시도 X',
    input: {
      status: 'done',
      error_code: null,
      file_id: 'test_doc_9',
      owner_id: 'test_owner',
      retry_count: 0
    },
    expected: {
      retry_scheduled: false,
      reason: 'not_error_status'
    }
  }
];

/**
 * 재시도 로직 시뮬레이션
 */
function simulateRetryLogic(input) {
  const { status, error_code, retry_count } = input;

  // 에러 상태가 아니면 재시도 안함
  if (status !== 'error') {
    return {
      retry_scheduled: false,
      reason: 'not_error_status'
    };
  }

  // 429 또는 5xx 에러인지 확인
  const isRetryableError = error_code === '429' ||
                           (error_code && parseInt(error_code) >= 500);

  if (!isRetryableError) {
    return {
      retry_scheduled: false,
      reason: 'not_retryable_error'
    };
  }

  // 최대 재시도 횟수 확인
  if (retry_count >= 3) {
    return {
      retry_scheduled: false,
      reason: 'max_retry_exceeded'
    };
  }

  // 재시도 스케줄링
  const newRetryCount = retry_count + 1;
  const delay = 10000 * newRetryCount;

  return {
    retry_scheduled: true,
    new_retry_count: newRetryCount,
    delay
  };
}

/**
 * 테스트 실행
 */
function runTests() {
  console.log('🧪 OCR 자동 재시도 로직 테스트\n');
  console.log('='.repeat(60));

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const result = simulateRetryLogic(testCase.input);

    try {
      // retry_scheduled 확인
      assert.strictEqual(
        result.retry_scheduled,
        testCase.expected.retry_scheduled,
        `retry_scheduled 불일치`
      );

      if (testCase.expected.retry_scheduled) {
        // 재시도가 스케줄링된 경우
        assert.strictEqual(
          result.new_retry_count,
          testCase.expected.new_retry_count,
          `new_retry_count 불일치`
        );
        assert.strictEqual(
          result.delay,
          testCase.expected.delay,
          `delay 불일치`
        );
      } else {
        // 재시도가 스케줄링되지 않은 경우
        assert.strictEqual(
          result.reason,
          testCase.expected.reason,
          `reason 불일치`
        );
      }

      console.log(`✅ ${testCase.name}`);
      passed++;
    } catch (err) {
      console.log(`❌ ${testCase.name}`);
      console.log(`   기대값: ${JSON.stringify(testCase.expected)}`);
      console.log(`   실제값: ${JSON.stringify(result)}`);
      console.log(`   오류: ${err.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 결과: ${passed}개 통과, ${failed}개 실패\n`);

  if (failed === 0) {
    console.log('🎉 모든 테스트 통과!');
    return true;
  } else {
    console.log('⚠️ 일부 테스트 실패');
    return false;
  }
}

// 테스트 실행
const success = runTests();
process.exit(success ? 0 : 1);
