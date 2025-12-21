/**
 * Cross-System Test Utilities
 *
 * MCP와 aims_api 간 통합 테스트를 위한 유틸리티 모음
 *
 * 사용 예:
 *   import {
 *     MCPTestClient,
 *     APITestClient,
 *     TestDataFactory,
 *     setupCrossSystemTest,
 *     teardownCrossSystemTest
 *   } from './test-utils/index.js';
 */

// 클라이언트
export { MCPTestClient, mcp, type MCPResponse, type MCPCallOptions } from './mcp-client.js';
export { APITestClient, api, type APIResponse, type APIErrorResponse, type APIRequestOptions } from './api-client.js';

// 테스트 데이터
export {
  TestDataFactory,
  type Customer,
  type Contract,
  type Document,
  type Memo,
  type Relationship
} from './test-data.js';

// 설정 및 유틸리티
export {
  TEST_CONFIG,
  type TestContext,
  checkMCPServer,
  checkAIMSAPIServer,
  checkAllServers,
  skipIfServersUnavailable,
  setupCrossSystemTest,
  teardownCrossSystemTest,
  retry,
  sleep,
  uniqueId,
  isValidObjectId,
  isValidTimestamp,
  isValidMemoTimestamp,
  assertFieldsMatch,
  normalizeId
} from './setup.js';
