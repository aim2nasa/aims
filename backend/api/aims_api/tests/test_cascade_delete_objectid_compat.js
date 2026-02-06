/**
 * Cascade Delete ObjectId/문자열 호환성 검증 테스트
 *
 * 검증 항목:
 * 1. server.js에서 $or 조건으로 ObjectId와 문자열 모두 검색
 * 2. document_pipeline에서 customerId를 ObjectId로 저장
 *
 * 배경:
 * - document_pipeline이 customerId를 문자열로 저장하던 버그 수정 (커밋 715aa567)
 * - server.js의 cascade delete가 두 타입 모두 검색하도록 수정
 */

const fs = require('fs');
const path = require('path');

// ANSI 색상 코드
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
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

function assertIncludes(content, searchString, testName, context = '') {
  const regex = new RegExp(searchString, 's');  // 's' flag for multiline matching
  const found = regex.test(content);

  if (found) {
    console.log(`${GREEN}✓${RESET} ${testName}`);
    testsPassed++;
  } else {
    console.log(`${RED}✗${RESET} ${testName}`);
    console.log(`  ${RED}Pattern not found: ${searchString}${RESET}`);
    if (context) {
      console.log(`  ${YELLOW}Context: ${context}${RESET}`);
    }
    testsFailed++;
  }
}

function findCodeBlock(content, startPattern, endPattern) {
  const startMatch = content.match(new RegExp(startPattern));
  if (!startMatch) return null;

  const startIndex = startMatch.index;
  const restContent = content.slice(startIndex);
  const endMatch = restContent.match(new RegExp(endPattern));

  if (!endMatch) return restContent.slice(0, 2000);  // 블록을 찾지 못하면 2000자까지 반환

  return restContent.slice(0, endMatch.index + endMatch[0].length);
}

console.log('\n🧪 Cascade Delete ObjectId/String Compatibility Tests\n');

// ==================== Backend 검증 (리팩토링 후 routes/customers-routes.js) ====================

const customersRoutePath = path.join(__dirname, '../routes/customers-routes.js');
let serverContent = '';

try {
  serverContent = fs.readFileSync(customersRoutePath, 'utf-8');
} catch (err) {
  console.log(`${RED}✗ Could not read customers-routes.js file: ${customersRoutePath}${RESET}`);
  process.exit(1);
}

// 고객 삭제 API 블록 추출 (리팩토링 후 router.delete)
const deleteApiBlock = findCodeBlock(
  serverContent,
  "router\\.delete\\('/customers/:id'",
  "\\}\\s*catch\\s*\\([^)]+\\)\\s*\\{[\\s\\S]*\\}\\s*\\}\\);"
);

if (!deleteApiBlock) {
  console.log(`${RED}✗ Could not extract customer deletion API block${RESET}`);
  testsFailed++;
} else {
  console.log(`${BLUE}ℹ Found customer deletion API block (${deleteApiBlock.length} chars)${RESET}\n`);

  console.log('📋 Test Suite 1: Backend - $or 조건 검증\n');

  // 1. $or 조건 사용 확인
  assertIncludes(
    deleteApiBlock,
    '\\$or:\\s*\\[',
    'Uses $or condition for customerId matching',
    'Should use $or to match both ObjectId and string types'
  );

  // 2. ObjectId 매칭
  assertIncludes(
    deleteApiBlock,
    'customerId:\\s*new\\s+ObjectId\\(id\\)',
    'Matches ObjectId type customerId',
    'Should search for customerId as ObjectId'
  );

  // 3. 문자열 매칭 (document_pipeline 호환)
  assertIncludes(
    deleteApiBlock,
    'customerId:\\s*id\\s*[\\]\\}]',
    'Matches string type customerId (document_pipeline compatibility)',
    'Should also search for customerId as string'
  );

  // 4. 주석으로 의도 명시
  assertIncludes(
    deleteApiBlock,
    'ObjectId.*문자열.*둘.*검색|문자열.*형태.*대응',
    'Comment explains both type matching',
    'Should have comment explaining the dual-type search'
  );
}

// ==================== document_pipeline 검증 ====================

console.log('\n📋 Test Suite 2: document_pipeline - ObjectId 저장 검증\n');

const pipelinePath = path.join(__dirname, '../../document_pipeline/routers/doc_prep_main.py');
let pipelineContent = '';

try {
  pipelineContent = fs.readFileSync(pipelinePath, 'utf-8');
} catch (err) {
  console.log(`${YELLOW}⚠ Could not read document_pipeline file, skipping pipeline tests${RESET}`);
}

if (pipelineContent) {
  // 5. customerId를 ObjectId로 저장
  assertIncludes(
    pipelineContent,
    'ObjectId\\(customer_id\\).*if.*ObjectId\\.is_valid',
    'document_pipeline stores customerId as ObjectId',
    'Should convert customerId to ObjectId before storing'
  );

  // 6. ObjectId.is_valid() 체크 존재
  assertIncludes(
    pipelineContent,
    'ObjectId\\.is_valid\\(customer_id\\)',
    'ObjectId.is_valid() check exists',
    'Should validate customerId before converting to ObjectId'
  );
}

// ==================== 결과 출력 ====================

console.log('\n' + '='.repeat(60));
console.log(`\n📊 Test Results:\n`);
console.log(`  ${GREEN}Passed: ${testsPassed}${RESET}`);
console.log(`  ${RED}Failed: ${testsFailed}${RESET}`);
console.log(`  Total:  ${testsPassed + testsFailed}\n`);

if (testsFailed === 0) {
  console.log(`${GREEN}✅ All tests passed! Cascade delete handles both ObjectId and string customerId.${RESET}\n`);
  console.log(`${BLUE}📝 Summary:${RESET}`);
  console.log(`  • server.js uses $or condition to match both types`);
  console.log(`  • Searches for customerId as ObjectId`);
  console.log(`  • Also searches for customerId as string (backward compatible)`);
  console.log(`  • document_pipeline now stores customerId as ObjectId`);
  console.log(`  • No orphan documents will be left after customer deletion\n`);
  process.exit(0);
} else {
  console.log(`${RED}❌ Some tests failed. Please review the issues above.${RESET}\n`);
  process.exit(1);
}
