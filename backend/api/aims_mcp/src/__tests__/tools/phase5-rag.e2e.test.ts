/**
 * Phase 5 도구 테스트: RAG 검색 도구
 *
 * 테스트 대상:
 * - search_documents_semantic: 시맨틱 문서 검색
 * - get_search_analytics: 검색 품질 통계
 * - get_failed_queries: 실패한 검색 쿼리 분석
 * - submit_search_feedback: 검색 피드백 제출
 *
 * 주의: 이 테스트들은 aims_rag_api 서비스가 실행 중이어야 합니다.
 *
 * 실행 방법:
 *   npm run test:e2e -- --testPathPattern="phase5-rag"
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  MCPTestClient,
  type TestContext,
  setupCrossSystemTest,
  teardownCrossSystemTest,
  checkAllServers
} from '../../test-utils/index.js';

// RAG API 가용성 체크
async function checkRagApiAvailable(): Promise<boolean> {
  try {
    const ragApiUrl = process.env.RAG_API_URL || 'http://localhost:8003';
    const response = await fetch(`${ragApiUrl}/health`, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}

describe('Phase 5: RAG 검색 도구 테스트', () => {
  let ctx: TestContext;
  let mcp: MCPTestClient;
  let serversAvailable = false;
  let ragApiAvailable = false;

  beforeAll(async () => {
    const status = await checkAllServers();
    serversAvailable = status.allAvailable;

    if (!serversAvailable) {
      console.warn(`⚠️ MCP/API 서버 연결 불가. 테스트를 건너뜁니다.`);
      return;
    }

    // RAG API 가용성 체크
    ragApiAvailable = await checkRagApiAvailable();
    if (!ragApiAvailable) {
      console.warn(`⚠️ RAG API(aims_rag_api) 연결 불가. Phase 5 테스트를 건너뜁니다.`);
      return;
    }

    ctx = await setupCrossSystemTest();
    mcp = ctx.mcp;
  });

  afterAll(async () => {
    if (ctx) {
      await teardownCrossSystemTest(ctx);
    }
  });

  // ============================================================
  // 5.1 시맨틱 문서 검색
  // ============================================================

  describe('5.1 시맨틱 문서 검색', () => {
    it('search_documents_semantic: 기본 검색', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.call<{
        query: string;
        mode: string;
        totalResults: number;
        searchTime?: number;
        results: Array<{
          fileId: string;
          fileName: string;
          relevanceScore: number;
          summary: string;
          tags: string[];
          customerName?: string;
        }>;
      }>('search_documents_semantic', {
        query: '보험 계약'
      });

      expect(result.query).toBe('보험 계약');
      expect(result.mode).toBe('semantic');
      expect(typeof result.totalResults).toBe('number');
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('search_documents_semantic: 키워드 모드', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.call<{
        query: string;
        mode: string;
        results: Array<unknown>;
      }>('search_documents_semantic', {
        query: '계약서',
        mode: 'keyword'
      });

      expect(result.mode).toBe('keyword');
    });

    it('search_documents_semantic: 결과 수 제한', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.call<{
        results: Array<unknown>;
      }>('search_documents_semantic', {
        query: '보험',
        limit: 3
      });

      expect(result.results.length).toBeLessThanOrEqual(3);
    });

    it('search_documents_semantic: 빈 쿼리 오류', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.callRaw('search_documents_semantic', {
        query: ''
      });

      expect(result.isError).toBe(true);
    });

    it('search_documents_semantic: 특수 문자 쿼리', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      // 특수 문자가 포함된 쿼리도 처리 가능해야 함
      const result = await mcp.call<{
        query: string;
        totalResults: number;
      }>('search_documents_semantic', {
        query: '보험료 (월납)'
      });

      expect(result.query).toBe('보험료 (월납)');
      expect(typeof result.totalResults).toBe('number');
    });

    it('search_documents_semantic: 긴 쿼리 처리', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const longQuery = '이 고객의 자동차 보험 계약에서 대인배상 및 대물배상 한도액과 자기차량손해 가입 여부를 확인하고 싶습니다';

      const result = await mcp.call<{
        query: string;
        totalResults: number;
      }>('search_documents_semantic', {
        query: longQuery
      });

      expect(result.query).toBe(longQuery);
    });
  });

  // ============================================================
  // 5.1.1 페이지네이션 테스트 (시맨틱 검색)
  // ============================================================

  describe('5.1.1 시맨틱 검색 페이지네이션', () => {
    it('시맨틱 검색: 페이지네이션 필드 존재 확인', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.call<{
        query: string;
        mode: string;
        totalResults: number;
        totalCount: number;
        hasMore: boolean;
        offset: number;
        nextOffset: number | null;
        pagination: string;
        results: Array<unknown>;
      }>('search_documents_semantic', {
        query: '보험',
        mode: 'semantic',
        limit: 5
      });

      // 페이지네이션 필드 존재 확인
      expect(result).toHaveProperty('totalCount');
      expect(result).toHaveProperty('hasMore');
      expect(result).toHaveProperty('offset');
      expect(result).toHaveProperty('nextOffset');
      expect(result).toHaveProperty('pagination');

      // 타입 검증
      expect(typeof result.totalCount).toBe('number');
      expect(typeof result.hasMore).toBe('boolean');
      expect(typeof result.offset).toBe('number');
      expect(typeof result.pagination).toBe('string');
    });

    it('시맨틱 검색: 첫 페이지 offset=0', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.call<{
        offset: number;
        totalResults: number;
        totalCount: number;
        hasMore: boolean;
        nextOffset: number | null;
      }>('search_documents_semantic', {
        query: '보험',
        mode: 'semantic',
        limit: 5,
        offset: 0
      });

      expect(result.offset).toBe(0);
      expect(result.totalResults).toBeLessThanOrEqual(5);

      // hasMore가 true면 nextOffset이 있어야 함
      if (result.hasMore) {
        expect(result.nextOffset).toBe(result.totalResults);
      } else {
        expect(result.nextOffset).toBeNull();
      }
    });

    it('시맨틱 검색: 두 번째 페이지 조회', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      // 첫 페이지 조회
      const firstPage = await mcp.call<{
        totalCount: number;
        hasMore: boolean;
        nextOffset: number | null;
        results: Array<{ fileId: string }>;
      }>('search_documents_semantic', {
        query: '보험',
        mode: 'semantic',
        limit: 3,
        offset: 0
      });

      // 결과가 3개 이상이면 두 번째 페이지 테스트
      if (firstPage.hasMore && firstPage.nextOffset !== null) {
        const secondPage = await mcp.call<{
          offset: number;
          totalResults: number;
          results: Array<{ fileId: string }>;
        }>('search_documents_semantic', {
          query: '보험',
          mode: 'semantic',
          limit: 3,
          offset: firstPage.nextOffset
        });

        expect(secondPage.offset).toBe(firstPage.nextOffset);

        // 첫 페이지와 두 번째 페이지 결과가 다른지 확인
        if (firstPage.results.length > 0 && secondPage.results.length > 0) {
          const firstPageIds = firstPage.results.map(r => r.fileId);
          const secondPageIds = secondPage.results.map(r => r.fileId);

          // 중복 없어야 함
          const hasOverlap = secondPageIds.some(id => firstPageIds.includes(id));
          expect(hasOverlap).toBe(false);
        }
      }
    });

    it('시맨틱 검색: totalCount 일관성', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const firstPage = await mcp.call<{
        totalCount: number;
        hasMore: boolean;
        nextOffset: number | null;
      }>('search_documents_semantic', {
        query: '계약',
        mode: 'semantic',
        limit: 3,
        offset: 0
      });

      if (firstPage.hasMore && firstPage.nextOffset !== null) {
        const secondPage = await mcp.call<{
          totalCount: number;
        }>('search_documents_semantic', {
          query: '계약',
          mode: 'semantic',
          limit: 3,
          offset: firstPage.nextOffset
        });

        // totalCount는 페이지와 관계없이 동일해야 함
        expect(secondPage.totalCount).toBe(firstPage.totalCount);
      }
    });

    it('시맨틱 검색: 마지막 페이지 hasMore=false', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      // 전체 결과 수 확인
      const fullResult = await mcp.call<{
        totalCount: number;
        hasMore: boolean;
      }>('search_documents_semantic', {
        query: '보험',
        mode: 'semantic',
        limit: 50,  // 충분히 큰 수
        offset: 0
      });

      // 모든 결과를 가져왔으면 hasMore는 false여야 함
      if (fullResult.totalCount <= 50) {
        expect(fullResult.hasMore).toBe(false);
      }
    });
  });

  // ============================================================
  // 5.1.2 페이지네이션 테스트 (키워드 검색)
  // ============================================================

  describe('5.1.2 키워드 검색 페이지네이션', () => {
    it('키워드 검색: 페이지네이션 필드 존재 확인', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.call<{
        query: string;
        mode: string;
        totalResults: number;
        totalCount: number;
        hasMore: boolean;
        offset: number;
        nextOffset: number | null;
        pagination: string;
        results: Array<unknown>;
      }>('search_documents_semantic', {
        query: '계약서',
        mode: 'keyword',
        limit: 5
      });

      // 페이지네이션 필드 존재 확인
      expect(result).toHaveProperty('totalCount');
      expect(result).toHaveProperty('hasMore');
      expect(result).toHaveProperty('offset');
      expect(result).toHaveProperty('nextOffset');
      expect(result).toHaveProperty('pagination');

      // 타입 검증
      expect(typeof result.totalCount).toBe('number');
      expect(typeof result.hasMore).toBe('boolean');
    });

    it('키워드 검색: 첫 페이지 offset=0', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.call<{
        offset: number;
        totalResults: number;
        totalCount: number;
        hasMore: boolean;
        nextOffset: number | null;
      }>('search_documents_semantic', {
        query: '계약',
        mode: 'keyword',
        limit: 5,
        offset: 0
      });

      expect(result.offset).toBe(0);
      expect(result.totalResults).toBeLessThanOrEqual(5);

      // hasMore가 true면 nextOffset이 있어야 함
      if (result.hasMore) {
        expect(result.nextOffset).toBe(result.totalResults);
      }
    });

    it('키워드 검색: 두 번째 페이지 조회', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      // 첫 페이지 조회
      const firstPage = await mcp.call<{
        totalCount: number;
        hasMore: boolean;
        nextOffset: number | null;
        results: Array<{ fileId: string }>;
      }>('search_documents_semantic', {
        query: '보험',
        mode: 'keyword',
        limit: 3,
        offset: 0
      });

      // 결과가 더 있으면 두 번째 페이지 테스트
      if (firstPage.hasMore && firstPage.nextOffset !== null) {
        const secondPage = await mcp.call<{
          offset: number;
          totalResults: number;
          results: Array<{ fileId: string }>;
        }>('search_documents_semantic', {
          query: '보험',
          mode: 'keyword',
          limit: 3,
          offset: firstPage.nextOffset
        });

        expect(secondPage.offset).toBe(firstPage.nextOffset);

        // 첫 페이지와 두 번째 페이지 결과가 다른지 확인
        if (firstPage.results.length > 0 && secondPage.results.length > 0) {
          const firstPageIds = firstPage.results.map(r => r.fileId);
          const secondPageIds = secondPage.results.map(r => r.fileId);

          // 중복 없어야 함
          const hasOverlap = secondPageIds.some(id => firstPageIds.includes(id));
          expect(hasOverlap).toBe(false);
        }
      }
    });

    it('키워드 검색: totalCount 일관성', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const firstPage = await mcp.call<{
        totalCount: number;
        hasMore: boolean;
        nextOffset: number | null;
      }>('search_documents_semantic', {
        query: '문서',
        mode: 'keyword',
        limit: 3,
        offset: 0
      });

      if (firstPage.hasMore && firstPage.nextOffset !== null) {
        const secondPage = await mcp.call<{
          totalCount: number;
        }>('search_documents_semantic', {
          query: '문서',
          mode: 'keyword',
          limit: 3,
          offset: firstPage.nextOffset
        });

        // totalCount는 페이지와 관계없이 동일해야 함
        expect(secondPage.totalCount).toBe(firstPage.totalCount);
      }
    });

    it('키워드 검색: 마지막 페이지 hasMore=false', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      // 전체 결과 수 확인
      const fullResult = await mcp.call<{
        totalCount: number;
        hasMore: boolean;
      }>('search_documents_semantic', {
        query: '계약',
        mode: 'keyword',
        limit: 50,  // 충분히 큰 수
        offset: 0
      });

      // 모든 결과를 가져왔으면 hasMore는 false여야 함
      if (fullResult.totalCount <= 50) {
        expect(fullResult.hasMore).toBe(false);
      }
    });

    it('키워드/시맨틱 검색: 동일 쿼리 결과 비교', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const keywordResult = await mcp.call<{
        mode: string;
        totalCount: number;
        hasMore: boolean;
      }>('search_documents_semantic', {
        query: '보험',
        mode: 'keyword',
        limit: 10
      });

      const semanticResult = await mcp.call<{
        mode: string;
        totalCount: number;
        hasMore: boolean;
      }>('search_documents_semantic', {
        query: '보험',
        mode: 'semantic',
        limit: 10
      });

      // 모드가 올바르게 설정되었는지 확인
      expect(keywordResult.mode).toBe('keyword');
      expect(semanticResult.mode).toBe('semantic');

      // 둘 다 페이지네이션 필드가 있어야 함
      expect(typeof keywordResult.totalCount).toBe('number');
      expect(typeof semanticResult.totalCount).toBe('number');
      expect(typeof keywordResult.hasMore).toBe('boolean');
      expect(typeof semanticResult.hasMore).toBe('boolean');
    });
  });

  // ============================================================
  // 5.2 검색 통계
  // ============================================================

  describe('5.2 검색 통계', () => {
    it('get_search_analytics: 기본 통계 조회', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.call<{
        period: string;
        totalSearches: number;
        successRate: string;
        avgResponseTime: string;
        queryTypeDistribution: Record<string, number>;
        rerankImpact: Record<string, unknown>;
        topQueries: string[];
      }>('get_search_analytics', {});

      expect(result).toHaveProperty('period');
      expect(result).toHaveProperty('totalSearches');
      expect(result).toHaveProperty('successRate');
      expect(result).toHaveProperty('avgResponseTime');
      expect(typeof result.totalSearches).toBe('number');
    });

    it('get_search_analytics: 기간 지정', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.call<{
        period: string;
      }>('get_search_analytics', {
        days: 7
      });

      expect(result.period).toBe('최근 7일');
    });

    it('get_search_analytics: 최대 기간', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.call<{
        period: string;
      }>('get_search_analytics', {
        days: 90
      });

      expect(result.period).toBe('최근 90일');
    });
  });

  // ============================================================
  // 5.3 실패한 검색 쿼리
  // ============================================================

  describe('5.3 실패한 검색 쿼리', () => {
    it('get_failed_queries: 기본 조회', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.call<{
        totalFailedQueries: number;
        queries: Array<{
          query: string;
          failCount: number;
          lastFailedAt: string;
          reason: string;
        }>;
        suggestion: string;
      }>('get_failed_queries', {});

      expect(result).toHaveProperty('totalFailedQueries');
      expect(Array.isArray(result.queries)).toBe(true);
      expect(result).toHaveProperty('suggestion');
    });

    it('get_failed_queries: 개수 제한', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.call<{
        queries: Array<unknown>;
      }>('get_failed_queries', {
        limit: 5
      });

      expect(result.queries.length).toBeLessThanOrEqual(5);
    });
  });

  // ============================================================
  // 5.4 검색 피드백
  // ============================================================

  describe('5.4 검색 피드백', () => {
    it('submit_search_feedback: 피드백 제출', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      // 먼저 검색을 수행하여 queryId를 얻어야 하지만,
      // 현재 API가 queryId를 반환하지 않으므로 가상 ID로 테스트
      const result = await mcp.call<{
        success: boolean;
        queryId: string;
        rating: number;
        message: string;
      }>('submit_search_feedback', {
        queryId: 'test-query-id-123',
        rating: 4,
        comment: '검색 결과가 유용했습니다'
      });

      expect(result.success).toBe(true);
      expect(result.rating).toBe(4);
      expect(result.message).toContain('피드백');
    });

    it('submit_search_feedback: 최소 평점', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.call<{
        rating: number;
      }>('submit_search_feedback', {
        queryId: 'test-query-id-456',
        rating: 1
      });

      expect(result.rating).toBe(1);
    });

    it('submit_search_feedback: 최대 평점', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.call<{
        rating: number;
      }>('submit_search_feedback', {
        queryId: 'test-query-id-789',
        rating: 5,
        comment: '완벽한 검색 결과!'
      });

      expect(result.rating).toBe(5);
    });

    it('submit_search_feedback: 범위 초과 평점 오류', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.callRaw('submit_search_feedback', {
        queryId: 'test-query-id',
        rating: 6  // 범위 초과
      });

      expect(result.isError).toBe(true);
    });

    it('submit_search_feedback: queryId 누락 오류', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.callRaw('submit_search_feedback', {
        rating: 3
      });

      expect(result.isError).toBe(true);
    });
  });
});
