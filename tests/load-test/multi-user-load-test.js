#!/usr/bin/env node
/**
 * AIMS 다중 사용자 부하 테스트 (파일 업로드 포함)
 *
 * 테스트 시나리오:
 * 1. 100개 테스트 계정 생성
 * 2. 각 사용자가 독립적으로:
 *    - 문서 목록 조회
 *    - 고객 목록 조회
 *    - 파일 업로드 (TXT/PDF)
 *    - 문서 검색
 */

const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ========================================
// 설정
// ========================================
const MONGO_URI = 'mongodb://localhost:27017/docupload';
const BASE_URL = process.env.BASE_URL || 'https://aims.giize.com';
const TEST_USER_COUNT = parseInt(process.env.USER_COUNT || '200');
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '100');
const STEP_DURATION = parseInt(process.env.STEP_DURATION || '30');
const INCLUDE_UPLOAD = process.env.INCLUDE_UPLOAD !== 'false';

console.log(`
╔══════════════════════════════════════════════════════════════╗
║  AIMS 다중 사용자 부하 테스트 (파일 업로드 포함)              ║
╠══════════════════════════════════════════════════════════════╣
║  테스트 계정: ${String(TEST_USER_COUNT).padEnd(4)}개                                      ║
║  최대 동시접속: ${String(MAX_CONCURRENT).padEnd(4)}명                                     ║
║  파일 업로드: ${INCLUDE_UPLOAD ? '✅ 포함' : '❌ 제외'}                                     ║
╚══════════════════════════════════════════════════════════════╝
`);

