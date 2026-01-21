/**
 * Cross-platform Python 테스트 러너
 *
 * Windows에서는 Python 테스트를 스킵하고,
 * Linux/Mac에서는 venv의 Python을 사용하여 실행합니다.
 *
 * 사용: node scripts/run-python-tests.js <test-type>
 * test-type: cr-duplicate, cr-duplicate-integration, annual-report-api
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

const testType = process.argv[2] || 'cr-duplicate';

// Windows에서는 Python 테스트 스킵 (서버에서만 실행)
if (os.platform() === 'win32') {
  console.log(`${YELLOW}⚠ Python tests skipped on Windows (run on server)${RESET}`);
  console.log(`${YELLOW}  To run manually on server: ssh tars 'cd ~/aims/backend/api/annual_report_api && ./venv/bin/python -m pytest tests/ -v'${RESET}`);
  process.exit(0);
}

// Linux/Mac: venv Python 경로 결정
const annualReportApiDir = path.join(__dirname, '../../annual_report_api');
const venvPython = path.join(annualReportApiDir, 'venv/bin/python');

// venv 존재 확인
if (!fs.existsSync(venvPython)) {
  console.log(`${YELLOW}⚠ Python venv not found at ${venvPython}, skipping tests${RESET}`);
  process.exit(0);
}

// 테스트 명령어 결정
let testCommand;
switch (testType) {
  case 'cr-duplicate':
    testCommand = `${venvPython} -m pytest tests/test_cr_duplicate_check.py -v`;
    break;
  case 'cr-duplicate-integration':
    testCommand = `${venvPython} tests/test_cr_duplicate_integration.py`;
    break;
  case 'annual-report-api':
    testCommand = `${venvPython} -m pytest tests/ -v --ignore=tests/test_cr_detector_real_files.py`;
    break;
  default:
    console.error(`Unknown test type: ${testType}`);
    process.exit(1);
}

console.log(`${GREEN}Running Python tests: ${testType}${RESET}`);
console.log(`Command: ${testCommand}`);

try {
  execSync(testCommand, {
    cwd: annualReportApiDir,
    stdio: 'inherit'
  });
  process.exit(0);
} catch (error) {
  process.exit(error.status || 1);
}
