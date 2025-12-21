/**
 * 페르소나: 외국 사용자 테스트
 *
 * 비한국어 사용자 또는 외국 고객을 다루는 상황을 시뮬레이션합니다.
 * - 비한국어 이름/주소
 * - 국제 전화번호 형식
 * - 다양한 날짜 형식 습관
 * - 유니코드 처리
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// 테스트용 스키마
const createCustomerSchema = z.object({
  name: z.string().min(1),
  customerType: z.enum(['개인', '법인']).optional().default('개인'),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  birthDate: z.string().optional(),
  address: z.string().optional()
});

describe('페르소나: 외국 사용자', () => {

  describe('국제 이름 처리', () => {

    describe('영어권 이름', () => {
      it('영문 이름 (John Smith)', () => {
        const input = { name: 'John Smith' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('하이픈 이름 (Mary-Jane Watson)', () => {
        const input = { name: 'Mary-Jane Watson' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('아포스트로피 (O\'Brien)', () => {
        const input = { name: "O'Brien" };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('아포스트로피 (D\'Arcy)', () => {
        const input = { name: "D'Arcy" };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('Jr., Sr. 접미사 (John Smith Jr.)', () => {
        const input = { name: 'John Smith Jr.' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    describe('동아시아 이름', () => {
      it('중국어 간체 (王小明)', () => {
        const input = { name: '王小明' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('중국어 번체 (張三豐)', () => {
        const input = { name: '張三豐' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('일본어 한자 (田中太郎)', () => {
        const input = { name: '田中太郎' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('일본어 히라가나 (たなか たろう)', () => {
        const input = { name: 'たなか たろう' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('일본어 가타카나 (タナカ タロウ)', () => {
        const input = { name: 'タナカ タロウ' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    describe('기타 언어 이름', () => {
      it('아랍어 (محمد أحمد)', () => {
        const input = { name: 'محمد أحمد' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('러시아어 (Иван Петров)', () => {
        const input = { name: 'Иван Петров' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('그리스어 (Νίκος Παπαδόπουλος)', () => {
        const input = { name: 'Νίκος Παπαδόπουλος' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('히브리어 (יוסף כהן)', () => {
        const input = { name: 'יוסף כהן' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('태국어 (สมชาย ใจดี)', () => {
        const input = { name: 'สมชาย ใจดี' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    describe('악센트/특수 문자 이름', () => {
      it('스페인어 악센트 (José García)', () => {
        const input = { name: 'José García' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('프랑스어 악센트 (François Müller)', () => {
        const input = { name: 'François Müller' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('독일어 움라우트 (Jürgen Köhler)', () => {
        const input = { name: 'Jürgen Köhler' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('북유럽 특수문자 (Bjørn Ødegård)', () => {
        const input = { name: 'Bjørn Ødegård' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('폴란드어 특수문자 (Łukasz Żółkiewski)', () => {
        const input = { name: 'Łukasz Żółkiewski' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    describe('특수 케이스 이름', () => {
      it('매우 긴 이름 (스리랑카 50자+)', () => {
        const longName = 'Warnakulasuriya Patabendige Ushantha Joseph Chaminda Vaas';
        const input = { name: longName };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
        expect(longName.length).toBeGreaterThan(50);
      });

      it('단일 문자 이름 (X)', () => {
        const input = { name: 'X' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('단일 한자 이름 (李)', () => {
        const input = { name: '李' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('숫자 포함 이름 (John Smith III)', () => {
        const input = { name: 'John Smith III' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('국제 전화번호', () => {

    describe('북미', () => {
      it('미국 형식 (+1-555-123-4567)', () => {
        const input = { name: 'Test', phone: '+1-555-123-4567' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('미국 괄호 형식 (+1 (555) 123-4567)', () => {
        const input = { name: 'Test', phone: '+1 (555) 123-4567' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('캐나다 형식 (+1-416-123-4567)', () => {
        const input = { name: 'Test', phone: '+1-416-123-4567' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    describe('유럽', () => {
      it('영국 형식 (+44 20 7946 0958)', () => {
        const input = { name: 'Test', phone: '+44 20 7946 0958' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('독일 형식 (+49 30 12345678)', () => {
        const input = { name: 'Test', phone: '+49 30 12345678' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('프랑스 형식 (+33 1 23 45 67 89)', () => {
        const input = { name: 'Test', phone: '+33 1 23 45 67 89' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    describe('아시아', () => {
      it('중국 형식 (+86 138 0013 8000)', () => {
        const input = { name: 'Test', phone: '+86 138 0013 8000' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('일본 형식 (+81-3-1234-5678)', () => {
        const input = { name: 'Test', phone: '+81-3-1234-5678' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('일본 휴대폰 (+81-90-1234-5678)', () => {
        const input = { name: 'Test', phone: '+81-90-1234-5678' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('싱가포르 형식 (+65 9123 4567)', () => {
        const input = { name: 'Test', phone: '+65 9123 4567' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    describe('특수 케이스', () => {
      it('국가코드만 (+82)', () => {
        const input = { name: 'Test', phone: '+82' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('국가코드 없이 (1-555-123-4567)', () => {
        const input = { name: 'Test', phone: '1-555-123-4567' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('내선번호 포함 (+1-555-123-4567 x123)', () => {
        const input = { name: 'Test', phone: '+1-555-123-4567 x123' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('국제 이메일', () => {

    it('표준 이메일 (user@example.com)', () => {
      const input = { name: 'Test', email: 'user@example.com' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('긴 도메인 (user@subdomain.company.co.uk)', () => {
      const input = { name: 'Test', email: 'user@subdomain.company.co.uk' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('숫자 도메인 (user@123.com)', () => {
      const input = { name: 'Test', email: 'user@123.com' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('플러스 태그 (user+tag@example.com)', () => {
      const input = { name: 'Test', email: 'user+tag@example.com' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('점 포함 로컬파트 (first.last@example.com)', () => {
      const input = { name: 'Test', email: 'first.last@example.com' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    // 국제화 도메인은 Zod 기본 email 검증에서 지원하지 않을 수 있음
    it('IDN 도메인은 Punycode 변환 필요', () => {
      // user@例え.jp → user@xn--r8jz45g.jp
      const input = { name: 'Test', email: 'user@xn--r8jz45g.jp' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('날짜 형식 혼란', () => {

    it('ISO 형식 (1980-05-15) - 허용', () => {
      const input = { name: 'Test', birthDate: '1980-05-15' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    describe('미국식 (MM/DD/YYYY) - 현재 허용됨 (string)', () => {
      it('05/15/1980', () => {
        const input = { name: 'Test', birthDate: '05/15/1980' };
        const result = createCustomerSchema.safeParse(input);
        // 스키마에서 string만 검사하므로 통과
        expect(result.success).toBe(true);
      });
    });

    describe('유럽식 (DD.MM.YYYY) - 현재 허용됨 (string)', () => {
      it('15.05.1980', () => {
        const input = { name: 'Test', birthDate: '15.05.1980' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    describe('일본식 - 현재 허용됨 (string)', () => {
      it('昭和55年5月15日', () => {
        const input = { name: 'Test', birthDate: '昭和55年5月15日' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('1980年5月15日', () => {
        const input = { name: 'Test', birthDate: '1980年5月15日' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    describe('중국식 - 현재 허용됨 (string)', () => {
      it('1980年5月15日', () => {
        const input = { name: 'Test', birthDate: '1980年5月15日' };
        const result = createCustomerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('국제 주소', () => {

    it('미국 주소', () => {
      const input = { name: 'Test', address: '123 Main St, New York, NY 10001, USA' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('영국 주소', () => {
      const input = { name: 'Test', address: '10 Downing Street, London SW1A 2AA, UK' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('일본 주소', () => {
      const input = { name: 'Test', address: '〒150-0001 東京都渋谷区神宮前1-1-1' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('중국 주소', () => {
      const input = { name: 'Test', address: '北京市朝阳区建国门外大街1号' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('독일 주소', () => {
      const input = { name: 'Test', address: 'Friedrichstraße 123, 10117 Berlin, Germany' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('우편번호만', () => {
      const input = { name: 'Test', address: '12345' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('법인 국제화', () => {

    it('미국 법인 (ABC Corporation Ltd.)', () => {
      const input = { name: 'ABC Corporation Ltd.', customerType: '법인' as const };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('영국 법인 (XYZ Holdings PLC)', () => {
      const input = { name: 'XYZ Holdings PLC', customerType: '법인' as const };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('독일 법인 (ABC GmbH)', () => {
      const input = { name: 'ABC GmbH', customerType: '법인' as const };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('일본 법인 (株式会社ABC)', () => {
      const input = { name: '株式会社ABC', customerType: '법인' as const };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('중국 법인 (北京ABC有限公司)', () => {
      const input = { name: '北京ABC有限公司', customerType: '법인' as const };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('한국 법인 ((주)에이비씨)', () => {
      const input = { name: '(주)에이비씨', customerType: '법인' as const };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('유니코드 특수 케이스', () => {

    it('이모지 이름 (👨‍💼 John)', () => {
      const input = { name: '👨‍💼 John' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('ZWJ 시퀀스 이모지 (👨‍👩‍👧‍👦)', () => {
      const input = { name: '👨‍👩‍👧‍👦 Family' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('RTL 텍스트 (아랍어+영어 혼합)', () => {
      const input = { name: 'محمد Ahmed' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('서로게이트 페어 (𠀀)', () => {
      const input = { name: '𠀀Test' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('결합 문자 (é = e + ́)', () => {
      // NFD 형식: e + 결합 악센트
      const input = { name: 'Cafe\u0301' };
      const result = createCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });
});
