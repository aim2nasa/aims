/**
 * source_file_id / document_id ObjectId/문자열 호환성 검증 테스트
 *
 * 검증 항목:
 * 1. customer-documents-routes.js에서 source_file_id가 string일 때 .toString() 비교로 동작
 * 2. document_id가 string일 때도 .toString() 비교로 동작
 *
 * 배경:
 * - annual_reports[].source_file_id가 string으로 저장되어 .equals() 호출 시 TypeError 발생 (#50)
 * - .toString() 비교로 변경하여 ObjectId/string 모두 호환
 */

const fs = require('fs');
const path = require('path');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`${GREEN}✓${RESET} ${testName}`);
    testsPassed++;
  } else {
    console.log(`${RED}✗${RESET} ${testName}`);
    testsFailed++;
  }
}

// customer-documents-routes.js 소스 코드 읽기
const routesPath = path.join(__dirname, '..', 'routes', 'customer-documents-routes.js');
const routesSource = fs.readFileSync(routesPath, 'utf-8');

console.log('\n=== source_file_id / document_id 호환성 검증 ===\n');

// 1. source_file_id 비교에 .equals() 대신 .toString() 사용 확인
assert(
  !routesSource.includes('source_file_id?.equals('),
  'source_file_id에 .equals() 사용하지 않음 (string 호환)'
);

assert(
  routesSource.includes("source_file_id?.toString()"),
  'source_file_id를 .toString()으로 비교함'
);

// 2. document_id 비교에도 .toString() 사용 확인
assert(
  !routesSource.includes('document_id?.equals(doc._id)'),
  'document_id에 .equals(doc._id) 사용하지 않음 (string 호환)'
);

assert(
  routesSource.includes("document_id?.toString() === docIdStr"),
  'document_id를 .toString()으로 비교함'
);

// 3. docIdStr 변수가 선언되어 있는지 확인
assert(
  routesSource.includes('const docIdStr = doc._id.toString()'),
  'docIdStr 변수가 올바르게 선언됨'
);

// 결과 출력
console.log(`\n  Total: ${testsPassed + testsFailed}`);
if (testsFailed > 0) {
  console.log(`${RED}  Failed: ${testsFailed}${RESET}`);
  process.exit(1);
} else {
  console.log(`${GREEN}  All ${testsPassed} tests passed!${RESET}`);
}
