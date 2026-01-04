#!/usr/bin/env node
/**
 * AIMS 동시접속 수용량 테스트 (Node.js 버전)
 *
 * 목적: k6 없이 Node.js로 동시접속자 테스트 실행
 *
 * 사용법:
 *   node aims-load-test-node.js --token YOUR_JWT_TOKEN
 *   node aims-load-test-node.js --token YOUR_JWT_TOKEN --max-users 50
 *
 * 결과:
 *   - 콘솔에 실시간 결과 출력
 *   - load-test-results.json 파일 생성
 *   - load-test-chart.html 자동 생성 (그래프)
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ========================================
// 설정
// ========================================
const args = process.argv.slice(2);
const TOKEN = getArg('--token') || process.env.TOKEN || '';
const BASE_URL = getArg('--url') || 'https://aims.giize.com';
const MAX_USERS = parseInt(getArg('--max-users') || '100');
const STEP_DURATION = parseInt(getArg('--step-duration') || '30'); // 각 단계 유지 시간 (초)

function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : null;
}

if (!TOKEN) {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  AIMS 동시접속 수용량 테스트                                  ║
╠══════════════════════════════════════════════════════════════╣
║  사용법:                                                      ║
║    node aims-load-test-node.js --token YOUR_JWT_TOKEN        ║
║                                                               ║
║  JWT 토큰 얻는 방법:                                          ║
║    1. AIMS 사이트 로그인                                      ║
║    2. 개발자도구(F12) > Application > Local Storage           ║
║    3. auth-storage-v2 의 token 값 복사                        ║
║                                                               ║
║  옵션:                                                        ║
║    --max-users 100   최대 동시접속자 (기본: 100)              ║
║    --step-duration 30  각 단계 유지 시간 초 (기본: 30)        ║
║    --url https://...   테스트 대상 URL                        ║
╚══════════════════════════════════════════════════════════════╝
  `);
  process.exit(1);
}

// ========================================
// 테스트 결과 저장
// ========================================
const results = {
  startTime: new Date().toISOString(),
  baseUrl: BASE_URL,
  maxUsers: MAX_USERS,
  stages: [],
};

// ========================================
// HTTP 요청 함수
// ========================================
function request(urlPath, method = 'GET') {
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
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
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

    req.on('error', () => {
      resolve({
        status: 0,
        duration: Date.now() - startTime,
        success: false,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        status: 0,
        duration: Date.now() - startTime,
        success: false,
      });
    });

    req.end();
  });
}

// ========================================
// 가상 사용자 시뮬레이션
// ========================================
async function virtualUser(userId, durationMs) {
  const stats = { requests: 0, errors: 0, durations: [] };
  const endTime = Date.now() + durationMs;

  while (Date.now() < endTime) {
    // 문서 목록 조회
    const docList = await request('/api/documents?page=1&limit=20');
    stats.requests++;
    stats.durations.push(docList.duration);
    if (!docList.success) stats.errors++;

    // 생각 시간 (1-3초)
    await sleep(1000 + Math.random() * 2000);

    // 고객 목록 조회
    const customers = await request('/api/customers?page=1&limit=20');
    stats.requests++;
    stats.durations.push(customers.duration);
    if (!customers.success) stats.errors++;

    // 생각 시간
    await sleep(2000 + Math.random() * 3000);
  }

  return stats;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========================================
// 단계별 테스트 실행
// ========================================
async function runStage(userCount, durationSec) {
  console.log(`\n🚀 [${new Date().toLocaleTimeString()}] 테스트 시작: ${userCount}명 동시접속 (${durationSec}초간 유지)`);

  const startTime = Date.now();
  const promises = [];

  for (let i = 0; i < userCount; i++) {
    promises.push(virtualUser(i, durationSec * 1000));
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

  const stageResult = {
    users: userCount,
    duration: durationSec,
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

  results.stages.push(stageResult);

  // 결과 출력
  console.log(`   📊 결과: ${totalRequests}건 처리, 에러율 ${errorRate.toFixed(1)}%`);
  console.log(`   ⏱️  응답시간: 평균=${avg.toFixed(0)}ms, P95=${p95.toFixed(0)}ms, 최대=${max.toFixed(0)}ms`);

  return stageResult;
}

// ========================================
// 메인 실행
// ========================================
async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('📊 AIMS 동시접속 수용량 테스트');
  console.log('═'.repeat(60));
  console.log(`🔗 대상: ${BASE_URL}`);
  console.log(`👥 최대 동시접속자: ${MAX_USERS}명`);
  console.log(`⏱️  단계별 유지 시간: ${STEP_DURATION}초`);
  console.log('═'.repeat(60));

  // 연결 테스트
  console.log('\n🔌 서버 연결 확인 중...');
  const health = await request('/api/health');
  if (!health.success) {
    console.log('❌ 서버 연결 실패! URL과 토큰을 확인하세요.');
    process.exit(1);
  }
  console.log(`✅ 서버 연결 성공 (${health.duration}ms)`);

  // 단계별 테스트 (10명씩 증가)
  const steps = [10, 20, 30, 50, 75, MAX_USERS].filter(n => n <= MAX_USERS);

  for (const userCount of steps) {
    await runStage(userCount, STEP_DURATION);
    await sleep(5000); // 단계 사이 5초 휴식
  }

  // 결과 저장
  results.endTime = new Date().toISOString();
  fs.writeFileSync('load-test-results.json', JSON.stringify(results, null, 2));
  console.log('\n📁 결과 저장: load-test-results.json');

  // HTML 차트 생성
  generateChart(results);

  // 최종 요약
  printSummary(results);
}

// ========================================
// HTML 차트 생성
// ========================================
function generateChart(results) {
  const stages = results.stages;
  const labels = stages.map(s => `${s.users}명`);
  const avgData = stages.map(s => s.avgMs);
  const p95Data = stages.map(s => s.p95Ms);
  const errorData = stages.map(s => parseFloat(s.errorRate));
  const throughputData = stages.map(s => parseFloat(s.throughput));

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>AIMS Load Test Results</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { font-family: -apple-system, sans-serif; margin: 20px; background: #f5f5f7; }
    h1 { color: #1d1d1f; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; max-width: 1200px; }
    .card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .summary { display: flex; gap: 20px; margin-bottom: 20px; }
    .stat { background: white; padding: 16px; border-radius: 8px; text-align: center; }
    .stat-value { font-size: 24px; font-weight: bold; color: #007aff; }
    .stat-label { font-size: 12px; color: #86868b; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e5e5; }
    th { background: #f5f5f7; }
  </style>
</head>
<body>
  <h1>📊 AIMS 동시접속 수용량 테스트 결과</h1>
  <p>테스트 시간: ${results.startTime} ~ ${results.endTime}</p>

  <div class="summary">
    <div class="stat"><div class="stat-value">${stages[stages.length-1]?.users || 0}명</div><div class="stat-label">최대 테스트 동시접속</div></div>
    <div class="stat"><div class="stat-value">${stages[stages.length-1]?.p95Ms || 0}ms</div><div class="stat-label">P95 응답시간 (최대 부하)</div></div>
    <div class="stat"><div class="stat-value">${stages[stages.length-1]?.errorRate || 0}%</div><div class="stat-label">에러율 (최대 부하)</div></div>
    <div class="stat"><div class="stat-value">${stages[stages.length-1]?.throughput || 0}</div><div class="stat-label">처리량 (req/s)</div></div>
  </div>

  <div class="grid">
    <div class="card"><h3>📈 동시접속자 vs 응답시간</h3><canvas id="chart1"></canvas></div>
    <div class="card"><h3>📊 P95 응답시간 추이</h3><canvas id="chart2"></canvas></div>
    <div class="card"><h3>❌ 에러율</h3><canvas id="chart3"></canvas></div>
    <div class="card"><h3>⚡ 처리량 (req/s)</h3><canvas id="chart4"></canvas></div>
  </div>

  <div class="card" style="margin-top: 20px; max-width: 1200px;">
    <h3>📋 상세 결과</h3>
    <table>
      <tr><th>동시접속</th><th>요청수</th><th>에러</th><th>평균</th><th>P50</th><th>P95</th><th>P99</th><th>최대</th><th>처리량</th></tr>
      ${stages.map(s => `<tr>
        <td>${s.users}명</td><td>${s.requests}</td><td>${s.errors} (${s.errorRate}%)</td>
        <td>${s.avgMs}ms</td><td>${s.p50Ms}ms</td><td>${s.p95Ms}ms</td><td>${s.p99Ms}ms</td><td>${s.maxMs}ms</td>
        <td>${s.throughput}/s</td>
      </tr>`).join('')}
    </table>
  </div>

  <script>
    new Chart(document.getElementById('chart1'), {
      type: 'line',
      data: { labels: ${JSON.stringify(labels)}, datasets: [
        { label: '평균 응답시간 (ms)', data: ${JSON.stringify(avgData)}, borderColor: '#007aff', tension: 0.3 }
      ]},
      options: { scales: { y: { beginAtZero: true } } }
    });
    new Chart(document.getElementById('chart2'), {
      type: 'line',
      data: { labels: ${JSON.stringify(labels)}, datasets: [
        { label: 'P95 응답시간 (ms)', data: ${JSON.stringify(p95Data)}, borderColor: '#ff9500', tension: 0.3 },
        { label: '권장 임계치 (1초)', data: ${JSON.stringify(labels.map(() => 1000))}, borderColor: '#34c759', borderDash: [5,5] },
        { label: '경고 임계치 (2초)', data: ${JSON.stringify(labels.map(() => 2000))}, borderColor: '#ff3b30', borderDash: [5,5] }
      ]},
      options: { scales: { y: { beginAtZero: true } } }
    });
    new Chart(document.getElementById('chart3'), {
      type: 'bar',
      data: { labels: ${JSON.stringify(labels)}, datasets: [
        { label: '에러율 (%)', data: ${JSON.stringify(errorData)}, backgroundColor: '#ff3b30' }
      ]},
      options: { scales: { y: { beginAtZero: true } } }
    });
    new Chart(document.getElementById('chart4'), {
      type: 'line',
      data: { labels: ${JSON.stringify(labels)}, datasets: [
        { label: '처리량 (req/s)', data: ${JSON.stringify(throughputData)}, borderColor: '#34c759', fill: true, backgroundColor: 'rgba(52,199,89,0.1)' }
      ]},
      options: { scales: { y: { beginAtZero: true } } }
    });
  </script>
</body>
</html>`;

  fs.writeFileSync('load-test-chart.html', html);
  console.log('📈 차트 생성: load-test-chart.html');
}

// ========================================
// 최종 요약
// ========================================
function printSummary(results) {
  const stages = results.stages;
  const last = stages[stages.length - 1];
  const p95 = last?.p95Ms || 0;
  const errRate = parseFloat(last?.errorRate || 0);

  console.log('\n' + '═'.repeat(60));
  console.log('📊 최종 결과 요약');
  console.log('═'.repeat(60));

  let recommendation = '';
  if (p95 < 1000 && errRate < 1) {
    recommendation = `✅ 우수: ${last.users}명 이상 동시접속 가능`;
  } else if (p95 < 2000 && errRate < 5) {
    recommendation = `✅ 양호: 약 ${last.users}명 동시접속 가능`;
  } else if (p95 < 3000 && errRate < 10) {
    recommendation = `⚠️ 주의: 약 ${Math.round(last.users * 0.7)}명 권장`;
  } else {
    recommendation = `❌ 성능 저하: 약 ${Math.round(last.users * 0.5)}명 이하 권장`;
  }

  console.log(`\n💡 권장 동시접속자: ${recommendation}`);
  console.log(`\n📈 성능 추이:`);

  stages.forEach(s => {
    const bar = '█'.repeat(Math.min(Math.ceil(s.p95Ms / 100), 20));
    console.log(`   ${String(s.users).padStart(3)}명: ${bar} ${s.p95Ms}ms (P95)`);
  });

  console.log('\n═'.repeat(60));
}

// 실행
main().catch(console.error);
