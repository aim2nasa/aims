/**
 * Regression Test — AI 어시스턴트 도구 선택 일관성
 *
 * 버그: "캐치업코리아 자동차 정보" vs "캐치업코리아 자동차 정보 알려줘"가
 *       각각 list_contracts / search_documents로 다르게 라우팅되는 문제
 *
 * 수정 (2단계):
 * 1. System Prompt: "정보/알려줘" → list_contracts 우선 규칙 추가
 * 2. RAG 폴백 양방향 확장: search_documents 0건 시 list_contracts 자동 보완
 *    → GPT가 잘못된 도구를 선택해도 코드 레벨에서 자동 보정
 *
 * @since 2026-03-16
 */

const fs = require('fs');
const path = require('path');

function readSource(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '..', relativePath),
    'utf-8'
  );
}

// =============================================================================
// System Prompt: 포괄적 정보 요청 라우팅 규칙
// =============================================================================
describe('AI 어시스턴트: 포괄적 정보 요청 도구 선택 규칙', () => {
  const chatServiceSource = readSource('lib/chatService.js');

  // -------------------------------------------------------------------------
  // 1. "정보" 요청 → 계약 우선 규칙이 System Prompt에 존재해야 함
  // -------------------------------------------------------------------------
  test('System Prompt에 포괄적 정보 요청 처리 규칙이 있어야 함', () => {
    // "정보", "알려줘" 등 모호한 요청에 대한 명시적 규칙
    expect(chatServiceSource).toMatch(/포괄적\s*정보\s*요청/);
  });

  test('"정보", "알려줘" 등 모호한 키워드에 대한 도구 선택 기준이 있어야 함', () => {
    // 모호한 키워드 목록이 명시되어야 함
    expect(chatServiceSource).toContain('정보');
    expect(chatServiceSource).toContain('알려줘');
  });

  // -------------------------------------------------------------------------
  // 2. 계약 우선 원칙
  // -------------------------------------------------------------------------
  test('포괄적 정보 요청 시 list_contracts 우선 사용 규칙이 있어야 함', () => {
    // "정보" 요청 → list_contracts 우선이라는 규칙이 있어야 함
    const promptSection = chatServiceSource.substring(
      chatServiceSource.indexOf('포괄적 정보 요청'),
      chatServiceSource.indexOf('포괄적 정보 요청') + 2000
    );
    expect(promptSection).toContain('list_contracts');
  });

  // -------------------------------------------------------------------------
  // 3. 문서 검색 트리거 키워드 구분
  // -------------------------------------------------------------------------
  test('문서 검색으로 분기되는 명시적 트리거 키워드가 정의되어야 함', () => {
    // "문서", "서류", "파일", "찾아줘" 등이 있을 때만 search_documents
    const promptSection = chatServiceSource.substring(
      chatServiceSource.indexOf('포괄적 정보 요청'),
      chatServiceSource.indexOf('포괄적 정보 요청') + 2000
    );
    // 문서 관련 키워드가 있을 때만 search_documents로 분기한다는 규칙
    expect(promptSection).toContain('search_documents');
    expect(promptSection).toMatch(/문서|서류|파일/);
  });

  // -------------------------------------------------------------------------
  // 4. 동일 의도의 다른 표현에 대한 일관성 예시
  // -------------------------------------------------------------------------
  test('동일 의도 다른 표현 예시가 System Prompt에 포함되어야 함', () => {
    // "자동차 정보" ≈ "자동차 정보 알려줘" 같은 예시가 있어야 함
    const promptSection = chatServiceSource.substring(
      chatServiceSource.indexOf('포괄적 정보 요청'),
      chatServiceSource.indexOf('포괄적 정보 요청') + 2000
    );
    // 최소 2개 이상의 동의 표현 예시
    expect(promptSection).toContain('정보');
    expect(promptSection).toContain('알려줘');
  });

  // -------------------------------------------------------------------------
  // 5. "자동차" 같은 보험 주제어가 계약 도메인으로 분류되어야 함
  // -------------------------------------------------------------------------
  test('보험 주제어(자동차, 건강, 종신 등)가 계약 관련으로 분류되어야 함', () => {
    const promptSection = chatServiceSource.substring(
      chatServiceSource.indexOf('포괄적 정보 요청'),
      chatServiceSource.indexOf('포괄적 정보 요청') + 2000
    );
    // 보험 주제어 예시가 있어야 함
    expect(promptSection).toMatch(/자동차|건강|종신|연금/);
  });
});

// =============================================================================
// MCP 도구 정의: description 명확성
// =============================================================================
describe('MCP 도구 정의: 모호성 방지', () => {
  const contractsSource = readSource(
    path.join('..', 'aims_mcp', 'src', 'tools', 'contracts.ts')
  );
  const documentsSource = readSource(
    path.join('..', 'aims_mcp', 'src', 'tools', 'documents.ts')
  );

  test('list_contracts description에 계약 세부 정보 범위가 명시되어야 함', () => {
    // description 필드 값만 추출하여 검증
    const descMatch = contractsSource.match(
      /name:\s*'list_contracts'[\s\S]*?description:\s*'([\s\S]*?)'/
    );
    expect(descMatch).not.toBeNull();
    const description = descMatch[1];
    expect(description).toContain('계약');
    expect(description).toMatch(/적합하지 않/);
  });

  test('search_documents description에 문서/서류/파일 전용임이 명시되어야 함', () => {
    // search_documents는 "문서", "서류", "파일"을 찾을 때만 사용
    expect(documentsSource).toMatch(
      /description:.*(?:문서|서류|파일)/s
    );
  });
});

