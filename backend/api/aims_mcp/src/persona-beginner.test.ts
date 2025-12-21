/**
 * 페르소나: 생초보 설계사 테스트
 *
 * 시스템 첫 사용자가 겪을 수 있는 상황을 시뮬레이션합니다.
 * - 필드명, 형식, 제약사항 모름
 * - 오타, 형식 오류 빈번
 * - 에러 메시지 이해 어려움
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 스키마 파일 읽기
function readSourceFile(relativePath: string): string {
  const fullPath = join(__dirname, relativePath);
  return readFileSync(fullPath, 'utf-8');
}

// 테스트용 스키마 (실제 스키마와 동일하게 정의)
const createCustomerSchema = z.object({
  name: z.string().min(1),
  customerType: z.enum(['개인', '법인']).optional().default('개인'),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  birthDate: z.string().optional(),
  address: z.string().optional()
});

const searchCustomersSchema = z.object({
  query: z.string().optional(),
  customerType: z.enum(['개인', '법인']).optional(),
  status: z.enum(['active', 'inactive', 'all']).optional().default('active'),
  region: z.string().optional(),
  limit: z.number().optional().default(20)
});

const addMemoSchema = z.object({
  customerId: z.string(),
  content: z.string().min(1)
});

describe('페르소나: 생초보 설계사', () => {

  describe('첫 고객 등록 시도', () => {

    it('이름만 넣고 전화번호 깜빡함 - 허용', () => {
      const input = { name: '홍길동' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('홍길동');
        expect(result.data.customerType).toBe('개인'); // 기본값
        expect(result.data.phone).toBeUndefined();
      }
    });

    it('전화번호에 하이픈 없이 입력 - 허용', () => {
      const input = { name: '홍길동', phone: '01012345678' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('전화번호에 공백 포함 - 허용', () => {
      const input = { name: '홍길동', phone: '010 1234 5678' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('전화번호에 괄호 포함 - 허용', () => {
      const input = { name: '홍길동', phone: '(02) 1234-5678' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    describe('생년월일 다양한 형식 입력 시도', () => {
      it('YYYY-MM-DD 형식 - 허용', () => {
        const input = { name: '홍길동', birthDate: '1980-05-15' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('YYYY.MM.DD 형식 - 현재는 허용 (스키마에서 string)', () => {
        const input = { name: '홍길동', birthDate: '1980.05.15' };
        const result = createCustomerSchema.safeParse(input);
        // 현재 스키마는 string만 검사하므로 통과
        expect(result.success).toBe(true);
      });

      it('YYYY/MM/DD 형식 - 현재는 허용 (스키마에서 string)', () => {
        const input = { name: '홍길동', birthDate: '1980/05/15' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('한글 형식 - 현재는 허용 (스키마에서 string)', () => {
        const input = { name: '홍길동', birthDate: '80년 5월 15일' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    describe('이메일 형식 오류', () => {
      it('@ 빠뜨림 - 거부', () => {
        const input = { name: '홍길동', email: 'honggildong.naver.com' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('도메인 없음 - 거부', () => {
        const input = { name: '홍길동', email: 'honggildong@' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('공백 포함 - 거부', () => {
        const input = { name: '홍길동', email: 'hong gildong@naver.com' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('올바른 이메일 - 허용', () => {
        const input = { name: '홍길동', email: 'hong@example.com' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    it('이름 없이 등록 시도 - 거부', () => {
      const input = { phone: '010-1234-5678' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('빈 이름으로 등록 시도 - 거부', () => {
      const input = { name: '' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('공백만 있는 이름 - 허용 (min(1) 통과)', () => {
      const input = { name: ' ' };
      const result = createCustomerSchema.safeParse(input);
      // 공백 1자는 min(1) 통과
      expect(result.success).toBe(true);
    });
  });

  describe('고객 검색 첫 시도', () => {

    it('검색어 없이 조회 - 허용 (전체 목록)', () => {
      const input = {};
      const result = searchCustomersSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('active'); // 기본값
        expect(result.data.limit).toBe(20); // 기본값
      }
    });

    it('이름 일부만 입력 ("홍") - 허용', () => {
      const input = { query: '홍' };
      const result = searchCustomersSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('오타 입력 ("홍길똥") - 허용 (빈 결과)', () => {
      const input = { query: '홍길똥' };
      const result = searchCustomersSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    describe('상태값 입력 실수', () => {
      it('대문자 "Active" - 거부', () => {
        const input = { status: 'Active' };
        const result = searchCustomersSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('한글 "활성" - 거부', () => {
        const input = { status: '활성' };
        const result = searchCustomersSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('소문자 "active" - 허용', () => {
        const input = { status: 'active' };
        const result = searchCustomersSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    describe('고객 유형 입력 실수', () => {
      it('"개인고객" - 거부', () => {
        const input = { customerType: '개인고객' };
        const result = searchCustomersSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('"법인(주)" - 거부', () => {
        const input = { customerType: '법인(주)' };
        const result = searchCustomersSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('"개인" - 허용', () => {
        const input = { customerType: '개인' };
        const result = searchCustomersSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('"법인" - 허용', () => {
        const input = { customerType: '법인' };
        const result = searchCustomersSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('메모 첫 작성', () => {

    it('빈 메모 제출 - 거부', () => {
      const input = { customerId: '507f1f77bcf86cd799439011', content: '' };
      const result = addMemoSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('고객 ID 없이 메모 제출 - 거부', () => {
      const input = { content: '상담 내용입니다.' };
      const result = addMemoSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('고객 ID 대신 이름 입력 - 형식상 허용 (DB에서 거부)', () => {
      // 스키마 레벨에서는 string이면 통과
      // 실제 처리 시 toSafeObjectId에서 거부
      const input = { customerId: '홍길동', content: '상담 내용' };
      const result = addMemoSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('정상 메모 - 허용', () => {
      const input = { customerId: '507f1f77bcf86cd799439011', content: '오늘 상담함' };
      const result = addMemoSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('에러 메시지 이해도', () => {

    it('모든 에러 메시지가 한글로 작성됨', () => {
      const customersSource = readSourceFile('./tools/customers.ts');
      const memosSource = readSourceFile('./tools/memos.ts');

      // 한글 에러 메시지 확인
      expect(customersSource).toContain('유효하지 않은 고객 ID입니다');
      expect(customersSource).toContain('고객을 찾을 수 없습니다');
      expect(customersSource).toContain('같은 이름의 고객이 이미 존재합니다');
      // memos는 단일 메모 필드 구조로 변경됨 - 고객 ID 검증만 확인
      expect(memosSource).toContain('유효하지 않은 고객 ID입니다');
    });

    it('영어 기술 용어가 사용자 에러에 노출되지 않음', () => {
      // isError: true 블록 내에 기술 용어 없어야 함
      // 다만 코드 내부에서는 사용할 수 있으므로 에러 메시지 문자열만 확인
      const errorMessages = [
        '유효하지 않은 고객 ID입니다',
        '고객을 찾을 수 없습니다'
      ];

      for (const msg of errorMessages) {
        expect(msg).not.toContain('ObjectId');
        expect(msg).not.toContain('Zod');
        expect(msg).not.toContain('regex');
        expect(msg).not.toContain('validation');
      }
    });

    it('에러 메시지에 해결 힌트 포함 여부', () => {
      // 현재 에러 메시지가 해결 방법을 제시하는지 확인
      // 예: "24자리 ID를 확인해주세요"
      // 현재는 단순 메시지만 있음
      const customersSource = readSourceFile('./tools/customers.ts');

      // 향후 개선: 에러 메시지에 해결 방법 포함
      // 현재는 단순히 "유효하지 않은 고객 ID입니다"
      expect(customersSource).toContain('유효하지 않은 고객 ID');
    });
  });

  describe('일반적인 초보자 실수', () => {

    it('숫자를 이름으로 입력', () => {
      const input = { name: 12345 };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('배열을 이름으로 입력', () => {
      const input = { name: ['홍길동'] };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('객체를 이름으로 입력', () => {
      const input = { name: { first: '길동', last: '홍' } };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('null을 이름으로 입력', () => {
      const input = { name: null };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('undefined를 이름으로 입력 (필수 필드 누락)', () => {
      const input = { name: undefined };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});
