/**
 * ChatPanel 유틸리티 — 상수 및 헬퍼 함수
 * Fast Refresh 호환을 위해 컴포넌트 파일에서 분리
 */

// 데이터 변경을 유발하는 MCP 도구 목록
export const DATA_MUTATING_TOOLS = {
  // 고객 관련
  customers: ['create_customer', 'update_customer'],
  // 문서 관련
  documents: ['delete_document', 'delete_documents', 'link_document_to_customer'],
  // 관계 관련
  relationships: ['create_relationship', 'delete_relationship'],
  // 메모 관련
  memos: ['add_customer_memo', 'delete_customer_memo'],
  // 계약 관련
  contracts: ['create_contract'],
};

// 문서 관련 키워드 (사용자 질문에서 문서 의도 감지용)
export const DOCUMENT_KEYWORDS = [
  '문서', '서류', '증권', '보험증권', '증서', '약관',
  '보장분석', '연금저축', '진단서', '청구서',
  '계약서', '설계서', '제안서', '가입설계', '보장내용',
  '첨부', '파일', '업로드', 'PDF', 'pdf',
];

// 문서 검색/조회 관련 MCP 도구
export const DOCUMENT_SEARCH_TOOLS = [
  'search_documents', 'list_customer_documents',
];

/**
 * 사용자 질문에 문서 관련 키워드가 포함되어 있는지 확인
 */
export function hasDocumentIntent(userMessage: string): boolean {
  const normalized = userMessage.toLowerCase();
  return DOCUMENT_KEYWORDS.some(kw => normalized.includes(kw.toLowerCase()));
}

/**
 * Graceful Recovery 제안이 필요한지 판단
 * - 사용자가 문서를 요청했는데 AI가 문서 검색 도구를 사용하지 않은 경우
 */
export function shouldSuggestDocSearch(userContent: string, toolsUsed?: string[]): boolean {
  if (!hasDocumentIntent(userContent)) return false;
  if (!toolsUsed || toolsUsed.length === 0) return true;
  return !toolsUsed.some(tool => DOCUMENT_SEARCH_TOOLS.includes(tool));
}
