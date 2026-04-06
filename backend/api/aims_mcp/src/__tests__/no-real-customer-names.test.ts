import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// 금지 고객명 목록 (실제 DB 고객명 — regression_cases.json에서 추출)
const FORBIDDEN_CUSTOMER_NAMES = [
  '캐치업코리아', '김보성', '마리치', '정승우', '최혜진',
  '이분희', '이상윤', '안영미', '송유미', '박형서', '박지성',
  '고영자', '변수현',
];

// MCP 도구 정의 파일 목록
const TOOL_FILES = [
  'customers.ts', 'contracts.ts', 'documents.ts',
  'customer_reviews.ts', 'annual_reports.ts', 'memos.ts',
  'relationships.ts', 'network.ts', 'utilities.ts',
  'products.ts', 'rag.ts', 'address.ts', 'birthdays.ts',
];

describe('실제 고객명 사용 금지 검증', () => {
  it('MCP 도구 정의 파일에 실제 고객명이 없어야 함', () => {
    const violations: string[] = [];

    for (const file of TOOL_FILES) {
      const filePath = path.join(__dirname, '..', 'tools', file);
      if (!fs.existsSync(filePath)) continue;

      const content = fs.readFileSync(filePath, 'utf-8');
      for (const name of FORBIDDEN_CUSTOMER_NAMES) {
        if (content.includes(name)) {
          violations.push(`${file}: "${name}" 발견`);
        }
      }
    }

    expect(violations, `실제 고객명 위반:\n${violations.join('\n')}`).toEqual([]);
  });

  it('시스템 프롬프트(chatService.js)에 실제 고객명이 없어야 함', () => {
    const chatServicePath = path.resolve(
      __dirname, '..', '..', '..', 'aims_api', 'lib', 'chatService.js'
    );

    // 파일 존재 확인
    expect(fs.existsSync(chatServicePath), `chatService.js 파일을 찾을 수 없음: ${chatServicePath}`).toBe(true);

    const content = fs.readFileSync(chatServicePath, 'utf-8');
    const violations: string[] = [];

    for (const name of FORBIDDEN_CUSTOMER_NAMES) {
      if (content.includes(name)) {
        violations.push(`chatService.js: "${name}" 발견`);
      }
    }

    expect(violations, `실제 고객명 위반:\n${violations.join('\n')}`).toEqual([]);
  });
});
