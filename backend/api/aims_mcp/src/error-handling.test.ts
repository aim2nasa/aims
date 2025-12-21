/**
 * 에러 처리 테스트
 *
 * 잘못된 입력에 대한 에러 처리가 올바르게 동작하는지 검증
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readSourceFile(relativePath: string): string {
  const fullPath = join(__dirname, relativePath);
  return readFileSync(fullPath, 'utf-8');
}

describe('에러 처리 테스트', () => {

  describe('Zod 스키마 에러', () => {

    // customers.ts에서 가져온 스키마와 동일한 구조
    const createCustomerSchema = z.object({
      name: z.string().min(1),
      customerType: z.enum(['개인', '법인']).default('개인'),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      birthDate: z.string().optional(),
      address: z.string().optional()
    });

    const getCustomerSchema = z.object({
      customerId: z.string()
    });

    const searchCustomersSchema = z.object({
      query: z.string().optional(),
      customerType: z.enum(['개인', '법인']).optional(),
      status: z.enum(['active', 'inactive', 'all']).optional().default('active'),
      region: z.string().optional(),
      limit: z.number().optional().default(20)
    });

    describe('create_customer 입력 검증', () => {
      it('name 누락 시 에러', () => {
        const result = createCustomerSchema.safeParse({});
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues.some(i => i.path.includes('name'))).toBe(true);
        }
      });

      it('name이 빈 문자열이면 에러', () => {
        const result = createCustomerSchema.safeParse({ name: '' });
        expect(result.success).toBe(false);
      });

      it('잘못된 customerType 에러', () => {
        const result = createCustomerSchema.safeParse({
          name: '테스트',
          customerType: '기타'
        });
        expect(result.success).toBe(false);
      });

      it('잘못된 email 형식 에러', () => {
        const result = createCustomerSchema.safeParse({
          name: '테스트',
          email: 'invalid-email'
        });
        expect(result.success).toBe(false);
      });

      it('올바른 입력 성공', () => {
        const result = createCustomerSchema.safeParse({
          name: '홍길동',
          customerType: '개인',
          phone: '010-1234-5678',
          email: 'hong@example.com'
        });
        expect(result.success).toBe(true);
      });
    });

    describe('get_customer 입력 검증', () => {
      it('customerId 누락 시 에러', () => {
        const result = getCustomerSchema.safeParse({});
        expect(result.success).toBe(false);
      });

      it('customerId가 숫자면 에러', () => {
        const result = getCustomerSchema.safeParse({ customerId: 12345 });
        expect(result.success).toBe(false);
      });

      it('올바른 customerId 성공', () => {
        const result = getCustomerSchema.safeParse({ customerId: '507f1f77bcf86cd799439011' });
        expect(result.success).toBe(true);
      });
    });

    describe('search_customers 입력 검증', () => {
      it('빈 객체도 허용 (모든 필드 optional)', () => {
        const result = searchCustomersSchema.safeParse({});
        expect(result.success).toBe(true);
      });

      it('잘못된 customerType 에러', () => {
        const result = searchCustomersSchema.safeParse({ customerType: '단체' });
        expect(result.success).toBe(false);
      });

      it('잘못된 status 에러', () => {
        const result = searchCustomersSchema.safeParse({ status: 'deleted' });
        expect(result.success).toBe(false);
      });

      it('limit이 문자열이면 에러', () => {
        const result = searchCustomersSchema.safeParse({ limit: '20' });
        expect(result.success).toBe(false);
      });

      it('올바른 검색 조건 성공', () => {
        const result = searchCustomersSchema.safeParse({
          query: '홍길동',
          customerType: '개인',
          status: 'active',
          limit: 10
        });
        expect(result.success).toBe(true);
      });
    });
  });

  describe('에러 핸들링 코드 검증', () => {
    const customersCode = readSourceFile('./tools/customers.ts');
    const memosCode = readSourceFile('./tools/memos.ts');

    describe('try-catch 구조', () => {
      it('customers.ts: 모든 핸들러에 try-catch', () => {
        const handlers = ['handleSearchCustomers', 'handleGetCustomer', 'handleCreateCustomer', 'handleUpdateCustomer'];
        for (const handler of handlers) {
          const handlerMatch = customersCode.match(new RegExp(`async function ${handler}[^}]+{[\\s\\S]*?^}`, 'm'));
          expect(handlerMatch, `${handler} 찾을 수 없음`).not.toBeNull();
          if (handlerMatch) {
            expect(handlerMatch[0]).toContain('try {');
            expect(handlerMatch[0]).toContain('} catch');
          }
        }
      });

      it('memos.ts: 모든 핸들러에 try-catch', () => {
        const handlers = ['handleAddMemo', 'handleListMemos', 'handleDeleteMemo'];
        for (const handler of handlers) {
          const handlerMatch = memosCode.match(new RegExp(`async function ${handler}[^}]+{[\\s\\S]*?^}`, 'm'));
          expect(handlerMatch, `${handler} 찾을 수 없음`).not.toBeNull();
          if (handlerMatch) {
            expect(handlerMatch[0]).toContain('try {');
            expect(handlerMatch[0]).toContain('} catch');
          }
        }
      });
    });

    describe('ObjectId 검증', () => {
      it('customers.ts: toSafeObjectId 사용', () => {
        expect(customersCode).toContain('toSafeObjectId');
      });

      it('customers.ts: ObjectId 변환 실패 시 에러 반환', () => {
        expect(customersCode).toContain("text: '유효하지 않은 고객 ID입니다.'");
      });

      it('memos.ts: toSafeObjectId 사용', () => {
        expect(memosCode).toContain('toSafeObjectId');
      });

      it('memos.ts: 고객 ID 변환 실패 시 에러 반환', () => {
        expect(memosCode).toContain("text: '유효하지 않은 고객 ID입니다.'");
      });

      it('memos.ts: 메모 ID 변환 실패 시 에러 반환', () => {
        expect(memosCode).toContain("text: '유효하지 않은 메모 ID입니다.'");
      });
    });

    describe('존재 여부 확인', () => {
      it('customers.ts: 고객 존재 확인', () => {
        expect(customersCode).toContain("text: '고객을 찾을 수 없습니다.'");
      });

      it('memos.ts: 고객 존재 확인', () => {
        expect(memosCode).toContain("text: '고객을 찾을 수 없습니다.'");
      });

      it('memos.ts: 메모 존재 확인', () => {
        expect(memosCode).toContain("text: '메모를 찾을 수 없습니다.'");
      });
    });

    describe('권한 확인', () => {
      it('customers.ts: 본인 고객만 조회 가능', () => {
        // 쿼리에 created_by 조건 포함
        expect(customersCode).toContain("'meta.created_by': userId");
      });

      it('memos.ts: 본인 고객의 메모만 조회 가능', () => {
        expect(memosCode).toContain("'meta.created_by': userId");
      });

      it('memos.ts: 본인 메모만 삭제 가능', () => {
        expect(memosCode).toContain("text: '본인이 작성한 메모만 삭제할 수 있습니다.'");
      });
    });

    describe('중복 체크', () => {
      it('customers.ts: 이름 중복 체크', () => {
        expect(customersCode).toContain('같은 이름의 고객이 이미 존재합니다');
      });

      it('customers.ts: 대소문자 무시 중복 체크', () => {
        expect(customersCode).toContain("$options: 'i'");
      });
    });
  });

  describe('에러 응답 형식', () => {
    const customersCode = readSourceFile('./tools/customers.ts');
    const memosCode = readSourceFile('./tools/memos.ts');

    it('에러 응답에 isError: true 포함', () => {
      expect(customersCode).toMatch(/isError:\s*true/);
      expect(memosCode).toMatch(/isError:\s*true/);
    });

    it('에러 응답에 content 배열 포함', () => {
      // 에러 응답도 content 배열 형식
      const errorPattern = /isError:\s*true,\s*content:\s*\[/;
      expect(customersCode).toMatch(errorPattern);
      expect(memosCode).toMatch(errorPattern);
    });

    it('에러 content에 type: text 포함', () => {
      // 에러 응답의 content도 type: 'text'
      expect(customersCode).toContain("type: 'text' as const");
      expect(memosCode).toContain("type: 'text' as const");
    });
  });

  describe('특수 상황 에러 처리', () => {

    // memo 스키마 (memos.ts에서 가져온 구조)
    const addMemoSchema = z.object({
      customerId: z.string(),
      content: z.string().min(1)
    });

    const listMemosSchema = z.object({
      customerId: z.string(),
      limit: z.number().optional().default(20)
    });

    const deleteMemoSchema = z.object({
      memoId: z.string()
    });

    it('add_memo: customerId 누락 시 에러', () => {
      const result = addMemoSchema.safeParse({ content: '테스트' });
      expect(result.success).toBe(false);
    });

    it('add_memo: content 누락 시 에러', () => {
      const result = addMemoSchema.safeParse({ customerId: 'id' });
      expect(result.success).toBe(false);
    });

    it('add_memo: 빈 content 에러', () => {
      const result = addMemoSchema.safeParse({ customerId: 'id', content: '' });
      expect(result.success).toBe(false);
    });

    it('list_memos: customerId 누락 시 에러', () => {
      const result = listMemosSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('delete_memo: memoId 누락 시 에러', () => {
      const result = deleteMemoSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('입력 타입 변환', () => {

    const searchCustomersSchema = z.object({
      query: z.string().optional(),
      limit: z.number().optional().default(20)
    });

    it('limit이 소수면 그대로 사용', () => {
      const result = searchCustomersSchema.safeParse({ limit: 10.5 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10.5);
      }
    });

    it('limit이 음수도 허용 (스키마 수준)', () => {
      const result = searchCustomersSchema.safeParse({ limit: -5 });
      expect(result.success).toBe(true);
    });

    it('limit이 0도 허용', () => {
      const result = searchCustomersSchema.safeParse({ limit: 0 });
      expect(result.success).toBe(true);
    });

    it('limit이 매우 큰 숫자도 허용', () => {
      const result = searchCustomersSchema.safeParse({ limit: 999999999 });
      expect(result.success).toBe(true);
    });
  });
});

describe('ObjectId 시뮬레이션 테스트', () => {

  // MongoDB ObjectId 형식 검증 (24자 16진수)
  function isValidObjectId(id: string): boolean {
    return /^[0-9a-fA-F]{24}$/.test(id);
  }

  describe('유효한 ObjectId 형식', () => {
    const validIds = [
      '507f1f77bcf86cd799439011',
      '000000000000000000000000',
      'ffffffffffffffffffffffff',
      'ABCDEF1234567890abcdef12',
      '123456789012345678901234',
    ];

    for (const id of validIds) {
      it(`"${id}" 유효`, () => {
        expect(isValidObjectId(id)).toBe(true);
      });
    }
  });

  describe('유효하지 않은 ObjectId 형식', () => {
    const invalidIds = [
      '',
      '507f1f77bcf86cd79943901',   // 23자
      '507f1f77bcf86cd7994390111',  // 25자
      '507f1f77bcf86cd79943901g',   // g는 16진수 아님
      'test-id',
      '12345',
      'null',
      'undefined',
      '507f1f77-bcf8-6cd7-9943-9011',  // UUID 형식
    ];

    for (const id of invalidIds) {
      it(`"${id}" 무효`, () => {
        expect(isValidObjectId(id)).toBe(false);
      });
    }
  });
});

describe('RegExp 이스케이프 테스트', () => {

  // db.ts의 escapeRegex와 동일한 함수
  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  describe('특수 문자 이스케이프', () => {
    it('점(.) 이스케이프', () => {
      expect(escapeRegex('a.b')).toBe('a\\.b');
    });

    it('별표(*) 이스케이프', () => {
      expect(escapeRegex('a*b')).toBe('a\\*b');
    });

    it('물음표(?) 이스케이프', () => {
      expect(escapeRegex('a?b')).toBe('a\\?b');
    });

    it('괄호 이스케이프', () => {
      expect(escapeRegex('(a)')).toBe('\\(a\\)');
    });

    it('대괄호 이스케이프', () => {
      expect(escapeRegex('[a]')).toBe('\\[a\\]');
    });

    it('중괄호 이스케이프', () => {
      expect(escapeRegex('{a}')).toBe('\\{a\\}');
    });

    it('파이프 이스케이프', () => {
      expect(escapeRegex('a|b')).toBe('a\\|b');
    });

    it('캐럿(^) 이스케이프', () => {
      expect(escapeRegex('^a')).toBe('\\^a');
    });

    it('달러($) 이스케이프', () => {
      expect(escapeRegex('a$')).toBe('a\\$');
    });

    it('역슬래시 이스케이프', () => {
      expect(escapeRegex('a\\b')).toBe('a\\\\b');
    });

    it('복합 특수문자', () => {
      expect(escapeRegex('a.b*c?d')).toBe('a\\.b\\*c\\?d');
    });
  });

  describe('일반 문자는 그대로', () => {
    it('한글', () => {
      expect(escapeRegex('홍길동')).toBe('홍길동');
    });

    it('영문', () => {
      expect(escapeRegex('abc')).toBe('abc');
    });

    it('숫자', () => {
      expect(escapeRegex('123')).toBe('123');
    });

    it('공백', () => {
      expect(escapeRegex('a b c')).toBe('a b c');
    });

    it('하이픈', () => {
      expect(escapeRegex('a-b-c')).toBe('a-b-c');
    });
  });
});
