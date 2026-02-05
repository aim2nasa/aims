/**
 * AI Usage Service Unit Tests
 * @since 2026-02-05
 *
 * 테스트 범위:
 * 1. getMyAIUsage - AI 사용량 조회
 * 2. getMyDailyUsage - 일별 사용량 조회
 * 3. formatTokens - 토큰 수 포맷팅
 * 4. formatCost - 비용 포맷팅
 *
 * @see docs/EMBEDDING_CREDIT_POLICY.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getMyAIUsage,
  getMyDailyUsage,
  formatTokens,
  formatCost,
  type AIUsageData,
  type DailyUsagePoint,
} from '../aiUsageService';

// Mock api
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}));

import { api } from '@/shared/lib/api';

const mockApi = api as { get: ReturnType<typeof vi.fn> };

describe('aiUsageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =============================================================================
  // 1. getMyAIUsage 테스트
  // =============================================================================

  describe('getMyAIUsage', () => {
    const mockUsageData: AIUsageData = {
      period_days: 30,
      total_tokens: 150000,
      prompt_tokens: 100000,
      completion_tokens: 50000,
      estimated_cost_usd: 0.75,
      request_count: 120,
      by_source: {
        rag_api: 80000,
        n8n_docsummary: 70000,
      },
    };

    it('기본 30일 기간으로 AI 사용량을 조회해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: mockUsageData,
      });

      const result = await getMyAIUsage();

      expect(mockApi.get).toHaveBeenCalledWith('/api/users/me/ai-usage?days=30');
      expect(result).toEqual(mockUsageData);
    });

    it('커스텀 기간으로 AI 사용량을 조회해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: mockUsageData,
      });

      await getMyAIUsage(7);

      expect(mockApi.get).toHaveBeenCalledWith('/api/users/me/ai-usage?days=7');
    });

    it('응답 실패 시 에러를 throw해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: false,
      });

      await expect(getMyAIUsage()).rejects.toThrow('AI 사용량 조회 실패');
    });

    it('total_tokens, prompt_tokens, completion_tokens를 올바르게 반환해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: mockUsageData,
      });

      const result = await getMyAIUsage();

      expect(result.total_tokens).toBe(150000);
      expect(result.prompt_tokens).toBe(100000);
      expect(result.completion_tokens).toBe(50000);
    });

    it('by_source 분류를 올바르게 반환해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: mockUsageData,
      });

      const result = await getMyAIUsage();

      expect(result.by_source.rag_api).toBe(80000);
      expect(result.by_source.n8n_docsummary).toBe(70000);
    });

    it('estimated_cost_usd를 올바르게 반환해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: mockUsageData,
      });

      const result = await getMyAIUsage();

      expect(result.estimated_cost_usd).toBe(0.75);
    });

    it('request_count를 올바르게 반환해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: mockUsageData,
      });

      const result = await getMyAIUsage();

      expect(result.request_count).toBe(120);
    });
  });

  // =============================================================================
  // 2. getMyDailyUsage 테스트
  // =============================================================================

  describe('getMyDailyUsage', () => {
    const mockDailyData: DailyUsagePoint[] = [
      {
        date: '2026-02-01',
        total_tokens: 5000,
        estimated_cost_usd: 0.025,
        request_count: 10,
      },
      {
        date: '2026-02-02',
        total_tokens: 7500,
        estimated_cost_usd: 0.0375,
        request_count: 15,
      },
    ];

    it('기본 30일 기간으로 일별 사용량을 조회해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: mockDailyData,
      });

      const result = await getMyDailyUsage();

      expect(mockApi.get).toHaveBeenCalledWith('/api/users/me/ai-usage/daily?days=30');
      expect(result).toEqual(mockDailyData);
    });

    it('커스텀 기간으로 일별 사용량을 조회해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: mockDailyData,
      });

      await getMyDailyUsage(14);

      expect(mockApi.get).toHaveBeenCalledWith('/api/users/me/ai-usage/daily?days=14');
    });

    it('응답 실패 시 에러를 throw해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: false,
      });

      await expect(getMyDailyUsage()).rejects.toThrow('일별 AI 사용량 조회 실패');
    });

    it('빈 결과를 처리해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await getMyDailyUsage();

      expect(result).toEqual([]);
    });

    it('날짜별 데이터를 올바르게 반환해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: mockDailyData,
      });

      const result = await getMyDailyUsage();

      expect(result[0].date).toBe('2026-02-01');
      expect(result[1].date).toBe('2026-02-02');
    });
  });

  // =============================================================================
  // 3. formatTokens 테스트 (크레딧 관련 - 중요!)
  // =============================================================================

  describe('formatTokens', () => {
    describe('100만 이상 (M 단위)', () => {
      it('1,000,000 토큰 → 1.00M', () => {
        expect(formatTokens(1000000)).toBe('1.00M');
      });

      it('1,500,000 토큰 → 1.50M', () => {
        expect(formatTokens(1500000)).toBe('1.50M');
      });

      it('10,000,000 토큰 → 10.00M', () => {
        expect(formatTokens(10000000)).toBe('10.00M');
      });

      it('1,234,567 토큰 → 1.23M (소수점 2자리)', () => {
        expect(formatTokens(1234567)).toBe('1.23M');
      });
    });

    describe('1000 이상 100만 미만 (K 단위)', () => {
      it('1,000 토큰 → 1.0K', () => {
        expect(formatTokens(1000)).toBe('1.0K');
      });

      it('1,500 토큰 → 1.5K', () => {
        expect(formatTokens(1500)).toBe('1.5K');
      });

      it('999,999 토큰 → 1000.0K', () => {
        expect(formatTokens(999999)).toBe('1000.0K');
      });

      it('12,345 토큰 → 12.3K (소수점 1자리)', () => {
        expect(formatTokens(12345)).toBe('12.3K');
      });
    });

    describe('1000 미만 (원본)', () => {
      it('999 토큰 → 999', () => {
        expect(formatTokens(999)).toBe('999');
      });

      it('0 토큰 → 0', () => {
        expect(formatTokens(0)).toBe('0');
      });

      it('1 토큰 → 1', () => {
        expect(formatTokens(1)).toBe('1');
      });

      it('500 토큰 → 500', () => {
        expect(formatTokens(500)).toBe('500');
      });
    });

    describe('경계값 테스트', () => {
      it('999 → 999 (K 경계 미만)', () => {
        expect(formatTokens(999)).toBe('999');
      });

      it('1000 → 1.0K (K 경계)', () => {
        expect(formatTokens(1000)).toBe('1.0K');
      });

      it('999999 → 1000.0K (M 경계 미만)', () => {
        expect(formatTokens(999999)).toBe('1000.0K');
      });

      it('1000000 → 1.00M (M 경계)', () => {
        expect(formatTokens(1000000)).toBe('1.00M');
      });
    });
  });

  // =============================================================================
  // 4. formatCost 테스트 (과금 관련 - 중요!)
  // =============================================================================

  describe('formatCost', () => {
    describe('0.01 미만 (6자리 소수점)', () => {
      it('$0.001 → $0.001000', () => {
        expect(formatCost(0.001)).toBe('$0.001000');
      });

      it('$0.000001 → $0.000001', () => {
        expect(formatCost(0.000001)).toBe('$0.000001');
      });

      it('$0.009999 → $0.009999', () => {
        expect(formatCost(0.009999)).toBe('$0.009999');
      });

      it('$0 → $0.000000', () => {
        expect(formatCost(0)).toBe('$0.000000');
      });
    });

    describe('0.01 이상 (4자리 소수점)', () => {
      it('$0.01 → $0.0100', () => {
        expect(formatCost(0.01)).toBe('$0.0100');
      });

      it('$0.10 → $0.1000', () => {
        expect(formatCost(0.1)).toBe('$0.1000');
      });

      it('$1.00 → $1.0000', () => {
        expect(formatCost(1)).toBe('$1.0000');
      });

      it('$1.2345 → $1.2345', () => {
        expect(formatCost(1.2345)).toBe('$1.2345');
      });

      it('$10.50 → $10.5000', () => {
        expect(formatCost(10.5)).toBe('$10.5000');
      });
    });

    describe('경계값 테스트', () => {
      it('$0.009999 → $0.009999 (경계 미만)', () => {
        expect(formatCost(0.009999)).toBe('$0.009999');
      });

      it('$0.01 → $0.0100 (경계)', () => {
        expect(formatCost(0.01)).toBe('$0.0100');
      });
    });

    describe('정밀도 테스트 (과금 정확성 중요!)', () => {
      it('매우 작은 금액 정확히 표시: $0.000123', () => {
        expect(formatCost(0.000123)).toBe('$0.000123');
      });

      it('API 호출 1회 예상 비용: $0.0015', () => {
        expect(formatCost(0.0015)).toBe('$0.001500');
      });

      it('1000 토큰 예상 비용 (gpt-4o-mini): $0.00015', () => {
        expect(formatCost(0.00015)).toBe('$0.000150');
      });
    });
  });
});
