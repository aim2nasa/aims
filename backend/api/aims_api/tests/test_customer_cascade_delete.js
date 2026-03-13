/**
 * 고객 삭제 시 Cascade Delete 검증 테스트
 *
 * 검증 항목:
 * 1. customerId로 문서를 조회하는지
 * 2. 모든 문서를 완전히 삭제하는지 (파일 + DB + Qdrant)
 * 3. 프론트엔드에서 이벤트를 발생시키는지
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
  const regex = new RegExp(searchString);
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

  if (!endMatch) return null;

  return restContent.slice(0, endMatch.index + endMatch[0].length);
}

console.log('\n🧪 Customer Cascade Delete Verification Tests\n');

// ==================== 백엔드 검증 ====================

// 리팩토링 후 라우트 파일들에서 코드 읽기 (server.js → routes/*.js로 이동됨)
const routeFiles = [
  path.join(__dirname, '../server.js'),
  path.join(__dirname, '../routes/customers-routes.js'),
  path.join(__dirname, '../routes/documents-routes.js'),
  path.join(__dirname, '../routes/admin-routes.js'),
];
const serverContent = routeFiles
  .filter(f => fs.existsSync(f))
  .map(f => fs.readFileSync(f, 'utf-8'))
  .join('\n');

console.log('📋 Test Suite 1: Backend - Customer Deletion API\n');

// 1. 고객 삭제 API 엔드포인트 존재 (router.delete로 이동됨)
assertIncludes(
  serverContent,
  "router\\.delete\\('/customers/:id'",
  'Customer deletion API endpoint exists'
);

// 2. customerId로 문서 조회
assertIncludes(
  serverContent,
  'customerId:\\s*new\\s*ObjectId\\(id\\)',
  'Documents queried by customerId in customer deletion',
  'Should use customerId to find all related documents'
);

// 3. 고객 삭제 API 내의 cascade delete 블록 추출
// customers-routes.js에서 직접 추출 (리팩토링 후)
const customersRoutePath = path.join(__dirname, '../routes/customers-routes.js');
const customersRouteContent = fs.readFileSync(customersRoutePath, 'utf-8');
const deleteApiBlock = findCodeBlock(
  customersRouteContent,
  "router\\.delete\\('/customers/:id'",
  "\\}\\s*catch\\s*\\([^)]+\\)\\s*\\{[\\s\\S]*\\}\\s*\\}\\);"
);

if (!deleteApiBlock) {
  console.log(`${RED}✗ Could not extract customer deletion API block${RESET}`);
  testsFailed++;
} else {
  console.log(`${BLUE}ℹ Found customer deletion API block (${deleteApiBlock.length} chars)${RESET}\n`);

  console.log('📋 Test Suite 2: Backend - Document Deletion Loop\n');

  // 4. 문서 삭제 루프 존재
  assertIncludes(
    deleteApiBlock,
    'for\\s*\\(const\\s+document\\s+of\\s+customerDocuments\\)',
    'Document deletion loop exists'
  );

  // 5. 파일 시스템에서 파일 삭제
  assertIncludes(
    deleteApiBlock,
    'await\\s+fs\\.unlink\\(document\\.upload\\.destPath\\)',
    'Physical file deletion (fs.unlink)'
  );

  // 6. MongoDB에서 문서 삭제
  assertIncludes(
    deleteApiBlock,
    'await\\s+db\\.collection\\(COLLECTION_NAME\\)\\.deleteOne\\(\\{\\s*_id:\\s*document\\._id',
    'MongoDB document deletion'
  );

  // 7. Qdrant에서 임베딩 삭제
  assertIncludes(
    deleteApiBlock,
    'await\\s+qdrantClient\\.delete\\(QDRANT_COLLECTION',
    'Qdrant embedding deletion'
  );

  // 8. AR 파싱 데이터 삭제
  assertIncludes(
    deleteApiBlock,
    'if\\s*\\(document\\.is_annual_report\\)',
    'Annual Report parsing data deletion check'
  );

  console.log('\n📋 Test Suite 3: Backend - Deletion Order\n');

  // 9. 관계 삭제가 문서 삭제보다 먼저
  const relationshipDeleteIndex = deleteApiBlock.indexOf("deleteMany({");
  const documentDeleteIndex = deleteApiBlock.indexOf("for (const document of customerDocuments)");

  assert(
    relationshipDeleteIndex < documentDeleteIndex && relationshipDeleteIndex > 0,
    'Relationships deleted before documents',
    'Relationships deletion should occur before document deletion'
  );

  // 10. 문서 삭제가 고객 삭제보다 먼저
  const finalCustomerDeleteIndex = deleteApiBlock.lastIndexOf("deleteOne({ _id: customerId })");

  assert(
    documentDeleteIndex < finalCustomerDeleteIndex && finalCustomerDeleteIndex > 0,
    'Documents deleted before customer',
    'Documents deletion should occur before customer deletion'
  );
}

// ==================== 프론트엔드 검증 ====================

console.log('\n📋 Test Suite 4: Frontend - Customer Deletion\n');

const customerServicePath = path.join(__dirname, '../../../../frontend/aims-uix3/src/services/customerService.ts');
let frontendTests = 0;
let frontendContent = '';

try {
  frontendContent = fs.readFileSync(customerServicePath, 'utf-8');
  frontendTests = 1;
} catch (err) {
  console.log(`${YELLOW}⚠ Frontend file not found, skipping frontend tests${RESET}`);
}

if (frontendTests > 0) {
  // 11. deleteCustomer 메서드 존재 (Soft Delete)
  assertIncludes(
    frontendContent,
    'static\\s+async\\s+deleteCustomer\\(id:\\s*string\\)',
    'Frontend deleteCustomer method exists'
  );

  // 12. permanentDeleteCustomer 메서드 존재 (Hard Delete with Cascade)
  assertIncludes(
    frontendContent,
    'static\\s+async\\s+permanentDeleteCustomer\\(id:\\s*string\\)',
    'Frontend permanentDeleteCustomer method exists'
  );

  // 13. DELETE API 호출 (제네릭 타입 포함)
  assertIncludes(
    frontendContent,
    'await\\s+api\\.delete<',
    'Frontend calls DELETE API endpoint'
  );

  // 14. Cascade delete 경고 주석
  assertIncludes(
    frontendContent,
    '연결된 문서, 계약, 관계도 모두 삭제',
    'Frontend acknowledges cascade deletion in comments'
  );

  // 15. customerChanged 이벤트 발생 (invalidateQueries 또는 dispatchEvent)
  assertIncludes(
    frontendContent,
    "customerChanged",
    'Frontend dispatches customerChanged event'
  );

  // 16. contractChanged 이벤트 발생 (invalidateQueries 또는 dispatchEvent)
  assertIncludes(
    frontendContent,
    "contractChanged",
    'Frontend dispatches contractChanged event'
  );

  // 17. documentChanged 이벤트 발생 (invalidateQueries 또는 dispatchEvent)
  assertIncludes(
    frontendContent,
    "documentChanged",
    'Frontend dispatches documentChanged event'
  );
}

// ==================== 통합 검증 ====================

console.log('\n📋 Test Suite 5: Integration - Complete Cascade Delete Flow\n');

// 15. 삭제 순서가 올바른지 확인 (백엔드)
const deletionSteps = [
  { name: 'Relationships', pattern: 'CUSTOMER_RELATIONSHIPS.*deleteMany' },
  { name: 'Contracts', pattern: 'contracts.*deleteMany' },
  { name: 'Documents', pattern: 'for \\(const document of customerDocuments\\)' },
  { name: 'Customer', pattern: 'CUSTOMERS_COLLECTION.*deleteOne.*customerId' }
];

let allStepsFound = true;
let previousIndex = 0;

deletionSteps.forEach((step, i) => {
  const regex = new RegExp(step.pattern);
  const match = deleteApiBlock.slice(previousIndex).match(regex);

  if (!match) {
    console.log(`${RED}✗ Step ${i + 1} (${step.name}) not found in order${RESET}`);
    allStepsFound = false;
    testsFailed++;
  } else {
    previousIndex += match.index + match[0].length;
    console.log(`${GREEN}✓ Step ${i + 1} (${step.name}) found in correct order${RESET}`);
    testsPassed++;
  }
});

// ==================== 결과 출력 ====================

console.log('\n' + '='.repeat(60));
console.log(`\n📊 Test Results:\n`);
console.log(`  ${GREEN}Passed: ${testsPassed}${RESET}`);
console.log(`  ${RED}Failed: ${testsFailed}${RESET}`);
console.log(`  Total:  ${testsPassed + testsFailed}\n`);

if (testsFailed === 0) {
  console.log(`${GREEN}✅ All tests passed! Customer cascade delete is correctly implemented.${RESET}\n`);
  console.log(`${BLUE}📝 Summary:${RESET}`);
  console.log(`  • Documents queried by customerId`);
  console.log(`  • Files deleted from filesystem`);
  console.log(`  • Documents deleted from MongoDB`);
  console.log(`  • Embeddings deleted from Qdrant`);
  console.log(`  • AR parsing data deleted`);
  console.log(`  • Correct deletion order: Relationships → Contracts → Documents → Customer\n`);
  process.exit(0);
} else {
  console.log(`${RED}❌ Some tests failed. Please review the issues above.${RESET}\n`);
  process.exit(1);
}
