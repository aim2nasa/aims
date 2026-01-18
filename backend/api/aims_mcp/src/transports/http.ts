import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { setCurrentUserId, getUserIdFromAuth } from '../auth.js';
import { allToolDefinitions } from '../tools/index.js';
import { sendErrorLog } from '../systemLogger.js';

const PORT = parseInt(process.env.MCP_PORT || '3011', 10);

// Tool 핸들러 동적 import
let toolHandlers: Record<string, (args: unknown) => Promise<unknown>> = {};

async function loadToolHandlers() {
  // Core tools
  const customers = await import('../tools/customers.js');
  const contracts = await import('../tools/contracts.js');
  const birthdays = await import('../tools/birthdays.js');
  const network = await import('../tools/network.js');
  const documents = await import('../tools/documents.js');
  const memos = await import('../tools/memos.js');
  const products = await import('../tools/products.js');
  // Phase 1: 액션 도구
  const relationships = await import('../tools/relationships.js');
  // Phase 2: Annual Report 도구
  const annualReports = await import('../tools/annual_reports.js');
  // Customer Review 도구
  const customerReviews = await import('../tools/customer_reviews.js');
  // Phase 4: 유틸리티 도구
  const utilities = await import('../tools/utilities.js');
  // Phase 5: RAG 검색 도구
  const rag = await import('../tools/rag.js');
  // 주소 검색 도구
  const address = await import('../tools/address.js');
  // 통합 검색 도구
  const unifiedSearch = await import('../tools/unified_search.js');

  toolHandlers = {
    // 고객 관련
    search_customers: customers.handleSearchCustomers,
    get_customer: customers.handleGetCustomer,
    create_customer: customers.handleCreateCustomer,
    update_customer: customers.handleUpdateCustomer,
    // 계약 관련
    list_contracts: contracts.handleListContracts,
    get_contract_details: contracts.handleGetContractDetails,
    create_contract: contracts.handleCreateContract,
    // 생일
    find_birthday_customers: birthdays.handleFindBirthdayCustomers,
    // 네트워크
    get_customer_network: network.handleGetCustomerNetwork,
    // 문서 관련
    search_documents: documents.handleSearchDocuments,
    get_document: documents.handleGetDocument,
    list_customer_documents: documents.handleListCustomerDocuments,
    find_document_by_filename: documents.handleFindDocumentByFilename,
    // 메모 관련
    add_customer_memo: memos.handleAddMemo,
    list_customer_memos: memos.handleListMemos,
    delete_customer_memo: memos.handleDeleteMemo,
    // 보험상품 관련
    search_products: products.handleSearchProducts,
    // Phase 1: 관계 관리
    create_relationship: relationships.handleCreateRelationship,
    delete_relationship: relationships.handleDeleteRelationship,
    list_relationships: relationships.handleListRelationships,
    // Phase 2: Annual Report
    get_annual_reports: annualReports.handleGetAnnualReports,
    get_ar_contract_history: annualReports.handleGetArContractHistory,
    // Customer Review (변액리포트)
    get_customer_reviews: customerReviews.handleGetCustomerReviews,
    get_cr_contract_history: customerReviews.handleGetCrContractHistory,
    // Phase 4: 유틸리티
    get_storage_info: utilities.handleGetStorageInfo,
    check_customer_name: utilities.handleCheckCustomerName,
    list_notices: utilities.handleListNotices,
    list_faqs: utilities.handleListFaqs,
    list_usage_guides: utilities.handleListUsageGuides,
    // Phase 5: RAG 검색
    search_documents_semantic: rag.handleSearchDocumentsSemantic,
    get_search_analytics: rag.handleGetSearchAnalytics,
    get_failed_queries: rag.handleGetFailedQueries,
    submit_search_feedback: rag.handleSubmitSearchFeedback,
    // 주소 검색
    search_address: address.handleSearchAddress,
    // 통합 검색
    unified_search: unifiedSearch.handleUnifiedSearch,
  };
}

/**
 * HTTP Transport로 MCP 서버 시작
 * aims 웹사이트 등 원격 클라이언트용
 */
export async function startHttpServer(_server: Server): Promise<void> {
  await loadToolHandlers();

  const app = express();

  app.use(cors());
  app.use(express.json());

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'aims-mcp', mode: 'http', version: '1.0.0' });
  });

  // MCP Tool 목록 조회
  app.get('/tools', (_req: Request, res: Response) => {
    res.json({
      success: true,
      count: allToolDefinitions.length,
      tools: allToolDefinitions.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema
      }))
    });
  });

  // MCP Tool 호출
  app.post('/call', async (req: Request, res: Response) => {
    try {
      // Authorization 헤더 또는 X-User-ID 헤더에서 userId 추출
      const authHeader = req.headers.authorization;
      const xUserId = req.headers['x-user-id'] as string | undefined;
      const userId = getUserIdFromAuth(authHeader, xUserId);
      setCurrentUserId(userId);

      const { tool, arguments: args } = req.body;

      if (!tool) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: tool'
        });
        return;
      }

      const handler = toolHandlers[tool];
      if (!handler) {
        res.status(400).json({
          success: false,
          error: `Unknown tool: ${tool}`,
          availableTools: Object.keys(toolHandlers)
        });
        return;
      }

      console.error(`[aims-mcp/http] Tool 호출: ${tool} by ${userId}`);
      const result = await handler(args || {});

      res.json({
        success: true,
        result
      });
    } catch (error) {
      console.error('[aims-mcp/http] Tool 호출 실패:', error);
      const isAuthError = error instanceof Error &&
        (error.message.includes('auth') || error.message.includes('token') || error.message.includes('Authentication'));

      // 인증 에러가 아닌 경우에만 시스템 로그 전송
      if (!isAuthError) {
        sendErrorLog('aims_mcp', `Tool 호출 실패: ${req.body?.tool}`, error, {
          tool: req.body?.tool,
          userId: req.headers['x-user-id'] || 'unknown'
        });
      }

      res.status(isAuthError ? 401 : 500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // 단순화된 Tool 호출 (각 tool별 엔드포인트)
  app.post('/tools/:toolName', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const xUserId = req.headers['x-user-id'] as string | undefined;
      const userId = getUserIdFromAuth(authHeader, xUserId);
      setCurrentUserId(userId);

      const { toolName } = req.params;
      const handler = toolHandlers[toolName];

      if (!handler) {
        res.status(404).json({
          success: false,
          error: `Unknown tool: ${toolName}`
        });
        return;
      }

      console.error(`[aims-mcp/http] Tool 호출: ${toolName} by ${userId}`);
      const result = await handler(req.body || {});

      res.json({
        success: true,
        result
      });
    } catch (error) {
      console.error('[aims-mcp/http] Tool 호출 실패:', error);
      sendErrorLog('aims_mcp', `Tool 호출 실패: ${req.params.toolName}`, error, {
        tool: req.params.toolName,
        userId: req.headers['x-user-id'] || 'unknown'
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.listen(PORT, () => {
    console.error(`[aims-mcp] HTTP 서버 시작됨 - http://localhost:${PORT}`);
    console.error(`[aims-mcp] 엔드포인트:`);
    console.error(`  GET  /health          - 헬스 체크`);
    console.error(`  GET  /tools           - Tool 목록`);
    console.error(`  POST /call            - Tool 호출 (body: {tool, arguments})`);
    console.error(`  POST /tools/:toolName - 개별 Tool 호출`);
  });
}
