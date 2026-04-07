/**
 * AllCustomersView 검색 입력 구조 regression 테스트
 *
 * 1. 하이라이팅이 searchValue(debounced)를 사용하는지 검증
 * 2. input이 inputValue(로컬 state)를 사용하는지 검증
 * 3. inputRef가 input에 연결되어 있는지 검증
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('AllCustomersView 검색 입력 구조', () => {
  const filePath = path.resolve(__dirname, '../AllCustomersView.tsx');
  const source = fs.readFileSync(filePath, 'utf-8');

  it('highlightText()에 searchValue(debounced)를 사용해야 함', () => {
    const highlightCalls = source.match(/highlightText\([^)]+\)/g) || [];
    expect(highlightCalls.length).toBeGreaterThan(0);

    const usesSearchValue = highlightCalls.filter(call => call.includes('searchValue'));
    expect(usesSearchValue.length).toBeGreaterThan(0);
  });

  it('input의 value는 inputValue(로컬 state)를 사용해야 함', () => {
    // value={inputValue} 패턴이 있어야 함
    expect(source).toContain('value={inputValue}');
    // value={searchValue}가 input에 직접 사용되면 안 됨 (sessionStorage 오버헤드)
    const inputValuePattern = /className="search-input"[\s\S]*?value=\{searchValue\}/;
    expect(source).not.toMatch(inputValuePattern);
  });

  it('input에 ref={inputRef}가 연결되어야 함', () => {
    expect(source).toContain('ref={inputRef}');
    expect(source).toContain('useRef<HTMLInputElement>');
  });

  it('inputValue → searchValue debounce 동기화가 존재해야 함', () => {
    expect(source).toContain('setSearchValue(inputValue)');
  });
});
