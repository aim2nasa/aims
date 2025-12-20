import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { setCurrentUserId, getUserIdFromAuth } from '../auth.js';
import { allToolDefinitions } from '../tools/index.js';

const PORT = parseInt(process.env.MCP_PORT || '3011', 10);

// Tool 핸들러 동적 import
let toolHandlers: Record<string, (args: unknown) => Promise<unknown>> = {};

async function loadToolHandlers() {
  const customers = await import('../tools/customers.js');
  const contracts = await import('../tools/contracts.js');
  const birthdays = await import('../tools/birthdays.js');
  const expiring = await import('../tools/expiring.js');
  const statistics = await import('../tools/statistics.js');
  const network = await import('../tools/network.js');

  toolHandlers = {
    search_customers: customers.handleSearchCustomers,
    get_customer: customers.handleGetCustomer,
    list_contracts: contracts.handleListContracts,
    find_birthday_customers: birthdays.handleFindBirthdayCustomers,
    find_expiring_contracts: expiring.handleFindExpiringContracts,
    get_statistics: statistics.handleGetStatistics,
    get_customer_network: network.handleGetCustomerNetwork,
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
