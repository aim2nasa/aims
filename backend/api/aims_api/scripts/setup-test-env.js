#!/usr/bin/env node
/**
 * setup-test-env.js
 * MongoDB 연결 사전 체크 스크립트
 *
 * 참고: 실제 MongoDB 연결은 각 테스트 파일에서 testDbHelper.js를 통해 처리됨
 * - 1순위: localhost:27017 (서버 환경)
 * - 2순위: Tailscale IP 100.110.215.65:27017 (로컬 개발 환경)
 */

const net = require('net');

console.log('Checking MongoDB connection availability...');

// MongoDB 연결 테스트 함수
function checkMongoConnection(host, port) {
  return new Promise((resolve) => {
    const client = net.createConnection({ port, host }, () => {
      client.end();
      resolve(true);
    });

    client.on('error', () => {
      resolve(false);
    });

    // 타임아웃 설정
    client.setTimeout(2000);
    client.on('timeout', () => {
      client.destroy();
      resolve(false);
    });
  });
}

async function checkConnections() {
  // 1순위: localhost
  const localConnected = await checkMongoConnection('localhost', 27017);
  if (localConnected) {
    console.log('✅ MongoDB available on localhost:27017');
    return;
  }

  // 2순위: Tailscale
  const tailscaleConnected = await checkMongoConnection('100.110.215.65', 27017);
  if (tailscaleConnected) {
    console.log('✅ MongoDB available via Tailscale (100.110.215.65:27017)');
    return;
  }

  // 둘 다 안 되면 경고만 출력 (테스트는 testDbHelper.js에서 다시 시도)
  console.log('⚠️  MongoDB not immediately available on localhost or Tailscale');
  console.log('    Tests will attempt connection via testDbHelper.js fallback mechanism');
}

// 실행
checkConnections().catch(err => {
  console.error('Warning:', err.message);
  // 에러가 나도 종료하지 않음 - testDbHelper.js가 fallback 처리
});
