/**
 * 아키텍처 수정 4건 실동작 검증 테스트
 *
 * 소스 코드를 readFileSync로 읽어 패턴 검증하는 방식.
 * @since 2026-04-05
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(join(__dirname, '..', relativePath), 'utf-8');
}

// ============================================================
// 항목 1: systemLogger → aims_analytics 직접 기록
// ============================================================
describe('항목 1: systemLogger aims_analytics 직접 기록', () => {
  const source = readSource('systemLogger.ts');

  it('HTTP fetch 호출이 없어야 함', () => {
    expect(source).not.toContain('fetch(SYSTEM_LOG_API_URL');
    expect(source).not.toContain('/api/system-logs');
  });

  it('aims_analytics DB 직접 기록 패턴이 있어야 함', () => {
    expect(source).toContain('aims_analytics');
    expect(source).toContain('insertOne');
  });

  it('MongoClient를 사용한 DB 연결이 있어야 함', () => {
    expect(source).toContain('MongoClient');
    expect(source).toContain('getAnalyticsDb');
  });

  it('30일 TTL 필드(ttl_expire_at)가 설정되어야 함', () => {
    expect(source).toContain('ttl_expire_at');
  });

  it('closeAnalyticsDb가 export되어야 함', () => {
    expect(source).toMatch(/export\s+(async\s+)?function\s+closeAnalyticsDb/);
  });

  it('index.ts에서 closeAnalyticsDb가 호출되어야 함', () => {
    const indexSource = readSource('index.ts');
    expect(indexSource).toContain('closeAnalyticsDb');
  });
});

// ============================================================
// 항목 2: documents → AIMS_RAG_API_URL 환경변수
// ============================================================
describe('항목 2: documents RAG_API_URL 환경변수', () => {
  const source = readSource('tools/documents.ts');

  it('하드코딩 URL이 직접 사용되지 않아야 함 (변수 정의부 fallback 제외)', () => {
    // 변수 정의행 제거 후 나머지에서 하드코딩 확인
    const lines = source.split('\n');
    const nonDefinitionLines = lines.filter(
      (line) => !line.match(/const\s+AIMS_RAG_API_URL/)
    ).join('\n');

    expect(nonDefinitionLines).not.toContain("'http://localhost:8000");
    expect(nonDefinitionLines).not.toContain('"http://localhost:8000');
  });

  it('AIMS_RAG_API_URL 환경변수를 사용해야 함', () => {
    expect(source).toContain('process.env.AIMS_RAG_API_URL');
  });

  it('fetch에서 환경변수 기반 URL을 사용해야 함', () => {
    expect(source).toMatch(/fetch\(`\$\{AIMS_RAG_API_URL\}/);
  });
});

// ============================================================
// 항목 3: products → Internal API 전환
// ============================================================
describe('항목 3: products Internal API 전환', () => {
  const productsSource = readSource('tools/products.ts');

  it('DB 직접 접근(db.collection, getDB)이 없어야 함', () => {
    expect(productsSource).not.toContain('db.collection');
    expect(productsSource).not.toContain('getDB');
    expect(productsSource).not.toMatch(/from\s+['"].*db['"]/);
  });

  it('searchProducts Internal API를 호출해야 함', () => {
    expect(productsSource).toContain('searchProducts');
  });

  it('internalApi에서 import해야 함', () => {
    expect(productsSource).toMatch(/from\s+['"]\.\.\/internalApi/);
  });

  it('internalApi.ts에 searchProducts 함수가 정의되어야 함', () => {
    const internalApiSource = readSource('internalApi.ts');
    expect(internalApiSource).toMatch(/export\s+(async\s+)?function\s+searchProducts/);
    expect(internalApiSource).toContain('/products/search');
  });

  it('aims_api internal-routes.js에 /internal/products/search 엔드포인트가 존재해야 함', () => {
    const internalRoutes = readFileSync(
      join(__dirname, '..', '..', '..', 'aims_api', 'routes', 'internal-routes.js'),
      'utf-8'
    );
    expect(internalRoutes).toContain('/internal/products/search');
  });
});

// ============================================================
// 항목 4: address → x-api-key 인증
// ============================================================
describe('항목 4: address x-api-key 인증', () => {
  const source = readSource('tools/address.ts');

  it('x-api-key 헤더가 포함되어야 함', () => {
    expect(source).toContain('x-api-key');
  });

  it('INTERNAL_API_KEY 환경변수를 사용해야 함', () => {
    expect(source).toContain('INTERNAL_API_KEY');
    expect(source).toContain('process.env.INTERNAL_API_KEY');
  });

  it('fetch 호출에서 headers에 x-api-key가 설정되어야 함', () => {
    // headers 블록 안에 x-api-key가 있는지 확인
    expect(source).toMatch(/headers:\s*\{[\s\S]*?['"]x-api-key['"]/);
  });
});
