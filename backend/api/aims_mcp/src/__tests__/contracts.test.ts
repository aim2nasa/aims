/**
 * contracts.ts regression 테스트
 *
 * Gini 검수 Major #2: 날짜 형식 검증, 기본 동작, 정렬, summary 집계 검증
 *
 * @since 2026-03-21
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZodError } from 'zod';
import { listContractsSchema } from '../tools/contracts.js';

// ── DB / Auth / Logger Mock ──────────────────────────────────────────

// 고객 데이터 fixture
const mockCustomers = [
  {
    _id: { toString: () => 'cust-001' },
    personal_info: { name: '홍길동' },
    annual_reports: [
      {
        issue_date: '2026-01-15',
        parsed_at: '2026-01-16T00:00:00Z',
        contracts: [
          {
            '순번': 1,
            '증권번호': 'POL-001',
            '보험상품': '종신보험',
            '계약자': '홍길동',
            '피보험자': '홍길동',
            '계약일': '2025-06-15',
            '계약상태': '정상',
            '가입금액(만원)': 10000,
            '보험기간': '종신',
            '납입기간': '20년',
            '보험료(원)': 150000
          },
          {
            '순번': 2,
            '증권번호': 'POL-002',
            '보험상품': '실손보험',
            '계약자': '홍길동',
            '피보험자': '홍길동',
            '계약일': '2024-12-01',
            '계약상태': '정상',
            '가입금액(만원)': 5000,
            '보험기간': '1년',
            '납입기간': '1년',
            '보험료(원)': 30000
          },
          {
            '순번': 3,
            '증권번호': 'POL-003',
            '보험상품': '변액보험',
            '계약자': '홍길동',
            '피보험자': '홍길동',
            '계약일': '2023-03-10',
            '계약상태': '실효',
            '가입금액(만원)': 20000,
            '보험기간': '20년',
            '납입기간': '10년',
            '보험료(원)': 200000
          }
        ]
      }
    ]
  }
];

// 커서 mock
function createMockCursor(data: unknown[]) {
  return {
    project: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue(data)
  };
}

const mockFind = vi.fn();
const mockCollection = vi.fn().mockReturnValue({ find: mockFind });
const mockDb = { collection: mockCollection };

vi.mock('../db.js', () => ({
  getDB: () => mockDb,
  toSafeObjectId: (id: string) => id ? { toString: () => id } : null,
  COLLECTIONS: { CUSTOMERS: 'customers' },
  formatZodError: (error: ZodError) => error.issues.map(i => i.message).join(', ')
}));

vi.mock('../auth.js', () => ({
  getCurrentUserId: () => 'test-user-id'
}));

vi.mock('../systemLogger.js', () => ({
  sendErrorLog: vi.fn()
}));

// mock 설정 후 import (호이스팅 됨)
import { handleListContracts } from '../tools/contracts.js';

// ── 헬퍼 ─────────────────────────────────────────────────────────────

/** handleListContracts 응답에서 JSON 파싱 */
function parseResponse(result: { content: Array<{ text: string }>, isError?: boolean }) {
  if (result.isError) throw new Error(result.content[0].text);
  return JSON.parse(result.content[0].text);
}

// ============================================================================
// 테스트 시작
// ============================================================================

describe('contracts - listContractsSchema 검증', () => {

  // ── 시나리오 1: 파라미터 없이 호출 시 기본값 ──────────────────────
  it('파라미터 없이 parse 시 기본값이 설정되어야 한다', () => {
    const result = listContractsSchema.parse({});
    expect(result.sortBy).toBe('contractDate');
    expect(result.sortOrder).toBe('desc');
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(0);
    expect(result.contractDateFrom).toBeUndefined();
    expect(result.contractDateTo).toBeUndefined();
  });

  // ── 시나리오 4: 유효하지 않은 날짜 입력 시 ZodError ────────────────
  describe('유효하지 않은 날짜 형식 시 ZodError 반환', () => {
    it('contractDateFrom이 잘못된 형식이면 ZodError', () => {
      expect(() => listContractsSchema.parse({ contractDateFrom: '2025/06/15' }))
        .toThrow(ZodError);
    });

    it('contractDateTo가 잘못된 형식이면 ZodError', () => {
      expect(() => listContractsSchema.parse({ contractDateTo: '15-06-2025' }))
        .toThrow(ZodError);
    });

    it('날짜가 아닌 문자열이면 ZodError', () => {
      expect(() => listContractsSchema.parse({ contractDateFrom: 'yesterday' }))
        .toThrow(ZodError);
    });

    it('빈 문자열이면 ZodError', () => {
      expect(() => listContractsSchema.parse({ contractDateFrom: '' }))
        .toThrow(ZodError);
    });

    it('YYYY-MM-DD 형식이면 정상 통과', () => {
      const result = listContractsSchema.parse({
        contractDateFrom: '2025-06-15',
        contractDateTo: '2026-01-01'
      });
      expect(result.contractDateFrom).toBe('2025-06-15');
      expect(result.contractDateTo).toBe('2026-01-01');
    });
  });
});

