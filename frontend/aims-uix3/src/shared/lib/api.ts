/**
 * AIMS UIX-3 API Client
 * @since 2025-09-15
 * @version 1.0.0
 *
 * Fetch 기반의 표준화된 API 클라이언트
 * 타임아웃, 에러 처리, 요청/응답 인터셉터 제공
 */

import { logger } from './logger';

// API 로그 디버그 모드 (필요시 true로 변경)
const API_DEBUG = false;

// ============================================================================
// 🔧 GET 요청 중복 방지 시스템
// ============================================================================

/**
 * 진행 중인 GET 요청 추적 (중복 요청 방지)
 * key: URL
 * value: Promise
 */
const pendingGetRequests = new Map<string, Promise<unknown>>();

/**
 * 진행 중인 GET 요청의 AbortController 추적
 * key: URL
 * value: AbortController
 */
const getRequestControllers = new Map<string, AbortController>();

/**
 * 현재 활성 고객 ID (고객 전환 감지용)
 */
let activeCustomerId: string | null = null;

/**
 * 고객 전환 시 이전 고객의 모든 진행 중인 요청 취소 (내부 함수)
 */
function cancelStaleCustomerRequests(newCustomerId: string): void {
  if (!activeCustomerId || activeCustomerId === newCustomerId) {
    activeCustomerId = newCustomerId;
    return;
  }

  const oldCustomerId = activeCustomerId;
  activeCustomerId = newCustomerId;

  let cancelledCount = 0;
  for (const [url, controller] of getRequestControllers) {
    if (url.includes(`/api/customers/${oldCustomerId}`)) {
      controller.abort();
      getRequestControllers.delete(url);
      pendingGetRequests.delete(url);
      cancelledCount++;
    }
  }

  if (cancelledCount > 0) {
    logger.debug('API', `고객 전환 (${oldCustomerId.slice(-6)} → ${newCustomerId.slice(-6)}): ${cancelledCount}개 요청 취소`);
  }
}

/**
 * 🔧 활성 고객 설정 (명시적 호출 전용)
 *
 * 사용자가 실제로 고객을 선택했을 때만 호출해야 합니다.
 * 이 함수를 호출하면 이전 고객의 진행 중인 요청이 모두 취소됩니다.
 *
 * ⚠️ 주의: 백그라운드 작업(getAllRelationshipsWithCustomers 등)에서는 절대 호출하지 마세요!
 *
 * @param customerId - 새로 선택된 고객 ID
 *
 * @example
 * ```typescript
 * // CustomerFullDetailView에서 고객 로드 시
 * api.setActiveCustomer(customerId);
 * const customer = await api.get(`/api/customers/${customerId}`);
 * ```
 */
export function setActiveCustomer(customerId: string): void {
  logger.debug('API', `setActiveCustomer: ${customerId?.slice(-6)} ← prev: ${activeCustomerId?.slice(-6)}`);
  if (!customerId) return;
  cancelStaleCustomerRequests(customerId);
}

/**
 * 현재 사용자 ID 가져오기
 * localStorage에 저장된 로그인 사용자 ID 반환
 *
 * @returns 사용자 ID 문자열 (없으면 빈 문자열)
 */
export function getCurrentUserId(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('aims-current-user-id') || ''
}

/**
 * JWT 토큰만 가져오기
 * localStorage에서 토큰 추출 (v2 우선, 하위 호환성 위해 v1도 확인)
 *
 * @returns JWT 토큰 문자열 또는 null
 *
 * @example
 * ```ts
 * const token = getAuthToken()
 * // 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
 * ```
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null

  try {
    // v2 키 우선 확인
    let authStorage = localStorage.getItem('auth-storage-v2')
    if (authStorage) {
      const parsed = JSON.parse(authStorage)
      if (parsed?.state?.token) {
        return parsed.state.token
      }
    }

    // 하위 호환성: v1 키도 확인 (마이그레이션 전 사용자 지원)
    authStorage = localStorage.getItem('auth-storage')
    if (authStorage) {
      const parsed = JSON.parse(authStorage)
      if (parsed?.state?.token) {
        // v1에서 찾은 토큰을 v2로 마이그레이션
        localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { token: parsed.state.token } }))
        localStorage.removeItem('auth-storage')
        return parsed.state.token
      }
    }
  } catch {
    // 파싱 실패 시 무시
  }

  return null
}

/**
 * JWT 토큰을 포함한 Authorization 헤더 가져오기
 * getAuthToken()을 사용하여 토큰 추출 (v2 우선, v1 하위 호환)
 *
 * @returns Authorization 헤더 객체 또는 빈 객체
 *
 * @example
 * ```ts
 * const headers = getAuthHeaders()
 * // { 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }
 *
 * fetch('/api/endpoint', {
 *   headers: {
 *     'Content-Type': 'application/json',
 *     ...getAuthHeaders()
 *   }
 * })
 * ```
 */
export function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}

  const headers: Record<string, string> = {}

  // JWT 토큰이 유일한 사용자 인증 수단 (x-user-id 헤더 제거됨)

  // Authorization 헤더 추가 (getAuthToken 사용으로 v1/v2 호환)
  const token = getAuthToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return headers
}

