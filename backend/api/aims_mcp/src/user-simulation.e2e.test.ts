/**
 * 실제 사용자 시뮬레이션 E2E 테스트
 *
 * AI 어시스턴트가 MCP 도구를 사용하는 실제 시나리오를 테스트합니다.
 * 이 테스트는 실제 MCP 서버에 HTTP 요청을 보내 결과를 검증합니다.
 *
 * 실행 방법:
 *   # 로컬 서버 테스트 (localhost:3011)
 *   npm run test:e2e
 *
 *   # 원격 서버 테스트 (SSH 터널 필요)
 *   ssh -L 3011:localhost:3011 tars.giize.com -N &
 *   npm run test:e2e
 *
 *   # 원격 서버 직접 테스트
 *   MCP_URL=http://tars.giize.com:3011 npm run test:e2e
 *
 * 주의:
 *   - MCP 서버가 실행 중이어야 합니다
 *   - 서버 연결 불가 시 테스트가 자동 스킵됩니다
 */

import { describe, it, expect, beforeAll } from 'vitest';

// ============================================================
// 테스트 환경 설정
// ============================================================

const MCP_URL = process.env.MCP_URL || 'http://localhost:3011';
const TEST_USER_ID = '000000000000000000000001';
const TIMEOUT_MS = 15000;

// ============================================================
// 헬퍼 함수
// ============================================================

interface MCPResponse {
  success: boolean;
  error?: string;
  result?: {
    isError?: boolean;
    content: Array<{
      type: string;
      text: string;
    }>;
  };
}

/**
 * MCP 도구 호출
 */
