#!/usr/bin/env node
/**
 * setup-test-env.js
 * SSH 터널 설정 스크립트 (Node.js 크로스 플랫폼)
 */

const { execSync } = require('child_process');
const net = require('net');

console.log('Checking MongoDB connection...');

// MongoDB 연결 테스트 함수
function checkMongoConnection() {
  return new Promise((resolve) => {
    const client = net.createConnection({ port: 27017, host: 'localhost' }, () => {
      client.end();
      resolve(true);
    });

    client.on('error', () => {
      resolve(false);
    });

    // 타임아웃 설정
    client.setTimeout(1000);
    client.on('timeout', () => {
      client.destroy();
      resolve(false);
    });
  });
}

async function setupSSHTunnel() {
  const isConnected = await checkMongoConnection();

  if (isConnected) {
    console.log('MongoDB connection already available on port 27017');
    return;
  }

  console.log('Setting up SSH tunnel to MongoDB...');

  try {
    const isWindows = process.platform === 'win32';

    if (isWindows) {
      // Windows: background 실행
      execSync('start /B ssh -N -L 27017:localhost:27017 tars.giize.com', {
        shell: 'cmd.exe',
        stdio: 'ignore'
      });
    } else {
      // Linux/Mac: background 실행
      execSync('ssh -f -N -L 27017:localhost:27017 tars.giize.com', {
        stdio: 'ignore'
      });
    }

    // 연결 대기 및 확인 (최대 10초)
    let connected = false;
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      connected = await checkMongoConnection();
      if (connected) {
        console.log('SSH tunnel established (localhost:27017 -> tars.giize.com:27017)');
        break;
      }
      console.log(`Waiting for SSH tunnel... (${i + 1}/10)`);
    }

    if (!connected) {
      console.error('Failed to establish SSH tunnel after 10 seconds');
      console.error('Please ensure SSH key authentication is configured for tars.giize.com');
      process.exit(1);
    }
  } catch (error) {
    console.error('Failed to setup SSH tunnel:', error.message);
    process.exit(1);
  }
}

// 실행
setupSSHTunnel().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