describe('contracts - handleListContracts 핸들러', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockFind.mockReturnValue(createMockCursor(mockCustomers));
  });

  // ── 시나리오 1: 파라미터 없이 호출 시 기존 동작 유지 ────────────────
  it('파라미터 없이 호출 시 summary 포함, contractDate desc 정렬', async () => {
    const result = await handleListContracts({});
    const data = parseResponse(result as any);

    // summary 포함 확인
    expect(data.summary).toBeDefined();
    expect(data.summary.totalContracts).toBe(3);
    expect(data.summary.activeContracts).toBe(2);  // 정상 2건
    expect(data.summary.lapsedContracts).toBe(1);   // 실효 1건
    expect(data.summary.totalPremium).toBe(380000);  // 150000 + 30000 + 200000

    // 기본 정렬: contractDate desc (최신순)
    expect(data.contracts[0].contractDate).toBe('2025-06-15');
    expect(data.contracts[1].contractDate).toBe('2024-12-01');
    expect(data.contracts[2].contractDate).toBe('2023-03-10');
  });

  // ── 시나리오 2: contractDateFrom/To 경계값 ────────────────────────
  describe('날짜 필터 경계값 테스트', () => {

    it('contractDateFrom 당일 포함', async () => {
      const result = await handleListContracts({ contractDateFrom: '2024-12-01' });
      const data = parseResponse(result as any);

      // 2024-12-01 이후: POL-001 (2025-06-15), POL-002 (2024-12-01)
      expect(data.totalCount).toBe(2);
      const dates = data.contracts.map((c: any) => c.contractDate);
      expect(dates).toContain('2024-12-01');  // 당일 포함
      expect(dates).toContain('2025-06-15');
    });

    it('contractDateTo 당일 포함', async () => {
      const result = await handleListContracts({ contractDateTo: '2024-12-01' });
      const data = parseResponse(result as any);

      // 2024-12-01 이전(포함): POL-002 (2024-12-01), POL-003 (2023-03-10)
      expect(data.totalCount).toBe(2);
      const dates = data.contracts.map((c: any) => c.contractDate);
      expect(dates).toContain('2024-12-01');  // 당일 포함
      expect(dates).toContain('2023-03-10');
    });

    it('From과 To가 같은 날짜이면 해당일만 반환', async () => {
      const result = await handleListContracts({
        contractDateFrom: '2024-12-01',
        contractDateTo: '2024-12-01'
      });
      const data = parseResponse(result as any);

      expect(data.totalCount).toBe(1);
      expect(data.contracts[0].contractDate).toBe('2024-12-01');
    });
  });

  // ── 시나리오 3: summary가 페이지네이션 전 기준 ─────────────────────
  it('summary는 필터 적용 후, 페이지네이션 전 전체 기준으로 계산', async () => {
    const result = await handleListContracts({ limit: 1, offset: 0 });
    const data = parseResponse(result as any);

    // 페이지네이션: 1건만 반환
    expect(data.contracts.length).toBe(1);
    expect(data.count).toBe(1);

    // summary는 전체 3건 기준
    expect(data.totalCount).toBe(3);
    expect(data.summary.totalContracts).toBe(3);
    expect(data.summary.totalPremium).toBe(380000);
    expect(data.hasMore).toBe(true);
  });

  // ── 시나리오 4: 유효하지 않은 날짜 → 핸들러에서 에러 반환 ──────────
  it('유효하지 않은 날짜 형식으로 핸들러 호출 시 isError: true', async () => {
    const result = await handleListContracts({ contractDateFrom: '2025/06/15' });
    expect((result as any).isError).toBe(true);
    expect((result as any).content[0].text).toContain('계약 조회 실패');
  });

  // ── 시나리오 5: sortBy: 'premium', sortOrder: 'asc' ────────────────
  it('premium asc 정렬 시 보험료 오름차순', async () => {
    const result = await handleListContracts({ sortBy: 'premium', sortOrder: 'asc' });
    const data = parseResponse(result as any);

    // 보험료 순: 30000, 150000, 200000
    expect(data.contracts[0].premium).toBe(30000);
    expect(data.contracts[1].premium).toBe(150000);
    expect(data.contracts[2].premium).toBe(200000);
  });

  it('premium desc 정렬 시 보험료 내림차순', async () => {
    const result = await handleListContracts({ sortBy: 'premium', sortOrder: 'desc' });
    const data = parseResponse(result as any);

    // 보험료 순: 200000, 150000, 30000
    expect(data.contracts[0].premium).toBe(200000);
    expect(data.contracts[1].premium).toBe(150000);
    expect(data.contracts[2].premium).toBe(30000);
  });
});
