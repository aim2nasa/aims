/**
 * internalApi.ts — aims_api Internal API 헬퍼
 *
 * aims_mcp에서 files 컬렉션에 직접 접근하지 않고
 * aims_api의 Internal API를 경유하여 데이터를 조회한다.
 *
 * @since 2026-04-03
 */

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