async function callTool(tool: string, args: object = {}): Promise<MCPResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${MCP_URL}/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': TEST_USER_ID
      },
      body: JSON.stringify({ tool, arguments: args }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return await res.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * 응답에서 데이터 파싱
 */
function parseResult(response: MCPResponse): unknown {
  if (!response.success) {
    throw new Error(response.error || 'Unknown error');
  }
  const text = response.result?.content?.[0]?.text;
  if (!text) {
    throw new Error('Empty response');
  }
  return JSON.parse(text);
}

/**
 * 응답이 에러인지 확인
 */
function isErrorResponse(response: MCPResponse): boolean {
  return response.result?.isError === true;
}

/**
 * 에러 메시지 추출
 */
function getErrorMessage(response: MCPResponse): string {
  const text = response.result?.content?.[0]?.text || '';
  return text;
}

/**
 * 서버 연결 확인
 */
async function checkServerHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${MCP_URL}/health`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}

// ============================================================
// 테스트
// ============================================================

describe('실제 사용자 시뮬레이션 E2E', () => {
  let serverAvailable = false;

  // 서버 연결 확인
  beforeAll(async () => {
    serverAvailable = await checkServerHealth();
    if (!serverAvailable) {
      console.warn(`⚠️ MCP 서버 (${MCP_URL})에 연결할 수 없습니다. 테스트를 건너뜁니다.`);
    }
  });

  // --------------------------------------------------------
  // 1. 고객 관리 시나리오
  // --------------------------------------------------------
  describe('고객 관리', () => {
    it('사용자: "전체 고객 목록 보여줘"', async () => {
      if (!serverAvailable) return;
      const res = await callTool('search_customers', {});

      expect(res.success).toBe(true);
      expect(isErrorResponse(res)).toBe(false);

      const data = parseResult(res) as { count: number; totalCount: number; customers: unknown[] };
      expect(data.count).toBeGreaterThanOrEqual(0);
      expect(data.totalCount).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(data.customers)).toBe(true);
    });

    it('사용자: "홍길동 고객 찾아줘"', async () => {
      if (!serverAvailable) return;
      const res = await callTool('search_customers', { query: '홍길동' });

      expect(res.success).toBe(true);
      expect(isErrorResponse(res)).toBe(false);

      const data = parseResult(res) as { count: number; customers: unknown[] };
      expect(typeof data.count).toBe('number');
      expect(Array.isArray(data.customers)).toBe(true);
    });

    it('사용자: "법인 고객만 보여줘"', async () => {
      if (!serverAvailable) return;
      const res = await callTool('search_customers', { customerType: '법인' });

      expect(res.success).toBe(true);
      expect(isErrorResponse(res)).toBe(false);

      const data = parseResult(res) as { customers: Array<{ type: string }> };
      // 결과가 있으면 모두 법인이어야 함
      data.customers.forEach(c => {
        if (c.type) {
          expect(c.type).toBe('법인');
        }
      });
    });

    it('사용자: "잘못된 ID로 고객 조회"', async () => {
      if (!serverAvailable) return;
      const res = await callTool('get_customer', { customerId: 'invalid-id' });

      expect(res.success).toBe(true);
      expect(isErrorResponse(res)).toBe(true);

      const errorMsg = getErrorMessage(res);
      expect(errorMsg).toContain('유효하지 않은');
    });

    it('사용자: "필수 정보 없이 고객 등록" (에러 예상)', async () => {
      if (!serverAvailable) return;
      const res = await callTool('create_customer', {});

      expect(res.success).toBe(true);
      expect(isErrorResponse(res)).toBe(true);

      const errorMsg = getErrorMessage(res);
      expect(errorMsg).toContain('이름');
      expect(errorMsg).toContain('입력');
    });
  });

  // --------------------------------------------------------
  // 2. 계약 관리 시나리오
  // --------------------------------------------------------
  describe('계약 관리', () => {
    it('사용자: "내 계약 목록 보여줘"', async () => {
      if (!serverAvailable) return;
      const res = await callTool('list_contracts', {});

      expect(res.success).toBe(true);
      expect(isErrorResponse(res)).toBe(false);

      const data = parseResult(res) as { count: number; contracts: unknown[] };
      expect(data.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(data.contracts)).toBe(true);
    });

    it('사용자: "30일 이내 만기 예정 계약 찾아줘"', async () => {
      if (!serverAvailable) return;
      const res = await callTool('find_expiring_contracts', { daysWithin: 30 });

      expect(res.success).toBe(true);
      expect(isErrorResponse(res)).toBe(false);

      const data = parseResult(res) as { count: number; note: string; contracts: unknown[] };
      expect(data.count).toBeGreaterThanOrEqual(0);
      expect(data.note).toContain('종신');
      expect(Array.isArray(data.contracts)).toBe(true);
    });

    it('사용자: "12월에 생일인 고객 찾아줘"', async () => {
      if (!serverAvailable) return;
      const res = await callTool('find_birthday_customers', { month: 12 });

      expect(res.success).toBe(true);
      expect(isErrorResponse(res)).toBe(false);

      const data = parseResult(res) as { count: number; customers: unknown[] };
      expect(data.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(data.customers)).toBe(true);
    });

    it('사용자: "잘못된 ID로 계약 상세 조회"', async () => {
      if (!serverAvailable) return;
      const res = await callTool('get_contract_details', { contractId: 'invalid-id' });

      expect(res.success).toBe(true);
      expect(isErrorResponse(res)).toBe(true);

      const errorMsg = getErrorMessage(res);
      expect(errorMsg).toContain('유효하지 않은');
    });
  });

  // --------------------------------------------------------
  // 3. 문서/메모 시나리오
  // --------------------------------------------------------
  describe('문서/메모', () => {
    it('사용자: "보험증권 관련 문서 찾아줘"', async () => {
      if (!serverAvailable) return;
      const res = await callTool('search_documents', { query: '보험증권' });

      expect(res.success).toBe(true);
      expect(isErrorResponse(res)).toBe(false);

      const data = parseResult(res) as { documents: unknown[] };
      expect(Array.isArray(data.documents)).toBe(true);
    });

    it('사용자: "메모 추가해줘" (정보 부족 - 에러 예상)', async () => {
      if (!serverAvailable) return;
      const res = await callTool('add_customer_memo', {});

      expect(res.success).toBe(true);
      expect(isErrorResponse(res)).toBe(true);

      const errorMsg = getErrorMessage(res);
      // 고객 ID와 내용 둘 다 필요
      expect(errorMsg).toContain('입력');
    });

    it('사용자: "잘못된 메모 삭제" (에러 예상 - 기능 deprecated)', async () => {
      if (!serverAvailable) return;
      const res = await callTool('delete_customer_memo', { memoId: 'invalid-id' });

      expect(res.success).toBe(true);
      expect(isErrorResponse(res)).toBe(true);

      // delete_customer_memo는 deprecated - 지원 중단 메시지 반환
      const errorMsg = getErrorMessage(res);
      expect(errorMsg).toMatch(/더 이상 지원되지 않습니다/);
    });
  });

  // --------------------------------------------------------
  // 4. 통계/분석 시나리오
  // --------------------------------------------------------
  describe('통계/분석', () => {
    it('사용자: "전체 현황 요약해줘"', async () => {
      if (!serverAvailable) return;
      const res = await callTool('get_statistics', {});

      expect(res.success).toBe(true);
      expect(isErrorResponse(res)).toBe(false);

      const data = parseResult(res) as {
        type: string;
        customers: { total: number };
        contracts: { total: number };
      };
      expect(data.type).toBe('summary');
      expect(typeof data.customers.total).toBe('number');
      expect(typeof data.contracts.total).toBe('number');
    });

    it('사용자: "월별 신규 현황 보여줘"', async () => {
      if (!serverAvailable) return;
      const res = await callTool('get_statistics', { type: 'monthly_new' });

      expect(res.success).toBe(true);
      expect(isErrorResponse(res)).toBe(false);

      const data = parseResult(res) as {
        type: string;
        period: string;
        customers: unknown[];
        contracts: unknown[];
      };
      expect(data.type).toBe('monthly_new');
      expect(data.period).toContain('6개월');
      expect(Array.isArray(data.customers)).toBe(true);
      expect(Array.isArray(data.contracts)).toBe(true);
    });

    it('사용자: "잘못된 고객 네트워크 조회"', async () => {
      if (!serverAvailable) return;
      const res = await callTool('get_customer_network', { customerId: 'invalid-id' });

      expect(res.success).toBe(true);
      expect(isErrorResponse(res)).toBe(true);

      const errorMsg = getErrorMessage(res);
      expect(errorMsg).toContain('유효하지 않은');
    });
  });

  // --------------------------------------------------------
  // 5. 상품 조회 시나리오
  // --------------------------------------------------------
  describe('상품 조회', () => {
    it('사용자: "암보험 상품 찾아줘"', async () => {
      if (!serverAvailable) return;
      const res = await callTool('search_products', { query: '암보험' });

      expect(res.success).toBe(true);
      expect(isErrorResponse(res)).toBe(false);

      const data = parseResult(res) as { count: number; products: unknown[] };
      expect(data.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(data.products)).toBe(true);
    });

    it('사용자: "삼성생명 상품만 보여줘"', async () => {
      if (!serverAvailable) return;
      const res = await callTool('search_products', { insurerName: '삼성' });

      expect(res.success).toBe(true);
      expect(isErrorResponse(res)).toBe(false);

      const data = parseResult(res) as { products: Array<{ insurerName: string }> };
      // 결과가 있으면 삼성 포함해야 함
      data.products.forEach(p => {
        if (p.insurerName) {
          expect(p.insurerName.toLowerCase()).toContain('삼성');
        }
      });
    });
  });

  // --------------------------------------------------------
  // 6. 에러 처리 시나리오
  // --------------------------------------------------------
  describe('에러 처리', () => {
    it('필수 필드 누락 시 한글 에러 메시지', async () => {
      if (!serverAvailable) return;
      const res = await callTool('get_customer', {});

      expect(res.success).toBe(true);
      expect(isErrorResponse(res)).toBe(true);

      const errorMsg = getErrorMessage(res);
      expect(errorMsg).toContain('입력');
      // 기술 용어 노출 금지
      expect(errorMsg).not.toContain('Required');
      expect(errorMsg).not.toContain('undefined');
    });

    it('잘못된 이메일 형식 에러', async () => {
      if (!serverAvailable) return;
      const res = await callTool('create_customer', {
        name: '테스트',
        email: 'invalid-email'
      });

      expect(res.success).toBe(true);
      expect(isErrorResponse(res)).toBe(true);

      const errorMsg = getErrorMessage(res);
      expect(errorMsg).toContain('이메일');
    });

    it('존재하지 않는 고객 조회', async () => {
      if (!serverAvailable) return;
      // 유효한 ObjectId 형식이지만 존재하지 않는 ID
      const res = await callTool('get_customer', {
        customerId: '507f1f77bcf86cd799439011'
      });

      expect(res.success).toBe(true);
      expect(isErrorResponse(res)).toBe(true);

      const errorMsg = getErrorMessage(res);
      expect(errorMsg).toContain('찾을 수 없');
    });

    it('잘못된 고객 유형', async () => {
      if (!serverAvailable) return;
      const res = await callTool('search_customers', {
        customerType: '기타' as '개인' | '법인'
      });

      expect(res.success).toBe(true);
      expect(isErrorResponse(res)).toBe(true);

      const errorMsg = getErrorMessage(res);
      expect(errorMsg).toContain('올바르지 않');
    });
  });

  // --------------------------------------------------------
  // 7. 복합 시나리오
  // --------------------------------------------------------
  describe('복합 시나리오', () => {
    it('사용자: "서울 지역 개인 고객 중 활성 상태인 고객"', async () => {
      if (!serverAvailable) return;
      const res = await callTool('search_customers', {
        customerType: '개인',
        status: 'active',
        region: '서울'
      });

      expect(res.success).toBe(true);
      expect(isErrorResponse(res)).toBe(false);

      const data = parseResult(res) as { customers: unknown[] };
      expect(Array.isArray(data.customers)).toBe(true);
    });

    it('사용자: "계약 검색 - 특정 상품명 포함"', async () => {
      if (!serverAvailable) return;
      const res = await callTool('list_contracts', {
        search: '종신보험'
      });

      expect(res.success).toBe(true);
      expect(isErrorResponse(res)).toBe(false);

      const data = parseResult(res) as { contracts: unknown[] };
      expect(Array.isArray(data.contracts)).toBe(true);
    });

    it('사용자: "1년 내 만기 계약 전체 조회"', async () => {
      if (!serverAvailable) return;
      const res = await callTool('find_expiring_contracts', { daysWithin: 365 });

      expect(res.success).toBe(true);
      expect(isErrorResponse(res)).toBe(false);

      const data = parseResult(res) as {
        description: string;
        count: number;
        contracts: Array<{ daysLeft: number }>;
      };
      expect(data.description).toContain('365');
      // 모든 계약이 365일 이내
      data.contracts.forEach(c => {
        expect(c.daysLeft).toBeLessThanOrEqual(365);
        expect(c.daysLeft).toBeGreaterThanOrEqual(0);
      });
    });
  });

  // --------------------------------------------------------
  // 8. MCP-프론트엔드 통합 검증
  // NOTE: aims_api에서 ALLOW_TEST_AUTH=true 환경변수 설정 필요
  //       이 설정이 없으면 x-user-id 헤더 인증이 거부됨
  // --------------------------------------------------------
  describe('MCP-프론트엔드 데이터 일관성', () => {
    const AIMS_API_URL = process.env.AIMS_API_URL || 'http://localhost:3010';

    /**
     * aims_api를 통해 고객 조회 (프론트엔드가 사용하는 API)
     */
    async function getCustomerFromAPI(customerId: string): Promise<{ memo?: string } | null> {
      try {
        const res = await fetch(`${AIMS_API_URL}/api/customers/${customerId}`, {
          headers: { 'x-user-id': TEST_USER_ID },
          signal: AbortSignal.timeout(10000)
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.success ? data.data : null;
      } catch {
        return null;
      }
    }

    it('MCP로 추가한 메모가 프론트엔드 API에서 조회 가능해야 함', async () => {
      if (!serverAvailable) return;
      // 1. 고객 검색으로 테스트 대상 찾기
      const searchRes = await callTool('search_customers', { limit: 1 });
      expect(searchRes.success).toBe(true);

      const searchData = parseResult(searchRes) as { customers: Array<{ id: string; name: string }> };
      if (searchData.customers.length === 0) {
        console.warn('테스트할 고객이 없습니다. 스킵합니다.');
        return;
      }

      const testCustomer = searchData.customers[0];
      const testMemoContent = `E2E 통합테스트 ${Date.now()}`;

      // 2. MCP로 메모 추가
      const addRes = await callTool('add_customer_memo', {
        customerId: testCustomer.id,
        content: testMemoContent
      });
      expect(addRes.success).toBe(true);
      expect(isErrorResponse(addRes)).toBe(false);

      // 3. 프론트엔드 API로 고객 조회
      const customer = await getCustomerFromAPI(testCustomer.id);

      // 4. memo 필드에 추가된 내용이 있는지 검증
      expect(customer).not.toBeNull();
      expect(customer?.memo).toBeDefined();
      expect(customer?.memo).toContain(testMemoContent);
    });

    it('MCP 메모 조회 결과가 프론트엔드 API와 일치해야 함', async () => {
      if (!serverAvailable) return;
      // 1. 고객 검색
      const searchRes = await callTool('search_customers', { limit: 1 });
      const searchData = parseResult(searchRes) as { customers: Array<{ id: string }> };
      if (searchData.customers.length === 0) return;

      const customerId = searchData.customers[0].id;

      // 2. MCP로 메모 조회
      const mcpRes = await callTool('list_customer_memos', { customerId });
      expect(mcpRes.success).toBe(true);
      const mcpData = parseResult(mcpRes) as { memo: string };

      // 3. 프론트엔드 API로 고객 조회
      const customer = await getCustomerFromAPI(customerId);

      // 4. 동일한 데이터인지 검증
      expect(customer?.memo || '').toBe(mcpData.memo);
    });
  });
});
