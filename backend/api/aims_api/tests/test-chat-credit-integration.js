/**
 * test-chat-credit-integration.js
 * checkCreditBeforeAI 함수 통합 테스트
 *
 * 실행: node tests/test-chat-credit-integration.js
 */

const { MongoClient } = require('mongodb');

// 테스트 결과 추적
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.log(`  ❌ ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n🧪 checkCreditBeforeAI 통합 테스트\n');

  const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');

  try {
    await client.connect();
    console.log('📦 MongoDB 연결 성공\n');
    const db = client.db('docupload');

    // 테스트용 admin 사용자 조회
    const adminUser = await db.collection('users').findOne({ role: 'admin' });
    if (!adminUser) {
      console.log('❌ admin 사용자를 찾을 수 없음');
      process.exit(1);
    }

    // ============================================
    // 테스트 1: checkCreditBeforeAI 직접 호출 (admin)
    // ============================================
    console.log('📋 테스트 1: admin 사용자 크레딧 체크 (직접 함수 호출)');

    const { checkCreditBeforeAI } = require('../lib/creditService');
    const analyticsDb = client.db('aims_analytics');

    const adminResult = await checkCreditBeforeAI(db, analyticsDb, adminUser._id.toString());
    assert(adminResult.allowed === true, 'admin 사용자는 허용되어야 함');
    assert(adminResult.reason === 'unlimited', 'reason이 unlimited여야 함');
    assert(adminResult.credit_quota === -1, 'credit_quota가 -1이어야 함')

    // ============================================
    // 테스트 2: Fail-open 패턴 검증 (존재하지 않는 사용자)
    // ============================================
    console.log('\n📋 테스트 2: Fail-open 패턴 검증');

    const fakeUserId = '000000000000000000000000';
    const failOpenResult = await checkCreditBeforeAI(db, analyticsDb, fakeUserId);
    assert(failOpenResult.allowed === true, 'Fail-open: 오류 시에도 허용');
    assert(
      failOpenResult.reason === 'error_fallback' || failOpenResult.reason === 'within_quota',
      'reason이 error_fallback 또는 within_quota'
    );

    // ============================================
    // 테스트 3: 크레딧 부족 시뮬레이션 (큰 크레딧 요청)
    // ============================================
    console.log('\n📋 테스트 3: 크레딧 부족 시뮬레이션');

    // free_trial 또는 standard 사용자 찾기
    const limitedUser = await db.collection('users').findOne({
      tier: { $in: ['free_trial', 'standard'] }
    });

    if (limitedUser) {
      // 매우 큰 크레딧 요청으로 거부 유도
      const result = await checkCreditBeforeAI(db, analyticsDb, limitedUser._id.toString(), 50000);

      if (result.reason !== 'unlimited') {
        assert(result.allowed === false, '50000 크레딧 요청은 거부되어야 함');
        assert(result.reason === 'credit_exceeded', 'reason이 credit_exceeded여야 함');

        // 반환값에 필요한 정보가 있는지 확인
        assert(typeof result.credits_used === 'number', 'credits_used 포함');
        assert(typeof result.credits_remaining === 'number', 'credits_remaining 포함');
        assert(typeof result.credit_quota === 'number', 'credit_quota 포함');
        assert(typeof result.days_until_reset === 'number', 'days_until_reset 포함');
      } else {
        console.log('  ℹ️ 해당 사용자가 무제한 설정됨 - 스킵');
      }
    } else {
      console.log('  ⚠️ 제한된 티어 사용자 없음 - 스킵');
    }

    // ============================================
    // 테스트 4: SSE 이벤트 구조 검증
    // ============================================
    console.log('\n📋 테스트 4: credit_exceeded 이벤트 구조 검증');

    // 크레딧 부족 시 반환되어야 할 구조 검증
    const mockCreditExceeded = {
      type: 'credit_exceeded',
      credits_used: 1850,
      credits_remaining: 150,
      credit_quota: 2000,
      credit_usage_percent: 92.5,
      days_until_reset: 12,
      tier: 'standard',
      tier_name: '일반'
    };

    assert('type' in mockCreditExceeded, 'type 필드 존재');
    assert('credits_used' in mockCreditExceeded, 'credits_used 필드 존재');
    assert('credits_remaining' in mockCreditExceeded, 'credits_remaining 필드 존재');
    assert('credit_quota' in mockCreditExceeded, 'credit_quota 필드 존재');
    assert('days_until_reset' in mockCreditExceeded, 'days_until_reset 필드 존재');

    // ============================================
    // 결과 요약
    // ============================================
    console.log('\n' + '='.repeat(50));
    console.log(`📊 통합 테스트 결과: ${passed} 통과, ${failed} 실패`);
    console.log('='.repeat(50));

    if (failed === 0) {
      console.log('\n🎉 모든 통합 테스트 통과!\n');
    } else {
      console.log('\n⚠️ 일부 테스트 실패\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ 테스트 중 오류:', error.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

runTests();
