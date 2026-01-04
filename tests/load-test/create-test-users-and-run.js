#!/usr/bin/env node
/**
 * AIMS 다중 사용자 부하 테스트
 *
 * 1. 테스트 계정 100개 생성
 * 2. 각 계정으로 JWT 토큰 발급
 * 3. 다중 사용자 동시 부하 테스트 실행
 * 4. 결과 리포트 생성
 */

const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const http = require('http');
const https = require('https');
const fs = require('fs');

// ========================================
// 설정
// ========================================
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/docupload';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here'; // .env에서 가져옴
const BASE_URL = process.env.BASE_URL || 'https://aims.giize.com';
const TEST_USER_COUNT = parseInt(process.env.USER_COUNT || '100');
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '100');
const STEP_DURATION = parseInt(process.env.STEP_DURATION || '30'); // 초

console.log(`
╔══════════════════════════════════════════════════════════════╗
║  AIMS 다중 사용자 부하 테스트                                 ║
╠══════════════════════════════════════════════════════════════╣
║  테스트 계정: ${String(TEST_USER_COUNT).padEnd(4)}개                                      ║
║  최대 동시접속: ${String(MAX_CONCURRENT).padEnd(4)}명                                     ║
║  단계별 시간: ${String(STEP_DURATION).padEnd(4)}초                                       ║
╚══════════════════════════════════════════════════════════════╝
`);

// ========================================
// 테스트 사용자 생성
// ========================================
async function createTestUsers(db) {
  console.log('📝 테스트 사용자 생성 중...');

  const users = [];
  const existingCount = await db.collection('users').countDocuments({
    email: { $regex: /^loadtest\d+@test\.local$/ }
  });

  if (existingCount >= TEST_USER_COUNT) {
    console.log(`   ✅ 기존 테스트 사용자 ${existingCount}명 발견, 재사용`);

    const existingUsers = await db.collection('users')
      .find({ email: { $regex: /^loadtest\d+@test\.local$/ } })
      .limit(TEST_USER_COUNT)
      .toArray();

    return existingUsers;
  }

  // 기존 테스트 사용자 삭제
  await db.collection('users').deleteMany({
    email: { $regex: /^loadtest\d+@test\.local$/ }
  });

  const now = new Date();
  const bulkOps = [];

  for (let i = 1; i <= TEST_USER_COUNT; i++) {
    const user = {
      _id: new ObjectId(),
      name: `테스트${i}`,
      email: `loadtest${i}@test.local`,
      role: 'user',
      authProvider: 'loadtest',
      hasOcrPermission: false,
      profileCompleted: true,
      createdAt: now,
      lastLogin: now,
      storage: {
        tier: 'free',
        quota_bytes: 1073741824, // 1GB
        used_bytes: 0,
        last_calculated: now
      },
      subscription_start_date: now
    };

    bulkOps.push({ insertOne: { document: user } });
    users.push(user);
  }

  await db.collection('users').bulkWrite(bulkOps);
  console.log(`   ✅ ${TEST_USER_COUNT}명 생성 완료`);

  return users;
}

// ========================================
// JWT 토큰 생성
// ========================================
function generateTokens(users, secret) {
  console.log('🔑 JWT 토큰 생성 중...');

  const tokens = users.map(user => {
    return jwt.sign(
      {
        id: user._id.toString(),
        name: user.name,
        role: user.role
      },
      secret,
      { expiresIn: '1h' }
    );
  });

  console.log(`   ✅ ${tokens.length}개 토큰 생성 완료`);
  return tokens;
}

// ========================================
// HTTP 요청
// ========================================
function request(urlPath, token) {
  return new Promise((resolve) => {
    const url = new URL(urlPath, BASE_URL);
    const lib = url.protocol === 'https:' ? https : http;

    const startTime = Date.now();
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          duration: Date.now() - startTime,
          success: res.statusCode >= 200 && res.statusCode < 400,
        });
      });
    });

    req.on('error', () => resolve({ status: 0, duration: Date.now() - startTime, success: false }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, duration: Date.now() - startTime, success: false }); });
    req.end();
  });
}

