/**
 * MCP 도구 description regression 테스트
 *
 * Phase 1에서 수정된 list_contracts / search_documents description이
 * 의도대로 유지되는지 검증합니다.
 *
 * - list_contracts: "우선 사용" 표현 제거, 계약 세부 정보 범위 한정, 문서 비적합 경계 명시
 * - search_documents: "문서/서류/파일을 찾거나 검색" 의도 명시
 * - 두 도구의 description이 상충하지 않는지 확인
 *
 * @since 2026-03-17
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { contractToolDefinitions } from '../tools/contracts.js';
import { documentToolDefinitions } from '../tools/documents.js';

// 도구 정의에서 description 추출 헬퍼
function getToolDescription(definitions: Array<{ name: string; description: string }>, toolName: string): string {
  const tool = definitions.find(t => t.name === toolName);
  if (!tool) throw new Error(`도구 '${toolName}'을 찾을 수 없습니다`);
  return tool.description;
}

describe('MCP 도구 description regression 테스트', () => {
  // ── list_contracts ──────────────────────────────────────────────

  describe('list_contracts description', () => {
    let desc: string;

    beforeAll(() => {
      desc = getToolDescription(contractToolDefinitions, 'list_contracts');
    });

    it('"우선 사용" 표현이 없어야 한다 (AI가 무조건 이 도구를 선택하지 않도록)', () => {
      expect(desc).not.toContain('우선 사용');
      expect(desc).not.toContain('우선적으로');
      expect(desc).not.toContain('먼저 사용');
    });

    it('"계약" 관련 범위가 명시되어 있어야 한다', () => {
      // 계약 목록/정보/이력 등 계약 관련 키워드가 있어야 함
      expect(desc).toContain('계약');
      // 조회 목적이 명시되어야 함
      const hasScope = desc.includes('목록') || desc.includes('정보') ||
        desc.includes('세부 정보') ||
        (desc.includes('보험료') && desc.includes('증권번호'));
      expect(hasScope).toBe(true);
    });

    it('"문서/서류/파일" 비적합 경계가 명시되어 있어야 한다', () => {
      // 문서/서류/파일 키워드와 "적합하지 않" 패턴이 함께 있어야 함 (조합 검증)
      // 예: "문서/서류/파일을 찾거나 검색하는 용도에는 적합하지 않습니다"
      const hasDocBoundary = /(?:문서|서류|파일)[\s\S]*적합하지 않/.test(desc) ||
        /적합하지 않[\s\S]*(?:문서|서류|파일)/.test(desc);
      expect(hasDocBoundary).toBe(true);
    });

    it('계약 데이터 출처(Annual Report)가 명시되어 있어야 한다', () => {
      expect(desc).toContain('Annual Report');
    });
  });

  // ── search_documents ────────────────────────────────────────────

  describe('search_documents description', () => {
    let desc: string;

    beforeAll(() => {
      desc = getToolDescription(documentToolDefinitions, 'search_documents');
    });

    it('"문서/서류/파일을 찾거나 검색" 의도가 명시되어 있어야 한다', () => {
      // 핵심 의도 표현이 포함되어야 함
      const hasIntent = desc.includes('문서') && (
        desc.includes('찾') || desc.includes('검색')
      );
      expect(hasIntent).toBe(true);
    });

    it('사용 시나리오(고객 문서 찾기 / 전체 검색)가 설명되어 있어야 한다', () => {
      expect(desc).toContain('고객');
      expect(desc).toContain('search_customers');
    });

    it('검색 모드(semantic/keyword)가 설명되어 있어야 한다', () => {
      expect(desc).toContain('keyword');
    });
  });

  // ── 상충 검증 ──────────────────────────────────────────────────

  describe('도구 간 description 상충 검증', () => {
    let contractDesc: string;
    let documentDesc: string;

    beforeAll(() => {
      contractDesc = getToolDescription(contractToolDefinitions, 'list_contracts');
      documentDesc = getToolDescription(documentToolDefinitions, 'search_documents');
    });

    it('list_contracts가 문서 검색 역할을 주장하지 않아야 한다', () => {
      // "문서를 검색", "서류를 찾" 등 문서 검색 능력 주장이 없어야 함
      expect(contractDesc).not.toMatch(/문서를\s*(검색|찾|조회)합니다/);
      expect(contractDesc).not.toMatch(/서류를\s*(검색|찾|조회)합니다/);
    });

    it('search_documents가 계약 데이터 조회 역할을 주장하지 않아야 한다', () => {
      // search_documents는 계약 상태/보험료 등을 직접 조회한다고 주장하면 안 됨
      expect(documentDesc).not.toMatch(/계약\s*상태를\s*조회/);
      expect(documentDesc).not.toMatch(/보험료를\s*조회/);
    });

    it('두 도구의 역할이 명확히 구분되어야 한다', () => {
      // list_contracts는 "계약"에 집중
      expect(contractDesc).toContain('계약');
      // search_documents는 "문서"에 집중
      expect(documentDesc).toContain('문서');

      // 각 도구가 상대 영역의 비적합성을 인지
      // list_contracts는 문서 비적합을 명시
      expect(contractDesc).toMatch(/문서.*적합하지|파일.*적합하지|서류.*적합하지/);
    });
  });
});
