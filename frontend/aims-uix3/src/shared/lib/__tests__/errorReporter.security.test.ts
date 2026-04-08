/**
 * errorReporter 보안/안정성 regression test (#9)
 * - SSE_CONNECTION_ERROR 상수 export 검증
 * - 401/403 반복 감지 로직 존재 검증
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const errorReporterSrc = fs.readFileSync(
  path.resolve(__dirname, '../errorReporter.ts'),
  'utf-8'
);

const sseWorkerClientSrc = fs.readFileSync(
  path.resolve(__dirname, '../sseWorkerClient.ts'),
  'utf-8'
);

describe('SSE_CONNECTION_ERROR constant', () => {
  it('is exported from errorReporter', () => {
    expect(errorReporterSrc).toMatch(/export const SSE_CONNECTION_ERROR/);
  });

  it('is imported and used in sseWorkerClient', () => {
    expect(sseWorkerClientSrc).toContain("import { SSE_CONNECTION_ERROR }");
    expect(sseWorkerClientSrc).toContain('SSE_CONNECTION_ERROR');
  });

  it('errorReporter uses the constant, not a hardcoded string', () => {
    // isTransientError 내에서 상수 사용
    expect(errorReporterSrc).toMatch(/error\.message === SSE_CONNECTION_ERROR/);
    // 하드코딩된 문자열 비교가 없어야 함
    expect(errorReporterSrc).not.toMatch(/error\.message === ['"]SSE connection error['"]/);
  });
});

describe('401/403 auth error repeated detection', () => {
  it('has auth counter fields', () => {
    expect(errorReporterSrc).toContain('recentAuthCount');
    expect(errorReporterSrc).toContain('lastAuthResetTime');
    expect(errorReporterSrc).toContain('TRANSIENT_AUTH_THRESHOLD');
  });

  it('401/403 are not unconditionally filtered', () => {
    // 이전 코드: "if (status === 401 || status === 403) return true;" 가 없어야 함
    expect(errorReporterSrc).not.toMatch(
      /status === 40[13]\s*\|\|\s*status === 40[13]\)\s*return true/
    );
  });
});