// =============================================================================
// RAG 폴백 양방향: search_documents 0건 → list_contracts 자동 보완
// =============================================================================
describe('RAG 폴백 양방향: 코드 레벨 자동 보정', () => {
  const chatServiceSource = readSource('lib/chatService.js');

  // -------------------------------------------------------------------------
  // 1. 기존 폴백 (list_contracts → search_documents) 유지 확인
  // -------------------------------------------------------------------------
  test('기존 폴백: FALLBACK_ELIGIBLE_TOOLS에 list_contracts가 포함되어야 함', () => {
    expect(chatServiceSource).toMatch(/FALLBACK_ELIGIBLE_TOOLS.*list_contracts/s);
  });

  // -------------------------------------------------------------------------
  // 2. 역방향 폴백 (search_documents → list_contracts) 존재 확인
  // -------------------------------------------------------------------------
  test('역방향 폴백: REVERSE_FALLBACK_ELIGIBLE_TOOLS에 search_documents가 포함되어야 함', () => {
    expect(chatServiceSource).toMatch(/REVERSE_FALLBACK_ELIGIBLE_TOOLS.*search_documents/s);
  });

  test('역방향 폴백 시 list_contracts를 호출해야 함', () => {
    // "RAG reverse fallback" 코멘트 근처에서 list_contracts 호출 확인
    const reverseIdx = chatServiceSource.indexOf('RAG reverse fallback');
    expect(reverseIdx).toBeGreaterThan(-1);
    const codeBlock = chatServiceSource.substring(reverseIdx, reverseIdx + 1000);
    expect(codeBlock).toContain("'list_contracts'");
  });

  // -------------------------------------------------------------------------
  // 3. 역방향 폴백 시 customerId 전달 확인
  // -------------------------------------------------------------------------
  test('역방향 폴백 시 원본 도구의 customerId를 전달해야 함', () => {
    // REVERSE_FALLBACK_ELIGIBLE_TOOLS 사용 블록 전체에서 customerId 전달 확인
    const reverseBlockIdx = chatServiceSource.indexOf('REVERSE_FALLBACK_ELIGIBLE_TOOLS.has');
    expect(reverseBlockIdx).toBeGreaterThan(-1);
    const codeBlock = chatServiceSource.substring(reverseBlockIdx, reverseBlockIdx + 1000);
    expect(codeBlock).toContain('customerId');
  });

  // -------------------------------------------------------------------------
  // 4. 폴백 결과 메시지 형식
  // -------------------------------------------------------------------------
  test('역방향 폴백 결과에 "추가 검색" 안내 메시지가 포함되어야 함', () => {
    const reverseIdx = chatServiceSource.indexOf('RAG reverse fallback');
    const codeBlock = chatServiceSource.substring(reverseIdx, reverseIdx + 1000);
    expect(codeBlock).toMatch(/추가.*계약|계약.*추가/);
  });

  // -------------------------------------------------------------------------
  // 5. 폴백 에러 격리
  // -------------------------------------------------------------------------
  test('역방향 폴백 실패 시 에러가 격리되어야 함 (원본 결과에 영향 없음)', () => {
    const reverseIdx = chatServiceSource.indexOf('RAG reverse fallback');
    const codeBlock = chatServiceSource.substring(reverseIdx, reverseIdx + 1000);
    expect(codeBlock).toContain('catch');
    expect(codeBlock).toMatch(/warn|ignored/);
  });

  // -------------------------------------------------------------------------
  // 6. isZeroResultQuery 헬퍼 공유
  // -------------------------------------------------------------------------
  test('양방향 폴백 모두 isZeroResultQuery 헬퍼를 사용해야 함', () => {
    // 기존 폴백과 역방향 폴백 모두 동일한 0건 판별 함수 사용
    const matches = chatServiceSource.match(/isZeroResultQuery/g);
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

// =============================================================================
// CRS/변액보험 도구 선택 규칙 — decision tree + 파라미터명 정합성
// =============================================================================
describe('CRS/변액보험 도구 선택 규칙', () => {
  const chatServiceSource = readSource('lib/chatService.js');

  test('CRS 도구 선택 decision tree가 CRITICAL 규칙 근처(상단)에 있어야 함', () => {
    const criticalIdx = chatServiceSource.indexOf('가장 중요한 규칙');
    const decisionTreeIdx = chatServiceSource.indexOf('CRS/변액보험 도구 선택');
    expect(criticalIdx).toBeGreaterThan(-1);
    expect(decisionTreeIdx).toBeGreaterThan(-1);
    // decision tree가 CRITICAL 규칙 이후 200행 이내에 위치해야 함
    const linesBetween = chatServiceSource.substring(criticalIdx, decisionTreeIdx).split('\n').length;
    expect(linesBetween).toBeLessThan(200);
  });

  test('decision tree에 3개 CRS 도구가 모두 명시되어야 함', () => {
    const treeStart = chatServiceSource.indexOf('CRS/변액보험 도구 선택');
    const treeSection = chatServiceSource.substring(treeStart, treeStart + 500);
    expect(treeSection).toContain('query_customer_reviews');
    expect(treeSection).toContain('get_customer_reviews');
    expect(treeSection).toContain('get_cr_contract_history');
  });

  test('query_customer_reviews 예시에 fundName 파라미터가 올바르게 사용되어야 함 (fundSearch 금지)', () => {
    // fundSearch 오타가 재발하지 않도록 검증
    expect(chatServiceSource).not.toMatch(/fundSearch/);
    expect(chatServiceSource).toMatch(/fundName:\s*"주식"/);
  });

  test('Out of Scope 규칙이 프롬프트에 포함되어야 함', () => {
    expect(chatServiceSource).toMatch(/Out of Scope/);
    expect(chatServiceSource).toMatch(/특약.*갱신|갱신.*특약/);
  });
});
