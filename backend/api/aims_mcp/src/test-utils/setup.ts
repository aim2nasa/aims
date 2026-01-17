/**
 * Cross-System Test Setup
 *
 * E2E 테스트 환경 설정 및 유틸리티
 *
 * 사용 예:
 *   import { setupCrossSystemTest, teardownCrossSystemTest, skipIfServersUnavailable } from './test-utils/setup.js';
 *
 *   describe('Cross-System Tests', () => {
 *     let context: TestContext;
 *
 *     beforeAll(async () => {
 *       await skipIfServersUnavailable();
 *       context = await setupCrossSystemTest();
 *     });
 *
 *     afterAll(async () => {
 *       await teardownCrossSystemTest(context);
 *     });
 *   });
 */

import { MCPTestClient } from './mcp-client.js';
import { APITestClient } from './api-client.js';
import { TestDataFactory } from './test-data.js';

// ============================================================
// 환경 설정
// ============================================================

// Tailscale VPN 경유 원격 서버 (개발 환경 기본값)
export const TEST_CONFIG = {
  MCP_URL: process.env.MCP_URL || 'http://100.110.215.65:3011',
  AIMS_API_URL: process.env.AIMS_API_URL || 'http://100.110.215.65:3010',
  RAG_API_URL: process.env.RAG_API_URL || 'http://100.110.215.65:8000',
  TEST_USER_ID: process.env.TEST_USER_ID || '000000000000000000000001',
  TEST_USER_ID_B: process.env.TEST_USER_ID_B || '000000000000000000000002',
  TIMEOUT_MS: parseInt(process.env.TEST_TIMEOUT || '15000', 10)
};

// ============================================================
// 테스트 컨텍스트
// ============================================================

export interface TestContext {
  mcp: MCPTestClient;
  api: APITestClient;
  factory: TestDataFactory;
  mcpAsUserB: MCPTestClient;
  apiAsUserB: APITestClient;
}

// ============================================================
// 서버 상태 확인
// ============================================================

/**
 * MCP 서버 상태 확인
 */
export async function checkMCPServer(): Promise<boolean> {
  const client = new MCPTestClient(TEST_CONFIG.MCP_URL);
  return await client.checkHealth();
}

/**
 * aims_api 서버 상태 확인
 */
export async function checkAIMSAPIServer(): Promise<boolean> {
  const client = new APITestClient(TEST_CONFIG.AIMS_API_URL);
  return await client.checkHealth();
}

/**
 * RAG API 서버 상태 확인
 */
export async function checkRAGServer(): Promise<boolean> {
  try {
    const res = await fetch(`${TEST_CONFIG.RAG_API_URL}/health`, {
      signal: AbortSignal.timeout(5000)
    });
    const data = await res.json() as { status?: string };
    return data.status === 'healthy';
  } catch {
    return false;
  }
}

/**
 * 모든 서버 사용 가능한지 확인
 */
export async function checkAllServers(): Promise<{
  mcp: boolean;
  api: boolean;
  rag: boolean;
  allAvailable: boolean;
}> {
  const [mcp, api, rag] = await Promise.all([
    checkMCPServer(),
    checkAIMSAPIServer(),
    checkRAGServer()
  ]);
  return {
    mcp,
    api,
    rag,
    allAvailable: mcp && api
  };
}

/**
 * 서버가 사용 불가능하면 테스트 스킵
 */
export async function skipIfServersUnavailable(): Promise<void> {
  const status = await checkAllServers();

  if (!status.allAvailable) {
    const unavailable: string[] = [];
    if (!status.mcp) unavailable.push(`MCP (${TEST_CONFIG.MCP_URL})`);
    if (!status.api) unavailable.push(`aims_api (${TEST_CONFIG.AIMS_API_URL})`);

    console.warn(`⚠️ 다음 서버에 연결할 수 없어 테스트를 건너뜁니다: ${unavailable.join(', ')}`);

    // vitest의 skip 기능 사용
    throw new Error(`SKIP: Servers unavailable - ${unavailable.join(', ')}`);
  }
}

// ============================================================
// 테스트 설정/해제
// ============================================================

/**
 * Cross-system 테스트 환경 설정
 */
export async function setupCrossSystemTest(): Promise<TestContext> {
  const mcp = new MCPTestClient(TEST_CONFIG.MCP_URL, TEST_CONFIG.TEST_USER_ID);
  const api = new APITestClient(TEST_CONFIG.AIMS_API_URL, TEST_CONFIG.TEST_USER_ID);
  const factory = new TestDataFactory(mcp, api);

  const mcpAsUserB = new MCPTestClient(TEST_CONFIG.MCP_URL, TEST_CONFIG.TEST_USER_ID_B);
  const apiAsUserB = new APITestClient(TEST_CONFIG.AIMS_API_URL, TEST_CONFIG.TEST_USER_ID_B);

  return {
    mcp,
    api,
    factory,
    mcpAsUserB,
    apiAsUserB
  };
}

/**
 * Cross-system 테스트 환경 해제 및 데이터 정리
 */
export async function teardownCrossSystemTest(context: TestContext): Promise<void> {
  if (context.factory) {
    await context.factory.cleanup();
  }
}

// ============================================================
// 테스트 유틸리티
// ============================================================

/**
 * 비동기 작업 재시도
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; delayMs?: number; shouldRetry?: (error: Error) => boolean } = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000, shouldRetry = () => true } = options;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries || !shouldRetry(lastError)) {
        throw lastError;
      }

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError || new Error('Retry failed');
}

/**
 * 일정 시간 대기
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 고유한 테스트 식별자 생성
 */
export function uniqueId(prefix: string = 'test'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * ObjectId 형식 검증
 */
export function isValidObjectId(id: string): boolean {
  return /^[0-9a-f]{24}$/i.test(id);
}

/**
 * 날짜 형식 검증 (YYYY.MM.DD HH:mm)
 */
export function isValidTimestamp(timestamp: string): boolean {
  return /^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}$/.test(timestamp);
}

/**
 * 메모 타임스탬프 형식 검증 ([YYYY.MM.DD HH:mm])
 */
export function isValidMemoTimestamp(memo: string): boolean {
  return /\[\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}\]/.test(memo);
}

// ============================================================
// 단언 헬퍼
// ============================================================

/**
 * 두 객체의 주요 필드가 일치하는지 확인
 */
export function assertFieldsMatch(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  fields: string[]
): void {
  for (const field of fields) {
    const actualValue = actual[field];
    const expectedValue = expected[field];

    if (actualValue !== expectedValue) {
      throw new Error(
        `Field '${field}' mismatch: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`
      );
    }
  }
}

/**
 * ID 필드 정규화 (id 또는 _id)
 */
export function normalizeId(obj: { id?: string; _id?: string }): string {
  const id = obj.id || obj._id;
  if (!id) {
    throw new Error('Object has no id or _id field');
  }
  return id;
}
