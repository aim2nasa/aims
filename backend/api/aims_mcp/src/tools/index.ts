import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { sendErrorLog } from '../systemLogger.js';

// Tool 정의 및 핸들러 import
import { customerToolDefinitions, handleSearchCustomers, handleGetCustomer, handleCreateCustomer, handleUpdateCustomer, handleRestoreCustomer, handleListDeletedCustomers } from './customers.js';
import { contractToolDefinitions, handleListContracts, handleGetContractDetails } from './contracts.js';
import { birthdayToolDefinitions, handleFindBirthdayCustomers } from './birthdays.js';
import { expiringToolDefinitions, handleFindExpiringContracts } from './expiring.js';
import { statisticsToolDefinitions, handleGetStatistics } from './statistics.js';
import { networkToolDefinitions, handleGetCustomerNetwork } from './network.js';
import { documentToolDefinitions, handleSearchDocuments, handleGetDocument, handleListCustomerDocuments, handleDeleteDocument, handleDeleteDocuments } from './documents.js';
import { memoToolDefinitions, handleAddMemo, handleListMemos, handleDeleteMemo } from './memos.js';
import { productToolDefinitions, handleSearchProducts, handleGetProductDetails } from './products.js';
import { relationshipToolDefinitions, handleCreateRelationship, handleDeleteRelationship, handleListRelationships } from './relationships.js';
import { annualReportToolDefinitions, handleGetAnnualReports, handleGetArParsingStatus, handleTriggerArParsing, handleGetArQueueStatus } from './annual_reports.js';
import { insightToolDefinitions, handleAnalyzeCustomerValue, handleFindCoverageGaps, handleSuggestNextAction } from './insights.js';
import { utilityToolDefinitions, handleGetStorageInfo, handleCheckCustomerName, handleListNotices, handleListFaqs, handleListUsageGuides } from './utilities.js';
import { ragToolDefinitions, handleSearchDocumentsSemantic, handleGetSearchAnalytics, handleGetFailedQueries, handleSubmitSearchFeedback } from './rag.js';

// 모든 Tool 정의 통합
const allToolDefinitions = [
  ...customerToolDefinitions,
  ...contractToolDefinitions,
  ...birthdayToolDefinitions,
  ...expiringToolDefinitions,
  ...statisticsToolDefinitions,
  ...networkToolDefinitions,
  ...documentToolDefinitions,
  ...memoToolDefinitions,
  ...productToolDefinitions,
  ...relationshipToolDefinitions,
  ...annualReportToolDefinitions,
  ...insightToolDefinitions,
  ...utilityToolDefinitions,
  ...ragToolDefinitions,
];

// Tool 핸들러 매핑
const toolHandlers: Record<string, (args: unknown) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>> = {
  // 고객 관련
  search_customers: handleSearchCustomers,
  get_customer: handleGetCustomer,
  create_customer: handleCreateCustomer,
  update_customer: handleUpdateCustomer,
  restore_customer: handleRestoreCustomer,
  list_deleted_customers: handleListDeletedCustomers,
  // 계약 관련
  list_contracts: handleListContracts,
  get_contract_details: handleGetContractDetails,
  // 생일/만기
  find_birthday_customers: handleFindBirthdayCustomers,
  find_expiring_contracts: handleFindExpiringContracts,
  // 통계/네트워크
  get_statistics: handleGetStatistics,
  get_customer_network: handleGetCustomerNetwork,
  // 문서 관련
  search_documents: handleSearchDocuments,
  get_document: handleGetDocument,
  list_customer_documents: handleListCustomerDocuments,
  delete_document: handleDeleteDocument,
  delete_documents: handleDeleteDocuments,
  // 메모 관련
  add_customer_memo: handleAddMemo,
  list_customer_memos: handleListMemos,
  delete_customer_memo: handleDeleteMemo,
  // 보험상품 관련
  search_products: handleSearchProducts,
  get_product_details: handleGetProductDetails,
  // 관계 관련
  create_relationship: handleCreateRelationship,
  delete_relationship: handleDeleteRelationship,
  list_relationships: handleListRelationships,
  // Annual Report 관련
  get_annual_reports: handleGetAnnualReports,
  get_ar_parsing_status: handleGetArParsingStatus,
  trigger_ar_parsing: handleTriggerArParsing,
  get_ar_queue_status: handleGetArQueueStatus,
  // 인사이트 관련
  analyze_customer_value: handleAnalyzeCustomerValue,
  find_coverage_gaps: handleFindCoverageGaps,
  suggest_next_action: handleSuggestNextAction,
  // 유틸리티 관련
  get_storage_info: handleGetStorageInfo,
  check_customer_name: handleCheckCustomerName,
  list_notices: handleListNotices,
  list_faqs: handleListFaqs,
  list_usage_guides: handleListUsageGuides,
  // RAG 검색 관련
  search_documents_semantic: handleSearchDocumentsSemantic,
  get_search_analytics: handleGetSearchAnalytics,
  get_failed_queries: handleGetFailedQueries,
  submit_search_feedback: handleSubmitSearchFeedback,
};

/**
 * 모든 MCP Tools 등록
 */
export function registerAllTools(server: Server): void {
  console.error('[aims-mcp] Tools 등록 중...');

  // Tool 목록 반환 핸들러
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.error(`[aims-mcp] Tool 목록 요청 - ${allToolDefinitions.length}개 Tool`);
    return {
      tools: allToolDefinitions,
    };
  });

  // Tool 호출 핸들러
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    console.error(`[aims-mcp] Tool 호출: ${name}`, JSON.stringify(args));

    const handler = toolHandlers[name];
    if (!handler) {
      console.error(`[aims-mcp] 알 수 없는 Tool: ${name}`);
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `알 수 없는 Tool: ${name}. 사용 가능한 Tools: ${Object.keys(toolHandlers).join(', ')}`,
        }],
      };
    }

    try {
      const result = await handler(args);
      console.error(`[aims-mcp] Tool 완료: ${name}`);
      return result;
    } catch (error) {
      console.error(`[aims-mcp] Tool 오류: ${name}`, error);
      sendErrorLog('aims_mcp', `Tool 실행 오류: ${name}`, error);
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `Tool 실행 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        }],
      };
    }
  });

  console.error(`[aims-mcp] ${allToolDefinitions.length}개 Tools 등록 완료:`);
  allToolDefinitions.forEach(tool => {
    console.error(`  - ${tool.name}: ${tool.description.substring(0, 50)}...`);
  });
}

// Tool 정의 export (HTTP 모드에서 사용)
export { allToolDefinitions };
