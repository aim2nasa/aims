/**
 * [Regression] customer_type이 문서 목록 API 응답에 포함되는지 검증
 *
 * 버그: 법인 고객 아이콘이 폴링 갱신 시 개인으로 깜빡임
 * 원인: /api/documents/status의 customerRelation에 customer_type 누락
 * 수정: customerMap에 type 포함, customerRelation에 customer_type 추가
 *
 * 커밋: 이번 커밋
 */

const fs = require('fs');
const path = require('path');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName, errorMessage) {
  if (condition) {
    console.log(`${GREEN}✓${RESET} ${testName}`);
    testsPassed++;
  } else {
    console.log(`${RED}✗${RESET} ${testName}`);
    console.log(`  ${RED}${errorMessage}${RESET}`);
    testsFailed++;
  }
}

// documents-routes.js 파일 읽기
const routesPath = path.join(__dirname, '..', 'routes', 'documents-routes.js');
const content = fs.readFileSync(routesPath, 'utf-8');

console.log('\n=== customer_type API 응답 포함 여부 검증 ===\n');

// 테스트 1: customerMap 구성 시 insurance_info.customer_type projection 포함
const projectionMatches = content.match(/insurance_info\.customer_type/g);
assert(
  projectionMatches && projectionMatches.length >= 2,
  '[회귀] customerMap projection에 insurance_info.customer_type 포함 (최소 2곳)',
  `insurance_info.customer_type 참조가 ${projectionMatches ? projectionMatches.length : 0}곳 — 최소 2곳 필요 (GET /documents + GET /documents/status)`
);

// 테스트 2: customerRelation에 customer_type 필드 포함
const customerTypeInRelation = content.match(/customer_type\s*:\s*customerMap/g);
assert(
  customerTypeInRelation && customerTypeInRelation.length >= 2,
  '[회귀] customerRelation에 customer_type 필드 포함 (최소 2곳)',
  `customer_type: customerMap 패턴이 ${customerTypeInRelation ? customerTypeInRelation.length : 0}곳 — 최소 2곳 필요`
);

// 테스트 3: customerMap 값이 객체 형태 ({name, type})
const objectMapPattern = /customerMap\[.*?\]\s*=\s*\{/g;
const objectMapMatches = content.match(objectMapPattern);
assert(
  objectMapMatches && objectMapMatches.length >= 2,
  '[회귀] customerMap 값이 객체 형태 (name+type 포함) (최소 2곳)',
  `customerMap[...] = { 패턴이 ${objectMapMatches ? objectMapMatches.length : 0}곳`
);

// 테스트 4: customer_name 접근 시 .name 옵셔널 체이닝 사용
const optionalChaining = content.match(/customerMap\[.*?\]\?\.name/g);
assert(
  optionalChaining && optionalChaining.length >= 2,
  '[회귀] customer_name 접근 시 ?.name 옵셔널 체이닝 사용 (null safety)',
  `?.name 패턴이 ${optionalChaining ? optionalChaining.length : 0}곳`
);

// 결과 출력
console.log(`\n총 ${testsPassed + testsFailed}건 중 ${GREEN}${testsPassed} PASS${RESET}, ${testsFailed > 0 ? RED : GREEN}${testsFailed} FAIL${RESET}`);
process.exit(testsFailed > 0 ? 1 : 0);
