import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setCurrentUserId, getUserIdFromAuth } from '../auth.js';
import { sendErrorLog } from '../systemLogger.js';

/**
 * stdio Transport로 MCP 서버 시작
 * Claude Desktop, Cursor IDE 등 로컬 클라이언트용
 */
export async function startStdioServer(server: Server): Promise<void> {
  // 환경변수에서 userId 설정
  try {
    const userId = getUserIdFromAuth();
    setCurrentUserId(userId);
    console.error(`[aims-mcp] stdio 모드 시작 - User: ${userId}`);
  } catch (error) {
    console.error('[aims-mcp] 경고: USER_ID 환경변수가 설정되지 않았습니다.');
    console.error('[aims-mcp] stdio 모드에서는 USER_ID 환경변수가 필요합니다.');
  }

  const transport = new StdioServerTransport();

  try {
    await server.connect(transport);
    console.error('[aims-mcp] stdio 서버 시작됨');
  } catch (error) {
    console.error('[aims-mcp] stdio 서버 연결 실패:', error);
    sendErrorLog('aims_mcp', 'stdio 서버 연결 실패', error);
    throw error;
  }
}
