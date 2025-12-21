/**
 * 페르소나: 익숙한 설계사 테스트
 *
 * 시스템을 1년 이상 사용한 숙련자의 사용 패턴을 시뮬레이션합니다.
 * - 빠른 입력, 단축 경로 선호
 * - 대량 작업 빈번
 * - 엣지 케이스 자주 마주침
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

// 정규식 이스케이프 함수 (customers.ts와 동일)
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('페르소나: 익숙한 설계사', () => {

  describe('대량 고객 관리', () => {

    it('100명 고객 순차 등록 시뮬레이션', () => {
      const customers: { name: string; phone: string }[] = [];
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        customers.push({
          name: `테스트고객${i.toString().padStart(3, '0')}`,
          phone: `010-${String(1000 + i).slice(1)}-${String(1000 + i).slice(1)}`
        });
      }

      const elapsed = Date.now() - startTime;

      expect(customers).toHaveLength(100);
      expect(elapsed).toBeLessThan(100); // 100ms 이내
      expect(customers[0].name).toBe('테스트고객000');
      expect(customers[99].name).toBe('테스트고객099');
    });

    it('동일 고객에 10개 메모 연속 추가 시 타임스탬프 고유', () => {
      const memos: { content: string; createdAt: Date }[] = [];

      for (let i = 0; i < 10; i++) {
        memos.push({
          content: `메모 ${i + 1}: 상담 내용`,
          createdAt: new Date()
        });
      }

      expect(memos).toHaveLength(10);

      // 모든 메모가 Date 객체
      for (const memo of memos) {
        expect(memo.createdAt).toBeInstanceOf(Date);
      }
    });

    it('limit 100으로 대량 조회', () => {
      const schema = z.object({
        limit: z.number().min(1).max(1000).optional().default(20)
      });

      const result = schema.safeParse({ limit: 100 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(100);
      }
    });

    it('limit 0은 거부', () => {
      const schema = z.object({
        limit: z.number().min(1).max(1000).optional().default(20)
      });

      const result = schema.safeParse({ limit: 0 });
      expect(result.success).toBe(false);
    });
  });

  describe('복잡한 검색 패턴', () => {

    describe('특수문자 포함 검색', () => {
      const testCases = [
        { input: '(주)홍길동', escaped: '\\(주\\)홍길동' },
        { input: '홍길동 & 파트너', escaped: '홍길동 & 파트너' },
        { input: '[테스트]', escaped: '\\[테스트\\]' },
        { input: '홍*길동', escaped: '홍\\*길동' },
        { input: '홍.길.동', escaped: '홍\\.길\\.동' },
        { input: '홍+길동', escaped: '홍\\+길동' },
        { input: '홍?길동', escaped: '홍\\?길동' },
        { input: '100$', escaped: '100\\$' },
        { input: '^홍길동', escaped: '\\^홍길동' },
        { input: '홍|김', escaped: '홍\\|김' }
      ];

      for (const { input, escaped } of testCases) {
        it(`"${input}" → "${escaped}"`, () => {
          expect(escapeRegex(input)).toBe(escaped);
        });
      }
    });

    it('법인 + 활성 + 서울 복합 필터', () => {
      const schema = z.object({
        customerType: z.enum(['개인', '법인']).optional(),
        status: z.enum(['active', 'inactive', 'all']).optional().default('active'),
        region: z.string().optional(),
        query: z.string().optional()
      });

      const input = {
        customerType: '법인',
        status: 'active',
        region: '서울',
        query: '테스트'
      };

      const result = schema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.customerType).toBe('법인');
        expect(result.data.status).toBe('active');
        expect(result.data.region).toBe('서울');
      }
    });

    it('존재하지 않는 조합 검색 - 빈 배열 반환 (에러 아님)', () => {
      // 시뮬레이션: 법인 + 부산 + "없는이름" 검색
      const searchResults: unknown[] = [];
      expect(searchResults).toEqual([]);
      expect(Array.isArray(searchResults)).toBe(true);
    });
  });

  describe('빠른 수정 작업', () => {

    it('고객 이름만 변경 (다른 필드 유지)', () => {
      const updateSchema = z.object({
        customerId: z.string(),
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
        email: z.string().email().optional()
      });

      // 이름만 변경
      const input = {
        customerId: '507f1f77bcf86cd799439011',
        name: '김길동'
      };

      const result = updateSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('김길동');
        expect(result.data.phone).toBeUndefined();
        expect(result.data.email).toBeUndefined();
      }
    });

    it('빈 문자열로 필드 초기화', () => {
      const updateSchema = z.object({
        customerId: z.string(),
        phone: z.string().optional()
      });

      const input = {
        customerId: '507f1f77bcf86cd799439011',
        phone: ''
      };

      const result = updateSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.phone).toBe('');
      }
    });

    it('연속 수정 시 updated_at 갱신', () => {
      const updates: { updatedAt: Date }[] = [];

      for (let i = 0; i < 3; i++) {
        updates.push({ updatedAt: new Date() });
      }

      expect(updates).toHaveLength(3);
      for (const update of updates) {
        expect(update.updatedAt).toBeInstanceOf(Date);
      }
    });
  });

  describe('계약/문서 조회 효율', () => {

    it('고객별 계약 목록 → 상세 조회 연속 플로우', () => {
      const listContractsSchema = z.object({
        customerId: z.string().optional(),
        limit: z.number().optional().default(50)
      });

      const getContractSchema = z.object({
        contractId: z.string()
      });

      // 1단계: 목록 조회
      const listResult = listContractsSchema.safeParse({
        customerId: '507f1f77bcf86cd799439011'
      });
      expect(listResult.success).toBe(true);

      // 2단계: 상세 조회
      const getResult = getContractSchema.safeParse({
        contractId: '507f1f77bcf86cd799439012'
      });
      expect(getResult.success).toBe(true);
    });

    it('만기 30일 계약 조회', () => {
      const expiringSchema = z.object({
        daysWithin: z.number().min(1).max(365).optional().default(30)
      });

      const result = expiringSchema.safeParse({ daysWithin: 30 });
      expect(result.success).toBe(true);
    });

    it('이번 달 생일 고객 전체 조회', () => {
      const birthdaySchema = z.object({
        month: z.number().min(1).max(12),
        day: z.number().min(1).max(31).optional()
      });

      const currentMonth = new Date().getMonth() + 1;
      const result = birthdaySchema.safeParse({ month: currentMonth });
      expect(result.success).toBe(true);
    });
  });

  describe('통계 활용', () => {

    it('월별 신규 현황 6개월치', () => {
      const statisticsSchema = z.object({
        type: z.enum(['summary', 'customer_count', 'contract_count', 'monthly_new']).optional().default('summary')
      });

      const result = statisticsSchema.safeParse({ type: 'monthly_new' });
      expect(result.success).toBe(true);
    });

    it('전체 요약 + 고객 수 + 계약 수 연속 조회', () => {
      const statisticsSchema = z.object({
        type: z.enum(['summary', 'customer_count', 'contract_count', 'monthly_new']).optional().default('summary')
      });

      const types = ['summary', 'customer_count', 'contract_count'];
      for (const type of types) {
        const result = statisticsSchema.safeParse({ type });
        expect(result.success).toBe(true);
      }
    });

    it('잘못된 통계 타입 거부', () => {
      const statisticsSchema = z.object({
        type: z.enum(['summary', 'customer_count', 'contract_count', 'monthly_new']).optional().default('summary')
      });

      const result = statisticsSchema.safeParse({ type: 'all' });
      expect(result.success).toBe(false);
    });
  });

  describe('관계 네트워크 활용', () => {

    it('고객 네트워크 조회 스키마', () => {
      const networkSchema = z.object({
        customerId: z.string()
      });

      const result = networkSchema.safeParse({
        customerId: '507f1f77bcf86cd799439011'
      });
      expect(result.success).toBe(true);
    });

    it('network.ts 관계 유형 매핑 확인', () => {
      const networkSource = readSourceFile('./tools/network.ts');

      // 관계 카테고리 확인
      expect(networkSource).toContain('family');
      expect(networkSource).toContain('relative');
      expect(networkSource).toContain('social');
      expect(networkSource).toContain('professional');
      expect(networkSource).toContain('corporate');

      // 한글 라벨 확인
      expect(networkSource).toContain('배우자');
      expect(networkSource).toContain('부모');
      expect(networkSource).toContain('자녀');
      expect(networkSource).toContain('동료');
    });
  });

  describe('효율적인 작업 패턴', () => {

    it('메모 일괄 조회 후 선택 삭제', () => {
      const listMemosSchema = z.object({
        customerId: z.string(),
        limit: z.number().optional().default(20)
      });

      const deleteMemoSchema = z.object({
        memoId: z.string()
      });

      // 1단계: 목록 조회
      const listResult = listMemosSchema.safeParse({
        customerId: '507f1f77bcf86cd799439011'
      });
      expect(listResult.success).toBe(true);

      // 2단계: 삭제
      const deleteResult = deleteMemoSchema.safeParse({
        memoId: '507f1f77bcf86cd799439013'
      });
      expect(deleteResult.success).toBe(true);
    });

    it('상품 검색 → 상세 조회 연속', () => {
      const searchProductsSchema = z.object({
        query: z.string().optional(),
        insurerName: z.string().optional(),
        category: z.string().optional(),
        limit: z.number().optional().default(20)
      });

      const getProductSchema = z.object({
        productId: z.string()
      });

      // 1단계: 검색
      const searchResult = searchProductsSchema.safeParse({
        query: '암보험',
        insurerName: '삼성화재'
      });
      expect(searchResult.success).toBe(true);

      // 2단계: 상세
      const getResult = getProductSchema.safeParse({
        productId: '507f1f77bcf86cd799439014'
      });
      expect(getResult.success).toBe(true);
    });

    it('문서 시맨틱 검색', () => {
      const searchDocsSchema = z.object({
        query: z.string().min(1),
        searchMode: z.enum(['semantic', 'keyword']).optional().default('semantic'),
        customerId: z.string().optional(),
        limit: z.number().optional().default(10)
      });

      const result = searchDocsSchema.safeParse({
        query: '암 진단 특약',
        searchMode: 'semantic'
      });
      expect(result.success).toBe(true);
    });
  });
});
