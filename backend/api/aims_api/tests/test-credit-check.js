/**
 * test-credit-check.js
 * checkCreditBeforeAI() 함수 테스트
 *
 * 실행: node tests/test-credit-check.js
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
  console.log('\n🧪 checkCreditBeforeAI() 테스트 시작\n');

  // MongoDB 연결
  const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');

  try {
    await client.connect();
    console.log('📦 MongoDB 연결 성공\n');

    const db = client.db('docupload');
    const analyticsDb = client.db('aims_analytics');

    // creditService 로드
    const { checkCreditBeforeAI } = require('../lib/creditService');

    // ============================================
    // 테스트 1: admin 사용자 (무제한)
    // ============================================
    console.log('📋 테스트 1: admin 사용자 (무제한)');

    // admin 사용자 조회
    const adminUser = await db.collection('users').findOne({ role: 'admin' });
    if (adminUser) {
      const result = await checkCreditBeforeAI(db, analyticsDb, adminUser._id.toString());
      assert(result.allowed === true, 'admin 사용자는 허용되어야 함');
      assert(result.reason === 'unlimited', 'reason이 unlimited여야 함');
      assert(result.credit_quota === -1, 'credit_quota가 -1이어야 함');
    } else {
      console.log('  ⚠️ admin 사용자를 찾을 수 없음 - 테스트 스킵');
    }

    // ============================================
    // 테스트 2: 일반 사용자 (크레딧 충분)
    // ============================================
    console.log('\n📋 테스트 2: 일반 사용자 (크레딧 체크)');

    // 일반 사용자 조회 (admin이 아닌)
    const normalUser = await db.collection('users').findOne({
      role: { $ne: 'admin' },
      tier: { $exists: true }
    });

    if (normalUser) {
      const result = await checkCreditBeforeAI(db, analyticsDb, normalUser._id.toString());
      assert(typeof result.allowed === 'boolean', 'allowed는 boolean이어야 함');
      assert(typeof result.credits_used === 'number' || result.reason === 'unlimited', 'credits_used는 number이어야 함');
      assert(typeof result.credit_quota === 'number' || result.reason === 'unlimited', 'credit_quota는 number이어야 함');

      if (result.allowed) {
        assert(result.reason === 'within_quota' || result.reason === 'unlimited', 'reason이 within_quota 또는 unlimited여야 함');
      } else {
        assert(result.reason === 'credit_exceeded', 'reason이 credit_exceeded여야 함');
      }

      console.log(`  ℹ️ 사용자: ${normalUser.name || normalUser.email}`);
      console.log(`  ℹ️ 티어: ${result.tier || 'N/A'}`);
      console.log(`  ℹ️ 크레딧: ${result.credits_used}/${result.credit_quota} (${result.credit_usage_percent}%)`);
    } else {
      console.log('  ⚠️ 일반 사용자를 찾을 수 없음 - 테스트 스킵');
    }

    // ============================================
    // 테스트 3: 존재하지 않는 사용자 (Fail-open)
    // ============================================
    console.log('\n📋 테스트 3: 존재하지 않는 사용자 (Fail-open 패턴)');

    const fakeUserId = '000000000000000000000000';
    const failOpenResult = await checkCreditBeforeAI(db, analyticsDb, fakeUserId);

    // Fail-open: 오류 시에도 허용되어야 함
    assert(failOpenResult.allowed === true, 'Fail-open: 존재하지 않는 사용자도 허용');
    assert(failOpenResult.reason === 'error_fallback' || failOpenResult.reason === 'within_quota',
           'reason이 error_fallback 또는 within_quota여야 함');

    // ============================================
    // 테스트 4: 큰 크레딧 요청 (한도 초과 시뮬레이션)
    // ============================================
    console.log('\n📋 테스트 4: 큰 크레딧 요청 시뮬레이션');

    if (normalUser) {
      // 매우 큰 크레딧 요구 (10000 크레딧)
      const bigResult = await checkCreditBeforeAI(db, analyticsDb, normalUser._id.toString(), 10000);

      if (bigResult.reason !== 'unlimited') {
        // 일반 사용자라면 대부분 거부될 것
        console.log(`  ℹ️ 10000 크레딧 요청 결과: ${bigResult.allowed ? '허용' : '거부'}`);
        console.log(`  ℹ️ 잔여 크레딧: ${bigResult.credits_remaining}`);
      } else {
        console.log('  ℹ️ 무제한 사용자 - 항상 허용');
      }
    }

    // ============================================
    // 테스트 5: 반환값 구조 검증
    // ============================================
    console.log('\n📋 테스트 5: 반환값 구조 검증');

    if (normalUser) {
      const result = await checkCreditBeforeAI(db, analyticsDb, normalUser._id.toString());

      // 필수 필드 확인
      assert('allowed' in result, 'allowed 필드 존재');
      assert('reason' in result, 'reason 필드 존재');

      if (result.reason !== 'error_fallback') {
        assert('credits_used' in result, 'credits_used 필드 존재');
        assert('credits_remaining' in result, 'credits_remaining 필드 존재');
        assert('credit_quota' in result, 'credit_quota 필드 존재');
        assert('credit_usage_percent' in result, 'credit_usage_percent 필드 존재');
        assert('days_until_reset' in result, 'days_until_reset 필드 존재');
      }
    }

    // ============================================
    // 결과 요약
    // ============================================
    console.log('\n' + '='.repeat(50));
    console.log(`📊 테스트 결과: ${passed} 통과, ${failed} 실패`);
    console.log('='.repeat(50));

    if (failed === 0) {
      console.log('\n🎉 모든 테스트 통과!\n');
    } else {
      console.log('\n⚠️ 일부 테스트 실패\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ 테스트 중 오류 발생:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.close();
  }
}

runTests();
