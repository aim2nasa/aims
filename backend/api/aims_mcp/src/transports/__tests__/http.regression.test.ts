/**
 * Regression Test — MCP HTTP transport 도구 핸들러 등록 누락 수정
 *
 * 커밋: 25d903bb — search_customer_with_contracts, search_customer_documents
 *   핸들러가 toolHandlers 맵에 누락되어 AI 어시스턴트가 "Unknown tool" 에러를
 *   반환하던 CRITICAL 버그 수정
 *
 * @since 2026-04-07
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function readTransportSource(filename: string): string {
  return fs.readFileSync(
    path.join(__dirname, '..', filename),
    'utf-8'
  );
}

describe('MCP HTTP transport 도구 핸들러 등록 완전성 (25d903bb)', () => {
  const httpSource = readTransportSource('http.ts');

  // ─────────────────────────────────────────────────────────────
  // 1. search_customer_with_contracts 핸들러 등록 확인
  // ─────────────────────────────────────────────────────────────
  it('toolHandlers에 search_customer_with_contracts가 등록되어야 함', () => {
    expect(httpSource).toContain('search_customer_with_contracts');
    // 핸들러 함수 매핑이 있어야 함
    expect(httpSource).toMatch(
      /search_customer_with_contracts:\s*customers\.handleSearchCustomerWithContracts/
    );
  });

  // ─────────────────────────────────────────────────────────────
  // 2. search_customer_documents 핸들러 등록 확인
  // ─────────────────────────────────────────────────────────────
  it('toolHandlers에 search_customer_documents가 등록되어야 함', () => {
    expect(httpSource).toContain('search_customer_documents');
    // 핸들러 함수 매핑이 있어야 함
    expect(httpSource).toMatch(
      /search_customer_documents:\s*documents\.handleSearchCustomerDocuments/
    );
  });

  // ─────────────────────────────────────────────────────────────
  // 3. 핸들러가 toolHandlers 객체 내부에 있어야 함 (주석이 아닌 코드)
  // ─────────────────────────────────────────────────────────────
  it('두 핸들러가 toolHandlers 객체 블록 안에 위치해야 함', () => {
    const toolHandlersStart = httpSource.indexOf('toolHandlers = {');
    expect(toolHandlersStart).toBeGreaterThan(-1);
    const toolHandlersEnd = httpSource.indexOf('};', toolHandlersStart);
    const toolHandlersBlock = httpSource.substring(toolHandlersStart, toolHandlersEnd);

    expect(toolHandlersBlock).toContain('search_customer_with_contracts');
    expect(toolHandlersBlock).toContain('search_customer_documents');
  });

  // ─────────────────────────────────────────────────────────────
  // 4. customers 모듈이 import되어야 함
  // ─────────────────────────────────────────────────────────────
  it('customers 모듈이 동적 import되어야 함', () => {
    expect(httpSource).toMatch(/import\(['"]\.\.\/tools\/customers/);
  });

  // ─────────────────────────────────────────────────────────────
  // 5. documents 모듈이 import되어야 함
  // ─────────────────────────────────────────────────────────────
  it('documents 모듈이 동적 import되어야 함', () => {
    expect(httpSource).toMatch(/import\(['"]\.\.\/tools\/documents/);
  });

  // ─────────────────────────────────────────────────────────────
  // 6. 미등록 도구 호출 시 에러 응답이 올바른지 확인
  // ─────────────────────────────────────────────────────────────
  it('미등록 도구 호출 시 "Unknown tool" 에러 응답 로직이 있어야 함', () => {
    expect(httpSource).toContain('Unknown tool');
    expect(httpSource).toContain('availableTools');
  });
});
