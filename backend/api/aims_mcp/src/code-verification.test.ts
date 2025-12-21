/**
 * MCP 소스 코드 검증 테스트
 *
 * 이 테스트는 실제 MCP 소스 코드를 읽어서 호환성 버그가 없는지 검증합니다.
 * 시뮬레이션이 아닌 실제 코드 분석을 통해 런타임 문제를 사전에 방지합니다.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 소스 파일 읽기
function readSourceFile(relativePath: string): string {
  const fullPath = join(__dirname, relativePath);
  return readFileSync(fullPath, 'utf-8');
}

describe('MCP 소스 코드 검증', () => {

  describe('customers.ts 코드 검증', () => {
    let sourceCode: string;

    beforeAll(() => {
      sourceCode = readSourceFile('./tools/customers.ts');
    });

    describe('create_customer 핸들러', () => {
      it('DB에 mobile_phone 필드로 저장해야 함 (phone 아님)', () => {
        // newCustomer 객체에서 mobile_phone 사용 확인
        expect(sourceCode).toContain('mobile_phone: params.phone');

        // newCustomer 객체 내에서 phone: params.phone 직접 사용 금지
        // (mobile_phone: params.phone 이어야 함)
        const newCustomerMatch = sourceCode.match(/const newCustomer = \{[\s\S]*?insertOne/);
        expect(newCustomerMatch).not.toBeNull();
        if (newCustomerMatch) {
          // newCustomer 객체 내에 "phone:" 패턴이 없어야 함 (mobile_phone은 OK)
          expect(newCustomerMatch[0]).not.toMatch(/\bphone:\s*params\.phone/);
          // mobile_phone은 있어야 함
          expect(newCustomerMatch[0]).toContain('mobile_phone: params.phone');
        }
      });

      it('created_at에 new Date() 사용해야 함', () => {
        expect(sourceCode).toContain('created_at: now');
        expect(sourceCode).toContain('const now = new Date()');
        // formatDateTime 사용 금지
        expect(sourceCode).not.toContain('formatDateTime');
      });

      it('updated_at에 new Date() 사용해야 함', () => {
        expect(sourceCode).toContain('updated_at: now');
      });

      it('customer_type 기본값이 개인이어야 함', () => {
        expect(sourceCode).toContain("customer_type: params.customerType || '개인'");
      });

      it('status 기본값이 active여야 함', () => {
        expect(sourceCode).toContain("status: 'active'");
      });
    });

    describe('update_customer 핸들러', () => {
      it('업데이트 시 personal_info.mobile_phone 경로 사용해야 함', () => {
        expect(sourceCode).toContain("updateFields['personal_info.mobile_phone'] = params.phone");
        // personal_info.phone 경로 사용 금지
        expect(sourceCode).not.toContain("updateFields['personal_info.phone']");
      });

      it('업데이트 시 meta.updated_at에 new Date() 사용해야 함', () => {
        expect(sourceCode).toContain("'meta.updated_at': new Date()");
      });
    });

    describe('get_customer 핸들러', () => {
      it('응답에서 mobile_phone을 읽어야 함 (phone 아님)', () => {
        // phone: customer.personal_info?.mobile_phone 패턴 확인
        expect(sourceCode).toContain('phone: customer.personal_info?.mobile_phone');
        // phone: customer.personal_info?.phone 패턴 금지
        expect(sourceCode).not.toMatch(/phone:\s*customer\.personal_info\?\.phone[^_]/);
      });
    });

    describe('search_customers 핸들러', () => {
      it('검색 결과에서 mobile_phone을 읽어야 함', () => {
        expect(sourceCode).toContain('phone: c.personal_info?.mobile_phone');
      });

      it('검색 시 mobile_phone 필드로 검색해야 함', () => {
        expect(sourceCode).toContain("'personal_info.mobile_phone': regex");
      });
    });
  });

  describe('memos.ts 코드 검증', () => {
    let sourceCode: string;

    beforeAll(() => {
      sourceCode = readSourceFile('./tools/memos.ts');
    });

    describe('add_customer_memo 핸들러', () => {
      it('created_at에 new Date() 사용해야 함', () => {
        expect(sourceCode).toContain('created_at: now');
        expect(sourceCode).toContain('const now = new Date()');
        // formatDateTime 사용 금지
        expect(sourceCode).not.toContain('formatDateTime');
      });

      it('updated_at에 new Date() 사용해야 함', () => {
        expect(sourceCode).toContain('updated_at: now');
      });

      it('customer_memos 컬렉션에 저장해야 함', () => {
        expect(sourceCode).toContain("db.collection('customer_memos').insertOne");
      });
    });
  });

  describe('금지된 패턴 검증', () => {
    it('customers.ts에 formatDateTime 함수가 없어야 함', () => {
      const sourceCode = readSourceFile('./tools/customers.ts');
      expect(sourceCode).not.toContain('formatDateTime');
      expect(sourceCode).not.toContain('format_date_time');
    });

    it('memos.ts에 formatDateTime 함수가 없어야 함', () => {
      const sourceCode = readSourceFile('./tools/memos.ts');
      expect(sourceCode).not.toContain('formatDateTime');
      expect(sourceCode).not.toContain('format_date_time');
    });

    it('날짜 문자열 직접 생성 패턴이 없어야 함', () => {
      const customersCode = readSourceFile('./tools/customers.ts');
      const memosCode = readSourceFile('./tools/memos.ts');

      // YYYY.MM.DD 형식 문자열 생성 패턴 금지
      const dateStringPattern = /['"`]\d{4}\.\d{2}\.\d{2}/;
      expect(customersCode).not.toMatch(dateStringPattern);
      expect(memosCode).not.toMatch(dateStringPattern);
    });
  });
});
