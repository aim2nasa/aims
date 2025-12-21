/**
 * MCP Test Client
 *
 * Cross-system 테스트를 위한 MCP HTTP 클라이언트
 *
 * 사용 예:
 *   const mcp = new MCPTestClient();
 *   const customer = await mcp.call('search_customers', { query: '홍길동' });
 *
 *   // 다른 사용자로 테스트
 *   const mcpAsUserB = mcp.asUser('userB');
 *   const result = await mcpAsUserB.call('search_customers', {});
 */

export interface MCPResponse {
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

export interface MCPCallOptions {
  timeout?: number;
}

export class MCPTestClient {
  private baseUrl: string;
  private userId: string;
  private defaultTimeout: number;

  constructor(
    baseUrl: string = process.env.MCP_URL || 'http://localhost:3011',
    userId: string = process.env.TEST_USER_ID || '000000000000000000000001'
  ) {
    this.baseUrl = baseUrl;
    this.userId = userId;
    this.defaultTimeout = 15000;
  }

  /**
   * 다른 사용자 컨텍스트로 새 클라이언트 생성
   */
  asUser(userId: string): MCPTestClient {
    return new MCPTestClient(this.baseUrl, userId);
  }

  /**
   * 현재 사용자 ID 조회
   */
  getUserId(): string {
    return this.userId;
  }

  /**
   * 서버 헬스체크
   */
  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000)
      });
      const data = await res.json() as { status?: string };
      return data.status === 'ok';
    } catch {
      return false;
    }
  }

  /**
   * MCP 도구 호출 (raw response)
   */
  async callRaw(tool: string, args: Record<string, unknown> = {}, options?: MCPCallOptions): Promise<MCPResponse> {
    const timeout = options?.timeout || this.defaultTimeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(`${this.baseUrl}/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': this.userId
        },
        body: JSON.stringify({ tool, arguments: args }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return await res.json() as MCPResponse;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`MCP call timeout after ${timeout}ms: ${tool}`);
      }
      throw error;
    }
  }

  /**
   * MCP 도구 호출 (parsed response)
   * 에러가 발생하면 예외를 던짐
   */
  async call<T = unknown>(tool: string, args: Record<string, unknown> = {}, options?: MCPCallOptions): Promise<T> {
    const response = await this.callRaw(tool, args, options);

    if (!response.success) {
      throw new Error(`MCP call failed: ${response.error || 'Unknown error'}`);
    }

    if (response.result?.isError) {
      const errorText = response.result.content?.[0]?.text || 'Unknown error';
      throw new Error(errorText);
    }

    const text = response.result?.content?.[0]?.text;
    if (!text) {
      throw new Error('Empty response from MCP');
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Failed to parse MCP response: ${text.substring(0, 100)}`);
    }
  }

  /**
   * 응답이 에러인지 확인
   */
  isErrorResponse(response: MCPResponse): boolean {
    return response.result?.isError === true;
  }

  /**
   * 에러 메시지 추출
   */
  getErrorMessage(response: MCPResponse): string {
    return response.result?.content?.[0]?.text || '';
  }
}

// 싱글톤 인스턴스 (편의를 위해)
export const mcp = new MCPTestClient();
