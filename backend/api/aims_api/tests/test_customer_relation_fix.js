/**
 * customer_relation → customerId 통일 검증 테스트
 *
 * 검증 항목:
 * 1. server.js에 customer_relation.customer_id 참조가 남아있지 않은지
 * 2. 모든 쿼리가 customerId를 사용하는지
 * 3. 응답 생성 시 customerId를 사용하는지
 */

const fs = require('fs');
const path = require('path');

// ANSI 색상 코드
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
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

function assertNotIncludes(content, searchString, testName, context = '') {
  const lines = content.split('\n');
  const matches = [];

  lines.forEach((line, index) => {
    if (line.includes(searchString)) {
      // customer_relationships 컬렉션은 제외
      // customerRelation 변수도 제외
      if (line.includes('customer_relationships') ||
          line.includes('customerRelation =') ||
          line.includes('customer_relation 변환')) {
        return;
      }
      matches.push({ lineNumber: index + 1, line: line.trim() });
    }
  });

  if (matches.length === 0) {
    console.log(`${GREEN}✓${RESET} ${testName}`);
    testsPassed++;
  } else {
    console.log(`${RED}✗${RESET} ${testName}`);
    console.log(`  ${RED}Found ${matches.length} occurrence(s):${RESET}`);
    matches.forEach(match => {
      console.log(`    Line ${match.lineNumber}: ${match.line}`);
    });
    if (context) {
      console.log(`  ${YELLOW}Context: ${context}${RESET}`);
    }
    testsFailed++;
  }
}

function assertIncludes(content, searchString, testName, minCount = 1) {
  const count = (content.match(new RegExp(searchString, 'g')) || []).length;

  if (count >= minCount) {
    console.log(`${GREEN}✓${RESET} ${testName} (found ${count} times)`);
    testsPassed++;
  } else {
    console.log(`${RED}✗${RESET} ${testName}`);
    console.log(`  ${RED}Expected at least ${minCount}, found ${count}${RESET}`);
    testsFailed++;
  }
}

console.log('\n🧪 Starting customer_relation → customerId Migration Tests\n');

// 리팩토링 후 라우트 파일들에서 코드 읽기 (server.js → routes/*.js로 이동됨)
const routeFiles = [
  path.join(__dirname, '../server.js'),
  path.join(__dirname, '../routes/documents-routes.js'),
  path.join(__dirname, '../routes/customers-routes.js'),
  path.join(__dirname, '../routes/admin-routes.js'),
  path.join(__dirname, '../routes/webhooks-routes.js'),
];
const serverContent = routeFiles
  .filter(f => fs.existsSync(f))
  .map(f => fs.readFileSync(f, 'utf-8'))
  .join('\n');

console.log('📋 Test Suite 1: No customer_relation.customer_id references\n');

assertNotIncludes(
  serverContent,
  "customer_relation?.customer_id",
  'No customer_relation?.customer_id in customerIds collection',
  'Should use doc.customerId instead'
);

assertNotIncludes(
  serverContent,
  "'customer_relation.customer_id'",
  'No customer_relation.customer_id in filter queries',
  'Should use customerId for filters'
);

assertNotIncludes(
  serverContent,
  "localField: 'customer_relation.customer_id'",
  'No customer_relation.customer_id in $lookup aggregation',
  'Should use customerId for joins'
);

console.log('\n📋 Test Suite 2: Correct customerId usage\n');

assertIncludes(
  serverContent,
  ".filter\\(doc => doc\\.customerId\\)",
  'customerIds filtering uses doc.customerId',
  2  // Should appear in both /api/documents and /api/documents/status
);

assertIncludes(
  serverContent,
  "const id = doc\\.customerId;",
  'customerIds mapping uses doc.customerId',
  2  // Should appear in both endpoints
);

assertIncludes(
  serverContent,
  "filter\\['customerId'\\] = \\{ \\$exists: true",
  'customerLink filter uses customerId',
  1
);

assertIncludes(
  serverContent,
  "localField: 'customerId'",
  '$lookup uses customerId for join',
  1
);

console.log('\n📋 Test Suite 3: Annual Report customer ID extraction\n');

assertIncludes(
  serverContent,
  "[Cc]ustomer[Ii]d\\s*=\\s*document\\.customerId",
  'AR deletion uses document.customerId (customerId or arCustomerId)',
  3  // Should appear in 3 places: customerId (2x) + arCustomerId (1x)
);

assertNotIncludes(
  serverContent,
  "document.customer_relation?.customer_id",
  'No AR code uses customer_relation.customer_id',
  'Should use document.customerId'
);

console.log('\n📋 Test Suite 4: Data integrity checks\n');

assertIncludes(
  serverContent,
  "\\{ 'customerId': \\{ \\$exists: true, \\$ne: null \\} \\}",
  'Orphaned file detection uses customerId',
  2  // Should appear in report and cleanup
);

assertIncludes(
  serverContent,
  "const customerId = f\\.customerId\\?\\.",
  'Orphaned file filtering uses f.customerId',
  2  // Should appear in report and cleanup
);

assertIncludes(
  serverContent,
  "\\$unset: \\{ 'customerId': '', 'customer_notes': ''",
  'Orphaned cleanup unsets both customerId and customer_notes',
  1
);

console.log('\n📋 Test Suite 5: Response generation\n');

assertIncludes(
  serverContent,
  "const effectiveCustomerId = doc\\.customerId;",
  'Response uses doc.customerId (not customer_relation fallback)',
  2  // Should appear in both endpoints
);

assertIncludes(
  serverContent,
  "notes: doc\\.customer_notes",
  'Response uses doc.customer_notes for notes',
  2  // Should appear in both endpoints
);

console.log('\n' + '='.repeat(60));
console.log(`\n📊 Test Results:\n`);
console.log(`  ${GREEN}Passed: ${testsPassed}${RESET}`);
console.log(`  ${RED}Failed: ${testsFailed}${RESET}`);
console.log(`  Total:  ${testsPassed + testsFailed}\n`);

if (testsFailed === 0) {
  console.log(`${GREEN}✅ All tests passed! Migration is complete.${RESET}\n`);
  process.exit(0);
} else {
  console.log(`${RED}❌ Some tests failed. Please review the issues above.${RESET}\n`);
  process.exit(1);
}
