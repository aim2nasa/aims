/**
 * Regression Test — 2026-03-28 Clipboard API HTTP fallback
 *
 * 문제: aims-admin이 HTTP(http://tars:8080)로 접속되어
 *       navigator.clipboard가 undefined → TypeError 발생
 *
 * 수정: copyToClipboard 함수 추가 (Clipboard API + execCommand fallback)
 *
 * @since 2026-03-28
 */

const fs = require('fs');
const path = require('path');

function readSource(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '..', '..', '..', '..', relativePath),
    'utf-8'
  );
}

const source = readSource('frontend/aims-admin/src/pages/ErrorLogsPage/ErrorLogsPage.tsx');

describe('FIX: ErrorLogsPage 클립보드 복사 HTTP fallback', () => {
  test('copyToClipboard 함수가 정의되어 있어야 함', () => {
    expect(source).toContain('function copyToClipboard(text: string)');
  });

  test('fallbackCopy 함수가 정의되어 있어야 함', () => {
    expect(source).toContain('function fallbackCopy(text: string)');
  });

  test('navigator.clipboard 존재 여부를 체크해야 함', () => {
    const fnBody = source.substring(
      source.indexOf('function copyToClipboard'),
      source.indexOf('function fallbackCopy')
    );
    expect(fnBody).toContain('navigator.clipboard');
    expect(fnBody).toContain('fallbackCopy');
  });

  test('execCommand 반환값을 확인해야 함 (무음 실패 방지)', () => {
    const fnBody = source.substring(
      source.indexOf('function fallbackCopy'),
      source.indexOf('function fallbackCopy') + 500
    );
    expect(fnBody).toContain("execCommand('copy')");
    expect(fnBody).toMatch(/const\s+success\s*=\s*document\.execCommand|if\s*\(!.*execCommand/);
  });

  test('navigator.clipboard.writeText 직접 호출이 없어야 함 (copyToClipboard 사용)', () => {
    // copyToClipboard/fallbackCopy 함수 정의 영역 제외하고 검사
    const fnEnd = source.indexOf('// 모달 상태 타입');
    const codeAfterUtils = source.substring(fnEnd);
    expect(codeAfterUtils).not.toMatch(/navigator\.clipboard\.writeText/);
  });

  test('copyToClipboard가 실제 호출되어야 함 (최소 2곳)', () => {
    const calls = source.match(/copyToClipboard\(/g);
    expect(calls).not.toBeNull();
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });
});