// API 설정
export const API_CONFIG = {
  BASE_URL: import.meta.env['VITE_API_BASE_URL'] || '',
  TIMEOUT: 60000, // 60초 (대량 문서 처리 시 서버 응답 지연 대응)
  TIMEOUT_LONG: 120000, // 120초 (무거운 작업용)
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
 * 요청 취소 에러 클래스 (고객 전환 등 정상적인 취소)
 * 이 에러는 UI에 표시되면 안 됨 - 조용히 무시해야 함
 */
export class RequestCancelledError extends Error {
  constructor(message = '요청이 취소되었습니다') {
    super(message);
    this.name = 'RequestCancelledError';
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
 * API 요청 함수 (내부 실행)
 */
async function executeApiRequest<T = unknown>(
  url: string,
  requestOptions: RequestInit,
  timeout: number
): Promise<T> {
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
 * AbortController를 지원하는 API 요청 함수 (GET 요청용)
 * 고객 전환 시 요청 취소를 위해 사용
 */
async function executeApiRequestWithAbort<T = unknown>(
  url: string,
  requestOptions: RequestInit,
  timeout: number,
  controller: AbortController
): Promise<T> {
  // 타임아웃 설정 (별도 AbortController 사용)
  const timeoutId = setTimeout(() => {
    // 타임아웃 시에도 abort 호출하되, 이미 abort된 상태면 무시됨
    if (!controller.signal.aborted) {
      controller.abort('timeout');
    }
  }, timeout);

  let response: Response;

  try {
    response = await fetch(url, requestOptions);
    clearTimeout(timeoutId);
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        // abort 이유에 따라 다른 에러 던지기
        if (controller.signal.reason === 'timeout') {
          throw new TimeoutError();
        }
        // 고객 전환 등으로 인한 정상적인 취소
        throw new RequestCancelledError();
      }
      throw new NetworkError(`네트워크 오류: ${error.message}`, error);
    }

    throw new NetworkError('알 수 없는 네트워크 오류');
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
    // 🔧 응답 읽기 중 abort된 경우 RequestCancelledError 던지기
    if (controller.signal.aborted) {
      if (controller.signal.reason === 'timeout') {
        throw new TimeoutError();
      }
      throw new RequestCancelledError();
    }
    throw new ApiError(
      '응답 파싱 중 오류가 발생했습니다',
      response.status,
      response.statusText
    );
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

  const method = (fetchOptions.method || 'GET').toUpperCase();

  // ============================================================================
  // 🔧 GET 요청 중복 방지
  // ============================================================================
  // ⚠️ 고객 전환 감지는 더 이상 자동으로 하지 않음!
  // setActiveCustomer()를 명시적으로 호출해야만 이전 요청이 취소됨
  // 이유: getAllRelationshipsWithCustomers 등 백그라운드 순회가 고객 전환으로 오인되는 문제 해결
  if (method === 'GET') {
    // 이미 동일한 GET 요청이 진행 중이면 기존 Promise 반환
    const existingRequest = pendingGetRequests.get(url);
    if (existingRequest) {
      if (API_DEBUG) {
        logger.debug('API', `중복 요청 재사용: ${url}`);
      }
      return existingRequest as Promise<T>;
    }
  }

  // 헤더 구성 — JWT 토큰이 유일한 사용자 인증 수단
  // x-user-id 헤더 제거됨: localStorage의 stale userId로 인해 잘못된 ownerId로 데이터 저장되는 버그 방지
  const requestHeaders: Record<string, string> = {
    ...API_CONFIG.DEFAULT_HEADERS,
    ...getAuthHeaders(),
    ...(headers as Record<string, string>),
  };

  // 요청 옵션 구성
  const requestOptions: RequestInit = {
    ...fetchOptions,
    method,
    headers: requestHeaders,
  };

  // GET 요청에 AbortController 추가 (고객 전환 시 취소 지원)
  let controller: AbortController | null = null;
  if (method === 'GET') {
    controller = new AbortController();
    getRequestControllers.set(url, controller);
    requestOptions.signal = controller.signal;
  }

  // 바디 처리
  if (body !== undefined) {
    if (body instanceof FormData) {
      delete (requestHeaders as Record<string, string>)['Content-Type'];
      requestOptions.body = body;
    } else if (typeof body === 'string') {
      requestOptions.body = body;
    } else {
      requestOptions.body = JSON.stringify(body);
    }
  }

  // 요청 전 로그 (개발 환경에서만)
  if (API_DEBUG) {
    logger.debug('API', `Request: ${method} ${url}`);
  }

  // 요청 실행 (GET은 중복 방지 추적)
  if (method === 'GET') {
    const requestPromise = executeApiRequestWithAbort<T>(url, requestOptions, timeout, controller!)
      .finally(() => {
        // 요청 완료 시 추적 정리
        pendingGetRequests.delete(url);
        getRequestControllers.delete(url);
      });

    pendingGetRequests.set(url, requestPromise);
    return requestPromise;
  }

  // GET 이외의 요청은 그냥 실행
  return executeApiRequest<T>(url, requestOptions, timeout);
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
  // 🔧 요청 취소 에러는 빈 문자열 반환 (UI에 표시하지 않음)
  if (error instanceof RequestCancelledError) {
    return '';
  }

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
 * 요청 취소 에러인지 확인하는 헬퍼 함수
 */
export function isRequestCancelledError(error: unknown): boolean {
  return error instanceof RequestCancelledError;
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