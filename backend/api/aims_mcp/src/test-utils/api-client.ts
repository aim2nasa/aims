/**
 * aims_api Test Client
 *
 * Cross-system 테스트를 위한 aims_api HTTP 클라이언트
 *
 * 사용 예:
 *   const api = new APITestClient();
 *   const customer = await api.get('/customers/123');
 *
 *   // 다른 사용자로 테스트
 *   const apiAsUserB = api.asUser('userB');
 *   const result = await apiAsUserB.get('/customers');
 */

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface APIErrorResponse {
  status: number;
  error: string;
  data?: unknown;
}

export interface APIRequestOptions {
  timeout?: number;
  headers?: Record<string, string>;
}

export class APITestClient {
  private baseUrl: string;
  private userId: string;
  private defaultTimeout: number;

  constructor(
    baseUrl: string = process.env.AIMS_API_URL || 'http://localhost:3010',
    userId: string = process.env.TEST_USER_ID || '000000000000000000000001'
  ) {
    this.baseUrl = baseUrl;
    this.userId = userId;
    this.defaultTimeout = 15000;
  }

  /**
   * 다른 사용자 컨텍스트로 새 클라이언트 생성
   */
  asUser(userId: string): APITestClient {
    return new APITestClient(this.baseUrl, userId);
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
      const res = await fetch(`${this.baseUrl}/api/health`, {
        signal: AbortSignal.timeout(5000)
      });
      const data = await res.json() as { success?: boolean; status?: string };
      return data.success === true || data.status === 'ok';
    } catch {
      return false;
    }
  }

  /**
   * HTTP 요청 실행
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: APIRequestOptions
  ): Promise<T | APIErrorResponse> {
    const timeout = options?.timeout || this.defaultTimeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // path가 /api로 시작하지 않으면 추가
    const fullPath = path.startsWith('/api') ? path : `/api${path}`;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-user-id': this.userId,
        ...options?.headers
      };

      const res = await fetch(`${this.baseUrl}${fullPath}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await res.json() as {
        success?: boolean;
        data?: T;
        error?: string;
        message?: string;
      };

      if (!res.ok) {
        return {
          status: res.status,
          error: data.error || data.message || `HTTP ${res.status}`,
          data
        };
      }

      // aims_api는 { success: true, data: ... } 형태로 응답
      if (data.success === false) {
        return {
          status: res.status,
          error: data.error || data.message || 'API returned success: false',
          data: data.data
        };
      }

      return (data.data !== undefined ? data.data : data) as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          status: 408,
          error: `API request timeout after ${timeout}ms: ${method} ${fullPath}`
        };
      }
      throw error;
    }
  }

  /**
   * GET 요청
   */
  async get<T = unknown>(path: string, options?: APIRequestOptions): Promise<T | APIErrorResponse> {
    return this.request<T>('GET', path, undefined, options);
  }

  /**
   * POST 요청
   */
  async post<T = unknown>(path: string, body: unknown, options?: APIRequestOptions): Promise<T | APIErrorResponse> {
    return this.request<T>('POST', path, body, options);
  }

  /**
   * PUT 요청
   */
  async put<T = unknown>(path: string, body: unknown, options?: APIRequestOptions): Promise<T | APIErrorResponse> {
    return this.request<T>('PUT', path, body, options);
  }

  /**
   * PATCH 요청
   */
  async patch<T = unknown>(path: string, body: unknown, options?: APIRequestOptions): Promise<T | APIErrorResponse> {
    return this.request<T>('PATCH', path, body, options);
  }

  /**
   * DELETE 요청
   */
  async delete<T = unknown>(path: string, options?: APIRequestOptions): Promise<T | APIErrorResponse> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  /**
   * 응답이 에러인지 확인
   */
  isError(response: unknown): response is APIErrorResponse {
    return typeof response === 'object' && response !== null && 'status' in response && 'error' in response;
  }

  /**
   * 에러가 아닌 응답 추출 (에러면 예외 던짐)
   */
  unwrap<T>(response: T | APIErrorResponse): T {
    if (this.isError(response)) {
      throw new Error(`API Error (${response.status}): ${response.error}`);
    }
    return response;
  }
}

// 싱글톤 인스턴스 (편의를 위해)
export const api = new APITestClient();
