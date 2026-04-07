/**
 * AllCustomersView 검색 하이라이팅 debounce 테스트
 *
 * 하이라이팅이 searchValue(실시간)가 아닌 debouncedSearch(300ms 지연)를 사용하는지 검증.
 * searchValue로 하이라이팅하면 매 키입력마다 937행 × 3회 highlightText() 호출 → 입력 지연.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('AllCustomersView 검색 하이라이팅 debounce', () => {
  const filePath = path.resolve(__dirname, '../AllCustomersView.tsx');
  const source = fs.readFileSync(filePath, 'utf-8');

  it('highlightText()에 debouncedSearch를 사용해야 함 (searchValue 사용 금지)', () => {
    // highlightText 호출에서 searchValue 사용 패턴 감지
    const highlightCalls = source.match(/highlightText\([^)]+\)/g) || [];

    expect(highlightCalls.length).toBeGreaterThan(0);

    const usesSearchValue = highlightCalls.filter(call => call.includes('searchValue'));
    const usesDebouncedSearch = highlightCalls.filter(call => call.includes('debouncedSearch'));

    expect(usesSearchValue).toHaveLength(0);
    expect(usesDebouncedSearch.length).toBeGreaterThan(0);
  });

  it('하이라이팅 조건 분기에도 debouncedSearch를 사용해야 함', () => {
    // {searchValue ? highlightText(...) : ...} 패턴이 있으면 안 됨
    const badPattern = /\{searchValue\s*\?\s*highlightText/g;
    const goodPattern = /\{debouncedSearch\s*\?\s*highlightText/g;

    const badMatches = source.match(badPattern) || [];
    const goodMatches = source.match(goodPattern) || [];

    expect(badMatches).toHaveLength(0);
    expect(goodMatches.length).toBeGreaterThan(0);
  });
});
