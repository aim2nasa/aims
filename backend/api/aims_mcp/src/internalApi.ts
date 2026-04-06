/**
 * internalApi.ts — aims_api Internal API 헬퍼
 *
 * aims_mcp에서 files 컬렉션에 직접 접근하지 않고
 * aims_api의 Internal API를 경유하여 데이터를 조회한다.
 *
 * @since 2026-04-03
 */
import dotenv from 'dotenv';
dotenv.config();

const AIMS_API_URL = process.env.AIMS_API_URL || 'http://localhost:3010';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

// ============================================================
// 기본 HTTP 헬퍼
// ============================================================

/**
 * Internal API POST 요청
 * 성공 시 data 필드 반환, 실패 시 null
 */
async function internalApiPost<T = any>(path: string, body: Record<string, unknown>): Promise<T | null> {
  try {
    const resp = await fetch(`${AIMS_API_URL}/api${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': INTERNAL_API_KEY
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });

    if (!resp.ok) {
      console.error(`[InternalAPI] ${path} HTTP ${resp.status}`);
      return null;
    }

    const result = await resp.json() as { success: boolean; data: T };
    if (result.success) return result.data;

    console.error(`[InternalAPI] ${path} success=false`);
    return null;
  } catch (e) {
    console.error(`[InternalAPI] ${path} 오류:`, e);
    return null;
  }
}

/**
 * Internal API GET 요청
 * 성공 시 data 필드 반환, 실패 시 null
 */
async function internalApiGet<T = any>(path: string): Promise<T | null> {
  try {
    const resp = await fetch(`${AIMS_API_URL}/api${path}`, {
      method: 'GET',
      headers: {
        'x-api-key': INTERNAL_API_KEY
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!resp.ok) {
      console.error(`[InternalAPI] GET ${path} HTTP ${resp.status}`);
      return null;
    }

    const result = await resp.json() as { success: boolean; data: T };
    if (result.success) return result.data;

    console.error(`[InternalAPI] GET ${path} success=false`);
    return null;
  } catch (e) {
    console.error(`[InternalAPI] GET ${path} 오류:`, e);
    return null;
  }
}

// ============================================================
// Write용 HTTP 헬퍼 (상태코드 + 에러 메시지 반환)
// ============================================================

interface InternalApiWriteResult<T = any> {
  data: T | null;
  status: number;
  error?: string;
}

/**
 * Internal API PUT 요청
 * 성공 시 data 필드 반환, 실패 시 null + 상태코드 + 에러 메시지
 */
async function internalApiPut<T = any>(path: string, body: Record<string, unknown>): Promise<InternalApiWriteResult<T>> {
  try {
    const resp = await fetch(`${AIMS_API_URL}/api${path}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': INTERNAL_API_KEY
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });

    const result = await resp.json() as { success: boolean; data?: T; error?: string };

    if (resp.ok && result.success) {
      return { data: result.data ?? null, status: resp.status };
    }

    console.error(`[InternalAPI] PUT ${path} HTTP ${resp.status}: ${result.error || ''}`);
    return { data: null, status: resp.status, error: result.error };
  } catch (e) {
    console.error(`[InternalAPI] PUT ${path} 오류:`, e);
    return { data: null, status: 500, error: e instanceof Error ? e.message : '네트워크 오류' };
  }
}

/**
 * Internal API DELETE 요청
 * body와 query string 모두 지원
 */
async function internalApiDelete<T = any>(
  path: string,
  body?: Record<string, unknown>,
  query?: Record<string, string>
): Promise<InternalApiWriteResult<T>> {
  try {
    let url = `${AIMS_API_URL}/api${path}`;
    if (query) {
      const qs = new URLSearchParams(query).toString();
      url += `?${qs}`;
    }

    const resp = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': INTERNAL_API_KEY
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10000)
    });

    const result = await resp.json() as { success: boolean; data?: T; error?: string };

    if (resp.ok && result.success) {
      return { data: result.data ?? null, status: resp.status };
    }

    console.error(`[InternalAPI] DELETE ${path} HTTP ${resp.status}: ${result.error || ''}`);
    return { data: null, status: resp.status, error: result.error };
  } catch (e) {
    console.error(`[InternalAPI] DELETE ${path} 오류:`, e);
    return { data: null, status: 500, error: e instanceof Error ? e.message : '네트워크 오류' };
  }
}

/**
 * Internal API POST 요청 (Write용 — 상태코드 반환)
 * Read용 internalApiPost와 달리 에러 상태코드도 반환
 */
