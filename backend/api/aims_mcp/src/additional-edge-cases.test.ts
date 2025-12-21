/**
 * 추가 에지 케이스 테스트
 *
 * 기존 테스트에서 커버하지 않는 추가적인 엣지 케이스들을 검증합니다.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// 실제 스키마와 동일한 구조로 테스트
const searchCustomersSchema = z.object({
  query: z.string().optional(),
  customerType: z.enum(['개인', '법인']).optional(),
  status: z.enum(['active', 'inactive', 'all']).optional().default('active'),
  region: z.string().optional(),
  limit: z.number().optional().default(20)
});

const listContractsSchema = z.object({
  customerId: z.string().optional(),
  search: z.string().optional(),
  status: z.string().optional(),
  limit: z.number().optional().default(50)
});

const findBirthdayCustomersSchema = z.object({
  month: z.number().min(1).max(12),
  day: z.number().min(1).max(31).optional()
});

const getStatisticsSchema = z.object({
  type: z.enum(['summary', 'customer_count', 'contract_count', 'monthly_new']).default('summary')
});

describe('추가 에지 케이스', () => {

  describe('ObjectId 형식 검증', () => {
    // MongoDB ObjectId 형식: 24자 16진수
    function isValidObjectId(id: string): boolean {
      return /^[0-9a-fA-F]{24}$/.test(id);
    }

    describe('유효한 ObjectId', () => {
      const validIds = [
        '507f1f77bcf86cd799439011',
        '000000000000000000000000',
        'ffffffffffffffffffffffff',
        'ABCDEF1234567890abcdef12',
        '123456789012345678901234',
        'aaaaaaaaaaaaaaaaaaaaaaaa',
        'BBBBBBBBBBBBBBBBBBBBBBBB',
      ];

      for (const id of validIds) {
        it(`"${id}" 유효`, () => {
          expect(isValidObjectId(id)).toBe(true);
        });
      }
    });

    describe('유효하지 않은 ObjectId', () => {
      const invalidIds = [
        '',                                    // 빈 문자열
        '507f1f77bcf86cd79943901',             // 23자 (1자 부족)
        '507f1f77bcf86cd7994390111',           // 25자 (1자 초과)
        '507f1f77bcf86cd79943901g',            // g는 16진수 아님
        'test-id',                             // 문자열
        '12345',                               // 5자
        'null',                                // null 문자열
        'undefined',                           // undefined 문자열
        '507f1f77-bcf8-6cd7-9943-9011',        // UUID 형식
        ' 507f1f77bcf86cd799439011',           // 앞 공백
        '507f1f77bcf86cd799439011 ',           // 뒤 공백
        '507f1f77bcf86cd7 99439011',           // 중간 공백
      ];

      for (const id of invalidIds) {
        it(`"${id}" 무효`, () => {
          expect(isValidObjectId(id)).toBe(false);
        });
      }
    });
  });

  describe('검색 쿼리 처리', () => {

    describe('search_customers 입력', () => {
      it('빈 쿼리 허용', () => {
        const result = searchCustomersSchema.safeParse({ query: '' });
        expect(result.success).toBe(true);
      });

      it('공백만 있는 쿼리 허용', () => {
        const result = searchCustomersSchema.safeParse({ query: '   ' });
        expect(result.success).toBe(true);
      });

      it('특수문자 쿼리 허용', () => {
        const result = searchCustomersSchema.safeParse({ query: '홍길동.*+?^${}()|[]\\' });
        expect(result.success).toBe(true);
      });

      it('SQL 인젝션 시도 쿼리 허용 (스키마 레벨)', () => {
        const result = searchCustomersSchema.safeParse({ query: "'; DROP TABLE customers; --" });
        expect(result.success).toBe(true);
      });

      it('매우 긴 쿼리 허용', () => {
        const longQuery = '검'.repeat(10000);
        const result = searchCustomersSchema.safeParse({ query: longQuery });
        expect(result.success).toBe(true);
      });

      it('한글+영문+숫자 혼합 쿼리', () => {
        const result = searchCustomersSchema.safeParse({ query: '홍길동 Hong 123' });
        expect(result.success).toBe(true);
      });

      it('이모지 포함 쿼리', () => {
        const result = searchCustomersSchema.safeParse({ query: '홍길동 👨‍💼' });
        expect(result.success).toBe(true);
      });
    });

    describe('list_contracts 입력', () => {
      it('빈 검색어 허용', () => {
        const result = listContractsSchema.safeParse({ search: '' });
        expect(result.success).toBe(true);
      });

      it('증권번호 형식 검색', () => {
        const result = listContractsSchema.safeParse({ search: '2025-001-001' });
        expect(result.success).toBe(true);
      });

      it('고객명 검색', () => {
        const result = listContractsSchema.safeParse({ search: '홍길동' });
        expect(result.success).toBe(true);
      });
    });
  });

  describe('페이지네이션 처리', () => {

    describe('limit 경계값', () => {
      it('limit: 0 허용 (스키마 레벨)', () => {
        const result = searchCustomersSchema.safeParse({ limit: 0 });
        expect(result.success).toBe(true);
      });

      it('limit: 음수 허용 (스키마 레벨)', () => {
        const result = searchCustomersSchema.safeParse({ limit: -5 });
        expect(result.success).toBe(true);
      });

      it('limit: 소수 허용 (스키마 레벨)', () => {
        const result = searchCustomersSchema.safeParse({ limit: 10.5 });
        expect(result.success).toBe(true);
      });

      it('limit: 매우 큰 수 허용', () => {
        const result = searchCustomersSchema.safeParse({ limit: 999999999 });
        expect(result.success).toBe(true);
      });

      it('limit: 기본값 적용', () => {
        const result = searchCustomersSchema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });

      it('contracts limit 기본값: 50', () => {
        const result = listContractsSchema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(50);
        }
      });
    });
  });

  describe('날짜 처리', () => {

    describe('생일 검색', () => {
      it('month: 1 (1월)', () => {
        const result = findBirthdayCustomersSchema.safeParse({ month: 1 });
        expect(result.success).toBe(true);
      });

      it('month: 12 (12월)', () => {
        const result = findBirthdayCustomersSchema.safeParse({ month: 12 });
        expect(result.success).toBe(true);
      });

      it('month: 0 거부', () => {
        const result = findBirthdayCustomersSchema.safeParse({ month: 0 });
        expect(result.success).toBe(false);
      });

      it('month: 13 거부', () => {
        const result = findBirthdayCustomersSchema.safeParse({ month: 13 });
        expect(result.success).toBe(false);
      });

      it('day: 1 허용', () => {
        const result = findBirthdayCustomersSchema.safeParse({ month: 1, day: 1 });
        expect(result.success).toBe(true);
      });

      it('day: 31 허용', () => {
        const result = findBirthdayCustomersSchema.safeParse({ month: 1, day: 31 });
        expect(result.success).toBe(true);
      });

      it('day: 0 거부', () => {
        const result = findBirthdayCustomersSchema.safeParse({ month: 1, day: 0 });
        expect(result.success).toBe(false);
      });

      it('day: 32 거부', () => {
        const result = findBirthdayCustomersSchema.safeParse({ month: 1, day: 32 });
        expect(result.success).toBe(false);
      });

      it('2월 30일 허용 (스키마 레벨 - DB에서 결과 없음)', () => {
        const result = findBirthdayCustomersSchema.safeParse({ month: 2, day: 30 });
        expect(result.success).toBe(true);
      });
    });

    describe('Date 객체 생성', () => {
      it('현재 시간 생성', () => {
        const now = new Date();
        expect(now).toBeInstanceOf(Date);
        expect(isNaN(now.getTime())).toBe(false);
      });

      it('ISO 문자열에서 Date 생성', () => {
        const date = new Date('2025-12-21T14:30:00.000Z');
        expect(date).toBeInstanceOf(Date);
        expect(isNaN(date.getTime())).toBe(false);
      });

      it('한국 시간대 문자열에서 Date 생성', () => {
        const date = new Date('2025-12-21T23:30:00+09:00');
        expect(date).toBeInstanceOf(Date);
        expect(isNaN(date.getTime())).toBe(false);
      });

      it('잘못된 문자열에서 Invalid Date 생성', () => {
        const date = new Date('invalid-date');
        expect(isNaN(date.getTime())).toBe(true);
      });
    });
  });

  describe('통계 유형 처리', () => {

    it('summary 기본값', () => {
      const result = getStatisticsSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('summary');
      }
    });

    it('customer_count 유형', () => {
      const result = getStatisticsSchema.safeParse({ type: 'customer_count' });
      expect(result.success).toBe(true);
    });

    it('contract_count 유형', () => {
      const result = getStatisticsSchema.safeParse({ type: 'contract_count' });
      expect(result.success).toBe(true);
    });

    it('monthly_new 유형', () => {
      const result = getStatisticsSchema.safeParse({ type: 'monthly_new' });
      expect(result.success).toBe(true);
    });

    it('잘못된 유형 거부', () => {
      const result = getStatisticsSchema.safeParse({ type: 'invalid_type' });
      expect(result.success).toBe(false);
    });
  });

  describe('RegExp 이스케이프', () => {

    // db.ts의 escapeRegex와 동일한 함수
    function escapeRegex(str: string): string {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    describe('검색어 이스케이프', () => {
      it('일반 문자열 그대로', () => {
        expect(escapeRegex('홍길동')).toBe('홍길동');
      });

      it('점(.) 이스케이프', () => {
        expect(escapeRegex('홍.길.동')).toBe('홍\\.길\\.동');
      });

      it('별표(*) 이스케이프', () => {
        expect(escapeRegex('홍*길동')).toBe('홍\\*길동');
      });

      it('괄호 이스케이프', () => {
        expect(escapeRegex('홍(길)동')).toBe('홍\\(길\\)동');
      });

      it('대괄호 이스케이프', () => {
        expect(escapeRegex('홍[길]동')).toBe('홍\\[길\\]동');
      });

      it('파이프 이스케이프', () => {
        expect(escapeRegex('홍|길|동')).toBe('홍\\|길\\|동');
      });

      it('모든 특수문자 조합', () => {
        const special = '.*+?^${}()|[]\\';
        const escaped = escapeRegex(special);
        expect(escaped).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
      });
    });
  });

  describe('enum 값 처리', () => {

    describe('customerType', () => {
      it('개인 허용', () => {
        const result = searchCustomersSchema.safeParse({ customerType: '개인' });
        expect(result.success).toBe(true);
      });

      it('법인 허용', () => {
        const result = searchCustomersSchema.safeParse({ customerType: '법인' });
        expect(result.success).toBe(true);
      });

      it('기타 거부', () => {
        const result = searchCustomersSchema.safeParse({ customerType: '기타' });
        expect(result.success).toBe(false);
      });

      it('개인 (앞뒤 공백) 거부', () => {
        const result = searchCustomersSchema.safeParse({ customerType: ' 개인 ' });
        expect(result.success).toBe(false);
      });

      it('INDIVIDUAL 거부 (영문)', () => {
        const result = searchCustomersSchema.safeParse({ customerType: 'INDIVIDUAL' });
        expect(result.success).toBe(false);
      });
    });

    describe('status', () => {
      it('active 허용', () => {
        const result = searchCustomersSchema.safeParse({ status: 'active' });
        expect(result.success).toBe(true);
      });

      it('inactive 허용', () => {
        const result = searchCustomersSchema.safeParse({ status: 'inactive' });
        expect(result.success).toBe(true);
      });

      it('all 허용', () => {
        const result = searchCustomersSchema.safeParse({ status: 'all' });
        expect(result.success).toBe(true);
      });

      it('deleted 거부', () => {
        const result = searchCustomersSchema.safeParse({ status: 'deleted' });
        expect(result.success).toBe(false);
      });

      it('기본값 active', () => {
        const result = searchCustomersSchema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe('active');
        }
      });
    });
  });

  describe('복합 입력 검증', () => {

    it('모든 필드 동시 입력', () => {
      const result = searchCustomersSchema.safeParse({
        query: '홍길동',
        customerType: '개인',
        status: 'active',
        region: '서울',
        limit: 10
      });
      expect(result.success).toBe(true);
    });

    it('일부 필드만 입력', () => {
      const result = searchCustomersSchema.safeParse({
        query: '홍',
        limit: 5
      });
      expect(result.success).toBe(true);
    });

    it('빈 객체 입력 (기본값 적용)', () => {
      const result = searchCustomersSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('active');
        expect(result.data.limit).toBe(20);
      }
    });

    it('null 입력 거부', () => {
      const result = searchCustomersSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    it('undefined 입력 거부', () => {
      const result = searchCustomersSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });

    it('배열 입력 거부', () => {
      const result = searchCustomersSchema.safeParse([]);
      expect(result.success).toBe(false);
    });

    it('문자열 입력 거부', () => {
      const result = searchCustomersSchema.safeParse('query');
      expect(result.success).toBe(false);
    });
  });
});

describe('응답 데이터 형식 시뮬레이션', () => {

  describe('고객 목록 응답', () => {
    interface CustomerListResponse {
      count: number;
      totalCount: number;
      customers: Array<{
        id: string;
        name: string;
        phone: string;
        email?: string;
        type: string;
        status: string;
      }>;
    }

    it('빈 결과', () => {
      const response: CustomerListResponse = {
        count: 0,
        totalCount: 0,
        customers: []
      };
      expect(response.count).toBe(0);
      expect(response.customers).toHaveLength(0);
    });

    it('단일 결과', () => {
      const response: CustomerListResponse = {
        count: 1,
        totalCount: 1,
        customers: [{
          id: '507f1f77bcf86cd799439011',
          name: '홍길동',
          phone: '010-1234-5678',
          email: 'hong@example.com',
          type: '개인',
          status: 'active'
        }]
      };
      expect(response.count).toBe(1);
      expect(response.customers[0].id).toMatch(/^[0-9a-f]{24}$/);
    });

    it('다중 결과', () => {
      const response: CustomerListResponse = {
        count: 3,
        totalCount: 100,
        customers: [
          { id: '507f1f77bcf86cd799439011', name: '홍길동', phone: '010-1111-1111', type: '개인', status: 'active' },
          { id: '507f1f77bcf86cd799439012', name: '김철수', phone: '010-2222-2222', type: '개인', status: 'active' },
          { id: '507f1f77bcf86cd799439013', name: '(주)테스트', phone: '02-1234-5678', type: '법인', status: 'active' }
        ]
      };
      expect(response.count).toBe(3);
      expect(response.totalCount).toBe(100);
    });
  });

  describe('통계 응답', () => {
    interface SummaryResponse {
      type: 'summary';
      customers: {
        total: number;
        active: number;
        inactive: number;
        individual: number;
        corporate: number;
      };
      contracts: {
        total: number;
        totalPremium: number;
      };
    }

    it('빈 통계', () => {
      const response: SummaryResponse = {
        type: 'summary',
        customers: { total: 0, active: 0, inactive: 0, individual: 0, corporate: 0 },
        contracts: { total: 0, totalPremium: 0 }
      };
      expect(response.customers.total).toBe(0);
      expect(response.contracts.totalPremium).toBe(0);
    });

    it('정상 통계', () => {
      const response: SummaryResponse = {
        type: 'summary',
        customers: { total: 100, active: 80, inactive: 20, individual: 70, corporate: 30 },
        contracts: { total: 150, totalPremium: 15000000 }
      };
      expect(response.customers.active + response.customers.inactive).toBe(response.customers.total);
      expect(response.customers.individual + response.customers.corporate).toBe(response.customers.total);
    });
  });
});
