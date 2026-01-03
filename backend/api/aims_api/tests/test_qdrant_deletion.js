/**
 * Qdrant 임베딩 삭제 기능 검증 테스트
 *
 * 검증 항목:
 * 1. QdrantClient가 checkCompatibility: false로 생성되는지
 * 2. 단일 문서 삭제 시 Qdrant 삭제 포함
 * 3. 복수 문서 삭제 시 Qdrant 삭제 포함
 * 4. 고객 cascade 삭제 시 Qdrant 삭제 포함
 * 5. Qdrant 삭제 실패 시 에러 핸들링
 *
 * @since 2025-12-13
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

function findCodeBlock(content, startPattern, endPatternOrLength) {
  const startMatch = content.match(new RegExp(startPattern));
  if (!startMatch) return null;

  const startIndex = startMatch.index;

  if (typeof endPatternOrLength === 'number') {
    return content.slice(startIndex, startIndex + endPatternOrLength);
  }

  const restContent = content.slice(startIndex);
  const endMatch = restContent.match(new RegExp(endPatternOrLength));

  if (!endMatch) return null;

  return restContent.slice(0, endMatch.index + endMatch[0].length);
}

console.log('\n🧪 Qdrant Deletion Verification Tests\n');

// ==================== 서버 코드 로드 ====================

const serverPath = path.join(__dirname, '../server.js');
let serverContent;

try {
  serverContent = fs.readFileSync(serverPath, 'utf-8');
} catch (err) {
  console.log(`${RED}✗ Cannot read server.js: ${err.message}${RESET}`);
  process.exit(1);
}

// ==================== Test Suite 1: Qdrant 클라이언트 설정 ====================

console.log('📋 Test Suite 1: Qdrant Client Configuration\n');

// 1. QdrantClient import 존재
assertIncludes(
  serverContent,
  "require\\(['\"]@qdrant/js-client-rest['\"]\\)",
  'QdrantClient package is imported'
);

// 2. QDRANT_COLLECTION 상수 정의
assertIncludes(
  serverContent,
  "QDRANT_COLLECTION\\s*=\\s*['\"]docembed['\"]",
  'QDRANT_COLLECTION is set to "docembed"'
);

// 3. checkCompatibility: false 설정 (호환성 문제 해결)
assertIncludes(
  serverContent,
  "checkCompatibility:\\s*false",
  'QdrantClient has checkCompatibility: false',
  'Required to fix client 1.15.x / server 1.9.0 version mismatch'
);

// 4. QdrantClient 인스턴스 생성
assertIncludes(
  serverContent,
  "new\\s+QdrantClient\\s*\\(",
  'QdrantClient instance is created'
);

// ==================== Test Suite 2: 단일 문서 삭제 ====================

console.log('\n📋 Test Suite 2: Single Document Deletion (DELETE /api/documents/:id)\n');

// 단일 문서 삭제 API 블록 추출 (Qdrant 삭제까지 포함하려면 7500자 이상 필요)
const singleDeleteBlock = findCodeBlock(
  serverContent,
  "app\\.delete\\('/api/documents/:id'",
  7500  // 약 7500자 추출 (Qdrant 삭제 코드 포함)
);

if (!singleDeleteBlock) {
  console.log(`${RED}✗ Could not find single document deletion API${RESET}`);
  testsFailed++;
} else {
  console.log(`${BLUE}ℹ Found single document deletion block (${singleDeleteBlock.length} chars)${RESET}\n`);

  // 5. Qdrant 삭제 로직 존재
  assertIncludes(
    singleDeleteBlock,
    "qdrantClient\\.delete\\s*\\(\\s*QDRANT_COLLECTION",
    'Qdrant deletion is called in single document delete'
  );

  // 6. doc_id 필터 사용
  assertIncludes(
    singleDeleteBlock,
    "key:\\s*['\"]doc_id['\"]",
    'Qdrant deletion uses doc_id filter'
  );

  // 7. 에러 핸들링 존재
  assertIncludes(
    singleDeleteBlock,
    "catch\\s*\\(qdrantError\\)",
    'Qdrant deletion has error handling'
  );

  // 8. 삭제 로그 출력
  assertIncludes(
    singleDeleteBlock,
    "\\[Qdrant\\].*삭제",
    'Qdrant deletion has logging'
  );
}

// ==================== Test Suite 3: 복수 문서 삭제 ====================

console.log('\n📋 Test Suite 3: Bulk Document Deletion (DELETE /api/documents)\n');

// 복수 문서 삭제 API 블록 추출
const bulkDeleteStartIndex = serverContent.indexOf("app.delete('/api/documents', authenticateJWT");
if (bulkDeleteStartIndex === -1) {
  console.log(`${RED}✗ Could not find bulk document deletion API${RESET}`);
  testsFailed++;
} else {
  // Qdrant 삭제 코드가 endpoint 시작에서 약 130줄 뒤에 있으므로 8000자 추출
  const bulkDeleteBlock = serverContent.slice(bulkDeleteStartIndex, bulkDeleteStartIndex + 8000);
  console.log(`${BLUE}ℹ Found bulk document deletion block (${bulkDeleteBlock.length} chars)${RESET}\n`);

  // 9. 반복문 내 Qdrant 삭제
  assertIncludes(
    bulkDeleteBlock,
    "for\\s*\\([^)]*docId[^)]*\\)",
    'Bulk deletion has document loop'
  );

  // 10. Qdrant 삭제 호출
  assertIncludes(
    bulkDeleteBlock,
    "qdrantClient\\.delete",
    'Qdrant deletion is called in bulk delete'
  );
}

// ==================== Test Suite 4: 고객 Cascade 삭제 ====================

console.log('\n📋 Test Suite 4: Customer Cascade Deletion\n');

// 고객 삭제 API 블록 추출
const customerDeleteBlock = findCodeBlock(
  serverContent,
  "app\\.delete\\('/api/customers/:id'",
  8000  // 고객 삭제는 더 큼
);

if (!customerDeleteBlock) {
  console.log(`${RED}✗ Could not find customer deletion API${RESET}`);
  testsFailed++;
} else {
  console.log(`${BLUE}ℹ Found customer deletion block (${customerDeleteBlock.length} chars)${RESET}\n`);

  // 11. 고객 문서 조회
  assertIncludes(
    customerDeleteBlock,
    "customerId.*new\\s*ObjectId\\(id\\)",
    'Customer documents are queried by customerId'
  );

  // 12. 문서별 Qdrant 삭제
  assertIncludes(
    customerDeleteBlock,
    "qdrantClient\\.delete.*QDRANT_COLLECTION",
    'Qdrant deletion is called in customer cascade delete'
  );
}

// ==================== Test Suite 5: 삭제 순서 검증 ====================

console.log('\n📋 Test Suite 5: Deletion Order Verification\n');

if (singleDeleteBlock) {
  // 13. MongoDB 삭제 전에 파일 삭제
  const fsUnlinkIndex = singleDeleteBlock.indexOf('fs.unlink(');
  const mongoDeleteIndex = singleDeleteBlock.indexOf('.deleteOne({ _id: new ObjectId(id)');

  assert(
    fsUnlinkIndex > 0 && mongoDeleteIndex > 0 && fsUnlinkIndex < mongoDeleteIndex,
    'File deletion before MongoDB deletion',
    'Physical file should be deleted before MongoDB document'
  );

  // 14. Qdrant 삭제가 MongoDB 삭제 후에
  const qdrantDeleteIndex = singleDeleteBlock.indexOf('qdrantClient.delete(QDRANT_COLLECTION');

  assert(
    mongoDeleteIndex > 0 && qdrantDeleteIndex > 0 && mongoDeleteIndex < qdrantDeleteIndex,
    'Qdrant deletion after MongoDB deletion',
    'Qdrant should be deleted after MongoDB (already committed)'
  );
}

// ==================== 결과 출력 ====================

console.log('\n' + '='.repeat(50));
console.log(`\n📊 Test Results: ${GREEN}${testsPassed} passed${RESET}, ${testsFailed > 0 ? RED : ''}${testsFailed} failed${RESET}\n`);

if (testsFailed > 0) {
  console.log(`${RED}❌ Some tests failed!${RESET}`);
  console.log(`${YELLOW}ℹ  Qdrant deletion may not work correctly.${RESET}`);
  console.log(`${YELLOW}ℹ  Common issues:${RESET}`);
  console.log(`${YELLOW}   - Missing checkCompatibility: false (client/server version mismatch)${RESET}`);
  console.log(`${YELLOW}   - Qdrant deletion code removed or modified${RESET}`);
  process.exit(1);
} else {
  console.log(`${GREEN}✅ All tests passed!${RESET}`);
  console.log(`${BLUE}ℹ  Qdrant deletion functionality is properly implemented.${RESET}`);
  process.exit(0);
}
