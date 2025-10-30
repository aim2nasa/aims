/**
 * AIMS UIX-3 API Client
 * @since 2025-09-15
 * @version 1.0.0
 *
 * Fetch 기반의 표준화된 API 클라이언트
 * 타임아웃, 에러 처리, 요청/응답 인터셉터 제공
 */

// API 설정
export const API_CONFIG = {
  BASE_URL: import.meta.env['VITE_API_BASE_URL'] || 'http://tars.giize.com:3010',
  TIMEOUT: 10000, // 10초
  DEFAULT_HEADERS: {
    'Content-Type': 'application/json',
  },
} as const;

/**
 * API 에러 클래스
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * 네트워크 에러 클래스
 */
export class NetworkError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * 타임아웃 에러 클래스
 */
export class TimeoutError extends Error {
  constructor(message = '요청 시간이 초과되었습니다') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * API 요청 옵션 타입
 */
export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  timeout?: number;
  baseUrl?: string;
  body?: unknown;
}

// 응답 타입 가드 (현재 미사용)
// function isResponse(value: unknown): value is Response {
//   return value instanceof Response;
// }

/**
 * 타임아웃을 적용한 fetch 함수
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new TimeoutError();
      }
      throw new NetworkError(`네트워크 오류: ${error.message}`, error);
    }

    throw new NetworkError('알 수 없는 네트워크 오류');
  }
}

/**
 * API 요청 함수
 */
export async function apiRequest<T = unknown>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const {
    timeout = API_CONFIG.TIMEOUT,
    baseUrl = API_CONFIG.BASE_URL,
    headers,
    body,
    ...fetchOptions
  } = options;

  // URL 구성
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  // 헤더 구성
  const requestHeaders = {
    ...API_CONFIG.DEFAULT_HEADERS,
    'x-user-id': 'tester', // ⭐ userId 헤더 추가 (향후 로그인 기능 구현 시 동적으로 변경)
    ...headers,
  };

  // 요청 옵션 구성
  const requestOptions: RequestInit = {
    ...fetchOptions,
    headers: requestHeaders,
  };

  // 바디 처리
  if (body !== undefined) {
    if (body instanceof FormData) {
      // FormData의 경우 Content-Type을 자동으로 설정하도록 제거
      delete (requestHeaders as Record<string, string>)['Content-Type'];
      requestOptions.body = body;
    } else if (typeof body === 'string') {
      requestOptions.body = body;
    } else {
      requestOptions.body = JSON.stringify(body);
    }
  }

  // 요청 전 로그 (개발 환경에서만)
  if (import.meta.env.DEV) {
    console.log(`🌐 API Request: ${requestOptions.method || 'GET'} ${url}`);
  }

  let response: Response;

  try {
    response = await fetchWithTimeout(url, requestOptions, timeout);
  } catch (error) {
    if (error instanceof TimeoutError || error instanceof NetworkError) {
      throw error;
    }
    throw new NetworkError('요청 실행 중 오류가 발생했습니다');
  }

  // 응답 처리
  let data: unknown;
  const contentType = response.headers.get('content-type');

  try {
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else if (contentType?.includes('text/')) {
      data = await response.text();
    } else {
      data = await response.blob();
    }
  } catch {
    throw new ApiError(
      '응답 파싱 중 오류가 발생했습니다',
      response.status,
      response.statusText
    );
  }

  // 응답 후 로그 (개발 환경에서만)
  if (import.meta.env.DEV) {
    console.log(`API Response: ${response.status} ${url}`, data);
  }

  // 에러 응답 처리
  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'message' in data
      ? String((data as { message: string }).message)
      : `HTTP ${response.status}: ${response.statusText}`;

    throw new ApiError(message, response.status, response.statusText, data);
  }

  return data as T;
}

/**
 * HTTP 메서드별 편의 함수들
 */
export const api = {
  get: <T = unknown>(endpoint: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(endpoint, { ...options, method: 'GET' }),

  post: <T = unknown>(endpoint: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method'>) =>
    apiRequest<T>(endpoint, { ...options, method: 'POST', body }),

  put: <T = unknown>(endpoint: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method'>) =>
    apiRequest<T>(endpoint, { ...options, method: 'PUT', body }),

  patch: <T = unknown>(endpoint: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method'>) =>
    apiRequest<T>(endpoint, { ...options, method: 'PATCH', body }),

  delete: <T = unknown>(endpoint: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(endpoint, { ...options, method: 'DELETE' }),
};

/**
 * 에러 핸들러 유틸리티
 */
export function handleApiError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof NetworkError) {
    return error.message;
  }

  if (error instanceof TimeoutError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return '알 수 없는 오류가 발생했습니다';
}

/**
 * API 상태 확인 함수
 */
export async function checkApiHealth(): Promise<{ status: 'ok' | 'error'; timestamp: number }> {
  try {
    await api.get('/health', { timeout: 5000 });
    return { status: 'ok', timestamp: Date.now() };
  } catch {
    return { status: 'error', timestamp: Date.now() };
  }
}