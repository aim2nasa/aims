#!/usr/bin/env node
/**
 * test-all.js
 * AIMS All Tests Runner (크로스 플랫폼)
 *
 * Windows, Linux, Mac 모두 지원
 */

const { execSync } = require('child_process');
const path = require('path');
const net = require('net');

const PROJECT_ROOT = path.join(__dirname, '..');
let FAILED = 0;

// 색상 출력 헬퍼
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function log(msg) {
  console.log(msg);
}

function logHeader(msg) {
  console.log(`\n${colors.bright}${colors.cyan}${msg}${colors.reset}`);
}

function logSuccess(msg) {
  console.log(`${colors.green}${msg}${colors.reset}`);
}

function logError(msg) {
  console.log(`${colors.red}${msg}${colors.reset}`);
}

function logSeparator() {
  console.log('----------------------------------------');
}

// MongoDB 연결 테스트
function checkMongoConnection() {
  return new Promise((resolve) => {
    const client = net.createConnection({ port: 27017, host: 'localhost' }, () => {
      client.end();
      resolve(true);
    });

    client.on('error', () => {
      resolve(false);
    });

    client.setTimeout(1000);
    client.on('timeout', () => {
      client.destroy();
      resolve(false);
    });
  });
}

// SSH 터널 설정
async function setupSSHTunnel() {
  logHeader('[0/7] Setting up SSH tunnel to MongoDB...');
  logSeparator();

  const isConnected = await checkMongoConnection();

  if (isConnected) {
    log('MongoDB connection already available on port 27017');
    return;
  }

  const isWindows = process.platform === 'win32';

  try {
    if (isWindows) {
      execSync('start /B ssh -N -L 27017:localhost:27017 tars.giize.com', {
        shell: 'cmd.exe',
        stdio: 'ignore'
      });
    } else {
      execSync('ssh -f -N -L 27017:localhost:27017 tars.giize.com', {
        stdio: 'ignore'
      });
    }

    await new Promise(resolve => setTimeout(resolve, 3000));
    log('SSH tunnel established (localhost:27017 -> tars.giize.com:27017)');
  } catch (error) {
    logError(`Failed to setup SSH tunnel: ${error.message}`);
    process.exit(1);
  }
}

// SSH 터널 종료
function teardownSSHTunnel() {
  logHeader('[7/7] Closing SSH tunnel...');
  logSeparator();

  const isWindows = process.platform === 'win32';

  try {
    if (isWindows) {
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
      try {
        execSync('pkill -f "ssh -f -N -L 27017:localhost:27017 tars.giize.com"', { stdio: 'ignore' });
      } catch (e) {
        // 프로세스가 없는 경우 무시
      }
    }

    log('SSH tunnel closed');
  } catch (error) {
    logError(`Error closing SSH tunnel: ${error.message}`);
  }

  // 임시 파일 정리
  try {
    if (isWindows) {
      execSync('if exist tars.giize.com del /f /q tars.giize.com >nul 2>&1', { shell: 'cmd.exe', stdio: 'ignore' });
      execSync('if exist nul del /f /q nul >nul 2>&1', { shell: 'cmd.exe', stdio: 'ignore' });
    } else {
      execSync('rm -f tars.giize.com nul 2>/dev/null || true', { stdio: 'ignore' });
    }
  } catch (e) {
    // 파일이 없는 경우 무시
  }
}

// 테스트 실행
function runTest(stepNum, title, cwd, command, env = {}) {
  logHeader(`[${stepNum}/7] Running ${title}...`);
  logSeparator();

  try {
    execSync(command, {
      cwd: path.join(PROJECT_ROOT, cwd),
      stdio: 'inherit',
      env: { ...process.env, ...env }
    });
    log('');
    logSuccess(`[PASSED] ${title} passed!`);
  } catch (error) {
    log('');
    logError(`[FAILED] ${title} failed!`);
    FAILED = 1;
  }
}

// 메인 함수
async function main() {
  log('');
  logHeader('========================================');
  logHeader('  AIMS All Tests Runner');
  logHeader('========================================');
  log('');

  // 0. SSH 터널 설정
  await setupSSHTunnel();
  log('');
  log('');

  // 1. Frontend Tests
  runTest('1', 'Frontend tests', 'frontend/aims-uix3', 'npm test -- --run');
  log('');
  log('');

  // 2. Node.js API Tests
  runTest('2', 'Node.js API tests', 'backend/api/aims_api', 'npm run test:ci', {
    MONGO_URI: 'mongodb://localhost:27017'
  });
  log('');
  log('');

  // 3. Python Module Tests (src/)
  const pythonCmd = process.platform === 'win32' ? 'py -3 -m pytest -v' : 'python3 -m pytest -v';
  runTest('3', 'Python module tests (src/)', '.', pythonCmd + ' src/');
  log('');
  log('');

  // 4. Python Tools Tests
  runTest('4', 'Python tools tests', '.', pythonCmd + ' tools/mime_type_analyzer/tests/');
  log('');
  log('');

  // 5. Python API Tests (doc_status_api)
  runTest('5', 'Python API tests (doc_status_api)', 'backend/api/doc_status_api', pythonCmd);
  log('');
  log('');

  // 6. Python API Tests (annual_report_api)
  runTest('6', 'Python API tests (annual_report_api)', 'backend/api/annual_report_api', pythonCmd);
  log('');

  logHeader('========================================');
  logHeader('  Test Results Summary');
  logHeader('========================================');

  // 7. SSH 터널 종료
  teardownSSHTunnel();
  log('');

  if (FAILED === 0) {
    log('');
    logSuccess('[SUCCESS] All tests passed!');
    log('');
    process.exit(0);
  } else {
    log('');
    logError('[ERROR] Some tests failed!');
    log('');
    process.exit(1);
  }
}

// 실행
main().catch(err => {
  logError(`Error: ${err.message}`);
  process.exit(1);
});