// ========================================
// 가상 사용자 시뮬레이션
// ========================================
async function virtualUser(userId, token, durationMs) {
  const stats = { requests: 0, errors: 0, durations: [] };
  const endTime = Date.now() + durationMs;

  while (Date.now() < endTime) {
    // 각 사용자가 자신의 문서 조회
    const docList = await request('/api/documents?page=1&limit=20', token);
    stats.requests++;
    stats.durations.push(docList.duration);
    if (!docList.success) stats.errors++;

    await sleep(1000 + Math.random() * 2000);

    // 고객 목록 조회
    const customers = await request('/api/customers?page=1&limit=20', token);
    stats.requests++;
    stats.durations.push(customers.duration);
    if (!customers.success) stats.errors++;

    await sleep(2000 + Math.random() * 3000);
  }

  return stats;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========================================
// 단계별 테스트
// ========================================
async function runStage(userCount, tokens, durationSec) {
  console.log(`\n🚀 [${new Date().toLocaleTimeString()}] ${userCount}명 동시접속 테스트 (${durationSec}초)`);

  const promises = [];
  for (let i = 0; i < userCount; i++) {
    const token = tokens[i % tokens.length];
    promises.push(virtualUser(i, token, durationSec * 1000));
  }

  const allStats = await Promise.all(promises);

  // 통계 집계
  const totalRequests = allStats.reduce((sum, s) => sum + s.requests, 0);
  const totalErrors = allStats.reduce((sum, s) => sum + s.errors, 0);
  const allDurations = allStats.flatMap(s => s.durations).sort((a, b) => a - b);

  const avg = allDurations.reduce((a, b) => a + b, 0) / allDurations.length || 0;
  const p50 = allDurations[Math.floor(allDurations.length * 0.5)] || 0;
  const p95 = allDurations[Math.floor(allDurations.length * 0.95)] || 0;
  const p99 = allDurations[Math.floor(allDurations.length * 0.99)] || 0;
  const max = allDurations[allDurations.length - 1] || 0;
  const errorRate = (totalErrors / totalRequests * 100) || 0;

  console.log(`   📊 요청: ${totalRequests}건, 에러: ${totalErrors}건 (${errorRate.toFixed(1)}%)`);
  console.log(`   ⏱️  평균: ${avg.toFixed(0)}ms, P50: ${p50}ms, P95: ${p95}ms, 최대: ${max}ms`);

  return {
    users: userCount,
    uniqueUsers: Math.min(userCount, tokens.length),
    requests: totalRequests,
    errors: totalErrors,
    errorRate: errorRate.toFixed(2),
    avgMs: Math.round(avg),
    p50Ms: Math.round(p50),
    p95Ms: Math.round(p95),
    p99Ms: Math.round(p99),
    maxMs: Math.round(max),
    throughput: (totalRequests / durationSec).toFixed(2),
  };
}

// ========================================
// 메인
// ========================================
async function main() {
  let client;

  try {
    // MongoDB 연결
    console.log('🔌 MongoDB 연결 중...');
    client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db();
    console.log('   ✅ MongoDB 연결 성공');

    // JWT Secret 읽기
    let jwtSecret = JWT_SECRET;
    try {
      const envContent = fs.readFileSync('/home/rossi/aims/backend/api/aims_api/.env', 'utf8');
      const match = envContent.match(/JWT_SECRET=(.+)/);
      if (match) jwtSecret = match[1].trim();
    } catch (e) {
      console.log('   ⚠️ .env에서 JWT_SECRET을 읽을 수 없음, 기본값 사용');
    }

    // 테스트 사용자 생성
    const users = await createTestUsers(db);

    // 토큰 생성
    const tokens = generateTokens(users, jwtSecret);

    // 서버 연결 테스트
    console.log('\n🔌 서버 연결 테스트...');
    const health = await request('/api/health', tokens[0]);
    if (!health.success) {
      console.log('❌ 서버 연결 실패!');
      return;
    }
    console.log(`   ✅ 서버 연결 성공 (${health.duration}ms)`);

    // 단계별 테스트
    const results = {
      startTime: new Date().toISOString(),
      baseUrl: BASE_URL,
      testType: 'multi-user',
      totalTestUsers: users.length,
      maxConcurrent: MAX_CONCURRENT,
      stages: [],
    };

    const steps = [10, 20, 30, 50, 75, 100].filter(n => n <= MAX_CONCURRENT);

    for (const userCount of steps) {
      const stageResult = await runStage(userCount, tokens, STEP_DURATION);
      results.stages.push(stageResult);
      await sleep(5000);
    }

    results.endTime = new Date().toISOString();

    // 결과 저장
    fs.writeFileSync('multi-user-load-test-results.json', JSON.stringify(results, null, 2));
    console.log('\n📁 결과 저장: multi-user-load-test-results.json');

    // 요약 출력
    printSummary(results);

    // HTML 차트 생성
    generateChart(results);

  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    if (client) await client.close();
  }
}

function printSummary(results) {
  const stages = results.stages;
  const last = stages[stages.length - 1];

  console.log('\n' + '═'.repeat(60));
  console.log('📊 다중 사용자 부하 테스트 결과 요약');
  console.log('═'.repeat(60));
  console.log(`\n👥 테스트 계정: ${results.totalTestUsers}명`);
  console.log(`🎯 최대 동시접속: ${last?.users || 0}명`);

  let recommendation = '';
  const p95 = last?.p95Ms || 0;
  const errRate = parseFloat(last?.errorRate || 0);

  if (p95 < 1000 && errRate < 1) {
    recommendation = `✅ 우수: ${last.users}명 이상 동시접속 가능`;
  } else if (p95 < 2000 && errRate < 5) {
    recommendation = `✅ 양호: 약 ${last.users}명 동시접속 가능`;
  } else if (p95 < 3000 && errRate < 10) {
    recommendation = `⚠️ 주의: 약 ${Math.round(last.users * 0.7)}명 권장`;
  } else {
    recommendation = `❌ 성능 저하: 약 ${Math.round(last.users * 0.5)}명 이하 권장`;
  }

  console.log(`\n💡 권장: ${recommendation}`);

  console.log('\n📈 성능 추이:');
  stages.forEach(s => {
    const bar = '█'.repeat(Math.min(Math.ceil(s.p95Ms / 100), 30));
    console.log(`   ${String(s.users).padStart(3)}명 (${s.uniqueUsers}계정): ${bar} ${s.p95Ms}ms`);
  });

  console.log('\n═'.repeat(60));
}

function generateChart(results) {
  const stages = results.stages;
  const labels = stages.map(s => `${s.users}명`);

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>AIMS Multi-User Load Test</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { font-family: -apple-system, sans-serif; margin: 20px; background: #f5f5f7; }
    h1 { color: #1d1d1f; }
    .info { background: #e8f5e9; padding: 12px; border-radius: 8px; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; max-width: 1200px; }
    .card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e5e5; }
    th { background: #f5f5f7; }
  </style>
</head>
<body>
  <h1>📊 AIMS 다중 사용자 부하 테스트 결과</h1>
  <div class="info">
    <strong>테스트 정보:</strong> ${results.totalTestUsers}개 독립 계정 사용 |
    테스트 시간: ${results.startTime} ~ ${results.endTime}
  </div>

  <div class="grid">
    <div class="card"><h3>📈 동시접속자 vs P95 응답시간</h3><canvas id="chart1"></canvas></div>
    <div class="card"><h3>⚡ 처리량 (req/s)</h3><canvas id="chart2"></canvas></div>
  </div>

  <div class="card" style="margin-top: 20px; max-width: 1200px;">
    <h3>📋 상세 결과</h3>
    <table>
      <tr><th>동시접속</th><th>사용 계정</th><th>요청</th><th>에러</th><th>평균</th><th>P95</th><th>최대</th><th>처리량</th></tr>
      ${stages.map(s => `<tr>
        <td>${s.users}명</td><td>${s.uniqueUsers}개</td><td>${s.requests}</td>
        <td>${s.errors} (${s.errorRate}%)</td><td>${s.avgMs}ms</td>
        <td>${s.p95Ms}ms</td><td>${s.maxMs}ms</td><td>${s.throughput}/s</td>
      </tr>`).join('')}
    </table>
  </div>

  <script>
    new Chart(document.getElementById('chart1'), {
      type: 'line',
      data: {
        labels: ${JSON.stringify(labels)},
        datasets: [
          { label: 'P95 응답시간', data: ${JSON.stringify(stages.map(s => s.p95Ms))}, borderColor: '#007aff', tension: 0.3 },
          { label: '임계치 1초', data: ${JSON.stringify(labels.map(() => 1000))}, borderColor: '#34c759', borderDash: [5,5] },
          { label: '임계치 2초', data: ${JSON.stringify(labels.map(() => 2000))}, borderColor: '#ff3b30', borderDash: [5,5] }
        ]
      }
    });
    new Chart(document.getElementById('chart2'), {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(labels)},
        datasets: [{ label: '처리량 (req/s)', data: ${JSON.stringify(stages.map(s => parseFloat(s.throughput)))}, backgroundColor: '#34c759' }]
      }
    });
  </script>
</body>
</html>`;

  fs.writeFileSync('multi-user-load-test-chart.html', html);
  console.log('📈 차트 생성: multi-user-load-test-chart.html');
}

main().catch(console.error);
