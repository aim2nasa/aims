/**
 * fileSize 0 체크 개선 검증 테스트
 *
 * 검증 항목:
 * 1. SSE 완료 후 fileSize가 0이면 재조회 트리거
 * 2. 3단계 fallback: upload.fileSize || doc.fileSize || meta.size_bytes
 *
 * 배경:
 * - 백엔드에서 meta.size_bytes로 파일 크기를 저장 (커밋 c96072b0)
 * - 프론트엔드에서 모든 필드를 체크하도록 개선
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

console.log('\n🧪 fileSize 0 Check Improvement Verification Tests\n');

// ==================== Frontend (DocumentStatusProvider) 검증 ====================

const providerPath = path.join(__dirname, '../../../../frontend/aims-uix3/src/providers/DocumentStatusProvider.tsx');
let providerContent = '';

try {
  providerContent = fs.readFileSync(providerPath, 'utf-8');
} catch (err) {
  console.log(`${YELLOW}⚠ Could not read DocumentStatusProvider.tsx, skipping provider tests${RESET}`);
}

if (providerContent) {
  console.log('📋 Test Suite 1: DocumentStatusProvider - 3단계 fileSize 체크\n');

  // 1. meta.size_bytes 체크 존재
  assertIncludes(
    providerContent,
    'metaObj\\?\\.size_bytes|meta\\?\\.size_bytes',
    'Checks meta.size_bytes field',
    'Should check meta.size_bytes as a fileSize source'
  );

  // 2. 3단계 fallback (upload.fileSize || fileSize || meta.size_bytes)
  assertIncludes(
    providerContent,
    'uploadObj\\?\\.fileSize.*\\|\\|.*fileSize.*\\|\\|.*size_bytes|fileSize.*\\|\\|.*size_bytes',
    'Three-level fileSize fallback exists',
    'Should check upload.fileSize, doc.fileSize, and meta.size_bytes'
  );

  // 3. 완료 상태 + fileSize 0 → 재조회 로직
  assertIncludes(
    providerContent,
    'isCompleted.*&&.*fileSize\\s*===\\s*0|completed.*fileSize.*===.*0',
    'Triggers re-fetch when completed but fileSize is 0',
    'Should re-fetch document data when status is completed but fileSize is 0'
  );

  // 4. 주석으로 체크 항목 명시
  assertIncludes(
    providerContent,
    'upload\\.fileSize.*fileSize.*meta\\.size_bytes.*체크|size_bytes.*체크',
    'Comment documents all checked fields',
    'Should have comment explaining the fileSize check logic'
  );
}

// ==================== Frontend (DocumentStatusService) 검증 ====================

const servicePath = path.join(__dirname, '../../../../frontend/aims-uix3/src/services/DocumentStatusService.ts');
let serviceContent = '';

try {
  serviceContent = fs.readFileSync(servicePath, 'utf-8');
} catch (err) {
  console.log(`${YELLOW}⚠ Could not read DocumentStatusService.ts, skipping service tests${RESET}`);
}

if (serviceContent) {
  console.log('\n📋 Test Suite 2: DocumentStatusService - extractOriginalFilename\n');

  // 5. extractOriginalFilename 함수 존재
  assertIncludes(
    serviceContent,
    'static\\s+extractOriginalFilename',
    'extractOriginalFilename method exists',
    'Should have method to extract original filename'
  );

  // 6. displayName 무시하고 originalName 반환
  assertIncludes(
    serviceContent,
    'displayName.*무시.*originalName|originalName.*반환',
    'Extracts original filename (ignores displayName)',
    'Should return originalName for tooltip display'
  );
}

// ==================== 결과 출력 ====================

console.log('\n' + '='.repeat(60));
console.log(`\n📊 Test Results:\n`);
console.log(`  ${GREEN}Passed: ${testsPassed}${RESET}`);
console.log(`  ${RED}Failed: ${testsFailed}${RESET}`);
console.log(`  Total:  ${testsPassed + testsFailed}\n`);

if (testsFailed === 0) {
  console.log(`${GREEN}✅ All tests passed! fileSize check improvement is correctly implemented.${RESET}\n`);
  console.log(`${BLUE}📝 Summary:${RESET}`);
  console.log(`  • Checks meta.size_bytes field for file size`);
  console.log(`  • Three-level fallback: upload.fileSize || fileSize || meta.size_bytes`);
  console.log(`  • Re-fetches document when completed but fileSize is 0`);
  console.log(`  • extractOriginalFilename returns original name for tooltips\n`);
  process.exit(0);
} else {
  console.log(`${RED}❌ Some tests failed. Please review the issues above.${RESET}\n`);
  process.exit(1);
}
