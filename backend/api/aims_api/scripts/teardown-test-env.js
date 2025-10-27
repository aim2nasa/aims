#!/usr/bin/env node
/**
 * teardown-test-env.js
 * SSH 터널 종료 스크립트 (Node.js 크로스 플랫폼)
 */

const { execSync } = require('child_process');

console.log('Closing SSH tunnel...');

try {
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    // Windows: 포트 27017을 사용하는 프로세스 종료
    try {
      const output = execSync('netstat -ano | findstr :27017 | findstr LISTENING', { encoding: 'utf8' });
      const lines = output.trim().split('\n');

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(pid)) {
          try {
            execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
          } catch (e) {
            // PID가 이미 종료된 경우 무시
          }
        }
      }
    } catch (e) {
      // 포트 27017을 사용하는 프로세스가 없는 경우
    }
  } else {
    // Linux/Mac: SSH 터널 프로세스 종료
    try {
      execSync('pkill -f "ssh -f -N -L 27017:localhost:27017 tars.giize.com"', { stdio: 'ignore' });
    } catch (e) {
      // 프로세스가 없는 경우 무시
    }
  }

  console.log('SSH tunnel closed');
} catch (error) {
  console.error('Error closing SSH tunnel:', error.message);
  // 종료 스크립트는 실패해도 계속 진행
}