async function internalApiPostWrite<T = any>(path: string, body: Record<string, unknown>): Promise<InternalApiWriteResult<T>> {
  try {
    const resp = await fetch(`${AIMS_API_URL}/api${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': INTERNAL_API_KEY
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });

    const result = await resp.json() as { success: boolean; data?: T; error?: string };

    if (resp.ok && result.success) {
      return { data: result.data ?? null, status: resp.status };
    }

    console.error(`[InternalAPI] POST(Write) ${path} HTTP ${resp.status}: ${result.error || ''}`);
    return { data: null, status: resp.status, error: result.error };
  } catch (e) {
    console.error(`[InternalAPI] POST(Write) ${path} 오류:`, e);
    return { data: null, status: 500, error: e instanceof Error ? e.message : '네트워크 오류' };
  }
}

// ============================================================
// customers Write 편의 함수
// ============================================================

/** 고객 생성 */
export async function createCustomer(params: {
  name: string; phone: string; userId: string;
  email?: string; birthDate?: string; address?: string; customerType?: string;
}): Promise<InternalApiWriteResult<{ customerId: string; name: string; customerType: string; createdAt: string }>> {
  return internalApiPostWrite('/internal/customers', params as unknown as Record<string, unknown>);
}

/** 고객 수정 */
export async function updateCustomer(customerId: string, params: {
  userId: string; name?: string; phone?: string; phoneType?: string;
  email?: string; birthDate?: string; postal_code?: string; address1?: string; address2?: string;
}): Promise<InternalApiWriteResult<{ customerId: string; updatedFields: string[]; message: string }>> {
  return internalApiPut(`/internal/customers/${customerId}`, params as unknown as Record<string, unknown>);
}

/** 고객 메모 필드 동기화 (customer_memos → customers.memo) */
export async function syncCustomerMemo(
  customerId: string, memoText: string, userId: string
): Promise<InternalApiWriteResult<{ success: boolean }>> {
  return internalApiPut(`/internal/customers/${customerId}/memo-sync`, { memoText, userId });
}

// ============================================================
// memos Write 편의 함수
// ============================================================

/** 메모 생성 */
export async function createMemo(params: {
  customerId: string; content: string; userId: string;
}): Promise<InternalApiWriteResult<{ memoId: string }>> {
  return internalApiPostWrite('/internal/memos', params as unknown as Record<string, unknown>);
}

/** 메모 수정 */
export async function updateMemo(memoId: string, params: {
  customerId: string; content: string; userId: string;
}): Promise<InternalApiWriteResult<{ success: boolean }>> {
  return internalApiPut(`/internal/memos/${memoId}`, params as unknown as Record<string, unknown>);
}

/** 메모 삭제 */
export async function deleteMemo(
  memoId: string, customerId: string, userId: string
): Promise<InternalApiWriteResult<{ success: boolean }>> {
  return internalApiDelete(`/internal/memos/${memoId}`, undefined, { customerId, userId });
}

// ============================================================
// relationships Write 편의 함수
// ============================================================

/** 관계 생성 (역방향 자동 처리) */
export async function createRelationship(params: {
  fromCustomerId: string; toCustomerId: string; relationshipType: string;
  relationshipCategory?: string; notes?: string; userId: string;
}): Promise<InternalApiWriteResult<{ relationshipId: string; reverseCreated: boolean }>> {
  return internalApiPostWrite('/internal/relationships', params as unknown as Record<string, unknown>);
}

/** 관계 삭제 (역방향 자동 처리) */
export async function deleteRelationship(
  relationshipId: string, userId: string
): Promise<InternalApiWriteResult<{ success: boolean; reverseDeleted: boolean }>> {
  return internalApiDelete(`/internal/relationships/${relationshipId}`, { userId });
}

// ============================================================
// files 컬렉션 편의 함수
// ============================================================

interface QueryFilesOptions {
  projection?: Record<string, unknown>;
  sort?: Record<string, unknown>;
  limit?: number;
  skip?: number;
}

/**
 * files 컬렉션 범용 쿼리
 * filter 내 _id, customerId는 aims_api에서 자동 ObjectId 변환
 */
export async function queryFiles(
  filter: Record<string, unknown>,
  options?: QueryFilesOptions
): Promise<any[]> {
  const body: Record<string, unknown> = { filter };
  if (options?.projection) body.projection = options.projection;
  if (options?.sort) body.sort = options.sort;
  if (options?.limit) body.limit = options.limit;
  if (options?.skip) body.skip = options.skip;

  const data = await internalApiPost<any[]>('/internal/files/query', body);
  return data || [];
}

/**
 * files 컬렉션 문서 수 조회
 */
export async function countFiles(filter: Record<string, unknown>): Promise<number> {
  const data = await internalApiPost<{ count: number }>('/internal/files/count', { filter });
  return data?.count ?? 0;
}

/**
 * files 컬렉션 aggregate 파이프라인 실행
 */
export async function aggregateFiles(pipeline: Record<string, unknown>[]): Promise<any[]> {
  const data = await internalApiPost<any[]>('/internal/files/aggregate', { pipeline });
  return data || [];
}

// ============================================================
// customers 컬렉션 편의 함수 (기존 엔드포인트 활용)
// ============================================================

/**
 * 단건 고객명+타입 조회
 */
export async function getCustomerName(customerId: string): Promise<{ name: string | null; customerType: string | null } | null> {
  return internalApiGet<{ name: string | null; customerType: string | null }>(
    `/internal/customers/${customerId}/name`
  );
}

// ============================================================
// Phase 6: Read Gateway — customers/memos/relationships
// ============================================================

/**
 * 고객 단건 조회 (소유권 필터 없음)
 * GET /internal/customers/:id
 */
export async function getCustomer(customerId: string): Promise<any | null> {
  return internalApiGet(`/internal/customers/${customerId}`);
}

/**
 * 고객 범용 쿼리
 * POST /internal/customers/query
 * filter 내 _id는 서버에서 자동 ObjectId 변환
 */
export async function queryCustomers(
  filter: Record<string, unknown>,
  projection?: Record<string, unknown> | null,
  sort?: Record<string, unknown> | null,
  limit?: number,
  skip?: number
): Promise<any[]> {
  const body: Record<string, unknown> = { filter };
  if (projection) body.projection = projection;
  if (sort) body.sort = sort;
  if (limit) body.limit = limit;
  if (skip) body.skip = skip;

  const data = await internalApiPost<any[]>('/internal/customers/query', body);
  return data || [];
}

/**
 * 고객 수 조회
 * POST /internal/customers/count
 */
export async function countCustomers(filter: Record<string, unknown>): Promise<number> {
  const data = await internalApiPost<{ count: number }>('/internal/customers/count', { filter });
  return data?.count ?? 0;
}

/**
 * 고객 aggregate 파이프라인 실행
 * POST /internal/customers/aggregate
 */
export async function aggregateCustomers(pipeline: Record<string, unknown>[]): Promise<any[]> {
  const data = await internalApiPost<any[]>('/internal/customers/aggregate', { pipeline });
  return data || [];
}

/**
 * 메모 단건 조회
 * GET /internal/memos/:id
 */
export async function getMemo(memoId: string): Promise<any | null> {
  return internalApiGet(`/internal/memos/${memoId}`);
}

/**
 * 메모 범용 쿼리
 * POST /internal/memos/query
 * filter 내 _id, customer_id는 서버에서 자동 ObjectId 변환
 */
export async function queryMemos(
  filter: Record<string, unknown>,
  projection?: Record<string, unknown> | null,
  sort?: Record<string, unknown> | null,
  limit?: number,
  skip?: number
): Promise<any[]> {
  const body: Record<string, unknown> = { filter };
  if (projection) body.projection = projection;
  if (sort) body.sort = sort;
  if (limit) body.limit = limit;
  if (skip) body.skip = skip;

  const data = await internalApiPost<any[]>('/internal/memos/query', body);
  return data || [];
}

/**
 * 메모 수 조회
 * POST /internal/memos/count
 */
export async function countMemos(filter: Record<string, unknown>): Promise<number> {
  const data = await internalApiPost<{ count: number }>('/internal/memos/count', { filter });
  return data?.count ?? 0;
}

/**
 * 관계 단건 조회
 * GET /internal/relationships/:id
 */
export async function getRelationship(relationshipId: string): Promise<any | null> {
  return internalApiGet(`/internal/relationships/${relationshipId}`);
}

/**
 * 관계 범용 쿼리
 * POST /internal/relationships/query
 * filter 내 ObjectId 필드는 서버에서 자동 변환
 */
export async function queryRelationships(
  filter: Record<string, unknown>,
  projection?: Record<string, unknown> | null,
  sort?: Record<string, unknown> | null,
  limit?: number
): Promise<any[]> {
  const body: Record<string, unknown> = { filter };
  if (projection) body.projection = projection;
  if (sort) body.sort = sort;
  if (limit) body.limit = limit;

  const data = await internalApiPost<any[]>('/internal/relationships/query', body);
  return data || [];
}

// ============================================================
// products 검색 편의 함수
// ============================================================

interface SearchProductsResult {
  count: number;
  totalCount: number;
  insurerBreakdown: Record<string, number>;
  products: Array<{
    id: string;
    productName: string;
    insurerName: string;
    category: string;
    status: string;
    surveyDate: string;
    saleStartDate: string;
  }>;
  message?: string;
}

/**
 * 보험상품 검색
 * GET /internal/products/search
 */
export async function searchProducts(params: {
  query?: string;
  insurerName?: string;
  category?: string;
  limit?: number;
}): Promise<SearchProductsResult | null> {
  const searchParams = new URLSearchParams();
  if (params.query) searchParams.set('query', params.query);
  if (params.insurerName) searchParams.set('insurerName', params.insurerName);
  if (params.category) searchParams.set('category', params.category);
  if (params.limit) searchParams.set('limit', params.limit.toString());

  const qs = searchParams.toString();
  const path = `/internal/products/search${qs ? `?${qs}` : ''}`;
  return internalApiGet<SearchProductsResult>(path);
}
