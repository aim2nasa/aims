#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { connectDB } from './db.js';
import { registerAllTools } from './tools/index.js';
import { sendErrorLog } from './systemLogger.js';
import dotenv from 'dotenv';

dotenv.config();

// MCP 서버 인스턴스 생성
const server = new Server(
  {
    name: 'aims-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 모든 Tools 등록
registerAllTools(server);

// Transport 모드 선택
const mode = process.env.MCP_MODE || 'stdio';

async function main() {
  try {
    // MongoDB 연결
    await connectDB();

    if (mode === 'http') {
      // HTTP/SSE 모드
      const { startHttpServer } = await import('./transports/http.js');
      await startHttpServer(server);
    } else {
      // stdio 모드 (기본)
      const { startStdioServer } = await import('./transports/stdio.js');
      await startStdioServer(server);
    }
  } catch (error) {
    console.error('[aims-mcp] 서버 시작 실패:', error);
    await sendErrorLog('aims_mcp', '서버 시작 실패', error);
    process.exit(1);
  }
}

// 프로세스 종료 처리
process.on('SIGINT', async () => {
  console.error('[aims-mcp] 서버 종료 중...');
  const { closeDB } = await import('./db.js');
  await closeDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('[aims-mcp] 서버 종료 중...');
  const { closeDB } = await import('./db.js');
  await closeDB();
  process.exit(0);
});

main();
