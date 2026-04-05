/**
 * Graceful Recovery 순수 함수 단위 테스트
 * - hasDocumentIntent: 사용자 메시지에서 문서 의도 감지
 * - shouldSuggestDocSearch: 문서 검색 제안 필요 여부 판단
 */
import { describe, it, expect } from 'vitest';
import { hasDocumentIntent, shouldSuggestDocSearch, DOCUMENT_KEYWORDS } from '../chatPanelUtils';

describe('hasDocumentIntent', () => {
  it('문서 키워드가 포함된 메시지는 true를 반환한다', () => {
    expect(hasDocumentIntent('보험증권을 보여주세요')).toBe(true);
    expect(hasDocumentIntent('고객 문서 목록을 보여줘')).toBe(true);
    expect(hasDocumentIntent('계약서 확인해주세요')).toBe(true);
    expect(hasDocumentIntent('PDF 파일 찾아줘')).toBe(true);
  });

  it('키워드가 없는 메시지는 false를 반환한다', () => {
    expect(hasDocumentIntent('안녕하세요')).toBe(false);
    expect(hasDocumentIntent('고객 목록 보여줘')).toBe(false);
    expect(hasDocumentIntent('날씨 어때?')).toBe(false);
    expect(hasDocumentIntent('계약 정보 알려줘')).toBe(false);
  });

  it('빈 문자열은 false를 반환한다', () => {
    expect(hasDocumentIntent('')).toBe(false);
  });

  it('대소문자 혼합된 키워드도 감지한다', () => {
    expect(hasDocumentIntent('Pdf 파일 있어?')).toBe(true);
    expect(hasDocumentIntent('PDF 확인')).toBe(true);
    expect(hasDocumentIntent('pdf 보여줘')).toBe(true);
  });

  it('AR, CRS 단독 약어는 DOCUMENT_KEYWORDS에 포함되지 않는다', () => {
    // AR/CRS 약어 오탐 방지: 전용 도구가 처리하므로 키워드에서 제외됨
    expect(DOCUMENT_KEYWORDS).not.toContain('AR');
    expect(DOCUMENT_KEYWORDS).not.toContain('CRS');
    expect(hasDocumentIntent('AR 보여줘')).toBe(false);
    expect(hasDocumentIntent('CRS 확인해줘')).toBe(false);
  });

  it('키워드가 메시지 중간에 포함되어도 감지한다', () => {
    expect(hasDocumentIntent('혹시 업로드한 거 있나요?')).toBe(true);
    expect(hasDocumentIntent('김씨 고객의 서류를 찾아주세요')).toBe(true);
  });
});

describe('shouldSuggestDocSearch', () => {
  it('문서 의도가 있고 도구가 사용되지 않으면 true를 반환한다', () => {
    expect(shouldSuggestDocSearch('문서 보여줘', [])).toBe(true);
    expect(shouldSuggestDocSearch('보험증권 찾아줘', ['get_customer'])).toBe(true);
  });

  it('문서 의도가 없으면 false를 반환한다', () => {
    expect(shouldSuggestDocSearch('안녕하세요', [])).toBe(false);
    expect(shouldSuggestDocSearch('고객 목록', undefined)).toBe(false);
  });

  it('toolsUsed가 undefined이면 도구 미사용으로 간주한다', () => {
    expect(shouldSuggestDocSearch('문서 보여줘', undefined)).toBe(true);
  });

  it('toolsUsed가 빈 배열이면 도구 미사용으로 간주한다', () => {
    expect(shouldSuggestDocSearch('문서 보여줘', [])).toBe(true);
  });

  it('search_documents가 사용되면 false를 반환한다', () => {
    expect(shouldSuggestDocSearch('문서 보여줘', ['search_documents'])).toBe(false);
  });

  it('list_customer_documents가 사용되면 false를 반환한다', () => {
    expect(shouldSuggestDocSearch('서류 확인해줘', ['list_customer_documents'])).toBe(false);
  });

  it('문서 검색 도구가 아닌 다른 도구만 사용되면 true를 반환한다', () => {
    expect(shouldSuggestDocSearch('증권 찾아줘', ['get_customer', 'search_contracts'])).toBe(true);
  });

  it('문서 검색 도구가 다른 도구와 함께 사용되면 false를 반환한다', () => {
    expect(shouldSuggestDocSearch('문서 보여줘', ['get_customer', 'search_documents'])).toBe(false);
  });
});