// ========================================
// 샘플 파일 생성
// ========================================
function createSampleFiles() {
  console.log('📄 샘플 테스트 파일 생성 중...');

  // TXT 파일들 (다양한 크기)
  const txtFiles = [];
  for (let i = 1; i <= 5; i++) {
    const content = `AIMS 부하 테스트용 텍스트 파일 #${i}\n` +
      `생성 시간: ${new Date().toISOString()}\n` +
      `보험 계약서 샘플 내용입니다.\n`.repeat(100 * i);

    const filename = `/tmp/loadtest_sample_${i}.txt`;
    fs.writeFileSync(filename, content);
    txtFiles.push({ path: filename, type: 'text/plain', name: `test_${i}.txt` });
  }

  // 간단한 PDF 생성 (실제 PDF 헤더)
  const pdfContent = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length 44 >> stream
BT /F1 24 Tf 100 700 Td (AIMS Load Test) Tj ET
endstream endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000214 00000 n
trailer << /Size 5 /Root 1 0 R >>
startxref
307
%%EOF`;

  const pdfFiles = [];
  for (let i = 1; i <= 3; i++) {
    const filename = `/tmp/loadtest_sample_${i}.pdf`;
    fs.writeFileSync(filename, pdfContent);
    pdfFiles.push({ path: filename, type: 'application/pdf', name: `test_${i}.pdf` });
  }

  console.log(`   ✅ TXT ${txtFiles.length}개, PDF ${pdfFiles.length}개 생성`);
  return [...txtFiles, ...pdfFiles];
}

// ========================================
// 테스트 사용자 생성
// ========================================
async function createTestUsers(db) {
  console.log('📝 테스트 사용자 생성 중...');

  const existingUsers = await db.collection('users')
    .find({ email: { $regex: /^loadtest\d+@test\.local$/ } })
    .limit(TEST_USER_COUNT)
    .toArray();

  if (existingUsers.length >= TEST_USER_COUNT) {
    console.log(`   ✅ 기존 테스트 사용자 ${existingUsers.length}명 재사용`);
    return existingUsers;
  }

  // 새로 생성
  await db.collection('users').deleteMany({
    email: { $regex: /^loadtest\d+@test\.local$/ }
  });

  const now = new Date();
  const users = [];

  for (let i = 1; i <= TEST_USER_COUNT; i++) {
    users.push({
      _id: new ObjectId(),
      name: `부하테스트${i}`,
      email: `loadtest${i}@test.local`,
      role: 'user',
      authProvider: 'loadtest',
      hasOcrPermission: false,
      profileCompleted: true,
      createdAt: now,
      lastLogin: now,
      storage: { tier: 'free', quota_bytes: 1073741824, used_bytes: 0, last_calculated: now },
      subscription_start_date: now
    });
  }

  await db.collection('users').insertMany(users);
  console.log(`   ✅ ${TEST_USER_COUNT}명 생성 완료`);
  return users;
}

// ========================================
// JWT 토큰 생성
// ========================================
function generateTokens(users, secret) {
  console.log('🔑 JWT 토큰 생성 중...');
  const tokens = users.map(user => jwt.sign(
    { id: user._id.toString(), name: user.name, role: user.role },
    secret,
    { expiresIn: '2h' }
  ));
  console.log(`   ✅ ${tokens.length}개 토큰 생성`);
  return tokens;
}

// ========================================
// HTTP 요청
// ========================================
function httpRequest(urlPath, token, method = 'GET', body = null, contentType = 'application/json') {
  return new Promise((resolve) => {
    const url = new URL(urlPath, BASE_URL);
    const lib = url.protocol === 'https:' ? https : http;
    const startTime = Date.now();

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': contentType,
      },
      timeout: 60000,
    };

    if (body && contentType === 'application/json') {
      options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
    }

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({
        status: res.statusCode,
        duration: Date.now() - startTime,
        success: res.statusCode >= 200 && res.statusCode < 400,
        body: data
      }));
    });

    req.on('error', () => resolve({ status: 0, duration: Date.now() - startTime, success: false }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, duration: Date.now() - startTime, success: false }); });

    if (body && contentType === 'application/json') {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Multipart 파일 업로드 (n8n shadow/docprep-main 엔드포인트 사용)
function uploadFile(token, file, userId) {
  return new Promise((resolve) => {
    // 실제 프론트엔드에서 사용하는 업로드 엔드포인트
    const url = new URL('/shadow/docprep-main', BASE_URL);
    const lib = url.protocol === 'https:' ? https : http;
    const startTime = Date.now();

    const boundary = '----FormBoundary' + Math.random().toString(36).substr(2);
    const fileContent = fs.readFileSync(file.path);

    // multipart/form-data 본문 생성
    const parts = [];

    // 1. file 필드
    parts.push(`--${boundary}\r\n`);
    parts.push(`Content-Disposition: form-data; name="file"; filename="${file.name}"\r\n`);
    parts.push(`Content-Type: ${file.type}\r\n\r\n`);

    // 2. userId 필드
    const userIdPart = `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="userId"\r\n\r\n` +
      `${userId}\r\n`;

    const bodyStart = Buffer.concat([
      Buffer.from(parts.join(''), 'utf8'),
    ]);
    const bodyMiddle = Buffer.concat([
      fileContent,
      Buffer.from('\r\n', 'utf8'),
      Buffer.from(userIdPart, 'utf8')
    ]);
    const bodyEnd = Buffer.from(`--${boundary}--\r\n`, 'utf8');
    const fullBody = Buffer.concat([bodyStart, bodyMiddle, bodyEnd]);

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullBody.length,
      },
      timeout: 120000,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({
        status: res.statusCode,
        duration: Date.now() - startTime,
        success: res.statusCode >= 200 && res.statusCode < 400,
        type: 'upload',
        responseBody: data
      }));
    });

    req.on('error', (e) => resolve({ status: 0, duration: Date.now() - startTime, success: false, type: 'upload', error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, duration: Date.now() - startTime, success: false, type: 'upload', error: 'timeout' }); });
    req.write(fullBody);
    req.end();
  });
}

// ========================================
// 가상 사용자 시뮬레이션
// ========================================
async function virtualUser(userIndex, token, userId, durationMs, sampleFiles) {
  const stats = {
    requests: { documents: 0, customers: 0, search: 0, upload: 0 },
    errors: { documents: 0, customers: 0, search: 0, upload: 0 },
    durations: { documents: [], customers: [], search: [], upload: [] },
    uploadDetails: []
  };

  const endTime = Date.now() + durationMs;

  while (Date.now() < endTime) {
    // 1. 문서 목록 조회
    const docRes = await httpRequest('/api/documents?page=1&limit=20', token);
    stats.requests.documents++;
    stats.durations.documents.push(docRes.duration);
    if (!docRes.success) stats.errors.documents++;

    await sleep(500 + Math.random() * 1000);

    // 2. 고객 목록 조회
    const custRes = await httpRequest('/api/customers?page=1&limit=20', token);
    stats.requests.customers++;
    stats.durations.customers.push(custRes.duration);
    if (!custRes.success) stats.errors.customers++;

    await sleep(500 + Math.random() * 1000);

    // 3. 검색 (30% 확률)
    if (Math.random() < 0.3) {
      const keywords = ['보험', '계약', '청구'];
      const keyword = keywords[Math.floor(Math.random() * keywords.length)];
      const searchRes = await httpRequest(`/api/documents?search=${encodeURIComponent(keyword)}&limit=10`, token);
      stats.requests.search++;
      stats.durations.search.push(searchRes.duration);
      if (!searchRes.success) stats.errors.search++;
    }

    // 4. 파일 업로드 (10% 확률, INCLUDE_UPLOAD=true일 때만)
    if (INCLUDE_UPLOAD && Math.random() < 0.1 && sampleFiles.length > 0) {
      const file = sampleFiles[Math.floor(Math.random() * sampleFiles.length)];
      const uploadRes = await uploadFile(token, file, userId);
      stats.requests.upload++;
      stats.durations.upload.push(uploadRes.duration);
      if (!uploadRes.success) {
        stats.errors.upload++;
        stats.uploadDetails.push({ status: uploadRes.status, error: uploadRes.error, body: uploadRes.responseBody?.substring(0, 200) });
      }
    }

    await sleep(1000 + Math.random() * 2000);
  }

  return stats;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========================================
// 단계별 테스트
// ========================================
async function runStage(userCount, tokens, users, durationSec, sampleFiles) {
  console.log(`\n🚀 [${new Date().toLocaleTimeString()}] ${userCount}명 동시접속 (${durationSec}초)`);

  const promises = [];
  for (let i = 0; i < userCount; i++) {
    const idx = i % tokens.length;
    const token = tokens[idx];
    const userId = users[idx]._id.toString();
    promises.push(virtualUser(i, token, userId, durationSec * 1000, sampleFiles));
  }

  const allStats = await Promise.all(promises);

  // 통계 집계
  const aggregate = (key) => {
    const all = allStats.flatMap(s => s.durations[key]).sort((a, b) => a - b);
    const requests = allStats.reduce((sum, s) => sum + s.requests[key], 0);
    const errors = allStats.reduce((sum, s) => sum + s.errors[key], 0);
    return {
      requests,
      errors,
      avg: all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : 0,
      p95: all.length ? all[Math.floor(all.length * 0.95)] || all[all.length - 1] : 0,
      max: all.length ? all[all.length - 1] : 0,
    };
  };

  const docs = aggregate('documents');
  const custs = aggregate('customers');
  const search = aggregate('search');
  const upload = aggregate('upload');

  const totalReq = docs.requests + custs.requests + search.requests + upload.requests;
  const totalErr = docs.errors + custs.errors + search.errors + upload.errors;

  console.log(`   📊 총 ${totalReq}건 (에러 ${totalErr}건)`);
  console.log(`      문서조회: ${docs.requests}건 (P95: ${docs.p95}ms, 에러: ${docs.errors})`);
  console.log(`      고객조회: ${custs.requests}건 (P95: ${custs.p95}ms, 에러: ${custs.errors})`);
  if (search.requests > 0) console.log(`      검색: ${search.requests}건 (P95: ${search.p95}ms, 에러: ${search.errors})`);
  if (upload.requests > 0) {
    console.log(`      업로드: ${upload.requests}건 (P95: ${upload.p95}ms, 에러: ${upload.errors})`);
    // 업로드 오류 상세 (최대 3개)
    const uploadErrors = allStats.flatMap(s => s.uploadDetails).slice(0, 3);
    if (uploadErrors.length > 0) {
      console.log(`      업로드 오류 샘플:`, uploadErrors.map(e => `status=${e.status}, ${e.error || e.body?.substring(0, 50)}`).join(' | '));
    }
  }

  return {
    users: userCount,
    uniqueUsers: Math.min(userCount, tokens.length),
    total: { requests: totalReq, errors: totalErr, errorRate: ((totalErr / totalReq) * 100).toFixed(2) },
    documents: docs,
    customers: custs,
    search,
    upload,
    throughput: (totalReq / durationSec).toFixed(2),
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
    let jwtSecret = 'default-secret';
    try {
      const envContent = fs.readFileSync('/home/rossi/aims/backend/api/aims_api/.env', 'utf8');
      const match = envContent.match(/JWT_SECRET=(.+)/);
      if (match) jwtSecret = match[1].trim();
      console.log('   ✅ JWT Secret 로드 성공');
    } catch (e) {
      console.log('   ⚠️ JWT Secret 로드 실패, 기본값 사용');
    }

    // 샘플 파일 생성
    const sampleFiles = INCLUDE_UPLOAD ? createSampleFiles() : [];

    // 테스트 사용자 생성
    const users = await createTestUsers(db);
    const tokens = generateTokens(users, jwtSecret);

    // 서버 연결 테스트
    console.log('\n🔌 서버 연결 테스트...');
    const health = await httpRequest('/api/health', tokens[0]);
    if (!health.success) {
      console.log('❌ 서버 연결 실패!');
      return;
    }
    console.log(`   ✅ 서버 연결 성공 (${health.duration}ms)`);

    // 단계별 테스트
    const results = {
      startTime: new Date().toISOString(),
      baseUrl: BASE_URL,
      testType: 'multi-user-with-upload',
      totalTestUsers: users.length,
      maxConcurrent: MAX_CONCURRENT,
      includeUpload: INCLUDE_UPLOAD,
      stages: [],
    };

    const steps = [10, 20, 30, 50, 75, 100, 150, 200].filter(n => n <= MAX_CONCURRENT);

    for (const userCount of steps) {
      const stageResult = await runStage(userCount, tokens, users, STEP_DURATION, sampleFiles);
      results.stages.push(stageResult);
      await sleep(5000);
    }

    results.endTime = new Date().toISOString();

    // 결과 저장
    fs.writeFileSync('multi-user-load-results.json', JSON.stringify(results, null, 2));
    console.log('\n📁 결과 저장: multi-user-load-results.json');

    // 차트 생성
    generateChart(results);

    // 요약
    printSummary(results);

    // 테스트 파일 정리
    sampleFiles.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });

  } catch (error) {
    console.error('❌ 오류:', error);
  } finally {
    if (client) await client.close();
  }
}

function generateChart(results) {
  const stages = results.stages;
  const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><title>AIMS Load Test</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>body{font-family:-apple-system,sans-serif;margin:20px;background:#f5f5f7}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:20px;max-width:1200px}
.card{background:#fff;padding:20px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.1)}
table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #e5e5e5;text-align:left}th{background:#f5f5f7}</style></head>
<body><h1>📊 AIMS 다중사용자 부하테스트 (${results.totalTestUsers}계정)</h1>
<p>테스트: ${results.startTime} ~ ${results.endTime} | 업로드: ${results.includeUpload ? '포함' : '미포함'}</p>
<div class="grid">
<div class="card"><h3>문서조회 P95</h3><canvas id="c1"></canvas></div>
<div class="card"><h3>API별 평균 응답시간</h3><canvas id="c2"></canvas></div>
</div>
<div class="card" style="margin-top:20px;max-width:1200px"><h3>상세결과</h3>
<table><tr><th>동시접속</th><th>총요청</th><th>에러율</th><th>문서P95</th><th>고객P95</th><th>검색P95</th><th>업로드P95</th><th>처리량</th></tr>
${stages.map(s=>`<tr><td>${s.users}명</td><td>${s.total.requests}</td><td>${s.total.errorRate}%</td>
<td>${s.documents.p95}ms</td><td>${s.customers.p95}ms</td><td>${s.search.p95||'-'}ms</td><td>${s.upload.p95||'-'}ms</td><td>${s.throughput}/s</td></tr>`).join('')}
</table></div>
<script>
new Chart(document.getElementById('c1'),{type:'line',data:{labels:${JSON.stringify(stages.map(s=>s.users+'명'))},
datasets:[{label:'문서조회 P95',data:${JSON.stringify(stages.map(s=>s.documents.p95))},borderColor:'#007aff'},
{label:'1초 기준',data:${JSON.stringify(stages.map(()=>1000))},borderColor:'#34c759',borderDash:[5,5]}]}});
new Chart(document.getElementById('c2'),{type:'bar',data:{labels:${JSON.stringify(stages.map(s=>s.users+'명'))},
datasets:[{label:'문서',data:${JSON.stringify(stages.map(s=>s.documents.avg))},backgroundColor:'#007aff'},
{label:'고객',data:${JSON.stringify(stages.map(s=>s.customers.avg))},backgroundColor:'#34c759'},
{label:'검색',data:${JSON.stringify(stages.map(s=>s.search.avg))},backgroundColor:'#ff9500'},
{label:'업로드',data:${JSON.stringify(stages.map(s=>s.upload.avg))},backgroundColor:'#ff3b30'}]}});
</script></body></html>`;
  fs.writeFileSync('multi-user-load-chart.html', html);
  console.log('📈 차트: multi-user-load-chart.html');
}

function printSummary(results) {
  const last = results.stages[results.stages.length - 1];
  console.log('\n' + '═'.repeat(60));
  console.log('📊 최종 결과');
  console.log('═'.repeat(60));
  console.log(`👥 테스트 계정: ${results.totalTestUsers}개`);
  console.log(`🎯 최대 동시접속: ${last?.users || 0}명`);
  console.log(`📄 파일 업로드: ${results.includeUpload ? '포함' : '미포함'}`);

  const p95 = last?.documents?.p95 || 0;
  const errRate = parseFloat(last?.total?.errorRate || 0);

  let status = p95 < 1000 && errRate < 5 ? '✅ 우수' : p95 < 2000 && errRate < 10 ? '✅ 양호' : '⚠️ 주의';
  console.log(`\n💡 평가: ${status} (문서조회 P95: ${p95}ms, 에러율: ${errRate}%)`);
  console.log('═'.repeat(60));
}

main();
