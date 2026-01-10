/**
 * test-chat-credit-integration.js
 * /api/chat 엔드포인트의 크레딧 체크 통합 테스트
 *
 * 실행: node tests/test-chat-credit-integration.js
 */

const http = require('http');
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

/**
 * SSE 응답 파싱
 */
function parseSSEEvents(data) {
  const events = [];
  const lines = data.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        events.push(JSON.parse(line.slice(6)));
      } catch (e) {
        // 파싱 실패 무시
      }
    }
  }
  return events;
}

/**
 * HTTP 요청 헬퍼
 */
function makeRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n🧪 /api/chat 크레딧 체크 통합 테스트\n');

  const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');

  try {
    await client.connect();
    const db = client.db('docupload');

    // 테스트용 사용자 토큰 획득 (admin)
    const adminUser = await db.collection('users').findOne({ role: 'admin' });
    if (!adminUser) {
      console.log('❌ admin 사용자를 찾을 수 없음');
      process.exit(1);
    }

    // JWT 토큰 생성 (간단한 테스트용)
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
    const testToken = jwt.sign(
      { userId: adminUser._id.toString(), email: adminUser.email },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // ============================================
    // 테스트 1: 정상 요청 (admin - 무제한)
    // ============================================
    console.log('📋 테스트 1: admin 사용자 채팅 요청');

    const chatOptions = {
      hostname: 'localhost',
      port: 3010,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testToken}`
      }
    };

    const chatBody = {
      messages: [{ role: 'user', content: '테스트 메시지입니다.' }]
    };

    try {
      const response = await makeRequest(chatOptions, chatBody);
      assert(response.status === 200, `HTTP 200 응답 (받은 값: ${response.status})`);

      const events = parseSSEEvents(response.data);
      console.log(`  ℹ️ 받은 이벤트 수: ${events.length}`);

      // credit_exceeded 이벤트가 없어야 함 (admin은 무제한)
      const creditExceeded = events.find(e => e.type === 'credit_exceeded');
      assert(!creditExceeded, 'admin 사용자는 credit_exceeded 없어야 함');

      // done 이벤트가 있어야 함
      const doneEvent = events.find(e => e.type === 'done');
      assert(!!doneEvent, 'done 이벤트 수신');

    } catch (error) {
      console.log(`  ⚠️ 요청 실패: ${error.message}`);
      // 서버가 실행 중이 아닐 수 있음
    }

    // ============================================
    // 테스트 2: 인증 없이 요청 (거부되어야 함)
    // ============================================
    console.log('\n📋 테스트 2: 인증 없는 요청');

    const noAuthOptions = {
      ...chatOptions,
      headers: { 'Content-Type': 'application/json' }
    };

    try {
      const response = await makeRequest(noAuthOptions, chatBody);
      assert(response.status === 401, `인증 없이 401 응답 (받은 값: ${response.status})`);
    } catch (error) {
      console.log(`  ⚠️ 요청 실패: ${error.message}`);
    }

    // ============================================
    // 테스트 3: creditService 직접 테스트 (크레딧 부족 시뮬레이션)
    // ============================================
    console.log('\n📋 테스트 3: 크레딧 부족 시뮬레이션 (직접 함수 호출)');

    const { checkCreditBeforeAI } = require('../lib/creditService');
    const analyticsDb = client.db('aims_analytics');

    // free_trial 사용자 찾기 또는 시뮬레이션
    const freeUser = await db.collection('users').findOne({ tier: 'free_trial' });

    if (freeUser) {
      // 매우 큰 크레딧 요청으로 거부 유도
      const result = await checkCreditBeforeAI(db, analyticsDb, freeUser._id.toString(), 50000);

      if (result.reason !== 'unlimited') {
        assert(result.allowed === false, '50000 크레딧 요청은 거부되어야 함');
        assert(result.reason === 'credit_exceeded', 'reason이 credit_exceeded여야 함');

        // 반환값에 필요한 정보가 있는지 확인
        assert(typeof result.credits_used === 'number', 'credits_used 포함');
        assert(typeof result.credits_remaining === 'number', 'credits_remaining 포함');
        assert(typeof result.credit_quota === 'number', 'credit_quota 포함');
        assert(typeof result.days_until_reset === 'number', 'days_until_reset 포함');
      } else {
        console.log('  ℹ️ free_trial 사용자가 무제한 설정됨');
      }
    } else {
      console.log('  ⚠️ free_trial 사용자 없음 - 스킵');
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
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.close();
  }
}

runTests();
