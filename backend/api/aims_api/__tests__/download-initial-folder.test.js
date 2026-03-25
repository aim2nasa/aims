/**
 * Regression Tests — 다중 고객 다운로드 초성 폴더 구조
 *
 * 수정 사항:
 * 1. MAX_CUSTOMER_IDS: 100 → 1000 확대
 * 2. 11명 이상 다중 고객 다운로드 시 초성 폴더(ㄱ~ㅎ) 그룹화
 * 3. 10명 이하 다중 고객 다운로드 시 기존 flat 구조 유지
 * 4. ZIP 폴더명에 timeStr(HHmm) 포함
 *
 * @since 2026-03-25
 */

const fs = require('fs');
const path = require('path');

// 소스 코드에서 getKoreanInitial 함수를 추출하여 테스트
// (함수가 라우트 내부 스코프이므로 직접 재현)
function getKoreanInitial(name) {
  if (!name) return '기타';
  const code = name.charCodeAt(0);
  if (code >= 0xAC00 && code <= 0xD7A3) {
    const initials = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
    const index = Math.floor((code - 0xAC00) / 588);
    return initials[index];
  }
  if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
    return String.fromCharCode(code).toUpperCase();
  }
  return '기타';
}

function readSource(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '..', relativePath),
    'utf-8'
  );
}

// =============================================================================
// 1. MAX_CUSTOMER_IDS 1000으로 확대
// =============================================================================
describe('MAX_CUSTOMER_IDS 1000으로 확대', () => {
  const source = readSource('routes/documents-routes.js');

  test('MAX_CUSTOMER_IDS가 1000이어야 함', () => {
    expect(source).toMatch(/const MAX_CUSTOMER_IDS = 1000;/);
  });
});

// =============================================================================
// 2. getKoreanInitial 함수 존재 확인
// =============================================================================
describe('getKoreanInitial 함수가 소스에 존재', () => {
  const source = readSource('routes/documents-routes.js');

  test('getKoreanInitial 함수가 정의되어 있어야 함', () => {
    expect(source).toContain('function getKoreanInitial(name)');
  });
});

// =============================================================================
// 3. 초성 추출 정확성 테스트
// =============================================================================
describe('getKoreanInitial 초성 추출', () => {
  test('한글 이름 — ㄱ', () => {
    expect(getKoreanInitial('강동수')).toBe('ㄱ');
    expect(getKoreanInitial('곽지민')).toBe('ㄱ');
  });

  test('한글 이름 — ㄴ', () => {
    expect(getKoreanInitial('나영희')).toBe('ㄴ');
  });

  test('한글 이름 — ㅂ', () => {
    expect(getKoreanInitial('박철수')).toBe('ㅂ');
  });

  test('한글 이름 — ㅇ', () => {
    expect(getKoreanInitial('이순신')).toBe('ㅇ');
  });

  test('한글 이름 — ㅎ', () => {
    expect(getKoreanInitial('홍길동')).toBe('ㅎ');
  });

  test('한글 이름 — ㅈ', () => {
    expect(getKoreanInitial('정약용')).toBe('ㅈ');
  });

  test('한글 이름 — ㅊ', () => {
    expect(getKoreanInitial('최영')).toBe('ㅊ');
  });

  test('영문 이름', () => {
    expect(getKoreanInitial('Alex')).toBe('A');
    expect(getKoreanInitial('bob')).toBe('B');
  });

  test('null/빈 문자열 → 기타', () => {
    expect(getKoreanInitial(null)).toBe('기타');
    expect(getKoreanInitial('')).toBe('기타');
    expect(getKoreanInitial(undefined)).toBe('기타');
  });

  test('숫자/특수문자 → 기타', () => {
    expect(getKoreanInitial('123')).toBe('기타');
    expect(getKoreanInitial('!@#')).toBe('기타');
  });
});

// =============================================================================
// 4. 초성 폴더 분기 로직 (11명 이상 → 초성 폴더, 10명 이하 → flat)
// =============================================================================
describe('초성 폴더 분기 로직', () => {
  const source = readSource('routes/documents-routes.js');

  test('useInitialFolder 변수가 정의되어야 함', () => {
    expect(source).toContain('useInitialFolder');
  });

  test('customers.length >= 11 조건이 있어야 함', () => {
    expect(source).toMatch(/customers\.length >= 11/);
  });

  test('isMulti && useInitialFolder 분기가 있어야 함', () => {
    expect(source).toMatch(/isMulti && useInitialFolder/);
  });

  test('초성 폴더 경로에 getKoreanInitial 호출이 있어야 함', () => {
    expect(source).toMatch(/getKoreanInitial\(customerName\)/);
  });
});

// =============================================================================
// 5. ZIP 폴더명에 timeStr 포함 확인
// =============================================================================
describe('ZIP 폴더명에 timeStr 포함', () => {
  const source = readSource('routes/documents-routes.js');

  test('다중 고객 + 초성 폴더 경로에 timeStr이 포함되어야 함', () => {
    expect(source).toMatch(/AIMS_문서함_\$\{dateStr\}\$\{timeStr\}\/\$\{initial\}\/\$\{customerFolder\}/);
  });

  test('다중 고객 + flat 경로에도 timeStr이 포함되어야 함', () => {
    expect(source).toMatch(/AIMS_문서함_\$\{dateStr\}\$\{timeStr\}\/\$\{customerFolder\}\/\$\{catLabel\}/);
  });

  test('단일 고객 경로에는 AIMS_문서함 접두사가 없어야 함 (기존 동작 유지)', () => {
    // 단일 고객: ${customerFolder}/${catLabel}/${subLabel}
    expect(source).toMatch(/folderPath = `\$\{customerFolder\}\/\$\{catLabel\}\/\$\{subLabel\}`/);
  });
});
