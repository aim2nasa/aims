/**
 * AR/CRS displayName 자동 생성 검증 테스트
 *
 * 검증 항목:
 * 1. AR 감지 시 displayName 형식: {고객명}_AR_{발행일}.pdf
 * 2. CRS 감지 시 displayName 형식: {고객명}_CRS_{상품명}_{발행일}.pdf
 * 3. 고객명/발행일 추출 패턴
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

console.log('\n🧪 AR/CRS displayName Auto-Generation Verification Tests\n');

// ==================== Backend (document_pipeline) 검증 ====================

const pipelinePath = path.join(__dirname, '../../document_pipeline/routers/doc_prep_main.py');
let pipelineContent = '';

try {
  pipelineContent = fs.readFileSync(pipelinePath, 'utf-8');
} catch (err) {
  console.log(`${RED}✗ Could not read document_pipeline file: ${pipelinePath}${RESET}`);
  process.exit(1);
}

console.log('📋 Test Suite 1: AR displayName 생성 로직\n');

// 1. AR 감지 함수 존재
assertIncludes(
  pipelineContent,
  'async\\s+def\\s+_detect_and_process_annual_report',
  'AR detection function exists (_detect_and_process_annual_report)'
);

// 2. AR displayName 형식: {고객명}_AR_{발행일}.pdf
assertIncludes(
  pipelineContent,
  'f"\\{customer_name\\}_AR_\\{issue_date\\}\\.pdf"',
  'AR displayName format is correct ({고객명}_AR_{발행일}.pdf)',
  'Should generate displayName with customer name and issue date'
);

// 3. 고객명 추출 패턴: "XXX 고객님을 위한"
assertIncludes(
  pipelineContent,
  '\\[가-힣\\]\\{2,10\\}.*고객님',
  'Customer name extraction pattern exists (XXX 고객님을 위한)',
  'Should extract customer name from AR text'
);

// 4. 발행기준일 추출 패턴
assertIncludes(
  pipelineContent,
  '발행기준일.*\\\\d\\{4\\}',
  'Issue date extraction pattern exists (발행기준일: YYYY-MM-DD)',
  'Should extract issue date from AR text'
);

// 5. displayName DB 저장
assertIncludes(
  pipelineContent,
  'update_fields\\["displayName"\\]\\s*=\\s*display_name',
  'AR displayName is saved to database',
  'Should store displayName in update_fields'
);

// 6. AR 플래그 설정
assertIncludes(
  pipelineContent,
  '"is_annual_report":\\s*True',
  'AR flag is set (is_annual_report: True)',
  'Should mark document as annual report'
);

console.log('\n📋 Test Suite 2: CRS displayName 생성 로직\n');

// 7. CRS 감지 함수 존재
assertIncludes(
  pipelineContent,
  'async\\s+def\\s+_detect_and_process_customer_review',
  'CRS detection function exists (_detect_and_process_customer_review)'
);

// 8. CRS displayName 형식: {고객명}_CRS_{상품명}_{발행일}.pdf
assertIncludes(
  pipelineContent,
  'f"\\{customer_name\\}_CRS_\\{safe_product\\}_\\{issue_date\\}\\.pdf"',
  'CRS displayName format is correct ({고객명}_CRS_{상품명}_{발행일}.pdf)',
  'Should generate displayName with customer name, product, and date'
);

// 9. 상품명 정규화 (파일명 불가 문자 제거)
assertIncludes(
  pipelineContent,
  're\\.sub\\(r\'\\[.*\\\\/:.*\\]',
  'Product name sanitization exists (removes invalid filename characters)',
  'Should remove characters that are invalid in filenames'
);

// 10. 상품명 없이 생성 가능 (fallback)
assertIncludes(
  pipelineContent,
  'f"\\{customer_name\\}_CRS_\\{issue_date\\}\\.pdf"',
  'CRS displayName fallback (without product name) exists',
  'Should generate displayName even without product name'
);

// ==================== 결과 출력 ====================

console.log('\n' + '='.repeat(60));
console.log(`\n📊 Test Results:\n`);
console.log(`  ${GREEN}Passed: ${testsPassed}${RESET}`);
console.log(`  ${RED}Failed: ${testsFailed}${RESET}`);
console.log(`  Total:  ${testsPassed + testsFailed}\n`);

if (testsFailed === 0) {
  console.log(`${GREEN}✅ All tests passed! AR/CRS displayName auto-generation is correctly implemented.${RESET}\n`);
  console.log(`${BLUE}📝 Summary:${RESET}`);
  console.log(`  • AR displayName format: {고객명}_AR_{발행일}.pdf`);
  console.log(`  • CRS displayName format: {고객명}_CRS_{상품명}_{발행일}.pdf`);
  console.log(`  • Customer name extracted from "XXX 고객님을 위한" pattern`);
  console.log(`  • Issue date extracted from "발행기준일" pattern`);
  console.log(`  • Product name sanitized for filename safety`);
  console.log(`  • Fallback available when product name missing\n`);
  process.exit(0);
} else {
  console.log(`${RED}❌ Some tests failed. Please review the issues above.${RESET}\n`);
  process.exit(1);
}
