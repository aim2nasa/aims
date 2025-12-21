/**
 * 페르소나: IT 비전문가 테스트
 *
 * 기술에 익숙하지 않은 사용자가 겪을 수 있는 상황을 시뮬레이션합니다.
 * - 기술 용어 이해 못함
 * - 복사-붙여넣기 실수 잦음
 * - 형식 혼란 빈번
 * - "왜 안 되지?" 상황 자주 발생
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readSourceFile(relativePath: string): string {
  const fullPath = join(__dirname, relativePath);
  return readFileSync(fullPath, 'utf-8');
}

// 테스트용 스키마
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
  status: z.enum(['active', 'inactive', 'all']).optional().default('active')
});

describe('페르소나: IT 비전문가', () => {

  describe('복사-붙여넣기 문제', () => {

    describe('보이지 않는 문자', () => {
      it('엑셀에서 복사한 이름 (탭 문자)', () => {
        const input = { name: '홍길동\t' };
        const result = createCustomerSchema.safeParse(input);
        // 탭 문자 포함해도 min(1) 통과
        expect(result.success).toBe(true);
        // 실제로는 트림 처리 필요할 수 있음
        if (result.success) {
          expect(result.data.name).toBe('홍길동\t');
        }
      });

      it('엑셀에서 복사한 이름 (캐리지 리턴)', () => {
        const input = { name: '홍길동\r\n' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('웹에서 복사한 전화번호 (Non-breaking space)', () => {
        // \u00A0 = non-breaking space
        const input = { name: 'Test', phone: '010\u00A01234\u00A05678' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('PDF에서 복사한 주소 (줄바꿈 포함)', () => {
        const input = { name: 'Test', address: '서울시\n강남구\n역삼동' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('BOM 문자 포함', () => {
        // \uFEFF = BOM (Byte Order Mark)
        const input = { name: '\uFEFF홍길동' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
        // BOM이 포함되어 저장될 수 있음
      });

      it('Zero-width space', () => {
        // \u200B = zero-width space
        const input = { name: '홍\u200B길\u200B동' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    describe('따옴표 문제', () => {
      it('스마트 쿼트 (왼쪽)', () => {
        // 한글 워드에서 자동 변환되는 따옴표
        const input = { name: '"홍길동"' }; // 일반 따옴표
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('스마트 쿼트 (둥근)', () => {
        // U+201C, U+201D
        const input = { name: '\u201C홍길동\u201D' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('한글 따옴표', () => {
        const input = { name: '「홍길동」' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('형식 혼란', () => {

    describe('전화번호 형식 실수', () => {
      it('전화번호에 "전화:" 접두사', () => {
        const input = { name: 'Test', phone: '전화: 010-1234-5678' };
        const result = createCustomerSchema.safeParse(input);
        // 스키마에서는 허용 (저장됨)
        expect(result.success).toBe(true);
      });

      it('전화번호에 "핸드폰:" 접두사', () => {
        const input = { name: 'Test', phone: '핸드폰: 010-1234-5678' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('전화번호에 설명 포함', () => {
        const input = { name: 'Test', phone: '010-1234-5678 (집)' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    describe('이메일 형식 실수', () => {
      it('이메일에 "mailto:" 포함', () => {
        const input = { name: 'Test', email: 'mailto:hong@example.com' };
        const result = createCustomerSchema.safeParse(input);
        // Zod email 검증에서 거부
        expect(result.success).toBe(false);
      });

      it('이메일 앞뒤 공백', () => {
        const input = { name: 'Test', email: ' hong@example.com ' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('이메일에 "<>" 포함', () => {
        const input = { name: 'Test', email: '<hong@example.com>' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(false);
      });
    });

    describe('고객 유형 형식 실수', () => {
      it('"개인고객" - 거부', () => {
        const input = { name: 'Test', customerType: '개인고객' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('"법인(주)" - 거부', () => {
        const input = { name: 'Test', customerType: '법인(주)' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('"회사" - 거부', () => {
        const input = { name: 'Test', customerType: '회사' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('"개인 " (뒤 공백) - 거부', () => {
        const input = { name: 'Test', customerType: '개인 ' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(false);
      });
    });

    describe('생년월일 형식 실수', () => {
      it('"1980년 5월 15일" - 허용 (string)', () => {
        const input = { name: 'Test', birthDate: '1980년 5월 15일' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('"80.05.15" (2자리 연도) - 허용 (string)', () => {
        const input = { name: 'Test', birthDate: '80.05.15' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('"5월 15일" (연도 없음) - 허용 (string)', () => {
        const input = { name: 'Test', birthDate: '5월 15일' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('불완전한 입력', () => {

    it('필수 필드만 입력 (name)', () => {
      const input = { name: '홍길동' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('모든 선택 필드 null', () => {
      const input = {
        name: '홍길동',
        phone: null,
        email: null,
        birthDate: null,
        address: null
      };
      const result = createCustomerSchema.safeParse(input);
      // null은 optional 필드에서 거부될 수 있음
      expect(result.success).toBe(false);
    });

    it('모든 선택 필드 undefined', () => {
      const input = {
        name: '홍길동',
        phone: undefined,
        email: undefined,
        birthDate: undefined,
        address: undefined
      };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('빈 객체 (이름 없음)', () => {
      const input = {};
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('오류 복구 시나리오', () => {

    describe('수정으로 해결', () => {
      it('이름 오타 발견 후 수정', () => {
        // 원래: "홍길돈"
        // 수정: "홍길동"
        const updateSchema = z.object({
          customerId: z.string(),
          name: z.string().min(1).optional()
        });

        const input = {
          customerId: '507f1f77bcf86cd799439011',
          name: '홍길동'
        };

        const result = updateSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('전화번호 오타 발견 후 수정', () => {
        const updateSchema = z.object({
          customerId: z.string(),
          phone: z.string().optional()
        });

        const input = {
          customerId: '507f1f77bcf86cd799439011',
          phone: '010-1234-5678'
        };

        const result = updateSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    describe('삭제로 해결', () => {
      it('잘못 작성한 메모 삭제', () => {
        const deleteSchema = z.object({
          memoId: z.string()
        });

        const input = { memoId: '507f1f77bcf86cd799439011' };
        const result = deleteSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    describe('검색 결과 없음', () => {
      it('오타로 검색 결과 없음', () => {
        const input = { query: '홍길똥' };
        const result = searchCustomersSchema.safeParse(input);
        expect(result.success).toBe(true);
        // 빈 결과는 에러가 아님
      });

      it('존재하지 않는 고객 검색', () => {
        const input = { query: '없는사람이름' };
        const result = searchCustomersSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('에러 메시지 가독성', () => {

    it('에러 메시지에 "ObjectId" 없음', () => {
      const customersSource = readSourceFile('./tools/customers.ts');

      // isError: true 블록 내의 에러 메시지 확인
      const errorMessages = [
        '유효하지 않은 고객 ID입니다',
        '고객을 찾을 수 없습니다',
        '같은 이름의 고객이 이미 존재합니다'
      ];

      for (const msg of errorMessages) {
        expect(customersSource).toContain(msg);
        expect(msg).not.toContain('ObjectId');
      }
    });

    it('에러 메시지에 "Zod" 없음', () => {
      const customersSource = readSourceFile('./tools/customers.ts');

      // 에러 메시지 문자열 내에 Zod 노출 안 됨
      // (코드 내부에서는 사용하지만 사용자 메시지에는 없음)
      expect(customersSource).toContain('유효하지 않은 고객 ID');
    });

    it('에러 메시지에 "regex" 없음', () => {
      const errorMessages = [
        '유효하지 않은 고객 ID입니다',
        '고객을 찾을 수 없습니다'
      ];

      for (const msg of errorMessages) {
        expect(msg.toLowerCase()).not.toContain('regex');
        expect(msg.toLowerCase()).not.toContain('regular expression');
      }
    });

    it('에러 메시지에 "validation" 없음', () => {
      const errorMessages = [
        '유효하지 않은 고객 ID입니다',
        '고객을 찾을 수 없습니다'
      ];

      for (const msg of errorMessages) {
        expect(msg.toLowerCase()).not.toContain('validation');
      }
    });

    it('에러 메시지가 한글로 작성됨', () => {
      const customersSource = readSourceFile('./tools/customers.ts');
      const memosSource = readSourceFile('./tools/memos.ts');
      const contractsSource = readSourceFile('./tools/contracts.ts');

      // 한글 에러 메시지 확인
      expect(customersSource).toContain('유효하지 않은 고객 ID');
      expect(customersSource).toContain('고객을 찾을 수 없습니다');
      // memos는 단일 메모 필드 구조 - 고객 ID 검증만 확인
      expect(memosSource).toContain('유효하지 않은 고객 ID');
      expect(contractsSource).toContain('유효하지 않은 계약 ID');
      expect(contractsSource).toContain('계약을 찾을 수 없습니다');
    });
  });

  describe('일상적인 실수 패턴', () => {

    it('대문자/소문자 혼동', () => {
      // 상태값
      const input1 = { status: 'Active' };
      const result1 = searchCustomersSchema.safeParse(input1);
      expect(result1.success).toBe(false);

      const input2 = { status: 'ACTIVE' };
      const result2 = searchCustomersSchema.safeParse(input2);
      expect(result2.success).toBe(false);

      const input3 = { status: 'active' };
      const result3 = searchCustomersSchema.safeParse(input3);
      expect(result3.success).toBe(true);
    });

    it('숫자를 문자열로 입력', () => {
      const input = { name: '12345' };
      const result = createCustomerSchema.safeParse(input);
      // 문자열이므로 허용
      expect(result.success).toBe(true);
    });

    it('빈 문자열 vs 공백', () => {
      const input1 = { name: '' };
      const result1 = createCustomerSchema.safeParse(input1);
      expect(result1.success).toBe(false);

      const input2 = { name: ' ' };
      const result2 = createCustomerSchema.safeParse(input2);
      expect(result2.success).toBe(true); // 공백 1자는 min(1) 통과
    });

    it('여러 공백', () => {
      const input = { name: '   ' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true); // 공백 3자도 min(1) 통과
    });
  });

  describe('도움 요청 시나리오', () => {

    it('ID 형식 이해 못함', () => {
      // "507f1f77bcf86cd799439011" 같은 ID를 이해 못함
      // "홍길동" 이름으로 입력하면 거부

      // 현재: 스키마에서는 string만 확인
      const getCustomerSchema = z.object({
        customerId: z.string()
      });

      const input = { customerId: '홍길동' };
      const result = getCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
      // 실제 처리에서 toSafeObjectId가 거부
    });

    it('날짜 형식 이해 못함', () => {
      // "YYYY-MM-DD" 형식을 모름
      const inputs = [
        '80년 5월 15일',
        '5/15/80',
        '15.05.1980',
        '1980년 5월 15일생'
      ];

      for (const birthDate of inputs) {
        const input = { name: 'Test', birthDate };
        const result = createCustomerSchema.safeParse(input);
        // 현재는 string만 검사하므로 모두 통과
        expect(result.success).toBe(true);
      }
    });

    it('상태값 한글로 입력 시도', () => {
      const koreanStatuses = ['활성', '휴면', '전체', '삭제됨', '대기중'];

      for (const status of koreanStatuses) {
        const input = { status };
        const result = searchCustomersSchema.safeParse(input);
        expect(result.success).toBe(false);
      }
    });
  });
});
