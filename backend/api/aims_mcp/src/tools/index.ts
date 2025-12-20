import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Tool 정의 및 핸들러 import
import { customerToolDefinitions, handleSearchCustomers, handleGetCustomer } from './customers.js';
import { contractToolDefinitions, handleListContracts } from './contracts.js';
import { birthdayToolDefinitions, handleFindBirthdayCustomers } from './birthdays.js';
import { expiringToolDefinitions, handleFindExpiringContracts } from './expiring.js';
import { statisticsToolDefinitions, handleGetStatistics } from './statistics.js';
import { networkToolDefinitions, handleGetCustomerNetwork } from './network.js';

// 모든 Tool 정의 통합
const allToolDefinitions = [
  ...customerToolDefinitions,
  ...contractToolDefinitions,
  ...birthdayToolDefinitions,
  ...expiringToolDefinitions,
  ...statisticsToolDefinitions,
  ...networkToolDefinitions,
];

// Tool 핸들러 매핑
const toolHandlers: Record<string, (args: unknown) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>> = {
  search_customers: handleSearchCustomers,
  get_customer: handleGetCustomer,
  list_contracts: handleListContracts,
  find_birthday_customers: handleFindBirthdayCustomers,
  find_expiring_contracts: handleFindExpiringContracts,
  get_statistics: handleGetStatistics,
  get_customer_network: handleGetCustomerNetwork,
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
